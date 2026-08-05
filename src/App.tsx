import { useEffect, useMemo, useRef, useState } from "react";
import type { BacktestFile, CatalogEntry, CotFile, ForecastFile, ImpactFile, QualityFile, Series } from "./lib/data";
import { loadBacktest, loadCatalog, loadCot, loadForecasts, loadImpact, loadQuality, loadSeries } from "./lib/data";
import type { Transform } from "./lib/transform";
import { TRANSFORM_LABELS, applyTransform, clampRange } from "./lib/transform";
import type { Signal } from "./lib/signals";
import { computeSignals } from "./lib/signals";
import { useTheme } from "./components/useTheme";
import { SeriesPicker } from "./components/SeriesPicker";
import { KpiStrip } from "./components/KpiStrip";
import { EquityImpact } from "./components/EquityImpact";
import { GdpImpact } from "./components/GdpImpact";
import { Freshness } from "./components/Freshness";
import { SectionNav } from "./components/SectionNav";
import { Methodology } from "./components/Methodology";
import { ValidationPanel } from "./components/ValidationPanel";
import { Skeleton, SkeletonRows, SkeletonTiles } from "./components/Skeleton";
import { MarketStatePanel } from "./components/MarketState";
import { OverlayChart, type OverlaySeries, type Projection } from "./components/OverlayChart";
import { CorrelationMatrix } from "./components/CorrelationMatrix";
import { GlossaryTip, HowToRead } from "./components/Guidance";
import { SignalPanel } from "./components/SignalPanel";

const PRODUCTS = [
  { key: "signal", label: "Signal", live: true },
  { key: "model", label: "Model", live: false },
  { key: "scenario", label: "Scenario", live: false },
  { key: "portfolio", label: "Portfolio", live: false },
  { key: "agent", label: "Agent", live: false },
];

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
  { key: "oil-fx", label: "How does oil hit FX?", ids: ["BRENT", "EURUSD", "DXY"], t: "index", w: 3, p: false },
  { key: "inflation", label: "Do commodities lead inflation?", ids: ["BRENT", "WHEAT", "CPI"], t: "yoy", w: 10, p: false },
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function fmtDateTime(iso: string): string {
  return `${new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  })} UTC`;
}

