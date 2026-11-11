// The button of the app, and the «Λείπει: …» reason that sits next to a greyed-out one.
// Purpose: `Button` (variants, sizes, tip for a disabled button, busy while its Promise runs) and `Why`.
// Does NOT: submit forms (type is "button" unless given), pick the look (variants are CSS classes in app/styles), or
//   build the reason text (see shared/lib/missingOf.ts).
// Owner layer: renderer/shared/ui. Why: every screen has buttons; one place makes double clicks and tips uniform.
// Covering test: test/ux-names.test.ts (disabled button and its tip), test/screens-dialogs-*.test.ts (markup).
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { cx } from '../lib/cx';

/** Props of `Button`; every other `<button>` attribute (aria-*, data-tip, type, title…) is passed through. */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'disabled'> {
  /**
   * Look: becomes the class `ui-btn--<variant>`. Used today: default, outline, ghost, link, secondary, destructive.
   * Typed as `string` because several screens pass it from a variable (SigsMenu, ExportButton…).
   */
  variant?: string;
  /** Becomes the class `ui-btn--<size>` (sm, lg, xl, icon); none by default. Typed as `string` like `variant`. */
  size?: string;
  className?: string;
  children?: ReactNode;
  /**
   * Click handler. A returned Promise keeps the button busy (disabled, `aria-busy`) until it settles, so a double
   * click on «Αποθήκευση» cannot write twice. Typed `unknown` result: handlers return void, a Promise or anything.
   */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => unknown;
  disabled?: boolean;
  /** Why the button is grey (UX Μ5, 22/10): shown as its tip, only while it is disabled. */
  why?: string;
}

/**
 * Button with a double-click guard.
 * - While the Promise returned by `onClick` runs, further clicks are ignored and the button is disabled.
 * - A rejected Promise re-enables the button and is logged with `console.error` (it is not swallowed silently).
 * - Nothing is set after unmount (the `live` ref), so closing a dialog while saving does not warn.
 * @decision UX Μ5 22/10: while the button is grey, its tip says why instead of what it does.
 * @see test/ux-names.test.ts
 */
export function Button({
  variant = 'default',
  size,
  className,
  children,
  onClick,
  disabled,
  why,
  ...rest
}: ButtonProps) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const click =
    onClick &&
    ((e: MouseEvent<HTMLButtonElement>) => {
      if (running.current) return;
      const result = onClick(e) as { then?: unknown } | null | undefined;
      if (!result || typeof result.then !== 'function') return;
      running.current = true;
      setBusy(true);
      const done = () => {
        running.current = false;
        if (live.current) setBusy(false);
      };
      // why: `.then(done, onError)` (not async/await) keeps the exact timing of the old code and accepts any thenable.
      (result as Promise<unknown>).then(done, (err: unknown) => {
        done();
        console.error(err);
      });
    });
  const tip = disabled && why ? { 'data-tip': why, 'aria-description': why } : null;
  return (
    <button
      type="button"
      className={cx('ui-btn', 'ui-btn--' + variant, size && 'ui-btn--' + size, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={click}
      {...rest}
      {...tip}
    >
      {children}
    </button>
  );
}

/**
 * Next to a greyed-out button in a dialog: what is missing (e.g. «Λείπει: Επώνυμο, Όνομα»).
 * @param text - the reason; renders nothing for `''`, `false`, `null` and `undefined`
 */
export const Why = ({ text }: { text?: string | false | null }) =>
  text ? (
    <span className="btn-why" role="status">
      {text}
    </span>
  ) : null;
