import type { ReactNode } from "react";

export function GlossaryTip({ term, definition }: {
  term: string;
  definition: string;
}) {
  return (
    <abbr className="glossary-tip" title={definition} aria-label={`${term}: ${definition}`}>
      {term}
    </abbr>
  );
}

export function HowToRead({ title = "How to read this", children }: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <details className="howto" role="note">
      <summary>{title}</summary>
      <div className="howto-body">{children}</div>
    </details>
  );
}
