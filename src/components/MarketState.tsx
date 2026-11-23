import { l as localize, t as tr } from '../lib/i18n';
import { useMemo } from "react";
import { locale } from '../lib/preferences';
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
  if(locale()==='nb-NO')return `${n}.`;
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

  if (!states.length) return <p className="sub">{tr("Market state needs daily price history.")}</p>;

  return (
    <div>
      <div className="state-grid">
        {localize(states.map((s) => {
          const meta = BAND_META[s.band];
          return (
            <div className="state-card" key={s.id}>
              <div className="state-head">
                <span className="state-name">{localize(s.name)}</span>
                <span
                  className="sev-pill"
                  title={tr(`Composite ${s.score}/100 — mean of the supportive-direction condition scores`)}
                  style={{ background: `color-mix(in srgb, var(${meta.cssVar}) 16%, transparent)` }}
                >
                  <span className="dot" style={{ background: `var(${meta.cssVar})` }} />
                  <span aria-hidden="true">{localize(meta.icon)}</span> {localize(meta.label)}{tr(" · ")}{localize(s.score)}
                </span>
              </div>
              {localize(s.conditions.map((c) => (
                <div className="state-cond" key={c.key} title={tr(c.detail)}>
                  <div className="state-cond-top">
                    <span className="state-cond-label">{localize(c.label)}</span>
                    <span className="state-cond-pct">{localize(ordinal(Math.round(c.percentile)))}{tr(" pct")}</span>
                  </div>
                  <ConditionBar pct={c.percentile} />
                  <div className="state-cond-reading">{localize(c.reading)}</div>
                </div>
              )))}
              <div className="state-asof">{localize(s.conditions.length)}{tr("/4 conditions · inputs through ")}{localize(s.asOf)}</div>
            </div>
          );
        }))}
      </div>
      <p className="sub" style={{ marginTop: 10 }}>{tr("Each condition is the current value's percentile within its own ~3-year history (positioning: full CFTC weekly history; Brent positioning uses the thin NYMEX Last Day contract as a proxy). The composite averages oriented historical ranks (higher trend rank, lower volatility, dollar-change and positioning ranks). This convention is an unvalidated heuristic; missing conditions change its composition. It describes relative conditions,")}<strong>{tr(" not a forecast or trading signal")}</strong>{tr(". Bands: <35 headwinds · 35–65 mixed · >65 constructive.")}</p>
    </div>
  );
}
