import { get, mapLimit } from "./http.mjs";
import { validateForecastPoints } from "./forecast.mjs";
import { validDate } from "../../src/lib/quality.ts";

export const GDP_FORECAST_INDICATOR = "IMF_WEO_NGDP_RPCH";
export const GDP_METADATA_URL = `https://data360files.worldbank.org/data360-data/metadata/IMF_WEO/${GDP_FORECAST_INDICATOR}.json`;
export const GDP_BULK_URL = `https://data360files.worldbank.org/data360-data/data/IMF_WEO/${GDP_FORECAST_INDICATOR}.csv`;
const IMF_SOURCE_URL = "https://data.imf.org/en/datasets/IMF.RES:WEO";
const DAY = 86400000;

export function gdpForecastVintage(metadata, now = Date.now()) {
  const description = metadata?.series_description;
  const vintage = description?.version_statement?.version_date;
  if (description?.idno !== GDP_FORECAST_INDICATOR || description.database_id !== "IMF_WEO"
    || description.measurement_unit !== "Percentage change" || description.periodicity !== "Annual"
    || !validDate(vintage)) throw new Error("GDP forecast metadata identity, unit or vintage is invalid");
  const age = (now - Date.parse(vintage)) / DAY;
  // WEO normally publishes in April and October. Allow a release-cycle margin,
  // independently of whether an old file was downloaded successfully today.
  if (age < 0 || age > 225) throw new Error("GDP forecast source vintage is future-dated or overdue");
  return vintage;
}

export function parseGdpForecastRows(rows, iso, firstYear, lastYear) {
  if (!Array.isArray(rows) || !rows.length) throw new Error(`GDP forecasts unavailable: ${iso}`);
  const points = [];
  for (const row of rows) {
    if (row.DATABASE_ID !== "IMF_WEO" || row.INDICATOR !== GDP_FORECAST_INDICATOR || row.REF_AREA !== iso
      || row.FREQ !== "A" || row.UNIT_MEASURE !== "PC" || String(row.UNIT_MULT) !== "0"
      || row.SEX !== "_Z" || row.AGE !== "_Z" || row.URBANISATION !== "_Z"
      || row.COMP_BREAKDOWN_1 !== "V_LST" || row.COMP_BREAKDOWN_2 !== "_Z" || row.COMP_BREAKDOWN_3 !== "_Z") {
      throw new Error(`GDP forecast dimensions disagree: ${iso}`);
    }
    if (!/^\d{4}$/.test(row.TIME_PERIOD) || Number(row.TIME_PERIOD) < firstYear || Number(row.TIME_PERIOD) > lastYear
      || typeof row.OBS_VALUE !== "string" || !/^-?\d+(?:\.\d+)?$/.test(row.OBS_VALUE)) throw new Error(`Invalid GDP forecast value or year: ${iso}`);
    const value = Number(row.OBS_VALUE);
    if (!Number.isFinite(value) || value < -50 || value > 50) throw new Error(`GDP forecast outside review bounds: ${iso}`);
    points.push([`${row.TIME_PERIOD}-12-31`, value]);
  }
  points.sort((a, b) => a[0].localeCompare(b[0]));
  validateForecastPoints(points);
  if (points.length !== lastYear - firstYear + 1 || points.some(([date], i) => Number(date.slice(0, 4)) !== firstYear + i)) {
    throw new Error(`Incomplete GDP forecast horizon: ${iso}`);
  }
  return points;
}

/** RFC 4180 fields, including quoted commas, escaped quotes and line breaks. */
export function parseForecastCsv(csv) {
  const rows = [];
  let row = [], field = "", quoted = false, closed = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ""; closed = false;
      if (c !== ',') {
        if (c === '\r' && csv[i + 1] === '\n') i++;
        if (row.some((value) => value !== "")) rows.push(row);
        row = [];
      }
    } else if (c === '"' && field === "" && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error("Malformed GDP forecast CSV quoting");
      field += c;
    }
  }
  if (quoted) throw new Error("Unterminated GDP forecast CSV field");
  if (field || row.length || closed) { row.push(field); rows.push(row); }
  const header = rows.shift();
  if (!header?.length || new Set(header).size !== header.length || !header.includes("OBS_VALUE")) throw new Error("Invalid GDP forecast CSV header");
  return rows.map((values) => {
    if (values.length !== header.length) throw new Error("GDP forecast CSV column count mismatch");
    return Object.fromEntries(header.map((key, i) => [key, values[i]]));
  });
}

/** Same forecast producer, two World Bank delivery routes; never average models. */
export async function fetchGdpForecasts(countries, { now = Date.now(), getImpl = get, previous = {} } = {}) {
  const year = new Date(now).getUTCFullYear();
  const firstYear = year, lastYear = year + 3;
  const vintage = gdpForecastVintage(await getImpl(GDP_METADATA_URL), now);
  for (const { id } of countries) {
    if (previous[id]?.sourceVintage > vintage) throw new Error("GDP forecast vintage would regress");
  }
  const apiResults = await mapLimit(countries, 2, async ({ iso }) => {
    const url = `https://data360api.worldbank.org/data360/data?DATABASE_ID=IMF_WEO&INDICATOR=${GDP_FORECAST_INDICATOR}&REF_AREA=${iso}&timePeriodFrom=${firstYear}&timePeriodTo=${lastYear}`;
    try {
      const data = await getImpl(url);
      if (data.count !== data.value?.length) throw new Error("GDP forecast API response is incomplete");
      return { iso, points: parseGdpForecastRows(data.value, iso, firstYear, lastYear), url };
    } catch (error) { return { iso, error: error.message }; }
  });
  let complete = apiResults;
  if (apiResults.some((result) => result.error)) {
    // A partial/malformed response triggers one coherent bulk-file fallback for
    // all requested countries, rather than mixing releases or providers.
    const rows = parseForecastCsv(await getImpl(GDP_BULK_URL, false));
    complete = countries.map(({ iso }) => ({ iso, url: GDP_BULK_URL,
      points: parseGdpForecastRows(rows.filter((row) => row.REF_AREA === iso
        && Number(row.TIME_PERIOD) >= firstYear && Number(row.TIME_PERIOD) <= lastYear), iso, firstYear, lastYear) }));
  }
  const after = gdpForecastVintage(await getImpl(GDP_METADATA_URL), now);
  if (after !== vintage) throw new Error("GDP forecast release changed during retrieval; retry next refresh");
  return Object.fromEntries(countries.map(({ id, iso }) => {
    const result = complete.find((item) => item.iso === iso);
    return [id, {
      kind: "external", source: "IMF WEO via World Bank Data360", sourceUrl: IMF_SOURCE_URL,
      deliveryUrl: result.url, sourceVintage: vintage, retrievedAt: new Date(now).toISOString(),
      periodBasis: iso === "IND" ? "Fiscal years beginning in April; plotted dates are year labels, not calendar-year observations." : "Calendar years; forecast vintage can differ from World Bank historical revisions.",
      points: result.points,
    }];
  }));
}
