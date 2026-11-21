import { describe, expect, it } from "vitest";
import { modelFan, validateForecastPoints } from "../../../scripts/lib/forecast.mjs";

describe("forecast assumptions and time basis", () => {
  it("rejects malformed external forecasts before replacing their last validated version", () => {
    expect(() => validateForecastPoints([["2027-02-30", 100]])).toThrow();
    expect(() => validateForecastPoints([["2027-01-01", NaN]])).toThrow();
    expect(() => validateForecastPoints([["2027-01-01", 100], ["2027-01-01", 101]])).toThrow();
    expect(() => validateForecastPoints([["2027-01-01", 100]])).not.toThrow();
  });
  it("anchors monthly period averages at month end and uses three observations for recent-quarter drift", () => {
    const points: [string, number][] = Array.from({ length: 72 }, (_, i) => [new Date(Date.UTC(2020, i, 1)).toISOString().slice(0, 10), i < 69 ? 100 : 100 * Math.exp(0.1 * (i - 68))]);
    const fan = modelFan(points, "EUGAS")!;
    expect(fan[0][0]).toBe("2025-12-31");
    const returns = points.slice(1).map((p, i) => Math.log(p[1] / points[i][1]));
    const mu = 0.25 * returns.reduce((a, b) => a + b, 0) / returns.length + 0.25 * 0.1;
    const t = 30 * returns.length / ((Date.parse(points.at(-1)![0]) - Date.parse(points[0][0])) / 86400000);
    expect(fan[1][3]).toBeCloseTo(points.at(-1)![1] * Math.exp(mu * t), 3);
    for (const row of fan) {
      expect(row.slice(1).every(Number.isFinite)).toBe(true);
      expect(row.slice(1)).toEqual([...row.slice(1)].sort((a, b) => a - b));
    }
  });
  it("uses additive rate changes consistently even when all yields are positive", () => {
    const points: [string, number][] = Array.from({ length: 100 }, (_, i) => [new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), 2 + Math.sin(i) / 10]);
    const fan = modelFan(points, "UST10Y")!;
    // Additive Gaussian quantiles are symmetric around the median.
    expect(fan[1][1] + fan[1][5]).toBeCloseTo(2 * fan[1][3], 3);
  });
  it("does not fabricate a forecast from inadequate history", () => {
    expect(modelFan([["2026-01-01", 1]], "BRENT")).toBeNull();
  });
});
