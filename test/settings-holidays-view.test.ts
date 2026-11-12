// The pure rules of the «Αργίες» card (pages/settings/model/holidaysView.ts).
import { describe, expect, it } from 'vitest';
import {
  addChange,
  allHolidays,
  dropChange,
  generatedHolidays,
  pastCount,
  removedHolidays,
  restoreChange,
  shownHolidays,
} from '../src/renderer/pages/settings/model/holidaysView';
import { fakeState } from './fixtures';

const TODAY = '2026-11-09';
const base = () => ({ ...fakeState(3).settings, holidays: {}, holidaysOff: [] as string[] });

describe('Αργίες view', () => {
  it('generates the official holidays of this and the next year', () => {
    const gen = generatedHolidays(TODAY);
    expect(gen.some(([k]) => k === '2026-12-25')).toBe(true);
    expect(gen.some(([k]) => k === '2027-03-25')).toBe(true);
    expect(gen.some(([k]) => k.startsWith('2028'))).toBe(false);
  });

  it("merges the official ones with the unit's own, by date, and leaves out the removed ones", () => {
    const gen = generatedHolidays(TODAY);
    const s = { ...base(), holidays: { '2026-12-01': 'ΤΟΠΙΚΗ' }, holidaysOff: ['2026-12-25'] };
    const all = allHolidays(s, gen);
    expect(all.map((x) => x.k)).toEqual([...all.map((x) => x.k)].sort());
    expect(all.find((x) => x.k === '2026-12-01')).toEqual({ k: '2026-12-01', v: 'ΤΟΠΙΚΗ', gen: false });
    expect(all.some((x) => x.k === '2026-12-25')).toBe(false);
    expect(all.find((x) => x.k === '2027-03-25')?.gen).toBe(true);
  });

  it("lets the unit's own name win over the official one of the same day", () => {
    const gen = generatedHolidays(TODAY);
    const all = allHolidays({ ...base(), holidays: { '2026-12-25': 'ΔΙΚΗ ΜΑΣ' } }, gen);
    expect(all.filter((x) => x.k === '2026-12-25')).toEqual([{ k: '2026-12-25', v: 'ΔΙΚΗ ΜΑΣ', gen: false }]);
  });

  it('hides the past ones until asked, and counts them', () => {
    const all = allHolidays(base(), generatedHolidays(TODAY));
    const past = pastCount(all, TODAY);
    expect(past).toBeGreaterThan(0);
    expect(shownHolidays(all, TODAY, true)).toHaveLength(all.length);
    expect(shownHolidays(all, TODAY, false)).toHaveLength(all.length - past);
    expect(shownHolidays(all, TODAY, false).every((x) => x.k >= TODAY)).toBe(true);
  });

  it('lists the removed official ones', () => {
    const gen = generatedHolidays(TODAY);
    expect(removedHolidays({ ...base(), holidaysOff: ['2026-12-25', '1999-01-01'] }, gen).map(([k]) => k)).toEqual([
      '2026-12-25',
    ]);
  });

  it('removes an official holiday by listing it, an own one by deleting it', () => {
    const s = { ...base(), holidays: { '2026-12-01': 'ΤΟΠΙΚΗ', '2026-12-02': 'ΑΛΛΗ' }, holidaysOff: ['2026-03-25'] };
    expect(dropChange(s, { k: '2026-12-25', v: 'Χριστούγεννα', gen: true })).toEqual({
      patch: { holidaysOff: ['2026-03-25', '2026-12-25'] },
      text: 'αφαιρέθηκε η αργία Χριστούγεννα 25/12/2026',
    });
    const own = dropChange(s, { k: '2026-12-01', v: 'ΤΟΠΙΚΗ', gen: false });
    expect(own.patch).toEqual({ holidays: { '2026-12-02': 'ΑΛΛΗ' } });
    expect(s.holidays['2026-12-01']).toBe('ΤΟΠΙΚΗ');
  });

  it('brings a removed official holiday back', () => {
    const s = { ...base(), holidaysOff: ['2026-12-25', '2026-03-25'] };
    expect(restoreChange(s, '2026-12-25', 'Χριστούγεννα')).toEqual({
      patch: { holidaysOff: ['2026-03-25'] },
      text: 'ξανά αργία Χριστούγεννα 25/12/2026',
    });
  });

  it('adds a trimmed own holiday, and puts an official one of that day back on', () => {
    const s = { ...base(), holidays: { '2026-12-01': 'ΤΟΠΙΚΗ' }, holidaysOff: ['2026-12-25'] };
    expect(addChange(s, '2026-12-25', '  Δική μας  ')).toEqual({
      patch: { holidays: { '2026-12-01': 'ΤΟΠΙΚΗ', '2026-12-25': 'Δική μας' }, holidaysOff: [] },
      text: 'νέα αργία Δική μας 25/12/2026',
    });
  });
});
