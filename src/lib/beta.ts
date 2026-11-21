import type { Points } from "./transform";
import { daysBetween } from "./transform";

/**
 * Energy Beta analytics (Nexus core metric):
 *   β = Cov(r_asset, r_driver) / Var(r_driver)   on daily log-returns
 *   α = mean(r_asset) − β · mean(r_driver)       log-return intercept
 * Betas are windowed (rolling) so regime changes are visible, and every figure
 * ships with its R² and sample size — a number without its fit quality is bait.
 */

export interface BetaStats {
  asOf?: string;
  betaCI: [number, number]; // approximate 95% Newey-West HAC interval, not predictive coverage
  beta: number;
  alphaAnnual: number; // annualized, %
  r2: number;
  n: number;
}

export interface RollingBeta {
  current: BetaStats;
  history: [string, number][]; // [date, beta] — one point per week
}

/** Pair up daily log-returns on dates both series observe. */
function pairedReturns(asset: Points, driver: Points): { dates: string[]; ra: number[]; rd: number[] } {
  const dm = new Map(driver.map(([d, v], i) => [d, { v, prior: driver[i - 1] }]));
  const dates: string[] = [];
  const ra: number[] = [];
  const rd: number[] = [];
  let prevA: [string, number] | null = null;
  for (const [d, v] of asset) {
    const observation = dm.get(d);
    const dv = observation?.v, prior = observation?.prior;
    if (prevA && prior && prior[0] === prevA[0] && dv != null && [v, prevA[1], dv, prior[1]].every((x) => Number.isFinite(x) && x > 0) && daysBetween(prevA[0], d) <= 7) {
      dates.push(d);
      ra.push(Math.log(v / prevA[1]));
      rd.push(Math.log(dv / prior[1]));
    }
    prevA = [d, v];
  }
  return { dates, ra, rd };
}

function olsStats(ra: number[], rd: number[]): BetaStats | null {
  const n = ra.length;
  if (n < 30) return null;
  const ma = ra.reduce((a, b) => a + b, 0) / n;
  const md = rd.reduce((a, b) => a + b, 0) / n;
  let sad = 0, sdd = 0, saa = 0;
  for (let i = 0; i < n; i++) {
    const da = ra[i] - ma, dd = rd[i] - md;
    sad += da * dd; sdd += dd * dd; saa += da * da;
  }
  if (sdd === 0 || saa === 0) return null;
  const beta = sad / sdd;
  const r = sad / Math.sqrt(saa * sdd);
  const alphaDaily = ma - beta * md;
  // HAC sandwich variance for the slope: heteroskedasticity and short-run serial correlation.
  const scores = ra.map((r, i) => (rd[i] - md) * (r - alphaDaily - beta * rd[i]));
  let meat = scores.reduce((sum, value) => sum + value * value, 0);
  const lags = Math.floor(4 * (n / 100) ** (2 / 9));
  for (let lag = 1; lag <= lags; lag++) {
    let covariance = 0;
    for (let i = lag; i < n; i++) covariance += scores[i] * scores[i - lag];
    meat += 2 * (1 - lag / (lags + 1)) * covariance;
  }
  const se = Math.sqrt(Math.max(0, (n / (n - 2)) * meat / (sdd * sdd)));
  return {
    beta,
    betaCI: [beta - 1.96 * se, beta + 1.96 * se],
    alphaAnnual: alphaDaily * 252 * 100, // annualized log-return intercept, %; not risk-adjusted alpha
    r2: Math.max(0, Math.min(1, r * r)),
    n,
  };
}

/** Rolling beta: `window` paired observations, stepped weekly for the history. */
export function rollingBeta(asset: Points, driver: Points, window = 90): RollingBeta | null {
  const { dates, ra, rd } = pairedReturns(asset, driver);
  if (ra.length < window) return null;
  const through = [asset.at(-1)?.[0] ?? "", driver.at(-1)?.[0] ?? ""].sort()[0];
  if (daysBetween(dates.at(-1)!, through) > 7 || daysBetween(dates.at(-window)!, dates.at(-1)!) > 2 * window + 7) return null;
  const current = olsStats(ra.slice(-window), rd.slice(-window));
  if (!current) return null;
  current.asOf = dates.at(-1);
  const history: [string, number][] = [];
  for (let end = window; end <= ra.length; end += 5) {
    const s = olsStats(ra.slice(end - window, end), rd.slice(end - window, end));
    if (s) history.push([dates[end - 1], s.beta]);
  }
  return { current, history };
}

