import { describe, expect, it } from "vitest";
import { aggregate, DEFAULT_OPTIONS, evaluateEpisodes, type Episode, type EpisodeOutcome } from "../backtest";
import { associatedMove, gdpBeta, rollingBeta } from "../beta";
import { comparableTransform, overlayPoints, observedCorrelation } from "../transform";
import { companyEligible, energyTradeProfile, sovereignExclusion, validateAdjustedAlignment } from "../quality";
import { externalForecastCurrent, forecastHorizons } from "../forecast";
import { computeMarketState, percentileOf } from "../state";
import type { Forecast, ImpactCompany, ImpactCountry, ImpactFile, Series } from "../data";

function series(id: string, values: number[], start = "2020-01-01"): Series {
  const points: [string, number][] = values.map((v, i) => [new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10), v]);
  return { id, name: id, category: "energy", source: "FRED", unit: "USD", cadence: "daily", points, lastUpdated: points.at(-1)![0] };
}

describe("backtest temporal validity and uncertainty", () => {
  const a = series("BRENT", Array.from({ length: 1600 }, (_, i) => 100 + i / 100 + 2 * Math.sin(i / 7) + Math.cos(i / 3)));
  const b = series("XLE", Array.from({ length: 1600 }, (_, i) => 150 + i / 50 + Math.sin(i / 7) * Math.cos(i / 100) + Math.sin(i / 4)));
  const onset = a.points[1100][0];
  const available = (s: Series) => ({ ...s, points: s.points.slice(0, 1098) });
  const ep: Episode = { family: "Correlation regime", subject: "test", seriesIds: ["BRENT", "XLE"], onset, severity: "watch", metric: 0.2,
    cShort: observedCorrelation(available(a), available(b), a.points[980][0])!.rho,
    cLong: observedCorrelation(available(a), available(b), a.points[735][0])!.rho };

  it("uses only previously completed same-pair correlation baselines and records entry", () => {
    const first = evaluateEpisodes([ep], new Map([[a.id, a], [b.id, b]]))[0];
    const futureChanged = { ...b, points: b.points.map(([date, v], i): [string, number] => [date, i > 1200 ? v * (1 + 0.4 * Math.sin(i)) : v]) };
    const second = evaluateEpisodes([ep], new Map([[a.id, a], [b.id, futureChanged]]))[0];
    expect(first.entryDate).toBe(a.points[1101][0]);
    expect(first.outcomes["60"]).not.toBeNull();
    expect(first).toEqual(second);
  });

  it("does not invent a 50% baseline without adequate prior comparisons", () => {
    const early = { ...ep, onset: a.points[200][0] };
    expect(evaluateEpisodes([early], new Map([[a.id, a], [b.id, b]]))[0].outcomes["60"]).toBeNull();
  });

  it("suppresses deceptively exact bootstrap intervals in small or one-sided samples", () => {
    const rows = (n: number, allHits = false): EpisodeOutcome[] => Array.from({ length: n }, (_, i) => ({ ...ep, onset: a.points[i][0], entryDate: a.points[i + 1][0], outcomes: { "20": { hit: allHits || i % 3 === 0, move: i % 3 - 1, baselineHit: 0.5 } } }));
    expect(aggregate(rows(5), "20")?.hitCI).toBeNull();
    expect(aggregate(rows(40, true), "20")?.hitCI).toBeNull();
    const stats = aggregate(rows(40), "20")!;
    expect(stats.hitCI![1]).toBeGreaterThan(stats.hitCI![0]);
  });

  it("excludes not-yet-published observations from directional baselines", () => {
    const event = { ...ep, family: "Momentum", seriesIds: ["BRENT"], onset: a.points[500][0] };
    const changed = { ...a, points: a.points.map(([d, v], i): [string, number] => [d, i >= 498 && i <= 500 ? 300 - i % 3 : v]) };
    const options = { ...DEFAULT_OPTIONS, horizons: [5] };
    const before = evaluateEpisodes([event], new Map([[a.id, a]]), options)[0].outcomes["5"]!;
    const after = evaluateEpisodes([event], new Map([[a.id, changed]]), options)[0].outcomes["5"]!;
    expect(before.baselineHit).toBe(after.baselineHit);
  });
});

describe("economically consistent scales and scenarios", () => {
  it("does not index a GDP growth rate or calculate percentage growth of a yield", () => {
    const gdp = { ...series("GDP_IND", [6, 7]), unit: "% y/y" };
    const yieldSeries = { ...series("UST10Y", [2, 3]), unit: "%" };
    expect(comparableTransform([gdp], "index")).toBe("raw");
    expect(comparableTransform([yieldSeries], "yoy")).toBe("raw");
    expect(comparableTransform([yieldSeries, series("BRENT", [80, 90])], "raw")).toBe("zscore");
  });
  it("plots monthly observations at period end, while calculating YoY on source periods", () => {
    const monthly = { ...series("CPI", [1]), points: [["2025-02-01", 100], ["2026-02-01", 103]] as [string, number][] };
    expect(overlayPoints(monthly, "yoy", "2026-02-20")).toEqual([["2026-02-28", expect.closeTo(3, 8)]]);
  });
  it("translates large positive and negative scenarios using the log-return model", () => {
    expect(associatedMove(2, 40)).toBeCloseTo(96, 10);
    expect(associatedMove(2, -40)).toBeCloseTo(-64, 10);
    expect(associatedMove(-1, -40)).toBeCloseTo(66.6666667, 6);
    expect(associatedMove(1, -100)).toBeNull();
  });
  it("does not describe an old paired regression as current", () => {
    const values = Array.from({ length: 400 }, (_, i) => 100 + Math.sin(i));
    const a = series("A", values), b = series("B", values);
    b.points = b.points.filter((_, i) => i < 100 || i % 2 === 0);
    expect(rollingBeta(a.points, b.points)).toBeNull();
  });
  it("classifies energy trade from the reported net balance, not a fixed country label", () => {
    const country = { role: "balanced", energyImports: { value: -12.3, year: "2024" }, fuelExports: null } as ImpactCountry;
    expect(energyTradeProfile(country)).toContain("net energy exports: 12.3%");
    expect(energyTradeProfile(country)).toContain("2024");
  });
});

