import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isPrimaryFiling, evidenceForMove } from '../../src/lib/nexsi-explanation.ts';
import { REVIEWED_DISCLOSURES } from './nexsi-reviewed-disclosures.mjs';

export const DISCLOSURE_VERSION = 2;
const DAY = 86400000;
const reader = fileURLToPath(new URL('./disclosure-html.py', import.meta.url));
const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });
const money = String.raw`\$\s*[\d,]+(?:\.\d+)?\s*(?:billion|million)`;
const periodPattern = /(?:(?:first|second|third|fourth|[1-4](?:st|nd|rd|th))[- ]quarter(?: of)?(?: fiscal(?: year)?)? \d{4}|(?:fiscal (?:year )?|full[- ]year(?: fiscal)? )\d{4}|(?:fiscal )?quarter ended [A-Z][a-z]+ \d{1,2},? \d{4})/i;
const excluded = /forward[- ]looking statements|safe harbor|risks and uncertainties|statements (?:that|which) are not historical|actual results (?:could|may)|shall not be deemed|incorporated (?:herein|by reference)|pursuant to section/i;
const topics = [
  ['leadership', /(?:accepted the resignation|resigned|appointed|terminated the employment).{0,140}(?:chief|president|officer|director)|(?:chief|president|officer|director).{0,120}(?:resigned|resignation|stepped down)/i, 'Leadership change disclosed'],
  ['transaction', /(?:agreed to (?:sell|acquire|purchase)|entered into.{0,100}(?:merger|purchase) agreement|completed (?:the |its )?acquisition)/i, 'Business transaction disclosed'],
  ['capital', /(?:approved|declared|announced).{0,100}(?:stock split|share repurchase|cash dividend)|(?:stock|share) split.{0,100}(?:effective|approved)/i, 'Capital or shareholder action disclosed'],
  ['financing', /(?:entered into|issued|completed).{0,100}(?:credit agreement|credit facility|senior notes|debt offering)/i, 'Financing transaction disclosed'],
  ['operations', /(?:announced|launched|began shipping|entered into).{0,100}(?:product|partnership|data center|power purchase|supply agreement)/i, 'Operating development disclosed'],
  ['risk', /(?:received|initiated|discovered|identified|determined).{0,100}(?:subpoena|investigation|cybersecurity incident|material impairment)|(?:board|committee).{0,100}(?:investigation|review of allegations)/i, 'Risk or investigation disclosure'],
];

export function applyReviewedFacts(facts, doc) {
  const reviewed = REVIEWED_DISCLOSURES[doc.sha256];
  if (reviewed?.url !== doc.url) return facts;
  const categories = [...(reviewed.replaceCategories ?? []), ...reviewed.facts.filter(f => f.category === 'company-news').map(f => f.category)];
  const retained = facts.filter(f => f.sourceUrl !== doc.url || (!categories.includes(f.category) && !reviewed.facts.some(r => r.text === f.text)));
  return [...retained, ...reviewed.facts.map(f => ({ ...f, period: f.period ?? null, sourceUrl: doc.url, method: 'reviewed', reviewedAt: '2026-11-22' }))];
}

export function parseDisclosureHtml(html) {
  if (typeof html !== 'string' || html.length > 5_000_000 || !/<(?:html|body)\b/i.test(html)) throw new Error('Unsupported disclosure document');
  if (/your request originates from an undeclared automated tool|request rate threshold exceeded/i.test(html)) throw new Error('SEC access limit');
  const result = spawnSync(process.env.NEXSI_PYTHON ?? 'python', [reader], { input: html, encoding: 'utf8', timeout: 15000, maxBuffer: 6e6 });
  if (result.status !== 0) throw new Error('Disclosure text reader unavailable');
  const parsed = JSON.parse(result.stdout);
  if (!parsed.blocks?.length) throw new Error('Disclosure contains no readable text');
  return parsed;
}

