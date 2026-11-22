import { l as localize, t as tr } from '../lib/i18n';
import { displayInstant, quoteCheckOverdue, quoteScheduleActive } from "../lib/research-ui";
import { ResearchAlert, TimeStamp } from "./ResearchChrome";
import type { Snapshot } from "../lib/snapshot";
import { quoteStatus } from "../lib/snapshot";
import { analysisEligibility, freshness, observationEnd, sourcePolicy } from "../lib/quality";
import { externalForecastCurrent } from "../lib/forecast";
import { Money } from './Preferences';

const stamp = displayInstant;

export function DataStatus({ snapshot, now, error }: { snapshot: Snapshot | null; now: number; error: string | null }) {
  if (!snapshot) return error ? <p className="load-error" role="alert">{tr("Data could not be verified. ")}{localize(error)}{tr(" Retrying automatically.")}</p> : null;
  const { catalog, seriesMap, quality, health } = snapshot;
  const withheld = [...seriesMap.values()].filter((s) => !analysisEligibility(s, quality, now).eligible);
  const overdue = now - Date.parse(catalog.generated) > 72 * 3600000;
  const review = withheld.length || error || overdue || health?.enrichmentIssues.length || snapshot.refreshStatus?.outcome === "failure";
  return <section className="card data-status" aria-label={tr("Data reliability")}>
    <div className="card-head">
      <h2>{tr("Data status")}</h2>
      <span className={`qc-chip ${review ? "qc-warn" : "qc-ok"}`}>
        {localize(review ? "⚠ Review required" : "✓ Within source tolerances")}
      </span>
    </div>
    <p className="sub">{tr("Analytical snapshot checked ")}{localize(stamp(catalog.generated))}{tr(". Official series follow their publication schedules; daily and monthly observations are not live prices. Open pages check for published updates every minute.")}</p>
    {localize(error && <p className="load-error" role="alert">{tr("Update could not be verified. Keeping the previous verified snapshot and retrying. ")}{localize(error)}</p>)}
    {localize(overdue && <p className="load-error">{tr("The analytical refresh is overdue. Current signals and projections are withheld until QC is renewed.")}</p>)}
    {localize(snapshot.refreshStatus?.outcome === "failure" && <p className="load-error">{tr("The latest analytical refresh failed at ")}{localize(stamp(snapshot.refreshStatus.attemptedAt))}{tr(". The previous verified snapshot remains available. ")}{localize(snapshot.refreshStatus.runUrl && <a href={snapshot.refreshStatus.runUrl} target="_blank" rel="noreferrer">{tr("View refresh status")}</a>)}</p>)}
    <p className="sub">{localize(withheld.length ? `${withheld.length} of ${catalog.series.length} inputs withheld from current signals and projections.` : `${catalog.series.length} inputs passed the current operational checks.`)}{tr(" Historical observations remain available for inspection. Automated checks do not independently certify source accuracy.")}</p>
    {localize(health?.enrichmentIssues.length ? <p className="sub">{tr("⚠ Supplementary sources: ")}{localize(health.enrichmentIssues.length)}{tr(" unresolved update ")}{localize(health.enrichmentIssues.length === 1 ? "check" : "checks")}{tr(". Prior annual observations are labeled where retained; inspect the source details below.")}</p> : null)}
    <details>
      <summary>{tr("Inspect sources, observation dates and quality checks")}</summary>
      {localize(health?.enrichmentIssues.length ? <ul>{localize(health.enrichmentIssues.map((issue, i) => <li key={i}>{localize(issue.source)}{tr(": ")}{localize(issue.detail)}</li>))}</ul> : null)}
      <div className="table-wrap"><table className="beta-table">
        <thead><tr><th>{tr("Series / source")}</th><th>{tr("Observation period through")}</th><th>{tr("Last successful retrieval")}</th><th>{tr("Status")}</th></tr></thead>
        <tbody>{localize(catalog.series.map((entry) => {
          const s = seriesMap.get(entry.id)!;
          const assessment = analysisEligibility(s, quality, now);
          const policy = sourcePolicy(s.id);
          const f = freshness(s.id, s.lastUpdated, now);
          return <tr key={entry.id}>
            <td>{localize(entry.name)}<br/>{localize(entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noreferrer">{localize(entry.source)}</a> : entry.source)}</td>
            <td>{localize(observationEnd(s.id, s.lastUpdated))}{tr(" · ")}{localize(policy.cadence)}<br/><small>{localize(Math.max(0, f.ageDays))}{tr(" days since period end; tolerance ")}{localize(policy.maxAgeDays)}{tr(" days")}</small></td>
            <td>{localize(stamp(s.retrievedAt))}{localize(s.checkedAt && <><br/><small>{tr("Checked ")}{localize(stamp(s.checkedAt))}</small></>)}</td>
            <td>{localize(assessment.eligible ? "✓ Available for snapshot analysis" : `⚠ ${assessment.reason}`)}<br/><small>{localize(policy.note)}</small>
              {localize(quality.series[s.id]?.flags.map((flag) => <p key={flag.code}>{localize(flag.detail)}</p>))}
            </td>
          </tr>;
        }))}</tbody>
      </table></div>
      <h3>{tr("External forecast sources")}</h3>
      <ul>{localize(Object.entries(snapshot.forecasts?.series ?? {}).filter(([, forecast]) => forecast.kind === "external").map(([id, forecast]) => forecast.kind === "external" && <li key={id}>
        <strong>{localize(catalog.series.find((s) => s.id === id)?.name ?? id)}</strong>{tr(": ")}{localize(forecast.sourceUrl ? <a href={forecast.sourceUrl} target="_blank" rel="noreferrer">{localize(forecast.source)}</a> : forecast.source)}{tr(".")}{localize(forecast.sourceVintage && <>{tr(" Source version ")}{localize(forecast.sourceVintage)}{tr(".")}</>)}{tr(" Retrieved ")}{localize(stamp(forecast.retrievedAt))}{tr(".")}{localize(forecast.contentUpdatedAt && <>{tr(" Content last changed/first seen ")}{localize(stamp(forecast.contentUpdatedAt))}{tr("; this is not an official release date.")}</>)}
        {localize(forecast.deliveryUrl && <> <a href={forecast.deliveryUrl} target="_blank" rel="noreferrer">{tr("Delivery source")}</a>{tr(".")}</>)}
        {localize(forecast.retained && <>{tr(" Retained from the last successful retrieval.")}</>)}
        {localize(!externalForecastCurrent(forecast, now) && <>{tr(" ⚠ Expired; withheld from projections.")}</>)}
        {localize(forecast.periodBasis && <> {localize(forecast.periodBasis)}</>)}
      </li>))}</ul>
    </details>
  </section>;
}

export function QuotePanel({ snapshot, now }: { snapshot: Snapshot | null; now: number }) {
  const file = snapshot?.quotes;
  if (!file) return <p className="sub">{tr("Intraday quotes unavailable. Daily analytical observations are shown below.")}</p>;
  return <section className="card" aria-label={tr("Latest market quotes")}>
    <div className="card-head"><h2>{tr("Latest ETF quotes")}</h2><span className="sub">{tr("Target: checks every 15 minutes")}</span></div>
    <p className="sub">{tr("Yahoo Finance quotes, shown separately from completed daily observations. Delivery is best effort; exchange delays vary. These quotes do not update the daily signals, betas or forecasts.")}</p>
    {localize(quoteCheckOverdue(file.generated,now) && <ResearchAlert title={tr("Scheduled quote checks are overdue")}>{tr("Quote checks have not run in the last 30 minutes. Checks are scheduled every 15 minutes on weekdays, from 12:07 to 23:52 UTC.")}</ResearchAlert>)}
    {localize(!quoteScheduleActive(now) && now-Date.parse(file.generated)>30*60000 && <p className="quote-schedule-note">{tr("Outside the quote-refresh schedule · weekdays, every 15 minutes from 12:07 to 23:52 UTC. The last reported quotes remain visible with their original observation times.")}</p>)}
    {localize(file.failures.length > 0 && <ResearchAlert title={tr("Quote updates incomplete")}>{localize(file.failures.length)}{tr(" quote sources could not be refreshed. Retained prices preserve their observation dates.")}</ResearchAlert>)}
    <div className="quote-grid">{localize(["XLE", "ICLN", "TAN", "GOLD"].map((id) => {
      const quote = file.quotes[id];
      if (!quote) return <div className="quote-tile" key={id}><strong>{localize(id)}</strong><p>{tr("Quote unavailable")}</p></div>;
      const status = quoteStatus(quote, now);
      return <div className="quote-tile" key={id}>
        <strong>{localize(quote.symbol)}</strong><div className="quote-price"><Money value={quote.price} unit={quote.currency}/></div>
        <p className="quote-state">{localize(status.label)}</p><TimeStamp label="Quote observed" value={quote.observedAt}/><TimeStamp label="Source checked" value={quote.checkedAt}/><p className="quote-delay">{tr("Provider delay: ")}{localize(quote.delayMinutes == null ? "not disclosed" : `${quote.delayMinutes} min`)}</p>
      </div>;
    }))}</div>
    <details className="company-quotes">
      <summary>{tr("Inspect company quotes")}</summary>
      <div className="table-wrap"><table className="beta-table">
        <thead><tr><th>{tr("Instrument")}</th><th>{tr("Quote")}</th><th>{tr("Observed at")}</th><th>{tr("Status")}</th></tr></thead>
        <tbody>{localize(Object.values(file.quotes).filter((quote) => !["XLE", "ICLN", "TAN", "GOLD"].includes(quote.id)).map((quote) => <tr key={quote.id}>
          <td>{localize(quote.name)}{tr(" (")}{localize(quote.symbol)}{tr(")")}</td><td><Money value={quote.price} unit={quote.currency}/></td><td>{localize(stamp(quote.observedAt))}</td><td>{localize(quoteStatus(quote, now).label)}</td>
        </tr>))}</tbody>
      </table></div>
    </details>
  </section>;
}
