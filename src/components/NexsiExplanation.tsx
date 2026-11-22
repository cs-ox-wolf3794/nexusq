import { l as localize, t as tr } from '../lib/i18n';
import type { Attribution } from "../lib/nexsi-model";
import type { NexsiCompany, NexsiEvent, NexsiFile } from "../lib/nexsi-types";
import { CALENDAR_SOURCE, FUTURE_CALENDAR_SOURCE, FACTOR_EXPLANATIONS, TIMING_LABELS, disclosureContext, evidenceForMove, explainMove, isPrimaryFiling, reviewedDisclosure, signed, type EvidenceTiming } from "../lib/nexsi-explanation";
import { displayInstant } from "../lib/research-ui";
import { ResearchDisclosure } from "./WorkspaceUI";
import { HowToRead } from "./Guidance";
import { NexsiCompanyBrief } from "./NexsiCompanyBrief";

export function MoveExplanation({ move, company, factors, now }: { move: Attribution; company: NexsiCompany; factors: NexsiFile["factors"]; now: number }) {
  const reading = explainMove(move);
  return <section className="nexsi-explanation" aria-label={tr("Explanation of the selected move")}>
    <h3>{localize(move.actual <= -3 ? "Understanding this major drop" : "Understanding this move")}</h3>
    <p className="nexsi-lead"><strong>{localize(company.symbol)} {localize(move.actual < 0 ? "fell" : "rose")} {localize(Math.abs(move.actual).toFixed(2))}{tr("%.")}</strong> {localize(reading.headline)}</p>
    <ResearchDisclosure title={tr("Detailed interpretation & limitations")} description="Energy, other modeled factors, the unexplained remainder and the limits of each estimate">
    <div className="nexsi-reasons">
      <article><h4>{localize(reading.energyLabel)}</h4><p>{localize(reading.energyText)}</p><p className="nexsi-foot">{tr("95% parameter interval: ")}{localize(signed(move.energyCI[0]))}{tr(" to ")}{localize(signed(move.energyCI[1]))}{tr(" pp. This measures parameter uncertainty, not the full range of possible causes.")}</p>
        {localize(reading.energyShare != null ? <p>{tr("Model-implied energy share of the net loss: ")}<strong>{localize(reading.energyShare.toFixed(1))}{tr("%")}</strong>{tr(". Offsetting contributions can make this exceed 100%; it is not a verified causal share.")}</p>
          : move.actual <= -3 && <p className="nexsi-foot">{localize(reading.energyState === "fragile" ? "An energy share of the loss is withheld because the market inputs are outside the model's usual range." : reading.energyState === "inconclusive" ? "An energy share of the loss is withheld because the uncertainty interval includes zero." : "The estimated energy component supported the stock, so it is not counted as a share of the loss.")}</p>)}</article>
      <article><h4>{tr("Other modeled factors · ")}{localize(signed(reading.other))}{tr(" pp")}</h4><p>{localize(reading.otherText)}</p><p className="nexsi-foot">{tr("The breakdown below separates broad market, relative technology and rates. The baseline is the fitted intercept, not an identified event.")}</p></article>
      <article><h4>{tr("Unexplained remainder · ")}{localize(signed(move.components.unexplained))}{tr(" pp")}</h4><p>{localize(reading.residualText)}</p><p className="nexsi-foot">{tr("Earnings, guidance, valuation, competition, policy and positioning are possible avenues to investigate. Their individual impacts have not been measured here.")}</p></article>
    </div>
    </ResearchDisclosure>
    {localize(move.end === company.asOf && company.validation && (!company.validation.energyImprovesFit || company.validation.r2 < 0) && <p className="nexsi-alert">{tr("⚠ Recent model check: ")}{localize(company.validation.r2 < 0 ? "the full model performed worse than its historical-mean benchmark." : "adding energy did not improve the recent explanatory fit.")}{tr(" This further limits confidence in an energy-led explanation.")}</p>)}
    <NexsiCompanyBrief company={company} move={move} now={now} />
    <ResearchDisclosure title={tr("Inspect the market inputs")} description="Observed factor moves, fitted contributions and downloadable evidence">
    <h3>{tr("Market inputs behind the estimate")}</h3>
    <p className="sub">{tr("Actual input moves over ")}{localize(move.start)}{tr(" → ")}{localize(move.end)}{tr(", alongside their estimated contribution to this stock. Percent changes and percentage-point contributions are different measures.")}</p>
    <table className="nexsi-drivers"><caption className="sr-only">{tr("Observed factor moves and estimated stock-return contributions")}</caption>
      <thead><tr><th scope="col">{tr("Factor & source")}</th><th scope="col">{tr("Input move (%)")}</th><th scope="col">{tr("Stock contribution (pp)")}</th></tr></thead>
      <tbody>{localize(FACTOR_EXPLANATIONS.map(f => <tr key={f.key}>
        <th scope="row"><strong>{localize(f.label)}</strong><small>{localize(f.meaning)}</small><span>{localize(f.symbols.map((s, i) => <span key={s}>{localize(i > 0 && " · ")}<a href={factors.find(v => v.symbol === s)?.sourceUrl ?? `https://finance.yahoo.com/quote/${encodeURIComponent(s)}/history/`} target="_blank" rel="noreferrer">{localize(s)}{tr(" history ↗")}</a></span>))}</span></th>
        <td data-label={tr("Input move")}>{localize(move.factorReturns ? `${signed(move.factorReturns[f.key])}%` : "Awaiting refreshed inputs")}</td>
        <td data-label={tr("Stock contribution")}>{localize(signed(move.components[f.key]))}{tr(" pp")}</td>
      </tr>))}</tbody>
    </table>
    <p className="nexsi-foot">{tr("Energy (")}{localize(signed(move.energy))}{tr(" pp) + other modeled factors (")}{localize(signed(reading.other))}{tr(" pp) + unexplained remainder (")}{localize(signed(move.components.unexplained))}{tr(" pp) reconcile to ")}{localize(signed(move.actual))}{tr("% before display rounding. Contributions describe associations after the model's controls; they do not establish causality or exclude indirect energy effects.")}</p>
    <p className="nexsi-foot"><a href={`${import.meta.env.BASE_URL}data/nexsi-prices.json`}>{tr("Download the dated price inputs")}</a>{tr(" · ")}<a href={`${import.meta.env.BASE_URL}data/nexsi.json`}>{tr("Download the fitted contribution results")}</a>{tr(". Source links may reflect later revisions; the downloadable snapshot records the inputs used here.")}</p>
    </ResearchDisclosure>
  </section>;
}

