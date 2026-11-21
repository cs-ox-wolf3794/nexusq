import { describe, expect, it } from "vitest";
import { computeSignals } from "../signals";
import type { Series } from "../data";

function dailySeries(id: string, values: number[], category: Series["category"] = "energy"): Series {
  const d0 = Date.parse("2023-01-01T00:00:00Z");
  const points: [string, number][] = values.map((v, i) => [
    new Date(d0 + i * 86400000).toISOString().slice(0, 10),
    v,
  ]);
  return { id, name: id, unit: "USD", category, source: "test", lastUpdated: points[points.length - 1][0], points };
}

describe("computeSignals", () => {
  it("does not turn a distribution-only price drop into an adjusted-return dislocation", () => {
    const s = dailySeries("XLE", [...Array.from({ length: 299 }, () => 100), 90]);
    s.adjustedPoints = s.points.map(([d]) => [d, 90]);
    expect(computeSignals(new Map([[s.id, s]]))).toHaveLength(0);
  });
  it("does not call an incomplete warmup a full-year dislocation reference", () => {
    const s = dailySeries("X", [...Array.from({ length: 99 }, (_, i) => 100 + Math.sin(i)), 130]);
    expect(computeSignals(new Map([[s.id, s]])).filter((s) => s.kind === "Dislocation")).toHaveLength(0);
  });
  it("does not flag steady macro index growth as an abnormal level dislocation", () => {
    const points: [string, number][] = Array.from({ length: 80 }, (_, i) => [new Date(Date.UTC(2018, i, 1)).toISOString().slice(0, 10), 100 * 1.003 ** i]);
    const s: Series = { ...dailySeries("CPI", [100], "macro"), cadence: "monthly", points, lastUpdated: points.at(-1)![0] };
    expect(computeSignals(new Map([[s.id, s]])).filter((s) => s.kind === "Dislocation")).toHaveLength(0);
    s.points[s.points.length - 1][1] *= 1.1;
    const signal = computeSignals(new Map([[s.id, s]])).find((s) => s.kind === "Dislocation")!;
    expect(signal.detail).toContain("year-on-year growth");
  });
  it("flags a dislocation when the last value is far from its trailing norm", () => {
    // 300 obs oscillating tightly around 100, then a final value far outside
    const vals = Array.from({ length: 299 }, (_, i) => 100 + (i % 2 === 0 ? 0.5 : -0.5));
    vals.push(115); // >> 2.5σ of the trailing window
    const sigs = computeSignals(new Map([["X", dailySeries("X", vals)]]));
    const dis = sigs.find((s) => s.kind === "Dislocation");
    expect(dis).toBeDefined();
    expect(dis!.severity).toBe("extreme");
    expect(dis!.seriesIds).toEqual(["X"]);
    expect(dis!.detail).toContain("Above trailing");
  });

  it("flags a momentum regime when the 50d average is far from the 200d", () => {
    // long flat history then a sustained step up: MA50 ≫ MA200
    const vals = [...Array.from({ length: 250 }, () => 100), ...Array.from({ length: 60 }, () => 130)];
    const sigs = computeSignals(new Map([["Y", dailySeries("Y", vals)]]));
    const mom = sigs.find((s) => s.kind === "Momentum");
    expect(mom).toBeDefined();
    expect(mom!.detail).toContain("above");
    expect(mom!.seriesIds).toEqual(["Y"]);
  });

  it("stays silent on a quiet series", () => {
    const vals = Array.from({ length: 300 }, (_, i) => 100 + (i % 2 === 0 ? 0.5 : -0.5));
    const sigs = computeSignals(new Map([["Z", dailySeries("Z", vals)]]));
    expect(sigs.filter((s) => s.seriesIds.includes("Z"))).toHaveLength(0);
  });

  it("skips annual GDP series", () => {
    const gdp: Series = {
      id: "GDP_TEST", name: "GDP", unit: "% y/y", category: "macro", source: "test",
      lastUpdated: "2025-12-31",
      points: Array.from({ length: 26 }, (_, i) => [`${2000 + i}-12-31`, i === 25 ? 15 : 2]),
    };
    const sigs = computeSignals(new Map([["GDP_TEST", gdp]]));
    expect(sigs).toHaveLength(0);
  });
});
