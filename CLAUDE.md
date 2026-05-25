# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Portfolio Health is a vanilla-JS portfolio diversification analyser for `kashvector.com/portfolio-health`. Users enter investment holdings (ETFs, stocks); the tool fetches data via Yahoo Finance, looks through ETF top-10 holdings, and visualises sector/region/asset-class exposure with red/amber/green concentration flags, a 0–100 health score, interactive drill-down panels, and ETF overlap detection.

## Commands

```bash
# Run all tests (from project root)
npm test

# Run a single test file
node --test tests/analyse.test.js
```

No build step. Open `www/index.html` directly via a local HTTP server (e.g. VS Code Live Server or `npx serve www`). ES modules require HTTP — file:// won't work.

## Architecture

```
www/          # Static app — no build, no npm
  config.js   # YAHOO_PROXY_URL export (single constant)
  utils.js    # Pure: parseMoney(), fmt(), formatCurrency(), clampThreshold()
  data.js     # Pure: fetchHolding(), countryToRegion(), regionFromTicker(), SECTOR_LABELS, EQUITY_SECTOR_NORMALIZE, classifyQuoteType()
  analyse.js  # Pure: normaliseWeights(), analysePortfolio(), scorePortfolio(), detectOverlap()
  app.js      # ONLY file that touches DOM, window, localStorage
  index.html  # Two-column layout; loads Chart.js + SheetJS via CDN
  style.css   # KashVector dark theme + print CSS

tests/        # Node built-in test runner (no npm install needed)
  utils.test.js
  data.test.js
  analyse.test.js
```

### DOM Boundary Rule (load-bearing)

**Only `app.js` may touch `document`, `window`, or `localStorage`.** All other files are pure functions with zero browser dependencies. This isolation is required for future Capacitor mobile wrapping — do not break it.

**Corollary:** `app.js` statically imports everything it needs at the top of the file. Never use dynamic `import()` inside functions — it is redundant (modules are cached) and misleads readers about what is available.

### Data Flow

1. User clicks "Analyse" → `app.js` reads holdings from DOM
2. `Promise.all` dispatches one `fetchHolding(ticker)` call per holding (parallel)
3. `data.js` detects `quoteType` from Yahoo response via `classifyQuoteType()`:
   - **EQUITY**: returns `{ ticker, quoteType, sector, industry, country }`
   - **ETF / MUTUALFUND**: returns `{ ticker, quoteType: 'ETF', topHoldings[], sectorWeightings[], countryWeightings[], stockPosition, bondPosition, cashPosition }`
   - **Unsupported** (INDEX, CURRENCY, CRYPTOCURRENCY, OPTION, etc.): returns `{ ticker, error: true, message }`
   - **Error**: returns `{ ticker, error: true, message }`
4. `analysePortfolio()` aggregates all holdings into `assetClass`, `sector`, `region`, `etfConc` buckets and produces `flags[]`, `sectorContributions`, and `regionContributions`
5. `app.js` renders charts (Chart.js vertical bars), flags, health score card, overlap card, and holdings table. Chart bars are clickable — they open the drill-down panel via `openDrillPanel(label, dimension)`

### ETF Look-Through

ETF sector data comes from Yahoo's `topHoldings.sectorWeightings`. **Important:** values are Yahoo's `{raw, fmt}` objects, not plain floats — always extract `.raw`:
```js
const [key, val] = Object.entries(sw)[0];
const pct = typeof val === 'object' ? (val.raw ?? 0) : val;
```

Same dual-format applies to `countryWeightings`.

