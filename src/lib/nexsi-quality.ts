import { NEXSI_VERSION } from "./nexsi-model";
import type { NexsiCompany, NexsiFile } from "./nexsi-types";
import { validDate } from "./quality";
import { validDisclosureSource, validFinancialEvidence, BRIEF_CATEGORIES } from "./nexsi-brief";

const DAY = 86400000;
export function nexsiStatus(file: NexsiFile, now: number): string | null {
  if (file.engineVersion !== NEXSI_VERSION) return "This snapshot uses an earlier attribution method. Updated analysis is pending.";
  const age = now - Date.parse(file.generated), membershipAge = now - Date.parse(file.universe.asOf);
  if (!Number.isFinite(age) || age < -300000 || age > 3 * DAY || file.status === "retained") return "Analytical refresh overdue or failed. Historical data is retained; current attribution is suspended.";
  if (!validDate(file.universe.asOf) || membershipAge < 0 || membershipAge > 45 * DAY) return "Published membership is overdue. Current universe coverage and attribution are suspended.";
  return null;
}
export function companyStatus(company: NexsiCompany, now: number): string | null {
  if (company.issue) return company.issue;
  if (!validDate(company.asOf) || now - Date.parse(company.asOf) > 7 * DAY || now < Date.parse(company.asOf)) return "Completed daily observations are overdue or unavailable.";
  return null;
}

/** Publication invariants, also used before staged data replaces production. */
export function validateNexsi(file: NexsiFile) {
  if (!file || file.engineVersion !== NEXSI_VERSION || !validDate(file.universe?.asOf)
    || !Number.isFinite(Date.parse(file.generated)) || !Array.isArray(file.companies)) throw new Error("Invalid NexSI snapshot metadata");
  const symbols = file.universe.members.map(m => m.symbol);
  if (symbols.length < 95 || symbols.length > 110 || new Set(symbols).size !== symbols.length
    || file.companies.length !== symbols.length || new Set(file.companies.map(c => c.symbol)).size !== symbols.length
    || file.companies.some(c => !symbols.includes(c.symbol))) throw new Error("NexSI universe/coverage mismatch");
  for (const c of file.companies) {
    for(const check of Object.values(c.evidenceChecks??{})) {
      if(!check||!['available','failed'].includes(check.status)||!Number.isFinite(Date.parse(check.checkedAt))||!/^https:\/\//.test(check.sourceUrl)||!Number.isInteger(check.returned)||check.returned<0||check.successfulAt!==null&&!Number.isFinite(Date.parse(check.successfulAt))||check.status==='available'&&!check.successfulAt)throw new Error(`Invalid NexSI feed check: ${c.symbol}`);
    }
    if(c.issuerNews){
      const news=c.issuerNews;
      const permitted:Record<string,[string,string]>={AAPL:['https://www.apple.com/newsroom/rss-feed.rss','https://www.apple.com/newsroom/'],MSFT:['https://news.microsoft.com/source/feed/','https://news.microsoft.com/source/'],GOOG:['https://blog.google/rss/','https://blog.google/'],GOOGL:['https://blog.google/rss/','https://blog.google/']};
      const allowed=permitted[c.symbol];
      if(!allowed||news.sourceUrl!==allowed[0]||!Number.isFinite(Date.parse(news.checkedAt))||!['available','failed'].includes(news.status)||news.status==='available'&&(!news.successfulAt||!/^[a-f\d]{64}$/.test(news.sha256??''))||news.items.some(item=>!item.title||!item.url.startsWith(allowed[1])||!Number.isFinite(Date.parse(item.at))||Date.parse(item.at)>Date.parse(file.generated)||!['published','updated'].includes(item.dateKind)))throw new Error(`Invalid NexSI issuer newsroom: ${c.symbol}`);
    }
    if (c.provenance && (!/^https:\/\//.test(c.provenance.url) || !c.provenance.provider || !c.provenance.returnBasis)) throw new Error(`Invalid NexSI price provenance: ${c.symbol}`);
    for (const a of [...Object.values(c.moves), ...c.largestDrops].filter(a => a != null)) {
      if (a.factorReturns && ["market", "technology", "rates", "oil", "gas"].some(k => !Number.isFinite(a.factorReturns![k as keyof typeof a.factorReturns]))) throw new Error(`Invalid NexSI factor returns: ${c.symbol}`);
      if (![a.actual, a.energy, ...a.energyCI, ...Object.values(a.components)].every(Number.isFinite)
        || a.energyCI[0] > a.energy || a.energyCI[1] < a.energy || a.fit.through !== a.start || a.fit.n < 126
        || a.start >= a.end || Math.abs(Object.values(a.components).reduce((s, v) => s + v, 0) - a.actual) > 1e-8
        || Math.abs(a.components.oil + a.components.gas - a.energy) > 1e-8) throw new Error(`NexSI attribution invariant failed: ${c.symbol}`);
    }
    for (const h of [1, 5, 20]) if (c.moves[h] && (c.moves[h]!.end !== c.asOf || c.observedReturns[h] == null
      || Math.abs(c.moves[h]!.actual - c.observedReturns[h]!) > 1e-8)) throw new Error(`NexSI return/date mismatch: ${c.symbol}`);
    if (c.history.length && c.history.at(-1)![0] !== c.asOf) throw new Error(`NexSI history/date mismatch: ${c.symbol}`);
    if (c.events.some(e => !/^https:\/\//.test(e.url) || !Number.isFinite(Date.parse(e.publishedAt)))) throw new Error(`Invalid NexSI evidence: ${c.symbol}`);
    for (const e of c.events) if (e.summary) {
      const s = e.summary;
      if (![1, 2, 3, 4, 5].includes(s.version) || !Number.isFinite(Date.parse(s.checkedAt)) || !Array.isArray(s.documents) || !Array.isArray(s.facts)
        || s.documents.some(d => !validDisclosureSource(d.url, e) || !/^[a-f\d]{64}$/.test(d.sha256)||d.textSha256&&!/^[a-f\d]{64}$/.test(d.textSha256))
        || s.facts.some(f => !BRIEF_CATEGORIES.includes(f.category) || !f.text || f.text.length > 700 || !['rule-extracted', 'reviewed'].includes(f.method)
          || !s.documents.some(d => d.url === f.sourceUrl) || !validDisclosureSource(f.sourceUrl, e)
          || (!f.sourceUrl.startsWith('https://www.sec.gov/') && f.sourceTiming !== 'unverified')
          || (f.sourceUrl.startsWith('https://stockanalysis.com/') && f.sourceKind !== 'third-party-transcript')
          || (f.guidanceType && (f.category !== 'guidance' || !['quantitative','qualitative','limited','policy','not-issued','withdrawn'].includes(f.guidanceType)))
          || (f.excerpt && f.excerpt.split(/\s+/).length > 24))) throw new Error(`Invalid NexSI disclosure summary: ${c.symbol}`);
    }
    for (const e of c.events) if (e.financialSummary) {
      const s = e.financialSummary;
      if (s.version !== 1 || !Number.isFinite(Date.parse(s.checkedAt)) || !Array.isArray(s.documents) || !Array.isArray(s.facts)
        || s.documents.some(d => d.url !== `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(e.issuerCik).padStart(10, '0')}.json` || !/^[a-f\d]{64}$/.test(d.sha256))
        || s.facts.some(f => !validFinancialEvidence(f, e) || !s.documents.some(d => d.url === f.evidence?.url && d.sha256 === f.evidence.sha256))) throw new Error(`Invalid NexSI structured financial summary: ${c.symbol}`);
    }
  }
}
