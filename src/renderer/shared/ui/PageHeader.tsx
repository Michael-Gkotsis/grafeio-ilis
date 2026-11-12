// The heading of a screen: title, an optional motto, and a one-sentence subtitle.
// Purpose: `PageHeader` draws `<h1>`, the italic quote and the subtitle, and the actions at the right.
// Does NOT: hide the subtitle at 1024-1279 px (02 §5.5 plans a «?» for that, no page has it yet), and does not cut
//   or collapse it (one short sentence, whole, not shortened with «…»); the details live
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
  /**
   * 1 (default): a screen title (`<h1>`). 2: a section row under the tabs of a hub; the `<h2>` is visually hidden
   * (still read by screen readers) so the row shows only the subtitle and the actions.
   */
  level?: 1 | 2;
}

/** `<div class="page-head">` with the title block and the children (actions) after it; `level={2}` adds `--section`. */
export function PageHeader({ title, sub, quote, children, level = 1 }: PageHeaderProps) {
  return (
    <div className={level === 2 ? 'page-head page-head--section' : 'page-head'}>
      <div>
        {level === 2 ? <h2 className="page-head__title">{title}</h2> : <h1>{title}</h1>}
        {quote && <p className="page-head__quote">{quote}</p>}
        {sub && <p className="page-head__sub">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
