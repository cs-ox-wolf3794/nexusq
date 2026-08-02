import { useMemo } from "react";
import type { CotFile, Series } from "../lib/data";
import type { MarketState as MarketStateData } from "../lib/state";
import { computeMarketState } from "../lib/state";

const MARKETS = [
  { id: "BRENT", name: "Brent crude" },
  { id: "WTI", name: "WTI crude" },
  { id: "HENRYHUB", name: "Henry Hub" },
];

const BAND_META = {
  constructive: { icon: "▲", cssVar: "--status-good", label: "Constructive" },
  mixed: { icon: "◆", cssVar: "--status-warning", label: "Mixed" },
  headwinds: { icon: "▼", cssVar: "--status-serious", label: "Headwinds" },
} as const;

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function ConditionBar({ pct }: { pct: number }) {
  return (
    <div className="pct-track" aria-hidden="true">
      <div className="pct-mid" />
      <div className="pct-marker" style={{ left: `${pct}%` }} />
    </div>
  );
}

export function MarketStatePanel({ seriesMap, cot }: {
  seriesMap: Map<string, Series>;
  cot: CotFile | null;
}) {
  const states = useMemo(() => {
    const dxy = seriesMap.get("DXY");
    return MARKETS
      .map((m) => {
        const price = seriesMap.get(m.id);
        if (!price) return null;
        return computeMarketState(m, price, dxy, cot?.markets[m.id]);
      })
      .filter((s): s is MarketStateData => s != null);
  }, [seriesMap, cot]);

  if (!states.length) return <p className="sub">Market state needs daily price history.</p>;

  return (
    <div>
      <div className="state-grid">
        {states.map((s) => {
          const meta = BAND_META[s.band];
          return (
            <div className="state-card" key={s.id}>
              <div className="state-head">
                <span className="state-name">{s.name}</span>
                <span
                  className="sev-pill"
                  title={`Composite ${s.score}/100 — mean of the supportive-direction condition scores`}
                  style={{ background: `color-mix(in srgb, var(${meta.cssVar}) 16%, transparent)` }}
                >
                  <span className="dot" style={{ background: `var(${meta.cssVar})` }} />
                  <span aria-hidden="true">{meta.icon}</span> {meta.label} · {s.score}
                </span>
              </div>
              {s.conditions.map((c) => (
                <div className="state-cond" key={c.key} title={c.detail}>
                  <div className="state-cond-top">
                    <span className="state-cond-label">{c.label}</span>
                    <span className="state-cond-pct">{ordinal(Math.round(c.percentile))} pct</span>
                  </div>
                  <ConditionBar pct={c.percentile} />
                  <div className="state-cond-reading">{c.reading}</div>
                </div>
              ))}
              <div className="state-asof">inputs through {s.asOf}</div>
            </div>
          );
        })}
      </div>
      <p className="sub" style={{ marginTop: 10 }}>
        Each condition is the current value's percentile within its own ~3-year history (positioning:
        full CFTC weekly history; Brent positioning uses the thin NYMEX Last Day contract as a proxy).
        The composite orients conditions to a common "supportive" direction (uptrend, calm volatility,
        soft dollar, light positioning) and averages them — a description of the current regime,
        <strong> not a forecast or trading signal</strong>. Bands: &lt;35 headwinds · 35–65 mixed · &gt;65 constructive.
      </p>
    </div>
  );
}
