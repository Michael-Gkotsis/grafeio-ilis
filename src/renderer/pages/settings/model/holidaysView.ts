// Pure rules of the «Αργίες» card: the list of holidays, the old ones hidden, and what each button writes.
// Purpose: `holidaysView` helpers for `useHolidays`, `HolidaysCard` and their test.
// Does NOT: render anything, touch React or call `run` (model/useHolidays.ts does).
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/settings.ts (Phase 6, S4) so the rules are
//   testable without a render.
// @decision 10 §4β: Saturday and Sunday always count; the official holidays come out by themselves every year (the
//   movable ones from Easter); here the unit removes the ones that do not apply and adds its own.
// @decision UX Μ4: the past holidays are hidden; only from today on, with «Δείξε και τις παλιές».
// Covering test: test/settings-holidays-view.test.ts.
import type { Settings } from '../../../../shared/domain';
import { dmy, greekHolidays, type ISODate } from '../../../../shared/dates';

/** One holiday of the list: ISODate `k`, its name `v`, and `gen` for an official one (generated, not typed in). */
export interface HolidayRow {
  k: ISODate;
  v: string;
  gen: boolean;
}

/** What a button writes: the `settings` patch and the history text. */
export interface HolidayChange {
  patch: Partial<Settings>;
  text: string;
}

/**
 * The official holidays of this and the next year, as [ISODate, name] pairs.
 * @param today - ISODate, local app time; only its year is used
 */
export const generatedHolidays = (today: ISODate): [string, string][] => {
  const y = +today.slice(0, 4);
  return [y, y + 1].flatMap((yy) => Object.entries(greekHolidays(yy)));
};

/** Every holiday that counts, by date: the official ones the unit did not remove, then the unit's own. */
export const allHolidays = (settings: Settings, gen: [string, string][]): HolidayRow[] => {
  const off = settings.holidaysOff || [];
  return [
    ...gen.filter(([k]) => !off.includes(k) && !settings.holidays[k]).map(([k, v]) => ({ k, v, gen: true })),
    ...Object.entries(settings.holidays).map(([k, v]) => ({ k, v, gen: false })),
  ].sort((a, b) => a.k.localeCompare(b.k));
};

/** How many holidays are before today (the «Δείξε και τις παλιές (n)» count). */
export const pastCount = (all: HolidayRow[], today: ISODate): number => all.filter((x) => x.k < today).length;

/** The rows to show: all of them, or only today and later. */
export const shownHolidays = (all: HolidayRow[], today: ISODate, showOld: boolean): HolidayRow[] =>
  showOld ? all : all.filter((x) => x.k >= today);

/** The official holidays the unit removed (so they can be brought back). */
export const removedHolidays = (settings: Settings, gen: [string, string][]): [string, string][] => {
  const off = settings.holidaysOff || [];
  return gen.filter(([k]) => off.includes(k));
};

/** «Δεν ισχύει για εμάς» on an official one, «✕» on the unit's own. */
export function dropChange(settings: Settings, x: HolidayRow): HolidayChange {
  const text = 'αφαιρέθηκε η αργία ' + x.v + ' ' + dmy(x.k);
  if (x.gen) return { patch: { holidaysOff: [...(settings.holidaysOff || []), x.k] }, text };
  const h = { ...settings.holidays };
  delete h[x.k];
  return { patch: { holidays: h }, text };
}

/** «Επαναφορά» of a removed official holiday. */
export const restoreChange = (settings: Settings, k: ISODate, v: string): HolidayChange => ({
  patch: { holidaysOff: (settings.holidaysOff || []).filter((x) => x !== k) },
  text: 'ξανά αργία ' + v + ' ' + dmy(k),
});

/** «Πρόσθεσε»: the new holiday (also back on, if it was an official one that had been removed). */
export const addChange = (settings: Settings, d: ISODate, name: string): HolidayChange => ({
  patch: {
    holidays: { ...settings.holidays, [d]: name.trim() },
    holidaysOff: (settings.holidaysOff || []).filter((x) => x !== d),
  },
  text: 'νέα αργία ' + name.trim() + ' ' + dmy(d),
});
