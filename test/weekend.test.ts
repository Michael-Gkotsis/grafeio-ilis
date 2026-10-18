// ΔΝ ΣΚ το Σάββατο, επιστροφές και παρατηρήσεις εξοδούχων/παραμενόντων (Michael, 18/10)
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fakeState } from './fixtures';
import { backTxt, returnsOn } from '../src/shared/weekend';
import { outsAndStay, outsNote } from '../src/main/exports';
import type { AppState } from '../src/shared/domain';

let seq = 0;
const ctx: Ctx = { today: '2026-10-16', newId: () => 'w' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const SAT = '2026-10-17', SUN = '2026-10-18', MON = '2026-10-19';
const dnsk = (s: AppState, pid: number) => run(s, { t: 'outs', date: SAT, changes: [{ pid, from: null, to: 'DN', wk: true }], force: true });
const on = (s: AppState, pid: number, d: string) => s.statuses.filter(x => x.pid === pid && x.from <= d && d <= x.to);

describe('ΔΝ ΣΚ', () => {
  it('ΔΝ το Σάββατο και μόνος του εξοδούχος την Κυριακή, γυρίζει Κυριακή βράδυ', () => {
    const s = dnsk(fakeState(10), 2);
    expect(on(s, 2, SAT)).toMatchObject([{ type: 'DN', kind: 'ΣΚ' }]);
    expect(on(s, 2, SUN)).toMatchObject([{ type: 'OUT', kind: 'ΣΚ' }]);
    const b = returnsOn(s, SAT).find(x => x.p.id === 2)!;
    expect(backTxt(b)).toBe('Κυριακή 18/10 βράδυ · τέλος ΔΝ ΣΚ');
  });
  it('με υπηρεσία την Κυριακή: μόνο η ΔΝ, γυρίζει Κυριακή πρωί για την υπηρεσία', () => {
    let s = run(fakeState(10), { t: 'assign', date: SUN, k: 'ly', pid: 2, force: 'x' });
    s = dnsk(s, 2);
    expect(on(s, 2, SUN).filter(x => x.type === 'OUT')).toEqual([]);
    const b = returnsOn(s, SAT).find(x => x.p.id === 2)!;
    expect(b).toMatchObject({ day: SUN, part: 'πρωί', duty: 'Λ/Υ', dutyTime: '14:00' });
    expect(backTxt(b)).toBe('Κυριακή 18/10 πρωί · Λ/Υ από 14:00');
    expect(outsNote(s, SAT, 2, on(s, 2, SAT)[0])).toBe('ΔΝ ΣΚ, ΥΠΗΡΕΣΙΑ ΚΥΡΙΑΚΗ Λ/Υ 14:00');
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
    expect(backTxt(returnsOn(s, SAT).find(x => x.p.id === 2)!)).toBe('Δευτέρα 19/10 πρωί · μετά τη ΔΝ');
  });
  it('έξοδος με υπηρεσία μέσα (με επιβεβαίωση): γυρίζει ως την ώρα της υπηρεσίας', () => {
    let s = dnsk(fakeState(10), 2);
    s = run(s, { t: 'assign', date: SUN, k: 'ly', pid: 2, force: 'x' });
    const b = returnsOn(s, SAT).find(x => x.p.id === 2)!;
    expect(backTxt(b)).toBe('Κυριακή 18/10 ως 14:00 · Λ/Υ');
    expect(returnsOn(s, MON).find(x => x.p.id === 2)).toBeUndefined();
  });
});

describe('παρατηρήσεις εξοδούχων και παραμενόντων', () => {
  it('γράφονται σε παρένθεση δίπλα στην κατάσταση, και σβήνουν με κενό', () => {
    let s = run(fakeState(10), { t: 'outs', date: SAT, changes: [{ pid: 2, from: null, to: 'DN' }, { pid: 3, from: null, to: 'OUT' }], notes: [{ pid: 2, note: 'Ιατρος Στεπ' }, { pid: 3, note: 'γάμος' }, { pid: 4, note: 'ΓΡΑΦΕΙΟ' }] });
    expect(s.outNotes![SAT]).toEqual({ 2: 'ΙΑΤΡΟΣ ΣΤΕΠ', 3: 'ΓΑΜΟΣ', 4: 'ΓΡΑΦΕΙΟ' });
    const { outs, stay } = outsAndStay(s, SAT);
    expect(outsNote(s, SAT, 2, outs.find(x => x.p.id === 2)!.st)).toBe('ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)');
    expect(outsNote(s, SAT, 3, outs.find(x => x.p.id === 3)!.st)).toBe('ΓΑΜΟΣ');
    expect(stay.find(x => x.p.id === 4)!.note).toMatch(/ΓΡΑΦΕΙΟ$/);
    s = run(s, { t: 'outs', date: SAT, changes: [], notes: [{ pid: 2, note: '' }, { pid: 3, note: ' ' }, { pid: 4, note: '' }] });
    expect(s.outNotes![SAT]).toBeUndefined();
  });
});
