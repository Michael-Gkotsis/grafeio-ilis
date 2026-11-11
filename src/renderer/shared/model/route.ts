// The free-form route params every screen and the navigation contract share.
// Purpose: `RouteParams`, the `params` bag of a route (tab, date, filter, open cards).
// Does NOT: list screens or build routes (app/screenId.ts and app/routes.ts do).
// Owner layer: renderer/shared/model. Why: `Nav` (shared/model/nav.ts) needs the type and may not import app/.
// Covering test: test/screens-main.test.ts (every screen reads its own keys from it).

/**
 * Screen state kept in the route (tab, date, filter...). Free-form on purpose: each screen owns its keys and the
 * values are strings, ISO dates, numbers or `undefined` (an `undefined` key clears what the screen remembered).
 */
// biome-ignore lint/suspicious/noExplicitAny: screens read their own keys as strings or numbers; typed in 5.1b+
export type RouteParams = Record<string, any>;
