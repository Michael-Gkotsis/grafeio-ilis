// Rotation of the services (Michael, 18/10) and the candidate list of a post.
//
// Purpose: `candidates` (everybody allowed in a post, in the order the auto-fill would pick), `rotate` (the one who
//   owes this type of service most), `allowedOn`, `turnOrder`.
// Does NOT: fill a whole day (autofill.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: Nobody does the same type of service twice while someone else who is available has not done it yet.
// Covering tests: test/rotation.test.ts, test/duty-fairness.test.ts, test/duty-fuzz.test.ts.
import type { ISODate } from '../lib/dates';
import { dutyType } from './capability';
import { guardUnavailable } from './dutyCheck';
import { type Fair, fairCompare, fairKey } from './fairness';
import { armedLeft, armedNeeded, heldBack } from './holdBack';
import { isHol } from './holidays';
import { lastResort, statusWarn } from './leaveHours';
import { postsOf } from './posts';
import type { Post } from '../model/duty';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import { live } from '../people/kinds';

type Cand = { p: Person; key: number; f: Fair & { pid: number } };

// Everybody in the fairness order without the kind of the post (the ones who owe a weekend last): once per fill.
function allowedOn(
  s: AppState,
  date: ISODate,
  y: Post,
  people: Person[],
  fixed: Set<number>,
  idx: Map<number, Set<ISODate>>,
  memo: Map<string, number[]>,
): number[] {
  let l = memo.get(y.k);
  if (!l) {
    l = people
      .filter((p) => !fixed.has(p.id) && !(y.kind === 'ly' && p.post) && !guardUnavailable(s, date, p.id, y.k, idx))
      .map((p) => p.id);
    memo.set(y.k, l);
  }
  return l;
}

const turnCache = new WeakMap<object, number[]>();

// The people who enter somewhere today, in the fairness order (without the kind of the post).
function turnOrder(
  s: AppState,
  date: ISODate,
  fair: Map<number, Fair & { pid: number }>,
  due: Set<number> | null,
): number[] {
  let o = turnCache.get(fair);
  if (!o) {
    const cmp = fairCompare(isHol(s.settings, date), '', date);
    const owes = (pid: number) => (due?.has(pid) ? 1 : 0);
    o = [...fair.values()].sort((a, b) => owes(a.pid) - owes(b.pid) || cmp(a, b)).map((f) => f.pid);
    turnCache.set(fair, o);
  }
  return o;
}

