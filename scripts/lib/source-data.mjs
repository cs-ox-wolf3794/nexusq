import { validDate } from "../../src/lib/quality.ts";

export function sourceNumber(raw) {
  if (typeof raw !== "number" && (typeof raw !== "string" || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim()))) throw new Error("invalid source numeric value");
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error("nonfinite source value");
  return value;
}

export function parseFred(csv, id) {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  if (!["DATE", "observation_date"].some((date) => header === `${date},${id}`)) throw new Error("FRED series identity/header mismatch");
  return lines.flatMap((line) => {
    const [date, raw, extra] = line.split(",");
    if (!validDate(date) || extra !== undefined || raw === undefined) throw new Error("invalid FRED observation row");
    return raw.trim() === "." || raw.trim() === "" ? [] : [[date, sourceNumber(raw)]];
  });
}

export function parseWorldBank(json, isos, indicator) {
  const [meta, rows] = json ?? [];
  if (!meta || Number(meta.pages) !== 1 || !Array.isArray(rows) || Number(meta.total) !== rows.length) throw new Error("incomplete World Bank response");
  return rows.filter((row) => {
    if (!isos.includes(row.countryiso3code) || row.indicator?.id !== indicator || !/^\d{4}$/.test(row.date)) throw new Error("World Bank identity/date mismatch");
    if (row.value != null) sourceNumber(row.value);
    return row.value != null && row.date >= "2000";
  }).map((row) => ({ ...row, value: sourceNumber(row.value) })).sort((a, b) => a.date.localeCompare(b.date));
}

function eiaRows(json, frequency) {
  const response = json?.response;
  if (response?.frequency !== frequency || !Array.isArray(response.data) || Number(response.total) !== response.data.length) throw new Error("incomplete EIA response");
  return response.data;
}

export function parseEiaWeekly(json, series, unit, scale) {
  return eiaRows(json, "weekly").map((row) => {
    if (row.series !== series || row.units !== unit || !validDate(row.period)) throw new Error("EIA inventory identity/unit/date mismatch");
    return [row.period, sourceNumber(row.value) * scale];
  });
}

export function parseSteo(json, series, unit, now = Date.now()) {
  const month = new Date(now).toISOString().slice(0, 7);
  const rows = eiaRows(json, "monthly").map((row) => {
    if (row.seriesId !== series || row.unit?.toLowerCase() !== unit || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)) throw new Error("EIA STEO identity/unit/period mismatch");
    const value = sourceNumber(row.value);
    if (value <= 0) throw new Error("invalid STEO price");
    return { month: row.period, value };
  }).filter((row) => row.month > month).sort((a, b) => a.month.localeCompare(b.month));
  if (rows.length < 6) throw new Error("STEO horizon shorter than six complete future months");
  let expected = new Date(`${month}-01T00:00:00Z`);
  return rows.map((row) => {
    expected = new Date(Date.UTC(expected.getUTCFullYear(), expected.getUTCMonth() + 1, 1));
    if (row.month !== expected.toISOString().slice(0, 7)) throw new Error("STEO horizon has missing or duplicate months");
    const periodEnd = new Date(Date.UTC(expected.getUTCFullYear(), expected.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    return [periodEnd, row.value];
  });
}

/** Dropping an expired month must not rejuvenate unchanged forecasts. */
export function steoContentUpdatedAt(points, previous, retrievedAt) {
  if (previous?.kind !== "external" || previous.source !== "EIA STEO") return retrievedAt;
  const prior = new Map(previous.points.map(([date, value]) => [date.slice(0, 7), value]));
  const changed = points.some(([date, value]) => !prior.has(date.slice(0, 7)) || Math.abs(prior.get(date.slice(0, 7)) - value) > 1e-8);
  return changed ? retrievedAt : previous.contentUpdatedAt ?? previous.retrievedAt;
}

export function annualBrent(points, now = Date.now()) {
  const currentYear = new Date(now).getUTCFullYear();
  const years = new Map();
  for (const [date, value] of points) {
    const year = Number(date.slice(0, 4));
    if (year < 2000 || year >= currentYear) continue;
    const rows = years.get(year) ?? [];
    rows.push([date, value]); years.set(year, rows);
  }
  const result = [...years].sort(([a], [b]) => a - b).map(([year, rows]) => {
    if (rows.length < 200 || new Set(rows.map(([date]) => date.slice(0, 7))).size !== 12 || rows.some(([, v]) => v <= 0)) return null;
    return [String(year), rows.reduce((sum, [, value]) => sum + value, 0) / rows.length];
  }).filter((row) => row !== null);
  if (result.length < 13 || result.at(-1)[0] !== String(currentYear - 1)) throw new Error("Brent annual history incomplete or overdue");
  return result;
}
