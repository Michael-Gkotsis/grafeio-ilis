// The one place that sets the module-level "ambient" state the rules read implicitly.
//
// Purpose: `applyAmbient` calls the three ambient setters (clock, namesakes, unit kind) for the parts a caller
//   lists, and the four presets (`SCREEN_AMBIENT`, `STORE_AMBIENT`, `WORKER_AMBIENT`, `HISTORY_AMBIENT`) name what
//   each process needs.
// Does NOT: hold state itself (it lives in lib/dates.ts, model/person.ts, model/unit.ts), add a part a call site
//   did not call before, or touch the following, which are deliberately outside ambient:
//   - `setRankNamesOn` (src/renderer/rankName.ts): a per-PC display preference from localStorage, not app state,
//     and renderer-only; core may not import the renderer. It moves to the renderer store in Phase 5.1.
//   - roster.ts `OV`: call-scoped, set and reset inside `parseRoster` with try/finally, so it is not ambient.
//   - rules.ts `personMap` calling `noteNamesakes`: it stays, as part of the people index. It keeps the namesakes
//     right for any caller, including the worker.
// Owner layer: core (no fs, no Electron, no React); imports only from src/core.
// Why: the rules read the zone, the namesake set and the unit kind from module variables. Five call sites set them
//   by hand, each with its own subset; one documented, tested entry point keeps those subsets visible and stops a
//   new caller from forgetting one.
// Covering tests: test/ambient.test.ts (behaviour), test/architecture.test.ts (the setters are called only here).
import { clockOf } from './lib/dates';
import { noteNamesakes } from './model/person';
import type { AppState } from './model/state';
import { setUnitKind } from './model/unit';

/** One piece of ambient state: the app clock, the namesake set, or the unit kind (ΗΚΑΙ or ΗΚΑΛ, Ίλη or Λόχος). */
export type AmbientPart = 'clock' | 'namesakes' | 'unit';

/**
 * Sets the ambient state for the listed parts from `state`. Unlisted parts are left exactly as they are.
 *
 * The parts run in the fixed order namesakes, clock, unit (the renderer's order before this module existed). The
 * order is irrelevant: each setter writes its own module variable (`twinKeys`, `clockTz`/`clockFix`, `cur`/`names`)
 * and none of them reads another's, so any order gives the same result. The order of `parts` is ignored too.
 *
 * @param state only `settings` and `people` are read (`clock` and `unit` use settings, `namesakes` uses people).
 * @param parts which parts to apply; use one of the presets below so the choice is named and documented.
 * @see test/ambient.test.ts
 */
export function applyAmbient(state: Pick<AppState, 'settings' | 'people'>, parts: readonly AmbientPart[]): void {
  if (parts.includes('namesakes')) noteNamesakes(state.people);
  if (parts.includes('clock')) clockOf(state.settings);
  if (parts.includes('unit')) setUnitKind(state.settings);
}

/**
 * Renderer `Root`, on every render, before any screen is drawn: patronymic for namesakes, the zone and minute fix
 * for `today()`, and the unit words in screen texts. Screens read all three.
 */
export const SCREEN_AMBIENT: readonly AmbientPart[] = Object.freeze(['namesakes', 'clock', 'unit'] as const);

/**
 * Main `db.ts`, after the state is loaded and after each write. The store needs the clock for `today()` and
 * the namesakes for names in the history. It does not set the unit kind here: `HISTORY_AMBIENT` does that
 * just before a command runs.
 */
export const STORE_AMBIENT: readonly AmbientPart[] = Object.freeze(['clock', 'namesakes'] as const);

/**
 * Worker `worker.ts`, when it receives a new state. Only the clock is set. The worker gets the namesakes through
 * `personMap` in rules.ts, which calls `noteNamesakes` itself. The unit kind was never set here; keeping that
 * is part of this refactor (adding it would be a behaviour change for its own PR).
 */
export const WORKER_AMBIENT: readonly AmbientPart[] = Object.freeze(['clock'] as const);

/**
 * Main `main.ts` `runCmd`, before `apply()`: the unit kind, so the history text a command writes says
 * ΗΚΑΙ or ΗΚΑΛ, Ίλη or Λόχος correctly. The clock and namesakes were already set by the store.
 */
export const HISTORY_AMBIENT: readonly AmbientPart[] = Object.freeze(['unit'] as const);
