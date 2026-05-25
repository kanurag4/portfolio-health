import { countryToRegion, regionFromTicker, SECTOR_LABELS, EQUITY_SECTOR_NORMALIZE } from './data.js';

// Scoring model: 4 dimensions × 25 pts each = 100 max.
// Per dimension: 25 − (redCount × 10) − (amberCount × 5), floored at 0.
// A dimension with zero flags (e.g. no ETFs in portfolio) scores 25 (neutral — not penalised).
// Green flags contribute 0 deductions; only red/amber matter.
export function scorePortfolio(flags) {
  const DIMENSIONS = ['stock', 'sector', 'region', 'etf'];
  const scores = {};
  for (const dim of DIMENSIONS) {
    const dimFlags = flags.filter(f => f.dimension === dim);
    if (dimFlags.length === 0) { scores[dim] = 25; continue; }
    const redCount   = dimFlags.filter(f => f.status === 'red').length;
    const amberCount = dimFlags.filter(f => f.status === 'amber').length;
    scores[dim] = Math.max(0, 25 - (redCount * 10) - (amberCount * 5));
  }
  return {
    total:  scores.stock + scores.sector + scores.region + scores.etf,
    stock:  scores.stock,
    sector: scores.sector,
    region: scores.region,
    etf:    scores.etf,
  };
}

export function detectOverlap(resolvedHoldings, normalisedWeights) {
  const { weights } = normalisedWeights;
  const etfs = resolvedHoldings.filter(
    h => !h.error && h.quoteType === 'ETF' && h.topHoldings && h.topHoldings.length > 0
  );
  const result = [];
  for (let i = 0; i < etfs.length; i++) {
    for (let j = i + 1; j < etfs.length; j++) {
      const a = etfs[i], b = etfs[j];
      const tickersInA = new Map(a.topHoldings.map(h => [h.ticker, h.weight]));
      const shared = b.topHoldings
        .filter(h => tickersInA.has(h.ticker))
        .map(h => ({
          ticker:    h.ticker,
          weightInA: tickersInA.get(h.ticker) * 100,
          weightInB: h.weight * 100,
        }))
        .sort((x, y) => Math.max(y.weightInA, y.weightInB) - Math.max(x.weightInA, x.weightInB));
      if (shared.length === 0) continue;
      result.push({ etfA: a.ticker, etfB: b.ticker, weightA: weights[a.ticker] ?? 0, weightB: weights[b.ticker] ?? 0, shared });
    }
  }
  return result;
}

export function normaliseWeights(rawWeights) {
  const percentItems = rawWeights.filter(w => w.inputMode === '%');
  const dollarItems  = rawWeights.filter(w => w.inputMode === '$');

  const totalPercent = percentItems.reduce((s, w) => s + w.value, 0);
  const totalDollars  = dollarItems.reduce((s, w) => s + w.value, 0);

  const overAllocated = totalPercent > 100 + 0.5; // percent rows alone exceed 100%
  const percentSlice = Math.min(totalPercent, 100);
  const dollarSlice  = 100 - percentSlice;

  const weights = {};
  for (const w of percentItems) {
    weights[w.ticker] = (weights[w.ticker] ?? 0) + (w.value / (totalPercent || 1)) * percentSlice;
  }
  for (const w of dollarItems) {
    weights[w.ticker] = (weights[w.ticker] ?? 0) + (w.value / (totalDollars || 1)) * dollarSlice;
  }

  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  const normalised = overAllocated || Math.abs(total - 100) > 0.5;
  if (normalised && total > 0) {
    for (const k of Object.keys(weights)) weights[k] = (weights[k] / total) * 100;
  }

  return { weights, normalised };
}

