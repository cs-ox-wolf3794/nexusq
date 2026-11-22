import { Money } from './Preferences';
import { useMoney } from '../lib/money';
import { number } from '../lib/preferences';
import { l as localize, t as tr } from '../lib/i18n';
import { companyName } from '../lib/display-names';
import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import type { Snapshot } from "../lib/snapshot";
import { quoteStatus } from "../lib/snapshot";
import type { Attribution } from "../lib/nexsi-model";
import { powerCostScenario } from "../lib/nexsi-model";
import { companyStatus, nexsiStatus } from "../lib/nexsi-quality";
import { NEXSI_PROJECTS, energyPathway } from "../lib/nexsi-projects";
import type { NexsiProject } from "../lib/nexsi-types";
import { EChart } from "./EChart";
import { readTokens, type ThemeMode } from "./useTheme";
import { HowToRead } from "./Guidance";
import { Freshness } from "./Freshness";
import { WorkspaceTabs, WorkspacePanel, ResearchDisclosure } from "./WorkspaceUI";
import { ConnectedInvestigation } from "./ConnectedInvestigation";
import { ResearchAlert, TimeStamp } from "./ResearchChrome";
import { displayDate, displayInstant } from "../lib/research-ui";
import { MoveExplanation, MoveEvidence } from "./NexsiExplanation";

const CHART_TOKENS = ["--text-primary", "--text-secondary", "--text-muted", "--gridline", "--surface-1", "--border", "--series-1", "--series-2"];

function useChartTokens(mode: ThemeMode) {
  const [tokens, setTokens] = useState(() => readTokens(CHART_TOKENS));
  useEffect(() => {
    // The shared theme stamps data-theme after rendering. Read the final palette.
    const frame = requestAnimationFrame(() => setTokens(readTokens(CHART_TOKENS)));
    return () => cancelAnimationFrame(frame);
  }, [mode]);
  return tokens;
}

const fmt = (v: number | null | undefined, suffix = "%", digits = 2) => v == null || !Number.isFinite(v) ? "Unavailable" : `${v > 0 ? "+" : ""}${number(v,digits,digits)}${suffix}`;
const stamp = (v: string | null) => displayInstant(v);
const interval = (a: Attribution) => `${fmt(a.energyCI[0], "")} to ${fmt(a.energyCI[1], " pp")}`;
const labels: Record<keyof Attribution["components"], string> = { market: "Broad market", technology: "Relative technology", rates: "Treasury / rates proxy", oil: "Oil futures", gas: "Gas futures", baseline: "Model baseline", unexplained: "Unexplained remainder" };

function CostScenario() {
  const money = useMoney();
  const conversion = money(1);
  const [mw, setMw] = useState(100), [util, setUtil] = useState(80), [pue, setPue] = useState(1.2);
  const [delta, setDelta] = useState(10), [share, setShare] = useState(50), [basis, setBasis] = useState<"IT" | "facility">("IT");
  const result = powerCostScenario(mw, util / 100, pue, delta, share / 100, basis);
  return <section className="card nexsi-scenario anchor-target" id="nexsi-power-scenario">
    <h2>{tr("Power-price cost scenario")}</h2>
    <p className="sub">{tr("An illustrative annual operating-cost scenario. These are editable assumptions, not a company forecast or a conversion from oil/gas futures to electricity prices.")}</p>
    <div className="nexsi-inputs">
      <label>{tr("Capacity (MW)")}<input type="number" min="0" max="100000" value={mw} onChange={e => setMw(e.target.valueAsNumber)} /></label>
      <label>{tr("Capacity basis")}<select aria-label={tr("Capacity basis")} value={basis} onChange={e => setBasis(e.target.value as "IT" | "facility")}><option value="IT">{tr("IT equipment load")}</option><option value="facility">{tr("Total facility load")}</option></select></label>
      <label>{tr("Average load (% of capacity)")}<input type="number" min="0" max="100" value={util} onChange={e => setUtil(e.target.valueAsNumber)} /></label>
      <label>{tr("Power usage effectiveness")}<input type="number" min="1" max="3" step="0.05" disabled={basis === "facility"} value={pue} onChange={e => setPue(e.target.valueAsNumber)} /></label>
      <label>{tr("Electricity change")} ({conversion.unit}/MWh)<input type="number" step="5" value={Number.isFinite(delta)?Number((delta * conversion.value).toFixed(4)):""} onChange={e => setDelta(e.target.valueAsNumber / conversion.value)} /></label>
      <label>{tr("Share exposed to change (%)")}<input type="number" min="0" max="100" value={share} onChange={e => setShare(e.target.valueAsNumber)} /></label>
    </div>
    <div className="nexsi-scenario-result" aria-live="polite">{localize(result ? <><strong><Money value={result.annualCostChange}/></strong><span>{tr("annual electricity-cost change • ")}{localize(number(result.annualMwh / 1000,1))}{tr(" GWh annual facility consumption")}</span></> : "Enter valid capacity, utilization, PUE and exposure assumptions.")}</div>
    <p className="sub">{tr("Capacity × 8,760 hours × average load × PUE (IT basis only) × price change × exposed share. A full year at the assumed load; no commissioning ramp. Generation capacity cannot be substituted for facility demand. Contracts, taxes, customer pass-through and efficiency determine the eventual earnings effect; no share-price effect is inferred.")}</p>
  </section>;
}

