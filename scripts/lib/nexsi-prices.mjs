import { get } from "./http.mjs";
import { yahooChart, parseYahooDaily } from "./yahoo.mjs";
import { validDate, validatePoints, validateAdjustedAlignment } from "../../src/lib/quality.ts";

const DAY = 86400000;
const SNDK_START = "2025-02-13"; // Current issuer, including when-issued trading; never the pre-2016 ticker.
const PRICE_BASIS = "Split-adjusted price; cash dividends excluded";

export function parseNasdaqHistory(json, symbol, now = Date.now()) {
  const data = json?.data, rows = data?.tradesTable?.rows;
  if (json?.status?.rCode !== 200 || data?.symbol !== symbol) throw new Error("Nasdaq history identity/status mismatch");
  if (!Array.isArray(rows) || !rows.length || Number(data.totalRecords) !== rows.length) throw new Error("Incomplete Nasdaq history pagination");
  const today = new Date(now).toISOString().slice(0, 10);
  const usd = value => {
    if (typeof value !== "string" || !/^\$[\d,]+(?:\.\d+)?$/.test(value)) throw new Error("Nasdaq USD price schema mismatch");
    const number = Number(value.replace(/[$,]/g, ""));
    if (!Number.isFinite(number) || number <= 0) throw new Error("Invalid Nasdaq price");
    return number;
  };
  const points = rows.map(row => {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(row.date)) throw new Error("Invalid Nasdaq date");
    const date = `${row.date.slice(6)}-${row.date.slice(0, 2)}-${row.date.slice(3, 5)}`;
    if (!validDate(date) || date > today || (symbol === "SNDK" && date < SNDK_START)) throw new Error("Nasdaq date/issuer history mismatch");
    const close = usd(row.close), low = usd(row.low), high = usd(row.high), open = usd(row.open);
    if (low > high || Math.min(open, close) < low || Math.max(open, close) > high) throw new Error("Nasdaq OHLC mismatch");
    return [date, close];
  }).sort((a, b) => a[0].localeCompare(b[0]));
  validatePoints(points, { now, minPoints: 2 });
  // This endpoint has no verified session-end timestamp. Wait until 21:15 UTC,
  // after both normal US close times, rather than publishing an intraday bar.
  return points.filter(([date]) => date < today || now >= Date.parse(`${today}T21:15:00Z`));
}

export function validatePriceHistory(result, old, now) {
  validatePoints(result.points, { now, previous: old?.points, minPoints: 2 });
  validateAdjustedAlignment(result.points, result.adjustedPoints);
  if (result.points.some(([, v]) => v <= 0)) throw new Error("Nonpositive daily close");
  if (now - Date.parse(result.points.at(-1)[0]) > 7 * DAY) throw new Error("Completed daily close is overdue");
}

/** A constant split rescaling is legitimate; changed historical RETURNS are not.
 * Full replacement avoids stitching differently adjusted providers at a boundary.
 */
export function validatePriceContinuity(points, previous) {
  if (!previous?.length) throw new Error("Independent price history unavailable for continuity check");
  const prior = new Map(previous), shared = points.filter(([d]) => prior.has(d)).slice(-253);
  if (shared.length < 126) throw new Error("Insufficient overlapping price history");
  for (let i = 1; i < shared.length; i++) {
    const [date, value] = shared[i], [before, start] = shared[i - 1];
    if (Math.abs(Math.log(value / start) - Math.log(prior.get(date) / prior.get(before))) > 0.001) {
      throw new Error(`Historical return disagreement on ${date}; review corporate actions`);
    }
  }
  // An unadjusted split at a newly appended boundary must not become a model loss.
  // Very large genuine moves also require review instead of silent acceptance.
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] > previous.at(-1)[0] && Math.abs(Math.log(points[i][1] / points[i - 1][1])) > Math.log(1.5)) {
      throw new Error(`Large new price discontinuity on ${points[i][0]}; review corporate actions`);
    }
  }
  return { comparedThrough: shared.at(-1)[0], observations: shared.length };
}

export async function nasdaqSandisk(now, old) {
  const from = new Date(Math.max(Date.parse(SNDK_START), now - 5 * 366 * DAY)).toISOString().slice(0, 10);
  const through = new Date(now).toISOString().slice(0, 10);
  const url = `https://api.nasdaq.com/api/quote/SNDK/historical?assetclass=stocks&fromdate=${from}&todate=${through}&limit=5000`;
  const json = await get(url, true, { retries: 3, timeout: 15000 });
  const points = parseNasdaqHistory(json, "SNDK", now).slice(-850);
  const result = { points, adjustedPoints: points, provenance: {
    provider: "Nasdaq", url: "https://www.nasdaq.com/market-activity/stocks/sndk/historical", returnBasis: PRICE_BASIS,
    note: "Exchange history replaces the entire series. Split adjustments are supplied by Nasdaq and are not applied again.",
  } };
  validatePriceHistory(result, old, now);
  const reference = old?.points?.length >= 126 ? old.points : parseYahooDaily(await yahooChart("SNDK", "1d", "5y"), now, "SNDK").points;
  result.provenance.continuity = validatePriceContinuity(points, reference);
  return result;
}

export async function companyPriceHistory(symbol, old, now = Date.now()) {
  let alternateFailure;
  if (symbol === "SNDK") {
    try { return await nasdaqSandisk(now, old); }
    catch (error) { alternateFailure = error.message; }
  }
  let result;
  const validate = raw => {
    const parsed = parseYahooDaily(raw, now, symbol), points = parsed.points.slice(-850);
    result = { points, adjustedPoints: symbol === "SNDK" ? points : parsed.adjustedPoints.slice(-850), provenance: {
      provider: "Yahoo Finance", url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/`,
      returnBasis: symbol === "SNDK" ? PRICE_BASIS : "Adjusted close (splits and distributions)",
      ...(alternateFailure ? { note: `Nasdaq unavailable; validated Yahoo fallback. ${alternateFailure}` } : {}),
    } };
    validatePriceHistory(result, old, now);
    if (symbol === "SNDK") result.provenance.continuity = validatePriceContinuity(points, old?.points);
  };
  try {
    try { await yahooChart(symbol, "1d", "5y", validate); }
    catch {
      try { await yahooChart(symbol, "1d", "10y", validate); }
      catch { await yahooChart(symbol, "1d", "5y", validate, { start: Math.floor((now - 5 * 366 * DAY) / 1000), end: Math.floor(now / 1000) }); }
    }
    if (!result) throw new Error("Validated daily history unavailable");
    return result;
  } catch (error) {
    throw new Error(alternateFailure ? `Nasdaq: ${alternateFailure}; Yahoo: ${error.message}` : error.message);
  }
}
