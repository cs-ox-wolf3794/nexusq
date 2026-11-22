import type { Attribution } from './nexsi-model';
import type { NexsiCompany, NexsiDisclosureFact, NexsiEvent } from './nexsi-types';
import { evidenceForMove, evidenceTiming, isPrimaryFiling, type EvidenceTiming } from './nexsi-explanation';

export const BRIEF_CATEGORIES = ['earnings', 'guidance', 'company-news'] as const;
export function validDisclosureSource(url: string, event: NexsiEvent) {
  try {
    const source = new URL(url), parent = new URL(event.url);
    return isPrimaryFiling(event) && source.origin === parent.origin && !source.search && !source.hash && !source.username && !source.password
      && source.pathname.slice(0, source.pathname.lastIndexOf('/')) === parent.pathname.slice(0, parent.pathname.lastIndexOf('/'))
      && /^[\w.-]+\.html?$/i.test(source.pathname.split('/').at(-1)!);
  } catch { return false; }
}
export type BriefItem = { fact: NexsiDisclosureFact; event: NexsiEvent; timing: EvidenceTiming };
export function companyBrief(company: NexsiCompany, move: Pick<Attribution, 'start' | 'end'>, now: number) {
  const context = evidenceForMove(company.events, move, now);
  const nearby = new Set(context.map(e => e.event.url));
  const all: BriefItem[] = company.events.flatMap(event => {
    if (!isPrimaryFiling(event) || event.summary?.version !== 2 || Date.parse(event.publishedAt) > now || !Number.isFinite(Date.parse(event.publishedAt))) return [];
    const timing = evidenceTiming(event.publishedAt, move);
    return event.summary.facts.filter(f => validDisclosureSource(f.sourceUrl, event) && event.summary!.documents.some(d => d.url === f.sourceUrl && /^[a-f\d]{64}$/.test(d.sha256)))
      .filter(f => nearby.has(event.url) || (f.category !== 'company-news' && timing === 'before' && Date.parse(move.start) - Date.parse(event.publishedAt) < 100 * 86400000))
      .map(fact => ({ fact, event, timing }));
  });
  const rank = { within: 0, before: 1, uncertain: 2, after: 3 };
  all.sort((a, b) => rank[a.timing] - rank[b.timing] || b.event.publishedAt.localeCompare(a.event.publishedAt));
  const categories = BRIEF_CATEGORIES.map(category => {
    let rows = all.filter(x => x.fact.category === category);
    // Results and guidance from one latest disclosure, never mixed reporting periods from different releases.
    if (category !== 'company-news' && rows.length) rows = rows.filter(x => x.event.url === rows[0].event.url);
    if (category === 'company-news') {
      rows.sort((a, b) => rank[a.timing] - rank[b.timing] || Number(b.fact.method === 'reviewed') - Number(a.fact.method === 'reviewed') || b.event.publishedAt.localeCompare(a.event.publishedAt));
      rows = rows.filter((x, i) => rows.findIndex(y => y.fact.text === x.fact.text && y.event.publishedAt.slice(0, 10) === x.event.publishedAt.slice(0, 10)) === i);
    }
    return { category, items: rows.slice(0, category === 'company-news' ? 2 : 6), omitted: Math.max(0, rows.length - (category === 'company-news' ? 2 : 6)) };
  });
  return { categories, issues: context.filter(x => x.event.summary?.issue).map(x => x.event.summary!.issue!),
    pending: context.filter(x => isPrimaryFiling(x.event) && /^(8-K|6-K)(\/A)?$/.test(x.event.form ?? '') && !x.event.summary).length };
}
export function possibleRelevance(category: NexsiDisclosureFact['category'], topics: string[]) {
  if (category === 'earnings') return 'Results can change expectations for growth and profitability. A comparable analyst-consensus benchmark has not been verified, so no earnings beat or miss is assigned.';
  if (category === 'guidance') return 'The outlook can change expected future cash flows and valuation. A forecast is not an achieved result; a raise or cut requires a like-for-like comparison with the prior outlook.';
  if (topics.includes('split')) return 'A stock split alone does not reduce shareholder value. It cannot explain an adjusted-price loss.';
  if (topics.includes('transaction')) return 'A proposed sale or acquisition can change expected earnings, financing needs and execution risk. An announcement does not establish that a transaction has closed.';
  if (topics.includes('leadership')) return 'Leadership changes can affect expectations about strategy and execution. Their direction and share-price impact have not been measured.';
  if (topics.includes('risk')) return 'An investigation or risk disclosure can affect uncertainty and valuation. Disclosure of allegations does not establish that the allegations are true.';
  return 'Company developments can affect expected cash flows and risk. Timing and a plausible business channel alone do not establish why the stock moved.';
}