function Project({ project, snapshot, now }: { project: NexsiProject; snapshot: Snapshot; now: number }) {
  const rate = snapshot.nexsi?.electricity.rates.find(r => r.state === project.state);
  const rateEnd = rate ? Date.UTC(Number(rate.period.slice(0, 4)), Number(rate.period.slice(5, 7)), 0) : 0;
  const freshRate = rate && now - rateEnd <= 150 * 86400000 && rateEnd <= now;
  return <article className="nexsi-project">
    <span className="control-label">{localize(project.symbols.join(" / "))}{tr(" · ")}{localize(project.location)}</span><h4>{localize(project.name)}</h4>
    <p><strong>{localize(project.reportedStatus)}</strong></p><p>{localize(project.role)}</p>
    <p>{localize(project.capacityMw != null && <strong>{localize(number(project.capacityMw))}{tr(" MW · ")}{localize(project.capacityBasis)}{tr(" basis. ")}</strong>)}{localize(project.capacityNote)}</p>
    <p>{localize(project.timing)}</p><p>{localize(project.energyChannel)}</p>
    {localize(freshRate && <p className="nexsi-foot">{tr("Regional context: ")}<a href={rate.sourceUrl} target="_blank" rel="noreferrer">{tr("EIA ")}{localize(rate.state)}{tr(" commercial average")}</a> <Money value={rate.usdMwh} unit="USD/MWh" digits={1}/> ({localize(rate.period)}{tr("). This is not the facility's tariff.")}</p>)}
    <ul className="nexsi-sources">{localize(project.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{localize(s.title)}{tr(" ↗")}</a><small>{localize(s.published)}</small></li>))}</ul>
    <p className="nexsi-foot">{tr("Reviewed ")}{localize(project.reviewedAt)}{tr(". Status is as reported in the cited source.")}</p>
  </article>;
}

