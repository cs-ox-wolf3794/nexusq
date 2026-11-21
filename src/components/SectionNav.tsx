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

export function SectionNav({ sections = SECTIONS, preserveView = false }: {
  sections?: { id: string; label: string }[]; preserveView?: boolean;
}) {
  return (
    <nav className="section-nav" aria-label="Page sections">
      {sections.map((s) => (
        <a key={s.id} href={`#${s.id}`} onClick={event => {
          if (preserveView) { event.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ block: "start" }); }
        }}>{s.label}</a>
      ))}
    </nav>
  );
}
