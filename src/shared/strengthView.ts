// Σελίδα Δύναμη (Michael, 26/10): Παρόντες + Κωλυόμενοι + Απόντες = Δύναμη, με ομάδες και υποομάδες ανά άτομο.
// Κωλυόμενοι εδώ = μόνο οι δηλωμένοι (Status KOL) που αφαιρούνται από τους παρόντες, σε υποομάδες ανά δηλωμένη υπηρεσία (το κείμενο της
// δήλωσης: «Υπηρεσία ΣΤΕΠ», Συνοδεία…), με τη στήλη της ΗΚΑΙ σε κάθε γραμμή (tag). Όσοι έχουν δική μας υπηρεσία, ΕΥ, ποινή, ιατρικό ή δηλωμένο
// κωλυόμενο χωρίς αφαίρεση μένουν Παρόντες, με δική τους υποομάδα. Η εισαγωγή ΣΤΕΠ είναι κωλυόμενος αυτόματα (Michael, 29/10): στους Κωλυόμενους,
// στη δική της υποομάδα «Εισαγωγή ΣΤΕΠ» (όχι ανά σημείωση), με τη στήλη STEP_COL της ΗΚΑΙ μόνο αν έχει (τώρα πουθενά, χωρίς ετικέτα). Η ΗΚΑΙ κρατά τον δικό της ορισμό κωλυομένων (hkaiCounts, kolView.cols).
// Ίδια στιγμή και ίδιοι κανόνες με το strengthOf (statusesAt), ώστε τα νούμερα να βγαίνουν ίδια με το «Σήμερα».
import { TYPES, TYPE_KEYS, kolColName, type AppState, type Person, type Status } from './domain';
import { dm, type ISODate } from './dates';
import { hasTimes } from './hours';
import { activePeople, kolView, statusesAt, type KolRow } from './rules';
import { leaveBack, outHeldBy, retLine, returnOf, type Ret } from './returns';
import { statusLbl } from './ranks';
import { collator, norm } from './text';
import { dutyAt, outLbl } from './weekend';

export type SvCat = 'present' | 'kol' | 'away';
export interface SvRow { p: Person; what: string; tone: string; range: string; ret: string; retBad: boolean; tag?: string }
export interface SvGroup { key: string; label: string; tip?: string; rows: SvRow[] }
export interface SvCatView { cat: SvCat; label: string; n: number; groups: SvGroup[] }
export interface StrengthView { date: ISODate; at: number; time: string; total: number; present: number; kol: number; absent: number; cats: Record<SvCat, SvCatView>; line: string }

export const hhmm = (m: number) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const AWAY_LBL: Record<string, string> = { NOS: 'Νοσοκομείο', LEAVE: 'Άδειες (ΚΑ)', HON: 'Τιμητική άδεια', SICK: 'Αναρρωτικές', OUT: 'Εξοδούχοι', DN: 'ΔΝ' };
// υποομάδες των παρόντων, με τη σειρά που φαίνονται· ο καθένας μπαίνει στην πρώτη που ταιριάζει (σαν τη στήλη της ΗΚΑΙ)
const PRESENT_SUBS: [string, string, string?][] = [
  ['keep', 'Κωλυόμενοι (παρόντες)', 'Δηλωμένοι κωλυόμενοι που δεν αφαιρούνται από τους παρόντες'],
  ['duty', 'Σε υπηρεσία', 'Δική μας υπηρεσία της μέρας'], ['ey', 'ΕΥ'], ['pun', 'Τιμωρημένοι'], ['med', 'Άλλα ιατρικά (ΕΑ, ΕΟ…)'], ['rest', 'Υπόλοιποι']
];
// από–έως με τις ώρες όπου υπάρχουν: «24/10–26/10», «24/10 08:00–12:00», «από 24/10 (χωρίς λήξη)»
export function spanTxt(x: Pick<Status, 'type' | 'from' | 'to' | 'fromTime' | 'toTime' | 'open'>): string {
  const ft = hasTimes(x.type) && x.fromTime ? ' ' + x.fromTime : '', tt = hasTimes(x.type) && x.toTime ? ' ' + x.toTime : '';
  if (x.open) return 'από ' + dm(x.from) + ft + ' (χωρίς λήξη)';
  if (x.from === x.to) return dm(x.from) + (ft || tt ? ' ' + (ft.trim() || '…') + '–' + (tt.trim() || '…') : '');
  return dm(x.from) + ft + '–' + dm(x.to) + tt;
}
const what = (s: AppState, x: Status) => {
  const base = TYPES[x.type].cat === 'out' ? outLbl(x) : statusLbl(x, s.settings.lists);
  const kind = x.type === 'LEAVE' && x.kind && x.kind !== 'Κανονική' ? x.kind : '';
  return [base, kind, x.type !== 'KOL' && x.note?.trim()].filter(Boolean).join(' · ');
};
const retKey = (r: Ret | null) => (!r ? '9' : r.open ? '9' : r.day + (r.duty ? '0' : r.pending ? '2' : '1') + (r.time || '23:59'));
// Υποομάδες ανά δηλωμένη υπηρεσία: ίδιο κείμενο (χωρίς τόνους, πεζά/κεφαλαία, κενά) = μία ομάδα· πρώτες οι μεγαλύτερες, μετά κατά όνομα
const STEP_LBL = TYPES.STEP.long;   // «Εισαγωγή ΣΤΕΠ»
const NO_DESC = 'Χωρίς περιγραφή';
const svcKey = (st: Status) => 'svc:' + norm(st.note).replace(/\s+/g, ' ');
const svcLbl = (st: Status) => st.note?.trim().replace(/\s+/g, ' ') || NO_DESC;
const bySvc = (m: Map<string, { label: string; rows: SvRow[] }>, pre = ''): SvGroup[] =>
  [...m].map(([key, g]) => ({ key, label: pre + g.label, rows: g.rows })).sort((a, b) => b.rows.length - a.rows.length || collator.compare(a.label, b.label));
