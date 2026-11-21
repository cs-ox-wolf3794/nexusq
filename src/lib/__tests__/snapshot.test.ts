import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { loadSnapshot, quoteStatus, type Quote } from "../snapshot";

const points = Array.from({ length: 10 }, (_, i) => [`2026-11-${String(i + 1).padStart(2, "0")}`, 100 + i]);
const series = { id: "BRENT", name: "Brent", source: "FRED", unit: "USD/bbl", category: "energy", lastUpdated: "2026-11-10", points };
const catalog = { generated: "2026-11-21T06:00:00Z", series: [{ ...series, count: 10, points: undefined }] };
const quality = { generated: catalog.generated, series: { BRENT: { cadence: "daily", staleDays: 11, flags: [] } }, summary: { ok: 1, flagged: 0, failed: [] } };

function setup(corrupt = false, corruptManifest = false) {
  const bodies: Record<string, string> = { "catalog.json": JSON.stringify(catalog), "quality.json": JSON.stringify(quality), "BRENT.json": JSON.stringify(series) };
  const files = Object.fromEntries(Object.entries(bodies).map(([name, text]) => [name, createHash("sha256").update(text).digest("hex")]));
  bodies["manifest.json"] = JSON.stringify({ schemaVersion: 1, revision: createHash("sha256").update(JSON.stringify(files)).digest("hex"), files });
  if (corruptManifest) bodies["manifest.json"] = bodies["manifest.json"].replace(files["BRENT.json"], "0".repeat(64));
  if (corrupt) bodies["BRENT.json"] = JSON.stringify({ ...series, points: [] });
  const fetcher = vi.fn(async (input: string) => new Response(bodies[input.split("data/")[1].split("?")[0]], { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

describe("coherent client snapshots", () => {
  it("accepts a complete verified set and only checks the manifest when unchanged", async () => {
    const fetcher = setup();
    const first = await loadSnapshot();
    expect(first.seriesMap.get("BRENT")?.points).toHaveLength(10);
    fetcher.mockClear();
    expect(await loadSnapshot(first)).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects mixed publications and can recover on the next request", async () => {
    setup(true);
    await expect(loadSnapshot()).rejects.toThrow("integrity");
    setup();
    await expect(loadSnapshot()).resolves.toHaveProperty("revision");
  });
  it("rejects changed manifest contents even when the claimed revision matches a cached snapshot", async () => {
    setup();
    const cached = await loadSnapshot();
    setup(false, true);
    await expect(loadSnapshot(cached)).rejects.toThrow(/manifest/i);
  });
});

describe("quote freshness is based on observation time, not download time", () => {
  const quote: Quote = { id: "XLE", symbol: "XLE", name: "XLE", price: 100, currency: "USD", source: "Yahoo Finance", delayMinutes: null, status: "available",
    observedAt: "2026-11-20T16:00:00Z", checkedAt: "2026-11-20T16:10:00Z", sessionStart: "2026-11-20T14:30:00Z", sessionEnd: "2026-11-20T21:00:00Z" };
  it("expires a recently downloaded old quote", () => {
    expect(quoteStatus(quote, Date.parse("2026-11-20T16:10Z")).current).toBe(true);
    expect(quoteStatus({ ...quote, checkedAt: "2026-11-20T16:20Z" }, Date.parse("2026-11-20T16:20Z")).current).toBe(false);
  });
  it("does not assert today's market is closed using yesterday's session metadata", () => {
    expect(quoteStatus(quote, Date.parse("2026-11-23T16:00Z"))).toMatchObject({ current: false });
    expect(quoteStatus({ ...quote, status: "retained" }, Date.parse("2026-11-20T16:10Z")).current).toBe(false);
  });
});
