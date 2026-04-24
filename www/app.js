import { parseMoney } from './utils.js';
import { fetchHolding } from './data.js';
import { analysePortfolio } from './analyse.js';

// ── State ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'portfoliohealth_v1';

function defaultState() {
  return {
    holdings: [{ ticker: '', inputMode: '$', value: '' }],
    thresholds: { stock: 10, sector: 30, region: 50 },
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      holdings: parsed.holdings ?? defaultState().holdings,
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
const threshStock    = document.getElementById('thresh-stock');
const threshSector   = document.getElementById('thresh-sector');
const threshRegion   = document.getElementById('thresh-region');

// ── Holdings rows ──────────────────────────────────────────────────────────
function renderHoldingsList() {
  holdingsList.innerHTML = '';
  state.holdings.forEach((h, i) => holdingsList.appendChild(buildRow(h, i)));
}

function buildRow(holding, index) {
  const row = document.createElement('div');
  row.className = 'kv-holding-row';

  const ticker = document.createElement('input');
  ticker.className = 'kv-input';
  ticker.type = 'text';
  ticker.placeholder = 'e.g. VAS.AX';
  ticker.value = holding.ticker;
  ticker.addEventListener('blur', () => {
    state.holdings[index].ticker = ticker.value.trim().toUpperCase();
    ticker.value = state.holdings[index].ticker;
    saveState();
  });

  const modeBtn = document.createElement('button');
  modeBtn.className = 'kv-mode-toggle';
  modeBtn.textContent = holding.inputMode;
  modeBtn.title = 'Toggle between $ amount and %';
  modeBtn.addEventListener('click', () => {
    state.holdings[index].inputMode = state.holdings[index].inputMode === '$' ? '%' : '$';
    state.holdings[index].value = '';
    saveState();
    renderHoldingsList();
  });

  const amount = document.createElement('input');
  amount.className = 'kv-input';
  amount.type = 'text';
  amount.inputMode = 'numeric';
  amount.placeholder = holding.inputMode === '$' ? 'Amount (AUD)' : 'Percentage';
  amount.value = holding.value !== '' ? formatInputVal(holding.value) : '';
  amount.addEventListener('input', e => {
    const raw = e.target.value.replace(/,/g, '');
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      state.holdings[index].value = raw === '' ? '' : Number(raw);
      const cursor = e.target.selectionStart;
      const formatted = raw === '' ? '' : Number(raw).toLocaleString('en-AU', { maximumFractionDigits: 2 });
      e.target.value = formatted;
      const diff = formatted.length - e.target.value.length;
      try { e.target.setSelectionRange(cursor + diff, cursor + diff); } catch {}
      saveState();
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

  row.append(ticker, modeBtn, amount, removeBtn);
  return row;
}

function formatInputVal(v) {
  if (v === '' || v == null) return '';
  return Number(v).toLocaleString('en-AU', { maximumFractionDigits: 2 });
}

btnAddRow.addEventListener('click', () => {
  state.holdings.push({ ticker: '', inputMode: '$', value: '' });
  saveState();
  renderHoldingsList();
  holdingsList.lastElementChild?.querySelector('input')?.focus();
});

// ── Thresholds ──────────────────────────────────────────────────────────────
function renderThresholds() {
  threshStock.value  = state.thresholds.stock;
  threshSector.value = state.thresholds.sector;
  threshRegion.value = state.thresholds.region;
}

[threshStock, threshSector, threshRegion].forEach(el => {
  el.addEventListener('change', () => {
    state.thresholds.stock  = parseMoney(threshStock.value)  || 10;
    state.thresholds.sector = parseMoney(threshSector.value) || 30;
    state.thresholds.region = parseMoney(threshRegion.value) || 50;
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
    ['Ticker', 'Name (optional)', 'Amount_AUD', 'Percentage', 'Notes'],
    ['VAS.AX', 'Vanguard AU Shares', 10000, '', 'ASX ETF'],
    ['VOO', 'Vanguard S&P 500', '', 20, 'US ETF'],
    ['CBA.AX', '', 5000, '', ''],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(holdingsData);
  ws1['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Holdings');

  const instructions = [
    ['Portfolio Health — Import Instructions'],
    [''],
    ['1. Fill in the Holdings sheet, one row per investment.'],
    ['2. Enter either Amount_AUD OR Percentage per row, not both.'],
    ['3. Ticker format: add .AX for ASX, .NS for NSE India, no suffix for US stocks.'],
    ['4. Save and import back into the Portfolio Health tool.'],
    ['5. Name and Notes columns are optional.'],
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

    if (isFinite(amt) && amt > 0) {
      imported.push({ ticker, inputMode: '$', value: amt });
    } else if (isFinite(pct) && pct > 0) {
      imported.push({ ticker, inputMode: '%', value: pct });
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
  const validHoldings = state.holdings.filter(h => h.ticker && h.value !== '' && Number(h.value) > 0);
  if (validHoldings.length === 0) {
    alert('Please add at least one holding with a ticker and amount.');
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

  await renderHoldingsTable(resolvedHoldings, rawWeights);
  renderFlags(analysis.flags);
  renderCharts(analysis);
}

async function renderHoldingsTable(resolvedHoldings, rawWeights) {
  const { normaliseWeights } = await import('./analyse.js');
  const { weights } = normaliseWeights(rawWeights);
  const tbody = document.getElementById('holdings-table-body');
  tbody.innerHTML = '';

  for (const h of resolvedHoldings) {
    const w = weights[h.ticker] ?? 0;
    const tr = document.createElement('tr');
    if (h.error) {
      tr.innerHTML = `<td>${h.ticker}</td><td>—</td><td>—</td><td>—</td><td colspan="2" style="color:var(--kv-fail)">Unresolved</td>`;
    } else if (h.quoteType === 'ETF') {
      tr.innerHTML = `
        <td>${h.ticker}</td>
        <td>${h.name ?? '—'}</td>
        <td>ETF</td>
        <td>${w.toFixed(1)}%</td>
        <td>Diversified</td>
        <td>—</td>
      `;
    } else {
      const { countryToRegion } = await import('./data.js');
      tr.innerHTML = `
        <td>${h.ticker}</td>
        <td>${h.name ?? '—'}</td>
        <td>Stock</td>
        <td>${w.toFixed(1)}%</td>
        <td>${h.sector ?? '—'}</td>
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
  const dimLabel = { sector: 'Sector', region: 'Region', stock: 'Holdings' }[f.dimension] ?? f.dimension;

  let title, detail;
  if (f.status === 'green') {
    const countNote = f.count > 0 ? ` across ${f.count} ${f.dimension === 'stock' ? 'positions' : f.dimension + 's'}` : '';
    title  = `${dimLabel} diversification`;
    detail = `Well diversified${countNote}. No concentration above ${f.threshold}%.`;
  } else {
    const near = f.status === 'amber' ? 'approaching' : 'exceeds';
    title  = `${dimLabel} concentration — ${f.name}`;
    detail = `${f.value.toFixed(1)}% ${near} your ${f.threshold}% threshold.`;
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

  const colors = values.map(v => {
    if (v >= threshold)       return 'rgba(239,68,68,0.75)';
    if (v >= threshold - 5)   return 'rgba(245,158,11,0.75)';
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
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.x.toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: {
          max: Math.max(100, ...values) + 5,
          grid: { color: '#334155' },
          ticks: { color: '#94a3b8', callback: v => v + '%' },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#f1f5f9', font: { size: 12 } },
        },
      },
    },
    plugins: [{
      id: 'threshold-line',
      afterDraw(chart) {
        const { ctx: c, chartArea, scales } = chart;
        const x = scales.x.getPixelForValue(threshold);
        if (x < chartArea.left || x > chartArea.right) return;
        c.save();
        c.strokeStyle = 'rgba(148,163,184,0.5)';
        c.setLineDash([4, 4]);
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, chartArea.top);
        c.lineTo(x, chartArea.bottom);
        c.stroke();
        c.restore();
      },
    }],
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────
renderHoldingsList();
renderThresholds();

export { state, saveState };
