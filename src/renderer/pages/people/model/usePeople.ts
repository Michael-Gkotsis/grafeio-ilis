// State of the «Δυναμολόγιο» list: search, the route filters, the shown day, the rows and the dialogs.
// Purpose: `usePeople`, the hooks of the list, in the order the screen always called them.
// Does NOT: draw anything (ui/) or hold the rules (model/view.ts).
// Owner layer: renderer/pages/people. Why: moved verbatim from screens/people.ts (Phase 6); hook order, memo
//   dependencies and the identity of the callbacks (`open`, `matches`, `listFor`) are unchanged: the rows are memo
//   components in a VirtualList and a new callback would redraw all ~240 of them.
// Covering test: test/screens-main.test.ts, test/perf.test.ts, test/people-page-view.test.ts.
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { addDays } from '../../../../shared/dates';
import { platoonShort, platoonsOf, unitOf, type Person } from '../../../../shared/domain';
import { noteIndex } from '../../../../shared/notes';
import { strengthAt } from '../../../../shared/rules';
import { filterStatus, type RosterFilter } from '../../../../shared/rosterLists';
import { collator, normGreek } from '../../../../shared/text';
import { UNIT } from '../../../../shared/unit';
import { searchPeople } from '../../../entities/person';
import { useRowH } from '../../../shared/lib/prefs';
import { useNowMin } from '../../../shared/lib/clock';
import { useNav, useOpenFrom, useStore } from '../../../shared/model';
import { useMedia, useToast, useViewportHeight } from '../../../shared/ui';
import {
  DEF_SORT,
  countFilters,
  inPlace,
  passesFilter,
  roomCounts,
  sortRows,
  statusMap,
  type Filt,
  type SortState,
} from './view';
import { peopleActions } from './peopleActions';

/**
 * The first hooks of the list: store, nav, toast, phone width, search, note marks, the route filters and the
 * dialog switches. Split out of `usePeople` only to keep it short; they run first, in the same order as before.
 */
function usePeopleBase() {
  const { state, today, run, undoMark } = useStore();
  const nav = useNav();
  const toast = useToast();
  const mobile = useMedia('(max-width: 767px)');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  // ένδειξη «έχει σημειώσεις» δίπλα στο όνομα
  const marks = useMemo(() => noteIndex(state.notes, today), [state.notes, today]);
  // φίλτρα στα params της οθόνης, ώστε να τα θυμάται όταν γυρνάς (Shell)
  const filter: string = nav.params.filter || 'all';
  const unitP: string = nav.params.unit || 'all';
  // ουλαμός που θυμόταν η οθόνη αλλά δεν υπάρχει πια (άλλαξε όνομα στις Ρυθμίσεις): όλη η Ίλη
  const unit =
    unitP === 'all' || platoonsOf(state.settings).some((u) => platoonShort(u.name) === unitP) ? unitP : 'all';
  const room: number | null = nav.params.room ?? null;
  const date: string = nav.params.pdate && nav.params.pdate >= today ? nav.params.pdate : today;
  const sort: SortState = nav.params.sort || DEF_SORT;
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<false | 'one' | 'many'>(false);
  const [xl, setXl] = useState(false);
  // από το τέλος της Νέας ΕΣΣΟ: ανοίγει κατευθείαν η γρήγορη εισαγωγή (και από το Ctrl+K)
  useEffect(() => {
    if (nav.params.quickAdd) {
      setAdding(nav.params.quickAdd === 'one' ? 'one' : 'many');
      nav.set({ quickAdd: undefined });
    }
  }, [nav.params.quickAdd]);
  const route = { filter, unit, room, date, sort };
  const dialogs = { saving, setSaving, adding, setAdding, xl, setXl };
  return { state, today, run, undoMark, nav, toast, mobile, q, setQ, dq, marks, ...route, ...dialogs };
}

/**
 * Who is shown: the platoons, the days, the statuses of the shown day, the filter callbacks, the chip counts, the
 * rooms, the saved-list counts and the sorted rows. `matches` and `listFor` keep their dependency lists, because the
 * saved-list counts and the rows depend on their identity.
 */
