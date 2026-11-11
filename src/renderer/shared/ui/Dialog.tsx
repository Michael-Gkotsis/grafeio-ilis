// The modal window of the app, and the question «να χαθεί αυτό που έγραψες;» it asks before closing a dirty form.
// Purpose: `Dialog` (overlay, title, body, footer, Esc/✕/outside click), `DiscardAsk` (the question) and `DialogLeave`
//   (how a link inside a dialog leaves it).
// Does NOT: own the form state or the dirty flag (see useDirty.ts), or decide what a link opens (GoLink does).
// Owner layer: renderer/shared/ui. Why: Dialog and DiscardAsk use each other, so they live in one file (no import
//   cycle); every dialog of the app is built on them.
// Covering test: test/screens-dialogs-shell.test.ts, test/screens-dialogs-forms.test.ts, test/ux-names.test.ts.
import { createContext, useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { lockScroll } from '../lib/scrollLock';
import { Button } from './Button';
import { Icon } from './Icon';
import { useEscape } from './useEscape';

// why: with no `data-autofocus` the focus goes to the default (primary) footer button, else to the first body input.
const DEFAULT_FOCUS = '.ui-dialog__foot .ui-btn--default,.ui-dialog__body input';

/**
 * A link inside a dialog (GoLink) closes the dialog first, with the same question if it has changes, and only then
 * goes there. `null` outside a Dialog.
 */
export const DialogLeave = createContext<((after: () => void) => void) | null>(null);

/** Props of `Dialog`. */
export interface DialogProps {
  title: ReactNode;
  /** Small text under the title. */
  description?: ReactNode;
  /** Called when the dialog closes: Esc, ✕, a click outside (unless `closeOnOverlay` is false), or «Κλείσε…». */
  onClose: () => void;
  children?: ReactNode;
  /** Buttons row. The first `.ui-btn--default` button gets the focus when nothing has `data-autofocus`. */
  footer?: ReactNode;
  /** Class `ui-dialog--<size>` (lg, xl). Typed as `string`: one call site passes it from a variable. */
  size?: string;
  /** A click on the dark overlay closes the dialog. Default true. */
  closeOnOverlay?: boolean;
  /** `dialog` (default) or `alertdialog` (the discard question). */
  role?: string;
  /**
   * Something was written and not saved. Then Esc, ✕ and a click outside ask first (an Esc meant for a
   * dropdown list no longer throws the form away). A string replaces the default text with what exactly is lost. The «Άκυρο» of the
   * dialog closes without a question.
   */
  dirty?: boolean | string;
}

// The question before closing: Esc, ✕ and the overlay call `tryClose`; a link inside calls `leave(after)`.
function useCloseGuard(dirty: boolean | string | undefined, onClose: () => void) {
  const [asking, setAsking] = useState<false | { after?: () => void }>(false);
  const tryClose = () => {
    if (dirty) setAsking({});
    else onClose();
  };
  const leave = (after: () => void) => {
    if (dirty) setAsking({ after });
    else {
      onClose();
      after();
    }
  };
  useEscape(tryClose);
  return { asking, setAsking, tryClose, leave };
}

// On open: focus the first field and lock the page scroll; unlock on close.
function useFocusAndLock(ref: RefObject<HTMLDivElement>): void {
  useEffect(() => {
    const el = ref.current;
    const first = el && (el.querySelector('[data-autofocus]') || el.querySelector(DEFAULT_FOCUS));
    (first as HTMLElement | null)?.focus();
    const unlock = lockScroll();
    return () => {
      unlock();
    };
  }, []);
}

/**
 * Modal window in a portal on `document.body`; locks the page scroll while open and focuses the first field.
 * Esc closes only the top-most dialog (see useEscape).
 * @decision dirty dialogs ask before closing (Esc, ✕, overlay), never for the own «Άκυρο» button.
 * @see test/screens-dialogs-forms.test.ts
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  size,
  closeOnOverlay = true,
  role = 'dialog',
  dirty,
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { asking, setAsking, tryClose, leave } = useCloseGuard(dirty, onClose);
  useFocusAndLock(ref);
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: a press on the overlay closes; frozen DOM
    <div
      className="ui-overlay"
      onMouseDown={(e: MouseEvent) => {
        if (e.target === e.currentTarget && closeOnOverlay) tryClose();
      }}
    >
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: `role` is a prop (dialog or alertdialog) */}
      <div
        ref={ref}
        className={cx('ui-dialog', size && 'ui-dialog--' + size)}
        role={role}
        aria-modal="true"
        aria-labelledby="dlg-t"
      >
        <div className="ui-dialog__head">
          <div>
            <h2 id="dlg-t">{title}</h2>
            {description && <div className="ui-dialog__desc">{description}</div>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Κλείσιμο"
            data-tip="Κλείσιμο (Esc)"
            data-tip-side="left"
            onClick={tryClose}
          >
            {Icon.x}
          </Button>
        </div>
        <div className="ui-dialog__body">
          <DialogLeave.Provider value={leave}>{children}</DialogLeave.Provider>
        </div>
        {footer && <div className="ui-dialog__foot">{footer}</div>}
      </div>
      {asking && (
        <DiscardAsk
          text={typeof dirty === 'string' ? dirty : 'Όσα έγραψες εδώ δεν έχουν αποθηκευτεί. Αν κλείσεις, χάνονται.'}
          onStay={() => setAsking(false)}
          onLeave={() => {
            const after = asking ? asking.after : undefined;
            setAsking(false);
            onClose();
            after?.();
          }}
        />
      )}
    </div>,
    document.body,
  );
}

/** Props of `DiscardAsk`. */
export interface DiscardAskProps {
  /** What exactly is lost. */
  text: ReactNode;
  /** «Πίσω στη φόρμα»: keep the form open. Also what Esc and ✕ of the question do. */
  onStay: () => void;
  /** «Κλείσε χωρίς αποθήκευση»: throw the changes away. */
  onLeave: () => void;
  title?: ReactNode;
  /** Label of the leave button. */
  leave?: ReactNode;
  /** Label of the stay button (the one with the focus). */
  stay?: ReactNode;
}

/**
 * The question «να χαθεί αυτό που έγραψες;», from Dialog (dirty) and from the person cards with a note that was not
 * saved. The Greek defaults are the texts the users know; callers override them for the notes.
 */
export function DiscardAsk({
  text,
  onStay,
  onLeave,
  title = 'Να κλείσει χωρίς αποθήκευση;',
  leave = 'Κλείσε χωρίς αποθήκευση',
  stay = 'Πίσω στη φόρμα',
}: DiscardAskProps) {
  return (
    <Dialog
      role="alertdialog"
      title={title}
      onClose={onStay}
      footer={
        <>
          <Button variant="ghost" onClick={onLeave}>
            {leave}
          </Button>
          <Button data-autofocus="" onClick={onStay}>
            {stay}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{text}</p>
    </Dialog>
  );
}
