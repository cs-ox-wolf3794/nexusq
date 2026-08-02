/**
 * Loading skeletons: shape-stable placeholders shown while snapshot JSON loads.
 * Shimmer animates only under prefers-reduced-motion: no-preference (CSS).
 */
export function Skeleton({ height, className }: { height?: number; className?: string }) {
  return <div className={`skeleton ${className ?? ""}`} style={height ? { height } : undefined} aria-hidden="true" />;
}

/** A stack of text-like rows with slightly varied widths (reads as a table/list). */
export function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton skeleton-row" style={{ width: `${100 - (i % 3) * 9}%` }} />
      ))}
    </div>
  );
}

/** Ghost KPI tiles matching the real strip's grid. */
export function SkeletonTiles({ count = 6 }: { count?: number }) {
  return (
    <div className="kpi-strip" aria-hidden="true" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton skeleton-tile" />
      ))}
    </div>
  );
}
