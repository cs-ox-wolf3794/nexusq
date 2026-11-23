import { get } from "./http.mjs";

/**
 * @param {(result: object) => void} [validate]
 * @param {{start: number, end: number}} [period] Unix seconds; alternate explicit-period cache key.
 */
export async function yahooChart(symbol, interval = "1d", range = "10y", validate = undefined, period = undefined) {
  if (period && (![period.start, period.end].every(Number.isSafeInteger) || period.start >= period.end)) throw new Error("Invalid Yahoo date range");
  const window = period ? `period1=${period.start}&period2=${period.end}` : `range=${range}`;
  const url = `/v8/finance/chart/${encodeURIComponent(symbol)}?${window}&interval=${interval}`;
  let failure;
  // Same instrument/provider on both hosts: never substitute a futures contract for spot.
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const json = await get(`https://${host}${url}`, true, { retries: 2, timeout: 10000 });
      if (json.chart?.error || !json.chart?.result?.[0]) throw new Error("Yahoo chart response unavailable");
      // A reachable host can still return an incomplete or regressed snapshot.
      // Callers can reject it before trying the same instrument on the other host.
      validate?.(json.chart.result[0]);
      return json.chart.result[0];
    } catch (error) { failure = error; }
  }
  throw failure;
}

export function parseYahooDaily(result, now = Date.now(), expectedSymbol) {
  if (expectedSymbol && (result.meta?.symbol !== expectedSymbol || result.meta?.currency !== "USD")) throw new Error("Yahoo daily identity/currency mismatch");
  const timestamps = result.timestamp;
  const closes = result.indicators?.quote?.[0]?.close;
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose;
  if (!Array.isArray(timestamps) || !Array.isArray(closes) || timestamps.length !== closes.length) throw new Error("Yahoo daily schema mismatch");
  const regular = result.meta?.currentTradingPeriod?.regular;
  const today = new Date(now).toISOString().slice(0, 10);
  const currentSession = regular?.start ? new Date(regular.start * 1000).toISOString().slice(0, 10) : today;
  const points = [], adjustedPoints = [];
  for (let i = 0; i < timestamps.length; i++) {
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    // Without a verifiable close time, exclude today's incomplete bar.
    if (date >= today && (!regular?.end || date !== currentSession || now < (regular.end + 300) * 1000)) continue;
    if (closes[i] == null) continue; // exchange holiday or absent bar, never zero-fill
    if (!Number.isFinite(closes[i]) || closes[i] <= 0) throw new Error("invalid Yahoo close");
    points.push([date, closes[i]]);
    if (Number.isFinite(adjusted?.[i]) && adjusted[i] > 0) adjustedPoints.push([date, adjusted[i]]);
  }
  if (adjustedPoints.length !== points.length) throw new Error("adjusted-close coverage incomplete");
  return { points, adjustedPoints, priceBasis: "close", returnBasis: "Yahoo adjusted close (splits and distributions)" };
}

export function parseQuote(result, id, symbol, now = Date.now()) {
  const meta = result.meta;
  if (meta?.symbol !== symbol || meta.currency !== "USD" || !Number.isFinite(meta.regularMarketPrice) || meta.regularMarketPrice <= 0
    || !Number.isFinite(meta.regularMarketTime) || meta.regularMarketTime <= 0 || meta.regularMarketTime * 1000 > now + 60000) throw new Error("invalid quote identity/price/timestamp");
  const regular = meta.currentTradingPeriod?.regular;
  if (!regular || !Number.isFinite(regular.start) || !Number.isFinite(regular.end) || regular.end <= regular.start) throw new Error("quote session unavailable");
  return {
    id, symbol, name: meta.shortName ?? symbol, price: meta.regularMarketPrice, currency: meta.currency,
    observedAt: new Date(meta.regularMarketTime * 1000).toISOString(), checkedAt: new Date(now).toISOString(),
    sessionStart: new Date(regular.start * 1000).toISOString(), sessionEnd: new Date(regular.end * 1000).toISOString(),
    source: "Yahoo Finance", delayMinutes: Number.isFinite(meta.exchangeDataDelayedBy) ? meta.exchangeDataDelayedBy : null,
    status: "available",
  };
}
