// A boxed message inside a page or dialog.
// Purpose: `Alert` shows a note, warning or error with the colour of its tone.
// Does NOT: dismiss itself or auto-hide (toasts do that, see Toast.tsx).
// Owner layer: renderer/shared/ui. Why: ~90 call sites; the `role="alert"` rule for errors lives in one place.
// Covering test: test/screens-*.test.ts (alerts are part of the screen snapshots).
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

/** Props of `Alert`. */
export interface AlertProps {
  /**
   * Colour: class `ui-alert--<tone>`. Used today: info, warn, bad, ok. Typed as `string` because one call site
   * passes it from a variable. Only `bad` gets `role="alert"` (read out at once); the others are plain text.
   */
  tone?: string;
  children?: ReactNode;
}

/** A `<div class="ui-alert ui-alert--tone">`. */
export const Alert = ({ tone, children }: AlertProps) => (
  <div className={cx('ui-alert', tone && 'ui-alert--' + tone)} role={tone === 'bad' ? 'alert' : undefined}>
    {children}
  </div>
);
