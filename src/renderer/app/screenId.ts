// Screen ids and the route shape of the shell.
// Purpose: the closed list of view ids (`ScreenId`), the `Route` the shell keeps, and the free-form route params.
// Does NOT: import any screen (routes.ts does), so types can import this file without creating an import cycle.
// Owner layer: renderer/app (architecture). Why: `nav.go('typo')` and a wrong id in the menu lists must fail `tsc`.
// Covering test: test/screens-main.test.ts (every screen renders), test/ux-names.test.ts (menu names).
import type { RouteParams } from '../shared/model/route';

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

/** Moved to shared/model/route.ts (5.3a); kept here for the app/ importers. */
export type { RouteParams } from '../shared/model/route';

/** Where the user is: a view plus that view's params. */
export interface Route {
  view: ScreenId;
  params: RouteParams;
}
