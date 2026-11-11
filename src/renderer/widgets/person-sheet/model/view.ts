// What the soldier sheet shows, derived from the store.
// Purpose: `personSheetView` gives the notes groups, the requests, the history, the duty log, the «Καμία υπηρεσία / Μόνο
//   άοπλες θέσεις / Δεν βγαίνει έξοδο» alerts, the health notes and the Σ.Ι. text.
// Does NOT: use hooks or change anything; it is a pure function of the state, called once per render.
// Owner layer: renderer/widgets/person-sheet. Why: moved verbatim from screens/people.ts (Phase 5.3c).
// Covering test: test/people.test.ts.
import type { ISODate } from '../../../../shared/dates';
import { blocksOf, type AppState, type Person } from '../../../../shared/domain';
import { backBy } from '../../../../shared/hours';
import { personGroups, remLine } from '../../../../shared/notes';
import { live } from '../../../../shared/ranks';
import {
  dutyBlock,
  dutyStats,
  emptyStat,
  notesOn,
  outBlock,
  postBy,
  postsOf,
  statusesOf,
  statusesOn,
} from '../../../../shared/rules';
import { siOf } from '../../../../shared/si';
import { STAT_ROWS, statIsUnarmed, statNoDuty } from '../../../../shared/stat';

/** The alerts at the top of the sheet: no duty / only unarmed posts / no out. @param nowM minutes since midnight, local time */
function sheetRules(state: AppState, pid: number, today: ISODate, nowM: number) {
  const ob = outBlock(state, today, pid);
  // ΕΑ/ΕΥ/ΕΟ/ΕΑΡΒ/ΣΤΕΠ όπως ορίζει ο πίνακας καταστάσεων· οι άλλες (άδειες, έξοδοι) όπως πριν
  const lists = state.settings.lists;
  const bl = (blocksOf(state.settings) || state.settings.blocks).filter((b) => !b.hidden);
  const ssT = statusesOn(live(state), pid, today).filter((x) => STAT_ROWS.includes(x.type));
  const rest = statusesOf(live(state), pid).filter((x) => !STAT_ROWS.includes(x.type) && !backBy(x, today, nowM)); // γύρισε σήμερα ως τώρα: όχι πια «καμία υπηρεσία»
  const noDutyT = ssT.some((x) => statNoDuty(x, bl, lists)) || !!dutyBlock(rest, today, pid, { armed: false }, lists);
  const unarmedT =
    ssT.some((x) =>
      statIsUnarmed(
        x,
        bl.filter((b) => b.kind !== 'ly'),
        lists,
      ),
    ) || !!dutyBlock(rest, today, pid, { armed: true }, lists);
  return [
    noDutyT ? 'Καμία υπηρεσία' : unarmedT ? 'Μόνο άοπλες θέσεις' : null,
    ob ? 'Δεν βγαίνει έξοδο (' + ob + ')' : null,
  ].filter((x): x is string => !!x);
}

/** The derived values of the sheet. @param today ISODate, local time @param nowM minutes since midnight, local time */
export function personSheetView(state: AppState, p: Person, pid: number, today: ISODate, nowM: number) {
  const ng = personGroups(state.notes, { pid }, today);
  const rem = remLine(state.notes, { pid }, today);
  const reqs = state.requests
    .filter((r) => r.pid === pid)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const posts = postsOf(state.settings);
  const hist = [...statusesOf(state.statuses, pid)].sort((a, b) => b.from.localeCompare(a.from));
  const dd = dutyStats(state).get(pid) || emptyStat();
  const duties = dd.log
    .slice()
    .reverse()
    .slice(0, 40)
    .map((e) => ({
      d: e.d,
      x: e.k ? posts.find((q) => q.k === e.k) || postBy(state, e.k) : undefined,
      kind: e.kind,
      h: e.h,
    }));
  const lists = state.settings.lists;
  const rules = sheetRules(state, pid, today, nowM);
  const hn = notesOn(state, pid, today); // «Σημειώσεις υγείας» (Michael, 4/11)
  const si = p.si ? siOf(p, lists) : null;
  return { ng, rem, reqs, hist, dd, duties, lists, rules, hn, si };
}

/** What `personSheetView` returns. */
export type PersonSheetView = ReturnType<typeof personSheetView>;
