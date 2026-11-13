// State of the «Εξοδούχοι» screen: the day, the draft, the filters, the lists and the actions.
// Purpose: `useOuts`, the hooks of `OutsScreen` in the order the screen always called them.
// Does NOT: draw anything (ui/) or hold the pure rules (model/view.ts).
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/guard.ts (Phase 6); hook order is unchanged:
//   store, toast, nav, media, draft, filters, rows, Sunday reasons, returns, setters, open, height, people map,
//   row height.
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import { useCallback, useMemo } from 'react';
import { useNav, useOpenFrom, useStore } from '../../../shared/model';
import { useRowH } from '../../../shared/lib/prefs';
import { useMedia, useToast, useViewportHeight } from '../../../shared/ui';
import { addDays } from '../../../../shared/dates';
import { mins } from '../../../../shared/hours';
import { activePeople, outRoomsOn, personMap, strengthOf } from '../../../../shared/rules';
import { dayTimes, returnsOn } from '../../../../shared/returns';
import { shortName } from '../../../../shared/domain';
import { isSat } from '../../../../shared/weekend';
import { makeOutsHandlers } from './outsActions';
import { useOutsDraft } from './useOutsDraft';
import { useOutsFilter, useOutsRows } from './useOutsRows';
import { countOf, outCounts, outDaysOf, pendingDays, saveFacts, sunWhyOf, withChoice, type OutVal } from './view';

/**
 * Everything the screen reads and calls.
 * @returns the day (`date`, `outDays`, `sat`, `rooms`), the draft and notes, the filters, the lists (`rows`, `reasons`,
 *   `aways`), the counters, the Sunday and return facts, and the handlers (`set`, `setNote`, `open`, `byRooms`,
 *   `allCan`, `setNight`, `save`)
 */
export function useOuts() {
  const { state, run, today, tomorrow, undoMark } = useStore();
  const toast = useToast();
  const nav = useNav();
  const mobile = useMedia('(max-width: 767px)');
  const date = nav.params.outDate || today;
  const outDays = outDaysOf(today, tomorrow);
  const rooms = outRoomsOn(state.rules, date);
  const people = activePeople(state);
  const sat = isSat(date);
  const dr = useOutsDraft(state, date, sat);
  const { saved, savedNotes, notes, setNotes, draft, setDraft } = dr;
  const fl = useOutsFilter();
  const { filter, dq, setConfirm, room, sort } = fl;
  const ls = useOutsRows({ state, date, people, saved, draft, notes, savedNotes, filter, room, sort, dq });
  const { reasons, aways, rows, diffs, noteChanges, changes } = ls;
  const nChanges = diffs.length + noteChanges.length;
  // «ΔΝ ΣΚ»: what keeps them in on Sunday (duty, penalty …), so they are not among Sunday's outs; or a leave starts.
  const sunday = addDays(date, 1);
  const sunWhy = useCallback((pid: number) => sunWhyOf(state, sat, sunday, pid), [state, sat, sunday]);
  const backs = useMemo(() => returnsOn(state, date), [state, date]);
  // «ΔΝ» people whose return we do not know: the next day is not declared (and has no training).
  const pendDays = useMemo(() => pendingDays(backs, shortName), [backs]);
  const counts = outCounts(state, date, people, reasons, aways, draft);
  const set = useCallback((pid: number, v: OutVal | null) => setDraft((d) => withChoice(d, pid, v)), []);
  const setNote = useCallback((pid: number, v: string) => setNotes((d) => ({ ...d, [pid]: v })), []);
  const open = useOpenFrom(rows);
  const height = useViewportHeight(mobile ? 380 : 330);
  const c0 = strengthOf(state, date, mins(dayTimes(state, date).out)); // «Παρόντες απόψε»: from the start of going out
  const awayDelta = diffs.reduce((a, c) => a + (c.to ? 1 : 0) - (c.from ? 1 : 0), 0);
  const pmO = useMemo(() => personMap(state.people), [state.people]);
  // Who goes out against the rules or with ΔΝ without the right: shown in «Τι θα αλλάξει», saving asks to confirm.
  // «ΔΝ ΣΚ» people who come back on Sunday morning (duty or something else on Sunday) or leave then.
  const { warns, sunBackOnly, sunLeave } = saveFacts(
    changes,
    diffs,
    reasons,
    ls.dnSet,
    (pid) => !!pmO.get(pid)?.dn,
    sunWhy,
  );
  const rh = useRowH(mobile ? 136 : 52, mobile ? 136 : 44);
  const facts = { nChanges, sunWhy, pendDays, set, setNote, open, height, c0, awayDelta, pmO, warns, rh };
  const day = { state, nav, today, date, outDays, rooms, people, sat, sunBackOnly, sunLeave };
  const input = { state, run, undoMark, toast, today, date, rooms, people, room, reasons, aways, draft, setDraft };
  const save = { changes, noteChanges, warns, nChanges, sunBackOnly, sunLeave, pmO, setConfirm };
  return {
    ...dr,
    ...fl,
    ...ls,
    ...counts,
    ...facts,
    ...day,
    ...makeOutsHandlers(input, save),
    backN: backs.length,
    backEarly: backs.some((b) => b.r.duty),
    night: !!state.nightTraining?.[date],
    cnt: (t: string) => countOf(draft, t),
  };
}

/** What the page parts read. */
export type Outs = ReturnType<typeof useOuts>;
