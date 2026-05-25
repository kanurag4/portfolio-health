import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { normaliseWeights, analysePortfolio, scorePortfolio, detectOverlap } from '../www/analyse.js';
import { clampThreshold } from '../www/utils.js';

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

describe('normaliseWeights — same-ticker accumulation', () => {
  it('accumulates weight when same ticker appears in both $ and % modes', () => {
    // A appears as both $8000 (sole $ item → gets 80% of dollar slice)
    // and as 20% (sole % item → gets all of percent slice = 20%)
    const result = normaliseWeights([
      { ticker: 'A', inputMode: '$', value: 8000 },
      { ticker: 'A', inputMode: '%', value: 20 },
    ]);
    // percentSlice = 20, dollarSlice = 80 → A should total 100
    assert.ok(Math.abs(result.weights['A'] - 100) < 0.01,
      `Expected A ≈ 100, got ${result.weights['A']}`);
    assert.equal(result.normalised, false);
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
    // 'Consumer Discretionary' is intentional — direct stock sectors pass through as-is (no SECTOR_LABELS mapping needed)
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
    // CBA = 4%, BHP = 3% — both < 8% (threshold - 2 = 10-2), so green stock flag
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

  it('keeps unresolved holding weight visible in analysis buckets', () => {
    const holdings = [
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
      { ticker: 'BAD', error: true },
    ];
    const rawWeights = [
      { ticker: 'CBA.AX', inputMode: '%', value: 20 },
      { ticker: 'BAD', inputMode: '%', value: 80 },
    ];
    const result = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });

    assert.equal(result.assetClass['Unresolved'], 80);
    assert.equal(result.sector['Unresolved'], 80);
    assert.equal(result.region['Unresolved'], 80);
  });
});

describe('analysePortfolio — defensive ETF data handling', () => {
  it('treats missing sectorWeightings as diversified ETF exposure', () => {
    const holdings = [{
      ticker: 'VAS.AX', quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [], countryWeightings: [],
    }];
    const rawWeights = [{ ticker: 'VAS.AX', inputMode: '%', value: 100 }];
    const result = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });

    assert.equal(result.sector['Diversified (ETF)'], 100);
  });

  it('ignores malformed ETF top holding weights rather than producing NaN buckets', () => {
    const holdings = [{
      ticker: 'VAS.AX', quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [
        { ticker: 'CBA.AX', name: 'CBA', weight: NaN },
        { ticker: 'BHP.AX', name: 'BHP', weight: -0.2 },
      ],
      sectorWeightings: [], countryWeightings: [],
    }];
    const rawWeights = [{ ticker: 'VAS.AX', inputMode: '%', value: 100 }];
    const result = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });

    assert.equal(result.region['Unclassified'], 100);
    assert.ok(!result.flags.some(f => Number.isNaN(f.value)));
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

// ── Bug 1: sector bucket split between ETF and direct-stock holdings ──────────
describe('analysePortfolio — sector normalisation for equity holdings', () => {
  it('merges Yahoo "Financial Services" equity sector with ETF financial_services into one Financials bucket', () => {
    const holdings = [
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financial Services', country: 'Australia', error: false },
      {
        ticker: 'VAS.AX', quoteType: 'ETF', error: false,
        stockPosition: 1, bondPosition: 0, cashPosition: 0,
        topHoldings: [],
        sectorWeightings: [{ financial_services: 0.25 }],
        countryWeightings: [],
      },
    ];
    // CBA = 20%: "Financial Services" must map to "Financials"
    // VAS = 80%: financial_services 0.25 → 20% "Financials"
    // Combined = 40%
    const rawWeights = [
      { ticker: 'CBA.AX', inputMode: '%', value: 20 },
      { ticker: 'VAS.AX', inputMode: '%', value: 80 },
    ];
    const { sector } = analysePortfolio(holdings, rawWeights, { stock: 10, sector: 30, region: 50 });
    assert.ok(Math.abs(sector['Financials'] - 40) < 0.1, `Expected ~40, got ${sector['Financials']}`);
    assert.equal(sector['Financial Services'], undefined, '"Financial Services" bucket must not exist separately');
  });

  it('flags financials as red when combined equity+ETF exposure breaches threshold', () => {
    const holdings = [
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financial Services', country: 'Australia', error: false },
      {
        ticker: 'VAS.AX', quoteType: 'ETF', error: false,
        stockPosition: 1, bondPosition: 0, cashPosition: 0,
        topHoldings: [],
        sectorWeightings: [{ financial_services: 0.25 }],
        countryWeightings: [],
      },
    ];
    const rawWeights = [
      { ticker: 'CBA.AX', inputMode: '%', value: 20 },
      { ticker: 'VAS.AX', inputMode: '%', value: 80 },
    ];
    const { flags } = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    const finFlag = flags.find(f => f.dimension === 'sector' && f.name === 'Financials');
    assert.ok(finFlag, 'Financials sector flag should exist');
    assert.equal(finFlag.status, 'red'); // 40% > 30% threshold
  });
});

