// The pure rules of the «Υπογραφές» card and its «Σελίδα 2 (ΔΥΝΑΜΗ)» part (pages/settings/model/sigsView.ts).
import { describe, expect, it } from 'vitest';
import {
  dirtyFormsOf,
  formOptionText,
  isEdited,
  layoutFor,
  layoutFormOf,
  layoutWith,
  movedAny,
  page2PickText,
  page2Sentence,
  saveFormsPlan,
  sigLabelOf,
  sigsNoteTail,
} from '../src/renderer/pages/settings/model/sigsView';
import { sigsSaved } from '../src/shared/sigs';
import { fakeState } from './fixtures';

const settings = () => fakeState(3).settings;
const withMoves = () => ({
  ...settings(),
  layout: { hkai: { ΗΚΑΙ: { s0: [1, 0] as [number, number], head: [0, 2] as [number, number] } } },
});

describe('Υπογραφές view', () => {
  it('has no layout form for the Έντυπα', () => {
    expect(layoutFormOf('reports')).toBeNull();
    expect(layoutFormOf('hkai')).toBe('hkai');
  });

  it('words the note tail by form', () => {
    expect(sigsNoteTail('reports')).toContain('{ΥΠΟΓΡΑΦΕΣ}');
    expect(sigsNoteTail('check')).toContain('Αρχικά καμία');
    expect(sigsNoteTail('hkai')).toBe(' Για μία φορά μόνο: «Υπογραφές…» δίπλα στο «Βγάλε το Excel».');
  });

  it('words page 2 by mode', () => {
    expect(page2Sentence('same')).toBe('Η σελίδα 2 έχει τις ίδιες.');
    expect(page2Sentence('none')).toBe('Η σελίδα 2 βγαίνει χωρίς υπογραφές.');
    expect(page2Sentence('own')).toBe('Η σελίδα 2 έχει τη δική της λίστα, εδώ κάτω.');
    expect(page2PickText('none')).toMatch(/^υπογραφές εξοδούχων, σελίδα 2: /);
  });

  it('drops the dragged places only when the number of signatures changes', () => {
    const s = withMoves();
    expect(layoutFor(s, 'hkai', 2, 2)).toEqual({});
    expect(layoutFor(s, null, 3, 2)).toEqual({});
    expect(layoutFor(settings(), 'hkai', 3, 2)).toEqual({});
    const changed = layoutFor(s, 'hkai', 3, 2);
    expect(Object.keys(changed.layout ?? {})).toEqual(['hkai']);
    expect(changed.layout?.hkai?.ΗΚΑΙ).toEqual({ head: [0, 2] });
  });

  it('stores or removes the layout of one form', () => {
    const s = withMoves();
    expect(layoutWith(s, 'hkai', undefined)).toEqual({});
    expect(layoutWith(settings(), 'outs', { ΕΞΟΔ: { head: [1, 1] } })).toEqual({ outs: { ΕΞΟΔ: { head: [1, 1] } } });
    expect(s.layout.hkai.ΗΚΑΙ.head).toEqual([0, 2]);
  });

  it('knows when a signature was moved', () => {
    expect(movedAny(withMoves(), 'hkai')).toBe(true);
    expect(movedAny(settings(), 'hkai')).toBe(false);
    expect(movedAny(withMoves(), null)).toBe(false);
  });

  it('lists the forms with unsaved changes, also those not shown', () => {
    const s = settings();
    const same = sigsSaved(s, 'outs');
    const edit = { outs: [...same, { art: 'Ο', title: 'ΝΕΟΣ' }], hkai: sigsSaved(s, 'hkai') };
    expect(isEdited(edit, s, 'outs')).toBe(true);
    expect(isEdited(edit, s, 'hkai')).toBe(false);
    expect(dirtyFormsOf(edit, s)).toEqual(['outs']);
    expect(formOptionText(edit, s, 'outs')).toBe(sigLabelOf('outs') + ' •');
    expect(formOptionText(edit, s, 'hkai')).toBe(sigLabelOf('hkai'));
  });

  it('saves every dirty form at once, dropping the places of one whose count changed', () => {
    const s = withMoves();
    const added = [...sigsSaved(s, 'hkai'), { art: 'Ο', title: 'ΝΕΟΣ' }];
    const plan = saveFormsPlan({ hkai: added }, ['hkai'], s);
    expect(plan.patch.sigs?.hkai).toHaveLength(added.length);
    expect(plan.patch.layout?.hkai?.ΗΚΑΙ).toEqual({ head: [0, 2] });
    expect(plan.text).toBe('υπογραφές ' + sigLabelOf('hkai'));
  });

  it('leaves the layout out of the patch when no count changed', () => {
    const s = withMoves();
    const same = sigsSaved(s, 'hkai').map((x) => ({ ...x, name: 'Χ' }));
    expect('layout' in saveFormsPlan({ hkai: same }, ['hkai'], s).patch).toBe(false);
  });
});
