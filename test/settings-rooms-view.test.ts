// The pure rules of the «Θάλαμοι και ουλαμοί» card (pages/settings/model/roomsView.ts).
import { describe, expect, it } from 'vitest';
import {
  addPlatoon,
  freeRooms,
  num,
  peoplePerRoom,
  platoonProblem,
  removePlatoon,
  renamePlatoon,
  roomsBeyond,
  roomsDirty,
  roomsSave,
  storedRooms,
  toggleOutRoom,
  toggleRoom,
  trimOutRooms,
} from '../src/renderer/pages/settings/model/roomsView';
import { makePlatoons } from '../src/shared/domain';
import { fakeState } from './fixtures';

describe('rooms view', () => {
  it('clamps a typed number to 1..max', () => {
    expect([num('', 40), num('0', 40), num('7.9', 40), num('99', 40)]).toEqual([1, 1, 7, 40]);
  });

  it('moves a room to a platoon and takes it from the other; a second click frees it', () => {
    const pl = makePlatoons(8, 4);
    const moved = toggleRoom(pl, 1, 2);
    expect(moved.map((u) => u.rooms)).toEqual([
      [1, 3, 4],
      [2, 5, 6, 7, 8],
    ]);
    expect(toggleRoom(moved, 1, 2).map((u) => u.rooms)).toEqual([
      [1, 3, 4],
      [5, 6, 7, 8],
    ]);
    expect(freeRooms(8, toggleRoom(moved, 1, 2))).toEqual([2]);
  });

  it('adds, renames and removes platoons', () => {
    const pl = makePlatoons(8, 4);
    expect(addPlatoon(pl)[2]).toEqual({ name: '3ος Ουλαμός', rooms: [] });
    expect(renamePlatoon(pl, 0, 'Α')[0].name).toBe('Α');
    expect(removePlatoon(pl, 0)).toEqual([pl[1]]);
  });

  it('keeps the weekend out-rooms sorted and trims them to the room count', () => {
    const out = toggleOutRoom({ 6: [1, 3], 0: [5] }, 6, 2);
    expect(out[6]).toEqual([1, 2, 3]);
    expect(toggleOutRoom(out, 6, 2)[6]).toEqual([1, 3]);
    expect(trimOutRooms({ 6: [1, 9], 0: [8, 2] }, 8)).toEqual({ 6: [1], 0: [8, 2] });
  });

  it('refuses an empty or repeated platoon name', () => {
    expect(platoonProblem([{ name: ' ', rooms: [] }])).toBe('Κάθε ουλαμός θέλει όνομα.');
    expect(
      platoonProblem([
        { name: 'Χ', rooms: [] },
        { name: 'Χ ', rooms: [] },
      ]),
    ).toBe('Δύο ουλαμοί λέγονται «Χ».');
    expect(platoonProblem(makePlatoons(8, 4))).toBeNull();
  });

  it('counts soldiers per room and those beyond the last room', () => {
    const s = fakeState(6);
    const people = s.people.map((p, i) => ({ ...p, active: true, room: i < 2 ? 12 : 1 }));
    expect(roomsBeyond(people, 8).length).toBe(2);
    expect(peoplePerRoom(people).get(1)).toBe(4);
  });

  it('is dirty only when the form differs from the stored state; derived platoons are not saved', () => {
    const s = fakeState(3);
    const stored = storedRooms(s.settings, s.rules);
    expect(roomsDirty(stored, stored)).toBe(false);
    expect(roomsDirty({ ...stored, n: stored.n + 1 }, stored)).toBe(true);
    expect(roomsSave(stored).rooms).toEqual({ n: stored.n, per: stored.per });
    const own = roomsSave({ ...stored, pl: renamePlatoon(stored.pl, 0, 'Δικός') });
    expect(own.rooms.platoons?.[0].name).toBe('Δικός');
    expect(own.text.startsWith('θάλαμοι ' + stored.n + ', ουλαμοί Δικός (')).toBe(true);
  });
});
