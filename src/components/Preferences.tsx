import { useContext, useEffect, useRef, useState } from 'react';
import { preferences, setPreferences, usePreferences, number, type Language, type Currency } from '../lib/preferences';
import { t } from '../lib/i18n';
import { validFx } from '../lib/fx';
import { FxContext, useMoney } from '../lib/money';
import { displayDate, displayInstant } from '../lib/research-ui';

export function Money({value,unit='USD',digits=2}:{value:number;unit?:string;digits?:number}) {
  const money = useMoney()(value,unit,digits);
  return <span className="money-value" title={money.converted ? `${t('Original')}: ${money.original}` : undefined}><span>{number(money.value,digits,digits)}</span>{' '}<span>{t(money.unit)}</span>{money.fallback&&<small> · {t('USD retained')}</small>}</span>;
}
export function CurrencyNotice() {
  const {currency} = usePreferences(), {fx,now,loading} = useContext(FxContext);
  if (currency !== 'NOK') return null;
  if (loading) return <aside className="currency-notice" role="status">{t('Loading the verified exchange rate…')}</aside>;
  return <aside className="currency-notice" aria-label={t('Currency conversion basis')}>
    {validFx(fx,now) ? <><strong>{t('NOK display')}</strong><span>1 USD = {number(fx.nokPerUsd,4,4)} NOK · <a href={fx.sourceUrl} target="_blank" rel="noreferrer">Norges Bank</a> · {displayDate(fx.observedAt)}{fx.status==='retained'&&` · ${t('Last verified rate retained')}`}</span><details><summary>{t('Display conversion · returns keep their source currency')}</summary><p>{t('Indicative conversion at one fixed reference rate. Returns, model estimates and indexed charts keep their original calculation basis; NOK investor returns are not calculated.')}</p></details></> : <><strong>{t('NOK conversion unavailable')}</strong><span>{t('A recent verified exchange rate is unavailable. Monetary values remain explicitly in USD. Automatic checks will restore conversion when a valid rate is published.')}</span></>}
  </aside>;
}
export function PreferencesControl({density,onDensity}:{density:'compact'|'comfortable';onDensity:(value:'compact'|'comfortable')=>void}) {
  const p = usePreferences(), {fx,now} = useContext(FxContext);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [notice,setNotice] = useState('');
  useEffect(()=>{document.documentElement.lang=p.language;},[p.language]);
  const update=(patch:Partial<typeof p>)=>setNotice(setPreferences({...preferences(),...patch})?'Preferences saved on this browser.':'Browser storage is unavailable. Settings apply to this session only.');
  const close=()=>{dialog.current?.close();trigger.current?.focus();};
  return <><button ref={trigger} className="locale-trigger" aria-label={t('Language & currency')} onClick={()=>dialog.current?.showModal()}><span aria-hidden="true">◎</span> {p.language==='nb-NO'?'NO':'EN'} · {p.currency}</button>
    <dialog ref={dialog} className="preferences-dialog" aria-labelledby="preferences-title" onCancel={close}>
      <header><div><p className="eyebrow">NexusQ</p><h2 id="preferences-title">{t('Language & currency')}</h2></div><button className="workspace-button secondary" aria-label={t('Close settings')} onClick={close}>×</button></header>
      <label>{t('Language')}<select value={p.language} onChange={e=>update({language:e.target.value as Language})}><option value="en-US" lang="en-US">English (US)</option><option value="nb-NO" lang="nb-NO">Norsk (bokmål)</option></select></label>
      <label>{t('Display currency')}<select value={p.currency} onChange={e=>update({currency:e.target.value as Currency})}><option value="USD">USD — {t('US dollar')}</option><option value="NOK">NOK — {t('Norwegian krone')}</option></select></label>
      <label>{t('Display density')}<select value={density} onChange={e=>onDensity(e.target.value as 'compact'|'comfortable')}><option value="compact">{t('Compact')}</option><option value="comfortable">{t('Comfortable')}</option></select></label>
      <p>{t('Language and currency are independent. Your current investigation, watchlist and scenario assumptions stay in place.')}</p>
      <div className="preference-basis"><h3>{t('Currency conversion basis')}</h3><p>{t('NOK amounts use a dated Norges Bank reference rate. It is indicative, not a live or tradable exchange rate. Historical monetary charts use this same fixed rate, so their shape is unchanged.')}</p>{validFx(fx,now)?<p>1 USD = {number(fx.nokPerUsd,4,4)} NOK · {displayDate(fx.observedAt)}<br/>{t('Retrieved')}: {displayInstant(fx.retrievedAt)} · <a href={fx.sourceUrl} target="_blank" rel="noreferrer">Norges Bank ↗</a></p>:<p>{t('NOK conversion is currently unavailable; USD values are retained.')}</p>}
      <p>{t('Returns and model attribution remain based on the original source currencies. Original disclosures, source titles and quoted company statements retain their language and reported currency.')}</p></div>
      <p role="status" className="preferences-status">{t(notice)}</p><button className="workspace-button" onClick={close}>{t('Done')}</button>
    </dialog></>;
}
