// The toasts of the seat actions that are long enough to deserve their own function: «Ανταλλαγή» and the auto-fill.
// Purpose: `swapText` (text of the swap toast) and `autofillDay` (the plain «Αυτόματη συμπλήρωση» action).
// Does NOT: hold state or hooks (model/useGuardActions.ts calls these) or change a command: `{ t: 'autofill', date }`.
// Owner layer: renderer/pages/guard. Why: split from useGuardActions to keep it under 80 lines (Phase 6); same texts.
// Covering test: test/screens-main.test.ts, test/guard-page-view.test.ts.
import type { ISODate } from '../../../../shared/dates';
import { postTxt, type Person, type Settings } from '../../../../shared/domain';
import { postsOf } from '../../../../shared/rules';
import { rkShort } from '../../../entities/person';
import type { GuardBase } from './useGuardBase';

/**
 * The toast text of a swap of two seats.
 * @param settings the settings (the seats come from them)
 * @param pm the soldiers by id
 * @param a seat key of the first seat
 * @param c seat key of the second seat
 * @param pa id of the soldier who was in `a`
 * @param pb id of the soldier who was in `c`
 */
export const swapText = (
  settings: Settings,
  pm: Map<number, Person>,
  a: string,
  c: string,
  pa: number,
  pb: number,
): string =>
  'Ανταλλαγή: ' +
  rkShort(pm.get(pb)!) +
  ' σε ' +
  postTxt(postsOf(settings).find((q) => q.k === a)!) +
  ', ' +
  rkShort(pm.get(pa)!) +
  ' σε ' +
  postTxt(postsOf(settings).find((q) => q.k === c)!);

/**
 * «Αυτόματη συμπλήρωση»: fills the day and says how many seats stayed empty.
 * @returns the async action for the button
 */
export const autofillDay =
  (run: GuardBase['run'], toast: GuardBase['toast'], undoMark: GuardBase['undoMark'], date: ISODate) => async () => {
    const ns = await run({ t: 'autofill', date }, false);
    // biome-ignore lint/complexity/useOptionalChain: kept as it was: the same expression, not rewritten
    const left = ns ? postsOf(ns.settings).filter((x) => !(ns.guards[date] || {})[x.k]).length : 0;
    if (ns)
      toast({
        text: left
          ? 'Συμπληρώθηκαν όσες θέσεις γινόταν. ' +
            left +
            (left === 1 ? ' έμεινε κενή' : ' έμειναν κενές') +
            ' γιατί κανείς δεν επιτρέπεται εκεί με τους κανόνες.'
          : 'Συμπληρώθηκαν οι κενές θέσεις με τη σειρά δικαιοσύνης, τηρώντας όλους τους κανόνες',
        actions: [undoMark()],
      });
  };
