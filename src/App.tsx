import { l as localize, t as tr } from './lib/i18n';
import { lazy, useEffect, useMemo, useRef, useState } from "react";
import type { Series } from "./lib/data";
import { loadSnapshot, type Snapshot } from "./lib/snapshot";
import { analysisEligibility, freshness, observationEnd, qualityCurrent, companyEligible, recentTimestamp, validDate } from "./lib/quality";
import { externalForecastCurrent } from "./lib/forecast";
import { DataStatus, QuotePanel } from "./components/DataStatus";
import type { Transform } from "./lib/transform";
import { TRANSFORM_LABELS, comparableTransform, isRateSeries, overlayPoints } from "./lib/transform";
import { ENGINE_VERSION, computeSignals } from "./lib/signals";
import { useTheme } from "./components/useTheme";
import { SeriesPicker } from "./components/SeriesPicker";
import { KpiStrip } from "./components/KpiStrip";
import { Freshness } from "./components/Freshness";
import { WorkspaceIntro, WorkspaceNav, WorkspacePanel, WorkspaceTabs, RetainedView } from "./components/WorkspaceUI";
import { ResearchSearch, type NavigateResearch } from "./components/ResearchSearch";
import { ResearchDesk } from "./components/ResearchDesk";
import { WORKSPACES, SECTION_ROUTES, readWorkspace, workspaceHash, readSavedViews, researchTitle, selectionColors, type WorkspacePage, type SavedView } from "./lib/workspace";
import { Skeleton, SkeletonRows, SkeletonTiles } from "./components/Skeleton";
import type { OverlaySeries, Projection } from "./components/OverlayChart";
import { GlossaryTip, HowToRead } from "./components/Guidance";
import { SignalPanel } from "./components/SignalPanel";
import { useResearchActivity } from "./components/useResearchActivity";
import { dataExceptions, displayInstant } from "./lib/research-ui";
import { ActivityCenter, ResearchToast, ResearchAlert, SessionClock, StatusMark } from "./components/ResearchChrome";
import { PreferencesControl, CurrencyNotice } from './components/Preferences';
import { FxContext } from './lib/money';
import { usePreferences } from './lib/preferences';
import { displayAmount } from './lib/fx';


// Load analysis workspaces on demand; the research desk does not require charts.
const EquityImpact = lazy(()=>import("./components/EquityImpact").then(m=>({default:m.EquityImpact})));
const GdpImpact = lazy(()=>import("./components/GdpImpact").then(m=>({default:m.GdpImpact})));
const Methodology = lazy(()=>import("./components/Methodology").then(m=>({default:m.Methodology})));
const ValidationPanel = lazy(()=>import("./components/ValidationPanel").then(m=>({default:m.ValidationPanel})));
const MarketStatePanel = lazy(()=>import("./components/MarketState").then(m=>({default:m.MarketStatePanel})));
const OverlayChart = lazy(()=>import("./components/OverlayChart").then(m=>({default:m.OverlayChart})));
const CorrelationMatrix = lazy(()=>import("./components/CorrelationMatrix").then(m=>({default:m.CorrelationMatrix})));
const NexSI = lazy(()=>import("./components/NexSI").then(m=>({default:m.NexSI})));

const RANGES: { label: string; years: number | null }[] = [
  { label: "1Y", years: 1 }, { label: "3Y", years: 3 }, { label: "5Y", years: 5 },
  { label: "10Y", years: 10 }, { label: "All", years: null },
];

const DEFAULT_SELECTION = ["BRENT", "XLE", "ICLN", "EURUSD"];
const SLOT_VARS = ["--series-1", "--series-2", "--series-3", "--series-4", "--series-5", "--series-6"];

// Curated entry points: each preset configures the whole overlay to answer one question.
interface Preset {
  key: string;
  label: string;
  ids: string[];
  t: Transform;
  w: number | null;
  p: boolean;
}
const PRESETS: Preset[] = [
  { key: "clean-energy", label: "Is clean energy an energy trade?", ids: ["ICLN", "HENRYHUB", "UST10Y"], t: "zscore", w: 3, p: false },
  { key: "oil-fx", label: "How do oil and FX move together?", ids: ["BRENT", "EURUSD", "DXY"], t: "index", w: 3, p: false },
  { key: "inflation", label: "How do commodities compare with inflation?", ids: ["BRENT", "WHEAT", "CPI"], t: "yoy", w: 10, p: false },
  { key: "energy-beta", label: "Energy equities vs the market", ids: ["BRENT", "XLE", "SP500"], t: "index", w: 3, p: true },
  { key: "gas-divergence", label: "Global gas divergence", ids: ["HENRYHUB", "EUGAS", "COAL"], t: "index", w: 5, p: true },
];

