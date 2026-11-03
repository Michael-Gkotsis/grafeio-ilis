// Έξτρα στοιχεία (Michael, 3/11): IBAN, ΑΜΚΑ, ΑΦΜ στην καρτέλα οπλίτη και στελέχους (στο Excel: personal-excel.test.ts)
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { normPersonal, showPersonal, warnPersonal } from '../src/shared/personal';
import { fakeState } from './fixtures';

const D = '2026-11-03';
let n = 0;
const ctx = { today: D, newId: () => 'x' + ++n };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const withCadre = () => run(fakeState(4), { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΔΗΣ', first: 'ΔΟΚΙΜΟΣ' } });
const IBAN = 'GR1601101250000000012300695';

describe('Έξτρα στοιχεία: κανονικοποίηση και έλεγχος', () => {
  it('IBAN συμπαγές, κεφαλαία λατινικά (και ΓΡ από ελληνικό πληκτρολόγιο)', () => {
    expect(normPersonal('iban', ' gr16 0110 1250 0000 0001 2300 695 ')).toBe(IBAN);
    expect(normPersonal('iban', 'ΓΡ16 0110 1250 0000 0001 2300 695')).toBe(IBAN);
    expect(showPersonal('iban', IBAN)).toBe('GR16 0110 1250 0000 0001 2300 695');
    expect(normPersonal('amka', '010203-04567')).toBe('01020304567');
    expect(normPersonal('afm', '123 456 789')).toBe('123456789');
  });
  it('προειδοποιεί, δεν εμποδίζει: ψηφία και μήκος', () => {
    expect(warnPersonal('iban', IBAN)).toBe('');
    expect(warnPersonal('iban', 'GR16 0110')).toMatch(/27/);
    expect(warnPersonal('iban', '1234')).not.toBe('');
    expect(warnPersonal('amka', '01020304567')).toBe('');
    expect(warnPersonal('amka', '0102030456')).toMatch(/10 ψηφία/);
    expect(warnPersonal('afm', '12345678a')).toMatch(/ψηφία/);
    expect(warnPersonal('afm', '123456789')).toBe('');
    expect(warnPersonal('afm', '')).toBe('');
  });
});

describe('Έξτρα στοιχεία: αποθήκευση ανά άτομο', () => {
  it('οπλίτης: αποθηκεύεται κανονικοποιημένο, σβήνεται με κενό, δεν αλλάζει τους άλλους', () => {
    let s = run(fakeState(4), { t: 'setPersonal', pid: 2, iban: 'gr16 0110 1250 0000 0001 2300 695', amka: '01020304567', afm: '123456789' });
    expect(s.people[1]).toMatchObject({ iban: IBAN, amka: '01020304567', afm: '123456789' });
    expect(s.people[0].iban).toBeUndefined();
    s = run(s, { t: 'setPersonal', pid: 2, afm: '  ' });
    expect(s.people[1].afm).toBeUndefined();
    expect(s.people[1].amka).toBe('01020304567');
  });
  it('ακόμα και λάθος μήκος αποθηκεύεται', () => {
    const s = run(fakeState(3), { t: 'setPersonal', pid: 1, amka: '123' });
    expect(s.people[0].amka).toBe('123');
  });
  it('στέλεχος: αποθηκεύεται και μένει όταν σώζεις τα υπόλοιπα στοιχεία του', () => {
    let s = withCadre(); const c = s.cadreList[0];
    s = run(s, { t: 'setPersonal', cid: c.id, iban: IBAN, afm: '123456789' });
    expect(s.cadreList[0]).toMatchObject({ iban: IBAN, afm: '123456789' });
    s = run(s, { t: 'saveCadre', cadre: { rank: c.rank, hk: c.hk, last: c.last, first: c.first, phone: '6911111111', id: c.id } });
    expect(s.cadreList[0]).toMatchObject({ iban: IBAN, afm: '123456789', phone: '6911111111' });
  });
  it('οπλίτης: μένουν μετά από διόρθωση στοιχείων και μετά από εισαγωγή Δυναμολογίου', () => {
    let s = run(fakeState(4), { t: 'setPersonal', pid: 3, iban: IBAN });
    s = run(s, { t: 'updatePerson', person: { ...s.people[2], phone: '6922222222' } });
    expect(s.people[2].iban).toBe(IBAN);
    const rows = s.people.map(({ id, active, iban, amka, afm, ...p }) => ({ ...p, phone: '6933333333' }));
    s = run(s, { t: 'importPeople', rows, source: 'test.xlsx', deactivateMissing: true });
    expect(s.people[2]).toMatchObject({ iban: IBAN, phone: '6933333333' });
  });
  it('άγνωστο άτομο ή στέλεχος: σφάλμα· καμία αλλαγή: καμία ενέργεια', () => {
    expect(() => run(fakeState(2), { t: 'setPersonal', pid: 99, afm: '1' })).toThrow();
    expect(() => run(fakeState(2), { t: 'setPersonal', cid: 'zz', afm: '1' })).toThrow();
    const s = run(fakeState(2), { t: 'setPersonal', pid: 1, afm: '123456789' });
    expect(apply(s, { t: 'setPersonal', pid: 1, afm: '123 456 789' }, ctx).text).toBe('');
  });
  it('τα νούμερα δεν μπαίνουν στο κείμενο της ενέργειας (το Δυναμολόγιο γράφεται χωριστά, από την αλλαγή στα άτομα)', () => {
    const r = apply(fakeState(2), { t: 'setPersonal', pid: 1, iban: IBAN, afm: '123456789' }, ctx);
    expect(r.text).not.toMatch(/GR16|123456789/);
    expect(r.files).toEqual([]);
  });
});
