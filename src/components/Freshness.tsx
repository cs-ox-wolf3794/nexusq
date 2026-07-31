/**
 * Data-freshness badge: icon + label + date — never color alone.
 * Thresholds depend on the data's natural cadence: daily series that are 3 days
 * old are fresh; monthly series a month old are fresh; annual data is simply
 * labeled with its vintage.
 */
export type Cadence = "daily" | "monthly" | "annual";

const THRESHOLDS: Record<Exclude<Cadence, "annual">, [number, number]> = {
  daily: [5, 14],   // fresh ≤5d, aging ≤14d, stale beyond
  monthly: [40, 75],
};

function ageDays(iso: string): number {
  return Math.floor((Date.now() - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) / 86400000);
}

function fmt(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

export function Freshness({ date, cadence = "daily", prefix = "data through", title }: {
  date: string | null | undefined;
  cadence?: Cadence;
  prefix?: string;
  title?: string;
}) {
  if (!date) return null;
  if (cadence === "annual") {
    return (
      <span className="fresh fresh-info" title={title ?? "Annual-frequency data"}>
        <span aria-hidden="true">ℹ</span> annual · {date.slice(0, 4)}
      </span>
    );
  }
  const [freshMax, agingMax] = THRESHOLDS[cadence];
  const age = ageDays(date);
  const state = age <= freshMax ? "good" : age <= agingMax ? "aging" : "stale";
  const meta = {
    good: { cls: "fresh-good", icon: "✓", label: "fresh" },
    aging: { cls: "fresh-aging", icon: "◔", label: "aging" },
    stale: { cls: "fresh-stale", icon: "⚠", label: "stale" },
  }[state];
  return (
    <span
      className={`fresh ${meta.cls}`}
      title={title ?? `${prefix} ${fmt(date)} — ${age} day${age === 1 ? "" : "s"} old (${meta.label})`}
    >
      <span className="dot" aria-hidden="true" />
      <span aria-hidden="true">{meta.icon}</span> {meta.label} · {prefix} {fmt(date)}
    </span>
  );
}
