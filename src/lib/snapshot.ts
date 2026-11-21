import type { BacktestFile, CatalogFile, CotFile, ForecastFile, ImpactFile, QualityFile, Series } from "./data";
import { validatePoints, validateAdjustedAlignment } from "./quality";

export interface Quote {
  id: string; symbol: string; name: string; price: number; currency: string;
  observedAt: string; checkedAt: string; sessionStart: string; sessionEnd: string;
  source: string; delayMinutes: number | null; status: "available" | "retained"; error?: string;
}
export interface QuoteFile {
  generated: string; targetMinutes: number; quotes: Record<string, Quote>; failures: string[];
}
export interface HealthFile {
  generated: string; status: string; coreFailures: string[];
  enrichmentIssues: { source: string; detail: string }[];
}
export interface Snapshot {
  revision: string; catalog: CatalogFile; seriesMap: Map<string, Series>;
  quality: QualityFile; forecasts: ForecastFile | null; impact: ImpactFile | null;
  cot: CotFile | null; backtest: BacktestFile | null; quotes: QuoteFile | null; health: HealthFile | null;
  refreshStatus: { attemptedAt: string; outcome: string; runUrl: string | null } | null;
}
interface Manifest { schemaVersion: number; revision: string; files: Record<string, string> }
const base = import.meta.env.BASE_URL;

async function request(name: string, revision = ""): Promise<string> {
  const response = await fetch(`${base}data/${name}${revision ? `?v=${revision}` : ""}`, {
    cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Data unavailable: ${name} (${response.status})`);
  return response.text();
}

/** All reads must match one published manifest; partial/mixed updates never enter React state. */
export async function loadSnapshot(previous?: Snapshot): Promise<Snapshot> {
  const manifest: Manifest = JSON.parse(await request("manifest.json"));
  if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(manifest.revision) || !manifest.files) throw new Error("Unsupported data manifest");
  const revisionDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(manifest.files)));
  const revision = [...new Uint8Array(revisionDigest)].map((n) => n.toString(16).padStart(2, "0")).join("");
  if (revision !== manifest.revision) throw new Error("Manifest revision integrity check failed");
  if (previous?.revision === manifest.revision) return previous;
  const file = async <T,>(name: string, required = false): Promise<T | null> => {
    const expected = manifest.files[name];
    if (!expected) { if (required) throw new Error(`Missing required data: ${name}`); return null; }
    if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error(`Invalid checksum: ${name}`);
    const text = await request(name, expected);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const actual = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
    if (actual !== expected) throw new Error("Data publication in progress or integrity check failed; retaining previous snapshot");
    return JSON.parse(text) as T;
  };
  const [catalog, quality, forecasts, impact, cot, backtest, quotes, health, refreshStatus] = await Promise.all([
    file<CatalogFile>("catalog.json", true), file<QualityFile>("quality.json", true),
    file<ForecastFile>("forecasts.json"), file<ImpactFile>("impact.json"), file<CotFile>("cot.json"),
    file<BacktestFile>("backtest.json"), file<QuoteFile>("quotes.json"), file<HealthFile>("health.json"),
    file<Snapshot["refreshStatus"]>("refresh-status.json"),
  ]);
  if (!catalog?.series?.length || !quality?.series || catalog.generated !== quality.generated) throw new Error("Data and quality assessments are from different updates");
  const series = await Promise.all(catalog.series.map(async (entry) => {
    if (!/^[A-Z0-9_]+$/.test(entry.id)) throw new Error("Invalid catalog identifier");
    const s = await file<Series>(`${entry.id}.json`, true);
    if (!s || s.id !== entry.id || s.lastUpdated !== entry.lastUpdated || s.points?.length !== entry.count || !quality.series[entry.id]) throw new Error(`Inconsistent series: ${entry.id}`);
    validatePoints(s.points);
    if (s.points.at(-1)?.[0] !== s.lastUpdated) throw new Error(`Incorrect observation date: ${entry.id}`);
    if (s.adjustedPoints) validateAdjustedAlignment(s.points, s.adjustedPoints);
    if (s.source === "Yahoo Finance" && !s.adjustedPoints) throw new Error(`Adjusted closes unavailable: ${s.id}`);
    return s;
  }));
  if (new Set(series.map((s) => s.id)).size !== series.length) throw new Error("Duplicate catalog identifiers");
  return { revision: manifest.revision, catalog, quality, forecasts, impact, cot, backtest, quotes, health, refreshStatus,
    seriesMap: new Map(series.map((s) => [s.id, s])) };
}

export function quoteStatus(quote: Quote, now = Date.now()): { label: string; current: boolean } {
  const age = (now - Date.parse(quote.observedAt)) / 60000;
  const checkAge = (now - Date.parse(quote.checkedAt)) / 60000;
  if (quote.status === "retained") return { label: "Update failed · last quote retained", current: false };
  if (![age, checkAge].every(Number.isFinite) || age < -1 || checkAge < -1) return { label: "Invalid timestamp", current: false };
  if (now >= Date.parse(quote.sessionStart) && now <= Date.parse(quote.sessionEnd)) {
    return age <= 15 && checkAge <= 15 ? { label: "Quote within 15 min", current: true } : { label: "Delayed · exceeds 15 min", current: false };
  }
  // A previous session's end cannot establish whether today's exchange is closed.
  if (age <= 15 && checkAge <= 15) return { label: "Recent quote · outside reported session", current: false };
  return { label: "Last reported quote · session closed or feed delayed", current: false };
}
