// Rooms and platoons: the shape of Settings.rooms and how platoons are built from two numbers.
//
// Purpose: `RoomSettings`, `Platoon`, the default 8 rooms / 4 per platoon, `makePlatoons` and the short platoon name.
// Does NOT: read Settings (the selectors roomCfg / platoonsOf / unitOf are in settingsAccess.ts, which may import
//   Settings; this file may not, so that settings.ts can import these types without a cycle).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: platoons are derived from two numbers until the user edits the list by hand, and several outputs print them.
// @decision Michael 17/10: Settings › «Θάλαμοι και ουλαμοί»; default 8 rooms, 4 per platoon (Κ-18: 1–4 → 1ος,
//   5–8 → 2ος). If the user changes which rooms belong where, his own list (platoons) is kept until he rebuilds it.
// Covering tests: test/units.test.ts, test/room-extras-totals.test.ts.

/** A platoon («1ος Ουλαμός») and the rooms that belong to it. */
export interface Platoon {
  name: string;
  rooms: number[];
}
/** n rooms, per rooms in each platoon; platoons: the user's own list (overrides the derived one). */
export interface RoomSettings {
  n: number;
  per: number;
  platoons?: Platoon[];
}
export const DEFAULT_ROOMS: RoomSettings = { n: 8, per: 4 };
/** Platoons from the two numbers: rooms 1..n in groups of `per` (at least 1), named «1ος Ουλαμός», «2ος Ουλαμός»… */
export function makePlatoons(n: number, per: number): Platoon[] {
  const out: Platoon[] = [];
  const k = Math.max(1, per);
  for (let r = 1; r <= n; r += k)
    out.push({
      name: out.length + 1 + 'ος Ουλαμός',
      rooms: Array.from({ length: Math.min(k, n - r + 1) }, (_, i) => r + i),
    });
  return out;
}
/** «1ος Ουλαμός» → «1ος Ουλ.» (in lists and filters). */
export const platoonShort = (name: string) => name.replace(/Ουλαμός$/, 'Ουλ.');
