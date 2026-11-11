// State and actions of the Ημερήσια Διαταγή tab.
// Purpose: `useHd`, all hooks of `HdTab` in the order the screen always called them, the document being edited and the
//   actions «Βγάλε Word» / «Εκτύπωση», «Ξανά από τα δεδομένα» and «Δικό μου πρότυπο Word…».
// Does NOT: draw anything (ui/HdTab.tsx does) or fill the document (shared/hd.ts `hdAuto` does).
// Owner layer: renderer/widgets/hd. Why: moved verbatim from screens/hd.ts (Phase 6.0). It is a .tsx because the toasts
//   carry a little markup.
// Covering test: test/screens-main.test.ts, test/hd.test.ts.
import { useMemo, useState } from 'react';
import type { ISODate } from '../../../../shared/dates';
import { hdAuto, hdCadreNames, hdDefaultDay, hdTags, type HdDoc } from '../../../../shared/hd';
import { sigsSaved } from '../../../../shared/sigs';
import { useNav, useStore } from '../../../shared/model';
import { useMedia, useToast } from '../../../shared/ui';
import { hdActions } from './hdActions';
import { hdDays } from './view';

/** All the state, derived data and actions `HdTab` draws from. */
export type HdModel = ReturnType<typeof useHd>;

export function useHd() {
  const { state, today, run, undoMark } = useStore();
  const nav = useNav();
  const toast = useToast();
  const narrow = useMedia('(max-width: 1279px)');
  const date: ISODate = nav.params.hdDate || hdDefaultDay(today);
  const [edit, setEdit] = useState<{ date: ISODate; doc: HdDoc } | null>(null);
  const [busy, setBusy] = useState(false);
  const [prev, setPrev] = useState(false);
  const [sigs, setSigs] = useState(false);
  const saved = state.hd?.[date];
  const auto = useMemo(
    () => hdAuto(state, date),
    [state.people, state.statuses, state.cadreList, state.cadreAbs, state.hkaiManual, state.settings, state.hd, date],
  );
  const doc: HdDoc = edit && edit.date === date ? edit.doc : saved || auto;
  const set = (p: Partial<HdDoc>) => setEdit({ date, doc: { ...doc, ...p } });
  const setSec = (k: 'ax' | 'op', i: number, l: string[]) => set({ [k]: doc[k].map((x, j) => (j === i ? l : x)) });
  const names = useMemo(() => hdCadreNames(state), [state.cadreList]);
  const sigList = sigsSaved(state.settings, 'hd');
  const tags = hdTags(state.settings, date, doc, sigList);
  const days = hdDays(today, date);
  const { go, again, pickTpl } = hdActions({ date, doc, saved, run, undoMark, toast, setEdit, setBusy });
  const dirty = !!edit && edit.date === date;
  return {
    state,
    today,
    run,
    nav,
    narrow,
    date,
    setEdit,
    busy,
    prev,
    setPrev,
    sigs,
    setSigs,
    saved,
    auto,
    doc,
    set,
    setSec,
    names,
    sigList,
    tags,
    days,
    go,
    again,
    pickTpl,
    tpl: state.settings.hdTpl,
    dirty,
  };
}
