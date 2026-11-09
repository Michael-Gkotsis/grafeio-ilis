// The page Δύναμη (Michael, 26/10): Παρόντες + Κωλυόμενοι + Απόντες = Δύναμη, with groups and subgroups per person.
//
// Purpose: `strengthView` (the three categories with their groups and rows, and the line «Π + Κ + Α = Σ · στις ΩΩ:ΛΛ»),
//   `sheetTotals` (the numbers under the ΣΥΝΟΛΙΚΟ table), and the small helpers `spanTxt` and `hhmm`.
// Does NOT: write anything, or define who is prevented for the ΗΚΑΙ (the ΗΚΑΙ keeps its own definition of the
//   prevented, `hkaiCounts`, `kolView.cols`).
// Owner layer: core/outs (no fs, no Electron, no React); imports core/duty (presence, kolyomenoi), core/people.
// Why: the same moment and the same rules as `strengthOf` (`statusesAt`), so that the numbers equal those of «Σήμερα».
//   The prevented here are only the declared ones (Status KOL) that are taken off the present, in subgroups per
//   declared duty (the text of the declaration: «Υπηρεσία ΣΤΕΠ», Συνοδεία…), with the ΗΚΑΙ column on each row
//   (`tag`). Those who have a duty of ours, ΕΥ, a penalty, a medical status or a declared prevented without
//   subtraction stay Παρόντες, each in a subgroup of their own. Εισαγωγή ΣΤΕΠ is prevented automatically: in
//   Κωλυόμενοι, in its own subgroup «Εισαγωγή ΣΤΕΠ» (not per note), with the ΗΚΑΙ column
//   `STEP_COL` only if it has one (now nowhere, without a label).
//   @decision Michael 29/10: Εισαγωγή ΣΤΕΠ is prevented automatically.
// Covering tests: test/strength-view.test.ts, test/strength-consistency.test.ts, test/step-col.test.ts,
//   test/own-leave-modes.test.ts.
import { TYPES, TYPE_KEYS, type Status } from '../model/status';
import { kolColName } from '../model/kol';
import type { AppState } from '../model/state';
import type { Person } from '../model/person';
import { dm, type ISODate } from '../lib/dates';
import { hasTimes } from '../statuses/hours';
import { activePeople } from '../duty/indexes';
import { kolView, type KolRow } from '../duty/kolyomenoi';
import { statusesAt } from '../duty/presence';
import { leaveBack, outHeldBy, returnOf, type Ret } from './returns';
import { retLine } from './retText';
import { isAway, leaveMode, statusLbl } from '../people/kinds';
import { collator, norm } from '../lib/text';
import { dutyAt, outLbl } from './weekend';

/** The three categories of the page: present, prevented, away. */
export type SvCat = 'present' | 'kol' | 'away';
/** One person row: what they have, its colour, the span, the return (and whether it is bad) and the ΗΚΑΙ column tag. */
export interface SvRow {
  p: Person;
  what: string;
  tone: string;
  range: string;
  ret: string;
  retBad: boolean;
  tag?: string;
}
/** A group of rows with its key, label and optional tooltip. */
export interface SvGroup {
  key: string;
  label: string;
  tip?: string;
  rows: SvRow[];
}
/** A category with its count and groups. */
export interface SvCatView {
  cat: SvCat;
  label: string;
  n: number;
  groups: SvGroup[];
}
/** The whole page: the moment, the four numbers, the three categories and the line «Π + Κ + Α = Σ · στις ΩΩ:ΛΛ». */
export interface StrengthView {
  date: ISODate;
  at: number;
  time: string;
  total: number;
  present: number;
  kol: number;
  absent: number;
  cats: Record<SvCat, SvCatView>;
  line: string;
}

/** Minutes from midnight as «ΩΩ:ΛΛ» (hours taken modulo 24). */
export const hhmm = (m: number) =>
  String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const AWAY_LBL: Record<string, string> = {
  NOS: 'Νοσοκομείο',
  LEAVE: 'Άδειες',
  HON: 'Τιμητική άδεια',
  SICK: 'Αναρρωτικές',
  OUT: 'Εξοδούχοι',
  DN: 'ΔΝ',
};
// Subgroups of the present, in the order they show; each person goes into the first that fits (like the ΗΚΑΙ column)
const PRESENT_SUBS: [string, string, string?][] = [
  ['keep', 'Κωλυόμενοι (παρόντες)', 'Δηλωμένοι κωλυόμενοι που δεν αφαιρούνται από τους παρόντες'],
  ['duty', 'Σε υπηρεσία', 'Δική μας υπηρεσία της μέρας'],
  ['ey', 'ΕΥ'],
  ['pun', 'Τιμωρημένοι'],
  ['med', 'Άλλα ιατρικά (ΕΑ, ΕΟ…)'],
  ['rest', 'Υπόλοιποι'],
];
/**
 * From-to with the times where there are some: «24/10–26/10», «24/10 08:00–12:00», «από 24/10 (χωρίς λήξη)».
 */
