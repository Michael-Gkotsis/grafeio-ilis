// «Όλη η δύναμη» (Michael, 30/10): οι 35 περιπτώσεις του σχεδίου (Παρασκευή 30/10, αύριο εκπαίδευση, 28/10 αργία), με την ομάδα και πότε γυρνά
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fakeState } from './fixtures';
import { dayBook, whenList } from '../src/shared/outsDay';
import { retTxt } from '../src/shared/returns';
import type { ISODate } from '../src/shared/dates';
import type { AppState, Status, TypeKey } from '../src/shared/domain';

let q = 0;
const ctx: Ctx = { today: '2026-10-20', newId: () => 'q' + ++q };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const st = (pid: number, type: TypeKey, from: string, extra: Partial<Status> = {}): Status => ({ id: 'z' + ++q, pid, type, from, to: extra.to || from, ...extra });
const FRI = '2026-10-30', THU = '2026-10-29', SAT = '2026-10-31', SUN = '2026-11-01';
// ο 40 έχει έξοδο όλες τις γύρω μέρες: οι μέρες είναι «δηλωμένες» (ο ΔΝ που μένει δεν είναι «άγνωστο»)
const base = () => { const s = fakeState(40); s.statuses = [st(40, 'OUT', FRI), st(40, 'OUT', SAT), st(40, 'OUT', SUN), st(40, 'OUT', THU), st(40, 'OUT', '2026-10-27'), st(40, 'OUT', '2026-10-28')]; return s; };
const wk = { t: 'outs', date: SAT, changes: [{ pid: 1, from: null, to: 'DN', wk: true }], force: true } as Command;
const duty = (date: string, pid = 1): Command => ({ t: 'assign', date, k: 'ly', pid, force: 'x' });
const noTrain = (date: string): Command => ({ t: 'setDayPlan', date, plan: { train: false } });

