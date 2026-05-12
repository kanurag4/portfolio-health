# Portfolio Health — Four Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four independent improvements — 2dp decimal inputs, duplicate ticker merging, a holdings waterfall chart, and a tighter 2% amber warning window.

**Architecture:** All changes are in-place edits to three files (`www/app.js`, `www/analyse.js`, `www/index.html`). No new files. No new dependencies. Changes are independent and committed separately.

**Tech Stack:** Vanilla JS ES modules, Chart.js 4 (floating bar type), Node built-in test runner.

---

## Files Modified

| File | Changes |
|---|---|
| `www/app.js` | Task 1 (regex), Task 3 (mergeHoldings + analyse handler), Task 4 (renderWaterfallChart + renderCharts signature) |
| `www/analyse.js` | Task 2 (flagStatus threshold), Task 3 (normaliseWeights `+=`) |
| `www/index.html` | Task 4 (new chart-holdings section) |
| `tests/analyse.test.js` | Task 2 (update amber comment), Task 3 (new normaliseWeights accumulation test) |

---

## Task 1: Cap decimal inputs at 2 places

**Files:**
- Modify: `www/app.js` — `buildRow()`, amount input handler

- [ ] **Step 1: Open `www/app.js` and locate the amount input handler**

Find the `input` event listener on the `amount` element inside `buildRow()` (around line 138). The relevant line is:

```js
if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
```

- [ ] **Step 2: Change the regex to limit to 2 decimal places**

Replace that line with:

```js
if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
```

