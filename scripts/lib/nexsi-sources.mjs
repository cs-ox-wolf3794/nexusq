import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { get } from "./http.mjs";
import { validDate } from "../../src/lib/quality.ts";

const PDF_URL = "https://www.nasdaq.com/docs/global-indexes/";
const groups = {
  "Cloud & data centers": "MSFT AMZN GOOG GOOGL META CRWV NBIS",
  "Chips & semiconductor equipment": "NVDA AMD AVGO ARM MRVL MU INTC ASML AMAT KLAC LRCX ADI MCHP MPWR NXPI QCOM TXN TER ALAB",
  "Hardware & connectivity": "AAPL CSCO LITE STX WDC SNDK",
  "AI software & platforms": "ADBE ADSK APP CDNS SNPS CRWD DDOG FTNT INTU PLTR PANW ROP SHOP TRI WDAY ADP AXON",
  "AI applications & autonomy": "TSLA DASH PDD NFLX MELI PYPL BKNG ABNB",
  "Power & energy suppliers": "CEG AEP EXC XEL BKR",
};
export function classify(symbol, technology) {
  const group = Object.entries(groups).find(([, names]) => names.split(" ").includes(symbol))?.[0]
    ?? (technology ? "Other technology — review scope" : "Other Nasdaq-100");
  return { group, included: group !== "Other Nasdaq-100" && group !== "Power & energy suppliers" };
}

export async function nasdaqUniverse(now = Date.now()) {
  const publications = [];
  for (const index of ["NDX", "NDXT"]) {
    const response = await fetch(PDF_URL + index, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Nasdaq membership HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Nasdaq membership response is not a PDF");
    const parsed = spawnSync(process.env.NEXSI_PYTHON ?? "python", [fileURLToPath(new URL("./nasdaq-constituents.py", import.meta.url))], { input: bytes, encoding: "utf8", timeout: 30000, maxBuffer: 2e6 });
    if (parsed.status !== 0) throw new Error("Nasdaq PDF extraction unavailable; Python and pinned pypdf are required");
    const data = JSON.parse(parsed.stdout);
    const age = now - Date.parse(data.asOf);
    if (!validDate(data.asOf) || age < 0 || age > 45 * 86400000) throw new Error("Nasdaq membership publication is overdue");
    if (data.members.length < (index === "NDX" ? 95 : 30) || data.members.length > (index === "NDX" ? 110 : 80)) throw new Error("Nasdaq membership coverage incomplete");
    publications.push(data);
  }
  const [all, tech] = publications;
  if (all.asOf !== tech.asOf || tech.members.some(t => !all.members.some(a => a.symbol === t.symbol))) throw new Error("Nasdaq membership publications disagree");
  return { asOf: all.asOf, retrievedAt: new Date(now).toISOString(), sources: [PDF_URL + "NDX", PDF_URL + "NDXT"],
    members: all.members.map(m => { const technology = tech.members.some(t => t.symbol === m.symbol); return { ...m, technology, ...classify(m.symbol, technology) }; }) };
}

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
export function parseHeadlines(xml, now = Date.now()) {
  if (!xml.includes("<rss")) throw new Error("Company headline response is not RSS");
  const tag = (block, name) => decode(block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`))?.[1] ?? "");
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(([, block]) => {
    const title = tag(block, "title"), url = tag(block, "link"), date = Date.parse(tag(block, "pubDate"));
    if (!title || !/^https:\/\//.test(url) || !Number.isFinite(date) || date > now + 300000 || now - date > 45 * 86400000) return [];
    return [{ title: title.slice(0, 220), url, publishedAt: new Date(date).toISOString(), source: new URL(url).hostname.replace(/^www\./, ""), kind: "headline" }];
  }).slice(0, 8);
}
export async function companyHeadlines(symbol, now) {
  return parseHeadlines(await get(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`, false, { retries: 1, timeout: 10000 }), now);
}

