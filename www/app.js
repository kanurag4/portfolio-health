import { parseMoney, clampThreshold } from './utils.js';
import { fetchHolding, countryToRegion } from './data.js';
import { analysePortfolio, normaliseWeights, scorePortfolio, detectOverlap } from './analyse.js';
import { YAHOO_PROXY_URL } from './config.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mergeHoldings(holdings) {
  const merged = new Map();
  for (const h of holdings) {
    const key = `${h.ticker}|${h.inputMode}`;
    if (merged.has(key)) {
      merged.get(key).value += h.value; // name/notes from first row; subsequent rows contribute value only
    } else {
      merged.set(key, { ...h });
    }
  }
  return [...merged.values()];
}

// ── State ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'portfoliohealth_v1';

function defaultState() {
  return {
    holdings: [{ ticker: '', inputMode: '%', value: null, isAsx: true }],
    thresholds: { etf: 30, stock: 10, sector: 30, region: 50 },
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      holdings: (parsed.holdings ?? defaultState().holdings).map(h => ({ ...h, isAsx: h.isAsx ?? true })),
      thresholds: Object.fromEntries(
        Object.entries({ ...defaultState().thresholds, ...(parsed.thresholds ?? {}) })
          .map(([k, v]) => [k, clampThreshold(Number(v) || defaultState().thresholds[k])])
      ),
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    holdings: state.holdings,
    thresholds: state.thresholds,
  }));
}

// Caches the last successfully fetched analysis so a reload (with unchanged holdings)
// can restore results instantly instead of re-fetching every ticker and burning the
// Worker's per-IP rate limit.
function loadCachedResult() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).lastResult ?? null;
  } catch {
    return null;
  }
}

