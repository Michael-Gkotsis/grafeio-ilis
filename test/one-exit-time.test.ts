// Μία ώρα εξόδου (Michael, 1/11): η «Αρχή εξόδου» της μέρας (πίνακας εβδομάδας + αλλαγή μιας μέρας) κρίνει και όσους γυρίζουν από άδεια.
// Το παλιό rules.outTime (16:00) δεν διαβάζεται πια. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import type { AppState, Status } from '../src/shared/domain';
import { outBlock, outMinOn, planStatusChange, statusesFrom } from '../src/shared/rules';
import { awayAtOut, outsAndStay } from '../src/shared/outsStay';
import { atOf } from '../src/shared/values';
import { fakeState } from './fixtures';

const WED = '2026-10-14', TODAY = '2026-10-12', pid = 3;
const back = (toTime: string): AppState => ({ ...fakeState(10), statuses: [{ id: 'l', pid, type: 'LEAVE', kind: 'Κανονική', from: '2026-10-10', to: WED, toTime } as Status] });
const stays = (s: AppState) => outsAndStay(s, WED).stay.some(x => x.p.id === pid);

describe('μία ώρα εξόδου', () => {
  it('η ώρα εξόδου μιας μέρας είναι η «Αρχή εξόδου» της: 17:00 από προεπιλογή, ο πίνακας εβδομάδας και η αλλαγή της μέρας την αλλάζουν', () => {
    const s = fakeState(10);
    expect(outMinOn(s, WED)).toBe(17 * 60);
    expect(outMinOn({ ...s, rules: { ...s.rules, week: { 3: { out: '18:30' } } } }, WED)).toBe(18 * 60 + 30);
    expect(outMinOn({ ...s, dayPlan: { [WED]: { out: '16:00' } } }, WED)).toBe(16 * 60);
    expect(outMinOn({ ...s, dayPlan: { [WED]: { out: '16:00' } } }, '2026-10-15')).toBe(17 * 60);
  });
  it('το παλιό rules.outTime δεν μετρά πια', () => {
    const s = back('16:30');
    expect(outBlock({ ...s, rules: { ...s.rules, outTime: '16:00' } }, WED, pid)).toBeNull();
  });
  it('επιστροφή από άδεια 16:30, έξοδος της μέρας 17:00: γύρισε στην ώρα, είναι παραμένων (και βγαίνει έξοδο)', () => {
    const s = back('16:30');
    expect(outBlock(s, WED, pid)).toBeNull();
    expect(awayAtOut(s, WED, pid)).toBeNull();
    expect(stays(s)).toBe(true);
    expect(planStatusChange(s, { type: 'OUT', pids: [pid], from: WED, to: WED }, TODAY).blocked).toEqual([]);
  });
  it('η ίδια επιστροφή 16:30, αλλά η μέρα άλλαξε σε έξοδο 16:00: δεν γύρισε στην ώρα, είναι ακόμα σε άδεια', () => {
    const s = { ...back('16:30'), dayPlan: { [WED]: { out: '16:00' } } };
    expect(outBlock(s, WED, pid)).toBe('ΚΑ (γυρίζει 16:30)');
    expect(awayAtOut(s, WED, pid)?.type).toBe('LEAVE');
    expect(stays(s)).toBe(false);
    expect(planStatusChange(s, { type: 'OUT', pids: [pid], from: WED, to: WED }, TODAY).blocked).toHaveLength(1);
    expect(statusesFrom(s.statuses, pid, WED, outMinOn(s, WED))).toHaveLength(1);
  });
  it('οι πίνακες τιμών «ώρα εξόδου» μετρούν στην ώρα εξόδου της μέρας', () => {
    const s = { ...fakeState(10), dayPlan: { [WED]: { out: '16:00' } } };
    expect(atOf(s, 'out', WED, TODAY, 600)).toBe(16 * 60); expect(atOf(s, 'out', '2026-10-15', TODAY, 600)).toBe(17 * 60);
  });
});
