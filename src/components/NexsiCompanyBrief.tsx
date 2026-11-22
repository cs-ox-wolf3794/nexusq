import type { Attribution } from '../lib/nexsi-model';
import type { NexsiCompany } from '../lib/nexsi-types';
import { companyBrief, possibleRelevance, guidanceCoverage, GUIDANCE_LABELS } from '../lib/nexsi-brief';
import { easternTime, TIMING_LABELS } from '../lib/nexsi-explanation';

const TITLES = { earnings: 'Earnings', guidance: 'Guidance', 'company-news': 'Company news' };
export function NexsiCompanyBrief({ company, move, now }: { company: NexsiCompany; move: Attribution; now: number }) {
  const brief = companyBrief(company, move, now);
  return <section className="nexsi-company-brief" aria-label="Earnings, guidance and company news summary">
    <h3>Earnings, guidance & company news</h3>
    <p className="sub">What the company disclosed, followed by possible relevance to this move. Issuer filings and official transcripts are distinguished from third-party transcripts. A sourced statement does not verify a forecast, allegation or cause of the drop.</p>
    {(brief.issues.length > 0 || brief.pending > 0) && <p className="nexsi-alert">⚠ Summary coverage is incomplete. {brief.pending > 0 ? `${brief.pending} nearby disclosures await document summaries. ` : ''}{brief.issues.length > 0 ? 'Some documents could not be refreshed; retained facts keep their original source. ' : ''}Full filings remain linked under Sources.</p>}
    <div className="nexsi-brief-grid">{brief.categories.map(({ category, items, omitted, checked, latestCheck, failed }) => <article key={category}>
      <h4>{TITLES[category]}</h4>
      {latestCheck && <p className="nexsi-brief-meta">{failed ? '⚠ Refresh incomplete · ' : ''}{checked} filing{checked === 1 ? '' : 's'} checked · {easternTime(latestCheck)?.label ?? latestCheck}</p>}
      {items.length ? <>
        <p className="nexsi-confirmed">▣ {category === 'guidance' ? GUIDANCE_LABELS[guidanceCoverage(items)] : 'Confirmed company disclosure'}</p>
        {items.some(x=>x.fact.sourceKind==='third-party-transcript') && <p className="nexsi-brief-meta">Reported management statements · third-party transcript supplied by Stock Analysis. Verify wording against the company webcast; this is not an issuer-published transcript.</p>}
        {items.some(x => x.fact.sourceTiming === 'unverified') && <p className="nexsi-brief-meta">Transcript context: availability during the selected move has not been verified.</p>}
        {category !== 'company-news' && <p className="nexsi-brief-timing">{TIMING_LABELS[items[0].timing]}</p>}
        <ul>{items.map(({ fact, event, timing }, i) => <li key={`${event.url}-${i}`}>
          {category === 'company-news' && <p className="nexsi-brief-timing">{TIMING_LABELS[timing]}</p>}
          {fact.period && (i === 0 || fact.period !== items[i - 1].fact.period) && <p className="nexsi-brief-meta">Period: {fact.period}</p>}<p>{fact.text}</p>
          {fact.excerpt && <blockquote>“{fact.excerpt}”</blockquote>}
          {(category === 'company-news' || i === items.length - 1 || fact.sourceUrl !== items[i + 1].fact.sourceUrl) && <p className="nexsi-brief-meta"><a href={fact.sourceUrl} target="_blank" rel="noreferrer">{fact.sourceKind === 'third-party-transcript' ? 'Read published transcript' : fact.excerpt ? 'Read company statement' : 'Read original disclosure'}</a>{fact.sourceTiming === 'unverified' ? ` · ${fact.sourceKind === 'third-party-transcript' ? 'Third-party' : 'Official company'} transcript; publication time not verified. Linked earnings filing: ` : ' · SEC accepted '}{easternTime(event.publishedAt)?.label ?? event.publishedAt}{event.form?.endsWith('/A') ? ' · Amended filing' : ''}</p>}
        </li>)}</ul>
        {omitted > 0 && <p className="nexsi-brief-meta">{omitted} additional summary item{omitted === 1 ? '' : 's'} in the linked disclosures.</p>}
        <div className="nexsi-hypothesis"><strong>Possible relevance · not a confirmed cause</strong><p>{possibleRelevance(category, items.map(x => x.fact.topic))}</p>{items.every(x => x.timing === 'before') && <p>This was already disclosed before the selected window. A fresh catalyst has not been established.</p>}{items.every(x => x.timing === 'after') && <p>This was filed after the move. It is follow-up context, not evidence that the information was public before the drop.</p>}</div>
      </> : <p className="nexsi-brief-empty"><strong>{category === 'guidance' ? 'Guidance coverage missing. ' : category === 'company-news' ? 'No company-news summary extracted. ' : 'Earnings summary unavailable. '}</strong>{checked ? 'The checked documents did not yield a supported summary for this window. ' : 'No suitable document has been retrieved for this window. '}{category === 'guidance' ? 'This is a coverage gap, not confirmation that management issued no guidance.' : 'This does not establish that there was no relevant announcement.'} Full filings and reported headlines remain under Sources.</p>}
    </article>)}</div>
    <p className="nexsi-foot">No portion of the unexplained return is assigned to these events. Earnings and guidance can include earlier background up to 100 days old; company news uses the nearby source window. Publication timing uses SEC acceptance, which can follow a company announcement. Summaries are selective and retrospective; forecasts retain their original date and assumptions.</p>
  </section>;
}
