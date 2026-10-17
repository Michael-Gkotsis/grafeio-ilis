// Σ.Ι. σε dropdown, κατηγορία πάθησης και πίνακας «σε ποιες υπηρεσίες μπαίνει» ανά υπηρεσία (Michael, 13/10).
// Προεπιλογή: ο άοπλος (ΑΟΠΛ ή Ι4, όπως πριν) δεν μπαίνει σε ένοπλη υπηρεσία. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { siUnarmed, type UserLists } from '../src/shared/ranks';
import { parseSi, siAllows, siCats, siCombos, siIsUnarmed, siLabel, siOf, SI_CATS } from '../src/shared/si';
import { capBlock, capsOf, guardUnavailable, isUnarmed, postsOf } from '../src/shared/rules';
import { DEFAULT_BLOCKS, DEFAULT_BLOCKS_SPEN, DEFAULT_SETTINGS, migrateSettings, type AppState } from '../src/shared/domain';
import { listColumns, type SourceBinding } from '../src/shared/sources';
import { apply } from '../src/shared/commands';
import type { RawSheet } from '../src/shared/roster';
import { fakeState } from './fixtures';

const D = '2026-10-12';
// τιμές όπως γράφονται στα Δυναμολόγια (και με λατινικά, τόνους, κάθετους)
const SEEN = ['Ι1', 'Ι2', 'Ι3', 'Ι4', 'Ι3 ΜΕ ΟΠΛΟ', 'Ι3 ΑΟΠΛΟ', 'Ι3 ΑΟΠΛΟΣ', 'Ι3 άοπλος', 'Ι3 ΕΝΟΠΛΟΣ', 'I3 ΜΕ ΟΠΛΟ', 'Ι/3 ΑΟΠΛΟ', 'Ι4 ΑΟΠΛΟ',
  'I4', 'Ι4 ', 'Ι4 ΜΕ ΟΠΛΟ', 'Ι5', 'Ι2 ΑΟΠΛΟ', 'Ι3 ΧΩΡΙΣ ΝΥΧΤΕΡΙΝΗ', 'ΑΟΠΛΟΣ', 'ΙΚΑΝΟΣ', '', 'Ι1 ΑΟΠΛΟ'];
const ALL = [...DEFAULT_BLOCKS, ...DEFAULT_BLOCKS_SPEN];

describe('Σ.Ι.: ανάγνωση', () => {
  it('βασική και ΜΕ ΟΠΛΟ / ΑΟΠΛΟ από ό,τι γράφει το Excel· το Ι4 είναι πάντα σκέτο Ι4', () => {
    expect(parseSi('Ι3 ΑΟΠΛΟ')).toEqual({ base: 'Ι3', sub: 'ΧΩΡΙΣ ΟΠΛΟ', ok: true });
    expect(parseSi('Ι3 χωρίς όπλο')).toEqual({ base: 'Ι3', sub: 'ΧΩΡΙΣ ΟΠΛΟ', ok: true });
    expect(parseSi('i3 αοπλος')).toEqual({ base: 'Ι3', sub: 'ΧΩΡΙΣ ΟΠΛΟ', ok: true });
    expect(parseSi('Ι/3 ΕΝΟΠΛΟΣ')).toEqual({ base: 'Ι3', sub: 'ΜΕ ΟΠΛΟ', ok: true });
    for (const v of ['I4', 'Ι 4', 'Ι4 ΑΟΠΛΟ', 'Ι4 ΜΕ ΟΠΛΟ']) expect(parseSi(v), v).toEqual({ base: 'Ι4', sub: '', ok: true });
    expect(parseSi('Ι5')).toEqual({ base: 'Ι5', sub: '', ok: true });
    expect(parseSi('Ι2 ΑΟΠΛΟ')?.ok).toBe(false);          // το Ι2 δεν χωρίζεται σε με όπλο / άοπλο
    expect(parseSi('Ι3 ΧΩΡΙΣ ΝΥΧΤΕΡΙΝΗ')?.ok).toBe(false);
    expect(parseSi('ΑΟΠΛΟΣ')).toBeNull();
    expect(parseSi('')).toBeNull();
  });
  it('οι Σ.Ι. για τον πίνακα και το dropdown του Excel· κατηγορίες πάθησης μόνο για Ι3 και Ι4', () => {
    expect(siCombos()).toEqual(['Ι1', 'Ι2', 'Ι3', 'Ι3 ΜΕ ΟΠΛΟ', 'Ι3 ΧΩΡΙΣ ΟΠΛΟ', 'Ι4']);
    expect(siCombos({ add: ['ι5'] })).toEqual(['Ι1', 'Ι2', 'Ι3', 'Ι3 ΜΕ ΟΠΛΟ', 'Ι3 ΧΩΡΙΣ ΟΠΛΟ', 'Ι4', 'Ι5']);
    expect(siLabel('Ι3', '')).toBe('Ι3');
    expect(siOf({ si: 'Ι3 ΑΟΠΛΟ', siCat: 'ορθοπαιδικό' })).toMatchObject({ label: 'Ι3 ΧΩΡΙΣ ΟΠΛΟ', cat: 'ΟΡΘΟΠΑΙΔΙΚΟ', known: true, text: 'Ι3 ΧΩΡΙΣ ΟΠΛΟ ΟΡΘΟΠΑΙΔΙΚΟ' });
    expect(siOf({ si: 'Ι1', siCat: 'ΟΡΘΟΠΑΙΔΙΚΟ' }).cat).toBe('');
    expect(siCats({ cats: { add: ['γαστρεντερολογικό'], hide: ['ΩΡΛ'] } })).toEqual([...SI_CATS.filter(c => c !== 'ΩΡΛ'), 'ΓΑΣΤΡΕΝΤΕΡΟΛΟΓΙΚΟ']);
  });
});

