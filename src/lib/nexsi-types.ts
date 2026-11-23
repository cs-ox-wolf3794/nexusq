import type { Attribution } from "./nexsi-model";
import type { Points } from "./transform";

export interface NexsiMember { symbol: string; name: string; technology: boolean; group: string; included: boolean }
export interface NexsiUniverse { asOf: string; retrievedAt: string; sources: string[]; members: NexsiMember[]; retained?: boolean }
export interface NexsiEvent {
  title: string; url: string; publishedAt: string; source: string; kind: "filing" | "headline"; items?: string;
  form?: string; issuerCik?: number; reportDate?: string; firstSeenAt?: string; lastSeenAt?: string | null;
  summary?: NexsiDisclosureSummary;
  financialSummary?: NexsiDisclosureSummary;
}
export interface NexsiDisclosureFact {
  category: "earnings" | "guidance" | "company-news"; text: string; topic: string;
  period: string | null; periodEnd?: string; sourceUrl: string; method: "rule-extracted" | "reviewed" | "sec-xbrl"; excerpt?: string; reviewedAt?: string;
  evidence?: { url: string; sha256: string; taxonomy: string; concept: string; unit: string; start: string; end: string; value: number; accession: string };
  sourceTiming?: 'unverified';
  sourceKind?: 'third-party-transcript';
  guidanceType?: 'quantitative' | 'qualitative' | 'limited' | 'policy' | 'not-issued' | 'withdrawn';
}
export interface NexsiDisclosureSummary {
  version: number; checkedAt: string; documents: { url: string; sha256: string; textSha256?:string; retrievedAt?: string }[];
  facts: NexsiDisclosureFact[]; issue: string | null;
}
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
  evidenceChecks?: Partial<Record<'filing' | 'headline', { checkedAt: string; successfulAt: string | null; status: 'available' | 'failed'; sourceUrl: string; returned: number; oldestPublishedAt: string | null; issue: string | null }>>;
  issuerNews?: { source:string;sourceUrl:string;checkedAt:string;successfulAt:string|null;status:'available'|'failed';sha256?:string;items:{title:string;url:string;at:string;dateKind:'published'|'updated'}[];issue:string|null };
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
