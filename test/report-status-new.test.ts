// Έντυπα: «μόνο όσες ξεκινούν τη μέρα» (βγήκε σήμερα) σε στήλες καταστάσεων και στο έντυπο Καταστάσεων
import { describe, it, expect } from 'vitest';
import { candidates, defaultPick, fieldValue, pickText, type Report } from '../src/shared/reports';
import type { Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-29';
const st = (id: string, pid: number, type: Status['type'], from: string, to: string, x: Partial<Status> = {}): Status => ({ id, pid, type, from, to, ...x });
function mk() {
  const s = fakeState(12);
  s.statuses = [st('a', 1, 'EA', '2026-10-27', '2026-10-30'), st('b', 1, 'EY', D, '2026-10-30'), st('c', 2, 'EA', '2026-10-27', '2026-10-30'),
    st('d', 3, 'LEAVE', D, '2026-11-02'), st('e', 4, 'PUN', D, '2026-10-31', { kind: 'Περιορισμός' })];
  return s;
}
const v = (s: ReturnType<typeof mk>, pid: number, f: string, o?: any, d = D) => fieldValue(s, 'people', s.people.find(p => p.id === pid)!, f, 0, d, undefined, o);

describe('Στήλες: st «new»', () => {
  it('μόνο η κατάσταση που ξεκινά τη μέρα', () => {
    const s = mk();
    expect(v(s, 1, 'smed', { st: 'new' })).toBe('ΕΥ'); expect(v(s, 1, 'status', { st: 'new' })).toBe('ΕΥ');
    expect(v(s, 2, 'smed', { st: 'new' })).toBe('');   // το ΕΑ άρχισε νωρίτερα
    expect(v(s, 3, 'sabs', { st: 'new' })).toBe('ΚΑ'); expect(v(s, 4, 'spun', { st: 'new' })).toBe('ΠΕΡΙΟΡΙΣΜΟΣ');
    expect(v(s, 1, 'smed', { st: 'new' }, '2026-10-30')).toBe('');   // την επόμενη μέρα δεν ξεκινά τίποτα
  });
  it('χωρίς st: όπως πριν', () => {
    const s = mk();
    expect(v(s, 1, 'smed')).toBe(v(s, 1, 'smed', { st: undefined })); expect(String(v(s, 1, 'smed')).split(', ').sort()).toEqual(['ΕΑ', 'ΕΥ']); expect(v(s, 2, 'smed')).toBe('ΕΑ');
  });
  it('μαζί με «{ΚΩΔ} X{ΜΕΝΟΥΝ}»', () => {
    const s = mk(); const o = { st: 'new', sf: '{ΚΩΔ} X{ΜΕΝΟΥΝ}' };
    expect(v(s, 1, 'smed', o)).toBe('ΕΥ X2'); expect(v(s, 2, 'smed', o)).toBe('');
  });
  it('ο συνδυασμός δεν σπάει', () => {
    const s = mk();
    expect(v(s, 1, 'combo', { parts: ['last', 'smed'], fmt: '{1} ({2})', st: 'new' })).toMatch(/\(ΕΥ\)$/);
  });
});

describe('Καταστάσεις: when «new»', () => {
  const rep = (pick: Partial<Report['pick']>) => ({ kind: 'status' as const, pick: { ...defaultPick(), ...pick } });
  const pids = (s: ReturnType<typeof mk>, pick: Partial<Report['pick']>) => candidates(s, rep(pick), D).map(r => (r as any).st.id).sort();
  it('μόνο όσες ξεκινούν τη μέρα', () => {
    const s = mk();
    expect(pids(s, { when: 'new' })).toEqual(['b', 'd', 'e']);
    expect(pids(s, { when: 'on' })).toEqual(['a', 'b', 'c', 'd', 'e']);   // ίδιο με πριν
    expect(pids(s, {})).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('σέβεται τα είδη', () => {
    const s = mk();
    expect(pids(s, { when: 'new', cats: ['med'] })).toEqual(['b']); expect(pids(s, { when: 'new', cats: ['abs', 'pun'] })).toEqual(['d', 'e']);
  });
  it('η σύνοψη', () => { expect(pickText(rep({ when: 'new' }), mk() as any)).toContain('που ξεκινούν τη μέρα'); });
});
