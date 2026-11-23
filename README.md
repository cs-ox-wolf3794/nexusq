# NexusQ 2.1.2

[![CI](https://github.com/cs-ox-wolf3794/nexusq/actions/workflows/ci.yml/badge.svg)](https://github.com/cs-ox-wolf3794/nexusq/actions/workflows/ci.yml)
[![Scheduled data refresh](https://github.com/cs-ox-wolf3794/nexusq/actions/workflows/scheduled-refresh.yml/badge.svg)](https://github.com/cs-ox-wolf3794/nexusq/actions/workflows/scheduled-refresh.yml)

**Market intelligence for capital markets — by Gygante Quantitative Systems.**

[Open NexusQ](https://nexus.gygante.com) · [2.1.2 release notes](CHANGELOG.md#212--2026-11-23) · [Changelog and earlier milestones](CHANGELOG.md)

NexusQ connects company returns, energy exposure and economic context in one research workspace. It helps analysts inspect the estimated energy contribution to a stock move, other modeled factors, the unexplained remainder and the supporting disclosures. Estimates, confirmed disclosures and possible explanations are explicitly separated.

**NexusQ 2.1 builds on the official 2.0 release.** It keeps the existing free infrastructure and analytical capabilities, with a connected investigation experience and a shared design system across desktop, tablet and mobile. Product release status is not a guarantee of source completeness, causal attribution, forecast accuracy or a market-data service level.

## NexSum and reading improvements

NexusQ opens with **NexSum**, a deterministic daily research brief built entirely from the existing verified free-source snapshot. It preserves the full research desk and all analytical workspaces.

- A dated common-close company screen, selected energy observations, an energy-related signal and source-validated guidance context link into existing investigations. Viewing, observation and calculation dates remain separate.
- A browser-local watchlist (up to 12 companies or markets), explicit “Mark as reviewed” comparison and suggested research steps help analysts resume work. Refresh timestamps alone do not count as changed insights. Changes to selections, eligibility or underlying content can change the brief.
- NexSI's company headline, company screen and NexSum company watchlist show the latest reported quote, its actual observation time and freshness. Completed closes and dated returns remain separate; the model does not attribute an unfinished session. Delayed/retained quotes remain labeled, invalid or older quotes cannot replace a newer close, and official spot observations retain their own publication dates.
- Eighteen curated questions cover stock moves, earnings and guidance, equity benchmarks, rates, volatility, oil, gas, storage, power costs, projects and exposure. Visible stock, capital-market and energy shortcuts lead to the existing analysis; the results scroll independently of the footer, with a continuous-scroll layout on short screens. Search retains companies, individual markets and every existing tool.
- Shared readable type uses a 16px body, generally 14px essential controls/dates and 12–13px secondary chart/metadata labels, with relative CSS units. Compact mode reduces spacing, not essential text size. Labels use sentence case; tickers/acronyms and canonical company brands retain their capitalization. Original provider company names remain in evidence.
- Light mode uses a muted blue-gray canvas, softer panels and ink text. Dark mode and the existing series/status semantics are retained.

NexSum adds no causal attribution, earnings-calendar predictions, paid feed or external AI service. It follows the existing publication checks automatically. A verified upcoming earnings calendar is explicitly unavailable; next cash-open checkpoints use the existing exchange calendar. Guidance coverage gaps remain separate from an explicitly evidenced no-guidance policy. Selection rules and caveats are available inside the brief.

## Language and display currency

Open **Language & currency** (EN/NO · USD/NOK) in the top bar. English (US) and Norwegian Bokmål are independent of USD/NOK. Preferences are saved in this browser and synchronized across its open tabs. Routes, selected companies, horizons, watchlists and live scenario assumptions survive a switch. Dates and numbers follow the chosen language; UTC and ET remain explicitly labeled. Norwegian stock, earnings, rates and energy queries work in search.

**Norsk:** Velg **Språk og valuta** øverst. Språk og visningsvaluta velges uavhengig. Analysen og valgene dine beholdes når du bytter.

- Monetary prices, quotes, watchlists, raw price charts, forecast levels and electricity-cost scenarios can display NOK using the free [Norges Bank USD/NOK reference](https://www.norges-bank.no/en/topics/statistics/exchange_rates/?id=USD). The rate's observation date, retrieval time and source remain visible. It is an indicative daily reference, not an intraday or tradable quote.
- Conversion uses one fixed dated NOK-per-USD rate. Historical price charts and future price scenarios are translated at that same rate; this is **not historical NOK investor performance or an FX forecast**. Returns, betas, percentage-point contributions, indices, quoted FX pairs and analytical inputs retain their original basis. Scenario inputs are stored canonically in USD so switching currency does not change the scenario.
- Source disclosures, quoted statements, source titles and original-language company summaries retain their wording and reported currencies. Norwegian analytical explanations, navigation, controls, methodology and alerts surround these explicitly labeled originals. New, unrecognized source text is preserved rather than silently machine-translated.
- The existing refresh workflow updates `fx.json` on full refreshes and quote-only runs. Identity, direction, unit multiplier and observation dates are validated. A failed check retains the last verified rate with a visible retained label; missing, future-dated or more-than-seven-day-old observations/retrievals disable conversion and retain explicitly labeled USD. An FX outage cannot stop the core publication.
- Translation messages live in `src/lib/locales/`; preferences, financial display conversion and chart localization are separate from model calculations. No external translation service, paid feed or new runtime dependency is used.

## Find the analysis

| Workspace | Analyst task | Included analysis |
| --- | --- | --- |
| **NexSum** | Read the daily brief and resume an investigation. | Dated key insights, local watchlist, reviewed-brief comparison, analyst research steps and the full research desk with search, signals and saved views. |
| **NexSI** | Explain stock moves and investigate AI/technology energy exposure. | Nasdaq-100 company screening; 1/5/20-session and recent major-drop attribution; energy, other modeled components and unexplained returns; event timing; earnings, guidance and company news; source coverage; data-center/power case studies and electricity-cost scenarios. |
| **Nexus Signal** | Understand cross-asset market relationships. | Market pulse, dated quotes, snapshot signals, market state, overlays and correlations, forecasts, equity energy sensitivity, sovereign GDP/oil associations and historical signal validation. |
| **Evidence & methods** | Assess whether an analysis can support a conclusion. | Observation and retrieval dates, source quality, analytical eligibility, forecast provenance, definitions, formulas, validation and limitations. |

### The connected investigation

1. Find a company or open an eligible move from the research desk.
2. Select a return window or a recent historical major drop. The contribution bridge, timeline and company summaries use that same window.
3. Inspect the energy estimate, other modeled components or unexplained remainder. The interval and model limitations remain visible; the full seven-component chart and exact diagnostics remain available.
4. Inspect a dated filing or reported headline. Primary disclosures, unreviewed reporting, earlier context and follow-up evidence are distinguished. Sources do not automatically establish a cause or receive a measured share of the return.
5. Continue to projects and power exposure, compare markets, inspect coverage, or save/share the investigation context.

Saved views and activity history are stored in the current browser, not a user account or server audit log. Shared links retain the company, time window and selected analysis; they reopen with the latest published data. Scenario assumptions persist only in the current session. The original analytical detail remains accessible through dedicated views and disclosures.

### Presentation and operational states

- Shared color, spacing and typography tokens; locally served IBM Plex fonts; aligned numeric figures; light/dark themes and compact/comfortable density.
- Responsive navigation and tables, keyboard-accessible tabs, global search and preserved investigation context.
- Separate labels for observations, model calculation, history retrieval, evidence checks and event publication. Full timestamps show their time zone; date-only observations remain dates.
- A scheduled US cash-session clock, persistent actionable data exceptions, nonblocking save/copy notifications and browser-local activity history. Scheduled market closure is not presented as a data failure.
- Data-provider credits and evidence links are retained. The app footer no longer links to the source repository.

### Established analytical capabilities

- **Cross-asset comparison:** up to six selected markets on a comparable axis, with indexed, z-score, year-over-year or permitted raw transformations. No dual-axis charts. Series retain their color assignment as the selection changes.
- **Correlation:** paired common observation intervals without forward filling; log returns where appropriate and differences for series that can be nonpositive. Incompatible frequencies are withheld.
- **Snapshot signals:** dislocation, momentum, curated correlation-regime changes and seasonal inventory-divergence conditions. Signals describe conditions; they do not by themselves demonstrate a forecasting edge.
- **Market state:** trend, volatility, dollar and CFTC managed-money-positioning context. The composite is a regime description, not a trading instruction.
- **Validation:** source-lag-aware, episode-collapsed event studies for supported daily signal families. Weekly inventory divergence is excluded. Revised histories and selection limits are disclosed.
- **Equity exposure:** rolling energy beta, alpha and fit diagnostics with a translator consistent with the fitted log-return slope.
- **Sovereign exposure:** cycle-controlled GDP/oil associations, sample sizes, correlations and World Bank energy-trade context; fiscal-year mismatches are withheld where applicable.
- **Forecasts and trust controls:** damped-drift uncertainty fans, dated external projections, source-aware QC, a daily signal/forecast ledger, coherent checksummed publications and visible failure states.

Nexus Model, Nexus Scenario, Nexus Portfolio and Nexus Agent remain planned workspaces; their broader roadmap capabilities are not claimed as shipped features of 2.1.

### Architecture

```
FRED / Yahoo Finance / Nasdaq / SEC / issuer disclosures / World Bank / IMF / EIA / CFTC
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
| Yahoo Finance chart API | ETFs, screened equities and model factor histories; timestamped quotes | adjusted completed-session histories are separate from quotes |
| Nasdaq public sources | Nasdaq-100 membership and the validated SanDisk history route | membership PDF checks; split treatment and source validation |
| SEC EDGAR and company disclosures | filings, earnings, guidance, company news and structured financial facts | source-linked summaries with coverage and timing limits |
| Company / Stock Analysis transcripts | supplemental management commentary | issuer and third-party sources distinguished; historical availability may be unverified |
| World Bank API | GDP growth and sovereign energy-trade context | annual |
| CFTC public reports | managed-money positioning | published weekly context; unavailable sources are surfaced |
| IMF WEO via World Bank Data360 | GDP-growth projections to +3y (keyless API and bulk-file fallback) | forecast layer; source-version dates preserved |
| EIA v2 API (optional) | STEO Brent/WTI/Henry Hub forecasts + weekly inventories | set free `EIA_API_KEY` |

### Forecast layer

`refresh-data.mjs` also writes `public/data/forecasts.json`:

- **Model fans** — per-series P10/P25/P50/P75/P90 projections (~90 days for daily series,
  ~6 months for monthly) from deliberately transparent statistics: half-weight ("damped")
  drift + EWMA volatility. The uncertainty band is the product, not the point estimate.
- **External forecasts** — IMF WEO GDP projections delivered by World Bank Data360; EIA STEO oil & gas forecasts when a
  key is configured.
- Versioned forecasts and the daily first-issued ledger support later calibration. Repository history is auditable but is not an independent immutable archive; collecting forecasts alone does not establish calibrated accuracy.

*Not investment advice. © 2026 Gygante Quantitative Systems.*

## Reliability and update operations

- `npm run refresh`: stage and validate a full analytical update, retaining individual failures. Requires `EIA_API_KEY` for weekly inventories and STEO. Missing credentials are reported; inventory histories are never removed from the catalog.
- `npm run refresh:quotes`: check the existing Yahoo ETFs and stocks. Quotes are separate from daily analytics. Redistribution permission must be established for client delivery.
- `npm run data:validate -- --manifest`: validate catalog/series/QC/forecast contracts and build the SHA-256 publication manifest.
- `npm run backtest`: regenerate event studies after analytical engine changes. Results with a different engine version are withheld by the UI. Regenerate the manifest after updating results.
- `NEXUSQ_DATA_DIR` selects an isolated data directory for validation runs. The default is `public/data`.

GitHub Actions schedules quote checks every five minutes, from 12:03 to 23:58 UTC on weekdays. The observation-age target remains **within 15 minutes during US market hours**, including retrieval and publication time; five-minute scheduling is not a delivery guarantee. Full analytical refreshes run at 06:19, 16:19, 18:19 and 22:19 UTC weekdays, plus Saturday 06:19. The static browser checks the manifest every minute and on return to the tab. The same infrastructure is retained: GitHub Actions, versioned JSON, GitHub Pages, no new paid service or runtime secret.

Every deployment now runs `node --import tsx scripts/verify-production.mjs` against the custom domain. It verifies every published data-file checksum, quote coverage and market-hours observation age, NexSI model integrity, company-news coverage and QC status. Results appear in the deployment's verification job. The UI flags delayed quotes using the reviewed US exchange calendar even when the provider reports a previous session. A closed-market check explicitly leaves the intraday target unevaluated.

NexSI supplements existing SEC filings and reported headlines with official Apple, Microsoft and Google newsroom feeds. Separate source-check records distinguish failed or stale retrieval, unparsed documents, available company announcements, reporting-only coverage and empty bounded source windows. No empty feed proves that no relevant news exists. Apple's update-only dates are not presented as first-publication times. Reviewed disclosures retain raw document fingerprints; selected re-reviewed visible-text fingerprints tolerate changing CDN scripts while still rejecting substantive source changes. Original statements, financial currencies, source titles and provider credits are preserved.

The Norwegian audit improves Bokmål phrasing, signal terminology, ordinal percentiles, localized dates and decimals. Monetary displays retain fixed precision and can wrap the unit at narrow widths. Power-cost assumptions accept Norwegian decimal commas; language and display-currency changes preserve canonical USD inputs.

Production verification on 23 November 2026 exercised both full and quote-only workflows through deployment. The final full snapshot at 09:03 UTC had 119/119 quotes, 101 NexSI securities, 99 daily models and zero core or supplementary source exceptions; all 38 live files matched their published checksums. Company-news source checks were available for every security: 34 had company announcements, 2 filing-only context and 65 reported-news context. These bounded feeds do not establish exhaustive news coverage. The US market was closed, so the runs do **not** certify scheduled cadence or sustained 15-minute market-hours delivery. See [release verification](CHANGELOG.md#211--2026-11-23) for workflow links.

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

### NexSI — AI capital markets and energy

The **NexSI** tab (`#page=nexsi&company=NVDA&horizon=1`) screens every security in the latest validated public Nasdaq-100 membership PDF. The default broad AI/technology screen combines the official NDXT subset with explicit cloud, semiconductor, hardware, software and application classifications; all constituents and power suppliers remain selectable. Inclusion is a research scope, not a claim of material AI revenue. Published membership must be at most 45 days old. Separate share classes are separate securities; no index weights are republished.

`npm run refresh:nexsi` refreshes NexSI alone; full refreshes include it as secondary enrichment. It requires Python with `pypdf==6.21.4` for the official membership PDFs (`NEXSI_PYTHON` can select the interpreter). Actions installs the pinned reader. No hosted model, paid feed, new service or new secret is used. The existing `EIA_API_KEY` supplies optional state commercial electricity benchmarks. Yahoo supplies adjusted daily stock/ETF/futures histories and timestamped quotes. SanDisk has a validated free Nasdaq history route with a checked Yahoo fallback and explicit split treatment. SEC submissions, issuer disclosures and Yahoo RSS provide dated evidence links. Quote checks now include every screened stock. Source-specific failures remain visible; broad failures retain and suspend the prior analytical snapshot.

Attribution fits pre-event adjusted stock log returns on SPY, QQQ-minus-SPY, IEF, WTI futures and Henry Hub futures over up to 252 exactly matched intervals, minimum 126. The 1/5/20-session and recent major-drop views reconcile conditional factor contributions and an unexplained residual to the actual arithmetic return. Newey–West parameter intervals, extrapolation flags and rolling held-out explanatory checks are published. Controls absorb some indirect energy effects and contain some screened stocks; futures rolls and differing closes remain limitations. This does **not** identify exact causes or a total causal energy share. News/filings are candidate context; the residual is not automatically company news. Analytics expire after 72 hours and are separate from best-effort 15-minute quotes.

`nexsi.json` contains membership, model output, events and source status. `nexsi-prices.json` preserves the 850-observation inputs used in that snapshot for reproducibility; both are checksummed in the publication manifest. Structural checks account for all constituents and validate exact return reconciliation and pre-event fit boundaries. Histories are vendor-revised, not point-in-time vintages; current-member selection is unsuitable for a historical index backtest.

Project case studies in `src/lib/nexsi-projects.ts` link dated primary disclosures, distinguish operators from suppliers and generation capacity from IT/facility demand, and explicitly identify announced versus reported operating status. This registry is manually reviewed, not a complete or automatically current project census. The electricity calculator uses user assumptions: MW × 8,760 × load factor × PUE (IT only) × USD/MWh change × exposed share. It makes no EPS or share-price conversion and must not use a generation PPA as facility demand. EIA state commercial rates are context, not data-center tariffs; observations expire 150 days after month end.


### Earnings, guidance and company-news coverage

NexSI combines source-linked issuer disclosure summaries with SEC structured financial facts where eligible. Official company transcripts and third-party transcripts are distinguished, and transcript availability during a selected move is not inferred from a related SEC filing timestamp. Refreshes validate source identity and document references, retain the dates of supported prior evidence, and surface incomplete coverage.

Guidance states distinguish quantitative, qualitative and limited outlooks, withdrawn or explicitly not-issued guidance, and missing coverage. Coverage extensions include AAPL, MELI, PDD and MSTR. No summary is treated as proof that a company never issues guidance. A statement by management is evidence of what was disclosed, not verification that the forecast or an asserted cause is true. The unexplained return is not allocated to news.

### Checks and release history

Use Node.js 22 for the supported workflow. Run `npm test`, `npm run lint`, `npm run data:validate` and `npm run build` before publication. Membership-PDF integration checks also use the Python reader described above. The 2.1 release baseline includes 252 regression tests across 27 files; the CI result is authoritative as tests evolve. Browser checks cover desktop, tablet and 375-pixel phone layouts, connected investigation controls, timestamps, alerts and notifications.

See [CHANGELOG.md](CHANGELOG.md) for the 2.1 and 2.0 changes and a commit-linked history of earlier work. Older milestones are summarized as untagged development history, not invented prior releases. Analytical engine versions are separate from the product's 2.1.0 version.

The bundled IBM Plex fonts retain their [Open Font License](public/fonts/IBM-Plex-OFL.txt). Data-provider and redistribution requirements continue to apply; free access does not by itself confer redistribution rights.