// ── Bug 2: over-100% percent inputs silently rescaled without normalised flag ─
describe('normaliseWeights — over-100% percent inputs', () => {
  it('sets normalised=true when percent inputs sum to 140', () => {
    const result = normaliseWeights([
      { ticker: 'A', inputMode: '%', value: 80 },
      { ticker: 'B', inputMode: '%', value: 60 },
    ]);
    assert.equal(result.normalised, true);
  });

  it('sets normalised=true when percent inputs over 100 are mixed with dollar inputs', () => {
    const result = normaliseWeights([
      { ticker: 'A', inputMode: '%', value: 80 },
      { ticker: 'B', inputMode: '%', value: 60 },
      { ticker: 'C', inputMode: '$', value: 1000 },
    ]);
    assert.equal(result.normalised, true);
  });
});

// ── Bug 5: green ETF flag emitted even when portfolio has no ETFs ─────────────
describe('analysePortfolio — ETF flags suppressed for stock-only portfolio', () => {
  it('emits no ETF dimension flag when portfolio has no ETFs', () => {
    const holdings = [
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    ];
    const rawWeights = [{ ticker: 'CBA.AX', inputMode: '%', value: 100 }];
    const { flags } = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    const etfFlags = flags.filter(f => f.dimension === 'etf');
    assert.equal(etfFlags.length, 0, 'No ETF flags should exist for a stock-only portfolio');
  });

  it('still emits green ETF flag when ETFs are present and all below threshold', () => {
    const mkEtf = ticker => ({
      ticker, quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [], sectorWeightings: [], countryWeightings: [],
    });
    // Four ETFs at 25% each — all below etf threshold of 30%
    const holdings = [mkEtf('VAS.AX'), mkEtf('VGS.AX'), mkEtf('VAF.AX'), mkEtf('VGE.AX')];
    const rawWeights = [
      { ticker: 'VAS.AX', inputMode: '%', value: 25 },
      { ticker: 'VGS.AX', inputMode: '%', value: 25 },
      { ticker: 'VAF.AX', inputMode: '%', value: 25 },
      { ticker: 'VGE.AX', inputMode: '%', value: 25 },
    ];
    const { flags } = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    const greenEtf = flags.find(f => f.dimension === 'etf' && f.status === 'green');
    assert.ok(greenEtf, 'Green ETF flag should exist when ETFs are present and all below threshold');
  });
});

