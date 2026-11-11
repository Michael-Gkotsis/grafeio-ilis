// Pure rules of the «ΗΚΑΙ › Άδειες» list.
// Purpose: which leaves each tab lists, how many are away or leave soon, and the "when" text of a line.
// Does NOT: read the store or draw anything (model/useLeaves.ts and ui/LeavesTab.tsx do).
// Owner layer: renderer/widgets/status-lists. Why: moved verbatim from screens/leaves.ts (Phase 6.0).
// Covering test: test/screens-main.test.ts, test/leaves.test.ts.
import { addDays, dayName, daysBetween } from '../../../../shared/dates';
import { TYPES, fullName, type AppState, type Person, type Status } from '../../../../shared/domain';
import { statusLbl } from '../../../../shared/ranks';
import { normGreek } from '../../../../shared/text';

/** A leave of any kind: regular, honorary or sick. */
export const isLeave = (s: Status) => TYPES[s.type].cat === 'abs';

/** [away now, leaving in the next days]. `away` tells if a status is in force at this minute. */
export function leaveCounts(statuses: Status[], pm: Map<number, Person>, today: string, away: (s: Status) => boolean) {
  let a = 0;
  let b = 0;
  for (const s of statuses) {
    if (isLeave(s) && away(s) && pm.has(s.pid)) {
      if (s.from > today) b++;
      else a++;
    }
  }
  return [a, b];
}

/** What the list depends on. `view` is 'now' or 'back'; `query` is the text typed in the search box. */
export interface LeaveQuery {
  state: AppState;
  pm: Map<number, Person>;
  view: string;
  today: string;
  query: string;
  away: (s: Status) => boolean;
}

/** The leaves of a tab, sorted: «Τώρα» has who is away first (by return), then who leaves (by departure). */
export function leaveRows({ state, pm, view, today, query, away }: LeaveQuery): Status[] {
  const since = addDays(today, -14);
  const qq = normGreek(query.trim());
  const ok = (s: Status) =>
    pm.has(s.pid) &&
    (!qq ||
      normGreek(
        fullName(pm.get(s.pid)!) +
          ' ' +
          statusLbl(s, state.settings.lists) +
          ' ' +
          TYPES[s.type].long +
          ' ' +
          (s.kind || '') +
          ' ' +
          (s.dest || '') +
          ' ' +
          (s.note || ''),
      ).includes(qq));
  if (view === 'now')
    return state.statuses
      .filter((s) => isLeave(s) && away(s) && ok(s))
      .sort(
        (a, b) =>
          (a.from > today ? 1 : 0) - (b.from > today ? 1 : 0) ||
          (a.from > today ? a.from.localeCompare(b.from) : a.to.localeCompare(b.to)),
      );
  return state.statuses
    .filter((s) => isLeave(s) && !away(s) && s.to >= since && ok(s))
    .sort((a, b) => b.to.localeCompare(a.to) || (b.toTime || '').localeCompare(a.toTime || ''));
}

/** When the person is back or leaves, for the line under a name. */
export function whenTxt(s: Status, today: string, away: (s: Status) => boolean): string {
  if (s.to === today && !away(s)) return 'γύρισε σήμερα';
  if (s.to < today) {
    const d = daysBetween(s.to, today) - 1;
    return d === 1 ? 'γύρισε χθες' : 'γύρισε πριν από ' + d + ' ημ.';
  }
  if (s.from > today) return 'φεύγει ' + dayName(s.from, today).toLowerCase();
  if (s.open) return 'χωρίς λήξη';
  const n = daysBetween(today, s.to) - 1;
  return n === 0 ? 'τελευταία μέρα σήμερα' : n === 1 ? 'τελευταία μέρα αύριο' : 'λείπει ακόμα ' + (n + 1) + ' ημ.';
}
