// Steps after the first pass of the auto-fill: repair chains, holiday top-up, strict top-up and number balance.
//
// Purpose: `repair`, `fillAfterHoliday`, `strictTopUp`, `balanceNums`.
// Does NOT: run the first pass (autofill.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: Each step only improves the result of the one before; none breaks a rule, and none touches posts the user set by
//   hand.
// Covering tests: test/fill-repair.test.ts, test/strict.test.ts, test/duty-fuzz.test.ts.
import type { ISODate } from '../lib/dates';
import { guardUnavailable, ruleBlock } from './dutyCheck';
import { seatlessOn } from './dutyIndex';
import { statOf } from './dutyStats';
import { type Fair, fairCompare, fairKey } from './fairness';
import { isHol } from './holidays';
import { personMap } from './indexes';
import { dutyBlock, lastResort, statusWarn } from './leaveHours';
import { postBy } from './posts';
import { isUnarmed, strictKeys, strictTier } from './strictUnarmed';
import { capBlock } from './whoDoes';
import type { Post } from '../model/duty';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import { live } from '../people/kinds';

/**
 * Repair after the first pass (which keeps the fairness order and the «Αυστηρά Άοπλοι»). The first pass picks one post
 * at a time and may leave a post empty, or put someone «only if nobody else», although a complete valid assignment
 * exists (e.g. Ι1 in the σκοπιά and the ΤΑΕ empty, while Ι3 ΜΕ ΟΠΛΟ, who does not do ΤΑΕ, could go to the σκοπιά). For
 * each such post it looks for a small chain (up to 3 people) among the ones this fill put in: someone goes to the post,
 * another takes his post, and at the end someone without a post today enters, always in the fairness order. No rule is
 * broken; the posts the user set by hand and the permanent Λ/Υ-Δ/Υ are not moved. Returns how many more posts were
 * filled.
 */
export function repair(
  s: AppState,
  date: ISODate,
  g: Record<string, number>,
  mine: Set<string>,
  posts: Post[],
  people: Person[],
  fair: Map<number, Fair & { pid: number }>,
  idx: Map<number, Set<ISODate>>,
  fixed: Set<number>,
): number {
  const lists = s.settings.lists;
  const strict = !!s.rules.strictUnarmed;
  const h = isHol(s.settings, date);
  const lr = (pid: number, x: Post) => !!(lastResort(live(s), date, pid, x, lists) || statusWarn(s, date, pid));
  const okMemo = new Map<string, boolean>();
  const pm = personMap(s.people);
  // enters the post (without counting where he is today: the chain knows that)
  const ok = (pid: number, x: Post) => {
    const key = pid + '|' + x.k;
    let v = okMemo.get(key);
    if (v == null) {
      v =
        !fixed.has(pid) &&
        !(x.kind === 'ly' && pm.get(pid)?.post) &&
        !dutyBlock(live(s), date, pid, x, lists) &&
        !capBlock(s, date, pid, x) &&
        !seatlessOn(s, date, pid) &&
        !ruleBlock(s, date, pid, idx, x.k) &&
        !(strict && x.kind === 'sk' && isUnarmed(s, date, pid));
      okMemo.set(key, v);
    }
    return v;
  };
  const byFair = (x: Post) => {
    const cmp = fairCompare(h, fairKey(s, x), date);
    return (a: number, b: number) => cmp(fair.get(a)!, fair.get(b)!);
  };
  let free = new Map<string, number[]>(); // per post: who has no post today and may enter, in the fairness order
  const freeFor = (x: Post) => {
    let l = free.get(x.k);
    if (!l) {
      const busy = new Set(Object.values(g));
      l = people
        .filter((p) => !busy.has(p.id) && ok(p.id, x))
        .map((p) => p.id)
        .sort(byFair(x));
      free.set(x.k, l);
    }
    return l;
  };
  let added = 0;
  const tryFill = (x: Post, better: boolean): boolean => {
    const cur = better ? g[x.k] : undefined;
    // at the end of the chain: someone without a post today (or the one who leaves x, when we want it for another)
    const refill = (y: Post, not: number[]) => {
      const l = [...freeFor(y), ...(cur != null && ok(cur, y) ? [cur] : [])].filter(
        (p) => !not.includes(p) && (!better || !lr(p, y)),
      );
      return l.sort(byFair(y))[0];
    };
    const moves = (pid: number, y: Post) => ok(pid, y) && !lr(pid, y);
    const done = (a: [string, number][]) => {
      if (!better) added++;
      for (const [k, p] of a) g[k] = p;
      mine.add(x.k);
      free = new Map();
      return true;
    };
    if (better) {
      const u = refill(x, cur != null ? [cur] : []);
      if (u != null) return done([[x.k, u]]);
    }
    const mov = posts.filter((y) => y.k !== x.k && mine.has(y.k) && g[y.k] != null);
    const first = mov.filter((y) => moves(g[y.k], x)).sort((a, b) => byFair(x)(g[a.k], g[b.k]));
    for (const y1 of first) {
      const p1 = g[y1.k];
      const u = refill(y1, [p1]);
      if (u != null)
        return done([
          [x.k, p1],
          [y1.k, u],
        ]);
      for (const y2 of mov) {
        if (y2.k === y1.k) continue;
        const p2 = g[y2.k];
        if (!moves(p2, y1)) continue;
        const u2 = refill(y2, [p1, p2]);
        if (u2 != null)
          return done([
            [x.k, p1],
            [y1.k, p2],
            [y2.k, u2],
          ]);
      }
    }
    return false;
  };
  for (const x of posts) if (!g[x.k]) tryFill(x, false);
  for (const x of posts) if (mine.has(x.k) && g[x.k] && lr(g[x.k], x)) tryFill(x, true);
  return added;
}

