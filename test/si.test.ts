// Σ.Ι. σε δύο dropdown και πίνακας «ποιες υπηρεσίες κάνει» (Michael, 13/10). Χωρίς αλλαγές στον πίνακα, ίδια
// αποτελέσματα με πριν (άοπλος = «ΑΟΠΛ» ή αρχίζει από «Ι4»), εκτός από το «Ι4 ΜΕ ΟΠΛΟ». Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { siUnarmed, type UserLists } from '../src/shared/ranks';
import { parseSi, siCombos, siDeny, siIsUnarmed, siLabel } from '../src/shared/si';
import { capBlock, capsOf, isUnarmed, postsOf } from '../src/shared/rules';
import { listColumns, type SourceBinding } from '../src/shared/sources';
import { apply } from '../src/shared/commands';
import type { RawSheet } from '../src/shared/roster';
import { fakeState } from './fixtures';

const D = '2026-10-12';
// τιμές όπως γράφονται στα Δυναμολόγια (και με λατινικά, τόνους, κάθετους)
const SEEN = ['Ι1', 'Ι2', 'Ι3', 'Ι4', 'Ι3 ΜΕ ΟΠΛΟ', 'Ι3 ΑΟΠΛΟ', 'Ι3 ΑΟΠΛΟΣ', 'Ι3 άοπλος', 'Ι3 ΕΝΟΠΛΟΣ', 'I3 ΜΕ ΟΠΛΟ', 'Ι/3 ΑΟΠΛΟ', 'Ι4 ΑΟΠΛΟ',
  'I4', 'Ι4 ', 'Ι5', 'Ι2 ΑΟΠΛΟ', 'Ι3 ΧΩΡΙΣ ΝΥΧΤΕΡΙΝΗ', 'ΑΟΠΛΟΣ', 'ΙΚΑΝΟΣ', '', 'Ι1 ΑΟΠΛΟ'];
const legacy = (si: string, l?: UserLists) => (siUnarmed(si, l) ? ['op', 'sk'] : []);

describe('Σ.Ι.: ανάγνωση', () => {
  it('βασική και κατηγορία από ό,τι γράφει το Excel', () => {
    expect(parseSi('Ι3 ΑΟΠΛΟ')).toEqual({ base: 'Ι3', sub: 'ΑΟΠΛΟ', ok: true });
    expect(parseSi('i3 αοπλος')).toEqual({ base: 'Ι3', sub: 'ΑΟΠΛΟ', ok: true });
    expect(parseSi('Ι/3 ΕΝΟΠΛΟΣ')).toEqual({ base: 'Ι3', sub: 'ΜΕ ΟΠΛΟ', ok: true });
    expect(parseSi('I4')).toEqual({ base: 'Ι4', sub: '', ok: true });
    expect(parseSi('Ι 4')).toEqual({ base: 'Ι4', sub: '', ok: true });
    expect(parseSi('Ι5')).toEqual({ base: 'Ι5', sub: '', ok: true });
    expect(parseSi('Ι2 ΑΟΠΛΟ')?.ok).toBe(false);          // το Ι2 δεν έχει κατηγορίες
    expect(parseSi('Ι3 ΧΩΡΙΣ ΝΥΧΤΕΡΙΝΗ')?.ok).toBe(false);
    expect(parseSi('ΑΟΠΛΟΣ')).toBeNull();
    expect(parseSi('')).toBeNull();
    // δική σου κατηγορία
    expect(parseSi('Ι3 χωρίς νυχτερινή', { subs: { 'Ι3': ['ΧΩΡΙΣ ΝΥΧΤΕΡΙΝΗ'] } })).toEqual({ base: 'Ι3', sub: 'ΧΩΡΙΣ ΝΥΧΤΕΡΙΝΗ', ok: true });
  });
  it('οι συνδυασμοί για τον πίνακα και το dropdown του Excel', () => {
    expect(siCombos()).toEqual(['Ι1', 'Ι2', 'Ι3', 'Ι3 ΜΕ ΟΠΛΟ', 'Ι3 ΑΟΠΛΟ', 'Ι4', 'Ι4 ΜΕ ΟΠΛΟ', 'Ι4 ΑΟΠΛΟ']);
    expect(siCombos({ add: ['ι5'], subs: { 'Ι3': ['χωρίς νυχτερινή'] } })).toEqual(['Ι1', 'Ι2', 'Ι3', 'Ι3 ΜΕ ΟΠΛΟ', 'Ι3 ΑΟΠΛΟ', 'Ι3 ΧΩΡΙΣ ΝΥΧΤΕΡΙΝΗ', 'Ι4', 'Ι4 ΜΕ ΟΠΛΟ', 'Ι4 ΑΟΠΛΟ', 'Ι5']);
    expect(siLabel('Ι3', '')).toBe('Ι3');
  });
});

