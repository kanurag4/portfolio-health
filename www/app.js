import { parseMoney } from './utils.js';
import { fetchHolding, countryToRegion } from './data.js';
import { analysePortfolio, normaliseWeights } from './analyse.js';

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
      thresholds: { ...defaultState().thresholds, ...(parsed.thresholds ?? {}) },
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

  const ticker = document.createElement('input');
  ticker.className = 'kv-input';
  ticker.type = 'text';
  ticker.placeholder = 'e.g. VAS, CBA';
  ticker.value = holding.ticker;
  ticker.addEventListener('blur', () => {
    let t = ticker.value.trim().toUpperCase();
    if (t && state.holdings[index].isAsx && !t.includes('.')) t += '.AX';
    state.holdings[index].ticker = t;
    ticker.value = t;
    saveState();
  });

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

  row.append(ticker, asxLabel, modeBtn, amount, removeBtn);
  return row;
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
    const parse = v => { const n = parseMoney(v); return isFinite(n) && n > 0 ? n : null; };
    state.thresholds.etf    = parse(threshEtf.value)    ?? state.thresholds.etf;
    state.thresholds.stock  = parse(threshStock.value)  ?? state.thresholds.stock;
    state.thresholds.sector = parse(threshSector.value) ?? state.thresholds.sector;
    state.thresholds.region = parse(threshRegion.value) ?? state.thresholds.region;
    renderThresholds(); // snap any invalid inputs back to the current valid value
    saveState();
  });
});

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
    alert('No valid holdings found in the Excel file. Check the Ticker and Amount/Percentage columns.');
    e.target.value = '';
    return;
  }

  state.holdings = imported;
  saveState();
  renderHoldingsList();
  if (skipped.length > 0) {
    alert(`Imported ${imported.length} holding(s). Skipped ${skipped.length} row(s) with no valid amount: ${skipped.join(', ')}`);
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
    }));
  if (rows.length === 0) { alert('No holdings to export.'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Holdings');
  XLSX.writeFile(wb, 'my-portfolio.xlsx');
}

// ── Analyse ──────────────────────────────────────────────────────────────────
let lastAnalysis = null;

btnAnalyse.addEventListener('click', async () => {
  const validHoldings = state.holdings.filter(h => h.ticker && h.value != null && Number(h.value) > 0);
  if (validHoldings.length === 0) {
    alert('Please add at least one holding with a ticker and amount.');
    return;
  }

  const tickers = validHoldings.map(h => h.ticker);
  const dupes = [...new Set(tickers.filter((t, i) => tickers.indexOf(t) !== i))];
  if (dupes.length > 0) {
    alert(`Duplicate tickers detected: ${dupes.join(', ')}. Please remove duplicates before analysing.`);
    return;
  }

  btnAnalyse.textContent = 'Analysing…';
  btnAnalyse.disabled = true;

  try {
    const resolvedHoldings = await Promise.all(
      validHoldings.map(h => fetchHolding(h.ticker))
    );

    const analysis = analysePortfolio(resolvedHoldings, validHoldings, state.thresholds);
    lastAnalysis = { resolvedHoldings, analysis, rawWeights: validHoldings };

    await renderResults(resolvedHoldings, analysis, validHoldings);
  } catch (err) {
    alert('Analysis failed: ' + err.message);
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
    unresolvedEl.textContent = `⚠ Could not fetch data for: ${analysis.unresolved.join(', ')}. These are excluded from the analysis.`;
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
  renderCharts(analysis);
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

  el.innerHTML = `
    <span class="kv-flag-icon">${icon}</span>
    <div>
      <div class="kv-flag-title">${title}</div>
      <div class="kv-flag-detail">${detail}</div>
    </div>
  `;
  return el;
}

// ── Charts ────────────────────────────────────────────────────────────────────
const chartInstances = {};

function renderCharts(analysis) {
  renderHBar('chart-asset',  analysis.assetClass, 100);
  renderHBar('chart-sector', analysis.sector,     state.thresholds.sector);
  renderHBar('chart-region', analysis.region,     state.thresholds.region);
}

function renderHBar(canvasId, buckets, threshold) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  const sorted = Object.entries(buckets)
    .sort(([, a], [, b]) => b - a)
    .filter(([, v]) => v > 0.1);

  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => parseFloat(v.toFixed(1)));
  const maxValue = values.length > 0 ? Math.max(...values) : 0;
  const yMax = Math.min(100, Math.ceil((Math.max(maxValue, threshold) + 5) / 10) * 10);

  const colors = values.map(v => {
    if (v >= threshold)       return 'rgba(239,68,68,0.75)';
    if (v >= threshold - 2)   return 'rgba(245,158,11,0.75)';
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
            color: '#f1f5f9',
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
          grid: { color: '#334155' },
          ticks: { color: '#94a3b8', callback: v => v + '%', maxTicksLimit: 6 },
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
        c.strokeStyle = 'rgba(148,163,184,0.5)';
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

// ── Init ─────────────────────────────────────────────────────────────────────
renderHoldingsList();
renderThresholds();