export async function secDirectory() {
  const data = await get("https://www.sec.gov/files/company_tickers_exchange.json", true, { retries: 2, timeout: 15000 });
  const [cik, name, ticker] = ["cik", "name", "ticker"].map(k => data.fields.indexOf(k));
  if ([cik, name, ticker].some(i => i < 0) || !Array.isArray(data.data)) throw new Error("SEC ticker directory schema mismatch");
  return new Map(data.data.map(row => [row[ticker], { cik: row[cik], name: row[name] }]));
}
export function parseFilings(data, cik, now = Date.now()) {
  if (Number(data.cik) !== Number(cik)) throw new Error("SEC issuer identity mismatch");
  const recent = data.filings?.recent;
  if (!Array.isArray(recent?.form)) throw new Error("SEC filing schema mismatch");
  const labels = { "8-K": "Current report", "10-Q": "Quarterly report", "10-K": "Annual report", "6-K": "Foreign issuer report", "20-F": "Annual foreign issuer report" };
  return recent.form.flatMap((form, i) => {
    const date = recent.acceptanceDateTime?.[i];
    const timestamp = Date.parse(date ?? "");
    if (!(form in labels) || !Number.isFinite(timestamp) || timestamp > now || now - timestamp > 100 * 86400000) return [];
    const accession = recent.accessionNumber[i], document = recent.primaryDocument[i], items = recent.items?.[i] ?? "";
    if (!/^\d{10}-\d{2}-\d{6}$/.test(accession) || !/^[\w.-]+$/.test(document)) return [];
    return [{ title: `${form} · ${labels[form]}${items.split(',').map(s => s.trim()).includes("2.02") ? " · earnings disclosure" : ""}`, source: "SEC EDGAR", kind: "filing", items,
      publishedAt: new Date(timestamp).toISOString(), url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replaceAll("-", "")}/${document}` }];
  }).slice(0, 10);
}
export async function companyFilings(cik, now) {
  await new Promise(resolve => setTimeout(resolve, 250)); // two workers stay below SEC's published request limit
  return parseFilings(await get(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`, true, { retries: 1, timeout: 15000 }), cik, now);
}

export function parsePowerRates(json, now = Date.now()) {
  const response = json?.response;
  if (response?.frequency !== "monthly" || !Array.isArray(response.data) || Number(response.total) !== response.data.length) throw new Error("Incomplete EIA electricity response");
  const latest = new Map();
  for (const row of response.data) {
    // The endpoint can include Census-region aggregates. They are not states.
    if (!/^[A-Z]{2}$/.test(row.stateid)) continue;
    // EIA's live endpoint and technical documentation use these two spellings
    // for the same physical unit. Both convert by exactly 10 to USD/MWh.
    if (row.sectorid !== "COM" || !["cents per kilowatthour", "cents per kilowatt-hour"].includes(row["price-units"]) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)
      || !/^[A-Z]{2}$/.test(row.stateid) || row.price == null || !Number.isFinite(Number(row.price)) || Number(row.price) <= 0) throw new Error(`EIA electricity identity/unit/value mismatch: ${row.stateid} ${row.period}; sector ${row.sectorid}; unit ${String(row["price-units"]).slice(0, 60)}; price ${String(row.price).slice(0, 30)}`);
    const [y, m] = row.period.split("-").map(Number);
    const end = Date.UTC(y, m, 0);
    if (end > now || now - end > 150 * 86400000) continue;
    if (!latest.has(row.stateid) || latest.get(row.stateid).period < row.period) latest.set(row.stateid, { state: row.stateid, period: row.period, usdMwh: Number(row.price) * 10,
      sourceUrl: "https://www.eia.gov/electricity/data/browser/" });
  }
  if (!latest.size) throw new Error("EIA electricity observations overdue");
  return [...latest.values()];
}
export async function electricityRates(now = Date.now()) {
  if (!process.env.EIA_API_KEY) throw new Error("EIA connection unavailable; no commercial-rate benchmark refreshed");
  const start = new Date(now - 150 * 86400000).toISOString().slice(0, 7);
  const url = `https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=${process.env.EIA_API_KEY}&frequency=monthly&data[0]=price&facets[sectorid][]=COM&start=${start}&length=5000&sort[0][column]=period&sort[0][direction]=desc`;
  return parsePowerRates(await get(url, true, { retries: 2, timeout: 15000 }), now);
}
