const SECTIONS = [
  { id: "kpis", label: "Market pulse" },
  { id: "overlay", label: "Overlay" },
  { id: "correlations", label: "Correlations" },
  { id: "signals", label: "Signals" },
  { id: "market-state", label: "Market state" },
  { id: "validation", label: "Validation" },
  { id: "equity-impact", label: "Equity impact" },
  { id: "sovereign-impact", label: "Sovereign impact" },
];

export function SectionNav() {
  return (
    <nav className="section-nav" aria-label="Page sections">
      {SECTIONS.map((s) => (
        <a key={s.id} href={`#${s.id}`}>{s.label}</a>
      ))}
    </nav>
  );
}
