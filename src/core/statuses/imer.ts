// Ημερολόγιο κωλυομένων-απόντων (Michael, 3/11): one cell per soldier and training day, with the code of his status.
//
// Purpose: the codes and the counts of the table «Κωδικοί…» (`IMER_ROWS`, `imerCode`, `imerCount`, `DUTY_CODES`), the
//   settings (`imerTitle`, `imerSheets`), the cell of a soldier and a day (`autoCell`, `cellOf`, `handOf`,
//   `handCount`, `postCode`), the days (`imerDays`, `mondayOf`, `imerRange`), the groups per platoon (`imerGroups`)
//   and the grid with its totals (`imerGrid`, `imerTotals`, `sumTotals`), and the codes offered on a click
//   (`handChoices`).
// Does NOT: write the Excel file (src/main/excel.ts does) or save what is written by hand (`AppState.imer`).
// Owner layer: core/statuses (no fs, no Electron, no React); imports dayCode.ts, core/duty, core/outs and core/model.
// Why: the app fills it by itself (leaves, medical, duties, posts) and what is written by hand stays above the
//   automatic one, only in the calendar. The totals Π (present) and Α (absent) come from the «Μετρά ως» of each code.
// Covering tests: test/imer.test.ts.
import { addDays, parseD, type ISODate } from '../lib/dates';
import { KIND_CODE, type DutyKind } from '../model/duty';
import { TYPES } from '../model/status';
import { platoonsOf, unitOf } from '../model/settingsAccess';
import { platoonShort } from '../model/rooms';
import type { AppState } from '../model/state';
import type { Person } from '../model/person';
import type { Settings } from '../model/settings';
import { dayStatus, codeOfStatus } from './dayCode';
import { postOf } from '../duty/posts';
import { dayTimes } from '../outs/dayTimes';
import { collator, normGreek, upper } from '../lib/text';
import type { ImerSettings, ImerTitle, ImerSheets, Count } from '../model/documents';
export type { ImerSettings, ImerCodeSet, ImerSheets, ImerTitle, Count } from '../model/documents';

/** A range of days asked for (`all`: every day, not only the training days). */
export interface ImerReq {
  from: ISODate;
  to: ISODate;
  all?: boolean;
}
/** The two titles of the sheet. */
export const IMER_TITLES: Record<ImerTitle, string> = {
  imer: 'ΗΜΕΡΟΛΟΓΙΟ ΚΩΛΥΟΜΕΝΩΝ-ΑΠΟΝΤΩΝ',
  ekp: 'ΔΥΝΑΜΟΛΟΓΙΟ ΕΚΠΑΙΔΕΥΣΗΣ',
};
/** The codes «Α/Α» (unexcused absent), «Ε/Ε» (unit works) and the dash (before enlistment / after deletion). */
export const AA = 'Α/Α',
  EE = 'Ε/Ε',
  DASH = '-';
/**
 * A row of the table «Κωδικοί…»: key = the default code (or DUTY/POST for duties and posts). `edit`: the
 * code is changed by the user (the duties and the posts come out of the Ρυθμίσεις).
 */
export interface ImerRow {
  key: string;
  label: string;
  def: string;
  count: Count;
  from: string;
  edit: boolean;
}
/** The table «Κωδικοί…». */
export const IMER_ROWS: ImerRow[] = [
  { key: 'Κ.Α', label: 'Κανονική άδεια', def: 'Κ.Α', count: 'A', from: 'Άδειες', edit: true },
  { key: 'ΑΝ.ΑΔ', label: 'Αναρρωτική άδεια', def: 'ΑΝ.ΑΔ', count: 'A', from: 'Άδειες', edit: true },
  { key: 'ΝΟΣ', label: 'Νοσοκομείο', def: 'ΝΟΣ', count: 'A', from: 'Ιατρικά', edit: true },
  { key: 'Ε.Υ', label: 'Ελεύθερος υπηρεσίας', def: 'Ε.Υ', count: 'P', from: 'Ιατρικά', edit: true },
  { key: 'Ε.Α', label: 'Ελεύθερος ασκήσεων', def: 'Ε.Α', count: 'P', from: 'Ιατρικά', edit: true },
  {
    key: 'DUTY',
    label: 'Σκοπός · Θαλαμοφύλακας · Οπλοφύλακας · …',
    def: 'ΣΚ · Θ · ΟΠ · ΠΕΡ',
    count: 'P',
    from: 'Υπηρεσίες της μέρας',
    edit: false,
  },
  { key: 'POST', label: 'Γραφέας · Εστιάτορας (πόστο)', def: 'ΓΡ · ΕΣΤ', count: 'P', from: 'Πόστα', edit: false },
  { key: AA, label: 'Αδικαιολόγητα απών', def: AA, count: 'A', from: 'Νέο: δηλώνεται στην καρτέλα', edit: true },
  { key: EE, label: 'Εργασίες επιλαρχίας', def: EE, count: 'P', from: 'Νέο: δηλώνεται στην καρτέλα', edit: true },
  {
    key: DASH,
    label: 'Πριν την κατάταξη / μετά τη διαγραφή',
    def: DASH,
    count: 'A',
    from: 'Εγγραφή / διαγραφή',
    edit: true,
  },
];
const ROW = new Map(IMER_ROWS.map((r) => [r.key, r]));
/** The code of a duty by kind: the letters of the calendar (not those of the duty check: Σ, Υ). */
export const DUTY_CODES: Record<DutyKind, string> = { ...KIND_CODE, sk: 'ΣΚ', other: 'ΠΕΡ' };
const cfg = (st: Pick<Settings, 'imer'>): ImerSettings => st.imer || {};
/** The code written for a row of the table: the user's own, otherwise the default. */
export const imerCode = (st: Pick<Settings, 'imer'>, key: string): string => {
  const r = ROW.get(key);
  return (r?.edit && cfg(st).codes?.[key]?.code?.trim()) || r?.def || key;
};
/** How a row counts: P (present) or A (absent). */
export const imerCount = (st: Pick<Settings, 'imer'>, key: string, dflt: Count = 'P'): Count =>
  cfg(st).codes?.[key]?.count || ROW.get(key)?.count || dflt;
