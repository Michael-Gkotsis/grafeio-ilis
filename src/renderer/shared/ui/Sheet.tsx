// The side panel (person and cadre cards, the «Άλλα» menu on a phone).
// Purpose: `Sheet` slides a titled panel over the right side of the page, with a dark overlay.
// Does NOT: ask before closing a dirty form (Dialog does; the person cards use DiscardAsk themselves) or move between
//   people (see SheetNav.tsx).
// Owner layer: renderer/shared/ui. Why: the cards and the phone menu share the same panel and Esc rule.
// Covering test: test/screens-dialogs-shell.test.ts, test/notes.test.ts.
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Icon } from './Icon';
import { useEscape } from './useEscape';

/** Props of `Sheet`. */
export interface SheetProps {
  /** Heading element(s), drawn first in the head (callers pass their own `<h2>`). */
  title: ReactNode;
  /** Drawn right after the title, in the same box (e.g. the status line of a person). */
  subtitle?: ReactNode;
  /** Buttons between the titles and ✕. */
  actions?: ReactNode;
  /** Esc, ✕ and a mouse press on the overlay all call it. */
  onClose: () => void;
  children?: ReactNode;
}

/** Panel in a portal on `document.body`; Esc closes only the top-most dialog or sheet (see useEscape). */
export function Sheet({ title, subtitle, actions, onClose, children }: SheetProps) {
  useEscape(onClose);
  return createPortal(
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a press on the overlay closes; frozen DOM */}
      <div className="ui-sheet-overlay" onMouseDown={onClose}></div>
      <aside className="ui-sheet" role="dialog" aria-modal="true" aria-label="Λεπτομέρειες">
        <div className="ui-sheet__head">
          <div>
            {title}
            {subtitle}
          </div>
          {actions && <div className="ui-sheet__acts">{actions}</div>}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Κλείσιμο"
            data-tip="Κλείσιμο (Esc)"
            data-tip-side="left"
            onClick={onClose}
          >
            {Icon.x}
          </Button>
        </div>
        <div className="ui-sheet__body">{children}</div>
      </aside>
    </>,
    document.body,
  );
}
