// The pure rules of the «Μονάδα και έντυπα» card (pages/settings/model/unitView.ts).
import { describe, expect, it } from 'vitest';
import { unitDirty, unitFormOf, unitSavePlan, withUnitKind } from '../src/renderer/pages/settings/model/unitView';
import { fakeState } from './fixtures';

const settings = () => fakeState(3).settings;

describe('Μονάδα και έντυπα view', () => {
  it('copies the settings into the form, never sharing them', () => {
    const s = settings();
    const form = unitFormOf(s);
    expect(form.unit).toEqual(s.unit);
    expect(form.unit).not.toBe(s.unit);
    expect(form.cadre).not.toBe(s.cadre);
    expect(form.head).toHaveLength(2);
  });

  it('is dirty only when something differs', () => {
    const saved = unitFormOf(settings());
    expect(unitDirty(unitFormOf(settings()), saved)).toBe(false);
    expect(unitDirty({ ...saved, place: saved.place + '!' }, saved)).toBe(true);
  });

  it('switches the unit words with the unit kind, header and title together', () => {
    const form = {
      ...unitFormOf(settings()),
      unit: ['ΚΕΤΘ', '2η ΙΛΗ', ''] as [string, string, string],
      unitName: '4ης ΙΛΗΣ',
    };
    const lochos = withUnitKind(form, 'lochos');
    expect(lochos.unitKind).toBe('lochos');
    expect(lochos.unit[1]).toBe('2ος ΛΟΧΟΣ');
    expect(lochos.unitName).toBe('4ου ΛΟΧΟΥ');
    expect(withUnitKind(lochos, 'ili').unit[1]).toBe('2η ΙΛΗ');
  });

  it('writes the unit settings, and drops an empty ΗΚΑΙ head instead of storing blanks', () => {
    const s = settings();
    const form = { ...unitFormOf(s), head: [' ', ''] };
    const plan = unitSavePlan(form, { ...s, hkai: { head: ['Α', 'Β'] } });
    expect(plan.patch.hkai).toEqual({});
    expect(plan.patch.unit).toBe(form.unit);
    expect(plan.text.startsWith('μονάδα (')).toBe(true);
  });

  it('trims a filled ΗΚΑΙ head', () => {
    const s = settings();
    const plan = unitSavePlan({ ...unitFormOf(s), head: [' ΑΑ ', 'ΒΒ'] }, s);
    expect(plan.patch.hkai?.head).toEqual(['ΑΑ', 'ΒΒ']);
  });
});
