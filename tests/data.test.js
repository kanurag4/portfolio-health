import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import { countryToRegion, regionFromTicker, SECTOR_LABELS, classifyQuoteType, fetchHolding } from '../www/data.js';

describe('countryToRegion', () => {
  it('maps Australia', () => assert.equal(countryToRegion('Australia'), 'Australia'));
  it('maps New Zealand to Australia', () => assert.equal(countryToRegion('New Zealand'), 'Australia'));
  it('maps United States', () => assert.equal(countryToRegion('United States'), 'United States'));
  it('maps United Kingdom to International Developed', () => assert.equal(countryToRegion('United Kingdom'), 'International Developed'));
  it('maps Japan to International Developed', () => assert.equal(countryToRegion('Japan'), 'International Developed'));
  it('maps China to Emerging Markets', () => assert.equal(countryToRegion('China'), 'Emerging Markets'));
  it('maps India to Emerging Markets', () => assert.equal(countryToRegion('India'), 'Emerging Markets'));
  it('returns Unclassified for unknown', () => assert.equal(countryToRegion('Narnia'), 'Unclassified'));
  it('returns Unclassified for null', () => assert.equal(countryToRegion(null), 'Unclassified'));
});

describe('regionFromTicker', () => {
  it('handles lowercase suffixes',      () => assert.equal(regionFromTicker('cba.ax'),      'Australia'));
  it('.AX → Australia',                () => assert.equal(regionFromTicker('CBA.AX'),      'Australia'));
  it('no suffix → United States',      () => assert.equal(regionFromTicker('AAPL'),         'United States'));
  it('.NS → Emerging Markets (India)', () => assert.equal(regionFromTicker('RELIANCE.NS'),  'Emerging Markets'));
  it('.L → International Developed',  () => assert.equal(regionFromTicker('SHEL.L'),        'International Developed'));
  it('.T → International Developed',  () => assert.equal(regionFromTicker('7203.T'),        'International Developed'));
  it('.HK → International Developed', () => assert.equal(regionFromTicker('0700.HK'),       'International Developed'));
  it('unknown suffix → Unclassified', () => assert.equal(regionFromTicker('XYZ.ZZ'),        'Unclassified'));
  it('null → Unclassified',           () => assert.equal(regionFromTicker(null),             'Unclassified'));
});

describe('SECTOR_LABELS', () => {
  it('maps financial_services', () => assert.equal(SECTOR_LABELS['financial_services'], 'Financials'));
  it('maps realestate', () => assert.equal(SECTOR_LABELS['realestate'], 'Real Estate'));
  it('maps consumer_cyclical', () => assert.equal(SECTOR_LABELS['consumer_cyclical'], 'Consumer Cyclical'));
  it('maps technology', () => assert.equal(SECTOR_LABELS['technology'], 'Technology'));
});

// ── Bug 4: non-ETF/equity quote types fall through to EQUITY silently ─────────
describe('classifyQuoteType', () => {
  it('classifies ETF', ()          => assert.equal(classifyQuoteType('ETF'),          'ETF'));
  it('classifies MUTUALFUND as ETF', () => assert.equal(classifyQuoteType('MUTUALFUND'), 'ETF'));
  it('classifies EQUITY', ()       => assert.equal(classifyQuoteType('EQUITY'),       'EQUITY'));
  it('returns null for INDEX', ()  => assert.equal(classifyQuoteType('INDEX'),         null));
  it('returns null for CURRENCY',  () => assert.equal(classifyQuoteType('CURRENCY'),   null));
  it('classifies CRYPTOCURRENCY as CRYPTO', () => assert.equal(classifyQuoteType('CRYPTOCURRENCY'), 'CRYPTO'));
  it('returns null for OPTION',    () => assert.equal(classifyQuoteType('OPTION'),     null));
  it('returns null for unknown type', () => assert.equal(classifyQuoteType('FUTURE'),  null));
});

describe('fetchHolding — cryptocurrency', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns CRYPTO quoteType for CRYPTOCURRENCY instruments', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        quoteSummary: {
          result: [{ quoteType: { quoteType: 'CRYPTOCURRENCY', longName: 'Bitcoin USD' } }],
        },
      }),
    });
    const result = await fetchHolding('BTC-USD');
    assert.equal(result.error, false);
    assert.equal(result.quoteType, 'CRYPTO');
    assert.equal(result.ticker, 'BTC-USD');
  });
});

describe('fetchHolding — defensive ETF weights', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('normalises malformed ETF top holding weights to safe fractions', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        quoteSummary: {
          result: [{
            quoteType: { quoteType: 'ETF', longName: 'Test ETF' },
            topHoldings: {
              stockPosition: { raw: 1 },
              bondPosition: { raw: 0 },
              cashPosition: { raw: 0 },
              holdings: [
                { symbol: 'AAPL', holdingName: 'Apple', holdingPercent: { raw: 4 } },
                { symbol: 'MSFT', holdingName: 'Microsoft', holdingPercent: { fmt: 'bad' } },
                { symbol: 'CBA.AX', holdingName: 'CBA', holdingPercent: { raw: -0.2 } },
              ],
            },
          }],
        },
      }),
    });

    const result = await fetchHolding('TEST');

    assert.equal(result.topHoldings[0].weight, 1);
    assert.equal(result.topHoldings[1].weight, 0);
    assert.equal(result.topHoldings[2].weight, 0);
  });
});
