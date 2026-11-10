// The random draw of a report: pick, keep, replace and refill.
//
// Purpose: `pickRandom` (n random ones, evenly per room if asked), `keepDraw`, `replaceOne`, `drawRows`,
//   `refillDraw` and `recentIds` (who came out lately).
// Does NOT: decide who is a candidate (candidates.ts); the draw is made on the screen, never while writing the
//   Excel.
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model,
//   core/reports/rowTypes.
// Why: the draw is made once on the screen and the form that comes out is the one the user saw, so every step that
//   changes it is a pure function of the rows, `n` and a random source.
// Covering tests: test/reports-flow.test.ts, test/reports-keepdraw.test.ts, test/reports-sheets.test.ts,
//   test/reports.test.ts.
import { addDays, type ISODate } from '../lib/dates';
import type { Person } from '../model/person';
import type { Row } from './rowTypes';

// A shuffled copy of the list (`rnd`: Math.random in the app, a fixed one in the tests)
function shuffle<X>(a: X[], rnd: () => number): X[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
// times: how many times each one came out in this form («Πρώτα όσοι βγήκαν λιγότερες φορές»): the fewest first, random
// among those with the same (the sort keeps the order of the shuffled list)
function ordered<X extends Row>(a: X[], rnd: () => number, times?: Record<string, number>): X[] {
  const x = shuffle(a, rnd);
  return times ? x.sort((p, q) => (times[p.id] || 0) - (times[q.id] || 0)) : x;
}
/**
 * `n` random ones from the list. `even`: evenly from every room (those missing from a room are filled from the
 * others). `rnd`: for the tests (Math.random). `times`: see `ordered`.
 */
export function pickRandom<T extends Row>(
  list: T[],
  n: number,
  even = false,
  rnd: () => number = Math.random,
  times?: Record<string, number>,
): T[] {
  n = Math.max(0, Math.min(n, list.length));
  if (!even) return ordered(list, rnd, times).slice(0, n);
  const groups = new Map<string, T[]>();
  for (const x of list) {
    const g = String((x as Person).room ?? '—');
    const l = groups.get(g);
    if (l) l.push(x);
    else groups.set(g, [x]);
  }
  const gs = shuffle(
    [...groups.values()].map((g) => ordered(g, rnd, times)),
    rnd,
  );
  const out: T[] = [];
  const at = gs.map(() => 0);
  // round robin: one from each room in turn until n are reached (rooms that ran out are skipped)
  while (out.length < n)
    gs.forEach((g, i) => {
      if (out.length < n && at[i] < g.length) out.push(g[at[i]++]);
    });
  return out;
}
/**
 * The draw the user already saw (e.g. in the guide, with the changes made with ✕), again from the current candidates.
 * null if someone no longer passes the filters: then a new draw is made. `more`: those added by name (they may not
 * pass the filters).
 */
export function keepDraw(pool: Row[], ids: (number | string)[], more: Row[] = []): Row[] | null {
  const by = new Map([...more, ...pool].map((x) => [x.id, x]));
  const got: Row[] = [];
  for (const id of ids) {
    const x = by.get(id);
    if (!x) return null;
    got.push(x);
  }
  return got;
}
/**
 * Another random one in the place of `i` (from those not already in, those who came out fewer times first); null:
 * there is no other.
 */
export function replaceOne<T extends Row>(
  picked: T[],
  i: number,
  pool: T[],
  rnd: () => number = Math.random,
  times?: Record<string, number>,
): T[] | null {
  const ids = new Set(picked.map((x) => x.id));
  let rest = pool.filter((x) => !ids.has(x.id));
  if (!rest.length) return null;
  if (times) {
    const min = Math.min(...rest.map((x) => times[x.id] || 0));
    rest = rest.filter((x) => (times[x.id] || 0) === min);
  }
  const nx = [...picked];
  nx[i] = rest[Math.floor(rnd() * rest.length)];
  return nx;
}
/** Draw: the «always in» ones and random ones until `n` are reached. */
export function drawRows(
  always: Row[],
  pool: Row[],
  n: number,
  even = false,
  rnd: () => number = Math.random,
  times?: Record<string, number>,
): Row[] {
  const ids = new Set(always.map((x) => x.id));
  return [
    ...always,
    ...pickRandom(
      pool.filter((x) => !ids.has(x.id)),
      Math.max(0, n - always.length),
      even,
      rnd,
      times,
    ),
  ];
}
/** When the filters or the count change, the draw keeps those who still pass and fills (or cuts) up to `n`. */
export function refillDraw(
  prev: Row[],
  always: Row[],
  pool: Row[],
  n: number,
  even = false,
  rnd: () => number = Math.random,
  times?: Record<string, number>,
): Row[] {
  const by = new Map(pool.map((x) => [x.id, x]));
  const aIds = new Set(always.map((x) => x.id));
  const kept = [...always, ...prev.filter((x) => !aIds.has(x.id) && by.has(x.id)).map((x) => by.get(x.id)!)].slice(
    0,
    Math.max(n, always.length),
  );
  const used = new Set(kept.map((x) => x.id));
  return [
    ...kept,
    ...pickRandom(
      pool.filter((x) => !used.has(x.id)),
      Math.max(0, n - kept.length),
      even,
      rnd,
      times,
    ),
  ];
}
/** Those who came out in this form in the `gap` days before `d` (the history keeps who, and for which day). */
export function recentIds(
  hist: { date: ISODate; ids: (number | string)[] }[],
  d: ISODate,
  gap: number,
): Set<number | string> {
  const from = addDays(d, -Math.max(0, gap));
  const out = new Set<number | string>();
  for (const h of hist) if (h.date < d && h.date >= from) h.ids.forEach((i) => out.add(i));
  return out;
}
