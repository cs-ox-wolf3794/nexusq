import path from "node:path";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { readJson, buildManifest } from "./lib/snapshot.mjs";
import { mapLimit } from "./lib/http.mjs";
import { yahooChart, parseYahooDaily } from "./lib/yahoo.mjs";
import { nasdaqUniverse, secDirectory, companyFilings, companyHeadlines, electricityRates } from "./lib/nexsi-sources.mjs";
import { validatePoints, validateAdjustedAlignment } from "../src/lib/quality.ts";
import { NEXSI_VERSION, factorRows, attributeMove, validateFactors } from "../src/lib/nexsi-model.ts";
import { computeSignals } from "../src/lib/signals.ts";
import { validateNexsi } from "../src/lib/nexsi-quality.ts";

const DAY = 86400000;
const FACTORS = [
  ["SPY", "Broad US market", "Adjusted ETF close"],
  ["QQQ", "Nasdaq-100 relative to SPY", "Adjusted ETF log return minus SPY log return"],
  ["IEF", "Treasury duration / rates proxy", "Adjusted 7–10 year Treasury ETF close; not a yield change"],
  ["CL=F", "WTI oil futures", "Continuous front-month futures; includes contract rolls, not spot oil"],
  ["NG=F", "Henry Hub gas futures", "Continuous front-month futures; includes contract rolls, not electricity tariffs"],
];

