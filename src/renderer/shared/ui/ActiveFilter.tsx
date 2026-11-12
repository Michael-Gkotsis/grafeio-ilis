// The visible «Φίλτρο: …» chip with a ✕ that clears the active filters (research §3.7).
// Purpose: `ActiveFilter` shows the active filter parts joined by « · » and calls `onClear` from the ✕.
// Does NOT: own the filter state or know which screen it sits in.
// Owner layer: renderer/shared/ui. Why: moved down from renderer/common.ts (Phase 6) so pages can use it.
// Covering test: test/screens-main.test.ts.
import type { ReactNode } from 'react';

/** Props of `ActiveFilter`. */
export interface ActiveFilterProps {
  /** Filter descriptions; falsy entries (a filter that is off) are skipped. */
  parts: (string | false | null | undefined)[];
  onClear: () => void;
  /** Extra content shown after the filter text, before the ✕. */
  extra?: ReactNode;
}

/** Shows the active filters with a ✕; renders nothing when no filter is on. */
export function ActiveFilter({ parts, onClear, extra }: ActiveFilterProps) {
  const ps = parts.filter(Boolean) as string[];
  if (!ps.length) return null;
  return (
    <span className="actfilter" role="status">
      Φίλτρο: <b>{ps.join(' · ')}</b>
      {extra}
      <button type="button" aria-label="Καθάρισε το φίλτρο" data-tip="Καθάρισε το φίλτρο" onClick={onClear}>
        ✕
      </button>
    </span>
  );
}
