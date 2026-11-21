import type { ImpactCompany, ImpactCountry, ImpactFile, QualityFile, Series } from "./data";

export type Cadence = "daily" | "weekly" | "monthly" | "annual";
export type SourcePolicy = { cadence: Cadence; maxAgeDays: number; periodEnd: boolean; note: string };
const monthly = { cadence: "monthly", maxAgeDays: 60, periodEnd: true,
  note: "Monthly period average, dated at period start by the source; age is measured from month end. Not an intraday quote." } as const;

/** Operational tolerances, not promises about the next source release. */
export function sourcePolicy(id: string): SourcePolicy {
  if (["EUGAS", "COAL", "COPPER", "WHEAT"].includes(id)) return monthly;
  if (["CPI", "INDPRO"].includes(id)) return { ...monthly, maxAgeDays: 45, note: "Monthly observation; age measured from month end. Values can be revised." };
  if (id.startsWith("GDP_")) return { cadence: "annual", maxAgeDays: 550, periodEnd: false, note: "Annual GDP, subject to revisions; not a current market indicator." };
  if (["USCRUDESTOCKS", "USGASSTORAGE"].includes(id)) return { cadence: "weekly", maxAgeDays: 14, periodEnd: false, note: "Weekly EIA reporting period; publication follows the observation date." };
  if (id.startsWith("COT_")) return { cadence: "weekly", maxAgeDays: 14, periodEnd: false, note: "CFTC Tuesday positions normally released Friday; holidays can delay publication." };
  if (["DXY", "EURUSD"].includes(id)) return { cadence: "daily", maxAgeDays: 12, periodEnd: false, note: "Federal Reserve H.10 daily observations released in weekly batches; not a live FX feed." };
  return { cadence: "daily", maxAgeDays: 7, periodEnd: false, note: "Completed daily observations; weekends, holidays and source publication lags apply." };
}

export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function observationEnd(id: string, date: string): string {
  if (!validDate(date) || !sourcePolicy(id).periodEnd) return date;
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export function freshness(id: string, date: string, now = Date.now()) {
  const policy = sourcePolicy(id);
  const ageDays = validDate(date) ? Math.floor((now - Date.parse(observationEnd(id, date))) / 86400000) : Infinity;
  return { ...policy, ageDays, stale: ageDays > policy.maxAgeDays || ageDays < 0 };
}

/** Reject malformed snapshots before they replace the last validated history. */
export function validatePoints(points: unknown, options: { now?: number; previous?: [string, number][]; minPoints?: number } = {}): asserts points is [string, number][] {
  const { now = Date.now(), previous, minPoints = 10 } = options;
  if (!Array.isArray(points) || points.length < minPoints) throw new Error(`insufficient history (minimum ${minPoints})`);
  const today = new Date(now).toISOString().slice(0, 10);
  let prior = "";
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2 || !validDate(point[0]) || typeof point[1] !== "number" || !Number.isFinite(point[1])) throw new Error("invalid observation schema/date/value");
    if (point[0] <= prior) throw new Error("duplicate or out-of-order observation dates");
    if (point[0] > today) throw new Error("future-dated actual observation");
    prior = point[0];
  }
  if (previous?.length) {
    if (points.at(-1)![0] < previous.at(-1)![0]) throw new Error("latest observation regressed");
    // Rolling ten-year feeds legitimately lose a handful of boundary observations.
    if (points.length < previous.length - Math.max(5, Math.floor(previous.length * 0.01))) throw new Error("material history shrink");
    const dates = new Set(points.map((p) => p[0]));
    const overlap = previous.filter(([d]) => d >= points[0][0] && d <= points.at(-1)![0]);
    if (overlap.filter(([d]) => !dates.has(d)).length > Math.max(3, Math.floor(overlap.length * 0.01))) throw new Error("missing previously observed dates");
  }
}

const SANITY: Record<string, [number, number]> = {
  BRENT: [0, 400], WTI: [-100, 400], HENRYHUB: [0, 100], EUGAS: [0, 250],
  COAL: [0, 1000], COPPER: [0, 50000], WHEAT: [0, 2000], VIX: [0, 200],
  UST10Y: [-5, 25], BREAKEVEN10Y: [-10, 25], EURUSD: [0.2, 5],
  USCRUDESTOCKS: [100, 1000], USGASSTORAGE: [100, 6000],
};

