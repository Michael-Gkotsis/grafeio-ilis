// Duty checks: why someone cannot take a post or go out on a day.
//
// Purpose: `ruleBlock` (rest after a duty, holiday and weekend rules), `guardUnavailable` (all reasons together),
//   `outBlock` (why someone does not go out), `alreadyOn`, `outRoomsOn`.
// Does NOT: fill a day (autofill.ts) or explain a choice (whyText.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core; imports core/outs through
//   presence.ts for the first out time.
// Why: These are the rules the manual picker, the auto-fill, «Επόμενος» and the swap check share, so they have one
//   home.
// Covering tests: test/rules.test.ts, test/rules-fixes.test.ts, test/rules-options.test.ts, test/duty-fuzz.test.ts.
import { addDays, dm, type ISODate, parseD } from '../lib/dates';
import { dutyIndexOf, monthBlock, seatlessOn } from './dutyIndex';
import { holName, isHol } from './holidays';
import { cadreOf, isEpop } from './indexes';
import { dutyBlock } from './leaveHours';
import { isFixed, postBy, postOf } from './posts';
import { outMinOn } from './presence';
import { statusesFrom, statusesOf, untilTxt } from './statuses';
import { capBlock } from './whoDoes';
import { postTxt } from '../model/blocks';
import { KIND_NAME } from '../model/duty';
import { DEFAULT_NUM_ROTS, type Rules } from '../model/dutyRules';
import type { AppState } from '../model/state';
import { coversDay } from '../model/status';
import { live, statusLbl } from '../people/kinds';
import { hasTimes } from '../statuses/hours';
import { statNoOut } from '../statuses/stat';

/** Κ-13, Κ-14: rest after a duty, and no holiday / weekend two weeks in a row. Returns the reason, or null. */
export function ruleBlock(
  s: AppState,
  date: ISODate,
  pid: number,
  idx?: Map<number, Set<ISODate>>,
  k?: string | null,
): string | null {
  const r = s.rules;
  const lim = monthBlock(s, date, pid, idx);
  if (lim) return lim;
  const c = pid < 0 ? cadreOf(s, pid) : undefined;
  // plain cadre by hand: only the status; ΕΠΟΠ/ΟΒΑ (and whoever has a limit, #125) keep their rules
  if (c && !c.monthMax && !isEpop(c, s.settings.lists)) return null;
  if (isFixed(s, pid, k)) return null;
  const ds = (idx || dutyIndexOf(s)).get(pid);
  if (!ds) return null;
  for (let i = 1; i <= r.restDays; i++)
    for (const d of [addDays(date, -i), addDays(date, i)]) if (ds.has(d)) return 'Υπηρεσία ' + dm(d) + ' (ανάπαυση)';
  // from 2 days: a Friday holiday and a Sunday are two holidays in a row (1 day is already rest)
  if (r.noConsecHol && isHol(s.settings, date))
    for (let i = 2; i <= 9; i++)
      for (const d of [addDays(date, -i), addDays(date, i)])
        if (ds.has(d) && isHol(s.settings, d)) return 'Έκανε αργία ' + holName(s.settings, d) + ' ' + dm(d);
  return k ? numBlock(s, date, pid, k, ds) : null;
}

// The same number again only after `rules.numRest` days (λοχίας, 10/10): for the numbers `rules.numRots` (Michael,
// 1/11), by default the 3rd and the 4th (the shifts 18:00 / 20:00).
// @decision λοχίας 10/10: same number after `rules.numRest` days.
// @decision Michael 1/11: `rules.numRots`.
function numBlock(s: AppState, date: ISODate, pid: number, k: string, ds: Set<ISODate>): string | null {
  const n = s.rules.numRest || 0;
  const post = postBy(s, k);
  if (n < 2 || !post || post.rot == null || !(s.rules.numRots ?? DEFAULT_NUM_ROTS).includes(post.rot)) return null;
  for (let i = 1; i < n; i++)
    for (const d of [addDays(date, -i), addDays(date, i)]) {
      if (!ds.has(d)) continue;
      const g = s.guards[d] || {};
      for (const kk in g)
        if (g[kk] === pid && postBy(s, kk)?.rot === post.rot)
          return post.rot + 1 + 'ο νούμερο στις ' + dm(d) + ' (ξανά μετά από ' + n + ' μέρες)';
    }
  return null;
}

/**
 * Already in another post that day (or a duty without a post from Excel), whatever the other reasons; `k`: the post
 * being judged (it does not count).
 */
export function alreadyOn(s: AppState, date: ISODate, pid: number, k: string | null): string | null {
  const o = postOf(s, date, pid, k || undefined);
  if (o) return 'Ήδη ' + postTxt(o);
  const sl = seatlessOn(s, date, pid);
  return sl ? 'Ήδη ' + KIND_NAME[sl.kind].toLowerCase() + ' χωρίς θέση (από Excel)' : null;
}

/**
 * Every reason together why a person cannot take post `k` on a day: status, capability, already on, rest rules. null =
 * can.
 */
export function guardUnavailable(
  s: AppState,
  date: ISODate,
  pid: number,
  k: string | null,
  idx?: Map<number, Set<ISODate>>,
): string | null {
  const post = k ? postBy(s, k) : null;
  const r = dutyBlock(live(s), date, pid, post, s.settings.lists) || capBlock(s, date, pid, post);
  if (r) return r;
  return alreadyOn(s, date, pid, k) || ruleBlock(s, date, pid, idx, k);
}

/** Κ-06, Κ-07, Κ-08: why someone does NOT go out (null = goes out). */
export function outBlock(s: AppState, date: ISODate, pid: number): string | null {
  const o = postOf(s, date, pid);
  if (o) return 'Έχει υπηρεσία: ' + o.label;
  // returned from a leave (hospital, ΣΤΕΠ) before the out time: goes out normally (Michael, 18/10)
  const st = statusesFrom(live(s), pid, date, outMinOn(s, date)).find((x) => statNoOut(x, s.settings.lists));
  if (st)
    return (
      statusLbl(st, s.settings.lists) +
      untilTxt(st, date) +
      (st.toTime && !st.open && st.to === date && hasTimes(st.type) ? ' (γυρίζει ' + st.toTime + ')' : '')
    );
  // a penalty that is still pending: does not count in the ΗΚΑΙ (Κ-19), but the punished stays inside
  const pend = statusesOf(s.statuses, pid).find((x) => x.type === 'PUN' && x.pending && coversDay(x, date));
  return pend ? (pend.kind || 'Ποινή') + ' (αιτείται)' + untilTxt(pend, date) : null;
}

/** The rooms that go out on a date, or null when the rule does not limit them. */
export const outRoomsOn = (rules: Rules, d: ISODate): number[] | null => rules.outRooms[parseD(d).getDay()] || null;