// Rotation of the services: «να μην κάνει κάποιος τον ίδιο τύπο υπηρεσίας εάν υπάρχει κάποιος διαθέσιμος άλλος που δεν
// έχει κάνει, ώστε να περνάνε όλοι οι διαθέσιμοι από όλες τις υπηρεσίες και μετά να ξανακάνουν την ίδια όταν έρθει η
// ώρα τους».
// Who enters today is judged by the fairness order as before (holidays, weekends that are owed, days without duty,
// total): «their turn» = the first in the order among the ones who can enter somewhere today, as many as the empty
// posts of the day. Among them the post goes to whoever did this type of service the fewest times. It counts only among
// the ones who enter the post (Ποιος κάνει τι, Σ.Ι., statuses, rules): whoever does not do it does not «owe» it. The
// ones whose turn it is and who fit in no other empty post stay first, so that they do not stay without duty today. The
// priorities of the list (last resort, armed reserve, weekends that are owed) do not change.
// @decision Michael 18/10: rotation of the services.
function rotate(
  s: AppState,
  date: ISODate,
  x: Post,
  list: Cand[],
  people: Person[],
  fair: Map<number, Fair & { pid: number }>,
  idx: Map<number, Set<ISODate>>,
  fixed: Set<number>,
  due: Set<number> | null,
  memo = new Map<string, number[]>(),
): Cand[] {
  if (s.rules.rotate === false || list.length < 2) return list;
  const g = s.guards[date] || {};
  const busy = new Set(Object.values(g));
  const open = postsOf(s.settings).filter((y) => !g[y.k] && y.k !== x.k);
  const ty = dutyType(s, x.k, x.kind);
  const byTy = new Map<string, Set<number>>(); // the other types of service with an empty post today -> who enters
  for (const y of open) {
    const t = dutyType(s, y.k, y.kind);
    let o = byTy.get(t);
    if (!o) byTy.set(t, (o = new Set()));
    for (const pid of allowedOn(s, date, y, people, fixed, idx, memo)) if (!busy.has(pid)) o.add(pid);
  }
  // the ones who enter somewhere today, in the fairness order (without the kind of the post); the first, as many as the
  // empty posts
  const inList = new Set(list.map((c) => c.p.id));
  const turn = new Set<number>();
  for (const pid of turnOrder(s, date, fair, due)) {
    if (turn.size > open.length) break;
    if (inList.has(pid) || [...byTy.values()].some((o) => o.has(pid))) turn.add(pid);
  }
  const top = list[0].key;
  const win = list.filter((c) => c.key === top && turn.has(c.p.id));
  if (win.length < 2) return list;
  // how much he «owes» each type: times / average of the ones who do it (the services with many posts happen more
  // often). The post goes first to whoever owes this type more than any other who can serve today (otherwise whoever
  // has few times in both would always take the service that fills first), then the fewest times in it.
  const mean = (t: string, ids: Iterable<number>) => {
    let n = 0,
      sum = 0;
    for (const pid of ids) {
      const f = fair.get(pid);
      if (f) {
        n++;
        sum += f.byType[t] || 0;
      }
    }
    return n ? sum / n : 0;
  };
  const rel = (f: Fair, t: string, m: number) => ((f.byType[t] || 0) + 1) / (m + 1);
  const mT = mean(
    ty,
    list.map((c) => c.p.id),
  );
  const mU = new Map([...byTy].map(([t, o]) => [t, mean(t, o)]));
  const pos = new Map(list.map((c, i) => [c, i]));
  const v = new Map(
    win.map((c) => {
      const pid = c.p.id;
      const r = rel(c.f, ty, mT);
      let best = Infinity,
        only = 0;
      for (const [t, o] of byTy) if (t !== ty && o.has(pid)) best = Math.min(best, rel(c.f, t, mU.get(t)!));
      for (const o of byTy.values()) if (o.has(pid)) only = 1;
      return [c, [only, Math.max(0, r - best), c.f.byType[ty] || 0, pos.get(c)!]];
    }),
  );
  win.sort((a, b) => {
    const A = v.get(a)!,
      B = v.get(b)!;
    return A[0] - B[0] || A[1] - B[1] || A[2] - B[2] || A[3] - B[3];
  });
  const inWin = new Set(win);
  return [...win, ...list.filter((c) => !inWin.has(c))];
}

/** The people allowed in a post, in the order the auto-fill would pick them. */
export function candidates(
  s: AppState,
  date: ISODate,
  x: Post,
  people: Person[],
  fair: Map<number, Fair & { pid: number }>,
  idx: Map<number, Set<ISODate>>,
  fixed: Set<number>,
  memo?: Map<string, number[]>,
): Person[] {
  const h = isHol(s.settings, date);
  const need = x.armed ? [] : armedLeft(s, date, x.k);
  const keep = need.length
    ? armedNeeded(
        s,
        date,
        need,
        people.filter((p) => !fixed.has(p.id)),
        idx,
        memo,
      )
    : null;
  const reserve = (p: Person) => (keep?.has(p.id) ? 1 : 0);
  const last = (p: Person) =>
    lastResort(live(s), date, p.id, x, s.settings.lists) || statusWarn(s, date, p.id) ? 1 : 0;
  // weekend / holiday: first the fewer holidays, without counting ΔΝ, out or room (Michael, 17/10: «όλοι έχουν δικαίωμα
  // εξόδου»); the fairness order (fairCompare) already does it. Before a weekend / holiday: the ones who owe a weekend
  // enter last. And whoever already has a duty in the next 1-2 days (e.g. you put him by hand on Friday or the
  // weekend): last.
  const due = heldBack(s, date, h, people, fair, fixed, idx);
  const owes = (p: Person) => (due?.has(p.id) ? 1 : 0);
  const cmp = fairCompare(h, fairKey(s, x), date);
  // who passes the rules of the post: once per day (memo), then only the ones who did not enter today
  memo = memo || new Map();
  const busy = new Set(Object.values(s.guards[date] || {}));
  const ok = new Set(allowedOn(s, date, x, people, fixed, idx, memo));
  // the keys are computed once per person, not at every comparison of the sort (same order as before)
  const list = people
    .filter((p) => ok.has(p.id) && !busy.has(p.id))
    .map((p) => ({ p, key: last(p) * 100 + reserve(p) * 10 + owes(p), f: fair.get(p.id)! }))
    .sort((a, b) => a.key - b.key || cmp(a.f, b.f));
  return rotate(s, date, x, list, people, fair, idx, fixed, due, memo).map((c) => c.p);
}
