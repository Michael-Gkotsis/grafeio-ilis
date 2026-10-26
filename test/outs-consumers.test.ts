// Εξοδούχοι: οι καταναλωτές του returnOf/awayAt (λίστα «Ποιοι γυρίζουν και πότε», Παρατηρήσεις Excel, εντολή outs, Δύναμη και
// Σήμερα με την ώρα). Η ίδια λογική στο test/returns.test.ts· εδώ τα κείμενα και τα νούμερα που βλέπει ο χρήστης (Michael, 25/10).
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fakeState } from './fixtures';
import { retDay, retTxt, returnsOn } from '../src/shared/returns';
import { activePeople, hkaiCounts, statusesAt, strengthOf } from '../src/shared/rules';
import { outsAndStay, outsNote } from '../src/main/exports';
import { norm } from '../src/shared/text';
import type { AppState, Status, TypeKey } from '../src/shared/domain';

let seq = 0;
const ctx: Ctx = { today: '2026-10-22', newId: () => 'c' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const FRI = '2026-10-23', SAT = '2026-10-24', SUN = '2026-10-25', MON = '2026-10-26', TUE = '2026-10-27';
const m = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3);
const st = (pid: number, type: TypeKey, from: string, extra: Partial<Status> = {}): Status => ({ id: 's' + ++seq, pid, type, from, to: extra.to || from, ...extra });
const with_ = (...ss: Status[]): AppState => ({ ...fakeState(10), statuses: ss });
const txt = (s: AppState, d: string, pid: number) => retTxt(returnsOn(s, d).find(b => b.p.id === pid)!.r);
const decl = (d: string) => st(9, 'OUT', d);

