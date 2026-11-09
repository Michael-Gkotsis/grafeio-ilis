// Duty rules, per-day plans and corrections: the types of AppState.rules/caps/guards and their defaults.
//
// Purpose: `Rules` (rest days, numbers, out rooms, «ΗΚΑΙ» time, armed minutes, week plan), `DayPlan`, `BackFix`,
//   `Guards`, `Caps` and `DEFAULT_RULES`.
// Does NOT: apply the rules (core/duty) or store them (src/main/db.ts).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: these are stored in the database (frozen contract): field names and meanings never change in place.
// Covering tests: test/rules.test.ts, test/returns.test.ts, test/dayplan.test.ts.
import type { ISODate } from '../lib/dates';
import type { DutyKind } from './duty';

/** Duties done: day → post key → person id (or number). */
export type Guards = Record<ISODate, Record<string, number>>;
/**
 * Per person: a kind (th, mg…) or the user's own duty («b:» + block id) → the reason for «does not do it», or null =
 * explicitly «does it» (despite Σ.Ι./post).
 */
export type CapKey = DutyKind | `b:${string}`;
/** Capabilities per person id, see CapKey. */
export type Caps = Record<number, Partial<Record<CapKey, string | null>>>;

/** The duty rules (kv «rules»). Each field notes its «Κ-…» number from the sergeant's rule table where it has one. */
export interface Rules {
  noConsecHol: boolean; // Κ-13
  restDays: number; // Κ-14
  numRest: number; // the same number again only after this many days (0 = no limit); which numbers: numRots
  // which numbers (0..3 = 1st..4th) have numRest (Michael, 1/11); missing = [2, 3] (3rd and 4th, as always)
  numRots?: number[];
  outRooms: Record<number, number[]>; // Κ-16: weekday → rooms that go out
  // «Αυστηρά Άοπλοι»: the unarmed first in the kitchen, then 2nd-3rd, then 1st-4th number; sentries only armed
  strictUnarmed?: boolean;
  // the order of «Αυστηρά Άοπλοι» (Michael, 1/11): 'mg' kitchen, 'mid' 2nd-3rd number, 'edge' 1st-4th number, 'b:' + id
  // of the user's own unarmed duty; missing = ['mg', 'mid', 'edge']
  strictOrder?: string[];
  // people new to the strength (Person.inOn) start from the average of holidays and duties on the day they came
  // (Michael, 1/11); missing/false = from 0
  newAvg?: boolean;
  // duty rotation (Michael, 18/10): everyone goes through all duties before repeating one; false = off
  rotate?: boolean;
  // OLD, no longer read (Michael, 1/11: one out time, the day's «Αρχή εξόδου» in week); kept so old data still loads
  outTime?: string;
  hkTime?: string; // «ΗΚΑΙ» time (HH:MM, default 08:00): whoever returns by then counts as present that day
  // armed duty (Michael, 24/10): the weapon comes out this many minutes before the number (default 15, armed.ts)
  armBefore?: number;
  armAfter?: number; // ... and goes back this many minutes after (default 15)
  // out/return times and training per weekday (getDay), only what differs from the default (shared/returns.ts)
  week?: Record<number, DayPlan>;
}
/**
 * Times of one day (Michael, 24/10): out = start of the out, backOut = return of the outs (same evening), backDn =
 * return of
 * the «ΔΝ» (next morning), train = morning training. As a change of one day (state.dayPlan) whatever is missing stays
 * as the weekday.
 */
export interface DayPlan {
  out?: string;
  backOut?: string;
  backDn?: string;
  train?: boolean;
}
/**
 * Correction of one person's return (Michael, 24/10), when something changed by word of mouth: day = the day of his
 * «ΔΝ»/out; stay = he does not return, he carries on; at = he returns on the day and time given. id: «pid:day» (one
 * correction per person and day). why is mandatory.
 */
export interface BackFix {
  id: string;
  pid: number;
  day: ISODate;
  stay?: true;
  at?: { day: ISODate; time: string };
  why: string;
}
/** The numbers (3rd and 4th) that have numRest when Rules.numRots is missing. */
export const DEFAULT_NUM_ROTS = [2, 3];
/** The order of «Αυστηρά Άοπλοι» when Rules.strictOrder is missing. */
export const DEFAULT_STRICT_ORDER = ['mg', 'mid', 'edge'];
/** Rules of a new installation. */
export const DEFAULT_RULES: Rules = {
  noConsecHol: true,
  restDays: 1,
  numRest: 3,
  outRooms: { 6: [1, 2, 3, 4], 0: [5, 6, 7, 8] },
};
