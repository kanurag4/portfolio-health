import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { countryToRegion, regionFromTicker, SECTOR_LABELS, classifyQuoteType } from '../www/data.js';

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
  it('returns null for CRYPTOCURRENCY', () => assert.equal(classifyQuoteType('CRYPTOCURRENCY'), null));
  it('returns null for OPTION',    () => assert.equal(classifyQuoteType('OPTION'),     null));
  it('returns null for unknown type', () => assert.equal(classifyQuoteType('FUTURE'),  null));
});