describe('«Ποιοι γυρίζουν και πότε»: μέρα, ώρα και γιατί', () => {
  it('Παρ ΔΝ: Σάββατο εξοδούχος / μένει / τίποτα δηλωμένο (με και χωρίς εκπαίδευση)', () => {
    expect(txt(with_(st(2, 'DN', FRI), st(2, 'OUT', SAT)), FRI, 2)).toBe('Σάββατο 24/10 22:00 · εξοδούχος το Σάββατο');
    expect(txt(with_(st(2, 'DN', FRI), decl(SAT)), FRI, 2)).toBe('Σάββατο 24/10 06:00 · μένει το Σάββατο');
    expect(txt(with_(st(2, 'DN', FRI)), FRI, 2)).toBe('Σάββατο 24/10 06:00 · πρωινή εκπαίδευση');
    const s = run(with_(st(2, 'DN', FRI)), { t: 'setDayPlan', date: SAT, plan: { train: false } });
    expect(txt(s, FRI, 2)).toBe('δεν έχει δηλωθεί το Σάββατο');
    expect(returnsOn(s, FRI)[0].r.pending).toBe(true);
  });
  it('ΔΝ Δευ και Τρι: η Δευτέρα γράφει μόνο «Τρίτη 06:00»', () => {
    const s = with_(st(2, 'DN', MON), st(2, 'DN', TUE));
    expect(txt(s, MON, 2)).toBe('Τρίτη 27/10 06:00 · πρωινή εκπαίδευση');
  });
  it('ΔΝ + άδεια αύριο 14:00: «06:00 και φεύγει για άδεια 14:00»· άδεια 06:00: συνεχίζει σε άδεια', () => {
    const lv = (t: string) => st(2, 'LEAVE', SAT, { to: '2026-10-30', fromTime: t });
    expect(txt(with_(st(2, 'DN', FRI), lv('14:00')), FRI, 2)).toBe('Σάββατο 24/10 06:00 · μετά τη ΔΝ, φεύγει για άδεια 14:00');
    expect(txt(with_(st(2, 'DN', FRI), lv('06:00')), FRI, 2)).toBe('Σάββατο 31/10 06:00 · τέλος ΚΑ');
  });
  it('υπηρεσία την επόμενη μέρα: πρώτος στη λίστα, «06:00 · Λ/Υ από 14:00»', () => {
    let s = run(with_(st(2, 'DN', SAT), st(3, 'DN', SAT)), { t: 'assign', date: SUN, k: 'ly', pid: 3, force: 'x' });
    s = { ...s, statuses: [...s.statuses, decl(SUN)] };
    const l = returnsOn(s, SAT);
    expect(l.map(b => b.p.id)).toEqual([3, 2]);
    expect(retTxt(l[0].r)).toBe('Κυριακή 25/10 06:00 · Λ/Υ από 14:00');
  });
  it('άδεια/νοσοκομείο στη λίστα όπως πριν, με ώρα επιστροφής όπου υπάρχει', () => {
    const s = with_(st(2, 'LEAVE', FRI, { to: SAT, toTime: '13:00' }), st(3, 'SICK', FRI, { to: SAT }));
    expect(txt(s, FRI, 2)).toBe('Σάββατο 24/10 13:00 · τέλος ΚΑ');
    expect(txt(s, FRI, 3)).toBe('Κυριακή 25/10 πρωί · τέλος Αναρρωτική');
  });
  it('διόρθωση ανά άτομο: φαίνεται στη λίστα και στις Παρατηρήσεις του Excel', () => {
    let s = with_(st(2, 'DN', FRI), st(3, 'OUT', FRI));
    s = run(s, { t: 'setBackFix', pid: 2, day: FRI, at: { day: MON, time: '10:00' }, why: 'ΕΞΕΤΑΣΕΙΣ' });
    s = run(s, { t: 'setBackFix', pid: 3, day: FRI, stay: true, why: 'ΕΙΠΕ Ο ΛΟΧΑΓΟΣ' });
    expect(txt(s, FRI, 2)).toBe('Δευτέρα 26/10 10:00 · διόρθωση: ΕΞΕΤΑΣΕΙΣ');
    expect(txt(s, FRI, 3)).toBe('χωρίς λήξη · διόρθωση: ΕΙΠΕ Ο ΛΟΧΑΓΟΣ');
    const { outs } = outsAndStay(s, FRI);
    expect(outsNote(s, FRI, 2, outs.find(x => x.p.id === 2)!.st)).toBe('ΔΝ, ΓΥΡΝΑ ΔΕΥΤΕΡΑ 26/10 10:00 (ΔΙΟΡΘΩΣΗ: ΕΞΕΤΑΣΕΙΣ)');
    expect(outsNote(s, FRI, 3, outs.find(x => x.p.id === 3)!.st)).toBe('ΔΕΝ ΓΥΡΝΑ (ΔΙΟΡΘΩΣΗ: ΕΙΠΕ Ο ΛΟΧΑΓΟΣ)');
    s = run(s, { t: 'delBackFix', id: '2:' + FRI });
    expect(outsNote(s, FRI, 2, outs.find(x => x.p.id === 2)!.st)).toBe('ΔΝ, ΓΥΡΝΑ ΣΑΒΒΑΤΟ 24/10 06:00 (ΠΡΩΙΝΗ ΕΚΠΑΙΔΕΥΣΗ)');
  });
});

describe('εντολή outs: ΔΝ που δεν ξέρουμε πότε γυρνά', () => {
  it('το Ιστορικό το γράφει, και φεύγει όταν δηλωθεί η επόμενη μέρα', () => {
    const s = run(fakeState(10), { t: 'setDayPlan', date: SAT, plan: { train: false } });
    const r = apply(s, { t: 'outs', date: FRI, changes: [{ pid: 2, from: null, to: 'DN' }, { pid: 3, from: null, to: 'DN' }, { pid: 4, from: null, to: 'OUT' }] }, ctx);
    expect(r.text).toMatch(/δεν έχει δηλωθεί το Σάββατο: .*, .*/);
    const ok = apply(r.state, { t: 'outs', date: SAT, changes: [{ pid: 5, from: null, to: 'OUT' }] }, ctx);
    expect(returnsOn(ok.state, FRI).filter(b => b.r.pending)).toEqual([]);
    expect(apply(fakeState(10), { t: 'outs', date: FRI, changes: [{ pid: 2, from: null, to: 'DN' }] }, ctx).text).not.toMatch(/δεν έχει δηλωθεί/);
  });
});

