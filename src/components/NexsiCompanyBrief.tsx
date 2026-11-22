import type { Attribution } from '../lib/nexsi-model';
import type { NexsiCompany } from '../lib/nexsi-types';
import { companyBrief, possibleRelevance } from '../lib/nexsi-brief';
import { easternTime, TIMING_LABELS } from '../lib/nexsi-explanation';

const TITLES = { earnings: 'Earnings', guidance: 'Guidance', 'company-news': 'Company news' };
export function NexsiCompanyBrief({ company, move, now }: { company: NexsiCompany; move: Attribution; now: number }) {
  const brief = companyBrief(company, move, now);
  return <section className="nexsi-company-brief" aria-label="Earnings, guidance and company news summary">
    <h3>Earnings, guidance & company news</h3>
    <p className="sub">What the company disclosed, followed by possible relevance to this move. Confirmed disclosure means the statement appears in an issuer filing; it does not verify a forecast, allegation or cause of the drop.</p>
    {(brief.issues.length > 0 || brief.pending > 0) && <p className="nexsi-alert">⚠ Summary coverage is incomplete. {brief.pending > 0 ? `${brief.pending} nearby disclosures await document summaries. ` : ''}{brief.issues.length > 0 ? 'Some documents could not be refreshed; retained facts keep their original source. ' : ''}Full filings remain linked under Sources.</p>}
    <div className="nexsi-brief-grid">{brief.categories.map(({ category, items, omitted }) => <article key={category}>
      <h4>{TITLES[category]}</h4>
      {items.length ? <>
        <p className="nexsi-confirmed">▣ {category === 'guidance' ? 'Confirmed management outlook' : 'Confirmed company disclosure'}</p>
        {category !== 'company-news' && <p className="nexsi-brief-timing">{TIMING_LABELS[items[0].timing]}</p>}
        <ul>{items.map(({ fact, event, timing }, i) => <li key={`${event.url}-${i}`}>
          {category === 'company-news' && <p className="nexsi-brief-timing">{TIMING_LABELS[timing]}</p>}
          {fact.period && (i === 0 || fact.period !== items[i - 1].fact.period) && <p className="nexsi-brief-meta">Period: {fact.period}</p>}<p>{fact.text}</p>
          {fact.excerpt && <blockquote>“{fact.excerpt}”</blockquote>}
          {(category === 'company-news' || i === items.length - 1 || fact.sourceUrl !== items[i + 1].fact.sourceUrl) && <p className="nexsi-brief-meta"><a href={fact.sourceUrl} target="_blank" rel="noreferrer">{fact.excerpt ? 'Read company statement' : 'Read original disclosure'}</a> · SEC accepted {easternTime(event.publishedAt)?.label ?? event.publishedAt}{event.form?.endsWith('/A') ? ' · Amended filing' : ''}</p>}
        </li>)}</ul>
        {omitted > 0 && <p className="nexsi-brief-meta">{omitted} additional summary item{omitted === 1 ? '' : 's'} in the linked disclosures.</p>}
        <div className="nexsi-hypothesis"><strong>Possible relevance · not a confirmed cause</strong><p>{possibleRelevance(category, items.map(x => x.fact.topic))}</p>{items.every(x => x.timing === 'before') && <p>This was already disclosed before the selected window. A fresh catalyst has not been established.</p>}{items.every(x => x.timing === 'after') && <p>This was filed after the move. It is follow-up context, not evidence that the information was public before the drop.</p>}</div>
      </> : <p className="nexsi-brief-empty">No source-backed {category === 'company-news' ? 'company-news' : category} summary is available for this window. This does not mean there was no relevant announcement; consult the full sources below.</p>}
    </article>)}</div>
    <p className="nexsi-foot">No portion of the unexplained return is assigned to these events. Earnings and guidance can include earlier background up to 100 days old; company news uses the nearby source window. Publication timing uses SEC acceptance, which can follow a company announcement. Summaries are selective and retrospective; forecasts retain their original date and assumptions.</p>
  </section>;
}
