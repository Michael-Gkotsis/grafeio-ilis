// Armed duties per number (Michael, 24/10: it replaced «the whole day out»): when each weapon goes out and back in.
//
// Purpose: `armedRows` (all the numbers of armed duties of a duty day, in the order the weapon comes out), `armedLive`
//   (now: the number that runs, the next and the previous one per owner of the weapon), the margin (`armMargin`,
//   `ARM_BEFORE`, `ARM_AFTER`, `ARM_MAX`), the mode of a duty (`armModeOf`) and the time helpers (`hmOf`, `calDay`,
//   `stampOf`, `okStamp`, `stampMin`, `nowIn`, `armWhen`, `rowById`).
// Does NOT: write anything. It is computed when asked; the only thing stored is the manual corrections
//   (`state.dutyFix`, kv «dutyFix»).
// Owner layer: core/weapons (no fs, no Electron, no React); imports core/duty (posts, statuses).
// Why: the hours of each number come from the shifts of the post (`post.slots`: «every so many hours» or «my own
//   shifts»; `shiftSlots` in core/model/shifts.ts, in minutes from the start of the cycle with `slotSpans`). Without
//   shifts: «same hours» (`post.hrs`) or «the whole day» = the whole cycle, from the start of the duty (14:00) to the
//   same time the next day. Always with a margin: the weapon comes out N' before and goes back N' after (Κανόνες).
//   Two modes per duty (`BlockDef.armWeapon`):
//   - «own» (default): each person takes out their own weapon at their number; consecutive numbers of the same person
//     are joined into one row.
//   - «of the post»: the weapon of the person of the 1st number comes out (before the 1st; it goes back after the last)
//     and passes from hand to hand at the changes; the weapons of the others stay IN. Parallel rows at the same time
//     (α/β of the same duty) each have their own post weapon: that of the 1st number of its row, passed to the next
//     numbers of the same row.
// Covering tests: test/armed.test.ts, test/cadre-duty.test.ts.
import { addDays, daysBetween, type ISODate } from '../lib/dates';
import { everyBlock } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import type { BlockDef, Post } from '../model/duty';
import type { DutyFix } from '../model/records';
import type { Rules } from '../model/dutyRules';
import { dutyMin } from '../duty/statuses';
import { postBy, postSpan, postsOf, slotSpans } from '../duty/posts';
import { upper } from '../lib/text';

/** Whose weapon comes out: the person's own, or the weapon of the post. */
export type ArmWeapon = 'own' | 'post';
/** Default margin before (minutes), default margin after (minutes) and the highest margin allowed (minutes). */
export const ARM_BEFORE = 15,
  ARM_AFTER = 15,
  ARM_MAX = 240;
// Margin in minutes; old settings without the field get the default (without a change of settings.rev)
const okMin = (v: unknown, def: number) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n >= 0 && n <= ARM_MAX ? Math.round(n) : def;
};
/** The margin of the weapon in minutes, before and after the shift, from the rules (default when not set). */
export const armMargin = (r?: Pick<Rules, 'armBefore' | 'armAfter'> | null) => ({
  before: okMin(r?.armBefore, ARM_BEFORE),
  after: okMin(r?.armAfter, ARM_AFTER),
});
/** The mode of a duty: «post» only when set so, otherwise «own». */
export const armModeOf = (b?: Pick<BlockDef, 'armWeapon'> | null): ArmWeapon =>
  b?.armWeapon === 'post' ? 'post' : 'own';

/** The part of the state the armed rows need. */
export type ArmState = Pick<AppState, 'guards' | 'dutyLog' | 'settings'> & Partial<Pick<AppState, 'rules' | 'dutyFix'>>;

/**
 * One row = one number of an armed duty (or consecutive ones joined). `out` / `in`: minutes from midnight of the duty
 * day (`day`), with the margin and the correction; +1440 = the next day, negative = the previous one. `from` / `to`:
 * the shift itself.
 */
