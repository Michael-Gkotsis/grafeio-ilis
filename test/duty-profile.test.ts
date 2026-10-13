// Συντομεύσεις «Τι κάνει» στην καρτέλα (Michael, 13/10): γράφουν στα ίδια δεδομένα με τα κουτάκια, με μία αναίρεση
import { describe, it, expect } from 'vitest';
import { apply, type Ctx } from '../src/shared/commands';
import { capsOf, offDayBlock } from '../src/shared/rules';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'id' + ++seq };
const SAT = '2026-10-17', TUE = '2026-10-13';

describe('setDutyProfile', () => {
  it('«Όχι ΣΚ» γράφει τις ίδιες μέρες με τα κουτάκια', () => {
    const r = apply(fakeState(5), { t: 'setDutyProfile', pid: 2, days: [6, 0], text: 'όχι υπηρεσία ΣΚ' }, ctx);
    expect(r.state.people[1].offDays).toEqual([6, 0]);
    expect(offDayBlock(r.state, SAT, 2)).toBeTruthy();
    expect(offDayBlock(r.state, TUE, 2)).toBeNull();
    expect(r.text).toContain('όχι υπηρεσία ΣΚ');
  });
  it('«Μόνο μαγειρεία» και πίσω', () => {
    const s1 = apply(fakeState(5), { t: 'setDutyProfile', pid: 2, off: ['th', 'op', 'sk', 'tae', 'other'], on: ['mg'], text: 'μόνο μαγειρεία' }, ctx).state;
    expect(Object.keys(capsOf(s1, 2)).sort()).toEqual(['op', 'other', 'sk', 'tae', 'th']);
    const s2 = apply(s1, { t: 'setDutyProfile', pid: 2, on: ['th', 'op', 'sk', 'tae', 'other'], text: 'ξανά όλες' }, ctx).state;
    expect(capsOf(s2, 2)).toEqual({});
    expect(s2.caps[2]).toBeUndefined();
  });
  it('δεν παρακάμπτει τη Σ.Ι.: το «on» σβήνει μόνο την εξαίρεση του λοχία', () => {
    const s0 = fakeState(10);   // ο 10ος είναι Ι3 ΑΟΠΛΟ
    const s1 = apply(s0, { t: 'setDutyProfile', pid: 10, on: ['op', 'sk'], text: 'ξανά' }, ctx).state;
    expect(Object.keys(capsOf(s1, 10)).sort()).toEqual(['op', 'sk', 'tae']);   // ο άοπλος ούτε σε ΤΑΕ (ένοπλη)
  });
  it('«Καμία εξαίρεση» σβήνει δυνατότητα και μέρες του λοχία', () => {
    let s = apply(fakeState(5), { t: 'setDutyProfile', pid: 3, off: ['sk'], days: [6], text: 'x' }, ctx).state;
    s = apply(s, { t: 'setDutyProfile', pid: 3, reset: true, text: 'χωρίς εξαιρέσεις' }, ctx).state;
    expect(s.caps[3]).toBeUndefined();
    expect('offDays' in s.people[2]).toBe(false);
  });
});
