/**
 * NexusQ data refresh pipeline.
 * Pulls free public series (FRED keyless CSV, Yahoo Finance chart API, World Bank API)
 * and writes snapshot JSON to public/data/. Run locally or via GitHub Actions cron:
 *   node scripts/refresh-data.mjs
 */
import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "public/data");
const DAILY_START = "2013-01-01"; // trim daily series to keep payloads small
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) NexusQ-data-refresh";

// ---- catalog ---------------------------------------------------------------
// category: energy | commodity | equity | macro | fx | renewables
const FRED = [
  { id: "BRENT", fred: "DCOILBRENTEU", name: "Brent crude", unit: "USD/bbl", category: "energy" },
  { id: "WTI", fred: "DCOILWTICO", name: "WTI crude", unit: "USD/bbl", category: "energy" },
  { id: "HENRYHUB", fred: "DHHNGSP", name: "Henry Hub natural gas", unit: "USD/MMBtu", category: "energy" },
  { id: "EUGAS", fred: "PNGASEUUSDM", name: "European natural gas (TTF)", unit: "USD/MMBtu", category: "energy" },
  { id: "COAL", fred: "PCOALAUUSDM", name: "Coal (Newcastle)", unit: "USD/tonne", category: "energy" },
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
async function get(url, asJson) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return asJson ? res.json() : res.text();
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

async function fetchFred(s) {
  const csv = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${s.fred}`, false);
  const lines = csv.trim().split("\n").slice(1);
  const points = [];
  for (const line of lines) {
    const [date, raw] = line.split(",");
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) continue;
    points.push([date, v]);
  }
  // trim long daily histories; keep monthly/weekly from 2000
  const cutoff = points.length > 4000 ? DAILY_START : "2000-01-01";
  return points.filter(([d]) => d >= cutoff);
}

async function fetchYahoo(s) {
  const j = await get(
    `https://query1.finance.yahoo.com/v8/finance/chart/${s.sym}?range=10y&interval=1d`,
    true
  );
  const r = j.chart.result[0];
  const ts = r.timestamp ?? [];
  const close = r.indicators.quote[0].close ?? [];
  const points = [];
  for (let i = 0; i < ts.length; i++) {
    const v = close[i];
    if (v == null || !Number.isFinite(v)) continue;
    points.push([new Date(ts[i] * 1000).toISOString().slice(0, 10), Math.round(v * 100) / 100]);
  }
  return points;
}

