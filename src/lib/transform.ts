import type { Series } from "./data";

export type Transform = "index" | "zscore" | "yoy" | "raw";

export const TRANSFORM_LABELS: Record<Transform, string> = {
  index: "Indexed",
  zscore: "Z-score",
  yoy: "YoY %",
  raw: "Raw",
};

export type Points = [string, number][];

export function clampRange(points: Points, from: string): Points {
  return points.filter(([d]) => d >= from);
}

/** Rebase so the first visible observation = 100. */
export function toIndex(points: Points): Points {
  if (!points.length) return points;
  const base = points[0][1];
  if (base === 0) return points.map(([d]) => [d, 0]);
  return points.map(([d, v]) => [d, (v / base) * 100]);
}

/** Z-score over the visible window. */
export function toZScore(points: Points): Points {
  const vals = points.map((p) => p[1]);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
  return points.map(([d, v]) => [d, (v - mean) / sd]);
}

/** Year-over-year % change, matched to the closest observation ≥ ~340 days back. */
export function toYoY(points: Points): Points {
  const out: Points = [];
  let j = 0;
  for (let i = 0; i < points.length; i++) {
    const target = shiftDays(points[i][0], -365);
    while (j + 1 < points.length && points[j + 1][0] <= target) j++;
    if (points[j][0] <= target && daysBetween(points[j][0], points[i][0]) >= 340 && points[j][1] !== 0) {
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

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
}

/**
 * Align series onto a common daily grid (union of dates), forward-filling gaps
 * up to `maxGapDays`. Used for correlations, not for display.
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
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < a.length; i++) {
    const a0 = a[i - 1], a1 = a[i], b0 = b[i - 1], b1 = b[i];
    if (a0 == null || a1 == null || b0 == null || b1 == null) continue;
    if (a0 <= 0 || a1 <= 0 || b0 <= 0 || b1 <= 0) {
      // yields/rates can be ≤ 0 — fall back to differences
      ra.push(a1 - a0);
      rb.push(b1 - b0);
    } else {
      ra.push(Math.log(a1 / a0));
      rb.push(Math.log(b1 / b0));
    }
  }
  if (ra.length < 20) return null;
  return pearson(ra, rb);
}

export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}
