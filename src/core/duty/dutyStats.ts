// Duty statistics: totals per person, per kind, and per month.
//
// Purpose: `dutyStats` (cached per guards, log and holidays), `emptyStat`, `statOf`, `baseTotal`, `monthStats`,
//   `dutyMonths`.
// Does NOT: order people (fairness.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: The previous duties (without a date) are added to the totals as the baseline, not to the calendar.
// Covering tests: test/duty-fairness.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import type { ISODate } from '../lib/dates';
import { dutyType } from './capability';
import { NO_LOG } from './dutyIndex';
import { isHol } from './holidays';
import { postBy } from './posts';
import type { DutyKind } from '../model/duty';
import type { Guards } from '../model/dutyRules';
import type { DutyLog } from '../model/records';
import type { Settings } from '../model/settings';
import type { AppState, Baseline } from '../model/state';

/**
 * Duty totals of one person. `log`: k = post, empty for a duty without a post (from Excel); `kind` = kind. `byKind`:
 * per kind, and per own duty («b:» + id, counts as its own); `log.t`: the own duty of the post.
 */
export interface DutyStat {
  byKind: Record<string, number>;
  total: number;
  hol: number;
  last: ISODate | null;
  lastHol: ISODate | null;
  log: { d: ISODate; k: string; kind: DutyKind; h: boolean; t?: string }[];
}

// Per duty calendar, duties without a post and holiday list: if the holidays change, the holidays of everyone are
// counted again.
const statsCache = new WeakMap<
  Guards,
  { hol: Settings['holidays']; off: Settings['holidaysOff']; log: DutyLog; st: Map<number, DutyStat> }
>();

/** A person with no duties. */
export const emptyStat = (): DutyStat => ({ byKind: {}, total: 0, hol: 0, last: null, lastHol: null, log: [] });

/** Duty totals of everyone (`DutyStat`), cached per calendar, log and holiday lists. */
export function dutyStats(s: AppState): Map<number, DutyStat> {
  const c = statsCache.get(s.guards);
  const log = s.dutyLog || NO_LOG;
  if (c && c.hol === s.settings.holidays && c.off === s.settings.holidaysOff && c.log === log)
    return withBaseline(s, c.st);
  const st = new Map<number, DutyStat>();
  const one = (pid: number, d: ISODate, k: string, kind: DutyKind, h: boolean) => {
    let x = st.get(pid);
    if (!x) {
      x = emptyStat();
      st.set(pid, x);
    }
    x.byKind[kind] = (x.byKind[kind] || 0) + 1;
    x.total++;
    const t = k ? dutyType(s, k, kind) : kind;
    if (t !== kind) x.byKind[t] = (x.byKind[t] || 0) + 1;
    if (h) {
      x.hol++;
      x.lastHol = d;
    }
    x.last = d;
    x.log.push(t !== kind ? { d, k, kind, h, t } : { d, k, kind, h });
  };
  for (const d of [...new Set([...Object.keys(s.guards), ...Object.keys(log)])].sort()) {
    const g = s.guards[d] || {};
    const h = isHol(s.settings, d);
    for (const k in g) {
      const post = postBy(s, k);
      if (post) one(g[k], d, k, post.kind, h);
    }
    for (const e of log[d] || []) one(e.pid, d, '', e.kind, h);
  }
  statsCache.set(s.guards, { hol: s.settings.holidays, off: s.settings.holidaysOff, log, st });
  return withBaseline(s, st);
}

// Previous duties (without a date) are added to the totals, not to the calendar; the result of `withBaseline` is cached
// per baseline object.
const baseCache = new WeakMap<object, { from: Map<number, DutyStat>; out: Map<number, DutyStat> }>();

/** Total of the previous duties (the baseline) without the holidays. */
export const baseTotal = (b: Baseline | undefined) =>
  b ? Object.entries(b).reduce((a, [k, n]) => a + (k === 'hol' ? 0 : n || 0), 0) : 0;

function withBaseline(s: AppState, st: Map<number, DutyStat>): Map<number, DutyStat> {
  const base = s.baseline;
  if (!base || !Object.keys(base).length) return st;
  const c = baseCache.get(base);
  if (c && c.from === st) return c.out;
  const out = new Map(st);
  for (const [id, b] of Object.entries(base)) {
    const pid = Number(id);
    const x0 = st.get(pid) || emptyStat();
    const x: DutyStat = { ...x0, byKind: { ...x0.byKind } };
    for (const [k, n] of Object.entries(b)) if (k !== 'hol' && n) x.byKind[k] = (x.byKind[k] || 0) + n;
    x.total += baseTotal(b);
    x.hol += b.hol || 0;
    out.set(pid, x);
  }
  baseCache.set(base, { from: st, out });
  return out;
}

/** `DutyStat` of one person (empty when there are none). */
export const statOf = (s: AppState, pid: number) => dutyStats(s).get(pid) || emptyStat();

/**
 * Duty check per month (`ym` = 'YYYY-MM'): only the duties dated inside the month, without the previous ones
 * (baseline).
 */
export function monthStats(st: Map<number, DutyStat>, ym: string): Map<number, DutyStat> {
  const out = new Map<number, DutyStat>();
  for (const [pid, x] of st) {
    let m: DutyStat | null = null;
    for (const e of x.log) {
      if (e.d.slice(0, 7) !== ym) continue;
      if (!m) {
        m = emptyStat();
        out.set(pid, m);
      }
      m.byKind[e.kind] = (m.byKind[e.kind] || 0) + 1;
      m.total++;
      if (e.t) m.byKind[e.t] = (m.byKind[e.t] || 0) + 1;
      if (e.h) {
        m.hol++;
        m.lastHol = e.d;
      }
      m.last = e.d;
      m.log.push(e);
    }
  }
  return out;
}

/** The months that have duties (newest first). */
export const dutyMonths = (s: AppState): string[] =>
  [
    ...new Set(
      [
        ...Object.keys(s.guards).filter((d) => Object.keys(s.guards[d] || {}).length),
        ...Object.keys(s.dutyLog || {}).filter((d) => (s.dutyLog![d] || []).length),
      ].map((d) => d.slice(0, 7)),
    ),
  ]
    .sort()
    .reverse();
