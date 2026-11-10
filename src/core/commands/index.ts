// The commands module: `apply`, the one entry point for every user action.
//
// Purpose: `apply(s, c, ctx)` runs the command (`run`), stamps the ΗΚΑΙ «ΕΓΓΡΑΦΕΣ / ΔΙΑΓΡΑΦΕΣ» moves of people who
//   joined or left, fits the deprivations (στέρηση εξόδου) and adds the file «Ποινές» when the fit changed the state.
//   Also re-exports the public names of the old `shared/commands.ts`.
// Does NOT: make undo patches: commands only return a new state; the database stores the difference (08 §3.7,
//   `src/main/db.ts`).
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Every user action is a pure function (state, command) -> new state + history entry, so main can store the
//   difference and undo it.
// Covering tests: test/golden-outputs.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import { noPending } from '../model/status';
import type { AppState } from '../model/state';
import { fitDeprivations } from '../statuses/punish';
import type { Command, Ctx, Result } from './types';
import { stampMoves } from './stamp';
import { HANDLERS } from './handlers';
import { installHandlers, run } from './run';

export * from './types';
export { personKey } from '../people/personKey';
export { phaseDelWhy } from './phases';
export { cleanDest, reqText } from './requests';
export { shapePerson, twinText } from './personShape';
export { rosterChanges } from './importPeople';
export { describeDay } from './describeDay';

installHandlers(HANDLERS);

/**
 * Applies a command to a state: `run`, then the ΗΚΑΙ moves stamp (`stampMoves`) and the fit of the deprivations
 * (`fitDeprivations`: after every action the end of each outing deprivation is recomputed from its days, with duties
 * and night training). When the fit changed the state the file «Ποινές» is added to `files`. An unknown `c.t`
 * (impossible through the typed API) throws a TypeError.
 * @param s The state before the command.
 * @param c The command.
 * @param ctx `today` (ISODate, local time) and the new-id function.
 * @returns The new state, the history text and the files to refresh.
 * @see test/golden-outputs.test.ts
 */
export function apply(s: AppState, c: Command, ctx: Ctx): Result {
  const r = run(s, c, ctx);
  const state = fitDeprivations(noPending(stampMoves(s, r.state, c, ctx.today)));
  return state === r.state ? r : { ...r, state, files: r.files.includes('Ποινές') ? r.files : [...r.files, 'Ποινές'] };
}
