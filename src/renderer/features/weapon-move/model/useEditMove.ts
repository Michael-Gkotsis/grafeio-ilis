// State, save and delete of the «Διόρθωση κίνησης όπλου» dialog.
// Purpose: `useEditMove` holds the draft of one weapon move (reason, exit, entry, note); `save` runs `editWeaponMove`
//   and `del` runs `deleteWeaponMove`, each with an undo toast.
// Does NOT: draw anything (ui/EditMoveDialog.tsx).
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/screens-dialogs-forms.test.ts (weaponMoves-EditMoveDialog), test/weapons.test.ts.
import { useMemo, useState } from 'react';
import { rkShort } from '../../../entities/person';
import { missingOf } from '../../../shared/lib/missingOf';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import type { WeaponMove } from '../../../../shared/domain';
import { normTime } from '../../../../shared/hours';
import { listOf } from '../../../../shared/ranks';
import { seatMap } from '../../../../shared/rules';

/** Props of `EditMoveDialog`. */
export interface EditMoveDialogProps {
  m: WeaponMove;
  onClose: () => void;
}

/** State of the «Διόρθωση κίνησης όπλου» dialog. */
export function useEditMove({ m, onClose }: EditMoveDialogProps) {
  const { state, run, undoMark } = useStore();
  const toast = useToast();
  const reasons = useMemo(() => listOf(state.settings.lists, 'weaponOut'), [state.settings.lists]);
  const [x, setX] = useState({
    reason: m.reason,
    outDay: m.outDay,
    outTime: m.outTime,
    inDay: m.inDay || '',
    inTime: m.inTime || '',
    inReason: m.inReason || '',
    note: m.note || '',
  });
  const p = seatMap(state).get(m.pid);
  const ok = !!x.reason.trim() && !!normTime(x.outTime) && (!x.inDay || !!normTime(x.inTime));
  const miss = missingOf([
    ['Λόγος', x.reason.trim()],
    ['Ώρα εξόδου', normTime(x.outTime)],
    ['Ώρα εισόδου', !x.inDay || normTime(x.inTime)],
  ]);
  const save = async () => {
    if (!ok) return;
    const patch = {
      reason: x.reason,
      outDay: x.outDay,
      outTime: normTime(x.outTime) as string,
      note: x.note,
      ...(x.inDay ? { inDay: x.inDay, inTime: normTime(x.inTime) as string, inReason: x.inReason } : { inDay: '' }),
    };
    if (await run({ t: 'editWeaponMove', id: m.id, patch }, false)) {
      toast({ text: 'Διορθώθηκε η κίνηση' + (p ? ' ' + rkShort(p) : ''), actions: [undoMark()] });
      onClose();
    }
  };
  const del = async () => {
    if (await run({ t: 'deleteWeaponMove', id: m.id }, false)) {
      toast({ text: 'Σβήστηκε η κίνηση' + (p ? ' ' + rkShort(p) : ''), actions: [undoMark()] });
      onClose();
    }
  };
  const set = (k: string) => (v: string) => setX((o) => ({ ...o, [k]: v }));
  return { lists: state.settings.lists, reasons, x, setX, p, ok, miss, save, del, set };
}

/** What `useEditMove` returns. */
export type EditMove = ReturnType<typeof useEditMove>;
