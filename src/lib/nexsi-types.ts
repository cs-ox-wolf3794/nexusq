import type { Attribution } from "./nexsi-model";
import type { Points } from "./transform";

export interface NexsiMember { symbol: string; name: string; technology: boolean; group: string; included: boolean }
export interface NexsiUniverse { asOf: string; retrievedAt: string; sources: string[]; members: NexsiMember[]; retained?: boolean }
export interface NexsiEvent { title: string; url: string; publishedAt: string; source: string; kind: "filing" | "headline"; items?: string }
export interface NexsiPriceSource {
  provider: string; url: string; returnBasis: string; note?: string;
  continuity?: { comparedThrough: string; observations: number };
}
export interface NexsiCompany extends NexsiMember {
  asOf: string | null; price: number | null; retrievedAt: string | null; issue: string | null;
  provenance?: NexsiPriceSource | null;
  history: Points; moves: Record<string, Attribution | null>;
  observedReturns: Record<string, number | null>;
  drawdown: number | null; largestDrops: Attribution[];
  validation: { n: number; r2: number; rmseLogPct: number; withoutEnergyRmseLogPct: number; energyImprovesFit: boolean } | null;
  events: NexsiEvent[]; eventCheckedAt: string | null; eventIssues: string[];
  signals: { label: string; detail: string; severity: string }[];
}
export interface NexsiPowerRate { state: string; period: string; usdMwh: number; sourceUrl: string }
export interface NexsiFile {
  engineVersion: string; generated: string; attemptedAt: string; status: "ok" | "degraded" | "retained";
  universe: NexsiUniverse; companies: NexsiCompany[]; failures: string[];
  factors: { symbol: string; label: string; asOf: string; sourceUrl: string; basis: string }[];
  electricity: { retrievedAt: string | null; rates: NexsiPowerRate[]; issue: string | null };
}
export interface NexsiProject {
  id: string; name: string; symbols: string[]; location: string; state: string;
  role: string; reportedStatus: string; capacityMw: number | null;
  capacityBasis: "IT" | "facility" | "generation" | "unspecified";
  capacityNote: string; timing: string; energyChannel: string;
  sources: { title: string; url: string; published: string }[]; reviewedAt: string;
}
