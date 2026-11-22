import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Snapshot } from '../snapshot';
import type { Series } from '../data';
import { buildDailyBrief, briefChanges, checkpointFor, nextCashOpen, observedDailyChange, readCheckpoint, readWatchlist, watchRow } from '../nexsum';
import { RESEARCH_QUESTIONS, RESEARCH_TOPICS, matchesResearchQuery, questionAvailable } from '../research-questions';
import { companyName } from '../display-names';
import { WORKSPACES, readWorkspace, SECTION_ROUTES } from '../workspace';

const read=(name:string)=>JSON.parse(readFileSync(new URL(`../../../public/data/${name}.json`,import.meta.url),'utf8'));
const catalog=read('catalog');
const fixture:Snapshot={revision:'fixture',catalog,seriesMap:new Map(catalog.series.map((s:{id:string})=>[s.id,read(s.id)])),quality:read('quality'),forecasts:read('forecasts'),impact:null,cot:null,backtest:null,quotes:read('quotes'),health:read('health'),nexsi:read('nexsi'),refreshStatus:read('refresh-status')};
const now=Date.parse(fixture.nexsi!.generated)+1000;
// Keep editorial test cases stable when the checked-in production snapshot refreshes.
const latestDate=new Date(now-2*86400000).toISOString().slice(0,10);
const priorDate=new Date(now-3*86400000).toISOString().slice(0,10);
function snapshot():Snapshot {
  const s=structuredClone(fixture), c=s.nexsi!.companies.find(c=>c.moves[1])!;
  s.nexsi!.companies.forEach(x=>x.included=false);c.included=true;c.issue=null;c.asOf=latestDate;
  const move=c.moves[1]!;move.start=priorDate;move.end=latestDate;
  move.components.unexplained+=-5-move.actual;move.actual=-5;c.observedReturns[1]=-5;
  c.events=[{title:'8-K test earnings release',kind:'filing',form:'8-K',source:'SEC EDGAR',issuerCik:2023554,items:'2.02',publishedAt:priorDate+'T22:00:00Z',
    url:'https://www.sec.gov/Archives/edgar/data/2023554/000162828026075127/test.htm',
    summary:{version:4,issue:null,checkedAt:new Date(now).toISOString(),documents:[{url:'https://www.sec.gov/Archives/edgar/data/2023554/000162828026075127/release.htm',sha256:'a'.repeat(64)}],
      facts:[{category:'guidance',topic:'outlook',period:'Test forecast period',guidanceType:'quantitative',method:'reviewed',text:'Synthetic test outlook: management expects revenue in the stated range.',sourceUrl:'https://www.sec.gov/Archives/edgar/data/2023554/000162828026075127/release.htm'}]}}];
  return s;
}
const series:Series={id:'BRENT',name:'Brent',unit:'USD/bbl',category:'energy',source:'FRED',lastUpdated:'2026-11-20',cadence:'daily',points:[['2026-11-19',100],['2026-11-20',95]]};

describe('NexSum observed comparisons',()=>{
  it('uses adjusted returns where provided and retains actual observation dates',()=>{
    expect(observedDailyChange(series)).toMatchObject({start:'2026-11-19',end:'2026-11-20',pct:expect.closeTo(-5)});
    expect(observedDailyChange({...series,adjustedPoints:[['2026-11-19',50],['2026-11-20',49]]})?.pct).toBeCloseTo(-2);
    const s=snapshot(),row=watchRow('series:BRENT',s,now);
    expect(row.date).toBe(s.seriesMap.get('BRENT')!.lastUpdated);
    expect(row.date).not.toBe(s.catalog.generated.slice(0,10));
  });
  it('never presents monthly observations, rates, invalid values or long gaps as daily price changes',()=>{
    for(const s of [{...series,cadence:'monthly' as const},{...series,id:'UST10Y'},{...series,points:[['2026-11-19',0],['2026-11-20',5]]},{...series,points:[['2026-11-19',-2],['2026-11-20',5]]},{...series,points:[['2026-11-01',2],['2026-11-20',5]]},{...series,points:[['2026-11-20',2],['2026-11-20',5]]}] as Series[])expect(observedDailyChange(s)).toBeNull();
  });
  it('withholds stale/QC-failed comparisons without erasing the dated observation',()=>{
    const s=snapshot();s.quality.series.BRENT.flags.push({code:'refresh-failed',detail:'Test failure'});
    expect(watchRow('series:BRENT',s,now)).toMatchObject({change:null,date:s.seriesMap.get('BRENT')!.lastUpdated,issue:expect.any(String)});
    expect(watchRow('company:NVDA',s,now+8*86400000)).toMatchObject({change:null,issue:expect.any(String)});
    expect(watchRow('company:UNKNOWN',s,now).issue).toContain('Not in');
    s.seriesMap.set('EMPTY',{...series,id:'EMPTY',points:[]});
    expect(watchRow('series:EMPTY',s,now).value).toBe('Unavailable');
  });
});