// [περίπτωση, κατάσταση, μέρα, ομάδα, πώς αρχίζει το «πότε γυρνά» ('' = χωρίς επιστροφή), ΠΡΟΣΟΧΗ]
type Case = [string, (s: AppState) => AppState, ISODate, string, string, string?];
const CASES: Case[] = [
  ['ΔΝ σήμερα', s => ({ ...s, statuses: [...s.statuses, st(1, 'DN', FRI)] }), FRI, 'A1', 'Σάββατο 31/10 06:00'],
  ['έξοδος σήμερα', s => ({ ...s, statuses: [...s.statuses, st(1, 'OUT', FRI)] }), FRI, 'A2', 'Παρασκευή 30/10 22:00'],
  ['ΔΝ ΣΚ, το Σάββατο', s => run(s, wk), SAT, 'A1', 'Δευτέρα 02/11 06:00'],
  ['ΔΝ ΣΚ, την Κυριακή', s => run(s, wk), SUN, 'B3', 'Δευτέρα 02/11 06:00'],
  ['ΔΝ χθες και ΔΝ σήμερα (με εκπαίδευση)', s => ({ ...s, statuses: [...s.statuses, st(1, 'DN', THU), st(1, 'DN', FRI)] }), FRI, 'A1', 'Σάββατο 31/10 06:00'],
  ['ΔΝ Τρίτη και ΔΝ Τετάρτη (αργία), την Τετάρτη', s => ({ ...s, statuses: [...s.statuses, st(1, 'DN', '2026-10-27'), st(1, 'DN', '2026-10-28')] }), '2026-10-28', 'B3', 'Πέμπτη 29/10 06:00'],
  ['ΔΝ χθες, έξοδος σήμερα', s => ({ ...s, statuses: [...s.statuses, st(1, 'DN', THU), st(1, 'OUT', FRI)] }), FRI, 'B3', 'Παρασκευή 30/10 22:00'],
  ['ΔΝ χθες, σήμερα μένει', s => ({ ...s, statuses: [...s.statuses, st(1, 'DN', THU)] }), FRI, 'G5', ''],
  ['ΔΝ χθες, σήμερα χωρίς εκπαίδευση και αδήλωτο', s => run({ ...s, statuses: [st(1, 'DN', THU)] }, noTrain(FRI)), FRI, 'B3', 'δεν έχει δηλωθεί'],
  ['ΔΝ χθες, άδεια από σήμερα 14:00', s => ({ ...s, statuses: [...s.statuses, st(1, 'DN', THU), st(1, 'LEAVE', FRI, { to: '2026-11-03', fromTime: '14:00' })] }), FRI, 'A3', 'Τετάρτη 04/11 πρωί'],
  ['ΔΝ χθες, άδεια από σήμερα χωρίς ώρα', s => ({ ...s, statuses: [...s.statuses, st(1, 'DN', THU), st(1, 'LEAVE', FRI, { to: '2026-11-03' })] }), FRI, 'B1', 'Τετάρτη 04/11 πρωί'],
  ['άδεια από σήμερα', s => ({ ...s, statuses: [...s.statuses, st(1, 'LEAVE', FRI, { to: '2026-11-03', fromTime: '14:00' })] }), FRI, 'A3', 'Τετάρτη 04/11 πρωί'],
  ['άδεια σε εξέλιξη', s => ({ ...s, statuses: [...s.statuses, st(1, 'LEAVE', '2026-10-26', { to: '2026-11-02' })] }), FRI, 'B1', 'Τρίτη 03/11 πρωί'],
  ['άδεια ως σήμερα 14:00', s => ({ ...s, statuses: [...s.statuses, st(1, 'LEAVE', '2026-10-26', { to: FRI, toTime: '14:00' })] }), FRI, 'G4', 'Παρασκευή 30/10 14:00'],
  ['αναρρωτική ως σήμερα 19:00', s => ({ ...s, statuses: [...s.statuses, st(1, 'SICK', '2026-10-26', { to: FRI, toTime: '19:00' })] }), FRI, 'G4', 'Παρασκευή 30/10 19:00'],
  ['τιμητική ως σήμερα χωρίς ώρα', s => ({ ...s, statuses: [...s.statuses, st(1, 'HON', '2026-10-26', { to: FRI })] }), FRI, 'B1', 'Σάββατο 31/10 πρωί'],
  ['άδεια ως σήμερα 12:00 και ΔΝ σήμερα', s => ({ ...s, statuses: [...s.statuses, st(1, 'LEAVE', '2026-10-26', { to: FRI, toTime: '12:00' }), st(1, 'DN', FRI)] }), FRI, 'A1', 'Σάββατο 31/10 06:00'],
  ['άδεια ως σήμερα 12:00 και έξοδος σήμερα', s => ({ ...s, statuses: [...s.statuses, st(1, 'LEAVE', '2026-10-26', { to: FRI, toTime: '12:00' }), st(1, 'OUT', FRI)] }), FRI, 'A2', 'Παρασκευή 30/10 22:00'],
  // Michael, 30/10: άδεια ως 22:00 και εξοδούχος την ίδια μέρα: εξοδούχος, όχι «σε άδεια»
  ['άδεια ως σήμερα 22:00 και έξοδος σήμερα', s => ({ ...s, statuses: [...s.statuses, st(1, 'LEAVE', '2026-10-26', { to: FRI, toTime: '22:00' }), st(1, 'OUT', FRI)] }), FRI, 'A2', 'Παρασκευή 30/10 22:00'],
  ['άδεια ως σήμερα χωρίς ώρα και ΔΝ σήμερα', s => ({ ...s, statuses: [...s.statuses, st(1, 'HON', '2026-10-26', { to: FRI }), st(1, 'DN', FRI)] }), FRI, 'A1', 'Σάββατο 31/10 06:00'],
  ['άδεια ως σήμερα 22:00, έξοδος σήμερα, νέα άδεια αύριο', s => ({ ...s, statuses: [...s.statuses, st(1, 'LEAVE', '2026-10-26', { to: FRI, toTime: '22:00' }), st(1, 'OUT', FRI), st(1, 'LEAVE', SAT, { to: '2026-11-03' })] }), FRI, 'A2', 'Παρασκευή 30/10 22:00'],
  ['άδεια ως σήμερα χωρίς ώρα, ΔΝ σήμερα, νέα άδεια αύριο', s => ({ ...s, statuses: [...s.statuses, st(1, 'LEAVE', '2026-10-26', { to: FRI }), st(1, 'DN', FRI), st(1, 'LEAVE', SAT, { to: '2026-11-03' })] }), FRI, 'B1', 'Τετάρτη 04/11'],
  ['άδεια ως σήμερα 12:00, έξοδος σήμερα, νέα άδεια αύριο', s => ({ ...s, statuses: [...s.statuses, st(1, 'LEAVE', '2026-10-26', { to: FRI, toTime: '12:00' }), st(1, 'OUT', FRI), st(1, 'LEAVE', SAT, { to: '2026-11-03' })] }), FRI, 'A2', 'Παρασκευή 30/10 22:00'],
  ['άδεια ως σήμερα 14:00 και ΔΝ αύριο', s => ({ ...s, statuses: [...s.statuses, st(1, 'LEAVE', '2026-10-26', { to: FRI, toTime: '14:00' }), st(1, 'DN', SAT)] }), FRI, 'G4', 'Παρασκευή 30/10 14:00'],
  ['νοσοκομείο χωρίς λήξη', s => ({ ...s, statuses: [...s.statuses, st(1, 'NOS', '2026-10-28', { to: FRI, open: true })] }), FRI, 'B2', 'χωρίς λήξη'],
  ['υπηρεσία', s => run(s, duty(FRI)), FRI, 'G1', ''],
  ['υπηρεσία και ποινή', s => run({ ...s, statuses: [...s.statuses, st(1, 'PUN', THU, { to: SAT, kind: 'Κράτηση' })] }, { t: 'assign', date: FRI, k: 'th1', pid: 1, force: 'x' }), FRI, 'G1', ''],
  ['στέρηση εξόδου', s => ({ ...s, statuses: [...s.statuses, st(1, 'PUN', THU, { to: SAT, kind: 'Στέρηση εξόδου' })] }), FRI, 'G2', ''],
  ['ποινή που αιτείται', s => ({ ...s, statuses: [...s.statuses, st(1, 'PUN', THU, { to: SAT, kind: 'Περιορισμός', pending: true })] }), FRI, 'G2', ''],
  ['ΣΤΕΠ', s => ({ ...s, statuses: [...s.statuses, st(1, 'STEP', THU, { to: SAT })] }), FRI, 'G3', ''],
  ['κωλυόμενος', s => ({ ...s, statuses: [...s.statuses, st(1, 'KOL', THU, { to: SAT, kind: 'ΣΤΕΠ' })] }), FRI, 'G3', ''],
  ['ΕΥ', s => ({ ...s, statuses: [...s.statuses, st(1, 'EY', THU, { to: SAT })] }), FRI, 'G3', ''],
  ['ΕΑ (μπορεί να βγει)', s => ({ ...s, statuses: [...s.statuses, st(1, 'EA', THU, { to: SAT })] }), FRI, 'G5', ''],
  ['έξοδος χθες, διόρθωση «γυρνά Δευτέρα 10:00»', s => run({ ...s, statuses: [...s.statuses, st(1, 'OUT', THU)] }, { t: 'setBackFix', pid: 1, day: THU, at: { day: '2026-11-02', time: '10:00' }, why: 'Χ' }), FRI, 'B3', 'Δευτέρα 02/11 10:00'],
  ['διόρθωση «δεν γυρνά» και υπηρεσία σήμερα', s => run(run({ ...s, statuses: [...s.statuses, st(1, 'OUT', THU)] }, { t: 'setBackFix', pid: 1, day: THU, stay: true, why: 'Χ' }), duty(FRI)), FRI, 'G1', '', 'ΠΡΟΣΟΧΗ: Η ΔΙΟΡΘΩΣΗ ΛΕΕΙ ΕΞΩ'],
  ['έξοδος και υπηρεσία (παρά τους κανόνες)', s => run({ ...s, statuses: [...s.statuses, st(1, 'OUT', FRI)] }, duty(FRI)), FRI, 'A2', 'Παρασκευή 30/10 22:00', 'ΠΡΟΣΟΧΗ: ΚΑΙ ΥΠΗΡΕΣΙΑ Λ/Υ'],
  ['ΔΝ και υπηρεσία αύριο', s => run({ ...s, statuses: [...s.statuses, st(1, 'DN', FRI)] }, duty(SAT)), FRI, 'A1', 'Σάββατο 31/10 06:00'],
  ['ΔΝ και άδεια αύριο 14:00', s => ({ ...s, statuses: [...s.statuses, st(1, 'DN', FRI), st(1, 'LEAVE', SAT, { to: '2026-11-03', fromTime: '14:00' })] }), FRI, 'A1', 'Σάββατο 31/10 06:00'],
  ['ΔΝ ΣΚ και Δευτέρα αργία με ΔΝ, την Κυριακή', s => { const x = run(s, wk); return run({ ...x, statuses: [...x.statuses, st(1, 'DN', '2026-11-02')] }, noTrain('2026-11-02')); }, SUN, 'B3', 'Τρίτη 03/11 06:00'],
  ['ανενεργός', s => ({ ...s, people: s.people.map(p => (p.id === 1 ? { ...p, active: false } : p)) }), FRI, '-', ''],
];

