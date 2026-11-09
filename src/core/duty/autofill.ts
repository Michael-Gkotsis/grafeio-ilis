// Auto-fill of a day: puts people in the empty posts with the fairness order and the rules.
//
// Purpose: `fillDay`.
// Does NOT: repair the result afterwards (autofillRepair.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: One function so that the order of the steps stays visible in one place.
// Covering tests: test/fill-repair.test.ts, test/duty-fuzz.test.ts, test/golden-outputs.test.ts.
import { dm, type ISODate } from '../lib/dates';
import { balanceNums, fillAfterHoliday, repair, strictTopUp } from './autofillRepair';
import { alreadyOn, guardUnavailable } from './dutyCheck';
import { dutyIndexOf, monthBlock } from './dutyIndex';
import { fairMap } from './fairness';
import { isHol } from './holidays';
import { activePeople, dutyPool, personMap } from './indexes';
import { dutyBlock, lastResort, statusWarn } from './leaveHours';
import { fixedIds, postsOf } from './posts';
import { candidates } from './rotation';
import { STRICT_SK, strictKeys, strictPick, strictTier } from './strictUnarmed';
import type { Guards } from '../model/dutyRules';
import { shortName } from '../model/person';
import type { AppState } from '../model/state';
import { live } from '../people/kinds';

/**
 * Fills the empty posts of a day with the fairness order and the rules. Returns the new day, how many were filled, the
 * empty posts and the warnings.
 * 1. Filter: all the rules (statuses, capability, rest, weekend after weekend).
 * 2. In the unarmed posts the ones needed to fill the empty armed posts of the day go last (without them an armed post
 * would stay empty). When the armed people are more than enough, the fairness order holds for everybody, and an ΕΑ/ΕΟ
 * does not enter first in every unarmed post (ΣΒΕΝ, plan 11/10).
 * 3. Holiday / weekend: fewer holidays, then older last holiday. Weekday: older last duty, then fewer duties.
 * 4. Rotation of the services (`rotate`): among the ones whose turn it is today, whoever owes this service. Then: fewer
 * times in the same kind of post.
 * 5. Tie: a draw with the date as a fixed seed (same day, same suggestion, not alphabetical).
 */
export function fillDay(s: AppState, date: ISODate): { guards: Guards; n: number; empty: string[]; warn: string[] } {
  const g: Record<string, number> = { ...(s.guards[date] || {}) };
  // its own copy of the calendar, where only the day changes (not a new copy of the whole year for every post)
  const wg: Guards = { ...s.guards, [date]: { ...g } };
  let work: AppState = { ...s, guards: wg };
  const setDay = () => {
    wg[date] = { ...g };
    work = { ...work, guards: wg };
  };
  // ΕΠΟΠ/ΟΒΑ: by hand only (unless he is the permanent Λ/Υ or Δ/Υ)
  const people = dutyPool(s);
  const all = activePeople(s);
  const fair = fairMap(s, people, date);
  // the index of the baseline is shared (not a copy for each total); a copy only for the ones who enter today
  const idx = new Map(dutyIndexOf(s));
  const own = new Set<number>();
  const mark = (id: number) => {
    if (!own.has(id)) {
      own.add(id);
      idx.set(id, new Set(idx.get(id) || []));
    }
    idx.get(id)!.add(date);
  };
  const unmark = (id: number) => {
    if (own.has(id)) idx.get(id)!.delete(date);
  };
  let n = 0;
  const skNone = new Set<string>();
  const posts = postsOf(s.settings);
  // 1. the permanent Λ/Υ and Δ/Υ always enter the empty post (Michael, 18/10), and despite the rules (rest, weekend,
  // days without duty, «Τι κάνει»), with a warning. Not only when a status holds him (leave, ΕΥ…) or he is already in
  // another post: then the post is filled in the order, like all of them, and the warning says why.
  const fixedWarn: string[] = [];
  const pm0 = personMap(s.people);
  for (const x of posts) {
    const f = x.k === 'ly' || x.k === 'dy' ? s.settings.fixed?.[x.k] : undefined;
    if (g[x.k] || !f || !all.some((p) => p.id === f)) continue;
    const who = 'Μόνιμος ' + x.label + ' ' + shortName(pm0.get(f)!);
    // «Already in another post» is judged on its own: another reason must not hide it, or he would enter twice
    const st =
      dutyBlock(live(work), date, f, x, s.settings.lists) ||
      monthBlock(work, date, f, idx) ||
      alreadyOn(work, date, f, x.k);
    if (st) {
      fixedWarn.push(who + ': δεν μπήκε (' + st + ')');
      continue;
    }
    const r = guardUnavailable(work, date, f, x.k, idx);
    g[x.k] = f;
    n++;
    setDay();
    mark(f);
    if (r) fixedWarn.push(who + ': μπήκε παρά τον κανόνα (' + r + ')');
  }
  const fixed = fixedIds(s);
  const memo = new Map<string, number[]>();
  const mine = new Set<string>(); // the posts this fill put in (only these are moved in the repair)
  // «Αυστηρά Άοπλοι»: first the posts where the unarmed enter (μαγειρεία, 2nd-3rd, 1st-4th number), then all the others
  const strict = !!s.rules.strictUnarmed;
  const tiers = strictKeys(s.rules);
  const order = strict ? [...posts].sort((a, b) => strictTier(a, tiers) - strictTier(b, tiers)) : posts;
  for (const x of order) {
    if (g[x.k]) continue;
    const list = candidates(work, date, x, people, fair, idx, fixed, memo);
    const cand = strict ? strictPick(work, date, x, list, people, idx, fixed, memo) : list[0];
    if (!cand) {
      if (strict && x.kind === 'sk' && list.length) skNone.add(x.k);
      continue;
    }
    g[x.k] = cand.id;
    n++;
    mine.add(x.k);
    setDay();
    mark(cand.id);
  }
  n += repair(s, date, g, mine, order, people, fair, idx, fixed);
  if (s.rules.rotate !== false) balanceNums(s, date, g, mine, posts, idx);
  if (strict) strictTopUp(s, date, g, mine, order, people, fair, idx, fixed, mark, unmark);
  // holiday: posts nobody could take as all had done a holiday recently (Michael, 1/11: «γεμίζει με ειδοποίηση»)
  const holWarn: string[] = [];
  const nHol =
    s.rules.noConsecHol && isHol(s.settings, date)
      ? fillAfterHoliday(s, date, g, mine, order, people, fair, idx, fixed, strict, mark)
      : 0;
  n += nHol;
  if (nHol)
    holWarn.push(
      dm(date) +
        ': ' +
        (nHol === 1 ? 'μπήκε 1 που είχε' : 'μπήκαν ' + nHol + ' που είχαν') +
        ' κάνει αργία πρόσφατα (δεν έφταναν οι υπόλοιποι)',
    );
  // empty posts and «no other choice» as they stayed after the repair
  const pm = pm0;
  const empty: string[] = [];
  const warn: string[] = [...fixedWarn, ...holWarn];
  for (const x of order) {
    const pid = g[x.k];
    if (!pid) {
      empty.push(x.k);
      if (skNone.has(x.k)) warn.push(x.label + ': ' + STRICT_SK);
      continue;
    }
    if (!mine.has(x.k)) continue;
    const lr = lastResort(live(s), date, pid, x, s.settings.lists) || statusWarn(s, date, pid);
    if (lr) warn.push(shortName(pm.get(pid)!) + ' (' + x.label + '): ' + lr);
  }
  return { guards: { ...s.guards, [date]: g }, n, empty, warn };
}