describe('Σ.Ι.: χωρίς αλλαγές, όπως πριν', () => {
  it('κάθε τιμή του Δυναμολογίου δίνει τους ίδιους περιορισμούς (εκτός από «Ι 4», που τώρα αναγνωρίζεται ως Ι4)', () => {
    for (const si of SEEN) expect(siDeny(si), si).toEqual(legacy(si));
    expect(siDeny('Ι 4')).toEqual(['op', 'sk']);
  });
  it('και με τη λίστα «Σ.Ι. άοπλων» των Λιστών', () => {
    const l: UserLists = { siUnarmed: { add: [{ name: 'Ι5' }], hide: ['Ι4'] } };
    for (const si of SEEN) expect(siDeny(si, l), si).toEqual(legacy(si, l));
  });
  it('Ι4 ΜΕ ΟΠΛΟ κάνει ό,τι και το Ι3 ΜΕ ΟΠΛΟ', () => {
    expect(siDeny('Ι4 ΜΕ ΟΠΛΟ')).toEqual([]);
    expect(siIsUnarmed('Ι4 ΜΕ ΟΠΛΟ')).toBe(false);
    expect(siIsUnarmed('Ι4 ΑΟΠΛΟ')).toBe(true);
  });
});

describe('Σ.Ι.: ο πίνακας', () => {
  const s0 = fakeState(10);
  const withSi = (si: string, lists: UserLists) => ({ ...s0, people: s0.people.map((x, i) => (i === 0 ? { ...x, si, post: null } : x)), settings: { ...s0.settings, lists } });
  const pid = s0.people[0].id;
  it('ό,τι ξετσεκάρεις δεν το κάνει· η «Δυνατότητα υπηρεσιών» του ατόμου μένει από πάνω', () => {
    const s = withSi('Ι3 ΑΟΠΛΟ', { si: { deny: { 'Ι3 ΑΟΠΛΟ': ['op', 'sk', 'mg'] } } });
    expect(Object.keys(capsOf(s, pid))).toEqual(['op', 'sk', 'mg']);
    const mg = postsOf(s.settings).find(p => p.kind === 'mg')!;
    expect(capBlock(s, D, pid, mg)).toBe('Δεν κάνει μαγειρεία (Σ.Ι. Ι3 ΑΟΠΛΟ)');
    const s2 = { ...s, caps: { [pid]: { mg: null } } };
    expect(capBlock(s2, D, pid, mg)).toBeNull();
  });
  it('Ι3 ΑΟΠΛΟ που κάνει σκοπιά δεν μετρά πια άοπλος· Ι1 χωρίς σκοπιά και οπλοφύλακα μετρά', () => {
    expect(isUnarmed(withSi('Ι3 ΑΟΠΛΟ', {}), D, pid)).toBe(true);
    expect(isUnarmed(withSi('Ι3 ΑΟΠΛΟ', { si: { deny: { 'Ι3 ΑΟΠΛΟ': ['op'] } } }), D, pid)).toBe(false);
    expect(isUnarmed(withSi('Ι1', { si: { deny: { 'Ι1': ['op', 'sk'] } } }), D, pid)).toBe(true);
  });
  it('η αλλαγή γίνεται από τις Ρυθμίσεις και αναιρείται', () => {
    const lists: UserLists = { si: { deny: { 'Ι3 ΑΟΠΛΟ': [] } } };
    const s = apply(withSi('Ι3 ΑΟΠΛΟ', {}), { t: 'setSettings', settings: { lists }, text: 'Σ.Ι. Ι3 ΑΟΠΛΟ: όλες' }, { today: D, newId: () => 'x' }).state;
    expect(capsOf(s, pid)).toEqual({});
  });
});

describe('Σ.Ι.: λίστα επιλογής στο Excel', () => {
  it('στη στήλη Σ.Ι. του Δυναμολογίου, με τους συνδυασμούς και όσες άλλες τιμές έχει ήδη', () => {
    const HEAD = ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'Σ.Ι.'];
    const sh: RawSheet = { name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD, [1, 'ΣΤΡ', 'ΠΖ', 'ΔΟΚΙΜΙΟΣ', 'ΑΛΦΑΣ', 'Ι3 ΑΟΠΛΟ'], [2, 'ΣΤΡ', 'ΠΖ', 'ΤΥΧΑΙΟΣ', 'ΒΗΤΑΣ', 'Ι5']] };
    const b: SourceBinding = { file: 'x', sheet: 'ΣΥΝΟΛΙΚΟ', header: 0, cols: { aa: 0, rank: 1, spec: 2, last: 3, first: 4, si: 5 } };
    const si = listColumns('people', sh, b).find(l => l.what === 'Σ.Ι.')!;
    expect(si.c).toBe(5);
    expect(si.items).toEqual([...siCombos(), 'Ι5']);
  });
});
