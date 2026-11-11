// State and save of the entry pop-up under the ΕΝΤΟΣ | ΕΚΤΟΣ switch.
// Purpose: `useInPop` holds the time, day and entry reason of one open move (the reason comes ready from the list, ΕΚΠ → ΛΗΞ ΕΚΠ),
//   checks the time is not before the exit and whether an armed number keeps the weapon out; `go` runs `weaponIn`.
// Does NOT: draw anything (ui/InPop.tsx).
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/weapons.test.ts.
import { useState, type FormEvent, type RefObject } from 'react';
import { rkShort } from '../../../entities/person';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { nowHM, today as todayFn } from '../../../../shared/dates';
import type { Person, WeaponMove } from '../../../../shared/domain';
import { normTime } from '../../../../shared/hours';
import { weaponBack } from '../../../../shared/ranks';
import { stayOutByDuty } from '../../../../shared/weaponView';
import { stayTxt, when } from './text';

/** Props of the entry pop-up. */
export interface InPopProps {
  p: Person;
  /** The open move that comes back in. */
  m: WeaponMove;
  anchor: RefObject<HTMLElement>;
  onClose: () => void;
  /** «Διόρθωση εξόδου…»: opens the edit dialog of the move. */
  onEdit: (m: WeaponMove) => void;
}

/** State of the entry pop-up. */
export function useInPop({ p, m, onClose }: InPopProps) {
  const { state, run, undoMark, today } = useStore();
  const toast = useToast();
  const auto = weaponBack(m.reason, state.settings.lists);
  const [day, setDay] = useState(todayFn());
  const [time, setTime] = useState(nowHM());
  const [reason, setReason] = useState(auto);
  const t = normTime(time);
  const early = !!t && day + ' ' + t < m.outDay + ' ' + m.outTime;
  const ok = !!t && !early;
  const stay = t ? stayOutByDuty(state, m.pid, day, t) : null;
  const go = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!ok) return;
    if (!(await run({ t: 'weaponIn', ids: [m.id], day, time: t as string, reason: reason.trim() || undefined }, false)))
      return;
    toast({
      text:
        rkShort(p) +
        ': όπλο ' +
        m.weapon +
        ' ΕΝΤΟΣ (' +
        (reason.trim().toUpperCase() || auto) +
        ') ' +
        when(day, t as string, today) +
        stayTxt(stay ? [stay.text] : []),
      actions: [undoMark()],
    });
    onClose();
  };
  return { today, auto, day, setDay, time, setTime, reason, setReason, t, early, ok, stay, go };
}

/** What `useInPop` returns. */
export type InPopState = ReturnType<typeof useInPop>;
