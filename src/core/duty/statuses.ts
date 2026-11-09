// Statuses of a person on a day: the index, the order, the hour helpers that need no outs and the small status texts.
//
// Purpose: `statusesOf` / `statusesOn` (cached lookups), `statusesFrom` (statuses from a minute on), `statusesNow`,
//   `awayNow`, `notesOn` / `noteTxt`, `dutyMin` / `hkMin` (cycle start and ΗΚΑΙ time in minutes), `isRecordExpiredOn`,
//   `untilTxt`, `leftAfter` / `notLeftYet`.
// Does NOT: know about outs: `statusesAt` and `outMinOn` need the return times of core/outs and live in presence.ts.
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core; low layer. core/outs imports
//   `statusesOn` and `hkMin` from here, so this file must not import core/outs (that is what closes the old
//   rules/returns/weekend cycle).
// Why: The status index is built once per statuses array (commands always build a new array, they never change one),
//   and the answer to the same question is kept per array, day and person because the auto-fill asks it for every
//   candidate in every post.
// Covering tests: test/rules.test.ts, test/return-hours.test.ts, test/leave-hours.test.ts, test/golden-outputs.test.ts.
import { addDays, dm, type ISODate } from '../lib/dates';
import type { Rules } from '../model/dutyRules';
import type { UserLists } from '../model/lists';
import type { Settings } from '../model/settings';
import { dutyStartOf } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import { coversDay, RECORD_CATS, type Status, TYPE_KEYS, type TypeKey, TYPES } from '../model/status';
import { notesOf, statusLbl } from '../people/kinds';
import { backBy, mins } from '../statuses/hours';

/** Sort key of a status kind: its position in `TYPE_KEYS`. */
export const ORDER = (k: TypeKey) => TYPE_KEYS.indexOf(k);

const byPidIdx = new WeakMap<Status[], Map<number, Status[]>>();

const NONE: Status[] = [];

/**
 * All the statuses of a person, through an index per person: every out/ΔΝ is a status, so a year has tens of thousands.
 * Built once for each statuses array (commands always build a new array, they never change one).
 */
export function statusesOf(statuses: Status[], pid: number): Status[] {
  let m = byPidIdx.get(statuses);
  if (!m) {
    m = new Map();
    for (const x of statuses) {
      const l = m.get(x.pid);
      if (l) l.push(x);
      else m.set(x.pid, [x]);
    }
    byPidIdx.set(statuses, m);
  }
  return m.get(pid) || NONE;
}

const onIdx = new WeakMap<Status[], Map<ISODate, Map<number, Status[]>>>();

/**
 * All the active statuses of a person on a day, absences first. Pending penalties do not count (Κ-19).
 * The same question is asked again and again (every candidate in every post of the auto-fill), so the answer is kept
 * per array, day and person. The result is read-only.
 */
export function statusesOn(statuses: Status[], pid: number, date: ISODate): Status[] {
  let byDay = onIdx.get(statuses);
  if (!byDay) {
    byDay = new Map();
    onIdx.set(statuses, byDay);
  }
  let byPid = byDay.get(date);
  if (!byPid) {
    byPid = new Map();
    byDay.set(date, byPid);
  }
  let r = byPid.get(pid);
  if (!r) {
    r = statusesOf(statuses, pid).filter((s) => !s.pending && coversDay(s, date));
    r = r.length
      ? r.sort((a, b) => Number(!!TYPES[b.type].away) - Number(!!TYPES[a.type].away) || ORDER(a.type) - ORDER(b.type))
      : NONE;
    byPid.set(pid, r);
  }
  return r;
}

/**
 * The health notes that apply on `date`, for the card and for Ιατρικά › Σημειώσεις.
 * @decision Michael 4/11: «Μόνο σημείωση».
 */
export const notesOn = (s: Pick<AppState, 'statuses' | 'settings'>, pid: number, date: ISODate): Status[] =>
  notesOf(statusesOf(s.statuses, pid), s.settings.lists).filter((x) => !x.pending && coversDay(x, date));