/** Exhibits must belong to this exact issuer AND accession. Never follow arbitrary source links. */
export function sameFilingDocument(url, event) {
  if (!isPrimaryFiling(event)) return false;
  try {
    const u = new URL(url), parent = new URL(event.url);
    return u.origin === parent.origin && !u.search && !u.hash && !u.username && !u.password
      && u.pathname.startsWith(parent.pathname.slice(0, parent.pathname.lastIndexOf('/') + 1))
      && /^[\w.-]+\.html?$/i.test(u.pathname.split('/').at(-1));
  } catch { return false; }
}
export function releaseLinks(parsed, event) {
  return [...new Set(parsed.links.filter(l => /press release|financial results|earnings release|news release/i.test(l.text))
    .flatMap(l => { try { const u = new URL(l.href, event.url).href; return u !== event.url && sameFilingDocument(u, event) ? [u] : []; } catch { return []; } }))].slice(0, 2);
}

/** Narrow, source-preserving rules. Unsupported tables/wordings yield a visible coverage gap, never an invented result. */
export function extractDisclosureFacts(blocks, sourceUrl, isRelease = false) {
  const facts = [], seen = new Set();
  let section = '', period = '', inBody = isRelease, reportedRevenue = false;
  const intro = blocks.slice(0, 35).find(b => /(?:reported|announced).{0,80}(?:results|revenue).{0,100}(?:quarter|year)|quarter ended/i.test(b) && b.length < 900);
  const periodCandidate = intro?.match(/(?:fiscal )?quarter ended [A-Z][a-z]+ \d{1,2},? \d{4}/i)?.[0] ?? intro?.match(periodPattern)?.[0]
    ?? blocks.slice(0, 15).map(b => b.match(periodPattern)?.[0]).find(Boolean) ?? '';
  const reportPeriod = /quarter.*\d{4}/i.test(periodCandidate) ? periodCandidate : '';
  function add(category, text, topic, context = '') {
    const key = `${category}:${text}:${context}`;
    if (seen.has(key) || facts.filter(f => f.category === category).length >= (category === 'company-news' ? 1 : 5)) return;
    seen.add(key); facts.push({ category, text, topic, period: context || null, sourceUrl, method: 'rule-extracted' });
  }
  for (const [index, raw] of blocks.entries()) {
    const block = raw.replace(/[\u2010-\u2014]/g, '-').trim();
    if (/^item\s+(?:[1-8]\.\d{2})\b/i.test(block)) { inBody = true; section = ''; }
    if (/^item\s+9\.01\b|^signatures?$/i.test(block)) inBody = false;
    if (/^(?:forward-looking statements|safe harbor|about |non-gaap (?:financial )?measures|conference call|financial tables|condensed consolidated)/i.test(block)) { section = 'excluded'; continue; }
    if (/^(?:outlook|guidance|forward-looking guidance|business outlook|financial outlook|fiscal .{0,40}(?:guidance|outlook))$/i.test(block)) { section = 'guidance'; period = block.match(periodPattern)?.[0] ?? ''; continue; }
    if (block.length < 250 && /(?:outlook|guidance) for (?:the )?(?:first|second|third|fourth|full|fiscal)|^(?:full year|first quarter|second quarter|third quarter|fourth quarter).{0,40}(?:guidance|outlook)$/i.test(block) && !excluded.test(block)) {
      section = 'guidance'; period = block.match(periodPattern)?.[0] ?? '';
    }
    if (/^(?:highlights|business highlights|quarterly results|financial highlights|dividend|share repurchase)/i.test(block) && block.length < 80) section = '';
    if (/^(?:business segment results|segment results|segment performance|revenue by segment)/i.test(block) && block.length < 100) section = 'segments';
    const blockPeriod = block.match(periodPattern)?.[0];
    if (section === 'guidance' && blockPeriod) period = blockPeriod;
    // A deliberately narrow table shape: explicit revenue range, nearby guidance header AND explicit units.
    if (inBody && section === 'guidance' && period && /^total revenue\s*\|/i.test(block)) {
      const range = block.match(/^total revenue\s*\|\s*\$([\d,]+(?:\.\d+)?)\s+to\s+\$([\d,]+(?:\.\d+)?)(?:\s*\||$)/i);
      const local = blocks.slice(index + 1, index + 16);
      const units = local.findIndex(b => /dollars are in millions, except earnings per share/i.test(b));
      const nextOutlook = local.findIndex(b => /guidance|outlook/i.test(b));
      if (range && units >= 0 && (nextOutlook < 0 || units < nextOutlook)) {
        add('guidance', `Management revenue outlook: $${range[1]}–$${range[2]} million.`, 'revenue', period);
      }
    }
    if (!inBody || section === 'excluded' || excluded.test(block) || block.includes('|') || block.length > 1600) continue;
    for (const { segment: sentence } of sentences.segment(block)) {
      const s = sentence.trim();
      if (s.length < 25 || s.length > 850 || excluded.test(s)) continue;
      const forward = /\b(?:expects?|expected|projects?|anticipates?|forecast|will be)\b/i.test(s) || section === 'guidance';
      // Only explicit company-wide revenue prose; no segment totals or financial-table column inference.
      const revenue = /^(?:total |net |consolidated )?revenue\s*(?:was|were|of|is|increased|decreased|grew|declined|:)/i.test(s) || /(?:reported|announced) (?:total |net |consolidated )?revenue\b/i.test(s);
      if (revenue) {
        // A monetary decrease is not revenue itself. Require an explicit level.
        const value = s.match(new RegExp(`(?:was|were|of|to|be|:)\\s*(${money})`, 'i'))?.[1];
        const relevant = s.slice(s.toLowerCase().indexOf('revenue'));
        if (value && !/net income|earnings per|operating (?:income|loss)|\bfrom\s*$/i.test(relevant.slice(0, relevant.indexOf(value)))) {
          if (forward) {
            const range = relevant.match(new RegExp(`${money}\\s*(?:to|-)\\s*\\$?\\s*[\\d,.]+\\s*(?:billion|million)?`, 'i'))?.[0];
            const tolerance = relevant.match(/(?:plus or minus|\+\/-|±)\s*\$?\s*\d+(?:\.\d+)?\s*(?:%|billion|million)/i)?.[0];
            if (blockPeriod || period) add('guidance', `Management revenue outlook: ${range ?? value}${tolerance ? ` (${tolerance})` : ''}.`, 'revenue', blockPeriod ?? period);
          } else if (!reportedRevenue && reportPeriod && section !== 'segments') {
            const change = relevant.match(/(?:up|down|increased|decreased|grew|declined)\s+(?:by\s+)?([\d.]+)%\s+(?:from a year ago|year[- ]over[- ]year|compared (?:with|to) (?:the )?(?:prior|previous) year)/i);
            add('earnings', `Reported revenue: ${value}.${change ? ` Year-over-year change: ${/down|decreased|declined/i.test(change[0]) ? '−' : '+'}${change[1]}%.` : ''}`, 'revenue', reportPeriod);
            reportedRevenue = true;
          }
        }
      }
      if (!forward) {
        const pair = s.match(/GAAP and non-GAAP (?:diluted )?earnings per (?:diluted )?share (?:were|was|of)\s*\$([\d.]+) and \$([\d.]+),? respectively/i);
        if (pair && reportPeriod) add('earnings', `Diluted EPS: $${pair[1]} GAAP; $${pair[2]} non-GAAP.`, 'eps', reportPeriod);
        const single = s.match(/^(GAAP|non-GAAP) diluted earnings per share (?:increased|decreased|grew|declined) \d+(?:\.\d+)? (?:percent|%) to \$(\d+(?:\.\d+)?)/i);
        if (single && reportPeriod) add('earnings', `Reported diluted EPS (${single[1]}): $${single[2]}.`, 'eps', reportPeriod);
      }
      if (forward && section === 'guidance') {
        const margins = s.match(/GAAP and non-GAAP gross margins.{0,35}(?:between|of)\s*([\d.]+)%\s*(?:and|to|-)\s*([\d.]+)%/i);
        if (margins && period) add('guidance', `Management gross-margin outlook: ${margins[1]}%–${margins[2]}% for both GAAP and non-GAAP measures.`, 'margin', period);
      }
      if (!forward && !/\b(?:may|could|would|might|if|risk factors)\b/i.test(s)) {
        const topic = topics.find(([, re]) => re.test(s));
        if (topic) {
          // A short attributed excerpt exposes exact wording; no inferred names, deal completion or sentiment.
          const match = s.match(topic[1]);
          const start = match?.index ?? 0;
          const words = s.slice(start).split(/\s+/); const excerpt = (start ? '…' : '') + words.slice(0, 24).join(' ') + (words.length > 24 ? '…' : '');
          add('company-news', topic[2], topic[0]);
          const fact = facts.find(f => f.category === 'company-news');
          if (fact && !fact.excerpt) fact.excerpt = excerpt;
        }
      }
    }
  }
  return facts;
}