ETF top-10 holdings are used for stock concentration checks (each sub-holding's effective weight = ETF portfolio weight × sub-holding weight). Weight below top-10 is bucketed as `"${etfTicker} (rest)"` and excluded from concentration flags. Always guard the loop: `for (const top of (h.topHoldings ?? []))`.

### ETF Region Fallback

Region attribution uses a three-tier fallback:
1. Yahoo `countryWeightings` (preferred)
2. Infer from top-10 ticker suffixes via `regionFromTicker()` — `.AX` → Australia, no suffix → United States, `.L` → International Developed, `.NS` → Emerging Markets, etc.
3. `'Unclassified'` for any weight not covered by top-10

### Weight Normalisation

Users can mix `$` and `%` inputs per row. `normaliseWeights()` resolves this: `%` items claim their slice of 100%; `$` items share the remaining slice proportionally. `normalised: true` is returned (shown as a note in the UI) in two cases:
- The percent rows alone exceed 100% (detected before clamping, so over-allocation is always surfaced)
- The final weights don't sum to 100% within a 0.5% tolerance (absorbs floating-point drift)

### Concentration Flags

Four dimensions — `etf`, `sector`, `region`, `stock` — each produce flags:
- **Red**: value ≥ threshold (rounded to 1 dp before comparison to absorb floating-point drift)
- **Amber**: value ≥ threshold − 2%
- **Green**: one summary flag per dimension when nothing breaches amber, and at least one holding exists in that dimension (e.g. no ETF green flag is emitted for a stock-only portfolio)

Default thresholds (user-overridable, persisted to localStorage):

| Dimension | Default |
|-----------|---------|
| ETF (single holding) | 30% |
| Stock (direct or ETF sub-holding) | 10% |
| Sector | 30% |
| Region | 50% |

Stock flags include a `via` field (e.g. `"VAS.AX"`) when the concentration comes from an ETF sub-holding rather than a direct holding. The UI renders this as "(via VAS.AX)" in the flag title.

The green stock flag's `count` reflects only real ticker entries — `"${etfTicker} (rest)"` pseudo-entries are excluded from the count.

All four `buildDimFlags` / `buildStockFlags` calls in `analysePortfolio` include `?? default` fallbacks on the threshold so a missing key never silently produces all-green flags.

### Portfolio Health Score

`scorePortfolio(flags)` in `analyse.js` converts flags into a 0–100 score. Four dimensions (stock, sector, region, etf) × 25 pts each:
- Per dimension: `Math.max(0, 25 − (redCount × 10) − (amberCount × 5))`
- A dimension with **zero flags** (e.g. no ETFs in portfolio) scores **25 (neutral)** — not penalised
- Green flags contribute 0 deductions

The score card is hidden when all holdings error out (would otherwise show a misleading 100/100). Rendered by `renderScoreCard(score)` in `app.js` into `#score-card`, placed above `#summary-strip`.

### Sector and Region Contributions

`analysePortfolio()` returns two additional maps alongside the existing buckets:

```js
sectorContributions: { 'Financials': [{ ticker, contribution, type: 'direct'|'etf' }, …] }
regionContributions: { 'Australia': [{ ticker, contribution, type: 'direct'|'etf' }, …] }
```

Each entry records which holding drove how much of a bucket's total, and whether it arrived directly or via ETF look-through. These power the drill-down panel.

### Drill-Down Panel

`openDrillPanel(label, dimension)` / `closeDrillPanel()` in `app.js` control a fixed side panel (`#drill-panel` + `#drill-overlay`) that slides in from the right.

- **Sector/Region bars**: shows `sectorContributions` / `regionContributions` for the clicked bucket, sorted by contribution descending. Each row uses `.drill-contrib-ticker`, `.drill-contrib-type`, `.drill-contrib-pct` CSS classes.
- **Holdings waterfall bars**: shows ETF top-10 holdings list or stock sector/region metadata.
- Closes on overlay click, `#drill-close` button, or `Escape` key.
- Reads from `lastAnalysis` (module-level in `app.js`). All chart `onClick` handlers pass `labels[elements[0].index]` as the label.
- Asset class chart has `dimension = null` and does not open the panel.

### ETF Overlap Detection

`detectOverlap(resolvedHoldings, normalisedWeights)` in `analyse.js`:
- Filters to ETFs with non-empty `topHoldings`
- O(n²) pairwise comparison; finds tickers appearing in both `topHoldings` arrays
- `weightInA` / `weightInB` are the sub-holding's share **within the ETF** (fraction × 100), not portfolio-level exposure — the UI makes this explicit with a note
- Returns `[{ etfA, etfB, weightA (portfolio%), weightB (portfolio%), shared: [{ ticker, weightInA, weightInB }] }]`

Rendered by `renderOverlapCard(overlaps, etfCount)` into `#overlap-card`. Hidden when `etfCount < 2`. The "no overlap" message includes a caveat that only ETFs with available top-10 data are compared.

### innerHTML Safety

`buildFlagEl` and all render functions in `app.js` use `escapeHtml()` on every user-controlled string (tickers, names, sector/region labels from Yahoo) before inserting into `innerHTML`. Number literals (`.toFixed()`) and trusted enum strings (`'Direct'`, `'via ETF'`) are safe without escaping. Any new field from a flag object or Yahoo response that reaches `innerHTML` **must** be passed through `escapeHtml()` first.

### Sector Normalisation

Yahoo's `assetProfile.sector` for direct equities uses different strings than the ETF `sectorWeightings` keys. `EQUITY_SECTOR_NORMALIZE` in `data.js` maps the divergent Yahoo equity strings to the canonical `SECTOR_LABELS` values so they merge into the same bucket:

```js
// The only known divergence — all other Yahoo equity sector strings already match canonical labels
{ 'Financial Services': 'Financials' }
```

Applied at `analyse.js` when bucketing direct-stock sectors. If Yahoo adds new divergent strings, add them here.

### Threshold Validation

Thresholds are constrained to 1–100 in two places:
- **`app.js` change handler**: the inline `parse` function rejects values outside `[1, 100]` and reverts to the previous valid value
- **`app.js` `loadState()`**: calls `clampThreshold()` from `utils.js` on every persisted threshold to sanitise values stored before this validation existed

`clampThreshold(n)` is a pure function in `utils.js`: `Math.min(100, Math.max(1, n))`.

### Holdings Input

- Default input mode is `%` (not `$`)
- Each row has an ASX checkbox (checked by default); on blur, `.AX` is appended when checked and the ticker has no suffix
- A live "X% remaining" counter updates below the list as values are typed; turns green at 100%, red if over
- Threshold inputs use `type="number" min="1" max="100"`; values outside 1–100 are rejected and snap back to the previous valid value. Persisted values are also clamped via `clampThreshold()` on load.

### Excel Import / Export

Template columns: `Ticker`, `Name (optional)`, `Amount_AUD`, `Percentage`, `IsASX`, `Notes`.

Import logic for the `IsASX` column:
- Ticker already ends with `.AX` → `isAsx = true`, no suffix added
- Ticker has any other suffix (`.L`, `.NS`, etc.) → `isAsx = false`
- Ticker has **no suffix** → `isAsx = true` only if `IsASX` column is `Yes`/`y`/`true`; otherwise treated as US/international

This prevents no-suffix US tickers (e.g. `VOO`) from silently getting `.AX` appended.

### Yahoo Finance Proxy

All data fetches go through the existing Cloudflare Worker at `config.js:YAHOO_PROXY_URL`. The worker handles cookie/crumb auth and CORS. It is shared with the Stock Evaluator tool — do not change the worker URL without updating `C:\Projects\StockAnalysis\worker\yahoo-proxy.js`.

The worker must have `topHoldings` in its MODULES list (added in Task 1, commit `39da145` in StockAnalysis repo).

## Deployment

```bash
# Copy built files to StockAnalysis for Cloudflare Pages deployment
xcopy "www\*" "C:\Projects\StockAnalysis\www\portfolio-health\" /E /Y /I

# Then commit and push StockAnalysis
cd C:\Projects\StockAnalysis
git add www/portfolio-health/
git commit -m "deploy: update Portfolio Health"
git push
```

Cloudflare Pages auto-deploys on push. Live at `kashvector.com/portfolio-health`.

**Asset path note:** The tool icon is `portfolio-health-icon.svg`, which lives at the StockAnalysis `www/` root (`StockAnalysis\www\portfolio-health-icon.svg`). It is NOT inside the `portfolio-health/` subfolder and is not copied by xcopy. The tool page references it as `../portfolio-health-icon.svg` (resolves to `/portfolio-health-icon.svg` in production). The landing page card references it as `portfolio-health-icon.svg` (same file). Both pages show the same icon with no manual copy step needed.

## KashVector Design System

| Token | Value | Usage |
|-------|-------|-------|
| `--kv-bg` | `#0f172a` | Page background |
| `--kv-card` | `#1e293b` | Card backgrounds |
| `--kv-card-2` | `#273449` | Nested inputs |
| `--kv-text` | `#f1f5f9` | Primary text |
| `--kv-muted` | `#94a3b8` | Secondary text |
| `--kv-accent` | `#38bdf8` | UI chrome only — never semantic |
| `--kv-border` | `#334155` | All borders |
| `--kv-pass` | `#22c55e` | Green (good outcomes) |
| `--kv-fail` | `#ef4444` | Red (bad outcomes) |
| `--kv-warn` | `#f59e0b` | Amber (caution) |

Always dark mode. Slate colours only. Accent is UI chrome only — use pass/fail/warn for semantic colour.

## localStorage

Key: `portfoliohealth_v1`. Persists `holdings[]` and `thresholds`. Forward-compatible: new keys default to `defaultState()` values. `isAsx` on each holding defaults to `true` for backward compat with saved state from before the checkbox was added.

## Implementation Status

All features complete and live. Tests: 96 pass, 0 fail.

**Shipped:**
- Concentration flags (red/amber/green) across ETF, sector, region, stock dimensions
- Seven concentration-risk correctness fixes (sector bucket split, over-100% normalisation warning, threshold validation, unsupported instrument rejection, phantom green flag, stock count fix, threshold clamping)
- Portfolio Health Score (0–100) with per-dimension breakdown
- Interactive drill-down side panel (click sector/region/holdings chart bars)
- ETF Overlap Detection (shared top-10 holdings between ETF pairs)
- FAQ and About section updated to explain all features

The tool is live at `kashvector.com/portfolio-health` and linked from the KashVector landing page with its own icon (`portfolio-health-icon.svg`). The source `www/index.html` is in full parity with the deployed file (SEO meta, canonical, JSON-LD, FAQ section, footer link all present).
