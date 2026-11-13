// State of the «Έλεγχος υπηρεσιών» tab: search, list or grid, the sort, the columns and the rows.
// Purpose: `useDutyCheck`, the hooks of `DutyCheck` in the order the tab always called them.
// Does NOT: draw anything (ui/DutyCheck.tsx) or hold the pure rules (model/checkView.ts).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); hook order is unchanged:
//   store, search, deferred search, holiday switch, view, columns, grid, sort, rows.
// Covering test: test/screens-main.test.ts, test/guard-page-view.test.ts.
import { useDeferredValue, useMemo, useState } from 'react';
import { dutyStats, seatPeople } from '../../../../shared/rules';
import { searchPeople } from '../../../entities/person';
import { checkSheet } from '../../../shared/lib/sheets/check';
import { useStore } from '../../../shared/model';
import { checkKinds, checkRows, idleDays, type CheckSort } from './checkView';
import type { DutyMonth } from './useDutyMonth';

/**
 * Everything the tab reads and calls.
 * @param m the month state of the screen (shared with the bar of the posts)
 * @returns the month (`ym`, `setYm`, `allM`, `setAllM`), the search (`q`, `setQ`, `dq`), the switches (`hol`, `view`
 *   and setters), the sort (`sk`, `setSk`), `kinds` (columns), `grid` (sheet model, only in grid view) and `rows`
 */
export function useDutyCheck(m: DutyMonth) {
  const { state, today } = useStore();
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [hol, setHol] = useState(false);
  const [view, setView] = useState('list');
  // Days without duty: from his last duty of any month (not only the month on screen).
  const allSt = dutyStats(state);
  const { ym, setYm, allM, setAllM, st } = m;
  const kinds = useMemo(() => checkKinds(state, st), [state.settings, st]);
  // The grid reads only duties, people and settings: it is not rebuilt for other changes (e.g. outs, medical).
  const grid = useMemo(
    () =>
      view === 'grid'
        ? checkSheet(state, ym, dq.trim() ? new Set(searchPeople(state.people, dq).map((p) => p.id)) : undefined)
        : null,
    [view, state.guards, state.dutyLog, state.people, state.settings, ym, dq],
  );
  // Click on a column header sorts by it (click again: reversed).
  const [sk, setSk] = useState<CheckSort | null>(null);
  const rows = useMemo(
    () => checkRows(searchPeople(seatPeople(state), dq), st, (pid) => idleDays(allSt, pid, today), hol, sk),
    [dq, st, hol, state.people, state.cadreList, sk, allSt, today],
  );
  return { state, q, setQ, dq, hol, setHol, view, setView, ym, setYm, allM, setAllM, kinds, grid, sk, setSk, rows };
}

/** What {@link useDutyCheck} returns. */
export type DutyCheckModel = ReturnType<typeof useDutyCheck>;
