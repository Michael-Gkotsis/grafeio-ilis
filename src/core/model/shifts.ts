// Shifts («βάρδιες») inside a duty cycle: the types, the slot calculation and the check of the user's own shifts.
//
// Purpose: `ShiftDef`/`ShiftOwn`, the default 2-hour rotation `ROT`, `cleanShift`, `shiftSlots`, `shiftList`,
//   `shiftReport` (overlaps, gaps, empty numbers) and `hoursTxt`.
// Does NOT: know posts or blocks (blocks.ts) or read the duty start from Settings (settingsAccess.ts dutyStartOf).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: the printed hours of every post come from here, and the golden «ΦΡΟΥΡΑ» outputs must not change by one byte.
// @decision Michael 20/10: shifts per duty. @decision Michael 24/10: «Δικές μου βάρδιες» (own shifts).
// Covering test: test/shifts.test.ts.
import { normTime } from '../lib/time';

/** 2-hour shifts, cycle 14:00 → 14:00 (sample «ΦΡΟΥΡΑ»): the defaults when the duty has no shifts of its own. */
export const ROT = [
  ['14:00-16:00', '22:00-00:00', '06:00-08:00'],
  ['16:00-18:00', '00:00-02:00', '08:00-10:00'],
  ['18:00-20:00', '02:00-04:00', '10:00-12:00'],
  ['20:00-22:00', '04:00-06:00', '12:00-14:00'],
];
// Shifts per duty (Michael, 20/10): every how many minutes the number changes, within which hours of the cycle (empty =
// the whole cycle, from the start of the duty to the same hour next day). The numbers share the shifts in turn.
// «Δικές μου βάρδιες» (Michael, 24/10): with list, the sergeant writes the shifts himself and chooses which number (n,
// from 0) does each one; list wins over every/from/to, which stay only so he can go back to «κάθε τόσες ώρες» without
// retyping them.
/** One own shift: from–to as HH:MM (to may be on the next day) and the number n (from 0) that does it. */
export interface ShiftOwn {
  from: string;
  to: string;
  n: number;
}
/**
 * Shifts of a duty: every = minutes per shift, from/to = hours of the cycle, list = own shifts (wins over the rest).
 */
export interface ShiftDef {
  every: number;
  from?: string;
  to?: string;
  list?: ShiftOwn[];
}
/** At most this many own shifts per duty. */
export const MAX_SHIFT_OWN = 48;
/** True when the duty has shifts (every > 0 or an own list). */
export const hasShift = (sh?: ShiftDef | null): sh is ShiftDef => !!sh && (sh.every > 0 || !!sh.list?.length);
/** When the duty cycle starts if Settings.dutyStart is empty. */
export const DEFAULT_DUTY_START = '14:00';
/** The "every N minutes" choices of the settings. */
export const SHIFT_EVERY = [60, 90, 120, 180, 240, 360, 480, 720];
const hhmm = (m: number) =>
  String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0') +
  ':' +
  String(((m % 60) + 60) % 60).padStart(2, '0');
/** Minutes from midnight of an HH:MM time. */
export const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
/** True for a well-formed HH:MM time. */
export const okT = (t?: string) => !!t && /^\d\d:\d\d$/.test(t);
/** A valid own shift: two different HH:MM times (the same hour would mean 0 or 24 hours: doubtful, not accepted). */
export const okOwn = (x: ShiftOwn) => okT(x.from) && okT(x.to) && x.from !== x.to;
// Minutes from the start of the cycle (start) to time t, 0..1439: the order inside the cycle
const cycPos = (start: string, t: string) => (((toMin(t) - toMin(start)) % 1440) + 1440) % 1440;
const ownLen = (x: ShiftOwn) => (((toMin(x.to) - toMin(x.from)) % 1440) + 1440) % 1440;
/**
 * Cleans shifts before saving: times as HH:MM, bad rows dropped, the number inside the duty's numbers (count), at most
 * 48 rows. null = no shifts (neither every nor a list).
 */
export function cleanShift(sh: ShiftDef | null | undefined, count: number): ShiftDef | null {
  if (!sh) return null;
  const list = (sh.list || [])
    .flatMap((x) => {
      const a = normTime(x.from),
        b = normTime(x.to);
      return a && b && a !== b
        ? [{ from: a, to: b, n: Math.min(Math.max(0, Math.round(+x.n) || 0), Math.max(0, count - 1)) }]
        : [];
    })
    .slice(0, MAX_SHIFT_OWN);
  const every = Math.round(sh.every);
  if (!(every > 0) && !list.length) return null;
  return {
    every: every > 0 ? every : 120,
    ...(normTime(sh.from) ? { from: normTime(sh.from)! } : {}),
    ...(normTime(sh.to) ? { to: normTime(sh.to)! } : {}),
    ...(list.length ? { list } : {}),
  };
}
/**
 * The shifts of all numbers: [number][shift] = «14:00-16:00». The last one is cut at the end of the hours.
 * With own shifts: per number, in cycle order from start; a number without a shift gets [].
 */
