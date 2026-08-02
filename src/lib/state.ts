/**
 * Market State Score — percentile-condition state description.
 *
 * Inspired by condition-based state models used on energy futures desks: score
 * each market condition as a percentile of its own trailing history (0–100),
 * then summarize. This is a DESCRIPTION of the current regime, not a trading
 * signal: no positions, no thresholds tuned to outcomes, every number is a
 * transparent percentile. Conditions (free public data):
 *   trend        — price vs 50-day average, percentile of the spread vs 3y
 *   volatility   — 20-day realized vol (annualized), percentile vs 3y
 *   dollar       — DXY 60-day change, percentile vs 3y (shared across markets)
 *   positioning  — managed-money net / open interest (CFTC COT), percentile vs
 *                  full weekly history (absent when cot.json lacks the market)
 *
 * The composite orients each condition to a common "supportive of the market"
 * direction (trend up = supportive; calm vol = supportive; weak dollar =
 * supportive for USD commodities; LIGHT positioning = room for new money,
 * crowded = fragile) and averages. Bands: <35 headwinds · 35–65 mixed ·
 * >65 constructive. Descriptive context only — not investment advice.
 */
import type { CotMarket, Series } from "./data";
import { daysBetween } from "./transform";

export interface StateCondition {
  key: string;
  label: string;
  percentile: number; // 0–100, of the raw measure vs its own history
  supportive: number; // 0–100, oriented so higher = supportive
  reading: string; // plain-language current reading
  detail: string; // tooltip: measure + history window
}

export interface MarketState {
  id: string;
  name: string;
  conditions: StateCondition[];
  score: number; // mean of supportive scores, 0–100
  band: "headwinds" | "mixed" | "constructive";
  asOf: string; // oldest condition observation date (honesty: the limiting input)
}

/** Percent of history values ≤ v (0–100). */
export function percentileOf(history: number[], v: number): number {
  if (!history.length) return 50;
  let below = 0;
  for (const h of history) if (h <= v) below++;
  return Math.round((below / history.length) * 1000) / 10;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Rolling series of (price / SMA(n) − 1), most recent last. */
function trendSpreadHistory(points: [string, number][], n = 50): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += points[i][1];
    if (i >= n) sum -= points[i - n][1];
    if (i >= n - 1) {
      const sma = sum / n;
      if (sma > 0) out.push(points[i][1] / sma - 1);
    }
  }
  return out;
}

/** Rolling 20-obs realized volatility (annualized %, log-returns). */
function realizedVolHistory(points: [string, number][], win = 20): number[] {
  const rets: number[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i][1] > 0 && points[i - 1][1] > 0) rets.push(Math.log(points[i][1] / points[i - 1][1]));
  }
  const out: number[] = [];
  for (let i = win; i <= rets.length; i++) {
    const w = rets.slice(i - win, i);
    const mean = w.reduce((a, b) => a + b, 0) / win;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / win);
    out.push(sd * Math.sqrt(252) * 100);
  }
  return out;
}

/** Rolling n-obs % change history. */
function changeHistory(points: [string, number][], n = 60): number[] {
  const out: number[] = [];
  for (let i = n; i < points.length; i++) {
    if (points[i - n][1] > 0) out.push((points[i][1] / points[i - n][1] - 1) * 100);
  }
  return out;
}

const LOOKBACK_OBS = 756; // ~3y of daily observations for percentile context

function lastPercentile(history: number[]): { pct: number; value: number } | null {
  if (history.length < 120) return null;
  const window = history.slice(-LOOKBACK_OBS);
  const value = window[window.length - 1];
  return { pct: percentileOf(window.slice(0, -1), value), value };
}

export function computeMarketState(
  market: { id: string; name: string },
  price: Series,
  dxy: Series | undefined,
  cot: CotMarket | undefined,
): MarketState | null {
  const n = price.points.length;
  if (n < 300) return null;
  // daily series only — weekly/monthly cadences would distort the vol/trend windows
  if (daysBetween(price.points[n - 21][0], price.points[n - 1][0]) / 20 >= 4) return null;

  const conditions: StateCondition[] = [];
  const dates: string[] = [price.points[n - 1][0]];

  const trend = lastPercentile(trendSpreadHistory(price.points));
  if (trend) {
    conditions.push({
      key: "trend",
      label: "Trend",
      percentile: trend.pct,
      supportive: trend.pct,
      reading: `price ${trend.value >= 0 ? "+" : ""}${r1(trend.value * 100)}% vs 50d avg — ${trend.pct >= 55 ? "uptrend" : trend.pct <= 45 ? "downtrend" : "flat"}`,
      detail: "price / 50-day average − 1, percentile vs ~3y of the same measure",
    });
  }

  const vol = lastPercentile(realizedVolHistory(price.points));
  if (vol) {
    conditions.push({
      key: "vol",
      label: "Volatility",
      percentile: vol.pct,
      supportive: 100 - vol.pct, // calm = orderly = supportive
      reading: `20d realized ${r1(vol.value)}% ann. — ${vol.pct >= 70 ? "turbulent" : vol.pct <= 30 ? "calm" : "normal"}`,
      detail: "20-obs realized volatility (annualized), percentile vs ~3y; calm scores supportive",
    });
  }

  if (dxy) {
    const usd = lastPercentile(changeHistory(dxy.points));
    if (usd) {
      conditions.push({
        key: "dollar",
        label: "US dollar",
        percentile: usd.pct,
        supportive: 100 - usd.pct, // strong dollar = headwind for USD commodities
        reading: `DXY ${usd.value >= 0 ? "+" : ""}${r1(usd.value)}% over 60d — ${usd.pct >= 70 ? "dollar strength" : usd.pct <= 30 ? "dollar weakness" : "neutral"}`,
        detail: "DXY 60-obs % change, percentile vs ~3y; dollar weakness scores supportive",
      });
    }
  }

  if (cot && cot.points.length >= 100) {
    const ratios = cot.points.map((p) => (p[1] / p[2]) * 100);
    const pct = percentileOf(ratios.slice(0, -1), ratios[ratios.length - 1]);
    const netPct = r1(ratios[ratios.length - 1]);
    conditions.push({
      key: "positioning",
      label: "Positioning",
      percentile: pct,
      supportive: 100 - pct, // crowded longs = fragile; light = room
      reading: `managed money ${netPct >= 0 ? "net long" : "net short"} ${Math.abs(netPct)}% of OI — ${pct >= 70 ? "crowded" : pct <= 30 ? "light" : "moderate"}`,
      detail: `${cot.label}: managed-money net / open interest, percentile vs full weekly history (CFTC COT); light positioning scores supportive`,
    });
    dates.push(cot.lastUpdated);
  }

  if (conditions.length < 3) return null;
  const score = Math.round(conditions.reduce((a, c) => a + c.supportive, 0) / conditions.length);
  return {
    id: market.id,
    name: market.name,
    conditions,
    score,
    band: score > 65 ? "constructive" : score < 35 ? "headwinds" : "mixed",
    asOf: dates.reduce((m, d) => (d < m ? d : m)),
  };
}