export function spanTxt(x: Pick<Status, 'type' | 'from' | 'to' | 'fromTime' | 'toTime' | 'open'>): string {
  const ft = hasTimes(x.type) && x.fromTime ? ' ' + x.fromTime : '',
    tt = hasTimes(x.type) && x.toTime ? ' ' + x.toTime : '';
  if (x.open) return 'από ' + dm(x.from) + ft + ' (χωρίς λήξη)';
  if (x.from === x.to) return dm(x.from) + (ft || tt ? ' ' + (ft.trim() || '…') + '–' + (tt.trim() || '…') : '');
  return dm(x.from) + ft + '–' + dm(x.to) + tt;
}
// statusLbl already says the kind of the leave (@decision Michael 3/11): it is not written again
const what = (s: AppState, x: Status) => {
  const base = TYPES[x.type].cat === 'out' ? outLbl(x) : statusLbl(x, s.settings.lists);
  return [base, x.type !== 'KOL' && x.note?.trim()].filter(Boolean).join(' · ');
};
const retKey = (r: Ret | null) =>
  !r ? '9' : r.open ? '9' : r.day + (r.duty ? '0' : r.pending ? '2' : '1') + (r.time || '23:59');
// Subgroups per declared duty: the same text (accents, case, spaces ignored) = one group; larger first, then by name
const STEP_LBL = TYPES.STEP.long; // «Εισαγωγή ΣΤΕΠ»
const NO_DESC = 'Χωρίς περιγραφή';
const svcKey = (st: Status) => 'svc:' + norm(st.note).replace(/\s+/g, ' ');
const svcLbl = (st: Status) => st.note?.trim().replace(/\s+/g, ' ') || NO_DESC;
const bySvc = (m: Map<string, { label: string; rows: SvRow[] }>, pre = ''): SvGroup[] =>
  [...m]
    .map(([key, g]) => ({ key, label: pre + g.label, rows: g.rows }))
    .sort((a, b) => b.rows.length - a.rows.length || collator.compare(a.label, b.label));
const cmp = (a: Person, b: Person) => a.last.localeCompare(b.last, 'el') || a.first.localeCompare(b.first, 'el');

/**
 * The strength at `date` and minute `at`: present + prevented + away = strength.
 * @param at minutes from midnight, local time
 */
