// Loads the on-demand screens of the app (Έντυπα, Ρυθμίσεις, Οδηγός, Διάγνωση) while the app is idle, so a click finds them ready.
// Purpose: `startPrefetch()` walks `PREFETCH_ORDER` and imports ONE module per idle callback; `holdPrefetch()` pauses
//   the walk while a command runs; typing pauses it by itself.
// Does NOT: render anything, change what a route or overlay shows (loaders.ts + React.lazy do that), or load a module
//   twice (`import()` of the same module is the same promise, so a click during prefetch just joins the load).
// Owner layer: renderer/app (architecture). Why: those four screens load on demand (they were lazy before), so their
//   first open waited for the chunk; measured at 4x CPU, prefetch brings it from 126 to 46 ms (Έντυπα) and from 206 to
//   132 ms (Ρυθμίσεις). The daily screens stay eager (see the @decision in loaders.ts).
// Covering test: test/prefetch.test.ts (order, one module per idle slot, pauses, idempotent, errors do not stop it).
import { MODULES, type ModuleName } from './loaders';

/**
 * Order of the walk: the screens that load on demand (loaders.ts), most used first: Έντυπα (daily printing), Ρυθμίσεις,
 * then the Οδηγός and Διάγνωση, which are rarely opened and are the biggest.
 */
export const PREFETCH_ORDER: readonly ModuleName[] = ['reports', 'settings', 'guide', 'diag'];

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
