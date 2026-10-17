// Αργίες για κάθε χρονιά: σταθερές και από το Ορθόδοξο Πάσχα, μαζί με όσες πρόσθεσες και χωρίς όσες αφαίρεσες.
import { describe, it, expect } from 'vitest';
import { greekHolidays, orthodoxEaster } from '../src/shared/dates';
import { DEFAULT_SETTINGS, migrateSettings, type Settings } from '../src/shared/domain';
import { dutyStats, holName, isHol } from '../src/shared/rules';
import { fakeState } from './fixtures';

const st = (x: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...x });

describe('αργίες', () => {
  it('Ορθόδοξο Πάσχα και κινητές αργίες', () => {
    expect([orthodoxEaster(2026), orthodoxEaster(2027), orthodoxEaster(2028), orthodoxEaster(2030)]).toEqual(['2026-04-12', '2027-05-02', '2028-04-16', '2030-04-28']);
    const h = greekHolidays(2027);
    expect([h['2027-03-15'], h['2027-04-30'], h['2027-05-03'], h['2027-06-21']]).toEqual(['Καθαρά Δευτέρα', 'Μεγάλη Παρασκευή', 'Δευτέρα του Πάσχα', 'Αγίου Πνεύματος']);
  });
  it('κάθε χρονιά, και μετά τον Αύγουστο του 2027', () => {
    const s = st();
    expect(isHol(s, '2027-10-28')).toBe(true); expect(holName(s, '2027-10-28')).toBe('28η Οκτωβρίου');
    expect(isHol(s, '2028-04-17')).toBe(true);   // Δευτέρα του Πάσχα 2028
    expect(isHol(s, '2028-04-18')).toBe(false);
  });
  it('αφαίρεση επίσημης (holidaysOff) και δική σου αργία', () => {
    const s = st({ holidaysOff: ['2027-10-28'], holidays: { '2027-11-17': 'Επέτειος' } });
    expect(isHol(s, '2027-10-28')).toBe(false);
    expect(holName(s, '2027-11-17')).toBe('Επέτειος');
  });
  it('οι παλιές γραμμένες προεπιλογές φεύγουν από τις «δικές σου»· οι δικές σου μένουν', () => {
    const m = migrateSettings({ ...DEFAULT_SETTINGS, rev: 3, holidays: { '2026-10-28': '28η Οκτωβρίου', '2027-05-03': 'Δευτέρα του Πάσχα', '2026-11-17': 'Επέτειος' } });
    expect(m.holidays).toEqual({ '2026-11-17': 'Επέτειος' }); expect(m.rev).toBe(5);
  });
  it('τα σύνολα αργιών ξαναμετριούνται όταν αλλάξουν οι αργίες', () => {
    const s0 = { ...fakeState(3), guards: { '2027-10-28': { th1: 1 } } };   // Πέμπτη
    expect(dutyStats(s0).get(1)!.hol).toBe(1);
    expect(dutyStats({ ...s0, settings: { ...s0.settings, holidaysOff: ['2027-10-28'] } }).get(1)!.hol).toBe(0);
  });
});
