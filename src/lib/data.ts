export type Category = "energy" | "commodity" | "equity" | "macro" | "fx" | "renewables";

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
