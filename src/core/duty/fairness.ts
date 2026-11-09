// Fairness order: how the auto-fill ranks the people for a day.
//
// Purpose: `Fair` (the numbers of one person), `fairOf`, `fairMap`, `fairKey`, `fairCompare`, `seedRank` (tie break),
//   `availDays`, `newcomerAvg`.
// Does NOT: filter by the rules (dutyCheck.ts) or pick a post (autofill.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: Holiday and weekend order, weekday order and the correction for the days a person could not serve are one
//   comparison, shared by the auto-fill, «Επόμενος» and «Γιατί αυτός;».
// Covering tests: test/duty-fairness.test.ts, test/rotation.test.ts, test/duty-fuzz.test.ts.
import { addDays, daysBetween, type ISODate } from '../lib/dates';
import { dutyType } from './capability';
import { NO_LOG } from './dutyIndex';
import { baseTotal, type DutyStat, dutyStats, statOf } from './dutyStats';
import { dutyPool, personMap } from './indexes';
import { postsOf } from './posts';
import { statusesOf } from './statuses';
import type { Post } from '../model/duty';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import { TYPES } from '../model/status';
import { live, noDutyOf } from '../people/kinds';

/**
 * Deterministic tie-break number for a person on a day (FNV-1a hash of `date:pid`): the same day gives the same
 * suggestion, not an alphabetical one.
 */
