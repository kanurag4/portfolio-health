import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { normaliseWeights, analysePortfolio } from '../www/analyse.js';

const DEFAULT_THRESHOLDS = { stock: 10, sector: 30, region: 50 };

describe('normaliseWeights', () => {
  it('normalises $ inputs to %', () => {
    const result = normaliseWeights([
      { ticker: 'A', inputMode: '$', value: 5000 },
      { ticker: 'B', inputMode: '$', value: 5000 },
    ]);
    assert.equal(result.weights['A'], 50);
    assert.equal(result.weights['B'], 50);
    assert.equal(result.normalised, false);
  });

  it('returns % inputs as-is and normalises flag false when sum=100', () => {
    const result = normaliseWeights([
      { ticker: 'A', inputMode: '%', value: 60 },
      { ticker: 'B', inputMode: '%', value: 40 },
    ]);
    assert.equal(result.weights['A'], 60);
    assert.equal(result.normalised, false);
  });

  it('sets normalised=true when % inputs do not sum to 100', () => {
    const result = normaliseWeights([
      { ticker: 'A', inputMode: '%', value: 70 },
      { ticker: 'B', inputMode: '%', value: 10 },
    ]);
    assert.equal(result.normalised, true);
    assert.ok(Math.abs(result.weights['A'] + result.weights['B'] - 100) < 0.01);
  });

  it('mixes $ and % by converting $ to % share of total $, then combining', () => {
    const result = normaliseWeights([
      { ticker: 'A', inputMode: '$', value: 8000 },
      { ticker: 'B', inputMode: '%', value: 20 },
    ]);
    // A is $8000 = sole dollar item, gets 80% of portfolio; B gets its 20%
    assert.ok(Math.abs(result.weights['A'] + result.weights['B'] - 100) < 0.01);
  });
});

