import { l as localize, t as tr } from '../lib/i18n';
import type { CatalogEntry, Category, QualityFile } from "../lib/data";
import { CATEGORY_LABELS } from "../lib/data";

const CATEGORY_ORDER: Category[] = ["energy", "fundamentals", "commodity", "equity", "renewables", "macro", "fx"];
export const MAX_SELECTED = 6;

export function SeriesPicker({ catalog, selected, colors, quality, onToggle }: {
  catalog: CatalogEntry[];
  selected: string[];
  colors: Map<string, string>; // id -> css var
  quality: QualityFile | null;
  onToggle: (id: string) => void;
}) {
  const full = selected.length >= MAX_SELECTED;
  return (
    <div className="picker">
      {localize(CATEGORY_ORDER.map((cat) => {
        const entries = catalog.filter((c) => c.category === cat);
        if (!entries.length) return null;
        return (
          <div className="picker-cat" key={cat}>
            <span className="cat-name">{localize(CATEGORY_LABELS[cat])}</span>
            {localize(entries.map((e) => {
              const on = selected.includes(e.id);
              const flags = quality?.series[e.id]?.flags ?? [];
              return (
                <button
                  key={e.id}
                  className={`chip${on ? " on" : ""}`}
                  disabled={!on && full}
                  onClick={() => onToggle(e.id)}
                  title={tr(`${e.name} — ${e.source}, observation period ${e.lastUpdated}${
                    flags.length ? `\nQC: ${flags.map((f) => f.detail).join("; ")}` : ""
                  }`)}
                >
                  {localize(on && <span className="swatch" style={{ background: `var(${colors.get(e.id)})` }} />)}
                  {localize(e.name)}
                  {localize(flags.length > 0 && <span className="chip-flag" aria-label={tr("data quality flag")}>{tr("⚠")}</span>)}
                </button>
              );
            }))}
          </div>
        );
      }))}
      <span className="picker-note">{tr("Overlay up to ")}{localize(MAX_SELECTED)}{tr(" series — colors stay with a series while it remains selected.")}</span>
    </div>
  );
}
