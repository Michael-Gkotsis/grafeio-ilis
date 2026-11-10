// Loads the on-demand code of the app (screens, cards, dialogs) while the app is idle, so a click finds it ready.
// Purpose: `startPrefetch()` walks `PREFETCH_ORDER` and imports ONE module per idle callback; `holdPrefetch()` pauses
//   the walk while a command runs; typing pauses it by itself.
// Does NOT: render anything, change what a route or overlay shows (loaders.ts + React.lazy do that), or load a module
//   twice (`import()` of the same module is the same promise, so a click during prefetch just joins the load).
// Owner layer: renderer/app (architecture). Why: the first JS file holds only the shell and «Σήμερα» (Phase 5.1b);
//   without prefetch the first click on every other screen would wait for its chunk to be read and compiled, which is
//   slow on the unit's Intel Atom.
// Covering test: test/prefetch.test.ts (order, one module per idle slot, pauses, idempotent, errors do not stop it).
import { MODULES, type ModuleName } from './loaders';

/**
 * Order of the walk: most used first.
 *  1. people: the Δυναμολόγιο and, above all, the soldier card and the declaration dialog, which open from «Σήμερα»,
 *     from every list and from Ctrl+K;
 *  2. guard: Υπηρεσίες and Εξοδούχοι, the daily work;
 *  3. other: Ιατρικά, Δύναμη, ΗΚΑΙ, Ιστορικό (the screens «Σήμερα» links to);
 *  4. dayForms: the button next to the title of «Σήμερα»;
 *  5. cadre, weapons, notes: Στελέχη (and the cadre card), Οπλισμός, Σημειώσεις (and the note dialog, Ctrl+Shift+N);
 *  6. reports, settings, guide, diag: used least often and the biggest, so they go last.
 */
export const PREFETCH_ORDER: readonly ModuleName[] = [
  'people',
  'guard',
  'other',
  'dayForms',
  'cadre',
  'weapons',
  'notes',
  'reports',
  'settings',
  'guide',
  'diag',
];

/** Wait after the first screen before the first module: the first paint and the effects of the first render run first. */
export const START_DELAY_MS = 250;
/** Typing counts as «still typing» for this long after the last key. */
export const TYPING_QUIET_MS = 1200;
/** Retry delay while paused (typing or a running command). */
export const PAUSE_RETRY_MS = 400;
/** `requestIdleCallback` gives up waiting for an idle moment after this long and runs anyway. */
export const IDLE_TIMEOUT_MS = 4000;
/** Fallback «idle» slot where `requestIdleCallback` does not exist. */
export const FALLBACK_IDLE_MS = 200;

/** The clock and scheduler the walk uses; the test replaces them. */
export interface PrefetchEnv {
  now(): number;
  /** Runs `fn` when the browser is idle (or after a short wait where there is no `requestIdleCallback`). */
  whenIdle(fn: () => void): void;
  /** Runs `fn` after `ms` milliseconds. */
  later(fn: () => void, ms: number): void;
  /** Loads one module. */
  load(name: ModuleName): Promise<unknown>;
}

const browserEnv: PrefetchEnv = {
  now: () => performance.now(),
  whenIdle: (fn) => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout: IDLE_TIMEOUT_MS });
    else setTimeout(fn, FALLBACK_IDLE_MS);
  },
  later: (fn, ms) => {
    setTimeout(fn, ms);
  },
  load: (name) => MODULES[name](),
};

let lastKeyAt = Number.NEGATIVE_INFINITY;
let holds = 0;

/**
 * Pauses the walk until the returned function is called (a command is running; its answer must not wait behind the
 * parse of a chunk). Calling the release twice is harmless.
 * @returns release function
 */
export function holdPrefetch(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
  };
}

/** Marks «the user is typing now». Wired to `keydown` by `startPrefetch`; exported for the test. */
export function noteKeyPress(at: number): void {
  lastKeyAt = at;
}

/** Test helper: back to the initial state. */
export function resetPrefetch(): void {
  lastKeyAt = Number.NEGATIVE_INFINITY;
  holds = 0;
}

const paused = (env: PrefetchEnv): boolean => holds > 0 || env.now() - lastKeyAt < TYPING_QUIET_MS;
const pause = (env: PrefetchEnv, ms: number) => new Promise<void>((resolve) => env.later(resolve, ms));
const idle = (env: PrefetchEnv) => new Promise<void>((resolve) => env.whenIdle(resolve));

let keyListener = false;

/**
 * Starts the walk once the first screen is on the page: waits `START_DELAY_MS`, then loads one module per idle slot,
 * and waits for the user to stop typing and for running commands to finish before each one.
 * @param env - scheduler and loader (the app's own by default)
 * @param order - modules to load, in order
 * @returns promise that resolves when every module has been tried (the app ignores it; the test awaits it)
 */
export async function startPrefetch(env: PrefetchEnv = browserEnv, order: readonly ModuleName[] = PREFETCH_ORDER) {
  if (env === browserEnv && !keyListener) {
    keyListener = true;
    addEventListener('keydown', () => noteKeyPress(env.now()), { capture: true, passive: true });
  }
  await pause(env, START_DELAY_MS);
  for (const name of order) {
    await idle(env);
    while (paused(env)) {
      await pause(env, PAUSE_RETRY_MS);
      await idle(env);
    }
    try {
      await env.load(name);
    } catch {
      // A failed import must not stop the others; opening that screen reports it, as before.
    }
  }
}
