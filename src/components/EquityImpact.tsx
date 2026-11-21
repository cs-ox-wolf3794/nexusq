import { useMemo, useState } from "react";
import type { ImpactCompany, Series } from "../lib/data";
import type { RollingBeta } from "../lib/beta";
import { rollingBeta, associatedMove } from "../lib/beta";
import { GlossaryTip, HowToRead } from "./Guidance";

const DRIVERS = [
  { id: "BRENT", label: "Brent" },
  { id: "WTI", label: "WTI" },
  { id: "HENRYHUB", label: "Henry Hub" },
];

function BetaSpark({ history }: { history: [string, number][] }) {
  const w = 72, h = 22, pad = 2;
  const vals = history.slice(-52).map((p) => p[1]);
  if (vals.length < 2) return null;
  const min = Math.min(...vals, 0), max = Math.max(...vals, 0);
  const span = max - min || 1;
  const step = (w - pad * 2) / (vals.length - 1);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="beta-spark">
      <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 3" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function EquityImpact({ companies, seriesMap }: {
  companies: ImpactCompany[];
  seriesMap: Map<string, Series>;
}) {
  const [driverId, setDriverId] = useState("BRENT");
  const [shockPct, setShockPct] = useState(20);

  const rows = useMemo(() => {
    const driver = seriesMap.get(driverId);
    if (!driver) return [];
    return companies
      .map((c) => ({ company: c, rb: rollingBeta(c.adjustedPoints ?? c.points, driver.points, 90) }))
      .filter((r): r is { company: ImpactCompany; rb: RollingBeta } => r.rb != null)
      .sort((a, b) => b.rb.current.beta - a.rb.current.beta);
  }, [companies, seriesMap, driverId]);

  const driverLabel = DRIVERS.find((d) => d.id === driverId)?.label ?? driverId;

  if (!companies.length) return <p className="sub">Equity estimates withheld: fresh, quality-checked adjusted closing prices are required.</p>;

  return (
    <div>
      <div className="controls">
        <div className="control-group">
          <span className="control-label">Energy driver</span>
          <div className="seg">
            {DRIVERS.map((d) => (
              <button key={d.id} className={driverId === d.id ? "active" : ""} onClick={() => setDriverId(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="control-group shock-group">
          <span className="control-label">Shock: {driverLabel} {shockPct >= 0 ? "+" : ""}{shockPct}%</span>
          <input
            type="range" min={-40} max={40} step={5} value={shockPct}
            onChange={(e) => setShockPct(Number(e.target.value))}
            aria-label="Energy price shock percent"
          />
        </div>
      </div>

      <HowToRead>
        Use <GlossaryTip term="β" definition="Sensitivity of stock returns to the selected energy driver." /> for directional sensitivity and <GlossaryTip term="R²" definition="Share of return variance explained by the selected driver in this rolling window." /> for fit quality. A high beta with low R² is weak explanatory evidence.
      </HowToRead>

      <div className="table-wrap stack-wrap">
        <table className="beta-table stack-sm">
          <thead>
            <tr>
              <th>Company</th>
              <th>Sector</th>
              <th className="num" title="Cov(stock, driver) / Var(driver), 90 obs daily log-returns"><GlossaryTip term="β" definition="Cov(stock, driver) / Var(driver), estimated on rolling 90-observation paired log-returns." /> 90 obs</th>
              <th title="Rolling 90 obs beta, five-observation steps, last 52 estimates"><GlossaryTip term="β" definition="Last 52 rolling beta estimates, stepped every five paired observations." /> trend</th>
              <th className="num" title="Annualized log-return intercept, in log-percentage units; not a simple return or investment alpha">Intercept (log %/yr)</th>
              <th className="num" title="Share of daily variance explained by the driver"><GlossaryTip term="R²" definition="Share of daily return variance explained by the selected energy driver." /></th>
              <th className="num" title="100 × ((1 + driver move/100)^β − 1); fitted association, not a causal forecast.">
                Associated @ {shockPct >= 0 ? "+" : ""}{shockPct}%
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ company, rb }) => {
              const implied = associatedMove(rb.current.beta, shockPct)!;
              return (
                <tr key={company.id}>
                  <td className="beta-name">{company.name}</td>
                  <td data-label="Sector"><span className="cell-value">{company.sector}</span></td>
                  <td className="num" data-label="β 90 obs" title="Approximate 95% Newey–West HAC interval; parameter uncertainty, not a forecast range"><span className="cell-value"><strong>{rb.current.beta.toFixed(2)}</strong><small>[{rb.current.betaCI[0].toFixed(2)}, {rb.current.betaCI[1].toFixed(2)}]</small></span></td>
                  <td data-label="β trend"><BetaSpark history={rb.history} /></td>
                  <td className="num" data-label="Intercept (log %/yr)"><span className="cell-value">{rb.current.alphaAnnual >= 0 ? "+" : ""}{rb.current.alphaAnnual.toFixed(1)}</span></td>
                  <td className="num" data-label="R²"><span className="cell-value">{rb.current.r2.toFixed(2)}<small>n={rb.current.n} · {rb.current.asOf}</small></span></td>
                  <td className={`num implied ${implied >= 0 ? "up" : "down"}`} data-label={`Associated @ ${shockPct >= 0 ? "+" : ""}${shockPct}%`}>
                    <span className="cell-value">{implied >= 0 ? "▲ +" : "▼ "}{implied.toFixed(1)}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="sub">Estimates withheld: the selected driver needs 90 recent, compatible paired observations.</p>}
      <p className="sub" style={{ marginTop: 8 }}>
        β = Cov(stock, {driverLabel}) / Var({driverLabel}) on 90 matched daily intervals using adjusted stock closes.
        Brackets show approximate 95% HAC parameter intervals; α is the annualized log-return intercept, not risk-adjusted performance.
        Associated move = 100 × ((1 + driver move/100)^β − 1), consistent with the log-return model and excluding the intercept.
        This is an association scenario, not an identified causal shock; a low R² means the driver explains little of that stock. Model
        output, not investment advice.
      </p>
    </div>
  );
}
