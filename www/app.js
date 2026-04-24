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

// ── Init ─────────────────────────────────────────────────────────────────────
renderHoldingsList();
renderThresholds();

export { state, saveState };
