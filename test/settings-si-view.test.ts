// The pure rules of the «Σ.Ι.» card and the duty columns (pages/settings/model/siView.ts, dutyCols.ts).
import { describe, expect, it } from 'vitest';
import { dutyColsOf } from '../src/renderer/pages/settings/model/dutyCols';
import {
  addBase,
  addCatRow,
  addCategory,
  hasLegacyUnarmed,
  isOwnBase,
  removeBase,
  removeCatRow,
  resetRow,
  siCounts,
  siRows,
  toggleCell,
} from '../src/renderer/pages/settings/model/siView';
import { fakeState } from './fixtures';

const block = { id: 'tae', name: 'ΤΑΕ' } as Parameters<typeof toggleCell>[4];

describe('Σ.Ι. view', () => {
  it('lists each duty once, hidden and Λ/Υ ones out', () => {
    const cols = dutyColsOf(fakeState(3).settings);
    expect(new Set(cols.map((b) => b.id)).size).toBe(cols.length);
    expect(cols.every((b) => b.kind !== 'ly' && !b.hidden)).toBe(true);
  });

  it('stores a cell only when it differs from what would apply', () => {
    const lists = {};
    const no = toggleCell(lists, {}, 'Ι3 ΧΩΡΙΣ ΟΠΛΟ', '', block);
    expect(no.si.cells?.['Ι3 ΧΩΡΙΣ ΟΠΛΟ']?.tae).toBe(false);
    expect(no.text).toBe('Ι3 ΧΩΡΙΣ ΟΠΛΟ: δεν μπαίνει σε ΤΑΕ');
    expect(no.toast.endsWith('Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση.')).toBe(true);
    const back = toggleCell({ si: no.si }, no.si, 'Ι3 ΧΩΡΙΣ ΟΠΛΟ', '', block);
    expect(back.si.cells).toEqual({});
  });

  it('resets, removes and refuses rows', () => {
    const cfg = { cells: { 'Ι3 ΜΕ ΟΠΛΟ · ΧΧ': { tae: true }, Ι1: { tae: false } } };
    expect(resetRow(cfg, 'Ι1', '').si.cells).toEqual({ 'Ι3 ΜΕ ΟΠΛΟ · ΧΧ': { tae: true } });
    expect(resetRow(cfg, 'Ι3 ΜΕ ΟΠΛΟ', 'ΧΧ').si.cells?.['Ι3 ΜΕ ΟΠΛΟ · ΧΧ']).toEqual({});
    expect(removeCatRow(cfg, 'Ι3 ΜΕ ΟΠΛΟ', 'ΧΧ').si.cells).toEqual({ Ι1: { tae: false } });
    expect(addCatRow(cfg, 'Ι3 ΜΕ ΟΠΛΟ', 'ΧΧ')).toEqual({
      ok: false,
      error: 'Το Ι3 ΜΕ ΟΠΛΟ ΧΧ έχει ήδη δικούς του κανόνες.',
    });
    expect(addCatRow({}, 'Ι3 ΜΕ ΟΠΛΟ', 'ΧΧ')).toMatchObject({ ok: true, text: 'Ι3 ΜΕ ΟΠΛΟ ΧΧ: δικοί του κανόνες' });
  });

  it('adds a Σ.Ι. or a category, refusing commas, repeats and empty names', () => {
    expect(addBase({}, '  ')).toBeNull();
    expect(addBase({}, 'Ι5,')).toMatchObject({ ok: false });
    expect(addBase({}, 'Ι1')).toEqual({ ok: false, error: 'Η Σ.Ι. «Ι1» υπάρχει ήδη.' });
    const added = addBase({}, 'Ι5');
    expect(added).toMatchObject({ ok: true, text: '+ Ι5', toast: 'Μπήκε η Σ.Ι. Ι5' });
    expect(addCategory({}, '')).toBeNull();
    expect(addCategory({}, 'ΧΧΧ')).toMatchObject({ ok: true, text: '+ κατηγορία ΧΧΧ' });
    const cfg = { add: ['Ι5'], cells: { Ι5: { tae: false }, 'Ι5 · ΧΧ': { tae: false }, Ι1: {} } };
    expect(isOwnBase(cfg, 'Ι5')).toBe(true);
    expect(isOwnBase(cfg, 'Ι1')).toBe(false);
    expect(removeBase(cfg, 'Ι5').si).toEqual({ add: [], cells: { Ι1: {} } });
  });

  it('counts people per row and keeps the people-only Σ.Ι. as rows', () => {
    const s = fakeState(4);
    const people = s.people.map((p, i) => ({ ...p, active: true, si: i < 3 ? 'Ι1' : 'ΧΧΧ' }));
    const { count, odd, seenBases } = siCounts(people, {}, {});
    expect(count.get('Ι1')).toBe(3);
    expect([...odd]).toEqual([['ΧΧΧ', 1]]);
    expect(siRows({}, {}, seenBases).some((r) => r.label === 'Ι1' && r.cat === '')).toBe(true);
    expect(hasLegacyUnarmed({ siUnarmed: { add: [{ name: 'Ι5' }] } })).toBe(true);
  });
});