describe('Όλη η δύναμη: οι περιπτώσεις του σχεδίου (35) και όσες βρέθηκαν μετά', () => {
  it('είναι 40', () => expect(CASES.length).toBe(40));
  for (const [name, f, d, want, when, warn] of CASES) it(name + ' → ' + want, () => {
    const x = dayBook(f(base()), d).find(r => r.p.id === 1);
    expect(x?.g ?? '-').toBe(want);
    if (x && when) expect(x.r && retTxt(x.r).startsWith(when), 'γυρνά: ' + (x.r && retTxt(x.r))).toBe(true);
    if (x && !when && want !== 'G5') expect(x.r).toBeNull();
    expect(x?.warn?.startsWith(warn ?? '\0') ?? warn === undefined).toBe(true);
  });
  it('η Δ ομαδοποιεί ανά μέρα και ώρα, όχι ανά λόγο: όλοι όσοι γυρίζουν αύριο 06:00 σε μία γραμμή', () => {
    let s = base(); s = { ...s, statuses: [...s.statuses, st(1, 'DN', FRI), st(2, 'DN', THU), st(2, 'DN', FRI), st(3, 'NOS', '2026-10-28', { to: FRI, open: true }), st(4, 'OUT', THU)] };
    s = run(s, { t: 'setBackFix', pid: 4, day: THU, stay: true, why: 'Χ' });
    const w = whenList(dayBook(s, FRI)).filter(x => x.rows.some(r => r.p.id < 10));
    expect(w.map(x => [x.when, x.rows.map(r => r.p.id).sort()])).toEqual([['Σάββατο 31/10 06:00', [1, 2]], ['χωρίς λήξη', [3, 4]]]);
  });
  it('μία φορά ο καθένας, και η Δ ομαδοποιεί όσους γυρίζουν με τη σειρά των ωρών (όσοι δεν έχουν λήξη στο τέλος)', () => {
    let s = base(); s = { ...s, statuses: [...s.statuses, st(1, 'DN', FRI), st(2, 'OUT', FRI), st(3, 'OUT', FRI), st(4, 'NOS', '2026-10-28', { to: FRI, open: true }), st(5, 'LEAVE', '2026-10-26', { to: FRI, toTime: '14:00' })] };
    const book = dayBook(s, FRI); expect(new Set(book.map(r => r.p.id)).size).toBe(book.length); expect(book.length).toBe(40);
    const w = whenList(book);
    expect(w.map(x => [x.when.split(' · ')[0], x.rows.map(r => r.p.id)])).toEqual([['Παρασκευή 30/10 14:00', [5]], ['Παρασκευή 30/10 22:00', [2, 3, 40]], ['Σάββατο 31/10 06:00', [1]], ['χωρίς λήξη', [4]]]);
  });
});
