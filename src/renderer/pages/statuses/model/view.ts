// What the «Καταστάσεις» hub counts and which tab is open.
// Purpose: `statusCounts` (the numbers on the four tabs), `statusTabItems` (tab values and labels) and `statusTab`
//   (the `stTab` route param, with the default).
// Does NOT: draw anything, read the store or the route (ui/StatusesPage.tsx does), or decide what a tab lists (the
//   widgets do).
// Owner layer: renderer/pages/statuses. Why: the four numbers moved here from `HkaiScreen`, which showed them on its
//   tabs until U5; keeping them pure makes them testable without rendering.
// Covering test: test/statuses-page.test.ts.
import type { AppState, Person } from '../../../../shared/domain';
import { TYPES } from '../../../../shared/domain';
import { awayNow } from '../../../../shared/rules';
import { reqWaiting } from '../../../shared/lib/reqWaiting';
import { recordCounts } from '../../../widgets/status-lists';

/** The tabs of the hub, in display order. `med` is the default and the one the menu opens. */
export const STATUS_TABS = ['med', 'pun', 'leave', 'req'] as const;

/** Value of the `stTab` route param. */
export type StatusTab = (typeof STATUS_TABS)[number];

/** The number on each tab; 0 means no number is shown. */
export type StatusCounts = Record<StatusTab, number>;

/**
 * The tab named by the `stTab` route param.
 * @param param - raw route param (any value, also `undefined`)
 * @returns the tab, `'med'` for a missing or unknown value
 */
export const statusTab = (param: unknown): StatusTab => STATUS_TABS.find((tab) => tab === param) ?? 'med';

/**
 * The numbers on the four tabs.
 * @param state - app state
 * @param pm - people by id (`personMap`); statuses of people who are not in it are not counted
 * @param today - ISODate, app time
 * @param now - minutes since midnight, app time
 * @returns `med` = medical records in force now (the «Τώρα (N)» rule of the list); `pun` = penalties not yet ended;
 *   `leave` = people away on leave now, not those who leave in the next days (so it agrees with «Απόντες»);
 *   `req` = requests waiting for an answer from an active person
 * @decision Michael 18/10: the same count rules the ΗΚΑΙ tabs had.
 */
export function statusCounts(state: AppState, pm: Map<number, Person>, today: string, now: number): StatusCounts {
  const { nMed, nPun } = recordCounts(state, pm, today, now, false);
  return {
    med: nMed,
    pun: nPun,
    leave: state.statuses.filter(
      (s) => TYPES[s.type].cat === 'abs' && s.from <= today && awayNow(s, today, now) && pm.has(s.pid),
    ).length,
    req: reqWaiting(state.requests).filter((r) => pm.get(r.pid)?.active).length,
  };
}

const withCount = (label: string, count: number) => (count ? label + ' (' + count + ')' : label);

/**
 * Tab values and labels with their counts: «Ιατρικά», «Ποινές (N)», «Άδειες (N)», «Αιτήσεις (N)» (a zero shows no number).
 * @param counts - from {@link statusCounts}
 */
export const statusTabItems = (counts: StatusCounts): { value: StatusTab; label: string }[] => [
  { value: 'med', label: withCount('Ιατρικά', counts.med) },
  { value: 'pun', label: withCount('Ποινές', counts.pun) },
  { value: 'leave', label: withCount('Άδειες', counts.leave) },
  { value: 'req', label: withCount('Αιτήσεις', counts.req) },
];