/** Text of a note: its label plus «ως dd/mm» or «(χωρίς λήξη)». */
export const noteTxt = (x: Status, lists?: UserLists) =>
  statusLbl(x, lists) + (x.open ? ' (χωρίς λήξη)' : ' ως ' + dm(x.to));

/**
 * Default ΗΚΑΙ time of the day (`hkMin` turns it into minutes).
 * Times of return: the last day of a leave (or hospital, ΣΤΕΠ) with a return time counts only up to that time. Each
 * check has its own moment: the out starts at the «Αρχή εξόδου» of the day (`outMinOn`), the ΗΚΑΙ counts at
 * `rules.hkTime`, the duties at the start of the cycle, `settings.dutyStart` (per post `backBefore`). The first day
 * always counts whole, like every day without a time.
 * @decision Michael 18/10: the last day of a leave with a return time counts only up to that time.
 */
export const DEFAULT_HK_TIME = '08:00';

/** Start of the duty cycle in minutes (Ρυθμίσεις › Υπηρεσίες, default 14:00). */
export const dutyMin = (st?: Pick<Settings, 'dutyStart'> | null) => mins(dutyStartOf(st));

const timeOr = (t: string | undefined, def: string) => (t && /^\d\d:\d\d$/.test(t) ? t : def);

/** The ΗΚΑΙ time in minutes: `rules.hkTime`, default 08:00. */
export const hkMin = (r?: Pick<Rules, 'hkTime'> | null) => mins(timeOr(r?.hkTime, DEFAULT_HK_TIME));

/**
 * The statuses that apply on `date` from minute `m` on (minutes from midnight), without the ones that ended by then.
 */
export function statusesFrom(statuses: Status[], pid: number, date: ISODate, m: number): Status[] {
  const ss = statusesOn(statuses, pid, date);
  return ss.some((x) => backBy(x, date, m)) ? ss.filter((x) => !backBy(x, date, m)) : ss;
}

/**
 * Now: whoever returned today by the current time (`now`, minutes) is not absent any more in the Δυναμολόγιο, the
 * Άδειες and the Σήμερα. Other days: the whole day.
 * @decision Michael 20/10: «όταν κάποιος γυρνά, να γυρνά το state του στο κανονικό».
 */
export const statusesNow = (statuses: Status[], pid: number, date: ISODate, today: ISODate, now: number) =>
  date === today ? statusesFrom(statuses, pid, date, now) : statusesOn(statuses, pid, date);

/** A leave that has not ended yet now (today, `now` minutes). */
export const awayNow = (s: Status, today: ISODate, now: number) =>
  s.to > today || (s.to === today && !backBy(s, today, now));

export const untilTxt = (s: Status, date: ISODate) =>
  s.open ? ' (χωρίς λήξη)' : s.to === date ? '' : ' έως ' + dm(s.to);

/** True when a record status (see `RECORD_CATS`) ended on the day before `date`. */
export const isRecordExpiredOn = (s: Status, date: ISODate) =>
  !s.open && RECORD_CATS.includes(TYPES[s.type].cat) && s.to === addDays(date, -1);

// Ε1 (Michael, 1/11: «παρών ως να φύγει»): a leave, sick or honorary leave that starts on the day with a departure time
// after moment `m` does not count yet. In the ΗΚΑΙ count and in the Δύναμη / Σήμερα with the time (`statusesAt`).
// Duties, outs and the 3. ΑΔΕΙΕΣ stay as they were. Without a departure time: absent the whole day.
// @decision Michael 1/11: «παρών ως να φύγει».
const leftAfter = (x: Status, date: ISODate, m: number) =>
  TYPES[x.type].cat === 'abs' && x.from === date && !!x.fromTime && mins(x.fromTime) > m;

/** The statuses without the ones that have not started yet at moment `m` (see `leftAfter`). */
export const notLeftYet = (ss: Status[], date: ISODate, m: number): Status[] =>
  ss.some((x) => leftAfter(x, date, m)) ? ss.filter((x) => !leftAfter(x, date, m)) : ss;
