import { describe, expect, it } from "vitest";
import { computeMarketState, percentileOf } from "../state";
import { computeSignals, seasonalZ } from "../signals";
import type { CotMarket, Series } from "../data";

function dailySeries(id: string, values: number[], startDate = "2022-01-01"): Series {
  const d0 = Date.parse(`${startDate}T00:00:00Z`);
  const points: [string, number][] = values.map((v, i) => [
    new Date(d0 + i * 86400000).toISOString().slice(0, 10),
    v,
  ]);
  return { id, name: id, unit: "USD", category: "energy", source: "test", lastUpdated: points[points.length - 1][0], points };
}

function weeklySeries(id: string, values: number[], startDate = "2015-01-07"): Series {
  const d0 = Date.parse(`${startDate}T00:00:00Z`);
  const points: [string, number][] = values.map((v, i) => [
    new Date(d0 + i * 7 * 86400000).toISOString().slice(0, 10),
    v,
  ]);
  return { id, name: id, unit: "million bbl", category: "fundamentals", source: "test", lastUpdated: points[points.length - 1][0], points };
}

describe("percentileOf", () => {
  it("ranks within history", () => {
    expect(percentileOf([1, 2, 3, 4, 5, 6, 7, 8, 9], 5)).toBeCloseTo(55.6, 0);
    expect(percentileOf([1, 2, 3], 0)).toBe(0);
    expect(percentileOf([1, 2, 3], 99)).toBe(100);
  });
});

describe("computeMarketState", () => {
  const up = Array.from({ length: 900 }, (_, i) => 100 * Math.exp(0.0008 * i) * (1 + 0.002 * Math.sin(i)));
  const price = dailySeries("WTI", up);
  const dxy = dailySeries("DXY", Array.from({ length: 900 }, (_, i) => 100 + 0.01 * Math.sin(i / 30)));

  it("produces trend/vol/dollar conditions from prices alone", () => {
    const s = computeMarketState({ id: "WTI", name: "WTI" }, price, dxy, undefined)!;
    expect(s).not.toBeNull();
    expect(s.conditions.map((c) => c.key)).toEqual(["trend", "vol", "dollar"]);
    // steadily rising series → strong trend percentile
    expect(s.conditions[0].percentile).toBeGreaterThan(50);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
  });

  it("adds a positioning condition when COT is provided, crowded = low supportive", () => {
    const d0 = Date.parse("2015-01-06T00:00:00Z");
    const cot: CotMarket = {
      label: "TEST", code: "x", lastUpdated: "2026-01-01",
      // net rises from 0 to max over the history → latest is the most crowded ever
      points: Array.from({ length: 500 }, (_, i) => [
        new Date(d0 + i * 7 * 86400000).toISOString().slice(0, 10), i * 100, 100000,
      ]),
    };
    const s = computeMarketState({ id: "WTI", name: "WTI" }, price, dxy, cot)!;
    const pos = s.conditions.find((c) => c.key === "positioning")!;
    expect(pos.percentile).toBe(100);
    expect(pos.supportive).toBe(0);
    expect(pos.reading).toContain("crowded");
  });

  it("returns null for non-daily series", () => {
    const weekly = weeklySeries("X", Array.from({ length: 400 }, () => 100));
    expect(computeMarketState({ id: "X", name: "X" }, weekly, dxy, undefined)).toBeNull();
  });
});

describe("seasonalZ", () => {
  // 8 years of weekly data with a strong annual cycle: level = 100 + 50·sin(2π·week/52)
  const cyc = Array.from({ length: 8 * 52 }, (_, i) => 100 + 50 * Math.sin((2 * Math.PI * (i % 52)) / 52));

  it("is ≈0 when the latest value sits on its seasonal norm", () => {
    const s = weeklySeries("INV", cyc);
    const z = seasonalZ(s.points)!;
    expect(Math.abs(z.z)).toBeLessThan(1);
  });

  it("flags a value far above the seasonal norm even mid-cycle", () => {
    const vals = [...cyc.slice(0, -1), 100 + 50 * Math.sin((2 * Math.PI * ((8 * 52 - 1) % 52)) / 52) + 40];
    const z = seasonalZ(weeklySeries("INV", vals).points)!;
    expect(z.z).toBeGreaterThan(2);
  });
});

describe("Inventory divergence signal", () => {
  it("fires only when fundamentals and price are in tension", () => {
    // glut: flat seasonal history then last value +massive; price: quiet then rich
    const inv = weeklySeries("USCRUDESTOCKS", [...Array.from({ length: 400 }, (_, i) => 400 + (i % 5)), 480]);
    const richPx = dailySeries("WTI", [...Array.from({ length: 400 }, (_, i) => 70 + (i % 2 === 0 ? 0.3 : -0.3)), ...Array.from({ length: 5 }, () => 78)]);
    const sigs = computeSignals(new Map([["USCRUDESTOCKS", inv], ["WTI", richPx]]));
    const div = sigs.find((s) => s.kind === "Inventory divergence");
    expect(div).toBeDefined();
    expect(div!.detail).toContain("bearish tension");
    expect(div!.seriesIds).toEqual(["USCRUDESTOCKS", "WTI"]);

    // same glut but CHEAP price → no divergence signal (fundamentals agree with price)
    const cheapPx = dailySeries("WTI", [...Array.from({ length: 400 }, (_, i) => 70 + (i % 2 === 0 ? 0.3 : -0.3)), ...Array.from({ length: 5 }, () => 62)]);
    const sigs2 = computeSignals(new Map([["USCRUDESTOCKS", inv], ["WTI", cheapPx]]));
    expect(sigs2.find((s) => s.kind === "Inventory divergence")).toBeUndefined();
  });
});
