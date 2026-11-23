import { describe, expect, it, vi } from 'vitest';
import { applyReviewedFacts, createDisclosureLoader, extractDisclosureFacts, parseDisclosureHtml, releaseLinks, selectDisclosureEvents } from '../../../scripts/lib/nexsi-disclosures.mjs';
import { mergeEvidence } from '../../../scripts/lib/nexsi-sources.mjs';
import { companyBrief, validDisclosureSource } from '../nexsi-brief';
import type { NexsiCompany, NexsiEvent } from '../nexsi-types';

const now = Date.parse('2026-11-22T12:00:00Z');
const event: NexsiEvent = { kind: 'filing', title: '8-K', form: '8-K', issuerCik: 1234, items: '2.02', source: 'SEC EDGAR', publishedAt: '2026-11-19T22:00:00Z', url: 'https://www.sec.gov/Archives/edgar/data/1234/000000123426000001/report.htm' };
const release = event.url.replace('report.htm', 'release.htm');
const summary = { version: 2, checkedAt: '2026-11-10T12:00:00Z', issue: null, documents: [{ url: release, sha256: 'a'.repeat(64), retrievedAt: '2026-11-10T12:00:00Z' }], facts: [{ category: 'earnings' as const, topic: 'revenue', text: 'Reported revenue: $4 billion.', period: 'third quarter of fiscal 2026', method: 'rule-extracted' as const, sourceUrl: release }] };