export function seedRank(date: ISODate, pid: number): number {
  let h = 2166136261;
  const str = date + ':' + pid;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The fairness numbers of one person for one day. `share`: how many duties are due to him up to the day (days he could
 * serve x the rate of the strength); `adj`: the correction of the weekday order in days (`fairMap`).
 */
export interface Fair {
  total: number;
  hol: number;
  byKind: Record<string, number>;
  byType: Record<string, number>;
  lastBefore: ISODate;
  lastHolBefore: ISODate;
  avg?: true;
  share?: number;
  adj?: number;
}

const newAvgIdx = new WeakMap<Map<number, DutyStat>, WeakMap<Person[], Map<ISODate, { hol: number; total: number }>>>();

// The newcomers start from the average (`rules.newAvg`): whoever came into strength on day `inOn` (new ΕΣΣΟ, transfer)
// counts as if he had done as many holidays and duties as the average of the others in the order who were already there
// on that day (without `inOn`, or with an older `inOn`): only their duties before `inOn` and their baseline. Once per
// `inOn` day, for all the newcomers (kept with the totals and the order).
// @decision Michael 1/11: newcomers start from the average.
function newcomerAvg(s: AppState, inOn: ISODate): { hol: number; total: number } {
  const stats = dutyStats(s),
    pool = dutyPool(s);
  let byPool = newAvgIdx.get(stats);
  if (!byPool) {
    byPool = new WeakMap();
    newAvgIdx.set(stats, byPool);
  }
  let byDay = byPool.get(pool);
  if (!byDay) {
    byDay = new Map();
    byPool.set(pool, byDay);
  }
  let r = byDay.get(inOn);
  if (!r) {
    let n = 0,
      hol = 0,
      total = 0;
    for (const q of pool) {
      if (q.inOn && q.inOn >= inOn) continue;
      n++;
      const b = s.baseline?.[q.id];
      if (b) {
        total += baseTotal(b);
        hol += b.hol || 0;
      }
      for (const e of stats.get(q.id)?.log || []) {
        if (e.d >= inOn) break;
        total++;
        if (e.h) hol++;
      }
    }
    r = { hol: n ? hol / n : 0, total: n ? total / n : 0 };
    byDay.set(inOn, r);
  }
  return r;
}

/** The fairness numbers of a person for a day: counts all the duties except the day itself. */
export function fairOf(s: AppState, pid: number, date: ISODate): Fair {
  const st = statOf(s, pid);
  const f: Fair = { total: 0, hol: 0, byKind: {}, byType: {}, lastBefore: '', lastHolBefore: '' };
  for (const e of st.log) {
    if (e.d === date) continue;
    const kind = e.kind;
    const ty = dutyType(s, e.k, kind);
    f.total++;
    f.byKind[kind] = (f.byKind[kind] || 0) + 1;
    f.byType[ty] = (f.byType[ty] || 0) + 1;
    if (ty !== kind && ty.startsWith('b:')) f.byKind[ty] = (f.byKind[ty] || 0) + 1;
    if (e.h) {
      f.hol++;
      if (e.d < date && e.d > f.lastHolBefore) f.lastHolBefore = e.d;
    }
    if (e.d < date && e.d > f.lastBefore) f.lastBefore = e.d;
  }
  const b = s.baseline?.[pid];
  if (b) {
    for (const [k, n] of Object.entries(b))
      if (k !== 'hol' && n) {
        f.byKind[k] = (f.byKind[k] || 0) + n;
        f.byType[k] = (f.byType[k] || 0) + n;
      }
    f.total += baseTotal(b);
    f.hol += b.hol || 0;
  }
  if (s.rules.newAvg && pid > 0) {
    const inOn = personMap(s.people).get(pid)?.inOn;
    if (inOn && inOn <= date) {
      const a = newcomerAvg(s, inOn);
      f.total += a.total;
      f.hol += a.hol;
      f.avg = true;
    }
  }
  return f;
}

/** The total that people are compared on in the order: the kind of the post, or the own duty itself («b:» + id). */
export const fairKey = (s: AppState, x: Pick<Post, 'k' | 'kind'>): string => {
  const t = dutyType(s, x.k, x.kind);
  return t.startsWith('b:') ? t : x.kind;
};

// A day as a number (for subtractions); without a day: very old.
const dayNum = (d: ISODate | undefined) => (d ? Date.parse(d) / 864e5 : -1e6);

// The duty days that are «due» (Michael, 1/11): every day from the first duty of the calendar (or the `inOn` of the
// newcomer, unless he starts from the average: then from the beginning, like his total) up to the day, without the days
// he could not serve (leave, hospital, ΕΥ, ΣΤΕΠ…; not out/ΔΝ, not a pending penalty), without overlaps.
// @decision Michael 1/11: the days that are due.
function availDays(s: AppState, pid: number, from: ISODate, date: ISODate): number {
  const n = daysBetween(from, date) - 1;
  if (n <= 0) return 0;
  const last = addDays(date, -1);
  const iv: [number, number][] = [];
  for (const x of statusesOf(live(s), pid)) {
    if (!noDutyOf(x, s.settings.lists) || TYPES[x.type].cat === 'out' || x.pending) continue;
    const a = x.from > from ? x.from : from,
      b = x.open || x.to >= date ? last : x.to;
    if (a <= b) iv.push([dayNum(a), dayNum(b)]);
  }
  iv.sort((p, q) => p[0] - q[0]);
  let off = 0,
    end = -Infinity;
  for (const [a, b] of iv) {
    if (b <= end) continue;
    off += b - Math.max(a, end + 1) + 1;
    end = b;
  }
  return Math.max(0, n - off);
}

/**
 * The fairness order for a day: the numbers of everybody and, on a weekday, the correction «how many are due» (Michael,
 * 1/11). The order «oldest last duty» leaves the ones who had a leave or a status behind in the total: `adj` = days of
 * the post x (total - due), as +-2, added to the last duty. Whoever did fewer than are due enters earlier, whoever did
 * more later. `L` = the people in the order per post (how many days each one waits).
 * @decision Michael 1/11: the correction «how many are due».
 */
export function fairMap(s: AppState, people: Person[], date: ISODate): Map<number, Fair & { pid: number }> {
  const fair = new Map(people.map((p) => [p.id, { ...fairOf(s, p.id, date), pid: p.id }]));
  if (!fair.size) return fair;
  let start = date;
  for (const d in s.guards) if (d < start && Object.keys(s.guards[d]).length) start = d;
  const dl = s.dutyLog || NO_LOG;
  for (const d in dl) if (d < start && dl[d].length) start = d;
  const pm = personMap(s.people);
  const av = new Map<number, number>();
  let sumT = 0,
    sumA = 0;
  for (const f of fair.values()) {
    const inOn = pm.get(f.pid)?.inOn;
    const from = inOn && inOn > start && !f.avg ? inOn : start;
    const a = availDays(s, f.pid, from, date);
    av.set(f.pid, a);
    sumT += f.total;
    sumA += a;
  }
  if (!sumA) return fair;
  const r = sumT / sumA;
  const L = fair.size / (postsOf(s.settings).length || 1);
  for (const f of fair.values()) {
    f.share = r * av.get(f.pid)!;
    f.adj = L * Math.max(-2, Math.min(2, f.total - f.share));
  }
  return fair;
}

/**
 * The comparison of two people for a day (`h` = holiday or weekend) and a kind of post: the fairness order, and a
 * seeded tie-break.
 */
export function fairCompare(h: boolean, kind: string, date: ISODate) {
  const seed = new Map<number, number>();
  const sr = (pid: number) => {
    let v = seed.get(pid);
    if (v === undefined) {
      v = seedRank(date, pid);
      seed.set(pid, v);
    }
    return v;
  };
  return (a: Fair & { pid: number }, b: Fair & { pid: number }) =>
    // weekday (Michael, 17/10): first the days without duty (corrected with the ones that are due), then the total,
    // then the holidays; weekend / holiday: the holidays
    (h
      ? a.hol - b.hol || a.lastHolBefore.localeCompare(b.lastHolBefore)
      : dayNum(a.lastBefore) + (a.adj || 0) - dayNum(b.lastBefore) - (b.adj || 0) ||
        a.total - b.total ||
        a.hol - b.hol) ||
    (a.byKind[kind] || 0) - (b.byKind[kind] || 0) ||
    sr(a.pid) - sr(b.pid);
}
