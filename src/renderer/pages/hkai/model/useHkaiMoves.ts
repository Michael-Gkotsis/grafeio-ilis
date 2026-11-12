// State of the «Εγγραφές και διαγραφές» card: the people who joined or left on the day and «Να μη γραφτεί».
// Purpose: `useHkaiMoves`, the hooks of `HkaiMovesCard`.
// Does NOT: draw anything (ui/HkaiMovesCard.tsx).
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/hkai-view.test.ts.
import { useMemo } from 'react';
import { rkShort } from '../../../entities/person';
import { useNav, useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import type { Person } from '../../../../shared/domain';
import { movesOn } from '../../../../shared/hkaiText';

/**
 * @param date ISODate of the shown day
 * @returns `today`, `nav`, the people who joined (`ins`) and left (`outs`) on `date`, and `drop`, which takes a person
 *   off the list of one of the two
 */
export function useHkaiMoves(date: string) {
  const { state, run, today, undoMark } = useStore();
  const toast = useToast();
  const nav = useNav();
  const ins = useMemo(() => movesOn(state, 'inOn', date), [state, date]);
  const outs = useMemo(() => movesOn(state, 'outOn', date), [state, date]);
  const drop = async (p: Person, field: 'inOn' | 'outOn') => {
    if (await run({ t: 'setPersonMove', pid: p.id, field, date: null }, false)) {
      toast({
        text: rkShort(p) + ': δεν γράφεται στις ' + (field === 'inOn' ? 'εγγραφές' : 'διαγραφές'),
        actions: [undoMark()],
      });
    }
  };
  return { today, nav, ins, outs, drop };
}
