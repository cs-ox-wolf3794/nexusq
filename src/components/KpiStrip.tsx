import { l as localize, t as tr } from '../lib/i18n';
import type { QualityFile, Series } from "../lib/data";
import { analysisEligibility } from "../lib/quality";
import { Money } from './Preferences';

const KPI_IDS = ["BRENT", "WTI", "HENRYHUB", "SP500", "GOLD", "EURUSD"];
const SPARK_POINTS = 30;

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

export function KpiStrip({ seriesMap, selected, onToggle, quality, now }: {
  seriesMap: Map<string, Series>;
  selected: string[];
  onToggle: (id: string) => void;
  quality: QualityFile | null;
  now: number;
}) {
  const tiles = KPI_IDS.map((id) => seriesMap.get(id)).filter((s): s is Series => !!s);
  if (!tiles.length) return null;
  return (
    <div className="kpi-strip">
      {localize(tiles.map((s) => {
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
            title={tr(`${s.name} — ${on ? "remove from" : "add to"} overlay`)}
          >
            <span className="kpi-name">{localize(s.name)}</span>
            <small>{localize(analysisEligibility(s, quality, now).eligible ? "Daily observation" : "⚠ Review required")}{tr(" · ")}{localize(s.lastUpdated)}</small>
            <span className="kpi-value">
              <Money value={last} unit={s.unit} />
            </span>
            <span className="kpi-foot">
              {localize(pct != null && (
                <span className={`kpi-delta ${pct >= 0 ? "up" : "down"}`}>
                  {localize(pct >= 0 ? "▲" : "▼")} {localize(pct >= 0 ? "+" : "")}{localize(pct.toFixed(1))}{tr("%")}</span>
              ))}
              <Sparkline values={s.points.slice(-SPARK_POINTS).map((p) => p[1])} />
            </span>
          </button>
        );
      }))}
    </div>
  );
}
