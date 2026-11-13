// The small state of the «Υπηρεσίες» day: the «παρά τον κανόνα» question, skipped people, the unlocked days, the
// dialogs and the open blocks.
// Purpose: `useGuardState`, the `useState`s of the screen after the data, in the order the screen always called them.
// Does NOT: place anybody (model/useGuardActions.ts) or draw (ui/).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); hook order is unchanged
//   (force, skipped, reset effect, unlocked, add, clear, fixed, fold).
// Covering test: test/screens-main.test.ts, test/guard-page-view.test.ts.
import { useEffect, useState } from 'react';
import type { Person } from '../../../../shared/domain';
import type { GuardBase } from './useGuardBase';

/** The question «Βάλε τον … παρά τον κανόνα;»: the seat, the person, the rule, the reason typed and what it does. */
export interface Force {
  k: string;
  p: Person;
  why: string;
  reason: string;
  swapWith?: string;
  move?: string;
}

/**
 * @param b the base hooks of the screen
 * @returns the states with their setters, `locked` (an old day that is not unlocked) and `flip` (fold a card)
 */
export function useGuardState(b: GuardBase) {
  const { date, today } = b;
  const [force, setForce] = useState<Force | null>(null);
  const [skipped, setSkipped] = useState<Record<string, number[]>>({});
  useEffect(() => setSkipped({}), [date]);
  // Old days are locked, so the duty check is not changed by mistake; they unlock for a correction.
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const locked = date < today && !unlocked[date];
  const [addOpen, setAddOpen] = useState(false);
  const [clearAsk, setClearAsk] = useState(false);
  const [fixedOpen, setFixedOpen] = useState(false);
  // Cards that fold: full blocks closed, with empty seats open. What you change by hand stays while you work.
  const [fold, setFold] = useState<Record<string, boolean>>({});
  const flip = (id: string, open: boolean) => setFold((f) => ({ ...f, [id]: !open }));
  return {
    force,
    setForce,
    skipped,
    setSkipped,
    unlocked,
    setUnlocked,
    locked,
    addOpen,
    setAddOpen,
    clearAsk,
    setClearAsk,
    fixedOpen,
    setFixedOpen,
    fold,
    setFold,
    flip,
  };
}

/** What {@link useGuardState} returns. */
export type GuardState = ReturnType<typeof useGuardState>;
