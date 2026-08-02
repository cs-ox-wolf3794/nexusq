import { describe, expect, it } from "vitest";
import {
  alignSeries, applyTransform, clampRange, pearson, returnCorrelation, toIndex, toYoY, toZScore,
} from "../transform";
import type { Series } from "../data";

const mkSeries = (points: [string, number][]): Series => ({
  id: "T", name: "T", unit: "USD", category: "energy", source: "test", lastUpdated: points[points.length - 1][0], points,
});

describe("toIndex", () => {
  it("rebases the first visible observation to 100", () => {
    expect(toIndex([["2024-01-01", 50], ["2024-01-02", 100], ["2024-01-03", 25]]))
      .toEqual([["2024-01-01", 100], ["2024-01-02", 200], ["2024-01-03", 50]]);
  });
});

describe("toZScore", () => {
  it("standardizes over the window (population σ)", () => {
    const z = toZScore([["a", 1], ["b", 2], ["c", 3]]);
    expect(z[1][1]).toBeCloseTo(0, 10);
    expect(z[2][1]).toBeCloseTo(Math.sqrt(3 / 2), 6); // (3-2)/√(2/3)
    expect(z[0][1]).toBeCloseTo(-Math.sqrt(3 / 2), 6);
  });
});

describe("toYoY", () => {
  it("computes % change vs the observation ~1 year earlier", () => {
    const out = toYoY([["2023-01-15", 80], ["2024-01-15", 100]]);
    expect(out).toHaveLength(1);
    expect(out[0][0]).toBe("2024-01-15");
    expect(out[0][1]).toBeCloseTo(25, 6);
  });
  it("returns nothing when no observation is old enough", () => {
    expect(toYoY([["2024-01-01", 1], ["2024-06-01", 2]])).toHaveLength(0);
  });
});

describe("clampRange", () => {
  it("keeps only observations on/after the from date", () => {
    expect(clampRange([["2020-01-01", 1], ["2021-01-01", 2]], "2020-06-01")).toEqual([["2021-01-01", 2]]);
  });
});

describe("pearson", () => {
  it("is 1 for perfectly linear data and −1 for inverse", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
  });
  it("matches a hand-computed value", () => {
    // x=[1,2,3], y=[1,3,2] → r = 0.5
    expect(pearson([1, 2, 3], [1, 3, 2])).toBeCloseTo(0.5, 10);
  });
  it("returns null for degenerate input", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe("alignSeries + returnCorrelation", () => {
  const dates = Array.from({ length: 30 }, (_, i) => `2024-01-${String(i + 1).padStart(2, "0")}`);
  it("forward-fills small gaps and correlates identical series at 1", () => {
    const a = mkSeries(dates.map((d, i) => [d, 100 + i]));
    const b = mkSeries(dates.filter((_, i) => i % 2 === 0).map((d) => {
      const i = dates.indexOf(d);
      return [d, 100 + i] as [string, number];
    }));
    const grid = alignSeries([a, a], "2024-01-01");
    expect(returnCorrelation(grid.values[0], grid.values[1])).toBeCloseTo(1, 10);
    expect(b.points.length).toBeLessThan(a.points.length); // sanity of the fixture
  });
  it("refuses to bridge holes longer than maxGapDays", () => {
    // the daily series contributes grid dates far beyond the sparse series' last obs
    const sparse = mkSeries([["2024-01-01", 1], ["2024-06-01", 2]]);
    const daily = mkSeries(dates.map((d, i) => [d, 50 + i])); // Jan 1–30
    const grid = alignSeries([sparse, daily], "2024-01-01", 10);
    const idxJan25 = grid.dates.indexOf("2024-01-25"); // 24d after sparse's last obs > maxGap 10
    expect(idxJan25).toBeGreaterThan(-1);
    expect(grid.values[0][idxJan25]).toBeNull(); // sparse: hole not bridged
    expect(grid.values[1][idxJan25]).not.toBeNull(); // daily: actual observation
    // within the gap tolerance it DOES fill
    const idxJan05 = grid.dates.indexOf("2024-01-05");
    expect(grid.values[0][idxJan05]).toBe(1);
  });
});

describe("applyTransform", () => {
  it("raw is identity", () => {
    const pts: [string, number][] = [["2024-01-01", 5]];
    expect(applyTransform(pts, "raw")).toEqual(pts);
  });
});
