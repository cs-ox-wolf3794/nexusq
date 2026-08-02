/**
 * Signal backtest driver — event-study replay of the production signal engine.
 * Writes public/data/backtest.json consumed by the Validation section in the UI.
 *
 * Run: npx tsx scripts/backtest-signals.ts   (few minutes: daily as-of replay)
 * Regenerate after any engine/threshold change (and record it in the
 * Methodology change log — pre-change results preserved in git history).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Series } from "../src/lib/data";
import {
  DEFAULT_OPTIONS, aggregate, corrPersistenceBaseline, evaluateEpisodes, replayEpisodes,
} from "../src/lib/backtest";

const DATA = path.resolve(process.cwd(), "public/data");
const read = (f: string) => JSON.parse(readFileSync(path.join(DATA, f), "utf8"));

const catalog = read("catalog.json") as { series: { id: string }[] };
const all = new Map<string, Series>();
for (const { id } of catalog.series) all.set(id, read(`${id}.json`));

console.log(`replaying signal engine over history (start ${DEFAULT_OPTIONS.start})…`);
const t0 = Date.now();
const episodes = replayEpisodes(all, DEFAULT_OPTIONS);
console.log(`  ${episodes.length} episodes in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

const outcomes = evaluateEpisodes(episodes, all, DEFAULT_OPTIONS);

const PAIRS: [string, string][] = [
  ["BRENT", "XLE"], ["BRENT", "SP500"], ["BRENT", "EURUSD"],
  ["BRENT", "BREAKEVEN10Y"], ["HENRYHUB", "ICLN"], ["BRENT", "GOLD"],
];
console.log("computing correlation-persistence baseline…");
const corrBase = Math.round(corrPersistenceBaseline(all, PAIRS, DEFAULT_OPTIONS) * 1000) / 1000;

const SEVERITIES = ["watch", "elevated", "extreme"];
const PERIOD_SPLIT = "2020-01-01";

function familyBlock(family: string, mainHorizon: string, horizons: string[]) {
  const fam = outcomes.filter((o) => o.family === family);
  const block: Record<string, unknown> = {
    episodes: fam.length,
    horizons: Object.fromEntries(horizons.map((h) => [h, aggregate(outcomes, h, (e) => e.family === family)])),
    bySeverity: Object.fromEntries(SEVERITIES.map((sev) => [
      sev, aggregate(outcomes, mainHorizon, (e) => e.family === family && e.severity === sev),
    ])),
    byPeriod: {
      pre2020: aggregate(outcomes, mainHorizon, (e) => e.family === family && e.onset < PERIOD_SPLIT),
      post2020: aggregate(outcomes, mainHorizon, (e) => e.family === family && e.onset >= PERIOD_SPLIT),
    },
  };
  return block;
}

const H = DEFAULT_OPTIONS.horizons.map(String);
const corrH = String(DEFAULT_OPTIONS.corrEvalObs);

const result = {
  generated: new Date().toISOString(),
  method: {
    frame: "event-study (NOT a strategy backtest: no positions, sizing or costs)",
    options: DEFAULT_OPTIONS,
    hypotheses: {
      Dislocation: "mean reversion: forward move opposite to the z-score sign",
      Momentum: "continuation: forward move in the direction of the 50/200 spread",
      "Correlation regime": `persistence: ρ120 after ${corrH} obs is closer to the new regime than the old`,
    },
    baselines: {
      directional: "per-episode unconditional P(same-sign move) in the same series (drift-honest)",
      corrPersistence: "random monthly-stepped dates on the same pairs",
    },
    scope: "daily series only (monthly excluded: horizon comparability + revision bias)",
    thresholds: "production values, chosen a priori — tuning after seeing results is snooping",
    ci: "moving-block bootstrap (block 5, B=1000, seeded)",
  },
  corrPersistenceBaseline: corrBase,
  families: {
    Dislocation: familyBlock("Dislocation", "20", H),
    Momentum: familyBlock("Momentum", "20", H),
    "Correlation regime": familyBlock("Correlation regime", corrH, [corrH]),
  },
};

writeFileSync(path.join(DATA, "backtest.json"), JSON.stringify(result));
console.log("ok   backtest.json");
for (const [fam, blk] of Object.entries(result.families)) {
  const b = blk as { episodes: number; horizons: Record<string, { hitRate: number; baselineHit: number; n: number } | null> };
  const main = fam === "Correlation regime" ? corrH : "20";
  const st = b.horizons[main];
  console.log(
    `  ${fam.padEnd(20)} ${String(b.episodes).padStart(4)} episodes | h=${main}: ` +
    (st ? `hit ${(st.hitRate * 100).toFixed(1)}% vs baseline ${( (fam === "Correlation regime" ? corrBase : st.baselineHit) * 100).toFixed(1)}% (n=${st.n})` : "n/a"),
  );
}
