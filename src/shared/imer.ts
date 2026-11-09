// Ημερολόγιο κωλυομένων-απόντων (Michael, 3/11): ένα κελί ανά στρατιώτη και μέρα εκπαίδευσης, με τον κωδικό της κατάστασής του.
// Το γεμίζει μόνη της η εφαρμογή (άδειες, ιατρικά, υπηρεσίες, πόστα) και ό,τι γράφεις με το χέρι (AppState.imer) μένει πάνω από
// το αυτόματο, μόνο στο ημερολόγιο. Τα σύνολα Π (παρόντες) και Α (απόντες) βγαίνουν από το «Μετρά ως» κάθε κωδικού.
import { addDays, parseD, type ISODate } from '../core/lib/dates';
import { KIND_CODE, type DutyKind } from '../core/model/duty';
import { TYPES } from '../core/model/status';
import { platoonsOf, unitOf } from '../core/model/settingsAccess';
import { platoonShort } from '../core/model/rooms';
import type { AppState } from '../core/model/state';
import type { Person } from '../core/model/person';
import type { Settings } from '../core/model/settings';
import { dayStatus, codeOfStatus } from './dayCode';
import { postOf } from './rules';
import { dayTimes } from './returns';
import { collator, normGreek, upper } from '../core/lib/text';
import type { ImerSettings, ImerTitle, ImerSheets, Count } from '../core/model/documents';
export type { ImerSettings, ImerCodeSet, ImerSheets, ImerTitle, Count } from '../core/model/documents';

export interface ImerReq {
  from: ISODate;
  to: ISODate;
  all?: boolean;
}
export const IMER_TITLES: Record<ImerTitle, string> = {
  imer: 'ΗΜΕΡΟΛΟΓΙΟ ΚΩΛΥΟΜΕΝΩΝ-ΑΠΟΝΤΩΝ',
  ekp: 'ΔΥΝΑΜΟΛΟΓΙΟ ΕΚΠΑΙΔΕΥΣΗΣ',
};
export const AA = 'Α/Α',
  EE = 'Ε/Ε',
  DASH = '-';
// Οι κωδικοί του πίνακα «Κωδικοί…»: key = ο προεπιλεγμένος κωδικός (ή DUTY/POST για τις υπηρεσίες και τα πόστα)
// edit: ο κωδικός αλλάζει από τον χρήστη (οι υπηρεσίες και τα πόστα βγαίνουν από τις Ρυθμίσεις)
export interface ImerRow {
  key: string;
  label: string;
  def: string;
  count: Count;
  from: string;
  edit: boolean;
}
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
// κωδικός υπηρεσίας ανά είδος: τα γράμματα του ημερολογίου (όχι του ελέγχου υπηρεσιών: Σ, Υ)
export const DUTY_CODES: Record<DutyKind, string> = { ...KIND_CODE, sk: 'ΣΚ', other: 'ΠΕΡ' };
const cfg = (st: Pick<Settings, 'imer'>): ImerSettings => st.imer || {};
export const imerCode = (st: Pick<Settings, 'imer'>, key: string): string => {
  const r = ROW.get(key);
  return (r?.edit && cfg(st).codes?.[key]?.code?.trim()) || r?.def || key;
};
export const imerCount = (st: Pick<Settings, 'imer'>, key: string, dflt: Count = 'P'): Count =>
  cfg(st).codes?.[key]?.count || ROW.get(key)?.count || dflt;
export const imerTitle = (st: Pick<Settings, 'imer'>) => IMER_TITLES[cfg(st).title === 'ekp' ? 'ekp' : 'imer'];
export const imerSheets = (st: Pick<Settings, 'imer'>): ImerSheets => {
  const v = cfg(st).sheets;
  return v === 'all' || v === 'both' ? v : 'unit';
};

