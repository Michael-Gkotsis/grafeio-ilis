// Who is present at a time of day: the statuses at a minute, the first time of the outs and the strength of a day.
//
// Purpose: `outMinOn` («Αρχή εξόδου» of a day), `statusesAt` (statuses as the Δύναμη counts them at a minute),
//   `strengthOf` / `strengthAt` / `awayText` (presence totals and the text of the absent).
// Does NOT: index statuses (statuses.ts) or decide the returns (core/outs).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core; imports core/outs (returns.ts,
//   dayTimes.ts). Nothing in core/outs imports this file.
// Why: These are the rule functions that need the return times of the outs, split from statuses.ts so the low layer
//   stays free of core/outs.
// Covering tests: test/rules.test.ts, test/return-hours.test.ts, test/leave-end.test.ts,
//   test/morning-leave-end.test.ts, test/golden-outputs.test.ts.
import type { ISODate } from '../lib/dates';
import { collator } from '../lib/text';
import { activePeople } from './indexes';
import { hkMin, notLeftYet, ORDER, statusesFrom } from './statuses';
import type { Rules } from '../model/dutyRules';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import { type Status, TYPE_KEYS, type TypeKey, TYPES } from '../model/status';
import { dayTimes } from '../outs/dayTimes';
import { leaveOut, outHeld } from '../outs/returns';
import { isAway, live, statusLbl } from '../people/kinds';
import { mins } from '../statuses/hours';

/**
 * The «Αρχή εξόδου» of day `d` in minutes, from the week table and the change of that one day (`dayTimes`). There is
 * one out time: it also applies to the people who return from a leave. The old `rules.outTime` (16:00) is not read any
 * more: it was a second out time, only for those returning from a leave.
 * @decision Michael 1/11: one out time.
 */
export const outMinOn = (s: Pick<AppState, 'rules' | 'settings'> & Partial<Pick<AppState, 'dayPlan'>>, d: ISODate) =>
  mins(dayTimes(s, d).out);

/**
 * The statuses of `date` at moment `at` (minutes), as the Δύναμη counts them: leaves as in `statusesFrom`; the out and
 * the ΔΝ with the time: the out person is present until the out time, the ΔΝ is absent until the return, even on the
 * next day. A leave that starts that day with a departure time after `at`: present until he leaves, as in the ΗΚΑΙ, so
 * that Σήμερα, Δύναμη and ΗΚΑΙ are consistent with each other. Duties and outs are judged elsewhere and do not change.
 * @decision Michael 24/10: out and ΔΝ with the time.
 * @decision Michael 1/11 and 2/11: Σήμερα, Δύναμη and ΗΚΑΙ must be consistent with each other.
 */
export function statusesAt(s: AppState, pid: number, date: ISODate, at: number): Status[] {
  const ss = notLeftYet(statusesFrom(live(s), pid, date, at), date, at),
    held = outHeld(s, pid, date, at);
  if (held === undefined) return ss;
  // a leave that ends today, with an out/ΔΝ today: from the out time only the out/ΔΝ counts (leaveOut)
  const lists = s.settings.lists,
    lo = !!leaveOut(s, pid, date, at),
    rest = ss.filter((x) => TYPES[x.type].cat !== 'out' && !(lo && isAway(x, lists)));
  return held
    ? [...rest, held].sort(
        (a, b) => Number(isAway(b, lists)) - Number(isAway(a, lists)) || ORDER(a.type) - ORDER(b.type),
      )
    : rest;
}

/**
 * The strength of a day. Everybody is counted once: `counts` / `lists` per kind, one person once per kind; `away` /
 * `awayLists` only the absent, each at the first reason he is away (hospital, leave, then out/ΔΝ), so that their
 * numbers make exactly absent = total - present. `awayLeave`: the absent on leave by name (ΚΑ, ΥΠΗΡΕΣΙΑΚΟ…), for
 * `awayText`.
 * @decision Michael 22/10: «δεν βγαίνουν τα μαθηματικά».
 * @decision Michael 3/11: `awayLeave`.
 */
export interface Strength {
  total: number;
  present: number;
  absent: number;
  counts: Record<TypeKey, number>;
  lists: Record<TypeKey | 'present', Person[]>;
  away: Record<TypeKey, number>;
  awayLists: Record<TypeKey, Person[]>;
  awayLeave: Record<string, number>;
}

/**
 * The strength of `date` at moment `at` (minutes from midnight; default the ΗΚΑΙ time, the Εξοδούχοι count from the out
 * time).
 */
export function strengthOf(s: AppState, date: ISODate, at = hkMin(s.rules)): Strength {
  const people = activePeople(s);
  const counts = {} as Record<TypeKey, number>,
    away = {} as Record<TypeKey, number>;
  const lists = { present: [] } as unknown as Strength['lists'],
    awayLists = {} as Strength['awayLists'];
  TYPE_KEYS.forEach((k) => {
    counts[k] = 0;
    lists[k] = [];
    away[k] = 0;
    awayLists[k] = [];
  });
  let present = 0;
  const awayLeave: Record<string, number> = {},
    lv = s.settings.lists;
  for (const p of people) {
    const ss = statusesAt(s, p.id, date, at);
    // double entry of the same kind (e.g. two outs on the same day): once
    new Set(ss.map((x) => x.type)).forEach((k) => {
      counts[k]++;
      lists[k].push(p);
    });
    // the statuses are sorted: absences first, in the order of the kinds
    const a = ss.find((x) => isAway(x, lv));
    if (a) {
      away[a.type]++;
      awayLists[a.type].push(p);
      if (a.type === 'LEAVE') {
        const l = statusLbl(a, lv);
        awayLeave[l] = (awayLeave[l] || 0) + 1;
      }
    } else {
      present++;
      lists.present.push(p);
    }
  }
  return { total: people.length, present, absent: people.length - present, counts, lists, away, awayLists, awayLeave };
}

/**
 * The moment the strength of a day is counted: today, like the ΗΚΑΙ until 08:00 and after that whoever has returned by
 * now (Σήμερα, Δύναμη and Δυναμολόγιο alike); other days the ΗΚΑΙ time.
 */
export const strengthAt = (r: Rules | null | undefined, date: ISODate, today: ISODate, now: number) =>
  date === today ? Math.max(hkMin(r), now) : hkMin(r);

/**
 * Summary of the absent: «24 έξοδος · 29 ΔΝ · 4 ΚΑ», in the order of the kinds; it adds up to the Απόντες. The leaves
 * per kind as they are written: «1 ΚΑ · 2 ΥΠΗΡΕΣΙΑΚΟ» (the regular one first, then by name).
 */
export const awayText = (c: Strength) =>
  TYPE_KEYS.filter((k) => c.away[k] > 0)
    .flatMap((k) =>
      k === 'LEAVE' && c.awayLeave
        ? Object.keys(c.awayLeave)
            .sort((a, b) => Number(b === TYPES.LEAVE.label) - Number(a === TYPES.LEAVE.label) || collator.compare(a, b))
            .map((l) => c.awayLeave[l] + ' ' + l)
        : [c.away[k] + ' ' + (k === 'OUT' ? 'έξοδος' : TYPES[k].label)],
    )
    .join(' · ');
