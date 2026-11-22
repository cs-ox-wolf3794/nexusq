import type { Snapshot } from './snapshot';
import type { Signal } from './signals';
import type { Series } from './data';
import type { WorkspaceRoute } from './workspace';
import { analysisEligibility, observationEnd, validDate } from './quality';
import { companyStatus, nexsiStatus } from './nexsi-quality';
import { explainMove, signed, easternTime, scheduledEquityClose } from './nexsi-explanation';
import { companyBrief, GUIDANCE_LABELS, guidanceCoverage } from './nexsi-brief';
import { dataExceptions, displayDate } from './research-ui';
import { isRateSeries, seriesCadence } from './transform';
import { companyName } from './display-names';

export const STARTER_WATCHLIST = ['series:BRENT','series:HENRYHUB','company:NVDA','company:MSFT'];
export type BriefSource = {label:string;url:string};
export type BriefInsight = {id:string;kind:string;title:string;body:string;bodySegments?:string[];limit:string;date:string;action:string;route:WorkspaceRoute;extra?:Record<string,string|null>;anchor?:string;sources:BriefSource[];signature:string};
export type WatchRow = {key:string;label:string;symbol:string;value:string;amount?:number;unit?:string;change:string|null;date:string|null;issue:string|null;route:WorkspaceRoute;extra:Record<string,string|null>};
export type BriefCheckpoint = {version:1;reviewedAt:string;items:Record<string,string>};

export function readWatchlist(raw:string|null):string[]|null {
  if(raw===null)return null;
  try {const rows:unknown=JSON.parse(raw);return Array.isArray(rows)?[...new Set(rows.filter((x):x is string=>typeof x==='string'&&/^(company|series):[A-Z0-9_.=-]{1,24}$/.test(x)))].slice(0,12):null;}catch{return null;}
}
export function readCheckpoint(raw:string|null):BriefCheckpoint|null {
  try {const x=JSON.parse(raw??'null');if(!x||x.version!==1||typeof x.reviewedAt!=='string'||!Number.isFinite(Date.parse(x.reviewedAt))||!x.items||Array.isArray(x.items)||typeof x.items!=='object')return null;
    const entries=Object.entries(x.items);if(entries.length>20||entries.some(([key,v])=>key.length>100||typeof v!=='string'||v.length>15000))return null;
    return {version:1,reviewedAt:x.reviewedAt,items:Object.fromEntries(entries) as Record<string,string>};}catch{return null;}
}