async function fetchWorldBank(s) {
  const j = await get(
    `https://api.worldbank.org/v2/country/${s.iso}/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=100`,
    true
  );
  return (j[1] ?? [])
    .filter((row) => row.value != null && row.date >= "2000")
    .map((row) => [`${row.date}-12-31`, Math.round(row.value * 100) / 100])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// ---- main ------------------------------------------------------------------
await mkdir(OUT_DIR, { recursive: true });
const catalog = [];
const failures = [];
const written = new Map(); // id -> points, reused by the forecast builder

const jobs = [
  ...FRED.map((s) => ({ ...s, source: "FRED", fetcher: () => fetchFred(s) })),
  ...YAHOO.map((s) => ({ ...s, source: "Yahoo Finance", fetcher: () => fetchYahoo(s) })),
  ...WORLDBANK.map((s) => ({
    ...s, unit: "% y/y", source: "World Bank", fetcher: () => fetchWorldBank(s),
  })),
];

const prevCounts = new Map(); // id -> point count before this refresh (for drift check)

for (const job of jobs) {
  try {
    try {
      const prev = JSON.parse(await readFile(path.join(OUT_DIR, `${job.id}.json`), "utf8"));
      prevCounts.set(job.id, prev.points.length);
    } catch { /* first run for this series */ }
    const points = await job.fetcher();
    if (points.length < 10) throw new Error(`only ${points.length} points`);
    const series = {
      id: job.id, name: job.name, unit: job.unit, category: job.category,
      source: job.source, lastUpdated: points[points.length - 1][0], points,
    };
    await writeFile(path.join(OUT_DIR, `${job.id}.json`), JSON.stringify(series));
    written.set(job.id, points);
    catalog.push({
      id: job.id, name: job.name, unit: job.unit, category: job.category,
      source: job.source, lastUpdated: series.lastUpdated, count: points.length,
    });
    console.log(`ok   ${job.id.padEnd(14)} ${String(points.length).padStart(5)} pts  (${series.lastUpdated})`);
  } catch (err) {
    failures.push(`${job.id}: ${err.message}`);
    console.error(`FAIL ${job.id}: ${err.message}`);
  }
}

// Guard: a mostly-failed run (e.g. one source down) must NOT regenerate the
// derived files — a degraded catalog/forecasts would replace good committed data.
if (catalog.length < jobs.length * 0.8) {
  console.error(`\nABORT: only ${catalog.length}/${jobs.length} series succeeded — leaving catalog.json/forecasts.json untouched.`);
  console.error(`Failures:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

await writeFile(path.join(OUT_DIR, "catalog.json"), JSON.stringify({ generated: new Date().toISOString(), series: catalog }, null, 2));
console.log(`\n${catalog.length}/${jobs.length} series written to public/data/`);
if (failures.length) console.error(`Partial failures:\n  ${failures.join("\n  ")}`);

// ---- data quality checks → quality.json ------------------------------------
// Automated per-series QC on every refresh. Flags surface in the UI: trust is
// built by reporting problems, not hiding them.
const SANITY = { // plausible latest-value ranges for key series (source-corruption tripwire)
  BRENT: [10, 400], WTI: [10, 400], HENRYHUB: [0.5, 60], EUGAS: [1, 200],
  COAL: [20, 600], COPPER: [2000, 40000], WHEAT: [50, 1500], VIX: [5, 100],
  UST10Y: [-1, 20], BREAKEVEN10Y: [-1, 10], EURUSD: [0.5, 2.5], SP500: [1000, 30000],
};

// Normal publication lags (days) that must NOT flag: IMF monthly series arrive ~2
// months behind; FRED's H.10 FX release batches ~10 days behind. A flag should mean
// "abnormal", or users learn to ignore the flags.
const STALE_OVERRIDES = { DXY: 16, EURUSD: 16 };

function qcSeries(id, points, prevCount) {
  const flags = [];
  const n = points.length;
  const gaps = [];
  for (let i = Math.max(1, n - 260); i < n; i++) {
    gaps.push((Date.parse(points[i][0]) - Date.parse(points[i - 1][0])) / 86400000);
  }
  const sorted = [...gaps].sort((a, b) => a - b);
  const cadenceDays = sorted[Math.floor(sorted.length / 2)] ?? 1;
  const cadence = cadenceDays < 4 ? "daily" : cadenceDays < 10 ? "weekly" : cadenceDays < 45 ? "monthly" : "annual";

  const staleDays = Math.round((Date.now() - Date.parse(points[n - 1][0])) / 86400000);
  const staleLimit = STALE_OVERRIDES[id] ?? { daily: 7, weekly: 21, monthly: 75, annual: 500 }[cadence];
  if (staleDays > staleLimit) flags.push({ code: "stale", detail: `last obs ${staleDays}d old (limit ${staleLimit}d for ${cadence})` });

  const maxGap = Math.max(...gaps);
  if (maxGap > Math.max(14, cadenceDays * 4)) flags.push({ code: "gap", detail: `${Math.round(maxGap)}d hole in recent history` });

  // spike check on the last few observations vs the series' own volatility
  const rs = [];
  const win = points.slice(-500);
  const useLog = win.every(([, v]) => v > 0);
  for (let i = 1; i < win.length; i++) {
    rs.push(useLog ? Math.log(win[i][1] / win[i - 1][1]) : win[i][1] - win[i - 1][1]);
  }
  const sd = Math.sqrt(rs.reduce((a, b) => a + b * b, 0) / rs.length) || 1;
  for (let i = rs.length - 5; i < rs.length; i++) {
    if (i >= 0 && Math.abs(rs[i]) > 5 * sd) {
      flags.push({ code: "spike", detail: `move of ${(rs[i] / sd).toFixed(1)}σ on ${win[i + 1][0]} — verify against source` });
      break;
    }
  }

  const range = SANITY[id];
  const last = points[n - 1][1];
  if (range && (last < range[0] || last > range[1])) {
    flags.push({ code: "range", detail: `latest ${last} outside plausible [${range[0]}, ${range[1]}]` });
  }

  if (prevCount != null && n < prevCount - 5) {
    flags.push({ code: "shrunk", detail: `history shrank ${prevCount} → ${n} points` });
  }

  return { cadence, staleDays, flags };
}

const quality = { generated: new Date().toISOString(), series: {}, summary: { ok: 0, flagged: 0, failed: [] } };
for (const entry of catalog) {
  const q = qcSeries(entry.id, written.get(entry.id), prevCounts.get(entry.id));
  quality.series[entry.id] = q;
  q.flags.length ? quality.summary.flagged++ : quality.summary.ok++;
}
for (const f of failures) {
  const id = f.split(":")[0];
  quality.summary.failed.push(id);
  quality.series[id] = { cadence: null, staleDays: null, flags: [{ code: "refresh-failed", detail: f }] };
}
await writeFile(path.join(OUT_DIR, "quality.json"), JSON.stringify(quality));
console.log(`ok   quality.json — ${quality.summary.ok} ok, ${quality.summary.flagged} flagged, ${quality.summary.failed.length} failed`);

// ---- forecasts ---------------------------------------------------------------
// Layer 2 (model): damped-drift + EWMA-volatility fan, P10/P25/P50/P75/P90.
// Deliberately transparent statistics, no black box: the uncertainty band is the
// product, not the point estimate. Committed daily by the cron → the git history
// doubles as the forecast-vs-outcome record.
const Z = { p10: -1.2816, p25: -0.6745, p50: 0, p75: 0.6745, p90: 1.2816 };

function modelFan(points) {
  const n = points.length;
  if (n < 60) return null;
  const gapDays = daysBetween(points[n - 21][0], points[n - 1][0]) / 20;
  const dailyish = gapDays < 4;
  const stepDays = dailyish ? 7 : 30;
  const steps = dailyish ? 13 : 6; // ~91 days / ~6 months horizon
  const window = points.slice(-(dailyish ? 756 : 120));
  const useLog = window.every(([, v]) => v > 0);
  const r = [];
  for (let i = 1; i < window.length; i++) {
    r.push(useLog ? Math.log(window[i][1] / window[i - 1][1]) : window[i][1] - window[i - 1][1]);
  }
  // EWMA variance (λ per observation) + half-weight ("damped") drift: long-run
  // mean blended 50/50 with the last quarter, then halved — conservative on purpose.
  const lambda = dailyish ? 0.97 : 0.9;
  let variance = r.reduce((a, b) => a + b * b, 0) / r.length;
  for (const x of r) variance = lambda * variance + (1 - lambda) * x * x;
  const sigma = Math.sqrt(variance);
  const meanAll = r.reduce((a, b) => a + b, 0) / r.length;
  const recent = r.slice(-63);
  const meanRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const mu = 0.5 * (0.5 * meanAll + 0.5 * meanRecent);
  const obsPerDay = r.length / Math.max(1, daysBetween(window[0][0], window[window.length - 1][0]));
  const [lastDate, s0] = points[n - 1];
  const out = [[lastDate, s0, s0, s0, s0, s0]];
  for (let k = 1; k <= steps; k++) {
    const t = k * stepDays * obsPerDay; // horizon in observation units
    const date = shiftDaysISO(lastDate, k * stepDays);
    const q = (z) => {
      const drift = mu * t + z * sigma * Math.sqrt(t);
      const v = useLog ? s0 * Math.exp(drift) : s0 + drift;
      return Math.round(v * 10000) / 10000;
    };
    out.push([date, q(Z.p10), q(Z.p25), q(Z.p50), q(Z.p75), q(Z.p90)]);
  }
  return out;
}

function daysBetween(a, b) {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
}
function shiftDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const forecasts = {};
for (const [id, points] of written) {
  if (id.startsWith("GDP_")) continue; // annual — IMF WEO covers these below
  const fan = modelFan(points);
  if (fan) {
    forecasts[id] = {
      kind: "model",
      method: "damped-drift + EWMA-volatility fan (P10–P90)",
      points: fan,
    };
  }
}

// Layer 1 (external, institutional): IMF WEO real-GDP-growth projections.
try {
  const imf = await get("https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH", true);
  const table = imf.values?.NGDP_RPCH ?? {};
  const nowYear = new Date().getUTCFullYear();
  for (const { id, iso } of WORLDBANK) {
    const byYear = table[iso];
    if (!byYear) continue;
    const lastActual = written.get(id)?.at(-1)?.[0]?.slice(0, 4) ?? String(nowYear - 1);
    const pts = Object.entries(byYear)
      .filter(([y, v]) => v != null && y > lastActual && Number(y) <= nowYear + 3)
      .map(([y, v]) => [`${y}-12-31`, Math.round(v * 100) / 100])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (pts.length) forecasts[id] = { kind: "external", source: "IMF WEO (real GDP growth)", points: pts };
  }
  console.log("ok   IMF WEO GDP projections");
} catch (err) {
  console.error(`FAIL IMF WEO: ${err.message}`);
}

// Layer 1b (optional): EIA Short-Term Energy Outlook — the reference forecast for
// Brent / WTI / Henry Hub. Needs a free key: https://www.eia.gov/opendata/register.php
if (process.env.EIA_API_KEY) {
  const STEO = [
    ["BRENT", "BREPUUS", "USD/bbl"],
    ["WTI", "WTIPUUS", "USD/bbl"],
    ["HENRYHUB", "NGHHUUS", "USD/MMBtu"],
  ];
  const today = new Date().toISOString().slice(0, 7);
  for (const [id, sid] of STEO) {
    try {
      const j = await get(
        `https://api.eia.gov/v2/steo/data/?api_key=${process.env.EIA_API_KEY}&frequency=monthly&data[0]=value&facets[seriesId][]=${sid}&start=${today}&sort[0][column]=period&sort[0][direction]=asc`,
        true
      );
      const pts = (j.response?.data ?? [])
        .filter((row) => row.value != null)
        .map((row) => [`${row.period}-15`, Math.round(row.value * 100) / 100]);
      if (pts.length) forecasts[id] = { kind: "external", source: "EIA STEO", points: pts };
    } catch (err) {
      console.error(`FAIL EIA STEO ${id}: ${err.message}`);
    }
  }
  console.log("ok   EIA STEO forecasts");
} else {
  console.log("skip EIA STEO (no EIA_API_KEY set — model fans cover BRENT/WTI/HENRYHUB)");
}

