// The numbers of the day on the «Υπηρεσίες» screen: the month counts, who is excluded, the sheet and «Γιατί αυτός;».
// Purpose: `useGuardData`, the memoised reads of the screen, each computed once per change of what it reads.
// Does NOT: change anything or draw (ui/).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); hook order is unchanged
//   (month, excluded, ΕΠΟΠ hint, sheet, why).
// Covering test: test/screens-main.test.ts, test/guard-page-view.test.ts.
import { useCallback, useMemo } from 'react';
import type { Person } from '../../../../shared/domain';
import { activePeople, monthTxt, whyAll } from '../../../../shared/rules';
import { frouraSheet } from '../../../shared/lib/sheets/froura';
import { excludedOn } from './guardView';
import type { GuardBase } from './useGuardBase';
import { useDutyMonth } from './useDutyMonth';

/**
 * @param b the base hooks of the screen
 * @returns `mon` (month state), `st` (its stats), `people`, `excluded`, `epopHint`, `model` (sheet) and `why`
 */
export function useGuardData(b: GuardBase) {
  const { state, date } = b;
  const mon = useDutyMonth();
  const st = mon.st;
  const people = activePeople(state);
  const excluded = useMemo(
    () => excludedOn(state, date, people),
    [state.statuses, state.caps, state.people, state.cadreList, state.settings, date],
  );
  const epopHint = useCallback(
    (p: Person) => monthTxt(state, date, p),
    [state.guards, state.dutyLog, state.settings, date],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(() => frouraSheet(state, date), [state, date]);
  // «Γιατί αυτός;» once per change, not on every render (e.g. while you type a reason in the «παρά τον κανόνα» window).
  const why = useMemo(
    () => whyAll(state, date),
    [
      state.guards,
      state.dutyLog,
      state.people,
      state.settings,
      state.baseline,
      state.statuses,
      state.caps,
      state.rules,
      date,
    ],
  );
  return { mon, st, people, excluded, epopHint, model, why };
}

/** What {@link useGuardData} returns. */
export type GuardData = ReturnType<typeof useGuardData>;
