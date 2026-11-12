// The pure rules of the «ΗΚΑΙ» screen (pages/hkai/model/view.ts): columns, cadre order, hand-written numbers, sections.
import { describe, expect, it } from 'vitest';
import {
  HK_ACC_FIELDS,
  HK_TEXT_FIELDS,
  VEHICLE_FIELDS,
  cadreByRank,
  cadreInColumn,
  cadreTotal,
  hkaiFileName,
  hkaiSources,
  manualLabel,
  manualOf,
  officerNames,
  parseCount,
  usedCells,
  vehicleOf,
  withCell,
  withProvided,
  type HkaiDay,
} from '../src/renderer/pages/hkai/model/view';
import { HK_A, HK_K, hkaiCounts } from '../src/shared/rules';
import { HK } from '../src/shared/unit';
import { fakeState } from './fixtures';

const cadre = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, last: 'ΑΛΦΑ' + id, first: 'ΒΗΤΑ', rank: 'ΑΝΘΛΓΟΣ', hk: 'Αξιωματικοί', active: true, ...extra }) as never;

describe('hkai view', () => {
  it('names the file after the unit, the day and the year', () => {
    expect(hkaiFileName('2026-11-10')).toBe(HK() + ' 10.11.26.xlsx');
  });

  it('keeps only the columns that have soldiers or cadre, soldiers columns first', () => {
    const [k0] = HK_K[0];
    const [a0] = HK_A[0];
    const day = {
      cols: Object.fromEntries([...HK_K, ...HK_A].map(([k]) => [k, k === k0 ? [{ id: 1 }] : []])),
      cadre: { [a0]: [cadre('x')] },
    } as unknown as HkaiDay;
    expect(hkaiSources(day).map(([k]) => k)).toEqual([k0, a0]);
  });

  it('sorts the cadre of a column by the order of the «Στελέχη» tab, unknown ones count as first', () => {
    const day = { cadre: { k: [cadre('b'), cadre('a'), cadre('z')] } } as unknown as HkaiDay;
    const order = new Map([
      ['a', 0],
      ['b', 1],
    ]);
    expect(cadreInColumn(day, 'k', order).map((c) => c.id)).toEqual(['a', 'z', 'b']);
    expect(cadreInColumn(day, 'none', order)).toEqual([]);
  });

  it('counts the active cadre, or the per-rank numbers of Settings when there is no list', () => {
    const s = fakeState(3);
    s.settings.cadre = { Αξιωματικοί: 2, ΥΕ: 3 } as never;
    expect(cadreTotal(s)).toBe(5);
    s.cadreList = [cadre('1'), cadre('2', { active: false })];
    expect(cadreTotal(s)).toBe(1);
  });

  it('counts active cadre per row and lists their names for the duty officer', () => {
    const list = [cadre('1'), cadre('2'), cadre('3', { hk: 'ΥΕ' })];
    expect([...cadreByRank(list)].map(([, n]) => n)).toEqual([2, 1]);
    const s = fakeState(1);
    s.cadreList = [cadre('1'), cadre('2', { active: false })];
    expect(officerNames(s)).toHaveLength(1);
    expect(officerNames(s)[0]).toContain('ΑΛΦΑ1 ΒΗΤΑ');
  });

  it('manualOf drops the leaves switch, withCell adds and removes numbers and empty rows', () => {
    expect(manualOf(undefined)).toEqual({ cells: {}, text: {} });
    expect(manualOf({ cells: { Χ: { a: 1 } }, text: { t: 'x' }, lv: true } as never)).toEqual({
      cells: { Χ: { a: 1 } },
      text: { t: 'x' },
    });
    const one = withCell(manualOf(undefined), 'Χ', 'a', 3);
    expect(one.cells).toEqual({ Χ: { a: 3 } });
    expect(withCell(one, 'Χ', 'b', 2).cells).toEqual({ Χ: { a: 3, b: 2 } });
    expect(withCell(one, 'Χ', 'a', 0).cells).toEqual({});
    expect(one.cells).toEqual({ Χ: { a: 3 } });
  });

  it('lists the written numbers and labels a column by its key when unknown', () => {
    const m = withCell(withCell(manualOf(undefined), 'Χ', 'a', 1), 'Ψ', 'b', 2);
    expect(usedCells(m)).toEqual([
      { r: 'Χ', k: 'a', v: 1 },
      { r: 'Ψ', k: 'b', v: 2 },
    ]);
    expect(manualLabel('nope')).toBe('nope');
  });

  it('parses a number field: empty is undefined, bad text is 0, negatives are 0', () => {
    expect(parseCount('')).toBeUndefined();
    expect(parseCount('  ')).toBeUndefined();
    expect(parseCount('x')).toBe(0);
    expect(parseCount('-4')).toBe(0);
    expect(parseCount('7')).toBe(7);
  });

  it('withProvided sets or removes a row without touching the old object', () => {
    const prov = { Χ: 2 };
    expect(withProvided(prov, 'Ψ', 5)).toEqual({ Χ: 2, Ψ: 5 });
    expect(withProvided(prov, 'Χ', undefined)).toEqual({});
    expect(withProvided(prov, 'Χ', 0)).toEqual({});
    expect(prov).toEqual({ Χ: 2 });
  });

  it('the vehicle defaults to «1/4 τόνων» and the field lists keep their keys', () => {
    expect(vehicleOf({})).toEqual({ type: '1/4 τόνων' });
    expect(vehicleOf({ veh: { type: 'Φορτηγό', kin: 1 } })).toEqual({ type: 'Φορτηγό', kin: 1 });
    expect(VEHICLE_FIELDS.map(([k]) => k)).toEqual(['prov', 'kin', 'maint', 'dmg']);
    expect(HK_TEXT_FIELDS.map(([k]) => k)).toEqual(['egr', 'dia', 'lv', 'ait', 'loi', 'off']);
    expect(HK_ACC_FIELDS.map(([k]) => k)).toEqual(['accT', 'accP', 'accM']);
  });

  it('a day with nobody away has no columns', () => {
    const s = fakeState(10);
    const day = hkaiCounts(s, '2026-11-10');
    expect(hkaiSources(day)).toEqual([]);
  });
});
