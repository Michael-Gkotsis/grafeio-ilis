// Testing the filters of a report against the state on a day.
//
// Purpose: `condTest` (does a soldier pass one filter on a day) and `matchGroup` (the first group of filters he
//   passes).
// Does NOT: edit the filters (conds.ts) or pick the people (candidates.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/people, core/lib, core/model,
//   core/duty, core/reports/conds.
// Why: every filter asks the state a different question (strength, duties, statuses, weapon, personal data), so the
//   questions are kept together and the expensive sets are built at most once per call.
// Covering tests: test/report-or-groups.test.ts.
import { PKEYS } from '../people/personal';
import { addDays, type ISODate } from '../lib/dates';
import { TYPES } from '../model/status';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import { statusesOn } from '../duty/statuses';
import { strengthOf } from '../duty/presence';
import { live } from '../people/kinds';
import { filterStatus } from '../people/rosterLists';
import type { RepPick, RepCond } from '../model/reportTypes';
import { condGroups, passGroup } from './conds';

/** The first group of filters (0, 1…) the soldier passes, or -1 (for the «Ομ. K» mark in the list). */
export function matchGroup(s: AppState, pk: RepPick, d: ISODate): (p: Person) => number {
  const gs = condGroups(pk);
  const t = condTest(s, d, pk.stNew);
  return (p) => gs.findIndex((g) => passGroup(t, g, p));
}
/**
 * The test of one filter for a soldier on day `d`. The sets it needs (present, busy) are built once, and only when
 * asked. `stNew`: only the statuses that start on day `d`.
 */
export function condTest(s: AppState, d: ISODate, stNew?: boolean) {
  let present: Set<number> | null = null;
  let busy: Set<number> | null = null;
  return (c: RepCond, p: Person): boolean => {
    if (c === 'present') {
      present = present || new Set(strengthOf(s, d).lists.present.map((x) => x.id));
      return present.has(p.id);
    }
    if (c === 'duty') {
      busy =
        busy ||
        new Set<number>(
          [...Object.values(s.guards[d] || {}), ...Object.values(s.guards[addDays(d, 1)] || {})].filter(
            (x): x is number => typeof x === 'number',
          ),
        );
      return busy.has(p.id);
    }
    if (c === 'post') return !!p.post;
    if (c === 'dnright') return !!p.dn;
    if (c === 'weapon') return !!(p.weapon || '').trim();
    if (c === 'pdata') return PKEYS.every((k) => !!p[k]);
    const all = statusesOn(live(s), p.id, d);
    const on = stNew ? all.filter((x) => x.from === d) : all;
    if (c === 'med' || c === 'other') return on.some((x) => TYPES[x.type]?.cat === c);
    return !!filterStatus(c, on);
  };
}
