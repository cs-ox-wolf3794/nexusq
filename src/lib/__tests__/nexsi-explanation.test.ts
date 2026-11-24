import { describe, expect, it } from "vitest";
import { attributionFixture } from './fixtures/research-snapshot';
import type { NexsiEvent } from "../nexsi-types";
import { explainMove, evidenceTiming, easternTime, evidenceForMove, disclosureContext, isPrimaryFiling, reviewedDisclosure } from "../nexsi-explanation";
import { mergeEvidence, parseFilings } from "../../../scripts/lib/nexsi-sources.mjs";

const base = attributionFixture();
const now = Date.parse("2026-11-22T12:00:00Z");
const period = { start: "2026-11-19", end: "2026-11-20" };
const event: NexsiEvent = { title: "8-K", kind: "filing", source: "SEC EDGAR", items: "5.03,9.01", publishedAt: "2026-11-19T22:10:51Z", issuerCik: 2023554,
  url: "https://www.sec.gov/Archives/edgar/data/2023554/000162828026075127/sndk-20261119.htm" };

describe("Client-facing attribution explanations", () => {
  it("separates other modeled factors from the unexplained remainder and exactly reconciles groups", () => {
    const reading = explainMove(base);
    expect(base.energy + reading.other + base.components.unexplained).toBeCloseTo(base.actual, 10);
    expect(reading.residualText).toContain("not an additional loss");
    expect(reading.energyState).toBe("inconclusive");
    expect(reading.energyText).toContain("cannot distinguish");
    expect(reading.energyShare).toBeNull();
  });
  it("describes a negative unexplained return without inventing an earnings or news cause", () => {
    const a = structuredClone(base); a.components.unexplained = -7;
    expect(explainMove(a).residualText).toContain("7.00 percentage points of decline remain unexplained");
    expect(explainMove(a).residualText).toContain("none has been assigned a measured share");
  });
  it("finds the largest downward contribution even when a positive component has a larger magnitude", () => {
    const a = structuredClone(base); a.components.market = 20; a.components.technology = -10;
    expect(explainMove(a).drag?.key).toBe("technology");
    expect(explainMove(a).headline).toContain("−10.00 pp");
  });
  it("does not fabricate a market-factor drag when only the remainder is negative", () => {
    const a = structuredClone(base); for (const k of ["market", "technology", "rates", "oil", "gas"] as const) a.components[k] = 1;
    expect(explainMove(a).drag).toBeNull();
    expect(explainMove(a).headline).toContain("does not identify");
  });
  it("preserves offsetting shares above 100% but suppresses fragile, positive and inconclusive shares", () => {
    const a = { ...base, actual: -5, energy: -6, energyCI: [-7, -5] as [number, number], extrapolation: false };
    expect(explainMove(a).energyShare).toBe(120);
    expect(explainMove({ ...a, extrapolation: true }).energyState).toBe("fragile");
    expect(explainMove({ ...a, extrapolation: true }).energyShare).toBeNull();
    expect(explainMove({ ...a, energyCI: [-7, 0] }).energyShare).toBeNull();
    expect(explainMove({ ...a, energy: 1, energyCI: [0.5, 1.5] }).energyState).toBe("offset");
    expect(explainMove({ ...a, actual: -2.9 }).energyShare).toBeNull();
  });
});

