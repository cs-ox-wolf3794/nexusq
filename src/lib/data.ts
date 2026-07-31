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

const base = import.meta.env.BASE_URL;
const seriesCache = new Map<string, Promise<Series>>();

export async function loadCatalog(): Promise<CatalogEntry[]> {
  const res = await fetch(`${base}data/catalog.json`);
  if (!res.ok) throw new Error(`catalog: HTTP ${res.status}`);
  return (await res.json()).series;
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
