import type { NexsiCompany } from '../lib/nexsi-types';
import type { Attribution } from '../lib/nexsi-model';
import { companyNewsCoverage } from '../lib/company-news';
import { evidenceTiming, TIMING_LABELS } from '../lib/nexsi-explanation';
import { displayDate, displayInstant } from '../lib/research-ui';
import { t } from '../lib/i18n';

const labels:Record<string,string>={missing:'Source coverage incomplete',incomplete:'Document summaries incomplete',confirmed:'Company announcements available','filings-only':'Filings available · no separate news summary','reporting-only':'Reported headlines available · relevance unverified','none-found':'No items found in the checked source window'};
export function CompanyNewsCoverage({company,move,now}:{company:NexsiCompany;move:Attribution;now:number}) {
  const news=companyNewsCoverage(company,move,now);
  return <div className="company-news-coverage">
    <p className="nexsi-confirmed">{t(labels[news.status])}</p>
    <p className="nexsi-brief-meta">{t('News window')}: {displayDate(news.start)} – {displayDate(news.end)}</p>
    {!news.complete&&<p className="nexsi-brief-meta">{t('Both source feeds need a successful check within 24 hours. Earlier material remains available with its original dates.')}</p>}
    <p>{t(news.status==='none-found'?'The checked sources returned no items in this window. This is not proof that no relevant news exists.':'A missing summary is a coverage gap. Headlines and filing topics below provide additional context, not a verified explanation of the share-price move.')}</p>
    {!!news.announcements.length&&<><h5>{t('From the company newsroom')}</h5><ul>{news.announcements.slice(0,4).map(item=><li key={item.url}>
      <a href={item.url} target="_blank" rel="noreferrer" lang="en" translate="no">{item.title}</a>
      <p className="nexsi-brief-meta">{company.issuerNews!.source} · {t(item.dateKind==='published'?'Published':'Feed updated')}: {displayInstant(item.at,'ET')}</p>
      <p className="nexsi-brief-timing">{t(item.dateKind==='updated'?'Original publication time unverified; this update cannot establish when the news first became public.':TIMING_LABELS[evidenceTiming(item.at,move)])}</p>
    </li>)}</ul></>}
    {!!news.filings.length&&<details><summary>{t('Filing topics and original documents')}</summary><ul>{news.filings.map(({event,context,timing})=><li key={event.url}><a href={event.url} target="_blank" rel="noreferrer">{event.form} · {displayInstant(event.publishedAt,'ET')}</a><p>{t(context)}</p><p className="nexsi-brief-meta">{t(TIMING_LABELS[timing])}</p></li>)}</ul></details>}
    {!!news.reporting.length&&<details><summary>{t(`${news.reporting.length} reported headlines`)}</summary><p>{t('Third-party reporting is a lead to investigate. Ticker association, headline wording and timing do not confirm company relevance or causation.')}</p><ul>{news.reporting.slice(0,8).map(({event,timing})=><li key={event.url}><a href={event.url} target="_blank" rel="noreferrer" lang="en" translate="no">{event.title}</a><p className="nexsi-brief-meta">{event.source} · {displayInstant(event.publishedAt,'ET')} · {t(TIMING_LABELS[timing])}</p></li>)}</ul><a href="#nexsi-evidence">{t('All evidence & coverage')}</a></details>}
    <details><summary>{t('Source checks and coverage limits')}</summary><ul>{news.checks.map(check=><li key={check.kind}>{t(check.kind==='filing'?'SEC filing feed':'Reported-news feed')}: {t(check.status==='available'?'Retrieved':'Coverage missing')} · {displayInstant(check.successfulAt)}{check.issue&&<p>{t('The latest check failed. Earlier evidence retains its original date.')}</p>}</li>)}{company.issuerNews&&<li>{company.issuerNews.source}: {t(company.issuerNews.status==='available'?'Retrieved':'Coverage missing')} · {displayInstant(company.issuerNews.successfulAt)}</li>}</ul><p>{t('Feeds have bounded history and are not an exhaustive news archive. An empty window, an unavailable source and an unparsed document are different coverage states. No residual return is assigned to these items.')}</p></details>
  </div>;
}
