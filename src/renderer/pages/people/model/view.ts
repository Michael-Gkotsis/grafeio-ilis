// The pure rules of the «Δυναμολόγιο» screen: the table columns and grid, status text, search + sort, counts.
// Purpose: everything the list decides without React: which columns show at which width, the CSS grid of a row, how a
//   status reads, the order of the rows, the numbers on the filter chips and the text of the active filter.
// Does NOT: hold state (model/usePeople.ts), call the store or draw anything (ui/).
// Owner layer: renderer/pages/people. Why: moved verbatim from screens/people.ts (Phase 6) so the rules are testable
//   without a render.
// Covering test: test/people-page-view.test.ts, test/perf.test.ts (the row count).
import { isAway, live, type UserLists } from '../../../../shared/ranks';
import { TYPES, roomTxt, type AppState, type DutyKind, type Person, type Status } from '../../../../shared/domain';
import { dm, type ISODate } from '../../../../shared/dates';
import { autoCell, type ImerCell } from '../../../../shared/imer';
import { ROSTER_FILTERS, rosterMatch, statusKind, type RosterFilter } from '../../../../shared/rosterLists';
import { statusesAt, statusesOn } from '../../../../shared/rules';
import { siOf } from '../../../../shared/si';
import { collator } from '../../../../shared/text';
import { rkOn } from '../../../entities/person';
import { UNIT } from '../../../../shared/unit';

/** Where the list stands: platoon («Όλη η Ίλη» = `'all'`), room (`null` = every room) and quick filter key. */
export type Filt = { unit: string; room: number | null; filter: string };

/** The sort kept in the route params: column key and direction (1 up, -1 down). */
export type SortState = { k: string; dir: number };

/** Sort of a fresh screen: by last name, A to Z. */
export const DEF_SORT: SortState = { k: 'last', dir: 1 };

// Δυναμολόγιο (Michael, 17/10): μόνο τα στοιχεία του στρατιώτη, με τις στήλες του Δυναμολογίου. Οι άδειες και οι ποινές
// φαίνονται μόνο στα αντίστοιχα φίλτρα, με μία στήλη ακόμα (τι και από πότε έως πότε)· τα ιατρικά στα «Ιατρικά και ποινές».
/** Every column: key and heading. */
export const COLS: [string, string][] = [
  ['rank', 'Βαθμός'],
  ['spec', 'Ο/Σ'],
  ['last', 'Επίθετο'],
  ['first', 'Όνομα'],
  ['father', 'Πατρώνυμο'],
  ['asm', 'ΑΣΜ'],
  ['phone', 'Τηλέφωνο'],
  ['room', 'Θάλαμος'],
  ['post', 'Πόστο'],
  ['role', 'Ρόλος'],
  ['si', 'Σ.Ι.'],
  ['dn', 'ΔΝ'],
];

// στις άδειες/ποινές η στήλη της κατάστασης μπαίνει μετά το πατρώνυμο, για να φαίνεται χωρίς κύλιση
/** Wide layout: CSS grid width of a column and its px width for the minimum table width. */
export const COL_W: Record<string, [string, number]> = {
  rank: ['100px', 100],
  spec: ['52px', 52],
  last: ['minmax(150px,1.6fr)', 150],
  first: ['minmax(100px,1fr)', 100],
  father: ['minmax(100px,1fr)', 100],
  asm: ['84px', 84],
  phone: ['102px', 102],
  room: ['76px', 76],
  post: ['minmax(76px,.7fr)', 76],
  role: ['minmax(120px,.8fr)', 120],
  si: ['96px', 96],
  dn: ['40px', 40],
};

// σε στενή οθόνη (π.χ. 1024) φεύγουν Πατρώνυμο και Τηλέφωνο, που φαίνονται στην καρτέλα, για να χωρά ο πίνακας χωρίς κύλιση
/** Columns dropped on a narrow screen (they are on the person's card). */
export const NARROW_HIDE = ['father', 'phone'];

/** Narrow layout widths (fits with the menu open at 1024: 710px). */
export const COL_WN: Record<string, [string, number]> = {
  rank: ['70px', 70],
  spec: ['46px', 46],
  last: ['minmax(110px,1.6fr)', 110],
  first: ['minmax(76px,1fr)', 76],
  asm: ['70px', 70],
  room: ['48px', 48],
  post: ['minmax(52px,.7fr)', 52],
  role: ['minmax(64px,.8fr)', 64],
  si: ['64px', 64],
  dn: ['38px', 38],
};

