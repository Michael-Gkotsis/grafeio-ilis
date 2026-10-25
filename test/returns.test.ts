// Ώρες εξόδου/επιστροφής ανά μέρα, «πότε γυρνά ο ΔΝ» και παρουσία με την ώρα (Michael, 24/10)
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fakeState } from './fixtures';
import { awayAt, returnOf } from '../src/shared/returns';
import type { AppState, Status, TypeKey } from '../src/shared/domain';

let seq = 0;
const ctx: Ctx = { today: '2026-10-22', newId: () => 'r' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
// Παρ 23/10 … Τετ 28/10 (αργία, 28ης Οκτωβρίου)
const FRI = '2026-10-23', SAT = '2026-10-24', SUN = '2026-10-25', MON = '2026-10-26', TUE = '2026-10-27', WED = '2026-10-28', THU = '2026-10-29';
const st = (pid: number, type: TypeKey, from: string, extra: Partial<Status> = {}): Status => ({ id: 's' + ++seq, pid, type, from, to: extra.to || from, ...extra });
const with_ = (...ss: Status[]) => ({ ...fakeState(10), statuses: ss });
// κάποιος άλλος έχει έξοδο εκείνη τη μέρα: η μέρα είναι «δηλωμένη»
const decl = (d: string) => st(9, 'OUT', d);
const wk = (pid: number) => run(fakeState(10), { t: 'outs', date: SAT, changes: [{ pid, from: null, to: 'DN', wk: true }], force: true });

describe('returnOf: εξοδούχος', () => {
  it('γυρνά το ίδιο βράδυ στην ώρα των εξοδούχων της μέρας', () => {
    let s = with_(st(2, 'OUT', SAT));
    expect(returnOf(s, 2, SAT)).toEqual({ day: SAT, time: '22:00', why: 'εξοδούχος το Σάββατο' });
    s = run(s, { t: 'setDayPlan', date: SAT, plan: { backOut: '23:30' } });
    expect(returnOf(s, 2, SAT)).toMatchObject({ day: SAT, time: '23:30' });
  });
  it('null όποιος δεν είναι εξοδούχος/ΔΝ (και όποιος είναι σε άδεια)', () => {
    const s = with_(st(3, 'LEAVE', SAT, { to: SUN }));
    expect(returnOf(s, 2, SAT)).toBeNull(); expect(returnOf(s, 3, SAT)).toBeNull();
  });
});

describe('returnOf: ΔΝ κατά ό,τι δηλώθηκε την επόμενη μέρα', () => {
  it('Παρ ΔΝ, Σαβ εξοδούχος: Σάββατο 22:00', () => {
    const s = with_(st(2, 'DN', FRI), st(2, 'OUT', SAT));
    expect(returnOf(s, 2, FRI)).toEqual({ day: SAT, time: '22:00', why: 'εξοδούχος το Σάββατο' });
  });
  it('Παρ ΔΝ, Σαβ μένει (η μέρα είναι δηλωμένη): Σάββατο 06:00', () => {
    expect(returnOf(with_(st(2, 'DN', FRI), decl(SAT)), 2, FRI)).toEqual({ day: SAT, time: '06:00', why: 'μένει το Σάββατο' });
  });
  it('Παρ ΔΝ, Σαβ ΔΝ (με εκπαίδευση): γυρνά Σάββατο 06:00 και φεύγει πάλι· του Σαββάτου κρίνεται από την Κυριακή', () => {
    const s = with_(st(2, 'DN', FRI), st(2, 'DN', SAT));
    expect(returnOf(s, 2, FRI)).toMatchObject({ day: SAT, time: '06:00', why: 'πρωινή εκπαίδευση' });
    expect(returnOf(s, 2, SAT)).toMatchObject({ day: SUN, pending: true, why: 'δεν έχει δηλωθεί η Κυριακή' });
  });
  it('Παρ ΔΝ, Σαβ τίποτα: με εκπαίδευση «Σάββατο 06:00», χωρίς εκπαίδευση «δεν έχει δηλωθεί το Σάββατο»', () => {
    let s = with_(st(2, 'DN', FRI));
    expect(returnOf(s, 2, FRI)).toEqual({ day: SAT, time: '06:00', why: 'πρωινή εκπαίδευση' });
    s = run(s, { t: 'setWeekRules', week: { 6: { train: false } } });
    expect(returnOf(s, 2, FRI)).toEqual({ day: SAT, time: '', why: 'δεν έχει δηλωθεί το Σάββατο', pending: true });
    // μόνο για εκείνη τη μέρα
    s = run(run(s, { t: 'setWeekRules', week: { 6: { train: true } } }), { t: 'setDayPlan', date: SAT, plan: { train: false } });
    expect(returnOf(s, 2, FRI)).toMatchObject({ pending: true });
    // ... και η προειδοποίηση φεύγει όταν δηλωθεί η μέρα (μένει → 06:00 της ΔΝ)
    expect(returnOf({ ...s, statuses: [...s.statuses, decl(SAT)] }, 2, FRI)).toMatchObject({ day: SAT, time: '06:00', why: 'μένει το Σάββατο' });
  });
  it('ώρα επιστροφής ΔΝ από την ημέρα εβδομάδας και από την αλλαγή της μέρας', () => {
    let s = with_(st(2, 'DN', FRI), decl(SAT));
    s = run(s, { t: 'setWeekRules', week: { 6: { backDn: '07:00' } } });
    expect(returnOf(s, 2, FRI)).toMatchObject({ day: SAT, time: '07:00' });
    s = run(s, { t: 'setDayPlan', date: SAT, plan: { backDn: '08:15' } });
    expect(returnOf(s, 2, FRI)).toMatchObject({ day: SAT, time: '08:15' });
  });
  it('ΔΝ ΣΚ: Δευτέρα 06:00 και για τη ΔΝ του Σαββάτου και για της Κυριακής', () => {
    const s = wk(2);
    expect(returnOf(s, 2, SAT)).toEqual({ day: MON, time: '06:00', why: 'ΔΝ ως την Κυριακή' });
    expect(returnOf(s, 2, SUN)).toEqual({ day: MON, time: '06:00', why: 'πρωινή εκπαίδευση' });
    // η Δευτέρα δηλωμένη (μένει): ίδια ώρα
    expect(returnOf({ ...s, statuses: [...s.statuses, decl(MON)] }, 2, SAT)).toMatchObject({ day: MON, time: '06:00', why: 'ΔΝ ως την Κυριακή' });
  });
  it('ΔΝ ΣΚ και Δευτέρα αργία χωρίς εκπαίδευση, τίποτα δηλωμένο: δεν έχει δηλωθεί η Δευτέρα', () => {
    const s = run(wk(2), { t: 'setDayPlan', date: MON, plan: { train: false } });
    expect(returnOf(s, 2, SUN)).toEqual({ day: MON, time: '', why: 'δεν έχει δηλωθεί η Δευτέρα', pending: true });
  });
  it('ΔΝ Δευ και Τρι: η Δευτέρα γράφει «Τρίτη 06:00», η Τρίτη «Τετάρτη …» δική της', () => {
    const s = with_(st(2, 'DN', MON), st(2, 'DN', TUE));
    expect(returnOf(s, 2, MON)).toMatchObject({ day: TUE, time: '06:00' });
    // η Τετάρτη είναι αργία (28/10): δεν έχει εκπαίδευση και δεν έχει δηλωθεί
    expect(returnOf(s, 2, TUE)).toMatchObject({ day: WED, pending: true });
    expect(returnOf({ ...s, statuses: [...s.statuses, decl(WED)] }, 2, TUE)).toMatchObject({ day: WED, time: '06:00' });
  });
  it('ΔΝ πριν από αργία καθημερινής (Τρι, Τετ 28/10): όχι «πρωί της αργίας» χωρίς δήλωση', () => {
    let s = with_(st(2, 'DN', TUE));
    expect(returnOf(s, 2, TUE)).toEqual({ day: WED, time: '', why: 'δεν έχει δηλωθεί η Τετάρτη', pending: true });
    expect(returnOf({ ...s, statuses: [...s.statuses, decl(WED)] }, 2, TUE)).toMatchObject({ day: WED, time: '06:00', why: 'μένει την Τετάρτη' });
    s = run(s, { t: 'setDayPlan', date: WED, plan: { train: true } });   // το αλλάζεις για εκείνη τη μέρα
    expect(returnOf(s, 2, TUE)).toMatchObject({ day: WED, time: '06:00', why: 'πρωινή εκπαίδευση' });
  });
  it('ΔΝ την αργία (Τετ) και Πέμπτη μένει → Πέμπτη 06:00', () => {
    const s = with_(st(2, 'DN', WED), decl(THU));
    expect(returnOf(s, 2, WED)).toMatchObject({ day: THU, time: '06:00', why: 'μένει την Πέμπτη' });
  });
});

describe('returnOf: άδεια την επόμενη μέρα', () => {
  const lv = (fromTime?: string, to = '2026-10-30') => st(2, 'LEAVE', SAT, { to, ...(fromTime ? { fromTime } : {}) });
  it('άδεια 14:00 (μετά τις 06:00): γυρνά το πρωί και φεύγει στις 14:00', () => {
    expect(returnOf(with_(st(2, 'DN', FRI), lv('14:00')), 2, FRI)).toEqual({ day: SAT, time: '06:00', why: 'μετά τη ΔΝ', leaveAt: '14:00' });
  });
  it('άδεια 06:00 (ως την ώρα επιστροφής) ή χωρίς ώρα: δεν γυρνά, συνεχίζει ως το τέλος της άδειας', () => {
    expect(returnOf(with_(st(2, 'DN', FRI), lv('06:00')), 2, FRI)).toMatchObject({ day: '2026-10-31', time: '06:00', why: 'τέλος ΚΑ' });
    expect(returnOf(with_(st(2, 'DN', FRI), lv()), 2, FRI)).toMatchObject({ day: '2026-10-31', time: '06:00' });
    expect(returnOf(with_(st(2, 'DN', FRI), lv('06:00', '2026-10-30')), 2, FRI)!.leaveAt).toBeUndefined();
  });
  it('η ώρα επιστροφής ΔΝ της μέρας μετρά: με 05:00 η άδεια των 06:00 είναι «μετά»', () => {
    const s = run(with_(st(2, 'DN', FRI), lv('06:00')), { t: 'setDayPlan', date: SAT, plan: { backDn: '05:00' } });
    expect(returnOf(s, 2, FRI)).toMatchObject({ day: SAT, time: '05:00', leaveAt: '06:00' });
  });
  it('άδεια με ώρα επιστροφής: γυρνά εκείνη την ώρα· χωρίς λήξη: δεν γυρνά', () => {
    expect(returnOf(with_(st(2, 'DN', FRI), lv('06:00', '2026-10-27')), 2, FRI)).toMatchObject({ day: '2026-10-28', time: '06:00' });
    const withBack = with_(st(2, 'DN', FRI), st(2, 'LEAVE', SAT, { to: SUN, fromTime: '06:00', toTime: '15:30' }));
    expect(returnOf(withBack, 2, FRI)).toMatchObject({ day: SUN, time: '15:30', why: 'τέλος ΚΑ' });
    expect(returnOf(with_(st(2, 'DN', FRI), st(2, 'SICK', SAT, { open: true })), 2, FRI)).toMatchObject({ open: true });
  });
});

describe('returnOf: υπηρεσία και διόρθωση ανά άτομο', () => {
  it('υπηρεσία την επόμενη μέρα (και Κυριακή χωρίς εκπαίδευση): γυρνά το πρωί για αυτήν', () => {
    const s = run(with_(st(2, 'DN', SAT)), { t: 'assign', date: SUN, k: 'ly', pid: 2, force: 'x' });
    expect(returnOf(s, 2, SAT)).toEqual({ day: SUN, time: '06:00', why: 'υπηρεσία', duty: 'Λ/Υ', dutyTime: '14:00' });
  });
  it('υπηρεσία σε ΔΝ ΣΚ που συνεχίζει: η Δευτέρα με υπηρεσία', () => {
    const s = run(wk(2), { t: 'assign', date: MON, k: 'ly', pid: 2, force: 'x' });
    expect(returnOf(s, 2, SAT)).toMatchObject({ day: MON, time: '06:00', why: 'υπηρεσία', duty: 'Λ/Υ' });
  });
  it('διόρθωση «συνεχίζει» και «γυρνά …» έχει προτεραιότητα σε όλα', () => {
    let s: AppState = with_(st(2, 'DN', FRI), st(2, 'OUT', SAT));
    s = run(s, { t: 'setBackFix', pid: 2, day: FRI, stay: true, why: 'το είπε ο λοχαγός' });
    expect(returnOf(s, 2, FRI)).toEqual({ day: FRI, time: '', why: 'διόρθωση: το είπε ο λοχαγός', open: true, fix: true });
    s = run(s, { t: 'setBackFix', pid: 2, day: FRI, at: { day: MON, time: '10:00' }, why: 'ΕΞΕΤΑΣΕΙΣ' });
    expect(returnOf(s, 2, FRI)).toEqual({ day: MON, time: '10:00', why: 'διόρθωση: ΕΞΕΤΑΣΕΙΣ', fix: true });
    expect(returnOf(s, 2, SAT)).toMatchObject({ day: SAT, time: '22:00' });   // άλλη μέρα: όχι
    s = run(s, { t: 'delBackFix', id: '2:' + FRI });
    expect(returnOf(s, 2, FRI)).toMatchObject({ day: SAT, time: '22:00' });
  });
});

describe('awayAt: παρουσία με την ώρα', () => {
  it('εξοδούχος: παρών ως την αρχή εξόδου, απών ως την επιστροφή', () => {
    const s = with_(st(2, 'OUT', SAT));
    expect([['10:00', false], ['16:59', false], ['17:00', true], ['18:00', true], ['21:59', true], ['22:00', false], ['23:30', false]].map(([t]) => awayAt(s, 2, SAT, t as string)))
      .toEqual([false, false, true, true, true, false, false]);
  });
  it('ΔΝ: απών από την αρχή εξόδου και όλη την επόμενη μέρα ως την ώρα επιστροφής', () => {
    const s = with_(st(2, 'DN', FRI));   // Σάββατο τίποτα δηλωμένο: 06:00
    expect(awayAt(s, 2, FRI, '10:00')).toBe(false);
    expect(awayAt(s, 2, FRI, '18:00')).toBe(true);
    expect(awayAt(s, 2, SAT, '05:59')).toBe(true);
    expect(awayAt(s, 2, SAT, '06:00')).toBe(false);
    expect(awayAt(s, 2, SAT, '10:00')).toBe(false);
  });
  it('ΔΝ που την επόμενη μέρα είναι εξοδούχος: απών όλη την επόμενη μέρα ως τις 22:00', () => {
    const s = with_(st(2, 'DN', FRI), st(2, 'OUT', SAT));
    expect(awayAt(s, 2, SAT, '10:00')).toBe(true);
    expect(awayAt(s, 2, SAT, '18:00')).toBe(true);
    expect(awayAt(s, 2, SAT, '22:00')).toBe(false);
  });
  it('ΔΝ ΣΚ: απών την Κυριακή όλη μέρα, παρών τη Δευτέρα μετά τις 06:00', () => {
    const s = wk(2);
    expect(awayAt(s, 2, SAT, '10:00')).toBe(false); expect(awayAt(s, 2, SAT, '17:00')).toBe(true);
    expect(awayAt(s, 2, SUN, '09:00')).toBe(true); expect(awayAt(s, 2, SUN, '23:00')).toBe(true);
    expect(awayAt(s, 2, MON, '05:00')).toBe(true); expect(awayAt(s, 2, MON, '06:00')).toBe(false);
  });
  it('αλλαγή μιας μέρας στην αρχή εξόδου: 14:00 σήμερα, δεν αλλάζει τις άλλες μέρες· δηλωμένη επιστροφή «δεν έχει δηλωθεί» μετρά παρών', () => {
    let s = with_(st(2, 'OUT', FRI), st(2, 'OUT', SAT));
    s = run(s, { t: 'setDayPlan', date: FRI, plan: { out: '14:00' } });
    expect(awayAt(s, 2, FRI, '15:00')).toBe(true);
    expect(awayAt(s, 2, SAT, '15:00')).toBe(false);
    const p = run(with_(st(3, 'DN', FRI)), { t: 'setDayPlan', date: SAT, plan: { train: false } });
    expect(awayAt(p, 3, SAT, '10:00')).toBe(false);
  });
  it('διόρθωση «γυρνά …» κρατά τον απόντα ως τότε', () => {
    const s = run(with_(st(2, 'DN', FRI)), { t: 'setBackFix', pid: 2, day: FRI, at: { day: SAT, time: '12:00' }, why: 'ΓΙΑΤΡΟΣ' });
    expect(awayAt(s, 2, SAT, '11:59')).toBe(true); expect(awayAt(s, 2, SAT, '12:00')).toBe(false);
  });
});

