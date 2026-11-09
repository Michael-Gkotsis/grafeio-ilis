// The duty index: the dates each person has a duty, and the month limit built on it.
//
// Purpose: `dutyIndex` / `dutyIndexOf` (person to dates), `seatlessOn` (duty without a post, from Excel), `monthDuties`
//   / `monthBlock` / `monthTxt` (the «2 από 4 τον μήνα» limit of the cadre and the ΕΠΟΠ/ΟΒΑ).
// Does NOT: apply the rest and numbering rules (dutyCheck.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: The rules must not scan the whole history for every question, so the dates are indexed per person once per
//   guards object. `NO_LOG` is the one shared empty log, so the caches stay keyed by identity.
// Covering tests: test/rules.test.ts, test/cadre-duty.test.ts, test/epop.test.ts.
import { dm, type ISODate } from '../lib/dates';
import { cadreAbsOn, cadreOf, isEpop, personMap, seatMap } from './indexes';
import type { Guards } from '../model/dutyRules';
import type { UserLists } from '../model/lists';
import type { Person } from '../model/person';
import type { DutyLog } from '../model/records';
import type { AppState } from '../model/state';
import { cadreAbsOf } from '../people/kinds';

/** Has a monthly limit: a cadre member, or an ΕΠΟΠ/ΟΒΑ soldier. */
export const limited = (p: Person, lists?: UserLists) => !!p.cid || isEpop(p, lists);

/**
 * The duties of the month of `date` without the day itself: the days he has a duty, from the calendar and from Excel.
 * `withDay` counts the day too (the card counts «today»; in the picker and in the limit the day being chosen does not
 * count).
 */
export function monthDuties(
  s: AppState,
  date: ISODate,
  pid: number,
  idx?: Map<number, Set<ISODate>>,
  withDay = false,
): number {
  const ds = (idx || dutyIndexOf(s)).get(pid);
  if (!ds) return 0;
  const ym = date.slice(0, 7);
  let n = 0;
  for (const d of ds) if ((withDay || d !== date) && d.slice(0, 7) === ym) n++;
  return n;
}

/**
 * The monthly limit: «limit reached» if this day would exceed it (asks for confirmation, like every rule). Returns the
 * reason, or null.
 */
export function monthBlock(s: AppState, date: ISODate, pid: number, idx?: Map<number, Set<ISODate>>): string | null {
  const c = pid < 0 ? cadreOf(s, pid) : undefined;
  if (c) {
    if (!c.active) return 'Στέλεχος εκτός δύναμης';
    // a cadre member with a status that day (leave, exemption, ΕΥ…): only «Υπηρεσία εντός στρατοπέδου» lets him serve
    const a = cadreAbsOn(s, c.id, date);
    const k = a && cadreAbsOf(a.kind, s.settings.lists);
    if (k && k[2] && k[2] !== 'yp')
      return 'Στέλεχος: ' + k[1] + ' ' + dm(a!.from) + (a!.to !== a!.from ? '–' + dm(a!.to) : '');
  }
  const p = pid < 0 ? seatMap(s).get(pid) : personMap(s.people).get(pid);
  const max = p?.monthMax;
  if (!p || !max || !limited(p, s.settings.lists)) return null;
  const n = monthDuties(s, date, pid, idx);
  return n >= max ? 'Έφτασε το όριο του μήνα: ' + n + ' από ' + max + ' υπηρεσίες' : null;
}

/**
 * The text «2 από 4 τον μήνα» for the picker and the card (`withDay`: the card counts today's duty too).
 * @decision Michael 3/11: the card counts today's duty.
 */
export function monthTxt(s: AppState, date: ISODate, p: Person, withDay = false): string {
  if (!limited(p, s.settings.lists)) return '';
  const n = monthDuties(s, date, p.id, undefined, withDay);
  return p.monthMax ? n + ' από ' + p.monthMax + ' τον μήνα' : n + ' τον μήνα';
}

const idxCache = new WeakMap<Guards, WeakMap<DutyLog, Map<number, Set<ISODate>>>>();

/** The one shared empty duty log, so the caches keyed by log keep one entry. */
export const NO_LOG: DutyLog = {};

/**
 * The dates of duty per person, so that the rules do not scan the whole history. Together with the duties without a
 * post (from Excel), for the rest and the holidays.
 */
export function dutyIndex(guards: Guards, log: DutyLog = NO_LOG): Map<number, Set<ISODate>> {
  let byLog = idxCache.get(guards);
  if (!byLog) {
    byLog = new WeakMap();
    idxCache.set(guards, byLog);
  }
  let m = byLog.get(log);
  if (m) return m;
  m = new Map();
  const add = (id: number, d: ISODate) => {
    if (!m!.has(id)) m!.set(id, new Set());
    m!.get(id)!.add(d);
  };
  for (const d in guards) for (const k in guards[d]) add(guards[d][k], d);
  for (const d in log) for (const e of log[d]) add(e.pid, d);
  byLog.set(log, m);
  return m;
}

/** `dutyIndex` of a state. */
export const dutyIndexOf = (s: AppState) => dutyIndex(s.guards, s.dutyLog || NO_LOG);

/** The duty without a post (from Excel) of a person on a day. */
export const seatlessOn = (s: AppState, date: ISODate, pid: number) =>
  (s.dutyLog?.[date] || []).find((e) => e.pid === pid);