function saveLastResult() {
  if (!lastAnalysis) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const payload = raw ? JSON.parse(raw) : {};
    payload.holdings = state.holdings;
    payload.thresholds = state.thresholds;
    payload.lastResult = { rawWeights: lastAnalysis.rawWeights, resolvedHoldings: lastAnalysis.resolvedHoldings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

// True when two merged-holdings snapshots describe the same tickers/mode/value,
// regardless of order — used to decide whether a cached result is still valid.
function weightsMatch(a, b) {
  if (!Array.isArray(b) || a.length !== b.length) return false;
  const norm = arr => [...arr]
    .map(h => `${h.ticker}|${h.inputMode}|${h.value}`)
    .sort();
  const na = norm(a), nb = norm(b);
  return na.every((v, i) => v === nb[i]);
}

// ── Inline messages (replaces window.alert) ──────────────────────────────────
let inputMessageTimer = null;
function showInputMessage(text, type = 'error') {
  const el = document.getElementById('input-message');
  clearTimeout(inputMessageTimer);
  el.textContent = text;
  el.className = `kv-inline-msg kv-inline-msg-${type}`;
  el.hidden = false;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (type === 'success') {
    inputMessageTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const holdingsList   = document.getElementById('holdings-list');
const btnAddRow      = document.getElementById('btn-add-row');
const btnAnalyse     = document.getElementById('btn-analyse');
const btnReset       = document.getElementById('btn-reset');
const threshEtf      = document.getElementById('thresh-etf');
const threshStock    = document.getElementById('thresh-stock');
const threshSector   = document.getElementById('thresh-sector');
const threshRegion   = document.getElementById('thresh-region');
const pctRemainingEl = document.getElementById('pct-remaining');

// ── Holdings rows ──────────────────────────────────────────────────────────
function renderHoldingsList() {
  holdingsList.innerHTML = '';
  state.holdings.forEach((h, i) => holdingsList.appendChild(buildRow(h, i)));
  updatePctRemaining();
}

function updatePctRemaining() {
  const pctRows = state.holdings.filter(h => h.inputMode === '%');
  if (pctRows.length === 0) { pctRemainingEl.textContent = ''; return; }
  const sum = pctRows.reduce((s, h) => s + (parseFloat(h.value) || 0), 0);
  const rem = 100 - sum;
  if (Math.abs(rem) < 0.05) {
    pctRemainingEl.textContent = '✓ 100% allocated';
    pctRemainingEl.className = 'kv-pct-remaining kv-pct-ok';
  } else if (rem < 0) {
    pctRemainingEl.textContent = `${Math.abs(rem).toFixed(1)}% over 100%`;
    pctRemainingEl.className = 'kv-pct-remaining kv-pct-over';
  } else {
    pctRemainingEl.textContent = `${rem.toFixed(1)}% remaining`;
    pctRemainingEl.className = 'kv-pct-remaining kv-pct-rem';
  }
}

function buildRow(holding, index) {
  const row = document.createElement('div');
  row.className = 'kv-holding-row';

  const tickerWrap = document.createElement('div');
  tickerWrap.className = 'kv-ac-wrapper';

  const ticker = document.createElement('input');
  ticker.className = 'kv-input';
  ticker.type = 'text';
  ticker.placeholder = 'e.g. VAS, CBA';
  ticker.value = holding.ticker;
  ticker.autocomplete = 'off';
  ticker.addEventListener('blur', () => {
    // Delay so a click on an autocomplete item registers before we normalise/hide.
    setTimeout(() => {
      let t = ticker.value.trim().toUpperCase();
      if (t && state.holdings[index].isAsx && !t.includes('.')) t += '.AX';
      state.holdings[index].ticker = t;
      ticker.value = t;
      saveState();
      hideAutocomplete(acList);
    }, 150);
  });

  const acList = document.createElement('div');
  acList.className = 'kv-ac-list';
  acList.hidden = true;

  attachAutocomplete(ticker, acList, index);
  tickerWrap.append(ticker, acList);

  const asxLabel = document.createElement('label');
  asxLabel.className = 'kv-asx-toggle';
  asxLabel.title = 'Uncheck for US or other markets';
  const asxCheck = document.createElement('input');
  asxCheck.type = 'checkbox';
  asxCheck.checked = holding.isAsx !== false;
  asxCheck.addEventListener('change', () => {
    state.holdings[index].isAsx = asxCheck.checked;
    let t = state.holdings[index].ticker;
    if (asxCheck.checked && t && !t.includes('.')) {
      t += '.AX';
    } else if (!asxCheck.checked && t.endsWith('.AX')) {
      t = t.slice(0, -3);
    }
    state.holdings[index].ticker = t;
    ticker.value = t;
    saveState();
  });
  asxLabel.append(asxCheck, document.createTextNode('ASX'));

  const modeBtn = document.createElement('button');
  modeBtn.className = 'kv-mode-toggle';
  modeBtn.textContent = holding.inputMode;
  modeBtn.title = 'Toggle between $ amount and %';
  modeBtn.addEventListener('click', () => {
    state.holdings[index].inputMode = state.holdings[index].inputMode === '$' ? '%' : '$';
    state.holdings[index].value = null;
    saveState();
    renderHoldingsList(); // also calls updatePctRemaining
  });

  const amount = document.createElement('input');
  amount.className = 'kv-input';
  amount.type = 'text';
  amount.inputMode = 'numeric';
  amount.placeholder = holding.inputMode === '$' ? 'Amount (AUD)' : 'Percentage';
  amount.value = holding.value != null ? formatInputVal(holding.value) : '';
  amount.addEventListener('input', e => {
    const raw = e.target.value.replace(/,/g, '');
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
      state.holdings[index].value = raw === '' ? null : Number(raw);
      const cursor = e.target.selectionStart;
      const formatted = raw === '' ? '' : Number(raw).toLocaleString('en-AU', { maximumFractionDigits: 2 });
      const oldLen = e.target.value.length;
      e.target.value = formatted;
      const diff = formatted.length - oldLen;
      try { e.target.setSelectionRange(cursor + diff, cursor + diff); } catch {}
      saveState();
      updatePctRemaining();
    }
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'kv-remove-btn';
  removeBtn.textContent = '✕';
  removeBtn.title = 'Remove holding';
  removeBtn.disabled = state.holdings.length === 1;
  removeBtn.addEventListener('click', () => {
    state.holdings.splice(index, 1);
    saveState();
    renderHoldingsList();
  });

  row.append(tickerWrap, asxLabel, modeBtn, amount, removeBtn);
  return row;
}

// ── Ticker autocomplete ───────────────────────────────────────────────────────
let acTimer = null;
let acAbort = null;

function attachAutocomplete(tickerInput, acList, index) {
  tickerInput.addEventListener('input', () => {
    clearTimeout(acTimer);
    const q = tickerInput.value.trim();
    if (q.length < 2) { hideAutocomplete(acList); return; }
    acTimer = setTimeout(() => fetchAutocomplete(q, acList, tickerInput, index), 300);
  });
  tickerInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideAutocomplete(acList);
  });
}

async function fetchAutocomplete(q, acList, tickerInput, index) {
  acAbort?.abort();
  acAbort = new AbortController();
  try {
    const url = `${YAHOO_PROXY_URL.replace(/\/$/, '')}/search?q=${encodeURIComponent(q)}`;
    const resp = await fetch(url, { signal: acAbort.signal });
    if (!resp.ok) { hideAutocomplete(acList); return; }
    const results = await resp.json();
    if (!Array.isArray(results) || results.length === 0) { hideAutocomplete(acList); return; }
    renderAutocomplete(results, acList, tickerInput, index);
  } catch {
    hideAutocomplete(acList);
  }
}

function renderAutocomplete(results, acList, tickerInput, index) {
  acList.innerHTML = results.map(r => `
    <div class="kv-ac-item" data-symbol="${escapeHtml(r.symbol)}" role="option" tabindex="-1">
      <span class="kv-ac-name">${escapeHtml(r.name)}</span>
      <span class="kv-ac-meta">${escapeHtml(r.symbol)}${r.exchange ? ' · ' + escapeHtml(r.exchange) : ''}</span>
    </div>`).join('');
  acList.hidden = false;
  acList.querySelectorAll('.kv-ac-item').forEach(item => {
    item.addEventListener('mousedown', e => e.preventDefault()); // survive the input's blur handler
    item.addEventListener('click', () => {
      const symbol = item.dataset.symbol.toUpperCase();
      tickerInput.value = symbol;
      state.holdings[index].ticker = symbol;
      state.holdings[index].isAsx = symbol.endsWith('.AX');
      saveState();
      hideAutocomplete(acList);
    });
  });
}

function hideAutocomplete(acList) {
  acList.hidden = true;
  acList.innerHTML = '';
}

function formatInputVal(v) {
  if (v === '' || v == null) return '';
  return Number(v).toLocaleString('en-AU', { maximumFractionDigits: 2 });
}

btnAddRow.addEventListener('click', () => {
  state.holdings.push({ ticker: '', inputMode: '%', value: '', isAsx: true });
  saveState();
  renderHoldingsList();
  holdingsList.lastElementChild?.querySelector('input')?.focus();
});

// ── Thresholds ──────────────────────────────────────────────────────────────
function renderThresholds() {
  threshEtf.value    = state.thresholds.etf;
  threshStock.value  = state.thresholds.stock;
  threshSector.value = state.thresholds.sector;
  threshRegion.value = state.thresholds.region;
}

[threshEtf, threshStock, threshSector, threshRegion].forEach(el => {
  el.addEventListener('change', () => {
    const parse = v => { const n = parseMoney(v); return isFinite(n) && n >= 1 && n <= 100 ? n : null; };
    state.thresholds.etf    = parse(threshEtf.value)    ?? state.thresholds.etf;
    state.thresholds.stock  = parse(threshStock.value)  ?? state.thresholds.stock;
    state.thresholds.sector = parse(threshSector.value) ?? state.thresholds.sector;
    state.thresholds.region = parse(threshRegion.value) ?? state.thresholds.region;
    renderThresholds(); // snap any invalid inputs back to the current valid value
    saveState();
    recomputeFromCache(); // re-flag/re-score/re-chart against already-fetched data — no refetch
  });
});

// Recomputes flags, score, and charts from the last fetched holdings when thresholds
// change, so tweaking a threshold doesn't re-spend the Worker's per-IP rate limit.
function recomputeFromCache() {
  if (!lastAnalysis) return;
  const { resolvedHoldings, rawWeights } = lastAnalysis;
  const analysis = analysePortfolio(resolvedHoldings, rawWeights, state.thresholds);
  lastAnalysis = { resolvedHoldings, analysis, rawWeights };
  saveLastResult();
  renderResults(resolvedHoldings, analysis, rawWeights);
}

// ── Reset ────────────────────────────────────────────────────────────────────
let resetPending = false;
btnReset.addEventListener('click', () => {
  if (!resetPending) {
    resetPending = true;
    btnReset.textContent = 'Confirm reset? (click again)';
    btnReset.classList.add('confirming');
    setTimeout(() => {
      resetPending = false;
      btnReset.textContent = 'Reset ↺';
      btnReset.classList.remove('confirming');
    }, 3000);
    return;
  }
  resetPending = false;
  state = defaultState();
  lastAnalysis = null;
  localStorage.removeItem(STORAGE_KEY);
  renderHoldingsList();
  renderThresholds();
  showPlaceholder();
  btnReset.textContent = 'Reset ↺';
  btnReset.classList.remove('confirming');
});

function showPlaceholder() {
  document.getElementById('results-placeholder').hidden = false;
  document.getElementById('results-content').hidden = true;
}

// ── Excel ────────────────────────────────────────────────────────────────────
document.getElementById('btn-download-template').addEventListener('click', downloadTemplate);

function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  const holdingsData = [
    ['Ticker', 'Name (optional)', 'Amount_AUD', 'Percentage', 'IsASX', 'Notes'],
    ['VAS.AX', 'Vanguard AU Shares', 10000, '',  'Yes', 'ASX ETF — suffix already present'],
    ['VOO',    'Vanguard S&P 500',   '',    20,  'No',  'US ETF — no suffix, IsASX=No'],
    ['CBA.AX', '',                   5000,  '',  'Yes', ''],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(holdingsData);
  ws1['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Holdings');

  const instructions = [
    ['Portfolio Health — Import Instructions'],
    [''],
    ['1. Fill in the Holdings sheet, one row per investment.'],
    ['2. Enter either Amount_AUD OR Percentage per row, not both.'],
    ['3. Ticker format: add .AX for ASX stocks/ETFs, .NS for NSE India, no suffix for US.'],
    ['4. IsASX column: enter Yes for Australian holdings without a suffix (adds .AX automatically). Enter No for US/international tickers without a suffix.'],
    ['5. Save and import back into the Portfolio Health tool.'],
    ['6. Name and Notes columns are optional.'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(instructions);
  ws2['!cols'] = [{ wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

  XLSX.writeFile(wb, 'portfolio-health-template.xlsx');
}

document.getElementById('file-import').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets['Holdings'] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const imported = [];
  const skipped = [];

  for (const row of rows) {
    const ticker = String(row['Ticker'] ?? '').trim().toUpperCase();
    if (!ticker) continue;
    const amtRaw = row['Amount_AUD'];
    const pctRaw = row['Percentage'];
    const amt = parseFloat(String(amtRaw).replace(/,/g, ''));
    const pct = parseFloat(String(pctRaw).replace(/,/g, ''));

    // Derive isAsx: suffix takes precedence; for no-suffix tickers, read IsASX column.
    const isAsxCol = String(row['IsASX'] ?? '').trim().toLowerCase();
    const hasSuffix = ticker.includes('.');
    const isAsx = ticker.endsWith('.AX')
      ? true
      : hasSuffix
        ? false
        : isAsxCol === 'yes' || isAsxCol === 'y' || isAsxCol === 'true';
    const resolvedTicker = !hasSuffix && isAsx ? ticker + '.AX' : ticker;
    if (isFinite(amt) && amt > 0) {
      imported.push({ ticker: resolvedTicker, inputMode: '$', value: amt, isAsx });
    } else if (isFinite(pct) && pct > 0) {
      imported.push({ ticker: resolvedTicker, inputMode: '%', value: pct, isAsx });
    } else {
      skipped.push(ticker);
    }
  }

  if (imported.length === 0) {
    showInputMessage('No valid holdings found in the Excel file. Check the Ticker and Amount/Percentage columns.', 'error');
    e.target.value = '';
    return;
  }

  state.holdings = imported;
  saveState();
  renderHoldingsList();
  if (skipped.length > 0) {
    showInputMessage(`Imported ${imported.length} holding(s). Skipped ${skipped.length} row(s) with no valid amount: ${skipped.join(', ')}`, 'warning');
  } else {
    showInputMessage(`Imported ${imported.length} holding(s).`, 'success');
  }
  e.target.value = '';
});

document.getElementById('btn-export-excel')?.addEventListener('click', exportExcel);

function exportExcel() {
  const rows = state.holdings
    .filter(h => h.ticker)
    .map(h => ({
      Ticker: h.ticker,
      Amount_AUD: h.inputMode === '$' ? h.value : '',
      Percentage: h.inputMode === '%' ? h.value : '',
      IsASX: h.isAsx ? 'Yes' : 'No',
    }));
  if (rows.length === 0) { showInputMessage('No holdings to export.', 'error'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Holdings');
  XLSX.writeFile(wb, 'my-portfolio.xlsx');
}

// ── Example portfolio ────────────────────────────────────────────────────────
document.getElementById('btn-example').addEventListener('click', () => {
  state.holdings = [
    { ticker: 'VAS.AX',  inputMode: '%', value: 40, isAsx: true },
    { ticker: 'VGS.AX',  inputMode: '%', value: 25, isAsx: true },
    { ticker: 'CBA.AX',  inputMode: '%', value: 15, isAsx: true },
    { ticker: 'AAPL',    inputMode: '%', value: 10, isAsx: false },
    { ticker: 'BTC-USD', inputMode: '%', value: 10, isAsx: false },
  ];
  saveState();
  renderHoldingsList();
  btnAnalyse.click();
});

// ── Analyse ──────────────────────────────────────────────────────────────────
let lastAnalysis = null;

// Fetches all tickers in parallel but updates the button label as each one settles,
// so a large portfolio doesn't look frozen while the slowest ticker is still loading.
async function fetchHoldingsWithProgress(tickers) {
  let done = 0;
  const setLabel = () => { btnAnalyse.textContent = `Analysing… (${done}/${tickers.length})`; };
  setLabel();
  return Promise.all(tickers.map(t =>
    fetchHolding(t).finally(() => { done++; setLabel(); })
  ));
}

btnAnalyse.addEventListener('click', async () => {
  const validHoldings = state.holdings.filter(h => h.ticker && h.value != null && Number(h.value) > 0);
  if (validHoldings.length === 0) {
    showInputMessage('Please add at least one holding with a ticker and amount.', 'error');
    return;
  }

  // mergeHoldings must run before fetch — uniqueTickers is derived from the merged list,
  // and normaliseWeights receives mergedHoldings so weights accumulate correctly per ticker.
  const mergedHoldings = mergeHoldings(validHoldings);

  document.getElementById('input-message').hidden = true;
  btnAnalyse.disabled = true;

  try {
    const uniqueTickers = [...new Set(mergedHoldings.map(h => h.ticker))];
    const resolvedHoldings = await fetchHoldingsWithProgress(uniqueTickers);

    const analysis = analysePortfolio(resolvedHoldings, mergedHoldings, state.thresholds);
    lastAnalysis = { resolvedHoldings, analysis, rawWeights: mergedHoldings };
    saveLastResult();

    await renderResults(resolvedHoldings, analysis, mergedHoldings);
  } catch (err) {
    showInputMessage('Analysis failed: ' + err.message, 'error');
  } finally {
    btnAnalyse.textContent = 'Analyse Portfolio';
    btnAnalyse.disabled = false;
  }
});

async function renderResults(resolvedHoldings, analysis, rawWeights) {
  document.getElementById('results-placeholder').hidden = true;
  document.getElementById('results-content').hidden = false;

  const unresolvedEl = document.getElementById('unresolved-warning');
  if (analysis.unresolved.length > 0) {
    unresolvedEl.hidden = false;
    unresolvedEl.textContent = `⚠ Could not fetch data for: ${analysis.unresolved.join(', ')}. Their weight is shown as Unresolved in the charts and may trigger concentration flags.`;
  } else {
    unresolvedEl.hidden = true;
  }

  document.getElementById('normalised-note').hidden = !analysis.normalised;

  const resolved = resolvedHoldings.filter(h => !h.error);
  const etfCount = resolved.filter(h => h.quoteType === 'ETF').length;
  const stockCount = resolved.filter(h => h.quoteType === 'EQUITY').length;
  const sectorCount = Object.keys(analysis.sector).filter(k => !k.includes('Unclassified')).length;
  const regionCount = Object.keys(analysis.region).filter(k => k !== 'Unclassified').length;

  document.getElementById('summary-strip').innerHTML = `
    <div class="kv-summary-item">
      <div class="kv-summary-value">${resolved.length}</div>
      <div class="kv-summary-label">Holdings</div>
    </div>
    <div class="kv-summary-item">
      <div class="kv-summary-value">${etfCount}</div>
      <div class="kv-summary-label">ETFs</div>
    </div>
    <div class="kv-summary-item">
      <div class="kv-summary-value">${stockCount}</div>
      <div class="kv-summary-label">Stocks</div>
    </div>
    <div class="kv-summary-item">
      <div class="kv-summary-value">${sectorCount}</div>
      <div class="kv-summary-label">Sectors</div>
    </div>
    <div class="kv-summary-item">
      <div class="kv-summary-value">${regionCount}</div>
      <div class="kv-summary-label">Regions</div>
    </div>
  `;

  renderHoldingsTable(resolvedHoldings, rawWeights);
  renderFlags(analysis.flags);

  const scoreCardEl = document.getElementById('score-card');
  if (resolved.length === 0) {
    scoreCardEl.hidden = true; // all holdings errored — a perfect score would be misleading
  } else {
    renderScoreCard(scorePortfolio(analysis.flags));
  }

  renderOverlapCard(detectOverlap(resolvedHoldings, normaliseWeights(rawWeights)), etfCount);
  renderCharts(analysis, resolvedHoldings, rawWeights);
}

function renderHoldingsTable(resolvedHoldings, rawWeights) {
  const { weights } = normaliseWeights(rawWeights);
  const tbody = document.getElementById('holdings-table-body');
  tbody.innerHTML = '';

  for (const h of resolvedHoldings) {
    const w = weights[h.ticker] ?? 0;
    const tr = document.createElement('tr');
    if (h.error) {
      tr.innerHTML = `<td>${escapeHtml(h.ticker)}</td><td>—</td><td>—</td><td>—</td><td colspan="2" style="color:var(--kv-fail)">Unresolved</td>`;
    } else if (h.quoteType === 'CRYPTO') {
      tr.innerHTML = `
        <td>${escapeHtml(h.ticker)}</td>
        <td>${h.name != null ? escapeHtml(h.name) : '—'}</td>
        <td>Crypto</td>
        <td>${w.toFixed(1)}%</td>
        <td>Cryptocurrency</td>
        <td>Global</td>
      `;
    } else if (h.quoteType === 'ETF') {
      tr.innerHTML = `
        <td>${escapeHtml(h.ticker)}</td>
        <td>${h.name != null ? escapeHtml(h.name) : '—'}</td>
        <td>ETF</td>
        <td>${w.toFixed(1)}%</td>
        <td>Diversified</td>
        <td>—</td>
      `;
    } else {
      tr.innerHTML = `
        <td>${escapeHtml(h.ticker)}</td>
        <td>${h.name != null ? escapeHtml(h.name) : '—'}</td>
        <td>Stock</td>
        <td>${w.toFixed(1)}%</td>
        <td>${h.sector != null ? escapeHtml(h.sector) : '—'}</td>
        <td>${countryToRegion(h.country)}</td>
      `;
    }
    tbody.appendChild(tr);
  }
}

// ── Flags ─────────────────────────────────────────────────────────────────────
function renderFlags(flags) {
  const container = document.getElementById('flags-container');
  container.innerHTML = '';

  const greens  = flags.filter(f => f.status === 'green');
  const nonGreen = flags.filter(f => f.status !== 'green');

  for (const f of nonGreen) {
    container.appendChild(buildFlagEl(f));
  }
  const greenDims = [...new Set(greens.map(f => f.dimension))];
  for (const dim of greenDims) {
    const f = greens.find(g => g.dimension === dim);
    container.appendChild(buildFlagEl(f));
  }
}

function buildFlagEl(f) {
  const el = document.createElement('div');
  const cls = f.status === 'red' ? 'kv-flag-red' : f.status === 'amber' ? 'kv-flag-amber' : 'kv-flag-green';
  el.className = `kv-flag ${cls}`;

  const icon = f.status === 'red' ? '🔴' : f.status === 'amber' ? '🟡' : '🟢';
  const dimLabel = { sector: 'Sector', region: 'Region', stock: 'Holdings', etf: 'ETF Holding' }[f.dimension] ?? f.dimension;

  let title, detail;
  if (f.status === 'green') {
    const pluralLabel = { stock: 'positions', etf: 'ETFs', sector: 'sectors', region: 'regions' }[f.dimension] ?? (f.dimension + 's');
    const countNote = f.count > 0 ? ` across ${f.count} ${pluralLabel}` : '';
    title  = `${dimLabel} diversification`;
    detail = `Well diversified${countNote}. No concentration above ${f.threshold}%.`;
  } else {
    const rounded = Math.round(f.value * 10) / 10;
    const verb = f.status === 'amber' ? 'approaching'
               : rounded === f.threshold ? 'meets'
               : 'exceeds';
    const viaNote = f.via ? ` (via ${escapeHtml(f.via)})` : '';
    title  = `${dimLabel} concentration — ${escapeHtml(f.name)}${viaNote}`;
    detail = `${f.value.toFixed(1)}% ${verb} your ${f.threshold}% threshold.`;
  }

  // Trust invariant: `title` contains only escapeHtml()-escaped strings and trusted emoji/literals.
  // `detail` contains only number literals (.toFixed) and trusted string literals — no user input.
  // Any new field added to a flag object that reaches innerHTML here MUST be passed through escapeHtml().
  el.innerHTML = `
    <span class="kv-flag-icon">${icon}</span>
    <div>
      <div class="kv-flag-title">${title}</div>
      <div class="kv-flag-detail">${detail}</div>
    </div>
  `;
  return el;
}

// ── Score card ────────────────────────────────────────────────────────────────
function renderScoreCard(score) {
  const el = document.getElementById('score-card');
  const totalCls = score.total >= 75 ? 'kv-score-green' : score.total >= 50 ? 'kv-score-amber' : 'kv-score-red';

  function dimBar(label, val) {
    const pct = (val / 25) * 100;
    const barCls = pct >= 75 ? 'kv-score-bar-green' : pct >= 50 ? 'kv-score-bar-amber' : 'kv-score-bar-red';
    const valCls = pct >= 75 ? 'kv-score-green' : pct >= 50 ? 'kv-score-amber' : 'kv-score-red';
    return `
      <div class="kv-score-dim">
        <div class="kv-score-dim-label">${label}<span class="${valCls}">${val}</span></div>
        <div class="kv-score-bar-track"><div class="kv-score-bar-fill ${barCls}" style="width:${pct}%"></div></div>
      </div>`;
  }

  el.innerHTML = `
    <div class="kv-score-card">
      <div class="kv-score-main">
        <span class="kv-score-number ${totalCls}">${score.total}</span>
        <span class="kv-score-denom">/100</span>
        <span class="kv-score-label">Health Score</span>
      </div>
      <div class="kv-score-dims">
        ${dimBar('Holdings', score.stock)}
        ${dimBar('Sector', score.sector)}
        ${dimBar('Regions', score.region)}
        ${dimBar('ETFs', score.etf)}
      </div>
    </div>`;
  el.hidden = false;
}

// ── Overlap card ──────────────────────────────────────────────────────────────
function renderOverlapCard(overlaps, etfCount) {
  const el = document.getElementById('overlap-card');
  if (etfCount < 2) { el.hidden = true; return; }

  if (overlaps.length === 0) {
    el.innerHTML = `<div class="kv-overlap-card"><h3>ETF Overlap</h3><p class="kv-overlap-none">🟢 No shared top-10 holdings between your ETFs.</p><p class="kv-overlap-note">Only ETFs with available top-10 data are compared.</p></div>`;
    el.hidden = false;
    return;
  }

  const pairsHtml = [...overlaps]
    .sort((a, b) => b.shared.length - a.shared.length)
    .map(pair => `
      <div class="kv-overlap-pair">
        <div class="kv-overlap-pair-header">
          <span>${escapeHtml(pair.etfA)} ↔ ${escapeHtml(pair.etfB)}</span>
          <span class="kv-overlap-pair-badge">${pair.shared.length} shared holdings</span>
        </div>
        <div class="kv-overlap-header-row">
          <span>Ticker</span><span>${escapeHtml(pair.etfA)}</span><span>${escapeHtml(pair.etfB)}</span>
        </div>
        ${pair.shared.map(s => `
          <div class="kv-overlap-row">
            <span class="kv-overlap-ticker">${escapeHtml(s.ticker)}</span>
            <span class="kv-overlap-wt">${s.weightInA.toFixed(1)}%</span>
            <span class="kv-overlap-wt">${s.weightInB.toFixed(1)}%</span>
          </div>`).join('')}
      </div>`).join('');

  el.innerHTML = `<div class="kv-overlap-card"><h3>ETF Overlap</h3><p class="kv-overlap-note">Weights shown are each holding's share <em>within</em> the ETF, not your whole portfolio.</p>${pairsHtml}</div>`;
  el.hidden = false;
}

// ── Drill panel ───────────────────────────────────────────────────────────────
function openDrillPanel(label, dimension) {
  if (!lastAnalysis) return;
  const { analysis, resolvedHoldings } = lastAnalysis;
  const { weights } = normaliseWeights(lastAnalysis.rawWeights);
  const content = document.getElementById('drill-content');
  let html = '';

  if (dimension === 'sector') {
    const contribs = analysis.sectorContributions[label] ?? [];
    const total = contribs.reduce((s, c) => s + c.contribution, 0);
    html = `
      <h2>${escapeHtml(label)}</h2>
      <p class="drill-subheader">${total.toFixed(1)}% of portfolio</p>
      ${contribs
        .sort((a, b) => b.contribution - a.contribution)
        .map(c => `
          <div class="drill-contrib-row">
            <span class="drill-contrib-ticker">${escapeHtml(c.ticker)}</span>
            <span class="drill-contrib-type drill-type-${c.type}">${c.type === 'direct' ? 'Direct' : 'via ETF'}</span>
            <span class="drill-contrib-pct">${c.contribution.toFixed(1)}%</span>
          </div>`).join('')}`;
  } else if (dimension === 'region') {
    const contribs = analysis.regionContributions[label] ?? [];
    const total = contribs.reduce((s, c) => s + c.contribution, 0);
    html = `
      <h2>${escapeHtml(label)}</h2>
      <p class="drill-subheader">${total.toFixed(1)}% of portfolio</p>
      ${contribs
        .sort((a, b) => b.contribution - a.contribution)
        .map(c => `
          <div class="drill-contrib-row">
            <span class="drill-contrib-ticker">${escapeHtml(c.ticker)}</span>
            <span class="drill-contrib-type drill-type-${c.type}">${c.type === 'direct' ? 'Direct' : 'via ETF'}</span>
            <span class="drill-contrib-pct">${c.contribution.toFixed(1)}%</span>
          </div>`).join('')}`;
  } else if (dimension === 'holdings') {
    const h = resolvedHoldings.find(r => r.ticker === label);
    if (!h || h.error) {
      html = `<h2>${escapeHtml(label)}</h2><p>No data available.</p>`;
    } else {
      const w = weights[h.ticker] ?? 0;
      if (h.quoteType === 'ETF') {
        const topHtml = (h.topHoldings ?? []).slice(0, 10)
          .map(t => `<div class="drill-holding-row"><span>${escapeHtml(t.ticker)}</span><span>${(t.weight * 100).toFixed(1)}%</span></div>`)
          .join('');
        html = `
          <h2>${escapeHtml(h.ticker)}</h2>
          ${h.name ? `<p class="drill-subheader">${escapeHtml(h.name)}</p>` : ''}
          <div class="drill-meta-row"><strong>Type</strong><span>ETF</span></div>
          <div class="drill-meta-row"><strong>Portfolio weight</strong><span>${w.toFixed(1)}%</span></div>
          ${topHtml ? `<h3 style="margin:16px 0 8px">Top holdings</h3>${topHtml}` : ''}`;
      } else {
        html = `
          <h2>${escapeHtml(h.ticker)}</h2>
          ${h.name ? `<p class="drill-subheader">${escapeHtml(h.name)}</p>` : ''}
          <div class="drill-meta-row"><strong>Type</strong><span>Stock</span></div>
          <div class="drill-meta-row"><strong>Portfolio weight</strong><span>${w.toFixed(1)}%</span></div>
          <div class="drill-meta-row"><strong>Sector</strong><span>${escapeHtml(h.sector ?? '—')}</span></div>
          <div class="drill-meta-row"><strong>Region</strong><span>${escapeHtml(countryToRegion(h.country))}</span></div>`;
      }
    }
  }

  content.innerHTML = html;
  document.getElementById('drill-panel').classList.add('open');
  document.getElementById('drill-overlay').classList.add('open');
}

function closeDrillPanel() {
  document.getElementById('drill-panel').classList.remove('open');
  document.getElementById('drill-overlay').classList.remove('open');
}

// ── Charts ────────────────────────────────────────────────────────────────────
const chartInstances = {};

function chartColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    text:   cs.getPropertyValue('--kv-text').trim()   || '#f1f5f9',
    muted:  cs.getPropertyValue('--kv-muted').trim()  || '#93a0bd',
    border: cs.getPropertyValue('--kv-border').trim() || '#223052',
  };
}

// Re-render charts on theme toggle so axis/grid colors track the active theme.
new MutationObserver(() => {
  if (lastAnalysis) renderCharts(lastAnalysis.analysis, lastAnalysis.resolvedHoldings, lastAnalysis.rawWeights);
}).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

function renderCharts(analysis, resolvedHoldings, rawWeights) {
  renderWaterfallChart('chart-holdings', resolvedHoldings, rawWeights, state.thresholds);
  renderHBar('chart-asset',  analysis.assetClass, 100,                     null);
  renderHBar('chart-sector', analysis.sector,     state.thresholds.sector, 'sector');
  renderHBar('chart-region', analysis.region,     state.thresholds.region, 'region');
}

function renderWaterfallChart(canvasId, resolvedHoldings, rawWeights, thresholds) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  const { weights } = normaliseWeights(rawWeights);
  const theme = chartColors();

  const items = resolvedHoldings
    .filter(h => !h.error)
    .map(h => ({ ticker: h.ticker, weight: weights[h.ticker] ?? 0, quoteType: h.quoteType }))
    .filter(h => h.weight > 0.1)
    .sort((a, b) => b.weight - a.weight);

  const labels = items.map(h => h.ticker);
  const data = [];
  const colors = [];
  let cumulative = 0;

  for (const item of items) {
    const start = parseFloat(cumulative.toFixed(2));
    const end   = parseFloat((cumulative + item.weight).toFixed(2));
    data.push([start, end]);
    cumulative += item.weight;

    const thr = item.quoteType === 'ETF' ? (thresholds.etf ?? 30) : (thresholds.stock ?? 10);
    if (item.weight >= thr)       colors.push('rgba(239,68,68,0.75)');
    else if (item.weight >= thr - 2) colors.push('rgba(249,115,22,0.75)');
    else                           colors.push('rgba(34,197,94,0.75)');
  }

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.75', '1')),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick(evt, elements) {
        if (!elements.length) return;
        openDrillPanel(labels[elements[0].index], 'holdings');
      },
      onHover(evt, elements) {
        evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const [start, end] = ctx.raw;
              return ` ${(end - start).toFixed(1)}%`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: theme.text,
            font: { size: 11 },
            maxRotation: 35,
            minRotation: 0,
            callback(val) {
              const lbl = this.getLabelForValue(val);
              return lbl.length > 14 ? lbl.slice(0, 13) + '…' : lbl;
            },
          },
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: theme.border },
          ticks: { color: theme.muted, callback: v => v + '%', maxTicksLimit: 6 },
          afterFit: scale => { scale.width = 88; },
        },
      },
    },
  });
}

