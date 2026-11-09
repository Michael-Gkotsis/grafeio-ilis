// «Αυστηρά Άοπλοι» (λοχίας, 11/10): the unarmed people, the order of the posts they get first, and the pick.
//
// Purpose: `isUnarmed`, `strictOrder` / `strictKeys` / `strictTier` / `STRICT_SK` / `strictKeyTxt` / `strictPick`.
// Does NOT: rotate the services (rotation.ts).
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: The switch is closed/opened in the Κανόνες. When it is on, free unarmed people go first in the posts of their
//   tier.
// Covering tests: test/strict.test.ts, test/armed.test.ts, test/duty-fuzz.test.ts.
import type { ISODate } from '../lib/dates';
import { allBlocks, manOf } from './capability';
import { armedLeft, armedNeeded } from './holdBack';
import { personMap } from './indexes';
import { postsOf } from './posts';
import { dutyMin, statusesFrom } from './statuses';
import type { Post } from '../model/duty';
import { DEFAULT_STRICT_ORDER, type Rules } from '../model/dutyRules';
import type { Person } from '../model/person';
import type { Settings } from '../model/settings';
import { blocksOf } from '../model/settingsAccess';
import type { AppState } from '../model/state';
import { live } from '../people/kinds';
import { siIsUnarmed } from '../people/si';
import { statIsUnarmed } from '../statuses/stat';

/**
 * Unarmed for a day: ΕΑ/ΕΟ/ΣΤΕΠ (not an armed post), a Σ.Ι. without οπλοφύλακας and σκοπιά (Ι3 ΑΟΠΛΟ, Ι4, or whatever
 * the user set in the Σ.Ι. table), or «does not do» by hand in all the armed kinds.
 * @decision λοχίας 11/10: «Αυστηρά Άοπλοι», switched on/off in the Κανόνες.
 */
export function isUnarmed(s: AppState, date: ISODate, pid: number): boolean {
  const blocks = (blocksOf(s.settings) || s.settings.blocks).filter((b) => !b.hidden && b.kind !== 'ly');
  if (statusesFrom(live(s), pid, date, dutyMin(s.settings)).some((x) => statIsUnarmed(x, blocks, s.settings.lists)))
    return true;
  const p = personMap(s.people).get(pid);
  if (!p) return false;
  if (siIsUnarmed(p, blocks, s.settings.lists)) return true;
  const armed = postsOf(s.settings).filter((x) => x.armed && x.kind !== 'ly');
  const c = s.caps[pid] || {};
  const own = new Set(
    allBlocks(s.settings)
      .filter((b) => b.custom)
      .map((b) => b.id),
  );
  return armed.length > 0 && armed.every((x) => !!manOf(c, x.block, x.kind, !!x.block && own.has(x.block)));
}

/**
 * The order of the «Αυστηρά Άοπλοι» keys (`rules.strictOrder`, default μαγειρεία, then 2nd-3rd, then 1st-4th number):
 * keys 'mg' μαγειρεία, 'mid' θαλαμοφύλακας (and unarmed οπλοφύλακας) 2nd-3rd number, 'edge' the same 1st-4th, 'b:' + id
 * an own unarmed duty.
 * @decision Michael 1/11: `rules.strictOrder`.
 */
export const strictKeys = (r: Pick<Rules, 'strictOrder'>): readonly string[] =>
  r.strictOrder && r.strictOrder.length ? r.strictOrder : DEFAULT_STRICT_ORDER;

// The tier of a post: its place in the order (1, 2, 3…), or one above the end for all the others (default: 1 μαγειρεία,
// 2, 3, 4 the others).
const tierOf = (x: Post, key: string): boolean => {
  if (key === 'mg') return x.kind === 'mg';
  if (key === 'mid' || key === 'edge')
    return (
      (x.kind === 'th' || (x.kind === 'op' && !x.armed)) &&
      x.rot != null &&
      (key === 'mid') === (x.rot === 1 || x.rot === 2)
    );
  return key.startsWith('b:') && !x.armed && x.block === key.slice(2);
};

/** The tier of a post for a given order of keys (see `tierOf`). */
export function strictTier(x: Post, order: readonly string[] = DEFAULT_STRICT_ORDER): number {
  const i = order.findIndex((k) => tierOf(x, k));
  return i < 0 ? order.length + 1 : i + 1;
}

/** The warning text of a σκοπιά where only the armed enter under «Αυστηρά Άοπλοι». */
export const STRICT_SK = 'Αυστηρά Άοπλοι: σκοπιά μόνο ένοπλοι';

/**
 * The name of a key of the order («Μαγειρεία», «2ο-3ο νούμερο», the name of the own duty); empty if the duty does not
 * exist any more.
 */
export function strictKeyTxt(st: Settings, key: string): string {
  if (key === 'mg') return 'μαγειρεία';
  if (key === 'mid') return '2ο-3ο νούμερο';
  if (key === 'edge') return '1ο-4ο νούμερο';
  return key.startsWith('b:') ? allBlocks(st).find((b) => b.custom && b.id === key.slice(2))?.name || '' : '';
}

/**
 * The order with «Αυστηρά Άοπλοι»: in a post of tier 1-3 the unarmed go first (in the fairness order among them),
 * otherwise the normal order. An unarmed person who is needed to fill an armed post of the day (e.g. ΤΑΕ) gets no
 * priority, so that it does not stay empty. In a σκοπιά no unarmed person, not even as the last resort.
 * @decision Michael 3/11: every free unarmed person goes first, not only when it is his turn («δεν μου δούλεψε πλέον»).
 */
export function strictOrder(
  s: AppState,
  date: ISODate,
  x: Post,
  list: Person[],
  people: Person[],
  idx: Map<number, Set<ISODate>>,
  fixed: Set<number>,
  memo?: Map<string, number[]>,
): Person[] {
  if (x.kind === 'sk') return list.filter((p) => !isUnarmed(s, date, p.id));
  const tiers = strictKeys(s.rules);
  if (strictTier(x, tiers) > tiers.length) return list;
  const need = armedLeft(s, date, x.k);
  const keep = need.length
    ? armedNeeded(
        s,
        date,
        need,
        people.filter((p) => !fixed.has(p.id)),
        idx,
        memo,
      )
    : null;
  // every free unarmed person goes first, not only when it is his turn (Michael, 3/11: «δεν μου δούλεψε πλέον»). From
  // 1/11 to 3/11 the priority held only inside the first of the order, as many as the empty posts: then the armed took
  // the μαγειρεία while free unarmed people existed and the switch hardly changed anything. The unarmed do more duties
  // this way (with rest); whoever wants equal duties for everybody switches it off.
  const first = list.filter((p) => isUnarmed(s, date, p.id) && !keep?.has(p.id));
  return [...first, ...list.filter((p) => !first.includes(p))];
}

/** The order of a post under «Αυστηρά Άοπλοι» for the people who are allowed in it. */
export const strictPick = (
  s: AppState,
  date: ISODate,
  x: Post,
  list: Person[],
  people: Person[],
  idx: Map<number, Set<ISODate>>,
  fixed: Set<number>,
  memo?: Map<string, number[]>,
): Person | undefined => strictOrder(s, date, x, list, people, idx, fixed, memo)[0];
