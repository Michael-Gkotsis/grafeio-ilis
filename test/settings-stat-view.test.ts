// The pure rules of the «Καταστάσεις» card (pages/settings/model/statView.ts).
import { describe, expect, it } from 'vitest';
import {
  HK_EY,
  baseName,
  cellChange,
  hkChange,
  medKey,
  outChange,
  resetChange,
  rowName,
  statSections,
  usedMedicals,
} from '../src/renderer/pages/settings/model/statView';
import type { UserLists } from '../src/shared/ranks';

const duty = { id: 'tae', name: 'ΤΑΕ' } as Parameters<typeof cellChange>[3];
const own: UserLists = { medKinds: { add: [{ name: 'ΕΛ ΠΟΔ', like: 'EA' }] } };

describe('stat view', () => {
  it('names rows and what an own row follows', () => {
    expect(rowName('PUN', '')).toBe('Ποινή (όλες)');
    expect(rowName('EA', 'ΕΛ ΠΟΔ')).toBe('ΕΛ ΠΟΔ');
    expect(baseName('PUN')).toBe('όλες τις ποινές');
    expect(medKey('ΕΛ.ΓΥΜΝ')).toBe(medKey('ΕΛ ΓΥΜΝ'));
  });

  it('has three sections, the own medicals in the second', () => {
    const [base, meds, pun] = statSections(own, {});
    expect(base.title).toBe('Ιατρικά');
    expect(meds.rows.map((r) => r.own)).toEqual(['ΕΛ ΠΟΔ']);
    expect(pun.rows[0]).toEqual({ type: 'PUN', own: '' });
  });

  it('stores a cell only when it differs from the base, and resets a row', () => {
    const c = cellChange(own, 'EA', 'ΕΛ ΠΟΔ', duty, 'no');
    expect(c.stat?.cells?.['EA:ΕΛ ΠΟΔ'] ?? c.stat?.cells).toBeTruthy();
    expect(c.text.endsWith(' σε ΤΑΕ')).toBe(true);
    const r = resetChange({ ...own, stat: c.stat }, 'EA', 'ΕΛ ΠΟΔ');
    expect(r.stat?.cells).toEqual({});
    expect(r.text).toBe('ΕΛ ΠΟΔ: όπως το ' + 'ΕΑ'.replace('ΕΑ', rowName('EA', '')));
  });

  it('writes the out tick and the ΗΚΑΙ move', () => {
    expect(outChange(own, 'EA', 'ΕΛ ΠΟΔ', false).toast).toBe('ΕΛ ΠΟΔ δεν βγαίνει έξοδο.');
    const row = { type: 'EA' as const, own: 'ΕΛ ΠΟΔ', med: { name: 'ΕΛ ΠΟΔ', like: 'EA' as const } };
    expect(hkChange(own, row, 'ey', [])?.next).toBeTruthy();
    expect(hkChange(own, { ...row, type: 'EY' }, HK_EY, [])).toBeNull();
    expect(hkChange(own, { type: 'EA', own: '' }, 'ey', [])).toBeNull();
  });

  it('collects the medicals somebody has', () => {
    const used = usedMedicals([{ id: 's', pid: 1, type: 'EA', kind: 'ΕΛ ΠΟΔ', from: '2026-01-01', to: '2026-01-02' }]);
    expect(used.has(medKey('ΕΛ ΠΟΔ'))).toBe(true);
  });
});
