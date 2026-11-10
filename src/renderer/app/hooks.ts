// Small hooks of the shell: today's date, display preferences, and what each screen remembers.
// Purpose: `useToday`, `usePrefsState`, `useRouteMemory` and the pure route helpers they and useRouter.ts share.
// Does NOT: hold the route itself (useRouter.ts), draw anything, or write any storage key except `grafeio.people`
//   (prefs.ts owns `grafeio.prefs`, `grafeio.nav` and `grafeio.recent`).
// Owner layer: renderer/app. Why: they were loose functions in app.ts; split out so Root and Shell stay short.
// Covering test: test/prefs.test.ts (preferences), test/notes.test.ts and test/guide.test.ts (route memory).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setRankNamesOn } from '../rankName';
import { applyPrefs, load, loadPrefs, save, savePrefs, type Prefs, type PrefsValue } from '../prefs';
import { onClockChange } from '../clock';
import { today as todayFn, type ISODate } from '../../shared/dates';
import type { Route, RouteParams, ScreenId } from './screenId';

/**
 * Today's date. Re-read every 30 s and whenever the clock settings change, so the app crosses midnight while open.
 * @returns ISODate, app time zone
 */
export function useToday(): ISODate {
  const [d, setD] = useState(todayFn());
  useEffect(() => {
    const t = setInterval(() => setD(todayFn()), 30000);
    const off = onClockChange(() => setD(todayFn()));
    return () => {
      clearInterval(t);
      off();
    };
  }, []);
  return d;
}

/** Window width under which the «auto» menu is the narrow rail (screens narrower than 1500 px). */
const RAIL_BELOW = 1500;

/**
 * Display preferences of this PC (theme, density, menu width, rank names), saved in `grafeio.prefs`.
 * The «auto» menu is narrow below {@link RAIL_BELOW} px and follows the window while it is resized.
 * @decision Michael 4/11: the rank-names setting is applied during render, before any screen draws.
 */
export function usePrefsState(): PrefsValue {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  // During render on purpose: the screens below must already see the new setting.
  setRankNamesOn(prefs.rankNames !== false);
  const [narrow, setNarrow] = useState(() => window.innerWidth < RAIL_BELOW);
  useEffect(() => {
    applyPrefs(prefs);
    savePrefs(prefs);
  }, [prefs]);
  useEffect(() => {
    if (prefs.nav !== 'auto') return;
    const onResize = () => setNarrow(window.innerWidth < RAIL_BELOW);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [prefs.nav]);
  const set = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v })), []);
  const rail = prefs.nav === 'auto' ? narrow : prefs.nav === 'rail';
  return useMemo(() => ({ prefs, set, rail }), [prefs, set, rail]);
}

/** localStorage key of the Personnel screen's remembered unit and sort (frozen contract). */
const PEOPLE_KEY = 'grafeio.people';
/** The only params kept across restarts. */
const PEOPLE_KEEP = ['unit', 'sort'];

const pick = (o: RouteParams, keys: string[]): RouteParams =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** Two routes are the same place: same view and same params (compared as JSON). */
export const sameRoute = (a: Route, b: Route): boolean =>
  a.view === b.view && JSON.stringify(a.params) === JSON.stringify(b.params);

/**
 * What each screen remembers when you come back from the menu. After a restart only the Personnel screen's unit and
 * sort survive (`grafeio.people`). A new day resets it, so dates start from today.
 * @param route - the current route; its params are stored under its view
 * @param today - ISODate; a change of day clears the memory
 * @returns ref to `{ [view]: params }`
 */
export function useRouteMemory(route: Route, today: ISODate) {
  const memory = useRef<Partial<Record<ScreenId, RouteParams>>>({ people: load(PEOPLE_KEY, {}) });
  useEffect(() => {
    memory.current[route.view] = route.params;
    if (route.view === 'people') save(PEOPLE_KEY, pick(route.params, PEOPLE_KEEP));
  }, [route]);
  useEffect(() => {
    memory.current = { people: load(PEOPLE_KEY, {}) };
  }, [today]);
  return memory;
}
