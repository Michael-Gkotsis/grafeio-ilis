// State of the «Συμπληρώνεις εσύ» card: the numbers and texts being typed for one day, and the save.
// Purpose: `useHkaiManual`, the hooks of `HkaiManualCard`, in the order the card always called them.
// Does NOT: draw anything (ui/HkaiManualCard.tsx) or hold the number rules (model/view.ts).
// Owner layer: renderer/pages/hkai. Why: moved verbatim from screens/other.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/hkai-view.test.ts.
import { useEffect, useState } from 'react';
import { usePending } from '../../../shared/lib/pending';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { dm } from '../../../../shared/dates';
import { hkLvOn } from '../../../../shared/domain';
import { dutyOfficers } from '../../../../shared/cadre';
import { HK } from '../../../../shared/unit';
import { manualOf, officerNames, usedCells, withCell } from './view';

/**
 * @param date ISODate of the shown day
 * @returns the store `state` and `today`, the typed values `m` (`setM`), the chosen rank row `rk` (`setRk`), `cur` (as
 *   saved), `dirty`, `lvOn`, `saveM`, `setCell`, the written numbers `used`, the automatic duty officer `auto` and
 *   the suggestions `offList`
 */
export function useHkaiManual(date: string) {
  const { state, run, today } = useStore();
  const toast = useToast();
  const cur = manualOf(state.hkaiManual[date]);
  const curKey = JSON.stringify(cur);
  const lvOn = hkLvOn(state, date);
  const [m, setM] = useState(cur);
  const [rk, setRk] = useState('Στρατιώτες');
  useEffect(() => setM(manualOf(state.hkaiManual[date])), [date, curKey]);
  const dirty = JSON.stringify(m) !== JSON.stringify(cur);
  const saveM = async () => {
    const ok = await run({ t: 'setHkaiManual', date, manual: m }, false);
    if (ok) toast({ text: 'Αποθηκεύτηκαν τα στοιχεία της ' + HK() + ' ' + dm(date) });
    return ok;
  };
  usePending(dirty, { label: 'Στοιχεία της ' + HK() + ' ' + dm(date), save: saveM, discard: () => setM(cur) });
  const setCell = (r: string, k: string, v: number) => setM(withCell(m, r, k, v));
  const used = usedCells(m);
  // The duty officer from the «Στελέχη» tab, when the field is left empty.
  const auto = dutyOfficers(state, date);
  const offList = officerNames(state);
  return { state, today, m, setM, rk, setRk, cur, dirty, lvOn, saveM, setCell, used, auto, offList };
}