export function strengthView(s: AppState, date: ISODate, at: number): StrengthView {
  const kv = kolView(s, date, at);
  const minus = new Map<number, KolRow>(kv.minus.map((x) => [x.p.id, x])),
    keep = new Map<number, KolRow>(kv.keep.map((x) => [x.p.id, x]));
  const col = new Map<number, string>();
  for (const k in kv.cols) kv.cols[k].forEach((p) => col.set(p.id, k));
  const away = new Map<string, { row: SvRow; key: string }[]>(),
    kolG = new Map<string, { label: string; rows: SvRow[] }>(),
    keepG = new Map<string, { label: string; rows: SvRow[] }>(),
    pres = new Map<string, SvRow[]>(),
    plLbl = new Map<string, string>();
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => {
    const l = m.get(k);
    if (l) l.push(v);
    else m.set(k, [v]);
  };
  let total = 0,
    present = 0,
    kol = 0,
    absent = 0;
  for (const p of activePeople(s)) {
    total++;
    const ss = statusesAt(s, p.id, date, at),
      a = ss.find((x) => isAway(x, s.settings.lists));
    if (a) {
      absent++;
      // out / ΔΝ: from the return that holds the person out; leave / hospital: from its end
      const h = TYPES[a.type].cat === 'out' ? outHeldBy(s, p.id, date, at) : null;
      const r =
        TYPES[a.type].cat === 'out'
          ? (h && h.r) || returnOf(s, p.id, date) || leaveBack(s, p.id, date)
          : leaveBack(s, p.id, date);
      push(away, a.type, {
        key: retKey(r),
        row: {
          p,
          what: what(s, a),
          tone: TYPES[a.type].tone,
          range: spanTxt(a),
          ret: retLine(r),
          retBad: !!(r.duty || r.pending),
        },
      });
      continue;
    }
    const m = minus.get(p.id);
    if (m) {
      kol++;
      // a leave of the user's own kind with a prevented column: a subgroup named after the kind (Michael, 3/11)
      const step = m.st.type === 'STEP',
        lv = m.st.type === 'LEAVE',
        lvl = lv ? statusLbl(m.st, s.settings.lists) : '';
      const k = step ? 'step' : lv ? 'leave:' + norm(lvl) : svcKey(m.st),
        g = kolG.get(k) || { label: step ? STEP_LBL : lv ? lvl : svcLbl(m.st), rows: [] };
      g.rows.push({
        p,
        what: step
          ? [STEP_LBL, m.st.note?.trim()].filter(Boolean).join(' · ')
          : lv
            ? what(s, m.st)
            : m.st.note?.trim() || 'Κωλυόμενος',
        tone: TYPES.KOL.tone,
        range: spanTxt(m.st),
        ret: '',
        retBad: false,
        tag: m.col ? kolColName(m.col) : undefined,
      });
      kolG.set(k, g);
      continue;
    }
    present++;
    const duty = dutyAt(s, date, p.id),
      c = col.get(p.id),
      kp = keep.get(p.id);
    // a leave of the user's own kind «Πουθενά» (present): a subgroup «Με <kind>» before the rest (Michael, 3/11)
    const pl = ss.find((x) => x.type === 'LEAVE' && leaveMode(x, s.settings.lists) === 'present');
    const sub = kp
      ? 'keep'
      : c === 'yp' || c === 'mag'
        ? 'duty'
        : c === 'ey'
          ? 'ey'
          : c === 'tim'
            ? 'pun'
            : ss.some((x) => TYPES[x.type].cat === 'med')
              ? 'med'
              : pl
                ? 'pl:' + norm(statusLbl(pl, s.settings.lists))
                : 'rest';
    if (sub.startsWith('pl:')) plLbl.set(sub, 'Με ' + statusLbl(pl!, s.settings.lists));
    // what the person has: all their statuses and their duty; the first one gives the colour
    const labels = [...ss.map((x) => what(s, x)), ...(duty ? [duty.label + (duty.time ? ' ' + duty.time : '')] : [])];
    const main = kp?.st || ss[0];
    const row: SvRow = {
      p,
      what: labels.join(' · '),
      tone: main ? TYPES[main.type].tone : 'ok',
      range: main ? spanTxt(main) : '',
      ret: '',
      retBad: false,
    };
    if (kp) {
      const k = svcKey(kp.st),
        g = keepG.get(k) || { label: svcLbl(kp.st), rows: [] };
      g.rows.push(row);
      keepG.set(k, g);
    } else push(pres, sub, row);
  }
  const sorted = (rows: SvRow[]) => rows.sort((x, y) => cmp(x.p, y.p));
  const grp = (cat: SvCat, label: string, groups: SvGroup[]): SvCatView => ({
    cat,
    label,
    n: groups.reduce((n, g) => n + g.rows.length, 0),
    groups,
  });
  const awayG: SvGroup[] = TYPE_KEYS.filter((k) => away.has(k)).map((k) => ({
    key: k,
    label: AWAY_LBL[k] || TYPES[k].label,
    rows: away
      .get(k)!
      .sort((x, y) => x.key.localeCompare(y.key) || cmp(x.row.p, y.row.p))
      .map((x) => x.row),
  }));
  const kolGroups = bySvc(kolG).map((g) => ({ ...g, rows: sorted(g.rows) }));
  const presG: SvGroup[] = PRESENT_SUBS.flatMap(([key, label, tip]): SvGroup[] =>
    key === 'keep'
      ? bySvc(keepG, label + ': ').map((g) => ({ ...g, key: 'keep:' + g.key, tip, rows: sorted(g.rows) }))
      : key === 'rest'
        ? [...plLbl]
            .sort((a, b) => collator.compare(a[1], b[1]))
            .map(([k, l]) => ({ key: k, label: l, rows: sorted(pres.get(k)!) }))
            .concat(pres.has(key) ? [{ key, label, rows: sorted(pres.get(key)!) }] : [])
        : pres.has(key)
          ? [{ key, label, tip, rows: sorted(pres.get(key)!) }]
          : [],
  );
  const cats = {
    present: grp('present', 'Παρόντες', presG),
    kol: grp('kol', 'Κωλυόμενοι', kolGroups),
    away: grp('away', 'Απόντες', awayG),
  };
  return {
    date,
    at,
    time: hhmm(at),
    total,
    present,
    kol,
    absent,
    cats,
    line: present + ' + ' + kol + ' + ' + absent + ' = ' + total + ' · στις ' + hhmm(at),
  };
}

/** The numbers under the ΣΥΝΟΛΙΚΟ table (ΣΤΕΠ, sick, leave, hospital): exactly those of the groups of Δύναμη. */
export interface SheetTotals {
  step: number;
  sick: number;
  leave: number;
  hosp: number;
}
/** See `SheetTotals`; counted from `strengthView` so that the two always agree. */
export function sheetTotals(s: AppState, date: ISODate, at: number): SheetTotals {
  const v = strengthView(s, date, at);
  const n = (cat: SvCat, ...keys: string[]) =>
    v.cats[cat].groups.filter((g) => keys.includes(g.key)).reduce((t, g) => t + g.rows.length, 0);
  return { step: n('kol', 'step'), sick: n('away', 'SICK'), leave: n('away', 'LEAVE', 'HON'), hosp: n('away', 'NOS') };
}
