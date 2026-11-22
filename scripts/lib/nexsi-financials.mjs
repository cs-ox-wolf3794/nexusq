import { createHash } from 'node:crypto';
import { isPrimaryFiling } from '../../src/lib/nexsi-explanation.ts';

const DAY = 86400000;
const metrics = [
  { topic: 'revenue', label: 'Consolidated revenue', tags: { 'us-gaap': ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenues', 'SalesRevenueNet'], 'ifrs-full': ['Revenue'] } },
  { topic: 'net-income', label: 'Net income / loss', tags: { 'us-gaap': ['NetIncomeLoss'], 'ifrs-full': ['ProfitLossAttributableToOwnersOfParent'] } },
  { topic: 'eps', label: 'Diluted EPS', tags: { 'us-gaap': ['EarningsPerShareDiluted'], 'ifrs-full': ['DilutedEarningsLossPerShare'] } },
];
export const financialsUrl = cik => `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`;
export function filingAccession(event) {
  const id = new URL(event.url).pathname.split('/').at(-2);
  return `${id.slice(0, 10)}-${id.slice(10, 12)}-${id.slice(12)}`;
}

/** SEC's API contains only whole-entity standard-taxonomy facts. Match the exact
 * accession and duration; never use a later restatement, segment, YTD or currency conversion. */
export function extractFinancialFacts(data, event, sha256, now = Date.now()) {
  if (!isPrimaryFiling(event) || Number(data.cik) !== event.issuerCik || !/^(10-Q|10-K|20-F|6-K)(\/A)?$/.test(event.form ?? '')) throw Error('Structured financial issuer or form mismatch');
  const accession = filingAccession(event), candidates = [];
  for (const metric of metrics) for (const [taxonomy, tags] of Object.entries(metric.tags)) {
    for (const concept of tags) for (const [unit, rows] of Object.entries(data.facts?.[taxonomy]?.[concept]?.units ?? {})) {
      if (!(metric.topic === 'eps' ? /^[A-Z]{3}\/shares$/ : /^[A-Z]{3}$/).test(unit)) continue;
      for (const row of rows) {
        const duration = (Date.parse(row.end) - Date.parse(row.start)) / DAY + 1;
        if (row.accn !== accession || row.form !== event.form || !Number.isFinite(row.val)
          || !/^\d{4}-\d{2}-\d{2}$/.test(row.start ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(row.end ?? '')
          || !/^\d{4}-\d{2}-\d{2}$/.test(row.filed ?? '') || Date.parse(row.end) > Date.parse(event.publishedAt) || Date.parse(row.filed) > now
          || !(duration >= 70 && duration <= 110 || duration >= 330 && duration <= 380)) continue;
        // A periodic filing's report date anchors the current period. Prior-year comparisons are excluded.
        if (event.reportDate && !event.form.startsWith('6-K') && row.end !== event.reportDate) continue;
        if (Date.parse(event.publishedAt) - Date.parse(row.end) > 180 * DAY) continue;
        candidates.push({ metric, taxonomy, concept, unit, row, duration });
      }
    }
  }
  const end = candidates.map(c => c.row.end).sort().at(-1);
  const current = candidates.filter(c => c.row.end === end);
  // Prefer an explicitly reported quarter; annual results stay labelled annual, never inferred Q4.
  const quarterly = current.some(c => c.metric.topic === 'revenue' && c.duration <= 110);
  const annual = current.some(c => c.metric.topic === 'revenue' && c.duration >= 330);
  if (!quarterly && !annual) return [];
  const facts = [];
  for (const metric of metrics) {
    const rows = current.filter(c => c.metric === metric && (quarterly ? c.duration <= 110 : c.duration >= 330));
    // Different monetary units, start dates, or conflicting totals are ambiguous, so withhold that metric.
    if (!rows.length || new Set(rows.map(c => `${c.unit}:${c.row.start}:${c.row.val}`)).size !== 1) continue;
    const c = rows[0], { row, unit, taxonomy, concept } = c;
    const currency = unit.split('/')[0];
    const value = metric.topic === 'eps' ? row.val.toLocaleString('en-US', { maximumFractionDigits: 4 })
      : `${(row.val / 1e6).toLocaleString('en-US', { maximumFractionDigits: 3 })} million`;
    facts.push({ category: 'earnings', topic: metric.topic, text: `${metric.label} (${taxonomy === 'us-gaap' ? 'GAAP' : 'IFRS'}): ${currency} ${value}.`,
      period: `${quarterly ? 'Quarter' : 'Full year'} ended ${end}`, periodEnd: end, sourceUrl: event.url, method: 'sec-xbrl',
      evidence: { url: financialsUrl(event.issuerCik), sha256, taxonomy, concept, unit, start: row.start, end, value: row.val, accession } });
  }
  return facts;
}

/** One request per issuer per refresh, exact-accession summaries cached for a day.
 * Retry missing facts on the next run because XBRL can lag filing acceptance. */
export async function enrichFinancialStatements(companies, now, { fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), maxRequests = 105 } = {}) {
  const cache = new Map(); let remaining = maxRequests;
  for (const company of companies) {
    const candidates = company.events.filter(e => isPrimaryFiling(e) && /^(10-Q|10-K|20-F|6-K)(\/A)?$/.test(e.form ?? '') && Date.parse(e.publishedAt) <= now)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    // Include all recent 6-Ks in the API lookup: foreign issuers use the same form for results and other news.
    const selected = candidates.filter(e => e.form.startsWith('6-K') || e === candidates[0]);
    if (!selected.length || selected.every(e => e.financialSummary?.version === 1 && !e.financialSummary.issue && e.financialSummary.facts.length && now - Date.parse(e.financialSummary.checkedAt) < DAY)) continue;
    const cik = selected[0].issuerCik, url = financialsUrl(cik), checkedAt = new Date(now).toISOString();
    try {
      if (!cache.has(cik)) {
        if (remaining-- <= 0) throw Error('Structured financial request budget reached');
        await sleep(350);
        const response = await fetchImpl(url, { headers: { 'User-Agent': 'NexusQ/1.0 (public company disclosures; https://nexus.gygante.com)' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
        if (!response.ok) throw Error(`SEC structured financial HTTP ${response.status}`);
        const text = await response.text();
        cache.set(cik, { data: JSON.parse(text), sha256: createHash('sha256').update(text).digest('hex') });
      }
      const { data, sha256 } = cache.get(cik);
      for (const event of selected) event.financialSummary = { version: 1, checkedAt, documents: [{ url, sha256, retrievedAt: checkedAt }], facts: extractFinancialFacts(data, event, sha256, now), issue: null };
    } catch (error) {
      for (const event of selected) event.financialSummary = { ...(event.financialSummary ?? { version: 1, documents: [], facts: [] }), checkedAt, issue: error.message };
    }
  }
}
