import type { Series } from "../lib/data";

const KPI_IDS = ["BRENT", "WTI", "HENRYHUB", "SP500", "GOLD", "EURUSD"];
const SPARK_POINTS = 30;

function fmtValue(v: number): string {
  return v.toLocaleString("en-US", {
    maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2,
    minimumFractionDigits: 0,
  });
}

function Sparkline({ values }: { values: number[] }) {
  const w = 76, h = 24, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${(h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)}`)
    .join("");
  return (
    <svg className="kpi-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function KpiStrip({ seriesMap, selected, onToggle }: {
  seriesMap: Map<string, Series>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const tiles = KPI_IDS.map((id) => seriesMap.get(id)).filter((s): s is Series => !!s);
  if (!tiles.length) return null;
  return (
    <div className="kpi-strip">
      {tiles.map((s) => {
        const n = s.points.length;
        const last = s.points[n - 1][1];
        const prev = s.points[n - 2]?.[1];
        const pct = prev ? (last / prev - 1) * 100 : null;
        const on = selected.includes(s.id);
        return (
          <button
            key={s.id}
            className={`kpi-tile${on ? " on" : ""}`}
            onClick={() => onToggle(s.id)}
            title={`${s.name} — ${on ? "remove from" : "add to"} overlay`}
          >
            <span className="kpi-name">{s.name}</span>
            <span className="kpi-value">
              {fmtValue(last)} <span className="kpi-unit">{s.unit}</span>
            </span>
            <span className="kpi-foot">
              {pct != null && (
                <span className={`kpi-delta ${pct >= 0 ? "up" : "down"}`}>
                  {pct >= 0 ? "▲" : "▼"} {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                </span>
              )}
              <Sparkline values={s.points.slice(-SPARK_POINTS).map((p) => p[1])} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
