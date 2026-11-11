// The heading of a screen: title, an optional motto, and a one-sentence subtitle.
// Purpose: `PageHeader` draws `<h1>`, the italic quote and the subtitle, and the actions at the right.
// Does NOT: cut or collapse the subtitle (it is one short sentence, whole, not shortened with «…»); the details live
//   in the Guide of the screen (F1).
// Owner layer: renderer/shared/ui. Why: every screen starts the same way, and 1366x768 leaves little room for it.
// Covering test: test/screens-*.test.ts (the head is in every screen snapshot).
import type { ReactNode } from 'react';

/** Props of `PageHeader`. */
export interface PageHeaderProps {
  title: ReactNode;
  /** Subtitle: one short sentence, shown whole. */
  sub?: ReactNode;
  /** The motto of the screen: italic, subtle, before the subtitle. */
  quote?: ReactNode;
  /** Buttons at the right of the head. */
  children?: ReactNode;
}

/** `<div class="page-head">` with the title block and the children (actions) after it. */
export function PageHeader({ title, sub, quote, children }: PageHeaderProps) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {quote && <p className="page-head__quote">{quote}</p>}
        {sub && <p className="page-head__sub">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