export function NexSI({ snapshot, now, mode, symbol, horizon, onSymbol, onHorizon, eventDate, setEventDate, view, onView, onFind }: {
  snapshot: Snapshot | null; now: number; mode: ThemeMode; symbol: string; horizon: number;
  onSymbol: (s: string) => void; onHorizon: (h: number) => void;
  eventDate: string; setEventDate: (date: string) => void;
  view: string; onView: (view: string) => void; onFind: () => void;
}) {
  const [search, setSearch] = useState(""), [scope, setScope] = useState("AI & technology"), [onlyDrops, setOnlyDrops] = useState(false);
  const [allProjects, setAllProjects] = useState(false);
  const file = snapshot?.nexsi;
  const selected = file?.companies.find(c => c.symbol === symbol) ?? file?.companies.find(c => c.symbol === "NVDA") ?? file?.companies[0];
  const suspended = file ? nexsiStatus(file, now) : null;
  const issue = selected ? suspended ?? companyStatus(selected, now) : null;
  const move = selected && !issue ? (eventDate ? selected.largestDrops.find(d => d.end === eventDate) : selected.moves[horizon]) : null;
  const companies = useMemo(() => (file?.companies ?? []).filter(c =>
    (scope === "All Nasdaq-100" || (scope === "AI & technology" ? c.included : c.group === scope))
    && `${c.symbol} ${c.name} ${companyName(c.symbol,c.name)}`.toLowerCase().includes(search.toLowerCase())
    && (!onlyDrops || (c.observedReturns[horizon] ?? 0) <= -3)
  ).sort((a, b) => (a.observedReturns[horizon] ?? Infinity) - (b.observedReturns[horizon] ?? Infinity)), [file, scope, search, onlyDrops, horizon]);
  const choose = (s: string) => onSymbol(s);
  const tokens = useChartTokens(mode);
  const contributionOption = useMemo<EChartsOption>(() => ({
    animation: false, textStyle: { color: tokens["--text-secondary"] },
    grid: { left: 122, right: 44, top: 12, bottom: 38 },
    tooltip: { trigger: "axis", confine: true, backgroundColor: tokens["--surface-1"], borderColor: tokens["--border"], textStyle: { color: tokens["--text-primary"] }, valueFormatter: v => `${number(Number(v),2,2)} pp` },
    xAxis: { type: "value", name: "percentage points", nameLocation: "middle", nameGap: 25, axisLabel: { color: tokens["--text-muted"] }, splitLine: { lineStyle: { color: tokens["--gridline"] } } },
    yAxis: { type: "category", inverse: true, data: Object.keys(move?.components ?? {}).map(k => labels[k as keyof typeof labels]), axisLabel: { color: tokens["--text-secondary"], fontSize: 12, width: 112, overflow: "break" }, axisTick: { show: false }, axisLine: { lineStyle: { color: tokens["--gridline"] } } },
    series: [{ type: "bar", data: Object.entries(move?.components ?? {}).map(([key, value]) => ({ value, itemStyle: { color: tokens[key === "oil" || key === "gas" ? "--series-2" : key === "unexplained" ? "--text-muted" : "--series-1"] } })), barMaxWidth: 20, label: { show: true, position: "right", color: tokens["--text-secondary"], formatter: p => number(Number(p.value),2,2), fontSize: 12 } }],
  }), [move, tokens]);
  const historyOption = useMemo<EChartsOption>(() => ({
    animation: false, textStyle: { color: tokens["--text-secondary"] }, grid: { left: 48, right: 18, top: 20, bottom: 35 },
    tooltip: { trigger: "axis", confine: true, backgroundColor: tokens["--surface-1"], borderColor: tokens["--border"], textStyle: { color: tokens["--text-primary"] }, valueFormatter: v => number(Number(v),2,2) },
    xAxis: { type: "category", data: selected?.history.map(p => p[0]), axisLabel: { color: tokens["--text-muted"] }, axisLine: { lineStyle: { color: tokens["--gridline"] } } },
    yAxis: { type: "value", scale: true, axisLabel: { color: tokens["--text-muted"] }, splitLine: { lineStyle: { color: tokens["--gridline"] } } },
    series: [{ type: "line", showSymbol: false, data: selected?.history.map(p => p[1] / selected.history[0][1] * 100), lineStyle: { color: tokens["--series-1"], width: 2 }, itemStyle: { color: tokens["--series-1"] } }],
  }), [selected, tokens]);
  const projects = NEXSI_PROJECTS.filter(p => allProjects || p.symbols.includes(selected?.symbol ?? ""));
  if (!snapshot || !file || !selected) return <section className="card"><h2>{tr("NexSI · AI, energy & capital markets")}</h2><p>{localize(!snapshot ? "Loading the validated company snapshot…" : "Company analysis is awaiting its first validated publication. No estimated values are substituted.")}</p></section>;
  const currentCompanies = file.companies.filter(c => !suspended && !companyStatus(c, now) && c.moves[horizon]);
  const quote = snapshot.quotes?.quotes[selected.symbol];
  const totalOther = move ? move.components.market + move.components.technology + move.components.rates + move.components.baseline : null;
  return <div className="nexsi research-nexsi">
    <header className="workspace-intro investigation-title"><div><p className="eyebrow">{tr("NexSI / Company investigation · ")}{localize(selected.group)}</p><h1>{localize(selected.symbol)} <span title={tr(selected.name)}>{localize(companyName(selected.symbol,selected.name))}</span></h1></div><button className="workspace-button secondary" onClick={onFind} aria-label={tr("Change company")}><span className="change-label">{tr("Change company")}</span><span aria-hidden="true">{tr("⌕")}</span></button></header>
    <WorkspaceTabs page="nexsi" value={view} onChange={onView}/>
    <div className="investigation-context">
              <div className="nexsi-company-heading"><div><strong>{selected.price == null ? tr("No close") : <Money value={selected.price}/> }</strong><small>{tr("Latest completed close · ")}{localize(displayDate(selected.asOf))}</small></div></div>
      <div className="investigation-controls"><label>{tr("Return window")}<select aria-label={tr("Analysis return window")} value={horizon} onChange={e=>{onHorizon(Number(e.target.value));setEventDate('');}}>{localize([1,5,20].map(h=><option key={h} value={h}>{tr(`${h} session${h>1?'s':''}`)}</option>))}</select></label></div>
    </div>
    <div className="investigation-clocks" aria-label={tr("Observation and processing times")}><TimeStamp label="Latest price close" value={selected.asOf}/><TimeStamp label="Model calculated" value={file.generated}/><TimeStamp label="History retrieved" value={selected.retrievedAt}/><TimeStamp label="Evidence checked" value={selected.eventCheckedAt}/></div>
    <div className="analysis-status-line"><span className="type-label">{tr("Daily attribution")}</span><span>{tr("Completed-session model · ")}{localize(suspended?"Withheld until source checks recover":issue?"Company attribution withheld":move?"Selected-window estimate available":"Selected window unavailable")}</span><button className="text-action" onClick={()=>onView("evidence")}>{tr("Inspect coverage →")}</button></div>
    {localize(suspended&&<ResearchAlert tone="critical" title={tr("Current attribution suspended")} action="Inspect coverage" onAction={()=>onView("evidence")}>{localize(suspended)}</ResearchAlert>)}
    {localize(!suspended&&file.status==='degraded'&&<ResearchAlert title={tr("Source updates incomplete")} action="Inspect coverage" onAction={()=>onView("evidence")}>{tr("Available company models remain visible; retained evidence keeps its original dates.")}</ResearchAlert>)}
    <WorkspacePanel page="nexsi" id="explain" active={view==='explain'}><section className="card nexsi-detail anchor-target" id="nexsi-company-analysis" aria-label={tr("Selected company analysis")}>

        {localize(quote && selected.price && selected.asOf && quote.observedAt.slice(0, 10) > selected.asOf && <p className="nexsi-callout">{tr("Reported price change since the last completed close: ")}{localize(fmt((quote.price / selected.price - 1) * 100))}{tr(" (unadjusted; splits or distributions may affect this comparison). Attribution for that newer move awaits complete daily observations.")}</p>)}
        {localize(symbol !== selected.symbol && <p className="nexsi-alert">{tr("⚠ The requested ticker ")}{localize(symbol)}{tr(" is absent from this membership publication. Showing ")}{localize(selected.symbol)}{tr(" instead.")}</p>)}
        {localize(eventDate && !selected.largestDrops.some(d => d.end === eventDate) && <p className="nexsi-alert">{tr("⚠ The requested historical move is outside the available major-drop set. Select the latest window or another available date.")}</p>)}
        <ResearchDisclosure title={tr("Choose another move")} description={eventDate?`Historical daily drop · ${eventDate}`:`Latest ${horizon}-session window selected`}>        <div className="nexsi-event-picker"><label>{tr("Investigate a move")}<select aria-label={tr("Investigate a move")} value={eventDate} onChange={e => { setEventDate(e.target.value); if(e.target.value)onHorizon(1); }}><option value="">{tr("Latest ")}{localize(horizon)}{tr("-session move")}</option>{localize(selected.largestDrops.map(a => <option key={a.end} value={a.end}>{localize(a.end)}{tr(": ")}{localize(fmt(a.actual))}{tr(" in 1 session")}</option>))}</select></label><small>{tr("Up to five largest daily losses ≥3% over the latest 60 sessions with sufficient model coverage.")}</small></div></ResearchDisclosure>
        {localize(issue && !suspended && <ResearchAlert tone="critical" title={tr("Attribution withheld for this company")}>{localize(issue)}</ResearchAlert>)}
        {localize(move ? <>
          <p className="nexsi-period control-label">{tr("Completed closes: ")}{localize(displayDate(move.start))}{tr(" → ")}{localize(displayDate(move.end))}{tr(" · ")}{tr(`${move.sessions} trading session${move.sessions > 1 ? "s" : ""}`)}</p>
          <div className="kpi-strip nexsi-metrics">
            <div className="kpi-tile"><span className="kpi-name">{tr("Observed stock return")}</span><strong className={move.actual < 0 ? "nexsi-negative" : "nexsi-positive"}>{localize(fmt(move.actual))}</strong><small>{localize(selected.provenance?.returnBasis ?? "Adjusted for splits and distributions")}</small></div>
            <div className="kpi-tile"><span className="kpi-name">{tr("Energy-associated estimate")}</span><strong>{localize(fmt(move.energy, " pp"))}</strong><small>{tr("95% parameter interval: ")}{localize(interval(move))}</small></div>
            <div className="kpi-tile"><span className="kpi-name">{tr("Other modeled components")}</span><strong>{localize(fmt(totalOther, " pp"))}</strong><small>{tr("Market + relative tech + rates + baseline")}</small></div>
            <div className="kpi-tile"><span className="kpi-name">{tr("Unexplained remainder")}</span><strong>{localize(fmt(move.components.unexplained, " pp"))}</strong><small>{tr("Company events, omitted factors and model error")}</small></div>
          </div>
          <ConnectedInvestigation key={selected.symbol+move.start+move.end} company={selected} move={move} factors={file.factors} now={now} onEvidence={()=>onView('evidence')}/>
          <MoveExplanation move={move} company={selected} factors={file.factors} now={now} />
          {localize(move.warning && <p className="nexsi-alert">{tr("⚠ ")}{localize(move.warning)}</p>)}
          <ResearchDisclosure title={tr("Full component chart & model diagnostics")} description="Seven fitted components, exact contributions and held-out checks">
          <div aria-label={tr("Return component chart, percentage points")}><EChart height={300} option={contributionOption} /></div>
          <HowToRead title={tr("Exact contributions and model checks")}><dl className="nexsi-contributions">{localize(Object.entries(move.components).map(([k, v]) => <div key={k}><dt>{localize(labels[k as keyof typeof labels])}</dt><dd>{localize(fmt(v, " pp", 4))}</dd></div>))}<div><dt>{tr("Reconciled total")}</dt><dd>{localize(fmt(move.actual, "%", 4))}</dd></div></dl>
            <p>{tr("Fit: ")}{localize(move.fit.n)}{tr(" matched observations from ")}{localize(move.fit.from)}{tr(" through ")}{localize(move.fit.through)}{tr(", ending before this move. In-sample R² ")}{localize((move.fit.r2 * 100).toFixed(1))}{tr("%; maximum variance inflation ")}{localize(move.fit.maxVif.toFixed(2))}{tr(".")}</p>
            {localize(selected.validation ? <p>{tr("Latest rolling held-out check (")}{localize(selected.validation.n)}{tr(" sessions, ending ")}{localize(selected.asOf)}{tr("): R² ")}{localize((selected.validation.r2 * 100).toFixed(1))}{tr("%; log-return RMSE ")}{localize(selected.validation.rmseLogPct.toFixed(2))}{tr("% with energy versus ")}{localize(selected.validation.withoutEnergyRmseLogPct.toFixed(2))}{tr("% without energy. ")}{localize(selected.validation.energyImprovesFit ? "Energy improved the recent explanatory fit." : "Energy did not improve the recent explanatory fit; treat its attribution with added caution.")}{tr(" This uses realized factor moves and is not a forecasting record. For historical events this check includes later data; it never enters that event's fit.")}</p> : <p>{tr("Insufficient held-out observations for a validation comparison.")}</p>)}
          </HowToRead>
          </ResearchDisclosure>
        </> : <p className="nexsi-callout">{tr("Attribution withheld for this window. At least 126 prior matched observations, complete event coverage and stable factor estimates are required. Observed returns remain available in the company screen.")}</p>)}
        <HowToRead title={tr("Price history and existing NexusQ signals")}><p>{tr("Adjusted performance over up to 252 sessions; first observation = 100. Drawdown from the highest adjusted close in this window: ")}{localize(fmt(selected.drawdown))}{tr(".")}</p>
          <EChart height={220} option={historyOption} />
          {localize(!issue && selected.signals.length ? <ul>{localize(selected.signals.map((s, i) => <li key={i}><strong>{localize(s.severity)}{tr(" · ")}{localize(s.label)}</strong>{tr(": ")}{localize(s.detail)}</li>))}</ul> : <p>{localize(issue ? "Current signals suspended." : "No existing NexusQ threshold signal is active.")}</p>)}
        </HowToRead>
        <ResearchDisclosure title={tr("Price context, history source & energy pathway")} description="Latest reported quote, completed close and the company's transmission channel">        {localize(quote && <p className="nexsi-foot">{tr("Latest reported quote:")} <Money value={quote.price} unit={quote.currency}/>{tr(" · ")}{localize(stamp(quote.observedAt))}{tr(" · ")}{localize(quoteStatus(quote, now).label)}{localize(quote.delayMinutes != null && ` · provider delay ${quote.delayMinutes} min`)}{tr(". Quotes are separate from completed-session attribution.")}</p>)}
        <p className="sub">{localize(energyPathway(selected.group))}</p>
        {localize(selected.provenance && <p className="nexsi-foot">{tr("Price history: ")}<a href={selected.provenance.url} target="_blank" rel="noreferrer">{localize(selected.provenance.provider)}{tr(" ↗")}</a>{tr(" · ")}{localize(selected.provenance.returnBasis)}{tr(". Retrieved ")}{localize(stamp(selected.retrievedAt))}{tr(".")}</p>)}
</ResearchDisclosure>
        <div className="investigation-next"><div><span className="eyebrow">{tr("Continue the investigation")}</span><p>{tr("Check the disclosures and physical exposure behind this company.")}</p></div><button className="workspace-button secondary" onClick={()=>onView('evidence')}>{tr("Inspect evidence →")}</button><button className="workspace-button secondary" onClick={()=>onView('projects')}>{tr("Projects & power →")}</button></div>
      </section></WorkspacePanel>
    <WorkspacePanel page="nexsi" id="screen" active={view==='screen'}><aside className="card nexsi-board anchor-target" id="nexsi-screen" aria-label={tr("Company screen")}>
        <h2>{tr("Company screen")}</h2><p className="sub">{tr("Sorted by the largest loss. Select a company to investigate.")}</p>
        <label className="nexsi-label control-group">{tr("Find a company")}<input type="search" value={search} placeholder={tr("Name or ticker")} onChange={e => setSearch(e.target.value)} /></label>
        <label className="nexsi-label control-group">{tr("Universe")}<select aria-label={tr("Universe")} value={scope} onChange={e => setScope(e.target.value)}>{localize(["AI & technology", "All Nasdaq-100", ...new Set(file.companies.map(c => c.group))].map(s => <option key={s} value={s}>{localize(s)}</option>))}</select></label>
        <div className="seg" aria-label={tr("Return window")}>{localize([1, 5, 20].map(h => <button key={h} className={horizon === h ? "active" : ""} aria-pressed={horizon === h} onClick={() => { onHorizon(h); setEventDate(""); }}>{tr(`${h} session${h > 1 ? "s" : ""}`)}</button>))}</div>
        <label className="nexsi-checkbox"><input type="checkbox" checked={onlyDrops} onChange={e => setOnlyDrops(e.target.checked)} />{tr("Losses of 3% or more")}</label>
        <p className="nexsi-foot">{localize(companies.length)}{tr(" results · adjusted-close returns")}</p>
        <div className="nexsi-company-list">{localize(companies.map(c => {
          const blocked = suspended ?? companyStatus(c, now), a = !blocked ? c.moves[horizon] : null;
          return <button key={c.symbol} className={`nexsi-company${c.symbol === selected.symbol ? " selected" : ""}`} onClick={() => choose(c.symbol)} aria-pressed={c.symbol === selected.symbol}>
            <span><strong>{localize(c.symbol)}</strong><small title={tr(c.name)}>{localize(companyName(c.symbol,c.name))}</small></span><span className={(c.observedReturns[horizon] ?? 0) < 0 ? "nexsi-negative" : "nexsi-positive"}>{localize(fmt(c.observedReturns[horizon]))}</span>
            <small className="nexsi-company-energy">{tr("Energy estimate ")}{localize(a ? fmt(a.energy, " pp") : "withheld")}{localize(a && a.energyCI[0] <= 0 && a.energyCI[1] >= 0 ? " · inconclusive" : "")}</small><small className="nexsi-company-date">{localize(c.asOf ?? "No close")}{localize(blocked ? " · review data" : "")}</small>
          </button>;
        }))}{localize(!companies.length && <p>{tr("No companies match these filters.")}</p>)}</div>
      </aside></WorkspacePanel>
    <WorkspacePanel page="nexsi" id="projects" active={view==='projects'}><section className="card anchor-target" id="nexsi-projects"><div className="nexsi-section-heading card-head"><div><h2>{tr("Data-center projects & power commitments")}</h2><p className="sub">{tr("Primary-source case studies. Coverage is curated, not an exhaustive project inventory. Capacity and status retain the source's meaning.")}</p></div><label className="nexsi-checkbox"><input type="checkbox" checked={allProjects} onChange={e => setAllProjects(e.target.checked)} />{tr("Show all case studies")}</label></div>
      {localize(projects.length ? <div className="nexsi-project-grid">{localize(projects.map(p => <Project key={p.id} project={p} snapshot={snapshot} now={now} />))}</div> : <p>{tr("No independently curated facility or power commitment for ")}{localize(selected.symbol)}{tr(" in this release. This does not establish that the company has no data-center exposure. Inspect its filings in Evidence & coverage, or show all case studies to explore the operator side of the supply chain.")}</p>)}
      {localize(file.electricity.issue && <p className="nexsi-foot">{tr("Regional electricity benchmark: ")}{localize(file.electricity.issue)}{tr(". Retained observations, where within 150 days of period end, keep their original dates.")}</p>)}
    </section>
    <CostScenario /></WorkspacePanel>
    <WorkspacePanel page="nexsi" id="evidence" active={view==='evidence'}><div className="card"><p className="source-entity-name">{tr("Published company name: ")}<strong>{localize(selected.name)}</strong></p><MoveEvidence company={selected} move={move} now={now}/></div><section className="card anchor-target" id="nexsi-overview">
      <div className="card-head"><h2>{tr("AI stocks — energy & capital markets")}</h2><Freshness date={file.factors.find(f => f.symbol === "SPY")?.asOf} /></div>
      <p className="sub">{tr("Trace stock moves through the market, energy prices and company evidence. Explore the data-center projects behind the exposure.")}</p>
      <div className="kpi-strip nexsi-stats">
        <div className="kpi-tile"><span className="kpi-name">{tr("Nasdaq-100 coverage")}</span><strong className="kpi-value">{localize(file.universe.members.length)} <span className="kpi-unit">{tr("securities")}</span></strong><small>{tr("Published membership ")}{localize(file.universe.asOf)}</small></div>
        <div className="kpi-tile"><span className="kpi-name">{tr("AI & technology screen")}</span><strong className="kpi-value">{localize(file.companies.filter(c => c.included).length)} <span className="kpi-unit">{tr("securities")}</span></strong><small>{tr("Technology and curated AI businesses")}</small></div>
        <div className="kpi-tile"><span className="kpi-name">{tr("Eligible attributions")}</span><strong className="kpi-value">{localize(currentCompanies.length)} <span className="kpi-unit">{tr("of ")}{localize(file.companies.length)}</span></strong><small>{localize(horizon)}{tr("-session window · full universe")}</small></div>
      </div>
      <p className="nexsi-foot">{tr("Membership published ")}{localize(file.universe.asOf)}{tr(" · analysis refreshed ")}{localize(stamp(file.generated))}{tr(" · ")}<a href={file.universe.sources[0]} target="_blank" rel="noreferrer">{tr("Nasdaq membership ↗")}</a></p>
      <HowToRead>{tr("The energy component is a statistical estimate after market, technology and rate controls. It is not proof of what caused the move. The unexplained portion stays visible. Choose a company and a completed-session window to compare these components.")}</HowToRead>
      {localize(suspended && <p role="status" className="nexsi-alert">{tr("⚠ ")}{localize(suspended)}</p>)}
      {localize(!suspended && file.status === "degraded" && <p role="status" className="nexsi-alert">{tr("⚠ Some source updates are incomplete. Available company models remain visible; inspect coverage and source health for the gaps.")}</p>)}
      <HowToRead title={tr("Coverage and source health")}><p>{tr("The default screen includes official Nasdaq technology members plus a broad, curated set of cloud, chip, hardware, software and AI application businesses. Inclusion does not establish material AI revenue. All published constituents remain available, including non-technology companies and power suppliers. Separate share classes count as separate securities.")}</p><p>{tr("Current-membership selection and revised price histories limit historical inference. This is not a historical index backtest.")}</p><p>{localize(file.status === "ok" ? "All requested source updates completed." : "Some sources or evidence links could not be refreshed; details below.")} {localize(file.universe.retained && "Membership uses the last validated publication.")}</p><ul>{localize(file.failures.map((f, i) => <li key={i}>{localize(f)}</li>))}</ul><p>{localize(file.companies.filter(c => c.eventIssues.length).length)}{tr(" companies have evidence-source gaps. Selected-company gaps appear with its supporting sources.")}</p><p><a href={`${import.meta.env.BASE_URL}data/nexsi.json`}>{tr("Download analysis JSON")}</a>{tr(" · ")}<a href={`${import.meta.env.BASE_URL}data/nexsi-prices.json`}>{tr("Download model inputs")}</a></p></HowToRead>
    </section>    <section className="card anchor-target" id="nexsi-inputs"><h2>{tr("Energy and market inputs")}</h2><div className="nexsi-factor-grid">{localize(file.factors.map(f => <div key={f.symbol}><strong>{localize(f.label)}</strong><p>{localize(f.basis)}</p><a href={f.sourceUrl} target="_blank" rel="noreferrer">{localize(f.symbol)}{tr(" · ")}{localize(f.asOf || "Unavailable")}{tr(" ↗")}</a></div>))}</div><p className="sub">{tr("Oil and gas futures are energy-market proxies, not data-center electricity costs. Settlement times, contract rolls and exchange holidays differ. The existing official spot-price, inventory, inflation and macro series remain available in Nexus Signal.")}</p></section>
    <NexsiMethodology /></WorkspacePanel>
  </div>;
}

