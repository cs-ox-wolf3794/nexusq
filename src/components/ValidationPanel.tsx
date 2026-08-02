import type { BacktestFile, BacktestStats } from "../lib/data";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function StatRow({ label, s, baseline }: { label: string; s: BacktestStats | null; baseline?: number }) {
  if (!s) return (
    <tr><td className="beta-name">{label}</td><td colSpan={4} className="val-na">insufficient episodes</td></tr>
  );
  const base = baseline ?? s.baselineHit;
  const edge = s.hitRate - base;
  return (
    <tr>
      <td className="beta-name">{label}</td>
      <td className="num" data-label="Hit rate"><strong>{pct(s.hitRate)}</strong> <span className="val-ci">[{pct(s.hitCI[0])}–{pct(s.hitCI[1])}]</span></td>
      <td className="num" data-label="Baseline">{pct(base)}</td>
      <td className={`num ${Math.abs(edge) < 0.03 ? "" : edge > 0 ? "implied up" : "implied down"}`} data-label="Edge">
        {edge >= 0 ? "+" : ""}{(edge * 100).toFixed(1)}pp
      </td>
      <td className="num" data-label="Episodes (n)">{s.n}</td>
    </tr>
  );
}

export function ValidationPanel({ bt }: { bt: BacktestFile }) {
  const d = bt.families["Dislocation"];
  const m = bt.families["Momentum"];
  const c = bt.families["Correlation regime"];
  const corrH = String(bt.method.options.corrEvalObs);

  const verdicts: [string, string][] = [
    ["Dislocation",
      "Aggregate hit rates are indistinguishable from baseline — but reversion is monotone in severity: " +
      "mild (watch) episodes are description, not prediction, while extreme (|z| ≥ 2.5) episodes reverted " +
      `${d.bySeverity.extreme ? pct(d.bySeverity.extreme.hitRate) : "—"} of the time with a ` +
      `${d.bySeverity.extreme ? `+${d.bySeverity.extreme.meanMove.toFixed(1)}%` : "—"} mean move (small n — read the CI). ` +
      "At 60 observations the aggregate mean reversion move is positive with a CI excluding zero: an asymmetric-payoff, not a hit-rate, effect."],
    ["Momentum",
      "A clean null: 50/200-day crossings show no forward edge at any tested horizon (if anything, slight reversal). " +
      "Momentum badges describe the current trend state — they do not forecast its continuation."],
    ["Correlation regime",
      `Regime shifts are mostly transitory: ρ reverted toward the OLD regime in ${c.horizons[corrH] ? pct(1 - c.horizons[corrH]!.hitRate) : "—"} of episodes. ` +
      "Read these alerts as 'hedging relationships temporarily unstable', not as a durable new normal."],
  ];

  return (
    <div>
      <div className="table-wrap stack-wrap">
        <table className="beta-table stack-sm">
          <thead>
            <tr><th>Family / cut</th><th className="num">Hit rate [95% CI]</th><th className="num">Baseline</th><th className="num">Edge</th><th className="num">n</th></tr>
          </thead>
          <tbody>
            <StatRow label={`Dislocation — 20 obs (${d.episodes} episodes)`} s={d.horizons["20"]} />
            <StatRow label="· watch" s={d.bySeverity.watch} />
            <StatRow label="· elevated" s={d.bySeverity.elevated} />
            <StatRow label="· extreme" s={d.bySeverity.extreme} />
            <StatRow label={`Momentum — 20 obs (${m.episodes} episodes)`} s={m.horizons["20"]} />
            <StatRow label={`Correlation persistence — ${corrH} obs (${c.episodes} episodes)`} s={c.horizons[corrH]} baseline={bt.corrPersistenceBaseline} />
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
        backtested — weekly fundamentals data is too young for honest episode statistics; it
        accumulates validation on the live daily ledger instead.
        {" "}Method: event-study replay of the production signal engine as-of each trading day since{" "}
        {bt.method.options.start.slice(0, 4)} — <em>not</em> a strategy backtest (no positions, sizing or costs).
        Publication lag of {bt.method.options.visibilityLagDays} days imposed before outcomes are measured;
        firings collapsed to episodes ({bt.method.options.cooldownDays}-day cooldown); baselines are each
        series' own unconditional same-sign probability (drift-honest); CIs from moving-block bootstrap;
        daily series only. Thresholds were fixed a priori and have not been tuned on these results —
        the live daily ledger (public git history) re-verifies these findings out-of-sample as it accumulates.
      </p>
    </div>
  );
}
