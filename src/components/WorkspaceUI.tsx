import { l as localize, t as tr } from '../lib/i18n';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { WORKSPACES, type WorkspacePage, type WorkspaceRoute } from '../lib/workspace';
import { AnalysisBoundary } from './AnalysisBoundary';

export function WorkspaceNav({page,onNavigate}:{page:WorkspacePage;onNavigate:(route:WorkspaceRoute)=>void}) {
  return <aside className="app-rail"><a className="rail-brand" href="#page=home" onClick={e=>{e.preventDefault();onNavigate({page:'home',view:''});}} aria-label={tr("NexusQ daily brief")}><img src={`${import.meta.env.BASE_URL}nexusq.svg`} alt={tr("")}/><span>{tr("NEXUS")}<span className="brand-q">{tr("Q")}</span><small>{tr("Gygante Quantitative Systems")}</small></span></a>
    <p className="rail-caption">{tr("Research workspaces")}</p>
    <nav className="workspace-nav" aria-label={tr("Primary navigation")}>{localize((Object.keys(WORKSPACES) as WorkspacePage[]).map((id,i)=><button key={id} aria-current={page===id?'page':undefined} onClick={()=>onNavigate({page:id,view:WORKSPACES[id].views[0]?.id??''})}><span className="nav-index" aria-hidden="true">{localize(["N","SI","Σ","E"][i])}</span><span className="nav-full">{localize(WORKSPACES[id].label)}</span><span className="nav-short">{localize(WORKSPACES[id].short)}</span></button>))}</nav>
    <section className="rail-principle" aria-label={tr("Reading the analysis")}><h2>{tr("Reading the analysis")}</h2><dl><div><dt>{tr("Observed")}</dt><dd>{tr("Published prices and returns.")}</dd></div><div><dt>{tr("Estimated")}</dt><dd>{tr("Model contributions, with uncertainty.")}</dd></div><div><dt>{tr("Unexplained")}</dt><dd>{tr("The return the model does not account for.")}</dd></div></dl><button className="text-action" onClick={()=>onNavigate({page:'methodology',view:''})}>{tr("Check methods & coverage")}</button></section>
  </aside>;
}
export function WorkspaceTabs({page,value,onChange}:{page:WorkspacePage;value:string;onChange:(value:string)=>void}){
  const views:readonly {id:string;label:string;description:string}[]=WORKSPACES[page].views;
  const refs=useRef<(HTMLButtonElement|null)[]>([]);
  return <div className="workspace-tabs" role="tablist" aria-label={tr(`${WORKSPACES[page].label} views`)}>{localize(views.map((v,i)=><button key={v.id} ref={el=>{refs.current[i]=el;}} id={`tab-${page}-${v.id}`} role="tab" aria-selected={value===v.id} aria-controls={`panel-${page}-${v.id}`} tabIndex={value===v.id?0:-1} title={tr(v.description)} onClick={()=>onChange(v.id)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(i+1)%views.length:e.key==='ArrowLeft'?(i-1+views.length)%views.length:e.key==='Home'?0:e.key==='End'?views.length-1:null;if(next!==null){e.preventDefault();refs.current[next]?.focus();onChange(views[next].id);}}}>{localize(v.label)}</button>))}</div>;
}
/** Lazy first mount, then preserve controls and scenario assumptions across tabs. */
export function WorkspacePanel({page,id,active,children}:{page:WorkspacePage;id:string;active:boolean;children:ReactNode}){
  const [visited,setVisited]=useState(active);
  useEffect(()=>{if(active)setVisited(true);},[active]);
  return <div className="workspace-panel" role="tabpanel" id={`panel-${page}-${id}`} aria-labelledby={`tab-${page}-${id}`} hidden={!active} tabIndex={0}>{localize(active||visited?<AnalysisBoundary><Suspense fallback={<p role="status" className="research-empty">{tr("Loading this analysis…")}</p>}>{localize(children)}</Suspense></AnalysisBoundary>:null)}</div>;
}
export function RetainedView({active,children}:{active:boolean;children:ReactNode}){
  const [visited,setVisited]=useState(active);
  useEffect(()=>{if(active)setVisited(true);},[active]);
  return <div hidden={!active}>{localize(active||visited?<AnalysisBoundary><Suspense fallback={<p role="status" className="research-empty">{tr("Loading the workspace…")}</p>}>{localize(children)}</Suspense></AnalysisBoundary>:null)}</div>;
}
export function WorkspaceIntro({eyebrow,title,description,children}:{eyebrow:string;title:string;description:string;children?:ReactNode}){
  return <header className="workspace-intro"><div><p className="eyebrow">{localize(eyebrow)}</p><h1>{localize(title)}</h1><p className="workspace-description">{localize(description)}</p></div>{localize(children)}</header>;
}
export function ResearchDisclosure({title,description,children,open=false}:{title:string;description?:string;children:ReactNode;open?:boolean}){
  return <details className="research-disclosure" open={open}><summary><span>{localize(title)}{localize(description&&<> <small>{localize(description)}</small></>)}</span><span className="disclosure-plus" aria-hidden="true">{tr("+")}</span></summary><div className="research-disclosure-body">{localize(children)}</div></details>;
}
