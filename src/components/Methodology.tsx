import { NexsiMethodology } from "./NexSI";
/** Public specification. Formula changes must also advance ENGINE_VERSION. */
export function Methodology() {
  return <div className="methodology">
    <NexsiMethodology id="global-nexsi-methodology" />
    <section className="card">
      <h2>Methodology and data reliability</h2>
      <p className="sub">NexusQ describes observed market relationships. Statistical association does not identify a causal shock or establish a trading edge. Every result depends on the quality, timing and scope of its inputs.</p>
      <ul className="method-list">
        <li><strong>Observation time is separate from retrieval time.</strong> Re-downloading an old observation does not make it current. Each source's cadence and last successful retrieval appear in Data status.</li>
        <li><strong>Quotes and analytical observations are separate.</strong> Yahoo quotes target checks every 15 minutes on weekdays, 12:00–23:59 UTC. The browser checks for published updates every minute. Provider delays, outages and GitHub scheduling mean this is best effort, not a guaranteed real-time service. Quotes do not enter daily backtests, betas or forecast histories.</li>
        <li><strong>Unusable current inputs are withheld.</strong> Missing, overdue or flagged QC inputs cannot generate current signals or projections. Historical data remains visible with its status. A quality assessment older than 72 hours also suspends current analysis.</li>
        <li><strong>One comparable axis.</strong> Mixed units require a transformation. No dual-axis charts. Indexed comparisons need a strictly positive base; rates and GDP growth use raw percentage units or z-scores. Monthly values are plotted at period end, which is not a release timestamp.</li>
        <li><strong>No automatic certification.</strong> Range and spike checks are review triggers, not proof of a bad observation. Passing them does not independently verify a provider's accuracy.</li>
      </ul>
    </section>

    <section className="card">
      <h3>Sources, observation periods and freshness</h3>
      <div className="table-wrap"><table className="beta-table">
        <thead><tr><th>Source / data</th><th>Publication basis</th><th>Operational tolerance</th></tr></thead>
        <tbody>
          <tr><td>FRED prices, yields and indices</td><td>Completed daily observations with source-specific publication lags</td><td>7 calendar days since observation</td></tr>
          <tr><td>Federal Reserve H.10 via FRED: broad dollar and USD/EUR</td><td>Daily observations published in weekly batches; the broad dollar index is not ICE DXY</td><td>12 calendar days</td></tr>
          <tr><td>IMF commodity benchmarks via FRED</td><td>Monthly period averages, not tradable intraday TTF, coal, copper or wheat quotes</td><td>60 days from month end</td></tr>
          <tr><td>CPI and industrial production</td><td>Monthly, subject to revision</td><td>45 days from month end</td></tr>
          <tr><td>EIA inventories and CFTC positioning</td><td>Weekly reporting periods; publication follows the observation date</td><td>14 calendar days</td></tr>
          <tr><td>World Bank GDP</td><td>Annual observations, subject to revisions</td><td>550 days from year end</td></tr>
          <tr><td>Yahoo daily stocks and ETFs</td><td>Completed closes for display; adjusted closes for equity return calculations</td><td>7 calendar days; current-day bars excluded until five minutes after the reported close</td></tr>
          <tr><td>Yahoo intraday quotes</td><td>Reported market timestamp, currency and delay shown separately</td><td>15 minutes during the reported session; an old session cannot prove today's exchange is closed</td></tr>
        </tbody>
      </table></div>
      <p className="sub">Tolerances are explicit operational policies, not release-date guarantees. Monthly FRED observations are dated at the start of their reference month; freshness uses the end of that month. National holidays, suspensions and unexpected releases can require review. Sources can revise historical values.</p>
      <p className="sub">Source documentation: <a href="https://fred.stlouisfed.org/series/PNGASEUUSDM" target="_blank" rel="noreferrer">IMF monthly benchmarks</a> · <a href="https://fred.stlouisfed.org/series/DTWEXBGS" target="_blank" rel="noreferrer">Federal Reserve broad dollar index</a> · <a href="https://www.eia.gov/opendata/faqs.php" target="_blank" rel="noreferrer">EIA API release delays</a> · <a href="https://help.yahoo.com/kb/finance/article-exchanges-data-delays-sln2310.html" target="_blank" rel="noreferrer">Yahoo coverage and delays</a></p>
    </section>

    <section className="card">
      <h3>Publication and failure handling</h3>
      <ul className="method-list">
        <li>Downloads have timeouts and bounded retries, including response-body parsing. The Yahoo alternate host uses the same instrument and provider; it is transport redundancy, not independent verification.</li>
        <li>Dates must be real, strictly ordered, unique and not in the future. Values must be finite numbers. Regressing latest dates, material history shrink and missing previously observed dates reject a replacement.</li>
        <li>Failed instruments keep their last validated observations and explicit failure status. Annual source outages do not stop daily market updates. A refresh with fewer than 80% of core FRED/Yahoo market series fetched, or an incomplete catalog, is rejected.</li>
        <li>Files are staged and checked before publication. A checksum manifest binds the published set. The browser accepts the complete verified set or keeps its previous verified snapshot; it never combines partially loaded generations.</li>
        <li>Each source is checked for overdue observations, history gaps, plausible latest-value ranges and large moves against preceding observations. The tested spike is excluded from its volatility reference. Flagged data is retained for inspection.</li>
        <li>Brent spot exposure is never silently replaced by WTI futures. A source outage cannot change the economic meaning of an instrument.</li>
      </ul>
    </section>

    <section className="card">
      <h3>Transforms, signals and market state</h3>
      <div className="table-wrap"><table className="beta-table">
        <thead><tr><th>Measure</th><th>Calculation</th><th>Limits</th></tr></thead>
        <tbody>
          <tr><td>Indexed overlay</td><td>100 × value / first visible value</td><td>Strictly positive base required; actual base dates are disclosed. Price comparison, not investment total return</td></tr>
          <tr><td>Window z-score</td><td>(value − visible-window mean) / population standard deviation</td><td>Descriptive, window-relative</td></tr>
          <tr><td>Year-on-year change</td><td>100 × (value / prior-year value − 1)</td><td>Calendar anniversary, at most seven days of backward matching; computed before clipping the display window. Disabled for yields and GDP growth rates</td></tr>
          <tr><td>Correlation</td><td>Pearson correlation on matched observation intervals; log returns for prices, differences for rates or nonpositive histories</td><td>No forward-filled returns; same cadence only; at least 20 paired changes; sample size and input date disclosed</td></tr>
          <tr><td>Dislocation</td><td>Latest value versus trailing 252 observations for daily series, 36 for monthly</td><td>Full reference window required; current observation included. Yahoo uses adjusted closes; CPI and industrial production use year-on-year growth, avoiding routine index trends masquerading as anomalies. |z| thresholds remain 1.5 / 2 / 2.5</td></tr>
          <tr><td>Momentum</td><td>100 × (50-observation mean − 200-observation mean) / |200-observation mean|</td><td>Daily price series only; adjusted closes for Yahoo. Yield/breakeven percentage momentum is withheld. Thresholds 2% / 6% / 12% describe trend, not continuation</td></tr>
          <tr><td>Correlation regime</td><td>Correlation over 120 calendar days minus correlation over one year</td><td>Thresholds |Δρ| 0.15 / 0.30 / 0.45; diagnostic, not causal</td></tr>
          <tr><td>Inventory divergence</td><td>Weekly inventory z-score versus a ±15-day calendar window in the previous five years, crossed with price dislocation</td><td>Inventory z ≥ 1.5 with price z ≥ 1, or inventory z ≤ −1.5 with price z ≤ −1; descriptive co-occurrence, not proof of surplus/deficit or future direction. Both dates are shown; leap years share one calendar</td></tr>
        </tbody>
      </table></div>
      <p className="sub">Market state ranks trend, realized volatility, broad-dollar change and managed-money net/open interest against their own histories, using half weight for ties. Direction labels use the actual sign of the change, independently of percentile rank. Volatility uses the sample standard deviation of 20 consecutive valid returns, annualized by √252; gaps and nonpositive prices cannot silently reuse older volatility. The supportive-direction average is a heuristic description: below 35 headwinds, 35–65 mixed, above 65 constructive. Missing conditions change the composition and are omitted, with at least three required. The limiting date includes the dollar input. Brent positioning is the thin NYMEX Last Day proxy, not outright ICE Brent positioning. Neither the condition weights nor the labels establish return predictability.</p>
    </section>

    <section className="card">
      <h3>Exposure estimates and forecast uncertainty</h3>
      <ul className="method-list">
        <li><strong>Equity beta:</strong> OLS of adjusted stock log returns on energy-driver log returns over 90 matched daily intervals. Both endpoints must be consecutive observations in both inputs; intervals longer than seven calendar days are excluded. β = covariance / driver variance; R², n and the final paired date are disclosed. The approximate 95% Newey–West HAC interval uses Bartlett weights and floor(4 × (n/100)^(2/9)) lags. It measures parameter uncertainty, not future outcome coverage.</li>
        <li><strong>Intercept and shock:</strong> the intercept is annualized by 252 and expressed in log-return percentage units; it is not risk-adjusted investment alpha. The percentage scenario is 100 × ((1 + driver percentage change/100)^β − 1), consistent with the fitted log-return slope and excluding the intercept. It describes conditional association, not an identified causal shock or earnings/price forecast. Large moves can invalidate the fitted relationship.</li>
        <li><strong>Sovereign sensitivity:</strong> annual GDP growth and annual Brent percentage changes are residualized on world GDP growth, then regressed using the Frisch–Waugh procedure. The coefficient retains full precision and is scaled to a 10% oil move, with partial correlation, paired-through year, sample size and approximate 95% HC3/t coefficient intervals. The HC3 leverage adjustment uses the complete regression (intercept, oil and world growth); t degrees of freedom equal n minus fitted coefficients. Singular or nearly collinear oil/control samples are withheld. Serial dependence and model selection are not fully captured. Annual Brent averages require all 12 months and at least 200 daily observations. Incomplete years and any oil change requiring them are excluded and disclosed. India is withheld because its April–March GDP is incompatible with calendar-year oil and world-growth controls. Energy trade descriptions use reported net imports/exports and their actual years, not fixed country classifications. This is a small-sample conditional association; controlling for one common factor does not identify causality or guarantee exporter/importer signs.</li>
        <li><strong>Model fans:</strong> Gaussian log-change quantiles for positive price series, additive changes for rates/nonpositive series; estimation window 756 daily or 120 monthly observations; EWMA second moment with λ 0.97 daily / 0.90 monthly. Drift is one quarter of the full-window mean plus one quarter of the recent-quarter mean (63 daily or three monthly observations). Quantiles use μt + zσ√t, with z = −1.2816, −0.6745, 0, 0.6745, 1.2816. Time is scaled by the observed sampling frequency; monthly fans start at period end. Shading correctly spans the lower and upper quantiles even across zero.</li>
        <li><strong>Coverage is uncalibrated:</strong> P10–P90 is an 80% interval under the model assumptions, not a demonstrated 80% real-world coverage guarantee. Jumps, fat tails, structural breaks, seasonality and parameter uncertainty are not fully modeled. Weekly inventory model fans are withheld.</li>
        <li><strong>External forecasts:</strong> EIA STEO and IMF WEO replace model fans where available. WEO forecasts are delivered through the free <a href="https://data360.worldbank.org/en/api" target="_blank" rel="noreferrer">World Bank Data360 service</a>, with its official bulk file as a second delivery route. This is the same IMF forecast producer, not an independent model or a consensus average. Country, annual frequency, percent-change units, latest-version dimension and complete current-year-to-three-year horizon must all validate before publication.</li>
        <li><strong>Forecast provenance and expiry:</strong> source-version dates and retrieval times are separate. WEO source versions older than 225 days are withheld (April/October release cycle plus a margin); repeated retrieval cannot make an old release current. Retained external forecasts also expire 45 days after their last successful retrieval. Versions cannot regress, and a version change during retrieval rejects the batch. EIA STEO forecasts are monthly average prices for complete future months, plotted at month end without a daily-spot anchor. Their identity, units and uninterrupted horizon of at least six months are checked. The EIA query API does not expose a release vintage: content last changed/first seen is separately recorded and unchanged content expires after 45 days, even if re-downloaded. Neither removal of an expired month nor plotting at month end implies a new release or an end-of-month price target. Overdue actuals suspend projections. India uses fiscal years beginning in April; annual plot dates are year labels. IMF projections and World Bank histories can reflect different revisions.</li>
      </ul>
    </section>

    <section className="card">
      <h3>Validation and the daily record</h3>
      <p className="sub">The event study replays unchanged production thresholds on latest revised histories. Availability proxies are three calendar days for FRED, ten for weekly-batched H.10 FX and one for Yahoo, followed by one additional day before outcome entry. These are conservative approximations, not historical release timestamps or point-in-time data vintages. Directional outcomes use adjusted-close returns for Yahoo instruments and price changes for FRED instruments. These are not uniformly investable returns. The study cannot establish an executable trading edge.</p>
      <p className="sub">Same-direction firings collapse to episodes with a 15-day cooldown. Direction changes are distinct episodes. Directional baselines use outcomes available strictly before entry after applying source-publication lags. Correlation baselines use the same pair, entry delay and horizon, and only reference outcomes available before the episode onset. Each requires at least 20 reference outcomes; episodes without an adequate baseline are excluded from the comparison. Yield/breakeven dislocations are excluded from percentage-return aggregation; monthly and weekly primary signals are excluded. Correlation persistence uses the same matched-interval definition as production. Intervals use a seeded chronological moving-block bootstrap (block five, 1,000 resamples), withheld for fewer than 20 episodes or all-hit/all-miss samples; overlapping horizons, common shocks, multiple comparisons and universe selection remain limitations. No position sizing or transaction costs are modeled.</p>
      <p className="sub">Full analytical refreshes recompute the event study. Results are displayed only when both their engine version and input-snapshot timestamp match the current implementation and data. Written summaries are generated from the results, not fixed conclusions. Each day's first-issued signal/forecast digest is preserved on subsequent refreshes and records the engine version and input snapshot. Only strictly future forecast points are recorded, together with actual horizon length, source period basis and vintage where available. This ledger supports future calibration; collecting predictions alone does not validate them. The repository history is auditable but is not an independent, immutable third-party performance record. Older records predate these safeguards.</p>
    </section>

    <section className="card">
      <h3>Method references</h3>
      <p className="sub"><a href="https://www.statsmodels.org/stable/generated/statsmodels.regression.linear_model.OLSResults.HC3_se.html" target="_blank" rel="noreferrer">HC3 covariance definition</a> · <a href="https://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm" target="_blank" rel="noreferrer">Student t critical values</a> · <a href="https://datahelpdesk.worldbank.org/knowledgebase/articles/201203-are-all-wdi-series-on-a-calendar-year-reporting-pe" target="_blank" rel="noreferrer">World Bank fiscal-year reporting</a> · <a href="https://www.eia.gov/opendata/documentation.php" target="_blank" rel="noreferrer">EIA response metadata and limits</a></p>
    </section>

    <section className="card">
      <h3>Methodology change log</h3>
      <div className="table-wrap"><table className="beta-table">
        <thead><tr><th>Date</th><th>Change</th></tr></thead>
        <tbody>
          <tr><td>2026-11-21</td><td>Engine 2026-11-21.2 — end-to-end audit: removed future information from correlation baselines; suppressed unsupported small-sample intervals; corrected state directions, tied percentiles and leap-year seasonality; aligned log-return scenarios; added HC3/t GDP intervals and withheld fiscal/calendar mismatches; made rate transformations and monthly periods explicit; fixed zero-crossing forecast bands; tightened source identity, units and coverage checks; expired unchanged EIA content; and corrected daily-ledger horizons. CPI/industrial-production dislocations now use year-on-year growth; daily signals require full warmup windows and Yahoo signals use adjusted closes. Signal thresholds remain unchanged. Pre-change results are preserved in git history.</td></tr>
          <tr><td>2026-11-21</td><td>Restored GDP forecasts using IMF WEO via World Bank Data360, replacing the unavailable IMF DataMapper endpoint. Added API-to-bulk-file failover, source-version and dimension validation, vintage expiry, and visible forecast lineage/year-basis notes. Forecast authorship and signal thresholds unchanged.</td></tr>
          <tr><td>2026-11-21</td><td>Engine 2026-11-21.1: source-aware QC; staged publication and checksum verification; current-analysis gating; separate timestamped quotes; matched-interval correlations; calendar-year matching before display clipping; source-lag-aware replay and pre-entry baselines; adjusted equity returns and HAC beta intervals; first-issued daily ledger; monthly forecast timing/drift corrections. Signal thresholds unchanged. Previous results remain in git history.</td></tr>
          <tr><td>2026-08-02</td><td>QC, daily ledger, event studies, market-state conditions and inventory divergence introduced.</td></tr>
          <tr><td>2026-07-31</td><td>Initial transforms, signals, forecast fans, equity beta and cycle-controlled GDP sensitivity.</td></tr>
        </tbody>
      </table></div>
      <p className="sub">Model output, not investment advice.</p>
    </section>
  </div>;
}