describe('setDayPlans: δύο μέρες, μία αναίρεση', () => {
  it('γράφει και τις δύο, κενό = καμία αλλαγή', () => {
    const s = run(fakeState(10), { t: 'setDayPlans', plans: [{ date: FRI, plan: { out: '15:00' } }, { date: SAT, plan: { backDn: '07:00', train: false } }] });
    expect(s.dayPlan).toEqual({ [FRI]: { out: '15:00' }, [SAT]: { backDn: '07:00', train: false } });
    const r = apply(s, { t: 'setDayPlans', plans: [{ date: FRI, plan: { out: '15:00' } }] }, ctx);
    expect(r.text).toBe('');
    expect(run(s, { t: 'setDayPlans', plans: [{ date: FRI, plan: {} }, { date: SAT, plan: {} }] }).dayPlan).toEqual({});
  });
});

describe('Δύναμη και Σήμερα με την ώρα (OUT/DN)', () => {
  // Παρ 23/10: 2 εξοδούχος, 3 ΔΝ· χθες (Πεμ) ΔΝ ο 4 (γυρνά Παρ 06:00)
  const s = with_(st(2, 'OUT', FRI), st(3, 'DN', FRI), st(4, 'DN', '2026-10-22'));
  const n = (at: string) => strengthOf(s, FRI, m(at)).absent;
  it('Δύναμη: 06:00 / 10:00 / 18:00 / 22:30', () => {
    expect(n('05:00')).toBe(1);   // ο χθεσινός ΔΝ δεν έχει γυρίσει
    expect(n('10:00')).toBe(0);
    expect(n('18:00')).toBe(2);
    expect(n('22:30')).toBe(1);   // οι εξοδούχοι γύρισαν στις 22:00, ο ΔΝ μένει έξω
  });
  it('Δύναμη ανά είδος: ο εξοδούχος μετρά στην Έξοδος, ο ΔΝ στη ΔΝ', () => {
    const c = strengthOf(s, FRI, m('18:00'));
    expect(c.away).toMatchObject({ OUT: 1, DN: 1 });
    expect(c.present + c.absent).toBe(c.total);
  });
  it('αλλαγή μιας μέρας: έξοδος 14:00 την Παρασκευή φαίνεται στη Δύναμη', () => {
    const p = run(s, { t: 'setDayPlan', date: FRI, plan: { out: '14:00' } });
    expect(strengthOf(p, FRI, m('15:00')).absent).toBe(2);
    expect(strengthOf(s, FRI, m('15:00')).absent).toBe(0);
  });
  it('οι καταστάσεις του «Σήμερα»: statusesAt', () => {
    const away = (at: string) => activePeople(s).filter(p => statusesAt(s, p.id, FRI, m(at)).some(x => x.type === 'OUT' || x.type === 'DN')).map(p => p.id);
    expect(away('10:00')).toEqual([]);
    expect(away('18:00')).toEqual([2, 3]);
    expect(away('05:00')).toEqual([4]);
  });
  it('ΗΚΑΙ: στη στιγμή που ορίστηκε (hkTime, 08:00)· οι ΗΚΑΙ μετρητές δεν αλλάζουν από τις ώρες εξόδου', () => {
    const a = hkaiCounts(s, FRI);
    const b = hkaiCounts(run(s, { t: 'setWeekRules', week: { 5: { out: '12:00' } } }), FRI);
    expect(b).toEqual(a);
  });
});

