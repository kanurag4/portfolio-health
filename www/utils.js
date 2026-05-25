export function parseMoney(str) {
  const cleaned = String(str ?? '').replace(/,/g, '').trim();
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return isFinite(n) ? n : NaN;
}

export function fmt(value, decimals = 1, suffix = '%') {
  if (value == null || !isFinite(value)) return '—';
  return value.toFixed(decimals) + suffix;
}

export function formatCurrency(value) {
  if (value == null || !isFinite(value)) return '—';
  return '$' + Number(value).toLocaleString('en-AU', { maximumFractionDigits: 0 });
}

export function clampThreshold(n) {
  return Math.min(100, Math.max(1, n));
}
