/**
 * NexusQ data refresh pipeline.
 * Pulls free public series (FRED keyless CSV, Yahoo Finance chart API, World Bank API)
 * and writes snapshot JSON to public/data/. Run locally or via GitHub Actions cron:
 *   node scripts/refresh-data.mjs
 */
import { writeFile, mkdir } from "node:fs/promises";
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
  { id: "COAL", fred: "PCOALAUUSDM", name: "Coal (Newcastle)", unit: "USD/t", category: "energy" },
  // NOTE: EIA weekly inventory series were removed from FRED; Inventory Divergence
  // signals need the EIA v2 API (free key) — add via env var EIA_API_KEY later.
  { id: "COPPER", fred: "PCOPPUSDM", name: "Copper", unit: "USD/t", category: "commodity" },
  { id: "WHEAT", fred: "PWHEAMTUSDM", name: "Wheat", unit: "USD/t", category: "commodity" },
  { id: "SP500", fred: "SP500", name: "S&P 500", unit: "index", category: "equity" },
  { id: "NASDAQ", fred: "NASDAQCOM", name: "Nasdaq Composite", unit: "index", category: "equity" },
  { id: "VIX", fred: "VIXCLS", name: "VIX", unit: "index", category: "macro" },
  { id: "UST10Y", fred: "DGS10", name: "US 10Y Treasury yield", unit: "%", category: "macro" },
  { id: "BREAKEVEN10Y", fred: "T10YIE", name: "10Y inflation breakeven", unit: "%", category: "macro" },
  { id: "CPI", fred: "CPIAUCSL", name: "US CPI (all items)", unit: "index", category: "macro" },
  { id: "INDPRO", fred: "INDPRO", name: "US industrial production", unit: "index", category: "macro" },
  { id: "DXY", fred: "DTWEXBGS", name: "US dollar index (broad)", unit: "index", category: "fx" },
  { id: "EURUSD", fred: "DEXUSEU", name: "USD per EUR", unit: "USD", category: "fx" },
];

const YAHOO = [
  { id: "XLE", sym: "XLE", name: "Energy equities (XLE)", unit: "USD", category: "equity" },
  { id: "ICLN", sym: "ICLN", name: "Global clean energy (ICLN)", unit: "USD", category: "renewables" },
  { id: "TAN", sym: "TAN", name: "Solar (TAN)", unit: "USD", category: "renewables" },
  { id: "GOLD", sym: "GLD", name: "Gold (GLD)", unit: "USD", category: "commodity" },
];

const WORLDBANK = [
  { id: "GDP_USA", iso: "USA", name: "US GDP growth", category: "macro" },
  { id: "GDP_CHN", iso: "CHN", name: "China GDP growth", category: "macro" },
  { id: "GDP_IND", iso: "IND", name: "India GDP growth", category: "macro" },
  { id: "GDP_DEU", iso: "DEU", name: "Germany GDP growth", category: "macro" },
];

// ---- fetchers --------------------------------------------------------------
async function get(url, asJson) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
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

for (const job of jobs) {
  try {
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

await writeFile(path.join(OUT_DIR, "catalog.json"), JSON.stringify({ generated: new Date().toISOString(), series: catalog }, null, 2));
console.log(`\n${catalog.length}/${jobs.length} series written to public/data/`);

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
if (failures.length) {
  console.error(`Failures:\n  ${failures.join("\n  ")}`);
  process.exitCode = catalog.length >= jobs.length / 2 ? 0 : 1; // tolerate partial failure
}