function renderHBar(canvasId, buckets, threshold, dimension) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  const theme = chartColors();
  const sorted = Object.entries(buckets)
    .sort(([, a], [, b]) => b - a)
    .filter(([, v]) => v > 0.1);

  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => parseFloat(v.toFixed(1)));
  const maxValue = values.length > 0 ? Math.max(...values) : 0;
  const yMax = Math.min(100, Math.ceil((Math.max(maxValue, threshold) + 5) / 10) * 10);

  const colors = values.map(v => {
    if (v >= threshold)       return 'rgba(239,68,68,0.75)';
    if (v >= threshold - 2)   return 'rgba(249,115,22,0.75)';
    return 'rgba(34,197,94,0.75)';
  });

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.75', '1')),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick(evt, elements) {
        if (!elements.length || !dimension) return;
        openDrillPanel(labels[elements[0].index], dimension);
      },
      onHover(evt, elements) {
        evt.native.target.style.cursor = (elements.length && dimension) ? 'pointer' : 'default';
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y.toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: theme.text,
            font: { size: 11 },
            maxRotation: 35,
            minRotation: 0,
            callback(val) {
              const lbl = this.getLabelForValue(val);
              return lbl.length > 14 ? lbl.slice(0, 13) + '…' : lbl;
            },
          },
        },
        y: {
          min: 0,
          max: yMax,
          grid: { color: theme.border },
          ticks: { color: theme.muted, callback: v => v + '%', maxTicksLimit: 6 },
        },
      },
    },
    plugins: [{
      id: 'threshold-line',
      afterDraw(chart) {
        const { ctx: c, chartArea, scales } = chart;
        const y = scales.y.getPixelForValue(threshold);
        if (y < chartArea.top || y > chartArea.bottom) return;
        c.save();
        c.strokeStyle = 'rgba(147,160,189,0.5)';
        c.setLineDash([4, 4]);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(chartArea.left, y);
        c.lineTo(chartArea.right, y);
        c.stroke();
        c.restore();
      },
    }],
  });
}

