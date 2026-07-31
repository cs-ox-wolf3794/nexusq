import { useMemo, useState } from "react";
import type { ImpactCompany, Series } from "../lib/data";
import type { RollingBeta } from "../lib/beta";
import { rollingBeta } from "../lib/beta";

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
      .map((c) => ({ company: c, rb: rollingBeta(c.points, driver.points, 90) }))
      .filter((r): r is { company: ImpactCompany; rb: RollingBeta } => r.rb != null)
      .sort((a, b) => b.rb.current.beta - a.rb.current.beta);
  }, [companies, seriesMap, driverId]);

  const driverLabel = DRIVERS.find((d) => d.id === driverId)?.label ?? driverId;

  if (!companies.length) return <p className="sub">Impact universe not loaded.</p>;

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

      <div className="table-wrap">
        <table className="beta-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Sector</th>
              <th className="num" title="Cov(stock, driver) / Var(driver), 90d daily log-returns">β 90d</th>
              <th title="Rolling 90d beta, weekly steps, last 12 months">β trend</th>
              <th className="num" title="Annualized return not explained by the energy driver">α ann.</th>
              <th className="num" title="Share of daily variance explained by the driver">R²</th>
              <th className="num" title="First-order: β × shock. Ignores second-order effects.">
                Implied @ {shockPct >= 0 ? "+" : ""}{shockPct}%
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ company, rb }) => {
              const implied = rb.current.beta * shockPct;
              return (
                <tr key={company.id}>
                  <td className="beta-name">{company.name}</td>
                  <td>{company.sector}</td>
                  <td className="num"><strong>{rb.current.beta.toFixed(2)}</strong></td>
                  <td><BetaSpark history={rb.history} /></td>
                  <td className="num">{rb.current.alphaAnnual >= 0 ? "+" : ""}{rb.current.alphaAnnual.toFixed(1)}%</td>
                  <td className="num">{rb.current.r2.toFixed(2)}</td>
                  <td className={`num implied ${implied >= 0 ? "up" : "down"}`}>
                    {implied >= 0 ? "▲ +" : "▼ "}{implied.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ marginTop: 8 }}>
        β = Cov(stock, {driverLabel}) / Var({driverLabel}) on 90 days of paired daily log-returns; α is the
        annualized residual drift. Implied move is first-order (β × shock) — it ignores earnings pass-through
        lags and second-order effects, and a low R² means the driver explains little of that stock. Model
        output, not investment advice.
      </p>
    </div>
  );
}
