# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Portfolio Health is a vanilla-JS portfolio diversification analyser for `kashvector.com/portfolio-health`. Users enter investment holdings (ETFs, stocks, property); the tool fetches data via Yahoo Finance, looks through ETF top-10 holdings, and visualises sector/region/asset-class exposure with red/amber/green concentration flags.

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
  utils.js    # Pure: parseMoney(), fmt(), formatCurrency()
  data.js     # Pure: fetchHolding(), countryToRegion(), SECTOR_LABELS
  analyse.js  # Pure: normaliseWeights(), analysePortfolio()
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

### Data Flow

1. User clicks "Analyse" → `app.js` reads holdings from DOM
2. `Promise.all` dispatches one `fetchHolding(ticker)` call per holding (parallel)
3. `data.js` detects `quoteType` from Yahoo response:
   - **EQUITY**: returns `{ ticker, quoteType, sector, industry, country }`
   - **ETF**: returns `{ ticker, quoteType, topHoldings[], sectorWeightings[], countryWeightings[], stockPosition, bondPosition, cashPosition }`
   - **Error**: returns `{ ticker, error: true, message }`
4. `analysePortfolio()` aggregates all holdings into `assetClass`, `sector`, `region` buckets and produces `flags[]`
5. `app.js` renders charts (Chart.js horizontal bars), flags, and holdings table

### ETF Look-Through

ETF sector data comes from Yahoo's `topHoldings.sectorWeightings`. **Important:** values are Yahoo's `{raw, fmt}` objects, not plain floats — always extract `.raw`:
```js
const [key, val] = Object.entries(sw)[0];
const pct = typeof val === 'object' ? (val.raw ?? 0) : val;
```

ETF top-10 holdings are used for stock concentration checks (each sub-holding's effective weight = ETF portfolio weight × sub-holding weight). Weight below top-10 is bucketed as `"${etfTicker} (rest)"` and excluded from concentration flags.

### Weight Normalisation

Users can mix `$` and `%` inputs per row. `normaliseWeights()` resolves this: `%` items claim their slice of 100%; `$` items share the remaining slice proportionally. If weights don't sum to 100%, they are normalised and `normalised: true` is returned (shown as a note in the UI).

### Concentration Flags

Three dimensions — `sector`, `region`, `stock` — each produce flags:
- **Red**: value ≥ threshold
- **Amber**: value ≥ threshold − 5%
- **Green**: one summary flag per dimension when nothing breaches amber

Default thresholds (user-overridable, persisted to localStorage): stock 10%, sector 30%, region 50%.

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

Key: `portfoliohealth_v1`. Persists `holdings[]` and `thresholds`. Forward-compatible: new keys default to `defaultState()` values.

## Implementation Status

Task 1 (Cloudflare Worker update) is complete. Tasks 2–13 are pending — full plan at `C:\Users\Anurag\.claude\plans\i-am-developing-a-bright-coral.md`.
