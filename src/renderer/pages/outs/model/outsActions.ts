// What the buttons of the «Εξοδούχοι» screen do: propose by rooms, everybody who can, night training, save.
// Purpose: `makeOutsActions`, plain closures (no hooks) built on every render from the screen's state.
// Does NOT: hold state or draw; it only calls `run`, `toast` and the draft setters it is given.
// Owner layer: renderer/pages/outs. Why: moved verbatim from screens/guard.ts (Phase 6).
// Covering test: test/screens-main.test.ts, test/outs-page-view.test.ts.
import type { Toast } from '../../../shared/ui';
import type { StoreValue } from '../../../shared/model';
import { personMap } from '../../../../shared/rules';
import { dayName, dm, type ISODate } from '../../../../shared/dates';
import { shortName, type AppState, type Person } from '../../../../shared/domain';
import { isDeprivation } from '../../../../shared/punish';
import { roomsTxt, type AwayMap, type OutDraft, type OutVal, type toChanges } from './view';

/** What the actions read and call. */
export interface ActionsIn {
  state: AppState;
  run: StoreValue['run'];
  undoMark: StoreValue['undoMark'];
  toast: Toast;
  today: ISODate;
  date: ISODate;
  rooms: number[] | null;
  people: Person[];
  room: number | null;
  reasons: Record<number, string | null>;
  aways: AwayMap;
  draft: OutDraft;
  setDraft: (v: OutDraft | ((d: OutDraft) => OutDraft)) => void;
}

/** What «Αποθήκευση» reads. */
export interface SaveIn {
  run: StoreValue['run'];
  undoMark: StoreValue['undoMark'];
  toast: Toast;
  date: ISODate;
  changes: ReturnType<typeof toChanges>;
  noteChanges: { pid: number; note: string }[];
  /** People who go out against the rules or ΔΝ without the right: saving then asks for `force`. */
  warns: unknown[];
  nChanges: number;
  /** «ΔΝ ΣΚ» people who come back on Sunday morning, and those whose leave starts on Sunday. */
  sunBackOnly: { pid: number }[];
  sunLeave: { pid: number }[];
  pmO: Map<number, Person>;
  setConfirm: (v: boolean) => void;
}

/** «Πρόταση»: the rooms of the day go out (those kept in by the rules stay), the draft is replaced. */
export function makeByRooms(a: ActionsIn) {
  const { rooms, people, reasons, aways, draft, setDraft, toast } = a;
  return () => {
    if (!rooms) return;
    const n: OutDraft = Object.fromEntries(
      people
        .filter((p) => p.room != null && rooms.includes(p.room) && !reasons[p.id] && !aways.has(p.id))
        .map((p) => [p.id, draft[p.id] === 'DN' || draft[p.id] === 'DNSK' ? draft[p.id] : 'OUT']),
    );
    setDraft(n);
    const kept = people.filter(
      (p) => p.room != null && rooms.includes(p.room) && reasons[p.id] && !aways.has(p.id),
    ).length;
    toast({
      text:
        'Πρόταση: θάλαμοι ' +
        roomsTxt(rooms) +
        ' έξω (' +
        Object.keys(n).length +
        '). ' +
        kept +
        ' από αυτούς μένουν λόγω κανόνων και μπαίνουν στους Παραμένοντες.',
    });
  };
}

/** «Όλοι όσοι μπορούν: έξοδος»: «Έξοδος» for everybody allowed who has no choice yet (in the picked room, if any). */
export function makeAllCan(a: ActionsIn) {
  const { people, reasons, aways, room, setDraft } = a;
  return () =>
    setDraft((d) => ({
      ...d,
      ...Object.fromEntries(
        people
          .filter((p) => !reasons[p.id] && !aways.has(p.id) && !d[p.id] && (room == null || p.room === room))
          .map((p) => [p.id, 'OUT' as OutVal]),
      ),
    }));
}

/**
 * «Βραδινή εκπαίδευση» (Michael, 13/10): the day does not count in anybody's out-deprivation and their end dates
 * move by themselves; the toast says who moved.
 */
export function makeSetNight(a: ActionsIn) {
  const { state, run, undoMark, toast, today, date } = a;
  return async (on: boolean) => {
    const before = new Map(state.statuses.filter(isDeprivation).map((x) => [x.id, x.to]));
    const next = await run({ t: 'setNightTraining', date, on }, false);
    if (!next) return;
    const pm = personMap(next.people);
    const moved = next.statuses
      .filter((x) => before.has(x.id) && before.get(x.id) !== x.to)
      .map((x) => shortName(pm.get(x.pid)!) + ' ως ' + dm(x.to));
    toast({
      text:
        (on ? 'Βραδινή εκπαίδευση ' : 'Χωρίς βραδινή εκπαίδευση ') +
        dayName(date, today).toLowerCase() +
        ' ' +
        dm(date) +
        '. ' +
        (moved.length ? 'Στέρηση εξόδου: ' + moved.join(', ') + '.' : on ? 'Δεν μετρά στη στέρηση εξόδου.' : ''),
      actions: [undoMark()],
    });
  };
}

/** «Αποθήκευση» of the confirm dialog: runs `outs`; on success closes the dialog and says what was saved. */
export function makeSave(a: SaveIn) {
  const { run, undoMark, toast, date, changes, noteChanges, warns, nChanges, sunBackOnly, sunLeave, pmO, setConfirm } =
    a;
  const names = (xs: { pid: number }[]) => xs.map((x) => shortName(pmO.get(x.pid)!)).join(', ');
  return async () => {
    const done = await run(
      {
        t: 'outs',
        date,
        changes,
        notes: noteChanges.length ? noteChanges : undefined,
        force: warns.length > 0 || undefined,
      },
      false,
    );
    if (!done) return;
    setConfirm(false);
    toast({
      text:
        'Αποθηκεύτηκαν οι εξοδούχοι ' +
        dm(date) +
        ' (' +
        nChanges +
        ' αλλαγές)' +
        (sunBackOnly.length ? '. Γυρίζουν Κυριακή πρωί: ' + names(sunBackOnly) : '') +
        (sunLeave.length ? '. Άδεια από Κυριακή: ' + names(sunLeave) : ''),
      actions: [undoMark()],
    });
  };
}

/** The four handlers of the screen: {@link makeByRooms}, {@link makeAllCan}, {@link makeSetNight}, {@link makeSave}. */
export function makeOutsHandlers(a: ActionsIn, save: Omit<SaveIn, 'run' | 'undoMark' | 'toast' | 'date'>) {
  const { run, undoMark, toast, date } = a;
  return {
    byRooms: makeByRooms(a),
    allCan: makeAllCan(a),
    setNight: makeSetNight(a),
    save: makeSave({ run, undoMark, toast, date, ...save }),
  };
}