// ── PDF ───────────────────────────────────────────────────────────────────────
document.getElementById('btn-pdf').addEventListener('click', () => {
  window.print();
});

// ── Drill panel events ────────────────────────────────────────────────────────
document.getElementById('drill-overlay').addEventListener('click', closeDrillPanel);
document.getElementById('drill-close').addEventListener('click', closeDrillPanel);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrillPanel(); });

// Restores the last analysis on load if the current holdings are byte-identical
// to what produced it — skips the placeholder screen and avoids a needless refetch.
function tryRestoreLastResult() {
  const cached = loadCachedResult();
  if (!cached) return;
  const validHoldings = state.holdings.filter(h => h.ticker && h.value != null && Number(h.value) > 0);
  if (validHoldings.length === 0) return;
  const mergedHoldings = mergeHoldings(validHoldings);
  if (!weightsMatch(mergedHoldings, cached.rawWeights)) return;

  const analysis = analysePortfolio(cached.resolvedHoldings, mergedHoldings, state.thresholds);
  lastAnalysis = { resolvedHoldings: cached.resolvedHoldings, analysis, rawWeights: mergedHoldings };
  renderResults(cached.resolvedHoldings, analysis, mergedHoldings);
}

// ── Init ─────────────────────────────────────────────────────────────────────
renderHoldingsList();
renderThresholds();
tryRestoreLastResult();

