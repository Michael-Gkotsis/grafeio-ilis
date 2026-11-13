// The month the duty counts are made for: shared by the posts (column «Είδ./Σύν.»), the check list and the grid.
// Purpose: `useDutyMonth`, the chosen month, the «Όλοι οι μήνες» switch, the stats and the months to choose from.
// Does NOT: draw the month list (ui/MonthSelect.tsx) or count duties (`dutyStats`, `monthStats` in src/shared).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); «Όλοι οι μήνες» also counts
//   the earlier duties.
// Covering test: test/screens-main.test.ts, test/guard-page-view.test.ts.
import { useMemo, useState } from 'react';
import { dutyMonths, dutyStats, monthStats } from '../../../../shared/rules';
import { useStore } from '../../../shared/model';

/**
 * The month state of the Υπηρεσίες screen.
 * @returns `ym` (`'εεεε-μμ'`), `allM` (all months), their setters, `st` (stats per person id) and `months` (newest
 *   first, always with the current and the chosen one)
 */
export function useDutyMonth() {
  const { state, today } = useStore();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [allM, setAllM] = useState(false);
  const all = dutyStats(state);
  const st = useMemo(() => (allM ? all : monthStats(all, ym)), [all, allM, ym]);
  const months = useMemo(
    () => [...new Set([today.slice(0, 7), ym, ...dutyMonths(state)])].sort().reverse(),
    [state.guards, state.dutyLog, today, ym],
  );
  return { ym, setYm, allM, setAllM, st, months };
}

/** What {@link useDutyMonth} returns. */
export type DutyMonth = ReturnType<typeof useDutyMonth>;
