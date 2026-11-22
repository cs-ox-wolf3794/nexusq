import { describe, it, expect, vi } from 'vitest';
import { extractFinancialFacts, enrichFinancialStatements } from '../../../scripts/lib/nexsi-financials.mjs';
import { validFinancialEvidence, companyBrief } from '../nexsi-brief';
import type { NexsiCompany, NexsiEvent, NexsiDisclosureFact } from '../nexsi-types';
const now = Date.parse('2026-11-22T12:00:00Z');
const event: NexsiEvent = { kind: 'filing', title: '10-Q', source: 'SEC EDGAR', form: '10-Q', issuerCik: 1234, reportDate: '2026-09-30', publishedAt: '2026-10-29T20:00:00Z', url: 'https://www.sec.gov/Archives/edgar/data/1234/000000123426000001/report.htm' };
const row = { accn: '0000001234-26-000001', form: '10-Q', start: '2026-07-01', end: '2026-09-30', filed: '2026-10-29', val: 4000000000 };
const data = (rows = [row], currency = 'USD') => ({ cik: 1234, facts: { 'us-gaap': { Revenues: { units: { [currency]: rows } } } } });
describe('Exact-filing SEC financial facts', () => {
  it('uses the current quarter, not YTD, prior-year comparisons or a later restatement', () => {
    const rows = [row, { ...row, start: '2026-01-01', val: 9000000000 }, { ...row, start: '2025-07-01', end: '2025-09-30', val: 3000000000 }, { ...row, accn: '0000001234-26-000002', val: 5000000000 }];
    const facts = extractFinancialFacts(data(rows), event, 'a'.repeat(64), now);
    expect(facts).toHaveLength(1); expect(facts[0]).toMatchObject({ text: 'Consolidated revenue (GAAP): USD 4,000 million.', period: 'Quarter ended 2026-09-30' });
    expect(validFinancialEvidence(facts[0] as NexsiDisclosureFact, event)).toBe(true);
  });
  it('labels annual results and never constructs Q4 by subtraction', () => {
    const e = { ...event, form: '10-K' };
    const facts = extractFinancialFacts(data([{ ...row, form: '10-K', start: '2025-10-01' }]), e, 'a'.repeat(64), now);
    expect(facts[0].period).toBe('Full year ended 2026-09-30');
  });
  it('preserves foreign currencies and withholds conflicting duplicate values or currencies', () => {
    expect(extractFinancialFacts(data([row], 'EUR'), event, 'a'.repeat(64), now)[0].text).toContain('EUR 4,000');
    expect(extractFinancialFacts(data([row,{ ...row,val:5 }]),event,'a'.repeat(64),now)).toEqual([]);
    const d=data();d.facts['us-gaap'].Revenues.units.EUR=[row];
    expect(extractFinancialFacts(d,event,'a'.repeat(64),now)).toEqual([]);
  });
  it('rejects the wrong issuer, future facts and instant/half-year observations', () => {
    expect(()=>extractFinancialFacts({...data(),cik:5678},event,'a'.repeat(64),now)).toThrow();
    expect(extractFinancialFacts(data([{...row,filed:'2026-12-01'},{...row,start:'2026-04-01'},{...row,start:row.end}]),event,'a'.repeat(64),now)).toEqual([]);
  });
  it('allows a 6-K announcement date distinct from its tagged reporting period', () => {
    const e={...event,form:'6-K',reportDate:'2026-10-29'};
    expect(extractFinancialFacts(data([{...row,form:'6-K'}]),e,'a'.repeat(64),now)[0].period).toBe('Quarter ended 2026-09-30');
  });
  it('rejects mismatched accession provenance in the client', () => {
    const f=extractFinancialFacts(data(),event,'a'.repeat(64),now)[0] as NexsiDisclosureFact;
    expect(validFinancialEvidence({...f,evidence:{...f.evidence!,accession:'0000001234-26-000002'}},event)).toBe(false);
  });
  it('refreshes new filings immediately, caches successful summaries, and retains facts on failure', async () => {
    const c={events:[{...event}]} as NexsiCompany;
    const fetchImpl=vi.fn().mockResolvedValue({ok:true,text:async()=>JSON.stringify(data())});
    await enrichFinancialStatements([c],now,{fetchImpl,sleep:async()=>{}});
    const original=c.events[0].financialSummary;
    await enrichFinancialStatements([c],now+1000,{fetchImpl,sleep:async()=>{}});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    fetchImpl.mockResolvedValue({ok:false,status:503});
    await enrichFinancialStatements([c],now+2*86400000,{fetchImpl,sleep:async()=>{}});
    expect(c.events[0].financialSummary?.facts).toEqual(original?.facts);
    expect(c.events[0].financialSummary?.documents).toEqual(original?.documents);
    expect(c.events[0].financialSummary?.issue).toContain('503');
    const rows=companyBrief(c,{start:'2026-11-19',end:'2026-11-20'},now).categories[0];
    expect(rows.items).toHaveLength(1);expect(rows.failed).toBe(true);
  });
});
