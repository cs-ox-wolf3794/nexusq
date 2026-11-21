export type Category = "energy" | "commodity" | "equity" | "macro" | "fx" | "renewables" | "fundamentals";

export interface CatalogEntry {
  id: string;
  name: string;
  unit: string;
  category: Category;
  source: string;
  lastUpdated: string;
  count: number;
  cadence?: import("./quality").Cadence;
  sourceUrl?: string;
  retrievedAt?: string;
  checkedAt?: string;
}

export interface Series extends Omit<CatalogEntry, "count"> {
  points: [string, number][]; // [ISO date, value], ascending
  adjustedPoints?: [string, number][];
  returnBasis?: string;
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
  | { kind: "model"; method: string; points: FanPoint[]; issuedAt?: string; asOf?: string }
  | { kind: "external"; source: string; points: [string, number][]; retrievedAt?: string; retained?: boolean; sourceUrl?: string; deliveryUrl?: string; sourceVintage?: string; periodBasis?: string };

export interface ForecastFile {
  generated: string;
  series: Record<string, Forecast>;
}

export interface CatalogFile {
  generated: string; // ISO timestamp of the pipeline run
  series: CatalogEntry[];
}

export interface ImpactCompany {
  id: string;
  name: string;
  sector: string;
  unit: string;
  source: string;
  lastUpdated: string;
  points: [string, number][];
  adjustedPoints?: [string, number][];
  retrievedAt?: string;
  refreshFailed?: boolean;
  quality?: { flags: QualityFlag[] };
}

export interface ImpactCountry {
  retained?: boolean;
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

export interface CotMarket {
  label: string;
  code: string;
  lastUpdated: string;
  points: [string, number, number][]; // [report date, managed-money net, open interest]
  refreshFailed?: boolean;
  retrievedAt?: string;
}

export interface CotFile {
  generated: string;
  source: string;
  markets: Record<string, CotMarket>;
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
  engineVersion?: string;
  generated: string;
  method: {
    frame: string;
    options: { start: string; visibilityLagDays: number; cooldownDays: number; horizons: number[]; corrEvalObs: number };
    hypotheses: Record<string, string>;
  };
  corrPersistenceBaseline: number;
  families: Record<string, BacktestFamily>;
}