/** Shareable view state lives in the URL hash: #s=BRENT,XLE&t=index&w=3&p=1 */
function parseHash(): {
  ids: string[] | null;
  transform: Transform | null;
  years: number | null | undefined; // undefined = absent, null = "all"
  projection: boolean | null;
} {
  const m = new URLSearchParams(window.location.hash.slice(1));
  const ids = m.get("s")?.split(",").filter(Boolean).slice(0, SLOT_VARS.length);
  const t = m.get("t");
  const w = m.get("w");
  const p = m.get("p");
  return {
    ids: ids?.length ? ids : null,
    transform: t === "index" || t === "zscore" || t === "yoy" || t === "raw" ? t : null,
    years: w == null ? undefined : w === "all" ? null : [1, 3, 5, 10].includes(Number(w)) ? Number(w) : undefined,
    projection: p === "1" ? true : p === "0" ? false : null,
  };
}

function rangeStart(years: number | null): string {
  if (years == null) return "1900-01-01";
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export default function App() {
  const prefs = usePreferences();
  const { mode, toggle } = useTheme();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [now, setNow] = useState(Date.now());
  const catalog = snapshot?.catalog.series ?? [];
  const seriesMap = useMemo(() => snapshot?.seriesMap ?? new Map<string, Series>(), [snapshot]);
  const quality = snapshot?.quality ?? null;
  const forecasts = snapshot?.forecasts ?? null;
  const impact = snapshot ? snapshot.impact : undefined;
  const backtest = snapshot ? (snapshot.backtest?.engineVersion === ENGINE_VERSION && snapshot.backtest.inputSnapshot === snapshot.catalog.generated ? snapshot.backtest : null) : undefined;
  const cot = useMemo(() => snapshot?.cot ? { ...snapshot.cot, markets: Object.fromEntries(
    Object.entries(snapshot.cot.markets).filter(([id, market]) => !market.refreshFailed && !freshness(`COT_${id}`, market.lastUpdated, now).stale)
  ) } : null, [snapshot, now]);
  const analyticalMap = useMemo(() => new Map([...seriesMap].filter(([, series]) => analysisEligibility(series, quality, now).eligible)), [seriesMap, quality, now]);
  const signals = useMemo(() => snapshot ? computeSignals(analyticalMap, new Date(now).toISOString().slice(0, 10)) : null, [snapshot, analyticalMap, now]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(() => parseHash().ids ?? DEFAULT_SELECTION);
  const [transform, setTransform] = useState<Transform>(() => parseHash().transform ?? "index");
  const [rangeYears, setRangeYears] = useState<number | null>(() => {
    const y = parseHash().years;
    return y === undefined ? 3 : y;
  });
  const [projectionOn, setProjectionOn] = useState<boolean>(() => parseHash().projection ?? true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false); // mobile-only disclosure
  const [page,setPage]=useState<WorkspacePage>(()=>readWorkspace(window.location.hash).page);
  const [workspaceView,setWorkspaceView]=useState(()=>readWorkspace(window.location.hash).view);
  const [searchOpen,setSearchOpen]=useState(false);
  const [pendingAnchor,setPendingAnchor]=useState(()=>{const id=window.location.hash.slice(1);return Object.hasOwn(SECTION_ROUTES,id)?id:'';});
  const {activity,record,notify,toast,dismiss}=useResearchActivity();
  const [activityOpen,setActivityOpen]=useState(false);
  const [density,setDensity]=useState<'compact'|'comfortable'>(()=>{try{return localStorage.getItem('nexusq-density')==='comfortable'?'comfortable':'compact';}catch{return 'compact';}});
  const exceptions=useMemo(()=>dataExceptions(snapshot,now,loadError),[snapshot,now,loadError]);
  useEffect(()=>{if(snapshot)record({id:'publication:'+snapshot.revision,tone:'info',title:'Verified publication loaded',detail:'Analytical snapshot calculated '+displayInstant(snapshot.catalog.generated)+'. Observation dates remain separate.'});},[snapshot,record]);
  useEffect(()=>{if(loadError)record({id:'failure:'+loadError.slice(0,140),tone:'critical',title:'Publication verification failed',detail:loadError.slice(0,1500)});},[loadError,record]);
  const changeDensity=(value:'compact'|'comfortable')=>{setDensity(value);try{localStorage.setItem('nexusq-density',value);}catch{notify('Preference applies to this session','Browser storage is unavailable.','warning');}};
  const [savedViews,setSavedViews]=useState<SavedView[]>(()=>{try{return readSavedViews(localStorage.getItem('nexusq-saved-views'));}catch{return [];}});
  const [nexsiSymbol, setNexsiSymbol] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("company") ?? "NVDA");
  const [nexsiHorizon, setNexsiHorizon] = useState(() => { const h = Number(new URLSearchParams(window.location.hash.slice(1)).get("horizon")); return [1, 5, 20].includes(h) ? h : 1; });
  const [nexsiEvent, setNexsiEvent] = useState(() => { const d = new URLSearchParams(window.location.hash.slice(1)).get("event"); return validDate(d) ? d : ""; });
  // Color follows the entity: a series keeps its slot while selected.
  const slotMap = useRef(
    new Map<string, string>((parseHash().ids ?? DEFAULT_SELECTION).map((id, i) => [id, SLOT_VARS[i]])),
  );

  // The URL hash mirrors the view state — every view is a shareable link.
  useEffect(() => {
    const h = `#s=${selected.join(",")}&t=${transform}&w=${rangeYears ?? "all"}&p=${projectionOn ? 1 : 0}&page=${page}&view=${workspaceView}&company=${encodeURIComponent(nexsiSymbol)}&horizon=${nexsiHorizon}${nexsiEvent ? `&event=${nexsiEvent}` : ""}`;
    window.history.replaceState(null, "", h);
  }, [selected, transform, rangeYears, projectionOn, page, workspaceView, nexsiSymbol, nexsiHorizon, nexsiEvent]);

  // Apply shared links opened while the app is already running (hash navigation
  // doesn't remount React). Our own replaceState writes never fire hashchange.
  useEffect(() => {
    const onHash = () => {
      const h = parseHash();
      if (h.ids) {
        slotMap.current = selectionColors(slotMap.current,h.ids,SLOT_VARS);
        setSelected(h.ids);
      }
      if (h.transform) setTransform(h.transform);
      if (h.years !== undefined) setRangeYears(h.years);
      if (h.projection != null) setProjectionOn(h.projection);
      const params = new URLSearchParams(window.location.hash.slice(1));
      const route=readWorkspace(window.location.hash); setPage(route.page); setWorkspaceView(route.view);
      setNexsiSymbol(params.get("company") ?? "NVDA");
      const horizon = Number(params.get("horizon"));
      setNexsiHorizon([1, 5, 20].includes(horizon) ? horizon : 1);
      const event = params.get("event");
      setNexsiEvent(validDate(event) ? event : "");
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("popstate", onHash); };
  }, []);

  const navigate:NavigateResearch=(route,extra={},anchor='')=>{
    const hash=workspaceHash(window.location.hash,route,extra);
    if(hash!==window.location.hash)window.history.pushState(null,'',hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    if(document.activeElement?.getAttribute('role')!=='tab')setPendingAnchor(anchor||'workspace-heading');
  };
  useEffect(()=>{
    if(!pendingAnchor)return;
    const focusTarget=()=>{
      const target=document.getElementById(pendingAnchor);
      if(!target||target.closest('[hidden]'))return;
      target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'instant'});
      setPendingAnchor('');
    };
    const frame=requestAnimationFrame(focusTarget);
    const observer=new MutationObserver(focusTarget);
    observer.observe(document.getElementById('workspace-heading')!,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
    return()=>{cancelAnimationFrame(frame);observer.disconnect();};
  },[page,workspaceView,pendingAnchor]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearchOpen(v=>!v);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  const storeViews=(next:SavedView[])=>{try{localStorage.setItem('nexusq-saved-views',JSON.stringify(next));setSavedViews(next);return true;}catch{notify('View could not be saved','This browser could not store the view. Copy its link instead.','warning');return false;}};
  const saveView=()=>{const hash=window.location.hash;const next=[{hash,title:researchTitle(page,workspaceView,nexsiSymbol),savedAt:new Date().toISOString()},...savedViews.filter(v=>v.hash!==hash)].slice(0,12);if(storeViews(next))notify('View saved','Available in your research desk on this browser.');};
  const openSaved=(hash:string)=>{window.history.pushState(null,'',hash);window.dispatchEvent(new HashChangeEvent('hashchange'));setPendingAnchor('workspace-heading');};

  const copyViewLink = async () => {
    const url = window.location.href;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // clipboard API can be blocked (permissions, unfocused frame) — legacy fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    }
    if (!ok) {
      window.prompt("Copy this link:", url);
      return;
    }
    setLinkCopied(true);
    notify("View link copied","The link preserves the company, time window and selected analysis.");
    setTimeout(() => setLinkCopied(false), 1600);
  };

  const applyPreset = (p: Preset) => {
    slotMap.current.clear();
    p.ids.forEach((id, i) => slotMap.current.set(id, SLOT_VARS[i]));
    setSelected(p.ids);
    setTransform(p.t);
    setRangeYears(p.w);
    setProjectionOn(p.p);
    setWorkspaceView("compare"); setPendingAnchor("overlay");
  };

  const presetActive = (p: Preset) =>
    p.ids.length === selected.length &&
    p.ids.every((id) => selected.includes(id)) &&
    transform === p.t && rangeYears === p.w && projectionOn === p.p;

  useEffect(() => {
    let cancelled = false, inFlight = false;
    let previous: Snapshot | undefined;
    const refresh = async () => {
      setNow(Date.now());
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const next = await loadSnapshot(previous);
        if (!cancelled) {
          previous = next;
          setSnapshot(next);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Data refresh failed");
      } finally { inFlight = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  // CTA target: load a signal's series into the overlay and navigate there.
  const viewInOverlay = (ids: string[]) => {
    const valid = ids.filter((id) => seriesMap.has(id)).slice(0, SLOT_VARS.length);
    if (!valid.length) return;
    slotMap.current.clear();
    valid.forEach((id, i) => slotMap.current.set(id, SLOT_VARS[i]));
    setSelected(valid);
    if (valid.length === 1 && ["CPI", "INDPRO"].includes(valid[0])) setTransform("yoy");
    navigate({page:"dashboard",view:"compare"},{s:valid.join(","),t:valid.length===1&&["CPI","INDPRO"].includes(valid[0])?"yoy":transform},"overlay");
  };

  const toggleSeries = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        slotMap.current.delete(id);
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= SLOT_VARS.length) return prev;
      const used = new Set(slotMap.current.values());
      slotMap.current.set(id, SLOT_VARS.find((v) => !used.has(v))!);
      return [...prev, id];
    });
  };

  const from = rangeStart(rangeYears);
  const selectedSeries = useMemo(() => selected.map((id) => seriesMap.get(id)).filter((s): s is Series => !!s), [selected, seriesMap]);
  const sameUnit = new Set(selectedSeries.map((s) => s.unit)).size <= 1;
  const effectiveTransform = comparableTransform(selectedSeries, transform);
  const containsRates = selectedSeries.some(isRateSeries);

  const overlayItems: OverlaySeries[] = useMemo(
    () => selectedSeries.map((s) => ({
      series: effectiveTransform === 'raw' ? {...s,unit:displayAmount(1,s.unit,prefs.currency,snapshot?.fx,now).unit} : s,
      points: overlayPoints(s, effectiveTransform, from).map(([d,v])=>[d,effectiveTransform === 'raw' ? displayAmount(v,s.unit,prefs.currency,snapshot?.fx,now).value : v]),
      color: slotMap.current.get(s.id) ?? SLOT_VARS[0],
    })),
    [selectedSeries, from, effectiveTransform, prefs.currency, snapshot?.fx, now],
  );

  // Projections only make sense on comparable level scales (raw / indexed).
  const projectionAllowed = effectiveTransform === "raw" || effectiveTransform === "index";
  const projections: Projection[] = useMemo(() => {
    if (!projectionOn || !projectionAllowed || !forecasts) return [];
    const out: Projection[] = [];
    for (const s of selectedSeries) {
      const fc = forecasts.series[s.id];
      if (!fc || !analyticalMap.has(s.id)) continue;
      if (fc.kind === "model" && (fc.asOf !== s.lastUpdated || !recentTimestamp(fc.issuedAt, 72 * 3600000, now))) continue;
      if (fc.kind === "external" && !externalForecastCurrent(fc, now)) continue;
      const base = overlayPoints(s, "raw", from)[0]?.[1];
      if (effectiveTransform === "index" && !(base > 0)) continue;
      const scale = (v: number) => (effectiveTransform === "index" ? (v / base) * 100 : displayAmount(v,s.unit,prefs.currency,snapshot?.fx,now).value);
      const color = slotMap.current.get(s.id) ?? SLOT_VARS[0];
      if (fc.kind === "model") {
        out.push({
          name: s.name, color, sourceLabel: "model P50",
          fan: fc.points.map((p) => [p[0], scale(p[1]), scale(p[2]), scale(p[3]), scale(p[4]), scale(p[5])]),
        });
      } else {
        // Period-average external forecasts are not a continuation of the latest daily spot.
        const last = s.points[s.points.length - 1];
        out.push({
          name: s.name, color, sourceLabel: `${fc.retained ? "retained " : ""}${fc.source.split(" (")[0]}`,
          note: `${s.name}: ${fc.source}${fc.sourceVintage ? `, source version ${fc.sourceVintage}` : ""}. ${fc.periodBasis ?? ""}`,
          external: fc.points.filter((p) => p[0] > observationEnd(s.id, last[0])).map((p) => [p[0], scale(p[1])] as [string, number]),
        });
      }
    }
    return out;
  }, [projectionOn, projectionAllowed, forecasts, selectedSeries, analyticalMap, now, from, effectiveTransform, prefs.currency, snapshot?.fx]);

  return (
    <FxContext.Provider value={{fx:snapshot?.fx??null,now,loading:!snapshot&&!loadError}}><div className="app app-shell" data-density={density}>
      <a className="skip-link" href="#workspace-heading" onClick={e=>{e.preventDefault();document.getElementById("workspace-heading")?.focus();}}>{tr("Skip to analysis")}</a>
      <WorkspaceNav page={page} onNavigate={navigate}/>
      <div className="app-workarea">
      <header className="workspace-topbar"><div className="workspace-location"><span className="eyebrow">{tr("NEXUSQ ")}<span aria-hidden="true">{tr("/")}</span> {localize(WORKSPACES[page].label)}{localize(page==='nexsi'&&<><span aria-hidden="true">{tr("/")}</span><strong>{localize(nexsiSymbol)}</strong><span className="breadcrumb-window">{localize(nexsiEvent||`${nexsiHorizon} session${nexsiHorizon>1?'s':''}`)}</span></>)}</span><SessionClock now={now}/></div><div className="workspace-tools"><PreferencesControl density={density} onDensity={changeDensity}/><button className="search-trigger" onClick={()=>setSearchOpen(true)}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor"/><path d="m10 10 4 4" stroke="currentColor"/></svg><span>{tr("Find")}</span><kbd>{tr("Ctrl / ⌘ K")}</kbd></button><button className={`system-trigger ${exceptions.length?'has-exceptions':''}`} onClick={()=>setActivityOpen(true)} aria-label={tr(!snapshot&&!loadError?"Data status: checking publication":`Data status and activity: ${exceptions.length} active exceptions`)}><StatusMark tone={exceptions.some(e=>e.tone==='critical')?'critical':exceptions.length?'warning':'info'}/><span>{tr("Data status")}</span><b>{localize(!snapshot&&!loadError?'—':exceptions.length.toString().padStart(2,'0'))}</b></button><label className="density-control"><span className="sr-only">{tr("Display density")}</span><select aria-label={tr("Display density")} value={density} onChange={e=>changeDensity(e.target.value as 'compact'|'comfortable')}><option value="compact">{tr("Compact")}</option><option value="comfortable">{tr("Comfortable")}</option></select></label><button className="theme-toggle" onClick={toggle} aria-label={tr(mode==='dark'?'Switch to light theme':'Switch to dark theme')}><span aria-hidden="true">{tr("◐")}</span><span>{localize(mode==='dark'?'Light':'Dark')}</span></button></div></header>
      {localize(loadError&&<ResearchAlert tone="critical" title={tr("Publication verification failed")} action="Inspect status" onAction={()=>setActivityOpen(true)}>{tr("Update could not be verified. Retaining the previous verified data and retrying. ")}{localize(loadError)}</ResearchAlert>)}
      <main id="workspace-heading" tabIndex={-1} onClick={e=>{const anchor=(e.target as HTMLElement).closest('a[href^="#"]');const id=anchor?.getAttribute('href')?.slice(1);if(id&&SECTION_ROUTES[id]){e.preventDefault();navigate(SECTION_ROUTES[id],{},id);}}}>
      <CurrencyNotice/>{localize(page!=='home'&&<div className="workspace-utility"><span>{localize(WORKSPACES[page].description)}</span><button className="text-action" onClick={saveView}>{localize(toast?.title==='View saved'?'Saved':'Save view')}</button><button className="text-action" onClick={copyViewLink}>{localize(linkCopied?'Link copied':'Copy view link ↗')}</button></div>)}
      <RetainedView active={page==='home'}><ResearchDesk snapshot={snapshot} now={now} signals={signals} onNavigate={navigate} onSearch={()=>setSearchOpen(true)} saved={savedViews} onOpenSaved={openSaved} onRemoveSaved={hash=>storeViews(savedViews.filter(v=>v.hash!==hash))}/></RetainedView>
      <RetainedView active={page==='methodology'}><WorkspaceIntro eyebrow="Evidence & methods" title={tr("Know what supports the answer.")} description="Source freshness, methodological choices and uncertainty, open to inspection."/><DataStatus snapshot={snapshot} now={now} error={loadError}/><Methodology /></RetainedView>
      <RetainedView active={page==='nexsi'}>
        <NexSI snapshot={snapshot} now={now} mode={mode} symbol={nexsiSymbol} horizon={nexsiHorizon} onSymbol={company=>navigate({page:"nexsi",view:"explain"},{company,event:null})} onHorizon={setNexsiHorizon} eventDate={nexsiEvent} setEventDate={setNexsiEvent} view={workspaceView} onView={v=>navigate({page:"nexsi",view:v})} onFind={()=>setSearchOpen(true)} />
      </RetainedView>
      <RetainedView active={page==='dashboard'}>
      <WorkspaceIntro eyebrow="Nexus Signal / Market relationships" title={tr("See the market in context.")} description="Move between current conditions, comparative analysis and exposure. Your selected markets stay with you."/>
      <WorkspaceTabs page="dashboard" value={workspaceView} onChange={v=>navigate({page:"dashboard",view:v})}/>


      <WorkspacePanel page="dashboard" id="compare" active={workspaceView==='compare'}>

      <div className="preset-block">
        <button
          className="preset-toggle"
          onClick={() => setPresetsOpen((o) => !o)}
          aria-expanded={presetsOpen}
        >{tr("Start from a question ")}{localize(presetsOpen ? "▴" : "▾")}
        </button>
        <div className={`preset-row${presetsOpen ? " open" : ""}`}>
          <span className="control-label">{tr("Start from a question")}</span>
          {localize(PRESETS.map((p) => (
            <button
              key={p.key}
              className={`chip${presetActive(p) ? " on" : ""}`}
              onClick={() => { applyPreset(p); setPresetsOpen(false); }}
              title={tr(`Loads ${p.ids.join(" + ")} (${p.w ?? "all"}y)`)}
            >
              {localize(p.label)}
            </button>
          )))}
        </div>
      </div>



      <section id="overlay" className="card anchor-target">
        <div className="card-head">
          <h2>{tr("Cross-asset overlay")}</h2>
          <span className="head-actions">
            <button className="cta-link" onClick={copyViewLink} title={tr("Copy a link that reproduces exactly this view")}>
              {localize(linkCopied ? "Copied ✓" : "⧉ Copy view link")}
            </button>
            <Freshness
              date={selectedSeries.length ? selectedSeries.reduce((m, s) => (s.lastUpdated < m ? s.lastUpdated : m), "9999") : null}
              prefix="selection through"
              title={tr(selectedSeries.map((s) => `${s.name}: ${s.lastUpdated}`).join("\n"))}
            />
          </span>
        </div>
        <p className="sub">{tr("Compare energy fundamentals, commodities, equities and macro on one comparable axis.")}</p>
        <HowToRead>{tr("Projections are directional uncertainty envelopes, not point calls. A shaded ")}<GlossaryTip term="P10-P90" definition="Expected range where the model places outcomes between the 10th and 90th percentile at each horizon." />{tr(" band means higher uncertainty; dashed lines mark the projected median or external forecast path.")}</HowToRead>
        <div className="controls">
          <div className="control-group">
            <span className="control-label">{tr("Scale")}</span>
            <div className="seg">
              {localize((Object.keys(TRANSFORM_LABELS) as Transform[]).map((t) => (
                <button
                  key={t}
                  className={effectiveTransform === t ? "active" : ""}
                  disabled={(t === "raw" && !sameUnit) || (containsRates && (t === "index" || t === "yoy"))}
                  title={tr(containsRates && (t === "index" || t === "yoy") ? "Rates and GDP growth use raw percentage units or z-scores, not percentage growth of a rate" : t === "raw" && !sameUnit ? "Raw values need identical units across selected series" : undefined)}
                  onClick={() => setTransform(t)}
                >
                  {localize(TRANSFORM_LABELS[t])}
                </button>
              )))}
            </div>
          </div>
          <div className="control-group">
            <span className="control-label">{tr("Projection")}</span>
            <div className="seg">
              {localize([true, false].map((on) => (
                <button
                  key={String(on)}
                  className={projectionOn === on && projectionAllowed ? "active" : ""}
                  disabled={!projectionAllowed}
                  title={tr(!projectionAllowed ? "Projections show on raw or indexed scales only" : undefined)}
                  onClick={() => setProjectionOn(on)}
                >
                  {localize(on ? "On" : "Off")}
                </button>
              )))}
            </div>
          </div>
          <div className="control-group">
            <span className="control-label">{tr("Window")}</span>
            <div className="seg">
              {localize(RANGES.map((r) => (
                <button key={r.label} className={rangeYears === r.years ? "active" : ""} onClick={() => setRangeYears(r.years)}>
                  {localize(r.label)}
                </button>
              )))}
            </div>
          </div>
        </div>
        <SeriesPicker
          catalog={catalog}
          selected={selected}
          colors={slotMap.current}
          quality={quality}
          onToggle={toggleSeries}
        />
        {localize(seriesMap.size ? (
          <OverlayChart items={overlayItems} projections={projections} transform={effectiveTransform} themeMode={mode} />
        ) : (
          <Skeleton height={430} />
        ))}
      </section>

        <section id="correlations" className="card anchor-target">
          <div className="card-head">
            <h2>{tr("Correlation structure")}</h2>
            <Freshness
              date={selectedSeries.length ? selectedSeries.reduce((m, s) => (s.lastUpdated < m ? s.lastUpdated : m), "9999") : null}
              prefix="selection through"
            />
          </div>
          <p className="sub">{tr("Pearson ρ on matched observation intervals. Mixed daily/monthly frequencies are withheld; no forward-filled returns.")}{localize(" ")}
            <a className="cta-link" href="#signals">{tr("Regime shifts appear as signals ↗")}</a>
          </p>
          {localize(seriesMap.size ? (
            <CorrelationMatrix list={selectedSeries.filter((s) => analyticalMap.has(s.id))} from={from} themeMode={mode} />
          ) : (
            <Skeleton height={300} />
          ))}
        </section>

      </WorkspacePanel>
      <WorkspacePanel page="dashboard" id="pulse" active={workspaceView==='pulse'}>
      <QuotePanel snapshot={snapshot} now={now} />
      <div id="kpis" className="anchor-target">
        <div className="strip-head">
          <span className="control-label">{tr("Market pulse — select markets for comparison")}</span>
          <Freshness
            date={[...seriesMap.values()].reduce((m, s) => (s.lastUpdated > m ? s.lastUpdated : m), "") || null}
          />
        </div>
        {localize(seriesMap.size ? (
          <><KpiStrip quality={quality} now={now} seriesMap={seriesMap} selected={selected} onToggle={toggleSeries} /><button className="workspace-button secondary" onClick={()=>navigate({page:"dashboard",view:"compare"})}>{tr("Compare selected markets (")}{localize(selected.length)}{tr(") →")}</button></>
        ) : (
          <SkeletonTiles />
        ))}
      </div>


        <section id="signals" className="card anchor-target">
          <div className="card-head">
            <h2>{tr("Snapshot signals")}</h2>
            <Freshness
              date={signals?.length ? signals.reduce((m, signal) => signal.asOf < m ? signal.asOf : m, "9999") : null}
              prefix="computed through"
              title={tr("Oldest observation used by the displayed signals. Inputs failing QC are excluded; this is snapshot analysis, not intraday analysis.")}
            />
          </div>
          <p className="sub">{tr("Dislocations, momentum regimes and correlation-regime shifts from inputs that pass QC.")}{localize(" ")}
            <a className="cta-link" href="#validation">{tr("How reliable are these? See the backtest ↗")}</a>
          </p>
          <HowToRead>{tr("Dislocation signals compare levels (year-on-year growth for CPI and industrial production) using a trailing ")}<GlossaryTip term="z-score" definition="Distance from trailing mean measured in standard deviations; +2 means two sigmas above average." />{tr(". Bigger absolute z-score means a more unusual reading relative to that series' own history.")}</HowToRead>
          {localize(signals === null ? <SkeletonRows rows={6} /> : <SignalPanel signals={signals} onView={viewInOverlay} />)}
        </section>

      <section id="market-state" className="card anchor-target">
        <div className="card-head">
          <h2>{tr("Market state — percentile conditions")}</h2>
          <Freshness
            date={cot ? Object.values(cot.markets).reduce((m, c) => (c.lastUpdated > m ? c.lastUpdated : m), "") : null}
            prefix="positioning through"
            cadence="weekly"
            title={tr("CFTC COT publishes weekly (Friday, for Tuesday positions). Price conditions use the daily snapshots.")}
          />
        </div>
        <p className="sub">{tr("Where each energy market sits inside its own history: trend, volatility, dollar backdrop and futures positioning, each as a percentile — the regime at a glance.")}</p>
        {localize(seriesMap.size ? <MarketStatePanel seriesMap={analyticalMap} cot={cot} /> : <SkeletonRows rows={7} />)}
      </section>

      </WorkspacePanel>
      <WorkspacePanel page="dashboard" id="validation" active={workspaceView==='validation'}>
      <section id="validation" className="card anchor-target">
        <div className="card-head">
          <h2>{tr("Signal validation — event-study backtest")}</h2>
          {localize(backtest && <Freshness date={backtest.generated} prefix="computed" cadence="monthly" />)}
        </div>
        <p className="sub">{tr("Did what each signal describes actually happen afterwards? The production engine replayed over history, with publication lag imposed and firings collapsed to episodes — nulls published alongside positives.")}</p>
        {localize(backtest ? (
          <ValidationPanel bt={backtest} />
        ) : backtest === undefined ? (
          <SkeletonRows rows={7} />
        ) : (
          <p className="sub">{tr("Current-methodology backtest results unavailable. Earlier results are not presented as validation of a changed engine.")}</p>
        ))}
      </section>

      </WorkspacePanel>
      <WorkspacePanel page="dashboard" id="impact" active={workspaceView==='impact'}>
      <section id="equity-impact" className="card anchor-target">
        <div className="card-head">
          <h2>{tr("Equity impact — Energy Beta board")}</h2>
          <Freshness
            date={impact?.companies.length ? impact.companies.reduce((m, c) => (c.lastUpdated > m ? c.lastUpdated : m), "") : null}
          />
        </div>
        <p className="sub">{tr("How sensitive each energy-exposed stock is to the selected driver, and what a hypothetical shock implies. ")}<GlossaryTip term="β" definition="Sensitivity of stock returns to the selected energy driver: Cov(stock, driver) / Var(driver)." />{tr(" = Cov/Var on daily log-returns (rolling 90 paired observations).")}{localize(" ")}
          <a className="cta-link" href="#sovereign-impact">{tr("Country-level view ↗")}</a>
        </p>
        <HowToRead>
          <GlossaryTip term="β" definition="Sensitivity of stock returns to the selected energy driver: Cov(stock, driver) / Var(driver)." />{tr(" is slope sensitivity, while ")}<GlossaryTip term="R²" definition="Share of daily return variance explained by the selected energy driver in the same regression window." />{tr(" is explanatory fit. Scenario moves follow the fitted log-return relationship; they do not identify a causal effect.")}</HowToRead>
        {localize(impact && seriesMap.size ? (
          <EquityImpact companies={qualityCurrent(quality, now) ? impact.companies.filter((c) => companyEligible(c, now)) : []} seriesMap={analyticalMap} />
        ) : impact === null ? (
          <p className="sub">{tr("Impact data unavailable.")}</p>
        ) : (
          <SkeletonRows rows={9} />
        ))}
      </section>

      <section id="sovereign-impact" className="card anchor-target">
        <div className="card-head">
          <h2>{tr("Sovereign analysis — GDP–oil association")}</h2>
          <Freshness
            date={impact?.countries.length
              ? impact.countries.reduce((m, c) => {
                  const last = c.gdp[c.gdp.length - 1]?.[0] ?? "";
                  return last > m ? last : m;
                }, "")
              : null}
            cadence="annual"
          />
        </div>
        <p className="sub">{tr("Major energy exporters vs importers: how annual GDP growth has historically moved with Brent, and the fitted association under an annual oil-change scenario.")}{localize(" ")}
          <a className="cta-link" href="#overlay">{tr("GDP paths with institutional projections on the overlay ↗")}</a>
        </p>
        <HowToRead>{tr("Sovereign ")}<GlossaryTip term="β" definition="Cycle-controlled GDP sensitivity: percentage-point change in GDP growth per +10% oil move." />{tr(" is estimated on annual data with world-cycle control; use it as regime context, not a precise near-term forecast.")}</HowToRead>
        {localize(impact && seriesMap.size ? (
          qualityCurrent(quality, now) ? <GdpImpact impact={impact} now={now} /> : <p className="sub">{tr("GDP association estimates withheld until the quality assessment is renewed.")}</p>
        ) : impact === null ? (
          <p className="sub">{tr("Impact data unavailable.")}</p>
        ) : (
          <SkeletonRows rows={9} />
        ))}
      </section>
      </WorkspacePanel>
      </RetainedView>
      </main>
      <ActivityCenter pending={!snapshot&&!loadError} open={activityOpen} onClose={()=>setActivityOpen(false)} exceptions={exceptions} activity={activity} now={now} onInspect={nexsi=>navigate(nexsi?{page:'nexsi',view:'evidence'}:{page:'methodology',view:''})}/>
      <ResearchToast message={toast} onDismiss={dismiss}/>
      <ResearchSearch open={searchOpen} onClose={()=>setSearchOpen(false)} snapshot={snapshot} onNavigate={navigate}/>

      <footer className="footer">
        <div className="footer-brand">{tr("Nexus")}<span>{tr("Q")}</span>{tr(" · Gygante Quantitative Systems")}</div>
        <p className="workspace-note">{tr("Market intelligence for capital markets: energy, commodity and macro data turned into signals, scenarios and decisions.")}</p>
        <div className="footer-links">
          <button className="cta-link" onClick={() => navigate({page:"methodology",view:""})}>{tr("Methodology")}</button>
          <span>{tr("Data: FRED · Yahoo Finance · Nasdaq · World Bank · IMF · EIA")}</span>
        </div>
        <details className="platform-roadmap"><summary>{tr("Platform roadmap")}</summary><p>{tr("Nexus Model · Nexus Scenario · Nexus Portfolio · Nexus Agent — planned workspaces, not currently available.")}</p></details>
        <div className="footer-fine">{tr("NexusQ 2.1.2 · model output, not investment advice · © 2026 Gygante Quantitative Systems")}</div>
      </footer>
      </div>
    </div></FxContext.Provider>
  );
}

