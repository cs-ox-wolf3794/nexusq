import { l as localize, t as tr } from '../lib/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '../lib/snapshot';
import type { WorkspaceRoute } from '../lib/workspace';
import { RESEARCH_QUESTIONS, RESEARCH_TOPICS, matchesResearchQuery, questionAvailable } from '../lib/research-questions';
import { companyName } from '../lib/display-names';
export type NavigateResearch=(route:WorkspaceRoute,extra?:Record<string,string|null>,anchor?:string)=>void;
type Result={key:string;group:string;label:string;detail:string;route:WorkspaceRoute;extra?:Record<string,string|null>;anchor?:string};
const TOOLS:Result[]=[
  {key:'brief',group:'Workspaces & tools',label:'NexSum daily brief',detail:'Key insights, watchlist, next checkpoints and research tasks',route:{page:'home',view:''}},
  {key:'moves',group:'Workspaces & tools',label:'Explain a company move',detail:'NexSI · stock returns, estimated energy impact, company evidence',route:{page:'nexsi',view:'explain'}},
  {key:'screen',group:'Workspaces & tools',label:'Screen companies',detail:'Nasdaq-100 · company search, largest drops, industry groups',route:{page:'nexsi',view:'screen'}},
  {key:'power',group:'Workspaces & tools',label:'Test an electricity-price scenario',detail:'Data centers, power contracts and operating costs',route:{page:'nexsi',view:'projects'},anchor:'nexsi-power-scenario'},
  {key:'compare',group:'Workspaces & tools',label:'Compare energy and macro markets',detail:'Overlay, correlations, forecasts, currencies, inflation',route:{page:'dashboard',view:'compare'}},
  {key:'impact',group:'Workspaces & tools',label:'Explore equity and sovereign exposure',detail:'Energy beta, GDP sensitivity and hypothetical shocks',route:{page:'dashboard',view:'impact'}},
  {key:'validate',group:'Workspaces & tools',label:'Check signal validation',detail:'Historical evidence, event studies and null results',route:{page:'dashboard',view:'validation'}},
  {key:'sources',group:'Workspaces & tools',label:'Inspect data sources and methods',detail:'Freshness, quality checks, coverage and methodology',route:{page:'methodology',view:''}},
];
export function ResearchSearch({open,onClose,snapshot,onNavigate}:{open:boolean;onClose:()=>void;snapshot:Snapshot|null;onNavigate:NavigateResearch}){
  const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null),resultsPanel=useRef<HTMLDivElement>(null);
  const [query,setQuery]=useState('');
  useEffect(()=>{if(open){setQuery('');dialog.current?.showModal();input.current?.focus();}else dialog.current?.close();},[open]);
  useEffect(()=>{resultsPanel.current?.scrollTo({top:0});},[query,open]);
  const results=useMemo(()=>{
    const q=query.trim(), match=(text:string)=>matchesResearchQuery(q,text);
    const out:Result[]=[];
    if(q){
      out.push(...(snapshot?.nexsi?.companies??[]).filter(c=>match(`${c.symbol} ${c.name} ${companyName(c.symbol,c.name)}`)).map(c=>({key:'company:'+c.symbol,group:'Companies',label:`${c.symbol} · ${companyName(c.symbol,c.name)}`,detail:'Company investigation · energy, other factors and evidence',route:{page:'nexsi' as const,view:'explain'},extra:{company:c.symbol,event:null}})));
      out.push(...(snapshot?.catalog.series??[]).filter(s=>match(`${s.id} ${s.name} ${tr(s.name)} ${s.category}`)).map(s=>({key:'series:'+s.id,group:'Markets',label:s.name,detail:`${s.id} · open the dated market comparison`,route:{page:'dashboard' as const,view:'compare'},extra:{s:s.id,t:'raw',p:'0'}})));
    }
    out.push(...RESEARCH_QUESTIONS.filter(r=>questionAvailable(r,snapshot)&&match(`${r.title} ${tr(r.title)} ${r.detail} ${tr(r.detail)} ${r.keywords}`)).map(r=>({key:'question:'+r.id,group:r.group,label:r.title,detail:r.detail,route:r.route,extra:r.extra,anchor:r.anchor})));
    out.push(...TOOLS.filter(t=>!q||match(t.label+' '+tr(t.label)+' '+t.detail+' '+tr(t.detail))));
    return out;
  },[query,snapshot]);
  const groups=[...new Set(results.map(r=>r.group))];
  return <dialog ref={dialog} className="research-search" aria-labelledby="research-search-title" onCancel={onClose} onClose={onClose}>
    <div className="search-controls">
    <div className="search-heading"><div><p className="eyebrow">{tr("Follow a question into the evidence")}</p><h2 id="research-search-title">{tr("What are you investigating?")}</h2></div><button className="workspace-button secondary" onClick={onClose} aria-label={tr("Close search")}>{tr("Esc")}</button></div>
    <label className="sr-only" htmlFor="research-query">{tr("Search companies, markets and research questions")}</label><input ref={input} id="research-query" type="search" placeholder={tr("AAPL, earnings, rates, oil…")} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();dialog.current?.querySelector<HTMLButtonElement>('.search-result')?.focus();}}}/>
    <div className="search-topics" aria-label={tr("Stock, capital-market and energy research suggestions")}>{localize(RESEARCH_TOPICS.map(topic=><button key={topic} aria-pressed={query===topic||query===tr(topic)} onClick={()=>{setQuery(tr(topic));input.current?.focus();}}>{localize(topic)}</button>))}</div>
    <p className="search-count" role="status">{localize(query?`${results.length} matches`:'Stock, capital-market and energy research questions')}{localize(!snapshot?' · company and market data loading':'')}</p>
    </div>
    <div className="search-results" ref={resultsPanel} role="region" aria-label={tr("Search results")} tabIndex={0}>{localize(groups.map(group=><section key={group} className="search-group" aria-label={tr(group)}><h3>{localize(group)}</h3>{localize(results.filter(r=>r.group===group).map(r=><button className="search-result" key={r.key} onClick={()=>{onNavigate(r.route,r.extra,r.anchor);onClose();}}><span><strong>{localize(r.label)}</strong><small>{localize(r.detail)}</small></span><span className="search-result-open">{tr("Open")}</span></button>))}</section>))}{localize(!results.length&&<p className="search-empty">{tr("No match. Try a ticker, company, market or topic such as “stocks”, “rates”, “gas” or “power”.")}</p>)}</div>
    <footer className="search-foot">{tr("Questions open existing analysis, with its source checks and limitations. ")}<kbd>{tr("Tab")}</kbd>{tr(" to browse · ")}<kbd>{tr("Enter")}</kbd>{tr(" to open · ")}<kbd>{tr("Esc")}</kbd>{tr(" to return")}</footer>
  </dialog>;
}
