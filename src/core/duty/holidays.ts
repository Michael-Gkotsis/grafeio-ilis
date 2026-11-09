// Holidays of a year: the official ones, the ones the user added and minus the ones the user removed.
//
// Purpose: `holidaysOf` (date to name for a year, cached), `holOf`, `isHol` (weekend or holiday), `holName`.
// Does NOT: read statuses or posts.
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core; low layer.
// Why: The official holidays come from dates.ts (fixed ones and the ones that depend on Easter); settings.holidays adds
//   and settings.holidaysOff removes. The result is cached per lists and year.
// Covering tests: test/holidays.test.ts, test/rules.test.ts.
import { greekHolidays, type ISODate, isWeekend } from '../lib/dates';
import type { Settings } from '../model/settings';

const holIdx = new WeakMap<object, WeakMap<object, Map<number, Map<ISODate, string>>>>();

const NO_OFF: ISODate[] = [];

/**
 * The holidays of a year, date to name. The official ones come out for each year (fixed ones and the ones that depend
 * on Easter, dates.ts), plus the ones the user added (`settings.holidays`) and minus the ones the user removed
 * (`settings.holidaysOff`). Cached per lists and year.
 */
export function holidaysOf(settings: Settings, year: number): Map<ISODate, string> {
  const add = settings.holidays || {},
    off = settings.holidaysOff || NO_OFF;
  let a = holIdx.get(add);
  if (!a) {
    a = new WeakMap();
    holIdx.set(add, a);
  }
  let b = a.get(off);
  if (!b) {
    b = new Map();
    a.set(off, b);
  }
  let m = b.get(year);
  if (!m) {
    const no = new Set(off);
    m = new Map();
    for (const [d, n] of Object.entries(greekHolidays(year))) if (!no.has(d)) m.set(d, n);
    for (const [d, n] of Object.entries(add)) if (+d.slice(0, 4) === year) m.set(d, n);
    b.set(year, m);
  }
  return m;
}

/** Name of the holiday on a date, or undefined. */
export const holOf = (settings: Settings, d: ISODate) => holidaysOf(settings, +d.slice(0, 4)).get(d);

/** True on a weekend or a holiday. */
export const isHol = (settings: Settings, d: ISODate) => isWeekend(d) || holOf(settings, d) != null;

/** Name of the holiday on a date, «ΣΚ» on a plain weekend, empty on a normal day. */
export const holName = (settings: Settings, d: ISODate) => holOf(settings, d) || (isWeekend(d) ? 'ΣΚ' : '');
