import type { Series } from "./data";
import { alignSeries, returnCorrelation, daysBetween } from "./transform";

export type Severity = "info" | "watch" | "elevated" | "extreme";

export interface Signal {
  kind: string;
  subject: string;
  detail: string;
  value: string;
  severity: Severity;
  score: number; // for sorting, higher = stronger
}

export const SEVERITY_META: Record<Severity, { label: string; icon: string; cssVar: string }> = {
  info: { label: "Info", icon: "ℹ", cssVar: "--status-good" },
  watch: { label: "Watch", icon: "◔", cssVar: "--status-warning" },
  elevated: { label: "Elevated", icon: "▲", cssVar: "--status-serious" },
  extreme: { label: "Extreme", icon: "‼", cssVar: "--status-critical" },
};

function sevFromAbs(x: number, t1: number, t2: number, t3: number): Severity {
  if (x >= t3) return "extreme";
  if (x >= t2) return "elevated";
  if (x >= t1) return "watch";
  return "info";
}

/** Z-score of the latest value vs the trailing window (~1 trading year for dailies). */
function latestZ(s: Series): { z: number; last: number } | null {
  const n = s.points.length;
  if (n < 40) return null;
  const isDailyish = daysBetween(s.points[n - 30][0], s.points[n - 1][0]) < 60;
  const win = Math.min(n, isDailyish ? 252 : 36);
  const vals = s.points.slice(n - win).map((p) => p[1]);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  if (!sd) return null;
  return { z: (vals[vals.length - 1] - mean) / sd, last: vals[vals.length - 1] };
}

/** Moving-average momentum state for daily series. */
function momentum(s: Series): { fast: number; slow: number; spreadPct: number } | null {
  const n = s.points.length;
  if (n < 220) return null;
  if (daysBetween(s.points[n - 200][0], s.points[n - 1][0]) > 400) return null; // not daily
  const avg = (k: number) => s.points.slice(n - k).reduce((a, p) => a + p[1], 0) / k;
  const fast = avg(50), slow = avg(200);
  if (!slow) return null;
  return { fast, slow, spreadPct: ((fast - slow) / Math.abs(slow)) * 100 };
}

function fmt(v: number, digits = 2): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/**
 * The MVP signal set: dislocation z-scores, momentum regime, and rolling
 * correlation-regime shifts between energy and cross-asset pairs.
 */
export function computeSignals(all: Map<string, Series>): Signal[] {
  const signals: Signal[] = [];

  for (const s of all.values()) {
    if (s.category === "macro" && s.id.startsWith("GDP_")) continue; // annual, too sparse
    const z = latestZ(s);
    if (z && Math.abs(z.z) >= 1.5) {
      signals.push({
        kind: "Dislocation",
        subject: s.name,
        detail: `${z.z > 0 ? "Rich" : "Cheap"} vs trailing-year norm (latest ${fmt(z.last)} ${s.unit})`,
        value: `z = ${z.z >= 0 ? "+" : ""}${z.z.toFixed(1)}σ`,
        severity: sevFromAbs(Math.abs(z.z), 1.5, 2, 2.5),
        score: Math.abs(z.z),
      });
    }
    const m = momentum(s);
    if (m && Math.abs(m.spreadPct) >= 2) {
      signals.push({
        kind: "Momentum",
        subject: s.name,
        detail: `50-day average ${m.spreadPct > 0 ? "above" : "below"} 200-day (${fmt(m.fast)} vs ${fmt(m.slow)})`,
        value: `${m.spreadPct >= 0 ? "+" : ""}${m.spreadPct.toFixed(1)}%`,
        severity: sevFromAbs(Math.abs(m.spreadPct), 2, 6, 12),
        score: Math.abs(m.spreadPct) / 4,
      });
    }
  }

  // Correlation-regime shifts on curated energy↔cross-asset pairs (the "beta" family).
  const PAIRS: [string, string, string][] = [
    ["BRENT", "XLE", "Energy Beta (equities)"],
    ["BRENT", "SP500", "Energy Beta (index)"],
    ["BRENT", "EURUSD", "Energy–FX link"],
    ["BRENT", "BREAKEVEN10Y", "Energy–inflation link"],
    ["HENRYHUB", "ICLN", "Gas–renewables link"],
    ["BRENT", "GOLD", "Oil–gold link"],
  ];
  const today = new Date().toISOString().slice(0, 10);
  const shift = (d: number) => {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() - d);
    return t.toISOString().slice(0, 10);
  };
  for (const [aId, bId, label] of PAIRS) {
    const a = all.get(aId), b = all.get(bId);
    if (!a || !b) continue;
    const grid1y = alignSeries([a, b], shift(365));
    const short = alignSeries([a, b], shift(120));
    const cLong = returnCorrelation(grid1y.values[0], grid1y.values[1]);
    const cShort = returnCorrelation(short.values[0], short.values[1]);
    if (cLong == null || cShort == null) continue;
    const delta = cShort - cLong;
    if (Math.abs(delta) >= 0.15) {
      signals.push({
        kind: "Correlation regime",
        subject: label,
        detail: `${a.name} vs ${b.name}: 120d correlation ${cShort.toFixed(2)} vs 1y ${cLong.toFixed(2)} (as of ${today})`,
        value: `Δρ = ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`,
        severity: sevFromAbs(Math.abs(delta), 0.15, 0.3, 0.45),
        score: Math.abs(delta) * 6,
      });
    }
  }

  return signals.sort((x, y) => y.score - x.score);
}
