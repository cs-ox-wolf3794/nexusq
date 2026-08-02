export type Category = "energy" | "commodity" | "equity" | "macro" | "fx" | "renewables" | "fundamentals";

export interface CatalogEntry {
  id: string;
  name: string;
  unit: string;
  category: Category;
  source: string;
  lastUpdated: string;
  count: number;
}

export interface Series extends Omit<CatalogEntry, "count"> {
  points: [string, number][]; // [ISO date, value], ascending
}

export const CATEGORY_LABELS: Record<Category, string> = {
  energy: "Energy",
  fundamentals: "Fundamentals",
  commodity: "Commodities",
  equity: "Equities",
  renewables: "Renewables",
  macro: "Macro",
  fx: "FX",
};

/** [date, p10, p25, p50, p75, p90] */
export type FanPoint = [string, number, number, number, number, number];

export type Forecast =
  | { kind: "model"; method: string; points: FanPoint[] }
  | { kind: "external"; source: string; points: [string, number][] };

export interface ForecastFile {
  generated: string;
  series: Record<string, Forecast>;
}

const base = import.meta.env.BASE_URL;
const seriesCache = new Map<string, Promise<Series>>();

export interface CatalogFile {
  generated: string; // ISO timestamp of the pipeline run
  series: CatalogEntry[];
}

export async function loadCatalog(): Promise<CatalogFile> {
  const res = await fetch(`${base}data/catalog.json`);
  if (!res.ok) throw new Error(`catalog: HTTP ${res.status}`);
  return res.json();
}

export interface ImpactCompany {
  id: string;
  name: string;
  sector: string;
  unit: string;
  source: string;
  lastUpdated: string;
  points: [string, number][];
}

export interface ImpactCountry {
  iso: string;
  name: string;
  role: "exporter" | "importer" | "balanced";
  gdp: [string, number][]; // annual growth, %
  fuelExports: { value: number; year: string } | null;  // % of merchandise exports
  energyImports: { value: number; year: string } | null; // net % of energy use
}

export interface ImpactFile {
  generated: string;
  companies: ImpactCompany[];
  countries: ImpactCountry[];
  oilAnnual: [string, number][]; // [year, avg price] — long-history oil for GDP betas
  oilAnnualSource: string;
  worldGdp: [string, number][]; // global-cycle control
}

export async function loadImpact(): Promise<ImpactFile | null> {
  try {
    const res = await fetch(`${base}data/impact.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface CotMarket {
  label: string;
  code: string;
  lastUpdated: string;
  points: [string, number, number][]; // [report date, managed-money net, open interest]
}

export interface CotFile {
  generated: string;
  source: string;
  markets: Record<string, CotMarket>;
}

export async function loadCot(): Promise<CotFile | null> {
  try {
    const res = await fetch(`${base}data/cot.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface QualityFlag {
  code: string;
  detail: string;
}

export interface QualityFile {
  generated: string;
  series: Record<string, { cadence: string | null; staleDays: number | null; flags: QualityFlag[] }>;
  summary: { ok: number; flagged: number; failed: string[] };
}

export interface BacktestStats {
  n: number;
  hitRate: number;
  hitCI: [number, number];
  meanMove: number;
  moveCI: [number, number];
  baselineHit: number;
}

export interface BacktestFamily {
  episodes: number;
  horizons: Record<string, BacktestStats | null>;
  bySeverity: Record<string, BacktestStats | null>;
  byPeriod: { pre2020: BacktestStats | null; post2020: BacktestStats | null };
}

export interface BacktestFile {
  generated: string;
  method: {
    frame: string;
    options: { start: string; visibilityLagDays: number; cooldownDays: number; horizons: number[]; corrEvalObs: number };
    hypotheses: Record<string, string>;
  };
  corrPersistenceBaseline: number;
  families: Record<string, BacktestFamily>;
}

export async function loadBacktest(): Promise<BacktestFile | null> {
  try {
    const res = await fetch(`${base}data/backtest.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function loadQuality(): Promise<QualityFile | null> {
  try {
    const res = await fetch(`${base}data/quality.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function loadForecasts(): Promise<ForecastFile | null> {
  try {
    const res = await fetch(`${base}data/forecasts.json`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function loadSeries(id: string): Promise<Series> {
  let p = seriesCache.get(id);
  if (!p) {
    p = fetch(`${base}data/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
      return r.json();
    });
    seriesCache.set(id, p);
  }
  return p;
}
