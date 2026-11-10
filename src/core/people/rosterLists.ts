// Δυναμολόγιο (roster): the filters, the columns, the cells and the Excel sheets of the soldiers (Michael, 17/10).
//
// Purpose: the filters of the screen (`ROSTER_FILTERS`, `rosterMatch`, `filterStatus`), the columns (`ROSTER_COLS`,
//   `STATUS_COLS`), the cells of a person (`rosterCells`, `statusKind`), the order (`byRoomName`), the sheets of the
//   Excel for a day (`rosterSheets`) and the most common ΕΣΣΟ of the force (`currentEssos`).
// Does NOT: write the Excel file (src/main does), or show the medical data (screen «Ιατρικά και ποινές»).
// Owner layer: core/people (no fs, no Electron, no React); imports core/statuses (hours) and core/people.
// Why: the screen shows only the data of the soldier, with the filters Όλοι, Άδειες, Τιμωρημένοι, Πόστα, Εκτός δύναμης,
//   Με δικαίωμα ΔΝ. The same, for one date, comes out in one Excel with one sheet per filter.
// Covering tests: test/roster-lists.test.ts, test/person-card.test.ts, test/leave-end.test.ts.
import { dmy, type ISODate } from '../lib/dates';
import { TYPES, coversDay, type Status } from '../model/status';
import type { AppState } from '../model/state';
import type { Person } from '../model/person';
import { siOf } from './si';
import { live, statusLbl, leavePhrase } from './kinds';
import { rankTxt } from './ranks';
import { collator } from '../lib/text';
import { backBy } from '../statuses/hours';
import type { RosterFilter } from '../model/lists';
import type { RosterSheet } from '../model/rosterSheet';
export type { RosterFilter } from '../model/lists';
export type { RosterSheet } from '../model/rosterSheet';

/** The filters of the screen: key, label of the button, name of the Excel sheet. */
export const ROSTER_FILTERS: [RosterFilter, string, string][] = [
  ['all', 'Όλοι', 'ΔΥΝΑΜΟΛΟΓΙΟ'],
  ['leave', 'Άδειες', 'ΑΔΕΙΕΣ'],
  ['pun', 'Τιμωρημένοι', 'ΤΙΜΩΡΗΜΕΝΟΙ'],
  ['post', 'Πόστα', 'ΠΟΣΤΑ'],
  ['inactive', 'Εκτός δύναμης', 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ'],
  ['dnright', 'Με δικαίωμα ΔΝ', 'ΔΙΚΑΙΩΜΑ ΔΝ'],
];
/** The columns, in the order that Michael asked for. */
export const ROSTER_COLS = [
  'Α/Α',
  'ΒΑΘΜΟΣ',
  'Ο/Σ',
  'ΕΠΙΘΕΤΟ',
  'ΟΝΟΜΑ',
  'ΠΑΤΡΩΝΥΜΟ',
  'ΑΣΜ',
  'ΤΗΛΕΦΩΝΟ',
  'ΘΑΛΑΜΟΣ',
  'ΠΟΣΤΟ',
  'ΡΟΛΟΣ',
  'Σ.Ι.',
  'ΔΙΚΑΙΩΜΑ ΔΝ',
];
/** Leaves and penalties: and what, from when, until when. */
export const STATUS_COLS = ['ΕΙΔΟΣ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡΑΤΗΡΗΣΗ'];

// leave: regular/special etc., honorary, sick (not those that are still asked for); penalty: every penalty of that day
const isLeave = (s: Status) => TYPES[s.type].cat === 'abs' && !s.pending;
const isPun = (s: Status) => s.type === 'PUN';
/** The status of the filter for one person on day d (the first, if many); only `leave` and `pun` have one. */
export function filterStatus(f: RosterFilter, on: Status[]): Status | undefined {
  return f === 'leave' ? on.find(isLeave) : f === 'pun' ? on.find(isPun) : undefined;
}
/** Does the person pass the filter? `on`: the statuses of the person on the day (`statusesOn`). */
export function rosterMatch(f: RosterFilter, p: Person, on: Status[]): boolean {
  if (f === 'inactive') return !p.active;
  if (!p.active) return false;
  if (f === 'all') return true;
  if (f === 'post') return !!p.post;
  if (f === 'dnright') return !!p.dn;
  return !!filterStatus(f, on);
}
/** The kind column of the sheets Άδειες and Τιμωρημένοι: the label of a penalty, the phrase of a leave. */
export const statusKind = (s: Status, lists?: AppState['settings']['lists']) =>
  s.type === 'PUN' ? statusLbl(s, lists) : s.type === 'LEAVE' ? leavePhrase(s) : TYPES[s.type].long;
/** The cells of a person after the Α/Α, in the order of `ROSTER_COLS`. */
export const rosterCells = (p: Person, lists?: AppState['settings']['lists']): (string | number)[] => [
  rankTxt(p),
  p.spec,
  p.last,
  p.first,
  p.father,
  p.asm,
  p.phone,
  p.room ?? '',
  p.post || '',
  p.role || '',
  p.si ? siOf(p, lists).text : '',
  p.dn ? 'ΝΑΙ' : '',
];
/** Order as in the Δυναμολόγιο: room, last name, first name (people without a room go last). */
export const byRoomName = (a: Person, b: Person) =>
  (a.room ?? 99) - (b.room ?? 99) || collator.compare(a.last, b.last) || collator.compare(a.first, b.first);

/**
 * The sheets of the Excel for day `d`: one per filter, and in the leaves and penalties one row for every leave or
 * penalty. `at` (minutes): today, whoever returned from leave by then is no longer in the Άδειες (like on the screen).
 */
export function rosterSheets(s: AppState, d: ISODate, at?: number): RosterSheet[] {
  const lists = s.settings.lists;
  const people = [...s.people].sort(byRoomName);
  const byPid = new Map<number, Status[]>();
  for (const x of live(s))
    if (coversDay(x, d) && !(at != null && backBy(x, d, at))) {
      const l = byPid.get(x.pid);
      if (l) l.push(x);
      else byPid.set(x.pid, [x]);
    }
  return ROSTER_FILTERS.map(([f, , name]) => {
    const withStatus = f === 'leave' || f === 'pun';
    const rows: (string | number)[][] = [];
    for (const p of people) {
      const on = byPid.get(p.id) || [];
      if (!rosterMatch(f, p, on)) continue;
      if (!withStatus) {
        rows.push([rows.length + 1, ...rosterCells(p, lists)]);
        continue;
      }
      for (const x of on.filter(f === 'leave' ? isLeave : isPun))
        rows.push([
          rows.length + 1,
          ...rosterCells(p, lists),
          statusKind(x, lists),
          dmy(x.from),
          x.open ? '' : dmy(x.to),
          x.note || '',
        ]);
    }
    return {
      name,
      title: name + ' ' + dmy(d),
      head: withStatus ? [...ROSTER_COLS, ...STATUS_COLS] : ROSTER_COLS,
      rows,
    };
  });
}

/** The ΕΣΣΟ of the force: the most common one among those in force (shown top right, and put on a new soldier). */
export function currentEssos(people: Person[]): string {
  const n = new Map<string, number>();
  for (const p of people) if (p.active && p.essos) n.set(p.essos, (n.get(p.essos) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}
