// Small pill labels and key caps.
// Purpose: `Badge` (status chip with a tone) and `Kbd` (a key such as Ctrl+K) in tables, lists and hints.
// Does NOT: choose tones (callers map a status to a tone) or truncate text.
// Owner layer: renderer/shared/ui. Why: the same two-line components are used by almost every screen.
// Covering test: test/screens-*.test.ts (badges are part of the screen snapshots).
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

/** Props of `Badge`; other `<span>` attributes (title, data-tip, aria-label…) are passed through. */
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * Colour: becomes the class `ui-badge--<tone>`. Used today: ok, info, warn, bad, note, outline.
   * Typed as `string` because the tone often comes from a lookup (TYPES[...].tone, SRC[...], TONE[...]).
   */
  tone?: string;
  children?: ReactNode;
}

/** A `<span class="ui-badge ui-badge--tone">`; no tone gives the neutral badge. */
export const Badge = ({ tone, className, children, ...rest }: BadgeProps) => (
  <span className={cx('ui-badge', tone && 'ui-badge--' + tone, className)} {...rest}>
    {children}
  </span>
);

/** A key cap `<kbd class="ui-kbd">`, e.g. `<Kbd>Ctrl+K</Kbd>`. */
export const Kbd = ({ children }: { children?: ReactNode }) => <kbd className="ui-kbd">{children}</kbd>;
