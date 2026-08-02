/**
 * In-app Methodology page ; the public, sanitized specification of every number
 * the platform displays. Source of truth: docs/DOMAIN.md §1–3 (internal), kept in
 * sync manually; the change log below must be updated with any formula change.
 */
export function Methodology() {
  return (
    <div className="methodology">
      <section className="card">
        <h2>Methodology</h2>
        <p className="sub">
          Every number NexusQ displays is defined on this page and reproducible from public data ;
          the full source code, data snapshots and their complete history are open at{" "}
          <a className="cta-link" href="https://github.com/cs-ox-wolf3794/nexusq" target="_blank" rel="noreferrer">
            github.com/cs-ox-wolf3794/nexusq
          </a>. The analytics library is covered by automated tests on every change.
        </p>
        <h3>Principles</h3>
        <ul className="method-list">
          <li><strong>One axis, always.</strong> Mixed units are never dual-axed ; comparisons go through explicit transforms. Dual axes allow arbitrary visual storytelling; we don't use them.</li>
          <li><strong>Correlations on log-returns, never levels.</strong> Level correlations between trending series are spuriously high.</li>
          <li><strong>The band is the forecast.</strong> Point forecasts of commodity prices at 90 days are near-random; conditional volatility is genuinely forecastable. Wide bands after volatile periods are the model being right.</li>
          <li><strong>Every estimate ships its fit quality.</strong> β without R², or a correlation without n, is bait ; we always show both.</li>
          <li><strong>Data honesty.</strong> Per-widget freshness badges, "data through" vs "refreshed" kept separate, missing data rendered as missing, and shock translators labeled first-order.</li>
        </ul>
      </section>

      <section className="card">
        <h3>Every displayed number, at a glance</h3>
        <div className="table-wrap">
          <table className="beta-table">
            <thead>
              <tr><th>On-screen number</th><th>Formula</th><th>Window / frequency</th><th>Key caveat</th></tr>
            </thead>
            <tbody>
              <tr><td className="beta-name">Indexed overlay</td><td>vₜ / v₀ × 100</td><td>first visible obs = base</td><td>base changes with the window ; deliberately</td></tr>
              <tr><td className="beta-name">Z-score overlay</td><td>(vₜ − μ) / σ</td><td>visible window</td><td>window-relative, not all-history</td></tr>
              <tr><td className="beta-name">% y/y overlay</td><td>vₜ / v₍t−1y₎ − 1</td><td>nearest obs ≥ 340d back</td><td>needs ≥ ~1y of history</td></tr>
              <tr><td className="beta-name">Correlation ρ</td><td>Pearson on log-returns</td><td>selected window, daily grid, ffill ≤ 40d</td><td>≥ 20 paired returns or blank</td></tr>
              <tr><td className="beta-name">Dislocation z</td><td>(last − μ) / σ</td><td>252 obs daily / 36 monthly</td><td>assumes rough stationarity</td></tr>
              <tr><td className="beta-name">Momentum spread</td><td>(MA₅₀ − MA₂₀₀) / |MA₂₀₀|</td><td>daily series only</td><td>lags turns by construction</td></tr>
              <tr><td className="beta-name">Correlation regime Δρ</td><td>ρ(120d) − ρ(1y)</td><td>log-returns, curated pairs</td><td>diagnostic, not causal</td></tr>
              <tr><td className="beta-name">Forecast fan</td><td>S₀·exp(μt + z·σ√t)</td><td>~91d daily / ~6m monthly</td><td>jumps land outside the band by construction</td></tr>
              <tr><td className="beta-name">Equity β / α / R²</td><td>OLS on paired daily log-returns</td><td>rolling 90 obs, weekly steps</td><td>90d = current regime, not "the" beta</td></tr>
              <tr><td className="beta-name">Sovereign β GDP</td><td>Frisch–Waugh, world-cycle controlled</td><td>annual, 2001+, n≈24</td><td>association, not structural elasticity</td></tr>
              <tr><td className="beta-name">Shock translators</td><td>β × shock</td><td>;</td><td>first-order only: no lags, no second-order effects</td></tr>
              <tr><td className="beta-name">Freshness badge</td><td>age of newest / limiting obs</td><td>daily 5/14d · monthly 40/75d · annual = vintage</td><td>overlay uses the stalest selected series</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3>Signals</h3>
        <p className="sub">
          Three families, each with fixed formulas and thresholds. Severity is always icon + label,
          and every signal links to the series behind it.
        </p>
        <div className="table-wrap">
          <table className="beta-table">
            <thead>
              <tr><th>Family</th><th>Definition</th><th>Watch / Elevated / Extreme</th></tr>
            </thead>
            <tbody>
              <tr><td className="beta-name">Dislocation</td><td>z of latest value vs trailing 252 obs (36 monthly)</td><td>|z| ≥ 1.5 / 2.0 / 2.5</td></tr>
              <tr><td className="beta-name">Momentum</td><td>50-day vs 200-day average spread</td><td>|spread| ≥ 2% / 6% / 12%</td></tr>
              <tr><td className="beta-name">Correlation regime</td><td>Δρ = ρ(120d) − ρ(1y) on curated energy↔cross-asset pairs</td><td>|Δρ| ≥ 0.15 / 0.30 / 0.45</td></tr>
            </tbody>
          </table>
        </div>
        <p className="sub">
          Interpretation note: the <em>sign</em> of the oil↔equity correlation encodes the shock type ;
          demand shocks push oil and equities together (positive ρ), supply shocks push them apart
          (negative ρ). The same +10% Brent move is bullish energy equities in one regime and
          stagflationary in the other, which is why the platform tracks Δρ rather than assuming a
          constant relationship.
        </p>
      </section>

      <section className="card">
        <h3>Forecasts</h3>
        <ul className="method-list">
          <li><strong>Model fans (P10–P90):</strong> estimation window 3y daily / 120 obs monthly; log-returns (first differences for series that can be ≤ 0); EWMA volatility (λ = 0.97 daily, 0.90 monthly); drift = ½ × (½·long-run mean + ½·last-quarter mean) ; deliberately damped so the fan never promises trend continuation; quantiles S₀·exp(μt + z·σ√t), z ∈ {"{−1.28, −0.67, 0, +0.67, +1.28}"}, anchored at the last actual observation.</li>
          <li><strong>External forecasts replace model fans where an institutional reference exists:</strong> EIA Short-Term Energy Outlook for Brent / WTI / Henry Hub (monthly, ~18 months out); IMF World Economic Outlook for GDP (annual, +3 years).</li>
          <li><strong>The track record is public and tamper-evident:</strong> every day the pipeline commits the full forecast set and active signals to the repository. Git history ; timestamped by GitHub, not by us ; is the ledger. A calibration scoreboard (did realized prices land inside the P10–P90 band ~80% of the time?) will be computed from it once sufficient history accumulates.</li>
        </ul>
      </section>

      <section className="card">
        <h3>Energy Beta (equities)</h3>
        <p className="sub">
          β = Cov(r_stock, r_driver) / Var(r_driver) on 90 days of paired daily log-returns
          (dates both series observe, gaps ≤ 7 days), re-estimated weekly for the trend sparkline.
          α = annualized residual drift (×252). R² is always displayed ; a low R² means the energy
          driver explains little of that stock, and the β should be discounted accordingly.
          Implied shock moves are first-order (β × shock): no earnings pass-through lags, no
          second-order effects.
        </p>
      </section>

      <section className="card">
        <h3>Sovereign GDP sensitivity</h3>
        <p className="sub">
          Annual real-GDP growth (World Bank) regressed on same-year average oil % change,{" "}
          <strong>controlling for world GDP growth</strong> via Frisch–Waugh: both sides are
          residualized on the global cycle, then the residuals are regressed. The control is not
          optional ; oil is procyclical (global booms lift oil <em>and</em> every GDP; 2020 crashed
          both), so the naive regression shows positive betas for every economy including importers.
          Partialling out the cycle recovers the economic structure: exporters positive, importers
          negative. Reported as percentage points of GDP growth per +10% oil, with the partial
          correlation and sample size (n≈24 ; annual data, small samples, disclosed). This remains an
          association conditioned on one control, not a structural supply-shock elasticity.
        </p>
      </section>

      <section className="card">
        <h3>Signal validation (event-study backtest)</h3>
        <ul className="method-list">
          <li><strong>Frame:</strong> the production signal engine is replayed as-of each trading day since 2015 and asked whether what each signal describes actually happened afterwards. This is an event study, <em>not</em> a strategy backtest — no positions, sizing or transaction costs are simulated.</li>
          <li><strong>Honesty constraints:</strong> outcomes are measured from the first observation after a publication lag (live signals fire on data that is already 1–3 days old); consecutive firings collapse into single episodes (cooldown 15 days); baselines are each series' own unconditional same-sign move probability, so trend drift cannot masquerade as signal skill; confidence intervals come from a moving-block bootstrap over episodes; daily series only (monthly series mix horizons and carry revision risk).</li>
          <li><strong>Hypotheses tested:</strong> dislocations → mean reversion; momentum crossings → continuation; correlation-regime shifts → persistence of the new regime.</li>
          <li><strong>Findings are published as measured — including the nulls</strong> (see the Validation section of the dashboard). Thresholds were set a priori and are not tuned on backtest results; any future change will appear in the change log below with pre-change results preserved in the public git history.</li>
          <li><strong>Two-track validation:</strong> the backtest is the hypothesis; the daily signal ledger (committed to the public repository since 2026-08-02) re-verifies it out-of-sample as history accumulates, with no possibility of retrofitting.</li>
        </ul>
      </section>

      <section className="card">
        <h3>Data sources & quality control</h3>
        <div className="table-wrap">
          <table className="beta-table">
            <thead><tr><th>Source</th><th>Series</th><th>Access</th></tr></thead>
            <tbody>
              <tr><td className="beta-name">FRED</td><td>crudes, gas, coal, metals, grains, rates, inflation, indices, FX</td><td>keyless CSV</td></tr>
              <tr><td className="beta-name">Yahoo Finance</td><td>ETFs and single stocks (daily closes)</td><td>public chart API</td></tr>
              <tr><td className="beta-name">World Bank</td><td>GDP growth, fuel-trade intensity</td><td>public API</td></tr>
              <tr><td className="beta-name">IMF WEO</td><td>GDP projections</td><td>public API</td></tr>
              <tr><td className="beta-name">EIA STEO</td><td>Brent / WTI / Henry Hub forecasts</td><td>free API key</td></tr>
            </tbody>
          </table>
        </div>
        <p className="sub">
          Every refresh runs automated QC on every series ; staleness vs its publication cadence,
          gap detection, 5σ spike detection, plausible-range checks, and history-shrink detection ;
          published as <code>quality.json</code> and surfaced in the header ("QC: n/n series clean")
          and on flagged series chips. A refresh where most sources fail aborts without overwriting
          good data. Snapshots update weekdays ~06:20 UTC; sources publish with 1–3 day lags, which
          is why "data through" and "refreshed" are shown separately.
        </p>
      </section>

      <section className="card">
        <h3>Methodology change log</h3>
        <div className="table-wrap">
          <table className="beta-table">
            <thead><tr><th>Date</th><th>Change</th><th>Reason</th></tr></thead>
            <tbody>
              <tr><td className="beta-name">2026-07-31</td><td>Initial methodology: transforms, log-return correlations, three signal families, damped-drift + EWMA fans, EIA STEO / IMF WEO external forecasts.</td><td>MVP release.</td></tr>
              <tr><td className="beta-name">2026-07-31</td><td>Equity Energy Beta board and sovereign GDP betas added.</td><td>Impact layer.</td></tr>
              <tr><td className="beta-name">2026-07-31</td><td>Sovereign β respecified: naive OLS → Frisch–Waugh with world-cycle control; oil driver extended to full-history annual averages.</td><td>Naive version was spuriously positive for all economies (common shocks + oil procyclicality).</td></tr>
              <tr><td className="beta-name">2026-08-02</td><td>Automated per-series QC (quality.json); daily public snapshots of signals and forecast digests (history/); analytics library under CI tests.</td><td>Trust roadmap Phase 1.</td></tr>
              <tr><td className="beta-name">2026-08-02</td><td>Event-study backtest of all signal families published (backtest.json + Validation section), including null results. No thresholds changed.</td><td>Signal validation: backtest = hypothesis, live ledger = accumulating proof.</td></tr>
            </tbody>
          </table>
        </div>
        <p className="sub">
          A methodology that changes silently cannot be trusted ; every revision is recorded here
          and in the public git history. Model output, not investment advice.
        </p>
      </section>
    </div>
  );
}