/** The columns shown: all of them, or on a narrow screen without `NARROW_HIDE` and with «Θάλ.» for the room. */
export const colsOf = (narrow: boolean): [string, string][] =>
  narrow ? COLS.filter(([k]) => !NARROW_HIDE.includes(k)).map(([k, l]) => [k, k === 'room' ? 'Θάλ.' : l]) : COLS;

/** The columns left of the status column (the status goes after the father's name). */
export const HEAD_KEYS = ['rank', 'spec', 'last', 'first', 'father'];

/**
 * The CSS grid of a row and the minimum width of the table.
 * @param narrow - true below 1280px
 * @param withSt - true when the «Άδεια» / «Ποινή» column is shown
 * @returns `[gridTemplateColumns, minWidthPx]`
 */
export function gridOf(narrow: boolean, withSt: boolean): [string, number] {
  const ks = colsOf(narrow).map(([k]) => k);
  const head = ks.filter((k) => HEAD_KEYS.includes(k));
  const tail = ks.filter((k) => !HEAD_KEYS.includes(k));
  const w = (k: string) => (narrow && COL_WN[k]) || COL_W[k];
  const aa = narrow ? 38 : 44;
  const cols = [
    `${aa}px`,
    ...head.map((k) => w(k)[0]),
    ...(withSt ? ['minmax(220px,1.6fr)'] : []),
    ...tail.map((k) => w(k)[0]),
  ];
  return [cols.join(' '), aa + ks.reduce((a, k) => a + w(k)[1], 0) + (withSt ? 220 : 0) + 18];
}

/** «Άδεια · 12/10–15/10» for the status column and the card badge (`dm` = dd/mm). */
export const stTxt = (st: Status, lists?: UserLists): string =>
  `${statusKind(st, lists)} · ${dm(st.from)}${st.open ? ' – χωρίς λήξη' : st.to !== st.from ? `–${dm(st.to)}` : ''}`;

// φίλτρα αποθηκευμένων λιστών από πριν (Παρόντες, ΕΥ…): ισχύουν ακόμα, απλώς δεν είναι πια κουμπιά
/** Old saved filters (`present`, `absent`, a status type) still match, though they are no longer buttons. */
export const legacyMatch = (f: string, ss: Status[], lists?: UserLists): boolean => {
  const away = ss.some((s) => isAway(s, lists));
  if (f === 'present') return !away;
  if (f === 'absent') return away;
  return (TYPES as Record<string, unknown>)[f] ? ss.some((s) => s.type === f) : true;
};

/** True when the person is in the platoon and room of the filter. `unitOfPerson` is the platoon of a person. */
export const inPlace = (p: Person, f: Filt, unitOfPerson: (p: Person) => string): boolean =>
  (f.unit === 'all' || unitOfPerson(p) === f.unit) && (f.room == null || p.room === f.room);

/** Whether a person, already in place, passes the quick filter given his statuses of the shown day. */
export const passesFilter = (p: Person, filter: string, ss: Status[], lists?: UserLists): boolean =>
  ROSTER_FILTERS.some(([k]) => k === filter)
    ? rosterMatch(filter as RosterFilter, p, ss)
    : p.active && legacyMatch(filter, ss, lists);

/** The value a column sorts by (room 99 = none, ΔΝ yes first, the Σ.Ι. as written). */
const sortValue = (p: Person, k: string, lists?: UserLists): string => {
  if (k === 'room') return String(p.room ?? 99).padStart(2, '0');
  if (k === 'dn') return p.dn ? '0' : '1';
  if (k === 'si') return siOf(p, lists).text;
  return String((p as unknown as Record<string, unknown>)[k] ?? '');
};

/**
 * The rows in the chosen order. A search on the default sort keeps the order the search gave (best match first).
 * @param list - the filtered people
 * @param sort - column and direction
 * @param searching - true while the search box has text
 */
export function sortRows(list: Person[], sort: SortState, searching: boolean, lists?: UserLists): Person[] {
  if (searching && sort.k === 'last' && sort.dir === 1) return list;
  return [...list].sort(
    (a, b) =>
      (collator.compare(sortValue(a, sort.k, lists), sortValue(b, sort.k, lists)) ||
        collator.compare(a.last, b.last) ||
        collator.compare(a.first, b.first)) * sort.dir,
  );
}

/** The sort after a click on a heading: same column flips the direction, another column starts upwards. */
export const nextSort = (sort: SortState, k: string): SortState =>
  sort.k === k ? { k, dir: -sort.dir } : { k, dir: 1 };

