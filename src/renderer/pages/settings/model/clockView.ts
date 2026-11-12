// Pure rules of the «Ώρα και ζώνη ώρας» card: the zone mode, the correction buttons and the facts shown.
// Purpose: `clockView` helpers for `useClock`, `ClockCard` and their test.
// Does NOT: render anything, touch React, read the clock for itself (the hook passes the moment in) or save.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4) so the rules are
//   testable without a render.
// @decision The time zone and the correction apply at once (like «Εμφάνιση») and are saved in the settings
//   (`settings.tz`, `settings.clockFix`, minutes, at most ±`FIX_MAX`).
// Covering test: test/settings-clock-view.test.ts.
import { DEFAULT_TZ, FIX_MAX, zoneOffset, type Parts } from '../../../../shared/dates';

/** The zones offered when the browser cannot list them. */
export const ZONES_FALLBACK = [
  'Europe/Athens',
  'Europe/Nicosia',
  'Europe/Berlin',
  'Europe/London',
  'Europe/Istanbul',
  'Europe/Sofia',
  'Europe/Rome',
  'Europe/Paris',
  'Africa/Cairo',
  'Asia/Dubai',
  'America/New_York',
  'UTC',
];

/** All the zones the browser knows (with «UTC» added), or `ZONES_FALLBACK` when it cannot list them. */
export const zoneList = (): string[] => {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
    if (list?.length) return list.includes('UTC') ? list : [...list, 'UTC'];
  } catch {
    /* παλιό Chromium */
  }
  return ZONES_FALLBACK;
};

/** «+5′», «−12′» or «0′»: a correction in minutes. */
export const fixTxt = (n: number): string => (n === 0 ? '0′' : (n > 0 ? '+' : '−') + Math.abs(n) + '′');

/** The history text of a correction. */
export const fixText = (n: number): string => 'Διόρθωση ώρας ' + fixTxt(n);

/** The correction after a click of ±1 (not clamped, the button is off at the limit) or ±60 (clamped to ±`FIX_MAX`). */
export const fixAfter = (fix: number, delta: -60 | -1 | 1 | 60): number =>
  delta === -60 ? Math.max(-FIX_MAX, fix - 60) : delta === 60 ? Math.min(FIX_MAX, fix + 60) : fix + delta;

/** «08:05» for a wall-clock time. */
export const hm = (p: Parts): string => String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0');

/** ISODate of a wall-clock time. */
export const isoOf = (p: Parts): string =>
  p.y + '-' + String(p.mo).padStart(2, '0') + '-' + String(p.d).padStart(2, '0');

/** Which of the three choices is on: Windows' zone, another zone, or Athens (the default, an empty `tz`). */
export const clockMode = (tz: string, pickOther: boolean): 'win' | 'other' | 'athens' =>
  tz === 'system' ? 'win' : pickOther || (tz && tz !== DEFAULT_TZ) ? 'other' : 'athens';

/**
 * UTC offset of the app's zone in ms: Windows' own when `tz` is «system», else the zone's at `ms` (the moment plus the
 * correction, so the summer time switch moves with it).
 */
export const appOffset = (tz: string, ms: number, winOff: number): number =>
  tz === 'system' ? winOff : zoneOffset(tz || DEFAULT_TZ, ms);

/** « θερινή» or « χειμερινή» for the Athens zone; nothing for another zone. */
export const dstWord = (tz: string, off: number, now: Parts): string =>
  !tz || tz === DEFAULT_TZ ? (off > zoneOffset(DEFAULT_TZ, Date.UTC(now.y, 0, 1)) ? ' θερινή' : ' χειμερινή') : '';