// Παρατηρήσεις Excel (Εξοδούχοι και ΠΣΚ): στο τέλος πότε γυρνά, από το returnOf με τις λέξεις της οθόνης (Michael, 26/10)
describe('Παρατηρήσεις Excel: πότε γυρνά', () => {
  const note = (s: AppState, d: string, pid: number) => outsNote(s, d, pid, outsAndStay(s, d).outs.find(x => x.p.id === pid)!.st);
  it('εξοδούχος: την ίδια μέρα, χωρίς το αυτονόητο «γιατί»', () => {
    expect(note(with_(st(2, 'OUT', MON)), MON, 2)).toBe('ΓΥΡΝΑ ΔΕΥΤΕΡΑ 26/10 22:00');
  });
  it('ΔΝ: την επόμενη το πρωί, με τον λόγο σε παρένθεση', () => {
    expect(note(with_(st(2, 'DN', MON)), MON, 2)).toBe('ΔΝ, ΓΥΡΝΑ ΤΡΙΤΗ 27/10 06:00 (ΠΡΩΙΝΗ ΕΚΠΑΙΔΕΥΣΗ)');
  });
  it('ΔΝ ΣΚ: ως την Κυριακή, γυρνά Δευτέρα', () => {
    const s = run(fakeState(10), { t: 'outs', date: SAT, changes: [{ pid: 2, from: null, to: 'DN', wk: true }], force: true });
    expect(note(s, SAT, 2)).toBe('ΔΝ ΣΚ, ΓΥΡΝΑ ΔΕΥΤΕΡΑ 26/10 06:00 (ΔΝ ΩΣ ΤΗΝ ΚΥΡΙΑΚΗ)');
  });
  it('ΔΝ και άδεια αύριο 14:00: γυρνά και φεύγει για άδεια', () => {
    const s = with_(st(2, 'DN', FRI), st(2, 'LEAVE', SAT, { to: '2026-10-30', fromTime: '14:00' }));
    expect(note(s, FRI, 2)).toBe('ΔΝ, ΑΔΕΙΑ ΑΠΟ ΣΑΒΒΑΤΟ 24/10 14:00, ΓΥΡΝΑ ΣΑΒΒΑΤΟ 24/10 06:00, ΦΕΥΓΕΙ ΓΙΑ ΑΔΕΙΑ 14:00');
  });
  it('δεν έχει δηλωθεί η επόμενη μέρα: «ΔΕΝ ΕΧΕΙ ΔΗΛΩΘΕΙ Η <ΜΕΡΑ> <ηη/μμ>»', () => {
    const s = run(with_(st(2, 'DN', FRI)), { t: 'setDayPlan', date: SAT, plan: { train: false } });
    expect(note(s, FRI, 2)).toBe('ΔΝ, ΔΕΝ ΕΧΕΙ ΔΗΛΩΘΕΙ ΤΟ ΣΑΒΒΑΤΟ 24/10');
  });
  it('η υπάρχουσα παρατήρηση μένει πρώτη, η επιστροφή μπαίνει μετά', () => {
    let s = with_(st(2, 'DN', MON), st(3, 'OUT', MON));
    s = run(s, { t: 'outs', date: MON, changes: [], notes: [{ pid: 2, note: 'Ιατρος Στεπ' }, { pid: 3, note: 'γάμος' }] });
    expect(note(s, MON, 2)).toBe('ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ), ΓΥΡΝΑ ΤΡΙΤΗ 27/10 06:00 (ΠΡΩΙΝΗ ΕΚΠΑΙΔΕΥΣΗ)');
    expect(note(s, MON, 3)).toBe('ΓΑΜΟΣ, ΓΥΡΝΑ ΔΕΥΤΕΡΑ 26/10 22:00');
  });
  it('ίδια λέξεις με την οθόνη (retDay και ώρα) και πάντα ένα κείμενο ανά εξοδούχο/ΔΝ', () => {
    const s = with_(st(2, 'DN', FRI), st(2, 'LEAVE', SAT, { to: '2026-10-30', fromTime: '14:00' }), st(3, 'DN', MON), st(4, 'OUT', MON));
    for (const [d, pid] of [[FRI, 2], [MON, 3], [MON, 4]] as const) {
      const r = returnsOn(s, d).find(b => b.p.id === pid)!.r;
      expect(retTxt(r)).toContain(retDay(r) + ' ' + r.time);
      expect(note(s, d, pid)).toContain(norm(retDay(r) + ' ' + r.time));
    }
  });
});
