/** One registry for navigation, deep links, search and future workspaces. */
export const WORKSPACES = {
  home: { label: 'Research desk', short: 'Research', description: 'Choose the question worth investigating.', views: [] },
  nexsi: { label: 'NexSI', short: 'NexSI', description: 'Connect company moves, energy exposure and evidence.', views: [
    { id: 'explain', label: 'Explain a move', description: 'What moved, what the model estimates, and what remains unexplained.' },
    { id: 'screen', label: 'Find companies', description: 'Screen the full universe, then open an investigation.' },
    { id: 'projects', label: 'Projects & power', description: 'Follow physical exposure and test an electricity-cost scenario.' },
    { id: 'evidence', label: 'Evidence & coverage', description: 'Inspect the sources, market inputs and methodological limits.' },
  ] },
  dashboard: { label: 'Nexus Signal', short: 'Signals', description: 'Explore energy, commodity and macro relationships.', views: [
    { id: 'pulse', label: 'Market pulse', description: 'Prices, active signals and market conditions in one reading.' },
    { id: 'compare', label: 'Compare markets', description: 'Explore relationships with comparable scales and dated projections.' },
    { id: 'impact', label: 'Explore exposure', description: 'Equity sensitivity and sovereign GDP–oil associations.' },
    { id: 'validation', label: 'Test the signals', description: 'Inspect historical evidence, including results with no demonstrated edge.' },
  ] },
  methodology: { label: 'Evidence & methods', short: 'Evidence', description: 'Inspect freshness, source quality, definitions and limitations.', views: [] },
} as const;
export type WorkspacePage = keyof typeof WORKSPACES;
export type WorkspaceRoute = { page: WorkspacePage; view: string };
export const SECTION_ROUTES: Record<string, WorkspaceRoute> = {
  kpis:{page:'dashboard',view:'pulse'}, signals:{page:'dashboard',view:'pulse'}, 'market-state':{page:'dashboard',view:'pulse'},
  overlay:{page:'dashboard',view:'compare'}, correlations:{page:'dashboard',view:'compare'}, validation:{page:'dashboard',view:'validation'},
  'equity-impact':{page:'dashboard',view:'impact'}, 'sovereign-impact':{page:'dashboard',view:'impact'},
  'nexsi-company-analysis':{page:'nexsi',view:'explain'}, 'nexsi-screen':{page:'nexsi',view:'screen'},
  'nexsi-projects':{page:'nexsi',view:'projects'}, 'nexsi-power-scenario':{page:'nexsi',view:'projects'},
  'nexsi-evidence':{page:'nexsi',view:'evidence'}, 'nexsi-overview':{page:'nexsi',view:'evidence'},
  'nexsi-inputs':{page:'nexsi',view:'evidence'}, 'nexsi-methodology':{page:'nexsi',view:'evidence'},
};
export function readWorkspace(hash: string): WorkspaceRoute {
  const raw=hash.replace(/^#/,'');
  if(Object.hasOwn(SECTION_ROUTES,raw))return SECTION_ROUTES[raw];
  const p=new URLSearchParams(raw), candidate=p.get('page');
  const page:WorkspacePage=candidate&&Object.hasOwn(WORKSPACES,candidate)?candidate as WorkspacePage:p.has('s')?'dashboard':'home';
  const views:readonly {id:string}[]=WORKSPACES[page].views;
  return {page,view:views.find(v=>v.id===p.get('view'))?.id??(page==='dashboard'&&p.has('s')&&!p.has('view')?'compare':views[0]?.id??'')};
}
export function researchTitle(page:WorkspacePage,view:string,symbol:string){
  const workspace=WORKSPACES[page], label=workspace.views.find(v=>v.id===view)?.label;
  return [workspace.label,page==='nexsi'?symbol:null,label].filter(Boolean).join(' · ');
}
/** Entity colors survive navigation and selection changes, including sparse slots. */
export function selectionColors(previous:Map<string,string>,ids:string[],slots:string[]) {
  const next=new Map(ids.filter(id=>previous.has(id)).map(id=>[id,previous.get(id)!]));
  for(const id of ids)if(!next.has(id)){const free=slots.find(slot=>![...next.values()].includes(slot));if(free)next.set(id,free);}
  return next;
}
export function workspaceHash(current: string, route: WorkspaceRoute, extra: Record<string,string|null>={}) {
  const p=new URLSearchParams(current.replace(/^#/,''));
  for(const key of [...p.keys()])if(!['s','t','w','p','page','view','company','horizon','event'].includes(key))p.delete(key);
  p.set('page',route.page);if(route.view)p.set('view',route.view);else p.delete('view');
  for(const [key,value] of Object.entries(extra)){if(value===null)p.delete(key);else p.set(key,value);}
  return '#'+p.toString();
}
export type SavedView = { hash:string; title:string; savedAt:string };
export function readSavedViews(value: string|null): SavedView[] {
  try { const rows:unknown=JSON.parse(value??'[]');return Array.isArray(rows)?rows.filter((x):x is SavedView=>!!x&&typeof x.hash==='string'&&/^#(?:s=|page=)/.test(x.hash)&&x.hash.length<1500&&typeof x.title==='string'&&x.title.length<200&&typeof x.savedAt==='string').slice(0,12):[]; } catch{return [];}
}
