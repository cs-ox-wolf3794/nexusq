import type { Series } from "./data";
import { observationEnd } from "./quality";

export type Transform = "index" | "zscore" | "yoy" | "raw";

export const TRANSFORM_LABELS: Record<Transform, string> = {
  index: "Indexed",
  zscore: "Z-score",
  yoy: "YoY %",
  raw: "Raw",
};

export type Points = [string, number][];

export function isRateSeries(s: Pick<Series, "id">): boolean {
  return ["UST10Y", "BREAKEVEN10Y"].includes(s.id) || s.id.startsWith("GDP_");
}

/** Rates/growth rates are already ratios; rebasing or taking their percentage growth is misleading. */
export function comparableTransform(list: Series[], requested: Transform): Transform {
  const sameUnit = new Set(list.map((s) => s.unit)).size <= 1;
  if (list.some(isRateSeries) && ["index", "yoy"].includes(requested)) return sameUnit ? "raw" : "zscore";
  if (requested === "raw" && !sameUnit) return list.some(isRateSeries) ? "zscore" : "index";
  return requested;
}

export function overlayPoints(series: Series, transform: Transform, from: string): Points {
  // Transform on the source calendar first; then place monthly observations at period end.
  const points = transform === "yoy" ? toYoY(series.points) : series.points;
  const visible = points.map(([date, value]): [string, number] => [observationEnd(series.id, date), value]).filter(([date]) => date >= from);
  return transform === "yoy" ? visible : applyTransform(visible, transform);
}

export function clampRange(points: Points, from: string): Points {
  return points.filter(([d]) => d >= from);
}

/** Rebase so the first visible observation = 100. */
export function toIndex(points: Points): Points {
  if (!points.length) return points;
  const base = points[0][1];
  if (base <= 0) return []; // a zero/negative base cannot support a conventional price index
  return points.map(([d, v]) => [d, (v / base) * 100]);
}

/** Z-score over the visible window. */
export function toZScore(points: Points): Points {
  const vals = points.map((p) => p[1]);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
  return points.map(([d, v]) => [d, (v - mean) / sd]);
}

/** Calendar-year change, with at most seven days of backward matching tolerance. */
export function toYoY(points: Points): Points {
  const out: Points = [];
  let j = 0;
  for (let i = 0; i < points.length; i++) {
    const date = new Date(`${points[i][0]}T00:00:00Z`);
    const year = date.getUTCFullYear() - 1;
    const month = date.getUTCMonth();
    const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
    const target = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
    while (j + 1 < points.length && points[j + 1][0] <= target) j++;
    if (points[j][0] <= target && daysBetween(points[j][0], target) <= 7 && points[j][1] > 0) {
      out.push([points[i][0], (points[i][1] / points[j][1] - 1) * 100]);
    }
  }
  return out;
}

export function applyTransform(points: Points, t: Transform): Points {
  switch (t) {
    case "index": return toIndex(points);
    case "zscore": return toZScore(points);
    case "yoy": return toYoY(points);
    case "raw": return points;
  }
}

export function daysBetween(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
}

/**
 * Align series onto a common daily grid (union of dates), forward-filling gaps
 * up to `maxGapDays`. Legacy utility only; never use filled values for inference.
 */
export function alignSeries(list: Series[], from: string, maxGapDays = 40): { dates: string[]; values: (number | null)[][] } {
  const dateSet = new Set<string>();
  for (const s of list) for (const [d] of s.points) if (d >= from) dateSet.add(d);
  const dates = [...dateSet].sort();
  const values = list.map((s) => {
    const out: (number | null)[] = [];
    let i = 0;
    let last: { d: string; v: number } | null = null;
    // seed with the last observation before the window so ffill works at the start
    for (const [d, v] of s.points) { if (d < from) last = { d, v }; else break; }
    const pts = s.points.filter(([d]) => d >= from);
    for (const date of dates) {
      while (i < pts.length && pts[i][0] <= date) { last = { d: pts[i][0], v: pts[i][1] }; i++; }
      out.push(last && daysBetween(last.d, date) <= maxGapDays ? last.v : null);
    }
    return out;
  });
  return { dates, values };
}

/** Pearson correlation of log-returns between two aligned value arrays. */
export function returnCorrelation(a: (number | null)[], b: (number | null)[]): number | null {
  if (a.length !== b.length) return null;
  const logA = a.every((v) => v == null || v > 0);
  const logB = b.every((v) => v == null || v > 0);
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < a.length; i++) {
    const a0 = a[i - 1], a1 = a[i], b0 = b[i - 1], b1 = b[i];
    if (a0 == null || a1 == null || b0 == null || b1 == null) continue;
    if (![a0, a1, b0, b1].every(Number.isFinite)) continue;
    ra.push(logA ? Math.log(a1 / a0) : a1 - a0);
    rb.push(logB ? Math.log(b1 / b0) : b1 - b0);
  }
  if (ra.length < 20) return null;
  return pearson(ra, rb);
}

export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3 || y.length !== n || !x.every(Number.isFinite) || !y.every(Number.isFinite)) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

export function seriesCadence(s: Series): "daily" | "weekly" | "monthly" | "annual" {
  if (s.cadence) return s.cadence;
  const recent = s.points.slice(-30);
  const gaps = recent.slice(1).map((p, i) => daysBetween(recent[i][0], p[0])).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)] ?? Infinity;
  return median < 4 ? "daily" : median < 10 ? "weekly" : median < 45 ? "monthly" : "annual";
}

/** Pairwise common endpoints, no forward filling and no mixed-frequency inference. */
export function observedCorrelation(a: Series, b: Series, from: string): { rho: number; n: number; asOf: string; basis: string } | null {
  const cadence = seriesCadence(a);
  if (cadence !== seriesCadence(b)) return null;
  const aPoints = (a.adjustedPoints ?? a.points).filter(([d]) => d >= from);
  const bMap = new Map((b.adjustedPoints ?? b.points).filter(([d]) => d >= from));
  const matched = aPoints.filter(([d]) => bMap.has(d));
  const usesLog = (s: Series, values: number[]) => !isRateSeries(s) && values.every((v) => v > 0);
  const logA = usesLog(a, matched.map((p) => p[1]));
  const logB = usesLog(b, matched.map(([d]) => bMap.get(d)!));
  const maxGap = { daily: 7, weekly: 10, monthly: 35, annual: 370 }[cadence];
  const ra: number[] = [], rb: number[] = [];
  let asOf = "";
  for (let i = 1; i < matched.length; i++) {
    const [d0, a0] = matched[i - 1], [d1, a1] = matched[i];
    if (daysBetween(d0, d1) > maxGap) continue;
    const b0 = bMap.get(d0)!, b1 = bMap.get(d1)!;
    if (![a0, a1, b0, b1].every(Number.isFinite)) continue;
    ra.push(logA ? Math.log(a1 / a0) : a1 - a0);
    rb.push(logB ? Math.log(b1 / b0) : b1 - b0);
    asOf = d1;
  }
  const rho = ra.length >= 20 ? pearson(ra, rb) : null;
  const label = (s: Series, log: boolean) => log ? `${s.adjustedPoints ? "adjusted-close " : ""}log returns` : "differences";
  return rho == null ? null : { rho, n: ra.length, asOf, basis: `${label(a, logA)} / ${label(b, logB)}` };
}
