/**
 * Signal backtesting — EVENT-STUDY frame, not a strategy backtest.
 *
 * Replays the production signal engine (src/lib/signals) over history as-of
 * each trading day and asks: after a signal fired, did what it describes
 * actually happen? Non-negotiables implemented here:
 *   - publication-lag honesty: outcomes are evaluated from the first observation
 *     ON/AFTER onset + visibilityLagDays (the date a live user could have acted),
 *   - episode collapsing: a signal firing daily for two weeks is ONE event
 *     (absent → present transition, with a cooldown guard),
 *   - drift-honest baselines: each episode's hit is compared against the
 *     unconditional probability of the same-sign move in that same series,
 *   - moving-block bootstrap CIs over chronologically ordered episodes,
 *   - v1 scope: daily series only (monthly excluded — kills CPI/INDPRO
 *     revision bias and keeps horizons comparable).
 *
 * Thresholds are the production ones, chosen a priori. Tuning them after
 * seeing these results is data snooping — any change goes through the
 * Methodology change log with pre-change results preserved.
 */
import type { Series } from "./data";
import { computeSignals } from "./signals";
import { alignSeries, daysBetween, returnCorrelation } from "./transform";

export interface Episode {
  family: string; // Dislocation | Momentum | Correlation regime
  subject: string;
  seriesIds: string[];
  onset: string; // data date on which the signal first appeared
  severity: string;
  metric: number;
  cShort?: number;
  cLong?: number;
}

export interface EpisodeOutcome extends Episode {
  entryDate: string | null;
  // per horizon (trading obs): signed move in the hypothesis direction (% for
  // log-space series), hit flag, and this series' unconditional same-sign probability
  outcomes: Record<string, { move: number; hit: boolean; baselineHit: number } | null>;
}

export interface ReplayOptions {
  start: string;
  visibilityLagDays: number; // calendar days from data date to actionable date
  cooldownDays: number; // min calendar days between episodes of the same key
  horizons: number[]; // forward windows in trading observations
  corrEvalObs: number; // trading obs after entry at which ρ persistence is judged
}

export const DEFAULT_OPTIONS: ReplayOptions = {
  start: "2015-01-01",
  visibilityLagDays: 3,
  cooldownDays: 15,
  horizons: [5, 20, 60],
  corrEvalObs: 60,
};