export function selectDisclosureEvents(company, now) {
  const moves = [...Object.values(company.moves), ...company.largestDrops].filter(Boolean);
  const context = new Set(moves.flatMap(m => evidenceForMove(company.events, m, now).map(e => e.event.url)));
  return company.events.filter(e => isPrimaryFiling(e) && /^(8-K|6-K)(\/A)?$/.test(e.form ?? '') && Date.parse(e.publishedAt) <= now)
    .filter(e => context.has(e.url) || (e.items?.split(',').includes('2.02') && now - Date.parse(e.publishedAt) < 100 * DAY))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 5);
}

/** Serial, bounded SEC retrieval. A failed enrichment never overwrites a good summary or blocks market prices. */
export function createDisclosureLoader({ now = Date.now(), maxRequests = 420, maxDurationMs = 300000, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  let remaining = maxRequests;
  const deadline = Date.now() + maxDurationMs;
  const cache = new Map();
  const retrieve = async url => {
    if (Date.now() >= deadline) throw new Error('Disclosure time budget reached; retry on the next full refresh');
    if (remaining-- <= 0) throw new Error('Disclosure request budget reached; retry on the next full refresh');
    await sleep(300);
    const response = await fetchImpl(url, { headers: { 'User-Agent': 'NexusQ/1.0 (public company disclosures; https://nexus.gygante.com)' }, signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (!response.ok) throw new Error(`SEC document HTTP ${response.status}`);
    const html = await response.text();
    return { ...parseDisclosureHtml(html), sha256: createHash('sha256').update(html).digest('hex') };
  };
  return async event => {
    const old = event.summary;
    if (old?.version === DISCLOSURE_VERSION && now - Date.parse(old.checkedAt) < (old.issue?.includes('budget reached') ? 0 : old.issue ? 6 * 3600000 : 7 * DAY)) return old;
    if (cache.has(event.url)) return cache.get(event.url);
    const task = (async () => {
      const checkedAt = new Date(now).toISOString();
      try {
        if (!isPrimaryFiling(event)) throw new Error('Disclosure issuer identity unavailable');
        const main = await retrieve(event.url);
        const docs = [{ url: event.url, sha256: main.sha256, retrievedAt: checkedAt }];
        const extract = (doc, url, isRelease = false) => applyReviewedFacts(extractDisclosureFacts(doc.blocks, url, isRelease), { url, sha256: doc.sha256 });
        const facts = extract(main, event.url);
        const issues = [];
        for (const url of releaseLinks(main, event)) {
          try { const release = await retrieve(url); docs.push({ url, sha256: release.sha256, retrievedAt: checkedAt }); facts.push(...extract(release, url, true)); }
          catch (error) {
            issues.push(error.message);
            const retained = old?.documents.find(d => d.url === url);
            if (retained) { docs.push(retained); facts.push(...old.facts.filter(f => f.sourceUrl === url)); }
          }
        }
        const unique = facts.filter((f, i) => facts.findIndex(g => g.category === f.category && g.text === f.text && g.period === f.period) === i);
        return { version: DISCLOSURE_VERSION, checkedAt, documents: docs, facts: unique, issue: issues.join('; ') || null };
      } catch (error) {
        return { ...(old ?? { version: DISCLOSURE_VERSION, documents: [], facts: [] }), checkedAt, issue: error.message };
      }
    })();
    cache.set(event.url, task);
    return task;
  };
}

export async function enrichCompanyDisclosures(companies, now = Date.now(), options = {}) {
  const load = createDisclosureLoader({ now, ...options });
  // Prioritize large current losses on the first run; successful cached documents cost no requests on subsequent runs.
  const ordered = [...companies].sort((a, b) => (a.observedReturns[1] ?? 0) - (b.observedReturns[1] ?? 0));
  for (const company of ordered) {
    for (const event of selectDisclosureEvents(company, now)) event.summary = await load(event);
  }
}
