import { describe, expect, it } from "vitest";
import { gdpBeta, rollingBeta } from "../beta";

/** Build a daily price series from a deterministic log-return sequence. */
function pricesFromReturns(returns: number[], start = 100): [string, number][] {
  const out: [string, number][] = [];
  let level = start;
  const d0 = Date.parse("2024-01-01T00:00:00Z");
  out.push([new Date(d0).toISOString().slice(0, 10), level]);
  returns.forEach((r, i) => {
    level *= Math.exp(r);
    out.push([new Date(d0 + (i + 1) * 86400000).toISOString().slice(0, 10), level]);
  });
  return out;
}

describe("rollingBeta", () => {
  // driver returns: deterministic, zero-mean-ish oscillation
  const driverR = Array.from({ length: 120 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.008));

  it("recovers β=2, R²=1, α≈0 for an asset that is exactly 2× the driver", () => {
    const driver = pricesFromReturns(driverR);
    const asset = pricesFromReturns(driverR.map((r) => 2 * r));
    const rb = rollingBeta(asset, driver, 90)!;
    expect(rb.current.beta).toBeCloseTo(2, 2);
    expect(rb.current.r2).toBeCloseTo(1, 2);
    expect(Math.abs(rb.current.alphaAnnual)).toBeLessThan(0.2);
    expect(rb.current.n).toBe(90);
  });

  it("recovers a negative beta", () => {
    const driver = pricesFromReturns(driverR);
    const asset = pricesFromReturns(driverR.map((r) => -0.5 * r));
    const rb = rollingBeta(asset, driver, 90)!;
    expect(rb.current.beta).toBeCloseTo(-0.5, 2);
  });

  it("returns null when there are too few paired observations", () => {
    const driver = pricesFromReturns(driverR.slice(0, 10));
    const asset = pricesFromReturns(driverR.slice(0, 10));
    expect(rollingBeta(asset, driver, 90)).toBeNull();
  });
});

describe("gdpBeta (Frisch–Waugh, cycle-controlled)", () => {
  // Synthetic economy: gdp = 1 + 0.05·oilΔ% + 0.6·world  (exact, no noise)
  const oilChanges = [10, -5, 20, 0, 15, -10, 8, -12, 25, 3, -7, 18, -15, 5, 12, -3, 9, -20, 30, -8, 6, 14, -6, 11];
  const worldGrowth = [3.1, 2.4, 3.8, 2.9, 3.3, 1.2, 4.0, 2.2, 3.5, 2.8, 2.0, 3.9, 1.5, 2.6, 3.2, 2.7, 3.0, 0.8, 4.2, 2.1, 2.5, 3.4, 2.3, 3.0];

  const oilAnnual: [string, number][] = [["2000", 50]];
  oilChanges.forEach((x, i) => {
    oilAnnual.push([String(2001 + i), oilAnnual[i][1] * (1 + x / 100)]);
  });
  const worldGdp: [string, number][] = worldGrowth.map((w, i) => [`${2001 + i}-12-31`, w]);
  const gdp: [string, number][] = oilChanges.map((x, i) => [
    `${2001 + i}-12-31`,
    1 + 0.05 * x + 0.6 * worldGrowth[i],
  ]);

  it("recovers the oil coefficient net of the world cycle", () => {
    const gb = gdpBeta(gdp, oilAnnual, worldGdp)!;
    expect(gb.betaPer10Pct).toBeCloseTo(0.5, 1); // 0.05 per 1% → 0.5 per +10%
    expect(Math.abs(gb.r)).toBeGreaterThan(0.99); // exact relationship → |partial r| ≈ 1
    expect(gb.n).toBe(24);
  });

  it("reports ≈0 beta when GDP only follows the world cycle", () => {
    const gdpCycleOnly: [string, number][] = worldGrowth.map((w, i) => [`${2001 + i}-12-31`, 1 + 0.6 * w]);
    const gb = gdpBeta(gdpCycleOnly, oilAnnual, worldGdp)!;
    expect(Math.abs(gb.betaPer10Pct)).toBeLessThan(0.05);
  });

  it("returns null with insufficient years", () => {
    expect(gdpBeta(gdp.slice(0, 5), oilAnnual, worldGdp)).toBeNull();
  });
});
