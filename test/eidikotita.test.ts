// Ειδικότητα (Michael, 24/11): λίστα στις Ρυθμίσεις, καρτέλα στρατιώτη και στελέχους, στήλη και φίλτρο στα Έντυπα, φίλτρο στο Προσωπικό,
// και μεταφορά της ειδικότητας που είχαν ήδη τα στελέχη στη λίστα. Μόνο ψεύτικα στοιχεία.
import { describe, expect, it } from 'vitest';
import type { Cadre } from '../src/shared/domain';
import { FIELDS, candidates, fieldValue, guessField, pickText, type Row } from '../src/shared/reports';
import { LIST_BASE, itemKey, listOf, seedEids } from '../src/shared/ranks';
import { rosterMatch } from '../src/shared/rosterLists';
import { apply, type Command } from '../src/shared/commands';
import { fakeState } from './fixtures';

const D = '2026-11-24';
const ctx = { today: D, newId: () => 'z' };
const run = (s: ReturnType<typeof fakeState>, c: Command) => apply(s, c, ctx).state;
const keys = (k: keyof typeof FIELDS) => FIELDS[k].map(f => f.k);
const ids = (s: ReturnType<typeof fakeState>, pick: object, kind: 'people' | 'cadre' = 'people') => candidates(s, { kind, pick: { from: 'all', mode: 'all', ...pick } as never }, D).map(x => (x as { id: number | string }).id).sort();
const cad = (id: string, eid?: string) => ({ id, last: 'Κ' + id, first: 'Ν', rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', active: true, ...(eid ? { eid } : {}) }) as unknown as Cadre;

describe('Ειδικότητα', () => {
  it('λίστα: ξεκινά κενή, επεκτάσιμη και κρυφή από τις Λίστες, με κεφαλαία', () => {
    expect(LIST_BASE.eids).toEqual([]);
    const l = { eids: { add: [{ name: 'ΟΔΗΓΟΣ' }, { name: 'ΜΑΓΕΙΡΑΣ' }], hide: ['ΜΑΓΕΙΡΑΣ'] } };
    expect(listOf(l, 'eids')).toEqual(['ΟΔΗΓΟΣ']);
  });
  it('στήλη στα Έντυπα (στρατιώτες, είδη με στρατιώτη) και στα στελέχη (cspec), με κεφαλαία', () => {
    for (const k of ['people', 'status', 'duty', 'weapon', 'wmove'] as const) expect(keys(k), k).toContain('eid');
    expect(keys('cadre')).toContain('cspec');
    const s = fakeState(2); s.people[0].eid = 'οδηγός';
    expect(fieldValue(s, 'people', s.people[0] as Row, 'eid', 0, D)).toBe('ΟΔΗΓΟΣ');
    expect(fieldValue(s, 'people', s.people[1] as Row, 'eid', 1, D)).toBe('');
    expect(fieldValue(s, 'cadre', cad('a', 'ΜΑΓΕΙΡΑΣ') as Row, 'cspec', 0, D)).toBe('ΜΑΓΕΙΡΑΣ');
    expect(fieldValue(s, 'cadre', cad('a', 'ΜΑΓΕΙΡΑΣ') as Row, 'eid', 0, D)).toBe('ΜΑΓΕΙΡΑΣ');
  });
  it('η κεφαλίδα «Ειδικότητα» ταιριάζει όπως πριν (στρατιώτες Ο/Σ, στελέχη cspec)', () => {
    expect(guessField('people', 'Ειδικότητα')).toBe('spec');
    expect(guessField('cadre', 'Ειδικότητα')).toBe('cspec');
  });
  it('φίλτρο στα Έντυπα: στρατιώτες', () => {
    const s = fakeState(4);
    s.people[0] = { ...s.people[0], eid: 'ΟΔΗΓΟΣ' }; s.people[1] = { ...s.people[1], eid: 'ΜΑΓΕΙΡΑΣ' }; s.people[2] = { ...s.people[2], eid: 'ΟΔΗΓΟΣ' };
    expect(ids(s, {})).toEqual([1, 2, 3, 4]);
    expect(ids(s, { eids: ['οδηγός'] })).toEqual([1, 3]);
    expect(ids(s, { eids: ['ΟΔΗΓΟΣ', 'ΜΑΓΕΙΡΑΣ'] })).toEqual([1, 2, 3]);
    expect(pickText({ kind: 'people', pick: { from: 'all', mode: 'all', eids: ['ΟΔΗΓΟΣ'] } as never }, s)).toContain('ειδικότητα ΟΔΗΓΟΣ');
  });
  it('φίλτρο στα Έντυπα: στελέχη', () => {
    const s = fakeState(1); s.cadreList = [cad('a', 'ΟΔΗΓΟΣ'), cad('b', 'ΜΑΓΕΙΡΑΣ'), cad('c')];
    expect(ids(s, {}, 'cadre')).toEqual(['a', 'b', 'c']);
    expect(ids(s, { eids: ['ΜΑΓΕΙΡΑΣ'] }, 'cadre')).toEqual(['b']);
  });
  it('φίλτρο Προσωπικού (αποθηκευμένη λίστα) eid:', () => {
    const p = { ...fakeState(1).people[0], eid: 'ΟΔΗΓΟΣ' };
    expect(rosterMatch(('eid:' + itemKey('οδηγός')) as never, p, [])).toBe(true);
    expect(rosterMatch(('eid:' + itemKey('ΜΑΓΕΙΡΑΣ')) as never, p, [])).toBe(false);
  });
  it('setPersonal: στρατιώτης και στέλεχος, κεφαλαία, καθαρισμός με κενό', () => {
    const s1 = run(fakeState(2), { t: 'setPersonal', pid: 2, eid: '  οδηγός ' });
    expect(s1.people[1].eid).toBe('ΟΔΗΓΟΣ');
    expect(s1.people[0].eid).toBeUndefined();
    expect(run(s1, { t: 'setPersonal', pid: 2, eid: '' }).people[1].eid).toBeUndefined();
    const s2 = fakeState(1); s2.cadreList = [cad('a')];
    expect(run(s2, { t: 'setPersonal', cid: 'a', eid: 'Μάγειρας' }).cadreList[0].eid).toBe('ΜΑΓΕΙΡΑΣ');
  });
  it('παλιά δεδομένα: η ειδικότητα των στελεχών μπαίνει στη λίστα, τα στελέχη μένουν ίδια, δεύτερο τρέξιμο δεν αλλάζει τίποτα', () => {
    const s = fakeState(1); s.cadreList = [cad('a', 'ΔΙΟΙΚΗΤΙΚΟΣ'), cad('b', 'διοικητικός'), cad('c', 'ΜΑΓΕΙΡΑΣ'), cad('d')];
    const t = seedEids(s)!;
    expect(listOf(t.settings.lists, 'eids')).toEqual(['ΔΙΟΙΚΗΤΙΚΟΣ', 'ΜΑΓΕΙΡΑΣ']);
    expect(t.cadreList).toBe(s.cadreList);
    expect(seedEids(t)).toBeNull();
    const none = fakeState(1); none.cadreList = [cad('a')];
    expect(seedEids(none)).toBeNull();
  });
  it('κρυμμένη ειδικότητα που την έχει στέλεχος δεν ξαναμπαίνει στη λίστα', () => {
    const s = fakeState(1); s.cadreList = [cad('a', 'ΜΑΓΕΙΡΑΣ')];
    const t = seedEids(s)!; const hidden = { ...t, settings: { ...t.settings, lists: { ...t.settings.lists, eids: { ...t.settings.lists!.eids, hide: ['ΜΑΓΕΙΡΑΣ'] } } } };
    expect(listOf(hidden.settings.lists, 'eids')).toEqual([]);
    expect(seedEids(hidden)).toBeNull();
  });
});
