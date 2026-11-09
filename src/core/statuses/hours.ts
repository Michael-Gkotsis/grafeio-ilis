// Times in leaves: the departure time on the first day and the return time on the last, plus the time helpers.
//
// Purpose: which status kinds have times, what the two times are called, minutes since midnight, a time read from
//   an Excel cell, the text of a leave's times, «back by» and the date-range text with times.
// Does NOT: hold the times (they are fields of Status) or decide the outs (core/outs uses `backBy`).
// Owner layer: core/statuses (no fs, no Electron, no React).
// Why: times are optional: without a time everything stays as before (the leave covers the whole days from–to).
// @decision Michael 13/10: departure time on the first day, return time on the last.
// Covering tests: test/leave-hours.test.ts, test/return-hours.test.ts, test/morning-leave-end.test.ts.
import type { CellValue } from '../model/cells';
import type { Status, TypeKey } from '../model/status';
import { normTime } from '../lib/time';

export { normTime };

/**
 * Kinds that have times: the leaves (regular, honorary, sick), hospital, STEP and the prevented (KOL). Medical kinds
 * (ΕΥ, ΕΑ…), penalties and outs are whole days.
 * @decision Michael 18/10: «and for the other statuses where it matters».
 */
export const TIMED: TypeKey[] = ['LEAVE', 'HON', 'SICK', 'NOS', 'STEP', 'KOL'];
/** True when the kind carries times. */
export const hasTimes = (t: TypeKey) => TIMED.includes(t);
// Names of the two times: leaves use departure/return, hospital and STEP use admission/exit.
const IN_OUT: TypeKey[] = ['NOS', 'STEP'];
/** Greek names (nominative and genitive) of the first and second time for a kind. */
export const timeNames = (t?: TypeKey) =>
  t === 'KOL'
    ? { from: 'έναρξη', to: 'λήξη', fromG: 'έναρξης', toG: 'λήξης' }
    : t && IN_OUT.includes(t)
      ? { from: 'εισαγωγή', to: 'έξοδος', fromG: 'εισαγωγής', toG: 'εξόδου' }
      : { from: 'αναχώρηση', to: 'επιστροφή', fromG: 'αναχώρησης', toG: 'επιστροφής' };

/** Minutes since midnight. */
export const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

/**
 * Time from an Excel cell: an Excel time (fraction of a day, or a date with a time) or text such as «14:00». Returns
 * «HH:MM», or null when there is no time.
 */
export function cellTime(v: CellValue): string | null {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  if (v instanceof Date) {
    if (isNaN(+v)) return null;
    return hm(v.getUTCHours() * 60 + v.getUTCMinutes() + Math.round(v.getUTCSeconds() / 60));
  }
  if (typeof v === 'number') {
    if (v < 0) return null;
    // 14 or 1400 typed as a number; otherwise a fraction of the day (14:00 = 0.5833)
    if (Number.isInteger(v) && v <= 2400) return normTime(String(v)) || null;
    return hm(Math.round((v - Math.floor(v)) * 1440));
  }
  return normTime(v) || null;
}
const hm = (m: number) => {
  m = ((m % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};

/** A leave's times as text: «αναχώρηση 14:00, επιστροφή 22:00» (hospital: «εισαγωγή 10:00, έξοδος 18:00»). */
export function timesTxt(s: Pick<Status, 'fromTime' | 'toTime' | 'open'> & { type?: TypeKey }): string {
  const n = timeNames(s.type);
  return [s.fromTime && n.from + ' ' + s.fromTime, s.toTime && !s.open && n.to + ' ' + s.toTime]
    .filter(Boolean)
    .join(', ');
}
/**
 * Is the person back by `m` (minutes since midnight of day `d`)? Only on the last day and only with a return time:
 * from then on the day is theirs (e.g. return Wednesday 06:00 → on Wednesday the out works normally). Without a time
 * the last day counts whole, as before.
 * @decision Michael 18/10
 */
export const backBy = (s: Pick<Status, 'type' | 'to' | 'toTime' | 'open'>, d: string, m: number) =>
  !!s.toTime && !s.open && s.to === d && hasTimes(s.type) && mins(s.toTime) <= m;
/** Date range «14/10–17/10»; with times «14/10 14:00–17/10 22:00» (the same day: «14/10 08:00–12:00»). */
export function rangeHm(
  s: Pick<Status, 'from' | 'to' | 'fromTime' | 'toTime' | 'open'>,
  dm: (d: string) => string,
): string {
  const back = s.toTime && !s.open ? s.toTime : '';
  const a = dm(s.from) + (s.fromTime ? ' ' + s.fromTime : '');
  if (s.to === s.from) return a + (back ? '–' + back : '');
  return a + '–' + dm(s.to) + (back ? ' ' + back : '');
}
