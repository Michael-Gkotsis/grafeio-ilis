// ΔΝ ΣΚ το Σάββατο, επιστροφές και παρατηρήσεις εξοδούχων/παραμενόντων (Michael, 18/10)
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fakeState } from './fixtures';
import { retTxt, returnsOn } from '../src/shared/returns';
import { outsAndStay, outsNote } from '../src/main/exports';
import type { AppState } from '../src/shared/domain';

let seq = 0;
const ctx: Ctx = { today: '2026-10-16', newId: () => 'w' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const SAT = '2026-10-17', SUN = '2026-10-18', MON = '2026-10-19';
const dnsk = (s: AppState, pid: number) => run(s, { t: 'outs', date: SAT, changes: [{ pid, from: null, to: 'DN', wk: true }], force: true });
const on = (s: AppState, pid: number, d: string) => s.statuses.filter(x => x.pid === pid && x.from <= d && d <= x.to);

describe('ΔΝ ΣΚ', () => {
  it('ΔΝ και το Σάββατο και την Κυριακή (μπαίνει μόνη της), γυρίζει Δευτέρα πρωί', () => {
    const s = dnsk(fakeState(10), 2);
    expect(on(s, 2, SAT)).toMatchObject([{ type: 'DN', kind: 'ΣΚ' }]);
    expect(on(s, 2, SUN)).toMatchObject([{ type: 'DN', kind: 'ΣΚ' }]);
    const b = returnsOn(s, SAT).find(x => x.p.id === 2)!;
    expect(retTxt(b.r)).toBe('Δευτέρα 19/10 06:00 · ΔΝ ως την Κυριακή');
    expect(outsNote(s, SUN, 2, on(s, 2, SUN)[0])).toBe('ΔΝ ΣΚ, ΓΥΡΝΑ ΔΕΥΤΕΡΑ 19/10 06:00 (ΠΡΩΙΝΗ ΕΚΠΑΙΔΕΥΣΗ)');
  });
  it('όπως παλιά: η έξοδος της Κυριακής που είχε μπει μόνη της από ΔΝ ΣΚ φεύγει αν αλλάξει το Σάββατο', () => {
    let s = fakeState(10);
    s = { ...s, statuses: [{ id: 'o1', pid: 2, type: 'DN', from: SAT, to: SAT, kind: 'ΣΚ' }, { id: 'o2', pid: 2, type: 'OUT', from: SUN, to: SUN, kind: 'ΣΚ' }] };
    s = run(s, { t: 'outs', date: SAT, changes: [{ pid: 2, from: 'DN', to: 'DN' }] });
    expect(on(s, 2, SUN)).toEqual([]);
  });
  it('άδεια που ξεκινά την Κυριακή: μένει η ΔΝ του Σαββάτου και γράφεται στις παρατηρήσεις', () => {
    let s = fakeState(10); s = { ...s, statuses: [{ id: 'l1', pid: 2, type: 'LEAVE', from: SUN, to: '2026-10-22', fromTime: '14:00' }] };
    s = dnsk(s, 2);
    expect(on(s, 2, SAT)).toMatchObject([{ type: 'DN', kind: 'ΣΚ' }]);
    expect(on(s, 2, SUN).map(x => x.type)).toEqual(['LEAVE']);
    expect(outsNote(s, SAT, 2, on(s, 2, SAT)[0])).toBe('ΔΝ ΣΚ, ΑΔΕΙΑ ΑΠΟ ΚΥΡΙΑΚΗ 18/10 14:00, ΓΥΡΝΑ ΚΥΡΙΑΚΗ 18/10 06:00, ΦΕΥΓΕΙ ΓΙΑ ΑΔΕΙΑ 14:00');
  });
  it('άδεια που ξεκινά τη μέρα της ΔΝ ή την επόμενη μπαίνει στις παρατηρήσεις μαζί με την υπηρεσία· όχι αν ξεκινά αργότερα', () => {
    const lv = (from: string) => ({ id: 'l' + from, pid: 2, type: 'LEAVE' as const, from, to: '2026-10-25' });
    const base = fakeState(10);
    const dn = { id: 'd1', pid: 2, type: 'DN' as const, from: SAT, to: SAT };
    let s = { ...base, statuses: [dn, lv(MON)] };
    expect(outsNote(s, SAT, 2, dn)).toBe('ΔΝ, ΔΕΝ ΕΧΕΙ ΔΗΛΩΘΕΙ Η ΚΥΡΙΑΚΗ 18/10');
    s = { ...base, statuses: [dn, lv(SUN)] };
    expect(outsNote(s, SAT, 2, dn)).toBe('ΔΝ, ΑΔΕΙΑ ΑΠΟ ΚΥΡΙΑΚΗ 18/10, ΓΥΡΝΑ ΔΕΥΤΕΡΑ 26/10 06:00 (ΤΕΛΟΣ ΚΑ)');
    s = { ...base, statuses: [dn, lv(SAT)] };
    // και πότε γυρνά, όπως το «Ποιοι γυρίζουν και πότε» (30/10: πριν έλειπε)
    expect(outsNote(s, SAT, 2, dn)).toBe('ΔΝ, ΑΔΕΙΑ ΑΠΟ ΣΑΒΒΑΤΟ 17/10, ΓΥΡΝΑ ΔΕΥΤΕΡΑ 26/10 ΠΡΩΙ (ΤΕΛΟΣ ΚΑ)');
    const out = { ...dn, type: 'OUT' as const };
    expect(outsNote({ ...base, statuses: [out, lv(SUN)] }, SAT, 2, out)).toBe('ΓΥΡΝΑ ΣΑΒΒΑΤΟ 17/10 22:00');
  });
  it('με υπηρεσία την Κυριακή: μόνο η ΔΝ, γυρίζει Κυριακή πρωί για την υπηρεσία', () => {
    let s = run(fakeState(10), { t: 'assign', date: SUN, k: 'ly', pid: 2, force: 'x' });
    s = dnsk(s, 2);
    expect(on(s, 2, SUN).filter(x => x.type === 'OUT')).toEqual([]);
    const b = returnsOn(s, SAT).find(x => x.p.id === 2)!;
    expect(b.r).toMatchObject({ day: SUN, time: '06:00', why: 'υπηρεσία', duty: 'Λ/Υ', dutyTime: '14:00' });
    expect(retTxt(b.r)).toBe('Κυριακή 18/10 06:00 · Λ/Υ από 14:00');
    expect(outsNote(s, SAT, 2, on(s, 2, SAT)[0])).toBe('ΔΝ ΣΚ, ΥΠΗΡΕΣΙΑ ΚΥΡΙΑΚΗ Λ/Υ 14:00, ΓΥΡΝΑ ΚΥΡΙΑΚΗ 18/10 06:00 (Λ/Υ ΑΠΟ 14:00)');
  });
  it('αν φύγει η ΔΝ ΣΚ το Σάββατο, φεύγει και η έξοδος της Κυριακής που μπήκε μόνη της· η χειροκίνητη μένει', () => {
    let s = dnsk(fakeState(10), 2);
    s = run(s, { t: 'outs', date: SAT, changes: [{ pid: 2, from: 'DN', to: 'DN' }] });
    expect(on(s, 2, SAT)).toMatchObject([{ type: 'DN' }]); expect(on(s, 2, SAT)[0].kind).toBeUndefined();
    expect(on(s, 2, SUN)).toEqual([]);
    s = run(s, { t: 'outs', date: SUN, changes: [{ pid: 3, from: null, to: 'OUT' }] });
    s = run(s, { t: 'outs', date: SAT, changes: [{ pid: 3, from: null, to: 'OUT' }] });
    expect(on(s, 3, SUN)).toMatchObject([{ type: 'OUT' }]);
  });
  it('την Κυριακή έχει ήδη έξοδο: δεν μπαίνει δεύτερη', () => {
    let s = run(fakeState(10), { t: 'outs', date: SUN, changes: [{ pid: 2, from: null, to: 'DN' }] });
    s = dnsk(s, 2);
    expect(on(s, 2, SUN)).toMatchObject([{ type: 'DN' }]);
    expect(retTxt(returnsOn(s, SAT).find(x => x.p.id === 2)!.r)).toBe('Δευτέρα 19/10 06:00 · ΔΝ ως την Κυριακή');
  });
  it('έξοδος με υπηρεσία μέσα (με επιβεβαίωση): γυρίζει ως την ώρα της υπηρεσίας', () => {
    let s = dnsk(fakeState(10), 2);
    s = run(s, { t: 'assign', date: SUN, k: 'ly', pid: 2, force: 'x' });
    const b = returnsOn(s, SAT).find(x => x.p.id === 2)!;
    expect(retTxt(b.r)).toBe('Κυριακή 18/10 06:00 · Λ/Υ από 14:00');
    expect(returnsOn(s, MON).find(x => x.p.id === 2)).toBeUndefined();
  });
});

describe('παρατηρήσεις εξοδούχων και παραμενόντων', () => {
  it('γράφονται σε παρένθεση δίπλα στην κατάσταση, και σβήνουν με κενό', () => {
    let s = run(fakeState(10), { t: 'outs', date: SAT, changes: [{ pid: 2, from: null, to: 'DN' }, { pid: 3, from: null, to: 'OUT' }], notes: [{ pid: 2, note: 'Ιατρος Στεπ' }, { pid: 3, note: 'γάμος' }, { pid: 4, note: 'ΓΡΑΦΕΙΟ' }] });
    expect(s.outNotes![SAT]).toEqual({ 2: 'ΙΑΤΡΟΣ ΣΤΕΠ', 3: 'ΓΑΜΟΣ', 4: 'ΓΡΑΦΕΙΟ' });
    const { outs, stay } = outsAndStay(s, SAT);
    expect(outsNote(s, SAT, 2, outs.find(x => x.p.id === 2)!.st)).toBe('ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ), ΔΕΝ ΕΧΕΙ ΔΗΛΩΘΕΙ Η ΚΥΡΙΑΚΗ 18/10');
    expect(outsNote(s, SAT, 3, outs.find(x => x.p.id === 3)!.st)).toBe('ΓΑΜΟΣ, ΓΥΡΝΑ ΣΑΒΒΑΤΟ 17/10 22:00');
    expect(stay.find(x => x.p.id === 4)!.note).toMatch(/ΓΡΑΦΕΙΟ$/);
    s = run(s, { t: 'outs', date: SAT, changes: [], notes: [{ pid: 2, note: '' }, { pid: 3, note: ' ' }, { pid: 4, note: '' }] });
    expect(s.outNotes![SAT]).toBeUndefined();
  });
});