// ── Minor #2: green stock flag count inflated by (rest) pseudo-entries ─────────
describe('analysePortfolio — green stock flag count excludes (rest) entries', () => {
  it('counts only real stock tickers, not (rest) pseudo-entries, in green stock flag', () => {
    const holdings = [{
      ticker: 'VAS.AX', quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [
        { ticker: 'CBA.AX', name: 'CBA', weight: 0.05 },
        { ticker: 'BHP.AX', name: 'BHP', weight: 0.04 },
        // covered = 0.09; rest = 0.91 → "VAS.AX (rest)" added to stockConc
      ],
      sectorWeightings: [],
      countryWeightings: [],
    }];
    const rawWeights = [{ ticker: 'VAS.AX', inputMode: '%', value: 100 }];
    const { flags } = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    const greenStock = flags.find(f => f.dimension === 'stock' && f.status === 'green');
    assert.ok(greenStock, 'Green stock flag should exist when no stock breaches threshold');
    // stockConc has CBA.AX, BHP.AX, and "VAS.AX (rest)" — only 2 are real tickers
    assert.equal(greenStock.count, 2, `count should be 2 real tickers, got ${greenStock.count}`);
  });
});

// ── Minor #5: integration test — out-of-range threshold masked by clamping ────
describe('analysePortfolio — threshold clamping integration', () => {
  it('threshold 999 masks 100% single-ETF concentration as green (demonstrates why clamping is required)', () => {
    const holdings = [{
      ticker: 'VAS.AX', quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [], sectorWeightings: [], countryWeightings: [],
    }];
    const rawWeights = [{ ticker: 'VAS.AX', inputMode: '%', value: 100 }];
    const { flags } = analysePortfolio(holdings, rawWeights, { etf: 999, stock: 10, sector: 30, region: 50 });
    const greenEtf = flags.find(f => f.dimension === 'etf' && f.status === 'green');
    assert.ok(greenEtf, 'Unclamped threshold of 999 masks 100% ETF as green — loadState must clamp before use');
  });

  it('clamping threshold 999 to 100 via clampThreshold correctly flags 100% single ETF as red', () => {
    const holdings = [{
      ticker: 'VAS.AX', quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [], sectorWeightings: [], countryWeightings: [],
    }];
    const rawWeights = [{ ticker: 'VAS.AX', inputMode: '%', value: 100 }];
    const { flags } = analysePortfolio(holdings, rawWeights, { etf: clampThreshold(999), stock: 10, sector: 30, region: 50 });
    const vasFlag = flags.find(f => f.dimension === 'etf' && f.name === 'VAS.AX');
    assert.ok(vasFlag, 'VAS.AX ETF flag should exist');
    assert.equal(vasFlag.status, 'red', 'After clamping to 100, 100% ETF must be red');
  });
});

