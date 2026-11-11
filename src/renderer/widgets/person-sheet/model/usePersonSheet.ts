// State of the soldier sheet.
// Purpose: `usePersonSheet` holds the store, the tab, the four dialogs' flags and the Up/Down/PageUp/PageDown walk over the
//   list the sheet was opened from, for `PersonSheet`.
// Does NOT: draw anything or derive the texts (model/view.ts). Every hook of the sheet is called here, in the order the
//   sheet had them.
// Owner layer: renderer/widgets/person-sheet. Why: moved verbatim from screens/people.ts (Phase 5.3c).
// Covering test: test/people.test.ts, test/sheet-nav.test.ts.
import { useEffect, useMemo, useState } from 'react';
import type { Status } from '../../../../shared/domain';
import { personMap } from '../../../../shared/rules';
import { collator } from '../../../../shared/text';
import { useNowMin } from '../../../shared/lib/clock';
import { useNav, useStore } from '../../../shared/model';
import { useSheetNav, useToast } from '../../../shared/ui';

/** Props of `PersonSheet`. */
export interface PersonSheetProps {
  /** Id of the soldier shown. */
  pid: number;
  /** Ids of the list the sheet was opened from (Δυναμολόγιο with its filters, Οπλισμός, Εξοδούχοι…); everyone in strength, A-Z, when absent. */
  list?: number[] | null;
  /** Called with the id to show next when Up/Down/PageUp/PageDown move through the list. */
  onMove: (id: number) => void;
  onClose: () => void;
}

/** The state of the sheet and the store pieces its parts use. */
export function usePersonSheet({ pid, list, onMove }: PersonSheetProps) {
  const { state, today, run } = useStore();
  const nav = useNav();
  const toast = useToast();
  const p = personMap(state.people).get(pid);
  const [edit, setEdit] = useState(false);
  const [fix, setFix] = useState<Status | null>(null);
  const [times, setTimes] = useState<Status | null>(null);
  const [end, setEnd] = useState<Status | null>(null);
  const [tab, setTab] = useState('info');
  const order: number[] = useMemo(
    () =>
      list ||
      state.people
        .filter((x) => x.active || x.id === pid)
        .sort((a, b) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first))
        .map((x) => x.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, state.people],
  );
  const busy = edit || !!times || !!end;
  const { at, n: total, move } = useSheetNav(order, pid, onMove, busy);
  const nowM = useNowMin();
  useEffect(() => {
    setEdit(false);
    setTimes(null);
    setEnd(null);
    setFix(null);
    const b = document.querySelector('.ui-sheet__body');
    if (b) b.scrollTop = 0;
  }, [pid]);
  return {
    state,
    today,
    run,
    nav,
    toast,
    p,
    edit,
    setEdit,
    fix,
    setFix,
    times,
    setTimes,
    end,
    setEnd,
    tab,
    setTab,
    nowM,
    at,
    total,
    move,
  };
}

/** What `usePersonSheet` returns. */
export type PersonSheetModel = ReturnType<typeof usePersonSheet>;
