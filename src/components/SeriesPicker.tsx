import type { CatalogEntry, Category } from "../lib/data";
import { CATEGORY_LABELS } from "../lib/data";

const CATEGORY_ORDER: Category[] = ["energy", "commodity", "equity", "renewables", "macro", "fx"];
export const MAX_SELECTED = 6;

export function SeriesPicker({ catalog, selected, colors, onToggle }: {
  catalog: CatalogEntry[];
  selected: string[];
  colors: Map<string, string>; // id -> css var
  onToggle: (id: string) => void;
}) {
  const full = selected.length >= MAX_SELECTED;
  return (
    <div className="picker">
      {CATEGORY_ORDER.map((cat) => {
        const entries = catalog.filter((c) => c.category === cat);
        if (!entries.length) return null;
        return (
          <div className="picker-cat" key={cat}>
            <span className="cat-name">{CATEGORY_LABELS[cat]}</span>
            {entries.map((e) => {
              const on = selected.includes(e.id);
              return (
                <button
                  key={e.id}
                  className={`chip${on ? " on" : ""}`}
                  disabled={!on && full}
                  onClick={() => onToggle(e.id)}
                  title={`${e.name} — ${e.source}, updated ${e.lastUpdated}`}
                >
                  {on && <span className="swatch" style={{ background: `var(${colors.get(e.id)})` }} />}
                  {e.name}
                </button>
              );
            })}
          </div>
        );
      })}
      <span className="picker-note">
        Overlay up to {MAX_SELECTED} series — colors stay with a series while it remains selected.
      </span>
    </div>
  );
}
