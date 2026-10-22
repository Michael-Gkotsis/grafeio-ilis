// Δύναμη που αθροίζει (Michael, 22/10: «29 ΔΝ, 24 απλούς, 6 άδειους, μου βγάζει 73 παρόντες και 57 απόντες από 130,
// δεν βγαίνουν τα μαθηματικά»). Κάθε άτομο μετριέται μία φορά. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import type { AppState, Status, TypeKey } from '../src/shared/domain';
import { TYPE_KEYS } from '../src/shared/domain';
import { awayNow, awayText, hkMin, strengthAt, strengthOf } from '../src/shared/rules';
import { fakeState } from './fixtures';

const TODAY = '2026-10-22';
let seq = 0;
const st = (pid: number, type: TypeKey, x: Partial<Status> = {}): Status => ({ id: 's' + ++seq, pid, type, from: TODAY, to: TODAY, ...x });
const withSt = (statuses: Status[], n = 20): AppState => ({ ...fakeState(n), statuses });
const sum = (r: Record<TypeKey, number>) => TYPE_KEYS.reduce((a, k) => a + r[k], 0);

describe('Δύναμη: κάθε απών μία φορά', () => {
  it('άδεια και έξοδος στον ίδιο: ένας απών, στην άδεια· τα νούμερα αθροίζουν', () => {
    const s = withSt([st(1, 'OUT'), st(2, 'DN'), st(3, 'LEAVE', { from: '2026-10-20', to: '2026-10-25' }), st(3, 'OUT')]);
    const c = strengthOf(s, TODAY);
    expect(c.absent).toBe(3);
    expect(c.away).toMatchObject({ OUT: 1, DN: 1, LEAVE: 1 });
    expect(sum(c.away)).toBe(c.absent);
    expect(c.present + c.absent).toBe(c.total);
    expect(c.awayLists.LEAVE.map(p => p.id)).toEqual([3]);
    expect(awayText(c)).toBe('1 ΚΑ · 1 έξοδος · 1 ΔΝ');
    // στα είδη (Εξοδούχοι του «Σήμερα») μετρά και ο 3
    expect(c.counts.OUT).toBe(2);
  });
  it('διπλή εγγραφή εξόδου του ίδιου: μία φορά', () => {
    const c = strengthOf(withSt([st(1, 'OUT'), st(1, 'OUT')]), TODAY);
    expect(c.counts.OUT).toBe(1);
    expect(c.lists.OUT).toHaveLength(1);
    expect(c.absent).toBe(1);
  });
  it('ΕΥ και νοσοκομείο: ο ΕΥ είναι παρών, ο νοσοκομείο απών· τα ιατρικά δεν μπαίνουν στους απόντες', () => {
    const c = strengthOf(withSt([st(1, 'EY'), st(2, 'NOS'), st(2, 'EY')]), TODAY);
    expect(c.absent).toBe(1);
    expect(c.counts.EY).toBe(2);
    expect(sum(c.away)).toBe(1);
  });
});

describe('Δύναμη σήμερα: η ίδια στιγμή παντού', () => {
  // όπως ο Michael: 130 στρατιώτες, 24 έξοδος, 29 ΔΝ, 4 σε άδεια, 2 φεύγουν αύριο
  const people = 130;
  const statuses: Status[] = [];
  for (let i = 1; i <= 24; i++) statuses.push(st(i, 'OUT'));
  for (let i = 25; i <= 53; i++) statuses.push(st(i, 'DN'));
  for (let i = 54; i <= 57; i++) statuses.push(st(i, 'LEAVE', { from: '2026-10-19', to: '2026-10-26' }));
  statuses.push(st(58, 'LEAVE', { from: '2026-10-23', to: '2026-10-30' }), st(59, 'LEAVE', { from: '2026-10-24', to: '2026-10-28' }));
  // γυρίζει σήμερα 12:00
  statuses.push(st(60, 'LEAVE', { from: '2026-10-15', to: TODAY, toTime: '12:00' }));
  const s = withSt(statuses, people);
  it('όσοι φεύγουν τις επόμενες μέρες δεν είναι απόντες σήμερα', () => {
    const now = 18 * 60 + 50;
    const c = strengthOf(s, TODAY, strengthAt(s.rules, TODAY, TODAY, now));
    expect(c.away).toMatchObject({ OUT: 24, DN: 29, LEAVE: 4 });
    expect(c.absent).toBe(57);
    expect(c.present).toBe(73);
    expect(awayText(c)).toBe('4 ΚΑ · 24 έξοδος · 29 ΔΝ');
    // η λίστα «Τώρα» των αδειών έχει και όσους φεύγουν: 4 τώρα + 2 φεύγουν (όχι 6 απόντες)
    const leaves = s.statuses.filter(x => x.type === 'LEAVE' && awayNow(x, TODAY, now));
    expect(leaves).toHaveLength(6);
    expect(leaves.filter(x => x.from <= TODAY)).toHaveLength(4);
  });
  it('το «Σήμερα» και η Δύναμη μετρούν την ίδια στιγμή: όποιος γύρισε ως τώρα είναι παρών', () => {
    expect(strengthAt(s.rules, TODAY, TODAY, 18 * 60)).toBe(18 * 60);
    expect(strengthAt(s.rules, TODAY, TODAY, 6 * 60)).toBe(hkMin(s.rules));     // πριν τις 08:00 όπως η ΗΚΑΙ
    expect(strengthAt(s.rules, '2026-10-23', TODAY, 18 * 60)).toBe(hkMin(s.rules));
    expect(strengthOf(s, TODAY, strengthAt(s.rules, TODAY, TODAY, 10 * 60)).absent).toBe(58);   // ο 60 δεν γύρισε ακόμα
    expect(strengthOf(s, TODAY, strengthAt(s.rules, TODAY, TODAY, 13 * 60)).absent).toBe(57);
  });
});
