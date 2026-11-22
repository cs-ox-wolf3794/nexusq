import { l as localize, t as tr } from '../lib/i18n';
import { useMemo, useState } from 'react';
import type { Attribution } from '../lib/nexsi-model';
import type { NexsiCompany, NexsiFile } from '../lib/nexsi-types';
import { disclosureContext, evidenceForMove, explainMove, isPrimaryFiling, reviewedDisclosure, signed, TIMING_LABELS, type EvidenceTiming } from '../lib/nexsi-explanation';
import { displayDate, displayInstant } from '../lib/research-ui';
import { ResearchAlert } from './ResearchChrome';

type Lens='energy'|'other'|'unexplained';
const TIMING_SHORT:Record<EvidenceTiming,string>={within:'During the move',before:'Earlier context',after:'After the move',uncertain:'Timing uncertain'};

/** One selected close-to-close window drives the model, timeline and source inspector. */
export function ConnectedInvestigation({company,move,factors,now,onEvidence}:{company:NexsiCompany;move:Attribution;factors:NexsiFile['factors'];now:number;onEvidence:()=>void}) {
  const [lens,setLens]=useState<Lens>('energy');
  const [sourceFilter,setSourceFilter]=useState<'primary'|'all'>('primary');
  const [selectedUrl,setSelectedUrl]=useState('');
  const reading=explainMove(move);
  const entries=useMemo(()=>evidenceForMove(company.events,move,now),[company.events,move,now]);
  const filtered=entries.filter(e=>sourceFilter==='all'||isPrimaryFiling(e.event)).sort((a,b)=>Date.parse(a.event.publishedAt)-Date.parse(b.event.publishedAt));
  const selected=filtered.find(e=>e.event.url===selectedUrl)??filtered.find(e=>e.timing==='within')??filtered.filter(e=>e.timing==='before').at(-1)??filtered[0];
  const primaryCount=entries.filter(e=>isPrimaryFiling(e.event)&&e.timing==='within').length;
  const max=Math.max(1,...[move.energy,reading.other,move.components.unexplained].map(Math.abs));
  const rows:{id:Lens;label:string;value:number;caption:string}[]=[
    {id:'energy',label:'Energy estimate',value:move.energy,caption:'Oil + gas · conditional model'},
    {id:'other',label:'Other modeled factors',value:reading.other,caption:'Market + relative tech + rates + baseline'},
    {id:'unexplained',label:'Unexplained remainder',value:move.components.unexplained,caption:'Unassigned · includes model error'},
  ];
  const title={energy:reading.energyLabel.replace(/^[ℹ⚠▼▲]\s*/,''),other:'Exposure to other market factors',unexplained:'The remainder has no verified cause'}[lens];
  const text={energy:reading.energyText,other:reading.otherText,unexplained:reading.residualText}[lens];
  const factorSymbols=lens==='energy'?['CL=F','NG=F']:lens==='other'?['SPY','QQQ','IEF']:[];

  return <div className="connected-investigation">
    <section className="contribution-workbench" aria-labelledby="contribution-title">
      <div className="instrument-heading"><div><span className="eyebrow">{tr("01 / Explain the return")}</span><h3 id="contribution-title">{tr("Contribution bridge")}</h3></div><span className="instrument-unit">{tr("percentage points")}</span></div>
      <div className="bridge-axis" aria-hidden="true"><span>{tr("Drag")}</span><span>{tr("0")}</span><span>{tr("Support")}</span></div>
      <div className="bridge-rows">{localize(rows.map(row=><button className={`bridge-row ${row.id}`} key={row.id} aria-pressed={lens===row.id} aria-label={tr(`Inspect ${row.label}: ${signed(row.value)} percentage points`)} onClick={()=>setLens(row.id)}><span className="bridge-label"><strong>{localize(row.label)}</strong><small>{localize(row.caption)}</small></span><span className="bridge-track" aria-hidden="true"><span className="bridge-zero"/><span className="bridge-bar" style={{left:`${row.value<0?50+row.value/max*48:50}%`,width:`${Math.abs(row.value)/max*48}%`}}/></span><span className="bridge-value">{localize(signed(row.value))}<small>{tr("pp")}</small></span></button>))}</div>
      <div className="bridge-total"><span>{tr("Reconciled observed return")}</span><strong>{localize(signed(move.actual))}{tr("%")}</strong></div><p className="instrument-note">{tr("Components reconcile before rounding. Select a row to inspect its interpretation.")}</p>
      <div className={`factor-inspector ${lens}`} aria-live="polite"><div className="inspector-label"><span>{localize(lens==='unexplained'?'Unassigned':'Model estimate')}</span><span>{localize(lens==='energy'?'Oil + gas':lens==='other'?'Four components':'No causal allocation')}</span></div><h4>{localize(title)}</h4><p>{localize(text)}</p>
        {localize(lens==='energy'&&<div className="parameter-interval"><span>{tr("95% parameter interval")}</span><strong>{localize(signed(move.energyCI[0]))} <span>{tr("to")}</span> {localize(signed(move.energyCI[1]))}{tr(" pp")}</strong><small>{tr("Parameter uncertainty only; not a causal or prediction interval.")}</small></div>)}
        {localize(factorSymbols.length>0&&<div className="factor-links">{localize(factorSymbols.map(symbol=>{const factor=factors.find(f=>f.symbol===symbol);return factor?<a href={factor.sourceUrl} key={symbol} target="_blank" rel="noreferrer"><strong>{localize(symbol)}</strong><span>{tr("Through ")}{localize(displayDate(factor.asOf))}</span><span aria-hidden="true">{tr("↗")}</span></a>:null;}))}</div>)}
        {localize(lens==='unexplained'&&<button className="text-action" onClick={onEvidence}>{tr("Investigate company evidence →")}</button>)}
      </div>
      {localize(move.extrapolation&&<ResearchAlert title={tr("Model inputs outside the training range")}>{tr("Treat the estimate with additional caution; no energy share of the loss is assigned.")}</ResearchAlert>)}
    </section>
    <section className="event-workbench" aria-labelledby="timeline-title">
      <div className="instrument-heading"><div><span className="eyebrow">{tr("02 / Check the evidence")}</span><h3 id="timeline-title">{tr("Event timeline")}</h3></div><span className="evidence-count">{localize(primaryCount)}<small>{tr("filings in window")}</small></span></div>
      <div className="timeline-window"><span>{tr("Selected closes")}</span><strong>{localize(displayDate(move.start))}{tr(" → ")}{localize(displayDate(move.end))}</strong></div>
      <div className="source-filter" role="group" aria-label={tr("Timeline sources")}><button aria-pressed={sourceFilter==='primary'} onClick={()=>setSourceFilter('primary')}>{tr("Issuer filings ")}<span>{localize(entries.filter(e=>isPrimaryFiling(e.event)).length)}</span></button><button aria-pressed={sourceFilter==='all'} onClick={()=>setSourceFilter('all')}>{tr("Include reporting ")}<span>{localize(entries.filter(e=>!isPrimaryFiling(e.event)).length)}</span></button></div>
      {localize(filtered.length?<ol className="event-timeline">{localize(filtered.map(({event,timing})=><li key={event.url} className={`${timing}${selected?.event.url===event.url?' selected':''}`}><button aria-pressed={selected?.event.url===event.url} onClick={()=>setSelectedUrl(event.url)}><time dateTime={event.publishedAt}>{localize(displayInstant(event.publishedAt,'ET'))}</time><strong><span lang="en" translate="no">{event.title}</span></strong><span className="timeline-classification">{localize(isPrimaryFiling(event)?'Issuer filing':'Unreviewed reporting')}{tr(" · ")}{localize(TIMING_SHORT[timing])}</span></button></li>))}</ol>:<div className="timeline-empty"><strong>{tr("No retrieved ")}{localize(sourceFilter==='primary'?'issuer filing':'evidence')}{tr(" in this context window.")}</strong><p>{tr("Missing coverage does not establish that no company event occurred. Open the full evidence record to inspect broader coverage.")}</p></div>)}
      {localize(selected&&<div className="source-inspector" aria-live="polite"><span className={`source-type ${isPrimaryFiling(selected.event)?'primary':'unreviewed'}`}>{localize(isPrimaryFiling(selected.event)?'Primary issuer filing':'Unreviewed reporting')}</span><h4><span lang="en" translate="no">{selected.event.title}</span></h4><p className="source-timing">{localize(TIMING_LABELS[selected.timing])}</p><p>{localize(reviewedDisclosure(company.symbol,selected.event,move)??disclosureContext(selected.event))}</p><a className="source-open" href={selected.event.url} target="_blank" rel="noreferrer">{localize(isPrimaryFiling(selected.event)?'Read original filing':'Read linked reporting')} <span aria-hidden="true">{tr("↗")}</span></a></div>)}
      <p className="instrument-note">{tr("SEC acceptance can follow an earlier announcement. Timing alone does not establish a catalyst. No news item is assigned a measured share of this return.")}</p><button className="text-action" onClick={onEvidence}>{tr("Open the full evidence record →")}</button>
    </section>
  </div>;
}
