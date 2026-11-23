import type { Snapshot } from '../lib/snapshot';
import { ENERGY_INSTRUMENTS, energyQuoteState } from '../lib/energy-quotes';
import { quoteScheduleActive } from '../lib/research-ui';
import { t } from '../lib/i18n';
import { Money } from './Preferences';
import { TimeStamp } from './ResearchChrome';

export function EnergyQuotes({ snapshot, now }: { snapshot: Snapshot | null; now: number }) {
  return <section className="card energy-quotes" aria-label={t('Energy market quotes')}>
    <div className="card-head"><div><p className="eyebrow">{t('Market quotes / official history')}</p><h2>{t('Energy quotes & official observations')}</h2></div><span className="energy-feed-label">{t('Delayed futures · Yahoo Finance')}</span></div>
    <p className="sub">{t('Latest reported futures for market context. FRED spot observations remain the basis for historical energy analysis. These are different instruments and dates, not a same-day price change.')}</p>
    <div className="energy-quote-grid">{ENERGY_INSTRUMENTS.map(instrument => {
      const quote = snapshot?.quotes?.quotes[instrument.id];
      const state = energyQuoteState(quote, instrument, now);
      const official = snapshot?.seriesMap.get(instrument.seriesId);
      const point = official?.points.at(-1);
      return <article className="energy-quote-tile" key={instrument.id}>
        <header><h3>{t(instrument.name)}</h3><span>{instrument.symbol} · NYMEX</span></header>
        <p className="energy-basis">{t('Latest reported futures quote')}</p>
        <div className="energy-quote-price">{state.usable && quote ? <Money value={quote.price} unit={instrument.unit} digits={instrument.digits}/> : <span>—</span>}</div>
        <p className={`energy-quote-state ${state.state}`}>{t(state.label)}</p>
        {state.usable && quote && <div className="energy-quote-times"><TimeStamp label="Quote observed" value={quote.observedAt} now={now}/><TimeStamp label="Source checked" value={quote.checkedAt}/></div>}
        <div className="energy-official"><span className="energy-basis">{t('Official spot observation · FRED')}</span><strong>{point ? <Money value={point[1]} unit={instrument.unit} digits={instrument.digits}/> : t('Observation unavailable')}</strong><TimeStamp label="Observation date" value={point?.[0]}/></div>
        <details><summary>{t('Sources & instrument details')}</summary><div className="energy-source-details">
          <a href={`https://finance.yahoo.com/quote/${encodeURIComponent(instrument.symbol)}/`} target="_blank" rel="noreferrer">Yahoo Finance · {instrument.symbol} ↗</a>
          <p>{t('Provider contract label')}: <span lang="en" translate="no">{state.usable ? quote?.name : t('Not recorded')}</span></p>
          <a href={instrument.contractUrl} target="_blank" rel="noreferrer" lang="en" translate="no">{instrument.contract} · CME ↗</a>
          <p>{t('Provider delay: ')}{quote?.delayMinutes != null ? t(`${quote.delayMinutes} min`) : t('not disclosed')}. {t('Observation age includes provider and publication delays; it is not an exchange-delay guarantee.')}</p>
          <p>{t('The provider rolls these symbols between contracts. Delivery month is only shown when supplied in the original contract label.')}</p>
          {instrument.id === 'BRENT_FUTURES' && <p>{t('Brent BZ is the NYMEX financial contract, not an ICE exchange quote.')}</p>}
          <a href={`https://fred.stlouisfed.org/series/${instrument.fredId}`} target="_blank" rel="noreferrer">FRED · {instrument.fredId} · EIA ↗</a>
          <TimeStamp label="Official source retrieved" value={official?.retrievedAt}/>
        </div></details>
      </article>;
    })}</div>
    <p className="energy-schedule">{!quoteScheduleActive(now) && <strong>{t('Outside the quote-refresh schedule')}{' · '}</strong>}{t('Checks run every 5 minutes on weekdays, 12:03–23:58 UTC, with an independent backup trigger. Futures trade beyond this window; the last reported quote stays visible. Free delivery is best effort, not guaranteed real time.')}</p>
    <p className="sub">{t('Intraday quotes do not recalculate signals, forecasts or NexSI attribution. Those retain their existing completed-observation inputs and methodology.')}</p>
  </section>;
}
