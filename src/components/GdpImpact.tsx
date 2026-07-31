import { useMemo, useState } from "react";
import type { ImpactCountry, ImpactFile } from "../lib/data";
import type { GdpBeta } from "../lib/beta";
import { gdpBeta } from "../lib/beta";

const ROLE_LABEL: Record<ImpactCountry["role"], string> = {
  exporter: "Net energy exporter",
  importer: "Net energy importer",
  balanced: "Balanced / diversified",
};

export function GdpImpact({ impact }: { impact: ImpactFile }) {
  const [shockPct, setShockPct] = useState(20);

  const rows = useMemo(() => {
    if (!impact.oilAnnual?.length || !impact.worldGdp?.length) return [];
    return impact.countries
      .map((c) => ({ country: c, gb: gdpBeta(c.gdp, impact.oilAnnual, impact.worldGdp) }))
      .filter((r): r is { country: ImpactCountry; gb: GdpBeta } => r.gb != null)
      .sort((a, b) => b.gb.betaPer10Pct - a.gb.betaPer10Pct);
  }, [impact]);

  if (!impact.countries.length || !rows.length) return <p className="sub">Impact universe not loaded.</p>;

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.gb.betaPer10Pct)), 0.1);

  return (
    <div>
      <div className="controls">
        <div className="control-group shock-group">
          <span className="control-label">Sustained Brent shock: {shockPct >= 0 ? "+" : ""}{shockPct}%</span>
          <input
            type="range" min={-40} max={40} step={5} value={shockPct}
            onChange={(e) => setShockPct(Number(e.target.value))}
            aria-label="Brent shock percent for GDP impact"
          />
        </div>
      </div>

      <div className="table-wrap">
        <table className="beta-table">
          <thead>
            <tr>
              <th>Economy</th>
              <th title="World Bank: fuel exports as % of merchandise exports / net energy imports as % of energy use">Energy trade profile</th>
              <th className="num" title="Annual GDP growth on same-year oil % change, controlling for world GDP growth (Frisch–Waugh)">β GDP</th>
              <th title="Cycle-adjusted GDP sensitivity, percentage points per +10% oil">Sensitivity</th>
              <th className="num" title="Partial correlation after removing the global cycle (n = years)">r (n)</th>
              <th className="num" title="First-order: β × shock — direction and order of magnitude only">
                ΔGDP @ {shockPct >= 0 ? "+" : ""}{shockPct}%
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ country, gb }) => {
              const implied = (gb.betaPer10Pct * shockPct) / 10;
              const barPct = (Math.abs(gb.betaPer10Pct) / maxAbs) * 100;
              const profile = country.role === "exporter"
                ? `${ROLE_LABEL.exporter}${country.fuelExports ? ` · fuel = ${country.fuelExports.value}% of exports (${country.fuelExports.year})` : ""}`
                : country.role === "importer"
                  ? `${ROLE_LABEL.importer}${country.energyImports ? ` · imports ${country.energyImports.value}% of energy use (${country.energyImports.year})` : ""}`
                  : ROLE_LABEL.balanced;
              return (
                <tr key={country.iso}>
                  <td className="beta-name">{country.name}</td>
                  <td className="gdp-profile">{profile}</td>
                  <td className="num"><strong>{gb.betaPer10Pct >= 0 ? "+" : ""}{gb.betaPer10Pct.toFixed(2)}</strong><span className="gdp-unit">pp/+10%</span></td>
                  <td>
                    <div className="beta-bar-track">
                      <div
                        className={`beta-bar ${gb.betaPer10Pct >= 0 ? "pos" : "neg"}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </td>
                  <td className="num">{gb.r.toFixed(2)} ({gb.n})</td>
                  <td className={`num implied ${implied >= 0 ? "up" : "down"}`}>
                    {implied >= 0 ? "▲ +" : "▼ "}{implied.toFixed(2)} pp
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ marginTop: 8 }}>
        β GDP regresses annual real-GDP growth (World Bank) on same-year oil % change
        ({impact.oilAnnualSource}), <strong>controlling for world GDP growth</strong> — without that control,
        common shocks like 2020 make every economy look oil-exposed, since oil itself is procyclical.
        Annual data means small samples (n shown); implied ΔGDP is first-order and ignores fiscal buffers,
        subsidies and lags. Directional context, not a forecast.
      </p>
    </div>
  );
}
