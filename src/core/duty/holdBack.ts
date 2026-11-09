// People held back for the next weekend, and the armed posts that must be kept filled.
//
// Purpose: `dutyAhead`, `heldBack`, `weekendDue` (who «owes» the coming weekend or holiday), `armedLeft`, `armedNeeded`
//   (who is needed for the armed posts).
// Does NOT: rank people (fairness.ts) or rotate duties (rotation.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: Both rules reserve people for later in the same day or week, so they share the memo style: one answer per day,
//   kept with the fair object.
// Covering tests: test/rotation.test.ts, test/strict.test.ts, test/armed.test.ts, test/duty-fuzz.test.ts.
import { addDays, type ISODate } from '../lib/dates';
import { guardUnavailable, ruleBlock } from './dutyCheck';
import { dutyIndexOf } from './dutyIndex';
import { type Fair, fairCompare } from './fairness';
import { isHol } from './holidays';
import { dutyBlock } from './leaveHours';
import { postsOf } from './posts';
import { offDayBlock } from './whoDoes';
import type { Post } from '../model/duty';
import type { Rules } from '../model/dutyRules';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import { live } from '../people/kinds';

/** How many days ahead the rest rule looks: the rest days, at least 2; 0 without rest. */
export const aheadDays = (r: Rules) => (r.restDays > 0 ? Math.max(2, r.restDays) : 0);

/**
 * The first day with a duty in the next days (as many as the rest, at least 2; e.g. you put him by hand on Wednesday
 * for Friday or the weekend, Michael 21/10), or null. Inside the rest he does not enter at all (ruleBlock), earlier he
 * enters last, like the ones who owe a weekend. Without rest it is not needed.
 * @decision Michael 21/10: a duty in the coming days.
 */
export function dutyAhead(s: AppState, date: ISODate, pid: number, idx?: Map<number, Set<ISODate>>): ISODate | null {
  const n = aheadDays(s.rules);
  const ds = n ? (idx || dutyIndexOf(s)).get(pid) : undefined;
  if (ds)
    for (let i = 1; i <= n; i++) {
      const d = addDays(date, i);
      if (ds.has(d)) return d;
    }
  return null;
}

const heldCache = new WeakMap<object, Set<number> | null>();

/**
 * The ones who enter last on a day: the ones who owe the coming weekend and the ones who already have a duty in the
 * next days.
 */
export function heldBack(
  s: AppState,
  date: ISODate,
  h: boolean,
  people: Person[],
  fair: Map<number, Fair & { pid: number }>,
  fixed: Set<number>,
  idx: Map<number, Set<ISODate>>,
): Set<number> | null {
  if (heldCache.has(fair)) return heldCache.get(fair)!;
  const due = h ? null : weekendDue(s, date, people, fair, fixed, idx);
  const soon = people.filter((p) => !fixed.has(p.id) && dutyAhead(s, date, p.id, idx)).map((p) => p.id);
  const out = soon.length ? new Set([...(due || []), ...soon]) : due;
  heldCache.set(fair, out);
  return out;
}

const dueCache = new WeakMap<object, Set<number> | null>();