/**
 * Holiday without enough people: the posts that stayed empty because the ones who would enter had done a holiday
 * recently (`noConsecHol`) are filled with them, oldest holiday first (holiday fairness order). Only this rule is
 * relaxed: all the others (rest, numbers, days without duty, statuses, armed / unarmed) hold as always. Returns how
 * many posts were filled.
 */
export function fillAfterHoliday(
  s: AppState,
  date: ISODate,
  g: Record<string, number>,
  mine: Set<string>,
  posts: Post[],
  people: Person[],
  fair: Map<number, Fair & { pid: number }>,
  idx: Map<number, Set<ISODate>>,
  fixed: Set<number>,
  strict: boolean,
  mark: (id: number) => void,
): number {
  const free: AppState = { ...s, rules: { ...s.rules, noConsecHol: false } };
  let added = 0;
  for (const x of posts) {
    if (g[x.k]) continue;
    const busy = new Set(Object.values(g));
    const w: AppState = { ...s, guards: { ...s.guards, [date]: { ...g } } },
      wf: AppState = { ...free, guards: w.guards };
    const cmp = fairCompare(true, fairKey(s, x), date);
    const c = people
      .filter(
        (p) =>
          !busy.has(p.id) &&
          !fixed.has(p.id) &&
          !(x.kind === 'ly' && p.post) &&
          !(strict && x.kind === 'sk' && isUnarmed(s, date, p.id)),
      )
      .filter(
        (p) =>
          !guardUnavailable(wf, date, p.id, x.k, idx) &&
          guardUnavailable(w, date, p.id, x.k, idx)?.startsWith('Έκανε αργία'),
      )
      .map((p) => fair.get(p.id)!)
      .sort(cmp)[0];
    if (!c) continue;
    g[x.k] = c.pid;
    mine.add(x.k);
    mark(c.pid);
    added++;
  }
  return added;
}

/**
 * «Αυστηρά Άοπλοι» at the end: an unarmed person left without a post, while a post of his order (μαγειρεία, 2nd-3rd,
 * 1st-4th) was taken by an armed person from this fill (e.g. he did not fit in the 4th number that was left, and the
 * "Ίσα νούμερα" put the armed in the 2nd): he enters and the armed one stays for tomorrow. Only if he passes all the
 * rules of the post, not «only if nobody else».
 * @decision Michael 3/11: «Αυστηρά Άοπλοι» at the end.
 */