export function analysePortfolio(resolvedHoldings, rawWeights, thresholds) {
  const { weights, normalised } = normaliseWeights(rawWeights);

  const assetClass          = {};
  const sector              = {};
  const region              = {};
  const etfConc             = {};
  const stockConc           = {};
  const stockConcVia        = {}; // ticker -> Set of ETF tickers it came through
  const unresolved          = [];
  const sectorContributions = {};
  const regionContributions = {};

  for (const h of resolvedHoldings) {
    const w = weights[h.ticker] ?? 0;
    if (h.error) {
      unresolved.push(h.ticker);
      add(assetClass, 'Unresolved', w);
      add(sector, 'Unresolved', w);
      add(region, 'Unresolved', w);
      continue;
    }

    if (h.quoteType === 'ETF') {
      add(etfConc, h.ticker, w);
      const bondPct  = h.bondPosition  ?? 0;
      const cashPct  = h.cashPosition  ?? 0;
      if (h.stockPosition != null) add(assetClass, 'Equity', w * h.stockPosition);
      add(assetClass, 'Fixed Income', w * bondPct);
      add(assetClass, 'Cash',         w * cashPct);
      const unclasAmt = w * Math.max(0, 1 - ((h.stockPosition ?? 0) + bondPct + cashPct));
      if (unclasAmt > 0.01) add(assetClass, 'Unclassified', unclasAmt);

      const sectorWeightings = h.sectorWeightings ?? [];
      if (sectorWeightings.length > 0) {
        for (const sw of sectorWeightings) {
          const [key, val] = Object.entries(sw)[0];
          const pct = typeof val === 'object' ? (val.raw ?? 0) : val;
          const sectorName = SECTOR_LABELS[key] ?? key;
          add(sector, sectorName, w * pct);
          addContrib(sectorContributions, sectorName, h.ticker, w * pct, 'etf');
        }
      } else {
        add(sector, 'Diversified (ETF)', w);
        addContrib(sectorContributions, 'Diversified (ETF)', h.ticker, w, 'etf');
      }

      if (h.countryWeightings && h.countryWeightings.length > 0) {
        for (const cw of h.countryWeightings) {
          const [country, val] = Object.entries(cw)[0];
          const pct = typeof val === 'object' ? (val.raw ?? 0) : val;
          const regionName = countryToRegion(country);
          add(region, regionName, w * pct);
          addContrib(regionContributions, regionName, h.ticker, w * pct, 'etf');
        }
      } else if (h.topHoldings && h.topHoldings.length > 0) {
        let covered = 0;
        for (const top of h.topHoldings) {
          const topWeight = safePct(top.weight);
          if (topWeight <= 0) continue;
          const regionName = regionFromTicker(top.ticker);
          add(region, regionName, w * topWeight);
          addContrib(regionContributions, regionName, h.ticker, w * topWeight, 'etf');
          covered += topWeight;
        }
        if (covered < 1) {
          add(region, 'Unclassified', w * (1 - covered));
          addContrib(regionContributions, 'Unclassified', h.ticker, w * (1 - covered), 'etf');
        }
      } else {
        add(region, 'Unclassified', w);
        addContrib(regionContributions, 'Unclassified', h.ticker, w, 'etf');
      }

      let covered = 0;
      for (const top of (h.topHoldings ?? [])) {
        const topWeight = safePct(top.weight);
        if (topWeight <= 0) continue;
        add(stockConc, top.ticker, w * topWeight);
        if (!stockConcVia[top.ticker]) stockConcVia[top.ticker] = new Set();
        stockConcVia[top.ticker].add(h.ticker);
        covered += topWeight;
      }
      if (covered < 1) add(stockConc, `${h.ticker} (rest)`, w * (1 - covered));
    } else {
      add(assetClass, 'Equity', w);
      const sectorName = EQUITY_SECTOR_NORMALIZE[h.sector] ?? h.sector ?? 'Unclassified';
      add(sector, sectorName, w);
      addContrib(sectorContributions, sectorName, h.ticker, w, 'direct');
      const regionName = countryToRegion(h.country);
      add(region, regionName, w);
      addContrib(regionContributions, regionName, h.ticker, w, 'direct');
      add(stockConc, h.ticker, w);
    }
  }

  const flags = [
    ...buildDimFlags('etf',    etfConc,  thresholds.etf    ?? 30),
    ...buildDimFlags('sector', sector,   thresholds.sector  ?? 30),
    ...buildDimFlags('region', region,   thresholds.region  ?? 50),
    ...buildStockFlags(stockConc, stockConcVia, thresholds.stock ?? 10),
  ];

  return { assetClass, sector, region, flags, unresolved, normalised, sectorContributions, regionContributions };
}

function add(obj, key, value) {
  if (!key || value <= 0) return;
  obj[key] = (obj[key] ?? 0) + value;
}

function safePct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function addContrib(obj, bucketName, ticker, contribution, type) {
  if (!bucketName || contribution <= 0) return;
  if (!obj[bucketName]) obj[bucketName] = [];
  obj[bucketName].push({ ticker, contribution, type });
}

function flagStatus(value, threshold) {
  const v = Math.round(value * 10) / 10; // round to 1 dp to avoid floating-point drift
  if (v >= threshold) return 'red';
  if (v >= threshold - 2) return 'amber';
  return null;
}

function buildDimFlags(dimension, buckets, threshold) {
  const flags = [];
  for (const [name, value] of Object.entries(buckets)) {
    const status = flagStatus(value, threshold);
    if (status) flags.push({ dimension, name, value, threshold, status });
  }
  if (flags.length === 0 && Object.keys(buckets).length > 0) {
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
    const realCount = Object.keys(stockConc).filter(k => !k.endsWith('(rest)')).length;
    flags.push({ dimension: 'stock', name: 'all', value: null, threshold, status: 'green',
                 count: realCount });
  }
  return flags;
}
