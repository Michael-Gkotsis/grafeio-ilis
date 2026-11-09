// Out and return times of a day: the week table, the default row and the change of one day.
//
// Purpose: `weekRow`, `defaultRow`, `outTimesTxt`, `baseOf`, `dayTimes`, and the day names `onDay` / `theDay`.
// Does NOT: decide who returns when (returns.ts).
// Owner layer: core/outs (no fs, no Electron, no React); imports only from src/core; depends on core/duty/holidays.ts
//   only.
// Why: Times are read in one place: a day change wins over the weekday row, which wins over the default.
// Covering tests: test/dayplan.test.ts, test/return-hours.test.ts, test/returns.test.ts.
import { DOW_FULL, type ISODate, weekday } from '../lib/dates';
import { holOf } from '../duty/holidays';
import type { DayPlan, Rules } from '../model/dutyRules';
import type { AppState } from '../model/state';

/**
 * The times of one weekday: the out start, the return of the outs, the return of the ΔΝ and whether there is morning
 * training.
 */
export interface WeekRow {
  out: string;
  backOut: string;
  backDn: string;
  train: boolean;
}

/** Defaults: out 17:00, outs back 22:00, ΔΝ back 06:00, training from Monday to Saturday (not Sunday). */
export const defaultRow = (w: number): WeekRow => ({ out: '17:00', backOut: '22:00', backDn: '06:00', train: w !== 0 });

const okT = (t: unknown, def: string) => (typeof t === 'string' && /^\d\d:\d\d$/.test(t) ? t : def);

/** The row of a weekday (`w` = getDay, 0 = Sunday) with the defaults where something is missing. */
export function weekRow(r: Pick<Rules, 'week'> | undefined | null, w: number): WeekRow {
  const d = defaultRow(w),
    x = r?.week?.[w];
  return {
    out: okT(x?.out, d.out),
    backOut: okT(x?.backOut, d.backOut),
    backDn: okT(x?.backDn, d.backDn),
    train: typeof x?.train === 'boolean' ? x.train : d.train,
  };
}

/** The «Αρχή εξόδου» hours of the week in order, each once (for help texts: «17:00»). */
export const outTimesTxt = (r: Pick<Rules, 'week'> | undefined | null) =>
  [...new Set([1, 2, 3, 4, 5, 6, 0].map((w) => weekRow(r, w).out))].join(' / ');

/** The row of day `d` without the change of one day: the holidays (not the weekend) have no training. */
export function baseOf(s: Pick<AppState, 'rules' | 'settings'>, d: ISODate): WeekRow {
  const r = weekRow(s.rules, weekday(d));
  return holOf(s.settings, d) ? { ...r, train: false } : r;
}

/** The times of one day: the week row, the holiday name and the change of that day (`over`), if any. */
export interface DayTimes extends WeekRow {
  hol: string;
  over?: DayPlan;
}

/**
 * The out start, the return of the outs, the return of the ΔΝ and the morning training of a day: the change of one day,
 * else the weekday of the week table, else the default. The holidays have no training.
 * @decision Michael 24/10: hours of the outs per day.
 */
export function dayTimes(
  s: Pick<AppState, 'rules' | 'settings'> & Partial<Pick<AppState, 'dayPlan'>>,
  d: ISODate,
): DayTimes {
  const b = baseOf(s, d),
    o = s.dayPlan?.[d];
  return {
    out: okT(o?.out, b.out),
    backOut: okT(o?.backOut, b.backOut),
    backDn: okT(o?.backDn, b.backDn),
    train: typeof o?.train === 'boolean' ? o.train : b.train,
    hol: holOf(s.settings, d) || '',
    ...(o ? { over: o } : {}),
  };
}

// «το Σάββατο», «τη Δευτέρα», «την Κυριακή» (accusative, by `getDay`).
const ACC = ['την Κυριακή', 'τη Δευτέρα', 'την Τρίτη', 'την Τετάρτη', 'την Πέμπτη', 'την Παρασκευή', 'το Σάββατο'];

/** «την Κυριακή», «τη Δευτέρα»… (the accusative of the weekday). */
export const onDay = (d: ISODate) => ACC[weekday(d)];

/** «το Σάββατο», «η Δευτέρα»… (the nominative with its article). */
export const theDay = (d: ISODate) => (weekday(d) === 6 ? 'το ' : 'η ') + DOW_FULL[weekday(d)];