export function shiftSlots(start: string, sh: ShiftDef, n: number): string[][] {
  const out: string[][] = Array.from({ length: Math.max(1, n) }, () => []);
  if (sh.list?.length) {
    const own = sh.list
      .filter((x) => okOwn(x) && x.n >= 0 && x.n < out.length)
      .sort((a, b) => cycPos(start, a.from) - cycPos(start, b.from));
    for (const x of own) out[Math.floor(x.n)].push(x.from + '-' + x.to);
    return out;
  }
  const a = toMin(okT(sh.from) ? sh.from! : start);
  const b0 = toMin(okT(sh.to) ? sh.to! : okT(sh.from) ? sh.from! : start);
  const len = (((b0 - a) % 1440) + 1440) % 1440 || 1440;
  const ev = Math.max(15, sh.every || 120);
  for (let t = 0, j = 0; t < len; t += ev, j++)
    out[j % out.length].push(hhmm(a + t) + '-' + hhmm(a + Math.min(len, t + ev)));
  return out;
}
/**
 * «Ξεκίνα από “κάθε 2 ώρες”»: the every-N-hours shifts as a list, in time order (from «Από» or the start), with their
 * number.
 */
export function shiftList(start: string, sh: ShiftDef, n: number): ShiftOwn[] {
  const every = { ...sh };
  delete every.list;
  const from = okT(sh.from) ? sh.from! : start;
  return shiftSlots(start, every, n)
    .flatMap((t, i) => t.map((x) => ({ from: x.slice(0, 5), to: x.slice(6), n: i })))
    .sort((a, b) => cycPos(from, a.from) - cycPos(from, b.from))
    .slice(0, MAX_SHIFT_OWN);
}
/** Hours with a Greek decimal comma: 7 ώρες, 2,5 ώρες, 1 ώρα. */
export const hoursTxt = (min: number) => {
  const h = Math.round((min / 60) * 100) / 100;
  return String(h).replace('.', ',') + (h === 1 ? ' ώρα' : ' ώρες');
};
/**
 * Check of the own shifts (Michael, 24/10: a warning, it does not block): which overlap, which hour of the cycle nobody
 * guards, which number has no shift, and how many shifts/hours each number has. a, b = positions in the list.
 */
export interface ShiftReport {
  overlaps: { a: number; b: number; from: string; to: string }[];
  gaps: { from: string; to: string }[];
  empty: number[];
  per: { n: number; count: number; min: number }[];
}
export function shiftReport(start: string, list: ShiftOwn[], count: number): ShiftReport {
  const ok = list.map((x, i) => [x, i] as const).filter(([x]) => okOwn(x));
  const seg = ([x]: readonly [ShiftOwn, number]) => {
    const a = cycPos(start, x.from);
    return [a, a + ownLen(x)] as const;
  };
  const overlaps: ShiftReport['overlaps'] = [];
  for (let i = 0; i < ok.length; i++)
    for (let j = i + 1; j < ok.length; j++) {
      const [a1, e1] = seg(ok[i]),
        [a2, e2] = seg(ok[j]);
      // cycle: the second shift and one day before or after (a shift passing the end of the cycle lands on its start)
      for (const d of [-1440, 0, 1440]) {
        const lo = Math.max(a1, a2 + d),
          hi = Math.min(e1, e2 + d);
        if (hi > lo)
          overlaps.push({ a: ok[i][1], b: ok[j][1], from: hhmm(toMin(start) + lo), to: hhmm(toMin(start) + hi) });
      }
    }
  const cov = new Uint8Array(1440);
  for (const o of ok) {
    const [a, e] = seg(o);
    for (let m = a; m < e; m++) cov[m % 1440] = 1;
  }
  const runs: [number, number][] = []; // [start, end) of uncovered minutes
  for (let m = 0; m < 1440; m++)
    if (!cov[m]) {
      const r = runs[runs.length - 1];
      if (r && r[1] === m) r[1] = m + 1;
      else runs.push([m, m + 1]);
    }
  // a gap running from the end of the cycle to the start of the next one is a single gap
  if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] === 1440) {
    const f = runs.shift()!;
    runs[runs.length - 1][1] = 1440 + f[1];
  }
  const gaps = ok.length ? runs.map(([a, e]) => ({ from: hhmm(toMin(start) + a), to: hhmm(toMin(start) + e) })) : [];
  const per = Array.from({ length: Math.max(1, count) }, (_, n) => {
    const own = ok.filter(([x]) => Math.floor(x.n) === n);
    return { n, count: own.length, min: own.reduce((t, [x]) => t + ownLen(x), 0) };
  });
  return { overlaps, gaps, empty: per.filter((x) => !x.count).map((x) => x.n), per };
}
