import type { BacktestFile, BacktestStats } from "../lib/data";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function StatRow({ label, s }: { label: string; s: BacktestStats | null }) {
  if (!s) return (
    <tr><td className="beta-name">{label}</td><td colSpan={4} className="val-na">insufficient episodes</td></tr>
  );
  const base = s.baselineHit;
  const edge = s.hitRate - base;
  return (
    <tr>
      <td className="beta-name">{label}</td>
      <td className="num" data-label="Hit rate"><span className="cell-value"><strong>{pct(s.hitRate)}</strong> <span className="val-ci">{s.hitCI ? `[${pct(s.hitCI[0])}–${pct(s.hitCI[1])}]` : "CI withheld: insufficient variation/sample"}</span></span></td>
      <td className="num" data-label="Baseline"><span className="cell-value">{pct(base)}</span></td>
      <td className="num" data-label="Difference">
        <span className="cell-value">{edge >= 0 ? "+" : ""}{(edge * 100).toFixed(1)}pp</span>
      </td>
      <td className="num" data-label="Episodes (n)"><span className="cell-value">{s.n}</span></td>
    </tr>
  );
}

export function ValidationPanel({ bt }: { bt: BacktestFile }) {
  const d = bt.families["Dislocation"];
  const m = bt.families["Momentum"];
  const c = bt.families["Correlation regime"];
  const corrH = String(bt.method.options.corrEvalObs);

  const describe = (stats: BacktestStats | null) => stats
    ? `${stats.n} evaluated episodes with a historical baseline: hit rate ${pct(stats.hitRate)} versus ${pct(stats.baselineHit)} baseline. ${stats.hitCI ? `The interval [${pct(stats.hitCI[0])}, ${pct(stats.hitCI[1])}] describes hit-rate uncertainty, not significance of the difference.` : "The sample does not support a bootstrap confidence interval."}`
    : "Insufficient completed episodes with a historical baseline.";
  const verdicts: [string, string][] = [
    ["Dislocation", describe(d.horizons["20"])],
    ["Momentum", describe(m.horizons["20"])],
    ["Correlation regime", describe(c.horizons[corrH])],
  ];

  return (
    <div>
      <div className="table-wrap stack-wrap">
        <table className="beta-table stack-sm">
          <thead>
            <tr><th>Family / cut</th><th className="num">Hit rate [95% CI]</th><th className="num">Baseline</th><th className="num">Difference</th><th className="num">n</th></tr>
          </thead>
          <tbody>
            <StatRow label={`Dislocation — 20 obs (${d.episodes} episodes)`} s={d.horizons["20"]} />
            <StatRow label="· watch" s={d.bySeverity.watch} />
            <StatRow label="· elevated" s={d.bySeverity.elevated} />
            <StatRow label="· extreme" s={d.bySeverity.extreme} />
            <StatRow label={`Momentum — 20 obs (${m.episodes} episodes)`} s={m.horizons["20"]} />
            <StatRow label={`Correlation persistence — ${corrH} obs (${c.episodes} episodes)`} s={c.horizons[corrH]} />
          </tbody>
        </table>
      </div>

      <div className="val-verdicts">
        {verdicts.map(([fam, text]) => (
          <p className="sub" key={fam}><strong>{fam}.</strong> {text}</p>
        ))}
      </div>

      <p className="sub val-caveats">
        Scope note: the <strong>Inventory divergence</strong> family (added 2026-08-02) is not yet
        backtested — historical release vintages have not been validated; it
        is recorded in the daily ledger for future validation; the ledger alone does not establish accuracy.
        {" "}Method: event-study replay of the production signal engine as-of each trading day since{" "}
        {bt.method.options.start.slice(0, 4)} — <em>not</em> a strategy backtest (no positions, sizing or costs).
        Source-specific publication lags are imposed before signal formation, then entry waits {bt.method.options.visibilityLagDays} additional day;
        firings collapsed to episodes ({bt.method.options.cooldownDays}-day cooldown); baselines are each
        series’ previously available same-sign outcomes, or the same pair’s previously completed correlation comparisons. Both require at least 20 reference outcomes; CIs use moving-block bootstrap and are withheld for fewer than 20 episodes or all-hit/all-miss samples;
        daily price series only. Results use revised histories and approximate release lags, so they do not establish a tradable or causal edge. Bootstrap intervals do not fully capture cross-asset dependence or multiple testing. Thresholds were unchanged in this revision —
        the daily ledger preserves first-issued records for future out-of-sample evaluation. No calibrated track record is claimed.
      </p>
    </div>
  );
}
