# NexusQ — working notes for Claude

NexusQ is a static market-intelligence SPA (Nexus Signal MVP) by Gygante Quantitative
Systems, deployed to **nexus.gygante.com** via GitHub Pages from this repo
(`cs-ox-wolf3794/nexusq`, branch `main` = production).

## Commands

```bash
npm run dev                    # dev server, port 5173 (or .claude/launch.json "nexusq-dev")
npx tsc -b && npm run build    # type-check + production build (dist/)
node scripts/refresh-data.mjs  # refresh all data + forecast snapshots into public/data/
```

## Architecture in one paragraph

No backend. `scripts/refresh-data.mjs` snapshots ~24 series (FRED keyless CSV, Yahoo
Finance chart API — server-side only, World Bank, IMF WEO; EIA STEO if `EIA_API_KEY` set)
plus model forecast fans into `public/data/*.json`, committed to git. A GitHub Actions
cron (`refresh-data.yml`, weekdays 06:20 UTC) re-runs it and pushes, which triggers
`deploy.yml` (Pages). The React 19 + TypeScript + ECharts 6 SPA loads those JSONs and
computes everything client-side: transforms and correlations (`src/lib/transform.ts`),
signals (`src/lib/signals.ts`), rendering (`src/components/`). Full details:
`docs/TECHNICAL.md` (docs/ is **gitignored** — internal strategy lives there, never
commit it).

## Hard rules (project conventions — do not violate)

- **Never add a dual-axis chart.** Mixed units go through transforms (indexed/z-score/YoY).
- **Color follows the entity**: selected series keep their `--series-N` slot via the
  persistent slot map in `App.tsx`; never repaint survivors on selection change.
- Palette = validated reference dataviz palette in `src/theme.css` (light+dark via
  CSS custom properties + `data-theme`); read tokens with `readTokens()`, never hardcode
  hex in components. Severity/status always renders color + icon + label, never color alone.
- Correlations on **log-returns, never levels** (differences for series that can be ≤ 0).
- Forecast honesty: fans are P10–P90 with damped drift — the band is the product. Every
  projection view keeps the "not investment advice" caption. "Data through" vs
  "refreshed" stay separate in the header stamp.
- The repo is **public**: no keys in code (EIA key = env/Actions secret), no strategy
  content outside `docs/`, `public/CNAME` must stay (custom domain).
- ECharts: options rebuilt via `useMemo` keyed on `themeMode`; helper series are
  name-prefixed `__` and filtered from legend + tooltip. No `inside` dataZoom (hijacks
  page scroll) — slider only.
- Mobile: verify at 375px before calling UI work done (grid tracks need `minmax(0,1fr)`;
  the page must never scroll horizontally).

## State as of 2026-07-31 (end of session 1)

Live and pushed (`b01ef20`): full Signal dashboard (KPI strip, overlay + projections +
range slider, correlation matrix, signal cards, light/dark, responsive), forecast
pipeline (model fans + IMF WEO; EIA STEO wired but keyless), daily refresh + deploy
workflows, custom-domain config. DNS `nexus.gygante.com` → `cs-ox-wolf3794.github.io`
verified propagating.

**Open items (next session):**
1. Confirm GitHub Pages is serving at https://nexus.gygante.com (Settings → Pages →
   source "GitHub Actions", custom domain set, HTTPS enforced) and the two workflows ran green.
2. User to register the free EIA key and add repo secret `EIA_API_KEY` (guide written —
   unlocks STEO forecasts now, weekly inventories / Inventory Divergence signal later).
3. Medium-impact UI batch (agreed, not started): loading skeletons, micro-transitions,
   gradient masthead polish, footer lockup, PWA manifest + icons (installable).
4. Smaller UI: hide correlation-matrix cell labels < 480px; hide masthead tagline < 600px.
5. "Open the platform →" button on the gygante.com landing page (separate repo
   `cs-ox-wolf3794/gygante.com`).
6. Later: forecast calibration scoreboard from `forecasts.json` git history; rolling-beta
   upgrade of Energy Beta; `echarts/core` tree-shaking (bundle ≈ 437 KB gzip); first tests
   (pure functions in `src/lib/`).
