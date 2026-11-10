// The moment a values table is measured at.
//
// Purpose: `atOf` (minutes of the day for ΗΚΑΙ time, the first out, now, a custom time or the strength's), `atText`
//   (the same in words) and `hhmm`.
// Does NOT: measure anything (valueEval.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model, core/duty,
//   core/weapons, core/statuses.
// Why: the same numbers can be asked at different moments, and the screen and the Excel must name and compute the
//   moment the same way.
// Covering tests: test/values.test.ts, test/one-exit-time.test.ts, test/report-blank-tags.test.ts.
import type { ISODate } from '../lib/dates';
import type { VAt } from '../model/reportTypes';
import type { AppState } from '../model/state';
import { hkMin } from '../duty/statuses';
import { outMinOn, strengthAt } from '../duty/presence';
import { hmOf } from '../weapons/armed';
import { mins } from '../statuses/hours';

/** Matches a custom time of day «hh:mm». */
export const AT_CUSTOM = /^([01]\d|2[0-3]):[0-5]\d$/;
/**
 * The moment (minutes of the day) a measurement is made at: the ΗΚΑΙ time, the first out of the day, now, a custom
 * time, or the time of the strength.
 */
export function atOf(
  s: Pick<AppState, 'rules' | 'settings'> & Partial<Pick<AppState, 'dayPlan'>>,
  at: VAt,
  d: ISODate,
  today: ISODate,
  now: number,
): number {
  if (at === 'hkai') return hkMin(s.rules);
  if (at === 'out') return outMinOn(s, d);
  if (at === 'now') return now;
  if (at && AT_CUSTOM.test(at)) return mins(at);
  return strengthAt(s.rules, d, today, now);
}
/** Minutes of the day as «hh:mm». */
export const hhmm = (m: number) => hmOf(m);
/** The moment in words, for the list («ώρα ΗΚΑΙ (hh:mm)», «τώρα»…). */
export function atText(
  s: Pick<AppState, 'rules' | 'settings'> & Partial<Pick<AppState, 'dayPlan'>>,
  at: VAt,
  hk = 'ΗΚΑΙ',
  d?: ISODate,
): string {
  if (at === 'hkai') return 'ώρα ' + hk + ' (' + hhmm(hkMin(s.rules)) + ')';
  if (at === 'out') return 'ώρα εξόδου της μέρας' + (d ? ' (' + hhmm(outMinOn(s, d)) + ')' : '');
  if (at === 'now') return 'τώρα';
  if (at && AT_CUSTOM.test(at)) return at;
  return 'όπως η Δύναμη';
}
