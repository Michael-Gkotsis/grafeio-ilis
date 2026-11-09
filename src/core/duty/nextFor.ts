// «Επόμενος στη σειρά» and the swap check.
//
// Purpose: `nextFor` (the first allowed person for a post, skipping the ones already suggested), `swapCheck` (what
//   blocks each of two people in the other one's post).
// Does NOT: fill a day.
// Owner layer: core/duty (no fs, no Electron, no React); imports only from src/core.
// Why: Both are manual helpers on top of the same rules the auto-fill uses.
// Covering tests: test/head-date-swap.test.ts, test/rotation.test.ts, test/rules.test.ts.
import type { ISODate } from '../lib/dates';
import { ruleBlock } from './dutyCheck';
import { dutyIndexOf } from './dutyIndex';
import { fairMap } from './fairness';
import { dutyPool, seatMap } from './indexes';
import { dutyBlock } from './leaveHours';
import { fixedIds, postBy, postsOf } from './posts';
import { candidates } from './rotation';
import { strictOrder } from './strictUnarmed';
import { capBlock } from './whoDoes';
import { shortName } from '../model/person';
import type { AppState } from '../model/state';
import { live } from '../people/kinds';

/** «Next in line» for a post: the first who is allowed, except the ones already suggested (`skip`). */
export function nextFor(s: AppState, date: ISODate, k: string, skip: number[]): number | null {
  const x = postsOf(s.settings).find((p) => p.k === k) || postBy(s, k);
  if (!x) return null;
  const g = { ...(s.guards[date] || {}) };
  delete g[k];
  const work: AppState = { ...s, guards: { ...s.guards, [date]: g } };
  const people = dutyPool(s);
  const fair = fairMap(s, people, date);
  const idx = new Map<number, Set<ISODate>>();
  dutyIndexOf(work).forEach((v, id) => idx.set(id, v));
  const list = candidates(work, date, x, people, fair, idx, fixedIds(s));
  return (
    (s.rules.strictUnarmed ? strictOrder(work, date, x, list, people, idx, fixedIds(s)) : list).find(
      (p) => !skip.includes(p.id),
    )?.id ?? null
  );
}

/** Exchange of two people who already have a duty on the same day: what blocks each one in the post of the other. */
export function swapCheck(
  s: AppState,
  date: ISODate,
  a: string,
  b: string,
): { hard: string | null; soft: string | null } {
  const g = s.guards[date] || {};
  const pa = g[a],
    pb = g[b];
  const A = postBy(s, a),
    B = postBy(s, b);
  if (!pa || !pb || !A || !B) return { hard: 'Η ανταλλαγή θέλει δύο κατειλημμένες θέσεις', soft: null };
  const work: AppState = { ...s, guards: { ...s.guards, [date]: { ...g, [a]: pb, [b]: pa } } };
  const pm = seatMap(s);
  const nm = (id: number) => (pm.get(id) ? shortName(pm.get(id)!) : '?');
  // no status forbids it completely (Michael, 17/10): ΕΥ, leave etc. pass with a reason, like the rule
  const st =
    (dutyBlock(live(s), date, pb, A, s.settings.lists) &&
      nm(pb) + ': ' + dutyBlock(live(s), date, pb, A, s.settings.lists)) ||
    (dutyBlock(live(s), date, pa, B, s.settings.lists) &&
      nm(pa) + ': ' + dutyBlock(live(s), date, pa, B, s.settings.lists)) ||
    null;
  const sa = capBlock(s, date, pb, A) || ruleBlock(work, date, pb, undefined, a),
    sb = capBlock(s, date, pa, B) || ruleBlock(work, date, pa, undefined, b);
  return { hard: null, soft: st || (sa && nm(pb) + ': ' + sa) || (sb && nm(pa) + ': ' + sb) || null };
}