function EvidenceCard({ event, timing, company, move }: { event: NexsiEvent; timing: EvidenceTiming; company: NexsiCompany; move?: Attribution | null }) {
  const reviewed = reviewedDisclosure(company.symbol, event, move);
  const primary = isPrimaryFiling(event);
  return <li className="nexsi-evidence-card">
    <div className="nexsi-evidence-tags"><span className="fresh fresh-info">{localize(primary ? "▣ Primary issuer filing" : "↗ Unreviewed reporting")}</span><span>{localize(move ? TIMING_LABELS[timing] : "Recent source context")}</span></div>
    <a href={event.url} target="_blank" rel="noreferrer"><span lang="en" translate="no">{event.title}</span>{tr(" ↗")}</a>
    <small>{localize(event.source)}{tr(" · ")}{localize(primary ? "SEC acceptance" : "Feed publication")}{tr(": ")}{localize(displayInstant(event.publishedAt,'ET'))}{localize(primary && event.reportDate && ` · Reported event/period date: ${event.reportDate}`)}</small>
    <p>{localize(reviewed ?? disclosureContext(event))}</p>
    {localize(reviewed && <small>{tr("Document reviewed 22 Nov 2026. This note concerns the split, not the cause of the selloff.")}</small>)}
    {localize(primary && event.items && <small>{tr("Reported 8-K items: ")}{localize(event.items)}{tr(". SEC acceptance can follow an earlier company announcement.")}</small>)}
    {localize(event.lastSeenAt && <small>{tr("Last retrieved ")}{localize(displayInstant(event.lastSeenAt))}{tr(". Historical context is retrospective, not a point-in-time news archive.")}</small>)}
  </li>;
}