export interface ArmRow {
  id: string; // day|post|n of the first number: the key of the correction
  day: ISODate;
  post: string;
  n: number;
  last: number; // n..last: the numbers (shift indexes in the post) that were joined
  mode: ArmWeapon;
  who: number; // who does the number (holds the weapon on the row)
  owner: number; // whose weapon comes out (differs from `who` only in «of the post»)
  label: string; // «Σκοπός 3ης σκοπιάς (α)»
  reason: string; // «ΥΠΗΡΕΣΙΑ ΣΚΟΠΟΣ 3ΗΣ ΣΚΟΠΙΑΣ (Α)»
  from: number;
  to: number;
  out: number;
  in: number;
  autoOut: number;
  autoIn: number;
  take: boolean; // «of the post»: takes it from the previous one (otherwise from the armourer)
  give: boolean; // «of the post»: gives it to the next one (otherwise it goes back to the armourer)
  next?: number; // the next one who takes it
  fix?: DutyFix;
}
/** The text written when the weapon goes back at the end of the duty. */
export const ARM_BACK = 'ΛΗΞ ΥΠΗΡΕΣΙΑΣ';

const mod = (m: number) => ((m % 1440) + 1440) % 1440;
/** Minutes from midnight as «ΩΩ:ΛΛ» (taken modulo one day). */
export const hmOf = (m: number) =>
  String(Math.floor(mod(m) / 60)).padStart(2, '0') + ':' + String(mod(m) % 60).padStart(2, '0');
/** The calendar day on which minute `m` of the duty day `day` falls. */
export const calDay = (day: ISODate, m: number): ISODate => addDays(day, Math.floor(m / 1440));
/** «YYYY-MM-DD HH:MM» (the form of the correction) from minute `m` of the duty day `day`. */
export const stampOf = (day: ISODate, m: number) => calDay(day, m) + ' ' + hmOf(m);
const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
/** True when `v` is a valid «YYYY-MM-DD HH:MM» stamp. */
export const okStamp = (v: unknown): v is string =>
  typeof v === 'string' && STAMP.test(v) && +v.slice(11, 13) < 24 && +v.slice(14, 16) < 60;
/** The stamp back to minutes from midnight of the duty day `day`. */
export const stampMin = (day: ISODate, st: string) =>
  (daysBetween(day, st.slice(0, 10)) - 1) * 1440 + +st.slice(11, 13) * 60 + +st.slice(14, 16);
const dayNo = (d: ISODate) => daysBetween('2000-01-01', d);
/** «15:45–18:15» */
export const armWhen = (r: Pick<ArmRow, 'out' | 'in'>) => hmOf(r.out) + '–' + hmOf(r.in);

