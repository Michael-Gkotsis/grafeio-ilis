// The small notes mark next to a name in the tables.
// Purpose: `NoteDot` shows that a person or cadre member has notes; red when a reminder has arrived.
// Does NOT: count notes (`noteMarks` in src/shared does) or open them.
// Owner layer: renderer/entities/note. Why: the people and cadre tables show the same mark.
// Covering test: test/notes.test.ts, test/screens-main.test.ts (the people table).
import { cx } from '../../../shared/lib/cx';
import { Icon } from '../../../shared/ui';

/** What the table knows about the notes of one row. */
export interface NoteMark {
  /** Number of open notes. */
  n: number;
  /** A reminder has arrived. */
  hot?: boolean;
}

/** Props of `NoteDot`. */
export interface NoteDotProps {
  /** `undefined`/`null` (no notes) draws nothing. */
  m?: NoteMark | null;
}

/** A notes icon with a tooltip («3 σημειώσεις · υπενθύμιση που έφτασε»); `null` when there is no mark. */
export function NoteDot({ m }: NoteDotProps) {
  if (!m) return null;
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: frozen DOM (an aria-label on the icon span)
    <span
      className={cx('notedot', m.hot && 'is-hot')}
      data-tip={(m.n === 1 ? '1 σημείωση' : m.n + ' σημειώσεις') + (m.hot ? ' · υπενθύμιση που έφτασε' : '')}
      aria-label={m.n + ' σημειώσεις'}
    >
      {Icon.notes}
    </span>
  );
}
