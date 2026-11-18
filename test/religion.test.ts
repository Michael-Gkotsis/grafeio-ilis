// Θρήσκευμα (Michael, 18/11): πεδίο καρτέλας, λίστα στις Ρυθμίσεις, στήλη και φίλτρο στα Έντυπα, φίλτρο στο Προσωπικό. Μόνο ψεύτικα στοιχεία.
import { describe, expect, it } from 'vitest';
import type { Cadre } from '../src/shared/domain';
import { FIELDS, candidates, fieldValue, guessField, type Row } from '../src/shared/reports';
import { LIST_BASE, itemKey, listOf } from '../src/shared/ranks';
import { rosterMatch } from '../src/shared/rosterLists';
import { apply, type Command } from '../src/shared/commands';
import { fakeState } from './fixtures';

const D = '2026-11-18';
const ctx = { today: D, newId: () => 'z' };
const run = (s: ReturnType<typeof fakeState>, c: Command) => apply(s, c, ctx).state;
const keys = (k: keyof typeof FIELDS) => FIELDS[k].map(f => f.k);
const ids = (s: ReturnType<typeof fakeState>, pick: object) => candidates(s, { kind: 'people', pick: { from: 'all', mode: 'all', ...pick } as never }, D).map(x => (x as { id: number }).id).sort();

describe('Θρήσκευμα', () => {
  it('λίστα: βασικά θρησκεύματα, επεκτάσιμη από τις Λίστες', () => {
    expect(LIST_BASE.religions).toEqual(expect.arrayContaining(['Χριστιανός Ορθόδοξος', 'Μουσουλμάνος', 'Άθεος', 'Δεν δηλώνει']));
    expect(listOf({ religions: { add: [{ name: 'Σιχ' }], hide: ['Βουδιστής'] } }, 'religions')).toEqual(expect.arrayContaining(['Σιχ']));
    expect(listOf({ religions: { add: [{ name: 'Σιχ' }], hide: ['Βουδιστής'] } }, 'religions')).not.toContain('Βουδιστής');
  });
  it('στήλη στα Έντυπα (στρατιώτες, στελέχη, είδη με στρατιώτη), με κεφαλαία', () => {
    for (const k of ['people', 'cadre', 'status', 'duty', 'weapon', 'wmove'] as const) expect(keys(k), k).toContain('religion');
    const s = fakeState(2); s.people[0].religion = 'Χριστιανός Ορθόδοξος';
    expect(fieldValue(s, 'people', s.people[0] as Row, 'religion', 0, D)).toBe('ΧΡΙΣΤΙΑΝΟΣ ΟΡΘΟΔΟΞΟΣ');
    expect(fieldValue(s, 'people', s.people[1] as Row, 'religion', 1, D)).toBe('');
    const c = { id: 1, last: 'ΔΟΚΙΜΗ', first: 'ΕΛΕΝΗ', rank: 'ΛΓΟΣ', religion: 'Άθεος' } as unknown as Cadre;
    expect(fieldValue(s, 'cadre', c as Row, 'religion', 0, D)).toBe('ΑΘΕΟΣ');
    expect(guessField('people', 'Θρήσκευμα')).toBe('religion');
  });
  it('φίλτρο στα Έντυπα: μόνο τα θρησκεύματα που διάλεξες', () => {
    const s = fakeState(4);
    s.people[0] = { ...s.people[0], religion: 'Μουσουλμάνος' }; s.people[1] = { ...s.people[1], religion: 'Χριστιανός Ορθόδοξος' }; s.people[2] = { ...s.people[2], religion: 'Μουσουλμάνος' };
    expect(ids(s, {})).toEqual([1, 2, 3, 4]);
    expect(ids(s, { religions: ['μουσουλμάνος'] })).toEqual([1, 3]);
    expect(ids(s, { religions: ['Μουσουλμάνος', 'Χριστιανός Ορθόδοξος'] })).toEqual([1, 2, 3]);
  });
  it('φίλτρο Προσωπικού (αποθηκευμένη λίστα) rel:', () => {
    const p = { ...fakeState(1).people[0], religion: 'Μουσουλμάνος' };
    expect(rosterMatch(('rel:' + itemKey('Μουσουλμάνος')) as never, p, [])).toBe(true);
    expect(rosterMatch(('rel:' + itemKey('Άθεος')) as never, p, [])).toBe(false);
  });
  it('setPersonal: στρατιώτης, καθαρισμός με κενό', () => {
    const s1 = run(fakeState(2), { t: 'setPersonal', pid: 2, religion: '  Άθεος ' });
    expect(s1.people[1].religion).toBe('Άθεος');
    expect(s1.people[0].religion).toBeUndefined();
    expect(run(s1, { t: 'setPersonal', pid: 2, religion: '' }).people[1].religion).toBeUndefined();
  });
});
