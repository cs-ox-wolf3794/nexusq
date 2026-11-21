import type { Points } from "./transform";
import { daysBetween } from "./transform";

/**
 * Energy Beta analytics (Nexus core metric):
 *   β = Cov(r_asset, r_driver) / Var(r_driver)   on daily log-returns
 *   α = mean(r_asset) − β · mean(r_driver)       annualized excess drift
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
    if (prevA && prior && prior[0] === prevA[0] && dv != null && v > 0 && prevA[1] > 0 && dv > 0 && prior[1] > 0 && daysBetween(prevA[0], d) <= 7) {
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
    r2: r * r,
    n,
  };
}

/** Rolling beta: `window` paired observations, stepped weekly for the history. */
export function rollingBeta(asset: Points, driver: Points, window = 90): RollingBeta | null {
  const { dates, ra, rd } = pairedReturns(asset, driver);
  if (ra.length < window) return null;
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

/**
 * Sovereign beta: annual GDP growth regressed on same-year oil % change,
 * CONTROLLING for world GDP growth (Frisch–Waugh: residualize both sides on
 * the global cycle, then OLS the residuals). Without the control, common
 * shocks — COVID above all — make every economy look positively oil-exposed,
 * because oil is procyclical. With it, the beta reads as "GDP sensitivity to
 * oil beyond what the global cycle explains": exporters +, importers −.
 * Annual data → n≈25; r is the partial correlation. Both are displayed.
 */
export interface GdpBeta {
  betaPer10Pct: number; // pp of GDP growth per +10% oil, cycle-adjusted
  r: number; // partial correlation
  n: number;
}

function residualize(y: number[], x: number[]): number[] {
  const n = y.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return y.map((v, i) => v - my - b * (x[i] - mx));
}

export function gdpBeta(
  gdp: [string, number][],
  oilAnnual: [string, number][],
  worldGdp: [string, number][],
): GdpBeta | null {
  const oil = new Map(oilAnnual);
  const world = new Map(worldGdp.map(([d, v]) => [d.slice(0, 4), v]));
  const xOil: number[] = [];
  const xWorld: number[] = [];
  const yGdp: number[] = [];
  for (const [d, g] of gdp) {
    const yr = d.slice(0, 4);
    const a = oil.get(yr), p = oil.get(String(Number(yr) - 1)), w = world.get(yr);
    if (a == null || p == null || p <= 0 || w == null) continue;
    xOil.push((a / p - 1) * 100);
    xWorld.push(w);
    yGdp.push(g);
  }
  const n = yGdp.length;
  if (n < 12) return null;
  // Frisch–Waugh: partial the global cycle out of both GDP growth and oil change
  const ry = residualize(yGdp, xWorld);
  const rx = residualize(xOil, xWorld);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += rx[i] * ry[i]; sxx += rx[i] ** 2; syy += ry[i] ** 2; }
  if (sxx === 0 || syy === 0) return null;
  return {
    betaPer10Pct: Math.round((sxy / sxx) * 10 * 100) / 100,
    r: Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100,
    n,
  };
}