describe('NexSum evidence selection',()=>{
  it('uses one shared latest close and excludes flagged company models',()=>{
    const s=snapshot(),template=s.nexsi!.companies.find(c=>c.moves[1])!;
    s.nexsi!.companies=['AAA','BBB','CCC','DDD'].map((symbol,i)=>{const c=structuredClone(template);c.symbol=symbol;c.name=symbol;c.included=true;c.issue=i===3?'price check failed':null;c.asOf=i===2?priorDate:latestDate;c.moves[1]!.end=c.asOf;c.moves[1]!.actual=[-5,-10,-30,-40][i];return c;});
    const brief=buildDailyBrief(s,[],[],now);
    expect(brief.cohort).toBe(2);expect(brief.drops).toBe(2);expect(brief.focus).toBe('BBB');expect(brief.close).toBe(latestDate);
  });
  it('distinguishes empty or suspended coverage from a quiet market',()=>{
    const s=snapshot();s.nexsi!.companies.forEach(c=>c.included=false);
    expect(buildDailyBrief(s,[],[],now).summary).toContain('coverage gap');
    s.nexsi!.status='retained';
    const brief=buildDailyBrief(s,[],[],now);expect(brief.focus).toBeNull();expect(brief.summary).toContain('suspended');
    expect(brief.insights.some(x=>x.kind==='Model estimate')).toBe(false);
  });
  it('does not turn missing guidance into a no-guidance policy',()=>{
    const s=snapshot();s.nexsi!.companies.forEach(c=>c.events=[]);
    const item=buildDailyBrief(s,[],[],now).insights.find(x=>x.id.startsWith('disclosure:'))!;
    expect(item.kind).toBe('Coverage gap');expect(item.title).toContain('coverage missing');expect(item.body).toContain('does not establish');
  });
  it('uses validated source facts with explicit timing rather than inventing a news contribution',()=>{
    const s=snapshot(),brief=buildDailyBrief(s,[],[],now),company=s.nexsi!.companies.find(c=>c.symbol===brief.focus)!;
    const item=brief.insights.find(x=>x.id.startsWith('disclosure:'))!;
    const facts=company.events.flatMap(e=>e.summary?.facts??[]);
    expect(facts.some(f=>f.text===item.body&&f.sourceUrl===item.sources[0].url)).toBe(true);
    expect(item.limit).toMatch(/context|unverified|during/);expect(item.limit).toContain('not an achieved result');
    const energy=brief.insights.find(x=>x.id==='energy');if(energy)expect(energy.limit).toContain('no same-day cause');
  });
  it('ignores retrieval-only changes but detects real content changes at the same close',()=>{
    const s=snapshot(),first=buildDailyBrief(s,[],[],now),checkpoint=checkpointFor(first.insights,now);
    s.nexsi!.generated=new Date(now+1000).toISOString();s.catalog.generated=s.nexsi!.generated;s.quality.generated=s.nexsi!.generated;
    const same=buildDailyBrief(s,[],[],now+2000);
    expect(briefChanges(same.insights,checkpoint)).toEqual({first:false,added:[],changed:[],removed:[]});
    const changed=same.insights.map(x=>({...x,signature:x.signature+' revised'}));
    expect(briefChanges(changed,checkpoint).changed.length).toBe(first.insights.length);
    expect(briefChanges([],checkpoint).removed.length).toBe(first.insights.length);
  });
});

