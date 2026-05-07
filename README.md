# Portfolio Health

A vanilla-JS portfolio diversification analyser for [kashvector.com/portfolio-health](https://kashvector.com/portfolio-health).

Enter your investment holdings (ETFs, stocks, or a mix); the tool fetches live data via Yahoo Finance, looks through ETF top-10 holdings for look-through exposure, and visualises sector, region, and asset-class concentration with red/amber/green flags.

## Features

- **ETF look-through** — unpacks each ETF's top-10 holdings to show true sector and region exposure
- **Multi-dimension concentration flags** — ETF, sector, region, and stock level (red ≥ threshold, amber within 5%)
- **Mixed $ / % input** — freely mix dollar amounts and percentages per row; weights are normalised automatically
- **Excel import / export** — download a pre-filled template or import an existing spreadsheet
- **Customisable thresholds** — per-dimension, persisted to localStorage
- **Dark / light theme** — matches other KashVector tools via `kv-theme.js`
- **No build step** — pure ES modules, zero dependencies to install

## Getting Started

ES modules require HTTP — `file://` won't work. Use any local HTTP server:

```bash
# VS Code Live Server extension, or:
npx serve www
```

Then open `http://localhost:3000` (or whichever port `serve` picks).

## Running Tests

```bash
npm test
```

Uses the Node built-in test runner (`node --test`). No `npm install` needed.

## Architecture

```
www/          # Static app — no build, no npm
  config.js   # YAHOO_PROXY_URL export
  utils.js    # Pure: parseMoney(), fmt(), formatCurrency()
  data.js     # Pure: fetchHolding(), countryToRegion(), regionFromTicker(), SECTOR_LABELS
  analyse.js  # Pure: normaliseWeights(), analysePortfolio()
  app.js      # Only file that touches DOM / window / localStorage
  index.html  # Two-column layout; loads Chart.js + SheetJS via CDN
  style.css   # KashVector dark theme + print CSS

tests/
  utils.test.js
  data.test.js
  analyse.test.js
```

**DOM boundary rule:** only `app.js` may touch `document`, `window`, or `localStorage`. All other modules are pure functions — this isolation is required for future Capacitor mobile wrapping.

## Data Flow

1. User clicks **Analyse** → `app.js` reads holdings from the DOM
2. `Promise.all` dispatches one `fetchHolding(ticker)` call per holding in parallel
3. `data.js` detects `quoteType` from the Yahoo Finance response and returns normalised holding data
4. `analysePortfolio()` aggregates into `assetClass`, `sector`, `region`, and `etfConc` buckets and produces `flags[]`
5. `app.js` renders Chart.js bar charts, flags table, and holdings breakdown

## Deployment

Files are copied into the [StockAnalysis](https://github.com/kashvector/StockAnalysis) repo for Cloudflare Pages deployment:

```bash
xcopy "www\*" "C:\Projects\StockAnalysis\www\portfolio-health\" /E /Y /I
```

Cloudflare Pages auto-deploys on push to `main`. Live at `kashvector.com/portfolio-health`.

## Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | None — vanilla JS (ES modules) |
| Charts | [Chart.js 4](https://www.chartjs.org/) via CDN |
| Excel | [SheetJS](https://sheetjs.com/) via CDN |
| Data | Yahoo Finance via Cloudflare Worker proxy |
| Tests | Node built-in `node:test` |
| Hosting | Cloudflare Pages |
