import { l as localize, t as tr } from '../lib/i18n';
import type { ReactNode } from "react";

export function GlossaryTip({ term, definition }: {
  term: string;
  definition: string;
}) {
  return (
    <abbr className="glossary-tip" title={tr(definition)} aria-label={`${tr(term)}: ${tr(definition)}`}>
      {localize(term)}
    </abbr>
  );
}

export function HowToRead({ title = "How to read this", children }: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <details className="howto" role="note">
      <summary>{localize(title)}</summary>
      <div className="howto-body">{localize(children)}</div>
    </details>
  );
}
