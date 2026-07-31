# NexusQ

**The Causal Intelligence Platform for Capital Markets** — by Gygante Quantitative Systems.

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

- **Cross-asset overlay** — up to six series from a 24-series catalog (energy fundamentals,
  commodities, equities, renewables, macro, FX) on a single comparable axis
  (indexed, z-score, y/y % or raw). No dual axes, ever.
- **Correlation structure** — Pearson ρ of log-returns over the selected window,
  forward-filled onto a common daily grid.
- **Live signals** — dislocation z-scores, 50/200-day momentum regimes, and
  correlation-regime shifts on curated energy↔cross-asset pairs (the "beta" family).
- Light/dark theme, colorblind-validated palette.

### Architecture

```
FRED / Yahoo Finance / World Bank
        │  scripts/refresh-data.mjs   (node, also runs on a GitHub Actions cron)
        ▼
public/data/*.json  (snapshot series + catalog manifest)
        ▼
Vite + React + TypeScript SPA (ECharts) — fully static, free to host
```

No backend, no API keys, no runtime dependencies: data is snapshotted into the repo
by the refresh pipeline, so the site works offline and never hits rate limits.

### Develop

```bash
npm install
npm run dev        # http://localhost:5173
```

### Refresh data

```bash
node scripts/refresh-data.mjs
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
| EIA v2 API | weekly inventories (planned — needs free `EIA_API_KEY`) | for Inventory Divergence signals |

*Not investment advice. © 2026 Gygante Quantitative Systems.*