/** Convert a percentage driver move through the fitted log-return slope. No intercept or causality assumed. */
export function associatedMove(beta: number, shockPct: number): number | null {
  if (!Number.isFinite(beta) || !Number.isFinite(shockPct) || shockPct <= -100) return null;
  const move = 100 * Math.expm1(beta * Math.log1p(shockPct / 100));
  return Number.isFinite(move) ? move : null;
}

/**
 * Sovereign beta: annual GDP growth regressed on same-year oil % change,
 * CONTROLLING for world GDP growth (Frisch–Waugh: residualize both sides on
 * the global cycle, then OLS the residuals). Without the control, common
 * shocks — COVID above all — make every economy look positively oil-exposed,
 * because oil is procyclical. With it, the beta reads as "GDP sensitivity to
 * oil beyond what the global cycle explains"; no sign or causality is guaranteed.
 * Annual data → n≈25; r is the partial correlation. Both are displayed.
 */
export interface GdpBeta {
  betaPer10Pct: number; // pp of GDP growth per +10% oil, cycle-adjusted
  r: number; // partial correlation
  n: number;
  betaCI: [number, number]; // 95% HC3/t interval, heteroskedasticity robust, not a forecast
  asOf: string;
}

function residualize(y: number[], x: number[]): number[] {
  const n = y.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxx <= 1e-12 ? 0 : sxy / sxx;
  return y.map((v, i) => v - my - b * (x[i] - mx));
}

export function gdpBeta(
  gdp: [string, number][],
  oilAnnual: [string, number][],
  worldGdp: [string, number][],
): GdpBeta | null {
  if ([...gdp, ...oilAnnual, ...worldGdp].some(([, v]) => !Number.isFinite(v))) return null;
  if ([gdp, oilAnnual, worldGdp].some((rows) => new Set(rows.map(([d]) => d.slice(0, 4))).size !== rows.length)) return null;
  const oil = new Map(oilAnnual);
  const world = new Map(worldGdp.map(([d, v]) => [d.slice(0, 4), v]));
  const xOil: number[] = [];
  const xWorld: number[] = [];
  const yGdp: number[] = [];
  const years: string[] = [];
  for (const [d, g] of gdp) {
    const yr = d.slice(0, 4);
    const a = oil.get(yr), p = oil.get(String(Number(yr) - 1)), w = world.get(yr);
    if (a == null || p == null || p <= 0 || w == null) continue;
    xOil.push((a / p - 1) * 100);
    xWorld.push(w);
    yGdp.push(g);
    years.push(yr);
  }
  const n = yGdp.length;
  if (n < 12) return null;
  // Frisch–Waugh: partial the global cycle out of both GDP growth and oil change
  const ry = residualize(yGdp, xWorld);
  const rx = residualize(xOil, xWorld);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += rx[i] * ry[i]; sxx += rx[i] ** 2; syy += ry[i] ** 2; }
  const mx = xOil.reduce((a, b) => a + b, 0) / n;
  const rawOilVariance = xOil.reduce((sum, x) => sum + (x - mx) ** 2, 0);
  if (sxx <= Math.max(1e-12, rawOilVariance * 1e-10)) return null; // oil identified independently of the world control
  const slope = sxy / sxx;
  const mw = xWorld.reduce((a, b) => a + b, 0) / n;
  const sw = xWorld.reduce((sum, w) => sum + (w - mw) ** 2, 0);
  const k = sw > 1e-12 ? 3 : 2;
  let meat = 0;
  for (let i = 0; i < n; i++) {
    const leverage = 1 / n + (sw > 1e-12 ? (xWorld[i] - mw) ** 2 / sw : 0) + rx[i] ** 2 / sxx;
    if (leverage >= 1 - 1e-10) return null;
    meat += (rx[i] * (ry[i] - slope * rx[i]) / (1 - leverage)) ** 2;
  }
  // Two-sided 97.5th t quantiles for df 9..30; df>30 uses df30 conservatively.
  const critical = [2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042][Math.min(30, n - k) - 9];
  const halfWidth = critical * Math.sqrt(meat) / sxx * 10;
  return {
    betaPer10Pct: slope * 10,
    betaCI: [slope * 10 - halfWidth, slope * 10 + halfWidth],
    r: syy < 1e-20 ? 0 : Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy))),
    n,
    asOf: years.at(-1)!,
  };
}
