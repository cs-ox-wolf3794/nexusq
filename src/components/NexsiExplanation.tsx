import type { Attribution } from "../lib/nexsi-model";
import type { NexsiCompany, NexsiEvent, NexsiFile } from "../lib/nexsi-types";
import { CALENDAR_SOURCE, FUTURE_CALENDAR_SOURCE, FACTOR_EXPLANATIONS, TIMING_LABELS, disclosureContext, easternTime, evidenceForMove, explainMove, isPrimaryFiling, reviewedDisclosure, signed, type EvidenceTiming } from "../lib/nexsi-explanation";
import { HowToRead } from "./Guidance";

export function MoveExplanation({ move, company, factors }: { move: Attribution; company: NexsiCompany; factors: NexsiFile["factors"] }) {
  const reading = explainMove(move);
  return <section className="nexsi-explanation" aria-label="Explanation of the selected move">
    <h3>{move.actual <= -3 ? "Understanding this major drop" : "Understanding this move"}</h3>
    <p className="nexsi-lead"><strong>{company.symbol} {move.actual < 0 ? "fell" : "rose"} {Math.abs(move.actual).toFixed(2)}%.</strong> {reading.headline}</p>
    <div className="nexsi-reasons">
      <article><h4>{reading.energyLabel}</h4><p>{reading.energyText}</p><p className="nexsi-foot">95% parameter interval: {signed(move.energyCI[0])} to {signed(move.energyCI[1])} pp. This measures parameter uncertainty, not the full range of possible causes.</p>
        {reading.energyShare != null ? <p>Model-implied energy share of the net loss: <strong>{reading.energyShare.toFixed(1)}%</strong>. Offsetting contributions can make this exceed 100%; it is not a verified causal share.</p>
          : move.actual <= -3 && <p className="nexsi-foot">{reading.energyState === "fragile" ? "An energy share of the loss is withheld because the market inputs are outside the model's usual range." : reading.energyState === "inconclusive" ? "An energy share of the loss is withheld because the uncertainty interval includes zero." : "The estimated energy component supported the stock, so it is not counted as a share of the loss."}</p>}</article>
      <article><h4>Other modeled factors · {signed(reading.other)} pp</h4><p>{reading.otherText}</p><p className="nexsi-foot">The breakdown below separates broad market, relative technology and rates. The baseline is the fitted intercept, not an identified event.</p></article>
      <article><h4>Unexplained remainder · {signed(move.components.unexplained)} pp</h4><p>{reading.residualText}</p><p className="nexsi-foot">Earnings, guidance, valuation, competition, policy and positioning are possible avenues to investigate. Their individual impacts have not been measured here.</p></article>
    </div>
    {move.end === company.asOf && company.validation && (!company.validation.energyImprovesFit || company.validation.r2 < 0) && <p className="nexsi-alert">⚠ Recent model check: {company.validation.r2 < 0 ? "the full model performed worse than its historical-mean benchmark." : "adding energy did not improve the recent explanatory fit."} This further limits confidence in an energy-led explanation.</p>}
    <h3>Market inputs behind the estimate</h3>
    <p className="sub">Actual input moves over {move.start} → {move.end}, alongside their estimated contribution to this stock. Percent changes and percentage-point contributions are different measures.</p>
    <table className="nexsi-drivers"><caption className="sr-only">Observed factor moves and estimated stock-return contributions</caption>
      <thead><tr><th scope="col">Factor & source</th><th scope="col">Input move (%)</th><th scope="col">Stock contribution (pp)</th></tr></thead>
      <tbody>{FACTOR_EXPLANATIONS.map(f => <tr key={f.key}>
        <th scope="row"><strong>{f.label}</strong><small>{f.meaning}</small><span>{f.symbols.map((s, i) => <span key={s}>{i > 0 && " · "}<a href={factors.find(v => v.symbol === s)?.sourceUrl ?? `https://finance.yahoo.com/quote/${encodeURIComponent(s)}/history/`} target="_blank" rel="noreferrer">{s} history ↗</a></span>)}</span></th>
        <td data-label="Input move">{move.factorReturns ? `${signed(move.factorReturns[f.key])}%` : "Awaiting refreshed inputs"}</td>
        <td data-label="Stock contribution">{signed(move.components[f.key])} pp</td>
      </tr>)}</tbody>
    </table>
    <p className="nexsi-foot">Energy ({signed(move.energy)} pp) + other modeled factors ({signed(reading.other)} pp) + unexplained remainder ({signed(move.components.unexplained)} pp) reconcile to {signed(move.actual)}% before display rounding. Contributions describe associations after the model's controls; they do not establish causality or exclude indirect energy effects.</p>
    <p className="nexsi-foot"><a href={`${import.meta.env.BASE_URL}data/nexsi-prices.json`}>Download the dated price inputs</a> · <a href={`${import.meta.env.BASE_URL}data/nexsi.json`}>Download the fitted contribution results</a>. Source links may reflect later revisions; the downloadable snapshot records the inputs used here.</p>
  </section>;
}

