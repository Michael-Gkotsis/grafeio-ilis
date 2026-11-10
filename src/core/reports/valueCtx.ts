// The measuring context of the values tables: one day, one moment, and what is computed once.
//
// Purpose: `VCtx` / `vctx` (the context and its memo), the sets of people (`VSet`, `personKey`, `union`, `minus`)
//   and the expensive views every measure shares (strength, ΗΚΑΙ, weapons, statuses, cadres).
// Does NOT: define a measure (metricDefs.ts, metrics.ts) or compute a total (valueEval.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model, core/duty,
//   core/weapons.
// Why: no measure is rewritten here: each one calls the same counter as its own screen, and the counters are costly,
//   so they are computed once per context and shared by all the rows.
// Covering tests: test/values.test.ts, test/note-only.test.ts.
import type { ISODate } from '../lib/dates';
import { TYPE_KEYS } from '../model/status';
import type { AppState } from '../model/state';
import type { Person } from '../model/person';
import { activePeople, cadreSeats, seatMap } from '../duty/indexes';
import { statusesFrom } from '../duty/statuses';
import { hkaiCounts } from '../duty/hkaiCount';
import { kolView } from '../duty/kolyomenoi';
import { statusesAt, strengthOf } from '../duty/presence';
import { weaponInfo } from '../weapons/weaponInfo';
import { hmOf } from '../weapons/armed';

/**
 * The measuring context: the state, the day, the moment and `memo`, where whatever is expensive to compute (strength,
 * ΗΚΑΙ, weapons…) is kept once for all the rows.
 */
export interface VCtx {
  s: AppState;
  d: ISODate;
  at: number;
  today: ISODate;
  memo: Map<string, unknown>;
}
/** A fresh context for state `s`, day `d`, moment `at` (minutes) and `today`. */
export const vctx = (s: AppState, d: ISODate, at: number, today: ISODate = d): VCtx => ({
  s,
  d,
  at,
  today,
  memo: new Map(),
});
/** Computes `f` once per context and key `k`. */
export const memo = <T>(c: VCtx, k: string, f: () => T): T => {
  if (!c.memo.has(k)) c.memo.set(k, f());
  return c.memo.get(k) as T;
};
/** A set of person keys (see `personKey`). */
export type VSet = Set<string>;
/** The key of a person in a set: 'p12' for a soldier, 'c' + the id for a cadre. */
export const personKey = (p: Pick<Person, 'id' | 'cid'>) => (p.cid ? 'c' + p.cid : 'p' + p.id);
/** The keys of some people as a set. */
export const keys = (ps: Iterable<Pick<Person, 'id' | 'cid'>>): VSet => {
  const o = new Set<string>();
  for (const p of ps) o.add(personKey(p));
  return o;
};
/** The union of sets: each person once. */
export const union = (...l: VSet[]): VSet => {
  const o = new Set<string>();
  for (const x of l) x.forEach((k) => o.add(k));
  return o;
};
/** The set `a` without the people in `b`. */
export const minus = (a: VSet, b: VSet): VSet => {
  const o = new Set<string>();
  a.forEach((k) => {
    if (!b.has(k)) o.add(k);
  });
  return o;
};
/** The strength of the context (kept in the memo). */
export const stg = (c: VCtx) => memo(c, 'stg', () => strengthOf(c.s, c.d, c.at));
/** The prevented-from-duty view of the context (kept in the memo). */
export const kol = (c: VCtx) => memo(c, 'kol', () => kolView(c.s, c.d, c.at));
/** The ΗΚΑΙ counts of the context (kept in the memo). */
export const hk = (c: VCtx) => memo(c, 'hk', () => hkaiCounts(c.s, c.d));
/** True when the context is for today: then the real moment counts. */
const live = (c: VCtx) => c.d === c.today;
/** The weapon info of the context (kept in the memo); for today at its moment. */
export const winfo = (c: VCtx) => memo(c, 'w', () => weaponInfo(c.s, c.d, live(c) ? hmOf(c.at) : undefined));
/** The soldiers and the cadres in a post (kept in the memo). */
export const armPpl = (c: VCtx) => memo(c, 'arm', () => [...c.s.people, ...cadreSeats(c.s)]);
/** Everyone in the strength: the active soldiers. */
export const total = (c: VCtx) => memo(c, 'total', () => keys(activePeople(c.s)));
/** The soldiers who are away, in any of the away lists of the strength. */
export const away = (c: VCtx) =>
  memo(c, 'away', () => {
    const g = stg(c);
    return keys(TYPE_KEYS.flatMap((k) => g.awayLists[k]));
  });
/** The soldiers the strength removes because they are prevented (declared). */
export const kolMinus = (c: VCtx) => memo(c, 'kolm', () => keys(kol(c).minus.map((x) => x.p)));
/** The ids of the unarmed, from the weapon info. */
export const unarmedSet = (c: VCtx) => winfo(c).unarmed;
/** The cadres in the strength. */
export const cadreActive = (c: VCtx) => (c.s.cadreList || []).filter((x) => x.active);
/** The cadres counted in the given ΗΚΑΙ columns, as keys. */
export const cadreKeys = (c: VCtx, cols: string[]): VSet => {
  const h = hk(c);
  const o = new Set<string>();
  for (const col of cols) for (const x of h.cadre[col] || []) o.add('c' + x.id);
  return o;
};
/** The person of a post (soldier or cadre) from the number of the duty, as a key; null when nobody holds it. */
const seatKey = (c: VCtx, pid: number): string | null => {
  const p = memo(c, 'seats', () => seatMap(c.s)).get(pid);
  return p ? personKey(p) : null;
};
/** The keys of the people on these duty numbers. */
export const pidKeys = (c: VCtx, pids: number[]): VSet => {
  const o = new Set<string>();
  for (const pid of pids) {
    const k = seatKey(c, pid);
    if (k) o.add(k);
  }
  return o;
};
/**
 * The statuses from the moment on of every active soldier, with the notes.
 * @decision Michael 4/11: «Μόνο σημείωση»: the measure `med.kind:<name>` is the explicit opt-in and also sees the
 *   notes; the others do not.
 */
export const ssRaw = (c: VCtx) =>
  memo(
    c,
    'ssr',
    () => new Map(activePeople(c.s).map((p) => [p.id, statusesFrom(c.s.statuses, p.id, c.d, c.at)] as const)),
  );
/** The statuses of every active soldier as the strength counts them at the moment. */
export const ssAll = (c: VCtx) =>
  memo(c, 'ss', () => new Map(activePeople(c.s).map((p) => [p.id, statusesAt(c.s, p.id, c.d, c.at)] as const)));
