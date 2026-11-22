import { useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '../lib/snapshot';
import type { WorkspaceRoute } from '../lib/workspace';
export type NavigateResearch=(route:WorkspaceRoute,extra?:Record<string,string|null>,anchor?:string)=>void;
type Result={key:string;label:string;detail:string;route:WorkspaceRoute;extra?:Record<string,string|null>};
export function ResearchSearch({open,onClose,snapshot,onNavigate}:{open:boolean;onClose:()=>void;snapshot:Snapshot|null;onNavigate:NavigateResearch}){
  const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null);
  const [query,setQuery]=useState('');
  useEffect(()=>{if(open){setQuery('');dialog.current?.showModal();input.current?.focus();}else dialog.current?.close();},[open]);
  const results=useMemo(()=>{
    const q=query.trim().toLowerCase();
    const match=(text:string)=>text.toLowerCase().includes(q);
    const out:Result[]=[];
    if(q){
      out.push(...(snapshot?.nexsi?.companies??[]).filter(c=>match(`${c.symbol} ${c.name}`)).slice(0,7).map(c=>({key:c.symbol,label:`${c.symbol} · ${c.name}`,detail:'Company investigation · energy, other factors and evidence',route:{page:'nexsi' as const,view:'explain'},extra:{company:c.symbol,event:null}})));
      out.push(...(snapshot?.catalog.series??[]).filter(s=>match(`${s.id} ${s.name}`)).slice(0,5).map(s=>({key:s.id,label:s.name,detail:`${s.id} · open in the market comparison workspace`,route:{page:'dashboard' as const,view:'compare'},extra:{s:s.id,t:'raw'}})));
    }
    const tools:Result[]=[
      {key:'moves',label:'Explain a company move',detail:'NexSI · stock returns, estimated energy impact, company evidence',route:{page:'nexsi',view:'explain'}},
      {key:'screen',label:'Screen companies',detail:'Nasdaq-100 · company search, largest drops, industry groups',route:{page:'nexsi',view:'screen'}},
      {key:'power',label:'Test an electricity-price scenario',detail:'Data centers, power contracts and operating costs',route:{page:'nexsi',view:'projects'}},
      {key:'compare',label:'Compare energy and macro markets',detail:'Overlay, correlations, forecasts, currencies, inflation',route:{page:'dashboard',view:'compare'}},
      {key:'impact',label:'Explore equity and sovereign exposure',detail:'Energy beta, GDP sensitivity and hypothetical shocks',route:{page:'dashboard',view:'impact'}},
      {key:'validate',label:'Check signal validation',detail:'Historical evidence, event studies and null results',route:{page:'dashboard',view:'validation'}},
      {key:'sources',label:'Inspect data sources and methods',detail:'Freshness, quality checks, coverage and methodology',route:{page:'methodology',view:''}},
    ];
    out.push(...tools.filter(t=>!q||match(t.label+' '+t.detail)));
    return out;
  },[query,snapshot]);
  return <dialog ref={dialog} className="research-search" aria-labelledby="research-search-title" onCancel={onClose} onClose={onClose}>
    <div className="search-heading"><div><p className="eyebrow">Go straight to the analysis</p><h2 id="research-search-title">Find a company, market or tool</h2></div><button className="workspace-button secondary" onClick={onClose} aria-label="Close search">Esc</button></div>
    <label className="sr-only" htmlFor="research-query">Search companies, markets and tools</label><input ref={input} id="research-query" type="search" placeholder="AAPL, Brent, electricity scenario…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();dialog.current?.querySelector<HTMLButtonElement>('.search-result')?.focus();}}}/>
    <p className="search-count" role="status">{query?`${results.length} matches`:'Suggested starting points'}{!snapshot?' · company and market data loading':''}</p>
    <div className="search-results">{results.map(r=><button className="search-result" key={r.key} onClick={()=>{onNavigate(r.route,r.extra);onClose();}}><span><strong>{r.label}</strong><small>{r.detail}</small></span><span aria-hidden="true">↗</span></button>)}{!results.length&&<p className="search-empty">No match. Try a ticker, company name, market or tool such as “power” or “correlation”.</p>}</div>
    <p className="search-foot">Search opens verified datasets and existing analysis tools. <kbd>Tab</kbd> to browse · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to return</p>
  </dialog>;
}
