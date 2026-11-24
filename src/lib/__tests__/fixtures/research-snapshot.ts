import type { Snapshot } from '../../snapshot';
import type { Series } from '../../data';
import type { Attribution } from '../../nexsi-model';
import { NEXSI_VERSION } from '../../nexsi-model';
import type { NexsiCompany, NexsiFile } from '../../nexsi-types';

// Synthetic, fixed inputs: unit tests must never depend on the latest production
// close, provider availability or whether today's models are withheld.
export const FIXTURE_TIME = '2026-11-22T12:00:00.000Z';
export function attributionFixture(): Attribution {
  return { start:'2026-11-19', end:'2026-11-20', sessions:1, actual:-5,
    components:{baseline:0,market:-4,technology:-2,rates:-1,oil:0.5,gas:-0.5,unexplained:2},
    energy:0,energyCI:[-1,1],energyShareOfDrop:null,extrapolation:false,warning:null,
    fit:{n:200,r2:0.4,from:'2026-01-05',through:'2026-11-19',maxVif:2,residualSd:0.02} };
}
export function nexsiFixture(): NexsiFile {
  const symbols=['SNDK','NVDA','AAPL',...Array.from({length:92},(_,i)=>`TEST${i}`)];
  const companies:NexsiCompany[]=symbols.map(symbol=>({symbol,name:`Synthetic ${symbol}`,technology:true,group:'Semiconductors',included:true,
    asOf:'2026-11-20',price:95,retrievedAt:FIXTURE_TIME,issue:null,history:[['2026-11-19',100],['2026-11-20',95]],
    moves:{1:attributionFixture(),5:null,20:null},observedReturns:{1:-5,5:null,20:null},drawdown:-5,
    largestDrops:[],validation:null,events:[],eventCheckedAt:FIXTURE_TIME,eventIssues:[],signals:[]}));
  return {engineVersion:NEXSI_VERSION,generated:FIXTURE_TIME,attemptedAt:FIXTURE_TIME,status:'ok',
    universe:{asOf:'2026-11-20',retrievedAt:FIXTURE_TIME,sources:['https://example.com/test-universe'],
      members:companies.map(({symbol,name,technology,group,included})=>({symbol,name,technology,group,included}))},
    companies,failures:[],factors:[],electricity:{retrievedAt:FIXTURE_TIME,rates:[],issue:null}};
}
export function researchSnapshotFixture(): Snapshot {
  const ids=['BRENT','WTI','HENRYHUB','XLE','ICLN','TAN','NASDAQ','SP500','UST10Y','BREAKEVEN10Y','VIX','USGASSTORAGE','USCRUDESTOCKS','DXY'];
  const rows:Series[]=ids.map(id=>({id,name:id,unit:['UST10Y','BREAKEVEN10Y'].includes(id)?'%':id==='HENRYHUB'?'USD/MMBtu':'USD/bbl',
    category:'energy',source:'FRED',sourceUrl:'https://example.com/test-series',cadence:'daily',
    retrievedAt:FIXTURE_TIME,lastUpdated:'2026-11-20',points:[['2026-11-19',100],['2026-11-20',95]]}));
  return {revision:'synthetic-fixture',catalog:{generated:FIXTURE_TIME,series:rows.map(({points,...row})=>({...row,count:points.length}))},
    seriesMap:new Map(rows.map(row=>[row.id,row])),quality:{generated:FIXTURE_TIME,
      series:Object.fromEntries(ids.map(id=>[id,{cadence:'daily',staleDays:2,flags:[]}])),summary:{ok:ids.length,flagged:0,failed:[]}},
    forecasts:{generated:FIXTURE_TIME,series:{}},impact:null,cot:null,backtest:null,
    quotes:{generated:FIXTURE_TIME,targetMinutes:15,quotes:{},failures:[]},
    health:{generated:FIXTURE_TIME,status:'ok',coreFailures:[],enrichmentIssues:[]},nexsi:nexsiFixture(),
    refreshStatus:{attemptedAt:FIXTURE_TIME,outcome:'success',runUrl:null}};
}
