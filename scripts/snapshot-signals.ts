/**
 * Daily trust snapshot — the track-record clock.
 *
 * Reads the freshly refreshed public/data snapshots, recomputes the signal set
 * with the SAME engine the app uses (src/lib/signals), and writes a small dated
 * record to public/data/history/YYYY-MM-DD.json:
 *   - every active signal (kind, subject, value, severity),
 *   - a compact forecast digest (P10/P50/P90 at ~7/30/90-day horizons per series),
 *   - the latest actual observation per series (the future "realized" anchor).
 *
 * Committed by the daily cron → git history becomes a tamper-evident public
 * ledger of what was claimed and when. The calibration scoreboard reads these.
 *
 * Run: npx tsx scripts/snapshot-signals.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { computeSignals } from "../src/lib/signals";
import type { Series } from "../src/lib/data";

const DATA = path.resolve(process.cwd(), "public/data");
const HIST = path.join(DATA, "history");

const read = (f: string) => JSON.parse(readFileSync(path.join(DATA, f), "utf8"));

const catalog = read("catalog.json") as { series: { id: string }[] };
const map = new Map<string, Series>();
for (const { id } of catalog.series) {
  try {
    map.set(id, read(`${id}.json`));
  } catch {
    console.error(`skip ${id}: unreadable`);
  }
}

const signals = computeSignals(map).map((s) => ({
  kind: s.kind,
  subject: s.subject,
  value: s.value,
  severity: s.severity,
  seriesIds: s.seriesIds,
}));

// forecast digest: quantiles at ~7/30/90 days out, plus the current spot anchor
type FanPoint = [string, number, number, number, number, number];
type ExtPoint = [string, number];
const forecasts = read("forecasts.json") as {
  series: Record<string, { kind: string; source?: string; points: (FanPoint | ExtPoint)[] }>;
};
const today = new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const HORIZONS = [7, 30, 90];

const digest: Record<string, unknown> = {};
for (const [id, fc] of Object.entries(forecasts.series)) {
  const byHorizon: Record<string, unknown> = {};
  for (const h of HORIZONS) {
    const target = addDays(today, h);
    let best: (FanPoint | ExtPoint) | null = null;
    let bestGap = Infinity;
    for (const p of fc.points) {
      const gap = Math.abs(
        (Date.parse(`${p[0]}T00:00:00Z`) - Date.parse(`${target}T00:00:00Z`)) / 86400000,
      );
      if (gap < bestGap) { bestGap = gap; best = p; }
    }
    if (!best || bestGap > Math.max(10, h * 0.3)) continue;
    byHorizon[String(h)] = best.length === 6
      ? { date: best[0], p10: best[1], p50: best[3], p90: best[5] }
      : { date: best[0], value: best[1] };
  }
  if (Object.keys(byHorizon).length) {
    digest[id] = { kind: fc.kind, source: fc.source, horizons: byHorizon };
  }
}

const spot: Record<string, [string, number]> = {};
for (const [id, s] of map) {
  const last = s.points[s.points.length - 1];
  if (last) spot[id] = last;
}

mkdirSync(HIST, { recursive: true });
const record = { date: today, generated: new Date().toISOString(), signals, forecastDigest: digest, spot };
writeFileSync(path.join(HIST, `${today}.json`), JSON.stringify(record));

const indexFile = path.join(HIST, "index.json");
const index: string[] = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")) : [];
if (!index.includes(today)) index.push(today);
index.sort();
writeFileSync(indexFile, JSON.stringify(index));

console.log(`ok   history/${today}.json — ${signals.length} signals, ${Object.keys(digest).length} forecast digests, ${Object.keys(spot).length} spot anchors (${index.length} days on record)`);
