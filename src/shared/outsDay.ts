// «Όλη η δύναμη» (Michael, 30/10): κάθε άτομο της δύναμης μία φορά, σε μία ομάδα, και το άθροισμα κλείνει (Α + Β + Γ = ενεργοί).
//  Α. βγαίνουν σήμερα (ήταν μέσα): A1 ΔΝ, A2 εξοδούχοι, A3 φεύγουν για άδεια
//  Β. είναι ήδη έξω (έφυγαν πριν): B1 άδεια, B2 νοσοκομείο, B3 ΔΝ/έξοδος από χθες που δεν γύρισε
//  Γ. μένουν μέσα απόψε: G1 υπηρεσία, G2 ποινή, G3 ΣΤΕΠ/κωλυόμενοι/ιατρικά, G4 γυρίζουν σήμερα και μένουν, G5 δεν βγήκαν
// Οι κανόνες ταξινόμησης έχουν σειρά προτεραιότητας και βγαίνουν μόνο από τις συναρτήσεις που ήδη χρησιμοποιούν η οθόνη και τα άλλα Excel
// (returnOf, leaveEnd, retFor, stillOut, outHeldBy, postOf, statusesFrom, dayTimes): μία πηγή. Ελέγχονται στα test/outs-day.test.ts και outs-combos.test.ts.
import type { ISODate } from './dates';
import { addDays, dm } from './dates';
import { TYPES, type AppState, type Person, type Status } from './domain';
import { mins } from './hours';
import { activePeople, outMin, postOf, statusesFrom, statusesOn } from './rules';
import { dayTimes, leaveEnd, leaveOut, outHeldBy, retDay, retFor, retOrd, returnOf, stillOut, type Ret } from './returns';
import { byRoom } from './outsStay';
import { statNoOut } from './stat';
import { dutyAt } from './weekend';
import { upper } from './text';

export type DayGroup = 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'B3' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5';
// st: η έξοδος/ΔΝ της μέρας (αλλιώς η άδεια, ή η έξοδος/ΔΝ που κρατά ακόμα έξω)· lv: η άδεια/νοσοκομείο της μέρας· warn: ΠΡΟΣΟΧΗ για το γραφείο
export interface DayRow { p: Person; g: DayGroup; r: Ret | null; why: string; st?: Status; lv?: Status; warn?: string }
// Οι ομάδες με τη σειρά του εντύπου: [ομάδα, ενότητα Α/Β/Γ, τίτλος]
export const DAY_GROUPS: [DayGroup, 'A' | 'B' | 'G', string][] = [
  ['A1', 'A', 'ΜΕ ΔΝ'], ['A2', 'A', 'ΕΞΟΔΟΥΧΟΙ'], ['A3', 'A', 'ΦΕΥΓΟΥΝ ΓΙΑ ΑΔΕΙΑ'],
  ['B1', 'B', 'ΣΕ ΑΔΕΙΑ'], ['B2', 'B', 'ΝΟΣΟΚΟΜΕΙΟ'], ['B3', 'B', 'ΔΝ ΑΠΟ ΧΘΕΣ / ΔΕΝ ΓΥΡΙΣΑΝ'],
  ['G1', 'G', 'ΥΠΗΡΕΣΙΑ'], ['G2', 'G', 'ΠΟΙΝΗ'], ['G3', 'G', 'ΣΤΕΠ / ΚΩΛΥΟΜΕΝΟΙ / ΙΑΤΡΙΚΑ'], ['G4', 'G', 'ΓΥΡΙΖΟΥΝ ΣΗΜΕΡΑ ΚΑΙ ΜΕΝΟΥΝ'], ['G5', 'G', 'ΔΕΝ ΒΓΗΚΑΝ']
];
const awayOn = (s: AppState, pid: number, d: ISODate) => statusesOn(s.statuses, pid, d).filter(y => TYPES[y.type].away && !y.pending);
const isOut = (x: Status) => TYPES[x.type].cat === 'out';
// πότε γύρισε ο ΔΝ/εξοδούχος της μέρας x (και όταν εκείνη τη μέρα τελείωνε και άδεια: leaveEnd)
const back = (s: AppState, pid: number, x: ISODate) => returnOf(s, pid, x) ?? leaveEnd(s, pid, x, awayOn(s, pid, x))?.r ?? null;

