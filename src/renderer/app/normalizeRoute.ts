// Old ΗΚΑΙ-tab links to their new homes.
// Purpose: `normalizeRoute` rewrites `{ hkai, hkTab }` (the five tabs the ΗΚΑΙ screen used to have) into the route that
//   shows the same content today: «Καταστάσεις» (`records`) tabs, the «Ημερήσια Διαταγή» screen (`hd`) or plain ΗΚΑΙ.
// Does NOT: navigate, touch the back stack or know other screens; any other route is returned as the same object.
// Owner layer: renderer/app. Why: Ctrl+K commands, buttons and the guide kept the old `hkTab` params; one tested
//   function keeps them all working without each caller knowing about the move (U5).
// Covering test: test/statuses-page.test.ts.
import type { Route } from './screenId';

/** `hkTab` values that moved to the «Καταστάσεις» tabs (`stTab`), same spelling. */
const MOVED_TO_STATUSES = ['pun', 'leave', 'req'];

/**
 * Maps an old ΗΚΑΙ tab route to its new place, keeping every other param (`hkaiDate`, `punTab`, `leaveTab`, `hdDate`...).
 * @param route - any route; only `{ view: 'hkai' }` with an `hkTab` key is rewritten
 * @returns `{ records, stTab }` for `pun` / `leave` / `req`, `{ hd }` for `hd`, `{ hkai }` (key dropped) for `hkai`
 *   or an empty value, and the same `route` object for everything else
 * @decision U5: the ΗΚΑΙ screen shows only the ΗΚΑΙ; its old tabs live on in «Καταστάσεις» and «Ημερήσια Διαταγή».
 */
export function normalizeRoute(route: Route): Route {
  if (route.view !== 'hkai' || !('hkTab' in route.params)) return route;
  const { hkTab, ...rest } = route.params;
  if (MOVED_TO_STATUSES.includes(hkTab)) return { view: 'records', params: { ...rest, stTab: hkTab } };
  if (hkTab === 'hd') return { view: 'hd', params: rest };
  return { view: 'hkai', params: rest };
}