/** A dated, observed interval; never turn rate levels or a monthly series into a daily percentage move. */
export function observedDailyChange(series:Series) {
  if(isRateSeries(series)||seriesCadence(series)!=='daily')return null;
  const points=series.adjustedPoints??series.points, a=points.at(-2), b=points.at(-1);
  if(!a||!b||!validDate(a[0])||!validDate(b[0])||a[0]>=b[0]||Date.parse(b[0])-Date.parse(a[0])>7*86400000||![a[1],b[1]].every(v=>Number.isFinite(v)&&v>0))return null;
  return {start:a[0],end:b[0],pct:(b[1]/a[1]-1)*100};
}
export function watchRow(key:string,snapshot:Snapshot,now:number):WatchRow {
  const [type,id]=key.split(':');
  if(type==='company'){
    const c=snapshot.nexsi?.companies.find(c=>c.symbol===id);
    const issue=!c?'Not in the published company universe':nexsiStatus(snapshot.nexsi!,now)??companyStatus(c,now);
    return {key,symbol:id,amount:c?.price??undefined,unit:'USD',label:c?companyName(id,c.name):id,value:c?.price!=null?`$${c.price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'Unavailable',change:!issue&&c?.observedReturns[1]!=null?`${signed(c.observedReturns[1]!)}%`:null,date:c?.asOf??null,issue,route:{page:'nexsi',view:issue?'evidence':'explain'},extra:{company:id,horizon:'1',event:null}};
  }
  const s=snapshot.seriesMap.get(id), assessment=s?analysisEligibility(s,snapshot.quality,now):null;
  const change=s&&assessment?.eligible?observedDailyChange(s):null;
  const last=s?.points.at(-1);
  return {key,symbol:id,amount:last?.[1],unit:s?.unit,label:s?.name??id,value:last?`${last[1].toLocaleString('en-US',{maximumFractionDigits:2})} ${s!.unit}`:'Unavailable',change:change?`${signed(change.pct)}%`:null,date:s?observationEnd(s.id,s.lastUpdated):null,issue:!s||!last?'Source not published':assessment?.eligible?null:assessment?.reason??'Checks unavailable',route:{page:'dashboard',view:'compare'},extra:{s:id,t:'raw',p:'0'}};
}

export function nextCashOpen(now:number):string|null {
  const t=Number.isFinite(now)?easternTime(new Date(now).toISOString()):null;
  if(!t)return null;
  for(let i=0;i<10;i++){
    const date=new Date(Date.parse(t.date+'T12:00:00Z')+i*86400000).toISOString().slice(0,10);
    if(Number(date.slice(0,4))<2026||Number(date.slice(0,4))>2028)return null;
    if(scheduledEquityClose(date)===null)continue;
    const probe=Date.parse(date+'T14:30:00Z'), et=easternTime(new Date(probe).toISOString());
    if(!et)continue;
    const open=probe+(570-et.minute)*60000;
    if(open>now)return new Date(open).toISOString();
  }
  return null;
}

export function buildDailyBrief(snapshot:Snapshot,signals:Signal[],watchlist:string[],now:number) {
  const file=snapshot.nexsi, blocked=file?nexsiStatus(file,now):'Company analysis is not published.';
  const eligible=file&&!blocked?file.companies.filter(c=>c.included&&!companyStatus(c,now)&&c.moves[1]):[];
  const close=eligible.map(c=>c.asOf!).sort().at(-1)??null;
  const cohort=eligible.filter(c=>c.asOf===close), drops=cohort.filter(c=>c.moves[1]!.actual<=-3);
  const inconclusive=drops.filter(c=>c.moves[1]!.energyCI[0]<=0&&c.moves[1]!.energyCI[1]>=0).length;
  const ranked=[...cohort].sort((a,b)=>Math.abs(b.moves[1]!.actual)+Number(watchlist.includes('company:'+b.symbol))*2-(Math.abs(a.moves[1]!.actual)+Number(watchlist.includes('company:'+a.symbol))*2)||a.symbol.localeCompare(b.symbol));
  const focus=ranked.find(c=>Math.abs(c.moves[1]!.actual)>=3);
  const markets=['BRENT','WTI','HENRYHUB','XLE'].map(id=>watchRow('series:'+id,snapshot,now));
  const insights:BriefInsight[]=[];
  const add=(x:Omit<BriefInsight,'signature'>)=>insights.push({...x,signature:JSON.stringify([x.kind,x.title,x.body,x.limit,x.date,x.sources])});
  if(focus){
    const move=focus.moves[1]!,reading=explainMove(move);
    add({id:'company:'+focus.symbol,kind:'Model estimate',title:`${companyName(focus.symbol,focus.name)} ${move.actual<0?'fell':'rose'} ${Math.abs(move.actual).toFixed(2)}%`,body:reading.energyText,limit:`${reading.headline} ${reading.residualText}`,date:move.end,action:`Investigate ${focus.symbol}`,route:{page:'nexsi',view:'explain'},extra:{company:focus.symbol,horizon:'1',event:null},sources:focus.provenance?[{label:'Price history',url:focus.provenance.url}]:[]});
  }
  const energy=['BRENT','WTI','HENRYHUB'].flatMap(id=>{const s=snapshot.seriesMap.get(id);if(!s||!analysisEligibility(s,snapshot.quality,now).eligible)return [];const move=observedDailyChange(s);return move?[{s,move}]:[];});
  if(energy.length){
    const strongest=[...energy].sort((a,b)=>Math.abs(b.move.pct)-Math.abs(a.move.pct))[0];
    const bodySegments=energy.map(({s,move})=>`${s.name}: ${signed(move.pct)}% (${displayDate(move.start,"en-US")}–${displayDate(move.end,"en-US")}).`);
    add({id:'energy',bodySegments,kind:'Observed market data',title:`${strongest.s.name}: ${signed(strongest.move.pct)}% over its latest interval`,body:energy.map(({s,move})=>`${s.name}: ${signed(move.pct)}% (${displayDate(move.start,"en-US")}–${displayDate(move.end,"en-US")}).`).join(' '),limit:'These official spot observations can predate equity closes. They are not the oil/gas futures inputs used in NexSI attribution; no same-day cause is inferred.',date:strongest.move.end,action:'Compare energy benchmarks',route:{page:'dashboard',view:'compare'},extra:{s:energy.map(x=>x.s.id).join(','),t:'index',p:'0'},sources:energy.flatMap(({s})=>s.sourceUrl?[{label:s.name,url:s.sourceUrl}]:[])});
  }
  const energySignal=[...signals].filter(s=>s.seriesIds.some(id=>['energy','fundamentals','renewables'].includes(snapshot.seriesMap.get(id)?.category??''))&&s.seriesIds.every(id=>{const data=snapshot.seriesMap.get(id);return !!data&&analysisEligibility(data,snapshot.quality,now).eligible;})).sort((a,b)=>b.score-a.score||a.subject.localeCompare(b.subject))[0];
  if(energySignal)add({id:'signal',kind:'Market condition',title:energySignal.subject,body:energySignal.detail,limit:`${energySignal.kind} · ${energySignal.value}. A threshold condition does not establish a trading edge; inspect validation before using it.`,date:energySignal.asOf,action:'Inspect the signal',route:{page:'dashboard',view:'pulse'},anchor:'signals',sources:energySignal.seriesIds.flatMap(id=>{const s=snapshot.seriesMap.get(id);return s?.sourceUrl?[{label:s.name,url:s.sourceUrl}]:[];})});
  if(focus){
    const brief=companyBrief(focus,focus.moves[1]!,now), guidance=brief.categories.find(x=>x.category==='guidance')!;
    const item=guidance.items.find(x=>x.fact.topic!=='assumptions');
    if(item){
      const coverage=guidanceCoverage([item]);
      const boundary=['policy','not-issued','withdrawn'].includes(coverage)?'This records the reported guidance position; it does not establish a measured cause of the return.':'This is management’s outlook, not an achieved result or a measured cause of the return.';
      add({id:'disclosure:'+focus.symbol,kind:item.fact.sourceKind==='third-party-transcript'?'Reported transcript':'Company disclosure',title:`${focus.symbol}: ${GUIDANCE_LABELS[coverage].replace(/^./,x=>x.toLowerCase())}`,body:item.fact.text,limit:`${item.timing==='before'?'Earlier context, already published before the selected move.':item.timing==='after'?'Filed after the move; follow-up context only.':item.timing==='uncertain'?'Availability during the selected move is unverified.':'Published during the selected move.'} ${boundary}${guidance.failed?' Some summary sources could not be refreshed.':''}`,date:item.event.publishedAt.slice(0,10),action:`Review ${focus.symbol} disclosures`,route:{page:'nexsi',view:'explain'},extra:{company:focus.symbol,horizon:'1',event:null},anchor:'nexsi-company-brief',sources:[{label:item.fact.sourceKind==='third-party-transcript'?'Published transcript':'Original disclosure',url:item.fact.sourceUrl}]});
    }else add({id:'disclosure:'+focus.symbol,kind:'Coverage gap',title:`${focus.symbol}: guidance coverage missing`,body:'No eligible guidance summary is available for this investigation. This does not establish that the company does not issue guidance.',limit:guidance.failed?'Some summary sources could not be refreshed. Inspect the dated disclosures and coverage checks.':'Open the company brief to inspect source coverage, earnings and company-news context.',date:focus.moves[1]!.end,action:`Review ${focus.symbol} coverage`,route:{page:'nexsi',view:'explain'},extra:{company:focus.symbol,horizon:'1',event:null},anchor:'nexsi-company-brief',sources:[]});
  }
  const exceptions=dataExceptions(snapshot,now,null);
  const title=blocked?'Company analysis needs renewed source checks':drops.length?`${drops.length} major declines in the latest AI / technology close`:'Start with the latest completed market observations';
  const summary=blocked?blocked:!cohort.length?'No eligible company models share a current completed close. This is a coverage gap, not evidence of a quiet market.':drops.length?`${drops.length} of ${cohort.length} eligible securities fell at least 3% on ${displayDate(close,"en-US")}. Energy direction is statistically inconclusive for ${inconclusive} of those declines; the remaining cases still require their individual model checks.`:`No decline of 3% or more among ${cohort.length} eligible AI / technology securities in the latest shared close${close?' on '+displayDate(close,"en-US"):''}. Smaller moves and the full universe remain available in NexSI.`;
  return {title,summary,close,cohort:cohort.length,drops:drops.length,inconclusive,insights,markets,exceptions,focus:focus?.symbol??null,nextOpen:nextCashOpen(now)};
}

export function checkpointFor(insights:BriefInsight[],now:number):BriefCheckpoint { return {version:1,reviewedAt:new Date(now).toISOString(),items:Object.fromEntries(insights.map(x=>[x.id,x.signature]))}; }
export function briefChanges(insights:BriefInsight[],checkpoint:BriefCheckpoint|null) {
  if(!checkpoint)return {first:true,added:[],changed:[],removed:[]} as {first:boolean;added:string[];changed:string[];removed:string[]};
  return {first:false,added:insights.filter(x=>!(x.id in checkpoint.items)).map(x=>x.id),changed:insights.filter(x=>x.id in checkpoint.items&&x.signature!==checkpoint.items[x.id]).map(x=>x.id),removed:Object.keys(checkpoint.items).filter(id=>!insights.some(x=>x.id===id))};
}
