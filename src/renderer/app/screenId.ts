// Screen ids and the route shape of the shell.
// Purpose: the closed list of view ids (`ScreenId`), the `Route` the shell keeps, and the free-form route params.
// Does NOT: import any screen (routes.ts does), so types can import this file without creating an import cycle.
// Owner layer: renderer/app (architecture). Why: `nav.go('typo')` and a wrong id in the menu lists must fail `tsc`.
// Covering test: test/screens-main.test.ts (every screen renders), test/ux-names.test.ts (menu names).

/** Every view the shell can show. The registry in routes.ts must have exactly one entry for each. */
export const SCREEN_IDS = [
  'home',
  'people',
  'cadre',
  'guard',
  'outs',
  'records',
  'strength',
  'hkai',
  'weapons',
  'reports',
  'notes',
  'history',
  'templates',
  'guide',
  'diag',
] as const;

/** A view id such as `'guard'`. */
export type ScreenId = (typeof SCREEN_IDS)[number];

/**
 * Screen state kept in the route (tab, date, filter...). Free-form on purpose: each screen owns its keys and the
 * values are strings, ISO dates, numbers or `undefined` (an `undefined` key clears what the screen remembered).
 */
// biome-ignore lint/suspicious/noExplicitAny: screens read their own keys as strings or numbers; typed in 5.1b+
export type RouteParams = Record<string, any>;

/** Where the user is: a view plus that view's params. */
export interface Route {
  view: ScreenId;
  params: RouteParams;
}
