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
import { SectionNav } from "./SectionNav";

const SECTIONS = [
  { id: "nexsi-overview", label: "Coverage" }, { id: "nexsi-screen", label: "Company screen" },
  { id: "nexsi-company-analysis", label: "Stock impact" }, { id: "nexsi-projects", label: "Data centers" },
  { id: "nexsi-power-scenario", label: "Power scenario" }, { id: "nexsi-inputs", label: "Market inputs" },
  { id: "nexsi-methodology", label: "Methodology" },
];
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

const fmt = (v: number | null | undefined, suffix = "%", digits = 2) => v == null || !Number.isFinite(v) ? "Unavailable" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}${suffix}`;
const stamp = (v: string | null) => v ? `${new Date(v).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC` : "Unavailable";
const interval = (a: Attribution) => `${fmt(a.energyCI[0], "")} to ${fmt(a.energyCI[1], " pp")}`;
const labels: Record<keyof Attribution["components"], string> = { market: "Broad market", technology: "Relative technology", rates: "Treasury / rates proxy", oil: "Oil futures", gas: "Gas futures", baseline: "Model baseline", unexplained: "Unexplained remainder" };

function CostScenario() {
  const [mw, setMw] = useState(100), [util, setUtil] = useState(80), [pue, setPue] = useState(1.2);
  const [delta, setDelta] = useState(10), [share, setShare] = useState(50), [basis, setBasis] = useState<"IT" | "facility">("IT");
  const result = powerCostScenario(mw, util / 100, pue, delta, share / 100, basis);
  return <section className="card nexsi-scenario anchor-target" id="nexsi-power-scenario">
    <h2>Power-price cost scenario</h2>
    <p className="sub">An illustrative annual operating-cost scenario. These are editable assumptions, not a company forecast or a conversion from oil/gas futures to electricity prices.</p>
    <div className="nexsi-inputs">
      <label>Capacity (MW)<input type="number" min="0" max="100000" value={mw} onChange={e => setMw(e.target.valueAsNumber)} /></label>
      <label>Capacity basis<select aria-label="Capacity basis" value={basis} onChange={e => setBasis(e.target.value as "IT" | "facility")}><option value="IT">IT equipment load</option><option value="facility">Total facility load</option></select></label>
      <label>Average load (% of capacity)<input type="number" min="0" max="100" value={util} onChange={e => setUtil(e.target.valueAsNumber)} /></label>
      <label>Power usage effectiveness<input type="number" min="1" max="3" step="0.05" disabled={basis === "facility"} value={pue} onChange={e => setPue(e.target.valueAsNumber)} /></label>
      <label>Electricity change ($/MWh)<input type="number" step="5" value={delta} onChange={e => setDelta(e.target.valueAsNumber)} /></label>
      <label>Share exposed to change (%)<input type="number" min="0" max="100" value={share} onChange={e => setShare(e.target.valueAsNumber)} /></label>
    </div>
    <div className="nexsi-scenario-result" aria-live="polite">{result ? <><strong>{fmt(result.annualCostChange / 1e6, " million USD", 2)}</strong><span>annual electricity-cost change • {(result.annualMwh / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} GWh annual facility consumption</span></> : "Enter valid capacity, utilization, PUE and exposure assumptions."}</div>
    <p className="sub">Capacity × 8,760 hours × average load × PUE (IT basis only) × price change × exposed share. A full year at the assumed load; no commissioning ramp. Generation capacity cannot be substituted for facility demand. Contracts, taxes, customer pass-through and efficiency determine the eventual earnings effect; no share-price effect is inferred.</p>
  </section>;
}

function Project({ project, snapshot, now }: { project: NexsiProject; snapshot: Snapshot; now: number }) {
  const rate = snapshot.nexsi?.electricity.rates.find(r => r.state === project.state);
  const rateEnd = rate ? Date.UTC(Number(rate.period.slice(0, 4)), Number(rate.period.slice(5, 7)), 0) : 0;
  const freshRate = rate && now - rateEnd <= 150 * 86400000 && rateEnd <= now;
  return <article className="nexsi-project">
    <span className="control-label">{project.symbols.join(" / ")} · {project.location}</span><h4>{project.name}</h4>
    <p><strong>{project.reportedStatus}</strong></p><p>{project.role}</p>
    <p>{project.capacityMw != null && <strong>{project.capacityMw.toLocaleString()} MW · {project.capacityBasis} basis. </strong>}{project.capacityNote}</p>
    <p>{project.timing}</p><p>{project.energyChannel}</p>
    {freshRate && <p className="nexsi-foot">Regional context: <a href={rate.sourceUrl} target="_blank" rel="noreferrer">EIA {rate.state} commercial average</a> ${rate.usdMwh.toFixed(1)}/MWh ({rate.period}). This is not the facility's tariff.</p>}
    <ul className="nexsi-sources">{project.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a><small>{s.published}</small></li>)}</ul>
    <p className="nexsi-foot">Reviewed {project.reviewedAt}. Status is as reported in the cited source.</p>
  </article>;
}

export function NexSI({ snapshot, now, mode, symbol, horizon, onSymbol, onHorizon, eventDate, setEventDate }: {
  snapshot: Snapshot | null; now: number; mode: ThemeMode; symbol: string; horizon: number;
  onSymbol: (s: string) => void; onHorizon: (h: number) => void;
  eventDate: string; setEventDate: (date: string) => void;
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
    && `${c.symbol} ${c.name}`.toLowerCase().includes(search.toLowerCase())
    && (!onlyDrops || (c.observedReturns[horizon] ?? 0) <= -3)
  ).sort((a, b) => (a.observedReturns[horizon] ?? Infinity) - (b.observedReturns[horizon] ?? Infinity)), [file, scope, search, onlyDrops, horizon]);
  const choose = (s: string) => {
    onSymbol(s); setEventDate("");
    if (window.matchMedia("(max-width: 1100px)").matches) requestAnimationFrame(() => document.getElementById("nexsi-company-analysis")?.scrollIntoView({ block: "start" }));
  };
  const tokens = useChartTokens(mode);
  const contributionOption = useMemo<EChartsOption>(() => ({
    animation: false, textStyle: { color: tokens["--text-secondary"] },
    grid: { left: 122, right: 44, top: 12, bottom: 38 },
    tooltip: { trigger: "axis", confine: true, backgroundColor: tokens["--surface-1"], borderColor: tokens["--border"], textStyle: { color: tokens["--text-primary"] }, valueFormatter: v => `${Number(v).toFixed(2)} pp` },
    xAxis: { type: "value", name: "percentage points", nameLocation: "middle", nameGap: 25, axisLabel: { color: tokens["--text-muted"] }, splitLine: { lineStyle: { color: tokens["--gridline"] } } },
    yAxis: { type: "category", inverse: true, data: Object.keys(move?.components ?? {}).map(k => labels[k as keyof typeof labels]), axisLabel: { color: tokens["--text-secondary"], fontSize: 11, width: 112, overflow: "break" }, axisTick: { show: false }, axisLine: { lineStyle: { color: tokens["--gridline"] } } },
    series: [{ type: "bar", data: Object.entries(move?.components ?? {}).map(([key, value]) => ({ value, itemStyle: { color: tokens[key === "oil" || key === "gas" ? "--series-2" : key === "unexplained" ? "--text-muted" : "--series-1"] } })), barMaxWidth: 20, label: { show: true, position: "right", color: tokens["--text-secondary"], formatter: p => Number(p.value).toFixed(2), fontSize: 10 } }],
  }), [move, tokens]);
  const historyOption = useMemo<EChartsOption>(() => ({
    animation: false, textStyle: { color: tokens["--text-secondary"] }, grid: { left: 48, right: 18, top: 20, bottom: 35 },
    tooltip: { trigger: "axis", confine: true, backgroundColor: tokens["--surface-1"], borderColor: tokens["--border"], textStyle: { color: tokens["--text-primary"] }, valueFormatter: v => Number(v).toFixed(2) },
    xAxis: { type: "category", data: selected?.history.map(p => p[0]), axisLabel: { color: tokens["--text-muted"] }, axisLine: { lineStyle: { color: tokens["--gridline"] } } },
    yAxis: { type: "value", scale: true, axisLabel: { color: tokens["--text-muted"] }, splitLine: { lineStyle: { color: tokens["--gridline"] } } },
    series: [{ type: "line", showSymbol: false, data: selected?.history.map(p => p[1] / selected.history[0][1] * 100), lineStyle: { color: tokens["--series-1"], width: 2 }, itemStyle: { color: tokens["--series-1"] } }],
  }), [selected, tokens]);
  const projects = NEXSI_PROJECTS.filter(p => allProjects || p.symbols.includes(selected?.symbol ?? ""));
  if (!snapshot || !file || !selected) return <section className="card"><h2>NexSI · AI, energy & capital markets</h2><p>{!snapshot ? "Loading the validated company snapshot…" : "Company analysis is awaiting its first validated publication. No estimated values are substituted."}</p></section>;
  const currentCompanies = file.companies.filter(c => !suspended && !companyStatus(c, now) && c.moves[horizon]);
  const quote = snapshot.quotes?.quotes[selected.symbol];
  const evidence = selected.events.filter(e => !move || (e.publishedAt.slice(0, 10) >= move.start && e.publishedAt.slice(0, 10) <= new Date(Date.parse(move.end) + 2 * 86400000).toISOString().slice(0, 10)));
  const totalOther = move ? move.components.market + move.components.technology + move.components.rates + move.components.baseline : null;
  const dominant = move ? Object.entries(move.components).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0] : null;
  return <>
    <p className="data-stamp">NexSI analysis refreshed <strong>{stamp(file.generated)}</strong><span className={`qc-chip ${!suspended && file.status === "ok" ? "qc-ok" : "qc-warn"}`}>{!suspended && file.status === "ok" ? "✓ Sources current" : "⚠ Review sources"}</span></p>
    <SectionNav sections={SECTIONS} preserveView />
    <div className="nexsi">
    <section className="card anchor-target" id="nexsi-overview">
      <div className="card-head"><h2>AI stocks — energy & capital markets</h2><Freshness date={file.factors.find(f => f.symbol === "SPY")?.asOf} /></div>
      <p className="sub">Trace stock moves through the market, energy prices and company evidence. Explore the data-center projects behind the exposure.</p>
      <div className="kpi-strip nexsi-stats">
        <div className="kpi-tile"><span className="kpi-name">Nasdaq-100 coverage</span><strong className="kpi-value">{file.universe.members.length} <span className="kpi-unit">securities</span></strong><small>Published membership {file.universe.asOf}</small></div>
        <div className="kpi-tile"><span className="kpi-name">AI & technology screen</span><strong className="kpi-value">{file.companies.filter(c => c.included).length} <span className="kpi-unit">securities</span></strong><small>Technology and curated AI businesses</small></div>
        <div className="kpi-tile"><span className="kpi-name">Eligible attributions</span><strong className="kpi-value">{currentCompanies.length} <span className="kpi-unit">of {file.companies.length}</span></strong><small>{horizon}-session window · full universe</small></div>
      </div>
      <p className="nexsi-foot">Membership published {file.universe.asOf} · analysis refreshed {stamp(file.generated)} · <a href={file.universe.sources[0]} target="_blank" rel="noreferrer">Nasdaq membership ↗</a></p>
      <HowToRead>The energy component is a statistical estimate after market, technology and rate controls. It is not proof of what caused the move. The unexplained portion stays visible. Choose a company and a completed-session window to compare these components.</HowToRead>
      {suspended && <p role="status" className="nexsi-alert">⚠ {suspended}</p>}
      {!suspended && file.status === "degraded" && <p role="status" className="nexsi-alert">⚠ Some source updates are incomplete. Available company models remain visible; inspect coverage and source health for the gaps.</p>}
      <HowToRead title="Coverage and source health"><p>The default screen includes official Nasdaq technology members plus a broad, curated set of cloud, chip, hardware, software and AI application businesses. Inclusion does not establish material AI revenue. All published constituents remain available, including non-technology companies and power suppliers. Separate share classes count as separate securities.</p><p>Current-membership selection and revised price histories limit historical inference. This is not a historical index backtest.</p><p>{file.status === "ok" ? "All requested source updates completed." : "Some sources or evidence links could not be refreshed; details below."} {file.universe.retained && "Membership uses the last validated publication."}</p><ul>{file.failures.map((f, i) => <li key={i}>{f}</li>)}</ul><p>{file.companies.filter(c => c.eventIssues.length).length} companies have evidence-source gaps. Company-specific gaps appear below.</p><p><a href={`${import.meta.env.BASE_URL}data/nexsi.json`}>Download analysis JSON</a> · <a href={`${import.meta.env.BASE_URL}data/nexsi-prices.json`}>Download model inputs</a></p></HowToRead>
    </section>

    <section className="nexsi-workspace">
      <aside className="card nexsi-board anchor-target" id="nexsi-screen" aria-label="Company screen">
        <h2>Company screen</h2><p className="sub">Sorted by the largest loss. Select a company to investigate.</p>
        <label className="nexsi-label control-group">Find a company<input type="search" value={search} placeholder="Name or ticker" onChange={e => setSearch(e.target.value)} /></label>
        <label className="nexsi-label control-group">Universe<select aria-label="Universe" value={scope} onChange={e => setScope(e.target.value)}>{["AI & technology", "All Nasdaq-100", ...new Set(file.companies.map(c => c.group))].map(s => <option key={s}>{s}</option>)}</select></label>
        <div className="seg" aria-label="Return window">{[1, 5, 20].map(h => <button key={h} className={horizon === h ? "active" : ""} aria-pressed={horizon === h} onClick={() => { onHorizon(h); setEventDate(""); }}>{h} session{h > 1 ? "s" : ""}</button>)}</div>
        <label className="nexsi-checkbox"><input type="checkbox" checked={onlyDrops} onChange={e => setOnlyDrops(e.target.checked)} />Losses of 3% or more</label>
        <p className="nexsi-foot">{companies.length} results · adjusted-close returns</p>
        <div className="nexsi-company-list">{companies.map(c => {
          const blocked = suspended ?? companyStatus(c, now), a = !blocked ? c.moves[horizon] : null;
          return <button key={c.symbol} className={`nexsi-company${c.symbol === selected.symbol ? " selected" : ""}`} onClick={() => choose(c.symbol)} aria-pressed={c.symbol === selected.symbol}>
            <span><strong>{c.symbol}</strong><small>{c.name}</small></span><span className={(c.observedReturns[horizon] ?? 0) < 0 ? "nexsi-negative" : "nexsi-positive"}>{fmt(c.observedReturns[horizon])}</span>
            <small className="nexsi-company-energy">Energy estimate {a ? fmt(a.energy, " pp") : "withheld"}{a && a.energyCI[0] <= 0 && a.energyCI[1] >= 0 ? " · inconclusive" : ""}</small><small className="nexsi-company-date">{c.asOf ?? "No close"}{blocked ? " · review data" : ""}</small>
          </button>;
        })}{!companies.length && <p>No companies match these filters.</p>}</div>
      </aside>

      <section className="card nexsi-detail anchor-target" id="nexsi-company-analysis" aria-label="Selected company analysis">
        <div className="nexsi-company-heading"><div><span className="control-label">{selected.group}</span><h2>{selected.symbol} · {selected.name}</h2></div><div><strong>{selected.price == null ? "No close" : `$${selected.price.toFixed(2)}`}</strong><small>Latest completed close · {selected.asOf}</small></div></div>
        {quote && <p className="nexsi-foot">Latest reported quote: ${quote.price.toFixed(2)} · {stamp(quote.observedAt)} · {quoteStatus(quote, now).label}{quote.delayMinutes != null && ` · provider delay ${quote.delayMinutes} min`}. Quotes are separate from completed-session attribution.</p>}
        {quote && selected.price && selected.asOf && quote.observedAt.slice(0, 10) > selected.asOf && <p className="nexsi-callout">Reported price change since the last completed close: {fmt((quote.price / selected.price - 1) * 100)} (unadjusted; splits or distributions may affect this comparison). Attribution for that newer move awaits complete daily observations.</p>}
        <p className="sub">{energyPathway(selected.group)}</p>
        {selected.provenance && <p className="nexsi-foot">Price history: <a href={selected.provenance.url} target="_blank" rel="noreferrer">{selected.provenance.provider} ↗</a> · {selected.provenance.returnBasis}. Retrieved {stamp(selected.retrievedAt)}.</p>}
        {symbol !== selected.symbol && <p className="nexsi-alert">⚠ The requested ticker {symbol} is absent from this membership publication. Showing {selected.symbol} instead.</p>}
        {eventDate && !selected.largestDrops.some(d => d.end === eventDate) && <p className="nexsi-alert">⚠ The requested historical move is outside the available major-drop set. Select the latest window or another available date.</p>}
        <div className="nexsi-event-picker"><label>Investigate a move<select aria-label="Investigate a move" value={eventDate} onChange={e => setEventDate(e.target.value)}><option value="">Latest {horizon}-session move</option>{selected.largestDrops.map(a => <option key={a.end} value={a.end}>{a.end}: {fmt(a.actual)} in 1 session</option>)}</select></label><small>Up to five largest daily losses ≥3% over the latest 60 sessions with sufficient model coverage.</small></div>
        {issue && <p className="nexsi-alert">⚠ {issue}</p>}
        {move ? <>
          <p className="nexsi-period control-label">Completed closes: {move.start} → {move.end} · {move.sessions} trading session{move.sessions > 1 ? "s" : ""}</p>
          <div className="kpi-strip nexsi-metrics">
            <div className="kpi-tile"><span className="kpi-name">Observed stock return</span><strong className={move.actual < 0 ? "nexsi-negative" : "nexsi-positive"}>{fmt(move.actual)}</strong><small>{selected.provenance?.returnBasis ?? "Adjusted for splits and distributions"}</small></div>
            <div className="kpi-tile"><span className="kpi-name">Energy-associated estimate</span><strong>{fmt(move.energy, " pp")}</strong><small>95% parameter interval: {interval(move)}</small></div>
            <div className="kpi-tile"><span className="kpi-name">Other modeled components</span><strong>{fmt(totalOther, " pp")}</strong><small>Market + relative tech + rates + baseline</small></div>
            <div className="kpi-tile"><span className="kpi-name">Unexplained remainder</span><strong>{fmt(move.components.unexplained, " pp")}</strong><small>Company events, omitted factors and model error</small></div>
          </div>
          <div className="nexsi-reading"><h3>Reading this move</h3><p>{selected.symbol} {move.actual < 0 ? "fell" : "rose"} {Math.abs(move.actual).toFixed(2)}%. {dominant && <>The largest component by magnitude is <strong>{labels[dominant[0] as keyof typeof labels].toLowerCase()}</strong> ({fmt(dominant[1], " pp")}). </>}{move.energyCI[0] <= 0 && move.energyCI[1] >= 0 ? "The data do not distinguish the energy estimate from zero at the reported confidence level." : <>The fitted energy component is {fmt(move.energy, " pp")}; this conditional association does not establish a causal energy-price effect.</>}</p>
            {move.energyShareOfDrop != null && <p>Model-implied energy share of this loss: <strong>{move.energyShareOfDrop.toFixed(1)}%</strong>. Components can offset one another, so a contribution can exceed 100% of the net move. This is not a verified causal share.</p>}
            <p>The {fmt(move.components.unexplained, " pp")} remainder is not automatically attributable to earnings or news. Review the dated evidence below before forming a causal explanation.</p>
          </div>
          {move.warning && <p className="nexsi-alert">⚠ {move.warning}</p>}
          <div aria-label="Return component chart, percentage points"><EChart height={300} option={contributionOption} /></div>
          <HowToRead title="Exact contributions and model checks"><dl className="nexsi-contributions">{Object.entries(move.components).map(([k, v]) => <div key={k}><dt>{labels[k as keyof typeof labels]}</dt><dd>{fmt(v, " pp", 4)}</dd></div>)}<div><dt>Reconciled total</dt><dd>{fmt(move.actual, "%", 4)}</dd></div></dl>
            <p>Fit: {move.fit.n} matched observations from {move.fit.from} through {move.fit.through}, ending before this move. In-sample R² {(move.fit.r2 * 100).toFixed(1)}%; maximum variance inflation {move.fit.maxVif.toFixed(2)}.</p>
            {selected.validation ? <p>Latest rolling held-out check ({selected.validation.n} sessions, ending {selected.asOf}): R² {(selected.validation.r2 * 100).toFixed(1)}%; log-return RMSE {selected.validation.rmseLogPct.toFixed(2)}% with energy versus {selected.validation.withoutEnergyRmseLogPct.toFixed(2)}% without energy. {selected.validation.energyImprovesFit ? "Energy improved the recent explanatory fit." : "Energy did not improve the recent explanatory fit; treat its attribution with added caution."} This uses realized factor moves and is not a forecasting record. For historical events this check includes later data; it never enters that event's fit.</p> : <p>Insufficient held-out observations for a validation comparison.</p>}
          </HowToRead>
        </> : <p className="nexsi-callout">Attribution withheld for this window. At least 126 prior matched observations, complete event coverage and stable factor estimates are required. Observed returns remain available in the company screen.</p>}
        <HowToRead title="Price history and existing NexusQ signals"><p>Adjusted performance over up to 252 sessions; first observation = 100. Drawdown from the highest adjusted close in this window: {fmt(selected.drawdown)}.</p>
          <EChart height={220} option={historyOption} />
          {!issue && selected.signals.length ? <ul>{selected.signals.map((s, i) => <li key={i}><strong>{s.severity} · {s.label}</strong>: {s.detail}</li>)}</ul> : <p>{issue ? "Current signals suspended." : "No existing NexusQ threshold signal is active."}</p>}
        </HowToRead>
        <div className="nexsi-evidence"><h3>Company evidence to investigate</h3><p className="sub">SEC filings and linked headlines are context, not proven causes. {move ? `Showing available items dated ${move.start} through two calendar days after ${move.end}.` : "Showing recent available items."} Free feeds are incomplete, particularly for older moves. Dates are not exchange-aligned event timestamps; even a same-day report may follow the close.</p>
          {selected.eventIssues.length > 0 && <p className="nexsi-alert">⚠ {selected.eventIssues.join(" · ")}</p>}
          {evidence.length ? <ul className="nexsi-sources">{evidence.map((e, i) => <li key={`${e.url}-${i}`}><span className="control-label">{e.kind === "filing" ? "Primary disclosure" : "Linked reporting"}{move && e.publishedAt.slice(0, 10) > move.end ? " · after the move" : ""}</span><a href={e.url} target="_blank" rel="noreferrer">{e.title} ↗</a><small>{e.source} · {stamp(e.publishedAt)}</small></li>)}</ul> : <p>No retrieved evidence falls in this window. That does not mean no company event occurred.</p>}
          <p className="nexsi-foot">Evidence last checked {stamp(selected.eventCheckedAt)}. Filings can include routine disclosures; a headline may discuss several companies.</p>
        </div>
      </section>
    </section>

    <section className="card anchor-target" id="nexsi-projects"><div className="nexsi-section-heading card-head"><div><h2>Data-center projects & power commitments</h2><p className="sub">Primary-source case studies. Coverage is curated, not an exhaustive project inventory. Capacity and status retain the source's meaning.</p></div><label className="nexsi-checkbox"><input type="checkbox" checked={allProjects} onChange={e => setAllProjects(e.target.checked)} />Show all case studies</label></div>
      {projects.length ? <div className="nexsi-project-grid">{projects.map(p => <Project key={p.id} project={p} snapshot={snapshot} now={now} />)}</div> : <p>No independently curated facility or power commitment for {selected.symbol} in this release. This does not establish that the company has no data-center exposure. Use its filings above, or show all case studies to explore the operator side of the supply chain.</p>}
      {file.electricity.issue && <p className="nexsi-foot">Regional electricity benchmark: {file.electricity.issue}. Retained observations, where within 150 days of period end, keep their original dates.</p>}
    </section>
    <CostScenario />
    <section className="card anchor-target" id="nexsi-inputs"><h2>Energy and market inputs</h2><div className="nexsi-factor-grid">{file.factors.map(f => <div key={f.symbol}><strong>{f.label}</strong><p>{f.basis}</p><a href={f.sourceUrl} target="_blank" rel="noreferrer">{f.symbol} · {f.asOf || "Unavailable"} ↗</a></div>)}</div><p className="sub">Oil and gas futures are energy-market proxies, not data-center electricity costs. Settlement times, contract rolls and exchange holidays differ. The existing official spot-price, inventory, inflation and macro series remain available in Nexus Signal.</p></section>
    <NexsiMethodology />
  </div></>;
}

export function NexsiMethodology() {
  return <section className="card anchor-target" id="nexsi-methodology"><h2>NexSI methodology · 2026-11-21.1</h2><HowToRead title="How the attribution and uncertainty work">
    <p>Price-source basis is shown for each company. SanDisk uses Nasdaq split-adjusted price history (cash dividends excluded), with Yahoo split-adjusted prices as a validated fallback; other equities and ETF controls use Yahoo closes adjusted for splits and distributions. SanDisk’s entire series is replaced together; overlapping returns, dates and coverage must pass validation, and new price discontinuities above a 1.5× ratio require review. A stock split is never applied twice. These are conditional stock-return estimates, not uniform total-shareholder-return comparisons across companies.</p>
    <p>Adjusted stock log return = intercept + β₁ SPY + β₂ (QQQ − SPY) + β₃ IEF + β₄ WTI futures + β₅ Henry Hub gas futures + residual. Fit uses the latest 252 complete matched return intervals before the event, with at least 126, a maximum 520-day span and maximum variance inflation factor of 20. Both endpoints must match across every instrument; intervals longer than seven calendar days are excluded. No missing returns are filled. Singular models are withheld.</p>
    <p>Each contribution sums coefficient × factor log returns over the selected window. All components use the same observed-log-to-simple-return scale, so the displayed percentage-point components reconcile exactly to the adjusted stock return. The remainder is actual minus fitted contributions; it includes omitted drivers and model error. The energy estimate adds the oil and gas components.</p>
    <p>The approximate 95% parameter interval uses Newey–West covariance with Bartlett weights, floor(4 × (n/100)^(2/9)) lags, finite-sample correction and multiplier 1.98. It includes covariance between oil and gas coefficients. This is not a prediction interval, a causal confidence interval or simultaneous protection across 101 securities. Factor measurement error, changing exposures and model selection remain outside the interval. A factor move beyond five training standard deviations is flagged; a share-of-loss estimate is shown only for losses of at least 3% when the interval is entirely negative and no such extrapolation is present.</p>
    <p>Market and technology controls can absorb energy's indirect macroeconomic effects; the energy component is conditional, not the total economic effect. SPY and QQQ contain some screened stocks, causing mechanical overlap. IEF is a Treasury ETF return proxy, not a pure interest-rate shock. Futures are continuous vendor series with contract rolls and differing close times. This model cannot determine precisely why a stock moved.</p>
    <p>Held-out checks refit before each of the latest 60 available sessions and compare squared errors with and without energy using realized factors. At least 20 checks are required. R² can be negative. This tests explanatory stability, not tradable forecasts. Existing dislocation and moving-average signals are reused without threshold changes. Historical data may be revised; these are not archived point-in-time input vintages.</p>
    <p>Analytical snapshots expire after 72 hours; daily stock/factor observations after seven days; membership publications after 45 days. Quotes target 15-minute checks on the existing free schedule, with visible provider timestamps and delay status. Daily attribution is updated on full refreshes and never applies a daily fit to an incomplete intraday move. Project disclosures are manually curated and dated; EIA commercial electricity averages expire 150 days after the reported month end and are regional context, not industrial contracts or site tariffs.</p>
    <p><a href="https://www.nasdaq.com/docs/global-indexes/NDX" target="_blank" rel="noreferrer">Nasdaq membership</a> · <a href="https://www.nasdaq.com/docs/global-indexes/NDXT" target="_blank" rel="noreferrer">Nasdaq technology subset</a> · <a href="https://www.sec.gov/search-filings/edgar-application-programming-interfaces" target="_blank" rel="noreferrer">SEC disclosure API</a> · <a href="https://www.eia.gov/opendata/documentation.php" target="_blank" rel="noreferrer">EIA electricity metadata</a></p>
  </HowToRead></section>;
}