/** `aria-sort` of a heading button. */
export const ariaSort = (sort: SortState, k: string): 'ascending' | 'descending' | 'none' =>
  sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none';

/** The ▲ / ▼ after the heading of the sorted column. */
export const sortArrow = (sort: SortState, k: string): string => (sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : '');

/** How many people each quick filter would show, in the chosen platoon and room (the numbers on the chips). */
export function countFilters(
  people: Person[],
  ssOf: Map<number, Status[]>,
  place: (p: Person) => boolean,
): Record<string, number> {
  const n: Record<string, number> = {};
  for (const p of people) {
    if (!place(p)) continue;
    const ss = ssOf.get(p.id) || [];
    for (const [k] of ROSTER_FILTERS) if (rosterMatch(k, p, ss)) n[k] = (n[k] || 0) + 1;
  }
  return n;
}

/** The rooms in use with the number of active soldiers in each, by room number. */
export const roomCounts = (active: Person[]): [number, number][] => {
  const m = new Map<number, number>();
  for (const p of active) if (p.room != null) m.set(p.room, (m.get(p.room) || 0) + 1);
  return [...m].sort((a, b) => a[0] - b[0]);
};

/** Subtitle under the page title. `total` = people in the force. */
export const peopleSub = (total: number): string =>
  `Δύναμη ${UNIT().gen}: ${total} άτομα. Πάτα ένα όνομα για την καρτέλα του.`;

/** The label of a quick filter (the key itself for an old saved filter that is no longer a button). */
export const filterLabel = (filter: string): string => ROSTER_FILTERS.find(([k]) => k === filter)?.[1] ?? filter;

/** Tooltip of the «Άδεια» / «Ποινή» chips; `dateLbl` is '' for today. */
export const chipTip = (k: string, dateLbl: string): string | undefined =>
  k === 'leave' || k === 'pun'
    ? (k === 'leave' ? 'Σε άδεια ' : 'Με ποινή ') + (dateLbl ? dateLbl.toLowerCase() : 'σήμερα')
    : undefined;

/** The one line under a soldier's name on the phone card. */
export const cardLine = (p: Person, lists?: UserLists): string =>
  [
    p.father && `του ${p.father}`,
    !rkOn() && p.spec,
    roomTxt(p),
    p.phone,
    p.si && siOf(p, lists).text,
    p.post && `πόστο ${p.post}`,
    p.dn && 'ΔΝ',
  ]
    .filter(Boolean)
    .join(' · ');

/** Tooltip of a long text cell: the text itself when it is cut by the column (over 9 characters). */
export const longTip = (s?: string | null): string | undefined => (s && s.length > 9 ? s : undefined);

/**
 * The statuses of every active person on the shown day, one lookup per person.
 * @param date - ISODate, local time; today uses the clock (`at` minutes) so a leave that ended an hour ago is over,
 *   exactly as the «Σήμερα» screen counts it (Michael, 20/10)
 * @param at - minutes since midnight for today, `-1` for another day
 */
export const statusMap = (active: Person[], state: AppState, date: string, today: string, at: number) =>
  new Map<number, Status[]>(
    active.map((p) => [p.id, date === today ? statusesAt(state, p.id, date, at) : statusesOn(live(state), p.id, date)]),
  );

// Υπηρεσίες πριν από την εφαρμογή: δεν γράφονται πια με το χέρι (Michael, 17/10: η ΕΣΣΟ ξεκινά από την αρχή).
// Όσες υπάρχουν ήδη μετρούν ακόμα· ο έλεγχος από κάτω τις μηδενίζει.
/** The duty kinds of the old «προηγούμενες υπηρεσίες», in the order of the review dialog's columns. */
export const BASE_KINDS: DutyKind[] = ['th', 'op', 'sk', 'mg', 'ly', 'tae', 'other'];

/** Colour class suffix of a «Ημερολόγιο κωλυομένων» cell: absent (red), duty / post (green), free (yellow), or none. */
export const imerTone = (c: ImerCell): string =>
  !c.code
    ? ''
    : c.count === 'A'
      ? 'abs'
      : c.key === 'DUTY' || c.key === 'POST'
        ? 'duty'
        : /^Ε\.[ΥΑ]$/.test(c.key)
          ? 'free'
          : '';

/** The code the app itself would put in a cell (without the hand-written one), for the cell dialog. */
export const autoCode = (s: AppState, p: Person, d: ISODate): string => autoCell(s, p, d)?.code || '';
