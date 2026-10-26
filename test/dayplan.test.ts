// Ώρες εξόδου/επιστροφής ανά μέρα (Michael, 24/10): μοντέλο, εντολές, αποθήκευση και αναίρεση
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { Store } from '../src/main/db';
import { fakeState } from './fixtures';
import { dayTimes } from '../src/shared/returns';
import type { AppState, Status, TypeKey } from '../src/shared/domain';

let seq = 0;
const ctx: Ctx = { today: '2026-10-22', newId: () => 'r' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
// Παρ 23/10 … Τετ 28/10 (αργία, 28ης Οκτωβρίου)
const FRI = '2026-10-23', SAT = '2026-10-24', SUN = '2026-10-25', MON = '2026-10-26', TUE = '2026-10-27', WED = '2026-10-28';
const st = (pid: number, type: TypeKey, from: string, extra: Partial<Status> = {}): Status => ({ id: 's' + ++seq, pid, type, from, to: extra.to || from, ...extra });
const with_ = (...ss: Status[]) => ({ ...fakeState(10), statuses: ss });

describe('dayTimes', () => {
  it('προεπιλογές: 17:00, 22:00, 06:00· εκπαίδευση Δευτέρα ως Σάββατο, όχι Κυριακή και αργίες', () => {
    const s = fakeState(3);
    expect(dayTimes(s, TUE)).toMatchObject({ out: '17:00', backOut: '22:00', backDn: '06:00', train: true, hol: '' });
    expect(dayTimes(s, SAT).train).toBe(true);
    expect(dayTimes(s, SUN).train).toBe(false);
    expect(dayTimes(s, WED)).toMatchObject({ train: false }); expect(dayTimes(s, WED).hol).not.toBe('');
  });
  it('ημέρα εβδομάδας πάνω από την προεπιλογή, αλλαγή μιας μέρας πάνω από την ημέρα εβδομάδας, κάθε πεδίο χωριστά', () => {
    let s = fakeState(3);
    s = run(s, { t: 'setWeekRules', week: { 5: { out: '16:30', train: false } } });
    expect(dayTimes(s, FRI)).toMatchObject({ out: '16:30', backOut: '22:00', train: false });
    expect(dayTimes(s, '2026-10-30')).toMatchObject({ out: '16:30', train: false });   // επόμενη Παρασκευή
    s = run(s, { t: 'setDayPlan', date: FRI, plan: { out: '14:00', train: true } });
    expect(dayTimes(s, FRI)).toMatchObject({ out: '14:00', backOut: '22:00', train: true, over: { out: '14:00', train: true } });
    expect(dayTimes(s, '2026-10-30')).toMatchObject({ out: '16:30', train: false });
  });
  it('αργία: χωρίς εκπαίδευση, εκτός αν αλλάξει η μέρα· και στο ΣΚ-αργία', () => {
    let s = fakeState(3);
    s = run(s, { t: 'setDayPlan', date: WED, plan: { train: true } });
    expect(dayTimes(s, WED).train).toBe(true);
    s = run(s, { t: 'setDayPlan', date: WED, plan: {} });
    expect(dayTimes(s, WED).train).toBe(false);
  });
});

describe('εντολές: setWeekRules, setDayPlan, setBackFix, delBackFix', () => {
  it('setWeekRules: Ιστορικό με παλιά → νέα τιμή, γράφονται μόνο όσα διαφέρουν από την προεπιλογή, ίδιες τιμές = καμία αλλαγή', () => {
    const s0 = fakeState(3);
    const c: Command = { t: 'setWeekRules', week: { 1: { out: '18:00' }, 6: { train: false, backDn: '07:00' } } };
    const r = apply(s0, c, ctx);
    expect(r.text).toBe('Ώρες εξόδου και επιστροφής: Δευτέρα αρχή εξόδου 17:00 → 18:00 · Σάββατο επιστροφή ΔΝ 06:00 → 07:00 · Σάββατο πρωινή εκπαίδευση ναι → όχι');
    expect(r.state.rules.week).toEqual({ 1: { out: '18:00' }, 6: { backDn: '07:00', train: false } });
    expect(apply(r.state, c, ctx).text).toBe('');
    // πίσω στην προεπιλογή: φεύγει το κλειδί
    const back = apply(r.state, { t: 'setWeekRules', week: { 1: { out: '17:00' }, 6: { train: true, backDn: '06:00' } } }, ctx).state;
    expect(back.rules.week).toBeUndefined();
    expect(s0.rules.week).toBeUndefined();   // η παλιά κατάσταση δεν πειράχτηκε
    // οι υπόλοιποι κανόνες μένουν
    expect(r.state.rules.outRooms).toEqual(s0.rules.outRooms);
  });
  it('setWeekRules: άκυρη ώρα ή εξοδούχοι πριν από την έξοδο = σφάλμα και τίποτα δεν γράφεται', () => {
    const s = fakeState(3);
    expect(() => apply(s, { t: 'setWeekRules', week: { 2: { out: '25:00' } } }, ctx)).toThrow(/Τρίτη.*αρχή εξόδου.*δεν είναι σωστή/);
    expect(() => apply(s, { t: 'setWeekRules', week: { 2: { out: '23:00' } } }, ctx)).toThrow(/Τρίτη: οι εξοδούχοι γυρνούν/);
    expect(() => apply(s, { t: 'setWeekRules', week: { 2: { backOut: 'abc' } } }, ctx)).toThrow(/επιστροφή εξοδούχων/);
  });
  it('setWeekRules: οι ώρες γράφονται σε κανονική μορφή («9» → 09:00)', () => {
    expect(run(fakeState(3), { t: 'setWeekRules', week: { 3: { backDn: '5.30' } } }).rules.week).toEqual({ 3: { backDn: '05:30' } });
  });
  it('setDayPlan: Ιστορικό με το «αντί», επαναφορά με κενό, όσα ίσα με την ημέρα εβδομάδας δεν γράφονται', () => {
    const s0 = fakeState(3);
    const r = apply(s0, { t: 'setDayPlan', date: FRI, plan: { out: '14:00', backOut: '22:00' } }, ctx);
    expect(r.text).toBe('Ώρες εξόδου Παρασκευή 23/10: αρχή εξόδου 14:00 (αντί 17:00)');
    expect(r.state.dayPlan).toEqual({ [FRI]: { out: '14:00' } });
    expect(apply(r.state, { t: 'setDayPlan', date: FRI, plan: { out: '14:00' } }, ctx).text).toBe('');
    const t = apply(r.state, { t: 'setDayPlan', date: FRI, plan: { train: false } }, ctx);
    expect(t.state.dayPlan![FRI]).toEqual({ train: false });   // η νέα εντολή αντικαθιστά τη μέρα
    const reset = apply(r.state, { t: 'setDayPlan', date: FRI, plan: {} }, ctx);
    expect(reset.text).toBe('Ώρες εξόδου Παρασκευή 23/10: πίσω στην προεπιλογή'); expect(reset.state.dayPlan).toEqual({});
    expect(apply(s0, { t: 'setDayPlan', date: FRI, plan: {} }, ctx).text).toBe('');
    // η αργία δείχνει «χωρίς εκπαίδευση» από μόνη της: να μπει ναι είναι αλλαγή, να μπει όχι δεν είναι
    expect(apply(s0, { t: 'setDayPlan', date: WED, plan: { train: false } }, ctx).text).toBe('');
    expect(apply(s0, { t: 'setDayPlan', date: WED, plan: { train: true } }, ctx).text).toBe('Ώρες εξόδου Τετάρτη 28/10: πρωινή εκπαίδευση ναι (αντί όχι)');
  });
  it('setDayPlan: ελέγχει ώρες και σειρά', () => {
    const s = fakeState(3);
    expect(() => apply(s, { t: 'setDayPlan', date: FRI, plan: { backDn: '6:75' } }, ctx)).toThrow(/Παρασκευή 23\/10.*επιστροφή ΔΝ/);
    expect(() => apply(s, { t: 'setDayPlan', date: FRI, plan: { out: '22:00' } }, ctx)).toThrow(/οι εξοδούχοι γυρνούν/);
  });
  it('setBackFix: Ιστορικό, αντικατάσταση της ίδιας μέρας, ίδια διόρθωση δεύτερη φορά = τίποτα', () => {
    const s = with_(st(2, 'DN', FRI));
    const c: Command = { t: 'setBackFix', pid: 2, day: FRI, at: { day: MON, time: '9:30' }, why: '  Εξετάσεις   ΣΣΕ ' };
    const r = apply(s, c, ctx);
    expect(r.text).toMatch(/^Διόρθωση επιστροφής \S+ [^(]*\(ΔΝ 23\/10\): γυρνά Δευτέρα 26\/10 09:30 · λόγος: Εξετάσεις ΣΣΕ$/);
    expect(r.state.backFix).toEqual([{ id: '2:' + FRI, pid: 2, day: FRI, at: { day: MON, time: '09:30' }, why: 'Εξετάσεις ΣΣΕ' }]);
    expect(apply(r.state, c, ctx).text).toBe('');
    const st2 = apply(r.state, { t: 'setBackFix', pid: 2, day: FRI, stay: true, why: 'ΣΥΝΕΧΙΖΕΙ' }, ctx);
    expect(st2.text).toContain('δεν γυρνά, συνεχίζει · λόγος: ΣΥΝΕΧΙΖΕΙ');
    expect(st2.state.backFix).toEqual([{ id: '2:' + FRI, pid: 2, day: FRI, stay: true, why: 'ΣΥΝΕΧΙΖΕΙ' }]);
  });
  it('setBackFix: υποχρεωτικός λόγος, ένα από τα δύο, σωστή ώρα και μέρα, μόνο για εξοδούχο/ΔΝ', () => {
    const s = with_(st(2, 'DN', FRI), st(3, 'OUT', FRI));
    const bad = (c: Partial<Extract<Command, { t: 'setBackFix' }>>, re: RegExp) => expect(() => apply(s, { t: 'setBackFix', pid: 2, day: FRI, why: 'Χ', stay: true, ...c } as Command, ctx)).toThrow(re);
    bad({ why: '  ' }, /λόγο/);
    bad({ stay: undefined }, /Διάλεξε/);
    bad({ at: { day: MON, time: '10:00' } }, /Διάλεξε/);
    bad({ stay: undefined, at: { day: MON, time: 'xx' } }, /ώρα επιστροφής/);
    bad({ stay: undefined, at: { day: FRI, time: '23:00' } }, /πριν από την έξοδο/);   // η ΔΝ της Παρασκευής γυρνά το νωρίτερο το Σάββατο
    bad({ day: SAT }, /δεν είναι εξοδούχος ή ΔΝ 24\/10/);
    bad({ pid: 99 }, /Δεν βρέθηκε/);
    // ο εξοδούχος μπορεί να γυρίσει την ίδια μέρα αργότερα
    expect(apply(s, { t: 'setBackFix', pid: 3, day: FRI, at: { day: FRI, time: '23:59' }, why: 'Χ' }, ctx).state.backFix).toHaveLength(1);
  });
  it('delBackFix: Ιστορικό «πίσω στο αυτόματο»· άγνωστο id = τίποτα', () => {
    const s = run(with_(st(2, 'DN', FRI)), { t: 'setBackFix', pid: 2, day: FRI, stay: true, why: 'Χ' });
    const r = apply(s, { t: 'delBackFix', id: '2:' + FRI }, ctx);
    expect(r.text).toMatch(/^Διόρθωση επιστροφής \S+.* 23\/10: πίσω στο αυτόματο$/);
    expect(r.state.backFix).toEqual([]);
    expect(apply(s, { t: 'delBackFix', id: 'nope' }, ctx).text).toBe('');
  });
});

describe('βάση: αποθήκευση και αναίρεση', () => {
  const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  it('rules.week, dayPlan και backFix κρατιούνται μετά το κλείσιμο και αναιρούνται ένα ένα', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gidb-'));
    let db = new Store(dir, WASM); await db.open();
    const base = with_(st(2, 'DN', FRI));
    db.commit(base);
    const p1 = db.commit(apply(db.state, { t: 'setWeekRules', week: { 5: { out: '16:00' } } }, ctx).state);
    const p2 = db.commit(apply(db.state, { t: 'setDayPlan', date: FRI, plan: { out: '14:00' } }, ctx).state);
    const p3 = db.commit(apply(db.state, { t: 'setDayPlan', date: SAT, plan: { train: false } }, ctx).state);
    const p4 = db.commit(apply(db.state, { t: 'setBackFix', pid: 2, day: FRI, stay: true, why: 'Χ' }, ctx).state);
    db.close();
    db = new Store(dir, WASM); await db.open();
    expect(db.state.rules.week).toEqual({ 5: { out: '16:00' } });
    expect(db.state.dayPlan).toEqual({ [FRI]: { out: '14:00' }, [SAT]: { train: false } });
    expect(db.state.backFix).toHaveLength(1);
    db.revert(p4); expect(db.state.backFix).toEqual([]);
    db.revert(p3); expect(db.state.dayPlan).toEqual({ [FRI]: { out: '14:00' } });
    db.revert(p2); expect(db.state.dayPlan).toEqual({});
    db.revert(p1); expect(db.state.rules.week).toBeUndefined();
    db.close();
  });
});
