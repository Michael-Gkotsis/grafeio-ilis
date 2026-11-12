// The pure rules of the «Αρχεία Excel» section (pages/settings/model: sourcesView, mapView, importView, formsView).
import { describe, expect, it } from 'vitest';
import { formBindingOf } from '../src/renderer/pages/settings/model/formsView';
import { toggleKeepApp } from '../src/renderer/pages/settings/model/importView';
import { colLabel, mapRange, nextField, setColIn } from '../src/renderer/pages/settings/model/mapView';
import {
  SHEET_KINDS,
  bindingMoved,
  formList,
  matchChoice,
  newFileText,
  prevMonth,
  withOwn,
} from '../src/renderer/pages/settings/model/sourcesView';
import type { FormInfo } from '../src/shared/api';
import { HK_RANKS } from '../src/shared/sources';

describe('sources view', () => {
  it('takes the month before today', () => {
    expect(prevMonth('2026-03-15')).toBe('2026-02');
    expect(prevMonth('2026-01-01')).toBe('2025-12');
  });

  it('says what «Νέο αρχείο…» did', () => {
    expect(newFileText('punish', { file: 'C:\\a\\F.xlsx', sheet: 'S', found: true })).toContain('έχει ήδη φύλλο «S»');
    expect(newFileText('punish', { file: 'F.xlsx', sheet: 'S', inRoster: true })).toContain('Μπήκε φύλλο «S»');
    expect(newFileText('people', { file: 'F.xlsx', sheet: 'S', sheets: ['Α'] })).toContain('ΣΥΝΟΛΙΚΟ, ΘΑΛΑΜΟΙ, Α');
    expect(newFileText('punish', { file: 'F.xlsx', sheet: 'S' })).toBe(
      'Φτιάχτηκε το F.xlsx. Από εδώ και πέρα κάθε αλλαγή γράφεται εκεί.',
    );
    expect(SHEET_KINDS).toContain('duties');
  });

  it('detects a moved binding and lists the forms with the own phases', () => {
    expect(
      bindingMoved(
        { file: 'f', sheet: 's', header: 1, cols: { a: 1 } },
        { file: 'f', sheet: 's', header: 1, cols: { a: 1 } },
      ),
    ).toBe(false);
    expect(bindingMoved({ file: 'f', sheet: 's', header: 2, cols: {} }, undefined)).toBe(true);
    const st = { phases: [{ base: 'sven', name: 'Χ' }] } as never;
    expect(withOwn(st, 'sven', 'ΦΡΟΥΡΑ ΣΒΕΝ')).toBe('ΦΡΟΥΡΑ ΣΒΕΝ (και Χ)');
    expect(formList(st).map((f) => f[0])).toEqual(['froura', 'frouraSpen', 'hkai', 'outs', 'check']);
  });

  it('finds a kind chosen twice', () => {
    expect(matchChoice({ 0: 'punish', 1: '', 2: 'punish' }).dupe).toBe('punish');
    expect(matchChoice({ 0: 'punish', 1: 'leave' }).dupe).toBeUndefined();
  });

  it('gives a column to one field only', () => {
    expect(setColIn({ a: 1, b: 2 }, 'a', 2)).toEqual({ a: 2 });
    expect(setColIn({ a: 1, b: 2 }, 'a', null)).toEqual({ b: 2 });
    expect(
      nextField(
        [
          { k: 'last', req: true },
          { k: 'first', req: true },
        ] as never,
        'last',
        { last: 1 },
      ),
    ).toBe('first');
    expect(nextField([{ k: 'last' }] as never, 'last', {})).toBeNull();
  });

  it('shows the header rows around the table', () => {
    const sheet = { name: 'S', rows: Array.from({ length: 40 }, () => ['a', 'b']) };
    const r = mapRange(sheet as never, { file: 'f', sheet: 'S', header: 5, cols: { x: 12 } }, 30);
    expect(r).toEqual({ maxCol: 12, from: 3, to: 40 });
    expect(colLabel({ name: 'S', rows: [['ΕΠΩΝΥΜΟ']] } as never, 0, 0)).toBe('A · ΕΠΩΝΥΜΟ');
  });

  it('toggles the records kept from the app', () => {
    const a = toggleKeepApp(new Set(), 'x', true);
    expect([...a]).toEqual(['x']);
    expect([...toggleKeepApp(a, 'x', false)]).toEqual([]);
  });

  it('keeps in a template binding only what differs from the recognition', () => {
    const info = {
      ok: true,
      file: 'T.xlsx',
      custom: true,
      sheets: ['A'],
      sheet: 'A',
      hkai: {
        map: { rows: { [HK_RANKS[0]]: 3 }, cols: { a: 'B' }, title: 'A1', date: 'B2' },
        found: 1,
        total: 1,
        missing: [],
      },
    } as unknown as FormInfo;
    const same = { rows: { [HK_RANKS[0]]: 3 }, cols: { a: 'B' }, title: 'A1', date: 'B2' } as never;
    expect(formBindingOf('hkai', info, {}, 'A', 'B', same).cells).toBeUndefined();
    const changed = { rows: { [HK_RANKS[0]]: 4 }, cols: { a: 'B' }, title: 'A1', date: 'B2' } as never;
    expect(formBindingOf('hkai', info, {}, 'A', 'B', changed).cells).toEqual({ rows: { [HK_RANKS[0]]: 4 } });
    expect(formBindingOf('froura', info, {}, 'A', 'B', null).sheet2).toBeUndefined();
  });
});