export function assessSeries(id: string, points: [string, number][], now = Date.now()) {
  const f = freshness(id, points.at(-1)![0], now);
  const flags: { code: string; detail: string }[] = [];
  if (f.stale) flags.push({ code: "stale", detail: `${f.ageDays} days since period end; operational tolerance ${f.maxAgeDays} days. ${f.note}` });
  const recent = points.slice(-260);
  const gaps = recent.slice(1).map((p, i) => (Date.parse(p[0]) - Date.parse(recent[i][0])) / 86400000);
  const gapLimit = { daily: 10, weekly: 21, monthly: 65, annual: 740 }[f.cadence];
  if (gaps.some((g) => g > gapLimit)) flags.push({ code: "gap", detail: `History has a gap exceeding ${gapLimit} days; review source coverage.` });
  const range = SANITY[id];
  if (range && (points.at(-1)![1] < range[0] || points.at(-1)![1] > range[1])) flags.push({ code: "range", detail: `Latest value outside review bounds [${range.join(", ")}]; verify against source.` });
  // Compare each new move with preceding returns only; never let the tested spike inflate its own threshold.
  const win = points.slice(-505);
  const log = win.every(([, v]) => v > 0);
  const moves = win.slice(1).map((p, i) => log ? Math.log(p[1] / win[i][1]) : p[1] - win[i][1]);
  for (let i = Math.max(30, moves.length - 5); i < moves.length; i++) {
    const past = moves.slice(Math.max(0, i - 252), i);
    const mean = past.reduce((a, b) => a + b, 0) / past.length;
    const sd = Math.sqrt(past.reduce((a, b) => a + (b - mean) ** 2, 0) / (past.length - 1));
    if (sd > 0 && Math.abs(moves[i] - mean) > 5 * sd) {
      flags.push({ code: "spike", detail: `Move exceeds 5 prior-window standard deviations on ${win[i + 1][0]}; review, not proof of an error.` });
      break;
    }
  }
  return { cadence: f.cadence, staleDays: f.ageDays, maxAgeDays: f.maxAgeDays, periodThrough: observationEnd(id, points.at(-1)![0]), flags };
}

/** Fail closed for current analysis, while leaving historical observations available. */
export function analysisEligibility(series: Series, quality: QualityFile | null, now = Date.now()): { eligible: boolean; reason: string } {
  if (!quality?.series[series.id]) return { eligible: false, reason: "Quality assessment unavailable" };
  if (!qualityCurrent(quality, now)) return { eligible: false, reason: "Quality assessment is overdue" };
  const f = freshness(series.id, series.lastUpdated, now);
  if (f.stale) return { eligible: false, reason: "Source observation is overdue" };
  const flags = quality.series[series.id].flags;
  if (flags.length) return { eligible: false, reason: flags.map((flag) => flag.code).join(", ") };
  return { eligible: true, reason: "Within source cadence; snapshot analysis" };
}

export function recentTimestamp(value: string | undefined, maxAgeMs: number, now = Date.now()): boolean {
  const age = now - Date.parse(value ?? "");
  return Number.isFinite(age) && age >= -300000 && age <= maxAgeMs;
}

export function qualityCurrent(quality: QualityFile | null, now = Date.now()): boolean {
  return !!quality && recentTimestamp(quality.generated, 72 * 3600000, now);
}

export function validateAdjustedAlignment(points: [string, number][], adjusted: [string, number][]) {
  validatePoints(adjusted);
  if (points.length !== adjusted.length || points.some(([date], i) => date !== adjusted[i][0]) || adjusted.some(([, v]) => v <= 0)) throw new Error("adjusted-close alignment/value mismatch");
}

export function companyEligible(company: ImpactCompany, now = Date.now()): boolean {
  return !company.refreshFailed && !!company.adjustedPoints && !!company.quality
    && company.quality.flags.length === 0 && !freshness(company.id, company.lastUpdated, now).stale
    && recentTimestamp(company.retrievedAt, 72 * 3600000, now);
}

export function sovereignExclusion(country: ImpactCountry, impact: ImpactFile, now = Date.now()): string | null {
  if (country.iso === "IND") return "India uses April–March fiscal years; matching fiscal-year oil and world-cycle controls are unavailable.";
  if (!impact.oilAnnualValidated) return "Full-year Brent observation coverage has not been verified.";
  if (freshness("GDP_" + country.iso, country.gdp.at(-1)?.[0] ?? "", now).stale || freshness("GDP_WLD", impact.worldGdp?.at(-1)?.[0] ?? "", now).stale) return "Annual country/world GDP observations are overdue.";
  if (!recentTimestamp(impact.generated, 45 * 86400000, now)) return "Annual enrichment has not been refreshed within 45 days.";
  return null;
}

export function energyTradeProfile(country: ImpactCountry): string {
  const energy = country.energyImports, fuel = country.fuelExports;
  const profile = energy && Number.isFinite(energy.value)
    ? `Reported net energy ${energy.value < 0 ? "exports" : "imports"}: ${Math.abs(energy.value).toFixed(1)}% of energy use (${energy.year})`
    : "Net energy trade data unavailable";
  return profile + (fuel && Number.isFinite(fuel.value) ? `; fuel: ${fuel.value.toFixed(1)}% of merchandise exports (${fuel.year})` : "");
}