export function MoveEvidence({ company, move, now }: { company: NexsiCompany; move?: Attribution | null; now: number }) {
  const evidence = evidenceForMove(company.events, move, now);
  const primary = evidence.filter(e => isPrimaryFiling(e.event) && (!move || e.timing === "within"));
  const earlier = evidence.filter(e => isPrimaryFiling(e.event) && move && e.timing === "before");
  const followup = evidence.filter(e => isPrimaryFiling(e.event) && move && (e.timing === "after" || e.timing === "uncertain"));
  const reporting = evidence.filter(e => !isPrimaryFiling(e.event));
  const list = (entries: typeof evidence) => <ul className="nexsi-sources">{localize(entries.map(({ event, timing }) => <EvidenceCard key={event.url} event={event} timing={timing} company={company} move={move} />))}</ul>;
  const stale = !company.eventCheckedAt || now - Date.parse(company.eventCheckedAt) > 72 * 3600000;
  return <section className="nexsi-evidence anchor-target" id="nexsi-evidence" aria-label={tr("Supporting sources for the selected move")}>
    <h3>{tr("Supporting sources & company context")}</h3>
    <p className="sub">{tr("The selected move’s model estimates are supported by the linked price histories. The disclosures below document company events; they do not assign those events a share of the return.")}</p>
    {localize(move && <p className="nexsi-foot">{tr("Primary filings in the window: ")}{localize(primary.length)}{tr(" · Earlier: ")}{localize(earlier.length)}{tr(" · Later or uncertain: ")}{localize(followup.length)}{tr(" · Unreviewed reporting: ")}{localize(reporting.length)}{tr(". Context includes seven calendar days before the starting close and two days after the ending close.")}</p>)}
    {localize((company.eventIssues.length > 0 || stale) && <p className="nexsi-alert">{tr("⚠ Evidence coverage is incomplete")}{localize(stale ? " or overdue" : "")}{tr(". ")}{localize(company.eventIssues.join(" · "))}</p>)}
    {localize(primary.length ? list(primary) : <p className="nexsi-callout">{tr("No retrieved primary filing falls within this move's verified timing window. The cause of the unexplained remainder remains unverified; missing coverage does not mean no company event occurred.")}</p>)}
    {localize(earlier.length > 0 && <><h4>{tr("Earlier primary context")}</h4><p className="sub">{tr("These disclosures were already public before this window. They may provide background, but their timing does not establish a new catalyst for this drop.")}</p>{localize(list(earlier))}</>)}
    {localize(followup.length > 0 && <HowToRead title={tr(`Later disclosures or uncertain timing (${followup.length})`)}>{localize(list(followup))}</HowToRead>)}
    {localize(reporting.length > 0 && <HowToRead title={tr(`Linked reporting — not independently verified (${reporting.length})`)}><p>{tr("These are leads for further reading, not corroborated explanations. Headline text has not been used to estimate energy or company-specific impact. Reports published after the closing boundary are follow-up context.")}</p>{localize(list(reporting))}</HowToRead>)}
    <HowToRead title={tr("How source reliability and timing are handled")}><p>{tr("Primary cards link to issuer filings on SEC EDGAR. Filing topics come from the issuer's reported form items, using ")}<a href="https://www.sec.gov/files/form8-k.pdf" target="_blank" rel="noreferrer">{tr("SEC item definitions")}</a>{tr("; they do not assess whether the news was positive or negative. Ticker-feed headlines are kept separate because relevance and article claims have not been verified.")}</p><p>{tr("Timestamps are converted to New York time and compared with ")}<a href={CALENDAR_SOURCE} target="_blank" rel="noreferrer">{tr("published Nasdaq closes")}</a>{tr(" and ")}<a href={FUTURE_CALENDAR_SOURCE} target="_blank" rel="noreferrer">{tr("2027–28 exchange calendars")}</a>{tr(", including scheduled early closes. Events in the exact closing minute or outside verified calendar coverage are marked uncertain. Unscheduled exchange closures are not modeled. A timestamp match alone is not proof of causation.")}</p><p>{tr("Retrieved links are retained for up to 100 days (at most 80 filings and 300 headlines per company). Free feeds do not provide an exhaustive archive. Retrieval can happen after the event; revised reporting and later disclosures must not be treated as information known beforehand.")}</p></HowToRead>
  </section>;
}
