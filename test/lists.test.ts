// Ρυθμίσεις › Λίστες: βαθμοί στρατιωτών, βαθμοί στελεχών και Ο/Σ που πρόσθεσε ή έκρυψε ο χρήστης.
// Χωρίς προσθήκες όλα ίδια με πριν. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { CADRE_RANKS, SOLDIER_RANKS, SPECS, guessHk, hkOfRank, listOf, listRows, type UserLists } from '../src/shared/ranks';
import { hkRankOf, hkaiCounts } from '../src/shared/rules';
import { listColumns, type SourceBinding } from '../src/shared/sources';
import { apply } from '../src/shared/commands';
import type { RawSheet } from '../src/shared/roster';
import { fakeState } from './fixtures';

const D = '2026-10-12';

describe('λίστες', () => {
  it('χωρίς προσθήκες: οι βασικές λίστες όπως πριν', () => {
    expect(listOf(undefined, 'soldierRanks')).toEqual(SOLDIER_RANKS);
    expect(listOf({}, 'cadreRanks')).toEqual(CADRE_RANKS);
    expect(listOf({ soldierRanks: {} }, 'specs')).toEqual(SPECS);
  });
  it('κρυμμένα βγαίνουν, δικά σου μπαίνουν στο τέλος, χωρίς διπλά (και με άλλους τόνους ή τελείες)', () => {
    const l: UserLists = { specs: { add: [{ name: 'ΠΝ' }, { name: 'π.ζ' }, { name: 'ΠΝ' }, { name: '' }], hide: ['τθ'] } };
    expect(listOf(l, 'specs')).toEqual([...SPECS.filter(x => x !== 'ΤΘ'), 'ΠΝ']);
    const rows = listRows(l, 'specs');
    expect(rows.find(r => r.name === 'ΤΘ')).toMatchObject({ builtin: true, hidden: true });
    expect(rows.filter(r => !r.builtin).map(r => r.name)).toEqual(['ΠΝ']);
  });
  it('δικός σου βαθμός στρατιώτη μετρά στη γραμμή της ΗΚΑΙ που διάλεξες', () => {
    const l: UserLists = { soldierRanks: { add: [{ name: 'ΚΛΗΡ', hk: 'Δεκανείς' }, { name: 'ΑΓΝ', hk: 'Επίλαρχοι' }] } };
    expect(hkRankOf('κληρ', l)).toBe('Δεκανείς');
    // γραμμή που δεν είναι για στρατιώτες: από το όνομα, όπως πριν
    expect(hkRankOf('ΑΓΝ', l)).toBe('Στρατιώτες');
    expect(hkRankOf('ΔΝΕΑΣ', l)).toBe('Δεκανείς');
    expect(hkOfRank(l, 'soldierRanks', 'ΣΤΡ')).toBeUndefined();
    const s0 = fakeState(10);
    const s = { ...s0, people: s0.people.map((p, i) => (i === 0 ? { ...p, rank: 'ΚΛΗΡ' } : p)), settings: { ...s0.settings, lists: l } };
    const before = hkaiCounts({ ...s, settings: s0.settings }, D).rank;
    const after = hkaiCounts(s, D).rank;
    expect(after['Δεκανείς'].n).toBe(before['Δεκανείς'].n + 1);
    expect(after['Στρατιώτες'].n).toBe(before['Στρατιώτες'].n - 1);
  });
  it('δικός σου βαθμός στελέχους διαλέγει μόνος του τη γραμμή της ΗΚΑΙ', () => {
    const l: UserLists = { cadreRanks: { add: [{ name: 'ΣΜΧΟΣ', hk: 'Επίλαρχοι' }] } };
    expect(guessHk('σμχος', l)).toBe('Επίλαρχοι');
    expect(guessHk('ΣΜΧΟΣ')).toBe('Λοχίες');
    expect(guessHk('ΙΛΧΟΣ', l)).toBe('Ίλαρχοι');
  });
  it('το dropdown του Excel παίρνει τις προσθήκες και όχι τα κρυμμένα', () => {
    const sh: RawSheet = { name: 'Φ', rows: [['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα'], [1, 'ΣΤΡ', 'ΠΖ', 'Α', 'Β']] };
    const b: SourceBinding = { file: 'x', sheet: 'Φ', header: 0, cols: { aa: 0, rank: 1, spec: 2, last: 3, first: 4 } };
    expect(listColumns('people', sh, b).map(l => l.items)).toEqual([SOLDIER_RANKS, SPECS]);
    const rank = listColumns('people', sh, b, { soldierRanks: { add: [{ name: 'ΚΛΗΡ' }], hide: ['ΔΕΑ'] } }).find(l => l.what === 'Βαθμός')!;
    expect(rank.items).toEqual([...SOLDIER_RANKS.filter(x => x !== 'ΔΕΑ'), 'ΚΛΗΡ']);
  });
  it('αλλαγή στις λίστες αναιρείται όπως κάθε ρύθμιση', () => {
    const s = fakeState(3);
    const r = apply(s, { t: 'setSettings', settings: { lists: { specs: { add: [{ name: 'ΠΝ' }] } } }, text: 'λίστα' }, { today: D, newId: () => 'x' });
    expect(listOf(r.state.settings.lists, 'specs')).toContain('ΠΝ');
    expect(r.undoable).not.toBe(false);
  });
});