The change: `\d*` at the end → `\d{0,2}`. Any keypress that would result in more than 2 decimal digits is now silently rejected (the `if` condition fails and the input value isn't updated, so the field reverts to its prior valid value).

- [ ] **Step 3: Manually verify the fix**

Run a local server (`npx serve www` or VS Code Live Server), open Portfolio Health, and test the amount field:
- Type `33.33` → accepted, stored as `33.33` ✓
- Type `33.333` → the third decimal digit does not appear ✓
- Type `1234.56` → accepted ✓
- Type `.5` → accepted ✓
- Type `100` → accepted ✓

- [ ] **Step 4: Commit**

```bash
git add www/app.js
git commit -m "fix: cap holding amount input at 2 decimal places"
```

---

## Task 2: Narrow amber warning zone from 5% to 2%

**Files:**
- Modify: `www/analyse.js` — `flagStatus()`
- Modify: `www/app.js` — `renderHBar()` colour array
- Modify: `tests/analyse.test.js` — update stale comment

The amber zone currently fires when `value >= threshold - 5`. Changing it to `threshold - 2` means amber only appears when a value is genuinely close to the limit.

- [ ] **Step 1: Update `flagStatus` in `www/analyse.js`**

Find the `flagStatus` function (around line 113):

```js
function flagStatus(value, threshold) {
  const v = Math.round(value * 10) / 10;
  if (v >= threshold) return 'red';
  if (v >= threshold - 5) return 'amber';
  return null;
}
```

Change `threshold - 5` to `threshold - 2`:

```js
function flagStatus(value, threshold) {
  const v = Math.round(value * 10) / 10;
  if (v >= threshold) return 'red';
  if (v >= threshold - 2) return 'amber';
  return null;
}
```

- [ ] **Step 2: Update `renderHBar` colour logic in `www/app.js`**

Find the `colors` array inside `renderHBar` (around line 528):

```js
const colors = values.map(v => {
  if (v >= threshold)       return 'rgba(239,68,68,0.75)';
  if (v >= threshold - 5)   return 'rgba(245,158,11,0.75)';
  return 'rgba(34,197,94,0.75)';
});
```

Change `threshold - 5` to `threshold - 2`:

```js
const colors = values.map(v => {
  if (v >= threshold)       return 'rgba(239,68,68,0.75)';
  if (v >= threshold - 2)   return 'rgba(245,158,11,0.75)';
  return 'rgba(34,197,94,0.75)';
});
```

- [ ] **Step 3: Update the stale comment in `tests/analyse.test.js`**

Find the comment on the line around 151 that reads:

```js
// CBA = 4%, BHP = 3% — both < 5% (threshold - 5), so green stock flag
```

Update it to reflect the new 2% zone:

```js
// CBA = 4%, BHP = 3% — both < 8% (threshold - 2 = 10-2), so green stock flag
```

- [ ] **Step 4: Run tests to confirm no regressions**

```bash
npm test
```

Expected: all tests pass. The amber zone change doesn't break any existing assertions because:
- Stock flags test: CBA=4%, BHP=3% are both below the new amber floor of 8% (10−2). Still green.
- ETF green test: ETFs at 20%, amber floor 28% (30−2). 20% < 28%. Still green.

- [ ] **Step 5: Commit**

```bash
git add www/analyse.js www/app.js tests/analyse.test.js
git commit -m "fix: narrow amber warning zone from 5% to 2% of threshold"
```

---

## Task 3: Allow duplicate tickers — merge before analysis

**Files:**
- Modify: `www/app.js` — add `mergeHoldings()`, update `btnAnalyse` handler
- Modify: `www/analyse.js` — fix `normaliseWeights` to accumulate with `+=`
- Modify: `tests/analyse.test.js` — add test for same-ticker mixed-mode accumulation

### Background

Currently the analyse handler alerts and aborts when a ticker appears more than once. The fix:
1. `mergeHoldings()` collapses same-(ticker+mode) rows by summing values.
2. `normaliseWeights` is fixed to accumulate (`+=`) so if the same ticker appears in both `$` and `%` mode (possible after step 1), both contributions add up correctly.
3. Fetch is deduplicated to avoid calling Yahoo twice for the same ticker.

- [ ] **Step 1: Add failing test for `normaliseWeights` accumulation**

In `tests/analyse.test.js`, add this new `describe` block after the existing `normaliseWeights` tests:

```js
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
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
node --test tests/analyse.test.js
```

Expected: FAIL — the test for same-ticker accumulation fails because the current `=` overwrites instead of accumulating.

- [ ] **Step 3: Fix `normaliseWeights` in `www/analyse.js`**

Find the two assignment lines inside the `for` loops in `normaliseWeights` (around lines 14–19):

```js
for (const w of percentItems) {
  weights[w.ticker] = (w.value / (totalPercent || 1)) * percentSlice;
}
for (const w of dollarItems) {
  weights[w.ticker] = (w.value / (totalDollars || 1)) * dollarSlice;
}
```

Change both to use `+=`:

```js
for (const w of percentItems) {
  weights[w.ticker] = (weights[w.ticker] ?? 0) + (w.value / (totalPercent || 1)) * percentSlice;
}
for (const w of dollarItems) {
  weights[w.ticker] = (weights[w.ticker] ?? 0) + (w.value / (totalDollars || 1)) * dollarSlice;
}
```

- [ ] **Step 4: Run tests to confirm the new test passes and no regressions**

```bash
npm test
```

Expected: all tests pass, including the new same-ticker accumulation test.

- [ ] **Step 5: Add `mergeHoldings` helper to `www/app.js`**

Add this function near the top of `app.js`, immediately after the `escapeHtml` helper (after line 14):

```js
function mergeHoldings(holdings) {
  const merged = new Map();
  for (const h of holdings) {
    const key = `${h.ticker}|${h.inputMode}`;
    if (merged.has(key)) {
      merged.get(key).value += h.value;
    } else {
      merged.set(key, { ...h });
    }
  }
  return [...merged.values()];
}
```

- [ ] **Step 6: Update the `btnAnalyse` click handler in `www/app.js`**

Find the duplicate-check block inside the `btnAnalyse` click handler (around lines 342–347):

```js
const tickers = validHoldings.map(h => h.ticker);
const dupes = [...new Set(tickers.filter((t, i) => tickers.indexOf(t) !== i))];
if (dupes.length > 0) {
  alert(`Duplicate tickers detected: ${dupes.join(', ')}. Please remove duplicates before analysing.`);
  return;
}
```

Replace the entire block with a single merge call:

```js
const mergedHoldings = mergeHoldings(validHoldings);
```

Then find the fetch and analysis lines immediately after (around lines 349–358):

```js
const resolvedHoldings = await Promise.all(
  validHoldings.map(h => fetchHolding(h.ticker))
);

const analysis = analysePortfolio(resolvedHoldings, validHoldings, state.thresholds);
lastAnalysis = { resolvedHoldings, analysis, rawWeights: validHoldings };

await renderResults(resolvedHoldings, analysis, validHoldings);
```

Replace with (using `mergedHoldings` throughout, deduplicating the fetch):

```js
const uniqueTickers = [...new Set(mergedHoldings.map(h => h.ticker))];
const resolvedHoldings = await Promise.all(uniqueTickers.map(t => fetchHolding(t)));

const analysis = analysePortfolio(resolvedHoldings, mergedHoldings, state.thresholds);
lastAnalysis = { resolvedHoldings, analysis, rawWeights: mergedHoldings };

await renderResults(resolvedHoldings, analysis, mergedHoldings);
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all tests pass (the `mergeHoldings` function lives in `app.js` and can't be imported by the Node runner; its correctness is covered by the `normaliseWeights` accumulation test and manual verification below).

- [ ] **Step 8: Manually verify duplicate merging**

Open Portfolio Health in a local server. Enter:
- Row 1: `VAS.AX` / `%` / `40`
- Row 2: `VAS.AX` / `%` / `20`
- Row 3: `VOO` / `%` / `40` (uncheck ASX)

Click Analyse. Expected:
- No duplicate-ticker alert fires.
- VAS.AX appears once in the Holdings table with weight 60% (40+20 merged).
- VOO appears at 40%.
- Analysis proceeds normally.

- [ ] **Step 9: Commit**

```bash
git add www/app.js www/analyse.js tests/analyse.test.js
git commit -m "feat: allow duplicate tickers — merge by ticker+mode before analysis"
```

---

## Task 4: Holdings waterfall chart

**Files:**
- Modify: `www/index.html` — add `chart-holdings` section
- Modify: `www/app.js` — add `renderWaterfallChart()`, update `renderCharts()` signature and call

A waterfall (bridge) chart using Chart.js floating bars. Each holding is one bar, drawn from its cumulative start to end, building up to 100%. Holdings are sorted by weight descending. Bar colours match the red/amber/green scheme using per-holding thresholds (ETF threshold for ETFs, stock threshold for equities).

- [ ] **Step 1: Add the canvas to `www/index.html`**

Find the first chart section inside `#results-content` (around line 106):

```html
<div class="kv-chart-section">
  <h3>Asset Class</h3>
  <div class="kv-chart-wrapper"><canvas id="chart-asset"></canvas></div>
</div>
```

Insert a new chart section **immediately before** it:

```html
<div class="kv-chart-section">
  <h3>Holdings Allocation</h3>
  <div class="kv-chart-wrapper"><canvas id="chart-holdings"></canvas></div>
  <p class="kv-chart-note">Each bar shows one holding's portfolio weight, stacked cumulatively to 100%. Colours use the same concentration thresholds as the flags above.</p>
</div>
```

- [ ] **Step 2: Add `renderWaterfallChart` to `www/app.js`**

Add this new function immediately before the existing `renderHBar` function (around line 511):

```js
function renderWaterfallChart(canvasId, resolvedHoldings, rawWeights, thresholds) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  const { weights } = normaliseWeights(rawWeights);

  const items = resolvedHoldings
    .filter(h => !h.error)
    .map(h => ({ ticker: h.ticker, weight: weights[h.ticker] ?? 0, quoteType: h.quoteType }))
    .filter(h => h.weight > 0.1)
    .sort((a, b) => b.weight - a.weight);

  const labels = items.map(h => h.ticker);
  const data = [];
  const colors = [];
  let cumulative = 0;

  for (const item of items) {
    const start = parseFloat(cumulative.toFixed(2));
    const end   = parseFloat((cumulative + item.weight).toFixed(2));
    data.push([start, end]);
    cumulative += item.weight;

    const thr = item.quoteType === 'ETF' ? (thresholds.etf ?? 30) : (thresholds.stock ?? 10);
    if (item.weight >= thr)       colors.push('rgba(239,68,68,0.75)');
    else if (item.weight >= thr - 2) colors.push('rgba(245,158,11,0.75)');
    else                           colors.push('rgba(34,197,94,0.75)');
  }

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('0.75', '1')),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const [start, end] = ctx.raw;
              return ` ${(end - start).toFixed(1)}%`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#f1f5f9',
            font: { size: 11 },
            maxRotation: 35,
            minRotation: 0,
            callback(val) {
              const lbl = this.getLabelForValue(val);
              return lbl.length > 14 ? lbl.slice(0, 13) + '…' : lbl;
            },
          },
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: '#334155' },
          ticks: { color: '#94a3b8', callback: v => v + '%', maxTicksLimit: 6 },
          afterFit: scale => { scale.width = 88; },
        },
      },
    },
  });
}
```

- [ ] **Step 3: Update `renderCharts` signature and body in `www/app.js`**

Find the existing `renderCharts` function (around line 505):

```js
function renderCharts(analysis) {
  renderHBar('chart-asset',  analysis.assetClass, 100);
  renderHBar('chart-sector', analysis.sector,     state.thresholds.sector);
  renderHBar('chart-region', analysis.region,     state.thresholds.region);
}
```

Replace with (adds two parameters and a waterfall call):

```js
function renderCharts(analysis, resolvedHoldings, rawWeights) {
  renderWaterfallChart('chart-holdings', resolvedHoldings, rawWeights, state.thresholds);
  renderHBar('chart-asset',  analysis.assetClass, 100);
  renderHBar('chart-sector', analysis.sector,     state.thresholds.sector);
  renderHBar('chart-region', analysis.region,     state.thresholds.region);
}
```

- [ ] **Step 4: Update the `renderCharts` call site in `www/app.js`**

Find the call to `renderCharts` inside `renderResults` (around line 414):

```js
renderCharts(analysis);
```

Replace with:

```js
renderCharts(analysis, resolvedHoldings, rawWeights);
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass (chart rendering is DOM-dependent and verified manually).

- [ ] **Step 6: Manually verify the waterfall chart**

Open Portfolio Health locally and enter a portfolio with at least 3 holdings of different weights. After clicking Analyse:
- A "Holdings Allocation" chart appears above the Asset Class chart.
- Bars are stacked left-to-right from the largest holding to smallest.
- Hovering a bar shows the individual weight (e.g. `40.0%`), not the cumulative value.
- A holding above its concentration threshold (ETF >30% or stock >10%) is red; within 2% below is amber; otherwise green.
- Y-axis runs 0–100%; the last bar's top edge is at or near 100%.

- [ ] **Step 7: Commit**

```bash
git add www/app.js www/index.html
git commit -m "feat: add holdings waterfall chart showing cumulative allocation"
```

---

## Task 5: Deploy

- [ ] **Step 1: Copy to StockAnalysis**

```bash
xcopy "www\*" "C:\Projects\StockAnalysis\www\portfolio-health\" /E /Y /I
```

- [ ] **Step 2: Commit and push StockAnalysis**

```bash
cd C:\Projects\StockAnalysis
git add www/portfolio-health/
git commit -m "deploy: Portfolio Health — decimal cap, duplicate merge, waterfall chart, 2% amber"
git push
```

Expected: Cloudflare Pages deploys automatically within ~1 minute. Verify at `kashvector.com/portfolio-health`.
