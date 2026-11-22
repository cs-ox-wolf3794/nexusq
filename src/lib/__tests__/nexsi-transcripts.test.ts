import { describe,it,expect } from 'vitest';
import { transcriptSource,extractTranscriptFacts } from '../../../scripts/lib/nexsi-transcripts.mjs';
import { validDisclosureSource, companyBrief } from '../nexsi-brief';
import type { NexsiEvent, NexsiCompany, NexsiDisclosureFact } from '../nexsi-types';
const event:NexsiEvent={kind:'filing',form:'8-K',items:'2.02',issuerCik:789019,title:'Earnings',source:'SEC EDGAR',publishedAt:'2026-10-28T20:04:00Z',url:'https://www.sec.gov/Archives/edgar/data/789019/000119312526436122/report.htm'};
describe('Official transcript evidence',()=>{
  it('derives the next transcript from the release period and binds its domain to the issuer',()=>{
    const source=transcriptSource(event,['First quarter fiscal 2027 results'])!;
    expect(source.url).toBe('https://www.microsoft.com/en-us/investor/events/fy-2027/earnings-fy-2027-q1');
    expect(validDisclosureSource(source.url,event)).toBe(true);
    expect(validDisclosureSource(source.url,{...event,issuerCik:1234})).toBe(false);
    expect(validDisclosureSource(source.url+'?redirect=evil',event)).toBe(false);
    expect(transcriptSource({...event,issuerCik:1234},['First quarter fiscal 2027'])).toBeNull();
  });
  it('takes company-wide guidance from the prepared outlook, not segment results or analyst Q&A',()=>{
    const source=transcriptSource(event,['First quarter fiscal 2027'])!;
    const text='Microsoft Fiscal Year 2027 First Quarter Earnings Conference Call. Now, moving to the outlook for our second quarter. We expect revenue from Agents and Infra of $80.1 to $80.7 billion. Therefore, at the total company level, revenue should be between $96 and $97.1 billion. In Q2, we expect CapEx spend will be over $50 billion. With that, let’s go to Q&A. Analyst: revenue should be between $2 and $3 billion.';
    const facts=extractTranscriptFacts(text,event,source);
    expect(facts.map((f:{text:string})=>f.text)).toEqual(['Management total-company revenue outlook: USD 96–97.1 billion.','Management expects capital spending above USD 50 billion.']);
    expect(facts.every((f:{sourceTiming:string})=>f.sourceTiming==='unverified')).toBe(true);
    expect(()=>extractTranscriptFacts(text.replace('2027 First','2026 First'),event,source)).toThrow();
  });
  it('never borrows the SEC timestamp as a verified transcript publication time',()=>{
    const source=transcriptSource(event,['First quarter fiscal 2027'])!;
    const fact={category:'guidance',topic:'revenue',text:'Management outlook',period:'Q2 2027',sourceUrl:source.url,method:'rule-extracted',sourceTiming:'unverified'} as NexsiDisclosureFact;
    const c={events:[{...event,summary:{version:3,checkedAt:'2026-11-22T12:00:00Z',documents:[{url:source.url,sha256:'a'.repeat(64)}],facts:[fact],issue:null}}]} as NexsiCompany;
    expect(companyBrief(c,{start:'2026-10-28',end:'2026-10-29'},Date.parse('2026-11-22')).categories[1].items[0].timing).toBe('uncertain');
  });
});
