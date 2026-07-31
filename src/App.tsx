import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogEntry, ForecastFile, ImpactFile, Series } from "./lib/data";
import { loadCatalog, loadForecasts, loadImpact, loadSeries } from "./lib/data";
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
import { OverlayChart, type OverlaySeries, type Projection } from "./components/OverlayChart";
import { CorrelationMatrix } from "./components/CorrelationMatrix";
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
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTION);
  const [transform, setTransform] = useState<Transform>("index");
  const [rangeYears, setRangeYears] = useState<number | null>(3);
  const [seriesMap, setSeriesMap] = useState<Map<string, Series>>(new Map());
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [forecasts, setForecasts] = useState<ForecastFile | null>(null);
  const [impact, setImpact] = useState<ImpactFile | null>(null);
  const [projectionOn, setProjectionOn] = useState(true);
  // Color follows the entity: a series keeps its slot while selected.
  const slotMap = useRef(new Map<string, string>(DEFAULT_SELECTION.map((id, i) => [id, SLOT_VARS[i]])));

  useEffect(() => {
    loadCatalog()
      .then((file) => {
        setCatalog(file.series);
        setRefreshedAt(file.generated);
      })
      .catch((e) => setLoadError(String(e)));
    loadForecasts().then(setForecasts);
    loadImpact().then(setImpact);
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
          <button key={p.key} className={p.live ? "active" : ""} disabled={!p.live}>
            Nexus {p.label}
            {!p.live && <span className="soon">roadmap</span>}
          </button>
        ))}
      </nav>

      {refreshedAt && catalog.length > 0 && (
        <p className="data-stamp">
          Data through <strong>{fmtDate(catalog.reduce((m, c) => (c.lastUpdated > m ? c.lastUpdated : m), ""))}</strong>
          {" "}· snapshots refreshed {fmtDateTime(refreshedAt)} · auto-updates every weekday
        </p>
      )}

      <SectionNav />

      {loadError && <div className="card"><p className="sub">Failed to load data catalog: {loadError}</p></div>}

      <div id="kpis" className="anchor-target">
        <div className="strip-head">
          <span className="control-label">Market pulse — click a tile to overlay it</span>
          <Freshness
            date={[...seriesMap.values()].reduce((m, s) => (s.lastUpdated > m ? s.lastUpdated : m), "") || null}
          />
        </div>
        <KpiStrip seriesMap={seriesMap} selected={selected} onToggle={toggleSeries} />
      </div>

      <section id="overlay" className="card anchor-target">
        <div className="card-head">
          <h2>Cross-asset overlay</h2>
          <Freshness
            date={selectedSeries.length ? selectedSeries.reduce((m, s) => (s.lastUpdated < m ? s.lastUpdated : m), "9999") : null}
            prefix="selection through"
            title={selectedSeries.map((s) => `${s.name}: ${s.lastUpdated}`).join("\n")}
          />
        </div>
        <p className="sub">Compare energy fundamentals, commodities, equities and macro on one comparable axis.</p>
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
          onToggle={toggleSeries}
        />
        <OverlayChart items={overlayItems} projections={projections} transform={effectiveTransform} themeMode={mode} />
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
          <CorrelationMatrix list={selectedSeries} from={from} themeMode={mode} />
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
          <p className="sub">Dislocations, momentum regimes and correlation-regime shifts across the full catalog.</p>
          {signals === null ? <p className="sub">Computing…</p> : <SignalPanel signals={signals} onView={viewInOverlay} />}
        </section>
      </div>

      <section id="equity-impact" className="card anchor-target">
        <div className="card-head">
          <h2>Equity impact — Energy Beta board</h2>
          <Freshness
            date={impact?.companies.length ? impact.companies.reduce((m, c) => (c.lastUpdated > m ? c.lastUpdated : m), "") : null}
          />
        </div>
        <p className="sub">
          How sensitive each energy-exposed stock is to the selected driver, and what a hypothetical
          shock implies. β = Cov/Var on daily log-returns (rolling 90 days).{" "}
          <a className="cta-link" href="#sovereign-impact">Country-level view ↗</a>
        </p>
        {impact ? (
          <EquityImpact companies={impact.companies} seriesMap={seriesMap} />
        ) : (
          <p className="sub">Loading impact universe…</p>
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
        {impact ? (
          <GdpImpact impact={impact} />
        ) : (
          <p className="sub">Loading impact universe…</p>
        )}
      </section>

      <footer className="footer">
        NexusQ MVP (Nexus Signal preview) · data: FRED, Yahoo Finance, World Bank — snapshot refreshed by
        pipeline · not investment advice. © 2026 Gygante Quantitative Systems.
      </footer>
    </div>
  );
}
