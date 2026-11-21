import { describe, expect, it, vi } from "vitest";
import { fetchGdpForecasts, gdpForecastVintage, parseForecastCsv, parseGdpForecastRows, GDP_METADATA_URL, GDP_BULK_URL } from "../../../scripts/lib/gdp-forecasts.mjs";
import { externalForecastCurrent } from "../forecast";
import type { Forecast } from "../data";

const now = Date.parse("2026-11-21T08:00:00Z");
const countries = ["USA", "CHN", "IND", "DEU"].map((iso) => ({ iso, id: `GDP_${iso}` }));
const metadata = (date = "2026-10-13") => ({ series_description: {
  idno: "IMF_WEO_NGDP_RPCH", database_id: "IMF_WEO", measurement_unit: "Percentage change", periodicity: "Annual", version_statement: { version_date: date },
} });
const rows = (iso: string) => Array.from({ length: 4 }, (_, i) => ({
  DATABASE_ID: "IMF_WEO", INDICATOR: "IMF_WEO_NGDP_RPCH", REF_AREA: iso, FREQ: "A", UNIT_MEASURE: "PC", UNIT_MULT: 0,
  SEX: "_Z", AGE: "_Z", URBANISATION: "_Z", COMP_BREAKDOWN_1: "V_LST", COMP_BREAKDOWN_2: "_Z", COMP_BREAKDOWN_3: "_Z",
  TIME_PERIOD: String(2026 + i), OBS_VALUE: String(2.123456 + i),
}));
const bulkRows = countries.flatMap(({ iso }) => rows(iso));
const headers = Object.keys(bulkRows[0]);
const csv = [headers, ...bulkRows.map((row) => Object.values(row))].map((row) => row.map((value) => JSON.stringify(String(value))).join(",")).join("\r\n");
const api = async (url: string) => {
  if (url === GDP_METADATA_URL) return metadata();
  const value = rows(new URL(url).searchParams.get("REF_AREA")!);
  return { count: value.length, value };
};

describe("institutional GDP forecast delivery", () => {
  it("validates all four countries and preserves precision, source version and year basis", async () => {
    const result = await fetchGdpForecasts(countries, { now, getImpl: api });
    expect(Object.keys(result)).toHaveLength(4);
    expect(result.GDP_USA.points[0]).toEqual(["2026-12-31", 2.123456]);
    expect(result.GDP_USA.sourceVintage).toBe("2026-10-13");
    expect(result.GDP_IND.periodBasis).toMatch(/Fiscal years beginning in April/);
    expect(result.GDP_USA.retrievedAt).toBe("2026-11-21T08:00:00.000Z");
  });
  it("rejects wrong countries, units, frequency, version dimensions and invalid numbers", () => {
    for (const changes of [
      { REF_AREA: "CHN" }, { UNIT_MEASURE: "USD" }, { UNIT_MULT: "" }, { FREQ: "Q" }, { SEX: "F" },
      { COMP_BREAKDOWN_1: "V_2024" }, { OBS_VALUE: "" }, { OBS_VALUE: "NaN" }, { OBS_VALUE: "100" }, { TIME_PERIOD: "2026-Q1" },
    ]) expect(() => parseGdpForecastRows([{ ...rows("USA")[0], ...changes }, ...rows("USA").slice(1)], "USA", 2026, 2029)).toThrow();
  });
  it("rejects duplicate, missing and truncated forecast years", () => {
    expect(() => parseGdpForecastRows(rows("USA").slice(1), "USA", 2026, 2029)).toThrow(/Incomplete/);
    expect(() => parseGdpForecastRows([...rows("USA"), rows("USA")[0]], "USA", 2026, 2029)).toThrow();
  });
  it("falls back to one coherent official bulk file when an API country fails", async () => {
    const getImpl = vi.fn(async (url: string) => {
      if (url === GDP_BULK_URL) return csv;
      if (url.includes("REF_AREA=DEU")) throw new Error("HTTP 503");
      return api(url);
    });
    const result = await fetchGdpForecasts(countries, { now, getImpl });
    expect(Object.values(result).every((forecast) => forecast.deliveryUrl === GDP_BULK_URL)).toBe(true);
    expect(getImpl.mock.calls.filter(([url]) => url === GDP_BULK_URL)).toHaveLength(1);
  });
  it("does not publish an incomplete fallback after a truncated API response", async () => {
    const getImpl = async (url: string) => {
      if (url === GDP_METADATA_URL) return metadata();
      if (url === GDP_BULK_URL) return csv.split("\r\n").slice(0, -1).join("\r\n");
      return { count: 5, value: rows("USA") };
    };
    await expect(fetchGdpForecasts(countries, { now, getImpl })).rejects.toThrow(/Incomplete/);
  });
  it("rejects stale, future and regressing source versions, even with a fresh retrieval", async () => {
    expect(() => gdpForecastVintage(metadata("2025-10-14"), now)).toThrow(/overdue/);
    expect(() => gdpForecastVintage(metadata("2026-11-22"), now)).toThrow(/future/);
    await expect(fetchGdpForecasts(countries, { now, getImpl: api, previous: { GDP_USA: { sourceVintage: "2026-11-01" } } })).rejects.toThrow(/regress/);
  });
  it("rejects a release that changes while country responses are in flight", async () => {
    let metadataRequests = 0;
    const getImpl = async (url: string) => url === GDP_METADATA_URL ? metadata(++metadataRequests === 1 ? "2026-10-13" : "2026-10-14") : api(url);
    await expect(fetchGdpForecasts(countries, { now, getImpl })).rejects.toThrow(/changed during retrieval/);
  });
  it("parses escaped CSV fields and rejects broken quoting or incomplete columns", () => {
    expect(parseForecastCsv('OBS_VALUE,LABEL\r\n"2.1","annual, ""quoted""\nlabel"')[0].LABEL).toBe('annual, "quoted"\nlabel');
    expect(() => parseForecastCsv('OBS_VALUE,LABEL\n"2.1","unfinished')).toThrow(/Unterminated/);
    expect(() => parseForecastCsv('OBS_VALUE,LABEL\n2.1')).toThrow(/column count/);
  });
  it("withholds expired or undated mirrored forecasts in the client", () => {
    const forecast: Forecast = { kind: "external", source: "IMF WEO via World Bank Data360", sourceVintage: "2026-10-13", retrievedAt: "2026-11-21T07:00:00Z", points: [["2027-12-31", 2.1]] };
    expect(externalForecastCurrent(forecast, now)).toBe(true);
    expect(externalForecastCurrent({ ...forecast, sourceVintage: "2025-10-14" }, now)).toBe(false);
    expect(externalForecastCurrent({ ...forecast, sourceVintage: undefined }, now)).toBe(false);
    expect(externalForecastCurrent({ ...forecast, retrievedAt: "2026-09-01T00:00:00Z" }, now)).toBe(false);
  });
});