function isDaily(s: Series): boolean {
  const n = s.points.length;
  if (n < 30) return false;
  return daysBetween(s.points[n - 21][0], s.points[n - 1][0]) / 20 < 4;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Signed % move over h observations from entry, in the hypothesis direction. */
function signedMove(points: [string, number][], entryIdx: number, h: number, dir: 1 | -1): number | null {
  if (entryIdx + h >= points.length) return null;
  const a = points[entryIdx][1];
  const b = points[entryIdx + h][1];
  const move = a > 0 && b > 0 ? (Math.log(b / a)) * 100 : b - a;
  return move * dir;
}

/** Unconditional P(sign(h-obs move) matches dir) across the whole series. */
function baselineHitRate(points: [string, number][], h: number, dir: 1 | -1): number {
  let hits = 0, n = 0;
  for (let i = 0; i + h < points.length; i++) {
    const m = signedMove(points, i, h, dir);
    if (m == null) continue;
    n++;
    if (m > 0) hits++;
  }
  return n ? hits / n : 0.5;
}

/**
 * Replay the signal engine day by day and collapse firings into episodes.
 * `grid` = trading calendar (use a liquid daily series' dates).
 */
export function replayEpisodes(all: Map<string, Series>, opts: ReplayOptions = DEFAULT_OPTIONS): Episode[] {
  const daily = new Map([...all].filter(([, s]) => isDaily(s)));
  const gridSeries = daily.get("BRENT") ?? [...daily.values()][0];
  if (!gridSeries) return [];
  const grid = gridSeries.points.map((p) => p[0]).filter((d) => d >= opts.start);

  // per-series pointer into points (monotone over the replay)
  const ptr = new Map<string, number>([...all.keys()].map((id) => [id, 0]));
  const episodes: Episode[] = [];
  const activeKeys = new Set<string>();
  const lastOnset = new Map<string, string>();

  for (const day of grid) {
    const truncated = new Map<string, Series>();
    for (const [id, s] of all) {
      let i = ptr.get(id)!;
      while (i < s.points.length && s.points[i][0] <= day) i++;
      ptr.set(id, i);
      if (i >= 40) truncated.set(id, { ...s, points: s.points.slice(0, i) });
    }

    const signals = computeSignals(truncated, day);
    const todayKeys = new Set<string>();
    for (const sig of signals) {
      // v1: only episodes whose primary series is daily (corr pairs always are)
      if (sig.kind !== "Correlation regime" && !daily.has(sig.seriesIds[0])) continue;
      const key = `${sig.kind}|${sig.subject}`;
      todayKeys.add(key);
      if (activeKeys.has(key)) continue;
      const prev = lastOnset.get(key);
      if (prev && daysBetween(prev, day) < opts.cooldownDays) continue;
      lastOnset.set(key, day);
      episodes.push({
        family: sig.kind,
        subject: sig.subject,
        seriesIds: sig.seriesIds,
        onset: day,
        severity: sig.severity,
        metric: sig.metric,
        cShort: sig.aux?.cShort,
        cLong: sig.aux?.cLong,
      });
    }
    activeKeys.clear();
    for (const k of todayKeys) activeKeys.add(k);
  }
  return episodes;
}

/** Evaluate forward outcomes for every episode, with the publication lag imposed. */
export function evaluateEpisodes(
  episodes: Episode[],
  all: Map<string, Series>,
  opts: ReplayOptions = DEFAULT_OPTIONS,
): EpisodeOutcome[] {
  // cache baseline hit rates per (series, horizon, dir)
  const baseCache = new Map<string, number>();
  const baseline = (s: Series, h: number, dir: 1 | -1) => {
    const k = `${s.id}|${h}|${dir}`;
    let v = baseCache.get(k);
    if (v === undefined) {
      v = baselineHitRate(s.points, h, dir);
      baseCache.set(k, v);
    }
    return v;
  };

  return episodes.map((ep) => {
    const outcomes: EpisodeOutcome["outcomes"] = {};
    if (ep.family === "Correlation regime") {
      // persistence: is ρ120 at entry+corrEvalObs closer to the NEW regime than the old?
      const [aId, bId] = ep.seriesIds;
      const a = all.get(aId)!, b = all.get(bId)!;
      const visible = addDays(ep.onset, opts.visibilityLagDays);
      const gridDates = a.points.map((p) => p[0]);
      const entryIdx = gridDates.findIndex((d) => d >= visible);
      const evalIdx = entryIdx >= 0 ? entryIdx + opts.corrEvalObs : -1;
      if (entryIdx < 0 || evalIdx >= gridDates.length || ep.cShort == null || ep.cLong == null) {
        outcomes[String(opts.corrEvalObs)] = null;
      } else {
        const evalDate = gridDates[evalIdx];
        const from = addDays(evalDate, -120);
        const trunc = (s: Series): Series => ({
          ...s,
          points: s.points.filter(([d]) => d <= evalDate),
        });
        const g = alignSeries([trunc(a), trunc(b)], from);
        const rhoLater = returnCorrelation(g.values[0], g.values[1]);
        if (rhoLater == null) {
          outcomes[String(opts.corrEvalObs)] = null;
        } else {
          const hit = Math.abs(rhoLater - ep.cShort) < Math.abs(rhoLater - ep.cLong);
          outcomes[String(opts.corrEvalObs)] = {
            move: Math.round((rhoLater - ep.cShort) * 100) / 100,
            hit,
            baselineHit: 0.5, // replaced by the family-level random-date baseline
          };
        }
      }
      return { ...ep, entryDate: null, outcomes };
    }

    // dislocation: expect reversion (-sign z); momentum: expect continuation (+sign spread)
    const dir: 1 | -1 = ep.family === "Dislocation" ? (ep.metric > 0 ? -1 : 1) : ep.metric > 0 ? 1 : -1;
    const s = all.get(ep.seriesIds[0])!;
    const visible = addDays(ep.onset, opts.visibilityLagDays);
    const entryIdx = s.points.findIndex(([d]) => d >= visible);
    const entryDate = entryIdx >= 0 ? s.points[entryIdx][0] : null;
    for (const h of opts.horizons) {
      if (entryIdx < 0) {
        outcomes[String(h)] = null;
        continue;
      }
      const m = signedMove(s.points, entryIdx, h, dir);
      outcomes[String(h)] = m == null ? null : {
        move: Math.round(m * 100) / 100,
        hit: m > 0,
        baselineHit: Math.round(baseline(s, h, dir) * 1000) / 1000,
      };
    }
    return { ...ep, entryDate, outcomes };
  });
}

/**
 * Random-date baseline for correlation persistence: at monthly-stepped dates,
 * how often is ρ120 sixty obs later closer to the then-current ρ120 than to
 * the then-current ρ(1y)? Correlations are sticky — this baseline is high,
 * and the signal must beat it to mean anything.
 */
export function corrPersistenceBaseline(
  all: Map<string, Series>,
  pairs: [string, string][],
  opts: ReplayOptions = DEFAULT_OPTIONS,
): number {
  let hits = 0, n = 0;
  for (const [aId, bId] of pairs) {
    const a = all.get(aId), b = all.get(bId);
    if (!a || !b) continue;
    const dates = a.points.map((p) => p[0]).filter((d) => d >= opts.start);
    for (let i = 0; i + opts.corrEvalObs < dates.length; i += 21) {
      const d0 = dates[i];
      const dEval = dates[i + opts.corrEvalObs];
      const truncTo = (s: Series, cut: string): Series => ({ ...s, points: s.points.filter(([d]) => d <= cut) });
      const g1 = alignSeries([truncTo(a, d0), truncTo(b, d0)], addDays(d0, -120));
      const gY = alignSeries([truncTo(a, d0), truncTo(b, d0)], addDays(d0, -365));
      const gL = alignSeries([truncTo(a, dEval), truncTo(b, dEval)], addDays(dEval, -120));
      const c0 = returnCorrelation(g1.values[0], g1.values[1]);
      const cY = returnCorrelation(gY.values[0], gY.values[1]);
      const cL = returnCorrelation(gL.values[0], gL.values[1]);
      if (c0 == null || cY == null || cL == null) continue;
      n++;
      if (Math.abs(cL - c0) < Math.abs(cL - cY)) hits++;
    }
  }
  return n ? hits / n : 0.5;
}

// ---- aggregation with block-bootstrap CIs -----------------------------------

interface HorizonStats {
  n: number;
  hitRate: number;
  hitCI: [number, number];
  meanMove: number;
  moveCI: [number, number];
  baselineHit: number;
}

/** Deterministic LCG so backtest.json is reproducible run-to-run. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function blockBootstrap(values: { hit: boolean; move: number }[], B = 1000, blockSize = 5): {
  hitCI: [number, number];
  moveCI: [number, number];
} {
  const n = values.length;
  if (n < 3) return { hitCI: [0, 1], moveCI: [0, 0] };
  const rng = makeRng(42);
  const hitRates: number[] = [];
  const moves: number[] = [];
  for (let b = 0; b < B; b++) {
    let hits = 0, moveSum = 0, count = 0;
    while (count < n) {
      const startI = Math.floor(rng() * n);
      for (let j = 0; j < blockSize && count < n; j++, count++) {
        const v = values[(startI + j) % n];
        if (v.hit) hits++;
        moveSum += v.move;
      }
    }
    hitRates.push(hits / n);
    moves.push(moveSum / n);
  }
  hitRates.sort((a, b) => a - b);
  moves.sort((a, b) => a - b);
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return {
    hitCI: [r3(q(hitRates, 0.025)), r3(q(hitRates, 0.975))],
    moveCI: [r3(q(moves, 0.025)), r3(q(moves, 0.975))],
  };
}

export function aggregate(
  outcomes: EpisodeOutcome[],
  horizon: string,
  filter: (e: EpisodeOutcome) => boolean = () => true,
): HorizonStats | null {
  const rows = outcomes
    .filter(filter)
    .map((e) => e.outcomes[horizon])
    .filter((o): o is NonNullable<typeof o> => o != null);
  if (rows.length < 3) return null;
  const n = rows.length;
  const hitRate = rows.filter((r) => r.hit).length / n;
  const meanMove = rows.reduce((a, r) => a + r.move, 0) / n;
  const baselineHit = rows.reduce((a, r) => a + r.baselineHit, 0) / n;
  const ci = blockBootstrap(rows.map((r) => ({ hit: r.hit, move: r.move })));
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return { n, hitRate: r3(hitRate), hitCI: ci.hitCI, meanMove: r3(meanMove), moveCI: ci.moveCI, baselineHit: r3(baselineHit) };
}
