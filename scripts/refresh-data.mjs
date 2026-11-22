/**
 * NexusQ data refresh pipeline.
 * Pulls free public series (FRED keyless CSV, Yahoo Finance chart API, World Bank API)
 * and writes snapshot JSON to public/data/. Run locally or via GitHub Actions cron:
 *   node --import tsx scripts/refresh-data.mjs
 */
import { writeFile, mkdir, mkdtemp, readdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { get } from "./lib/http.mjs";
import { readJson, publishSnapshot } from "./lib/snapshot.mjs";
import { modelFan, validateForecastPoints } from "./lib/forecast.mjs";
import { fetchGdpForecasts } from "./lib/gdp-forecasts.mjs";
import { externalForecastCurrent } from "../src/lib/forecast.ts";
import { yahooChart, parseYahooDaily } from "./lib/yahoo.mjs";
import { assessSeries, validatePoints, sourcePolicy } from "../src/lib/quality.ts";
import path from "node:path";
import { parseFred, parseWorldBank, parseEiaWeekly, parseSteo, steoContentUpdatedAt, annualBrent, sourceNumber } from "./lib/source-data.mjs";

const LIVE_DIR = path.resolve(process.env.NEXUSQ_DATA_DIR ?? "public/data");
const OUT_DIR = await mkdtemp(path.join(tmpdir(), "nexusq-refresh-"));
const GENERATED = new Date().toISOString();
const enrichmentIssues = [];
const DAILY_START = "2013-01-01"; // trim daily series to keep payloads small

// ---- catalog ---------------------------------------------------------------
// category: energy | commodity | equity | macro | fx | renewables
const FRED = [
  { id: "BRENT", fred: "DCOILBRENTEU", name: "Brent crude", unit: "USD/bbl", category: "energy" },
  { id: "WTI", fred: "DCOILWTICO", name: "WTI crude", unit: "USD/bbl", category: "energy" },
  { id: "HENRYHUB", fred: "DHHNGSP", name: "Henry Hub natural gas", unit: "USD/MMBtu", category: "energy" },
  { id: "EUGAS", fred: "PNGASEUUSDM", name: "European natural gas (monthly IMF benchmark)", unit: "USD/MMBtu", category: "energy" },
  { id: "COAL", fred: "PCOALAUUSDM", name: "Australian coal (monthly IMF benchmark)", unit: "USD/tonne", category: "energy" },
  // NOTE: EIA weekly inventory series were removed from FRED; Inventory Divergence
  // signals need the EIA v2 API (free key) — add via env var EIA_API_KEY later.
  { id: "COPPER", fred: "PCOPPUSDM", name: "Copper", unit: "USD/tonne", category: "commodity" },
  { id: "WHEAT", fred: "PWHEAMTUSDM", name: "Wheat", unit: "USD/tonne", category: "commodity" },
  { id: "SP500", fred: "SP500", name: "S&P 500", unit: "index", category: "equity" },
  { id: "NASDAQ", fred: "NASDAQCOM", name: "Nasdaq Composite", unit: "index", category: "equity" },
  { id: "VIX", fred: "VIXCLS", name: "VIX", unit: "pts", category: "macro" },
  { id: "UST10Y", fred: "DGS10", name: "US 10Y Treasury yield", unit: "%", category: "macro" },
  { id: "BREAKEVEN10Y", fred: "T10YIE", name: "10Y inflation breakeven", unit: "%", category: "macro" },
  { id: "CPI", fred: "CPIAUCSL", name: "US CPI (all items)", unit: "index", category: "macro" },
  { id: "INDPRO", fred: "INDPRO", name: "US industrial production", unit: "index", category: "macro" },
  { id: "DXY", fred: "DTWEXBGS", name: "US dollar index (broad)", unit: "index", category: "fx" },
  { id: "EURUSD", fred: "DEXUSEU", name: "USD per EUR", unit: "USD/EUR", category: "fx" },
];

const YAHOO = [
  { id: "XLE", sym: "XLE", name: "Energy equities (XLE)", unit: "USD/share", category: "equity" },
  { id: "ICLN", sym: "ICLN", name: "Global clean energy (ICLN)", unit: "USD/share", category: "renewables" },
  { id: "TAN", sym: "TAN", name: "Solar (TAN)", unit: "USD/share", category: "renewables" },
  { id: "GOLD", sym: "GLD", name: "Gold (GLD)", unit: "USD/share", category: "commodity" },
];

const WORLDBANK = [
  { id: "GDP_USA", iso: "USA", name: "US GDP growth", category: "macro" },
  { id: "GDP_CHN", iso: "CHN", name: "China GDP growth", category: "macro" },
  { id: "GDP_IND", iso: "IND", name: "India GDP growth", category: "macro" },
  { id: "GDP_DEU", iso: "DEU", name: "Germany GDP growth", category: "macro" },
];

// ---- CFTC COT positioning (keyless Socrata API) ------------------------------
// Managed-money net position + open interest, weekly. Brent uses the NYMEX
// Last Day contract — the outright ICE Brent COT is not in the CFTC dataset,
// so Brent positioning is a thin-venue proxy (percentile vs own history only).
const COT_MARKETS = [
  { id: "WTI", code: "067651", label: "WTI (NYMEX)" },
  { id: "HENRYHUB", code: "023651", label: "Henry Hub (NYMEX)" },
  { id: "BRENT", code: "06765T", label: "Brent (NYMEX Last Day — thin venue proxy)" },
];

// ---- impact universe (Energy Beta board + sovereign exposure) ---------------
// Energy-sensitive equities across the transmission channels from the Nexus docs:
// producers benefit from energy strength, consumers (airlines, chemicals, steel)
// are squeezed by it, transition names trade on rates + energy policy.
const COMPANIES = [
  { id: "XOM", sym: "XOM", name: "ExxonMobil", sector: "Oil major" },
  { id: "CVX", sym: "CVX", name: "Chevron", sector: "Oil major" },
  { id: "SHEL", sym: "SHEL", name: "Shell", sector: "Oil major" },
  { id: "TTE", sym: "TTE", name: "TotalEnergies", sector: "Oil major" },
  { id: "BP", sym: "BP", name: "BP", sector: "Oil major" },
  { id: "SLB", sym: "SLB", name: "SLB (Schlumberger)", sector: "Oil services" },
  { id: "HAL", sym: "HAL", name: "Halliburton", sector: "Oil services" },
  { id: "MT", sym: "MT", name: "ArcelorMittal", sector: "Steel" },
  { id: "LYB", sym: "LYB", name: "LyondellBasell", sector: "Chemicals" },
  { id: "DOW", sym: "DOW", name: "Dow", sector: "Chemicals" },
  { id: "DAL", sym: "DAL", name: "Delta Air Lines", sector: "Airline" },
  { id: "UAL", sym: "UAL", name: "United Airlines", sector: "Airline" },
  { id: "TSLA", sym: "TSLA", name: "Tesla", sector: "EV / battery" },
  { id: "FSLR", sym: "FSLR", name: "First Solar", sector: "Solar" },
  { id: "NEE", sym: "NEE", name: "NextEra Energy", sector: "Utility / renewables" },
];

// Major energy exporters and importers for the sovereign GDP-sensitivity view.
const COUNTRIES = [
  { iso: "SAU", name: "Saudi Arabia", role: "exporter" },
  { iso: "RUS", name: "Russia", role: "exporter" },
  { iso: "NOR", name: "Norway", role: "exporter" },
  { iso: "CAN", name: "Canada", role: "exporter" },
  { iso: "ARE", name: "United Arab Emirates", role: "exporter" },
  { iso: "NGA", name: "Nigeria", role: "exporter" },
  { iso: "CHN", name: "China", role: "importer" },
  { iso: "IND", name: "India", role: "importer" },
  { iso: "JPN", name: "Japan", role: "importer" },
  { iso: "DEU", name: "Germany", role: "importer" },
  { iso: "KOR", name: "South Korea", role: "importer" },
  { iso: "TUR", name: "Türkiye", role: "importer" },
  { iso: "USA", name: "United States", role: "balanced" },
];

// ---- fetchers --------------------------------------------------------------
async function fetchFred(s) {
  const csv = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${s.fred}`, false);
  const points = parseFred(csv, s.fred);
  // trim long daily histories; keep monthly/weekly from 2000
  const cutoff = points.length > 4000 ? DAILY_START : "2000-01-01";
  return points.filter(([d]) => d >= cutoff);
}

async function fetchYahoo(s) {
  return parseYahooDaily(await yahooChart(s.sym), Date.now(), s.sym);
}

function buildWorldBankUrl(countryOrIso, indicator) {
  const iso = String(countryOrIso).trim().toUpperCase();
  const ind = String(indicator).trim();
  // Guard against accidentally shipping unresolved template placeholders.
  if (!iso || iso.includes("${") || ind.includes("${")) {
    throw new Error(`invalid World Bank request params: iso='${iso}', indicator='${ind}'`);
  }
  if (!/^[A-Z0-9]{3}(;[A-Z0-9]{3})*$/.test(iso)) {
    throw new Error(`invalid World Bank ISO code '${iso}'`);
  }
  const base = `https://api.worldbank.org/v2/country/${encodeURIComponent(iso)}/indicator/${encodeURIComponent(ind)}`;
  return `${base}?format=json&per_page=5000`;
}

let worldBankCore;
async function fetchWorldBank(s) {
  worldBankCore ??= get(buildWorldBankUrl(WORLDBANK.map((item) => item.iso).join(";"), "NY.GDP.MKTP.KD.ZG"), true, { retries: 2, timeout: 15000 });
  const j = await worldBankCore;
  return parseWorldBank(j, WORLDBANK.map((item) => item.iso), "NY.GDP.MKTP.KD.ZG")
    .filter((row) => row.countryiso3code === s.iso)
    .map((row) => [`${row.date}-12-31`, row.value]);
}

// ---- EIA weekly fundamentals (requires EIA_API_KEY, like STEO) ---------------
// New catalog series (category "fundamentals"): overlayable, QC'd, freshness-badged.
const EIA_WEEKLY = [
  {
    id: "USCRUDESTOCKS", name: "US crude inventories (ex-SPR)", unit: "million bbl",
    category: "fundamentals",
    route: "petroleum/stoc/wstk", series: "WCESTUS1", sourceUnit: "MBBL", scale: 1 / 1000, // kbbl → million bbl
  },
  {
    id: "USGASSTORAGE", name: "US natural gas storage (Lower 48)", unit: "Bcf",
    category: "fundamentals",
    route: "natural-gas/stor/wkly", series: "NW2_EPG0_SWO_R48_BCF", sourceUnit: "BCF", scale: 1,
  },
];

async function fetchEiaWeekly(s) {
  const j = await get(
    `https://api.eia.gov/v2/${s.route}/data/?api_key=${process.env.EIA_API_KEY}` +
    `&frequency=weekly&data[0]=value&facets[series][]=${s.series}` +
    `&start=2014-01-01&sort[0][column]=period&sort[0][direction]=asc&length=5000`,
    true
  );
  return parseEiaWeekly(j, s.series, s.sourceUnit, s.scale);
}

// ---- main ------------------------------------------------------------------
try {
await mkdir(LIVE_DIR, { recursive: true });
for (const name of (await readdir(LIVE_DIR)).filter((n) => n.endsWith(".json"))) {
  await copyFile(path.join(LIVE_DIR, name), path.join(OUT_DIR, name));
}
const catalog = [], failures = [];
const written = new Map();
const jobs = [
  ...FRED.map((s) => ({ ...s, source: "FRED", sourceUrl: `https://fred.stlouisfed.org/series/${s.fred}`, fetcher: () => fetchFred(s) })),
  ...YAHOO.map((s) => ({ ...s, source: "Yahoo Finance", sourceUrl: `https://finance.yahoo.com/quote/${s.sym}/`, fetcher: () => fetchYahoo(s) })),
  ...WORLDBANK.map((s) => ({ ...s, unit: "% y/y", source: "World Bank", sourceUrl: buildWorldBankUrl(s.iso, "NY.GDP.MKTP.KD.ZG"), fetcher: () => fetchWorldBank(s) })),
  ...EIA_WEEKLY.map((s) => ({ ...s, source: "EIA", sourceUrl: `https://www.eia.gov/opendata/browser/${s.route}`, fetcher: () => {
    if (!process.env.EIA_API_KEY) throw new Error("EIA credential unavailable; preserving prior observations");
    return fetchEiaWeekly(s);
  } })),
];
const quality = { generated: GENERATED, series: {}, summary: { ok: 0, flagged: 0, failed: [] } };
let succeeded = 0, coreSucceeded = 0;
const coreJobs = jobs.filter((job) => ["FRED", "Yahoo Finance"].includes(job.source));
for (const job of jobs) {
  const previous = await readJson(OUT_DIR, `${job.id}.json`);
  let series, errorMessage = null;
  try {
    const fetched = await job.fetcher();
    const points = Array.isArray(fetched) ? fetched : fetched.points;
    validatePoints(points, { previous: previous?.points });
    if (!Array.isArray(fetched)) validatePoints(fetched.adjustedPoints, { previous: previous?.adjustedPoints });
    series = { id: job.id, name: job.name, unit: job.unit, category: job.category,
      source: job.source, sourceUrl: job.sourceUrl, cadence: sourcePolicy(job.id).cadence,
      lastUpdated: points.at(-1)[0], checkedAt: GENERATED, retrievedAt: GENERATED,
      ...(Array.isArray(fetched) ? {} : fetched), points };
    succeeded++;
    if (["FRED", "Yahoo Finance"].includes(job.source)) coreSucceeded++;
  } catch (error) {
    errorMessage = error.message;
    failures.push(`${job.id}: ${errorMessage}`);
    quality.summary.failed.push(job.id);
    if (previous) { validatePoints(previous.points); series = { ...previous, checkedAt: GENERATED }; }
    console.error(`RETAIN ${job.id}: ${errorMessage}`);
  }
  if (!series) {
    quality.series[job.id] = { cadence: sourcePolicy(job.id).cadence, staleDays: null, flags: [{ code: "unavailable", detail: errorMessage }] };
    continue;
  }
  const assessment = assessSeries(job.id, series.points);
  if (series.adjustedPoints) assessment.flags.push(...assessSeries(job.id, series.adjustedPoints).flags.map((flag) => ({ code: `adjusted-${flag.code}`, detail: `Adjusted closes: ${flag.detail}` })));
  if (errorMessage) assessment.flags.push({ code: "refresh-failed", detail: errorMessage });
  quality.series[job.id] = assessment;
  if (assessment.flags.length) quality.summary.flagged++; else quality.summary.ok++;
  await writeFile(path.join(OUT_DIR, `${job.id}.json`), JSON.stringify(series));
  written.set(job.id, series.points);
  const { points, adjustedPoints: _adjustedPoints, ...metadata } = series;
  catalog.push({ ...metadata, count: points.length });
  console.log(`${errorMessage ? "kept" : "ok  "} ${job.id.padEnd(14)} ${String(points.length).padStart(5)} pts (${series.lastUpdated})`);
}
if (coreSucceeded < coreJobs.length * 0.8 || catalog.length !== jobs.length) {
  throw new Error(`Refresh rejected: ${coreSucceeded}/${coreJobs.length} market series fetched; ${succeeded}/${jobs.length} overall; ${catalog.length}/${jobs.length} available. Published snapshot untouched.`);
}
await writeFile(path.join(OUT_DIR, "catalog.json"), JSON.stringify({ generated: GENERATED, series: catalog }, null, 2));
await writeFile(path.join(OUT_DIR, "quality.json"), JSON.stringify(quality));
console.log(`QC: ${quality.summary.ok} within policy, ${quality.summary.flagged} require review; ${failures.length} fetch failures`);

// ---- forecasts ---------------------------------------------------------------
// Layer 2 (model): damped-drift + EWMA-volatility fan, P10/P25/P50/P75/P90.
// Deliberately transparent statistics, no black box: the uncertainty band is the
// product, not the point estimate. Committed daily by the cron → the git history
// doubles as the forecast-vs-outcome record.
const forecasts = {};
const previousForecasts = await readJson(OUT_DIR, "forecasts.json");
for (const [id, points] of written) {
  if (id.startsWith("GDP_") || sourcePolicy(id).cadence === "weekly" || quality.series[id]?.flags.length) continue; // annual — IMF WEO covers these below
  const fan = modelFan(points, id);
  if (fan) {
    forecasts[id] = {
      kind: "model",
      issuedAt: GENERATED,
      asOf: points.at(-1)[0],
      method: "damped-drift + EWMA-volatility fan (P10–P90)",
      points: fan,
    };
  }
}

// Layer 1: IMF-authored forecasts delivered by World Bank Data360. Both the
// query API and the independent bulk-file host are public and require no key.
try {
  const batch = await fetchGdpForecasts(WORLDBANK, { now: Date.parse(GENERATED), previous: previousForecasts?.series });
  for (const { id } of WORLDBANK) {
    if (quality.series[id]?.flags.length) continue;
    const lastActual = written.get(id)?.at(-1)?.[0];
    const forecast = batch[id];
    forecast.points = forecast.points.filter(([date]) => date > lastActual);
    validateForecastPoints(forecast.points);
    forecasts[id] = forecast;
  }
  console.log("ok   IMF WEO GDP projections via World Bank Data360");
} catch (err) {
  enrichmentIssues.push({ source: "GDP forecasts (World Bank Data360)", detail: err.message });
  console.error(`FAIL GDP forecasts: ${err.message}`);
}

// Layer 1b (optional): EIA Short-Term Energy Outlook — the reference forecast for
// Brent / WTI / Henry Hub. Needs a free key: https://www.eia.gov/opendata/register.php
if (process.env.EIA_API_KEY) {
  const STEO = [
    ["BRENT", "BREPUUS", "dollars per barrel"],
    ["WTI", "WTIPUUS", "dollars per barrel"],
    ["HENRYHUB", "NGHHUUS", "dollars per million btu"],
  ];
  const today = new Date().toISOString().slice(0, 7);
  for (const [id, sid, unit] of STEO) {
    if (quality.series[id]?.flags.length) continue;
    try {
      const j = await get(
        `https://api.eia.gov/v2/steo/data/?api_key=${process.env.EIA_API_KEY}&frequency=monthly&data[0]=value&facets[seriesId][]=${sid}&start=${today}&sort[0][column]=period&sort[0][direction]=asc`,
        true
      );
      const pts = parseSteo(j, sid, unit, Date.parse(GENERATED));
      const forecast = { kind: "external", source: "EIA STEO", retrievedAt: GENERATED,
        contentUpdatedAt: steoContentUpdatedAt(pts, previousForecasts?.series[id], GENERATED),
        sourceUrl: "https://www.eia.gov/outlooks/steo/", points: pts,
        periodBasis: "Monthly average spot-price forecasts for complete future months, plotted at month end. Not end-of-month or intraday price targets. The API does not supply a release vintage; unchanged content expires after 45 days." };
      if (!externalForecastCurrent(forecast, Date.parse(GENERATED))) throw new Error("STEO content unchanged for over 45 days; model fallback retained");
      forecasts[id] = forecast;
    } catch (err) {
      enrichmentIssues.push({ source: `EIA STEO ${id}`, detail: err.message });
      console.error(`FAIL EIA STEO ${id}: ${err.message}`);
    }
  }
  console.log("ok   EIA STEO forecasts");
} else {
  console.log("skip EIA STEO (no EIA_API_KEY set — model fans cover BRENT/WTI/HENRYHUB)");
}

for (const [id, old] of Object.entries(previousForecasts?.series ?? {})) {
  if (old.kind === "external" && forecasts[id]?.kind !== "external" && !quality.series[id]?.flags.length) {
    const retrievedAt = old.retrievedAt ?? previousForecasts.generated;
    if (externalForecastCurrent({ ...old, retrievedAt }) && old.points.some(([date]) => date > GENERATED.slice(0, 10))) forecasts[id] = { ...old, retrievedAt, retained: true };
  }
}
await writeFile(path.join(OUT_DIR, "forecasts.json"), JSON.stringify({ generated: new Date().toISOString(), series: forecasts }));
console.log(`ok   forecasts.json (${Object.keys(forecasts).length} series)`);

// ---- impact.json (Energy Beta board + sovereign exposure) --------------------
async function fetchWorldBankIndicator(iso, indicator) {
  // Gentle profile: World Bank is a flaky SECONDARY source and never fails the run.
  // Bound the worst case so a WB outage can't stall the whole job on retries
  // (2 × 15s across ~40 country calls ≈ a few minutes cap, not ~an hour).
  const j = await get(
    buildWorldBankUrl(iso, indicator),
    true,
    { retries: 2, timeout: 15000 }
  );
  return parseWorldBank(j, iso.split(";"), indicator);
}

const previousImpact = await readJson(OUT_DIR, "impact.json");
const impact = { generated: new Date().toISOString(), companies: [], countries: [] };

for (const c of COMPANIES) {
  try {
    const fetched = await fetchYahoo(c);
    const { points, adjustedPoints } = fetched;
    const previous = previousImpact?.companies.find((item) => item.id === c.id);
    validatePoints(points, { previous: previous?.points, minPoints: 200 });
    validatePoints(adjustedPoints, { previous: previous?.adjustedPoints, minPoints: 200 });
    if (points.length < 200) throw new Error(`only ${points.length} points`);
    impact.companies.push({
      id: c.id, name: c.name, sector: c.sector, unit: "USD/share",
      source: "Yahoo Finance", lastUpdated: points[points.length - 1][0], checkedAt: GENERATED, retrievedAt: GENERATED, ...fetched,
      quality: { ...assessSeries(c.id, points), flags: [...assessSeries(c.id, points).flags, ...assessSeries(c.id, adjustedPoints).flags.map((flag) => ({ code: `adjusted-${flag.code}`, detail: `Adjusted closes: ${flag.detail}` }))] },
    });
    console.log(`ok   impact ${c.id.padEnd(6)} ${String(points.length).padStart(5)} pts`);
  } catch (err) {
    enrichmentIssues.push({ source: `Yahoo ${c.id}`, detail: err.message });
    const previous = previousImpact?.companies.find((item) => item.id === c.id);
    if (previous) impact.companies.push({ ...previous, refreshFailed: true, checkedAt: GENERATED });
    console.error(`FAIL impact ${c.id}: ${err.message}`);
  }
}

const indicatorIds = ["NY.GDP.MKTP.KD.ZG", "TX.VAL.FUEL.ZS.UN", "EG.IMP.CONS.ZS"];
const countriesBatch = COUNTRIES.map((c) => c.iso).join(";");
const countryResults = await Promise.allSettled(indicatorIds.map((id) => fetchWorldBankIndicator(countriesBatch, id)));
for (let i = 0; i < countryResults.length; i++) {
  if (countryResults[i].status === "rejected") enrichmentIssues.push({ source: `World Bank ${indicatorIds[i]}`, detail: "batch unavailable; prior country values retained where necessary" });
}
for (const c of COUNTRIES) {
  try {
    const rowsFor = (index) => {
      const result = countryResults[index];
      if (result.status === "rejected") throw result.reason;
      return result.value.filter((r) => r.countryiso3code === c.iso);
    };
    const gdpRows = rowsFor(0);
    const gdp = gdpRows.map((r) => [`${r.date}-12-31`, r.value]);
    const previous = previousImpact?.countries.find((item) => item.iso === c.iso);
    validatePoints(gdp, { previous: previous?.gdp, minPoints: 12 });
    const lastOf = (rows) => rows.length ? { value: rows.at(-1).value, year: rows.at(-1).date } : null;
    impact.countries.push({ ...c, gdp, retrievedAt: GENERATED,
      fuelExports: lastOf(rowsFor(1)), energyImports: lastOf(rowsFor(2)),
    });
    console.log(`ok   impact ${c.iso} GDP ${gdp.length} yrs`);
  } catch (error) {
    const previous = previousImpact?.countries.find((item) => item.iso === c.iso);
    if (previous) impact.countries.push({ ...previous, retained: true });
    enrichmentIssues.push({ source: `World Bank ${c.iso}`, detail: "Prior country data retained" });
    console.error(`RETAIN impact ${c.iso}: ${error.message}`);
  }
}

// impact.json is a SECONDARY enrichment (Energy Beta board + sovereign betas) built on
// occasionally-flaky sources (World Bank annual data especially). It must never fail the
// run or block the commit of the freshly-refreshed core series: on any shortfall we skip
// the rewrite, keep the last good committed impact.json, and continue with exit 0.
try {
  if (impact.companies.length !== COMPANIES.length || impact.countries.length !== COUNTRIES.length) {
    throw new Error(`coverage ${impact.companies.length}/${COMPANIES.length} companies, ${impact.countries.length}/${COUNTRIES.length} countries; complete coverage required`);
  }
  // Long-history annual oil averages for the sovereign GDP regression (needs 2000+, which
  // the trimmed daily snapshots can't provide). Use full-history FRED Brent only; an outage must never substitute a different instrument.
  try {
    const csv = await get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU", false);
    const dailyOil = parseFred(csv, "DCOILBRENTEU");
    impact.oilAnnual = annualBrent(dailyOil, Date.parse(GENERATED));
    const validYears = new Set(impact.oilAnnual.map(([year]) => year));
    impact.oilAnnualExcludedYears = [...new Set(dailyOil.map(([date]) => date.slice(0, 4)))].filter((year) => year >= "2000" && year < GENERATED.slice(0, 4) && !validYears.has(year));
    impact.oilAnnualValidated = true;
    impact.oilAnnualSource = "Brent (FRED), annual averages";
  } catch {
    if (!previousImpact?.oilAnnualSource?.startsWith("Brent (FRED)") || !previousImpact.oilAnnualValidated) throw new Error("Brent annual coverage unavailable; unverified annual averages withheld");
    impact.oilAnnual = previousImpact.oilAnnual;
    impact.oilAnnualSource = previousImpact.oilAnnualSource;
    impact.oilAnnualValidated = true;
    impact.oilAnnualExcludedYears = previousImpact.oilAnnualExcludedYears;
    enrichmentIssues.push({ source: "Brent annual history", detail: "retained prior Brent observations" });
  }
  // World GDP growth: the global-cycle control for the sovereign oil-beta regression.
  const wldRows = await fetchWorldBankIndicator("WLD", "NY.GDP.MKTP.KD.ZG");
  if (!wldRows.length) throw new Error("world GDP control unavailable");
  impact.worldGdp = wldRows.map((r) => [`${r.date}-12-31`, r.value]);
  validatePoints(impact.worldGdp, { previous: previousImpact?.worldGdp, minPoints: 12 });

  await writeFile(path.join(OUT_DIR, "impact.json"), JSON.stringify(impact));
  console.log(`ok   impact.json (${impact.companies.length} companies, ${impact.countries.length} countries)`);
} catch (err) {
  enrichmentIssues.push({ source: "Impact", detail: err.message });
  console.error(`SKIP impact.json (${err.message}) — keeping last good file. Secondary enrichment; NOT fatal to the refresh.`);
}

// ---- cot.json (CFTC managed-money positioning, keyless) ----------------------
async function fetchCot(code) {
  const rows = await get(
    "https://publicreporting.cftc.gov/resource/72hh-3qpy.json?" +
    `cftc_contract_market_code=${encodeURIComponent(code)}` +
    "&%24select=cftc_contract_market_code,report_date_as_yyyy_mm_dd,open_interest_all,m_money_positions_long_all,m_money_positions_short_all" +
    "&%24order=report_date_as_yyyy_mm_dd%20ASC&%24limit=3000",
    true
  );
  if (!Array.isArray(rows) || rows.some((r) => r.cftc_contract_market_code !== code || sourceNumber(r.m_money_positions_long_all) < 0 || sourceNumber(r.m_money_positions_short_all) < 0 || sourceNumber(r.m_money_positions_long_all) > sourceNumber(r.open_interest_all) || sourceNumber(r.m_money_positions_short_all) > sourceNumber(r.open_interest_all))) throw new Error("CFTC contract identity/position mismatch");
  return rows
    .map((r) => [
      r.report_date_as_yyyy_mm_dd.slice(0, 10),
      sourceNumber(r.m_money_positions_long_all) - sourceNumber(r.m_money_positions_short_all),
      sourceNumber(r.open_interest_all),
    ])
    .filter((p) => p[0] >= "2010-01-01" && Number.isFinite(p[1]) && Number.isFinite(p[2]) && p[2] > 0);
}

const previousCot = await readJson(OUT_DIR, "cot.json");
const cot = { generated: new Date().toISOString(), source: "CFTC Commitments of Traders (disaggregated, futures only)", markets: {} };
for (const m of COT_MARKETS) {
  try {
    const points = await fetchCot(m.code);
    validatePoints(points.map(([d, net]) => [d, net]), { previous: previousCot?.markets[m.id]?.points.map(([d, net]) => [d, net]), minPoints: 100 });
    if (points.some(([, net, oi]) => Math.abs(net) > oi)) throw new Error("COT net position exceeds open interest");
    cot.markets[m.id] = { label: m.label, code: m.code, lastUpdated: points[points.length - 1][0], checkedAt: GENERATED, retrievedAt: GENERATED, points };
    console.log(`ok   cot ${m.id.padEnd(10)} ${String(points.length).padStart(4)} wks  (${points[points.length - 1][0]})`);
  } catch (err) {
    enrichmentIssues.push({ source: `CFTC ${m.id}`, detail: err.message });
    if (previousCot?.markets[m.id]) cot.markets[m.id] = { ...previousCot.markets[m.id], refreshFailed: true };
    console.error(`FAIL cot ${m.id}: ${err.message}`);
  }
}
// cot.json is also secondary enrichment (Market State positioning) — skip-and-keep on
// shortfall, never fail the run.
if (Object.keys(cot.markets).length === COT_MARKETS.length) {
  await writeFile(path.join(OUT_DIR, "cot.json"), JSON.stringify(cot));
  console.log(`ok   cot.json (${Object.keys(cot.markets).length} markets)`);
} else {
  console.error("SKIP cot.json: fewer than 2 markets fetched — keeping last good file. Secondary enrichment; NOT fatal.");
}

// NexSI is a separately versioned enrichment. A failed refresh keeps its last
// published observations with a visible failure; it cannot take core data down.
try {
  const { refreshNexsi } = await import("./refresh-nexsi.mjs");
  const nexsi = await refreshNexsi(OUT_DIR, GENERATED);
  if (nexsi.status !== "ok") enrichmentIssues.push({ source: "NexSI", detail: `${nexsi.failures.length} source issues; see per-company coverage and evidence status` });
} catch (error) {
  enrichmentIssues.push({ source: "NexSI", detail: error.message });
  const prior = await readJson(OUT_DIR, "nexsi.json");
  if (prior) await writeFile(path.join(OUT_DIR, "nexsi.json"), JSON.stringify({ ...prior, attemptedAt: GENERATED, status: "retained", failures: [...prior.failures, error.message] }));
}

const { refreshFx } = await import('./lib/fx.mjs');
const fx = await refreshFx(await readJson(OUT_DIR, 'fx.json'), GENERATED);
await writeFile(path.join(OUT_DIR, 'fx.json'), JSON.stringify(fx));
if (fx.status !== 'available') enrichmentIssues.push({source:'Norges Bank USD/NOK',detail:fx.error});

await writeFile(path.join(OUT_DIR, "health.json"), JSON.stringify({
  generated: GENERATED, status: quality.summary.flagged || failures.length || enrichmentIssues.length ? "degraded" : "ok",
  coreFailures: failures, enrichmentIssues,
  note: "Source freshness is assessed separately from successful retrieval. No guarantee of real-time prices.",
}));
await publishSnapshot(OUT_DIR, LIVE_DIR);
console.log("Published validated snapshot and integrity manifest.");
} finally {
  const resolvedStage = path.resolve(OUT_DIR);
  if (path.dirname(resolvedStage) === path.resolve(tmpdir()) && path.basename(resolvedStage).startsWith("nexusq-refresh-")) await rm(resolvedStage, { recursive: true, force: true });
}
