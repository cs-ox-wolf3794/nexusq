import { observationEnd, validDate } from "../../src/lib/quality.ts";

export function validateForecastPoints(points) {
  if (!Array.isArray(points) || !points.length) throw new Error("empty external forecast");
  let prior = "";
  for (const p of points) {
    if (p.length !== 2 || !validDate(p[0]) || p[0] <= prior || !Number.isFinite(p[1])) throw new Error("invalid external forecast observations");
    prior = p[0];
  }
}

const Z = { p10: -1.2816, p25: -0.6745, p50: 0, p75: 0.6745, p90: 1.2816 };

export function modelFan(points, id) {
  const n = points.length;
  if (n < 60) return null;
  const gapDays = daysBetween(points[n - 21][0], points[n - 1][0]) / 20;
  const dailyish = gapDays < 4;
  const stepDays = gapDays < 10 ? 7 : 30;
  const steps = gapDays < 10 ? 13 : 6; // ~91 days / ~6 months horizon
  const window = points.slice(-(dailyish ? 756 : 120));
  const useLog = !["UST10Y", "BREAKEVEN10Y"].includes(id) && window.every(([, v]) => v > 0);
  const r = [];
  for (let i = 1; i < window.length; i++) {
    r.push(useLog ? Math.log(window[i][1] / window[i - 1][1]) : window[i][1] - window[i - 1][1]);
  }
  // EWMA variance (λ per observation) + half-weight ("damped") drift: long-run
  // mean blended 50/50 with the last quarter, then halved — conservative on purpose.
  const lambda = dailyish ? 0.97 : 0.9;
  let variance = r.reduce((a, b) => a + b * b, 0) / r.length;
  for (const x of r) variance = lambda * variance + (1 - lambda) * x * x;
  const sigma = Math.sqrt(variance);
  const meanAll = r.reduce((a, b) => a + b, 0) / r.length;
  const recent = r.slice(-(dailyish ? 63 : gapDays < 10 ? 13 : 3));
  const meanRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const mu = 0.5 * (0.5 * meanAll + 0.5 * meanRecent);
  const obsPerDay = r.length / Math.max(1, daysBetween(window[0][0], window[window.length - 1][0]));
  const [sourceDate, s0] = points[n - 1];
  const lastDate = observationEnd(id, sourceDate);
  const out = [[lastDate, s0, s0, s0, s0, s0]];
  for (let k = 1; k <= steps; k++) {
    const t = k * stepDays * obsPerDay; // horizon in observation units
    const date = shiftDaysISO(lastDate, k * stepDays);
    const q = (z) => {
      const drift = mu * t + z * sigma * Math.sqrt(t);
      const v = useLog ? s0 * Math.exp(drift) : s0 + drift;
      return Math.round(v * 10000) / 10000;
    };
    out.push([date, q(Z.p10), q(Z.p25), q(Z.p50), q(Z.p75), q(Z.p90)]);
  }
  return out;
}

function daysBetween(a, b) {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
}
function shiftDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

