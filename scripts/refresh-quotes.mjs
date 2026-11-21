import path from "node:path";
import { writeFile } from "node:fs/promises";
import { yahooChart, parseQuote } from "./lib/yahoo.mjs";
import { mapLimit } from "./lib/http.mjs";
import { readJson, buildManifest } from "./lib/snapshot.mjs";

const directory = path.resolve(process.env.NEXUSQ_DATA_DIR ?? "public/data");
const previous = await readJson(directory, "quotes.json");
const catalog = await readJson(directory, "catalog.json");
const impact = await readJson(directory, "impact.json");
// Quotes cover the existing Yahoo instruments only. FRED spot prices and monthly
// benchmarks keep their official histories; no futures/ETF proxy masquerades as spot.
const instruments = [
  ...catalog.series.filter((s) => s.source === "Yahoo Finance").map((s) => [s.id, s.id === "GOLD" ? "GLD" : s.id]),
  ...impact.companies.map((c) => [c.id, c.id]),
];
const quotes = {}, failures = [];
await mapLimit(instruments, 3, async ([id, symbol]) => {
  try {
    const quote = parseQuote(await yahooChart(symbol, "1m", "1d"), id, symbol);
    if (previous?.quotes[id] && quote.observedAt < previous.quotes[id].observedAt) throw new Error("quote timestamp regressed");
    quotes[id] = quote;
  } catch (error) {
    failures.push(`${id}: ${error.message}`);
    if (previous?.quotes[id]) quotes[id] = { ...previous.quotes[id], status: "retained", error: error.message };
  }
});
await writeFile(path.join(directory, "quotes.json"), JSON.stringify({
  generated: new Date().toISOString(), targetMinutes: 15, quotes, failures,
  note: "Best-effort quote checks; exchange/provider delay and GitHub scheduling prevent a guaranteed 15-minute service. Quotes are not used in daily analytics.",
}));
await buildManifest(directory);
console.log(`Quotes: ${instruments.length - failures.length}/${instruments.length} retrieved; ${failures.length} failures`);
if (failures.length) console.warn(failures.join("\n"));
if (failures.length === instruments.length) process.exitCode = 1;
