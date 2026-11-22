import { l as localize, t as tr } from '../lib/i18n';
import type { Cadence } from "../lib/quality";
import { displayDate } from "../lib/research-ui";
export type { Cadence } from "../lib/quality";

/** A date badge is not a QC verdict. Source-aware eligibility lives in Data status. */
export function Freshness({ date, cadence = "daily", prefix = "data through", title }: {
  date: string | null | undefined;
  cadence?: Cadence;
  prefix?: string;
  title?: string;
}) {
  if (!date || !Number.isFinite(Date.parse(date))) return null;
  const formatted = displayDate(date);
  return <span className="fresh fresh-info" title={tr(title ?? "Observation date, not retrieval time. Consult Data status for source-specific quality.")}>
    <span className="fresh-label">{localize(cadence === "annual" ? 'Annual observation' : prefix)}</span> <time dateTime={date.slice(0,10)}>{localize(cadence === "annual" ? date.slice(0,4) : formatted)}</time>
  </span>;
}
