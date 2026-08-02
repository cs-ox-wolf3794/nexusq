import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, evaluateEpisodes, replayEpisodes } from "../backtest";
import type { Series } from "../data";

function dailySeries(id: string, values: number[], startDate = "2014-01-01"): Series {
  const d0 = Date.parse(`${startDate}T00:00:00Z`);
  const points: [string, number][] = values.map((v, i) => [
    new Date(d0 + i * 86400000).toISOString().slice(0, 10),
    v,
  ]);
  return { id, name: id, unit: "USD", category: "energy", source: "test", lastUpdated: points[points.length - 1][0], points };
}

describe("replayEpisodes", () => {
  it("collapses a sustained dislocation into a single episode", () => {
    // ~700 quiet days, then a step up that stays elevated for 30 days
    const vals = [
      ...Array.from({ length: 700 }, (_, i) => 100 + (i % 2 === 0 ? 0.5 : -0.5)),
      ...Array.from({ length: 30 }, () => 112),
    ];
    // grid needs a BRENT series — make the subject BRENT itself
    const all = new Map<string, Series>([["BRENT", dailySeries("BRENT", vals)]]);
    const eps = replayEpisodes(all, { ...DEFAULT_OPTIONS, start: "2015-01-01" });
    const dis = eps.filter((e) => e.family === "Dislocation");
    expect(dis).toHaveLength(1);
    expect(dis[0].metric).toBeGreaterThan(1.5);
  });

  it("counts a second episode only after the cooldown", () => {
    // two separated spikes: 10 days elevated, 40 quiet days (> cooldown 15), 10 days elevated
    const quiet = (n: number) => Array.from({ length: n }, (_, i) => 100 + (i % 2 === 0 ? 0.5 : -0.5));
    const vals = [...quiet(700), ...Array.from({ length: 10 }, () => 112), ...quiet(40), ...Array.from({ length: 10 }, () => 112)];
    const all = new Map<string, Series>([["BRENT", dailySeries("BRENT", vals)]]);
    const eps = replayEpisodes(all, { ...DEFAULT_OPTIONS, start: "2015-01-01" }).filter((e) => e.family === "Dislocation");
    expect(eps.length).toBe(2);
  });
});

describe("evaluateEpisodes", () => {
  it("scores a reverting dislocation as a hit, with the publication lag applied", () => {
    const quiet = Array.from({ length: 700 }, (_, i) => 100 + (i % 2 === 0 ? 0.5 : -0.5));
    // spike to 112, stay 5 days, then revert to 100 and stay
    const vals = [...quiet, ...Array.from({ length: 5 }, () => 112), ...Array.from({ length: 80 }, () => 100)];
    const series = dailySeries("BRENT", vals);
    const all = new Map<string, Series>([["BRENT", series]]);
    const eps = replayEpisodes(all, { ...DEFAULT_OPTIONS, start: "2015-01-01" }).filter((e) => e.family === "Dislocation");
    expect(eps.length).toBeGreaterThan(0);
    const out = evaluateEpisodes([eps[0]], all)[0];
    // entry must be at/after onset + 3 calendar days
    expect(out.entryDate! > eps[0].onset).toBe(true);
    const h20 = out.outcomes["20"];
    expect(h20).not.toBeNull();
    expect(h20!.hit).toBe(true); // z>0 → expected reversion down; price fell 112→100
    expect(h20!.move).toBeGreaterThan(0); // signed move in hypothesis direction
    expect(h20!.baselineHit).toBeGreaterThan(0);
    expect(h20!.baselineHit).toBeLessThan(1);
  });
});
