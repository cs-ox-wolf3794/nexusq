import { afterEach, describe, expect, it, vi } from "vitest";
import { parseNasdaqHistory, validatePriceContinuity, validatePriceHistory, companyPriceHistory } from "../../../scripts/lib/nexsi-prices.mjs";

const now = Date.parse("2026-11-21T12:00:00Z");
const points: [string, number][] = Array.from({ length: 160 }, (_, i) => [new Date(now - (161 - i) * 86400000).toISOString().slice(0, 10), 50 + i / 10]);
const old = { points, adjustedPoints: points };
const row = ([d, v]: [string, number]) => ({ date: `${d.slice(5, 7)}/${d.slice(8)}/${d.slice(0, 4)}`, close: `$${v}`, open: `$${v}`, low: `$${v - 1}`, high: `$${v + 1}` });
const payload = (p = points) => ({ data: { symbol: "SNDK", totalRecords: p.length, tradesTable: { rows: [...p].reverse().map(row) } }, status: { rCode: 200 } });
const yahoo = (p = points) => ({ chart: { result: [{ meta: { symbol: "SNDK", currency: "USD" }, timestamp: p.map(([d]) => Date.parse(d) / 1000), indicators: { quote: [{ close: p.map(p => p[1]) }], adjclose: [{ adjclose: p.map(p => p[1] * 0.99) }] } }] } });
afterEach(() => vi.unstubAllGlobals());

describe("Independent SanDisk daily history", () => {
  it("preserves already split-adjusted closes and full history without applying a split twice", () => {
    const p = [...points.slice(0, -1), ["2026-11-19", 94.395], ["2026-11-20", 79.24]] as [string, number][];
    const result = parseNasdaqHistory(payload(p), "SNDK", now);
    expect(result).toEqual(p);
    expect((result.at(-1)![1] / result.at(-2)![1] - 1) * 100).toBeCloseTo(-16.05487579, 6);
  });
  it("rejects the wrong issuer, partial pages, invalid currency, OHLC and legacy ticker history", () => {
    const wrong = payload(); wrong.data.symbol = "WDC";
    expect(() => parseNasdaqHistory(wrong, "SNDK", now)).toThrow("identity");
    const partial = payload(); partial.data.totalRecords++;
    expect(() => parseNasdaqHistory(partial, "SNDK", now)).toThrow("pagination");
    const currency = payload(); currency.data.tradesTable.rows[0].close = "€65.9";
    expect(() => parseNasdaqHistory(currency, "SNDK", now)).toThrow("USD");
    const bad = payload(); bad.data.tradesTable.rows[0].low = "$100";
    expect(() => parseNasdaqHistory(bad, "SNDK", now)).toThrow("OHLC");
    expect(() => parseNasdaqHistory(payload([["2015-02-13", 50], ...points]), "SNDK", now)).toThrow("issuer");
  });
  it("rejects duplicates/future rows and excludes today's bar until a conservative close cutoff", () => {
    expect(() => parseNasdaqHistory(payload([...points, points[0]]), "SNDK", now)).toThrow("duplicate");
    expect(() => parseNasdaqHistory(payload([...points, ["2026-11-22", 66]]), "SNDK", now)).toThrow("date");
    const today = payload([...points, ["2026-11-21", 66]]);
    expect(parseNasdaqHistory(today, "SNDK", now)).toEqual(points);
    expect(parseNasdaqHistory(today, "SNDK", Date.parse("2026-11-21T21:15:00Z")).at(-1)).toEqual(["2026-11-21", 66]);
  });
  it("accepts a consistent split rescaling but rejects splices, changed returns and unadjusted new splits", () => {
    const rescaled = points.map(([d, p]) => [d, p / 8] as [string, number]);
    expect(validatePriceContinuity(rescaled, points).observations).toBe(160);
    const splice = structuredClone(rescaled); splice.at(-1)![1] *= 8;
    expect(() => validatePriceContinuity(splice, points)).toThrow("disagreement");
    expect(() => validatePriceContinuity([...points, ["2026-11-20", 8]], points)).toThrow("discontinuity");
    expect(() => validatePriceContinuity(points.slice(0, 100), points)).toThrow("overlapping");
  });
  it("retains freshness, latest-date and coverage guards for alternative sources", () => {
    expect(() => validatePriceHistory({ points: points.slice(0, -1), adjustedPoints: points.slice(0, -1) }, old, now)).toThrow("regressed");
    expect(() => validatePriceHistory({ points: points.slice(20), adjustedPoints: points.slice(20) }, old, now)).toThrow("shrink");
    expect(() => validatePriceHistory(old, old, now + 10 * 86400000)).toThrow("overdue");
  });
  it("uses identical Nasdaq data on repeated refreshes, with source and continuity evidence", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => payload() }); vi.stubGlobal("fetch", fetcher);
    const first = await companyPriceHistory("SNDK", old, now);
    const second = await companyPriceHistory("SNDK", first, now);
    expect(first.points).toEqual(points); expect(second).toEqual(first);
    expect(first.provenance.provider).toBe("Nasdaq");
    expect(first.provenance.returnBasis).toContain("cash dividends excluded");
    expect(fetcher.mock.calls.every(c => c[0].startsWith("https://api.nasdaq.com/"))).toBe(true);
  });
  it("uses a validated Yahoo fallback on the SAME price basis when Nasdaq is unavailable", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 403, headers: new Headers() })
      .mockResolvedValue({ ok: true, json: async () => yahoo() }); vi.stubGlobal("fetch", fetcher);
    const result = await companyPriceHistory("SNDK", old, now);
    expect(result.adjustedPoints).toEqual(points); // Do not silently change to dividend-adjusted returns.
    expect(result.provenance.provider).toBe("Yahoo Finance");
    expect(result.provenance.note).toContain("fallback");
  });
  it("fails closed if Nasdaq and Yahoo both regress behind retained history", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => payload(points.slice(0, -1)) })
      .mockResolvedValue({ ok: true, json: async () => yahoo(points.slice(0, -1)) }); vi.stubGlobal("fetch", fetcher);
    await expect(companyPriceHistory("SNDK", old, now)).rejects.toThrow("regressed");
  });
});
