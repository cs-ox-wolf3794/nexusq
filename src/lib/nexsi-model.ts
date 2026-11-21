import type { Points } from "./transform";

export const NEXSI_VERSION = "2026-11-21.1";
export const FACTOR_KEYS = ["market", "technology", "rates", "oil", "gas"] as const;
export type FactorKey = typeof FACTOR_KEYS[number];
export interface FactorRow { date: string; prior: string; y: number; x: number[] }
export interface FactorFit {
  coefficients: number[]; covariance: number[][]; n: number; r2: number;
  from: string; through: string; maxVif: number; residualSd: number;
  means: number[]; deviations: number[];
}
export interface Attribution {
  start: string; end: string; sessions: number; actual: number;
  components: Record<FactorKey | "baseline" | "unexplained", number>;
  energy: number; energyCI: [number, number]; energyShareOfDrop: number | null;
  fit: Omit<FactorFit, "coefficients" | "covariance" | "means" | "deviations">;
  extrapolation: boolean; warning: string | null;
}

function returns(points: Points) {
  const rows = new Map<string, { prior: string; value: number }>();
  for (let i = 1; i < points.length; i++) {
    const [prior, a] = points[i - 1], [date, b] = points[i];
    if (a > 0 && b > 0 && [a, b].every(Number.isFinite) && Date.parse(date) - Date.parse(prior) <= 7 * 86400000)
      rows.set(date, { prior, value: Math.log(b / a) });
  }
  return rows;
}

/** Same start AND end dates. No interpolation, weekend filling or unequal holding periods. */
export function factorRows(stock: Points, factors: Record<"SPY" | "QQQ" | "IEF" | "CL=F" | "NG=F", Points>): FactorRow[] {
  const refs = ["SPY", "QQQ", "IEF", "CL=F", "NG=F"].map(k => returns(factors[k as keyof typeof factors]));
  return [...returns(stock)].flatMap(([date, value]) => {
    const matched = refs.map(r => r.get(date));
    if (matched.some(r => !r || r.prior !== value.prior)) return [];
    const x = matched.map(r => r!.value);
    x[1] -= x[0]; // technology excess return separates the broad market from relative tech moves
    return [{ date, prior: value.prior, y: value.value, x }];
  });
}

function inverse(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const a = matrix.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => Number(i === j))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= divisor;
    for (let row = 0; row < n; row++) if (row !== col) {
      const v = a[row][col];
      for (let j = 0; j < 2 * n; j++) a[row][j] -= v * a[col][j];
    }
  }
  return a.map(r => r.slice(n));
}
const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const multiply = (a: number[][], b: number[][]) => a.map(row => b[0].map((_, j) => row.reduce((sum, v, k) => sum + v * b[k][j], 0)));

/** Standardized OLS with Newey–West covariance. No post-event data enters the fit. */
export function fitFactors(input: FactorRow[], dimensions = 5): FactorFit | null {
  const rows = input.slice(-252), n = rows.length, k = dimensions + 1;
  if (n < 126 || Date.parse(rows.at(-1)!.date) - Date.parse(rows[0].date) > 520 * 86400000) return null;
  if (rows.some(r => !Number.isFinite(r.y) || r.x.length < dimensions || !r.x.every(Number.isFinite))) return null;
  const means = Array.from({ length: dimensions }, (_, j) => rows.reduce((s, r) => s + r.x[j], 0) / n);
  const deviations = means.map((m, j) => Math.sqrt(rows.reduce((s, r) => s + (r.x[j] - m) ** 2, 0) / n));
  if (deviations.some(s => s < 1e-8)) return null;
  const x = rows.map(r => [1, ...means.map((m, j) => (r.x[j] - m) / deviations[j])]);
  const gram = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => x.reduce((sum, row) => sum + row[a] * row[b], 0)));
  const bread = inverse(gram);
  if (!bread) return null;
  const maxVif = Math.max(...bread.slice(1).map((r, j) => r[j + 1] * n));
  if (maxVif > 20) return null;
  const xy = Array.from({ length: k }, (_, j) => x.reduce((sum, row, i) => sum + row[j] * rows[i].y, 0));
  const standardized = bread.map(r => dot(r, xy));
  const residuals = rows.map((r, i) => r.y - dot(x[i], standardized));
  const yMean = rows.reduce((s, r) => s + r.y, 0) / n;
  const total = rows.reduce((s, r) => s + (r.y - yMean) ** 2, 0);
  const sse = residuals.reduce((s, e) => s + e * e, 0);
  if (total < 1e-12) return null;
  const meat = Array.from({ length: k }, () => Array(k).fill(0) as number[]);
  const scores = x.map((r, i) => r.map(v => v * residuals[i]));
  const lags = Math.floor(4 * (n / 100) ** (2 / 9));
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
    meat[a][b] = scores.reduce((s, row) => s + row[a] * row[b], 0);
    for (let lag = 1; lag <= lags; lag++) {
      let cross = 0;
      for (let i = lag; i < n; i++) cross += scores[i][a] * scores[i - lag][b] + scores[i - lag][a] * scores[i][b];
      meat[a][b] += (1 - lag / (lags + 1)) * cross;
    }
    meat[a][b] *= n / (n - k);
  }
  // Convert coefficients AND covariance from standardized regressors to native log-return units.
  const transform = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) =>
    i === 0 ? (j === 0 ? 1 : -means[j - 1] / deviations[j - 1]) : i === j ? 1 / deviations[i - 1] : 0));
  const covarianceZ = multiply(multiply(bread, meat), bread);
  const covariance = multiply(multiply(transform, covarianceZ), transform[0].map((_, j) => transform.map(r => r[j])));
  return { coefficients: transform.map(r => dot(r, standardized)), covariance, n, r2: Math.max(0, Math.min(1, 1 - sse / total)),
    from: rows[0].prior, through: rows.at(-1)!.date, maxVif, residualSd: Math.sqrt(sse / (n - k)), means, deviations };
}

