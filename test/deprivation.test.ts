// Στέρηση εξόδου (Michael, 13/10): οι μέρες με υπηρεσία και με βραδινή εκπαίδευση δεν μετράνε, η λήξη μετακινείται.
// Και οι ποινές με κεφαλαία.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fakeState } from './fixtures';
import { punDays, punLbl, punText, skippedDays } from '../src/shared/punish';
import { statusLbl } from '../src/shared/ranks';
import { fieldValue } from '../src/shared/sources';
import type { AppState } from '../src/shared/domain';

let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'd' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const SE = 'Στέρηση εξόδου';
const declare = (s: AppState, pid: number, from: string, to: string, kind = SE) => run(s, { t: 'declare', cmd: { type: 'PUN', pids: [pid], from, to, kind } as any });
const pun = (s: AppState) => s.statuses.find(x => x.type === 'PUN')!;

describe('στέρηση εξόδου', () => {
  it('κρατά τις ημέρες της· χωρίς υπηρεσίες λήγει όπως δηλώθηκε', () => {
    const s = declare(fakeState(10), 2, '2026-10-13', '2026-10-16');
    expect(pun(s)).toMatchObject({ days: 4, to: '2026-10-16' });
  });
  it('η μέρα με υπηρεσία δεν μετρά: η λήξη πάει μία μέρα μετά, και γυρνά πίσω αν βγει η υπηρεσία', () => {
    let s = declare(fakeState(10), 2, '2026-10-13', '2026-10-16');
    s = run(s, { t: 'assign', date: '2026-10-14', k: 'mg1', pid: 2 });
    expect(pun(s).to).toBe('2026-10-17');
    expect(skippedDays(s, pun(s))).toEqual([{ date: '2026-10-14', why: 'duty' }]);
    s = run(s, { t: 'assign', date: '2026-10-14', k: 'mg1', pid: null });
    expect(pun(s).to).toBe('2026-10-16');
  });
  it('υπηρεσία που υπάρχει ήδη στο διάστημα μετρά από τη δήλωση', () => {
    let s = run(fakeState(10), { t: 'assign', date: '2026-10-13', k: 'mg1', pid: 2 });
    s = declare(s, 2, '2026-10-13', '2026-10-14');
    expect(pun(s)).toMatchObject({ days: 2, to: '2026-10-15' });
  });
  it('βραδινή εκπαίδευση: δεν μετρά για κανέναν, και ξαναμετρά όταν βγει', () => {
    let s = declare(fakeState(10), 2, '2026-10-13', '2026-10-14');
    s = declare(s, 3, '2026-10-13', '2026-10-13');
    s = run(s, { t: 'setNightTraining', date: '2026-10-13', on: true });
    expect(s.nightTraining).toEqual({ '2026-10-13': true });
    expect(s.statuses.filter(x => x.type === 'PUN').map(x => x.to)).toEqual(['2026-10-15', '2026-10-14']);
    s = run(s, { t: 'setNightTraining', date: '2026-10-13', on: false });
    expect(s.statuses.filter(x => x.type === 'PUN').map(x => x.to)).toEqual(['2026-10-14', '2026-10-13']);
  });
  it('υπηρεσία μέσα στις μέρες που προστέθηκαν μετακινεί κι αυτή τη λήξη', () => {
    let s = declare(fakeState(10), 2, '2026-10-13', '2026-10-14');
    s = run(s, { t: 'setNightTraining', date: '2026-10-14', on: true });
    expect(pun(s).to).toBe('2026-10-15');
    s = run(s, { t: 'assign', date: '2026-10-15', k: 'mg1', pid: 2 });
    expect(pun(s).to).toBe('2026-10-16');
  });
  it('οι άλλες ποινές δεν μετακινούνται', () => {
    let s = declare(fakeState(10), 2, '2026-10-13', '2026-10-14', 'Κράτηση');
    s = run(s, { t: 'assign', date: '2026-10-13', k: 'mg1', pid: 2 });
    expect(pun(s).to).toBe('2026-10-14'); expect(pun(s).days).toBeUndefined();
  });
  it('το κείμενο και το Excel γράφουν τις ημέρες της ποινής, όχι τις μέρες ως τη λήξη', () => {
    let s = declare(fakeState(10), 2, '2026-10-13', '2026-10-14');
    s = run(s, { t: 'assign', date: '2026-10-13', k: 'mg1', pid: 2 });
    const st = pun(s); const p = s.people.find(x => x.id === 2)!;
    expect(punDays(st)).toBe(2);
    expect(punText(p, st).dur).toBe('ΔΥΟ (02) ΗΜΕΡΕΣ ΣΤΕΡΗΣΗ ΕΞΟΔΟΥ');
    expect(fieldValue('days', 'punish', st, p)).toBe(2);
  });
  it('«Σταμάτησε νωρίτερα»: η λήξη μένει εκεί που σταμάτησε', () => {
    let s = declare(fakeState(10), 2, '2026-10-10', '2026-10-14');
    s = run(s, { t: 'endStatus', id: pun(s).id });
    s = run(s, { t: 'assign', date: '2026-10-10', k: 'mg1', pid: 2 });
    expect(pun(s).to).toBe('2026-10-11');
  });
  it('από Excel: η λήξη του αρχείου μένει, μετακινείται μόνο για όσα μπουν αργότερα', () => {
    let s = run(fakeState(10), { t: 'assign', date: '2026-10-13', k: 'mg1', pid: 2 });
    s = run(s, { t: 'importRecords', adds: [{ pid: 2, type: 'PUN', from: '2026-10-13', to: '2026-10-15', kind: SE }], updates: [], source: 'x.xlsx', what: 'ποινές' });
    expect(pun(s)).toMatchObject({ days: 2, to: '2026-10-15' });
    s = run(s, { t: 'setNightTraining', date: '2026-10-14', on: true });
    expect(pun(s).to).toBe('2026-10-16');
    s = run(s, { t: 'importRecords', adds: [], updates: [{ id: pun(s).id, patch: { to: '2026-10-18' } }], source: 'x.xlsx', what: 'ποινές' });
    expect(pun(s)).toMatchObject({ days: 4, to: '2026-10-18' });
  });
});

describe('ποινές με κεφαλαία', () => {
  it('είδος, σήμα και Excel', () => {
    expect(punLbl(SE)).toBe('ΣΤΕΡΗΣΗ ΕΞΟΔΟΥ');
    expect(statusLbl({ type: 'PUN', kind: 'Περιορισμός' })).toBe('ΠΕΡΙΟΡΙΣΜΟΣ');
    const s = declare(fakeState(10), 2, '2026-10-13', '2026-10-14', 'Κράτηση');
    expect(fieldValue('kind', 'punish', pun(s), s.people[1])).toBe('ΚΡΑΤΗΣΗ');
  });
});
