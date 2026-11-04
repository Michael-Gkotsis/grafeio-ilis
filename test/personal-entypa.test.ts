// IBAN, ΑΜΚΑ, ΑΦΜ (και e-mail, ομάδα αίματος) ως στήλες στα Έντυπα + φίλτρο «pdata» (Michael, 4/11). Μόνο ψεύτικα στοιχεία.
import { describe, expect, it } from 'vitest';
import type { Cadre } from '../src/shared/domain';
import { FIELDS, candidates, fieldValue, guessField, type Row } from '../src/shared/reports';
import { fakeState } from './fixtures';

const D = '2026-11-04';
const keys = (k: keyof typeof FIELDS) => FIELDS[k].map(f => f.k);
const SIX = ['email', 'relEmail', 'blood', 'iban', 'amka', 'afm'];

describe('Έντυπα: προσωπικά στοιχεία', () => {
  it('στήλες σε στρατιώτες, στελέχη και τα είδη με στρατιώτη ανά γραμμή', () => {
    expect(keys('people')).toEqual(expect.arrayContaining(['iban', 'amka', 'afm']));
    expect(keys('cadre')).toEqual(expect.arrayContaining(['iban', 'amka', 'afm']));
    for (const k of ['status', 'duty', 'weapon', 'wmove'] as const) expect(keys(k), k).toEqual(expect.arrayContaining(SIX));
    expect(keys('blank')).toEqual(expect.arrayContaining(SIX));
  });
  it('τιμές: κείμενο, κρατά το αρχικό μηδέν', () => {
    const s = fakeState(3); s.people[0].amka = '01019012345'; s.people[0].afm = '012345678'; s.people[0].iban = 'GR1601101250000000012300695';
    expect(fieldValue(s, 'people', s.people[0] as Row, 'amka', 0, D)).toBe('01019012345');
    expect(fieldValue(s, 'people', s.people[0] as Row, 'afm', 0, D)).toBe('012345678');
    expect(fieldValue(s, 'people', s.people[0] as Row, 'iban', 0, D)).toBe('GR1601101250000000012300695');
    expect(fieldValue(s, 'people', s.people[1] as Row, 'iban', 1, D)).toBe('');
    const c = { id: 1, last: 'ΔΟΚΙΜΗ', first: 'ΕΛΕΝΗ', rank: 'ΛΓΟΣ', iban: 'GR1601101250000000012300695', amka: '02020212345' } as unknown as Cadre;
    expect(fieldValue(s, 'cadre', c as Row, 'iban', 0, D)).toBe('GR1601101250000000012300695');
    expect(fieldValue(s, 'cadre', c as Row, 'amka', 0, D)).toBe('02020212345');
    expect(fieldValue(s, 'cadre', c as Row, 'afm', 0, D)).toBe('');
  });
  it('αυτόματη αναγνώριση επικεφαλίδων', () => {
    expect(guessField('people', 'IBAN')).toBe('iban');
    expect(guessField('cadre', 'Α.Μ.Κ.Α.')).toBe('amka');
    expect(guessField('people', 'ΑΦΜ')).toBe('afm');
    expect(guessField('people', 'AFM')).toBe('afm');
    expect(guessField('people', 'ΑΜ')).not.toBe('amka');
  });
  it('φίλτρο pdata: τα έχουν όλα / λείπει κάποιο', () => {
    const s = fakeState(4);
    s.people[0] = { ...s.people[0], iban: 'GR1', amka: '01', afm: '02' };
    s.people[1] = { ...s.people[1], iban: 'GR2', amka: '03' };
    const ids = (pick: object) => candidates(s, { kind: 'people', pick: { from: 'all', mode: 'all', ...pick } as never }, D).map(x => (x as { id: number }).id).sort();
    expect(ids({ need: ['pdata'] })).toEqual([1]);
    expect(ids({ not: ['pdata'] })).toEqual([2, 3, 4]);
  });
});
