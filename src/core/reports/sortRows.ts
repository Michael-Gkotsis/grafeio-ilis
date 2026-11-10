// The order of the rows of a report.
//
// Purpose: `sortRows`: by name, room, rank, date or start time, depending on the kind.
// Does NOT: choose the rows (candidates.ts) or the sorts a kind offers (kinds.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/lib, core/model, core/weapons,
//   core/people, core/cadre, core/reports/rowTypes.
// Why: the cadres follow the order of the ΗΚΑΙ ranks and the soldiers the order of the rank list, and every output
//   must sort the same way.
// Covering tests: test/reports.test.ts.
import { collator } from '../lib/text';
import type { Person } from '../model/person';
import type { AppState } from '../model/state';
import { byOut } from '../weapons/weaponSheets';
import { listOf } from '../people/ranks';
import { orderedCadre } from '../cadre/cadre';
import type { RepKind, RepSort } from '../model/reportTypes';
import type { Row, MoveRow, StatusRow } from './rowTypes';

/** The order of the rows in the form (`sort`); the 'pick' order and the post order keep the rows as they are. */
export function sortRows<T extends Row>(rows: T[], sort: RepSort, s: AppState, kind: RepKind): T[] {
  if (kind === 'blank' || sort === 'pick' || (sort === 'seat' && kind === 'duty')) return rows;
  if (sort === 'from' && kind === 'wmove') return [...rows].sort((a, b) => byOut((a as MoveRow).m, (b as MoveRow).m));
  if (sort === 'from' && kind === 'status')
    return [...rows].sort((a, b) =>
      (a as StatusRow).st.from < (b as StatusRow).st.from
        ? -1
        : (a as StatusRow).st.from > (b as StatusRow).st.from
          ? 1
          : collator.compare(a.last, b.last),
    );
  if (kind === 'cadre') {
    if (sort !== 'rank')
      return [...rows].sort((a, b) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first));
    const ord = orderedCadre(s.cadreList || []).map((c) => c.id);
    return [...rows].sort((a, b) => ord.indexOf(a.id as string) - ord.indexOf(b.id as string));
  }
  const byName = (a: Row, b: Row) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first);
  if (sort === 'room')
    return [...rows].sort((a, b) => ((a as Person).room ?? 99) - ((b as Person).room ?? 99) || byName(a, b));
  if (sort === 'rank') {
    const rk = listOf(s.settings.lists, 'soldierRanks');
    const ix = (r: string) => {
      const i = rk.indexOf(r);
      return i < 0 ? -1 : i;
    };
    return [...rows].sort((a, b) => ix(b.rank) - ix(a.rank) || byName(a, b));
  }
  return [...rows].sort(byName);
}
