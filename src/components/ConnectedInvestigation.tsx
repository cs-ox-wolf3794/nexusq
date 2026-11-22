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
      <div className="instrument-heading"><div><span className="eyebrow">01 / Explain the return</span><h3 id="contribution-title">Contribution bridge</h3></div><span className="instrument-unit">percentage points</span></div>
      <div className="bridge-axis" aria-hidden="true"><span>Drag</span><span>0</span><span>Support</span></div>
      <div className="bridge-rows">{rows.map(row=><button className={`bridge-row ${row.id}`} key={row.id} aria-pressed={lens===row.id} aria-label={`Inspect ${row.label}: ${signed(row.value)} percentage points`} onClick={()=>setLens(row.id)}><span className="bridge-label"><strong>{row.label}</strong><small>{row.caption}</small></span><span className="bridge-track" aria-hidden="true"><span className="bridge-zero"/><span className="bridge-bar" style={{left:`${row.value<0?50+row.value/max*48:50}%`,width:`${Math.abs(row.value)/max*48}%`}}/></span><span className="bridge-value">{signed(row.value)}<small>pp</small></span></button>)}</div>
      <div className="bridge-total"><span>Reconciled observed return</span><strong>{signed(move.actual)}%</strong></div><p className="instrument-note">Components reconcile before rounding. Select a row to inspect its interpretation.</p>
      <div className={`factor-inspector ${lens}`} aria-live="polite"><div className="inspector-label"><span>{lens==='unexplained'?'Unassigned':'Model estimate'}</span><span>{lens==='energy'?'Oil + gas':lens==='other'?'Four components':'No causal allocation'}</span></div><h4>{title}</h4><p>{text}</p>
        {lens==='energy'&&<div className="parameter-interval"><span>95% parameter interval</span><strong>{signed(move.energyCI[0])} <span>to</span> {signed(move.energyCI[1])} pp</strong><small>Parameter uncertainty only; not a causal or prediction interval.</small></div>}
        {factorSymbols.length>0&&<div className="factor-links">{factorSymbols.map(symbol=>{const factor=factors.find(f=>f.symbol===symbol);return factor?<a href={factor.sourceUrl} key={symbol} target="_blank" rel="noreferrer"><strong>{symbol}</strong><span>Through {displayDate(factor.asOf)}</span><span aria-hidden="true">↗</span></a>:null;})}</div>}
        {lens==='unexplained'&&<button className="text-action" onClick={onEvidence}>Investigate company evidence →</button>}
      </div>
      {move.extrapolation&&<ResearchAlert title="Model inputs outside the training range">Treat the estimate with additional caution; no energy share of the loss is assigned.</ResearchAlert>}
    </section>
    <section className="event-workbench" aria-labelledby="timeline-title">
      <div className="instrument-heading"><div><span className="eyebrow">02 / Check the evidence</span><h3 id="timeline-title">Event timeline</h3></div><span className="evidence-count">{primaryCount}<small>filings in window</small></span></div>
      <div className="timeline-window"><span>Selected closes</span><strong>{displayDate(move.start)} → {displayDate(move.end)}</strong></div>
      <div className="source-filter" role="group" aria-label="Timeline sources"><button aria-pressed={sourceFilter==='primary'} onClick={()=>setSourceFilter('primary')}>Issuer filings <span>{entries.filter(e=>isPrimaryFiling(e.event)).length}</span></button><button aria-pressed={sourceFilter==='all'} onClick={()=>setSourceFilter('all')}>Include reporting <span>{entries.filter(e=>!isPrimaryFiling(e.event)).length}</span></button></div>
      {filtered.length?<ol className="event-timeline">{filtered.map(({event,timing})=><li key={event.url} className={`${timing}${selected?.event.url===event.url?' selected':''}`}><button aria-pressed={selected?.event.url===event.url} onClick={()=>setSelectedUrl(event.url)}><time dateTime={event.publishedAt}>{displayInstant(event.publishedAt,'ET')}</time><strong>{event.title}</strong><span className="timeline-classification">{isPrimaryFiling(event)?'Issuer filing':'Unreviewed reporting'} · {TIMING_SHORT[timing]}</span></button></li>)}</ol>:<div className="timeline-empty"><strong>No retrieved {sourceFilter==='primary'?'issuer filing':'evidence'} in this context window.</strong><p>Missing coverage does not establish that no company event occurred. Open the full evidence record to inspect broader coverage.</p></div>}
      {selected&&<div className="source-inspector" aria-live="polite"><span className={`source-type ${isPrimaryFiling(selected.event)?'primary':'unreviewed'}`}>{isPrimaryFiling(selected.event)?'Primary issuer filing':'Unreviewed reporting'}</span><h4>{selected.event.title}</h4><p className="source-timing">{TIMING_LABELS[selected.timing]}</p><p>{reviewedDisclosure(company.symbol,selected.event,move)??disclosureContext(selected.event)}</p><a className="source-open" href={selected.event.url} target="_blank" rel="noreferrer">{isPrimaryFiling(selected.event)?'Read original filing':'Read linked reporting'} <span aria-hidden="true">↗</span></a></div>}
      <p className="instrument-note">SEC acceptance can follow an earlier announcement. Timing alone does not establish a catalyst. No news item is assigned a measured share of this return.</p><button className="text-action" onClick={onEvidence}>Open the full evidence record →</button>
    </section>
  </div>;
}