// ── scorePortfolio ────────────────────────────────────────────────────────────
describe('scorePortfolio', () => {
  it('returns 100 when all four dimensions have only green flags', () => {
    const flags = [
      { dimension: 'stock',  status: 'green', name: 'all', value: null, threshold: 10, count: 5 },
      { dimension: 'sector', status: 'green', name: 'all', value: null, threshold: 30, count: 4 },
      { dimension: 'region', status: 'green', name: 'all', value: null, threshold: 50, count: 3 },
      { dimension: 'etf',    status: 'green', name: 'all', value: null, threshold: 30, count: 2 },
    ];
    const score = scorePortfolio(flags);
    assert.equal(score.total,  100);
    assert.equal(score.stock,   25);
    assert.equal(score.sector,  25);
    assert.equal(score.region,  25);
    assert.equal(score.etf,     25);
  });

  it('returns 100 when flags array is empty (no holdings)', () => {
    const score = scorePortfolio([]);
    assert.equal(score.total, 100);
    assert.equal(score.stock,  25);
    assert.equal(score.sector, 25);
    assert.equal(score.region, 25);
    assert.equal(score.etf,    25);
  });

  it('deducts 10 per red flag from the relevant dimension', () => {
    const flags = [
      { dimension: 'sector', status: 'red',   name: 'Financials', value: 45, threshold: 30 },
      { dimension: 'stock',  status: 'green',  name: 'all',        value: null, threshold: 10, count: 3 },
      { dimension: 'region', status: 'green',  name: 'all',        value: null, threshold: 50, count: 2 },
    ];
    const score = scorePortfolio(flags);
    assert.equal(score.sector, 15);
    assert.equal(score.stock,  25);
    assert.equal(score.region, 25);
    assert.equal(score.etf,    25);
    assert.equal(score.total,  90);
  });

  it('deducts 5 per amber flag from the relevant dimension', () => {
    const flags = [
      { dimension: 'region', status: 'amber', name: 'Australia', value: 49, threshold: 50 },
      { dimension: 'stock',  status: 'green', name: 'all', value: null, threshold: 10, count: 4 },
      { dimension: 'sector', status: 'green', name: 'all', value: null, threshold: 30, count: 3 },
    ];
    const score = scorePortfolio(flags);
    assert.equal(score.region, 20);
    assert.equal(score.total,  95);
  });

  it('clamps a dimension score to 0 when deductions exceed 25', () => {
    const flags = [
      { dimension: 'sector', status: 'red', name: 'Financials', value: 45, threshold: 30 },
      { dimension: 'sector', status: 'red', name: 'Technology',  value: 35, threshold: 30 },
      { dimension: 'sector', status: 'red', name: 'Energy',      value: 31, threshold: 30 },
      { dimension: 'stock',  status: 'green', name: 'all', value: null, threshold: 10, count: 3 },
      { dimension: 'region', status: 'green', name: 'all', value: null, threshold: 50, count: 2 },
    ];
    const score = scorePortfolio(flags);
    assert.equal(score.sector, 0);
    assert.equal(score.total,  75);
  });

  it('handles mixed red and amber on same dimension', () => {
    const flags = [
      { dimension: 'etf', status: 'red',   name: 'VAS.AX', value: 55, threshold: 30 },
      { dimension: 'etf', status: 'amber', name: 'VGS.AX', value: 29, threshold: 30 },
      { dimension: 'stock',  status: 'green', name: 'all', value: null, threshold: 10, count: 2 },
      { dimension: 'sector', status: 'green', name: 'all', value: null, threshold: 30, count: 3 },
      { dimension: 'region', status: 'green', name: 'all', value: null, threshold: 50, count: 2 },
    ];
    const score = scorePortfolio(flags);
    assert.equal(score.etf,   10);
    assert.equal(score.total, 85);
  });

  it('stock-only portfolio has etf=25 (neutral) and scores stock dimension correctly', () => {
    const holdings = [
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
      { ticker: 'BHP.AX', quoteType: 'EQUITY', sector: 'Basic Materials', country: 'Australia', error: false },
      { ticker: 'WES.AX', quoteType: 'EQUITY', sector: 'Consumer Cyclical', country: 'Australia', error: false },
    ];
    const rawWeights = holdings.map(h => ({ ticker: h.ticker, inputMode: '$', value: 1000 }));
    const { flags } = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    const score = scorePortfolio(flags);
    assert.ok(score.total >= 0 && score.total <= 100, `total out of range: ${score.total}`);
    assert.equal(score.etf, 25, 'no ETFs → etf dimension is neutral 25');
  });
});

