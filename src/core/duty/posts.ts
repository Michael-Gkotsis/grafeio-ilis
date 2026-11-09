// Duty posts of the current form and of all forms, the post of a person on a day, and the time span of a post.
//
// Purpose: `postsOf` / `allPosts` / `postBy` (post lists and the lookup by key), `slotSpans` / `postSpan` (start and
//   end of a post in minutes), `isFixed` / `fixedIds` (permanent Λ/Υ and Δ/Υ), `postOf` (the post someone holds on a
//   day).
// Does NOT: import from core/outs: core/outs imports this file (returns.ts uses `postOf`, weekend.ts uses `postOf` and
//   `postSpan`).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core; low layer, no dependency on
//   statuses or outs.
// Why: The three post lists and the day index are caches keyed by the settings or guards object. They live next to the
//   functions that fill them, one instance each.
// Covering tests: test/rules.test.ts, test/rotation.test.ts, test/leave-hours.test.ts, test/golden-outputs.test.ts.
import type { ISODate } from '../lib/dates';
import { buildPosts } from '../model/blocks';
import type { DutyKind, Post } from '../model/duty';
import type { Settings } from '../model/settings';
import { blocksOf, dutyStartOf, everyBlock } from '../model/settingsAccess';
import type { AppState } from '../model/state';

const postsIdx = new WeakMap<Settings['blocks'], { start: string; p: Post[] }>();

/** Posts of the form in force now (ΣΒΕΝ, ΣΠΕΝ or the user's own), without the removed ones. */
export function postsOf(settings: Settings): Post[] {
  const blocks = blocksOf(settings) || settings.blocks;
  const start = dutyStartOf(settings);
  let c = postsIdx.get(blocks);
  if (!c || c.start !== start) {
    c = {
      start,
      p: buildPosts(
        blocks.filter((b) => !b.hidden),
        start,
      ).filter((x) => !x.hidden),
    };
    postsIdx.set(blocks, c);
  }
  return c.p;
}

const allIdx = new WeakMap<Settings, Post[]>();

/** All the posts that ever existed (of all forms, and the removed ones): for the history and the duty check. */
export function allPosts(settings: Settings): Post[] {
  let p = allIdx.get(settings);
  if (!p) {
    const seen = new Set<string>();
    p = [];
    for (const x of [...postsOf(settings), ...buildPosts(everyBlock(settings), dutyStartOf(settings))])
      if (!seen.has(x.k)) {
        seen.add(x.k);
        p.push(x);
      }
    allIdx.set(settings, p);
  }
  return p;
}

const postKeyIdx = new WeakMap<Settings, Map<string, Post>>();

/** A post by its key, through an index: it is called for every duty of the calendar (totals, «Γιατί αυτός;»). */
export const postBy = (s: AppState, k: string): Post | undefined => {
  let m = postKeyIdx.get(s.settings);
  if (!m) {
    m = new Map(allPosts(s.settings).map((p) => [p.k, p]));
    postKeyIdx.set(s.settings, m);
  }
  return m.get(k);
};

/** The part of a post that the time rules read: armed or not, kind, own duty id, shifts, hours and the cycle start. */
export type DutyPost = {
  armed: boolean;
  kind?: DutyKind;
  block?: string;
  slots?: string[] | null;
  hrs?: string;
  cyc?: number;
};

const spanIdx = new WeakMap<object, { start: number | null; end: number | null }>();

const timesIn = (txt: string) => [...txt.matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => +m[1] * 60 + +m[2]);

const slotIdx = new WeakMap<object, { start: number; end: number }[]>();

/**
 * The time of each shift of a post (`post.slots`), in the same minutes as `postSpan`: from the midnight of the duty
 * day, +1440 after midnight (armed services per number, armed.ts). A post without shifts: [].
 * The duty day runs from the start of the cycle (`settings.dutyStart`, e.g. 14:00) to the same time the next day.
 */
export function slotSpans(post: DutyPost): { start: number; end: number }[] {
  let r = slotIdx.get(post);
  if (r) return r;
  r = [];
  if (post.slots && post.slots.length) {
    // a shift that starts before the start of the cycle belongs to the next day (e.g. cycle 14:00, shifts from 06:00)
    let day = post.cyc != null && (timesIn(post.slots[0])[0] ?? 1440) < post.cyc ? 1440 : 0,
      prev = -1;
    for (const sl of post.slots) {
      const [a, b] = timesIn(sl);
      if (a == null || b == null) continue;
      if (a < prev) day += 1440;
      prev = a;
      r.push({ start: a + day, end: b + day + (b <= a ? 1440 : 0) });
    }
  }
  slotIdx.set(post, r);
  return r;
}

/**
 * When a post starts and ends, in minutes from the midnight of the duty day: from the shifts (14:00-16:00, 22:00-00:00,
 * 06:00-08:00 -> 14:00 to 08:00 of the next day) or from the hours of the post («14:00 → 14:00»). null = unknown
 * (μαγειρεία «ημέρα», ΤΑΕ without hours).
 * @decision Michael 13/10: hours in the leaves.
 */
export function postSpan(post: DutyPost): { start: number | null; end: number | null } {
  let r = spanIdx.get(post);
  if (r) return r;
  r = { start: null, end: null };
  const sp = slotSpans(post);
  if (sp.length) {
    r.start = sp[0].start;
    r.end = sp[sp.length - 1].end;
  } else if (post.hrs) {
    const [a, b] = timesIn(post.hrs);
    if (a != null) {
      r.start = a;
      if (b != null) r.end = b + (b <= a ? 1440 : 0);
    }
  }
  spanIdx.set(post, r);
  return r;
}

/** A permanent Λ/Υ or Δ/Υ: enters by himself every day, without rest rules and without the fairness order. */
export const isFixed = (s: AppState, pid: number, k?: string | null) =>
  !!k && (k === 'ly' || k === 'dy') && s.settings.fixed?.[k] === pid;

/** The person ids of the permanent Λ/Υ and Δ/Υ. */
export const fixedIds = (s: AppState) => new Set(Object.values(s.settings.fixed || {}).filter((x): x is number => !!x));

const dayIdx = new WeakMap<object, Map<number, string[]>>();

/** The post of someone on a day: an index person to posts per day object (called for every candidate in every post). */
export const postOf = (s: AppState, date: ISODate, pid: number, exceptKey?: string): Post | undefined => {
  const g = s.guards[date];
  if (!g) return undefined;
  let m = dayIdx.get(g);
  if (!m) {
    m = new Map();
    for (const k in g) {
      const l = m.get(g[k]);
      if (l) l.push(k);
      else m.set(g[k], [k]);
    }
    dayIdx.set(g, m);
  }
  const ks = m.get(pid);
  if (!ks) return undefined;
  return allPosts(s.settings).find((x) => x.k !== exceptKey && ks.includes(x.k));
};
