import { l as localize, t as tr } from '../lib/i18n';
import { useMemo, useState } from "react";
import type { ImpactCountry, ImpactFile } from "../lib/data";
import type { GdpBeta } from "../lib/beta";
import { gdpBeta } from "../lib/beta";
import { sovereignExclusion, energyTradeProfile } from "../lib/quality";
import { GlossaryTip, HowToRead } from "./Guidance";

export function GdpImpact({ impact, now }: { impact: ImpactFile; now: number }) {
  const [shockPct, setShockPct] = useState(20);

  const rows = useMemo(() => {
    if (!impact.oilAnnual?.length || !impact.worldGdp?.length) return [];
    return impact.countries
      .filter((country) => !sovereignExclusion(country, impact, now))
      .map((c) => ({ country: c, gb: gdpBeta(c.gdp, impact.oilAnnual, impact.worldGdp) }))
      .filter((r): r is { country: ImpactCountry; gb: GdpBeta } => r.gb != null)
      .sort((a, b) => b.gb.betaPer10Pct - a.gb.betaPer10Pct);
  }, [impact, now]);

  if (!impact.countries.length || !rows.length) return <p className="sub">{tr("GDP association estimates withheld: fresh, compatible annual inputs and an identifiable oil coefficient are required.")}</p>;

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.gb.betaPer10Pct)), 0.1);

  return (
    <div>
      <div className="controls">
        <div className="control-group shock-group">
          <span className="control-label">{tr("Annual Brent change scenario: ")}{localize(shockPct >= 0 ? "+" : "")}{localize(shockPct)}{tr("%")}</span>
          <input
            type="range" min={-40} max={40} step={5} value={shockPct}
            onChange={(e) => setShockPct(Number(e.target.value))}
            aria-label={tr("Brent shock percent for GDP impact")}
          />
        </div>
      </div>

      <HowToRead>
        <GlossaryTip term="β" definition="Cycle-controlled GDP sensitivity, in percentage points of GDP growth per +10% oil move." />{tr(" captures historical association after controlling statistically for world GDP growth. Use sign and relative magnitude as context, not exact point predictions.")}</HowToRead>

      <div className="table-wrap stack-wrap">
        <table className="beta-table stack-sm">
          <thead>
            <tr>
              <th>{tr("Economy")}</th>
              <th title={tr("World Bank: fuel exports as % of merchandise exports / net energy imports as % of energy use")}>{tr("Energy trade profile")}</th>
              <th className="num" title={tr("Annual GDP growth on same-year oil % change, controlling for world GDP growth (Frisch–Waugh)")}><GlossaryTip term="β" definition="Frisch-Waugh slope: GDP-growth sensitivity per +10% oil move after world-cycle control." />{tr(" GDP")}</th>
              <th title={tr("Cycle-adjusted GDP sensitivity, percentage points per +10% oil")}>{tr("Sensitivity")}</th>
              <th className="num" title={tr("Partial correlation after removing the global cycle (n = years)")}>{tr("r (n)")}</th>
              <th className="num" title={tr("First-order: β × shock — direction and order of magnitude only")}>{tr("Associated ΔGDP @ ")}{localize(shockPct >= 0 ? "+" : "")}{localize(shockPct)}{tr("%")}</th>
            </tr>
          </thead>
          <tbody>
            {localize(rows.map(({ country, gb }) => {
              const implied = (gb.betaPer10Pct * shockPct) / 10;
              const barPct = (Math.abs(gb.betaPer10Pct) / maxAbs) * 100;
              const profile = energyTradeProfile(country);
              const uncertain = gb.betaCI[0] <= 0 && gb.betaCI[1] >= 0;
              return (
                <tr key={country.iso}>
                  <td className="beta-name">{localize(country.name)}{localize(country.retained && <><br/><small>{tr("◔ Prior annual data retained")}</small></>)}</td>
                  <td className="gdp-profile">{localize(profile)}</td>
                  <td className="num" data-label={tr("β GDP")} title={tr("Approximate 95% HC3/t interval for the coefficient, not a forecast range")}><span className="cell-value"><strong>{localize(gb.betaPer10Pct >= 0 ? "+" : "")}{localize(gb.betaPer10Pct.toFixed(2))}</strong><span className="gdp-unit">{tr("pp/+10%")}</span><small>{tr("[")}{localize(gb.betaCI[0].toFixed(2))}{tr(", ")}{localize(gb.betaCI[1].toFixed(2))}{tr("]")}{localize(uncertain && " · sign uncertain")}</small></span></td>
                  <td data-label={tr("Sensitivity")}>
                    <div className="beta-bar-track">
                      <div
                        className={`beta-bar ${gb.betaPer10Pct >= 0 ? "pos" : "neg"}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </td>
                  <td className="num" data-label={tr("r (n)")}><span className="cell-value">{localize(gb.r.toFixed(2))}{tr(" (")}{localize(gb.n)}{tr(")")}<small>{tr("through ")}{localize(gb.asOf)}</small></span></td>
                  <td className={`num implied ${implied >= 0 ? "up" : "down"}`} data-label={tr(`ΔGDP @ ${shockPct >= 0 ? "+" : ""}${shockPct}%`)}>
                    <span className="cell-value">{localize(implied >= 0 ? "▲ +" : "▼ ")}{localize(implied.toFixed(2))}{tr(" pp")}</span>
                  </td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ marginTop: 8 }}>{tr("β GDP regresses annual real-GDP growth (World Bank) on same-year oil % change (")}{localize(impact.oilAnnualSource)}{tr("), ")}<strong>{tr("controlling for world GDP growth")}</strong>{tr(" — without that control, common shocks like 2020 make every economy look oil-exposed, since oil itself is procyclical. Brackets are approximate 95% HC3/t coefficient intervals; they do not account fully for serial dependence or model selection. Annual data means small samples (n shown). Scenario values describe the fitted association with the world cycle held fixed, not a causal oil shock or a GDP forecast.")}</p>
      {localize(!!impact.oilAnnualExcludedYears?.length && <p className="sub">{tr("Brent years excluded for incomplete coverage: ")}{localize(impact.oilAnnualExcludedYears.join(", "))}{tr(". A year needs all 12 months and at least 200 daily observations; oil changes require two consecutive eligible years.")}</p>)}
      {localize(impact.countries.filter((c) => !rows.some((r) => r.country.iso === c.iso)).map((c) => <p className="sub" key={c.iso}>{tr("◔ ")}{localize(c.name)}{tr(" estimate withheld: ")}{localize(sovereignExclusion(c, impact, now) ?? "Insufficient compatible history or no independently identifiable oil coefficient.")}</p>))}
    </div>
  );
}