/** The title of the sheet. */
export const imerTitle = (st: Pick<Settings, 'imer'>) => IMER_TITLES[cfg(st).title === 'ekp' ? 'ekp' : 'imer'];
/** Which sheets are written: `unit` (default), `all` or `both`. */
export const imerSheets = (st: Pick<Settings, 'imer'>): ImerSheets => {
  const v = cfg(st).sheets;
  return v === 'all' || v === 'both' ? v : 'unit';
};

/** The cell of a soldier and a day: the code, the table row, the count, and the automatic code under a manual one. */
export interface ImerCell {
  code: string;
  key: string;
  count: Count;
  hand?: boolean;
  auto?: string;
}
/** The post shown as a code: ΓΡ (clerk), ΕΣΤ (caterer). */
export function postCode(p: Pick<Person, 'post' | 'role'>): string {
  const t = normGreek((p.post || '') + ' ' + (p.role || ''));
  return /ΓΡΑΦΕΑΣ|ΓΡΑΦΕΙΟ/.test(t) ? 'ΓΡ' : /ΕΣΤΙΑΤΟΡ/.test(t) ? 'ΕΣΤ' : '';
}
/**
 * The code that comes out by itself, in order of priority (the first wins): before enlistment / after deletion «-»,
 * leave/hospital, ΣΤΕΠ, medical (dayCode.ts), duty of the day, post; otherwise empty (= in training).
 */
export function autoCell(s: AppState, p: Person, d: ISODate): ImerCell | null {
  const st = s.settings;
  if ((p.inOn && d < p.inOn) || (!p.active && p.outOn && d >= p.outOn))
    return { code: imerCode(st, DASH), key: DASH, count: imerCount(st, DASH) };
  const x = dayStatus(s, p, d);
  if (x) {
    const def = codeOfStatus(x, st.lists);
    const known = ROW.has(def) ? def : '';
    const away = TYPES[x.type].cat === 'abs' || x.type === 'NOS';
    return {
      code: known ? imerCode(st, def) : def,
      key: known || def,
      count: known ? imerCount(st, def) : cfg(st).codes?.[def]?.count || (away ? 'A' : 'P'),
    };
  }
  const post = postOf(s, d, p.id);
  const kind: DutyKind | null = post ? post.kind : s.dutyLog?.[d]?.find((e) => e.pid === p.id)?.kind || null;
  if (kind) return { code: DUTY_CODES[kind], key: 'DUTY', count: imerCount(st, 'DUTY') };
  const pc = postCode(p);
  return pc ? { code: pc, key: 'POST', count: imerCount(st, 'POST') } : null;
}
/** What was written by hand: the code counts like the same code of the table; free text = P. */
export function handCount(st: Pick<Settings, 'imer'>, text: string): { key: string; count: Count } {
  const t = normGreek(text);
  for (const r of IMER_ROWS)
    if (r.edit && normGreek(imerCode(st, r.key)) === t) return { key: r.key, count: imerCount(st, r.key) };
  return { key: text, count: 'P' };
}
/** The text written by hand for a person and a day ('' = nothing). */
export const handOf = (s: Pick<AppState, 'imer'>, d: ISODate, pid: number): string => s.imer?.[d]?.[pid] || '';
/** The cell of a soldier and a day: the hand-written code if any (over the automatic), otherwise the automatic. */
export function cellOf(s: AppState, p: Person, d: ISODate): ImerCell {
  const h = handOf(s, d, p.id);
  if (h) {
    const c = handCount(s.settings, h);
    const a = autoCell(s, p, d);
    return { code: h, key: c.key, count: c.count, hand: true, ...(a ? { auto: a.code } : {}) };
  }
  return autoCell(s, p, d) || { code: '', key: '', count: 'P' };
}

