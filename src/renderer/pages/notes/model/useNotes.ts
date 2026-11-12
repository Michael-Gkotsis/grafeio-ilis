// State of the «Σημειώσεις» screen: the search box (also filled from Ctrl+K), the note being edited and the lists.
// Purpose: `useNotes`, the hooks of `NotesScreen`, in the order the screen always called them.
// Does NOT: draw anything (ui/) or hold the filter rules (model/view.ts).
// Owner layer: renderer/pages/notes. Why: moved verbatim from screens/notes.ts (Phase 6); hook order is unchanged.
// Covering test: test/notes-view.test.ts, test/screens-main.test.ts.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from '../../../../shared/domain';
import { dueCount, noteGroups, type NoteFilter } from '../../../../shared/notes';
import { useNoteDraft, useOpenWho } from '../../../features/note-compose';
import { useNav, useStore } from '../../../shared/model';
import { countByFilter, filterNotes, notesSub, openPeople, sortDone } from './view';

/**
 * Everything the screen reads and calls. The filter, the person and the first search text come from `nav.params`
 * (`nfilter`, `nwho`, `nq`), which Ctrl+K and the person card set.
 * @returns the notes, `filter`, `who`, `q` (typed) and `dq` (deferred), the counts, the people, the filtered `rows`,
 *   the groups `g`, the `done` order, `due`, the subtitle `sub` and the handlers `setFilter`, `clear`, `pickWho`
 */
export function useNotes() {
  const { state, today } = useStore();
  const nav = useNav();
  const notes = state.notes || [];
  const filter: NoteFilter = nav.params.nfilter || 'all';
  const who: string = nav.params.nwho || '';
  const [q, setQ] = useState<string>(nav.params.nq || '');
  const dq = useDeferredValue(q);
  // Ctrl+K opens the screen with a search text: copy it into the box once it differs.
  useEffect(() => {
    if (nav.params.nq != null && nav.params.nq !== q) setQ(nav.params.nq);
  }, [nav.params.nq]); // eslint-disable-line react-hooks/exhaustive-deps
  const [edit, setEdit] = useState<Note | null>(null);
  const draft = useNoteDraft();
  const compRef = useRef<HTMLDivElement>(null);
  const due = dueCount(notes, today);
  const open = notes.filter((n) => !n.done);
  const counts = useMemo(() => countByFilter(notes), [notes]);
  const people = useMemo(
    () => openPeople(state, notes),
    [notes, state.people, state.cadreList], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rows = useMemo(
    () => filterNotes(state, notes, filter, who, dq),
    [notes, filter, who, dq, state.people, state.cadreList], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const g = useMemo(() => noteGroups(rows, today), [rows, today]);
  const done = filter === 'done' ? sortDone(rows) : [];
  const openWho = useOpenWho();
  const setFilter = (f: NoteFilter) => nav.set({ nfilter: f === 'all' ? undefined : f, nwho: undefined });
  const pickWho = (key: string) => nav.set({ nwho: who === key ? undefined : key, nfilter: undefined });
  const filtered = filter !== 'all' || !!who || !!dq.trim();
  const clear = () => {
    setQ('');
    nav.set({ nfilter: undefined, nwho: undefined, nq: undefined });
  };
  const sub = notesSub(open.length, due);
  return {
    notes,
    filter,
    who,
    q,
    setQ,
    edit,
    setEdit,
    draft,
    compRef,
    due,
    open,
    counts,
    people,
    rows,
    g,
    done,
    openWho,
    setFilter,
    pickWho,
    filtered,
    clear,
    sub,
  };
}
