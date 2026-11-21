import type { Cadence } from "../lib/quality";
export type { Cadence } from "../lib/quality";

/** A date badge is not a QC verdict. Source-aware eligibility lives in Data status. */
export function Freshness({ date, cadence = "daily", prefix = "data through", title }: {
  date: string | null | undefined;
  cadence?: Cadence;
  prefix?: string;
  title?: string;
}) {
  if (!date || !Number.isFinite(Date.parse(date))) return null;
  const formatted = new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
  return <span className="fresh fresh-info" title={title ?? "Observation date, not retrieval time. Consult Data status for source-specific quality."}>
    <span aria-hidden="true">ℹ</span> {cadence === "annual" ? `annual · ${date.slice(0, 4)}` : `snapshot · ${prefix} ${formatted}`}
  </span>;
}
