import type { NexsiCompany } from './nexsi-types';
import type { Attribution } from './nexsi-model';
import { evidenceForMove, isPrimaryFiling, disclosureContext } from './nexsi-explanation';
import { companyBrief } from './nexsi-brief';

/** An empty bounded feed is not evidence that no company news exists elsewhere. */
export function companyNewsCoverage(company:NexsiCompany,move:Pick<Attribution,'start'|'end'>,now:number) {
  const nearby=evidenceForMove(company.events,move,now);
  const filings=nearby.filter(x=>isPrimaryFiling(x.event)&&/^(8-K|6-K)(\/A)?$/.test(x.event.form??''));
  const reporting=nearby.filter(x=>x.event.kind==='headline');
  const checks=(['filing','headline'] as const).map(kind=>({kind,...company.evidenceChecks?.[kind]}));
  const complete=checks.every(c=>c.status==='available'&&c.successfulAt&&now-Date.parse(c.successfulAt)>=0&&now-Date.parse(c.successfulAt)<=24*3600000);
  const unparsed=filings.filter(x=>!x.event.summary?.documents.length||x.event.summary?.issue);
  const summarized=companyBrief(company,move,now).categories.find(c=>c.category==='company-news')!.items.length;
  const announcements=(company.issuerNews?.items??[]).filter(x=>Date.parse(x.at)>=Date.parse(move.start)-7*86400000&&Date.parse(x.at)<=Math.min(Date.parse(move.end)+3*86400000-1,now));
  const issuerFailed=company.issuerNews?.status==='failed';
  const status=!complete||issuerFailed?'missing':unparsed.length?'incomplete':summarized||announcements.length?'confirmed':filings.length?'filings-only':reporting.length?'reporting-only':'none-found';
  return {status,checks,complete,announcements,filings:filings.map(x=>({...x,context:disclosureContext(x.event)})),reporting,summarized,unparsed:unparsed.length,
    start:new Date(Date.parse(move.start)-7*86400000).toISOString().slice(0,10),end:new Date(Math.min(Date.parse(move.end)+2*86400000,now)).toISOString().slice(0,10)};
}
