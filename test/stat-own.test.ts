// Πίνακας καταστάσεων (Michael, 18/10): τα ιατρικά των Λιστών ρυθμίζονται εκεί (χωρίς «συμπεριφέρεται σαν»), η ΗΚΑΙ
// δίπλα στη γραμμή τους, και οι ποινές ανά είδος. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { guardUnavailable, hkaiCounts, outBlock, statusWarn } from '../src/shared/rules';
import { DEFAULT_BLOCKS, type AppState, type TypeKey } from '../src/shared/domain';
import type { UserLists } from '../src/shared/ranks';
import { statRebase, statRowOf, statSummary } from '../src/shared/stat';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'o' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const D = '2026-10-13';
const declare = (s: AppState, type: TypeKey, pid: number, kind?: string) => run(s, { t: 'declare', cmd: { type, pids: [pid], from: D, to: D, ...(kind ? { kind } : {}) } as any });
const withLists = (s: AppState, lists: UserLists): AppState => ({ ...s, settings: { ...s.settings, lists } });

describe('ποινές ανά είδος', () => {
  it('χωρίς ρυθμίσεις: όπως πριν, μπαίνει παντού και δεν βγαίνει έξοδο', () => {
    const s = declare(fakeState(5), 'PUN', 2, 'Κράτηση');
    expect(statRowOf(s.statuses[0], {})).toEqual({ type: 'PUN', own: 'Κράτηση' });
    for (const k of ['th1', 'mg1']) expect(guardUnavailable(s, D, 2, k)).toBeNull();
    expect(outBlock(s, D, 2)).toBeTruthy();
  });
  it('«Κράτηση όχι μαγειρεία»: μόνο για την κράτηση· «όλες» ισχύει για κάθε είδος', () => {
    const kr = declare(fakeState(5), 'PUN', 2, 'Κράτηση'), pr = declare(fakeState(5), 'PUN', 2, 'Περιορισμός');
    const one: UserLists = { stat: { cells: { 'PUN:ΚΡΑΤΗΣΗ': { mg: 'no' } } } };
    expect(guardUnavailable(withLists(kr, one), D, 2, 'mg1')).toMatch(/ΚΡΑΤΗΣΗ: όχι/);
    expect(guardUnavailable(withLists(pr, one), D, 2, 'mg1')).toBeNull();
    const all: UserLists = { stat: { cells: { PUN: { mg: 'no' } } } };
    expect(guardUnavailable(withLists(pr, all), D, 2, 'mg1')).toMatch(/ΠΕΡΙΟΡΙΣΜΟΣ/);
  });
  it('η έξοδος της ποινής δεν αλλάζει από τον πίνακα', () => {
    const s = withLists(declare(fakeState(5), 'PUN', 2, 'Κράτηση'), { stat: { out: { PUN: true, 'PUN:ΚΡΑΤΗΣΗ': true } } });
    expect(outBlock(s, D, 2)).toBeTruthy();
  });
});

describe('δικά σου ιατρικά χωρίς «συμπεριφέρεται σαν»', () => {
  const nu: UserLists = { medKinds: { add: [{ name: 'ΕΛ ΓΥΜΝ', like: 'EARV' }, { name: 'ΠΑΡΑΠΕΜΠΤΙΚΟ 401', like: 'EARV', warn: true }] } };
  it('νέο ιατρικό: χωρίς περιορισμούς ώσπου να το ρυθμίσεις', () => {
    const s = withLists(declare(fakeState(5), 'EARV', 2, 'ΕΛ ΓΥΜΝ'), nu);
    expect(guardUnavailable(s, D, 2, 'th1')).toBeNull();
    expect(outBlock(s, D, 2)).toBeNull();
    expect(statSummary(s.statuses[0], DEFAULT_BLOCKS, nu)).toBe('Χωρίς περιορισμούς');
    const set = withLists(s, { ...nu, stat: { cells: { 'EARV:ΕΛ ΓΥΜΝ': { mg: 'no' } }, out: { 'EARV:ΕΛ ΓΥΜΝ': false } } });
    expect(guardUnavailable(set, D, 2, 'mg1')).toMatch(/ΕΛ ΓΥΜΝ/);
    expect(outBlock(set, D, 2)).toMatch(/ΕΛ ΓΥΜΝ/);
    expect(statSummary(set.statuses[0], DEFAULT_BLOCKS, set.settings.lists)).toMatch(/^Όχι: .*Μαγειρεία.* · Δεν βγαίνει έξοδο$/);
  });
  it('«μόνο προειδοποίηση» είναι ξεχωριστό: προειδοποιεί, και οι υπηρεσίες ισχύουν όπως τις όρισες', () => {
    const s = withLists(declare(fakeState(5), 'EARV', 2, 'ΠΑΡΑΠΕΜΠΤΙΚΟ 401'), nu);
    expect(statusWarn(s, D, 2)).toMatch(/ΠΑΡΑΠΕΜΠΤΙΚΟ 401/);
    expect(guardUnavailable(s, D, 2, 'th1')).toBeNull();
  });
  it('ΗΚΑΙ στους ΕΥ: αλλάζει ο βασικός τύπος, οι υπηρεσίες και η έξοδος μένουν όπως φαίνονταν', () => {
    const old: UserLists = { medKinds: { add: [{ name: 'ΕΛ ΓΥΜΝ', like: 'EA' }] }, stat: { cells: { 'EA:ΕΛ ΓΥΜΝ': { mg: 'yes' } } } };
    const blocks = DEFAULT_BLOCKS.filter(b => b.kind !== 'ly');
    const next = statRebase(old, 'ΕΛ ΓΥΜΝ', 'EY', blocks);
    expect(next.medKinds!.add![0].like).toBe('EY');
    const before = withLists(declare(fakeState(5), 'EA', 2, 'ΕΛ ΓΥΜΝ'), old);
    const after = withLists(declare(fakeState(5), 'EY', 2, 'ΕΛ ΓΥΜΝ'), next);
    for (const k of ['th1', 'th5', 'mg1']) expect(!!guardUnavailable(after, D, 2, k), k).toBe(!!guardUnavailable(before, D, 2, k));
    expect(guardUnavailable(after, D, 2, 'mg1')).toBeNull();   // το «μαγειρεία ναι» κρατήθηκε
    expect(!!outBlock(after, D, 2)).toBe(!!outBlock(before, D, 2));
    expect(hkaiCounts(after, D).kol).toBe(hkaiCounts(before, D).kol + 1);
    // και πίσω: παρών, πάλι ίδιες υπηρεσίες
    const back = statRebase(next, 'ΕΛ ΓΥΜΝ', 'EARV', blocks);
    const b2 = withLists(declare(fakeState(5), 'EARV', 2, 'ΕΛ ΓΥΜΝ'), back);
    expect(!!guardUnavailable(b2, D, 2, 'th1')).toBe(!!guardUnavailable(before, D, 2, 'th1'));
    expect(hkaiCounts(b2, D).kol).toBe(hkaiCounts(before, D).kol);
  });
});
