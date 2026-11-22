import type { Attribution, FactorKey } from "./nexsi-model";
import type { NexsiEvent } from "./nexsi-types";
import { validDate } from "./quality";

export const FACTOR_EXPLANATIONS: { key: FactorKey; label: string; symbols: string[]; meaning: string }[] = [
  { key: "market", label: "Broad US market", symbols: ["SPY"], meaning: "The stock's fitted sensitivity to broad market moves." },
  { key: "technology", label: "Technology relative to market", symbols: ["QQQ", "SPY"], meaning: "Additional exposure to Nasdaq-100 performance relative to SPY; the input is the QQQ/SPY return ratio." },
  { key: "rates", label: "Treasury / rates proxy", symbols: ["IEF"], meaning: "Exposure to Treasury ETF returns. A falling bond price is not itself a measured interest-rate change." },
  { key: "oil", label: "Oil futures", symbols: ["CL=F"], meaning: "Conditional association with WTI futures, including contract rolls; not the company's electricity bill." },
  { key: "gas", label: "Gas futures", symbols: ["NG=F"], meaning: "Conditional association with Henry Hub futures, including contract rolls; not a site-specific power tariff." },
];
export const signed = (value: number, digits = 2) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
export const amount = (value: number) => Math.abs(value) < 0.005 ? "less than 0.01" : Math.abs(value).toFixed(2);

export function explainMove(a: Attribution) {
  const other = a.components.market + a.components.technology + a.components.rates + a.components.baseline;
  const candidates = FACTOR_EXPLANATIONS.map(f => ({ ...f, value: a.components[f.key] }));
  const drag = candidates.filter(f => f.value <= -0.005).sort((x, y) => x.value - y.value)[0] ?? null;
  const offset = candidates.filter(f => f.value >= 0.005).sort((x, y) => y.value - x.value)[0] ?? null;
  const inconclusive = a.energyCI[0] <= 0 && a.energyCI[1] >= 0;
  const energyState = a.extrapolation ? "fragile" : inconclusive ? "inconclusive" : a.energy < 0 ? "drag" : "offset";
  const energyLabel = { fragile: "⚠ Estimate is fragile", inconclusive: "ℹ Energy direction is inconclusive", drag: "▼ Estimated energy drag", offset: "▲ Estimated energy support" }[energyState];
  const energyText = `Oil and gas together ${a.energy < 0 ? "contribute an estimated drag of" : "contribute an estimated support of"} ${amount(a.energy)} percentage points. ${inconclusive ? "The uncertainty range includes zero, so the model cannot distinguish an energy drag from an offset." : "The parameter interval is below or above zero, but this remains an association, not a proven cause."}${a.extrapolation ? " At least one market input is outside the model's usual range; treat the estimate with particular caution." : ""}`;
  const otherText = `Market, relative technology, the rates proxy and the model baseline ${other < 0 ? "contribute a net estimated drag of" : "contribute net estimated support of"} ${amount(other)} percentage points. These are modeled exposures, not a tally of verified news effects.`;
  const residual = a.components.unexplained;
  const residualText = Math.abs(residual) < 0.005 ? "The fitted components approximately match this move. That does not establish that all its causes are known."
    : residual < 0 ? `${a.actual < 0 ? "A further" : "An unexplained downward contribution of"} ${amount(residual)} percentage points ${a.actual < 0 ? "of decline remain unexplained by these factors" : "offsets part of the modeled gain"}. Company events, omitted risks and model error may contribute; none has been assigned a measured share.`
      : `The unexplained ${amount(residual)} percentage points ${a.energy + other < 0 ? "offset part of the modeled decline" : "add to the modeled support"}. This positive remainder is not an additional loss. Its cause is not identified.`;
  // Independently apply the reporting gate; never convert an inconclusive point estimate into a causal share.
  const energyShare = a.actual <= -3 && a.energyCI[1] < 0 && !a.extrapolation ? a.energy / a.actual * 100 : null;
  const headline = a.actual < 0
    ? drag ? `${drag.label} is the largest modeled drag (${signed(drag.value)} pp).` : "The model does not identify a downward market-factor contribution of at least 0.01 percentage points."
    : offset ? `${offset.label} is the largest modeled support (${signed(offset.value)} pp).` : "The positive move is not explained by positive market-factor contributions.";
  return { other, drag, offset, energyState, energyLabel, energyText, otherText, residualText, energyShare, headline };
}

