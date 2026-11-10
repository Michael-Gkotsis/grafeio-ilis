// Helpers for the guard (duty) table of the state.
//
// Purpose: `dropFutureGuards` (drop the future duties of hidden posts) and `setGuard` (set or clear one post of one
//   day).
// Does NOT: decide who is allowed to do a duty.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Used by the block handlers and by `assign`.
// Covering tests: test/own-phases.test.ts, test/duty-fuzz.test.ts.
import type { ISODate } from '../lib/dates';
import type { Phase } from '../model/duty';
import type { AppState } from '../model/state';
import type { Ctx } from './types';

/**
 * From tomorrow on, the duties of the posts `keys` go away (when they are hidden), only in the form that is in
 * force: the posts of the other form may have the same keys.
 */
export function dropFutureGuards(
  s: AppState,
  ctx: Ctx,
  phase: Phase,
  keys: Set<string>,
): { guards: AppState['guards']; gone: number } {
  let guards = s.guards,
    gone = 0;
  if (keys.size && phase === (s.settings.phase || 'sven')) {
    guards = { ...s.guards };
    for (const d in guards)
      if (d > ctx.today) {
        const g = guards[d];
        const left = Object.fromEntries(Object.entries(g).filter(([k]) => !keys.has(k)));
        const n = Object.keys(g).length - Object.keys(left).length;
        if (n) {
          gone += n;
          if (Object.keys(left).length) guards[d] = left;
          else delete guards[d];
        }
      }
    if (!gone) guards = s.guards;
  }
  return { guards, gone };
}
/** Sets post `k` of `date` in the guard table, or clears it when `pid` is null. Returns the new state. */
export const setGuard = (s: AppState, date: ISODate, k: string, pid: number | null): AppState => {
  const g = { ...(s.guards[date] || {}) };
  if (pid) g[k] = pid;
  else delete g[k];
  return { ...s, guards: { ...s.guards, [date]: g } };
};
