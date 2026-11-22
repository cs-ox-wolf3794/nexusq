import { l as localize, t as tr } from '../lib/i18n';
import type { Attribution } from '../lib/nexsi-model';
import type { NexsiCompany } from '../lib/nexsi-types';
import { companyBrief, possibleRelevance, guidanceCoverage, GUIDANCE_LABELS } from '../lib/nexsi-brief';
import { TIMING_LABELS } from '../lib/nexsi-explanation';

import { displayInstant } from '../lib/research-ui';

const TITLES = { earnings: 'Earnings', guidance: 'Guidance', 'company-news': 'Company news' };
export function NexsiCompanyBrief({ company, move, now }: { company: NexsiCompany; move: Attribution; now: number }) {
  const brief = companyBrief(company, move, now);
  return <section id="nexsi-company-brief" className="nexsi-company-brief anchor-target" aria-label={tr("Earnings, guidance and company news summary")}>
    <h3>{tr("Earnings, guidance & company news")}</h3><p className="nexsi-brief-meta">{tr("Company statements are shown in their original language and reported currency.")}</p>
    <p className="sub">{tr("What the company disclosed, followed by possible relevance to this move. Issuer filings and official transcripts are distinguished from third-party transcripts. A sourced statement does not verify a forecast, allegation or cause of the drop.")}</p>
    {localize((brief.issues.length > 0 || brief.pending > 0) && <p className="nexsi-alert">{tr("⚠ Summary coverage is incomplete. ")}{localize(brief.pending > 0 ? `${brief.pending} nearby disclosures await document summaries. ` : '')}{localize(brief.issues.length > 0 ? 'Some documents could not be refreshed; retained facts keep their original source. ' : '')}{tr("Full filings remain linked in ")}<a href="#nexsi-evidence">{tr("Evidence & coverage")}</a>{tr(".")}</p>)}
    <div className="nexsi-brief-grid">{localize(brief.categories.map(({ category, items, omitted, checked, latestCheck, failed }) => <article key={category}>
      <h4>{localize(TITLES[category])}</h4>
      {localize(latestCheck && <p className="nexsi-brief-meta">{localize(failed ? '⚠ Refresh incomplete · ' : '')}{tr(`${checked} filing${checked === 1 ? '' : 's'} checked`)} · {localize(displayInstant(latestCheck,'ET'))}</p>)}
      {localize(items.length ? <>
        <p className="nexsi-confirmed">{tr("▣ ")}{localize(category === 'guidance' ? GUIDANCE_LABELS[guidanceCoverage(items)] : 'Confirmed company disclosure')}</p>
        {localize(items.some(x=>x.fact.sourceKind==='third-party-transcript') && <p className="nexsi-brief-meta">{tr("Reported management statements · third-party transcript supplied by Stock Analysis. Verify wording against the company webcast; this is not an issuer-published transcript.")}</p>)}
        {localize(items.some(x => x.fact.sourceTiming === 'unverified') && <p className="nexsi-brief-meta">{tr("Transcript context: availability during the selected move has not been verified.")}</p>)}
        {localize(category !== 'company-news' && <p className="nexsi-brief-timing">{localize(TIMING_LABELS[items[0].timing])}</p>)}
        <ul>{localize(items.map(({ fact, event, timing }, i) => <li key={`${event.url}-${i}`}>
          {localize(category === 'company-news' && <p className="nexsi-brief-timing">{localize(TIMING_LABELS[timing])}</p>)}
          {localize(fact.period && (i === 0 || fact.period !== items[i - 1].fact.period) && <p className="nexsi-brief-meta">{tr("Period: ")}{localize(fact.period)}</p>)}<p lang="en" translate="no">{fact.text}</p>
          {localize(fact.excerpt && <blockquote lang="en" translate="no">“{fact.excerpt}”</blockquote>)}
          {localize((category === 'company-news' || i === items.length - 1 || fact.sourceUrl !== items[i + 1].fact.sourceUrl) && <p className="nexsi-brief-meta"><a href={fact.sourceUrl} target="_blank" rel="noreferrer">{localize(fact.sourceKind === 'third-party-transcript' ? 'Read published transcript' : fact.excerpt ? 'Read company statement' : 'Read original disclosure')}</a>{localize(fact.sourceTiming === 'unverified' ? ` · ${fact.sourceKind === 'third-party-transcript' ? 'Third-party' : 'Official company'} transcript; publication time not verified. Linked earnings filing: ` : ' · SEC accepted ')}{localize(displayInstant(event.publishedAt,'ET'))}{localize(event.form?.endsWith('/A') ? ' · Amended filing' : '')}</p>)}
        </li>))}</ul>
        {localize(omitted > 0 && <p className="nexsi-brief-meta">{localize(omitted)}{tr(" additional summary item")}{localize(omitted === 1 ? '' : 's')}{tr(" in the linked disclosures.")}</p>)}
        <div className="nexsi-hypothesis"><strong>{tr("Possible relevance · not a confirmed cause")}</strong><p>{localize(possibleRelevance(category, items.map(x => x.fact.topic)))}</p>{localize(items.every(x => x.timing === 'before') && <p>{tr("This was already disclosed before the selected window. A fresh catalyst has not been established.")}</p>)}{localize(items.every(x => x.timing === 'after') && <p>{tr("This was filed after the move. It is follow-up context, not evidence that the information was public before the drop.")}</p>)}</div>
      </> : <p className="nexsi-brief-empty"><strong>{localize(category === 'guidance' ? 'Guidance coverage missing. ' : category === 'company-news' ? 'No company-news summary extracted. ' : 'Earnings summary unavailable. ')}</strong>{localize(checked ? 'The checked documents did not yield a supported summary for this window. ' : 'No suitable document has been retrieved for this window. ')}{localize(category === 'guidance' ? 'This is a coverage gap, not confirmation that management issued no guidance.' : 'This does not establish that there was no relevant announcement.')}{tr(" Full filings and reported headlines remain in ")}<a href="#nexsi-evidence">{tr("Evidence & coverage")}</a>{tr(".")}</p>)}
    </article>))}</div>
    <p className="nexsi-foot">{tr("No portion of the unexplained return is assigned to these events. Earnings and guidance can include earlier background up to 100 days old; company news uses the nearby source window. Publication timing uses SEC acceptance, which can follow a company announcement. Summaries are selective and retrospective; forecasts retain their original date and assumptions.")}</p>
  </section>;
}
