// State of the «Ποιος κάνει τι» tab: search, filters, the cells of every soldier and the clicks that change them.
// Purpose: `useWhoDoes`, the hooks of `WhoDoes` in the order the tab always called them.
// Does NOT: draw anything (ui/WhoDoes.tsx, ui/WhoRow.tsx) or hold the pure rules (model/whoView.ts).
// Owner layer: renderer/pages/guard. Why: moved verbatim from screens/whodoes.ts (Phase 6); hook order is unchanged:
//   store, toast, search, deferred search, only, filter, column, unit, room, ask, people, cells, blocks, base,
//   counts, column counts, open, units, rooms, live ref, row actions, height.
// Covering test: test/screens-main.test.ts, test/perf.test.ts, test/guard-page-view.test.ts.
import { useMemo, useState } from 'react';
import type { ISODate } from '../../../../shared/dates';
import { dayName } from '../../../../shared/dates';
import { blocksOf, unitOf, type Person } from '../../../../shared/domain';
import { byRoomName } from '../../../../shared/rosterLists';
import { capCell, capCols, type CapCol } from '../../../../shared/rules';
import { useOpenFrom, useStore } from '../../../shared/model';
import { useToast, useViewportHeight } from '../../../shared/ui';
import { useWhoActions, useWhoCounts, useWhoFilters, useWhoLists } from './useWhoParts';
import { dayHint, kindsOf, matchesQuery, ownOf } from './whoView';

/** What a click on an «auto» cell asks before it is done. */
export interface WhoAsk {
  p: Person;
  col: CapCol;
  why: string;
}

/**
 * Everything the tab reads and calls.
 * @param date ISODate, the day on screen (the day hint is for this day)
 * @param pid the soldier the tab opens with (from a name in «Δεν μπαίνουν»), or `null` for everybody
 * @returns the search and filters (with setters), the rows and counters, the `act` callbacks for the memo rows, the
 *   `ask` dialog state and `clear`
 */
export function useWhoDoes(date: ISODate, pid?: number | null) {
  const { state, run, today, undoMark } = useStore();
  const toast = useToast();
  const filters = useWhoFilters(pid);
  const { dq, only, filter, colF, unit, room } = filters;
  const [ask, setAsk] = useState<WhoAsk | null>(null);
  const lists = state.settings.lists;
  const cols = capCols(state.settings);
  const whodHead = cols.some((c) => c.short.length > 10) ? 86 : 60; // header height: up to 3 lines of name + «όχι Ν»
  const grid = 'minmax(190px,1.6fr) repeat(' + cols.length + ',minmax(80px,88px)) 212px 34px';
  const people = useMemo(() => state.people.filter((p) => p.active).sort(byRoomName), [state.people]);
  // All cells once per change (not on every key of the search).
  const cells = useMemo(
    () => new Map(people.map((p) => [p.id, cols.map((c) => capCell(state, p, c))])),
    [people, cols, state.caps, state.settings],
  );
  const kindOf = (p: Person) => kindsOf(cells.get(p.id)!, p, ownOf(state.caps, p));
  // The status of the day on the Υπηρεσίες screen: information only, nothing changes here.
  const bl = useMemo(
    () => (blocksOf(state.settings) || state.settings.blocks).filter((b) => !b.hidden),
    [state.settings],
  );
  const hintOf = (p: Person) => dayHint(state, p, date, dayName(date, today), bl);
  const place = (p: Person) =>
    (unit === 'all' || unitOf(p, state.settings) === unit) && (room == null || p.room === room);
  const ci = colF ? cols.findIndex((c) => c.key === colF) : -1;
  const base = useMemo(
    () => people.filter((p) => (only == null || p.id === only) && place(p) && matchesQuery(p, dq)),
    [people, unit, room, dq, only, state.settings.rooms],
  );
  const { counts, colN } = useWhoCounts(base, cells, cols, kindOf);
  const rows = base.filter((p) => (filter === 'all' || kindOf(p)[filter]) && (ci < 0 || !cells.get(p.id)![ci].on));
  const openP = useOpenFrom(rows);
  const { UNITS, rooms } = useWhoLists(state.settings, people);
  const { setCap, act } = useWhoActions(run, toast, undoMark, setAsk);
  const height = useViewportHeight(400);
  const onlyP = only != null ? people.find((p) => p.id === only) : undefined;
  const colLbl = ci >= 0 ? 'όχι ' + cols[ci].label.toLowerCase() : null;
  return {
    state,
    ...filters,
    ask,
    setAsk,
    lists,
    cols,
    whodHead,
    grid,
    people,
    cells,
    hintOf,
    ci,
    counts,
    colN,
    rows,
    openP,
    UNITS,
    rooms,
    setCap,
    act,
    height,
    onlyP,
    colLbl,
    ownOf: (p: Person) => ownOf(state.caps, p),
  };
}

/** What {@link useWhoDoes} returns. */
export type WhoModel = ReturnType<typeof useWhoDoes>;
