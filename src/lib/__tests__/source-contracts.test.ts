import { describe, expect, it } from "vitest";
import { parseFred, parseWorldBank, parseEiaWeekly, parseSteo, steoContentUpdatedAt, sourceNumber, annualBrent } from "../../../scripts/lib/source-data.mjs";
import { parseYahooDaily } from "../../../scripts/lib/yahoo.mjs";

describe("source identity, units and completeness", () => {
  it("does not interpret blanks, booleans or nulls as zero", () => {
    for (const raw of ["", " ", null, true, undefined, "NaN", Infinity]) expect(() => sourceNumber(raw)).toThrow();
    expect(sourceNumber("-2.5e1")).toBe(-25);
  });
  it("requires the requested FRED column and valid dates while respecting missing-value markers", () => {
    expect(parseFred("observation_date,BRENT\n2026-11-18,.\n2026-11-19,91.2", "BRENT")).toEqual([["2026-11-19", 91.2]]);
    expect(() => parseFred("observation_date,WTI\n2026-11-19,91.2", "BRENT")).toThrow("identity");
    expect(() => parseFred("DATE,BRENT\n2026-02-30,91", "BRENT")).toThrow();
  });
  it("rejects partial pages and wrong-country or wrong-indicator World Bank responses", () => {
    const row = { countryiso3code: "USA", date: "2025", indicator: { id: "GDP" }, value: 2.123456 };
    const response = [{ pages: 1, total: 1 }, [row]];
    expect(parseWorldBank(response, ["USA"], "GDP")[0].value).toBe(2.123456);
    expect(() => parseWorldBank([{ pages: 2, total: 2 }, [row]], ["USA"], "GDP")).toThrow("incomplete");
    expect(() => parseWorldBank(response, ["IND"], "GDP")).toThrow("identity");
    expect(() => parseWorldBank(response, ["USA"], "CPI")).toThrow("identity");
  });
  it("requires inventory units before applying the conversion", () => {
    const j = { response: { frequency: "weekly", total: 1, data: [{ series: "WCESTUS1", units: "MBBL", period: "2026-11-13", value: "417811" }] } };
    expect(parseEiaWeekly(j, "WCESTUS1", "MBBL", 0.001)[0][1]).toBeCloseTo(417.811, 8);
    expect(() => parseEiaWeekly(j, "WCESTUS1", "BCF", 1)).toThrow("unit");
  });
  it("requires the expected Yahoo identity and currency for daily bars", () => {
    expect(() => parseYahooDaily({ meta: { symbol: "WRONG", currency: "USD" } }, Date.now(), "XLE")).toThrow("identity");
    expect(() => parseYahooDaily({ meta: { symbol: "XLE", currency: "EUR" } }, Date.now(), "XLE")).toThrow("currency");
  });
});

describe("forecast periods and annual coverage", () => {
  const now = Date.parse("2026-11-21");
  const data = Array.from({ length: 8 }, (_, i) => ({ period: new Date(Date.UTC(2026, 10 + i, 1)).toISOString().slice(0, 7), seriesId: "BREPUUS", unit: "dollars per barrel", value: "80.123" }));
  const response = (rows = data) => ({ response: { frequency: "monthly", total: rows.length, data: rows } });
  it("uses complete future months and preserves precision at the period end", () => {
    const points = parseSteo(response(), "BREPUUS", "dollars per barrel", now);
    expect(points).toHaveLength(7);
    expect(points[0]).toEqual(["2026-12-31", 80.123]);
  });
  it("rejects missing months, short horizons, wrong units and null projections", () => {
    expect(() => parseSteo(response(data.filter((_, i) => i !== 3)), "BREPUUS", "dollars per barrel", now)).toThrow("missing");
    expect(() => parseSteo(response(data.slice(0, 3)), "BREPUUS", "dollars per barrel", now)).toThrow("horizon");
    expect(() => parseSteo(response(), "BREPUUS", "wrong", now)).toThrow("unit");
    expect(() => parseSteo(response([{ ...data[0], value: null as unknown as string }]), "BREPUUS", "dollars per barrel", now)).toThrow();
  });
  it("does not refresh unchanged content age just because a past month falls away", () => {
    const previous = { kind: "external", source: "EIA STEO", retrievedAt: "2026-10-01", points: [["2026-11-15", 81], ["2026-12-15", 80]] };
    expect(steoContentUpdatedAt([["2026-12-31", 80]], previous, "2026-11-21")).toBe("2026-10-01");
    expect(steoContentUpdatedAt([["2026-12-31", 82]], previous, "2026-11-21")).toBe("2026-11-21");
  });
  it("rejects half-year averages labeled as full calendar years", () => {
    const partial = Array.from({ length: 180 }, (_, i) => [new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), 80]);
    expect(() => annualBrent(partial, now)).toThrow("incomplete");
  });
  it("excludes incomplete years while preserving sufficient complete annual history", () => {
    const rows: [string, number][] = [];
    for (let year = 2010; year <= 2025; year++) for (let month = 0; month < 12; month++) for (let day = 1; day <= 20; day++) {
      if (year === 2011 && month >= 6) continue;
      rows.push([new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10), year === 2011 ? 999 : 80]);
    }
    const annual = annualBrent(rows, now);
    expect(annual).toHaveLength(15);
    expect(annual.some(([year]) => year === "2011")).toBe(false);
    expect(annual.every(([, value]) => value === 80)).toBe(true);
  });
});