describe('Personal preferences and verified next checkpoints',()=>{
  it('preserves deliberately empty watchlists and rejects malformed storage',()=>{
    expect(readWatchlist(null)).toBeNull();expect(readWatchlist('[]')).toEqual([]);expect(readWatchlist('{')).toBeNull();
    expect(readWatchlist('["company:AAPL","company:AAPL","invalid","series:BRENT"]')).toEqual(['company:AAPL','series:BRENT']);
    expect(readWatchlist(JSON.stringify(Array.from({length:20},(_,i)=>'company:T'+i)))?.length).toBe(12);
    expect(readCheckpoint('{"version":1,"reviewedAt":"yesterday","items":{}}')).toBeNull();
    const checkpoint=checkpointFor(buildDailyBrief(snapshot(),[],[],now).insights,now);
    expect(readCheckpoint(JSON.stringify(checkpoint))).toEqual(checkpoint);
  });
  it('uses exchange holidays, weekends and DST without predicting earnings dates',()=>{
    expect(nextCashOpen(Date.parse('2026-11-22T12:00Z'))).toBe('2026-11-23T14:30:00.000Z');
    expect(nextCashOpen(Date.parse('2026-11-26T12:00Z'))).toBe('2026-11-27T14:30:00.000Z');
    expect(nextCashOpen(Date.parse('2026-07-15T12:00Z'))).toBe('2026-07-15T13:30:00.000Z');
    expect(nextCashOpen(Date.parse('2026-07-15T13:30Z'))).toBe('2026-07-16T13:30:00.000Z');
    expect(nextCashOpen(Date.parse('2029-01-01T00:00Z'))).toBeNull();expect(nextCashOpen(NaN)).toBeNull();
  });
});

describe('Energy research discovery and display names',()=>{
  it('connects every curated question to an existing workspace and published data',()=>{
    for(const q of RESEARCH_QUESTIONS){expect(WORKSPACES[q.route.page].views.some(v=>v.id===q.route.view)).toBe(true);expect(questionAvailable(q,fixture)).toBe(true);if(q.anchor)expect(SECTION_ROUTES[q.anchor]).toEqual(q.route);}
    expect(readWorkspace('')).toEqual({page:'home',view:''});
    expect(readWorkspace('#s=BRENT&t=index').page).toBe('dashboard');
  });
  it('finds natural energy questions and honors source availability',()=>{
    for(const query of ['natural gas','power costs','energy equities','inventories'])expect(RESEARCH_QUESTIONS.some(q=>matchesResearchQuery(query,q.title+' '+q.detail+' '+q.keywords))).toBe(true);
    const oil=RESEARCH_QUESTIONS.find(q=>q.id==='oil-benchmarks')!;
    expect(matchesResearchQuery('How are oil prices moving?',oil.title+' '+oil.keywords)).toBe(true);
    expect(questionAvailable(oil,null)).toBe(false);
  });
  it('offers working stock, capital-market and earnings shortcuts alongside energy research',()=>{
    for(const topic of RESEARCH_TOPICS)expect(RESEARCH_QUESTIONS.some(q=>questionAvailable(q,fixture)&&matchesResearchQuery(topic,q.title+' '+q.detail+' '+q.keywords))).toBe(true);
    const capital=RESEARCH_QUESTIONS.filter(q=>matchesResearchQuery('capital markets',q.title+' '+q.detail+' '+q.keywords));
    expect(capital.some(q=>q.route.page==='nexsi'&&q.route.view==='screen')).toBe(true);
    expect(capital.some(q=>q.anchor==='nexsi-company-brief')).toBe(true);
    const rates=capital.find(q=>q.id==='rates-inflation')!;
    expect(rates.extra?.t).toBe('raw');
    expect(new Set(rates.requires!.map(id=>fixture.seriesMap.get(id)!.unit)).size).toBe(1);
  });
  it('keeps canonical brands and acronyms while preserving mixed-case unknown names',()=>{
    expect(companyName('AAPL','APPLE INC')).toBe('Apple');expect(companyName('NVDA','NVIDIA CORP')).toBe('NVIDIA');
    expect(companyName('MELI','MERCADOLIBRE')).toBe('MercadoLibre');expect(companyName('SNDK','SANDISK')).toBe('SanDisk');
    expect(companyName('UNKNOWN','AI SYSTEMS PLC')).toBe('AI Systems PLC');expect(companyName('OTHER','Example iOS Labs')).toBe('Example iOS Labs');
  });
});