// ── sectorContributions ───────────────────────────────────────────────────────
describe('analysePortfolio — sectorContributions', () => {
  it('tracks direct equity contribution to a sector bucket', () => {
    const holdings = [
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    ];
    const rawWeights = [{ ticker: 'CBA.AX', inputMode: '%', value: 100 }];
    const { sectorContributions } = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    assert.ok(sectorContributions['Financials'], 'Financials bucket should exist');
    assert.equal(sectorContributions['Financials'].length, 1);
    assert.equal(sectorContributions['Financials'][0].ticker, 'CBA.AX');
    assert.ok(Math.abs(sectorContributions['Financials'][0].contribution - 100) < 0.01);
    assert.equal(sectorContributions['Financials'][0].type, 'direct');
  });

  it('tracks ETF contribution to sector buckets', () => {
    const holdings = [{
      ticker: 'VAS.AX', quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [],
      sectorWeightings: [{ financial_services: 0.32 }, { basic_materials: 0.20 }],
      countryWeightings: [],
    }];
    const rawWeights = [{ ticker: 'VAS.AX', inputMode: '%', value: 100 }];
    const { sectorContributions } = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    assert.ok(sectorContributions['Financials'], 'Financials should be present');
    assert.equal(sectorContributions['Financials'][0].ticker, 'VAS.AX');
    assert.ok(Math.abs(sectorContributions['Financials'][0].contribution - 32) < 0.1);
    assert.equal(sectorContributions['Financials'][0].type, 'etf');
    assert.ok(sectorContributions['Basic Materials']);
    assert.ok(Math.abs(sectorContributions['Basic Materials'][0].contribution - 20) < 0.1);
  });

  it('combines ETF and direct contributions in same sector bucket', () => {
    const holdings = [
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financial Services', country: 'Australia', error: false },
      {
        ticker: 'VAS.AX', quoteType: 'ETF', error: false,
        stockPosition: 1, bondPosition: 0, cashPosition: 0,
        topHoldings: [],
        sectorWeightings: [{ financial_services: 0.25 }],
        countryWeightings: [],
      },
    ];
    const rawWeights = [
      { ticker: 'CBA.AX', inputMode: '%', value: 20 },
      { ticker: 'VAS.AX', inputMode: '%', value: 80 },
    ];
    const { sectorContributions } = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    const finEntries = sectorContributions['Financials'];
    assert.ok(finEntries, 'Financials bucket must exist');
    assert.equal(finEntries.length, 2, 'two contributors: CBA.AX direct + VAS.AX etf');
    const cbaEntry = finEntries.find(e => e.ticker === 'CBA.AX');
    const vasEntry = finEntries.find(e => e.ticker === 'VAS.AX');
    assert.ok(cbaEntry, 'CBA.AX should be in Financials contributions');
    assert.equal(cbaEntry.type, 'direct');
    assert.ok(vasEntry, 'VAS.AX should be in Financials contributions');
    assert.equal(vasEntry.type, 'etf');
    assert.ok(Math.abs(cbaEntry.contribution - 20) < 0.1, `CBA contribution ${cbaEntry.contribution}`);
    assert.ok(Math.abs(vasEntry.contribution - 20) < 0.1, `VAS contribution ${vasEntry.contribution}`);
  });

  it('assigns Diversified (ETF) bucket for ETF with no sectorWeightings', () => {
    const holdings = [{
      ticker: 'VDHG.AX', quoteType: 'ETF', error: false,
      stockPosition: 1, bondPosition: 0, cashPosition: 0,
      topHoldings: [],
      sectorWeightings: [],
      countryWeightings: [],
    }];
    const rawWeights = [{ ticker: 'VDHG.AX', inputMode: '%', value: 100 }];
    const { sectorContributions } = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    assert.ok(sectorContributions['Diversified (ETF)']);
    assert.equal(sectorContributions['Diversified (ETF)'][0].ticker, 'VDHG.AX');
    assert.equal(sectorContributions['Diversified (ETF)'][0].type, 'etf');
  });

  it('contribution sums match bucket totals', () => {
    const holdings = [
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
      { ticker: 'BHP.AX', quoteType: 'EQUITY', sector: 'Basic Materials', country: 'Australia', error: false },
    ];
    const rawWeights = [
      { ticker: 'CBA.AX', inputMode: '$', value: 5000 },
      { ticker: 'BHP.AX', inputMode: '$', value: 5000 },
    ];
    const result = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    assert.ok(Math.abs(result.sector['Financials']    - 50) < 0.1);
    assert.ok(Math.abs(result.sector['Basic Materials'] - 50) < 0.1);
    const sectorFinSum = result.sectorContributions['Financials']
      .reduce((s, e) => s + e.contribution, 0);
    assert.ok(Math.abs(sectorFinSum - 50) < 0.1, `Financials contribution sum ${sectorFinSum}`);
  });
});

