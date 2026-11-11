// The route: which screen is open, what it remembers, the «Πίσω» history, and the ways to move.
// Purpose: `useRouter()` returns the route, the back stack and `go` / `goBack` / `help` / `setParams`.
// Does NOT: open dialogs or cards (useOverlays.ts; it only asks to close them when the screen changes), draw the menu
//   or bind keys (useShortcuts.ts).
// Owner layer: renderer/app. Why: navigation rules (memory per screen, unsaved-changes questions, back stack) were
//   mixed into the 150-line Shell.
// Covering test: test/rep-page.test.ts (asks before leaving a form page), test/guide.test.ts (F1 and menu walk).
import { useCallback, useRef, useState } from 'react';
import { FORM_PARAM } from '../../shared/repPage';
import { requestLeave } from '../pending';
import { topicFor } from '../guideTopic';
import type { ISODate } from '../../shared/dates';
import { sameRoute, useRouteMemory } from './hooks';
import { normalizeRoute } from './normalizeRoute';
import { MENU_TAB } from './routes';
import type { Route, RouteParams, ScreenId } from './screenId';

/** How many screens «Πίσω» can go back through. */
const BACK_LIMIT = 30;

interface RouterDeps {
  /** From useOverlays: asks about an unsaved note before it runs the callback. */
  guard: (go: () => void) => void;
  /** From useOverlays: closes every layer and card when the screen changes. */
  closeAll: () => void;
  /** ISODate; a new day clears the remembered params. */
  today: ISODate;
}

/** Router state and actions. */
export interface RouterState {
  route: Route;
  /** Screens «Πίσω» goes back to, oldest first. */
  back: Route[];
  go(view: ScreenId, params?: RouteParams): void;
  goBack(): void;
  /** F1: the guide, on the topic of the screen you are looking at. */
  help(): void;
  /** Merges params into the current route (no history entry). */
  setParams(params: RouteParams): void;
}

/** Route state of the shell. See {@link RouterDeps}. */
export function useRouter({ guard, closeAll, today }: RouterDeps): RouterState {
  const [route, setRoute] = useState<Route>({ view: 'home', params: {} });
  const memory = useRouteMemory(route, today);
  const [back, setBack] = useState<Route[]>([]);
  // The callbacks below are stable and read the latest route and back stack through this ref.
  const cur = useRef({ route, back });
  cur.current = { route, back };
  // Moving to another screen: if a card has unsaved changes it asks first (pending.ts).
  const moveTo = useCallback(
    (next: Route, push: boolean, before?: () => void) => {
      const r = cur.current.route;
      const doIt = () => {
        before?.();
        // «Πίσω» never reopens a form-creation page.
        const kept = r.params[FORM_PARAM] ? { ...r, params: { ...r.params, [FORM_PARAM]: undefined } } : r;
        if (push && !sameRoute(r, next)) setBack((b) => [...b.slice(-(BACK_LIMIT - 1)), kept]);
        setRoute(next);
        closeAll();
        window.scrollTo(0, 0);
      };
      // Leaving a form-creation page (clicking «Έντυπα» in the menu) also asks about unsaved changes.
      if (r.params[FORM_PARAM] && !next.params[FORM_PARAM]) {
        guard(() => requestLeave(doIt));
        return;
      }
      guard(() => {
        if (next.view === r.view) doIt();
        else requestLeave(doIt);
      });
    },
    [guard],
  );
  // From the menu (no params): what you left there. With params (e.g. from «Σήμερα»): only those, so the numbers match.
  const go = useCallback(
    (to: ScreenId, toParams?: RouteParams) => {
      // Old ΗΚΑΙ-tab links (Ctrl+K, buttons) land on «Καταστάσεις» or «Ημερήσια Διαταγή» (normalizeRoute.ts).
      const target = toParams ? normalizeRoute({ view: to, params: toParams }) : undefined;
      const view = target?.view ?? to;
      const params = target?.params;
      const r = cur.current.route;
      let base: RouteParams = view === r.view ? r.params : params ? {} : memory.current[view] || {};
      const tab = MENU_TAB[view];
      if (!params && tab) base = { ...base, [tab]: undefined };
      moveTo({ view, params: { ...base, ...(params || {}) } }, true);
    },
    [moveTo],
  );
  const goBack = useCallback(() => {
    const b = cur.current.back;
    if (!b.length) return;
    moveTo(b[b.length - 1], false, () => setBack(b.slice(0, -1)));
  }, [moveTo]);
  // Inside the guide you stay where you are.
  const help = useCallback(() => {
    const r = cur.current.route;
    if (r.view !== 'guide') go('guide', { topic: topicFor(r.view, r.params) });
  }, [go]);
  const setParams = useCallback(
    (params: RouteParams) => setRoute((r) => normalizeRoute({ view: r.view, params: { ...r.params, ...params } })),
    [],
  );
  return { route, back, go, goBack, help, setParams };
}
