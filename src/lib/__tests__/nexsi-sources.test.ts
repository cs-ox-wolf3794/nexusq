import { describe, expect, it, vi } from "vitest";
import { parseFilings, parseHeadlines, parsePowerRates, classify } from "../../../scripts/lib/nexsi-sources.mjs";
import { companyStatus, nexsiStatus, validateNexsi } from "../nexsi-quality";
import type { NexsiCompany, NexsiFile } from "../nexsi-types";
import { readFileSync } from "node:fs";
import { yahooChart } from "../../../scripts/lib/yahoo.mjs";

const now = Date.parse("2026-11-21T12:00:00Z");
describe("NexSI public source contracts", () => {
  it("tries the alternate Yahoo host when the first reachable host fails data validation", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ chart: { result: [{ value: "old" }] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ chart: { result: [{ value: "current" }] } }) });
    vi.stubGlobal("fetch", fetcher);
    try {
      const result = await yahooChart("SNDK", "1d", "5y", r => { if (!("value" in r) || r.value !== "current") throw new Error("latest observation regressed"); });
      expect(result.value).toBe("current");
      expect(fetcher.mock.calls[1][0]).toContain("query2.finance.yahoo.com");
    } finally { vi.unstubAllGlobals(); }
  });
  it("uses an explicit-period request without weakening validation", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ chart: { result: [{ value: "current" }] } }) });
    vi.stubGlobal("fetch", fetcher);
    try {
      const validate = vi.fn();
      await yahooChart("SNDK", "1d", "5y", validate, { start: 1700000000, end: 1795208400 });
      expect(fetcher.mock.calls[0][0]).toContain("period1=1700000000&period2=1795208400&interval=1d");
      expect(validate).toHaveBeenCalledOnce();
      await expect(yahooChart("SNDK", "1d", "5y", validate, { start: 2, end: 1 })).rejects.toThrow("range");
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps SEC issuer identity and acceptance time, excluding future/unsupported disclosures", () => {
    const data = { cik: 1045810, filings: { recent: { form: ["8-K", "10-Q", "4"], acceptanceDateTime: ["2026-11-17T21:20:51Z", "2026-12-01T12:00:00Z", "2026-11-19T12:00:00Z"], accessionNumber: ["0001045810-26-000088"], primaryDocument: ["nvda-20261117.htm"], items: ["2.02,9.01"] } } };
    expect(parseFilings(data, 1045810, now)).toEqual([expect.objectContaining({ kind: "filing", publishedAt: "2026-11-17T21:20:51.000Z", title: expect.stringContaining("earnings"), url: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000088/nvda-20261117.htm" })]);
    expect(() => parseFilings(data, 789019, now)).toThrow("identity");
  });
  it("rejects invalid RSS, unsafe links and future headlines; preserves original publication dates", () => {
    const item = (url: string, date: string) => `<item><title><![CDATA[AI &amp; power]]></title><link>${url}</link><pubDate>${date}</pubDate></item>`;
    const xml = `<rss>${item("https://example.com/story", "Fri, 20 Nov 2026 22:30:00 GMT")}${item("https://example.com/future", "Sun, 22 Nov 2026 12:00:00 GMT")}</rss>`;
    expect(parseHeadlines(xml, now)).toEqual([expect.objectContaining({ title: "AI & power", publishedAt: "2026-11-20T22:30:00.000Z" })]);
    expect(() => parseHeadlines("<html>Rate limited</html>", now)).toThrow("RSS");
    expect(()=>parseHeadlines(`<rss>${item('javascript:alert(1)','Fri, 20 Nov 2026 12:00:00 GMT')}</rss>`,now)).toThrow('record');
    expect(()=>parseHeadlines('<rss><item><title>Incomplete</title></rss>',now)).toThrow('incomplete');
    expect(()=>parseHeadlines('<rss><item><title>Missing date</title><link>https://example.com/</link></item></rss>',now)).toThrow('record');
    expect(parseHeadlines('<rss><channel></channel></rss>',now)).toEqual([]);
  });
  it("converts EIA cents/kWh to USD/MWh once and selects latest completed state observation", () => {
    const row = { stateid: "TX", sectorid: "COM", period: "2026-08", price: "9.5", "price-units": "cents per kilowatthour" };
    const json = { response: { frequency: "monthly", total: "3", data: [row, { ...row, period: "2026-09", price: "10.1" }, { ...row, stateid: "ENC" }] } };
    expect(parsePowerRates(json, now)).toEqual([expect.objectContaining({ state: "TX", period: "2026-09", usdMwh: 101 })]);
    const liveSpelling = { response: { frequency: "monthly", total: "1", data: [{ ...row, stateid: "AK", price: "23.9", "price-units": "cents per kilowatt-hour" }] } };
    expect(parsePowerRates(liveSpelling, now)).toEqual([expect.objectContaining({ state: "AK", usdMwh: 239 })]);
    expect(() => parsePowerRates({ response: { ...json.response, total: "4" } }, now)).toThrow("Incomplete");
    expect(() => parsePowerRates({ response: { frequency: "monthly", total: "1", data: [{ ...row, "price-units": "dollars per megawatthour" }] } }, now)).toThrow("unit");
    expect(() => parsePowerRates({ response: { frequency: "monthly", total: "1", data: [{ ...row, period: "2026-12" }] } }, now)).toThrow("overdue");
  });
  it("retains unfamiliar official technology members and makes power suppliers a distinct screen", () => {
    expect(classify("NEWTECH", true).included).toBe(true);
    expect(classify("CEG", false)).toEqual({ included: false, group: "Power & energy suppliers" });
    expect(classify("AMZN", false).included).toBe(true);
    expect(classify("OTHER", false).included).toBe(false);
  });
});

describe("NexSI publication and expiry", () => {
  const file: NexsiFile = JSON.parse(readFileSync(new URL("../../../public/data/nexsi.json", import.meta.url), "utf8"));
  it("requires complete constituent accounting and reconciled, pre-event attribution", () => {
    expect(() => validateNexsi(file)).not.toThrow();
    const broken = structuredClone(file); broken.companies.pop();
    expect(() => validateNexsi(broken)).toThrow("coverage");
    const misfit = structuredClone(file); misfit.companies.find(c => c.moves[1])!.moves[1]!.components.unexplained += 1;
    expect(() => validateNexsi(misfit)).toThrow("invariant");
  });
  it("expires analysis independently of a successful quote or retrieval", () => {
    const at = Date.parse(file.generated);
    expect(nexsiStatus(file, at)).toBeNull();
    expect(nexsiStatus(file, at + 4 * 86400000)).toContain("overdue");
    expect(nexsiStatus({ ...file, status: "retained" }, at)).toContain("failed");
    expect(nexsiStatus({ ...file, universe: { ...file.universe, asOf: "2020-01-01" } }, at)).toContain("membership");
    expect(companyStatus({ ...file.companies[0], issue: "source failed" } as NexsiCompany, at)).toBe("source failed");
  });
});
