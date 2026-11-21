/** Public specification. Formula changes must also advance ENGINE_VERSION. */
export function Methodology() {
  return <div className="methodology">
    <section className="card">
      <h2>Methodology and data reliability</h2>
      <p className="sub">NexusQ describes observed market relationships. Statistical association does not identify a causal shock or establish a trading edge. Every result depends on the quality, timing and scope of its inputs.</p>
      <ul className="method-list">
        <li><strong>Observation time is separate from retrieval time.</strong> Re-downloading an old observation does not make it current. Each source's cadence and last successful retrieval appear in Data status.</li>
        <li><strong>Quotes and analytical observations are separate.</strong> Yahoo quotes target checks every 15 minutes on weekdays, 12:00–23:59 UTC. The browser checks for published updates every minute. Provider delays, outages and GitHub scheduling mean this is best effort, not a guaranteed real-time service. Quotes do not enter daily backtests, betas or forecast histories.</li>
        <li><strong>Unusable current inputs are withheld.</strong> Missing, overdue or flagged QC inputs cannot generate current signals or projections. Historical data remains visible with its status. A quality assessment older than 72 hours also suspends current analysis.</li>
        <li><strong>One comparable axis.</strong> Mixed units require a transformation. No dual-axis charts. Indexed comparisons need a strictly positive base.</li>
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
          <tr><td>Indexed overlay</td><td>100 × value / first visible value</td><td>Strictly positive base required</td></tr>
          <tr><td>Window z-score</td><td>(value − visible-window mean) / population standard deviation</td><td>Descriptive, window-relative</td></tr>
          <tr><td>Year-on-year change</td><td>100 × (value / prior-year value − 1)</td><td>Calendar anniversary, at most seven days of backward matching; computed before clipping the display window</td></tr>
          <tr><td>Correlation</td><td>Pearson correlation on matched observation intervals; log returns for prices, differences for rates or nonpositive histories</td><td>No forward-filled returns; same cadence only; at least 20 paired changes; sample size and input date disclosed</td></tr>
          <tr><td>Dislocation</td><td>Latest value versus trailing 252 observations for daily series, 36 for monthly</td><td>Current observation included in the reference window; |z| thresholds 1.5 / 2 / 2.5; inventories use seasonal normalization instead</td></tr>
          <tr><td>Momentum</td><td>100 × (50-observation mean − 200-observation mean) / |200-observation mean|</td><td>Daily series only; thresholds 2% / 6% / 12%; describes trend, not its continuation</td></tr>
          <tr><td>Correlation regime</td><td>Correlation over 120 calendar days minus correlation over one year</td><td>Thresholds |Δρ| 0.15 / 0.30 / 0.45; diagnostic, not causal</td></tr>
          <tr><td>Inventory divergence</td><td>Weekly inventory z-score versus a ±15-day calendar window in the previous five years, crossed with price dislocation</td><td>Glut z ≥ 1.5 with price z ≥ 1, or tightness z ≤ −1.5 with price z ≤ −1; not yet validated with historical release vintages</td></tr>
        </tbody>
      </table></div>
      <p className="sub">Market state ranks trend, realized volatility, broad-dollar change and managed-money net/open interest against their own histories. The supportive-direction average is a heuristic description: below 35 headwinds, 35–65 mixed, above 65 constructive. Missing conditions change the composition and are omitted, with at least three required. The limiting date includes the dollar input. Brent positioning is the thin NYMEX Last Day proxy, not outright ICE Brent positioning. Neither the condition weights nor the labels establish return predictability.</p>
    </section>

    <section className="card">
      <h3>Exposure estimates and forecast uncertainty</h3>
      <ul className="method-list">
        <li><strong>Equity beta:</strong> OLS of adjusted stock log returns on energy-driver log returns over 90 matched daily intervals. Both endpoints must be consecutive observations in both inputs; intervals longer than seven calendar days are excluded. β = covariance / driver variance; R², n and the final paired date are disclosed. The approximate 95% Newey–West HAC interval uses Bartlett weights and floor(4 × (n/100)^(2/9)) lags. It measures parameter uncertainty, not future outcome coverage.</li>
        <li><strong>Intercept and shock:</strong> the intercept is annualized by 252 and expressed in log-return percentage units; it is not risk-adjusted investment alpha. β × percentage shock is a first-order sensitivity illustration, not an earnings or price forecast. Large shocks and regime shifts can invalidate it.</li>
        <li><strong>Sovereign sensitivity:</strong> annual GDP growth and annual Brent percentage changes are residualized on world GDP growth, then regressed using the Frisch–Waugh procedure. The coefficient is scaled to a 10% oil move, with partial correlation and sample size. This is a small-sample conditional association; controlling for one common factor does not identify causality or guarantee exporter/importer signs.</li>
        <li><strong>Model fans:</strong> Gaussian log-change simulations for positive price series, additive changes for rates/nonpositive series; estimation window 756 daily or 120 monthly observations; EWMA second moment with λ 0.97 daily / 0.90 monthly. Drift is one quarter of the full-window mean plus one quarter of the recent-quarter mean (63 daily or three monthly observations). Quantiles use μt + zσ√t, with z = −1.2816, −0.6745, 0, 0.6745, 1.2816. Time is scaled by the observed sampling frequency; monthly fans start at period end.</li>
        <li><strong>Coverage is uncalibrated:</strong> P10–P90 is an 80% interval under the model assumptions, not a demonstrated 80% real-world coverage guarantee. Jumps, fat tails, structural breaks, seasonality and parameter uncertainty are not fully modeled. Weekly inventory model fans are withheld.</li>
        <li><strong>External forecasts:</strong> EIA STEO and IMF WEO replace model fans where available. Retained external forecasts preserve their retrieval timestamp, expire after 45 days, and are distinct from observations. Overdue actuals suspend projections.</li>
      </ul>
    </section>

    <section className="card">
      <h3>Validation and the daily record</h3>
      <p className="sub">The event study replays unchanged production thresholds on latest revised histories. Availability proxies are three calendar days for FRED, ten for weekly-batched H.10 FX and one for Yahoo, followed by one additional day before outcome entry. These are conservative approximations, not historical release timestamps or point-in-time data vintages. The study cannot establish an executable trading edge.</p>
      <p className="sub">Same-direction firings collapse to episodes with a 15-day cooldown. Direction changes are distinct episodes. Directional baselines use completed historical outcomes strictly before entry. Yield/breakeven dislocations are excluded from percentage-return aggregation; monthly and weekly primary signals are excluded. Correlation persistence uses the same matched-interval definition as production. Intervals use a seeded chronological moving-block bootstrap (block five, 1,000 resamples); overlapping horizons, common shocks, multiple comparisons and universe selection remain limitations. No position sizing or transaction costs are modeled.</p>
      <p className="sub">Results are displayed only when their engine version matches the current implementation. Written summaries are generated from the results, not fixed conclusions. Each day's first-issued signal/forecast digest is preserved on subsequent refreshes and records the engine version and input snapshot. The repository history is auditable but is not an independent, immutable third-party performance record. Older records predate these safeguards.</p>
    </section>

    <section className="card">
      <h3>Methodology change log</h3>
      <div className="table-wrap"><table className="beta-table">
        <thead><tr><th>Date</th><th>Change</th></tr></thead>
        <tbody>
          <tr><td>2026-11-21</td><td>Engine 2026-11-21.1: source-aware QC; staged publication and checksum verification; current-analysis gating; separate timestamped quotes; matched-interval correlations; calendar-year matching before display clipping; source-lag-aware replay and pre-entry baselines; adjusted equity returns and HAC beta intervals; first-issued daily ledger; monthly forecast timing/drift corrections. Signal thresholds unchanged. Previous results remain in git history.</td></tr>
          <tr><td>2026-08-02</td><td>QC, daily ledger, event studies, market-state conditions and inventory divergence introduced.</td></tr>
          <tr><td>2026-07-31</td><td>Initial transforms, signals, forecast fans, equity beta and cycle-controlled GDP sensitivity.</td></tr>
        </tbody>
      </table></div>
      <p className="sub">Model output, not investment advice.</p>
    </section>
  </div>;
}
