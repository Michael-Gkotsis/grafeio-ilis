// State and save of the «Είσοδος όπλων» dialog.
// Purpose: `useWeaponIn` finds the open moves of the chosen ids, the entry reason each gets (ΕΚΠ → ΛΗΞ ΕΚΠ), the moves
//   whose entry would be before the exit, and the armed numbers that keep the weapon out; `save` runs `weaponIn`.
// Does NOT: draw anything (ui/WeaponInDialog.tsx).
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/screens-dialogs-forms.test.ts (weaponMoves-WeaponInDialog), test/weapons.test.ts.
import { useState } from 'react';
import { rkShort } from '../../../entities/person';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { nowHM, today as todayFn } from '../../../../shared/dates';
import type { WeaponMove } from '../../../../shared/domain';
import { normTime } from '../../../../shared/hours';
import { weaponBack } from '../../../../shared/ranks';
import { seatMap } from '../../../../shared/rules';
import { stayOutByDuty } from '../../../../shared/weaponView';
import { stayTxt } from './text';

/** Props of `WeaponInDialog`. */
export interface WeaponInDialogProps {
  /** Ids of the weapon moves (not of people) that come back in. */
  ids: string[];
  onClose: () => void;
  onDone?: () => void;
}

/** State of the «Είσοδος όπλων» dialog. */
export function useWeaponIn({ ids, onClose, onDone }: WeaponInDialogProps) {
  const { state, run, undoMark } = useStore();
  const toast = useToast();
  const [day, setDay] = useState(todayFn());
  const [time, setTime] = useState(nowHM());
  const [reason, setReason] = useState('');
  const pm = seatMap(state);
  const lists = state.settings.lists;
  const moves: WeaponMove[] = (state.weaponLog || []).filter((m) => ids.includes(m.id) && !m.inDay);
  const backs = [...new Set(moves.map((m) => weaponBack(m.reason, lists)))];
  const early = moves.filter((m) => day + ' ' + (normTime(time) || '') < m.outDay + ' ' + m.outTime);
  // ένοπλο νούμερο που κρατά ακόμα το όπλο εκτός εκείνη την ώρα (η είσοδος γράφεται, το όπλο μένει ΕΚΤΟΣ)
  const stay = normTime(time)
    ? moves.map((m) => ({ m, s: stayOutByDuty(state, m.pid, day, normTime(time) as string) })).filter((x) => !!x.s)
    : [];
  const ok = moves.length > 0 && !!normTime(time) && !early.length;
  const miss = !moves.length
    ? 'Κανένα όπλο εκτός'
    : !normTime(time)
      ? 'Λείπει: Ώρα'
      : early.length
        ? 'Η ώρα είναι πριν την έξοδο'
        : '';
  const save = async () => {
    if (!ok) return;
    const cmd = {
      t: 'weaponIn' as const,
      ids: moves.map((m) => m.id),
      day,
      time: normTime(time) as string,
      reason: reason.trim() || undefined,
    };
    if (!(await run(cmd, false))) return;
    toast({
      text:
        'Είσοδος όπλων (' +
        (reason.trim().toUpperCase() || backs.join(', ')) +
        ') ' +
        normTime(time) +
        ': ' +
        (moves.length === 1 ? rkShort(pm.get(moves[0].pid)!) : moves.length + ' όπλα') +
        stayTxt(stay.map((x) => rkShort(pm.get(x.m.pid)!) + ': ' + x.s!.text)),
      actions: [undoMark()],
    });
    onDone?.();
    onClose();
  };
  return { lists, pm, day, setDay, time, setTime, reason, setReason, moves, backs, early, stay, ok, miss, save };
}

/** What `useWeaponIn` returns. */
export type WeaponIn = ReturnType<typeof useWeaponIn>;
