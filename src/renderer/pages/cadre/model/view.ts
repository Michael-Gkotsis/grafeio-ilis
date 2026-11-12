// Pure rules of the «Στελέχη» screen: status per member, counts per filter, filtered rows, the header subtitle, the
// date label, the export toast and the new order after a move.
// Purpose: `cadreStatusMap`, `countsPerFilter`, `filterRows`, `cadreSub`, `dateLabel`, `activeParts`,
//   `exportToastText`, `reorderIds` and the table `GRID`, for the screen and its test.
// Does NOT: render anything, touch React, read the store or run commands (model/useCadre.ts does).
// Owner layer: renderer/pages/cadre. Why: moved verbatim from screens/cadre.ts (Phase 6) so it is testable without a
//   render.
// Covering test: test/cadre-page-view.test.ts.
import type { AppState, Cadre } from '../../../../shared/domain';
import {
  CADRE_FILTERS,
  cadreMatch,
  cadreSearch,
  cadreStatusOn,
  type CadreFilter,
  type CadreStatus,
} from '../../../../shared/cadre';
import { dayName, dm } from '../../../../shared/dates';

/** Status of every member by id, on one day (`undefined` = present). */
export type StatusMap = Map<string, CadreStatus | undefined>;

/**
 * Table columns as in the «Δυναμολόγιο» (Michael, 18/10): rank, Ο/Σ, last name, first name, ΑΜ, phone, role. Fits a
 * 1024 px screen without scrolling (858 px with the menu collapsed); the ΗΚΑΙ line shows in the member's card and
 * in the Excel.
 */
export const GRID =
  '24px 40px 92px 44px minmax(110px,1.4fr) minmax(80px,1fr) 66px 100px minmax(56px,.6fr) minmax(110px,1.4fr) 118px';

/** The status of every member of `all` on `date` (ISODate, local time). */
export const cadreStatusMap = (all: Cadre[], state: AppState, date: string): StatusMap =>
  new Map(all.map((c): [string, CadreStatus | undefined] => [c.id, cadreStatusOn(state, c.id, date)]));

/** How many members each filter button would show. */
export const countsPerFilter = (all: Cadre[], stOf: StatusMap): Record<string, number> =>
  Object.fromEntries(CADRE_FILTERS.map(([f]) => [f, all.filter((c) => cadreMatch(f, c, stOf.get(c.id))).length]));

/** The rows of the table: members matching the filter and the (deferred) search text. */
export const filterRows = (all: Cadre[], filter: CadreFilter, stOf: StatusMap, dq: string): Cadre[] =>
  all.filter((c) => cadreMatch(filter, c, stOf.get(c.id)) && cadreSearch(c, dq));

/** «Σήμερα» is the empty label; any other day is «Αύριο 13/11» style (day name, then dd/mm). */
export const dateLabel = (date: string, today: string): string =>
  date === today ? '' : dayName(date, today) + ' ' + dm(date);

/** The header subtitle: the strength, and when there is any, the obstructed and absent counts for the shown day. */
export function cadreSub(active: number, counts: Record<string, number>, dateLbl: string): string {
  return (
    'Δυναμικό στελεχών: ' +
    active +
    (active
      ? ' · κωλυόμενοι ' +
        (counts.kol || 0) +
        ' · απόντες ' +
        (counts.apo || 0) +
        (dateLbl ? ' (' + dateLbl.toLowerCase() + ')' : ' σήμερα')
      : '') +
    '. Σύρε μια γραμμή για τη σειρά της ιεραρχίας.'
  );
}

/** The parts of the «Φίλτρο: …» line: the filter name, the day and the search text, each only when it is on. */
export const activeParts = (filter: CadreFilter, dateLbl: string, dq: string) => [
  filter !== 'all' && (CADRE_FILTERS.find(([k]) => k === filter)?.[1] ?? ''),
  dateLbl,
  dq.trim() && '«' + dq.trim() + '»',
];

/** The toast after a successful export: the file name (last path part, `\` or `/`), the sheets and the day. */
export const exportToastText = (file: string, hasInactive: boolean, date: string, today: string): string =>
  'Βγήκε ' +
  file.split(/[\\/]/).pop() +
  ': στελέχη, καταστάσεις' +
  (hasInactive ? ', εκτός δύναμης' : '') +
  (date === today ? ', για σήμερα.' : ', για ' + dayName(date, today).toLowerCase() + ' ' + dm(date) + '.');

/**
 * The id list for `orderCadre` after moving `id` next to `to`. The position counts in the whole list, also under a
 * filter. `after`: put it behind `to`, else in front. The caller has checked `id !== to`.
 */
export function reorderIds(all: { id: string }[], id: string, to: string, after: boolean): string[] {
  const ids = all.map((c) => c.id).filter((x) => x !== id);
  const i = ids.indexOf(to);
  ids.splice(after ? i + 1 : i, 0, id);
  return ids;
}
