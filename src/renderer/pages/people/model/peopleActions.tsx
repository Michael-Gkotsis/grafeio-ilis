// What the «Δυναμολόγιο» buttons do: change a filter, open or delete a saved list, make the Excel or the print.
// Purpose: `peopleActions`, the handlers of the list as plain functions over the values `usePeople` already holds.
// Does NOT: call a hook (so the hook order of `usePeople` stays as it was) or draw the buttons (ui/).
// Owner layer: renderer/pages/people. Why: moved verbatim from screens/people.ts (Phase 6), to keep `usePeople` short.
// Covering test: test/screens-main.test.ts (the toolbar), test/people-page-view.test.ts (the wording).
import type { Command } from '../../../../shared/commands';
import { dayName, dm } from '../../../../shared/dates';
import { unitOf, type SavedView } from '../../../../shared/domain';
import type { Sig } from '../../../../shared/sigs';
import type { Nav, StoreValue } from '../../../shared/model';
import type { Toast } from '../../../shared/ui';
import { filterLabel } from './view';

/** What the handlers read from the list's state. `date` and `today` are ISODate, local time. */
export type PeopleActionsCtx = Pick<StoreValue, 'state' | 'today' | 'run' | 'undoMark'> & {
  date: string;
  nav: Nav;
  toast: Toast;
  setQ: (q: string) => void;
  setSaving: (on: boolean) => void;
  setXl: (busy: boolean) => void;
  unit: string;
  room: number | null;
  filter: string;
  dq: string;
  curView: SavedView | undefined;
  views: SavedView[];
};

/** The text of the toast after the Excel: the file name and the day, or why it did not come out. */
export const exportedText = (file: string, date: string, today: string): string =>
  `Βγήκε ${file.split(/[\\/]/).pop()}: ένα φύλλο για κάθε φίλτρο, ${
    date === today ? 'για σήμερα.' : `για ${dayName(date, today).toLowerCase()} ${dm(date)}.`
  }`;

/** The handlers of the list. Pure over `c`; none of them is a hook. */
export function peopleActions(c: PeopleActionsCtx) {
  const {
    state,
    today,
    date,
    nav,
    toast,
    run,
    undoMark,
    setQ,
    setSaving,

    unit,
    room,
    filter,
    dq,
    curView,
    views,
  } = c;
  const setFilter = (f: string) => nav.set({ filter: f });
  const setUnit = (u: string) =>
    nav.set({ unit: u, room: room != null && u !== 'all' && unitOf({ room }, state.settings) !== u ? null : room });
  const setRoom = (r: number | null) =>
    nav.set({
      room: r,
      unit: r != null && unit !== 'all' && unitOf({ room: r }, state.settings) !== unit ? 'all' : unit,
    });
  const clear = () => {
    setQ('');
    nav.set({ filter: 'all', unit: 'all', room: null, pdate: undefined });
  };
  const applyView = (v: SavedView) => {
    if (curView === v) {
      clear();
      return;
    }
    setQ(v.q);
    nav.set({ unit: v.unit, room: v.room, filter: v.filter });
  };
  const delView = async (v: SavedView) => {
    const cmd: Command = {
      t: 'setSettings',
      settings: { views: views.filter((x) => x.id !== v.id) },
      text: `διαγραφή λίστας «${v.name}»`,
    };
    if (await run(cmd, false)) toast({ text: `Διαγράφηκε η λίστα «${v.name}»`, actions: [undoMark()] });
  };
  const saveView = async (name: string) => {
    const v: SavedView = { id: Date.now().toString(36), name, unit, room, filter, q: dq.trim() };
    const cmd: Command = {
      t: 'setSettings',
      settings: { views: [...views, v] },
      text: `αποθηκευμένη λίστα «${name}»`,
    };
    if (await run(cmd, false)) {
      setSaving(false);
      toast({ text: `Αποθηκεύτηκε η λίστα «${name}». Τη βρίσκεις στη γραμμή φίλτρων.` });
    }
  };
  const dateLbl = date === today ? '' : dayName(date, today);
  const filtered = unit !== 'all' || room != null || filter !== 'all' || !!dq.trim();
  const fLabel = filterLabel(filter);
  return {
    setFilter,
    setUnit,
    setRoom,
    clear,
    applyView,
    delView,
    saveView,
    dateLbl,
    filtered,
    fLabel,
    ...exportActions(c),
  };
}

// The Excel and the print of the roster. `sigs` = signatures for this time only («Υπογραφές…»).
function exportActions({ today, date, toast, setXl }: PeopleActionsCtx) {
  const exportXl = async (sigs?: Sig[]) => {
    setXl(true);
    try {
      const r = await window.api.exportLists(date, sigs);
      toast({
        text: r.ok ? (
          exportedText(r.file, date, today)
        ) : (
          <span>
            <b>Δεν βγήκε.</b> {r.error}
          </span>
        ),
      });
    } finally {
      setXl(false);
    }
  };
  // Συνολικό Δυναμολόγιο με την κεφαλίδα της ΗΚΑΙ, για εκτύπωση (Michael, 17/10)
  const printRoster = async (sigs?: Sig[]) => {
    setXl(true);
    try {
      const r = await window.api.exportRoster(today, true, sigs);
      if (!r.ok) {
        toast({
          text: (
            <span>
              <b>Δεν βγήκε.</b> {r.error}
            </span>
          ),
        });
      } else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
    } finally {
      setXl(false);
    }
  };
  return { exportXl, printRoster };
}
