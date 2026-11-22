import { describe,it,expect,vi } from 'vitest';
import { transcriptSource,extractTranscriptFacts,discoverTranscript } from '../../../scripts/lib/nexsi-transcripts.mjs';
import {createDisclosureLoader} from '../../../scripts/lib/nexsi-disclosures.mjs';
import { validDisclosureSource, companyBrief } from '../nexsi-brief';
import type { NexsiEvent, NexsiCompany, NexsiDisclosureFact } from '../nexsi-types';
const event:NexsiEvent={kind:'filing',form:'8-K',items:'2.02',issuerCik:789019,title:'Earnings',source:'SEC EDGAR',publishedAt:'2026-10-28T20:04:00Z',url:'https://www.sec.gov/Archives/edgar/data/789019/000119312526436122/report.htm'};
describe('Official transcript evidence',()=>{
  it('refreshes an expired transcript, reuses a healthy cache and discovers the next reporting quarter',async()=>{
    const apple={...event,issuerCik:320193,url:'https://www.sec.gov/Archives/edgar/data/320193/000032019326000024/aapl.htm'};
    let q=4,year=2026,upper=10,fail=false;
    const fetchImpl=vi.fn(async(input:Parameters<typeof fetch>[0])=>{
      const url=String(input);
      if(fail&&url.includes('stockanalysis'))throw Error('Source temporarily unavailable');
      const text=url.endsWith('aapl.htm')?'<a href="release.htm">Exhibit 99.1 earnings release</a>'
        :url.endsWith('release.htm')?`<p>${['','First','Second','Third','Fourth'][q]} quarter fiscal ${year} results</p>`
        :url.endsWith('/transcripts/')?`<a href="/stocks/aapl/transcripts/123-q${q}-${year}/">Earnings Call: Q${q} ${year}</a>`
        :`<p>Welcome to the Apple Q${q} fiscal year ${year} earnings conference call. As we move ahead into the ${q===4?'December':'March'} quarter, I’d like to review our outlook. We expect our ${q===4?'December':'March'} quarter total company revenue to grow between 7% and ${upper}% year-over-year. With that, I’ll hand it back.</p>`;
      return new Response(`<html><body>${text}</body></html>`);
    });
    const start=Date.parse('2026-11-22'),options={fetchImpl,sleep:async()=>{}};
    const first=await createDisclosureLoader({now:start,...options})(apple);
    expect(first.issue).toBeNull();expect(first.facts[0].text).toContain('7%–10%');expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(await createDisclosureLoader({now:start+1000,...options})({...apple,summary:first})).toEqual(first);expect(fetchImpl).toHaveBeenCalledTimes(4);
    upper=11;
    const refreshed=await createDisclosureLoader({now:start+86400001,...options})({...apple,summary:first});
    expect(refreshed.facts[0].text).toContain('7%–11%');
    fail=true;
    const retained=await createDisclosureLoader({now:start+2*86400001,...options})({...apple,summary:refreshed});
    expect(retained.issue).toContain('temporarily unavailable');expect(retained.facts).toEqual(refreshed.facts);
    expect(retained.documents.find((d:{url:string})=>d.url.includes('stockanalysis'))).toEqual(refreshed.documents.find((d:{url:string})=>d.url.includes('stockanalysis')));
    fail=false;q=1;year=2027;
    const next=await createDisclosureLoader({now:start+80*86400000,...options})({...apple,url:apple.url.replace('000024','000025')});
    expect(next.facts[0].period).toBe('Q2 fiscal 2027 (March quarter)');
    expect(next.facts[0].sourceUrl).toContain('-q1-2027/');
  });
  it('discovers Apple by reporting quarter, retains full ranges and excludes analyst questions',()=>{
    const apple={...event,issuerCik:320193,url:'https://www.sec.gov/Archives/edgar/data/320193/000032019326000024/aapl.htm'};
    const index=transcriptSource(apple,['fourth quarter fiscal 2026'])!;
    const source=discoverTranscript({links:[{href:'/stocks/aapl/transcripts/123-q4-2026/',text:'Earnings Call: Q4 2026'},{href:'/stocks/aapl/transcripts/456-q3-2026/',text:'Earnings Call: Q3 2026'}]},index);
    expect(source.url).toBe('https://stockanalysis.com/stocks/aapl/transcripts/123-q4-2026/');
    expect(()=>discoverTranscript({links:[{href:'https://evil.test/stocks/aapl/transcripts/123-q4-2026/',text:'Earnings Call: Q4 2026'}]},index)).toThrow();
    const text='Welcome to the Apple Q4 fiscal year 2026 earnings conference call. As we move ahead into the December quarter, I would like to review our outlook. We expect our December quarter total company revenue to grow between 7% and 10% year-over-year. We expect gross margin to be between 45% and 46%. We expect operating expenses to be between $20.4 billion and $20.8 billion. With that, I will hand it back. Analyst: We expect gross margin to be between 90% and 95%.';
    const actual=text.replace('I would','I’d').replace('I will','I’ll');
    const facts=extractTranscriptFacts(actual,apple,source);
    expect(facts).toHaveLength(3);
    expect(facts[0].period).toBe('Q1 fiscal 2027 (December quarter)');
    expect(facts[0].text).toContain('7%–10%');
    expect(facts[1].text).toContain('45%–46%');
    expect(facts.every((f:{sourceKind:string})=>f.sourceKind==='third-party-transcript')).toBe(true);
    expect(()=>extractTranscriptFacts(actual.replace('fiscal year 2026','fiscal year 2025'),apple,source)).toThrow();
    expect(validDisclosureSource(source.url,apple)).toBe(true);
    expect(validDisclosureSource(source.url,event)).toBe(false);
  });
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
    expect(companyBrief(c,{start:'2026-10-26',end:'2026-10-27'},Date.parse('2026-11-22')).categories[1].items[0].timing).toBe('after');
  });
});