export function NexsiMethodology({id="nexsi-methodology"}:{id?:string}) {
  return <section className="card anchor-target" id={id}><h2>{tr("NexSI methodology · 2026-11-21.1")}</h2><HowToRead title={tr("How the attribution and uncertainty work")}>
    <p>{tr("Price-source basis is shown for each company. SanDisk uses Nasdaq split-adjusted price history (cash dividends excluded), with Yahoo split-adjusted prices as a validated fallback; other equities and ETF controls use Yahoo closes adjusted for splits and distributions. SanDisk’s entire series is replaced together; overlapping returns, dates and coverage must pass validation, and new price discontinuities above a 1.5× ratio require review. A stock split is never applied twice. These are conditional stock-return estimates, not uniform total-shareholder-return comparisons across companies.")}</p>
    <p>{tr("Adjusted stock log return = intercept + β₁ SPY + β₂ (QQQ − SPY) + β₃ IEF + β₄ WTI futures + β₅ Henry Hub gas futures + residual. Fit uses the latest 252 complete matched return intervals before the event, with at least 126, a maximum 520-day span and maximum variance inflation factor of 20. Both endpoints must match across every instrument; intervals longer than seven calendar days are excluded. No missing returns are filled. Singular models are withheld.")}</p>
    <p>{tr("Each contribution sums coefficient × factor log returns over the selected window. All components use the same observed-log-to-simple-return scale, so the displayed percentage-point components reconcile exactly to the adjusted stock return. The remainder is actual minus fitted contributions; it includes omitted drivers and model error. The energy estimate adds the oil and gas components.")}</p>
    <p>{tr("The approximate 95% parameter interval uses Newey–West covariance with Bartlett weights, floor(4 × (n/100)^(2/9)) lags, finite-sample correction and multiplier 1.98. It includes covariance between oil and gas coefficients. This is not a prediction interval, a causal confidence interval or simultaneous protection across 101 securities. Factor measurement error, changing exposures and model selection remain outside the interval. A factor move beyond five training standard deviations is flagged; a share-of-loss estimate is shown only for losses of at least 3% when the interval is entirely negative and no such extrapolation is present.")}</p>
    <p>{tr("Market and technology controls can absorb energy's indirect macroeconomic effects; the energy component is conditional, not the total economic effect. SPY and QQQ contain some screened stocks, causing mechanical overlap. IEF is a Treasury ETF return proxy, not a pure interest-rate shock. Futures are continuous vendor series with contract rolls and differing close times. This model cannot determine precisely why a stock moved.")}</p>
    <p>{tr("Explanations distinguish modeled contributions, observed factor returns and unassigned company context. Observed technology performance is the change in the QQQ/SPY ratio; the fit uses its log return. Positive unexplained returns offset modeled losses; the residual is never assigned automatically to news. Primary filings and unreviewed ticker-feed headlines are separated, with New York publication timing and scheduled early closes. Evidence published after a move is follow-up context, not an established catalyst.")}</p>
    <p>{tr("Company summaries use free SEC 8-K/6-K releases, accession-matched SEC structured financial statements and selected official company transcripts. Apple uses a separately labelled free third-party transcript, with issuer and reporting-period checks. Numerical forecasts, qualitative outlook, limited-scope guidance, explicit no-guidance policy, reviewed absence in a specific release and missing coverage are separate states. Silence or failed extraction never establishes a no-guidance policy. Structured earnings use whole-entity standard accounting concepts, explicit currencies and the exact filing and reporting period; year-to-date values and later restatements are not substituted for a quarter. Annual figures remain annual. Extraction preserves forecast ranges and GAAP/non-GAAP labels; unsupported formats remain unsummarized. Document-reviewed notes require the exact source checksum and are never reused for a changed release. Absence and policy assessments are not carried into a later reporting cycle without fresh evidence. Transcript publication time is treated as unverified, not borrowed from a filing. A confirmed disclosure verifies the presence of a company statement, not its truth, an achieved forecast or a causal price effect. No analyst-consensus surprise or news contribution is inferred. Full refreshes discover new filings, recheck successful documents after one day and retry failed sources; failures retain dated evidence with visible warnings. Per-category coverage is reported automatically. These are selective summaries, not intraday news alerts or exhaustive news coverage.")}</p>
    <p>{tr("Held-out checks refit before each of the latest 60 available sessions and compare squared errors with and without energy using realized factors. At least 20 checks are required. R² can be negative. This tests explanatory stability, not tradable forecasts. Existing dislocation and moving-average signals are reused without threshold changes. Historical data may be revised; these are not archived point-in-time input vintages.")}</p>
    <p>{tr("Analytical snapshots expire after 72 hours; daily stock/factor observations after seven days; membership publications after 45 days. Quotes target 15-minute checks on the existing free schedule, with visible provider timestamps and delay status. Daily attribution is updated on full refreshes and never applies a daily fit to an incomplete intraday move. Project disclosures are manually curated and dated; EIA commercial electricity averages expire 150 days after the reported month end and are regional context, not industrial contracts or site tariffs.")}</p>
    <p><a href="https://www.nasdaq.com/docs/global-indexes/NDX" target="_blank" rel="noreferrer">{tr("Nasdaq membership")}</a>{tr(" · ")}<a href="https://www.nasdaq.com/docs/global-indexes/NDXT" target="_blank" rel="noreferrer">{tr("Nasdaq technology subset")}</a>{tr(" · ")}<a href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces" target="_blank" rel="noreferrer">{tr("SEC disclosure API")}</a>{tr(" · ")}<a href="https://www.eia.gov/opendata/documentation.php" target="_blank" rel="noreferrer">{tr("EIA electricity metadata")}</a></p>
  </HowToRead></section>;
}