await writeFile(path.join(OUT_DIR, "forecasts.json"), JSON.stringify({ generated: new Date().toISOString(), series: forecasts }));
console.log(`ok   forecasts.json (${Object.keys(forecasts).length} series)`);

// ---- impact.json (Energy Beta board + sovereign exposure) --------------------
async function fetchWorldBankIndicator(iso, indicator) {
  const j = await get(
    `https://api.worldbank.org/v2/country/${iso}/indicator/${indicator}?format=json&per_page=100`,
    true
  );
  return (j[1] ?? [])
    .filter((row) => row.value != null && row.date >= "2000")
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

const impact = { generated: new Date().toISOString(), companies: [], countries: [] };

for (const c of COMPANIES) {
  try {
    const points = await fetchYahoo(c);
    if (points.length < 200) throw new Error(`only ${points.length} points`);
    impact.companies.push({
      id: c.id, name: c.name, sector: c.sector, unit: "USD/share",
      source: "Yahoo Finance", lastUpdated: points[points.length - 1][0], points,
    });
    console.log(`ok   impact ${c.id.padEnd(6)} ${String(points.length).padStart(5)} pts`);
  } catch (err) {
    console.error(`FAIL impact ${c.id}: ${err.message}`);
  }
}

for (const c of COUNTRIES) {
  try {
    const gdpRows = await fetchWorldBankIndicator(c.iso, "NY.GDP.MKTP.KD.ZG");
    const gdp = gdpRows.map((r) => [`${r.date}-12-31`, Math.round(r.value * 100) / 100]);
    // intensity metrics: latest non-null observation (coverage varies by country)
    const fuelRows = await fetchWorldBankIndicator(c.iso, "TX.VAL.FUEL.ZS.UN");
    const impRows = await fetchWorldBankIndicator(c.iso, "EG.IMP.CONS.ZS");
    const lastOf = (rows) => rows.length
      ? { value: Math.round(rows[rows.length - 1].value * 10) / 10, year: rows[rows.length - 1].date }
      : null;
    impact.countries.push({
      iso: c.iso, name: c.name, role: c.role, gdp,
      fuelExports: lastOf(fuelRows),   // % of merchandise exports
      energyImports: lastOf(impRows),  // net % of energy use (negative = net exporter)
    });
    console.log(`ok   impact ${c.iso}   GDP ${gdp.length} yrs, fuel-x ${lastOf(fuelRows)?.value ?? "—"}%, imp ${lastOf(impRows)?.value ?? "—"}%`);
  } catch (err) {
    console.error(`FAIL impact ${c.iso}: ${err.message}`);
  }
}

// Same guard as the main catalog: never overwrite a good impact.json with a stub.
if (impact.companies.length >= COMPANIES.length * 0.8 && impact.countries.length >= COUNTRIES.length * 0.8) {
  // Long-history annual oil averages for the sovereign GDP regression (needs 2000+,
// which the trimmed daily snapshots can't provide). Prefer full-history FRED Brent;
// fall back to Yahoo WTI futures (CL=F, monthly since 2000).
try {
  const csv = await get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU", false);
  const sums = new Map();
  for (const line of csv.trim().split("\n").slice(1)) {
    const [date, raw] = line.split(",");
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || date < "2000") continue;
    const y = date.slice(0, 4);
    const e = sums.get(y) ?? { s: 0, c: 0 };
    e.s += v; e.c++;
    sums.set(y, e);
  }
  impact.oilAnnual = [...sums].filter(([, e]) => e.c >= 120)
    .map(([y, e]) => [y, Math.round((e.s / e.c) * 100) / 100]).sort();
  impact.oilAnnualSource = "Brent (FRED), annual averages";
} catch {
  const j = await get("https://query1.finance.yahoo.com/v8/finance/chart/CL=F?range=max&interval=1mo", true);
  const r = j.chart.result[0];
  const sums = new Map();
  for (let i = 0; i < r.timestamp.length; i++) {
    const v = r.indicators.quote[0].close[i];
    if (v == null) continue;
    const y = new Date(r.timestamp[i] * 1000).toISOString().slice(0, 4);
    const e = sums.get(y) ?? { s: 0, c: 0 };
    e.s += v; e.c++;
    sums.set(y, e);
  }
  impact.oilAnnual = [...sums].filter(([, e]) => e.c >= 6)
    .map(([y, e]) => [y, Math.round((e.s / e.c) * 100) / 100]).sort();
  impact.oilAnnualSource = "WTI futures (CL=F), Yahoo Finance, annual averages";
}
// World GDP growth: the global-cycle control for the sovereign oil-beta regression.
const wldRows = await fetchWorldBankIndicator("WLD", "NY.GDP.MKTP.KD.ZG");
impact.worldGdp = wldRows.map((r) => [`${r.date}-12-31`, Math.round(r.value * 100) / 100]);

await writeFile(path.join(OUT_DIR, "impact.json"), JSON.stringify(impact));
  console.log(`ok   impact.json (${impact.companies.length} companies, ${impact.countries.length} countries)`);
} else {
  console.error(`ABORT impact.json: only ${impact.companies.length}/${COMPANIES.length} companies, ${impact.countries.length}/${COUNTRIES.length} countries — leaving existing file untouched.`);
  process.exitCode = 1;
}
