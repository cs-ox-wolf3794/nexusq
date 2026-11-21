import { describe, expect, it } from "vitest";
import { analysisEligibility, assessSeries, freshness, observationEnd, validatePoints } from "../quality";
import type { QualityFile, Series } from "../data";

const now = Date.parse("2026-11-21T12:00:00Z");
const points: [string, number][] = Array.from({ length: 40 }, (_, i) => [new Date(Date.parse("2026-10-12") + i * 86400000).toISOString().slice(0, 10), 100 + Math.sin(i)]);
const series: Series = { id: "BRENT", name: "Brent", unit: "USD/bbl", category: "energy", source: "FRED", lastUpdated: "2026-11-20", points };
const quality: QualityFile = { generated: new Date(now).toISOString(), series: { BRENT: { cadence: "daily", staleDays: 1, flags: [] } }, summary: { ok: 1, flagged: 0, failed: [] } };

describe("source-aware freshness", () => {
  it("measures September period averages from month end and still flags a genuinely overdue release", () => {
    expect(observationEnd("EUGAS", "2026-09-01")).toBe("2026-09-30");
    expect(freshness("EUGAS", "2026-09-01", now)).toMatchObject({ ageDays: 52, stale: false });
    expect(freshness("EUGAS", "2026-08-01", now).stale).toBe(true);
    expect(observationEnd("CPI", "2024-02-01")).toBe("2024-02-29");
  });
  it("allows weekly H.10 publication lags but expires them", () => {
    expect(freshness("EURUSD", "2026-11-13", now).stale).toBe(false);
    expect(freshness("EURUSD", "2026-11-01", now).stale).toBe(true);
    expect(freshness("BRENT", "2026-11-13", now).stale).toBe(true);
  });
  it("fails closed when QC is missing, old or flags a source", () => {
    expect(analysisEligibility(series, quality, now).eligible).toBe(true);
    expect(analysisEligibility(series, null, now).eligible).toBe(false);
    expect(analysisEligibility(series, { ...quality, generated: "2026-11-01" }, now).eligible).toBe(false);
    expect(analysisEligibility(series, { ...quality, series: { BRENT: { cadence: "daily", staleDays: 1, flags: [{ code: "refresh-failed", detail: "timeout" }] } } }, now).eligible).toBe(false);
    expect(analysisEligibility(series, quality, now + 8 * 86400000).eligible).toBe(false);
  });
});

describe("observation contracts", () => {
  it.each([
    [["2026-02-30", 1]], [["2026-01-01", null]], [["2026-01-01", "12"]],
    [["2026-01-01", Infinity]], [["2026-01-01", NaN]], [["2027-01-01", 1]],
    [["2026-01-01", 1], ["2026-01-01", 2]], [["2026-01-02", 1], ["2026-01-01", 2]],
  ])("rejects malformed actual data: %j", (...input) => {
    expect(() => validatePoints(input, { now, minPoints: 1 })).toThrow();
  });
  it("rejects silent history truncation and a regressing last observation", () => {
    expect(() => validatePoints(points.slice(20), { previous: points, now })).toThrow("shrink");
    expect(() => validatePoints(points.slice(0, -1), { previous: points, now })).toThrow("regressed");
    expect(() => validatePoints(points.slice(1), { previous: points, now })).not.toThrow();
  });
  it("detects a new spike without allowing it to inflate its reference volatility", () => {
    const spike = points.map((p) => [...p] as [string, number]);
    spike[spike.length - 1][1] = 180;
    expect(assessSeries("BRENT", spike, now).flags.some((f) => f.code === "spike")).toBe(true);
  });
});