function useRoster(b: ReturnType<typeof usePeopleBase>) {
  const { state, today, dq, filter, unit, room, date, sort } = b;
  // ουλαμοί από τις Ρυθμίσεις › Θάλαμοι και ουλαμοί (προεπιλογή 1–4 → 1ος, 5–8 → 2ος)
  const UNITS = useMemo(
    () => [
      { value: 'all', label: UNIT().all },
      ...platoonsOf(state.settings).map((u) => ({
        value: platoonShort(u.name),
        label: platoonShort(u.name),
        tip: u.rooms.length ? `Θάλαμοι ${u.rooms.join(', ')}` : 'Χωρίς θαλάμους',
      })),
    ],
    [state.settings.rooms],
  );
  const days = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(today, i)), [today]);
  const active = useMemo(() => state.people.filter((p) => p.active), [state.people]);
  const views = state.settings.views || [];
  const lists = state.settings.lists;
  const withSt = filter === 'leave' || filter === 'pun';
  // σήμερα: όποιος γύρισε από άδεια ως τώρα είναι πάλι παρών (Michael, 20/10), με την ίδια στιγμή που μετρά το «Σήμερα»
  const nowM = useNowMin();
  const at = date === today ? strengthAt(state.rules, date, today, nowM) : -1;
  // ... και ο εξοδούχος/ΔΝ με την ώρα, όπως η Δύναμη (αλλιώς δεν θα συμφωνούσαν οι Παρόντες του «Σήμερα» με αυτή τη λίστα)
  const ssOf = useMemo(() => statusMap(active, state, date, today, at), [active, state, date, today, at]);
  const place = (p: Person, f: Filt) => inPlace(p, f, (x) => unitOf(x, state.settings));
  const matches = useCallback(
    (p: Person, f: Filt) => place(p, f) && passesFilter(p, f.filter, ssOf.get(p.id) || [], state.settings.lists),
    [ssOf, state.settings.rooms],
  );
  const listFor = useCallback(
    (f: Filt, text: string) =>
      (f.filter === 'inactive'
        ? state.people.filter((p) => !p.active).sort((a, c) => collator.compare(a.last, c.last))
        : searchPeople(state.people, text)
      ).filter((p) => matches(p, f)),
    [state.people, matches],
  );
  // πόσοι ταιριάζουν σε κάθε φίλτρο (στον επιλεγμένο ουλαμό/θάλαμο), για να φαίνεται πριν πατήσεις
  const counts = useMemo(
    () => countFilters(state.people, ssOf, (p) => place(p, { unit, room, filter: 'all' })),
    [state.people, ssOf, unit, room, state.settings.rooms],
  );
  const rooms = useMemo(() => roomCounts(active), [active]);
  const viewN = useMemo(() => views.map((v) => listFor(v, v.q).length), [views, listFor]);
  const curView = views.find(
    (v) => v.unit === unit && v.room === room && v.filter === filter && normGreek(v.q) === normGreek(dq.trim()),
  );
  const rows = useMemo(
    () => sortRows(listFor({ unit, room, filter }, dq), sort, !!dq, lists),
    [dq, filter, unit, room, sort, listFor, lists],
  );
  const total = active.length;
  return { UNITS, days, active, total, views, lists, withSt, ssOf, counts, rooms, viewN, curView, rows };
}

/** The hooks of the «Δυναμολόγιο» list, in the order the screen always called them. */
export function usePeople() {
  const b = usePeopleBase();
  const r = useRoster(b);
  const open = useOpenFrom(r.rows);
  const height = useViewportHeight(b.mobile ? 380 : 350);
  const rowH = useRowH(40, 32);
  const narrow = useMedia('(max-width: 1279px)');
  const actions = peopleActions({ ...b, ...r });
  const stOf = (p: Person) => (r.withSt ? filterStatus(b.filter as RosterFilter, r.ssOf.get(p.id) || []) : undefined);
  return { ...b, ...r, open, height, rowH, narrow, stOf, ...actions };
}