export function dayBook(s: AppState, d: ISODate): DayRow[] {
  const y = addDays(d, -1), T = mins(dayTimes(s, d).out), rows: DayRow[] = [];
  for (const p of activePeople(s)) {
    const now = awayOn(s, p.id, d), outs = now.filter(isOut), lv = now.filter(x => !isOut(x));
    const R = (g: DayGroup, r: Ret | null, why = '', x: Partial<DayRow> = {}) => rows.push({ p, g, r, why, ...x });
    // με υπηρεσία ΚΑΙ έξοδο/ΔΝ (παρά τους κανόνες) μένει εξοδούχος, με προειδοποίηση
    const duty = () => { const u = dutyAt(s, d, p.id); return u ? { warn: 'ΠΡΟΣΟΧΗ: ΚΑΙ ΥΠΗΡΕΣΙΑ ' + upper(u.label) + (u.time ? ' ' + u.time : '') } : {}; };
    if (lv.length) {
      const r = retFor(s, p.id, d);
      const atT = statusesFrom(s.statuses, p.id, d, T).filter(x => TYPES[x.type].away && !isOut(x) && !x.pending);
      if (outs.length) {
        const o = outs.find(x => x.type === 'DN') || outs[0];
        // η άδεια τελειώνει σήμερα και σήμερα έξοδος/ΔΝ (leaveOut, κανόνας 26/10), ή έχει τελειώσει πριν την έξοδο: εξοδούχος/ΔΝ της μέρας,
        // όπως στη Δύναμη (Michael, 30/10: άδεια ως 22:00 και εξοδούχος ήταν «σε άδεια»)
        if (leaveOut(s, p.id, d, T) || !atT.length) { R(o.type === 'DN' ? 'A1' : 'A2', r, 'τέλος άδειας + έξοδος', { st: o, lv: lv[0], ...duty() }); continue; }
        R(lv.some(x => x.type === 'NOS') ? 'B2' : 'B1', r, 'άδεια + έξοδος', { st: o, lv: lv[0] }); continue;
      }
      if (!atT.length) { R('G4', r, 'γύρισε πριν την έξοδο', { lv: lv[0] }); continue; }
      const l = atT.find(x => x.type === 'NOS') || atT[0];
      const yAway = awayOn(s, p.id, y);
      const yb = yAway.some(isOut) ? back(s, p.id, y) : null;
      // συνεχίζει από χθες: ΔΝ/έξοδος που δεν γύρισε, ή άλλη άδεια που τελειώνει μετά τη χθεσινή
      const contFromOut = !!yb && !yb.leaveAt && (!!yb.open || !!yb.pending || yb.day > d);
      const contFromLeave = yAway.some(x => !isOut(x) && x.to > y);
      if (l.from === d && !contFromOut && !contFromLeave) { R('A3', r, '', { lv: l }); continue; }
      if (r && !r.open && !r.pending && r.day === d) { R('G4', r, 'γυρνά απόψε', { lv: l }); continue; }
      R(l.type === 'NOS' ? 'B2' : 'B1', r, '', { lv: l }); continue;
    }
    if (outs.length) {
      const dn = outs.find(x => x.type === 'DN');
      const r = returnOf(s, p.id, d);
      const yb = awayOn(s, p.id, y).some(isOut) ? back(s, p.id, y) : null;
      // χθες ΔΝ/έξοδος και δεν γύρισε ως την ώρα εξόδου: είναι ήδη έξω
      const away = !!yb && (yb.open || yb.pending || yb.day > d || (yb.day === d && !!yb.time && mins(yb.time) >= T));
      R(away ? 'B3' : dn ? 'A1' : 'A2', r, '', { st: dn || outs[0], ...(away ? {} : duty()) }); continue;
    }
    // τίποτα σήμερα, αλλά κρατιέται έξω: διόρθωση «γυρνά αργότερα/δεν γυρνά», ή ΔΝ που δεν έχει δηλωθεί ακόμα πότε γυρνά
    const h = stillOut(s, p.id, d) || (() => { const x = outHeldBy(s, p.id, d, T); return x && x.r && x.r.pending ? { st: x.st, r: x.r } : null; })();
    const post = postOf(s, d, p.id);
    if (h && !post) { R('B3', h.r, 'held', { st: h.st }); continue; }
    if (post) {
      // η υπηρεσία μετρά πάνω από τη διόρθωση, αλλά το γραφείο πρέπει να το ξέρει
      R('G1', null, '', stillOut({ ...s, guards: {} }, p.id, d) ? { warn: 'ΠΡΟΣΟΧΗ: Η ΔΙΟΡΘΩΣΗ ΛΕΕΙ ΕΞΩ' } : {}); continue;
    }
    const ss = statusesFrom(s.statuses, p.id, d, outMin(s.rules));
    if (ss.some(x => x.type === 'PUN') || s.statuses.some(x => x.pid === p.id && x.type === 'PUN' && x.pending && x.from <= d && d <= x.to)) { R('G2', null); continue; }
    if (ss.some(x => x.type === 'STEP' || x.type === 'KOL' || statNoOut(x, s.settings.lists))) { R('G3', null); continue; }
    R('G5', null);
  }
  // ανά θάλαμο και όνομα μέσα σε κάθε ομάδα
  return rows.sort((a, b) => byRoom(a.p, b.p));
}

// Δ. ΠΟΤΕ ΓΥΡΙΖΟΥΝ: όσοι του Α, του Β και του Γ4, ομαδοποιημένοι ανά μέρα και ώρα επιστροφής,
// με τη σειρά του returnsOn (όσοι δεν έχουν λήξη στο τέλος)
export interface DayWhen { when: string; r: Ret; rows: DayRow[] }
export function whenList(rows: DayRow[]): DayWhen[] {
  const m = new Map<string, DayWhen>();
  // ανά ώρα επιστροφής (μέρα και ώρα), όχι ανά λόγο: «Σάββατο 31/10 06:00» μία γραμμή για όλους τους ΔΝ
  const at = (r: Ret) => (r.pending ? r.why + ' ' + dm(r.day) : r.open ? 'χωρίς λήξη' : retDay(r) + ' ' + (r.time || 'πρωί'));
  for (const x of rows) if (x.r && /^[AB]|^G4/.test(x.g)) { const k = at(x.r); const l = m.get(k); if (l) l.rows.push(x); else m.set(k, { when: k, r: x.r, rows: [x] }); }
  return [...m.values()].sort((a, b) => retOrd(a.r).localeCompare(retOrd(b.r)) || a.when.localeCompare(b.when, 'el'));
}