describe("GDP identification and uncertainty", () => {
  const oil: [string, number][] = [["2000", 60]];
  const world: [string, number][] = [], gdp: [string, number][] = [];
  for (let i = 0; i < 24; i++) {
    const x = 15 * Math.sin(i), w = 3 + Math.cos(i / 2), year = String(2001 + i);
    oil.push([year, oil.at(-1)![1] * (1 + x / 100)]);
    world.push([year + "-12-31", w]); gdp.push([year + "-12-31", 1 + 0.051234 * x + 0.6 * w]);
  }
  it("retains coefficient precision and reports a robust interval and paired date", () => {
    const stats = gdpBeta(gdp, oil, world)!;
    expect(stats.betaPer10Pct).toBeCloseTo(0.51234, 8);
    expect(stats.betaCI[0]).toBeCloseTo(0.51234, 7);
    expect(stats.asOf).toBe("2024");
    const noisy = gdp.map(([d, v], i): [string, number] => [d, v + Math.sin(i * 2) * 2]);
    const uncertain = gdpBeta(noisy, oil, world)!;
    expect(uncertain.betaCI[1] - uncertain.betaCI[0]).toBeGreaterThan(0.1);
  });
  it("withholds a slope when oil cannot be distinguished from the world control", () => {
    const collinear = world.map(([d], i): [string, number] => [d, (oil[i + 1][1] / oil[i][1] - 1) * 100]);
    expect(gdpBeta(gdp, oil, collinear)).toBeNull();
    expect(gdpBeta([...gdp, gdp[0]], oil, world)).toBeNull();
  });
  it("withholds mismatched fiscal years and overdue annual inputs", () => {
    const impact = { generated: "2026-11-21T00:00:00Z", oilAnnualValidated: true, worldGdp: [["2025-12-31", 3]] } as ImpactFile;
    expect(sovereignExclusion({ iso: "IND", gdp } as ImpactCountry, impact, Date.parse("2026-11-21"))).toContain("fiscal");
    expect(sovereignExclusion({ iso: "USA", gdp: [["2023-12-31", 2]] } as ImpactCountry, impact, Date.parse("2026-11-21"))).toContain("overdue");
  });
});

describe("state descriptions", () => {
  it("ranks ties neutrally", () => { expect(percentileOf([5, 5, 5], 5)).toBe(50); });
  it("does not call a positive dollar change depreciation because its historical rank is low", () => {
    const values = Array.from({ length: 900 }, (_, i) => 100 * Math.exp(0.004 * Math.min(i, 700) + 0.0001 * Math.max(0, i - 700)));
    const price = series("WTI", values.map((v, i) => v * (1 + 0.001 * Math.sin(i))));
    const state = computeMarketState({ id: "WTI", name: "WTI" }, price, series("DXY", values), undefined)!;
    expect(state.conditions.find((c) => c.key === "dollar")?.reading).toContain("appreciation");
    expect(state.conditions[0].reading).toContain("above average");
  });
  it("does not re-use older volatility when the current return is invalid", () => {
    const price = series("WTI", [...Array.from({ length: 900 }, (_, i) => 100 + Math.sin(i)), -10]);
    expect(computeMarketState({ id: "WTI", name: "WTI" }, price, price, undefined)).toBeNull();
  });
});

describe("forecast and analytical eligibility", () => {
  it("never records a past forecast anchor as a future horizon", () => {
    const forecast: Forecast = { kind: "model", method: "test", points: [["2026-11-20", 100, 100, 100, 100, 100], ["2026-12-21", 80, 90, 100, 110, 120]] };
    const digest = forecastHorizons(forecast, "2026-11-21");
    expect(digest["7"]).toBeUndefined();
    expect(digest["30"]).toMatchObject({ date: "2026-12-21", actualHorizonDays: 30 });
  });
  it("expires unchanged EIA content even when re-downloaded today", () => {
    const forecast: Forecast = { kind: "external", source: "EIA STEO", retrievedAt: "2026-11-21T00:00:00Z", contentUpdatedAt: "2026-09-01T00:00:00Z", points: [["2027-01-31", 90]] };
    expect(externalForecastCurrent(forecast, Date.parse("2026-11-21"))).toBe(false);
  });
  it("requires actual company QC, valid timestamps and matching adjusted dates", () => {
    const company = { adjustedPoints: [["2026-11-20", 90]], lastUpdated: "2026-11-20", retrievedAt: "2026-11-21" } as ImpactCompany;
    expect(companyEligible(company, Date.parse("2026-11-21"))).toBe(false);
    const points = series("A", Array.from({ length: 12 }, () => 100)).points;
    expect(() => validateAdjustedAlignment(points, [...points.slice(1), ["2020-01-13", 100]])).toThrow("alignment");
  });
});