describe('Σ.Ι.: χωρίς αλλαγές', () => {
  it('ο άοπλος (όπως πριν: ΑΟΠΛ ή Ι4) δεν μπαίνει σε καμία ένοπλη υπηρεσία· οι άλλοι παντού', () => {
    for (const si of SEEN) for (const b of ALL) expect(siAllows({ si }, b), si + ' ' + b.id).toBe(!(b.armed && siUnarmed(si)));
  });
  it('και με τη λίστα «Σ.Ι. άοπλων» των Λιστών', () => {
    const l: UserLists = { siUnarmed: { add: [{ name: 'Ι5' }], hide: ['Ι4'] } };
    for (const si of SEEN) for (const b of ALL) {
      // «Ι4 ΑΟΠΛΟ» διαβάζεται σαν Ι4: ισχύει ό,τι λέει η λίστα για το Ι4
      const s = siOf({ si }, l); expect(siAllows({ si }, b, l), si + ' ' + b.id).toBe(!(b.armed && siUnarmed(s.known ? s.label : si, l)));
    }
  });
  it('«Αυστηρά Άοπλοι»: άοπλος όποιος δεν μπαίνει σε καμία ένοπλη υπηρεσία· στη ΣΒΕΝ (χωρίς ένοπλες) όπως πριν', () => {
    expect(siIsUnarmed({ si: 'Ι4' }, DEFAULT_BLOCKS_SPEN)).toBe(true);
    expect(siIsUnarmed({ si: 'Ι3 ΜΕ ΟΠΛΟ' }, DEFAULT_BLOCKS_SPEN)).toBe(false);
    expect(siIsUnarmed({ si: 'Ι3 ΑΟΠΛΟ' }, DEFAULT_BLOCKS)).toBe(true);
    expect(siIsUnarmed({ si: 'Ι1' }, DEFAULT_BLOCKS)).toBe(false);
  });
});

