import { describe,it,expect } from 'vitest';
import {extractGuidanceContext,extractShortGuidance} from '../../../scripts/lib/nexsi-guidance.mjs';
import {applyReviewedFacts} from '../../../scripts/lib/nexsi-disclosures.mjs';
import {companyBrief,guidanceCoverage,type BriefItem} from '../nexsi-brief';
import type {NexsiCompany,NexsiEvent} from '../nexsi-types';
const url='https://www.sec.gov/Archives/edgar/data/1737806/000110465926130116/tm2630261d1_ex99-1.htm';
describe('Guidance availability is evidence, not missing-data inference',()=>{
 it('does not carry a reviewed absence into a new earnings cycle or alter a historical move',()=>{
  const old:NexsiEvent={kind:'filing',title:'Earnings',source:'SEC EDGAR',issuerCik:1737806,form:'6-K',publishedAt:'2026-09-01T12:00:00Z',url,summary:{version:4,checkedAt:'2026-11-22T00:00:00Z',issue:null,documents:[{url,sha256:'a'.repeat(64),retrievedAt:'2026-11-22T00:00:00Z'}],facts:[{category:'guidance',guidanceType:'not-issued',topic:'guidance-absence',text:'No numerical guidance in this release',period:null,sourceUrl:url,method:'reviewed'}]}};
  const fresh:NexsiEvent={...old,url:url.replace('130116','130117'),publishedAt:'2026-11-19T12:00:00Z',form:'8-K',items:'2.02',summary:undefined};
  const c={events:[old,fresh]} as NexsiCompany,now=Date.parse('2026-11-22');
  expect(companyBrief(c,{start:'2026-11-19',end:'2026-11-20'},now).categories[1].items).toEqual([]);
  expect(companyBrief(c,{start:'2026-09-01',end:'2026-09-02'},now).categories[1].items).toHaveLength(1);
 });
 it('preserves explicit bounds and prevents sentence punctuation from entering an EPS value',()=>{
  const facts=extractGuidanceContext(['2026 fiscal year earnings per share projections to be in the range of $8.75 to $8.84.','The full year guidance includes an approximate $0.60 earnings per share benefit from IEEPA tariff refunds.','Planned capital investments for 2026 are expected to be less than $2.4 billion.'],url);
  expect(facts[0].text).toBe('Management EPS outlook: USD 8.75–8.84. The full-year outlook includes approximately USD 0.60 per share from tariff refunds.');
  expect(facts[1].text).toContain('less than USD 2.4 billion');
 });
 it('requires the issuer and unit declaration for inherited capex units',()=>{
  const b=['It is stated in dollars in millions.','We spent $6,435 on capital expenditures, and it is our current intention to spend approximately $7,500 during fiscal 2027.'];
  expect(extractGuidanceContext(b,url)).toEqual([]);
  expect(extractGuidanceContext(b.slice(1),url.replace('/1737806/','/909832/'))).toEqual([]);
  expect(extractGuidanceContext(b,url.replace('/1737806/','/909832/'))[0].text).toContain('7,500 million');
 });
 it('retains organic and constant-currency qualifications and never substitutes a previous forecast',()=>{
  const b=['PepsiCo’s current and previous fiscal 2026 outlook is summarized below.','Current | Previous','Organic Revenue | Approximately +3% | +2% to +4%','Core Constant Currency EPS | +1% to +2% | Low-end of +4% to +6%'];
  const facts=extractGuidanceContext(b,url.replace('/1737806/','/77476/'));
  expect(facts.map((f:{text:string})=>f.text)).toEqual(['Management organic revenue growth (non-GAAP) outlook: approximately 3%.','Management core EPS growth (non-GAAP, constant currency) outlook: 1%–2%.']);
 });
 it('accepts only complete short forward statements and rejects historical or ambiguous years',()=>{
  expect(extractShortGuidance(['Management expects 2026 ongoing EPS of $4.10 to $4.16.'],url)[0].excerpt).toContain('$4.10 to $4.16.');
  for(const s of ['Management expected 2025 EPS of $4.10 to $4.16.','Management reported 2026 EPS above guidance of $4.10.','Management expects EPS of $4.10.','Management expects 2026 and 2027 EPS of $4.10.'])expect(extractShortGuidance([s],url)).toEqual([]);
 });
 it('requires an explicit earnings policy, not a GAAP reconciliation exception',()=>{
  expect(extractGuidanceContext(['We do not provide a reconciliation of non-GAAP outlook to GAAP.'],'https://www.sec.gov/test')).toEqual([]);
  expect(extractGuidanceContext(['It is our policy not to provide earnings guidance in the traditional sense.'],'https://www.sec.gov/test')[0].guidanceType).toBe('policy');
 });
 it('never treats silence or qualitative comments as a permanent no-guidance policy',()=>{
  expect(guidanceCoverage([])).toBe('missing');
  const facts=extractGuidanceContext(['We remain in a strategic investment phase. We will maintain investment discipline while funding initiatives.'],url);
  expect(guidanceCoverage(facts.map(fact=>({fact})) as BriefItem[])).toBe('qualitative');
 });
 it('binds reviewed absence to one exact source; changed documents need a fresh assessment',()=>{
  const reviewed=applyReviewedFacts([],{url,sha256:'7f72b7d0f8406f85479c2e0b1525499b4a483f0aa087eedb111c609f186aeeee'});
  expect(reviewed[0].guidanceType).toBe('not-issued');
  expect(applyReviewedFacts([],{url,sha256:'a'.repeat(64)})).toEqual([]);
  expect(applyReviewedFacts([],{url:url.replace('130116','999999'),sha256:'7f72b7d0f8406f85479c2e0b1525499b4a483f0aa087eedb111c609f186aeeee'})).toEqual([]);
 });
 it('keeps preferred-share tax outlook separate from earnings guidance',()=>{
  const facts=extractGuidanceContext(['ROC Dividend Guidance','Strategy expects the distributions paid on its preferred equity instruments to be treated as non-taxable return of capital.','Strategy’s expectations on E&P may change.'],url);
  expect(facts[0].guidanceType).toBe('limited');
  expect(facts[0].text).toContain('not a revenue, EPS');
 });
});
