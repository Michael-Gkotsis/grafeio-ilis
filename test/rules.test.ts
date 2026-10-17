import { describe, it, expect } from 'vitest';
import { apply, type Ctx } from '../src/shared/commands';
import { statusesOn, guardUnavailable, fillDay, hkaiCounts, outRoomsOn, capsOf, strengthOf, dutyStats, monthStats, dutyMonths } from '../src/shared/rules';
import { unitOf } from '../src/shared/domain';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'id' + ++seq };

describe('κανόνες', () => {
  it('Κ-19: η ποινή ισχύει αμέσως (Michael, 17/10)· όσες είχαν μείνει «αιτείται» ισχύουν κι αυτές', () => {
    let s = fakeState(10);
    s = apply(s, { t: 'declare', cmd: { type: 'PUN', pids: [3], from: '2026-10-12', to: '2026-10-15', kind: 'Περιορισμός' } }, ctx).state;
    expect(s.statuses[0].pending).toBeUndefined();
    expect(statusesOn(s.statuses, 3, '2026-10-13')).toHaveLength(1);
    const old = { ...s, statuses: [{ ...s.statuses[0], id: 'old', pid: 4, pending: true }] };
    expect(statusesOn(old.statuses, 4, '2026-10-13')).toHaveLength(0);
    s = apply(old, { t: 'setNightTraining', date: '2026-10-20', on: true }, ctx).state;
    expect(s.statuses[0].pending).toBeUndefined();
    expect(statusesOn(s.statuses, 4, '2026-10-13')).toHaveLength(1);
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
  it('το ευρετήριο ανά άτομο δίνει ό,τι και η πλήρης αναζήτηση', () => {
    const st: any[] = []; let n = 0;
    for (let i = 0; i < 400; i++) st.push({ id: 'z' + n++, pid: (i * 7) % 13 + 1, type: ['OUT', 'DN', 'EA', 'LEAVE', 'PUN'][i % 5], from: '2026-10-' + String(1 + (i % 20)).padStart(2, '0'), to: '2026-10-' + String(3 + (i % 20)).padStart(2, '0'), pending: i % 11 === 0 });
    for (let pid = 1; pid <= 14; pid++) for (const d of ['2026-10-01', '2026-10-05', '2026-10-15', '2026-10-30']) {
      const brute = st.filter(x => x.pid === pid && !x.pending && x.from <= d && d <= x.to).map(x => x.id).sort();
      expect(statusesOn(st, pid, d).map(x => x.id).sort()).toEqual(brute);
    }
  });
  it('έλεγχος υπηρεσιών ανά μήνα: μόνο οι υπηρεσίες του μήνα, χωρίς τις προηγούμενες', () => {
    let s = fakeState(10);
    s = apply(s, { t: 'assign', date: '2026-09-30', k: 'th1', pid: 2 }, ctx).state;
    s = apply(s, { t: 'assign', date: '2026-10-03', k: 'th1', pid: 2 }, ctx).state;
    s = apply(s, { t: 'assign', date: '2026-10-05', k: 'th1', pid: 3 }, ctx).state;
    s = { ...s, baseline: { 2: { th: 4 } } };
    expect(dutyStats(s).get(2)!.total).toBe(6);
    const oct = monthStats(dutyStats(s), '2026-10');
    expect(oct.get(2)).toMatchObject({ total: 1, hol: 1, last: '2026-10-03' });
    expect(oct.get(3)!.total).toBe(1);
    expect(monthStats(dutyStats(s), '2026-08').size).toBe(0);
    expect(dutyMonths(s)).toEqual(['2026-10', '2026-09']);
  });
});