// ── regionContributions ───────────────────────────────────────────────────────
describe('analysePortfolio — regionContributions', () => {
  it('tracks direct equity contribution to a region bucket', () => {
    const holdings = [
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    ];
    const rawWeights = [{ ticker: 'CBA.AX', inputMode: '%', value: 100 }];
    const { regionContributions } = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    assert.ok(regionContributions['Australia']);
    assert.equal(regionContributions['Australia'][0].ticker, 'CBA.AX');
    assert.ok(Math.abs(regionContributions['Australia'][0].contribution - 100) < 0.01);
    assert.equal(regionContributions['Australia'][0].type, 'direct');
  });

  it('tracks ETF countryWeightings contribution to region buckets', () => {
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
    const { regionContributions } = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    assert.ok(regionContributions['United States']);
    assert.equal(regionContributions['United States'][0].ticker, 'VGS.AX');
    assert.ok(Math.abs(regionContributions['United States'][0].contribution - 65) < 0.1);
    assert.equal(regionContributions['United States'][0].type, 'etf');
    assert.ok(regionContributions['International Developed']);
    assert.ok(Math.abs(regionContributions['International Developed'][0].contribution - 7) < 0.1);
  });

  it('region contribution sums match bucket totals', () => {
    const holdings = [
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
      { ticker: 'BHP.AX', quoteType: 'EQUITY', sector: 'Basic Materials', country: 'Australia', error: false },
    ];
    const rawWeights = [
      { ticker: 'CBA.AX', inputMode: '$', value: 5000 },
      { ticker: 'BHP.AX', inputMode: '$', value: 5000 },
    ];
    const result = analysePortfolio(holdings, rawWeights, { etf: 30, stock: 10, sector: 30, region: 50 });
    assert.ok(Math.abs(result.region['Australia'] - 100) < 0.1);
    const regionAuSum = result.regionContributions['Australia']
      .reduce((s, e) => s + e.contribution, 0);
    assert.ok(Math.abs(regionAuSum - 100) < 0.1, `Australia contribution sum ${regionAuSum}`);
  });
});

