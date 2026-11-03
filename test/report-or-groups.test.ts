// Έντυπα: «Ομάδες φίλτρων» (RepPick.or): μπαίνει όποιος περνά την ομάδα 1 Ή μία από τις άλλες
import { describe, it, expect } from 'vitest';
import { addGroup, candidates, condGroups, defaultPick, matchGroup, moreRows, pickText, removeGroup, setGroupCond, type Report } from '../src/shared/reports';
import type { Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-29';
const st = (id: string, pid: number, type: Status['type'], from: string, to: string): Status => ({ id, pid, type, from, to });
function mk() {
  const s = fakeState(12);
  // 1: ιατρικό σήμερα, 2: ιατρικό από χθες, 3: εισαγωγή σήμερα, 4: εισαγωγή από χθες, 5: άδεια
  s.statuses = [st('a', 1, 'EY', D, '2026-10-30'), st('b', 2, 'EA', '2026-10-27', '2026-10-30'), st('c', 3, 'STEP', D, D), st('d', 4, 'NOS', '2026-10-28', '2026-10-31'), st('e', 5, 'LEAVE', D, '2026-11-02')];
  return s;
}
const pick = (x: Partial<Report['pick']>) => ({ ...defaultPick(), ...x });
const ids = (s: ReturnType<typeof mk>, x: Partial<Report['pick']>) => candidates(s, { kind: 'people', pick: pick(x) }, D).map(p => (p as any).id).filter((i: number) => i <= 8).sort((a: number, b: number) => a - b);
const text = (x: Partial<Report['pick']>) => pickText({ kind: 'people', pick: pick(x) }, { settings: {} as any });

describe('ομάδες φίλτρων: Ή', () => {
  it('ιατρικό ή εισαγωγή τη μέρα, με stNew σε όλες τις ομάδες', () => {
    const s = mk();
    expect(ids(s, { need: ['med'], or: [{ need: ['other'] }] })).toEqual([1, 2, 3, 4]);
    expect(ids(s, { need: ['med'], or: [{ need: ['other'] }], stNew: true })).toEqual([1, 3]);
  });
  it('μικτά: (παρόντες και ιατρικό) ή εισαγωγή', () => {
    const s = mk();
    expect(ids(s, { need: ['present', 'med'], or: [{ need: ['other'] }] })).toEqual([1, 2, 3, 4]);
    expect(ids(s, { need: ['med'], not: ['other'], or: [{ need: ['leave'] }] })).toEqual([1, 2, 5]);
  });
  it('κενή ομάδα: μπαίνουν όλοι', () => {
    const s = mk(); const all = ids(s, {});
    expect(ids(s, { need: ['med'], or: [{}] })).toEqual(all);
    expect(ids(s, { or: [{ need: ['med'] }] })).toEqual(all);
  });
  it('χωρίς or όπως πριν', () => {
    const s = mk();
    expect(ids(s, { need: ['med'] })).toEqual([1, 2]);
    expect(ids(s, { need: ['med'], or: undefined })).toEqual(ids(s, { need: ['med'] }));
    expect(ids(s, { from: 'present', noDuty: true })).toEqual(ids(s, { need: ['present'], not: ['duty'] }));
  });
  it('πάντα, ποτέ και θάλαμοι ισχύουν για όλες', () => {
    const s = mk(); const base = { need: ['med' as const], or: [{ need: ['other' as const] }] };
    expect(ids(s, { ...base, never: [1] })).toEqual([2, 3, 4]);
    const rm = s.people.find(p => p.id === 3)!.room;
    expect(ids(s, { ...base, rooms: [rm as number] })).toEqual(ids(s, base).filter(i => s.people.find(p => p.id === i)!.room === rm));
  });
  it('πίνακες 2–6 (moreRows) κρατούν το or', () => {
    const s = mk();
    const more = [{ id: 't2', kind: 'people' as const, head: 1, cols: [], pick: pick({ need: ['med'], or: [{ need: ['other'] }] }), sort: 'name' as const }];
    const rows = moreRows(s, { more } as any, D)[0].map(p => (p as any).id).filter((i: number) => i <= 8).sort();
    expect(rows).toEqual([1, 2, 3, 4]);
  });
});

describe('ομάδες φίλτρων: βοηθητικά', () => {
  it('condGroups: ομαλοποίηση και σειρά', () => {
    const g = condGroups({ ...pick({ need: ['med'] }), or: [{ need: ['other', 'med', 'med'], not: ['med', 'leave'] }] });
    expect(g[0]).toEqual({ need: ['med'], not: [] });
    expect(g[1]).toEqual({ need: ['med', 'other'], not: ['leave'] });
  });
  it('setGroupCond / addGroup / removeGroup', () => {
    let pk = pick({ need: ['med'] });
    pk = addGroup(pk, 0); expect(pk.or).toEqual([{ need: ['med'], not: [] }]);
    pk = setGroupCond(pk, 1, 'med', 'any'); pk = setGroupCond(pk, 1, 'other', 'yes');
    expect(pk.or).toEqual([{ need: ['other'], not: [] }]); expect(pk.need).toEqual(['med']);
    pk = setGroupCond(pk, 0, 'leave', 'no'); expect(pk.not).toEqual(['leave']);
    pk = addGroup(pk, 1); expect(pk.or!.length).toBe(2);
    pk = removeGroup(pk, 2); expect(pk.or!.length).toBe(1);
    pk = removeGroup(pk, 0); expect(pk.need).toEqual(['other']); expect(pk.not).toEqual([]); expect(pk.or).toBeUndefined();
  });
  it('removeGroup(0) κάνει την 2η ομάδα πρώτη', () => {
    const s = mk(); const pk = pick({ need: ['med'], or: [{ need: ['other'] }] });
    expect(candidates(s, { kind: 'people', pick: removeGroup(pk, 0) }, D).map(p => (p as any).id).filter((i: number) => i <= 8).sort()).toEqual([3, 4]);
  });
  it('matchGroup: η πρώτη ομάδα που περνά', () => {
    const s = mk(); const f = matchGroup(s, pick({ need: ['med'], or: [{ need: ['other'] }] }), D);
    const by = (id: number) => f(s.people.find(p => p.id === id)!);
    expect([by(1), by(3), by(5)]).toEqual([0, 1, -1]);
  });
});

describe('ομάδες φίλτρων: pickText', () => {
  it('μία λέξη ανά ομάδα χωρίς παρενθέσεις', () => {
    expect(text({ need: ['med'], or: [{ need: ['other'] }], stNew: true })).toBe('Όλοι οι στρατιώτες (με ιατρικό ή με εισαγωγή, μόνο όσα δηλώθηκαν τη μέρα)');
  });
  it('πολλές λέξεις σε παρενθέσεις', () => {
    expect(text({ need: ['present', 'med'], or: [{ need: ['other'] }] })).toBe('Όλοι οι στρατιώτες ((παρόντες και με ιατρικό) ή με εισαγωγή)');
  });
  it('παρόντες σε όλες τις ομάδες: στην αρχή', () => {
    expect(text({ need: ['present', 'med'], or: [{ need: ['present', 'other'] }] })).toBe('Όλοι από τους παρόντες (με ιατρικό ή με εισαγωγή)');
  });
  it('χωρίς or ίδιο με πριν', () => {
    expect(text({ need: ['present', 'med'], not: ['duty'] })).toBe('Όλοι από τους παρόντες (με ιατρικό, χωρίς υπηρεσία)');
    expect(text({ need: ['med'], or: [] })).toBe(text({ need: ['med'] }));
  });
});
