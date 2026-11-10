// `run`: build the seat map once and dispatch a command to its handler.
//
// Purpose: `run(s, c, ctx)` computes `pm = seatMap(s)` exactly once per command, then calls the handler of `c.t`.
//   `installHandlers` receives the handler table from `index.ts`.
// Does NOT: stamp the ΗΚΑΙ moves, fit the deprivations or write history; that is `apply` in `index.ts`.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Handlers call `run` again with a new state (a command that reuses another one, for example `replaceStatus` ->
//   `declare`), so the handlers must import `run`. If `run` imported the handler table the two would form an import
//   cycle (run -> handlers -> run), which the architecture test forbids; so the table is installed from `index.ts` at
//   load time. The module state is this one `handlers` variable, set once.
// Covering tests: test/golden-outputs.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import { seatMap } from '../duty/indexes';
import type { AppState } from '../model/state';
import type { Command, Ctx, Handler, Result } from './types';

/** The handler table, set once by `index.ts` when the module loads. Why not an import: see the file header. */
let handlers: { [T in Command['t']]: Handler<T> } | undefined;

/** Called once by `index.ts` with `HANDLERS`; a second call with the same table changes nothing. */
export function installHandlers(table: { [T in Command['t']]: Handler<T> }): void {
  handlers = table;
}

/**
 * Runs one command on a state, with no stamping or deprivation fit (that is `apply`). Builds the seat map ONCE, then
 * dispatches to the handler of `c.t`. Handlers call `run` again (with a new state) to reuse another command.
 * An unknown `c.t` (impossible through the typed API) throws a TypeError: there is no handler to call.
 */
export function run(s: AppState, c: Command, ctx: Ctx): Result {
  const pm = seatMap(s); // soldiers and cadre with duties (ΕΠΟΠ/ΟΒΑ)
  return handlers![c.t](s, c as never, ctx, pm);
}