describe("Evidence timing and reliability", () => {
  it("classifies after-hours filings against actual window boundaries instead of UTC calendar dates", () => {
    expect(evidenceTiming(event.publishedAt, period)).toBe("within");
    expect(evidenceTiming("2026-11-19T20:59:00Z", period)).toBe("before");
    expect(evidenceTiming("2026-11-20T21:10:00Z", period)).toBe("after");
    expect(evidenceTiming("2026-11-21T00:30:00Z", period)).toBe("after");
    expect(easternTime("2026-11-21T00:30:00Z")?.date).toBe("2026-11-20");
    expect(evidenceTiming("2026-11-20T21:00:51Z", period)).toBe("uncertain");
  });
  it("handles DST, early closes, weekend news and unverified calendar coverage", () => {
    expect(evidenceTiming("2026-10-29T20:10:00Z", { start: "2026-10-29", end: "2026-10-30" })).toBe("within");
    expect(evidenceTiming("2026-11-27T18:10:00Z", { start: "2026-11-25", end: "2026-11-27" })).toBe("after");
    expect(evidenceTiming("2026-11-22T18:00:00Z", { start: "2026-11-20", end: "2026-11-23" })).toBe("within");
    expect(evidenceTiming("2029-01-03T20:00:00Z", { start: "2029-01-02", end: "2029-01-03" })).toBe("uncertain");
    expect(evidenceTiming(event.publishedAt, { start: "2026-11-26", end: "2026-11-27" })).toBe("uncertain");
  });
  it("keeps earlier context and follow-up separate, and excludes future or irrelevant old reports", () => {
    const dates = [event.publishedAt, "2026-11-17T20:00:00Z", "2026-11-21T12:00:00Z", "2026-11-23T12:00:00Z", "2026-10-30T12:00:00Z"];
    const selected = evidenceForMove(dates.map(publishedAt => ({ ...event, publishedAt })), period, now);
    expect(selected.map(e => e.timing).sort()).toEqual(["after", "before", "within"]);
  });
  it("does not promote a spoofed SEC domain or wrong issuer path into primary evidence", () => {
    expect(isPrimaryFiling(event)).toBe(true);
    expect(isPrimaryFiling({ ...event, url: event.url.replace("www.sec.gov", "www.sec.gov.example.com") })).toBe(false);
    expect(isPrimaryFiling({ ...event, issuerCik: 1045810 })).toBe(false);
    expect(disclosureContext({ ...event, kind: "headline", title: "Energy caused the crash" })).toContain("not been independently verified");
  });
  it("uses precise filing topics and limits the reviewed split note to its source, issuer and event", () => {
    expect(disclosureContext(event)).toContain("charter, bylaw or fiscal-year changes");
    expect(disclosureContext(event)).not.toContain("stock split");
    expect(reviewedDisclosure("SNDK", event, period)).toContain("8-for-1");
    expect(reviewedDisclosure("NVDA", event, period)).toBeNull();
    expect(reviewedDisclosure("SNDK", event, { start: "2026-11-23", end: "2026-11-24" })).toBeNull();
  });
});

describe("Rolling free-source evidence archive", () => {
  it("retains old links when a healthy feed rotates, deduplicates tracking URLs and preserves retrieval provenance", () => {
    const old = { ...event, firstSeenAt: "2026-11-20T10:00:00Z", lastSeenAt: "2026-11-20T10:00:00Z" };
    const headline = { ...event, kind: "headline" as const, url: "https://example.com/story?utm_source=yahoo&.tsrc=rss" };
    const first = mergeEvidence([old], [headline], now);
    expect(first).toHaveLength(2);
    expect(first.find(e => e.kind === "filing")?.lastSeenAt).toBe(old.lastSeenAt);
    const second = mergeEvidence(first, [{ ...headline, url: "https://example.com/story?utm_source=feed" }], now + 1000);
    expect(second).toHaveLength(2);
    expect(second.find(e => e.kind === "headline")?.firstSeenAt).toBe(new Date(now).toISOString());
    expect(second.find(e => e.kind === "headline")?.lastSeenAt).toBe(new Date(now + 1000).toISOString());
  });
  it("drops unsafe, future and expired records without turning a failed fetch into a fresh timestamp", () => {
    const old = { ...event, lastSeenAt: "2026-11-20T10:00:00Z" };
    const result = mergeEvidence([old], [{ ...event, url: "javascript:alert(1)" }, { ...event, publishedAt: "2026-11-23T12:00:00Z" }, { ...event, publishedAt: "2026-01-01T12:00:00Z" }], now);
    expect(result).toHaveLength(1); expect(result[0].lastSeenAt).toBe(old.lastSeenAt);
  });
  it("keeps amendments with the issuer, actual SEC acceptance time and distinct report date", () => {
    const parsed = parseFilings({ cik: 2023554, filings: { recent: { form: ["8-K/A"], acceptanceDateTime: [event.publishedAt], reportDate: ["2026-11-18"], accessionNumber: ["0001628280-26-075127"], primaryDocument: ["sndk-20261119.htm"], items: ["2.02,9.01"] } } }, 2023554, now);
    expect(parsed).toEqual([expect.objectContaining({ form: "8-K/A", issuerCik: 2023554, reportDate: "2026-11-18", publishedAt: "2026-11-19T22:10:51.000Z", title: expect.stringContaining("amendment") })]);
  });
});
