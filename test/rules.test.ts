import { describe, it, expect } from 'vitest';
import { apply, type Ctx } from '../src/shared/commands';
import { statusesOn, guardUnavailable, fillDay, hkaiCounts, outRoomsOn, capsOf, strengthOf } from '../src/shared/rules';
import { unitOf } from '../src/shared/domain';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'id' + ++seq };

describe('κανόνες', () => {
  it('Κ-19: η ποινή αιτείται και ισχύει μόνο όταν εγκριθεί', () => {
    let s = fakeState(10);
    s = apply(s, { t: 'declare', cmd: { type: 'PUN', pids: [3], from: '2026-10-12', to: '2026-10-15', kind: 'Περιορισμός' } }, ctx).state;
    const st = s.statuses[0];
    expect(st.pending).toBe(true);
    expect(statusesOn(s.statuses, 3, '2026-10-13')).toHaveLength(0);
    s = apply(s, { t: 'approvePun', id: st.id }, ctx).state;
    expect(statusesOn(s.statuses, 3, '2026-10-13')).toHaveLength(1);
  });
  it('ΕΥ βγάζει το άτομο από τη θέση του και δεν επιτρέπει υπηρεσία', () => {
    let s = fakeState(10);
    s = apply(s, { t: 'assign', date: '2026-10-13', k: 'th1', pid: 2 }, ctx).state;
    s = apply(s, { t: 'declare', cmd: { type: 'EY', pids: [2], from: '2026-10-12', to: '2026-10-14' } }, ctx).state;
    expect(s.guards['2026-10-13'].th1).toBeUndefined();
    expect(guardUnavailable(s, '2026-10-13', 2, 'th1')).toBeTruthy();
  });
  it('η αυτόματη συμπλήρωση γεμίζει όλες τις θέσεις χωρίς διπλοθεσίες', () => {
    const s = fakeState(40);
    const r = fillDay(s, '2026-10-13');
    const ids = Object.values(r.guards['2026-10-13']);
    expect(r.n).toBe(15);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(6); // πόστο ΚΨΜ
  });
  it('Κ-15: Ι3 άοπλος δεν κάνει οπλοφύλακα ή σκοπιά', () => {
    const s = fakeState(12);
    expect(capsOf(s, 10).op).toBeTruthy();
    expect(capsOf(s, 10).th).toBeFalsy();
  });
  it('Κ-16, Κ-18: θάλαμοι εξόδου και ουλαμός', () => {
    const s = fakeState(8);
    expect(outRoomsOn(s.rules, '2026-10-17')).toEqual([1, 2, 3, 4]); // Σάββατο
    expect(outRoomsOn(s.rules, '2026-10-18')).toEqual([5, 6, 7, 8]); // Κυριακή
    expect(unitOf(s.people[6])).toBe('2ος Ουλ.');
  });
  it('Κ-17: διαθέσιμοι = σύνολο − απόντες', () => {
    let s = fakeState(20);
    s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [4, 5], from: '2026-10-10', to: '2026-10-20' } }, ctx).state;
    const hk = hkaiCounts(s, '2026-10-12');
    expect(hk.apo).toBe(2);
    expect(hk.avail).toBe(18);
    expect(strengthOf(s, '2026-10-12').present).toBe(18);
  });
  it('εισαγωγή: ταιριάζει με ΑΣΜ και βγάζει εκτός δύναμης όσους λείπουν (και έχουν ιστορικό)', () => {
    const s = apply(fakeState(5), { t: 'declare', cmd: { type: 'EA', pids: [5], from: '2026-10-01', to: '2026-10-02' } }, ctx).state;
    const rows = s.people.slice(0, 4).map(({ id, active, ...p }) => ({ ...p, phone: '6999999999' }));
    const r = apply(s, { t: 'importPeople', rows, source: 'test.xlsx', deactivateMissing: true }, ctx);
    expect(r.state.people).toHaveLength(5);
    expect(r.state.people[0].phone).toBe('6999999999');
    expect(r.state.people[4].active).toBe(false);
  });
});
