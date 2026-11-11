// State and actions of the «Διόρθωση επιστροφής» dialog.
// Purpose: `useBackFix` holds the mode (comes back / stays), the day, the time and the reason, the check of them, and the
//   save and «Πίσω στο αυτόματο» writes, for `BackFixDialog`.
// Does NOT: draw anything. Every hook of the dialog is called here, in the order the dialog had them.
// Owner layer: renderer/features/back-fix. Why: moved verbatim from screens/outsPlan.ts (Phase 5.3c part 2).
// Covering test: test/outs-*.test.ts, test/dialog-cases.test.ts.
import { useState } from 'react';
import { addDays } from '../../../../shared/dates';
import { normTime } from '../../../../shared/hours';
import type { Back } from '../../../../shared/returns';
import { rkShort } from '../../../entities/person';
import { useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';

/** The state of the dialog and its actions. @param date ISODate, the day of the list the person was picked from */
export function useBackFix(b: Back, date: string, onClose: () => void) {
  const { state, run, undoMark } = useStore();
  const toast = useToast();
  const old = state.backFix?.find((f) => f.pid === b.p.id && f.day === date);
  const [mode, setMode] = useState<'at' | 'stay'>(old?.stay ? 'stay' : 'at');
  const first = b.st.type === 'DN' ? addDays(date, 1) : date;
  const [day, setDay] = useState(old?.at?.day || (!b.r.pending && !b.r.open ? b.r.day : first));
  const [time, setTime] = useState(old?.at?.time || b.r.time || '06:00');
  const [why, setWhy] = useState(old?.why || '');
  const t = normTime(time);
  const problem = !why.trim()
    ? 'Γράψε τον λόγο της διόρθωσης'
    : mode === 'at' && !t
      ? 'Η ώρα επιστροφής δεν είναι σωστή'
      : mode === 'at' && day < first
        ? 'Η επιστροφή είναι πριν από την έξοδο'
        : '';
  const save = async () => {
    if (
      await run(
        {
          t: 'setBackFix',
          pid: b.p.id,
          day: date,
          ...(mode === 'stay' ? { stay: true } : { at: { day, time: t! } }),
          why,
        },
        false,
      )
    ) {
      onClose();
      toast({ text: 'Διόρθωση επιστροφής ' + rkShort(b.p), actions: [undoMark()] });
    }
  };
  const del = async () => {
    if (old && (await run({ t: 'delBackFix', id: old.id }, false))) {
      onClose();
      toast({ text: 'Η επιστροφή ' + rkShort(b.p) + ' πάλι βγαίνει αυτόματα', actions: [undoMark()] });
    }
  };

  return { old, mode, setMode, day, setDay, time, setTime, why, setWhy, first, problem, save, del };
}

/** What `useBackFix` returns. */
export type BackFixModel = ReturnType<typeof useBackFix>;