interface Step {
  k: string;
  label: string;
  block: string;
  mode: ArmWeapon;
  pid: number;
  n: number;
  from: number;
  to: number;
  ord: number;
  lane: number;
}
// The hours of the numbers of a post: shifts (slotSpans), else «same hours» (postSpan), else the whole cycle
function windowsOf(post: Post, cyc: number): { start: number; end: number }[] {
  const sl = slotSpans(post);
  if (sl.length) return sl;
  const sp = postSpan(post);
  if (sp.start != null && sp.end != null) {
    const sh = sp.start < cyc ? 1440 : 0;
    return [{ start: sp.start + sh, end: sp.end + sh }];
  }
  return [{ start: cyc, end: cyc + 1440 }];
}
function stepsOf(s: ArmState, day: ISODate): Step[] {
  const cyc = dutyMin(s.settings);
  const blocks = everyBlock(s.settings);
  const out: Step[] = [];
  let ord = 0;
  const g = s.guards?.[day] || {};
  // lane = the order of the post among those of the duty that start at the same time (α=0, β=1); the same for all
  // its numbers
  const seen = new Map<string, number>();
  const lane = (block: string, start: number) => {
    const q = block + '|' + start,
      n = seen.get(q) || 0;
    seen.set(q, n + 1);
    return n;
  };
  const order = new Map(postsOf(s.settings).map((x, i) => [x.k, i] as const));
  for (const k of Object.keys(g).sort((x, y) => (order.get(x) ?? 1e9) - (order.get(y) ?? 1e9))) {
    const x = postBy(s as AppState, k);
    if (!x?.armed || g[k] == null) continue;
    const mode = armModeOf(blocks.find((b) => b.id === x.block));
    const ws = windowsOf(x, cyc);
    const ln = lane(x.block, ws[0].start);
    ws.forEach((w, n) =>
      out.push({ k, label: x.label, block: x.block, mode, pid: g[k], n, from: w.start, to: w.end, ord, lane: ln }),
    );
    ord++;
  }
  // a duty without a post (a bare «Σ» from Excel) in an armed kind: the whole cycle
  const kinds = new Map(
    postsOf(s.settings)
      .filter((x) => x.armed)
      .map((x) => [x.kind, x] as const),
  );
  for (const e of s.dutyLog?.[day] || []) {
    const x = kinds.get(e.kind);
    if (!x) continue;
    const bd = blocks.find((b) => b.id === x.block);
    out.push({
      k: '~' + e.kind + ':' + e.pid,
      label: (bd?.name || x.kind) + ' (χωρίς θέση)',
      block: x.block,
      mode: armModeOf(bd),
      pid: e.pid,
      n: 0,
      from: cyc,
      to: cyc + 1440,
      ord: ord++,
      lane: lane(x.block, cyc),
    });
  }
  return out;
}

interface Grp {
  first: Step;
  last: Step;
  who: number;
  out: number;
  in: number;
}
function rowOf(
  day: ISODate,
  g: Grp,
  o: Partial<Pick<ArmRow, 'owner' | 'take' | 'give' | 'next' | 'mode'>>,
  fixes: Map<string, DutyFix>,
): ArmRow {
  const f = g.first,
    id = day + '|' + f.k + '|' + f.n;
  const r: ArmRow = {
    id,
    day,
    post: f.k,
    n: f.n,
    last: g.last.n,
    mode: o.mode || 'own',
    who: g.who,
    owner: o.owner ?? g.who,
    label: f.label,
    reason: 'ΥΠΗΡΕΣΙΑ ' + upper(f.label),
    from: f.from,
    to: g.last.to,
    out: g.out,
    in: g.in,
    autoOut: g.out,
    autoIn: g.in,
    take: !!o.take,
    give: !!o.give,
    ...(o.next != null ? { next: o.next } : {}),
  };
  const fx = fixes.get(f.k + '|' + f.n);
  if (fx) {
    // a correction that is no longer logical (the return before the exit, after the duties changed) is ignored
    const out = okStamp(fx.out) ? stampMin(day, fx.out) : r.out,
      inn = okStamp(fx.in) ? stampMin(day, fx.in) : r.in;
    if (inn >= out) {
      r.out = out;
      r.in = inn;
      r.fix = fx;
    }
  }
  return r;
}
/** All the numbers of armed duties of the duty day `day`, in the order the weapon comes out. */
export function armedRows(s: ArmState, day: ISODate): ArmRow[] {
  const steps = stepsOf(s, day);
  if (!steps.length) return [];
  const { before, after } = armMargin(s.rules);
  const fixes = new Map((s.dutyFix || []).filter((f) => f.day === day).map((f) => [f.post + '|' + f.n, f] as const));
  const rows: ArmRow[] = [];
  // own: per person, the numbers that touch or overlap (with the margin) are joined
  const by = new Map<number, Step[]>();
  for (const x of steps)
    if (x.mode === 'own') {
      const l = by.get(x.pid);
      if (l) l.push(x);
      else by.set(x.pid, [x]);
    }
  for (const [pid, list] of by) {
    list.sort((a, b) => a.from - b.from || a.ord - b.ord);
    let cur: Grp | null = null;
    for (const x of list) {
      if (cur && x.from - before <= cur.in) {
        cur.last = x;
        cur.in = Math.max(cur.in, x.to + after);
        continue;
      }
      if (cur) rows.push(rowOf(day, cur, { mode: 'own' }, fixes));
      cur = { first: x, last: x, who: pid, out: x.from - before, in: x.to + after };
    }
    if (cur) rows.push(rowOf(day, cur, { mode: 'own' }, fixes));
  }
  // of the post: per duty and row, the chain of the numbers in time order; the same person in a row = one row
  const lanes = [...new Set(steps.filter((x) => x.mode === 'post').map((x) => x.block + '|' + x.lane))];
  for (const b of lanes) {
    const chain = steps
      .filter((x) => x.mode === 'post' && x.block + '|' + x.lane === b)
      .sort((x, y) => x.from - y.from || x.ord - y.ord);
    const gs: Grp[] = [];
    for (const x of chain) {
      const g = gs[gs.length - 1];
      if (g && g.who === x.pid) {
        g.last = x;
      } else gs.push({ first: x, last: x, who: x.pid, out: 0, in: 0 });
    }
    gs.forEach((g, i) => {
      g.out = i === 0 ? g.first.from - before : g.first.from;
      g.in = i === gs.length - 1 ? g.last.to + after : gs[i + 1].first.from;
    });
    gs.forEach((g, i) =>
      rows.push(
        rowOf(
          day,
          g,
          {
            mode: 'post',
            owner: gs[0].who,
            take: i > 0,
            give: i < gs.length - 1,
            next: i < gs.length - 1 ? gs[i + 1].who : undefined,
          },
          fixes,
        ),
      ),
    );
  }
  return rows.sort((a, b) => a.out - b.out || a.id.localeCompare(b.id));
}

