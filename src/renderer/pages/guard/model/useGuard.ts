// Everything the «Υπηρεσίες» screen reads and calls, built from the hooks of model/ in the order the screen always
// called them.
// Purpose: `useGuard`, one object for `GuardScreen` and its parts.
// Does NOT: draw anything (ui/) or hold the pure rules (model/guardView.ts).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); hook order: base, data,
//   state, actions, focus, exception count.
// Covering test: test/screens-main.test.ts, test/guard-page-view.test.ts.
import { useMemo } from 'react';
import { dmy } from '../../../../shared/dates';
import { frouraFile } from '../../../../shared/domain';
import { afWhyOf, pskOf, skipCount } from './guardView';
import { useGuardActions } from './useGuardActions';
import { useGuardBase } from './useGuardBase';
import { useGuardData } from './useGuardData';
import { useGuardFocus } from './useGuardFocus';
import { useGuardState } from './useGuardState';

/** All of the screen's state, data and actions in one object. */
export function useGuard() {
  const b = useGuardBase();
  const d = useGuardData(b);
  const s = useGuardState(b);
  const a = useGuardActions(b, s);
  const f = useGuardFocus(b, s);
  const { state, today, date, ex, phase } = b;
  // Exceptions in force now or coming.
  const skipN = useMemo(() => skipCount(state.people, today), [state.people, today]);
  const { people } = d;
  // Why «Αυτόματη συμπλήρωση» is grey (UX Μ5), the weekend of the day, the file name and the export of the day.
  const afWhy = afWhyOf(s.locked, people.length, b.empty.length);
  const psk = pskOf(date);
  const fileName = frouraFile(state.settings, phase) + dmy(date).replace(/\//g, '-') + '.xlsx';
  const exportX = () => ex('froura', date, 'η κατάσταση υπηρεσιών');
  return { ...b, ...d, ...s, ...a, ...f, skipN, afWhy, psk, fileName, exportX };
}

/** What {@link useGuard} returns. */
export type Guard = ReturnType<typeof useGuard>;
