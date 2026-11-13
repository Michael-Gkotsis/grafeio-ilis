// The pure rules of the «Δυναμολόγιο» screen (pages/people/model/view.ts): columns, grid, sort, counts, texts.
import { describe, expect, it } from 'vitest';
import {
  BASE_KINDS,
  COLS,
  COL_W,
  COL_WN,
  DEF_SORT,
  HEAD_KEYS,
  NARROW_HIDE,
  ariaSort,
  cardLine,
  chipTip,
  colsOf,
  countFilters,
  filterLabel,
  gridOf,
  inPlace,
  legacyMatch,
  longTip,
  nextSort,
  passesFilter,
  peopleSub,
  roomCounts,
  sortArrow,
  sortRows,
  statusMap,
  stTxt,
} from '../src/renderer/pages/people/model/view';
import type { Person, Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-12';
const people = (): Person[] => fakeState(12).people;

describe('people page view: columns and grid', () => {
  it('keeps every column, and drops father and phone (room becomes «Θάλ.») when narrow', () => {
    expect(colsOf(false)).toBe(COLS);
    expect(COLS.map(([k]) => k)).toEqual([
      'rank',
      'spec',
      'last',
      'first',
      'father',
      'asm',
      'phone',
      'room',
      'post',
      'role',
      'si',
      'dn',
    ]);
    const narrow = colsOf(true);
    expect(narrow.map(([k]) => k)).toEqual(COLS.map(([k]) => k).filter((k) => !NARROW_HIDE.includes(k)));
    expect(narrow.find(([k]) => k === 'room')?.[1]).toBe('Θάλ.');
    expect(HEAD_KEYS).toEqual(['rank', 'spec', 'last', 'first', 'father']);
  });

  it('builds the grid: number column, head columns, optional status column, tail columns, min width', () => {
    const [wide, wideMin] = gridOf(false, false);
    expect(wide.split(' ')[0]).toBe('44px');
    expect(wide.split(' ')).toHaveLength(1 + COLS.length);
    expect(wideMin).toBe(44 + Object.values(COL_W).reduce((a, [, w]) => a + w, 0) + 18);
    const [withSt, withStMin] = gridOf(false, true);
    expect(withSt.split(' ')[6]).toBe('minmax(220px,1.6fr)');
    expect(withStMin).toBe(wideMin + 220);
    const [narrow, narrowMin] = gridOf(true, false);
    expect(narrow.split(' ')[0]).toBe('38px');
    expect(narrowMin).toBe(38 + Object.values(COL_WN).reduce((a, [, w]) => a + w, 0) + 18);
  });
});

describe('people page view: sort', () => {
  it('sorts by last name by default, flips and restarts on a heading click', () => {
    expect(DEF_SORT).toEqual({ k: 'last', dir: 1 });
    expect(nextSort(DEF_SORT, 'last')).toEqual({ k: 'last', dir: -1 });
    expect(nextSort(DEF_SORT, 'first')).toEqual({ k: 'first', dir: 1 });
    expect(ariaSort(DEF_SORT, 'last')).toBe('ascending');
    expect(ariaSort({ k: 'last', dir: -1 }, 'last')).toBe('descending');
    expect(ariaSort(DEF_SORT, 'first')).toBe('none');
    expect(sortArrow(DEF_SORT, 'last')).toBe(' ▲');
    expect(sortArrow({ k: 'last', dir: -1 }, 'last')).toBe(' ▼');
    expect(sortArrow(DEF_SORT, 'first')).toBe('');
  });

  it('orders rows both ways and keeps the search order on the default sort', () => {
    const list = people();
    const up = sortRows(list, DEF_SORT, false).map((p) => p.last);
    expect(sortRows(list, { k: 'last', dir: -1 }, false).map((p) => p.last)).toEqual([...up].reverse());
    expect(sortRows(list, DEF_SORT, true)).toBe(list);
    const byRoom = sortRows(list, { k: 'room', dir: 1 }, true);
    expect(byRoom.map((p) => p.room ?? 99)).toEqual([...byRoom.map((p) => p.room ?? 99)].sort((a, b) => a - b));
    expect(list.map((p) => p.id)).toEqual(people().map((p) => p.id));
  });

  it('puts the soldiers with ΔΝ first when sorted by ΔΝ upwards', () => {
    const list = people().map((p, i) => ({ ...p, dn: i % 3 === 0 }));
    const rows = sortRows(list, { k: 'dn', dir: 1 }, false);
    expect(rows.findIndex((p) => !p.dn)).toBe(list.filter((p) => p.dn).length);
  });
});

describe('people page view: filters and counts', () => {
  const state = fakeState(12);
  const away: Status = { id: 's1', pid: state.people[0].id, type: 'LEAVE', from: D, to: D };

  it('maps every active person to his statuses of the day', () => {
    const active = state.people.filter((p) => p.active);
    const ss = statusMap(active, state, D, '2026-10-01', -1);
    expect([...ss.keys()]).toEqual(active.map((p) => p.id));
  });

  it('counts each quick filter inside the chosen place only', () => {
    const ss = new Map<number, Status[]>(state.people.map((p) => [p.id, []]));
    const all = countFilters(state.people, ss, () => true);
    expect(all.all).toBe(state.people.filter((p) => p.active).length);
    expect(countFilters(state.people, ss, () => false)).toEqual({});
  });

  it('matches old saved filters (present / absent / a status type)', () => {
    expect(legacyMatch('present', [], undefined)).toBe(true);
    expect(legacyMatch('absent', [], undefined)).toBe(false);
    expect(legacyMatch('zzz', [], undefined)).toBe(true);
    expect(legacyMatch('LEAVE', [away], undefined)).toBe(true);
    expect(legacyMatch('LEAVE', [], undefined)).toBe(false);
  });

  it('checks the place (platoon and room) and then the filter', () => {
    const p = { ...state.people[0], room: 3 } as Person;
    expect(inPlace(p, { unit: 'all', room: null, filter: 'all' }, () => '1ος')).toBe(true);
    expect(inPlace(p, { unit: '2ος', room: null, filter: 'all' }, () => '1ος')).toBe(false);
    expect(inPlace(p, { unit: 'all', room: 4, filter: 'all' }, () => '1ος')).toBe(false);
    expect(passesFilter(p, 'all', [], undefined)).toBe(true);
    expect(passesFilter({ ...p, active: false }, 'present', [], undefined)).toBe(false);
  });

  it('counts the active soldiers of every used room, by room number', () => {
    const rooms = roomCounts(people().map((p, i) => ({ ...p, room: i % 2 ? 2 : 1 })));
    expect(rooms).toEqual([
      [1, 6],
      [2, 6],
    ]);
  });
});

describe('people page view: texts', () => {
  it('writes the status text with the open end, a range and a single day', () => {
    const base: Status = { id: 's1', pid: 1, type: 'SICK', from: '2026-10-12', to: '2026-10-12' };
    expect(stTxt(base)).toMatch(/ · 12\/10$/);
    expect(stTxt({ ...base, to: '2026-10-15' })).toMatch(/ · 12\/10–15\/10$/);
    expect(stTxt({ ...base, open: true })).toMatch(/ · 12\/10 – χωρίς λήξη$/);
  });

  it('labels filters and tips', () => {
    expect(filterLabel('leave')).toBe('Άδειες');
    expect(filterLabel('old-one')).toBe('old-one');
    expect(chipTip('leave', '')).toBe('Σε άδεια σήμερα');
    expect(chipTip('pun', 'Αύριο 13/10')).toBe('Με ποινή αύριο 13/10');
    expect(chipTip('all', '')).toBeUndefined();
    expect(longTip('0123456789')).toBe('0123456789');
    expect(longTip('012345678')).toBeUndefined();
    expect(longTip(undefined)).toBeUndefined();
    expect(peopleSub(240)).toMatch(/: 240 άτομα\. Πάτα ένα όνομα για την καρτέλα του\.$/);
  });

  it('writes the one-line card details, skipping what is empty', () => {
    const p = { ...people()[0], father: 'ΓΙΩΡΓΟΣ', phone: '', post: 'ΚΟΥΖΙΝΑ', dn: true, si: '' } as Person;
    const line = cardLine(p, undefined);
    expect(line).toContain('του ΓΙΩΡΓΟΣ');
    expect(line).toContain('πόστο ΚΟΥΖΙΝΑ');
    expect(line.endsWith('ΔΝ')).toBe(true);
    expect(line).not.toContain(' ·  · ');
  });

  it('lists the kinds of the old services', () => {
    expect(BASE_KINDS).toEqual(['th', 'op', 'sk', 'mg', 'ly', 'tae', 'other']);
  });
});
