import { displayInstant, quoteCheckOverdue, quoteScheduleActive } from "../lib/research-ui";
import { ResearchAlert, TimeStamp } from "./ResearchChrome";
import type { Snapshot } from "../lib/snapshot";
import { quoteStatus } from "../lib/snapshot";
import { analysisEligibility, freshness, observationEnd, sourcePolicy } from "../lib/quality";
import { externalForecastCurrent } from "../lib/forecast";

const stamp = displayInstant;

export function DataStatus({ snapshot, now, error }: { snapshot: Snapshot | null; now: number; error: string | null }) {
  if (!snapshot) return error ? <p className="load-error" role="alert">Data could not be verified. {error} Retrying automatically.</p> : null;
  const { catalog, seriesMap, quality, health } = snapshot;
  const withheld = [...seriesMap.values()].filter((s) => !analysisEligibility(s, quality, now).eligible);
  const overdue = now - Date.parse(catalog.generated) > 72 * 3600000;
  const review = withheld.length || error || overdue || health?.enrichmentIssues.length || snapshot.refreshStatus?.outcome === "failure";
  return <section className="card data-status" aria-label="Data reliability">
    <div className="card-head">
      <h2>Data status</h2>
      <span className={`qc-chip ${review ? "qc-warn" : "qc-ok"}`}>
        {review ? "⚠ Review required" : "✓ Within source tolerances"}
      </span>
    </div>
    <p className="sub">Analytical snapshot checked {stamp(catalog.generated)}. Official series follow their publication schedules;
      daily and monthly observations are not live prices. Open pages check for published updates every minute.</p>
    {error && <p className="load-error" role="alert">Update could not be verified. Keeping the previous verified snapshot and retrying. {error}</p>}
    {overdue && <p className="load-error">The analytical refresh is overdue. Current signals and projections are withheld until QC is renewed.</p>}
    {snapshot.refreshStatus?.outcome === "failure" && <p className="load-error">The latest analytical refresh failed at {stamp(snapshot.refreshStatus.attemptedAt)}. The previous verified snapshot remains available. {snapshot.refreshStatus.runUrl && <a href={snapshot.refreshStatus.runUrl} target="_blank" rel="noreferrer">View refresh status</a>}</p>}
    <p className="sub">{withheld.length ? `${withheld.length} of ${catalog.series.length} inputs withheld from current signals and projections.` : `${catalog.series.length} inputs passed the current operational checks.`} Historical observations remain available for inspection. Automated checks do not independently certify source accuracy.</p>
    {health?.enrichmentIssues.length ? <p className="sub">⚠ Supplementary sources: {health.enrichmentIssues.length} unresolved update {health.enrichmentIssues.length === 1 ? "check" : "checks"}. Prior annual observations are labeled where retained; inspect the source details below.</p> : null}
    <details>
      <summary>Inspect sources, observation dates and quality checks</summary>
      {health?.enrichmentIssues.length ? <ul>{health.enrichmentIssues.map((issue, i) => <li key={i}>{issue.source}: {issue.detail}</li>)}</ul> : null}
      <div className="table-wrap"><table className="beta-table">
        <thead><tr><th>Series / source</th><th>Observation period through</th><th>Last successful retrieval</th><th>Status</th></tr></thead>
        <tbody>{catalog.series.map((entry) => {
          const s = seriesMap.get(entry.id)!;
          const assessment = analysisEligibility(s, quality, now);
          const policy = sourcePolicy(s.id);
          const f = freshness(s.id, s.lastUpdated, now);
          return <tr key={entry.id}>
            <td>{entry.name}<br/>{entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noreferrer">{entry.source}</a> : entry.source}</td>
            <td>{observationEnd(s.id, s.lastUpdated)} · {policy.cadence}<br/><small>{Math.max(0, f.ageDays)} days since period end; tolerance {policy.maxAgeDays} days</small></td>
            <td>{stamp(s.retrievedAt)}{s.checkedAt && <><br/><small>Checked {stamp(s.checkedAt)}</small></>}</td>
            <td>{assessment.eligible ? "✓ Available for snapshot analysis" : `⚠ ${assessment.reason}`}<br/><small>{policy.note}</small>
              {quality.series[s.id]?.flags.map((flag) => <p key={flag.code}>{flag.detail}</p>)}
            </td>
          </tr>;
        })}</tbody>
      </table></div>
      <h3>External forecast sources</h3>
      <ul>{Object.entries(snapshot.forecasts?.series ?? {}).filter(([, forecast]) => forecast.kind === "external").map(([id, forecast]) => forecast.kind === "external" && <li key={id}>
        <strong>{catalog.series.find((s) => s.id === id)?.name ?? id}</strong>: {forecast.sourceUrl ? <a href={forecast.sourceUrl} target="_blank" rel="noreferrer">{forecast.source}</a> : forecast.source}.
        {forecast.sourceVintage && <> Source version {forecast.sourceVintage}.</>} Retrieved {stamp(forecast.retrievedAt)}.
        {forecast.contentUpdatedAt && <> Content last changed/first seen {stamp(forecast.contentUpdatedAt)}; this is not an official release date.</>}
        {forecast.deliveryUrl && <> <a href={forecast.deliveryUrl} target="_blank" rel="noreferrer">Delivery source</a>.</>}
        {forecast.retained && <> Retained from the last successful retrieval.</>}
        {!externalForecastCurrent(forecast, now) && <> ⚠ Expired; withheld from projections.</>}
        {forecast.periodBasis && <> {forecast.periodBasis}</>}
      </li>)}</ul>
    </details>
  </section>;
}

export function QuotePanel({ snapshot, now }: { snapshot: Snapshot | null; now: number }) {
  const file = snapshot?.quotes;
  if (!file) return <p className="sub">Intraday quotes unavailable. Daily analytical observations are shown below.</p>;
  return <section className="card" aria-label="Latest market quotes">
    <div className="card-head"><h2>Latest ETF quotes</h2><span className="sub">Target: checks every 15 minutes</span></div>
    <p className="sub">Yahoo Finance quotes, shown separately from completed daily observations. Delivery is best effort; exchange delays vary.
      These quotes do not update the daily signals, betas or forecasts.</p>
    {quoteCheckOverdue(file.generated,now) && <ResearchAlert title="Scheduled quote checks are overdue">Quote checks have not run in the last 30 minutes. Checks are scheduled every 15 minutes on weekdays, from 12:07 to 23:52 UTC.</ResearchAlert>}
    {!quoteScheduleActive(now) && now-Date.parse(file.generated)>30*60000 && <p className="quote-schedule-note">Outside the quote-refresh schedule · weekdays, every 15 minutes from 12:07 to 23:52 UTC. The last reported quotes remain visible with their original observation times.</p>}
    {file.failures.length > 0 && <ResearchAlert title="Quote updates incomplete">{file.failures.length} quote sources could not be refreshed. Retained prices preserve their observation dates.</ResearchAlert>}
    <div className="quote-grid">{["XLE", "ICLN", "TAN", "GOLD"].map((id) => {
      const quote = file.quotes[id];
      if (!quote) return <div className="quote-tile" key={id}><strong>{id}</strong><p>Quote unavailable</p></div>;
      const status = quoteStatus(quote, now);
      return <div className="quote-tile" key={id}>
        <strong>{quote.symbol}</strong><div className="quote-price">{quote.price.toLocaleString("en-US", { maximumFractionDigits: 2 })} {quote.currency}</div>
        <p className="quote-state">{status.label}</p><TimeStamp label="Quote observed" value={quote.observedAt}/><TimeStamp label="Source checked" value={quote.checkedAt}/><p className="quote-delay">Provider delay: {quote.delayMinutes == null ? "not disclosed" : `${quote.delayMinutes} min`}</p>
      </div>;
    })}</div>
    <details className="company-quotes">
      <summary>Inspect company quotes</summary>
      <div className="table-wrap"><table className="beta-table">
        <thead><tr><th>Instrument</th><th>Quote</th><th>Observed at</th><th>Status</th></tr></thead>
        <tbody>{Object.values(file.quotes).filter((quote) => !["XLE", "ICLN", "TAN", "GOLD"].includes(quote.id)).map((quote) => <tr key={quote.id}>
          <td>{quote.name} ({quote.symbol})</td><td>{quote.price.toFixed(2)} {quote.currency}</td><td>{stamp(quote.observedAt)}</td><td>{quoteStatus(quote, now).label}</td>
        </tr>)}</tbody>
      </table></div>
    </details>
  </section>;
}