// The ones who «owe» the next weekend / holiday: the days before a weekend / holiday (up to 2 days, or as many as the
// rest if more) the ones who would take the posts of the holiday by the fairness order are kept aside, that is the
// fewer holidays, as many as fit in the posts of all its consecutive days. They enter only if the others are not
// enough. Without rest it is not needed. Once per fill (kept with its `fair`).
// @decision Michael 17/10: «να κρατάει όσους δεν έχουν κάνει ΣΚ για το επόμενο και να μην τους βάζει Πέμπτη-Παρασκευή,
// ώστε να τηρείται η ανάπαυση».
function weekendDue(
  s: AppState,
  date: ISODate,
  people: Person[],
  fair: Map<number, Fair & { pid: number }>,
  fixed: Set<number>,
  idx: Map<number, Set<ISODate>>,
): Set<number> | null {
  if (dueCache.has(fair)) return dueCache.get(fair)!;
  let out: Set<number> | null = null;
  const rest = s.rules.restDays || 0;
  const ahead =
    rest > 0
      ? [1, 2, 3, 4, 5, 6, 7]
          .slice(0, Math.max(2, rest))
          .map((i) => addDays(date, i))
          .find((d) => isHol(s.settings, d))
      : undefined;
  if (ahead) {
    const days: ISODate[] = [];
    for (let d = ahead; isHol(s.settings, d) && days.length < 5; d = addDays(d, 1)) days.push(d);
    // only the empty posts: the ones you already put on the weekend (by hand) are not «owed» by anybody else
    const posts = postsOf(s.settings).filter((x) => x.kind !== 'ly');
    const seats = days.reduce((a, d) => a + posts.filter((x) => !(s.guards[d] || {})[x.k]).length, 0);
    const cmp = fairCompare(true, '', ahead);
    const placed = (pid: number) => days.some((d) => idx.get(pid)?.has(d));
    // the ones who can enter the holiday (statuses, days without duty, rules), without today, which is being judged now
    const can = people.filter(
      (p) =>
        !fixed.has(p.id) &&
        !p.post &&
        !placed(p.id) &&
        days.some(
          (d) =>
            !dutyBlock(live(s), d, p.id, null, s.settings.lists) &&
            !offDayBlock(s, d, p.id) &&
            !ruleBlock(s, d, p.id, idx),
        ),
    );
    out = new Set(
      can
        .map((p) => fair.get(p.id)!)
        .filter(Boolean)
        .sort(cmp)
        .slice(0, seats)
        .map((f) => f.pid),
    );
  }
  dueCache.set(fair, out);
  return out;
}

/** The empty armed posts of the day (except `except`). */
export const armedLeft = (s: AppState, date: ISODate, except: string) => {
  const g = s.guards[date] || {};
  return postsOf(s.settings).filter((y) => y.armed && y.k !== except && !g[y.k]);
};

/**
 * The people who are needed for the armed posts: the ones who, if they go elsewhere, fill fewer armed posts (a maximum
 * matching of people to posts; for each one of the matching it is tested whether another takes his post). `memo`: who
 * passes the rules of each post, once per day (it changes only for whoever already entered a post that day).
 */
export function armedNeeded(
  s: AppState,
  date: ISODate,
  seats: Post[],
  people: Person[],
  idx: Map<number, Set<ISODate>>,
  memo?: Map<string, number[]>,
): Set<number> {
  const busy = new Set(Object.values(s.guards[date] || {}));
  const ok = (y: Post) => {
    let l = memo?.get(y.k);
    if (!l) {
      l = people.filter((p) => !guardUnavailable(s, date, p.id, y.k, idx)).map((p) => p.id);
      memo?.set(y.k, l);
    }
    return l.filter((pid) => !busy.has(pid));
  };
  const adj = seats.map(ok);
  const bySeat: (number | undefined)[] = [];
  const byPid = new Map<number, number>();
  const aug = (
    si: number,
    seen: Set<number>,
    ban: number,
    bs: (number | undefined)[],
    bp: Map<number, number>,
  ): boolean => {
    for (const pid of adj[si]) {
      if (pid === ban || seen.has(pid)) continue;
      seen.add(pid);
      const o = bp.get(pid);
      if (o === undefined || aug(o, seen, ban, bs, bp)) {
        bp.set(pid, si);
        bs[si] = pid;
        return true;
      }
    }
    return false;
  };
  seats.forEach((_, si) => aug(si, new Set(), -1, bySeat, byPid));
  const out = new Set<number>();
  for (const [pid, si] of byPid) {
    const bs = [...bySeat];
    const bp = new Map(byPid);
    bs[si] = undefined;
    bp.delete(pid);
    if (!aug(si, new Set(), pid, bs, bp)) out.add(pid);
  }
  return out;
}
