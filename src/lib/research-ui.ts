import { easternTime, scheduledEquityClose } from './nexsi-explanation';
import { validDate, analysisEligibility } from './quality';
import { nexsiStatus } from './nexsi-quality';
import { externalForecastCurrent } from './forecast';
import type { Snapshot } from './snapshot';
import { locale, type Language } from './preferences';
import { quoteHealth } from './quote-health';

export type NoticeTone = 'critical' | 'warning' | 'info';
export type DataException = { id: string; tone: NoticeTone; title: string; detail: string; nexsi?: boolean };

export function displayDate(value: string | null | undefined, language: Language = locale()) {
  if (!value || !validDate(value.slice(0,10))) return 'Not recorded';
  return new Intl.DateTimeFormat(language, { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' }).format(new Date(value.slice(0,10)+'T00:00:00Z'));
}
export function displayInstant(value: string | null | undefined, zone: 'UTC' | 'ET' = 'UTC') {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded';
  // A period/date is not a midnight observation timestamp.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return displayDate(value);
  const timeZone = zone === 'ET' ? 'America/New_York' : 'UTC';
  const date = new Date(value);
  const day = new Intl.DateTimeFormat(locale(), {day:'2-digit',month:'short',year:'numeric',timeZone}).format(date);
  const time = new Intl.DateTimeFormat(locale(), {hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone}).format(date);
  return `${day} · ${time} ${zone}`;
}
export function elapsedLabel(value: string | null | undefined, now: number) {
  if (!value || !value.includes('T')) return 'Time not recorded';
  const delta = now-Date.parse(value);
  if (!Number.isFinite(delta) || delta < -60000) return 'Check timestamp';
  const minutes = Math.max(0, Math.floor(delta/60000));
  if (minutes < 1) return 'Under 1m ago';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes/60)}h ${minutes%60}m ago`;
  return `${Math.floor(minutes/1440)}d ago`;
}
export function usCashSession(now: number) {
  if (!Number.isFinite(now)) return {phase:'unknown',label:'Session unverified'} as const;
  const t = easternTime(new Date(now).toISOString());
  if (!t || Number(t.date.slice(0,4)) < 2026 || Number(t.date.slice(0,4)) > 2028) return {phase:'unknown',label:'Session unverified'} as const;
  const close = scheduledEquityClose(t.date);
  return close !== null && t.minute >= 570 && t.minute < close
    ? {phase:'open',label:'US cash · scheduled open'} as const
    : {phase:'closed',label:'US cash · scheduled closed'} as const;
}
/** The refresh schedule is distinct from exchange hours and provider delay. */
export function quoteScheduleActive(now: number) {
  const date=new Date(now), day=date.getUTCDay();
  return day>0 && day<6 && date.getUTCHours()>=12;
}
export function quoteCheckOverdue(checkedAt: string, now: number) {
  if (!quoteScheduleActive(now)) return false;
  const firstScheduled = new Date(now); firstScheduled.setUTCHours(12,3,0,0);
  if(!Number.isFinite(Date.parse(checkedAt)))return true;
  return now - Math.max(Date.parse(checkedAt), firstScheduled.getTime()) > 15*60000;
}
export function dataExceptions(snapshot: Snapshot | null, now: number, error: string | null): DataException[] {
  const out:DataException[]=[];
  if(error)out.push({id:'publication',tone:'critical',title:'Publication could not be verified',detail:`Previous verified data is retained; the app will retry. ${error}`});
  if(!snapshot)return out;
  const withheld=[...snapshot.seriesMap.values()].filter(s=>!analysisEligibility(s,snapshot.quality,now).eligible);
  if(withheld.length)out.push({id:'inputs',tone:'critical',title:`${withheld.length} analytical inputs withheld`,detail:`Current signals and projections exclude ${withheld.map(s=>s.name).join(', ')}. Inspect Data status for source-specific checks.`});
  if(snapshot.refreshStatus?.outcome==='failure')out.push({id:'refresh',tone:'warning',title:'The last analytical refresh failed',detail:`Attempted ${displayInstant(snapshot.refreshStatus.attemptedAt)}. Retained observations keep their original dates.`});
  if(snapshot.health?.enrichmentIssues.length)out.push({id:'supplementary',tone:'warning',title:`${snapshot.health.enrichmentIssues.length} supplementary-source exceptions`,detail:snapshot.health.enrichmentIssues.map(x=>`${x.source}: ${x.detail}`).join(' · ')});
  const companyIssue=snapshot.nexsi?nexsiStatus(snapshot.nexsi,now):'Company analysis has not been published.';
  if(companyIssue)out.push({id:'nexsi',tone:'critical',title:'NexSI attribution unavailable',detail:companyIssue,nexsi:true});
  else if(snapshot.nexsi?.status==='degraded')out.push({id:'nexsi-sources',tone:'warning',title:'NexSI source coverage incomplete',detail:'Available company models remain visible. Inspect company-specific gaps and retained evidence.',nexsi:true});
  if(snapshot.quotes?.failures.length)out.push({id:'quotes-failed',tone:'warning',title:`${snapshot.quotes.failures.length} quote updates failed`,detail:'Affected quotes retain their last observation time. Quotes are separate from daily attribution.'});
  if(!snapshot.quotes)out.push({id:'quotes-missing',tone:'warning',title:'Intraday quotes unavailable',detail:'Daily analytical observations remain available.'});
  else if(quoteCheckOverdue(snapshot.quotes.generated,now))out.push({id:'quote-schedule',tone:'warning',title:'Scheduled quote checks are overdue',detail:`Last checked ${displayInstant(snapshot.quotes.generated)}. Free quote checks are scheduled every 5 minutes on weekdays, 12:03–23:58 UTC; scheduling and provider delays can exceed the 15-minute price target.`});
  const expected=[...snapshot.catalog.series.filter(s=>s.source==='Yahoo Finance').map(s=>s.id),...(snapshot.impact?.companies??[]).map(c=>c.id),...(snapshot.nexsi?.universe.members??[]).map(c=>c.symbol)];
  const quotes=quoteHealth(snapshot.quotes,now,expected);
  if(quotes.missing.length&&snapshot.quotes)out.push({id:'quotes-coverage',tone:'warning',title:`${quotes.missing.length} expected quotes missing`,detail:quotes.missing.join(', ')});
  if(quotes.delayed.length)out.push({id:'quotes-delayed',tone:'warning',title:`${quotes.delayed.length} quotes outside the 15-minute target`,detail:`US cash market is scheduled open. Observation or retrieval is older than 15 minutes, invalid, or retained after failure: ${quotes.delayed.join(', ')}.`});
  const expired=Object.values(snapshot.forecasts?.series??{}).filter(f=>f.kind==='external'&&!externalForecastCurrent(f,now));
  if(expired.length)out.push({id:'forecasts',tone:'warning',title:`${expired.length} external forecasts withheld`,detail:'Their source versions have expired. Current charts exclude these projections; original source details remain available.'});
  return out;
}

export type ActivityRecord={id:string;at:string;title:string;detail:string;tone:NoticeTone};
export function readActivity(value:string|null):ActivityRecord[] {
  try {const rows:unknown=JSON.parse(value??'[]');return Array.isArray(rows)?rows.filter((x):x is ActivityRecord=>!!x&&typeof x.id==='string'&&x.id.length<250&&typeof x.title==='string'&&x.title.length<250&&typeof x.detail==='string'&&x.detail.length<2000&&Number.isFinite(Date.parse(x.at))&&['critical','warning','info'].includes(x.tone)).slice(0,40):[];} catch{return [];}
}

