import { readFile, writeFile, readdir, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { validatePoints, validDate, validateAdjustedAlignment } from "../../src/lib/quality.ts";
import { validateNexsi } from "../../src/lib/nexsi-quality.ts";
import { factorRows, attributeMove } from "../../src/lib/nexsi-model.ts";

export async function readJson(directory, name, fallback = null) {
  try { return JSON.parse(await readFile(path.join(directory, name), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

export async function validateSnapshot(directory) {
  const nexsi = await readJson(directory, "nexsi.json");
  if (nexsi) {
    validateNexsi(nexsi);
    const inputs = await readJson(directory, "nexsi-prices.json");
    if (!inputs || inputs.generated !== nexsi.generated) throw new Error("NexSI input generation mismatch");
    for (const [symbol, input] of Object.entries(inputs.series)) {
      if (!input.points.length && input.issue) continue;
      validatePoints(input.points, { minPoints: 2 });
      validateAdjustedAlignment(input.points, input.adjustedPoints);
      if (input.points.some(p => p[1] <= 0)) throw new Error(`NexSI nonpositive price: ${symbol}`);
    }
    const factorData = Object.fromEntries(["SPY", "QQQ", "IEF", "CL=F", "NG=F"].map(s => [s, inputs.series[s]?.adjustedPoints ?? []]));
    for (const company of nexsi.companies) {
      const input = inputs.series[company.symbol];
      if (!input || (input.points.at(-1)?.[0] ?? null) !== company.asOf || (input.points.at(-1)?.[1] ?? null) !== company.price
        || JSON.stringify(input.provenance) !== JSON.stringify(company.provenance)
        || JSON.stringify(input.adjustedPoints.slice(-252)) !== JSON.stringify(company.history)) throw new Error(`NexSI company/input mismatch: ${company.symbol}`);
      const rows = factorRows(input.adjustedPoints, factorData);
      for (const a of [...Object.values(company.moves), ...company.largestDrops].filter(Boolean)) {
        const recalculated = attributeMove(rows, a.start, a.end, a.sessions);
        const sameNumbers = recalculated && ["actual", "energy"].every(k => Math.abs(recalculated[k] - a[k]) < 1e-8)
          && Object.keys(a.components).every(k => Math.abs(recalculated.components[k] - a.components[k]) < 1e-8)
          && a.energyCI.every((v, i) => Math.abs(recalculated.energyCI[i] - v) < 1e-8);
        // Allow harmless floating-point differences between Windows and Linux/V8 versions.
        if (!sameNumbers || recalculated.fit.through !== a.fit.through || recalculated.fit.n !== a.fit.n) throw new Error(`NexSI attribution not reproducible: ${company.symbol}`);
      }
    }
  }
  const catalog = await readJson(directory, "catalog.json");
  const quality = await readJson(directory, "quality.json");
  if (!catalog?.series?.length || !quality || quality.generated !== catalog.generated) throw new Error("catalog and QC generations disagree");
  const ids = new Set();
  for (const entry of catalog.series) {
    if (!/^[A-Z0-9_]+$/.test(entry.id) || ids.has(entry.id)) throw new Error("invalid/duplicate catalog ID");
    ids.add(entry.id);
    const series = await readJson(directory, `${entry.id}.json`);
    validatePoints(series?.points);
    if (series.adjustedPoints) validateAdjustedAlignment(series.points, series.adjustedPoints);
    if (series.source === "Yahoo Finance" && !series.adjustedPoints) throw new Error(`adjusted closes unavailable: ${entry.id}`);
    if (series.id !== entry.id || series.points.length !== entry.count || series.points.at(-1)[0] !== entry.lastUpdated
      || series.lastUpdated !== entry.lastUpdated || series.source !== entry.source || series.unit !== entry.unit || !quality.series[entry.id]) throw new Error(`catalog/series/QC mismatch: ${entry.id}`);
  }
  const forecasts = await readJson(directory, "forecasts.json");
  if (!forecasts?.series) throw new Error("forecast file unavailable");
  for (const [id, forecast] of Object.entries(forecasts?.series ?? {})) {
    if (!ids.has(id)) throw new Error(`forecast missing actual series: ${id}`);
    if (!["model", "external"].includes(forecast.kind) || !forecast.points?.length) throw new Error(`invalid forecast schema: ${id}`);
    if (forecast.source?.includes("World Bank Data360") && (!validDate(forecast.sourceVintage) || !forecast.deliveryUrl?.startsWith("https://data360") || !forecast.periodBasis)) throw new Error(`missing GDP forecast lineage: ${id}`);
    let previousDate = "";
    for (const p of forecast.points) {
      if (p.length !== (forecast.kind === "model" ? 6 : 2) || p[0] <= previousDate || !validDate(p[0]) || !p.slice(1).every(Number.isFinite)) throw new Error(`invalid forecast: ${id}`);
      if (forecast.kind === "model" && p.slice(2).some((v, i) => v < p[i + 1])) throw new Error(`crossed forecast quantiles: ${id}`);
      previousDate = p[0];
    }
  }
  const impact = await readJson(directory, "impact.json");
  if (impact) {
    for (const company of impact.companies) {
      validatePoints(company.points, { minPoints: 90 });
      if (company.lastUpdated !== company.points.at(-1)[0]) throw new Error(`impact date mismatch: ${company.id}`);
      if (company.adjustedPoints) {
        validatePoints(company.adjustedPoints, { minPoints: 90 });
        if (company.points.length !== company.adjustedPoints.length || company.points.some(([date], i) => date !== company.adjustedPoints[i][0])) throw new Error(`adjusted-close alignment mismatch: ${company.id}`);
      }
    }
    for (const country of impact.countries) validatePoints(country.gdp, { minPoints: 12 });
    validatePoints(impact.worldGdp, { minPoints: 12 });
    if (!impact.oilAnnual?.every(([year, value]) => /^\d{4}$/.test(year) && Number.isFinite(value) && value > 0)) throw new Error("invalid annual oil control");
  }
  const cot = await readJson(directory, "cot.json");
  for (const [id, market] of Object.entries(cot?.markets ?? {})) {
    validatePoints(market.points.map(([date, net]) => [date, net]), { minPoints: 100 });
    if (market.lastUpdated !== market.points.at(-1)[0] || market.points.some(([, net, oi]) => !Number.isFinite(oi) || oi <= 0 || Math.abs(net) > oi)) throw new Error(`invalid COT positions: ${id}`);
  }
}

export async function buildManifest(directory) {
  const files = {};
  for (const name of (await readdir(directory)).filter((n) => n.endsWith(".json") && n !== "manifest.json").sort()) {
    const bytes = await readFile(path.join(directory, name));
    JSON.parse(bytes.toString("utf8"));
    files[name] = createHash("sha256").update(bytes).digest("hex");
  }
  const revision = createHash("sha256").update(JSON.stringify(files)).digest("hex");
  const manifest = { schemaVersion: 1, revision, files };
  await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest));
  return manifest;
}

export async function verifyManifest(directory) {
  const manifest = await readJson(directory, "manifest.json");
  if (!manifest || manifest.schemaVersion !== 1 || !manifest.files) throw new Error("publication manifest missing");
  const actualNames = (await readdir(directory)).filter((name) => name.endsWith(".json") && name !== "manifest.json").sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error("manifest coverage mismatch");
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (!/^[A-Za-z0-9_.-]+\.json$/.test(name)) throw new Error("invalid manifest filename");
    const actual = createHash("sha256").update(await readFile(path.join(directory, name))).digest("hex");
    if (actual !== hash) throw new Error(`publication checksum mismatch: ${name}`);
  }
  const revision = createHash("sha256").update(JSON.stringify(manifest.files)).digest("hex");
  if (revision !== manifest.revision) throw new Error("publication revision mismatch");
}

/** Stage first; manifest is the commit marker. Readers reject mixed generations. */
export async function publishSnapshot(staging, destination) {
  await validateSnapshot(staging);
  await buildManifest(staging);
  await verifyManifest(staging);
  await mkdir(destination, { recursive: true });
  for (const name of (await readdir(staging)).filter((n) => n.endsWith(".json") && n !== "manifest.json")) {
    await copyFile(path.join(staging, name), path.join(destination, name));
  }
  await copyFile(path.join(staging, "manifest.json"), path.join(destination, "manifest.json"));
}
