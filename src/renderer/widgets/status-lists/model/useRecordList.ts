// State of the medical and penalty lists.
// Purpose: `useRecordList`, all hooks of `RecordList` in the order the screen always called them, and the derived data.
// Does NOT: draw anything (ui/RecordList.tsx does) or decide which statuses a tab lists (model/view.ts does).
// Owner layer: renderer/widgets/status-lists. Why: moved verbatim from screens/other.ts (Phase 6.0); the hook order
//   is part of the behaviour (render counts are compared with the old screen).
// Covering test: test/screens-main.test.ts, test/note-only.test.ts.
import { useDeferredValue, useMemo, useState } from 'react';
import { addDays } from '../../../../shared/dates';
import type { Status } from '../../../../shared/domain';
import { hasNoteKinds } from '../../../../shared/ranks';
import { personMap } from '../../../../shared/rules';
import { useNowMin } from '../../../shared/lib/clock';
import { useNav, useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { MED_TABS, PUN_TABS, medCounts, recordCounts, recordRows } from './view';

/** All the state and derived data `RecordList` draws from. */
export type RecordListModel = ReturnType<typeof useRecordList>;

/** @param mode 'med' for «Ιατρικά», 'pun' for the «Ποινές» tab of the ΗΚΑΙ. */
export function useRecordList(mode: 'med' | 'pun') {
  const { state, run, today, undoMark } = useStore();
  const toast = useToast();
  const nav = useNav();
  const pm = personMap(state.people);
  const now = useNowMin();
  const tabKey = mode === 'med' ? 'recTab' : 'punTab';
  const tab: string = (mode === 'med' ? MED_TABS : PUN_TABS).includes(nav.params[tabKey]) ? nav.params[tabKey] : mode;
  const [pq, setPq] = useState('');
  const dpq = useDeferredValue(pq);
  const medF: string = nav.params.medF || '';
  const chDay: string = nav.params.recDate || today; // «Μεταβολές ημέρας»: medical records that start or end that day
  const y = addDays(today, -1);
  const nl = state.settings.lists;
  const hasNotes = hasNoteKinds(nl);
  const list = useMemo(
    () => recordRows({ state, pm, mode, tab, today, now, query: dpq, medF, chDay }),
    [state.statuses, nl, tab, today, dpq, medF, mode, now, chDay],
  );
  const medCnt = useMemo(() => medCounts(state, pm, today, now), [state.statuses, today, state.settings.lists, now]);
  const { nMed, nNote, nPun } = recordCounts(state, pm, today, now, hasNotes);
  const [stop, setStop] = useState<Status | null>(null);
  const [end, setEnd] = useState<Status | null>(null);
  const [txt, setTxt] = useState<Status | null>(null);
  const [fix, setFix] = useState<Status | null>(null);
  const act = (fn: () => Promise<unknown>, text: string) => async () => {
    if (await fn()) toast({ text, actions: [undoMark()] });
  };
  return {
    mode,
    state,
    run,
    nav,
    today,
    pm,
    tab,
    pq,
    setPq,
    dpq,
    medF,
    chDay,
    y,
    nl,
    hasNotes,
    list,
    medCnt,
    nMed,
    nNote,
    nPun,
    stop,
    setStop,
    end,
    setEnd,
    txt,
    setTxt,
    fix,
    setFix,
    act,
  };
}