export function strictTopUp(
  s: AppState,
  date: ISODate,
  g: Record<string, number>,
  mine: Set<string>,
  posts: Post[],
  people: Person[],
  fair: Map<number, Fair & { pid: number }>,
  idx: Map<number, Set<ISODate>>,
  fixed: Set<number>,
  mark: (id: number) => void,
  unmark: (id: number) => void,
) {
  const ks = strictKeys(s.rules);
  const lists = s.settings.lists;
  const busy = new Set(Object.values(g));
  let free = people.filter((p) => !busy.has(p.id) && !fixed.has(p.id) && !p.post && isUnarmed(s, date, p.id));
  if (!free.length) return;
  const cmp = fairCompare(isHol(s.settings, date), '', date);
  free = free.sort((a, b) => cmp(fair.get(a.id)!, fair.get(b.id)!));
  for (const x of posts) {
    if (!free.length) return;
    const pid = g[x.k];
    if (
      !pid ||
      !mine.has(x.k) ||
      x.kind === 'sk' ||
      x.kind === 'ly' ||
      strictTier(x, ks) > ks.length ||
      isUnarmed(s, date, pid)
    )
      continue;
    const gg = { ...g };
    delete gg[x.k];
    const w: AppState = { ...s, guards: { ...s.guards, [date]: gg } };
    const u = free.find(
      (p) =>
        !guardUnavailable(w, date, p.id, x.k, idx) &&
        !lastResort(live(s), date, p.id, x, lists) &&
        !statusWarn(s, date, p.id),
    );
    if (!u) continue;
    unmark(pid);
    g[x.k] = u.id;
    mark(u.id);
    free = free.filter((p) => p !== u);
  }
}

/**
 * Numbers: the posts with a number (`rot`) of each form that this fill filled (2 to 6, only the people it put itself)
 * exchange people so that the sum of the squares of the times each one already did the same number (same hours) goes
 * down. It does not change who has duty today; whoever changes post passes all the rules of the new one (return hours,
 * 3rd/4th, «only if nobody else», σκοπιά armed only). The people put by hand are not touched.
 * @decision Michael 1/11: numbers balance.
 */
export function balanceNums(
  s: AppState,
  date: ISODate,
  g: Record<string, number>,
  mine: Set<string>,
  posts: Post[],
  idx: Map<number, Set<ISODate>>,
) {
  const blocks = new Map<string, Post[]>();
  for (const x of posts)
    if (x.rot != null && mine.has(x.k) && g[x.k]) {
      const l = blocks.get(x.block);
      if (l) l.push(x);
      else blocks.set(x.block, [x]);
    }
  const strict = !!s.rules.strictUnarmed;
  const lists = s.settings.lists;
  for (const xs of blocks.values()) {
    const n = xs.length;
    if (n < 2 || n > 6) continue;
    const pids = xs.map((x) => g[x.k]);
    // times each one already did the same number (same hours), before today
    const done = pids.map((pid) => {
      const m = new Map<string, number>();
      for (const e of statOf(s, pid).log) {
        if (e.d >= date || !e.k) continue;
        const p = postBy(s, e.k);
        if (p && p.rot != null) m.set(p.hours, (m.get(p.hours) || 0) + 1);
      }
      return m;
    });
    const gg = { ...g };
    for (const x of xs) delete gg[x.k];
    const w: AppState = { ...s, guards: { ...s.guards, [date]: gg } };
    // ok[i][j]: j enters post i (his own always); cost[i][j]: square of the times of j in these hours
    const ok = xs.map((x, i) =>
      pids.map(
        (pid, j) =>
          i === j ||
          (!guardUnavailable(w, date, pid, x.k, idx) &&
            !lastResort(live(s), date, pid, x, lists) &&
            !statusWarn(s, date, pid) &&
            !(strict && x.kind === 'sk' && isUnarmed(s, date, pid))),
      ),
    );
    const cost = xs.map((x, i) =>
      pids.map((_, j) => {
        const c = done[j].get(x.hours) || 0;
        return c * c;
      }),
    );
    let best = xs.map((_, i) => i),
      bestC = best.reduce((a, j, i) => a + cost[i][j], 0);
    const cur: number[] = [],
      used = new Array(n).fill(false);
    const go = (i: number, c: number) => {
      if (c >= bestC) return;
      if (i === n) {
        bestC = c;
        best = [...cur];
        return;
      }
      for (let j = 0; j < n; j++)
        if (!used[j] && ok[i][j]) {
          used[j] = true;
          cur[i] = j;
          go(i + 1, c + cost[i][j]);
          used[j] = false;
        }
    };
    go(0, 0);
    xs.forEach((x, i) => (g[x.k] = pids[best[i]]));
  }
}
