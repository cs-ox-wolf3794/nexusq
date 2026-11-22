import type { Attribution } from './nexsi-model';
import type { NexsiCompany, NexsiDisclosureFact, NexsiEvent } from './nexsi-types';
import { evidenceForMove, evidenceTiming, isPrimaryFiling, type EvidenceTiming } from './nexsi-explanation';

export const BRIEF_CATEGORIES = ['earnings', 'guidance', 'company-news'] as const;
export function validDisclosureSource(url: string, event: NexsiEvent) {
  try {
    const source = new URL(url), parent = new URL(event.url);
    if (isPrimaryFiling(event) && event.items?.split(',').map(s=>s.trim()).includes('2.02') && !source.search && !source.hash && !source.username && !source.password) {
      if (event.issuerCik === 789019 && /^https:\/\/www\.microsoft\.com\/en-us\/investor\/events\/fy-(20\d{2})\/earnings-fy-\1-q[1-4]$/.test(url)) return true;
      if (event.issuerCik === 1652044 && /^https:\/\/s206\.q4cdn\.com\/479360582\/files\/doc_events\/20\d{2}\/[A-Z][a-z]{2}\/\d{1,2}\/20\d{2}_Q[1-4]_Earnings_Transcript\.pdf$/.test(url)) return true;
    }
    return isPrimaryFiling(event) && source.origin === parent.origin && !source.search && !source.hash && !source.username && !source.password
      && source.pathname.slice(0, source.pathname.lastIndexOf('/')) === parent.pathname.slice(0, parent.pathname.lastIndexOf('/'))
      && /^[\w.-]+\.html?$/i.test(source.pathname.split('/').at(-1)!);
  } catch { return false; }
}
export type BriefItem = { fact: NexsiDisclosureFact; event: NexsiEvent; timing: EvidenceTiming };
export function validFinancialEvidence(fact: NexsiDisclosureFact, event: NexsiEvent) {
  const x = fact.evidence;
  const accession = event.url.split('/').at(-2) ?? '';
  return fact.method === 'sec-xbrl' && fact.category === 'earnings' && validDisclosureSource(fact.sourceUrl, event) && fact.sourceUrl === event.url
    && x?.url === `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(event.issuerCik).padStart(10, '0')}.json`
    && x.accession.replaceAll('-', '') === accession && /^[a-f\d]{64}$/.test(x.sha256) && Number.isFinite(x.value)
    && ['us-gaap', 'ifrs-full'].includes(x.taxonomy) && /^[A-Z]{3}(\/shares)?$/.test(x.unit)
    && Number.isFinite(Date.parse(x.start)) && Number.isFinite(Date.parse(x.end)) && x.start < x.end && x.end <= event.publishedAt.slice(0, 10);
}
export function companyBrief(company: NexsiCompany, move: Pick<Attribution, 'start' | 'end'>, now: number) {
  const context = evidenceForMove(company.events, move, now);
  const nearby = new Set(context.map(e => e.event.url));
  const all: BriefItem[] = company.events.flatMap(event => {
    if (!isPrimaryFiling(event) || Date.parse(event.publishedAt) > now || !Number.isFinite(Date.parse(event.publishedAt))) return [];
    const timing = evidenceTiming(event.publishedAt, move);
    const prose = [2, 3].includes(event.summary?.version ?? 0) ? event.summary!.facts.filter(f => validDisclosureSource(f.sourceUrl, event) && event.summary!.documents.some(d => d.url === f.sourceUrl && /^[a-f\d]{64}$/.test(d.sha256))) : [];
    const financial = event.financialSummary?.version === 1 ? event.financialSummary.facts.filter(f => validFinancialEvidence(f, event) && event.financialSummary!.documents.some(d => d.url === f.evidence?.url && d.sha256 === f.evidence.sha256)) : [];
    return [...prose, ...financial]
      .filter(f => nearby.has(event.url) || (f.category !== 'company-news' && timing === 'before' && Date.parse(move.start) - Date.parse(event.publishedAt) < 100 * 86400000))
      .map(fact => ({ fact, event, timing: fact.sourceTiming === 'unverified' ? 'uncertain' as const : timing }));
  });
  const rank = { within: 0, before: 1, uncertain: 2, after: 3 };
  all.sort((a, b) => rank[a.timing] - rank[b.timing] || b.event.publishedAt.localeCompare(a.event.publishedAt));
  const categories = BRIEF_CATEGORIES.map(category => {
    let rows = all.filter(x => x.fact.category === category);
    if (category === 'earnings' && rows.length) {
      // Structured statements fill gaps. Prefer a release from the same reporting
      // cycle, which can include Q4/non-GAAP details missing from an annual filing.
      const latest = rows[0];
      const release = rows.find(x => x.fact.method !== 'sec-xbrl' && x.timing === latest.timing && Math.abs(Date.parse(x.event.publishedAt) - Date.parse(latest.event.publishedAt)) < 5 * 86400000);
      if (release) rows = rows.filter(x => x.event.url === release.event.url);
    }
    // Results and guidance from one latest disclosure, never mixed reporting periods from different releases.
    if (category !== 'company-news' && rows.length) rows = rows.filter(x => x.event.url === rows[0].event.url);
    if (category === 'company-news') {
      rows.sort((a, b) => rank[a.timing] - rank[b.timing] || Number(b.fact.method === 'reviewed') - Number(a.fact.method === 'reviewed') || b.event.publishedAt.localeCompare(a.event.publishedAt));
      rows = rows.filter((x, i) => rows.findIndex(y => y.fact.text === x.fact.text && y.event.publishedAt.slice(0, 10) === x.event.publishedAt.slice(0, 10)) === i);
    }
    const relevant = company.events.filter(e => isPrimaryFiling(e) && Date.parse(e.publishedAt) <= now && (nearby.has(e.url) || category !== 'company-news' && Date.parse(move.start) - Date.parse(e.publishedAt) < 100 * 86400000 && evidenceTiming(e.publishedAt, move) === 'before'));
    const checked = relevant.filter(e => e.summary?.documents.length || category === 'earnings' && e.financialSummary?.documents.length);
    const latestCheck = checked.flatMap(e => [e.summary?.checkedAt, ...(category === 'earnings' ? [e.financialSummary?.checkedAt] : [])]).filter((d): d is string => !!d).sort().at(-1);
    const failed = relevant.some(e => e.summary?.issue || category === 'earnings' && e.financialSummary?.issue);
    return { category, items: rows.slice(0, category === 'company-news' ? 2 : 6), omitted: Math.max(0, rows.length - (category === 'company-news' ? 2 : 6)), checked: checked.length, latestCheck, failed };
  });
  return { categories, issues: context.filter(x => x.event.summary?.issue).map(x => x.event.summary!.issue!),
    pending: context.filter(x => isPrimaryFiling(x.event) && /^(8-K|6-K)(\/A)?$/.test(x.event.form ?? '') && !x.event.summary).length };
}
export function possibleRelevance(category: NexsiDisclosureFact['category'], topics: string[]) {
  if (category === 'earnings') return 'Results can change expectations for growth and profitability. A comparable analyst-consensus benchmark has not been verified, so no earnings beat or miss is assigned.';
  if (category === 'guidance') return 'The outlook can change expected future cash flows and valuation. A forecast is not an achieved result; a raise or cut requires a like-for-like comparison with the prior outlook.';
  if (topics.includes('split')) return 'A stock split alone does not reduce shareholder value. It cannot explain an adjusted-price loss.';
  if (topics.includes('transaction')) return 'Business transactions, financing and share issuance can change expected earnings, ownership dilution and execution risk. The source must be checked for completion status; an announcement alone does not establish that a transaction has closed.';
  if (topics.includes('leadership')) return 'Leadership changes can affect expectations about strategy and execution. Their direction and share-price impact have not been measured.';
  if (topics.includes('risk')) return 'An investigation or risk disclosure can affect uncertainty and valuation. Disclosure of allegations does not establish that the allegations are true.';
  return 'Company developments can affect expected cash flows and risk. Timing and a plausible business channel alone do not establish why the stock moved.';
}