function rangeStart(years: number | null): string {
  if (years == null) return "1900-01-01";
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export default function App() {
  const { mode, toggle } = useTheme();
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(() => parseHash().ids ?? DEFAULT_SELECTION);
  const [transform, setTransform] = useState<Transform>(() => parseHash().transform ?? "index");
  const [rangeYears, setRangeYears] = useState<number | null>(() => {
    const y = parseHash().years;
    return y === undefined ? 3 : y;
  });
  const [seriesMap, setSeriesMap] = useState<Map<string, Series>>(new Map());
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [forecasts, setForecasts] = useState<ForecastFile | null>(null);
  // undefined = still loading (skeleton), null = fetch failed (honest message)
  const [impact, setImpact] = useState<ImpactFile | null | undefined>(undefined);
  const [quality, setQuality] = useState<QualityFile | null>(null);
  const [backtest, setBacktest] = useState<BacktestFile | null | undefined>(undefined);
  const [cot, setCot] = useState<CotFile | null>(null);
  const [projectionOn, setProjectionOn] = useState<boolean>(() => parseHash().projection ?? true);
  const [linkCopied, setLinkCopied] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false); // mobile-only disclosure
  const [page, setPage] = useState<"dashboard" | "methodology">(() =>
    window.location.hash.includes("page=methodology") ? "methodology" : "dashboard",
  );
  // Color follows the entity: a series keeps its slot while selected.
  const slotMap = useRef(
    new Map<string, string>((parseHash().ids ?? DEFAULT_SELECTION).map((id, i) => [id, SLOT_VARS[i]])),
  );

  // The URL hash mirrors the view state — every view is a shareable link.
  useEffect(() => {
    const h = `#s=${selected.join(",")}&t=${transform}&w=${rangeYears ?? "all"}&p=${projectionOn ? 1 : 0}${
      page === "methodology" ? "&page=methodology" : ""
    }`;
    window.history.replaceState(null, "", h);
  }, [selected, transform, rangeYears, projectionOn, page]);

  // Apply shared links opened while the app is already running (hash navigation
  // doesn't remount React). Our own replaceState writes never fire hashchange.
  useEffect(() => {
    const onHash = () => {
      const h = parseHash();
      if (h.ids) {
        slotMap.current.clear();
        h.ids.forEach((id, i) => slotMap.current.set(id, SLOT_VARS[i]));
        setSelected(h.ids);
      }
      if (h.transform) setTransform(h.transform);
      if (h.years !== undefined) setRangeYears(h.years);
      if (h.projection != null) setProjectionOn(h.projection);
      setPage(window.location.hash.includes("page=methodology") ? "methodology" : "dashboard");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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
    setTimeout(() => setLinkCopied(false), 1600);
  };

  const applyPreset = (p: Preset) => {
    slotMap.current.clear();
    p.ids.forEach((id, i) => slotMap.current.set(id, SLOT_VARS[i]));
    setSelected(p.ids);
    setTransform(p.t);
    setRangeYears(p.w);
    setProjectionOn(p.p);
    document.getElementById("overlay")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const presetActive = (p: Preset) =>
    p.ids.length === selected.length &&
    p.ids.every((id) => selected.includes(id)) &&
    transform === p.t && rangeYears === p.w && projectionOn === p.p;

  useEffect(() => {
    loadCatalog()
      .then((file) => {
        setCatalog(file.series);
        setRefreshedAt(file.generated);
      })
      .catch((e) => setLoadError(String(e)));
    loadForecasts().then(setForecasts);
    loadImpact().then(setImpact);
    loadQuality().then(setQuality);
    loadBacktest().then(setBacktest);
    loadCot().then(setCot);
  }, []);

  // Load everything once for the signal engine (payload is small snapshot JSON).
  useEffect(() => {
    if (!catalog.length) return;
    let cancelled = false;
    Promise.allSettled(catalog.map((c) => loadSeries(c.id))).then((results) => {
      if (cancelled) return;
      const map = new Map<string, Series>();
      for (const r of results) if (r.status === "fulfilled") map.set(r.value.id, r.value);
      setSeriesMap(map);
      setSignals(computeSignals(map));
      // prune ids from a shared link that don't exist (renamed series, typos)
      setSelected((prev) => {
        const valid = prev.filter((id) => map.has(id));
        if (valid.length === prev.length) return prev;
        for (const id of prev) if (!map.has(id)) slotMap.current.delete(id);
        if (!valid.length) {
          DEFAULT_SELECTION.forEach((id, i) => slotMap.current.set(id, SLOT_VARS[i]));
          return DEFAULT_SELECTION;
        }
        return valid;
      });
    });
    return () => { cancelled = true; };
  }, [catalog]);

  // CTA target: load a signal's series into the overlay and navigate there.
  const viewInOverlay = (ids: string[]) => {
    const valid = ids.filter((id) => seriesMap.has(id)).slice(0, SLOT_VARS.length);
    if (!valid.length) return;
    slotMap.current.clear();
    valid.forEach((id, i) => slotMap.current.set(id, SLOT_VARS[i]));
    setSelected(valid);
    document.getElementById("overlay")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const selectedSeries = selected.map((id) => seriesMap.get(id)).filter((s): s is Series => !!s);
  const sameUnit = new Set(selectedSeries.map((s) => s.unit)).size <= 1;
  const effectiveTransform: Transform = transform === "raw" && !sameUnit ? "index" : transform;

  const overlayItems: OverlaySeries[] = useMemo(
    () => selectedSeries.map((s) => ({
      series: s,
      points: applyTransform(clampRange(s.points, from), effectiveTransform),
      color: slotMap.current.get(s.id) ?? SLOT_VARS[0],
    })),
    [selectedSeries.map((s) => s.id).join(","), seriesMap, from, effectiveTransform],
  );

  // Projections only make sense on comparable level scales (raw / indexed).
  const projectionAllowed = effectiveTransform === "raw" || effectiveTransform === "index";
  const projections: Projection[] = useMemo(() => {
    if (!projectionOn || !projectionAllowed || !forecasts) return [];
    const out: Projection[] = [];
    for (const s of selectedSeries) {
      const fc = forecasts.series[s.id];
      if (!fc) continue;
      const base = clampRange(s.points, from)[0]?.[1];
      if (effectiveTransform === "index" && !(base > 0)) continue;
      const scale = (v: number) => (effectiveTransform === "index" ? (v / base) * 100 : v);
      const color = slotMap.current.get(s.id) ?? SLOT_VARS[0];
      if (fc.kind === "model") {
        out.push({
          name: s.name, color, sourceLabel: "model P50",
          fan: fc.points.map((p) => [p[0], scale(p[1]), scale(p[2]), scale(p[3]), scale(p[4]), scale(p[5])]),
        });
      } else {
        // anchor the dashed external line to the last actual observation
        const last = s.points[s.points.length - 1];
        out.push({
          name: s.name, color, sourceLabel: fc.source.split(" (")[0],
          external: [[last[0], scale(last[1])], ...fc.points.map((p) => [p[0], scale(p[1])] as [string, number])],
        });
      }
    }
    return out;
  }, [projectionOn, projectionAllowed, forecasts, selectedSeries.map((s) => s.id).join(","), seriesMap, from, effectiveTransform]);

  return (
    <div className="app">
      <header className="masthead">
        <img src={`${import.meta.env.BASE_URL}nexusq.svg`} alt="" />
        <div className="brand">
          <span className="name">Nexus<span>Q</span></span>
          <span className="byline">Gygante Quantitative Systems</span>
        </div>
        <div className="spacer" />
        <span className="tagline">
          Causal intelligence for capital markets: energy, commodity and macro data turned into
          signals, scenarios and decisions.
        </span>
        <button className="theme-toggle" onClick={toggle}>
          {mode === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </header>

      <nav className="product-nav">
        {PRODUCTS.map((p) => (
          <button
            key={p.key}
            className={p.live && page === "dashboard" ? "active" : ""}
            disabled={!p.live}
            onClick={() => p.live && setPage("dashboard")}
          >
            Nexus {p.label}
            {!p.live && <span className="soon">roadmap</span>}
          </button>
        ))}
        <button
          className={`nav-method${page === "methodology" ? " active" : ""}`}
          onClick={() => { setPage("methodology"); window.scrollTo({ top: 0 }); }}
        >
          Methodology
        </button>
      </nav>

      {refreshedAt && catalog.length > 0 && (
        <p className="data-stamp">
          Data through <strong>{fmtDate(catalog.reduce((m, c) => (c.lastUpdated > m ? c.lastUpdated : m), ""))}</strong>
          {" "}· snapshots refreshed {fmtDateTime(refreshedAt)} · auto-updates every weekday
          {quality && (
            <span
              className={`qc-chip ${quality.summary.flagged + quality.summary.failed.length ? "qc-warn" : "qc-ok"}`}
              title={
                quality.summary.flagged + quality.summary.failed.length
                  ? Object.entries(quality.series)
                      .filter(([, q]) => q.flags.length)
                      .map(([id, q]) => `${id}: ${q.flags.map((f) => f.detail).join("; ")}`)
                      .join("\n")
                  : "All series passed staleness, gap, spike, range and history-drift checks on the last refresh."
              }
            >
              {quality.summary.flagged + quality.summary.failed.length
                ? `⚠ QC: ${quality.summary.flagged + quality.summary.failed.length} flag${quality.summary.flagged + quality.summary.failed.length === 1 ? "" : "s"}`
                : `✓ QC: ${quality.summary.ok}/${quality.summary.ok + quality.summary.flagged} series clean`}
            </span>
          )}
        </p>
      )}

      {page === "methodology" ? (
        <Methodology />
      ) : (
        <>
      <SectionNav />

      <div className="preset-block">
        <button
          className="preset-toggle"
          onClick={() => setPresetsOpen((o) => !o)}
          aria-expanded={presetsOpen}
        >
          Start from a question {presetsOpen ? "▴" : "▾"}
        </button>
        <div className={`preset-row${presetsOpen ? " open" : ""}`}>
          <span className="control-label">Start from a question</span>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className={`chip${presetActive(p) ? " on" : ""}`}
              onClick={() => { applyPreset(p); setPresetsOpen(false); }}
              title={`Loads ${p.ids.join(" + ")} (${p.w ?? "all"}y)`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loadError && <div className="card"><p className="sub">Failed to load data catalog: {loadError}</p></div>}

      <div id="kpis" className="anchor-target">
        <div className="strip-head">
          <span className="control-label">Market pulse — click a tile to overlay it</span>
          <Freshness
            date={[...seriesMap.values()].reduce((m, s) => (s.lastUpdated > m ? s.lastUpdated : m), "") || null}
          />
        </div>
        {seriesMap.size ? (
          <KpiStrip seriesMap={seriesMap} selected={selected} onToggle={toggleSeries} />
        ) : (
          <SkeletonTiles />
        )}
      </div>

      <section id="overlay" className="card anchor-target">
        <div className="card-head">
          <h2>Cross-asset overlay</h2>
          <span className="head-actions">
            <button className="cta-link" onClick={copyViewLink} title="Copy a link that reproduces exactly this view">
              {linkCopied ? "Copied ✓" : "⧉ Copy view link"}
            </button>
            <Freshness
              date={selectedSeries.length ? selectedSeries.reduce((m, s) => (s.lastUpdated < m ? s.lastUpdated : m), "9999") : null}
              prefix="selection through"
              title={selectedSeries.map((s) => `${s.name}: ${s.lastUpdated}`).join("\n")}
            />
          </span>
        </div>
        <p className="sub">Compare energy fundamentals, commodities, equities and macro on one comparable axis.</p>
        <HowToRead>
          Projections are directional uncertainty envelopes, not point calls. A shaded <GlossaryTip term="P10-P90" definition="Expected range where the model places outcomes between the 10th and 90th percentile at each horizon." /> band means higher uncertainty; dashed lines mark the projected median or external forecast path.
        </HowToRead>
        <div className="controls">
          <div className="control-group">
            <span className="control-label">Scale</span>
            <div className="seg">
              {(Object.keys(TRANSFORM_LABELS) as Transform[]).map((t) => (
                <button
                  key={t}
                  className={effectiveTransform === t ? "active" : ""}
                  disabled={t === "raw" && !sameUnit}
                  title={t === "raw" && !sameUnit ? "Raw values need identical units across selected series" : undefined}
                  onClick={() => setTransform(t)}
                >
                  {TRANSFORM_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="control-group">
            <span className="control-label">Projection</span>
            <div className="seg">
              {[true, false].map((on) => (
                <button
                  key={String(on)}
                  className={projectionOn === on && projectionAllowed ? "active" : ""}
                  disabled={!projectionAllowed}
                  title={!projectionAllowed ? "Projections show on raw or indexed scales only" : undefined}
                  onClick={() => setProjectionOn(on)}
                >
                  {on ? "On" : "Off"}
                </button>
              ))}
            </div>
          </div>
          <div className="control-group">
            <span className="control-label">Window</span>
            <div className="seg">
              {RANGES.map((r) => (
                <button key={r.label} className={rangeYears === r.years ? "active" : ""} onClick={() => setRangeYears(r.years)}>
                  {r.label}
                </button>
              ))}
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
        {seriesMap.size ? (
          <OverlayChart items={overlayItems} projections={projections} transform={effectiveTransform} themeMode={mode} />
        ) : (
          <Skeleton height={430} />
        )}
      </section>

      <div className="grid-2">
        <section id="correlations" className="card anchor-target">
          <div className="card-head">
            <h2>Correlation structure</h2>
            <Freshness
              date={selectedSeries.length ? selectedSeries.reduce((m, s) => (s.lastUpdated < m ? s.lastUpdated : m), "9999") : null}
              prefix="selection through"
            />
          </div>
          <p className="sub">
            Pearson ρ of log-returns across the selected window, forward-filled to a common grid.{" "}
            <a className="cta-link" href="#signals">Regime shifts appear as signals ↗</a>
          </p>
          {seriesMap.size ? (
            <CorrelationMatrix list={selectedSeries} from={from} themeMode={mode} />
          ) : (
            <Skeleton height={300} />
          )}
        </section>

        <section id="signals" className="card anchor-target">
          <div className="card-head">
            <h2>Live signals</h2>
            <Freshness
              date={catalog.length ? catalog.reduce((m, c) => (c.lastUpdated > m ? c.lastUpdated : m), "") : null}
              prefix="computed through"
              title="Signals recompute from the full catalog on every load; date shown is the newest observation used."
            />
          </div>
          <p className="sub">
            Dislocations, momentum regimes and correlation-regime shifts across the full catalog.{" "}
            <a className="cta-link" href="#validation">How reliable are these? See the backtest ↗</a>
          </p>
          <HowToRead>
            Dislocation signals are standardized moves using a trailing <GlossaryTip term="z-score" definition="Distance from trailing mean measured in standard deviations; +2 means two sigmas above average." />. Bigger absolute z-score means a more unusual move relative to that series' own history.
          </HowToRead>
          {signals === null ? <SkeletonRows rows={6} /> : <SignalPanel signals={signals} onView={viewInOverlay} />}
        </section>
      </div>

      <section id="market-state" className="card anchor-target">
        <div className="card-head">
          <h2>Market state — percentile conditions</h2>
          <Freshness
            date={cot ? Object.values(cot.markets).reduce((m, c) => (c.lastUpdated > m ? c.lastUpdated : m), "") : null}
            prefix="positioning through"
            cadence="monthly"
            title="CFTC COT publishes weekly (Friday, for Tuesday positions). Price conditions use the daily snapshots."
          />
        </div>
        <p className="sub">
          Where each energy market sits inside its own history: trend, volatility, dollar backdrop and
          futures positioning, each as a percentile — the regime at a glance.
        </p>
        {seriesMap.size ? <MarketStatePanel seriesMap={seriesMap} cot={cot} /> : <SkeletonRows rows={7} />}
      </section>

      <section id="validation" className="card anchor-target">
        <div className="card-head">
          <h2>Signal validation — event-study backtest</h2>
          {backtest && <Freshness date={backtest.generated} prefix="computed" cadence="monthly" />}
        </div>
        <p className="sub">
          Did what each signal describes actually happen afterwards? The production engine replayed
          over history, with publication lag imposed and firings collapsed to episodes — nulls
          published alongside positives.
        </p>
        {backtest ? (
          <ValidationPanel bt={backtest} />
        ) : backtest === undefined ? (
          <SkeletonRows rows={7} />
        ) : (
          <p className="sub">Backtest results unavailable.</p>
        )}
      </section>

      <section id="equity-impact" className="card anchor-target">
        <div className="card-head">
          <h2>Equity impact — Energy Beta board</h2>
          <Freshness
            date={impact?.companies.length ? impact.companies.reduce((m, c) => (c.lastUpdated > m ? c.lastUpdated : m), "") : null}
          />
        </div>
        <p className="sub">
          How sensitive each energy-exposed stock is to the selected driver, and what a hypothetical
          shock implies. <GlossaryTip term="β" definition="Sensitivity of stock returns to the selected energy driver: Cov(stock, driver) / Var(driver)." /> = Cov/Var on daily log-returns (rolling 90 days).{" "}
          <a className="cta-link" href="#sovereign-impact">Country-level view ↗</a>
        </p>
        <HowToRead>
          <GlossaryTip term="β" definition="Sensitivity of stock returns to the selected energy driver: Cov(stock, driver) / Var(driver)." /> is slope sensitivity, while <GlossaryTip term="R²" definition="Share of daily return variance explained by the selected energy driver in the same regression window." /> is explanatory fit. Treat implied move as first-order context only.
        </HowToRead>
        {impact && seriesMap.size ? (
          <EquityImpact companies={impact.companies} seriesMap={seriesMap} />
        ) : impact === null ? (
          <p className="sub">Impact data unavailable.</p>
        ) : (
          <SkeletonRows rows={9} />
        )}
      </section>

      <section id="sovereign-impact" className="card anchor-target">
        <div className="card-head">
          <h2>Sovereign impact — GDP sensitivity to oil</h2>
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
        <p className="sub">
          Major energy exporters vs importers: how annual GDP growth has historically moved with Brent,
          and the first-order impact of a sustained price shock.{" "}
          <a className="cta-link" href="#overlay">GDP paths with IMF projections on the overlay ↗</a>
        </p>
        <HowToRead>
          Sovereign <GlossaryTip term="β" definition="Cycle-controlled GDP sensitivity: percentage-point change in GDP growth per +10% oil move." /> is estimated on annual data with world-cycle control; use it as regime context, not a precise near-term forecast.
        </HowToRead>
        {impact && seriesMap.size ? (
          <GdpImpact impact={impact} />
        ) : impact === null ? (
          <p className="sub">Impact data unavailable.</p>
        ) : (
          <SkeletonRows rows={9} />
        )}
      </section>
        </>
      )}

      <footer className="footer">
        <div className="footer-brand">Nexus<span>Q</span> · Gygante Quantitative Systems</div>
        <div className="footer-links">
          <button className="cta-link" onClick={() => { setPage("methodology"); window.scrollTo({ top: 0 }); }}>
            Methodology
          </button>
          <a className="cta-link" href="https://github.com/cs-ox-wolf3794/nexusq" target="_blank" rel="noreferrer">
            Source &amp; data on GitHub
          </a>
          <span>Data: FRED · Yahoo Finance · World Bank · IMF · EIA</span>
        </div>
        <div className="footer-fine">
          Nexus Signal preview · model output, not investment advice · © 2026 Gygante Quantitative Systems
        </div>
      </footer>
    </div>
  );
}