describe('Σ.Ι.: ο πίνακας, ανά υπηρεσία', () => {
  const s0 = fakeState(10);
  const spen = (s: AppState): AppState => ({ ...s, settings: { ...s.settings, phase: 'spen' } });
  const withSi = (si: string, lists: UserLists, siCat?: string): AppState => spen({ ...s0, people: s0.people.map((x, i) => (i === 0 ? { ...x, si, siCat, post: null } : x)), settings: { ...s0.settings, lists } });
  const pid = s0.people[0].id;
  const seat = (s: AppState, kind: string) => postsOf(s.settings).find(p => p.kind === kind)!;
  it('ο Ι3 ΑΟΠΛΟ δεν μπαίνει σε ΤΑΕ (ένοπλη)· μπαίνει αν το τσεκάρεις', () => {
    const s = withSi('Ι3 ΑΟΠΛΟ', {});
    expect(capBlock(s, D, pid, seat(s, 'tae'))).toBe('Δεν κάνει ΤΑΕ (Σ.Ι. Ι3 ΧΩΡΙΣ ΟΠΛΟ)');
    expect(capBlock(s, D, pid, seat(s, 'th'))).toBeNull();
    const s2 = withSi('Ι3 ΑΟΠΛΟ', { si: { cells: { 'Ι3 ΧΩΡΙΣ ΟΠΛΟ': { tae: true } } } });
    expect(capBlock(s2, D, pid, seat(s2, 'tae'))).toBeNull();
    expect(capBlock(s2, D, pid, seat(s2, 'sk'))).toMatch(/σκοπιά/);
  });
  it('μια υπηρεσία που γίνεται άοπλη δέχεται και τους άοπλους· δική σου ένοπλη υπηρεσία όχι', () => {
    let s = withSi('Ι4', {});
    s = { ...s, settings: { ...s.settings, blocksSpen: s.settings.blocksSpen.map(b => (b.kind === 'op' ? { ...b, armed: false } : b)) } };
    expect(capBlock(s, D, pid, seat(s, 'op'))).toBeNull();
    const r = apply(s, { t: 'addBlock', phase: 'spen', name: 'Πύλη', kind: 'other', armed: true, n: 1, hrs: '' }, { today: D, newId: () => 'x' }).state;
    expect(capBlock(r, D, pid, seat(r, 'other'))).toMatch(/Σ\.Ι\. Ι4/);
  });
  it('κατηγορία πάθησης με δικούς της κανόνες· αλλιώς ό,τι η Σ.Ι.', () => {
    const lists: UserLists = { si: { cells: { 'Ι3 ΧΩΡΙΣ ΟΠΛΟ · ΟΡΘΟΠΑΙΔΙΚΟ': { mg: false } } } };
    const orth = withSi('Ι3 ΑΟΠΛΟ', lists, 'ΟΡΘΟΠΑΙΔΙΚΟ');
    expect(capBlock(orth, D, pid, seat(orth, 'mg'))).toBe('Δεν κάνει μαγειρεία (Σ.Ι. Ι3 ΧΩΡΙΣ ΟΠΛΟ ΟΡΘΟΠΑΙΔΙΚΟ)');
    expect(capBlock(orth, D, pid, seat(orth, 'sk'))).toMatch(/σκοπιά/);       // από το Ι3 ΑΟΠΛΟ
    const path = withSi('Ι3 ΑΟΠΛΟ', lists, 'ΠΑΘΟΛΟΓΙΚΟ');
    expect(capBlock(path, D, pid, seat(path, 'mg'))).toBeNull();
  });
  it('η «Δυνατότητα υπηρεσιών» του ατόμου περνά από πάνω· το πόστο όπως πριν', () => {
    const s = { ...withSi('Ι3 ΑΟΠΛΟ', {}), caps: { [pid]: { tae: null } } };
    expect(capBlock(s, D, pid, seat(s, 'tae'))).toBeNull();
    const s2 = { ...withSi('Ι1', {}), caps: { [pid]: { th: 'ΛΟΓΩ Ι' } } };
    expect(capBlock(s2, D, pid, seat(s2, 'th'))).toBe('Δεν κάνει θαλαμοφύλακα (ΛΟΓΩ Ι)');
    const p6 = spen(fakeState(10));
    expect(guardUnavailable(p6, D, 6, 'tae')).toMatch(/Πόστο/);
    expect(guardUnavailable(p6, D, 6, 'ly')).toBeNull();
  });
  it('στην κάρτα του ατόμου: όσα είδη δεν κάνει σε κανένα έντυπο· «Αυστηρά Άοπλοι» από τον πίνακα', () => {
    expect(Object.keys(capsOf(withSi('Ι3 ΑΟΠΛΟ', {}), pid))).toEqual(['op', 'sk', 'tae']);
    expect(capsOf(withSi('Ι3 ΑΟΠΛΟ', { si: { cells: { 'Ι3 ΧΩΡΙΣ ΟΠΛΟ': { op: true, sk: true, tae: true } } } }), pid)).toEqual({});
    expect(isUnarmed(withSi('Ι3 ΑΟΠΛΟ', {}), D, pid)).toBe(true);
    expect(isUnarmed(withSi('Ι3 ΑΟΠΛΟ', { si: { cells: { 'Ι3 ΧΩΡΙΣ ΟΠΛΟ': { sk: true } } } }), D, pid)).toBe(false);
    expect(isUnarmed(withSi('Ι1', { si: { cells: { 'Ι1': { op: false, sk: false, tae: false } } } }), D, pid)).toBe(true);
  });
  it('η αλλαγή γίνεται από τις Ρυθμίσεις και αναιρείται· η κατηγορία πάθησης μπαίνει στον νέο στρατιώτη', () => {
    const lists: UserLists = { si: { cells: { 'Ι3 ΧΩΡΙΣ ΟΠΛΟ': { tae: true } } } };
    const s = apply(withSi('Ι3 ΑΟΠΛΟ', {}), { t: 'setSettings', settings: { lists }, text: 'Σ.Ι.' }, { today: D, newId: () => 'x' }).state;
    expect(capsOf(s, pid)).toEqual({ op: 'Σ.Ι. Ι3 ΧΩΡΙΣ ΟΠΛΟ', sk: 'Σ.Ι. Ι3 ΧΩΡΙΣ ΟΠΛΟ' });
    const p = { ...s0.people[0], id: 0, last: 'ΝΕΟΣ', first: 'ΔΟΚΙΜΙΟΣ', asm: '999999', si: 'Ι4', siCat: 'ορθοπαιδικό ' };
    const r = apply(s0, { t: 'addPerson', person: p }, { today: D, newId: () => 'x' }).state;
    expect(r.people[r.people.length - 1]).toMatchObject({ si: 'Ι4', siCat: 'ΟΡΘΟΠΑΙΔΙΚΟ' });
  });
});

