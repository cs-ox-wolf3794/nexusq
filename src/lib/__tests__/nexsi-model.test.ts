import { describe, expect, it } from "vitest";
import { attributeMove, factorRows, fitFactors, powerCostScenario, validateFactors, type FactorRow } from "../nexsi-model";
import type { Points } from "../transform";

let seed = 91;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
const dates = Array.from({ length: 401 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
const rows: FactorRow[] = dates.slice(1).map((date, i) => {
  const x = Array.from({ length: 5 }, () => random() * 0.04);
  return { date, prior: dates[i], x, y: 0.0002 + x.reduce((s, v, j) => s + v * [1.2, 0.7, -0.2, 0.3, -0.4][j], 0) };
});

describe("NexSI attribution", () => {
  it("recovers independent factor loadings and their native-unit covariance", () => {
    const fit = fitFactors(rows)!;
    expect(fit.n).toBe(252);
    [0.0002, 1.2, 0.7, -0.2, 0.3, -0.4].forEach((v, j) => expect(fit.coefficients[j]).toBeCloseTo(v, 10));
    expect(fit.r2).toBeCloseTo(1, 10);
    expect(fit.covariance[4][4]).toBeLessThan(1e-20);
  });
  it("reconciles multi-day contributions to the observed arithmetic move", () => {
    const result = attributeMove(rows, dates[380], dates[400], 20)!;
    expect(result).not.toBeNull();
    expect(Object.values(result.components).reduce((s, v) => s + v, 0)).toBeCloseTo(result.actual, 12);
    expect(result.actual).toBeCloseTo(100 * Math.expm1(rows.slice(-20).reduce((s, r) => s + r.y, 0)), 12);
    expect(result.components.unexplained).toBeCloseTo(0, 8);
    expect(result.fit.through).toBe(dates[380]);
    expect(result.factorReturns!.oil).toBeCloseTo(100 * Math.expm1(rows.slice(-20).reduce((s, r) => s + r.x[3], 0)), 12);
    expect(result.factorReturns!.technology).toBeCloseTo(100 * Math.expm1(rows.slice(-20).reduce((s, r) => s + r.x[1], 0)), 12);
  });
  it("never fits on the event or later information", () => {
    const initial = attributeMove(rows, dates[350], dates[355], 5)!;
    const changed = rows.map((r, i) => i >= 355 ? { ...r, y: 1, x: [1, 2, 3, 4, 5] } : r);
    expect(attributeMove(changed, dates[350], dates[355], 5)).toEqual(initial);
    const shock = rows.map((r, i) => i >= 350 && i < 355 ? { ...r, y: r.y - 0.02 } : r);
    const after = attributeMove(shock, dates[350], dates[355], 5)!;
    expect(after.fit).toEqual(initial.fit);
    expect(after.components.unexplained).toBeLessThan(-5);
  });
  it("withholds missing event coverage, short samples and collinear factors", () => {
    expect(attributeMove(rows.filter(r => r.date !== dates[399]), dates[395], dates[400], 5)).toBeNull();
    expect(fitFactors(rows.slice(0, 125))).toBeNull();
    expect(fitFactors(rows.map(r => ({ ...r, x: [r.x[0], r.x[0], ...r.x.slice(2)] })))).toBeNull();
  });
  it("does not match returns with different start dates", () => {
    const p: Points = [["2026-11-16", 100], ["2026-11-17", 101], ["2026-11-18", 102]];
    expect(factorRows(p, { SPY: p, QQQ: p, IEF: p, "CL=F": p, "NG=F": [p[0], p[2]] })).toEqual([]);
  });
  it("reports rolling held-out explanatory validation separately from training fit", () => {
    const validation = validateFactors(rows)!;
    expect(validation.n).toBe(60);
    expect(validation.r2).toBeCloseTo(1, 10);
    expect(validation.energyImprovesFit).toBe(true);
    expect(validation.withoutEnergyRmseLogPct).toBeGreaterThan(validation.rmseLogPct);
  });
  it("does not report a reliable energy share for a factor shock outside the training range", () => {
    const shock = [...rows.slice(0, -1), { ...rows.at(-1)!, x: [0, 0, 0, -1, 1], y: -0.2 }];
    const result = attributeMove(shock, dates[399], dates[400], 1)!;
    expect(result.extrapolation).toBe(true);
    expect(result.energyShareOfDrop).toBeNull();
  });
  it("preserves noisy HAC uncertainty under a factor unit change", () => {
    const noisy = rows.map((r, i) => ({ ...r, y: r.y + 0.01 * Math.sin(i * 1.731) + 0.004 * Math.cos(i * 0.721) }));
    const scaled = noisy.map(r => ({ ...r, x: r.x.map((v, j) => j === 4 ? v * 100 : v) }));
    const first = attributeMove(noisy, dates[395], dates[400], 5)!;
    const second = attributeMove(scaled, dates[395], dates[400], 5)!;
    expect(first.energyCI[1] - first.energyCI[0]).toBeGreaterThan(0.01);
    expect(second.energy).toBeCloseTo(first.energy, 9);
    second.energyCI.forEach((v, i) => expect(v).toBeCloseTo(first.energyCI[i], 9));
    const fit = fitFactors(noisy)!;
    fit.covariance.forEach((r, i) => r.forEach((v, j) => expect(v).toBeCloseTo(fit.covariance[j][i], 10)));
  });
});

describe("project electricity scenario dimensions", () => {
  it("distinguishes IT load from facility load, and applies utilization and hedging once", () => {
    expect(powerCostScenario(100, 0.8, 1.2, 10, 0.5, "IT")?.annualCostChange).toBeCloseTo(4204800, 5);
    expect(powerCostScenario(100, 0.8, 1.2, 10, 0.5, "facility")?.annualCostChange).toBeCloseTo(3504000, 5);
    expect(powerCostScenario(100, 0.8, 1.2, 10, 0, "IT")?.annualCostChange).toBe(0);
  });
  it("rejects impossible utilization, PUE and hedge inputs", () => {
    expect(powerCostScenario(100, 1.2, 1, 10, 1, "IT")).toBeNull();
    expect(powerCostScenario(100, 0.8, 0.5, 10, 1, "IT")).toBeNull();
    expect(powerCostScenario(100, 0.8, 1.2, 10, -0.1, "IT")).toBeNull();
  });
});
