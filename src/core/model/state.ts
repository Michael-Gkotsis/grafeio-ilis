// The whole application state (AppState) and its empty value.
//
// Purpose: `AppState`, `AuditEntry`, `Baseline`, `emptyState`, plus the two state-level helpers `hkLvOn` and
//   `markOldRequests`.
// Does NOT: load, save or change state (src/main/db.ts, core/commands) or hold the record types themselves.
// Owner layer: core/model (no fs, no Electron, no React).
// Why: AppState is the one shape that main, worker and renderer exchange; every field is a frozen data contract.
// Covering tests: test/rules.test.ts, test/requests-approve.test.ts, test/hkai.test.ts.
import type { ISODate } from '../lib/dates';
import type { HdDoc } from './documents';
import type { BackFix, Caps, DayPlan, Guards, Rules } from './dutyRules';
import { DEFAULT_RULES } from './dutyRules';
import type { DutyKind } from './duty';
import type { HkaiManual } from './hkaiSettings';
import type { Cadre, CadreAbs } from './cadreRecord';
import type { Person } from './person';
import type { DutyFix, DutyLog, Note, PersonRequest, WeaponMove } from './records';
import type { Settings } from './settings';
import { DEFAULT_SETTINGS } from './settings';
import { hkOn } from './settingsAccess';
import type { Status } from './status';

/**
 * 3. ΑΔΕΙΕΣ per day (Michael, 24/10): what was set for the day (hkaiManual[d].lv), otherwise the default of section
 * «lv».
 */
export const hkLvOn = (s: Pick<AppState, 'settings' | 'hkaiManual'>, d: ISODate): boolean =>
  s.hkaiManual?.[d]?.lv ?? hkOn(s.settings, 'lv');
/** One line of the history («Ιστορικό»): what was done, when, which files it wrote, and whether it can be undone. */
export interface AuditEntry {
  id: number;
  at: string; // HH:MM
  day: ISODate;
  text: string;
  files: string[];
  source: 'app' | 'auto' | 'import' | 'excel';
  undoable: boolean;
  undone: boolean;
}

/** The whole state. Fields marked optional are missing in data saved by older versions. */
export interface AppState {
  people: Person[];
  statuses: Status[];
  guards: Guards;
  caps: Caps;
  rules: Rules;
  settings: Settings;
  printed: Record<ISODate, string>;
  baseline: Record<number, Baseline>; // duties before the app (without a date)
  hkaiManual: Record<ISODate, HkaiManual>;
  cadreList: Cadre[]; // cadre with names (if empty, the «ΗΚΑΙ» takes the numbers of Settings)
  cadreAbs: CadreAbs[]; // cadre absences
  requests: PersonRequest[]; // soldiers' requests («ΗΚΑΙ», 5. ΑΙΤΗΣΕΙΣ)
  dutyLog: DutyLog; // duties with a date but no post (from an Excel with a bare «Θ», «Μ», «Σ»)
  nightTraining: Record<ISODate, true>; // days with night training: they do not count in an out ban
  weaponLog: WeaponMove[]; // weapons out of and back into the rack (tab «Οπλισμός»)
  dutyFix: DutyFix[]; // hand corrections of the times of armed duties, with a reason (kv «dutyFix», shared/armed.ts)
  // notes of the office: general or for a soldier/cadre member, with an optional reminder (shared/notes.ts)
  notes: Note[];
  dayPlan?: Record<ISODate, DayPlan>; // change of times/training for one day, on top of the weekday (shared/returns.ts)
  backFix?: BackFix[]; // return corrections per person, with a reason (kv «backFix», shared/returns.ts)
  // remark on an out/staying person that day: «ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)» (shared/weekend.ts)
  outNotes?: Record<ISODate, Record<number, string>>;
  // cells of the prevented calendar written by hand (shared/imer.ts): in the calendar only
  imer?: Record<ISODate, Record<number, string>>;
  hd?: Record<ISODate, HdDoc>; // «Ημερήσιες Διαταγές» that were made, as made (shared/hd.ts)
  lastExpire: ISODate | ''; // when expired items were last written to the history (for the days the app was closed)
}
/**
 * Once, on the first day the version with approval for all requests opens (db.ts): requests that are not leaves, have
 * no
 * decision and a date before today get old, so a list of old ones does not wake up. Leave requests always waited for an
 * answer: they do not change. Returns null when it already ran (settings.reqFrom is set).
 */
export function markOldRequests(s: AppState, today: ISODate): AppState | null {
  if (s.settings.reqFrom) return null;
  const requests = s.requests.map((r) =>
    !r.leave && !r.decision && !r.old && r.date < today ? { ...r, old: true } : r,
  );
  return { ...s, requests, settings: { ...s.settings, reqFrom: today } };
}
/** Previous duties per kind (+ how many on weekends/holidays), written by hand. */
export type Baseline = Partial<Record<DutyKind, number>> & { hol?: number };
/** A new empty state with default rules and a deep copy of the default settings. */
export const emptyState = (): AppState => ({
  people: [],
  statuses: [],
  guards: {},
  caps: {},
  rules: { ...DEFAULT_RULES },
  settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  printed: {},
  baseline: {},
  hkaiManual: {},
  cadreList: [],
  cadreAbs: [],
  requests: [],
  notes: [],
  dutyLog: {},
  nightTraining: {},
  weaponLog: [],
  dutyFix: [],
  dayPlan: {},
  backFix: [],
  outNotes: {},
  imer: {},
  hd: {},
  lastExpire: '',
});
