// Έλεγχος 25/11, Π1: μόνιμο άτομο και όριο υπηρεσιών. Michael (25/11, κάρτα): «Όπως τώρα + ειδοποίηση». Ο μόνιμος μπαίνει κάθε μέρα στη θέση του,
// και η αυτόματη συμπλήρωση λέει ότι πέρασε το όριο. Χωρίς όριο, ή κάτω από αυτό, καμία νέα ειδοποίηση. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { apply } from '../src/shared/commands';
import { addDays } from '../src/shared/dates';
import type { AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D0 = '2026-12-01';
function days(rules: Partial<AppState['rules']>, n: number) {
  const ctx = { today: D0, newId: (() => { let i = 0; return () => 'f' + ++i; })() };
  let s = fakeState(40);
  s = apply(s, { t: 'setRules', rules: { ...s.rules, ...rules }, text: 'δοκιμή' }, ctx).state;
  s = apply(s, { t: 'setSettings', settings: { fixed: { ly: 3 } }, text: 'μόνιμος' }, ctx).state;
  const txt: string[] = [];
  for (let i = 0; i < n; i++) { const r = apply(s, { t: 'autofill', date: addDays(D0, i) }, ctx); s = r.state; txt.push(r.text); }
  return { s, txt };
}
describe('Π1: μόνιμο άτομο πάνω από το όριο υπηρεσιών', () => {
  it('όριο 5 τον μήνα: μπαίνει κάθε μέρα· από την 6η η ενέργεια λέει «πάνω από το όριο (6/5)»', () => {
    const { s, txt } = days({ dutyMax: 5, dutyMaxPer: 'month' }, 8);
    for (let i = 0; i < 8; i++) expect(s.guards[addDays(D0, i)].ly).toBe(3);
    for (let i = 0; i < 5; i++) expect(txt[i]).not.toMatch(/Μόνιμος.*πάνω από το όριο/);
    expect(txt[5]).toMatch(/Μόνιμος Λ\/Υ .*: μπήκε πάνω από το όριο υπηρεσιών \(6\/5\)/);
    expect(txt[7]).toMatch(/\(8\/5\)/);
  });
  it('δικό του όριο (3) υπερισχύει· συνολικά', () => {
    const ctx = { today: D0, newId: (() => { let i = 0; return () => 'g' + ++i; })() };
    let s = fakeState(40);
    s = apply(s, { t: 'updatePerson', person: { ...s.people[2], dutyMax: 3 } }, ctx).state;
    s = apply(s, { t: 'setSettings', settings: { fixed: { ly: 3 } }, text: 'μόνιμος' }, ctx).state;
    const txt: string[] = [];
    for (let i = 0; i < 5; i++) { const r = apply(s, { t: 'autofill', date: addDays(D0, i) }, ctx); s = r.state; txt.push(r.text); }
    expect(txt.slice(0, 3).some(t => /Μόνιμος.*όριο/.test(t))).toBe(false);
    expect(txt[3]).toMatch(/\(4\/3\)/);
  });
  it('χωρίς όριο: καμία ειδοποίηση για τον μόνιμο', () => {
    const { txt } = days({}, 6);
    expect(txt.some(t => /Μόνιμος.*όριο/.test(t))).toBe(false);
  });
});