describe('analysePortfolio — stock only', () => {
  const holdings = [
    { ticker: 'ASX.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    { ticker: 'BHP.AX', quoteType: 'EQUITY', sector: 'Basic Materials', country: 'Australia', error: false },
    { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    { ticker: 'NAB.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    { ticker: 'WES.AX', quoteType: 'EQUITY', sector: 'Consumer Cyclical', country: 'Australia', error: false },
    { ticker: 'WOW.AX', quoteType: 'EQUITY', sector: 'Consumer Defensive', country: 'Australia', error: false },
    { ticker: 'RIO.AX', quoteType: 'EQUITY', sector: 'Basic Materials', country: 'Australia', error: false },
    { ticker: 'TLS.AX', quoteType: 'EQUITY', sector: 'Communication Services', country: 'Australia', error: false },
    { ticker: 'MQG.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    { ticker: 'CSL.AX', quoteType: 'EQUITY', sector: 'Healthcare', country: 'Australia', error: false },
    { ticker: 'APA.AX', quoteType: 'EQUITY', sector: 'Real Estate', country: 'Australia', error: false },
    { ticker: 'AGX.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    { ticker: 'ALL.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    { ticker: 'STO.AX', quoteType: 'EQUITY', sector: 'Energy', country: 'Australia', error: false },
    { ticker: 'FMG.AX', quoteType: 'EQUITY', sector: 'Basic Materials', country: 'Australia', error: false },
    { ticker: 'IAG.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    { ticker: 'JHX.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    { ticker: 'MPL.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    { ticker: 'ORI.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    { ticker: 'SYD.AX', quoteType: 'EQUITY', sector: 'Real Estate', country: 'Australia', error: false },
    { ticker: 'GMG.AX', quoteType: 'EQUITY', sector: 'Consumer Discretionary', country: 'Australia', error: false },
  ];
  const rawWeights = [
    { ticker: 'ASX.AX', inputMode: '$', value: 1000 },
    { ticker: 'BHP.AX', inputMode: '$', value: 1000 },
    { ticker: 'CBA.AX', inputMode: '$', value: 1000 },
    { ticker: 'NAB.AX', inputMode: '$', value: 1000 },
    { ticker: 'WES.AX', inputMode: '$', value: 1000 },
    { ticker: 'WOW.AX', inputMode: '$', value: 1000 },
    { ticker: 'RIO.AX', inputMode: '$', value: 1000 },
    { ticker: 'TLS.AX', inputMode: '$', value: 1000 },
    { ticker: 'MQG.AX', inputMode: '$', value: 1000 },
    { ticker: 'CSL.AX', inputMode: '$', value: 1000 },
    { ticker: 'APA.AX', inputMode: '$', value: 1000 },
    { ticker: 'AGX.AX', inputMode: '$', value: 1000 },
    { ticker: 'ALL.AX', inputMode: '$', value: 1000 },
    { ticker: 'STO.AX', inputMode: '$', value: 1000 },
    { ticker: 'FMG.AX', inputMode: '$', value: 1000 },
    { ticker: 'IAG.AX', inputMode: '$', value: 1000 },
    { ticker: 'JHX.AX', inputMode: '$', value: 1000 },
    { ticker: 'MPL.AX', inputMode: '$', value: 1000 },
    { ticker: 'ORI.AX', inputMode: '$', value: 1000 },
    { ticker: 'SYD.AX', inputMode: '$', value: 1000 },
    { ticker: 'GMG.AX', inputMode: '$', value: 1000 },
  ];

  it('buckets sector correctly', () => {
    const { sector } = analysePortfolio(holdings, rawWeights, DEFAULT_THRESHOLDS);
    // 21 equal holdings: ~4.76% each, Financials = 10 holdings = ~47.6%
    assert.ok(Math.abs(sector['Financials'] - 47.6) < 1);
    // Basic Materials = 3 holdings = ~14.3%
    assert.ok(Math.abs(sector['Basic Materials'] - 14.3) < 1);
  });

  it('buckets region correctly', () => {
    const { region } = analysePortfolio(holdings, rawWeights, DEFAULT_THRESHOLDS);
    assert.ok(Math.abs(region['Australia'] - 100) < 0.1);
  });

  it('flags red when sector > threshold', () => {
    const { flags } = analysePortfolio(holdings, rawWeights, DEFAULT_THRESHOLDS);
    const financialsFlag = flags.find(f => f.dimension === 'sector' && f.name === 'Financials');
    assert.equal(financialsFlag.status, 'red'); // 40% > 30%
  });

  it('flags green for stock concentration when no holding > 10%', () => {
    const { flags } = analysePortfolio(holdings, rawWeights, DEFAULT_THRESHOLDS);
    const stockFlags = flags.filter(f => f.dimension === 'stock' && f.status === 'green');
    assert.equal(stockFlags.length, 1);
  });
});

describe('analysePortfolio — ETF look-through', () => {
  const holdings = [{
    ticker: 'VAS.AX', quoteType: 'ETF', error: false,
    stockPosition: 1, bondPosition: 0, cashPosition: 0,
    topHoldings: [
      { ticker: 'CBA.AX', name: 'CBA', weight: 0.04 },
      { ticker: 'BHP.AX', name: 'BHP', weight: 0.03 },
    ],
    sectorWeightings: [
      { financial_services: 0.32 },
      { basic_materials: 0.20 },
    ],
    countryWeightings: [],
  }];
  const rawWeights = [{ ticker: 'VAS.AX', inputMode: '%', value: 100 }];

  it('uses sectorWeightings for sector buckets', () => {
    const { sector } = analysePortfolio(holdings, rawWeights, DEFAULT_THRESHOLDS);
    assert.ok(Math.abs(sector['Financials'] - 32) < 0.1);
    assert.ok(Math.abs(sector['Basic Materials'] - 20) < 0.1);
  });

  it('marks region Unclassified when no countryWeightings', () => {
    const { region } = analysePortfolio(holdings, rawWeights, DEFAULT_THRESHOLDS);
    assert.ok(region['Unclassified'] > 0);
  });

  it('registers top-holding concentration correctly', () => {
    const { flags } = analysePortfolio(holdings, rawWeights, DEFAULT_THRESHOLDS);
    // CBA = 4%, BHP = 3% — both < 5% (threshold - 5), so green stock flag
    const greenStock = flags.find(f => f.dimension === 'stock' && f.status === 'green');
    assert.ok(greenStock);
  });
});

describe('analysePortfolio — ETF concentration flags', () => {
  it('flags red when single ETF exceeds etf threshold', () => {
    const holdings = [{
      ticker: 'VAS.AX', quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [], sectorWeightings: [], countryWeightings: [],
    }];
    const rawWeights = [{ ticker: 'VAS.AX', inputMode: '%', value: 100 }];
    const thresholds = { etf: 30, stock: 10, sector: 30, region: 50 };
    const { flags } = analysePortfolio(holdings, rawWeights, thresholds);
    const etfFlag = flags.find(f => f.dimension === 'etf' && f.name === 'VAS.AX');
    assert.ok(etfFlag, 'ETF flag should exist');
    assert.equal(etfFlag.status, 'red'); // 100% > 30%
  });

  it('flags green when all ETF holdings are below amber threshold', () => {
    const mkEtf = ticker => ({
      ticker, quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [], sectorWeightings: [], countryWeightings: [],
    });
    const holdings = [mkEtf('VAS.AX'), mkEtf('VGS.AX'), mkEtf('VAF.AX'), mkEtf('VGE.AX'), mkEtf('VDHG.AX')];
    const rawWeights = [
      { ticker: 'VAS.AX',  inputMode: '%', value: 20 },
      { ticker: 'VGS.AX',  inputMode: '%', value: 20 },
      { ticker: 'VAF.AX',  inputMode: '%', value: 20 },
      { ticker: 'VGE.AX',  inputMode: '%', value: 20 },
      { ticker: 'VDHG.AX', inputMode: '%', value: 20 },
    ];
    const thresholds = { etf: 30, stock: 10, sector: 30, region: 50 };
    const { flags } = analysePortfolio(holdings, rawWeights, thresholds);
    const greenEtf = flags.find(f => f.dimension === 'etf' && f.status === 'green');
    assert.ok(greenEtf);
  });
});

describe('analysePortfolio — via field in stock flags', () => {
  it('populates via with source ETF ticker when stock breaches threshold', () => {
    const holdings = [{
      ticker: 'VAS.AX', quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [
        { ticker: 'CBA.AX', name: 'CBA', weight: 0.15 }, // 15% of 100% ETF = 15% > 10% threshold
      ],
      sectorWeightings: [],
      countryWeightings: [],
    }];
    const rawWeights = [{ ticker: 'VAS.AX', inputMode: '%', value: 100 }];
    const { flags } = analysePortfolio(holdings, rawWeights, DEFAULT_THRESHOLDS);
    const cbaFlag = flags.find(f => f.dimension === 'stock' && f.name === 'CBA.AX');
    assert.ok(cbaFlag, 'CBA.AX flag should exist');
    assert.equal(cbaFlag.status, 'red');
    assert.equal(cbaFlag.via, 'VAS.AX');
  });

  it('via is null for direct stock holdings', () => {
    const holdings = [
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    ];
    const rawWeights = [{ ticker: 'CBA.AX', inputMode: '%', value: 100 }];
    const { flags } = analysePortfolio(holdings, rawWeights, DEFAULT_THRESHOLDS);
    const cbaFlag = flags.find(f => f.dimension === 'stock' && f.name === 'CBA.AX');
    assert.ok(cbaFlag, 'CBA.AX flag should exist');
    assert.equal(cbaFlag.via, null);
  });
});

describe('analysePortfolio — unresolved tickers', () => {
  it('collects error tickers in unresolved array', () => {
    const { unresolved } = analysePortfolio(
      [{ ticker: 'XYZ', error: true }],
      [{ ticker: 'XYZ', inputMode: '%', value: 100 }],
      DEFAULT_THRESHOLDS,
    );
    assert.deepEqual(unresolved, ['XYZ']);
  });
});

describe('analysePortfolio — region fallback from top holdings tickers', () => {
  it('infers region from .AX tickers when countryWeightings is empty', () => {
    const holdings = [{
      ticker: 'VAS.AX', quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [
        { ticker: 'CBA.AX', name: 'CBA', weight: 0.09 },
        { ticker: 'BHP.AX', name: 'BHP', weight: 0.07 },
      ],
      sectorWeightings: [],
      countryWeightings: [],
    }];
    const rawWeights = [{ ticker: 'VAS.AX', inputMode: '%', value: 100 }];
    const { region } = analysePortfolio(holdings, rawWeights, DEFAULT_THRESHOLDS);
    assert.ok(Math.abs(region['Australia'] - 16) < 0.1);     // 9 + 7 = 16% top holdings
    assert.ok(Math.abs(region['Unclassified'] - 84) < 0.1);  // remaining 84% uncovered
  });

  it('infers mixed regions from global ETF top holdings', () => {
    const holdings = [{
      ticker: 'VGS.AX', quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [
        { ticker: 'AAPL',    name: 'Apple',    weight: 0.05 },
        { ticker: 'MSFT',    name: 'Microsoft', weight: 0.04 },
        { ticker: 'SHEL.L',  name: 'Shell',    weight: 0.02 },
      ],
      sectorWeightings: [],
      countryWeightings: [],
    }];
    const rawWeights = [{ ticker: 'VGS.AX', inputMode: '%', value: 100 }];
    const { region } = analysePortfolio(holdings, rawWeights, DEFAULT_THRESHOLDS);
    assert.ok(Math.abs(region['United States'] - 9) < 0.1);            // AAPL 5 + MSFT 4
    assert.ok(Math.abs(region['International Developed'] - 2) < 0.1);  // SHEL.L 2
  });
});

describe('analysePortfolio — Yahoo {raw,fmt} countryWeightings', () => {
  it('extracts .raw from object-format countryWeightings', () => {
    const holdings = [{
      ticker: 'VGS.AX', quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [],
      sectorWeightings: [],
      countryWeightings: [
        { 'United States': { raw: 0.65, fmt: '65.00%' } },
        { 'Japan': { raw: 0.07, fmt: '7.00%' } },
      ],
    }];
    const rawWeights = [{ ticker: 'VGS.AX', inputMode: '%', value: 100 }];
    const { region } = analysePortfolio(holdings, rawWeights, DEFAULT_THRESHOLDS);
    assert.ok(Math.abs(region['United States'] - 65) < 0.1);
    assert.ok(Math.abs(region['International Developed'] - 7) < 0.1);
  });
});
