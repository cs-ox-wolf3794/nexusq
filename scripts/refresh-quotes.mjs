import path from "node:path";
import { writeFile } from "node:fs/promises";
import { yahooChart, parseQuote } from "./lib/yahoo.mjs";
import { mapLimit } from "./lib/http.mjs";
import { readJson, buildManifest } from "./lib/snapshot.mjs";
import { refreshProvenance } from './lib/refresh-provenance.mjs';
import { ENERGY_INSTRUMENTS } from '../src/lib/energy-quotes.ts';

const directory = path.resolve(process.env.NEXUSQ_DATA_DIR ?? "public/data");
const previous = await readJson(directory, "quotes.json");
const catalog = await readJson(directory, "catalog.json");
const impact = await readJson(directory, "impact.json");
const nexsi = await readJson(directory, "nexsi.json");
// Futures have their own quote IDs. FRED spot history and daily models stay untouched.
const instruments = [...new Map([
  ...catalog.series.filter((s) => s.source === "Yahoo Finance").map((s) => [s.id, s.id === "GOLD" ? "GLD" : s.id]),
  ...impact.companies.map((c) => [c.id, c.id]),
  ...(nexsi?.universe.members ?? []).map((c) => [c.symbol, c.symbol]),
  ...ENERGY_INSTRUMENTS.map(item => [item.id, item.symbol]),
]).entries()];
const quotes = {}, failures = [];
await mapLimit(instruments, 3, async ([id, symbol]) => {
  try {
    const energy = ENERGY_INSTRUMENTS.find(item => item.id === id);
    const validate=result=>{
      const candidate=parseQuote(result,id,symbol,Date.now(),energy);
      if(previous?.quotes[id]&&candidate.observedAt<previous.quotes[id].observedAt)throw new Error('quote timestamp regressed');
    };
    const quote = parseQuote(await yahooChart(symbol, "1m", "1d",validate), id, symbol,Date.now(),energy);
    quotes[id] = quote;
  } catch (error) {
    failures.push(`${id}: ${error.message}`);
    if (previous?.quotes[id]) quotes[id] = { ...previous.quotes[id], status: "retained", error: error.message };
  }
});
await writeFile(path.join(directory, "quotes.json"), JSON.stringify({
  generated: new Date().toISOString(), targetMinutes: 15, quotes, failures,
  refresh: refreshProvenance(previous?.refresh,process.env,new Date().toISOString()),
  note: "Best-effort quote checks; exchange/provider delay and GitHub scheduling prevent a guaranteed 15-minute service. Quotes are not used in daily analytics.",
}));
await buildManifest(directory);
console.log(`Quotes: ${instruments.length - failures.length}/${instruments.length} retrieved; ${failures.length} failures`);
if (failures.length) console.warn(failures.join("\n"));
if (failures.length === instruments.length) process.exitCode = 1;
