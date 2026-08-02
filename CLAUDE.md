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

**The platform is live, self-updating, and verified at https://nexus.gygante.com.**
Full Signal dashboard (KPI strip, overlay + projections + range slider, correlation
matrix, signal cards, light/dark, responsive). `EIA_API_KEY` repo secret is configured:
Brent/WTI/Henry Hub show **EIA STEO forecasts** (18 monthly points to Dec 2027, dashed
line + circle markers, verified rendering in production); other series use model fans;
GDP uses IMF WEO.

**Automation gotcha (found + fixed):** pushes made by a workflow with `GITHUB_TOKEN`
do NOT trigger `on: push` workflows — the refresh cron committed data but the site never
redeployed. Fix in `refresh-data.yml`: explicit `gh workflow run deploy.yml` dispatch
after a data commit (needs `permissions: actions: write`). The chain
refresh → commit → dispatch deploy is verified working end-to-end.

## Session 2 (2026-07-31, evening): intelligence layer

Ingested three internal docs (extracts in scratchpad; originals on user's machine/SharePoint):
Mariano's mask-based PBO paper (toxicity scores localize search fragility), his Quant
Developments deck (percentile-condition state models on energy futures + ConvLSTM tanker-flow
model, all PBO/DSR/WFO-validated), and Nexus.docx (Energy Beta/α/shock metric definitions +
Artem's "only slow-priced correlations are products" constraint). Synthesis + workflow map:
`docs/DOMAIN.md` §5.

Built: **Equity impact (Energy Beta board)** — ~15 energy-exposed stocks (impact.json),
rolling 90d β/α/R² vs Brent/WTI/HenryHub (`src/lib/beta.ts`), β-trend sparklines, shock
slider (first-order β×shock). **Sovereign impact** — GDP β to oil for 6 exporters + 6
importers + US, **Frisch–Waugh controlled for world GDP growth** (naive version printed
positive β for every country — COVID common shock + oil procyclicality; never regress
GDP on oil without the cycle control). Long-history annual oil averages in
impact.oilAnnual (FRED Brent preferred, Yahoo CL=F fallback); partial r and n always
displayed. World Bank fuel-export / energy-import intensity as mechanism columns.

Guidance layer: question presets (`PRESETS` in App.tsx — curated overlay states behind
question chips) + shareable view links (state ↔ URL hash: initializers on fresh load,
`hashchange` listener in-app, replaceState on change; "Copy view link" with clipboard →
execCommand → prompt fallbacks). Units audit done (USD/EUR, USD/share, USD/tonne, VIX
pts) — fixed in pipeline config AND patched into committed JSONs.

UI navigation layer: sticky section jump-bar (`SectionNav`, anchor ids kpis/overlay/
correlations/signals/equity-impact/sovereign-impact, `.anchor-target` scroll-margin),
cross-widget CTAs (`.cta-link`; signals carry `seriesIds` and "View in overlay" loads
them via `viewInOverlay`), and a per-widget `Freshness` badge (icon+label+date, cadence
aware: daily/monthly/annual) — every card header shows its own data vintage. Reuse
`Freshness` for any new widget.

Pipeline hardening from tonight's FRED outage: all fetches carry AbortSignal 30s
timeouts, and a mostly-failed run (< 80% series) ABORTS without touching
catalog.json/forecasts.json/impact.json — a degraded run must never overwrite good
committed data. (Also: `node script | tail` masks exit codes — don't.)

**Open items (next session):**
-1. TRUST ROADMAP (agreed 2026-07-31, do first): Phase 1 = pipeline QC checks →
   quality.json (staleness/gaps/5σ spikes/sanity ranges/count drift) surfaced in UI;
   start committing daily signals.json snapshots IMMEDIATELY (track-record clock);
   in-app Methodology page from DOMAIN §1–3 (sanitized — no §4–5/Rystad refs);
   CI tests for src/lib with known-answer fixtures + README badge.
   Phase 2 (~Oct, needs ~60d history): calibration scoreboard from git history of
   forecasts.json/signals.json; 95% CIs on betas; public data-lineage page.
   Phase 3: PBO/DSR-style validation badges per signal family; cross-source Brent
   check (FRED vs Yahoo BZ=F); source-outage banners; Mariano methodology review.
0. Workflow queue from the doc synthesis: Market State Score (percentile conditions —
   vol/trend/DXY free, CFTC COT free); Inventory Divergence (EIA key live); validation
   badges per signal (→ eventually PBO/DSR from outcome history); EUA↔steel pilot needs
   ICE carbon data; Flow Intelligence/NDI + Sentiment Pulse need Rystad AIS / news NLP.
1. Medium-impact UI batch (agreed, not started): loading skeletons, micro-transitions,
   gradient masthead polish, footer lockup, PWA manifest + icons (installable).
2. Smaller UI: hide correlation-matrix cell labels < 480px; hide masthead tagline < 600px.
3. "Open the platform →" button on the gygante.com landing page (separate repo
   `cs-ox-wolf3794/gygante.com`).
4. EIA weekly inventories (same key, `/v2/petroleum/stoc` routes) → Inventory Divergence
   signal from the strategy's signal family.
5. Later: forecast calibration scoreboard from `forecasts.json` git history; rolling-beta
   upgrade of Energy Beta; `echarts/core` tree-shaking (bundle ≈ 437 KB gzip); first tests
   (pure functions in `src/lib/`); consider publishing DOMAIN.md §3–4 as an in-app
   Methodology page.

**Decision (2026-07-31): no password gate.** The MVP stays open on purpose — it's the
proof-of-methodology / marketing artifact, and client-side gating on a public repo is
security theater anyway. Revisit when proprietary content lands: the real path is
Cloudflare Pages (private repo) + Cloudflare Access (free ≤ 50 users, email OTP), same
domain, ~1h migration.

Working habit: the user runs git themselves (`gh` CLI not installed) — hand them runnable
command blocks, and remember the data bot commits to `main`, so `git pull --rebase` before
any local commit.
