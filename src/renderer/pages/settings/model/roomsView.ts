// Pure rules of the «Θάλαμοι και ουλαμοί» card: counts, platoon edits, what is stored and what a save writes.
// Purpose: `roomsView` helpers for `useRooms` and their test.
// Does NOT: render anything, touch React or call `run` (model/useRooms.ts does).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/units.ts (Phase 6) so the rules are testable
//   without a render.
// Covering test: test/settings-rooms-view.test.ts.
import type { AppState, Person, Platoon, RoomSettings } from '../../../../shared/domain';
import { makePlatoons, platoonsOf, roomCfg } from '../../../../shared/domain';

/** The two weekend days that have their own out-rooms: 6 = Saturday, 0 = Sunday (JS weekday numbers). */
export type OutDay = 6 | 0;
/** Rooms that go out on each weekend day (Κ-16). */
export type OutRooms = Record<OutDay, number[]>;
/** Everything the card lets you edit. */
export interface RoomsForm {
  n: number;
  per: number;
  pl: Platoon[];
  out: OutRooms;
}

/** Most rooms the number box accepts. */
export const MAX_ROOMS = 40;
/** 1..n. */
export const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
/** Same platoons, names and rooms in the same order. */
export const same = (a: Platoon[], b: Platoon[]) => JSON.stringify(a) === JSON.stringify(b);
/** «1, 2, 3», or «κανένας» for no room (text of the history line). */
export const roomsTxt = (r: number[]) => (r.length ? r.join(', ') : 'κανένας');
/** A number box value as a whole number in 1..max (empty or invalid = 1). */
export const num = (v: string, max: number) => Math.min(max, Math.max(1, Math.floor(+v || 1)));

/**
 * Click on a room chip of platoon `i`: the room goes to that platoon (leaving whichever had it); a room that already
 * belongs there is left without a platoon.
 */
export const toggleRoom = (pl: Platoon[], i: number, r: number): Platoon[] =>
  pl.map((u, j) => ({
    ...u,
    rooms:
      j === i
        ? u.rooms.includes(r)
          ? u.rooms.filter((x) => x !== r)
          : [...u.rooms, r].sort((a, b) => a - b)
        : u.rooms.filter((x) => x !== r),
  }));
/** Platoon `i` gets a new name. */
export const renamePlatoon = (pl: Platoon[], i: number, name: string): Platoon[] =>
  pl.map((u, j) => (j === i ? { ...u, name } : u));
/** One more platoon, without rooms («3ος Ουλαμός»). */
export const addPlatoon = (pl: Platoon[]): Platoon[] => [...pl, { name: pl.length + 1 + 'ος Ουλαμός', rooms: [] }];
/** Platoon `i` removed (its rooms stay without a platoon). */
export const removePlatoon = (pl: Platoon[], i: number): Platoon[] => pl.filter((_, j) => j !== i);
/** Room `r` added to or removed from the out-rooms of day `d`, kept sorted. */
export const toggleOutRoom = (out: OutRooms, d: OutDay, r: number): OutRooms => ({
  ...out,
  [d]: out[d].includes(r) ? out[d].filter((x) => x !== r) : [...out[d], r].sort((a, b) => a - b),
});
/** Out-rooms without the rooms above the new room count `n`. */
export const trimOutRooms = (o: OutRooms, n: number): OutRooms => ({
  6: o[6].filter((r) => r <= n),
  0: o[0].filter((r) => r <= n),
});
/** Rooms 1..n that belong to no platoon. */
export const freeRooms = (n: number, pl: Platoon[]) => range(n).filter((r) => !pl.some((u) => u.rooms.includes(r)));
/** Soldiers in service whose room is above `n` (it no longer exists). */
export const roomsBeyond = (people: Person[], n: number) =>
  people.filter((p: Person) => p.active && p.room != null && p.room > n);
/** Soldiers in service per room number. */
export const peoplePerRoom = (people: Person[]): Map<number, number> =>
  people.reduce((m: Map<number, number>, p: Person) => {
    if (p.active && p.room != null) m.set(p.room, (m.get(p.room) || 0) + 1);
    return m;
  }, new Map<number, number>());
/** Why the platoons cannot be saved (an empty or repeated name), or `null`. */
export function platoonProblem(pl: Platoon[]): string | null {
  const names = pl.map((u) => u.name.trim());
  const dupName = names.find((x, i) => x && names.indexOf(x) !== i);
  return names.some((x) => !x)
    ? 'Κάθε ουλαμός θέλει όνομα.'
    : dupName
      ? 'Δύο ουλαμοί λέγονται «' + dupName + '».'
      : null;
}
/** The stored out-rooms as a fresh copy the form can change. */
export const outRoomsOf = (rules: AppState['rules']): OutRooms => ({
  6: [...(rules.outRooms[6] || [])],
  0: [...(rules.outRooms[0] || [])],
});
/** What is stored now: the form is compared with it (the «Δεν αποθηκεύτηκαν» bar and the question before leaving). */
export const storedRooms = (settings: AppState['settings'], rules: AppState['rules']): RoomsForm => {
  const cfg = roomCfg(settings);
  return {
    n: cfg.n,
    per: cfg.per,
    pl: platoonsOf(settings),
    out: outRoomsOf(rules),
  };
};
/** The form differs from what is stored. */
export const roomsDirty = (form: RoomsForm, stored: RoomsForm) => JSON.stringify(form) !== JSON.stringify(stored);
/**
 * The `setSettings` payload and history text of a save: platoons are kept only when they differ
 * from the derived ones.
 */
export function roomsSave(form: RoomsForm): { rooms: RoomSettings; text: string } {
  const { n, per, pl } = form;
  const clean = pl.map((u) => ({ name: u.name.trim().replace(/\s+/g, ' '), rooms: u.rooms }));
  const rooms: RoomSettings = { n, per, ...(same(clean, makePlatoons(n, per)) ? {} : { platoons: clean }) };
  return {
    rooms,
    text: 'θάλαμοι ' + n + ', ουλαμοί ' + clean.map((u) => u.name + ' (' + roomsTxt(u.rooms) + ')').join(', '),
  };
}
