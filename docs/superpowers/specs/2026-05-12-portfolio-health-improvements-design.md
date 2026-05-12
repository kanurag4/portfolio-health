# Portfolio Health — Four Improvements Design

**Date:** 2026-05-12  
**Status:** Approved

---

## Overview

Four independent improvements to the Portfolio Health tool:

1. Limit decimal input to 2 places
2. Allow duplicate tickers (merge before analysis)
3. Add a holdings waterfall chart
4. Narrow amber warning window from 5% to 2%

---

## Change 1 — Decimal inputs capped at 2dp

**Problem:** The amount input handler validates against `/^\d*\.?\d*$/`, which allows unlimited decimal places. The display formatter already caps at 2dp, so `33.333` displays as `33.33` but stores `33.333` — a silent inconsistency.

**Fix:** Change the validation regex to `/^\d*\.?\d{0,2}$/`. Any keypress that would produce more than 2 decimal places is ignored at the input stage. The stored value always matches what the user sees.

**Files changed:** `www/app.js` — one line in the `amount` input handler inside `buildRow()`.

---

## Change 2 — Allow duplicate tickers, merge before analysis

**Problem:** The analyse handler currently alerts and aborts if any ticker appears more than once. Users with the same holding across multiple accounts can't enter them separately and have them totalled.

**Approach:** Merge by ticker+mode before analysis (option A).

### Merging logic

A `mergeHoldings(holdings)` helper is added to `app.js`:

- Groups by `(ticker, inputMode)` key.
- Sums `value` within each group.
- Returns a deduplicated array — at most two entries per ticker (one `$` row and one `%` row if the user used both modes for the same ticker).

This is called in the `btnAnalyse` handler immediately after filtering `validHoldings`, replacing the existing duplicate-check/alert block.

### normaliseWeights fix

`normaliseWeights` currently overwrites `weights[ticker]` on each row. If the same ticker appears in both `$` and `%` modes after merging (rare but valid), the `$` write would be clobbered by the `%` write.

Fix: change both assignment lines to `+=`:
```js
weights[w.ticker] = (weights[w.ticker] ?? 0) + (w.value / (totalPercent || 1)) * percentSlice;
weights[w.ticker] = (weights[w.ticker] ?? 0) + (w.value / (totalDollars || 1)) * dollarSlice;
```

### Fetch deduplication

`Promise.all` currently maps one fetch per `validHoldings` row. After merging, the same ticker cannot appear twice in the same mode, but could appear once as `$` and once as `%`. We fetch unique tickers only:

```js
const uniqueTickers = [...new Set(mergedHoldings.map(h => h.ticker))];
const fetched = await Promise.all(uniqueTickers.map(t => fetchHolding(t)));
// resolvedHoldings: one entry per unique ticker
```

`analysePortfolio` receives `resolvedHoldings` (one entry per ticker) and `mergedHoldings` (the weight inputs). The weight map from `normaliseWeights` then correctly accumulates across any same-ticker mixed-mode entries.

**Files changed:** `www/app.js` (mergeHoldings helper + analyse handler), `www/analyse.js` (normaliseWeights `+=` fix).

---

## Change 3 — Holdings waterfall chart

**Placement:** First chart in the results panel, under the heading "Holdings Allocation", above the existing Asset Class chart.

**Visual:** A bridge/waterfall chart showing how the portfolio allocation accumulates across holdings.

- Holdings sorted by weight descending.
- Each bar is a floating bar: `[cumulativeStart, cumulativeStart + holdingWeight]`.
- Y-axis: 0–100%.
- X-axis labels: ticker symbols.
- Tooltip shows ticker name and individual weight %.

**Colour scheme** (consistent with other charts):
- Red: holding weight ≥ its applicable threshold.
- Amber: holding weight within 2% below threshold (post change 4).
- Green: below amber zone.
- Applicable threshold: ETF threshold (`thresholds.etf`) for ETF holdings; stock threshold (`thresholds.stock`) for direct equities.

**Implementation:** Chart.js floating bars — `type: 'bar'` with `data: [[start, end]]`. No additional library required. Follows the same destroy-before-recreate pattern as existing charts. Canvas height via CSS: same `kv-chart-wrapper` class (240px).

**`renderCharts()` signature change:** needs `resolvedHoldings` and `rawWeights` passed in (currently receives only `analysis`). These are already available at the call site.

**New canvas ID:** `chart-holdings`.

**Files changed:** `www/index.html` (new chart section), `www/app.js` (`renderCharts` + new `renderWaterfallChart` function).

---

## Change 4 — Amber zone narrows from 5% to 2%

**Current:** A flag or bar is amber when `value >= threshold - 5`.  
**New:** Amber when `value >= threshold - 2`.

This makes amber a tighter "approaching" signal — only fire it when genuinely close.

**Files changed:**
- `www/analyse.js` — `flagStatus()`: `threshold - 5` → `threshold - 2`
- `www/app.js` — `renderHBar()` colour array: `threshold - 5` → `threshold - 2`

---

## Files touched summary

| File | Changes |
|---|---|
| `www/app.js` | Regex fix (C1), mergeHoldings + analyse handler (C2), renderWaterfallChart + renderCharts sig (C3), chart colour threshold (C4) |
| `www/analyse.js` | normaliseWeights `+=` (C2), flagStatus threshold (C4) |
| `www/index.html` | New chart-holdings section (C3) |

---

## Out of scope

- No changes to `data.js`, `utils.js`, or the Cloudflare Worker.
- No changes to Excel import/export logic.
- No changes to the holdings table or flags rendering (other than the amber threshold flowing through automatically).
- No new npm dependencies.