describe('Σ.Ι.: λίστα επιλογής στο Excel', () => {
  it('στη στήλη Σ.Ι. του Δυναμολογίου, με τις Σ.Ι. και όσες άλλες τιμές έχει ήδη (χωρίς κατηγορία πάθησης)', () => {
    const HEAD = ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'Σ.Ι.'];
    const sh: RawSheet = { name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD, [1, 'ΣΤΡ', 'ΠΖ', 'ΔΟΚΙΜΙΟΣ', 'ΑΛΦΑΣ', 'Ι3 ΑΟΠΛΟ'], [2, 'ΣΤΡ', 'ΠΖ', 'ΤΥΧΑΙΟΣ', 'ΒΗΤΑΣ', 'Ι5']] };
    const b: SourceBinding = { file: 'x', sheet: 'ΣΥΝΟΛΙΚΟ', header: 0, cols: { aa: 0, rank: 1, spec: 2, last: 3, first: 4, si: 5 } };
    const si = listColumns('people', sh, b).find(l => l.what === 'Σ.Ι.')!;
    expect(si.c).toBe(5);
    expect(si.items).toEqual([...siCombos(), 'Ι5']);
  });
});

describe('Σ.Ι.: «Ι3 ΧΩΡΙΣ ΟΠΛΟ» (Michael, 17/10)', () => {
  it('άοπλοι μόνο ο Ι3 ΧΩΡΙΣ ΟΠΛΟ (και το παλιό «Ι3 ΑΟΠΛΟ») και ο Ι4', () => {
    for (const si of ['Ι3 ΧΩΡΙΣ ΟΠΛΟ', 'Ι3 χωρίς όπλο', 'Ι3 ΑΟΠΛΟ', 'Ι4']) expect(siUnarmed(si), si).toBe(true);
    for (const si of ['Ι1', 'Ι2', 'Ι3 ΜΕ ΟΠΛΟ', 'Ι3']) expect(siUnarmed(si), si).toBe(false);
    expect(siOf({ si: 'Ι3 ΑΟΠΛΟ' }).label).toBe('Ι3 ΧΩΡΙΣ ΟΠΛΟ');
  });
  it('οι παλιές ρυθμίσεις του πίνακα για «Ι3 ΑΟΠΛΟ» περνούν στο «Ι3 ΧΩΡΙΣ ΟΠΛΟ»', () => {
    const m = migrateSettings({ ...DEFAULT_SETTINGS, rev: 4, lists: { si: { cells: { 'Ι3 ΑΟΠΛΟ': { tae: true }, 'Ι3 ΑΟΠΛΟ · ΟΡΘΟΠΑΙΔΙΚΟ': { mg: false }, 'Ι1': { sk: false } } } } });
    expect(m.lists!.si!.cells).toEqual({ 'Ι3 ΧΩΡΙΣ ΟΠΛΟ': { tae: true }, 'Ι3 ΧΩΡΙΣ ΟΠΛΟ · ΟΡΘΟΠΑΙΔΙΚΟ': { mg: false }, 'Ι1': { sk: false } });
    expect(m.rev).toBe(5);
  });
});
