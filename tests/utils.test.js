import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parseMoney, fmt, formatCurrency, clampThreshold } from '../www/utils.js';

describe('parseMoney', () => {
  it('strips commas and parses number', () => assert.equal(parseMoney('1,234.56'), 1234.56));
  it('parses plain number string', () => assert.equal(parseMoney('500'), 500));
  it('returns NaN for empty string', () => assert.ok(isNaN(parseMoney(''))));
  it('returns NaN for non-numeric', () => assert.ok(isNaN(parseMoney('abc'))));
});

describe('fmt', () => {
  it('formats with 1 decimal and % suffix', () => assert.equal(fmt(12.345), '12.3%'));
  it('returns em-dash for null', () => assert.equal(fmt(null), '—'));
  it('returns em-dash for NaN', () => assert.equal(fmt(NaN), '—'));
  it('respects custom decimals and suffix', () => assert.equal(fmt(5, 0, 'x'), '5x'));
});

describe('formatCurrency', () => {
  it('formats with dollar sign and commas', () => assert.equal(formatCurrency(10000), '$10,000'));
  it('returns em-dash for null', () => assert.equal(formatCurrency(null), '—'));
});

// ── Bug 3: threshold values above 100 accepted without clamping ───────────────
describe('clampThreshold', () => {
  it('accepts values within 1..100 unchanged', () => assert.equal(clampThreshold(30), 30));
  it('accepts boundary value 1', ()   => assert.equal(clampThreshold(1), 1));
  it('accepts boundary value 100', () => assert.equal(clampThreshold(100), 100));
  it('clamps values above 100 to 100', () => assert.equal(clampThreshold(150), 100));
  it('clamps value of 0 to 1',  () => assert.equal(clampThreshold(0), 1));
  it('clamps negative values to 1', () => assert.equal(clampThreshold(-5), 1));
});