/**
 * Now: the number that runs (`cur`), the next (`next`) and the previous (`prev`) per owner of the weapon, and who
 * holds a weapon of another owner (`holding`). The duty day that started yesterday still runs after midnight, and
 * tomorrow's takes the weapon out before the cycle starts (margin).
 */
export interface ArmLive {
  rows: ArmRow[];
  cur: Map<number, ArmRow>;
  next: Map<number, ArmRow>;
  prev: Map<number, ArmRow>;
  holding: Map<number, ArmRow>;
}
/** The live state of the weapons at `today` and `hm` («ΩΩ:ΛΛ»). */
export function armedLive(s: ArmState, today: ISODate, hm: string): ArmLive {
  const rows = [-1, 0, 1].flatMap((i) => armedRows(s, addDays(today, i)));
  const now = dayNo(today) * 1440 + +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
  const at = (r: ArmRow, m: number) => dayNo(r.day) * 1440 + m;
  const cur = new Map<number, ArmRow>(),
    next = new Map<number, ArmRow>(),
    prev = new Map<number, ArmRow>(),
    holding = new Map<number, ArmRow>();
  for (const r of rows) {
    const o = at(r, r.out),
      i = at(r, r.in);
    if (o <= now && now < i) {
      const c = cur.get(r.owner);
      if (!c || at(c, c.out) < o) cur.set(r.owner, r);
      if (r.who !== r.owner) holding.set(r.who, r);
    } else if (o > now) {
      const c = next.get(r.owner);
      if (!c || at(c, c.out) > o) next.set(r.owner, r);
    } else {
      const c = prev.get(r.owner);
      if (!c || at(c, c.in) < i) prev.set(r.owner, r);
    }
  }
  return { rows, cur, next, prev, holding };
}
/** Minutes from midnight of the day of `row` to the moment `today` + `hm` (to compare with `out` / `in`). */
export const nowIn = (row: Pick<ArmRow, 'day'>, today: ISODate, hm: string) =>
  (dayNo(today) - dayNo(row.day)) * 1440 + +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
/** The row that matches a correction or an id (undefined when the id has no valid date). */
export const rowById = (s: ArmState, id: string): ArmRow | undefined => {
  const d = id.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? armedRows(s, d).find((r) => r.id === id) : undefined;
};
