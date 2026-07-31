import type { Signal } from "../lib/signals";
import { SEVERITY_META } from "../lib/signals";

export function SignalPanel({ signals }: { signals: Signal[] }) {
  if (!signals.length) return <p className="sub">No active signals at current thresholds.</p>;
  return (
    <div className="table-wrap">
      <table className="sig-table">
        <thead>
          <tr>
            <th>Signal</th>
            <th>Type</th>
            <th>Reading</th>
            <th className="num">Value</th>
            <th>Strength</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s, i) => {
            const meta = SEVERITY_META[s.severity];
            return (
              <tr key={i}>
                <td>{s.subject}</td>
                <td>{s.kind}</td>
                <td>{s.detail}</td>
                <td className="num">{s.value}</td>
                <td>
                  <span className="badge">
                    <span className="dot" style={{ background: `var(${meta.cssVar})` }} />
                    <span aria-hidden="true">{meta.icon}</span> {meta.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
