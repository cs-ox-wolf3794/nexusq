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
 * ledger of what was claimed and when. These records support future calibration; no outcome scoreboard is claimed.
 *
 * Run: npx tsx scripts/snapshot-signals.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { ENGINE_VERSION, computeSignals } from "../src/lib/signals";
import { analysisEligibility, recentTimestamp } from "../src/lib/quality";
import { externalForecastCurrent, forecastHorizons } from "../src/lib/forecast";
import type { ForecastFile, QualityFile, Series } from "../src/lib/data";

const DATA = path.resolve(process.env.NEXUSQ_DATA_DIR ?? "public/data");
const HIST = path.join(DATA, "history");
const today = new Date().toISOString().slice(0, 10);
if (existsSync(path.join(HIST, `${today}.json`))) {
  console.log(`Preserving first-issued daily record for ${today}.`);
  process.exit(0);
}

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

const quality = read("quality.json") as QualityFile;
const eligible = new Map([...map].filter(([, series]) => analysisEligibility(series, quality).eligible));
const signals = computeSignals(eligible).map((s) => ({
  asOf: s.asOf,
  kind: s.kind,
  subject: s.subject,
  value: s.value,
  severity: s.severity,
  seriesIds: s.seriesIds,
}));

// Preserve future-only points and their actual horizon and source-period basis.
const forecasts = read("forecasts.json") as ForecastFile;
const digest: Record<string, unknown> = {};
for (const [id, fc] of Object.entries(forecasts.series)) {
  if (!eligible.has(id)) continue;
  if (fc.kind === "external" && !externalForecastCurrent(fc)) continue;
  if (fc.kind === "model" && (fc.asOf !== eligible.get(id)!.lastUpdated || !recentTimestamp(fc.issuedAt, 72 * 3600000))) continue;
  const horizons = forecastHorizons(fc, today);
  if (Object.keys(horizons).length) digest[id] = {
    kind: fc.kind, horizons,
    ...(fc.kind === "external" ? { source: fc.source, sourceVintage: fc.sourceVintage, retrievedAt: fc.retrievedAt, periodBasis: fc.periodBasis, contentUpdatedAt: fc.contentUpdatedAt } : { issuedAt: fc.issuedAt, asOf: fc.asOf, method: fc.method }),
  };
}

const spot: Record<string, [string, number]> = {};
for (const [id, s] of map) {
  const last = s.points[s.points.length - 1];
  if (last) spot[id] = last;
}

mkdirSync(HIST, { recursive: true });
const record = { engineVersion: ENGINE_VERSION, inputSnapshot: read("catalog.json").generated, date: today, generated: new Date().toISOString(), signals, forecastDigest: digest, spot };
writeFileSync(path.join(HIST, `${today}.json`), JSON.stringify(record), { flag: "wx" });

const indexFile = path.join(HIST, "index.json");
const index: string[] = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")) : [];
if (!index.includes(today)) index.push(today);
index.sort();
writeFileSync(indexFile, JSON.stringify(index));

console.log(`ok   history/${today}.json — ${signals.length} signals, ${Object.keys(digest).length} forecast digests, ${Object.keys(spot).length} spot anchors (${index.length} days on record)`);
