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
  seriesIds: string[]; // catalog series behind the signal — the "view in overlay" CTA
  metric: number; // the raw statistic (z / spread % / Δρ) — used by the backtest engine
  aux?: { cShort: number; cLong: number }; // correlation-regime context for persistence evaluation
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

function dayOfYear(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
}

/**
 * Seasonal z-score for strongly seasonal weekly series (inventories, storage):
 * the latest value vs same-calendar-window (±15 days) observations from the
 * prior `yearsBack` years. A plain trailing z would flag every summer.
 */
export function seasonalZ(points: [string, number][], yearsBack = 5): { z: number; last: number; n: number } | null {
  const n = points.length;
  if (n < 150) return null;
  const [lastDate, lastVal] = points[n - 1];
  const lastYear = Number(lastDate.slice(0, 4));
  const doy = dayOfYear(lastDate);
  const peers: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const yearDiff = lastYear - Number(points[i][0].slice(0, 4));
    if (yearDiff < 1 || yearDiff > yearsBack) continue;
    let dd = Math.abs(dayOfYear(points[i][0]) - doy);
    if (dd > 182) dd = 365 - dd; // wrap across year end
    if (dd <= 15) peers.push(points[i][1]);
  }
  if (peers.length < 10) return null;
  const mean = peers.reduce((a, b) => a + b, 0) / peers.length;
  const sd = Math.sqrt(peers.reduce((a, b) => a + (b - mean) ** 2, 0) / peers.length);
  if (!sd) return null;
  return { z: (lastVal - mean) / sd, last: lastVal, n: peers.length };
}

/**
 * The MVP signal set: dislocation z-scores, momentum regime, and rolling
 * correlation-regime shifts between energy and cross-asset pairs.
 *
 * `asOf` (default: today) anchors the correlation windows — required for
 * faithful historical replay in the backtest engine. Series passed in must
 * already be truncated to observations ≤ asOf.
 */
export function computeSignals(all: Map<string, Series>, asOf?: string): Signal[] {
  const signals: Signal[] = [];

  for (const s of all.values()) {
    if (s.category === "macro" && s.id.startsWith("GDP_")) continue; // annual, too sparse
    const z = latestZ(s);
    if (z && Math.abs(z.z) >= 1.5) {
      signals.push({
        kind: "Dislocation",
        subject: s.name,
        detail: `${z.z > 0 ? "Rich" : "Cheap"} vs trailing-year norm (latest ${s.unit === "index" ? `index level ${fmt(z.last)}` : `${fmt(z.last)} ${s.unit}`})`,
        value: `z = ${z.z >= 0 ? "+" : ""}${z.z.toFixed(1)}σ`,
        severity: sevFromAbs(Math.abs(z.z), 1.5, 2, 2.5),
        score: Math.abs(z.z),
        seriesIds: [s.id],
        metric: z.z,
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
        seriesIds: [s.id],
        metric: m.spreadPct,
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
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  const shift = (d: number) => {
    const t = new Date(`${today}T00:00:00Z`);
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
        seriesIds: [aId, bId],
        metric: delta,
        aux: { cShort, cLong },
      });
    }
  }

  // Inventory divergence: reported fundamentals vs seasonal norm, crossed with
  // price positioning — fires only when the fundamentals DISAGREE with price
  // (glut priced richly / tightness priced cheaply). Active once the EIA weekly
  // series are in the catalog; excluded from the event-study backtest until
  // enough weekly history accrues in the ledger.
  const INVENTORY_PAIRS: [string, string, string][] = [
    ["USCRUDESTOCKS", "WTI", "US crude stocks vs WTI"],
    ["USGASSTORAGE", "HENRYHUB", "US gas storage vs Henry Hub"],
  ];
  for (const [invId, pxId, label] of INVENTORY_PAIRS) {
    const inv = all.get(invId);
    const px = all.get(pxId);
    if (!inv || !px) continue;
    const sz = seasonalZ(inv.points);
    const pz = latestZ(px);
    if (!sz || !pz) continue;
    const bearTension = sz.z >= 1.5 && pz.z >= 1; // glut + rich price
    const bullTension = sz.z <= -1.5 && pz.z <= -1; // tightness + cheap price
    if (!bearTension && !bullTension) continue;
    signals.push({
      kind: "Inventory divergence",
      subject: label,
      detail: `${inv.name} ${sz.z >= 0 ? "+" : ""}${sz.z.toFixed(1)}σ vs 5y seasonal norm (${fmt(sz.last)} ${inv.unit}) while ${px.name} is ${pz.z > 0 ? "rich" : "cheap"} (z ${pz.z >= 0 ? "+" : ""}${pz.z.toFixed(1)}) — ${bearTension ? "oversupply priced richly: bearish tension" : "tight supply priced cheaply: bullish tension"}`,
      value: `inv z = ${sz.z >= 0 ? "+" : ""}${sz.z.toFixed(1)}σ`,
      severity: sevFromAbs(Math.abs(sz.z), 1.5, 2, 2.5),
      score: Math.abs(sz.z) + Math.abs(pz.z) / 2,
      seriesIds: [invId, pxId],
      metric: sz.z,
    });
  }

  return signals.sort((x, y) => y.score - x.score);
}
