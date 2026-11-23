import { describe,it,expect,vi } from 'vitest';
import { parseIssuerNews,createIssuerNewsLoader,ISSUER_NEWS } from '../../../scripts/lib/issuer-news.mjs';
import { extractCompanyNews } from '../../../scripts/lib/nexsi-news.mjs';
import { companyNewsCoverage } from '../company-news';
import { quoteHealth } from '../quote-health';
import { quoteStatus,type Quote } from '../snapshot';
import type { NexsiCompany } from '../nexsi-types';
const now=Date.parse('2026-11-23T16:00:00Z');
const move={start:'2026-11-19',end:'2026-11-20'};
describe('Company news source and coverage integrity',()=>{
  it('keeps Atom update timestamps distinct from first publication and rejects off-source/future items',()=>{
    const xml='<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Company update</title><link href="https://www.apple.com/newsroom/2026/11/update/"/><updated>2026-11-20T12:00:00Z</updated></entry><entry><title>Wrong site</title><link href="https://evil.test/"/><published>2026-11-20T12:00:00Z</published></entry></feed>';
    expect(parseIssuerNews(xml,ISSUER_NEWS.AAPL,now)).toEqual([{title:'Company update',url:'https://www.apple.com/newsroom/2026/11/update/',at:'2026-11-20T12:00:00.000Z',dateKind:'updated'}]);
    expect(()=>parseIssuerNews(xml.replaceAll('2026-11-20','2026-11-24'),ISSUER_NEWS.AAPL,now)).toThrow();
    expect(()=>parseIssuerNews('<!DOCTYPE feed [<!ENTITY secret SYSTEM "file:///secret">]><feed/>',ISSUER_NEWS.AAPL,now)).toThrow();
  });
  it('retains source dates on failure and retries stale feeds automatically',async()=>{
    const old={status:'available',sourceUrl:ISSUER_NEWS.AAPL.url,checkedAt:'2026-11-20T12:00:00Z',successfulAt:'2026-11-20T12:00:00Z',items:[{title:'Earlier news'}]};
    const fetcher=vi.fn().mockRejectedValue(Error('HTTP 503'));
    const result=await createIssuerNewsLoader(now,fetcher)('AAPL',old);
    expect(fetcher).toHaveBeenCalledOnce();expect(result.status).toBe('failed');expect(result.successfulAt).toBe(old.successfulAt);expect(result.items).toEqual(old.items);
  });
  it('parses Unicode source titles consistently on Windows and Linux',()=>{
    const xml='<rss><channel><item><title>Microsoft’s next chapter — AI</title><link>https://news.microsoft.com/source/2026/11/update/</link><pubDate>Fri, 20 Nov 2026 12:00:00 GMT</pubDate></item></channel></rss>';
    expect(parseIssuerNews(xml,ISSUER_NEWS.MSFT,now)[0].title).toBe('Microsoft’s next chapter — AI');
  });
  it('recognizes completed debt issuance and interim dividends without inferring price impact',()=>{
    expect(extractCompanyNews(['Item 8.01 Other events','The Board approved the payment of an interim dividend of $1.014 per ordinary share.'],'https://www.sec.gov/example.htm')[0].topic).toBe('capital');
    expect(extractCompanyNews(['Item 8.01 Other events','On November 12, the Company issued €650 million aggregate principal amount of 3.700% Notes due 2029.'],'https://www.sec.gov/example.htm')[0].topic).toBe('financing');
    expect(extractCompanyNews(['The Company confirms that last week it purchased a total of 140,000 ordinary shares.'],'https://www.sec.gov/example.htm',true)[0].topic).toBe('capital');
  });
  it('does not let missing retrieval metadata masquerade as no news',()=>{
    const company={events:[]} as unknown as NexsiCompany;
    expect(companyNewsCoverage(company,move,now).status).toBe('missing');
    const check={status:'available',checkedAt:new Date(now).toISOString(),successfulAt:new Date(now).toISOString(),sourceUrl:'https://www.sec.gov/',returned:0,oldestPublishedAt:null,issue:null} as const;
    company.evidenceChecks={filing:check,headline:check};
    expect(companyNewsCoverage(company,move,now).status).toBe('none-found');
    company.evidenceChecks.headline={...check,status:'failed',issue:'unavailable'};
    expect(companyNewsCoverage(company,move,now).status).toBe('missing');
  });
  it('extracts completed acquisitions despite following incorporation boilerplate and excludes hypothetical risks',()=>{
    const blocks=['Item 8.01 Other Events.','On November 19, 2026, the Company issued a press release announcing the completion of the acquisition of ZenBusiness Inc. The release is incorporated by reference herein.'];
    expect(extractCompanyNews(blocks,'https://www.sec.gov/example.htm')[0]).toMatchObject({category:'company-news',topic:'transaction'});
    expect(extractCompanyNews(['Item 1.01','If the Company completed the acquisition, costs could increase.'],'https://www.sec.gov/example.htm')).toEqual([]);
    expect(extractCompanyNews(['Item 8.01','The company announced a minority investment in a supplier.'],'https://www.sec.gov/example.htm')[0].topic).toBe('investment');
  });
});
describe('Observed price freshness',()=>{
  const quote={id:'AAPL',status:'available',observedAt:'2026-11-20T21:00:00Z',checkedAt:'2026-11-23T15:59:00Z',sessionStart:'2026-11-20T14:30:00Z',sessionEnd:'2026-11-20T21:00:00Z'} as Quote;
  it('flags an old observation even when retrieval succeeds and provider session metadata is stale',()=>{
    expect(quoteStatus(quote,now).label).toBe('Delayed · exceeds 15 min');
    expect(quoteHealth({quotes:{AAPL:quote},generated:quote.checkedAt,targetMinutes:15,failures:[]},now,['AAPL','MSFT'])).toMatchObject({open:true,delayed:['AAPL'],missing:['MSFT'],withinTarget:0});
  });
  it('honors the exact 15-minute boundary and does not claim weekend target compliance',()=>{
    const file={quotes:{AAPL:{...quote,observedAt:'2026-11-23T15:45:00Z'}},generated:quote.checkedAt,targetMinutes:15,failures:[]};
    expect(quoteHealth(file,now).withinTarget).toBe(1);
    expect(quoteHealth(file,now+1).delayed).toEqual(['AAPL']);
    expect(quoteHealth(file,Date.parse('2026-11-22T16:00Z'))).toMatchObject({open:false,withinTarget:null,delayed:[]});
  });
});
