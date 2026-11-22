import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { WORKSPACES, type WorkspacePage, type WorkspaceRoute } from '../lib/workspace';

export function WorkspaceNav({page,onNavigate}:{page:WorkspacePage;onNavigate:(route:WorkspaceRoute)=>void}) {
  return <aside className="app-rail"><a className="rail-brand" href="#page=home" onClick={e=>{e.preventDefault();onNavigate({page:'home',view:''});}} aria-label="NexusQ research desk"><img src={`${import.meta.env.BASE_URL}nexusq.svg`} alt=""/><span>NEXUS<span className="brand-q">Q</span><small>Gygante Quantitative Systems</small></span></a>
    <p className="rail-caption">Research workspaces</p>
    <nav className="workspace-nav" aria-label="Primary navigation">{(Object.keys(WORKSPACES) as WorkspacePage[]).map((id,i)=><button key={id} aria-current={page===id?'page':undefined} onClick={()=>onNavigate({page:id,view:WORKSPACES[id].views[0]?.id??''})}><span className="nav-index" aria-hidden="true">{["R","SI","Σ","E"][i]}</span><span className="nav-full">{WORKSPACES[id].label}</span><span className="nav-short">{WORKSPACES[id].short}</span></button>)}</nav>
    <div className="rail-principle"><span className="eyebrow">The research standard</span><p>Every estimate has evidence.<br/>Every uncertainty has a place.</p><small>Energy · markets · business</small></div>
  </aside>;
}
export function WorkspaceTabs({page,value,onChange}:{page:WorkspacePage;value:string;onChange:(value:string)=>void}){
  const views:readonly {id:string;label:string;description:string}[]=WORKSPACES[page].views;
  const refs=useRef<(HTMLButtonElement|null)[]>([]);
  return <div className="workspace-tabs" role="tablist" aria-label={`${WORKSPACES[page].label} views`}>{views.map((v,i)=><button key={v.id} ref={el=>{refs.current[i]=el;}} id={`tab-${page}-${v.id}`} role="tab" aria-selected={value===v.id} aria-controls={`panel-${page}-${v.id}`} tabIndex={value===v.id?0:-1} title={v.description} onClick={()=>onChange(v.id)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(i+1)%views.length:e.key==='ArrowLeft'?(i-1+views.length)%views.length:e.key==='Home'?0:e.key==='End'?views.length-1:null;if(next!==null){e.preventDefault();refs.current[next]?.focus();onChange(views[next].id);}}}>{v.label}</button>)}</div>;
}
/** Lazy first mount, then preserve controls and scenario assumptions across tabs. */
export function WorkspacePanel({page,id,active,children}:{page:WorkspacePage;id:string;active:boolean;children:ReactNode}){
  const [visited,setVisited]=useState(active);
  useEffect(()=>{if(active)setVisited(true);},[active]);
  return <div className="workspace-panel" role="tabpanel" id={`panel-${page}-${id}`} aria-labelledby={`tab-${page}-${id}`} hidden={!active} tabIndex={0}>{active||visited?<Suspense fallback={<p role="status" className="research-empty">Loading this analysis…</p>}>{children}</Suspense>:null}</div>;
}
export function RetainedView({active,children}:{active:boolean;children:ReactNode}){
  const [visited,setVisited]=useState(active);
  useEffect(()=>{if(active)setVisited(true);},[active]);
  return <div hidden={!active}>{active||visited?<Suspense fallback={<p role="status" className="research-empty">Loading the workspace…</p>}>{children}</Suspense>:null}</div>;
}
export function WorkspaceIntro({eyebrow,title,description,children}:{eyebrow:string;title:string;description:string;children?:ReactNode}){
  return <header className="workspace-intro"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="workspace-description">{description}</p></div>{children}</header>;
}
export function ResearchDisclosure({title,description,children,open=false}:{title:string;description?:string;children:ReactNode;open?:boolean}){
  return <details className="research-disclosure" open={open}><summary><span>{title}{description&&<small>{description}</small>}</span><span className="disclosure-plus" aria-hidden="true">+</span></summary><div className="research-disclosure-body">{children}</div></details>;
}
