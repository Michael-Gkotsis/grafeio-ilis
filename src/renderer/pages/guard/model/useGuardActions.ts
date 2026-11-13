// What the clerk does to the seats: place, swap, «Επόμενος», refuse by rule, fill and clear.
// Purpose: `useGuardActions`, the four memoised callbacks of the screen (`assign`, `blocked`, `swap`, `next`) and the
//   plain `autofill`, in the order the screen always declared them.
// Does NOT: hold state (model/useGuardState.ts) or draw (ui/). Every command and its arguments are the old ones.
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/guard.ts (Phase 6); the dependency lists are
//   unchanged so a callback is rebuilt exactly when it was.
//   @decision Michael 17/10: nothing is forbidden completely: a status (ΕΥ, leave…), rest, weekend or capability passes
//   with a reason. Already in another seat: swap if the seat has someone, else move (or both, with a reason).
// Covering test: test/screens-main.test.ts, test/status-fix.test.ts, test/guard-page-view.test.ts.
import { useCallback } from 'react';
import { postTxt, type Person } from '../../../../shared/domain';
import { nextFor, pickPeople, postOf, swapCheck } from '../../../../shared/rules';
import { rkShort } from '../../../entities/person';
import { autofillDay, swapText } from './guardTexts';
import type { GuardBase } from './useGuardBase';
import type { GuardState } from './useGuardState';

/**
 * @param b the base hooks of the screen
 * @param s the small state of the screen
 * @returns `assign`, `blocked`, `swap`, `next` (callbacks) and `autofill`
 */
export function useGuardActions(b: GuardBase, s: GuardState) {
  const { state, run, undoMark, toast, date, g, posts, pm, printed } = b;
  const { skipped, setSkipped, setForce } = s;
  const assign = useCallback(
    async (k: string, pid: number | null, instead?: number, reason?: string, move?: string) => {
      const x = posts.find((q) => q.k === k)!;
      const who = pid ? pm.get(pid) || pickPeople(state).find((q) => q.id === pid) : undefined; // a cadre member with no seat number yet: assign gives it
      if (await run({ t: 'assign', date, k, pid, force: reason, move, ...(who?.cid ? { cid: who.cid } : {}) }, false))
        toast({
          text:
            (pid
              ? rkShort(who!) + (instead ? ' αντί για ' + rkShort(pm.get(instead)!) : '') + ' σε '
              : 'Κενή η θέση ') +
            postTxt(x) +
            (printed ? ' · Είχε βγει Excel: χρειάζεται νέα εκτύπωση' : ''),
          actions: [undoMark()],
        });
    },
    [date, printed, state],
  );
  const blocked = useCallback(
    (k: string, p: Person, why: string) => {
      const other = postOf(state, date, p.id, k);
      if (other && g[k]) {
        const chk = swapCheck(state, date, k, other.k);
        if (chk.hard) {
          toast({ text: 'Δεν γίνεται ανταλλαγή: ' + chk.hard });
          return;
        }
        if (chk.soft) {
          setForce({ k, p, why: chk.soft, reason: '', swapWith: other.k });
          return;
        }
        swap(k, other.k);
        return;
      }
      if (other) {
        setForce({ k, p, why: 'Είναι ήδη ' + postTxt(other) + '.', reason: '', move: other.k });
        return;
      }
      setForce({ k, p, why, reason: '' });
    },
    [date, state],
  );
  const swap = useCallback(
    async (a: string, c: string, reason?: string) => {
      const pa = g[a];
      const pb = g[c];
      if (await run({ t: 'swapPosts', date, a, b: c, force: reason }, false))
        toast({
          text: swapText(state.settings, pm, a, c, pa, pb),
          actions: [undoMark()],
        });
    },
    [date, state],
  );
  // «Επόμενος»: the next in the fair order, with the same rules; press again for the one after.
  const next = useCallback(
    async (k: string) => {
      const cur = g[k];
      const skip = [...(skipped[k] || []), ...(cur ? [cur] : [])];
      const pid = nextFor(state, date, k, skip);
      if (!pid) {
        toast({ text: 'Δεν υπάρχει άλλος που να επιτρέπεται σε αυτή τη θέση' });
        return;
      }
      setSkipped({ ...skipped, [k]: skip });
      await assign(k, pid, cur);
    },
    [date, state, skipped],
  );
  const autofill = autofillDay(run, toast, undoMark, date);
  return { assign, blocked, swap, next, autofill };
}

/** What {@link useGuardActions} returns. */
export type GuardActions = ReturnType<typeof useGuardActions>;
