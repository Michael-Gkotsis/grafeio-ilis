// Έντυπα: «Μόνο όσα δηλώθηκαν τη μέρα του εντύπου» (RepPick.stNew) στα φίλτρα και στις στήλες καταστάσεων, και το φίλτρο «Εισαγωγή»
import { describe, it, expect } from 'vitest';
import { candidates, defaultPick, fieldValue, pickText, pickForKind, stNewCols, type Report } from '../src/shared/reports';
import type { Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-29';
const st = (id: string, pid: number, type: Status['type'], from: string, to: string, x: Partial<Status> = {}): Status => ({ id, pid, type, from, to, ...x });
function mk() {
  const s = fakeState(12);
  s.statuses = [st('a', 1, 'EY', D, '2026-10-30'), st('b', 2, 'EA', '2026-10-27', '2026-10-30'), st('c', 3, 'STEP', D, D), st('d', 4, 'NOS', '2026-10-28', '2026-10-31'),
    st('e', 5, 'LEAVE', D, '2026-11-02'), st('f', 6, 'LEAVE', '2026-10-25', '2026-11-02'), st('g', 7, 'PUN', D, '2026-10-31', { kind: 'Περιορισμός' }), st('h', 8, 'PUN', '2026-10-26', '2026-10-31', { kind: 'Περιορισμός' })];
  return s;
}
const rep = (pick: Partial<Report['pick']>) => ({ kind: 'people' as const, pick: { ...defaultPick(), ...pick } });
const ids = (s: ReturnType<typeof mk>, pick: Partial<Report['pick']>) => candidates(s, rep(pick), D).map(p => (p as any).id).filter((i: number) => i <= 8).sort((a: number, b: number) => a - b);
const v = (s: ReturnType<typeof mk>, pid: number, f: string, o?: any) => fieldValue(s, 'people', s.people.find(p => p.id === pid)!, f, 0, D, undefined, o);

describe('stNew: φίλτρα', () => {
  it('«Με ιατρικό»: χωρίς stNew όλοι, με stNew μόνο όποιος ξεκινά τη μέρα', () => {
    const s = mk();
    expect(ids(s, { need: ['med'] })).toEqual([1, 2]);
    expect(ids(s, { need: ['med'], stNew: true })).toEqual([1]);
  });
  it('«Χωρίς ιατρικό» + stNew: μένει όποιος έχει ιατρικό από νωρίτερα', () => {
    const s = mk(); const all = ids(s, {});
    expect(ids(s, { not: ['med'], stNew: true })).toEqual(all.filter(i => i !== 1));
    expect(ids(s, { not: ['med'] })).toEqual(all.filter(i => i !== 1 && i !== 2));
  });
  it('«Εισαγωγή» (ΣΤΕΠ, νοσοκομείο)', () => {
    const s = mk();
    expect(ids(s, { need: ['other'] })).toEqual([3, 4]);
    expect(ids(s, { need: ['other'], stNew: true })).toEqual([3]);   // το ΝΟΣ ξεκίνησε χθες
    expect(ids(s, { not: ['other'], stNew: true })).toEqual(ids(s, {}).filter(i => i !== 3));
  });
  it('άδεια και ποινή', () => {
    const s = mk();
    expect(ids(s, { need: ['leave'] })).toEqual([5, 6]); expect(ids(s, { need: ['leave'], stNew: true })).toEqual([5]);
    expect(ids(s, { need: ['pun'] })).toEqual([7, 8]); expect(ids(s, { need: ['pun'], stNew: true })).toEqual([7]);
  });
  it('χωρίς stNew όπως πριν', () => {
    const s = mk();
    expect(ids(s, { need: ['med'] })).toEqual(ids(s, { need: ['med'], stNew: undefined }));
  });
});

const so = (f: string) => stNewCols([{ f } as { f: string; o?: any }], { stNew: true })[0].o;
describe('stNew: στήλες', () => {
  it('στήλη χωρίς st δείχνει μόνο τα σημερινά', () => {
    const s = mk();
    expect(v(s, 2, 'smed')).toBe('ΕΑ');
    expect(v(s, 2, 'smed', so('smed'))).toBe('');
    expect(v(s, 1, 'smed', so('smed'))).toBe('ΕΥ');
    expect(v(s, 4, 'sother', so('sother'))).toBe('');
  });
  it('χωρίς stNew οι στήλες μένουν ίδιες, και μόνο οι στήλες καταστάσεων αλλάζουν', () => {
    const cols: { f: string; o?: any }[] = [{ f: 'last' }, { f: 'smed', o: { sf: '{ΚΩΔ}' } }, { f: 'stype' }];
    expect(stNewCols(cols, undefined)).toBe(cols); expect(stNewCols(cols, {})).toBe(cols);
    const n = stNewCols(cols, { stNew: true });
    expect(n[0]).toBe(cols[0]); expect(n[1].o).toEqual({ sf: '{ΚΩΔ}', st: 'new' }); expect(n[2]).toBe(cols[2]);
  });
  it('το stNew δεν μένει στις καταστάσεις/στελέχη', () => {
    const pk = { ...defaultPick(), stNew: true as const };
    expect(pickForKind('people', pk, 'name', 'people').pick.stNew).toBe(true);
    expect(pickForKind('people', pk, 'name', 'status').pick.stNew).toBeUndefined();
    expect(pickForKind('people', pk, 'name', 'cadre').pick.stNew).toBeUndefined();
  });
});

describe('stNew: σύνοψη', () => {
  it('η σύνοψη το αναφέρει', () => {
    const s = mk() as any;
    expect(pickText(rep({ need: ['med'], stNew: true }), s)).toContain('μόνο όσα δηλώθηκαν τη μέρα');
    expect(pickText(rep({ need: ['med'] }), s)).not.toContain('δηλώθηκαν');
    expect(pickText(rep({ need: ['other'] }), s)).toContain('με εισαγωγή');
  });
});
