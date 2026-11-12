// The pure rules of the «Δύναμη» page (pages/strength/model/view.ts): open cards, filters, visible cards and ids.
import { describe, expect, it } from 'vitest';
import {
  SV_OPEN,
  SV_ORDER,
  filterStrength,
  isCatOpen,
  visibleCats,
  visibleIds,
  type StrengthDay,
} from '../src/renderer/pages/strength/model/view';
import { unitOf } from '../src/shared/domain';
import { strengthView } from '../src/shared/strengthView';
import { fakeState } from './fixtures';

const state = fakeState(12);
const row = (id: number) => ({ p: state.people[id - 1] });
const group = (key: string, ids: number[]) => ({ key, label: key, tip: '', rows: ids.map(row) });
// Only the fields the rules read: three cards with one or two groups each.
const day = {
  cats: {
    kol: { cat: 'kol', label: 'Κωλυόμενοι', n: 2, groups: [group('a', [1, 2])] },
    away: { cat: 'away', label: 'Απόντες', n: 3, groups: [group('b', [3, 4]), group('c', [5])] },
    present: { cat: 'present', label: 'Παρόντες', n: 0, groups: [] },
  },
} as unknown as StrengthDay;

describe('strength view', () => {
  it('opens «Κωλυόμενοι» and «Απόντες», keeps the 100+ «Παρόντες» closed, in this order', () => {
    expect(SV_OPEN).toEqual({ kol: true, away: true, present: false });
    expect(SV_ORDER).toEqual(['kol', 'away', 'present']);
  });

  it('without a filter returns the groups of the day untouched', () => {
    const shown = filterStrength(day, null, '', false, state.settings);
    expect(shown.map((c) => [c.cat, c.shown])).toEqual([
      ['kol', 2],
      ['away', 3],
      ['present', 0],
    ]);
    expect(shown[1].groups).toBe(day.cats.away.groups);
  });

  it('a search keeps only the found people and drops groups left empty', () => {
    const shown = filterStrength(day, new Set([4, 5]), '', true, state.settings);
    expect(shown.map((c) => c.shown)).toEqual([0, 2, 0]);
    expect(shown[1].groups.map((g) => [g.key, g.rows.map((r) => r.p.id)])).toEqual([
      ['b', [4]],
      ['c', [5]],
    ]);
    expect(shown[0].groups).toEqual([]);
  });

  it('the platoon filter keeps the people of that platoon', () => {
    const unit = unitOf(state.people[0], state.settings);
    const shown = filterStrength(day, null, unit, true, state.settings);
    const ids = shown.flatMap((c) => c.groups.flatMap((g) => g.rows.map((r) => r.p.id)));
    expect(ids).toContain(1);
    expect(ids.every((id) => unitOf(state.people[id - 1], state.settings) === unit)).toBe(true);
  });

  it('shows all cards, or only the picked counter, and walks its people in screen order', () => {
    const shown = filterStrength(day, null, '', false, state.settings);
    expect(visibleCats(shown, '').map((c) => c.cat)).toEqual(['kol', 'away', 'present']);
    expect(visibleCats(shown, 'away').map((c) => c.cat)).toEqual(['away']);
    expect(visibleIds(shown, '')).toEqual([1, 2, 3, 4, 5]);
    expect(visibleIds(shown, 'away')).toEqual([3, 4, 5]);
  });

  it('a hand toggle wins over the picked counter, a search and the default', () => {
    expect(isCatOpen({}, 'present', '', null)).toBe(false);
    expect(isCatOpen({}, 'present', 'present', null)).toBe(true);
    expect(isCatOpen({}, 'present', '', new Set([1]))).toBe(true);
    expect(isCatOpen({ present: false }, 'present', 'present', null)).toBe(false);
    expect(isCatOpen({ kol: false }, 'kol', '', null)).toBe(false);
  });

  it('builds the cards from a real day', () => {
    const real = strengthView(state, '2026-11-10', 480);
    const shown = filterStrength(real, null, '', false, state.settings);
    expect(shown.map((c) => c.cat)).toEqual(SV_ORDER);
    expect(shown.reduce((n, c) => n + c.shown, 0)).toBe(real.absent + real.kol + real.present);
  });
});
