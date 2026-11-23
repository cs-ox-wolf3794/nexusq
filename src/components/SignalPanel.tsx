import { l as localize, t as tr } from '../lib/i18n';
import type { Signal } from "../lib/signals";
import { SEVERITY_META } from "../lib/signals";
import { displayDate } from '../lib/research-ui';

export function SignalPanel({ signals, onView }: {
  signals: Signal[];
  onView: (seriesIds: string[]) => void;
}) {
  if (!signals.length) return <p className="sub">{tr("No active signals among the inputs currently eligible for analysis.")}</p>;
  return (
    <div className="sig-list">
      <p className="sub">{tr('Signal calculations and descriptions retain their original source units. Display-currency conversion does not change these inputs.')}</p>
      {localize(signals.map((s, i) => {
        const meta = SEVERITY_META[s.severity];
        return (
          <div className="sig-row" key={i}>
            <span className="sig-subject">{localize(s.subject)}</span>
            <span className="sig-type">{localize(s.kind)}</span>
            <span className="sig-detail">{localize(s.detail)}<br/><small>{tr("Inputs through ")}{localize(displayDate(s.asOf))}</small></span>
            <span className="num sig-value">{localize(s.value)}</span>
            <span className="sig-actions">
              <span
                className="sev-pill"
                style={{ background: `color-mix(in srgb, var(${meta.cssVar}) 16%, transparent)` }}
              >
                <span className="dot" style={{ background: `var(${meta.cssVar})` }} />
                <span aria-hidden="true">{localize(meta.icon)}</span> {localize(meta.label)}
              </span>
              <button
                className="cta-link"
                onClick={() => onView(s.seriesIds)}
                title={tr(`Load ${s.seriesIds.join(" + ")} in the cross-asset overlay`)}
              >{tr("View in overlay ↗")}</button>
            </span>
          </div>
        );
      }))}
    </div>
  );
}
