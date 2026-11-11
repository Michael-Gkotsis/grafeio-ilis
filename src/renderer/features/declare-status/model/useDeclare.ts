// The whole logic of the declaration dialog as one hook: state, derived values, handlers, plan.
// Purpose: `useDeclare` puts `useDeclareState`, `deriveDeclare`, `declareActions` and the four remaining hooks (the
//   punishers list, the plan, the out check of the picker, the focus per step) together, for `DeclareStatusDialog`.
// Does NOT: draw; the steps read the returned object and write the markup.
// Owner layer: renderer/features/declare-status. Why: the dialog had 155 lines of logic before its markup.
// Covering test: test/status-fix.test.ts, test/screens-dialogs-forms.test.ts.
import { useCallback, useEffect, useMemo } from 'react';
import type { StatusPlan } from '../../../../core/duty/planChange';
import type { ISODate } from '../../../../shared/dates';
import type { AppState, Person } from '../../../../shared/domain';
import { punBySuggestions } from '../../../../shared/punish';
import { outBlock, planStatusChanges } from '../../../../shared/rules';
import { declareActions, type DeclareActions } from './actions';
import { deriveDeclare, type DeclareDerived } from './derive';
import type { DeclareInitial } from './draft';
import { useDeclareState, type DeclareState } from './state';

/** Everything the steps of the dialog read. */
export type Declare = DeclareState &
  DeclareDerived &
  DeclareActions & {
    /** Who punished before: suggestions for «Ποιος τιμώρησε». */
    byList: string[];
    /** What the command would change; only worked out on the last step. */
    plan: StatusPlan | null;
    /** Why a person cannot go out that day (used by the picker for «Έξοδος»), or null. */
    outPick: (p: Person) => string | null;
    onClose: () => void;
    /** The app state and today (ISODate), read from the store once per render. */
    state: AppState;
    today: ISODate;
  };

/** The logic of `DeclareStatusDialog`; every hook of the dialog is called here, in a fixed order. */
export function useDeclare(initial: DeclareInitial, onClose: () => void): Declare {
  const s = useDeclareState(initial);
  const v = deriveDeclare(s);
  const { state, today } = s.store;
  const byList = useMemo(() => punBySuggestions(state), [state.statuses, state.cadreList]);
  const plan = useMemo(
    () => (s.step === 4 ? planStatusChanges(s.base, v.cmds, today) : null),
    [s.step, s.base, s.cmd, s.medSel, today, s.unlock],
  );
  const actions = declareActions(s, v, plan, onClose);
  const outPick = useCallback((p: Person) => outBlock(state, s.cmd.from, p.id), [state, s.cmd.from]);
  // in every step the cursor goes to its field (soldier search, status search)
  useEffect(() => {
    (document.querySelector('.ui-dialog [data-autofocus]') as HTMLElement | null)?.focus();
  }, [s.step]);
  return { ...s, ...v, ...actions, state, today, byList, plan, outPick, onClose };
}