function EvidenceCard({ event, timing, company, move }: { event: NexsiEvent; timing: EvidenceTiming; company: NexsiCompany; move?: Attribution | null }) {
  const reviewed = reviewedDisclosure(company.symbol, event, move);
  const primary = isPrimaryFiling(event);
  return <li className="nexsi-evidence-card">
    <div className="nexsi-evidence-tags"><span className="fresh fresh-info">{primary ? "▣ Primary issuer filing" : "↗ Unreviewed reporting"}</span><span>{move ? TIMING_LABELS[timing] : "Recent source context"}</span></div>
    <a href={event.url} target="_blank" rel="noreferrer">{event.title} ↗</a>
    <small>{event.source} · {primary ? "SEC acceptance" : "Feed publication"}: {easternTime(event.publishedAt)?.label ?? event.publishedAt}{primary && event.reportDate && ` · Reported event/period date: ${event.reportDate}`}</small>
    <p>{reviewed ?? disclosureContext(event)}</p>
    {reviewed && <small>Document reviewed 22 Nov 2026. This note concerns the split, not the cause of the selloff.</small>}
    {primary && event.items && <small>Reported 8-K items: {event.items}. SEC acceptance can follow an earlier company announcement.</small>}
    {event.lastSeenAt && <small>Last retrieved {new Date(event.lastSeenAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}. Historical context is retrospective, not a point-in-time news archive.</small>}
  </li>;
}

export function MoveEvidence({ company, move, now }: { company: NexsiCompany; move?: Attribution | null; now: number }) {
  const evidence = evidenceForMove(company.events, move, now);
  const primary = evidence.filter(e => isPrimaryFiling(e.event) && (!move || e.timing === "within"));
  const earlier = evidence.filter(e => isPrimaryFiling(e.event) && move && e.timing === "before");
  const followup = evidence.filter(e => isPrimaryFiling(e.event) && move && (e.timing === "after" || e.timing === "uncertain"));
  const reporting = evidence.filter(e => !isPrimaryFiling(e.event));
  const list = (entries: typeof evidence) => <ul className="nexsi-sources">{entries.map(({ event, timing }) => <EvidenceCard key={event.url} event={event} timing={timing} company={company} move={move} />)}</ul>;
  const stale = !company.eventCheckedAt || now - Date.parse(company.eventCheckedAt) > 72 * 3600000;
  return <section className="nexsi-evidence anchor-target" id="nexsi-evidence" aria-label="Supporting sources for the selected move">
    <h3>Supporting sources & company context</h3>
    <p className="sub">Model estimates above are supported by the linked price histories. The disclosures below document company events; they do not assign those events a share of the return.</p>
    {move && <p className="nexsi-foot">Primary filings in the window: {primary.length} · Earlier: {earlier.length} · Later or uncertain: {followup.length} · Unreviewed reporting: {reporting.length}. Context includes seven calendar days before the starting close and two days after the ending close.</p>}
    {(company.eventIssues.length > 0 || stale) && <p className="nexsi-alert">⚠ Evidence coverage is incomplete{stale ? " or overdue" : ""}. {company.eventIssues.join(" · ")}</p>}
    {primary.length ? list(primary) : <p className="nexsi-callout">No retrieved primary filing falls within this move's verified timing window. The cause of the unexplained remainder remains unverified; missing coverage does not mean no company event occurred.</p>}
    {earlier.length > 0 && <><h4>Earlier primary context</h4><p className="sub">These disclosures were already public before this window. They may provide background, but their timing does not establish a new catalyst for this drop.</p>{list(earlier)}</>}
    {followup.length > 0 && <HowToRead title={`Later disclosures or uncertain timing (${followup.length})`}>{list(followup)}</HowToRead>}
    {reporting.length > 0 && <HowToRead title={`Linked reporting — not independently verified (${reporting.length})`}><p>These are leads for further reading, not corroborated explanations. Headline text has not been used to estimate energy or company-specific impact. Reports published after the closing boundary are follow-up context.</p>{list(reporting)}</HowToRead>}
    <HowToRead title="How source reliability and timing are handled"><p>Primary cards link to issuer filings on SEC EDGAR. Filing topics come from the issuer's reported form items, using <a href="https://www.sec.gov/files/form8-k.pdf" target="_blank" rel="noreferrer">SEC item definitions</a>; they do not assess whether the news was positive or negative. Ticker-feed headlines are kept separate because relevance and article claims have not been verified.</p><p>Timestamps are converted to New York time and compared with <a href={CALENDAR_SOURCE} target="_blank" rel="noreferrer">published Nasdaq closes</a> and <a href={FUTURE_CALENDAR_SOURCE} target="_blank" rel="noreferrer">2027–28 exchange calendars</a>, including scheduled early closes. Events in the exact closing minute or outside verified calendar coverage are marked uncertain. Unscheduled exchange closures are not modeled. A timestamp match alone is not proof of causation.</p><p>Retrieved links are retained for up to 100 days (at most 80 filings and 300 headlines per company). Free feeds do not provide an exhaustive archive. Retrieval can happen after the event; revised reporting and later disclosures must not be treated as information known beforehand.</p></HowToRead>
  </section>;
}
