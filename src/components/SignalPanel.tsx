import type { Signal } from "../lib/signals";
import { SEVERITY_META } from "../lib/signals";

export function SignalPanel({ signals }: { signals: Signal[] }) {
  if (!signals.length) return <p className="sub">No active signals at current thresholds.</p>;
  return (
    <div className="sig-list">
      {signals.map((s, i) => {
        const meta = SEVERITY_META[s.severity];
        return (
          <div className="sig-row" key={i}>
            <span className="sig-subject">{s.subject}</span>
            <span className="sig-type">{s.kind}</span>
            <span className="sig-detail">{s.detail}</span>
            <span className="num sig-value">{s.value}</span>
            <span
              className="sev-pill"
              style={{ background: `color-mix(in srgb, var(${meta.cssVar}) 16%, transparent)` }}
            >
              <span className="dot" style={{ background: `var(${meta.cssVar})` }} />
              <span aria-hidden="true">{meta.icon}</span> {meta.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