export interface ImerCell {
  code: string;
  key: string;
  count: Count;
  hand?: boolean;
  auto?: string;
}
// ο πόστος που φαίνεται ως κωδικός: ΓΡ (γραφέας), ΕΣΤ (εστιάτορας)
export function postCode(p: Pick<Person, 'post' | 'role'>): string {
  const t = normGreek((p.post || '') + ' ' + (p.role || ''));
  return /ΓΡΑΦΕΑΣ|ΓΡΑΦΕΙΟ/.test(t) ? 'ΓΡ' : /ΕΣΤΙΑΤΟΡ/.test(t) ? 'ΕΣΤ' : '';
}
// ο κωδικός που βγαίνει μόνος του, με σειρά προτεραιότητας (ο πρώτος κερδίζει): πριν την κατάταξη / μετά τη διαγραφή «-»,
// άδεια/νοσοκομείο, ΣΤΕΠ, ιατρικό (dayCode.ts), υπηρεσία της μέρας, πόστο· αλλιώς κενό (= στην εκπαίδευση)
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
// ό,τι γράφτηκε με το χέρι: ο κωδικός μετριέται όπως ο ίδιος κωδικός του πίνακα· ελεύθερο κείμενο = Π
export function handCount(st: Pick<Settings, 'imer'>, text: string): { key: string; count: Count } {
  const t = normGreek(text);
  for (const r of IMER_ROWS)
    if (r.edit && normGreek(imerCode(st, r.key)) === t) return { key: r.key, count: imerCount(st, r.key) };
  return { key: text, count: 'P' };
}
export const handOf = (s: Pick<AppState, 'imer'>, d: ISODate, pid: number): string => s.imer?.[d]?.[pid] || '';
export function cellOf(s: AppState, p: Person, d: ISODate): ImerCell {
  const h = handOf(s, d, p.id);
  if (h) {
    const c = handCount(s.settings, h);
    const a = autoCell(s, p, d);
    return { code: h, key: c.key, count: c.count, hand: true, ...(a ? { auto: a.code } : {}) };
  }
  return autoCell(s, p, d) || { code: '', key: '', count: 'P' };
}

// οι μέρες εκπαίδευσης (Κανόνες: ημέρες εβδομάδας με εκπαίδευση, χωρίς αργίες) ή όλες οι μέρες
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
// Δευτέρα της εβδομάδας του d
export const mondayOf = (d: ISODate): ISODate => addDays(d, -((parseD(d).getDay() + 6) % 7));
// η προεπιλογή: 2 εβδομάδες, από τη Δευτέρα της προηγούμενης ως την Κυριακή της τρέχουσας
export const imerRange = (today: ISODate, from?: ISODate): { from: ISODate; to: ISODate } => {
  const f = from || addDays(mondayOf(today), -7);
  return { from: f, to: addDays(f, 13) };
};

export interface ImerGroup {
  name: string;
  unit: string;
  rooms: string;
  rows: Person[];
}
// άτομα ανά ουλαμό (με τη σειρά των Ρυθμίσεων), αλφαβητικά· ανενεργοί μόνο αν βγήκαν μέσα ή μετά την αρχή της περιόδου
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
export interface ImerTotals {
  p: number;
  a: number;
  show: boolean;
}
// τα σύνολα μιας μέρας: κενό = Π· οι μέρες μετά το σήμερα δεν έχουν σύνολα (φαίνεται μόνο ό,τι έχει ήδη δηλωθεί)
export const imerTotals = (cells: ImerCell[], d: ISODate, today: ISODate): ImerTotals => {
  const a = cells.filter((c) => c.count === 'A').length;
  return { p: cells.length - a, a, show: d <= today };
};
export interface ImerPart {
  g: ImerGroup;
  cells: ImerCell[][];
  tot: ImerTotals[];
}
export interface ImerGrid {
  days: ISODate[];
  groups: ImerPart[];
}
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
// όλη η Ίλη: άθροισμα των ουλαμών
export const sumTotals = (parts: ImerTotals[][]): ImerTotals[] =>
  (parts[0] || []).map((_, i) => ({
    p: parts.reduce((a, t) => a + t[i].p, 0),
    a: parts.reduce((a, t) => a + t[i].a, 0),
    show: parts[0][i].show,
  }));
// οι κωδικοί που προτείνονται όταν πατάς κελί
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
