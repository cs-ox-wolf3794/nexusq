import { describe, expect, it, vi } from "vitest";
import { get } from "../../../scripts/lib/http.mjs";
import { parseQuote, parseYahooDaily } from "../../../scripts/lib/yahoo.mjs";

describe("bounded retrieval", () => {
  it("retries malformed bodies as well as failed headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new Error("truncated JSON")) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true }) });
    const result = await get("https://source.invalid", true, { fetchImpl, sleep: async () => {} });
    expect(result).toEqual({ valid: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("does not retry permanent HTTP failures and never leaks API keys", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    await expect(get("https://source.invalid", true, { fetchImpl, sleep: async () => {} })).rejects.toThrow("HTTP 401");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(get("https://source.invalid", true, { retries: 1, fetchImpl: async () => { throw new Error("api_key=secret&failed"); } })).rejects.toThrow("api_key=[redacted]");
  });
  it("caps provider retry delays", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "9999" } }))
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await get("https://source.invalid", true, { fetchImpl, sleep });
    expect(sleep).toHaveBeenCalledWith(15000);
  });
});

const epoch = (s: string) => Date.parse(s) / 1000;
const chart = {
  meta: { symbol: "XLE", currency: "USD", regularMarketPrice: 100, regularMarketTime: epoch("2026-11-20T17:00Z"),
    currentTradingPeriod: { regular: { start: epoch("2026-11-20T14:30Z"), end: epoch("2026-11-20T21:00Z") } } },
  timestamp: [epoch("2026-11-19T14:30Z"), epoch("2026-11-20T14:30Z")],
  indicators: { quote: [{ close: [100, 101] }], adjclose: [{ adjclose: [98, 99] }] },
};
describe("Yahoo daily and intraday separation", () => {
  it("excludes the unfinished day from analytical history", () => {
    const daily = parseYahooDaily(chart, Date.parse("2026-11-20T17:00Z"));
    expect(daily.points).toEqual([["2026-11-19", 100]]);
    expect(daily.adjustedPoints).toEqual([["2026-11-19", 98]]);
    expect(parseYahooDaily(chart, Date.parse("2026-11-20T21:06Z")).points).toHaveLength(2);
  });
  it("requires matching adjusted-close coverage", () => {
    expect(() => parseYahooDaily({ ...chart, indicators: { quote: [{ close: [100, 101] }] } }, Date.parse("2026-11-21"))).toThrow("adjusted-close");
  });
  it("rejects quote identity mismatches and future timestamps", () => {
    expect(() => parseQuote(chart, "XLE", "ICLN", Date.parse("2026-11-20T17:01Z"))).toThrow();
    expect(() => parseQuote(chart, "XLE", "XLE", Date.parse("2026-11-20T16:00Z"))).toThrow();
    expect(parseQuote(chart, "XLE", "XLE", Date.parse("2026-11-20T17:01Z"))).toMatchObject({ delayMinutes: null, observedAt: "2026-11-20T17:00:00.000Z" });
  });
});
