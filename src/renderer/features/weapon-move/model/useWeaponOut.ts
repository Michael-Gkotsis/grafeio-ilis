// State and save of the «Έξοδος όπλων» dialog.
// Purpose: `useWeaponOut` reads the store, works out who can go out (has a weapon, is in), holds the reason, day, time
//   and note, and `save` runs the `weaponOut` command. Hooks run in the order they did in the single component.
// Does NOT: draw anything (ui/WeaponOutDialog.tsx).
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/screens-dialogs-forms.test.ts (weaponMoves-WeaponOutDialog), test/weapons.test.ts.
import { useMemo, useState } from 'react';
import { rkShort } from '../../../entities/person';
import { missingOf } from '../../../shared/lib/missingOf';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { nowHM, today as todayFn } from '../../../../shared/dates';
import type { Person } from '../../../../shared/domain';
import { normTime } from '../../../../shared/hours';
import { listOf } from '../../../../shared/ranks';
import { seatMap } from '../../../../shared/rules';
import { openMoves } from '../../../../shared/weapons';
import { namesOf } from './text';

/** Props of `WeaponOutDialog`. */
export interface WeaponOutDialogProps {
  /** Ids of the people whose weapons go out. */
  pids: number[];
  /** A reason chosen beforehand (the bulk bar buttons); empty = the dialog asks. */
  reason?: string;
  onClose: () => void;
  /** Called with the saved reason in CAPITALS, before `onClose`. */
  onDone?: (reason: string) => void;
}

/** State of the «Έξοδος όπλων» dialog. */
export function useWeaponOut({ pids, reason: r0 = '', onClose, onDone }: WeaponOutDialogProps) {
  const { state, run, undoMark } = useStore();
  const toast = useToast();
  const reasons = useMemo(() => listOf(state.settings.lists, 'weaponOut'), [state.settings.lists]);
  const [reason, setReason] = useState(r0);
  const [day, setDay] = useState(todayFn());
  const [time, setTime] = useState(nowHM());
  const [note, setNote] = useState('');
  const pm = seatMap(state);
  const open = openMoves(state.weaponLog);
  const ps = pids.map((id) => pm.get(id)).filter(Boolean) as Person[];
  const go = ps.filter((p) => p.weapon && !open.has(p.id));
  const noW = ps.filter((p) => !p.weapon);
  const already = ps.filter((p) => p.weapon && open.has(p.id));
  const ok = !!reason.trim() && !!normTime(time) && go.length > 0;
  const miss = !go.length
    ? 'Κανένα όπλο για έξοδο'
    : missingOf([
        ['Λόγος', reason.trim()],
        ['Ώρα', normTime(time)],
      ]);
  const save = async () => {
    if (!ok) return;
    if (
      !(await run(
        { t: 'weaponOut', pids: go.map((p) => p.id), reason, day, time: normTime(time) as string, note },
        false,
      ))
    )
      return;
    toast({
      text:
        'Έξοδος όπλων (' +
        reason.trim().toUpperCase() +
        ') ' +
        normTime(time) +
        ': ' +
        (go.length === 1 ? rkShort(go[0]) : go.length + ' όπλα'),
      actions: [undoMark()],
    });
    onDone?.(reason.trim().toUpperCase());
    onClose();
  };
  return {
    lists: state.settings.lists,
    reasons,
    reason,
    setReason,
    day,
    setDay,
    time,
    setTime,
    note,
    setNote,
    go,
    noW,
    already,
    ok,
    miss,
    save,
    names: namesOf,
  };
}

/** What `useWeaponOut` returns. */
export type WeaponOut = ReturnType<typeof useWeaponOut>;
