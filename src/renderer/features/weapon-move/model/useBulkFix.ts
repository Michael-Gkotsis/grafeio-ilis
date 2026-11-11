// State and save of the «Διόρθωση λόγου/ώρας» dialog for the ticked moves, and its 1-9 reason keys.
// Purpose: `useBulkFix` holds the new reason and the optional new exit time (Michael, 24/10: one reason with one click or
//   a 1-9 key, one command, one undo); the effect listens to keys 1-9 while no text field has the focus.
// Does NOT: draw anything (ui/BulkFixDialog.tsx). The keys are a frozen contract (CLAUDE.md, rule 3): do not change them.
// Owner layer: renderer/features/weapon-move. Why: moved verbatim from screens/weaponMoves.ts (Phase 5.3b).
// Covering test: test/screens-dialogs-forms.test.ts (weaponMoves-BulkFixDialog), test/weapons.test.ts.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../shared/model';
import { typingText } from '../../../shared/lib/typing';
import { useToast } from '../../../shared/ui';
import { dm, nowHM, today as todayFn } from '../../../../shared/dates';
import type { WeaponMove } from '../../../../shared/domain';
import { normTime } from '../../../../shared/hours';
import { listOf } from '../../../../shared/ranks';
import { seatMap } from '../../../../shared/rules';

/** Props of `BulkFixDialog`. */
export interface BulkFixDialogProps {
  /** Ids of the weapon moves to change. */
  ids: string[];
  onClose: () => void;
  onDone?: () => void;
}

/** Why the dialog cannot save yet; empty when it can. */
function bulkFixMiss(ms: WeaponMove[], rs: string, timeOn: boolean, t: string | null, late: WeaponMove[]): string {
  return !ms.length
    ? 'Καμία κίνηση'
    : !rs && !timeOn
      ? 'Διάλεξε τον νέο λόγο ή άλλαξε την ώρα εξόδου'
      : timeOn && !t
        ? 'Λείπει: Ώρα εξόδου'
        : late.length
          ? 'Η είσοδος είναι πριν τη νέα έξοδο'
          : '';
}

/** The undo toast: how many moves changed and what changed. */
function bulkFixText(n: number, rs: string, timeOn: boolean, day: string, t: string | null): string {
  return (
    'Διορθώθηκαν ' +
    n +
    (n === 1 ? ' κίνηση' : ' κινήσεις') +
    ': ' +
    [rs && 'λόγος ' + rs, timeOn && 'έξοδος ' + dm(day) + ' ' + t].filter(Boolean).join(', ')
  );
}

/** 1-9 pick a reason while no text field has the focus (frozen contract: CLAUDE.md, rule 3). */
function useReasonKeys(reasons: string[], pick: (r: string) => void) {
  // 1-9 διαλέγουν λόγο όταν δεν γράφεις σε πεδίο
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        typingText(document.activeElement) ||
        !/^[1-9]$/.test(e.key) ||
        !reasons[+e.key - 1]
      )
        return;
      e.preventDefault();
      pick(reasons[+e.key - 1]);
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [reasons]);
}

/** State of the «Διόρθωση λόγου/ώρας» dialog. */
export function useBulkFix({ ids, onClose, onDone }: BulkFixDialogProps) {
  const { state, run, undoMark } = useStore();
  const toast = useToast();
  const reasons: string[] = useMemo(() => listOf(state.settings.lists, 'weaponOut'), [state.settings.lists]);
  const pm = seatMap(state);
  const ms: WeaponMove[] = (state.weaponLog || []).filter((m) => ids.includes(m.id));
  const [reason, setReason] = useState('');
  const [timeOn, setTimeOn] = useState(false);
  const [day, setDay] = useState(ms[0]?.outDay || todayFn());
  const [time, setTime] = useState(ms[0]?.outTime || nowHM());
  const t = normTime(time);
  const rs = reason.trim().toUpperCase();
  const late = timeOn && t ? ms.filter((m) => !!m.inDay && m.inDay + ' ' + (m.inTime || '') < day + ' ' + t) : [];
  const miss = bulkFixMiss(ms, rs, timeOn, t, late);
  const pick = (r: string) => {
    setReason(r);
    requestAnimationFrame(() =>
      (document.querySelector('.ui-dialog__foot .ui-btn--default:not(:disabled)') as HTMLElement | null)?.focus(),
    );
  };
  useReasonKeys(reasons, pick);
  const save = async () => {
    if (miss) return;
    const patch = { ...(rs ? { reason: rs } : {}), ...(timeOn ? { outDay: day, outTime: t as string } : {}) };
    if (!(await run({ t: 'editWeaponMoves', ids: ms.map((m) => m.id), patch }, false))) return;
    toast({ text: bulkFixText(ms.length, rs, timeOn, day, t), actions: [undoMark()] });
    onDone?.();
    onClose();
  };
  return {
    lists: state.settings.lists,
    pm,
    ms,
    reasons,
    reason,
    setReason,
    timeOn,
    setTimeOn,
    day,
    setDay,
    time,
    setTime,
    t,
    rs,
    late,
    miss,
    pick,
    save,
  };
}

/** What `useBulkFix` returns. */
export type BulkFix = ReturnType<typeof useBulkFix>;
