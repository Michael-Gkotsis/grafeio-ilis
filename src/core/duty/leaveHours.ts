// Times in leaves seen from the duties: who is blocked by a status, and the last-resort and warning rules.
//
// Purpose: `dutyBlock` (why a status keeps someone off a post), `backBefore` / `leavesBefore` (return before the post
//   starts, departure before it ends), `lastResort` (ΕΟ/ΕΑ allowed only if nobody else), `statusWarn` (warning-only
//   medical).
// Does NOT: compute the post span (posts.ts) or the outs times (core/outs).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: The duty day runs from the cycle start to the same time the next day, so a leave with hours blocks a post only
//   when the hours really overlap it.
// Covering tests: test/leave-hours.test.ts, test/rules.test.ts, test/strict.test.ts.
import { addDays, dm, type ISODate } from '../lib/dates';
import { type DutyPost, postSpan } from './posts';
import { statusesOf, statusesOn, untilTxt } from './statuses';
import { CAP_ACC, type DutyKind } from '../model/duty';
import type { UserLists } from '../model/lists';
import type { AppState } from '../model/state';
import { type Status, TYPES } from '../model/status';
import { leaveMode, live, medWarns, statusLbl } from '../people/kinds';
import { hasTimes, mins } from '../statuses/hours';
import { statOn } from '../statuses/stat';

/**
 * Κ-01, Κ-02, Κ-05: why someone does NOT enter a post (null = enters). Without a post it checks like an armed one.
 * `lists`: what the user changed in the Καταστάσεις table (stat.ts); without it the sergeant's rules hold as before.
 */
export function dutyBlock(
  statuses: Status[],
  date: ISODate,
  pid: number,
  post?: DutyPost | null,
  lists?: UserLists,
): string | null {
  for (const s of statusesOn(statuses, pid, date)) {
    if (backBefore(s, date, post)) continue;
    const c = statOn(s, post, lists);
    if (c.v !== 'no') continue;
    const t = TYPES[s.type];
    if (c.from !== 'def')
      return (
        statusLbl(s, lists) +
        ': όχι ' +
        ((post?.kind && CAP_ACC[post.kind]) || 'σε αυτή την υπηρεσία') +
        untilTxt(s, date)
      );
    if (t.noDuty) return (s.type === 'KOL' || s.type === 'LEAVE' ? statusLbl(s, lists) : t.label) + untilTxt(s, date);
    if (t.noArmed && (!post || post.armed)) return 'Άοπλος: ' + t.label + untilTxt(s, date);
    return 'Όχι μαγειρεία: ' + t.label + untilTxt(s, date);
  }
  return leavesBefore(statuses, date, pid, post, lists);
}

// Returned from the leave on the last day before the post starts (e.g. return 12:00, duty from 14:00): enters. Without
// a post, or with a post of unknown start, the whole day counts, as before.
function backBefore(s: Status, date: ISODate, post?: DutyPost | null): boolean {
  if (!s.toTime || s.open || s.to !== date || !hasTimes(s.type) || !post) return false;
  const st = postSpan(post).start;
  return st != null && mins(s.toTime) <= st;
}

// Leaves for a leave on the next day before the duty that starts today ends (e.g. departure 10:00, the duty ends
// 14:00): does not enter. A post of unknown end ends at the start of the next cycle; the μαγειρεία is a day one.
function leavesBefore(
  statuses: Status[],
  date: ISODate,
  pid: number,
  post?: DutyPost | null,
  lists?: UserLists,
): string | null {
  if (!post) return null;
  const next = addDays(date, 1);
  // a leave of the user's own kind that counts as present goes nowhere (Michael, 3/11)
  const s = statusesOf(statuses, pid).find(
    (x) => x.from === next && x.fromTime && !x.pending && hasTimes(x.type) && leaveMode(x, lists) !== 'present',
  );
  if (!s) return null;
  const end = postSpan(post).end ?? (post.kind === 'mg' ? null : 1440 + (post.cyc ?? 14 * 60));
  if (end == null || 1440 + mins(s.fromTime!) >= end) return null;
  return 'Φεύγει ' + statusLbl(s, lists) + ' ' + dm(next) + ' στις ' + s.fromTime;
}

/**
 * ΕΟ/ΕΑ in an (unarmed) σκοπιά: allowed, but only if there is nobody else (λοχίας, 10/10); and whatever else the user
 * set so in the Καταστάσεις table.
 * @decision λοχίας 10/10: ΕΟ/ΕΑ only if nobody else.
 */
export function lastResort(
  statuses: Status[],
  date: ISODate,
  pid: number,
  post?: { kind?: DutyKind; armed?: boolean; block?: string } | null,
  lists?: UserLists,
): string | null {
  if (!post?.kind) return null;
  for (const st of statusesOn(statuses, pid, date)) {
    const c = statOn(st, { ...post, armed: !!post.armed }, lists);
    if (c.v !== 'last') continue;
    return (
      (c.from === 'def' && st.type !== 'LEAVE' ? TYPES[st.type].label : statusLbl(st, lists)) +
      ': ' +
      (CAP_ACC[post.kind] || 'υπηρεσία') +
      ' μόνο αν δεν υπάρχει άλλος'
    );
  }
  return null;
}

/**
 * A medical «warning only» (e.g. a referral for 401): enters a duty, with a warning; the auto-fill puts him only if
 * there is nobody else.
 */
export function statusWarn(s: AppState, date: ISODate, pid: number): string | null {
  const st = statusesOn(live(s), pid, date).find((x) => medWarns(x, s.settings.lists));
  return st ? statusLbl(st, s.settings.lists) + untilTxt(st, date) + ': έλεγξε αν μπορεί να κάνει υπηρεσία' : null;
}
