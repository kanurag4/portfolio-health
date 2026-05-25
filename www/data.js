import { YAHOO_PROXY_URL } from './config.js';

export const SECTOR_LABELS = {
  realestate:             'Real Estate',
  consumer_cyclical:      'Consumer Cyclical',
  basic_materials:        'Basic Materials',
  technology:             'Technology',
  communication_services: 'Communication Services',
  financial_services:     'Financials',
  consumer_defensive:     'Consumer Defensive',
  healthcare:             'Healthcare',
  industrials:            'Industrials',
  energy:                 'Energy',
  utilities:              'Utilities',
};

// Maps Yahoo assetProfile.sector strings to the canonical SECTOR_LABELS values.
// Most Yahoo equity sectors already match the canonical label; only Financial Services differs.
export const EQUITY_SECTOR_NORMALIZE = {
  'Financial Services': 'Financials',
};

const REGION_MAP = {
  'Australia': 'Australia', 'New Zealand': 'Australia',
  'United States': 'United States',
  'United Kingdom': 'International Developed',
  'Germany': 'International Developed', 'France': 'International Developed',
  'Japan': 'International Developed', 'Canada': 'International Developed',
  'Netherlands': 'International Developed', 'Switzerland': 'International Developed',
  'Sweden': 'International Developed', 'Denmark': 'International Developed',
  'Norway': 'International Developed', 'Finland': 'International Developed',
  'Belgium': 'International Developed', 'Spain': 'International Developed',
  'Italy': 'International Developed', 'Singapore': 'International Developed',
  'Hong Kong': 'International Developed', 'South Korea': 'International Developed',
  'China': 'Emerging Markets', 'India': 'Emerging Markets',
  'Brazil': 'Emerging Markets', 'Taiwan': 'Emerging Markets',
  'South Africa': 'Emerging Markets', 'Mexico': 'Emerging Markets',
  'Indonesia': 'Emerging Markets', 'Thailand': 'Emerging Markets',
  'Malaysia': 'Emerging Markets', 'Philippines': 'Emerging Markets',
};

export function countryToRegion(country) {
  if (!country) return 'Unclassified';
  return REGION_MAP[country] ?? 'Unclassified';
}

const SUFFIX_REGION = {
  'AX': 'Australia',
  'NZ': 'Australia',
  'NS': 'Emerging Markets', 'BO': 'Emerging Markets',  // India
  'SS': 'Emerging Markets', 'SZ': 'Emerging Markets',  // China A-shares
  'KS': 'Emerging Markets', 'KQ': 'Emerging Markets',  // Korea
  'TW': 'Emerging Markets',                             // Taiwan
  'SA': 'Emerging Markets',                             // Brazil
  'MX': 'Emerging Markets',                             // Mexico
  'L':  'International Developed',                      // London
  'T':  'International Developed',                      // Tokyo
  'HK': 'International Developed',                      // Hong Kong
  'SI': 'International Developed',                      // Singapore
  'AS': 'International Developed',                      // Amsterdam
  'PA': 'International Developed',                      // Paris
  'DE': 'International Developed',                      // Frankfurt (XETRA)
  'F':  'International Developed',                      // Frankfurt
  'SW': 'International Developed',                      // Switzerland
  'ST': 'International Developed',                      // Stockholm
  'CO': 'International Developed',                      // Copenhagen
  'OL': 'International Developed',                      // Oslo
  'HE': 'International Developed',                      // Helsinki
  'BR': 'International Developed',                      // Brussels
  'MC': 'International Developed',                      // Madrid
  'MI': 'International Developed',                      // Milan
  'TO': 'International Developed',                      // Toronto
};

export function regionFromTicker(ticker) {
  if (!ticker) return 'Unclassified';
  const dot = ticker.lastIndexOf('.');
  if (dot === -1) return 'United States';
  const suffix = ticker.slice(dot + 1).toUpperCase();
  return SUFFIX_REGION[suffix] ?? 'Unclassified';
}

export function classifyQuoteType(quoteType) {
  if (quoteType === 'ETF' || quoteType === 'MUTUALFUND') return 'ETF';
  if (quoteType === 'EQUITY') return 'EQUITY';
  if (quoteType === 'CRYPTOCURRENCY') return 'CRYPTO';
  return null;
}

export async function fetchHolding(ticker) {
  const symbol = ticker.trim().toUpperCase();
  const url = `${YAHOO_PROXY_URL.replace(/\/$/, '')}/quoteSummary/${encodeURIComponent(symbol)}`;
  try {
    let res;
    try {
      res = await fetch(url);
    } catch {
      throw new Error("Network error — check your connection.");
    }
    if (!res.ok) throw new Error(explainStatus(res.status, symbol));
    const body = await res.json();
    const result = body?.quoteSummary?.result?.[0];
    if (!result) throw new Error(`No data for "${symbol}".`);

    const rawQuoteType = result.quoteType?.quoteType;
    const name = result.quoteType?.longName ?? result.quoteType?.shortName ?? symbol;
    const classified = classifyQuoteType(rawQuoteType);

    if (classified === null) {
      return {
        ticker: symbol, error: true,
        message: `"${symbol}" is a ${rawQuoteType?.toLowerCase() ?? 'unsupported'} instrument — only equities, ETFs, and cryptocurrencies are supported.`,
      };
    }

    if (classified === 'CRYPTO') {
      return { ticker: symbol, name, quoteType: 'CRYPTO', error: false };
    }

    if (classified === 'ETF') {
      const th = result.topHoldings ?? {};
      const rawHoldings = th.holdings ?? [];
      const rawSectors  = th.sectorWeightings ?? [];
      const rawCountries = th.countryWeightings ?? [];
      const clamp01 = v => Math.max(0, Math.min(1, v));
      const safePct = v => {
        const n = Number(v);
        return Number.isFinite(n) ? clamp01(n) : 0;
      };
      return {
        ticker: symbol, name, quoteType: 'ETF', error: false,
        stockPosition: th.stockPosition?.raw != null ? safePct(th.stockPosition.raw) : null,
        bondPosition:  th.bondPosition?.raw  != null ? safePct(th.bondPosition.raw)  : 0,
        cashPosition:  th.cashPosition?.raw  != null ? safePct(th.cashPosition.raw)  : 0,
        topHoldings: rawHoldings.map(h => ({
          ticker: h.symbol,
          name:   h.holdingName ?? h.symbol,
          weight: safePct(h.holdingPercent?.raw ?? h.holdingPercent ?? 0),
        })),
        sectorWeightings: rawSectors,
        countryWeightings: rawCountries,
      };
    }

    return {
      ticker: symbol, name, quoteType: 'EQUITY', error: false,
      sector:  result.assetProfile?.sector  ?? null,
      industry: result.assetProfile?.industry ?? null,
      country: result.assetProfile?.country  ?? null,
    };
  } catch (err) {
    return { ticker: symbol, error: true, message: err.message };
  }
}

function explainStatus(status, symbol) {
  if (status === 404) return `Ticker "${symbol}" not found. Check the symbol and market suffix (e.g. .AX, .NS, .L).`;
  if (status === 429) return 'Too many requests. Wait a minute and try again.';
  if (status === 403) return 'Data service declined the request. Verify the Worker origin allowlist.';
  if (status === 401) return 'Data provider rejected the request. Try again in a moment.';
  if (status >= 500) return 'Yahoo Finance is temporarily unavailable. Try again in a minute.';
  return `Data service returned HTTP ${status}. Please try again.`;
}
