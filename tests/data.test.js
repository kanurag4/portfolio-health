import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { countryToRegion, SECTOR_LABELS } from '../www/data.js';

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

describe('SECTOR_LABELS', () => {
  it('maps financial_services', () => assert.equal(SECTOR_LABELS['financial_services'], 'Financials'));
  it('maps realestate', () => assert.equal(SECTOR_LABELS['realestate'], 'Real Estate'));
  it('maps consumer_cyclical', () => assert.equal(SECTOR_LABELS['consumer_cyclical'], 'Consumer Cyclical'));
  it('maps technology', () => assert.equal(SECTOR_LABELS['technology'], 'Technology'));
});