describe('Company disclosure summaries', () => {
  it('accepts reviewed visible text through changing CDN markup but never a changed disclosure or wrong issuer',()=>{
    const url='https://www.sec.gov/Archives/edgar/data/1513845/000110465926126008/tm2629571d1_ex99-1.htm';
    const textSha256='765908a225af1acc7a3bc5a93ab1a8e34ea70f58ae6d6e8746975f9533388694';
    expect(applyReviewedFacts([],{url,sha256:'b'.repeat(64),textSha256})[0].text).toContain('980.8 million');
    expect(applyReviewedFacts([],{url,sha256:'b'.repeat(64),textSha256:'c'.repeat(64)})).toEqual([]);
    expect(applyReviewedFacts([],{url:release,sha256:'b'.repeat(64),textSha256})).toEqual([]);
    expect(parseDisclosureHtml('<html><head><script>nonce=42</script></head><body><p>Revenue $10.</p></body></html>').blocks).toEqual(parseDisclosureHtml('<html><head><script>nonce=99</script></head><body><p>Revenue $10.</p></body></html>').blocks);
  });
  it('preserves an explicit annual capex lower bound from a periodic filing',()=>{
    const facts=extractDisclosureFacts(['We currently expect our capital expenditures to be in excess of $20 billion in 2026.','We expected our capital expenditures to be $10 billion in 2025.'],event.url);
    expect(facts).toEqual([expect.objectContaining({category:'guidance',period:'2026',text:'Management capital-expenditure outlook: above USD 20 billion.'})]);
  });
  it('reserves earnings coverage despite a stream of more recent corporate reports',()=>{
    const earnings={...event,publishedAt:'2026-10-29T20:00:00Z'};
    const reports=Array.from({length:15},(_,i)=>({...event,url:event.url.replace('report',`report${i}`),items:'8.01',publishedAt:new Date(now-i*86400000).toISOString()}));
    const selected=selectDisclosureEvents({events:[...reports,earnings],moves:{1:{start:'2026-11-19',end:'2026-11-20'}},largestDrops:[]},now);
    expect(selected).toContain(earnings);
  });
  it('preserves table cells across formatting tags and discovers numeric exhibit links by row context',()=>{
    const parsed=parseDisclosureHtml('<html><body><table><tr><td>99.1</td><td><a href="release.htm">Company</a> quarterly release</td></tr><tr><td><p>Revenue</p></td><td><p>$4 billion</p></td></tr></table></body></html>');
    expect(parsed.blocks).toContain('Revenue | $4 billion');
    expect(releaseLinks(parsed,event)).toEqual([release]);
  });
  it('preserves period, actual/outlook distinction, tolerance and GAAP basis', () => {
    const facts = extractDisclosureFacts(['Company reported revenue for the quarter ended October 25, 2026, of $115.8 billion, up 103% from a year ago.', 'GAAP and non-GAAP earnings per diluted share were $2.70 and $2.68, respectively.', 'Outlook', 'Our outlook for the fourth quarter of fiscal 2027 is as follows:', 'Revenue is expected to be $130.0 billion, plus or minus 3%.'], release, true);
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'earnings', text: 'Reported revenue: $115.8 billion. Year-over-year change: +103%.', period: 'quarter ended October 25, 2026' }),
      expect.objectContaining({ category: 'earnings', text: 'Diluted EPS: $2.70 GAAP; $2.68 non-GAAP.' }),
      expect.objectContaining({ category: 'guidance', text: 'Management revenue outlook: $130.0 billion (plus or minus 3%).', period: 'Q4 fiscal 2027' }),
    ]));
    expect(facts.filter((f: { category: string }) => f.category === 'earnings')).toHaveLength(2);
  });
  it('requires explicit guidance-table units and does not guess accounting columns', () => {
    const blocks = ['Full Year Fiscal 2027 Guidance', 'GAAP | Non-GAAP', 'Total Revenue | $23,081 to $23,365 | 8% to 9%', 'Diluted Earnings Per Share | $20.12 to $20.36 | 22% | $22.88 to $23.12', 'Dollars are in millions, except earnings per share.'];
    expect(extractDisclosureFacts(blocks, release, true)).toEqual([expect.objectContaining({ text: 'Management revenue outlook: $23,081–$23,365 million.', period: 'Full Year Fiscal 2027' })]);
    expect(extractDisclosureFacts(blocks.slice(0, -1), release, true)).toEqual([]);
    expect(extractDisclosureFacts([...blocks.slice(0, -1), 'Second Quarter Fiscal 2027 Guidance', blocks.at(-1)], release, true)).toEqual([]);
  });
  it('withholds ambiguous comparisons, segment totals and boilerplate risks', () => {
    expect(extractDisclosureFacts(['Revenue increased from $1 billion to $2 billion.', 'Data Center revenue was $5 billion.', 'Forward-Looking Statements', 'The board may have to investigate a cybersecurity incident.', 'Revenue is expected to be $6 billion.'], release, true)).toEqual([]);
  });
  it('keeps GAAP and non-GAAP single EPS statements separate without trailing punctuation', () => {
    const facts = extractDisclosureFacts(['Third Quarter Fiscal 2026', 'GAAP diluted earnings per share increased 63 percent to $2.59.', 'Non-GAAP diluted earnings per share increased 56 percent to $2.91.'], release, true);
    expect(facts.map((f: { text: string }) => f.text)).toEqual(['Reported diluted EPS (GAAP): $2.59.', 'Reported diluted EPS (Non-GAAP): $2.91.']);
  });
  it('does not relabel segment revenue or a dollar change as total revenue', () => {
    const blocks = ['Third Quarter 2026', 'Revenue decreased $224 million compared with last year.', 'Revenue in Cloud was $76.8 billion.', 'Revenue was $92.3 billion.', 'Business Segment Results', 'Revenue was $15.5 billion.'];
    expect(extractDisclosureFacts(blocks, release, true)).toEqual([expect.objectContaining({ text: 'Reported revenue: $92.3 billion.' })]);
  });
  it('does not turn exceeding earlier guidance into a new forecast', () => {
    const blocks = ['Third Quarter 2026', 'The company reported revenue of $2.739 billion, exceeding its earlier guidance.', 'Outlook', 'Revenue is expected to be $3.150 billion.'];
    const facts = extractDisclosureFacts(blocks, release, true);
    expect(facts).toEqual([expect.objectContaining({ category: 'earnings', text: 'Reported revenue: $2.739 billion.' })]);
  });
  it('requires an unambiguous year and quarter for automatic reported figures', () => {
    expect(extractDisclosureFacts(['First quarter results', 'Revenue was $4 billion.', 'Fiscal 2026 results', 'Revenue was $9 billion.'], release, true)).toEqual([]);
  });
  it('preserves both percentage and dollar guidance tolerances', () => {
    const percent = extractDisclosureFacts(['Third Quarter Fiscal 2027 Outlook', 'Net revenue is expected to be $3.150 billion +/- 5%.'], release, true);
    expect(percent[0].text).toContain('(+/- 5%)');
    const dollars = extractDisclosureFacts(['Second Quarter 2027 Guidance', 'Revenue of $4.8 billion, plus or minus $100 million'], release, true);
    expect(dollars[0].text).toContain('(plus or minus $100 million)');
  });
  it('ties reviewed facts to an exact source checksum and never an issuer name alone', () => {
    const source = { url: 'https://www.sec.gov/Archives/edgar/data/2023554/000162828026068243/sndkq1-27ex991xpressrelease.htm', sha256: 'cb778cd14593ce93d1bc4073523d740b1ee4235c94676aa8107012c75c7ba5c9' };
    expect(applyReviewedFacts([], source)[0].text).toContain('pre-split');
    expect(applyReviewedFacts([], { ...source, sha256: 'a'.repeat(64) })).toEqual([]);
    expect(applyReviewedFacts([], { ...source, url: release })).toEqual([]);
  });
  it('reads inert visible HTML and limits exhibits to the issuer and exact accession', () => {
    const parsed = parseDisclosureHtml('<html><body><script>Revenue was $900 billion.</script><ix:hidden>Revenue was $800 billion.</ix:hidden><p hidden>Revenue was $700 billion.</p><p>Revenue was $4 billion.</p><a href="release.htm">Press release</a><a href="../000000123426000002/other.htm">Press release</a><a href="https://evil.test/release.htm">Financial results</a></body></html>');
    expect(parsed.blocks.join(' ')).not.toMatch(/900|800|700/);
    expect(releaseLinks(parsed, event)).toEqual([release]);
    expect(validDisclosureSource('https://www.sec.gov.evil.test/Archives/edgar/data/1234/report.htm', event)).toBe(false);
    expect(validDisclosureSource(release.replace('/1234/', '/5678/'), event)).toBe(false);
  });
  it('does not treat filing titles or future-risk statements as confirmed business events', () => {
    const facts = extractDisclosureFacts(['Item 5.02. Departure of Directors and Officers.', 'If our chief executive officer resigned, business could suffer.', 'Item 9.01 Financial Statements and Exhibits.', 'Company appointed a new chief executive officer.'], event.url);
    expect(facts).toEqual([]);
  });
  it('retains successful facts and original document retrieval dates when an exhibit fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({ ok: true, text: async () => '<html><body><p>Item 2.02 Results</p><a href="release.htm">Press release</a></body></html>' }).mockResolvedValueOnce({ ok: false, status: 503 });
    const load = createDisclosureLoader({ now, fetchImpl, sleep: async () => {} });
    const result = await load({ ...event, summary });
    expect(result.issue).toContain('503'); expect(result.facts).toEqual(summary.facts);
    expect(result.documents.find((d: { url: string }) => d.url === release).retrievedAt).toBe(summary.documents[0].retrievedAt);
  });
  it('keeps cached summaries through a normal filing-feed refresh', () => {
    const merged = mergeEvidence([{ ...event, summary }], [event], now);
    expect(merged[0].summary).toEqual(summary);
  });
  it('does not fetch healthy cached documents and bounds initial requests', async () => {
    const fetchImpl = vi.fn(); const load = createDisclosureLoader({ now, maxRequests: 0, fetchImpl, sleep: async () => {} });
    const cached = { ...summary, version: 5, checkedAt: new Date(now).toISOString() };
    expect(await load({ ...event, summary: cached })).toEqual(cached);
    expect((await load(event)).issue).toContain('budget'); expect(fetchImpl).not.toHaveBeenCalled();
    const expired = createDisclosureLoader({ now, maxDurationMs: 0, fetchImpl, sleep: async () => {} });
    expect((await expired(event)).issue).toContain('time budget'); expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('Event summaries for a selected drop', () => {
  const move = { start: '2026-11-19', end: '2026-11-20' };
  const company = (events: NexsiEvent[]) => ({ events } as NexsiCompany);
  it('shows current close-boundary results before older background while retaining timing uncertainty',()=>{
    const old={...event,publishedAt:'2026-09-01T12:00:00Z',summary};
    const current={...event,publishedAt:'2026-11-19T21:00:00Z',summary:{...summary,facts:[{...summary.facts[0],text:'Current quarter results'}]}};
    const rows=companyBrief(company([old,current]),move,now).categories[0].items;
    expect(rows[0].fact.text).toBe('Current quarter results');expect(rows[0].timing).toBe('uncertain');
  });
  it('prefers in-window disclosures and keeps later releases out of the current earnings summary', () => {
    const before = { ...event, url: event.url.replace('report', 'earlier'), publishedAt: '2026-11-10T22:00:00Z', summary };
    const within = { ...event, summary };
    const after = { ...event, url: event.url.replace('report', 'later'), publishedAt: '2026-11-20T22:00:00Z', summary: { ...summary, facts: [{ ...summary.facts[0], text: 'Later results' }] } };
    const rows = companyBrief(company([after, before, within]), move, now).categories[0].items;
    expect(rows).toHaveLength(1); expect(rows[0].timing).toBe('within'); expect(rows[0].fact.text).not.toBe('Later results');
  });
  it('labels older earnings as background, excludes future reports and rejects unsupported source links', () => {
    const before = { ...event, publishedAt: '2026-10-20T22:00:00Z', summary };
    const future = { ...event, publishedAt: '2026-12-01T22:00:00Z', summary };
    const bad = { ...event, summary: { ...summary, facts: [{ ...summary.facts[0], sourceUrl: 'https://unverified.test/a' }] } };
    const rows = companyBrief(company([before, future, bad]), move, now).categories[0].items;
    expect(rows).toHaveLength(1); expect(rows[0].timing).toBe('before');
  });
});