export function attributeMove(rows: FactorRow[], start: string, end: string, expectedSessions: number): Attribution | null {
  const event = rows.filter(r => r.date > start && r.date <= end);
  if (event.length !== expectedSessions || event[0]?.prior !== start || event.at(-1)?.date !== end
    || event.some((r, i) => i > 0 && r.prior !== event[i - 1].date)) return null;
  const train = rows.filter(r => r.date <= start);
  if (!train.length || train.at(-1)!.date !== start) return null;
  const fit = fitFactors(train);
  if (!fit) return null;
  const y = event.reduce((s, r) => s + r.y, 0);
  const actual = Math.expm1(y) * 100;
  // A common log-to-simple-return scale preserves an exact additive pp reconciliation.
  const scale = Math.abs(y) < 1e-10 ? 100 : actual / y;
  const sums = FACTOR_KEYS.map((_, j) => event.reduce((s, r) => s + r.x[j], 0));
  const components = Object.fromEntries(FACTOR_KEYS.map((key, j) => [key, fit.coefficients[j + 1] * sums[j] * scale])) as Attribution["components"];
  components.baseline = fit.coefficients[0] * event.length * scale;
  components.unexplained = actual - Object.values(components).reduce((s, v) => s + v, 0);
  const energy = components.oil + components.gas;
  const exposure = [0, 0, 0, 0, sums[3] * scale, sums[4] * scale];
  const variance = dot(exposure, fit.covariance.map(r => dot(r, exposure)));
  const half = 1.98 * Math.sqrt(Math.max(0, variance));
  const extrapolation = event.some(r => r.x.some((v, j) => Math.abs(v - fit.means[j]) > 5 * fit.deviations[j]));
  const energyCI: [number, number] = [energy - half, energy + half];
  const { coefficients: _c, covariance: _v, means: _m, deviations: _d, ...diagnostics } = fit;
  return { start, end, sessions: event.length, actual, components, energy, energyCI,
    energyShareOfDrop: actual <= -3 && energyCI[1] < 0 && !extrapolation ? energy / actual * 100 : null,
    fit: diagnostics, extrapolation, warning: extrapolation ? "A factor move exceeds five training standard deviations; contribution estimates are fragile." : energyCI[0] <= 0 && energyCI[1] >= 0 ? "Energy estimate is statistically inconclusive: its parameter interval includes zero." : null };
}

/** Rolling held-out explanatory fit, with realized factors; this is NOT a return forecast. */
export function validateFactors(rows: FactorRow[]) {
  let fullError = 0, controlError = 0, baselineError = 0, n = 0;
  for (let i = Math.max(126, rows.length - 60); i < rows.length; i++) {
    const train = rows.slice(0, i), full = fitFactors(train), control = fitFactors(train, 3);
    if (!full || !control) continue;
    const row = rows[i];
    fullError += (row.y - dot([1, ...row.x], full.coefficients)) ** 2;
    controlError += (row.y - dot([1, ...row.x.slice(0, 3)], control.coefficients)) ** 2;
    const mean = train.slice(-252).reduce((s, r) => s + r.y, 0) / Math.min(252, train.length);
    baselineError += (row.y - mean) ** 2;
    n++;
  }
  return n < 20 || baselineError < 1e-12 ? null : { n, r2: 1 - fullError / baselineError, rmseLogPct: 100 * Math.sqrt(fullError / n),
    withoutEnergyRmseLogPct: 100 * Math.sqrt(controlError / n), energyImprovesFit: fullError < controlError };
}

export function powerCostScenario(mw: number, utilization: number, pue: number, changeUsdMwh: number, unhedgedShare: number, basis: "IT" | "facility") {
  if (![mw, utilization, pue, changeUsdMwh, unhedgedShare].every(Number.isFinite) || mw < 0 || utilization < 0 || utilization > 1 || pue < 1 || pue > 3 || unhedgedShare < 0 || unhedgedShare > 1) return null;
  const annualMwh = mw * 8760 * utilization * (basis === "IT" ? pue : 1);
  return { annualMwh, annualCostChange: annualMwh * changeUsdMwh * unhedgedShare };
}
