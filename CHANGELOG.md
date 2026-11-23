# NexusQ releases

## 2.1.3 — 2026-11-23

- Added separately identified, delayed Yahoo Finance NYMEX futures quotes for Brent, WTI and Henry Hub in NexSum and Nexus Signal. Side-by-side FRED spot values keep their original observation dates; historical analytics and completed-session NexSI methodology are unchanged.
- Added futures identity/venue/unit checks, timestamp-regression protection, retained/missing/invalid states and separate energy freshness alerts. Futures are excluded from US cash-market quote counts and calendar assumptions. Unknown provider delays and unspecified delivery months remain explicitly unknown.
- Linked Yahoo quotes, CME contract definitions and FRED/EIA observations, with rollover/basis and refresh-window disclosures. Added Norwegian translations, precise gas units and existing NOK conversion support across desktop, tablet and mobile.
- Validation: 298 automated tests; an isolated live retrieval returned all 122 quotes, including all three energy futures, with no failures and byte-identical FRED historical files. Responsive preview checked at 1440, 820 and 375 pixels, including Norwegian/NOK, English/USD and both themes. Production deployment [45250473845](https://github.com/cs-ox-wolf3794/nexusq/actions/runs/45250473845) and CI [45250473742](https://github.com/cs-ox-wolf3794/nexusq/actions/runs/45250473742) passed.

### 23 November — independent backup recovery verified

- Deployed the approved free Cloudflare backup for the existing GitHub pipeline, without changing app hosting or market-data sources. It checks live checksums every five minutes, detects due quote/full refreshes and avoids competing work.
- Added a signed, expiring backup entry point, replay checks, duplicate suppression and distinct automatic-origin metadata. Manual recovery cannot reset the automatic-publication timestamp; Cloudflare recovery does not reset GitHub's own scheduled timestamp.
- Added English/Bokmål automatic-publication provenance to the quote panel and preserved individual price-age warnings. All 292 tests pass; type checks, lint, data-contract validation, app build and a native Workers-runtime integration test also pass. GitHub CI now runs the runtime integration test independently of the app tests.
- Stored signing secrets encrypted in GitHub and Cloudflare; the backup uses dedicated repository-scoped Actions access. Replayed/expired tickets, invalid signatures and manual reruns cannot receive automatic-publication credit.
- The first real cron event at 18:35 UTC exposed Cloudflare's rejection of Node's `redirect:error` fetch option. Switched to `redirect:manual` with explicit non-2xx rejection, preserving credential/host protection. The native-runtime test covers signed dispatch, checked publication, fresh-data no-op and redirect rejection.
- Verified three actual automatic publications with the primary GitHub schedule disabled: full recovery [45240921089](https://github.com/cs-ox-wolf3794/nexusq/actions/runs/45240921089), then normal quote recoveries [45242654333](https://github.com/cs-ox-wolf3794/nexusq/actions/runs/45242654333) and [45243511235](https://github.com/cs-ox-wolf3794/nexusq/actions/runs/45243511235). The full recovery used a bounded operator request serviced by actual cron; that temporary request was removed after success.

| Live verification (UTC) | Quote publication (UTC) | Quotes within target | Oldest observed quote at check |
| --- | --- | --- | --- |
| 18:43:30 | 18:42:12 | 119/119 | 3.04 minutes |
| 18:52:08 | 18:51:06 | 119/119 | 1.99 minutes |
| 18:57:12 | 18:56:13 | 119/119 | 2.86 minutes |

Each check verified all 38 file checksums, 101/101 securities, 99 eligible daily models and no core or supplementary source failures. Company-news coverage remained explicit: 34 confirmed, 2 filing-only and 65 reporting-only; this does not establish exhaustive news coverage. The 18:45 cron correctly skipped fresh data. The open Norwegian client picked up the automatic publication and cleared the refresh warning without another reload. Observed Worker CPU was 2–6 ms, within the free 10 ms allowance.

**Delivery restored with verified independent recovery.** The primary scheduled workflow was re-enabled at 18:57 UTC and its active state was confirmed with a fresh API read after an initially stale restoration response. GitHub's original scheduling fault remains unresolved; its internal cause has not been established. The backup covers a missing trigger, while GitHub runners, Pages, credentials and upstream providers remain dependencies. Renew the dedicated token before its chosen expiry. Historical incident entries below describe the state at their stated times.

## 2.1.2 — 2026-11-23

- Re-registered the inactive scheduled-refresh trigger through the authenticated repository maintainer account and re-enabled the workflow. Manual runs had worked while no scheduled run was created; the previous manual-only verification did not establish unattended delivery.
- Re-registered five-minute quote checks at 12:03–23:58 UTC weekdays and full refreshes at 06:19, 16:19, 18:19 and 22:19 UTC weekdays, plus Saturday 06:19. Kept the existing free infrastructure and source contracts.
- Recorded each quote refresh's actual trigger and workflow run in the data publication. Post-deployment verification now fails on missing quotes or a market-hours 15-minute breach, while leaving published data and explicit source warnings available.
- Corrected displayed schedule times and restored all 119 quote updates during live trading. Company records were present; the reported missing portfolio was the list of delayed quote updates, not missing constituents.
- Separated scheduled triggering into `scheduled-refresh.yml`, calling the existing refresh pipeline with the same permissions and source secrets. The original pipeline remains available for manual recovery. This creates a distinct schedule registration after re-enabling the old one did not produce runs.
- Fixed NexSI's headline price and NexSum's company watchlist still showing only the previous close after quote updates. Latest reported quotes now appear prominently with observation time and freshness, including in the company screen. Daily returns, modeled energy contributions and completed-close context retain their original basis. Delayed quotes cannot produce a claim about the current move; invalid, wrong-currency or older quotes cannot replace a more recent close.
- Added regression checks for current, stale, retained, invalid, missing-history and same-session quotes. All 270 tests, type checks, lint and the production build passed; the additional scheduler-status regression passed with the timestamp tests.
- Keep the last actual scheduled publication separately from manual recovery. A manually recovered quote no longer clears an unverified automatic-refresh alert; the UI preserves quote-level freshness independently.
- Replaced combined minute range/step syntax with explicit minute enumeration, preserving the intended times. Added a schedule-contract test covering five-minute spacing and routing to quote-only processing. Market-hours production verification also fails when a recent actual scheduled publication is missing, even when manually recovered prices are fresh. All 272 tests and data validation pass.
- Added a fresh publication-manifest URL on each client poll to prevent CDN caching from extending data age after deployment. Unchanged publications still avoid downloading the full dataset; changed files must match their published checksums. A regression test covers this cache boundary.

**Incident remains open at 16:57 UTC on 23 November.** The live publication contained 119/119 quotes within 15 minutes, 101/101 securities, 99 eligible daily models and no core or supplementary source failures. These prices came from [manual recovery](https://github.com/cs-ox-wolf3794/nexusq/actions/runs/45220402106), with the [full source refresh](https://github.com/cs-ox-wolf3794/nexusq/actions/runs/45217219692) also successful. The last actual scheduled run remained [20 November, 15:28 UTC](https://github.com/cs-ox-wolf3794/nexusq/actions/runs/44763689149). The enabled replacement schedule and explicit minute list had not yet produced an automatic run; the scheduler's internal cause is unconfirmed. Post-deployment health verification correctly fails on this condition. Manual recovery is not evidence of sustained or unattended delivery. An independent free scheduler has been proposed, subject to approval to expand the existing-infrastructure constraint.

## 2.1.1 — 2026-11-23

Norwegian usability, company-news coverage and production-freshness audit.

- Refined Bokmål across the daily brief, market signals, news coverage and operating alerts. Corrected context-sensitive positioning labels, percentile endings, percentage spacing, grouped numbers and monetary precision. Added decimal-comma entry to power-cost assumptions and fixed long NOK values overflowing narrow tiles.
- Preserved original source statements, source titles, reported currencies and provider credits. Language and currency settings continue to leave analytical inputs and returns unchanged.
- Expanded automatic SEC news extraction for completed acquisitions, investment terms, dividends, debt issuance, buybacks and product-sales updates. Added official Apple, Microsoft and Google newsroom feeds with explicit publication/update timing and retained-source dates on failures.
- Distinguished missing/stale source coverage, incomplete document summaries, company announcements, unverified reporting and empty bounded source windows. No headline or empty feed is treated as proof of a cause or of no relevant news.
- Rechecked affected reviewed disclosures and added exact visible-text fingerprints alongside raw file fingerprints. Changing SEC security scripts no longer remove those reviewed summaries; changed disclosure text still requires verification. Fixed cross-platform Unicode feed parsing and kept source failures visible.
- Increased scheduled quote checks to every five minutes within the existing weekday window. The 15-minute target is measured from observation time; calendar-based QC flags old observations even after a successful retrieval or stale provider session metadata.
- Added post-deployment verification of all live data checksums, quote coverage/freshness, NexSI models and news coverage, and QC status. Closed-market runs explicitly do not certify the intraday target. Free-provider and GitHub scheduling/deployment delays remain limitations.
- Product version 2.1.1; attribution and signal-model formulas are unchanged.
- Live verification found and repaired a legacy HTTP link in Yahoo's Diamondback news feed, using the same publisher's HTTPS endpoint. Other insecure links still fail validation. QC now includes per-company evidence-source failures in its count.
- Fixed the activity-history heading wrapping on narrow Norwegian screens and localized retained NexSI source-status messages.
- Kept navigation and healthy workspaces available when an analysis cannot load after a deployment or connection failure. Added a translated recovery message and reload action with an explicit warning about resetting unsaved scenario inputs.
- Clarified when official newsroom headlines are present but full-text announcement summaries are unavailable, avoiding a misleading claim that no source item was retrieved.

Verification before publication: 265 tests across 28 files, type checks, lint, data-contract validation and production build passed. Repeated full-source refreshes resolved transient retrieval/budget failures; the final local run reported 101 securities, 99 eligible daily models and no source errors. News coverage was 34 securities with company announcements, 2 with filing-only context and 65 with reported-news context. All had successful feed checks; this is not exhaustive or uniformly primary-source news coverage. Guidance coverage was preserved, including limited outlooks, no-numerical-guidance assessments and company policy. Sustained market-hours delivery cannot be certified from a closed-market run.

Production verification on 23 November: the [full refresh](https://github.com/cs-ox-wolf3794/nexusq/actions/runs/45143534818) and [quote-only refresh](https://github.com/cs-ox-wolf3794/nexusq/actions/runs/45142528349) completed through publication. The final full snapshot at 09:03 UTC contained 119/119 quotes, 101 NexSI securities, 99 daily models, no missing feed checks and no core or supplementary source exceptions. All 38 live data files matched the publication manifest. The market was closed: these manually initiated workflow runs verify the automated processing path, not scheduled market-hours cadence or sustained 15-minute delivery.

## 2.1.0 — 2026-11-23

NexSum becomes the opening brief, with a more readable design and independent English (US)/Norwegian Bokmål and USD/NOK settings. Existing analysis and free sources are preserved.

- Added NexSum as the opening daily brief, with dated evidence, a personal watchlist, changes since an explicit review, analyst research steps and linked investigations. All prior research-desk information remains available.
- Added stock, capital-market and energy research questions and topic suggestions to global search. Fixed result rows spilling over the footer; results now have a bounded scroll area, with a continuous-scroll layout on short screens.
- Replaced the sidebar slogan with a plain-language guide to observed, estimated and unexplained results and a link to methods and coverage.
- Increased small type across the app, standardized label/company capitalization and softened the light palette. Both density settings retain readable text.
- Preserved existing free sources, attribution models, source checks, provider credits and all analytical views. No upcoming earnings date is invented; missing guidance is distinct from an evidenced company policy.

### Language and currency

- Added persistent, independent language/currency controls, locale-aware dates and numbers, Norwegian research search, translated workspaces, methodology, explanations, alerts and chart labels.
- Added free Norges Bank daily USD/NOK reference data, validated publication and automatic full/quote-run refresh. Failed refreshes retain dated rates; unusable or stale rates fall back explicitly to USD.
- Converted displayed prices, quotes, watchlists, raw monetary charts/forecasts and power-cost scenarios. Fixed-rate display conversion leaves all model inputs, returns, beta estimates and attribution unchanged. Switching currencies preserves canonical scenario assumptions.
- Preserved original-language disclosures, company summary wording, source titles and reported financial currencies, with clear labels. No automatic translation is presented as an issuer statement.
- Added regression checks for preferences, Norwegian search and uncertainty wording, FX direction/units/freshness/retention, chart-data preservation and language-independent brief review signatures. US date expectations now follow en-US; timestamps keep explicit time zones.
- Product version 2.1.0; analytical engine versions remain unchanged.

### Verification

- 252 regression tests pass, together with type checks, lint, publication validation and the production build.
- Verified desktop, tablet and 375px mobile layouts, independent language/currency choices, saved preferences, translated search/filters and unchanged scenario assumptions.
- GitHub CI and Pages deployment passed. A production quote-refresh run also published a freshly retrieved, validated Norges Bank rate while preserving its original observation date.

## 2.0.0 — 2026-11-22

NexusQ 2.0 brings company-move investigation, energy exposure, market relationships and source evidence into one connected research experience. This is the first tagged product release; the earlier milestones below were previously untagged.

### Connected research workspaces

- A research desk opens with analyst questions, eligible stock moves, market signals and browser-local saved investigations.
- NexSI connects a selected company and return window to energy-associated estimates, other modeled factors, an unexplained remainder, a dated event timeline and the original sources.
- Selecting a contribution reveals its interpretation and limitations. Selecting an event reveals its source and whether it preceded, occurred during, or followed the move.
- Primary issuer filings and unreviewed reporting remain distinct. Missing coverage is explicit; news is never assigned an unmeasured share of the return.
- Full component charts, exact contributions, model diagnostics, earnings and guidance summaries, company news, price histories, projects and scenarios remain accessible.
- Nexus Signal organizes market pulse, comparisons, exposure and validation into dedicated views. Company and market selections persist across the research flow.
- Global search, keyboard-accessible tabs, deep links, saved views and Back/Forward support help users return to the same investigation context. Saved views reopen with current data; they are not frozen research reports.

### Visual system and operational clarity

- Refined NexusQ identity, shared color and spacing tokens, locally served IBM Plex typography, aligned numeric figures, light/dark themes and compact/comfortable density.
- Responsive desktop, tablet and phone layouts preserve table access without page-level horizontal scrolling.
- Observation dates, model calculation, history retrieval, source checks and event publication are labeled separately. Date-only observations do not acquire invented times.
- The market clock describes the published exchange schedule, including verified holidays and early closes, rather than claiming live exchange verification.
- Data exceptions remain visible until resolved. Routine save/copy confirmations do not shift the analysis. A browser-local activity history records application actions and publication checks.
- Quote-overdue alerts respect the existing weekday schedule and the first scheduled check's grace period. Scheduled closure alone is not a source failure.
- The public repository link has been removed from the app footer. Existing data-provider credits, evidence links and methodological disclosures are retained.

### Analytical and source foundations included in 2.0

- Verified publications, source-aware freshness, fail-closed analytical eligibility, retained observation dates and visible failure/recovery status.
- IMF WEO forecasts delivered through World Bank Data360, with official API/bulk-file fallback, source-version validation and expiry.
- Audited interval matching, publication-lag handling, forecast dates and units, baseline construction, adjusted-close QC and statistical limitations.
- Nasdaq-100 NexSI coverage with conditional pre-event attribution, reconciled return components, parameter uncertainty, extrapolation warnings and held-out explanatory checks.
- SanDisk history recovery through a validated free Nasdaq route with checked Yahoo fallback and explicit split treatment; EIA electricity-unit corrections and source diagnostics.
- Source-linked earnings, guidance and company-news summaries, including SEC structured financial facts and carefully labeled issuer/third-party transcript context.
- Guidance coverage for AAPL, MELI, PDD and MSTR distinguishes quantitative, qualitative or limited outlooks, withdrawn/not-issued guidance and missing coverage. A missing summary never proves that a company issues no guidance.

### Operating boundaries

The existing free infrastructure remains GitHub Actions, versioned JSON and GitHub Pages. Quote checks target 15-minute intervals during the configured weekday window; provider delays, scheduling and deployment mean this is best effort. Daily attribution uses completed sessions and does not update from intraday quotes. Model estimates are associations, not identified causes or trading recommendations. Project case studies are manually reviewed, not an exhaustive live project census.

The product version is now **2.0.0**. Existing analytical engine identifiers remain unchanged; this release does not silently change fitted model definitions or republish calculated data.

## Earlier milestones — previously untagged

These entries summarize repository history, not retroactively published releases. Automated data-snapshot commits are omitted.

| Date | Milestone | Implementation references |
| --- | --- | --- |
| 2026-11-22 | Major-drop explanations, dated evidence, company disclosure summaries, structured financial coverage and explicit guidance-availability states. | [Drop explanations](https://github.com/cs-ox-wolf3794/nexusq/commit/498b8f9), [disclosure summaries](https://github.com/cs-ox-wolf3794/nexusq/commit/58ab5cc), [financial coverage](https://github.com/cs-ox-wolf3794/nexusq/commit/10158bc), [guidance](https://github.com/cs-ox-wolf3794/nexusq/commit/43290ef) |
| 2026-11-21 | NexSI AI equities and energy attribution; source retry/recovery, electricity-unit checks, SanDisk history restoration and consistent NexSI/Signal presentation. | [NexSI](https://github.com/cs-ox-wolf3794/nexusq/commit/a18942a), [electricity units](https://github.com/cs-ox-wolf3794/nexusq/commit/95b8f2f), [SanDisk and UI](https://github.com/cs-ox-wolf3794/nexusq/commit/e03966d) |
| 2026-11-21 | Publication-integrity and freshness controls, IMF forecast delivery recovery, end-to-end methodology audit, mobile/tablet table fixes and Pages deployment repair. | [Publication checks](https://github.com/cs-ox-wolf3794/nexusq/commit/7fa009b), [Data360](https://github.com/cs-ox-wolf3794/nexusq/commit/7697b76), [methodology audit](https://github.com/cs-ox-wolf3794/nexusq/commit/c0ee080), [responsive tables](https://github.com/cs-ox-wolf3794/nexusq/commit/05fbd8e), [deployment](https://github.com/cs-ox-wolf3794/nexusq/commit/d424879) |
| 2026-08-03–05 | Refresh-job recovery, World Bank request validation and UI improvements. | [Refresh recovery](https://github.com/cs-ox-wolf3794/nexusq/commit/8c059e2), [World Bank validation](https://github.com/cs-ox-wolf3794/nexusq/commit/aae7896), [UI](https://github.com/cs-ox-wolf3794/nexusq/commit/d03d676) |
| 2026-08-02 | Initial QC, daily signal/forecast ledger, CI and methodology page; backtesting, market state and inventory-divergence analysis. | [Trust layer](https://github.com/cs-ox-wolf3794/nexusq/commit/149f5fa), [backtesting](https://github.com/cs-ox-wolf3794/nexusq/commit/1b7c412), [market state](https://github.com/cs-ox-wolf3794/nexusq/commit/459f65c) |
| 2026-07-31 | Nexus Signal MVP, forecast fans and external projections, equity/sovereign exposure and automated deployment. | [Initial MVP](https://github.com/cs-ox-wolf3794/nexusq/commit/0b997ce), [forecasts](https://github.com/cs-ox-wolf3794/nexusq/commit/0b6b442), [exposure](https://github.com/cs-ox-wolf3794/nexusq/commit/b503a85), [deployment dispatch](https://github.com/cs-ox-wolf3794/nexusq/commit/8dc1ef2) |

