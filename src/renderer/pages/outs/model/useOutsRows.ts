// The list of the «Εξοδούχοι» screen: filters, blocks, away people, rows and what changed.
// Purpose: `useOutsFilter` (the screen's own filter state) and `useOutsRows` (the memoised lists built from it).
// Does NOT: save anything or draw (outsActions.ts, ui/).
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/guard.ts (Phase 6); hook order is unchanged.
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import { useDeferredValue, useMemo, useState } from 'react';
import { searchPeople } from '../../../entities/person';
import type { ISODate } from '../../../../shared/dates';
import type { AppState, Person } from '../../../../shared/domain';
import { awayAtOut, awayNote } from '../../../../shared/outsStay';
import { outBlock } from '../../../../shared/rules';
import { filterOutRows, noteChangesOf, outDiffs, roomsOf, toChanges, type AwayMap, type OutDraft } from './view';

/** Filter chip, search text (and its deferred copy), the confirm dialog flag, the picked room and the sort. */
export function useOutsFilter() {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [confirm, setConfirm] = useState(false);
  const [room, setRoom] = useState<number | null>(null);
  const [sort, setSort] = useState('room');
  return { filter, setFilter, q, setQ, dq, confirm, setConfirm, room, setRoom, sort, setSort };
}

/** The inputs of {@link useOutsRows}. */
export interface RowsIn {
  state: AppState;
  date: ISODate;
  people: Person[];
  saved: OutDraft;
  draft: OutDraft;
  notes: Record<number, string>;
  savedNotes: Record<number, string>;
  filter: string;
  room: number | null;
  sort: string;
  dq: string;
}

/**
 * The room list, why each person cannot go out, who is on leave, the shown rows, and the changes against the stored
 * state (choices, notes, and the `outs` command form of the choices).
 */
export function useOutsRows(a: RowsIn) {
  const { state, date, people, saved, draft, notes, savedNotes, filter, room, sort, dq } = a;
  const roomList = useMemo(() => roomsOf(people), [people]);
  const dnSet = people.some((p) => p.dn); // once anybody has the right, only those can get ΔΝ
  const reasons = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, outBlock(state, date, p.id)])) as Record<number, string | null>,
    [state, date],
  );
  // On leave or in hospital at the time of going out: the status and the sentence
  // «Κανονική άδεια ως 05/11 · γυρνά Πέμ 06/11 πρωί».
  const aways = useMemo<AwayMap>(
    () =>
      new Map(
        people.flatMap((p) => {
          const st = awayAtOut(state, date, p.id);
          return st ? [[p.id, { st, note: awayNote(state, date, p.id, st) }] as const] : [];
        }),
      ),
    [state, date, people],
  );
  const rows = useMemo(
    () => filterOutRows(searchPeople(state.people, dq), { filter, room, sort, dq, reasons, aways, draft }),
    [dq, filter, reasons, aways, draft, state.people, room, sort],
  );
  const diffs = useMemo(() => outDiffs(people, saved, draft), [saved, draft, people]);
  const noteChanges = useMemo(() => noteChangesOf(notes, savedNotes), [notes, savedNotes]);
  const changes = useMemo(() => toChanges(diffs), [diffs]);
  return { roomList, dnSet, reasons, aways, rows, diffs, noteChanges, changes };
}