export async function refreshNexsi(directory, generated = new Date().toISOString()) {
  const now = Date.parse(generated), failures = [];
  const previous = await readJson(directory, "nexsi.json");
  const previousPrices = await readJson(directory, "nexsi-prices.json");
  let universe;
  try { universe = await nasdaqUniverse(now); }
  catch (error) {
    if (!previous?.universe || now - Date.parse(previous.universe.asOf) > 45 * DAY) throw new Error(`NexSI membership unavailable: ${error.message}`);
    universe = { ...previous.universe, retained: true };
    failures.push(`Membership retained from ${universe.asOf}: ${error.message}`);
  }
  const prices = { generated, series: {} };
  const symbols = [...new Set([...FACTORS.map(f => f[0]), ...universe.members.map(m => m.symbol)])];
  await mapLimit(symbols, 3, async symbol => {
    const old = previousPrices?.series[symbol];
    try {
      let points, adjustedPoints;
      await yahooChart(symbol, "1d", "5y", raw => {
        const result = parseYahooDaily(raw, now, symbol);
        points = result.points.slice(-850); adjustedPoints = result.adjustedPoints.slice(-850);
        validatePoints(points, { now, previous: old?.points, minPoints: 2 });
        validateAdjustedAlignment(points, adjustedPoints);
        if (now - Date.parse(points.at(-1)[0]) > 7 * DAY) throw new Error("Completed daily close is overdue");
      });
      prices.series[symbol] = { points, adjustedPoints, retrievedAt: generated, issue: null };
    } catch (error) {
      failures.push(`${symbol}: ${error.message}`);
      prices.series[symbol] = { points: old?.points ?? [], adjustedPoints: old?.adjustedPoints ?? [], retrievedAt: old?.retrievedAt ?? null, issue: error.message };
    }
  });
  const factorProblem = FACTORS.find(([s]) => prices.series[s].issue || prices.series[s].adjustedPoints.length < 127);
  const factorData = Object.fromEntries(FACTORS.map(([s]) => [s, prices.series[s].adjustedPoints]));
  const benchmarkDate = factorData.SPY.at(-1)?.[0];
  let directoryMap = new Map();
  try { directoryMap = await secDirectory(); } catch (error) { failures.push(`SEC directory: ${error.message}`); }
  const filingsCache = new Map();
  const companies = await mapLimit(universe.members, 2, async member => {
    const { symbol } = member, source = prices.series[symbol];
    const old = previous?.companies.find(c => c.symbol === symbol);
    const p = source.adjustedPoints, asOf = p.at(-1)?.[0] ?? null;
    const issue = source.issue ?? (factorProblem ? `Attribution unavailable: ${factorProblem[0]} factor missing or rejected`
      : asOf !== benchmarkDate ? "Latest stock session does not match the market benchmark" : null);
    const rows = issue ? [] : factorRows(p, factorData);
    const observedReturns = {}, moves = {};
    for (const h of [1, 5, 20]) {
      const first = p.at(-h - 1);
      observedReturns[h] = first ? (p.at(-1)[1] / first[1] - 1) * 100 : null;
      moves[h] = first && rows.length ? attributeMove(rows, first[0], asOf, h) : null;
    }
    const drops = p.slice(-60).map(([date, price]) => {
      const i = p.findIndex(([d]) => d === date), prior = p[i - 1];
      return prior ? { date, prior: prior[0], value: (price / prior[1] - 1) * 100 } : null;
    }).filter(d => d && d.value <= -3).sort((a, b) => a.value - b.value).slice(0, 5);
    const largestDrops = rows.length ? drops.map(d => attributeMove(rows, d.prior, d.date, 1)).filter(Boolean) : [];
    const eventIssues = [];
    let events = old?.events ?? [], eventCheckedAt = old?.eventCheckedAt ?? null;
    if (!eventCheckedAt || now - Date.parse(eventCheckedAt) > 6 * 3600000 || old?.eventIssues?.length) {
      const identity = directoryMap.get(symbol);
      const tasks = [companyHeadlines(symbol, now)];
      if (identity) {
        if (!filingsCache.has(identity.cik)) filingsCache.set(identity.cik, companyFilings(identity.cik, now));
        tasks.push(filingsCache.get(identity.cik));
      } else eventIssues.push("SEC issuer mapping unavailable");
      const results = await Promise.allSettled(tasks);
      const kinds = ["headline", "filing"];
      events = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") events.push(...r.value);
        else { eventIssues.push(`${kinds[i]} refresh: ${r.reason.message}`); events.push(...(old?.events ?? []).filter(e => e.kind === kinds[i])); }
      });
      if (!identity) events.push(...(old?.events ?? []).filter(e => e.kind === "filing"));
      events = events.filter(e => now - Date.parse(e.publishedAt) <= 100 * DAY).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      eventCheckedAt = generated;
    }
    const s = { id: symbol, name: member.name, category: "equity", unit: "USD", source: "Yahoo Finance", cadence: "daily", lastUpdated: asOf, points: source.points, adjustedPoints: p };
    const signals = issue ? [] : computeSignals(new Map([[symbol, s]]), asOf).map(s => ({ label: s.subject, detail: s.detail, severity: s.severity }));
    console.log(`NexSI ${symbol}: ${p.length} closes; ${moves[1] ? "attribution ready" : "attribution withheld"}; ${events.length} evidence links`);
    return { ...member, asOf, price: source.points.at(-1)?.[1] ?? null, retrievedAt: source.retrievedAt, issue,
      history: p.slice(-252), observedReturns, moves, drawdown: p.length ? (p.at(-1)[1] / Math.max(...p.slice(-252).map(x => x[1])) - 1) * 100 : null,
      largestDrops, validation: rows.length ? validateFactors(rows) : null, signals, events, eventCheckedAt, eventIssues };
  });
  let electricity = previous?.electricity ?? { retrievedAt: null, rates: [], issue: null };
  if (!electricity.retrievedAt || now - Date.parse(electricity.retrievedAt) > DAY || electricity.issue) {
    try { electricity = { rates: await electricityRates(now), retrievedAt: generated, issue: null }; }
    catch (error) { electricity = { ...electricity, issue: error.message }; failures.push(`Electricity: ${error.message}`); }
  }
  const file = { engineVersion: NEXSI_VERSION, generated, attemptedAt: generated,
    status: failures.length || companies.some(c => c.issue || c.eventIssues.length) ? "degraded" : "ok", universe, companies, failures,
    factors: FACTORS.map(([symbol, label, basis]) => ({ symbol, label, basis, asOf: factorData[symbol].at(-1)?.[0] ?? "", sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history/` })), electricity };
  validateNexsi(file);
  await writeFile(path.join(directory, "nexsi-prices.json"), JSON.stringify(prices));
  await writeFile(path.join(directory, "nexsi.json"), JSON.stringify(file));
  console.log(`NexSI: ${companies.length} securities; ${companies.filter(c => c.moves[1]).length} current daily models; ${failures.length} source issues`);
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = path.resolve(process.env.NEXUSQ_DATA_DIR ?? "public/data");
  await refreshNexsi(directory);
  await buildManifest(directory);
}
