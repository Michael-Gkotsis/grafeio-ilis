// State of the «Στελέχη» screen: search box, shown day, the dialogs, the drag order and the Excel export.
// Purpose: `useCadre`, the hooks of `CadreScreen`, in the order the screen always called them.
// Does NOT: draw anything (ui/) or hold the rules (model/view.ts).
// Owner layer: renderer/pages/cadre. Why: moved verbatim from screens/cadre.ts (Phase 6); hook order and memo
//   dependencies are unchanged.
// Covering test: test/screens-main.test.ts, test/cadre-page-view.test.ts.
import { useDeferredValue, useMemo, useState } from 'react';
import type { Cadre, CadreAbs } from '../../../../shared/domain';
import { orderedCadre, type CadreFilter } from '../../../../shared/cadre';
import { addDays } from '../../../../shared/dates';
import { noteIndex } from '../../../../shared/notes';
import type { Sig } from '../../../../shared/sigs';
import { useNav, useStore } from '../../../shared/model';
import { useToast } from '../../../shared/ui';
import { exportCadreXl } from './exportCadre';
import { activeParts, cadreStatusMap, cadreSub, countsPerFilter, dateLabel, filterRows, reorderIds } from './view';

/**
 * The first hooks of the screen: store, nav, toast, search, the day, the dialogs, the member list and the note marks.
 * Split out of `useCadre` only to keep it short; they run first, in the same order as before.
 */
function useCadreBase() {
  const { state, today, run } = useStore();
  const nav = useNav();
  const toast = useToast();
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const filter: CadreFilter = nav.params.filter || 'all';
  const date: string = nav.params.cdate || today;
  const days = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(today, i)), [today]);
  const [edit, setEdit] = useState<Partial<Cadre> | null>(null);
  const [stFor, setStFor] = useState<{ c: Cadre; abs?: CadreAbs } | null>(null);
  const [xl, setXl] = useState(false);
  const all = useMemo(() => orderedCadre(state.cadreList), [state.cadreList]);
  const marks = useMemo(() => noteIndex(state.notes, today), [state.notes, today]);
  const store = { state, today, run, nav, toast };
  const search = { q, setQ, dq, filter, date, days };
  return { ...store, ...search, edit, setEdit, stFor, setStFor, xl, setXl, all, marks };
}

/**
 * Everything the screen reads and calls. The filter and the day come from `nav.params` (`filter`, `cdate`); the
 * member's card is a side card of the Shell, so only its id (`card`) is read here.
 * @returns the store `state` and `today`, `nav`, search `q`/`dq`, `date`, `filter`, `days`, the dialogs `edit`/`stFor`,
 *   `xl` (export running), `all`, `marks`, the drag state `drag`/`over`, `stOf`, `counts`, `rows`, `active`, `sub`,
 *   `dateLbl`, `parts` and the handlers
 */
export function useCadre() {
  const b = useCadreBase();
  const { state, today, run, nav, toast, setQ, dq, filter, date, setXl, all } = b;
  // Manual order (hierarchy): drag a row or Alt+↑/↓. The position counts in the whole list, also under a filter.
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const move = (id: string, to: string, after: boolean) => {
    if (id === to) return;
    run({ t: 'orderCadre', ids: reorderIds(all, id, to, after) }, false);
  };
  const end = () => {
    setDrag(null);
    setOver(null);
  };
  // `state` is read whole by `cadreStatusOn`; only `cadreAbs` and `settings` can change a status, so the deps stay as
  // they were (not `state`): the map must not rebuild on every unrelated state change.
  const stOf = useMemo(() => cadreStatusMap(all, state, date), [all, state.cadreAbs, state.settings, date]);
  const counts = useMemo(() => countsPerFilter(all, stOf), [all, stOf]);
  const rows = filterRows(all, filter, stOf, dq);
  const active = counts.all || 0;
  const setFilter = (f: CadreFilter) => nav.set({ filter: f === 'all' ? undefined : f });
  const clear = () => {
    setQ('');
    nav.set({ filter: undefined });
  };
  const dateLbl = dateLabel(date, today);
  const exportXl = (sigs?: Sig[]) => exportCadreXl({ date, today, all, toast, setXl }, sigs);
  // The member's card is a side card of the Shell (above every screen); here only the selected row and the ↑/↓ order.
  const card: string | null = nav.params.cadre ?? null;
  const openCard = (id: string) =>
    nav.openCadre(
      id,
      rows.map((r) => r.id),
    );
  const sub = cadreSub(active, counts, dateLbl);
  const parts = activeParts(filter, dateLbl, dq);
  const dragging = { drag, setDrag, over, setOver, move, end };
  const view = { stOf, counts, rows, active, sub, parts, dateLbl, card, openCard };
  return { ...b, ...dragging, ...view, setFilter, clear, exportXl };
}