// Published exchange schedules, reviewed 2026-11-22. Outside this coverage, timing
// is explicitly uncertain. Dates passed here are observed US-equity session dates.
export const CALENDAR_SOURCE = "https://www.nasdaq.com/market-activity/stock-market-holiday-schedule";
export const FUTURE_CALENDAR_SOURCE = "https://www.nyse.com/trade/hours-calendars";
const EARLY = new Set(["2026-11-27", "2026-12-24", "2027-11-26", "2028-07-03", "2028-11-24"]);
const CLOSED = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
  "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29", "2028-06-19", "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25",
]);
function closeMinute(date: string) {
  const year = Number(date.slice(0, 4)), day = new Date(date).getUTCDay();
  if (!validDate(date) || year < 2026 || year > 2028 || day === 0 || day === 6 || CLOSED.has(date)) return null;
  return EARLY.has(date) ? 13 * 60 : 16 * 60;
}
const EASTERN = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function easternTime(timestamp: string) {
  if (!Number.isFinite(Date.parse(timestamp))) return null;
  const p = Object.fromEntries(EASTERN.formatToParts(new Date(timestamp)).map(p => [p.type, p.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute), label: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ET` };
}
export type EvidenceTiming = "within" | "before" | "after" | "uncertain";
export function evidenceTiming(timestamp: string, move: Pick<Attribution, "start" | "end">): EvidenceTiming {
  const t = easternTime(timestamp), startClose = closeMinute(move.start), endClose = closeMinute(move.end);
  if (!t || startClose == null || endClose == null) return "uncertain";
  if (t.date < move.start || (t.date === move.start && t.minute < startClose)) return "before";
  if (t.date > move.end || (t.date === move.end && t.minute > endClose)) return "after";
  if ((t.date === move.start && t.minute === startClose) || (t.date === move.end && t.minute === endClose)) return "uncertain";
  return "within";
}
export const TIMING_LABELS: Record<EvidenceTiming, string> = {
  within: "Published during the close-to-close window", before: "Earlier context — already published before this move",
  after: "Published after this move — follow-up context", uncertain: "Timing relative to the close is uncertain",
};
export function evidenceForMove(events: NexsiEvent[], move: Pick<Attribution, "start" | "end"> | null | undefined, now: number) {
  return events.filter(e => {
    const time = Date.parse(e.publishedAt), date = easternTime(e.publishedAt)?.date;
    return Number.isFinite(time) && time <= now && date && (!move || (Date.parse(date) >= Date.parse(move.start) - 7 * 86400000 && Date.parse(date) <= Date.parse(move.end) + 2 * 86400000));
  }).map(event => ({ event, timing: move ? evidenceTiming(event.publishedAt, move) : "uncertain" as EvidenceTiming }))
    .sort((a, b) => b.event.publishedAt.localeCompare(a.event.publishedAt));
}

const SEC_ITEMS: Record<string, string> = {
  "1.01": "material agreement", "1.02": "termination of a material agreement", "1.03": "bankruptcy or receivership", "1.05": "material cybersecurity incident",
  "2.01": "acquisition or disposal", "2.02": "operating results and financial condition", "2.03": "financial obligation", "2.05": "exit or disposal costs", "2.06": "asset impairment",
  "3.01": "listing compliance", "3.02": "unregistered equity sale", "4.02": "non-reliance on prior financial statements",
  "5.02": "director, officer or compensation changes", "5.03": "charter, bylaw or fiscal-year changes", "5.07": "shareholder vote",
  "7.01": "Regulation FD disclosure", "8.01": "other company events",
};
export function isPrimaryFiling(event: NexsiEvent) {
  try {
    const u = new URL(event.url), match = u.pathname.match(/^\/Archives\/edgar\/data\/(\d+)\/\d{18}\/[\w.-]+$/);
    return event.kind === "filing" && u.protocol === "https:" && !u.username && !u.password && ["www.sec.gov", "sec.gov"].includes(u.hostname)
      && !!match && (event.issuerCik == null || Number(match[1]) === event.issuerCik);
  } catch { return false; }
}
export function disclosureContext(event: NexsiEvent) {
  if (!isPrimaryFiling(event)) return "Linked reporting. Article content, company relevance and causal claims have not been independently verified; no contribution is assigned from this item.";
  const topics = (event.items ?? "").split(",").map(s => SEC_ITEMS[s.trim()]).filter(Boolean);
  return topics.length ? `Reported filing topics: ${topics.join("; ")}. This identifies the filing topic, not whether it surprised the market or caused this return.`
    : "Primary issuer disclosure. Read its financial results, risks and exhibits for context; the filing alone does not measure a share-price effect.";
}

// Human-reviewed factual note, tied to the exact primary document and event date.
// It is never generated from headline keywords or extrapolated to other issuers.
export function reviewedDisclosure(symbol: string, event: NexsiEvent, move: Pick<Attribution, "start" | "end"> | null | undefined) {
  return symbol === "SNDK" && isPrimaryFiling(event) && event.url === "https://www.sec.gov/Archives/edgar/data/2023554/000162828026075127/sndk-20261119.htm"
    && move && move.start < "2026-11-20" && move.end >= "2026-11-20"
    ? "Sandisk disclosed an 8-for-1 split, with split-adjusted trading scheduled for November 20. The displayed return already adjusts for the split: dividing the old per-share price by eight is not an economic loss. This disclosure does not identify the cause of the remaining price decline."
    : null;
}
