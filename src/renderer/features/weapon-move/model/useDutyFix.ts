// State, save and reset of the «Διόρθωση ώρας ένοπλης υπηρεσίας» dialog.
// Purpose: `useDutyFix` holds the draft times of one armed number (Michael, 24/10: the times come from the duties,
//   here they change for this number, with a reason); `save` runs `fixDutyWeapon`, `reset` goes back to the automatic times.
// Does NOT: draw anything (ui/DutyFixDialog.tsx).
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/screens-dialogs-forms.test.ts (weaponMoves-DutyFixDialog), test/weapons.test.ts.
import { useState } from 'react';
import { rkShort } from '../../../entities/person';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { calDay, hmOf, stampMin, stampOf, type ArmRow } from '../../../../shared/armed';
import { normTime } from '../../../../shared/hours';
import { seatMap } from '../../../../shared/rules';

/** Props of `DutyFixDialog`. */
export interface DutyFixDialogProps {
  /** The armed number (one row of the duty weapons of the day). */
  row: ArmRow;
  onClose: () => void;
}

/** State of the «Διόρθωση ώρας ένοπλης υπηρεσίας» dialog. */
export function useDutyFix({ row, onClose }: DutyFixDialogProps) {
  const { state, run, undoMark } = useStore();
  const toast = useToast();
  const pm = seatMap(state);
  const p = pm.get(row.who);
  const owner = pm.get(row.owner);
  const [x, setX] = useState(() => ({
    od: calDay(row.day, row.out),
    ot: hmOf(row.out),
    id: calDay(row.day, row.in),
    it: hmOf(row.in),
    why: row.fix?.why || '',
  }));
  const ot = normTime(x.ot);
  const it = normTime(x.it);
  const out = ot ? x.od + ' ' + ot : '';
  const inn = it ? x.id + ' ' + it : '';
  const set = (k: string) => (v: string) => setX((o) => ({ ...o, [k]: v }));
  const why = !ot
    ? 'Λείπει: Ώρα εξόδου'
    : !it
      ? 'Λείπει: Ώρα εισόδου'
      : stampMin(row.day, inn) < stampMin(row.day, out)
        ? 'Η είσοδος είναι πριν την έξοδο'
        : !x.why.trim()
          ? 'Λείπει: Λόγος διόρθωσης'
          : out === stampOf(row.day, row.out) &&
              inn === stampOf(row.day, row.in) &&
              x.why.trim() === (row.fix?.why || '')
            ? 'Άλλαξε μια ώρα'
            : '';
  const done = (text: string) => {
    toast({ text, actions: [undoMark()] });
    onClose();
  };
  const save = async () => {
    if (
      !why &&
      (await run({ t: 'fixDutyWeapon', day: row.day, post: row.post, n: row.n, out, in: inn, why: x.why }, false))
    )
      done('Διορθώθηκαν οι ώρες: ' + row.reason + (p ? ' ' + rkShort(p) : ''));
  };
  const reset = async () => {
    if (await run({ t: 'fixDutyWeapon', day: row.day, post: row.post, n: row.n, why: '', reset: true }, false))
      done('Οι ώρες γύρισαν στο αυτόματο: ' + row.reason + (p ? ' ' + rkShort(p) : ''));
  };
  return { p, owner, x, set, why, save, reset };
}

/** What `useDutyFix` returns. */
export type DutyFix = ReturnType<typeof useDutyFix>;
