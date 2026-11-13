// The pure rules of the «Οπλισμός» page (pages/weapons/model/view.ts): normalisers, sort, rows, empty texts, save
// messages, commit warnings and the changes a pasted column makes.
import { describe, expect, it } from 'vitest';
import {
  LBL,
  NORM,
  commitRack,
  commitWpos,
  dtCell,
  emptyText,
  filterCounts,
  pasteSeatsPlan,
  pasteWeaponsPlan,
  roomCounts,
  rowSorter,
  saveMessage,
  weaponNotes,
  weaponPlace,
  weaponRows,
} from '../src/renderer/pages/weapons/model/view';
import { weaponInfo } from '../src/shared/weapons';
import { fakeState } from './fixtures';

const state = fakeState(12);
const people = state.people.map((p, i) => ({
  ...p,
  active: true,
  room: 1 + (i % 3),
  weapon: i < 6 ? String(100 + i) : '',
}));
const info = weaponInfo({ ...state, people }, '2026-11-02');
const rowsOf = (over: object = {}) =>
  weaponRows({
    people,
    place: () => true,
    filter: 'all',
    info,
    dq: '',
    reasonF: '',
    onlySel: false,
    sel: new Set<number>(),
    sort: { k: 'room', dir: 1 },
    ...over,
  });

describe('weapons page view', () => {
  it('names and normalises the three fields', () => {
    expect(Object.keys(NORM)).toEqual(['weapon', 'rack', 'wpos']);
    expect(LBL.weapon).toBe('Αριθμός όπλου');
    expect(NORM.weapon(' 12 ')).toBe('12');
  });

  it('sorts by weapon with the empty ones last and flips with the direction', () => {
    const up = rowsOf({ sort: { k: 'weapon', dir: 1 } }).map((p) => p.weapon || '');
    expect(up.slice(0, 6)).toEqual(['100', '101', '102', '103', '104', '105']);
    expect(up.slice(6).every((w) => !w)).toBe(true);
    const down = rowsOf({ sort: { k: 'weapon', dir: -1 } }).map((p) => p.weapon || '');
    expect(down.slice(0, 6)).toEqual(['105', '104', '103', '102', '101', '100']);
    expect(rowSorter({ k: 'room', dir: 1 })(people[0], people[0])).toBe(0);
  });

  it('shows only the ticked people when asked, and filters by the place', () => {
    expect(
      rowsOf({ onlySel: true, sel: new Set([2, 3]) })
        .map((p) => p.id)
        .sort(),
    ).toEqual([2, 3]);
    expect(rowsOf({ place: (p: { room?: number | null }) => p.room === 1 }).every((p) => p.room === 1)).toBe(true);
  });

  it('counts the filters and the rooms', () => {
    const counts = filterCounts(people, () => true, info);
    expect(counts.all).toBe(12);
    expect(counts.with).toBe(6);
    expect(roomCounts(people)).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
    ]);
    expect(weaponPlace(people[0], 'all', 2, state.settings)).toBe(false);
    expect(weaponPlace(people[0], 'all', null, state.settings)).toBe(true);
  });

  it('writes one empty text per filter', () => {
    expect(emptyText('all', '2026-11-02', '2026-11-02')).toBe('Δεν υπάρχει κανείς σε δύναμη.');
    expect(emptyText('out', '2026-11-02', '2026-11-02')).toBe('Κανείς δεν είναι εκτός οπλοβαστού τώρα.');
    expect(emptyText('out', '2026-11-03', '2026-11-02')).toBe('Κανείς δεν είναι εκτός οπλοβαστού 03/11.');
  });

  it('words the toast of a save', () => {
    expect(saveMessage([{ pid: 1, weapon: '' }], people)).toMatch(/: χωρίς όπλο$/);
    expect(saveMessage([{ pid: 1, weapon: '77' }], people)).toMatch(/: όπλο 77$/);
    expect(saveMessage([{ pid: 1, wtype: 'G3' }], people)).toMatch(/: τύπος G3$/);
    expect(
      saveMessage(
        [
          { pid: 1, wtype: 'G3' },
          { pid: 2, wtype: 'G3' },
        ],
        people,
      ),
    ).toBe('Οπλισμός: 2 άτομα');
  });

  it('warns when a seat is already taken', () => {
    const a = { ...people[0], rack: 'Ε1', wpos: '1' };
    const b = { ...people[1], rack: 'Ε1', wpos: '2' };
    const inf = weaponInfo({ ...state, people: [a, b, ...people.slice(2)] }, '2026-11-02');
    expect(commitWpos(inf, b, '1').warn).toContain('είναι και του');
    expect(commitWpos(inf, b, '3').warn).toBeUndefined();
    expect(commitRack(inf, { ...b, weapon: '9', wpos: '' }, 'Ε2').warn).toBe('χωρίς θέση: γράψε και τη Θέση.');
  });

  it('plans a pasted column from the row down and reports the leftovers', () => {
    const rows = rowsOf();
    const seats = pasteSeatsPlan(['a', 'b', 'c'], rows, rows.length - 2, 'rack');
    expect(seats.changes).toHaveLength(2);
    expect(seats.warn).toBe('1 περίσσεψαν (δεν υπάρχουν άλλες γραμμές)');
    const w = pasteWeaponsPlan(['100', '100'], rows, 0, people);
    expect(w.changes.map((c) => c.weapon)).toEqual(['100', '100']);
    expect(w.warn).toContain('σε δύο ή περισσότερους');
    expect(w.msg).toMatch(/^Επικόλληση: 2 αριθμοί όπλων από /);
  });

  it('shows one badge per remark and a «⚠ n» summary for two or more', () => {
    const pm = new Map(people.map((p) => [p.id, p]));
    const dup = people.map((p, i) => (i < 2 ? { ...p, weapon: '555', active: i === 0 } : p));
    const inf = weaponInfo({ ...state, people: dup }, '2026-11-02');
    const n = weaponNotes(dup[0], inf, state.settings.lists, pm, [], '2026-11-02');
    expect(n.items.map((x) => x.tone)).toContain('bad');
    const gone = weaponNotes(dup[1], inf, state.settings.lists, pm, [], '2026-11-02');
    expect(gone.summary?.count).toBe(gone.items.length);
    expect(dtCell('2026-11-02', '08:00', '2026-11-05')).toBe('02/11 08:00');
    expect(dtCell('2025-11-02', '08:00', '2026-11-05')).toBe('02/11/2025 08:00');
  });
});
