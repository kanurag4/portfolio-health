import { countryToRegion, regionFromTicker, SECTOR_LABELS } from './data.js';

export function normaliseWeights(rawWeights) {
  const percentItems = rawWeights.filter(w => w.inputMode === '%');
  const dollarItems  = rawWeights.filter(w => w.inputMode === '$');

  const totalPercent = percentItems.reduce((s, w) => s + w.value, 0);
  const totalDollars  = dollarItems.reduce((s, w) => s + w.value, 0);

  const percentSlice = Math.min(totalPercent, 100);
  const dollarSlice  = 100 - percentSlice;

  const weights = {};
  for (const w of percentItems) {
    weights[w.ticker] = (w.value / (totalPercent || 1)) * percentSlice;
  }
  for (const w of dollarItems) {
    weights[w.ticker] = (w.value / (totalDollars || 1)) * dollarSlice;
  }

  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  const normalised = Math.abs(total - 100) > 0.5; // 0.5% tolerance to absorb fp drift
  if (normalised && total > 0) {
    for (const k of Object.keys(weights)) weights[k] = (weights[k] / total) * 100;
  }

  return { weights, normalised };
}

export function analysePortfolio(resolvedHoldings, rawWeights, thresholds) {
  const { weights, normalised } = normaliseWeights(rawWeights);

  const assetClass    = {};
  const sector        = {};
  const region        = {};
  const etfConc       = {};
  const stockConc     = {};
  const stockConcVia  = {}; // ticker -> Set of ETF tickers it came through
  const unresolved    = [];

  for (const h of resolvedHoldings) {
    if (h.error) { unresolved.push(h.ticker); continue; }
    const w = weights[h.ticker] ?? 0;

    if (h.quoteType === 'ETF') {
      add(etfConc, h.ticker, w);
      add(assetClass, 'Equity',        w * (h.stockPosition ?? 1));
      add(assetClass, 'Fixed Income',  w * (h.bondPosition  ?? 0));
      add(assetClass, 'Cash',          w * (h.cashPosition  ?? 0));

      if (h.sectorWeightings.length > 0) {
        for (const sw of h.sectorWeightings) {
          const [key, val] = Object.entries(sw)[0];
          const pct = typeof val === 'object' ? (val.raw ?? 0) : val;
          add(sector, SECTOR_LABELS[key] ?? key, w * pct);
        }
      } else {
        add(sector, 'Diversified (ETF)', w);
      }

      if (h.countryWeightings && h.countryWeightings.length > 0) {
        for (const cw of h.countryWeightings) {
          const [country, val] = Object.entries(cw)[0];
          const pct = typeof val === 'object' ? (val.raw ?? 0) : val;
          add(region, countryToRegion(country), w * pct);
        }
      } else if (h.topHoldings && h.topHoldings.length > 0) {
        let covered = 0;
        for (const top of h.topHoldings) {
          add(region, regionFromTicker(top.ticker), w * top.weight);
          covered += top.weight;
        }
        if (covered < 1) add(region, 'Unclassified', w * (1 - covered));
      } else {
        add(region, 'Unclassified', w);
      }

      let covered = 0;
      for (const top of (h.topHoldings ?? [])) {
        add(stockConc, top.ticker, w * top.weight);
        if (!stockConcVia[top.ticker]) stockConcVia[top.ticker] = new Set();
        stockConcVia[top.ticker].add(h.ticker);
        covered += top.weight;
      }
      if (covered < 1) add(stockConc, `${h.ticker} (rest)`, w * (1 - covered));
    } else {
      add(assetClass, 'Equity', w);
      add(sector, h.sector ?? 'Unclassified', w);
      add(region, countryToRegion(h.country), w);
      add(stockConc, h.ticker, w);
    }
  }

  const flags = [
    ...buildDimFlags('etf',    etfConc,  thresholds.etf    ?? 30),
    ...buildDimFlags('sector', sector,   thresholds.sector  ?? 30),
    ...buildDimFlags('region', region,   thresholds.region  ?? 50),
    ...buildStockFlags(stockConc, stockConcVia, thresholds.stock ?? 10),
  ];

  return { assetClass, sector, region, flags, unresolved, normalised };
}

function add(obj, key, value) {
  if (!key || value <= 0) return;
  obj[key] = (obj[key] ?? 0) + value;
}

function flagStatus(value, threshold) {
  const v = Math.round(value * 10) / 10; // round to 1 dp to avoid floating-point drift
  if (v >= threshold) return 'red';
  if (v >= threshold - 5) return 'amber';
  return null;
}

function buildDimFlags(dimension, buckets, threshold) {
  const flags = [];
  for (const [name, value] of Object.entries(buckets)) {
    const status = flagStatus(value, threshold);
    if (status) flags.push({ dimension, name, value, threshold, status });
  }
  if (flags.length === 0) {
    flags.push({ dimension, name: 'all', value: null, threshold, status: 'green',
                 count: Object.keys(buckets).length });
  }
  return flags;
}

function buildStockFlags(stockConc, stockConcVia, threshold) {
  const flags = [];
  for (const [name, value] of Object.entries(stockConc)) {
    if (name.endsWith('(rest)')) continue;
    const via = stockConcVia[name] ? [...stockConcVia[name]].join(', ') : null;
    const status = flagStatus(value, threshold);
    if (status) flags.push({ dimension: 'stock', name, value, threshold, status, via });
  }
  if (flags.length === 0) {
    flags.push({ dimension: 'stock', name: 'all', value: null, threshold, status: 'green',
                 count: Object.keys(stockConc).length });
  }
  return flags;
}
