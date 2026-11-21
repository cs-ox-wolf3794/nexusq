# NexusQ

[![CI](https://github.com/cs-ox-wolf3794/nexusq/actions/workflows/ci.yml/badge.svg)](https://github.com/cs-ox-wolf3794/nexusq/actions/workflows/ci.yml)
[![Data refresh](https://github.com/cs-ox-wolf3794/nexusq/actions/workflows/refresh-data.yml/badge.svg)](https://github.com/cs-ox-wolf3794/nexusq/actions/workflows/refresh-data.yml)

**The Market Intelligence Platform for Capital Markets** — by Gygante Quantitative Systems.

NexusQ transforms energy, commodity and macro-economic data into continuously updated
financial models, institutional-grade signals, scenario forecasts and decision intelligence.

> Bloomberg shows what happened. NexusQ explains why it happened, what happens next,
> and what portfolio action should be considered.

Value chain: **Information → Signal → Scenario → Decision → Outcome**

## Product family (Vision 2030)

| Product | What it does | Status |
|---|---|---|
| **Nexus Signal** | Energy Beta, Carbon Beta, Supply-Risk Beta, LNG Beta, Energy-FX arbitrage, inventory divergence, sentiment pulse | **MVP — this repo** |
| **Nexus Model** | Continuously updating financial models ("What happens to BASF earnings if EU gas rises 30%?") | Roadmap |
| **Nexus Scenario** | Shock simulation (Hormuz closure, sanctions, carbon-tax expansion) → instant cross-asset impact | Roadmap |
| **Nexus Portfolio** | Hidden energy-exposure detection (LNG, power, diesel, freight, carbon) | Roadmap |
| **Nexus Agent** | Always-on agentic institutional analyst | Roadmap |

(Positioning, go-to-market and moat thesis live in internal strategy docs, deliberately
kept out of this public repo.)

## The MVP (Nexus Signal preview)

A responsive static web app (browser / tablet / mobile) with:

- **Cross-asset overlay** — up to six series from the catalog (energy fundamentals,
  weekly EIA inventories, commodities, equities, renewables, macro, FX) on a single
  comparable axis (indexed, z-score, y/y % or raw). No dual axes, ever. Question presets
  and shareable view links.
- **Correlation structure** — Pearson ρ of log-returns over the selected window,
  matched on common observation intervals without forward filling; incompatible frequencies are withheld.
- **Snapshot signals** — dislocation z-scores, 50/200-observation momentum regimes,
  correlation-regime shifts on curated energy↔cross-asset pairs, and inventory-divergence
  flags (EIA weekly fundamentals vs price, seasonal z × dislocation tension).
- **Market state** — trend / volatility / dollar / CFTC managed-money-positioning
  percentile conditions per energy market, with a supportive-oriented composite. A regime
  description, not a trading signal.
- **Signal validation** — an event study of the supported daily signal families since 2015 (weekly inventory divergence is excluded),
  source-lag-aware and episode-collapsed, using revised histories rather than point-in-time vintages. Historical comparisons and their limitations are published without claiming a trading edge.
- **Equity impact (Energy Beta board)** — rolling 90-observation β / α / R² of ~15 energy-exposed
  stocks (majors, services, steel, chemicals, airlines, transition names) against
  Brent / WTI / Henry Hub, with a scenario translator consistent with the fitted log-return slope.
- **Sovereign impact** — GDP sensitivity of major energy exporters vs importers to oil
  (cycle-controlled Frisch–Waugh betas with r and n disclosed), grounded in World Bank
  fuel-trade intensity.
- **Trust layer** — per-series QC (`quality.json`), a daily public signal/forecast ledger,
  an in-app Methodology page, and a CI-tested analytics library.
- Light/dark theme, colorblind-validated palette, mobile-first responsive.

### Architecture

```
FRED / Yahoo Finance / World Bank / IMF / EIA / CFTC
        │  scripts/refresh-data.mjs   (node, also runs on a GitHub Actions cron)
        │  + snapshot-signals.ts (daily ledger) + backtest-signals.ts
        ▼
public/data/*.json  (series + catalog, forecasts, impact, cot, quality, backtest, history/)
        ▼
Vite + React + TypeScript SPA (ECharts) — fully static, free to host
```

No backend and no runtime API keys: data is snapshotted into the repo by the refresh
pipeline, so analytical views use local snapshots. Providers can still throttle the refresh pipeline; failed inputs retain their prior observations and explicit status. (The pipeline itself
uses a free EIA key held as an Actions secret for STEO forecasts and weekly inventories;
FRED, Yahoo, World Bank and CFTC are keyless.)

### Develop

```bash
npm install
npm run dev        # http://localhost:5173
```

### Refresh data

```bash
npm run refresh
```

### Deploy (free)

- **Cloudflare Pages / Vercel / Netlify**: connect the repo; build command `npm run build`,
  output `dist`. Done.
- **GitHub Pages**: enable Pages → "GitHub Actions" in repo settings; the included
  [deploy workflow](.github/workflows/deploy.yml) builds and publishes on every push to
  `main`, and the [data-refresh workflow](.github/workflows/refresh-data.yml) re-snapshots
  the catalog every weekday and commits it (which re-triggers the deploy).

### Data sources (all free)

| Source | Series | Notes |
|---|---|---|
| FRED (fredgraph CSV, keyless) | Brent, WTI, Henry Hub, EU gas, coal, copper, wheat, S&P 500, Nasdaq, VIX, UST 10Y, breakevens, CPI, INDPRO, dollar index, EURUSD | daily/monthly |
| Yahoo Finance chart API | XLE, ICLN, TAN, GLD | 10y daily closes |
| World Bank API | GDP growth (US, China, India, Germany) | annual |
| IMF WEO via World Bank Data360 | GDP-growth projections to +3y (keyless API and bulk-file fallback) | forecast layer; source-version dates preserved |
| EIA v2 API (optional) | STEO Brent/WTI/Henry Hub forecasts + weekly inventories | set free `EIA_API_KEY` |

### Forecast layer

`refresh-data.mjs` also writes `public/data/forecasts.json`:

- **Model fans** — per-series P10/P25/P50/P75/P90 projections (~90 days for daily series,
  ~6 months for monthly) from deliberately transparent statistics: half-weight ("damped")
  drift + EWMA volatility. The uncertainty band is the product, not the point estimate.
- **External forecasts** — IMF WEO GDP projections delivered by World Bank Data360; EIA STEO oil & gas forecasts when a
  key is configured.
- Because the cron commits `forecasts.json` daily, **git history is the outcome database**:
  every published forecast is permanently recorded against what subsequently happened —
  the raw material for a calibration scoreboard.

*Not investment advice. © 2026 Gygante Quantitative Systems.*

## Reliability and update operations

- `npm run refresh`: stage and validate a full analytical update, retaining individual failures. Requires `EIA_API_KEY` for weekly inventories and STEO. Missing credentials are reported; inventory histories are never removed from the catalog.
- `npm run refresh:quotes`: check the existing Yahoo ETFs and stocks. Quotes are separate from daily analytics. Redistribution permission must be established for client delivery.
- `npm run data:validate -- --manifest`: validate catalog/series/QC/forecast contracts and build the SHA-256 publication manifest.
- `npm run backtest`: regenerate event studies after analytical engine changes. Results with a different engine version are withheld by the UI. Regenerate the manifest after updating results.
- `NEXUSQ_DATA_DIR` selects an isolated data directory for validation runs. The default is `public/data`.

GitHub Actions targets quote checks at minutes 7, 22, 37 and 52 during weekdays 12:00–23:59 UTC. Full analytical refreshes run at 06:17, 16:17, 18:17 and 22:17 UTC weekdays, plus Saturday 06:17. The static browser checks the manifest every minute and on return to the tab. The same infrastructure is retained: GitHub Actions, versioned JSON, GitHub Pages, no new paid service or runtime secret.

**This is not a guaranteed 15-minute service.** Provider timestamps and exchange delays determine quote freshness; Actions scheduling and deployment add latency. Official daily, weekly, monthly and annual inputs do not become intraday data when polled more frequently. The quote panel does not imply intraday signals or betas. [GitHub scheduling limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) and [Yahoo exchange delays](https://help.yahoo.com/kb/finance/article-exchanges-data-delays-sln2310.html) apply.

September IMF monthly prices are dated September 1 in FRED but represent the full month. QC measures age from September 30 with an explicit 60-day tolerance; it does not suppress source delays. The broad dollar series is the Federal Reserve trade-weighted index, not ICE DXY. Source definitions, operational tolerances and statistical limits are detailed on the in-app Methodology page.

### Failure and recovery

1. Inspect Data status, `quality.json`, `health.json`, `quotes.json` and the latest Actions run. Retrieval time is distinct from observation date. `refresh-status.json` reports rejected full refreshes while the last verified analytical snapshot remains available.
2. Fix source access or credentials, then dispatch **Refresh data snapshots → full**. Quote-only runs cannot cure overdue analytical QC. Never widen a tolerance simply to make a warning disappear.
3. Failed/rejected replacements retain prior observations, withhold affected current analysis and preserve original successful-retrieval timestamps. A systemic market-source outage rejects the complete staged update. Annual enrichment failures cannot block otherwise-valid daily market updates.
4. Missing/mixed/corrupted publications fail client integrity checks and are retried; a loaded page retains its previous verified snapshot. A new page fails visibly rather than computing from a partial set.
5. CI and deployment run tests and data-contract validation. The data writer is serialized; it never force-pushes. Code changes or data conflicts can stop publication and require an operator to inspect the failed run.

The local regression suite covers malformed/future/duplicate observations, source outages, history regression, publication integrity, freshness expiry, incomplete trading sessions, quote timestamps, missing QC, release-lag replay, baseline look-ahead, paired return alignment and daily ledger preservation. Automated QC is not independent corroboration of provider values. A hard market-data SLA, tick-level delivery and point-in-time institutional backtesting require capabilities beyond the current free static architecture.

### GDP forecast delivery

The legacy IMF DataMapper endpoint is replaced by [World Bank Data360](https://data360.worldbank.org/en/api), indicator `IMF_WEO_NGDP_RPCH`. Forecast authorship remains the [IMF World Economic Outlook](https://data.imf.org/en/datasets/IMF.RES:WEO); this is alternative distribution, not an independent forecast. Four small country queries cover the US, China, India and Germany. If any API response fails or has invalid coverage, all four forecasts are read from the official World Bank bulk file as one coherent batch. No credentials or new infrastructure are required.

The source metadata version is checked before and after retrieval, cannot regress and must be no older than 225 days. The entire requested annual horizon, units, country identifiers and latest-version dimensions must validate. Retained forecasts keep their original retrieval time and expire after 45 days; the client also enforces source-version expiry. India is explicitly labeled on an April-start fiscal-year basis. Forecasts are separate from revised World Bank actual histories. Source, delivery URL, version and retrieval time appear under Data status. Attribution: International Monetary Fund, World Economic Outlook (WEO), delivered by World Bank Data360; access dates are recorded per forecast.

### Methodology audit — engine 2026-11-21.2

Correlation-reference outcomes must have become available before each episode; entry delays and horizons match the evaluated event. Directional baselines also respect source publication lags. Comparisons require 20 historical reference outcomes; bootstrap intervals are withheld below 20 episodes or for all-hit/all-miss samples. Full refreshes regenerate the evidence, and the UI requires matching engine and input-snapshot versions. Thresholds were not tuned to improve the results.

Rate/growth-rate indexing and percentage-of-rate growth are disabled. Monthly observations use period-end plot dates; EIA forecasts cover complete future monthly averages, not daily or month-end price targets. Unchanged EIA content expires after 45 days because the query API supplies no release vintage. Forecast fan shading handles negative lower bounds; daily forecast digests contain only future points and record actual horizons. Source parsers validate identity, units and complete responses, and adjusted closes receive separate QC.

State-direction labels follow the actual change, tied percentile values receive half weight, and seasonal inventory comparisons use a consistent leap-year calendar. Scenario values describe statistical association, not identified causal effects. The in-app Methodology page contains formulas, source references and remaining limits. Passing QC or tests does not establish calibrated forecast accuracy, causal identification or a tradable edge.