// ── detectOverlap ─────────────────────────────────────────────────────────────
describe('detectOverlap', () => {
  it('returns empty array when there are no ETFs', () => {
    const holdings = [
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
    ];
    const rawWeights = [{ ticker: 'CBA.AX', inputMode: '%', value: 100 }];
    assert.deepEqual(detectOverlap(holdings, normaliseWeights(rawWeights)), []);
  });

  it('returns empty array when only one ETF', () => {
    const holdings = [{
      ticker: 'VAS.AX', quoteType: 'ETF', error: false,
      topHoldings: [{ ticker: 'CBA.AX', name: 'CBA', weight: 0.08 }],
    }];
    const rawWeights = [{ ticker: 'VAS.AX', inputMode: '%', value: 100 }];
    assert.deepEqual(detectOverlap(holdings, normaliseWeights(rawWeights)), []);
  });

  it('returns empty array when two ETFs share no top-10 holdings', () => {
    const holdings = [
      {
        ticker: 'VAS.AX', quoteType: 'ETF', error: false,
        topHoldings: [{ ticker: 'CBA.AX', name: 'CBA', weight: 0.08 }],
      },
      {
        ticker: 'VGS.AX', quoteType: 'ETF', error: false,
        topHoldings: [{ ticker: 'AAPL', name: 'Apple', weight: 0.06 }],
      },
    ];
    const rawWeights = [
      { ticker: 'VAS.AX', inputMode: '%', value: 50 },
      { ticker: 'VGS.AX', inputMode: '%', value: 50 },
    ];
    assert.deepEqual(detectOverlap(holdings, normaliseWeights(rawWeights)), []);
  });

  it('detects overlap between two ETFs sharing one ticker', () => {
    const holdings = [
      {
        ticker: 'VAS.AX', quoteType: 'ETF', error: false,
        topHoldings: [
          { ticker: 'CBA.AX', name: 'CBA', weight: 0.08 },
          { ticker: 'BHP.AX', name: 'BHP', weight: 0.05 },
        ],
      },
      {
        ticker: 'VDHG.AX', quoteType: 'ETF', error: false,
        topHoldings: [
          { ticker: 'CBA.AX', name: 'CBA', weight: 0.04 },
          { ticker: 'AAPL',   name: 'Apple', weight: 0.06 },
        ],
      },
    ];
    const rawWeights = [
      { ticker: 'VAS.AX',  inputMode: '%', value: 60 },
      { ticker: 'VDHG.AX', inputMode: '%', value: 40 },
    ];
    const result = detectOverlap(holdings, normaliseWeights(rawWeights));
    assert.equal(result.length, 1, 'one overlapping pair');
    const pair = result[0];
    const tickers = [pair.etfA, pair.etfB].sort();
    assert.deepEqual(tickers, ['VAS.AX', 'VDHG.AX']);
    assert.equal(pair.shared.length, 1);
    assert.equal(pair.shared[0].ticker, 'CBA.AX');
    if (pair.etfA === 'VAS.AX') {
      assert.ok(Math.abs(pair.shared[0].weightInA - 8) < 0.01);
      assert.ok(Math.abs(pair.shared[0].weightInB - 4) < 0.01);
    } else {
      assert.ok(Math.abs(pair.shared[0].weightInA - 4) < 0.01);
      assert.ok(Math.abs(pair.shared[0].weightInB - 8) < 0.01);
    }
    assert.ok(Math.abs(pair.weightA + pair.weightB - 100) < 0.1);
  });

  it('sorts shared holdings by max(weightInA, weightInB) descending', () => {
    const holdings = [
      {
        ticker: 'VAS.AX', quoteType: 'ETF', error: false,
        topHoldings: [
          { ticker: 'CBA.AX', name: 'CBA', weight: 0.08 },
          { ticker: 'BHP.AX', name: 'BHP', weight: 0.03 },
        ],
      },
      {
        ticker: 'VDHG.AX', quoteType: 'ETF', error: false,
        topHoldings: [
          { ticker: 'CBA.AX', name: 'CBA', weight: 0.04 },
          { ticker: 'BHP.AX', name: 'BHP', weight: 0.09 },
        ],
      },
    ];
    const rawWeights = [
      { ticker: 'VAS.AX',  inputMode: '%', value: 50 },
      { ticker: 'VDHG.AX', inputMode: '%', value: 50 },
    ];
    const result = detectOverlap(holdings, normaliseWeights(rawWeights));
    assert.equal(result.length, 1);
    const { shared } = result[0];
    assert.equal(shared.length, 2);
    // BHP: max(3,9)=9; CBA: max(8,4)=8 → BHP first
    assert.equal(shared[0].ticker, 'BHP.AX', `Expected BHP.AX first, got ${shared[0].ticker}`);
    assert.equal(shared[1].ticker, 'CBA.AX');
  });

  it('skips ETFs with empty topHoldings', () => {
    const holdings = [
      { ticker: 'VAS.AX', quoteType: 'ETF', error: false, topHoldings: [] },
      { ticker: 'VGS.AX', quoteType: 'ETF', error: false, topHoldings: [{ ticker: 'AAPL', name: 'Apple', weight: 0.06 }] },
    ];
    const rawWeights = [
      { ticker: 'VAS.AX', inputMode: '%', value: 50 },
      { ticker: 'VGS.AX', inputMode: '%', value: 50 },
    ];
    assert.deepEqual(detectOverlap(holdings, normaliseWeights(rawWeights)), []);
  });

  it('ignores non-ETF and error holdings', () => {
    const holdings = [
      { ticker: 'VAS.AX', quoteType: 'ETF', error: false, topHoldings: [{ ticker: 'CBA.AX', name: 'CBA', weight: 0.08 }] },
      { ticker: 'CBA.AX', quoteType: 'EQUITY', sector: 'Financials', country: 'Australia', error: false },
      { ticker: 'XYZ', error: true },
    ];
    const rawWeights = [
      { ticker: 'VAS.AX', inputMode: '%', value: 50 },
      { ticker: 'CBA.AX', inputMode: '%', value: 40 },
      { ticker: 'XYZ',    inputMode: '%', value: 10 },
    ];
    assert.deepEqual(detectOverlap(holdings, normaliseWeights(rawWeights)), []);
  });
});