const cmp = (a: Person, b: Person) => a.last.localeCompare(b.last, 'el') || a.first.localeCompare(b.first, 'el');

export function strengthView(s: AppState, date: ISODate, at: number): StrengthView {
  const kv = kolView(s, date, at);
  const minus = new Map<number, KolRow>(kv.minus.map(x => [x.p.id, x])), keep = new Map<number, KolRow>(kv.keep.map(x => [x.p.id, x]));
  const col = new Map<number, string>(); for (const k in kv.cols) kv.cols[k].forEach(p => col.set(p.id, k));
  const away = new Map<string, { row: SvRow; key: string }[]>(), kolG = new Map<string, { label: string; rows: SvRow[] }>(), keepG = new Map<string, { label: string; rows: SvRow[] }>(), pres = new Map<string, SvRow[]>();
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
  let total = 0, present = 0, kol = 0, absent = 0;
  for (const p of activePeople(s)) {
    total++;
    const ss = statusesAt(s, p.id, date, at), a = ss.find(x => TYPES[x.type].away);
    if (a) {
      absent++;
      // εξοδούχος/ΔΝ: από την επιστροφή που τον κρατά έξω· άδεια/νοσοκομείο: από τη λήξη της
      const h = TYPES[a.type].cat === 'out' ? outHeldBy(s, p.id, date, at) : null;
      const r = TYPES[a.type].cat === 'out' ? (h && h.r) || returnOf(s, p.id, date) || leaveBack(s, p.id, date) : leaveBack(s, p.id, date);
      push(away, a.type, { key: retKey(r), row: { p, what: what(s, a), tone: TYPES[a.type].tone, range: spanTxt(a), ret: retLine(r), retBad: !!(r.duty || r.pending) } });
      continue;
    }
    const m = minus.get(p.id);
    if (m) {
      kol++;
      const step = m.st.type === 'STEP', k = step ? 'step' : svcKey(m.st), g = kolG.get(k) || { label: step ? STEP_LBL : svcLbl(m.st), rows: [] };
      g.rows.push({ p, what: step ? [STEP_LBL, m.st.note?.trim()].filter(Boolean).join(' · ') : m.st.note?.trim() || 'Κωλυόμενος', tone: TYPES.KOL.tone, range: spanTxt(m.st), ret: '', retBad: false, tag: m.col ? kolColName(m.col) : undefined }); kolG.set(k, g);
      continue;
    }
    present++;
    const duty = dutyAt(s, date, p.id), c = col.get(p.id), kp = keep.get(p.id);
    const sub = kp ? 'keep' : c === 'yp' || c === 'mag' ? 'duty' : c === 'ey' ? 'ey' : c === 'tim' ? 'pun'
      : ss.some(x => TYPES[x.type].cat === 'med') ? 'med' : 'rest';
    // τι έχει: όλες οι καταστάσεις του και η υπηρεσία του· το πρώτο δίνει το χρώμα
    const labels = [...ss.map(x => what(s, x)), ...(duty ? [duty.label + (duty.time ? ' ' + duty.time : '')] : [])];
    const main = kp?.st || ss[0];
    const row: SvRow = { p, what: labels.join(' · '), tone: main ? TYPES[main.type].tone : 'ok', range: main ? spanTxt(main) : '', ret: '', retBad: false };
    if (kp) { const k = svcKey(kp.st), g = keepG.get(k) || { label: svcLbl(kp.st), rows: [] }; g.rows.push(row); keepG.set(k, g); } else push(pres, sub, row);
  }
  const sorted = (rows: SvRow[]) => rows.sort((x, y) => cmp(x.p, y.p));
  const grp = (cat: SvCat, label: string, groups: SvGroup[]): SvCatView => ({ cat, label, n: groups.reduce((n, g) => n + g.rows.length, 0), groups });
  const awayG: SvGroup[] = TYPE_KEYS.filter(k => away.has(k)).map(k => ({ key: k, label: AWAY_LBL[k] || TYPES[k].label, rows: away.get(k)!.sort((x, y) => x.key.localeCompare(y.key) || cmp(x.row.p, y.row.p)).map(x => x.row) }));
  const kolGroups = bySvc(kolG).map(g => ({ ...g, rows: sorted(g.rows) }));
  const presG: SvGroup[] = PRESENT_SUBS.flatMap(([key, label, tip]): SvGroup[] => key === 'keep'
    ? bySvc(keepG, label + ': ').map(g => ({ ...g, key: 'keep:' + g.key, tip, rows: sorted(g.rows) }))
    : pres.has(key) ? [{ key, label, tip, rows: sorted(pres.get(key)!) }] : []);
  const cats = { present: grp('present', 'Παρόντες', presG), kol: grp('kol', 'Κωλυόμενοι', kolGroups), away: grp('away', 'Απόντες', awayG) };
  return { date, at, time: hhmm(at), total, present, kol, absent, cats, line: present + ' + ' + kol + ' + ' + absent + ' = ' + total + ' · στις ' + hhmm(at) };
}
