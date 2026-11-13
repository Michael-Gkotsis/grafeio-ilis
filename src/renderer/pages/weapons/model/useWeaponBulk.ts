// Fifth part of the state of the «Οπλισμός» screen: ΕΚΤΟΣ at once for the ticked, and the keys 1-9.
// Purpose: `useWeaponBulk`: `outNow(reason)` (all the ticked who can go out leave now, with «Αναίρεση») and the
//   document key handler: 1-9 picks the exit reason of the bar (frozen shortcut, one of the three places that have it).
// Does NOT: draw the bar or open the dialogs.
// Owner layer: renderer/pages/weapons. Why: moved verbatim from screens/weapons.ts (Phase 6); the listener is added once
//   and reads the latest closure through a ref, as before.
// Covering test: test/screens-main.test.ts, test/weapons.test.ts.
import { useEffect, useRef } from 'react';
import { typingText } from '../../../shared/lib/typing';
import { nowHM, today as todayFn } from '../../../../shared/dates';
import { skipTxt } from '../../../../shared/weapons';
import type { WeaponBase } from './useWeaponBase';
import type { WeaponList } from './useWeaponList';
import type { WeaponSelection } from './useWeaponSelection';

/** ΕΚΤΟΣ now for the ticked, and the 1-9 keys. */
export function useWeaponBulk(base: WeaponBase, selection: WeaponSelection, list: WeaponList) {
  const { run, toast, undoMark } = base;
  const { setSel, setOnlySel, setLastReason, outReasons, tab } = selection;
  const { selIn, sp } = list;
  // ΕΚΤΟΣ at once (time now) for those who can; the skipped are named in the message; «Αναίρεση» brings all back.
  const outNow = async (reason: string) => {
    if (!selIn.length) {
      toast({ text: 'Κανένα όπλο για έξοδο' + (skipTxt(sp) ? ': ' + skipTxt(sp) : '') });
      return;
    }
    const time = nowHM();
    const n = selIn.length;
    if (!(await run({ t: 'weaponOut', pids: selIn.map((p) => p.id), reason, day: todayFn(), time }, false))) return;
    setLastReason(reason);
    setSel(new Set());
    setOnlySel(false);
    toast({
      text:
        'ΕΚΤΟΣ ' +
        n +
        (n === 1 ? ' όπλο' : ' όπλα') +
        ' (' +
        reason.trim().toUpperCase() +
        ') ' +
        time +
        (skipTxt(sp) ? ' · ' + skipTxt(sp) : ''),
      actions: [undoMark()],
    });
  };
  // 1-9 = the reason of the bar (when you are not typing in a field and no other window is open).
  const keyOut = useRef<(i: number) => void>(() => undefined);
  keyOut.current = (i: number) => {
    if (tab === 'weapons' && selIn.length && outReasons[i]) outNow(outReasons[i]);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        !/^[1-9]$/.test(e.key) ||
        typingText(document.activeElement) ||
        document.querySelector('.ui-overlay, .wpop')
      )
        return;
      e.preventDefault();
      keyOut.current(+e.key - 1);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);
  return { outNow };
}