/** The training days (Κανόνες: weekdays with training, without holidays) or all the days; at most 62. */
export function imerDays(
  s: Pick<AppState, 'rules' | 'settings' | 'dayPlan'>,
  from: ISODate,
  to: ISODate,
  all = false,
): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to && out.length < 62; d = addDays(d, 1)) if (all || dayTimes(s, d).train) out.push(d);
  return out;
}
/** The Monday of the week of `d`. */
export const mondayOf = (d: ISODate): ISODate => addDays(d, -((parseD(d).getDay() + 6) % 7));
/** The default: 2 weeks, from the Monday of the previous week to the Sunday of the current one. */
export const imerRange = (today: ISODate, from?: ISODate): { from: ISODate; to: ISODate } => {
  const f = from || addDays(mondayOf(today), -7);
  return { from: f, to: addDays(f, 13) };
};

/** The soldiers of one platoon (ουλαμός) with its name, short name and rooms. */
export interface ImerGroup {
  name: string;
  unit: string;
  rooms: string;
  rows: Person[];
}
/**
 * People per platoon (in the order of the Ρυθμίσεις), alphabetically; inactive ones only if they left on or after the
 * start of the period.
 */
export function imerGroups(s: AppState, from: ISODate): ImerGroup[] {
  const people = s.people.filter((p) => !p.cid && (p.active || (p.outOn && p.outOn >= from)));
  const out: ImerGroup[] = [];
  const sort = (a: Person, b: Person) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first);
  const pls = platoonsOf(s.settings);
  for (const u of pls) {
    const r = u.rooms;
    const rooms = !r.length ? '' : r.length === 1 ? r[0] + 'ος ΘΑΛ' : r[0] + 'ος-' + r[r.length - 1] + 'ος ΘΑΛ';
    out.push({
      name: u.name,
      unit: platoonShort(u.name),
      rooms,
      rows: people.filter((p) => unitOf(p, s.settings) === platoonShort(u.name)).sort(sort),
    });
  }
  const rest = people.filter((p) => !pls.some((u) => unitOf(p, s.settings) === platoonShort(u.name))).sort(sort);
  if (rest.length) out.push({ name: 'Χωρίς ουλαμό', unit: 'Χωρίς ουλαμό', rooms: '', rows: rest });
  return out.filter((g) => g.rows.length);
}
/** The totals of one day: present, absent, and whether to show them. */
export interface ImerTotals {
  p: number;
  a: number;
  show: boolean;
}
/** The totals of a day: empty = Π; the days after today have no totals (only what was already declared shows). */
export const imerTotals = (cells: ImerCell[], d: ISODate, today: ISODate): ImerTotals => {
  const a = cells.filter((c) => c.count === 'A').length;
  return { p: cells.length - a, a, show: d <= today };
};
/** One platoon of the grid: its group, the cells (row per soldier, column per day) and the totals per day. */
export interface ImerPart {
  g: ImerGroup;
  cells: ImerCell[][];
  tot: ImerTotals[];
}
/** The whole grid: the days and the platoons. */
export interface ImerGrid {
  days: ISODate[];
  groups: ImerPart[];
}
/** The grid for a range of days; `only` limits it to one platoon (by its short name). */
export function imerGrid(
  s: AppState,
  from: ISODate,
  to: ISODate,
  all: boolean,
  today: ISODate,
  only = 'all',
): ImerGrid {
  const days = imerDays(s, from, to, all);
  const groups = imerGroups(s, from)
    .filter((g) => only === 'all' || g.unit === only)
    .map((g) => {
      const cells = g.rows.map((p) => days.map((d) => cellOf(s, p, d)));
      return {
        g,
        cells,
        tot: days.map((d, i) =>
          imerTotals(
            cells.map((r) => r[i]),
            d,
            today,
          ),
        ),
      };
    });
  return { days, groups };
}
/** The whole Ίλη: the sum of the platoons. */
export const sumTotals = (parts: ImerTotals[][]): ImerTotals[] =>
  (parts[0] || []).map((_, i) => ({
    p: parts.reduce((a, t) => a + t[i].p, 0),
    a: parts.reduce((a, t) => a + t[i].a, 0),
    show: parts[0][i].show,
  }));
/** The codes offered when a cell is clicked. */
export function handChoices(st: Pick<Settings, 'imer'>): string[] {
  const rows = IMER_ROWS.filter((r) => r.edit && r.key !== DASH).map((r) => imerCode(st, r.key));
  return [
    ...new Set(
      [AA, EE, ...rows, 'ΓΡ', 'ΕΣΤ', DUTY_CODES.th, DUTY_CODES.op, DUTY_CODES.sk, DUTY_CODES.other].map((x) =>
        upper(x),
      ),
    ),
  ];
}
