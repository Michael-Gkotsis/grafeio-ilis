// Handler: the notes of the office.
//
// Purpose: The handlers of `addNote`, `editNote`, `doneNote`, `deleteNote (one function, `noteCmd`)`. Each one is the
//   old `case` body of `run`, unchanged.
// Does NOT: write Excel: notes have `files: []`.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: Phase 2.7 split of the old 3100-line commands.ts: the `switch` of `run` became a typed handler map, one
//   function per command type, grouped by topic, so every command can be read and tested on its own. The bodies are
//   the old `case` bodies, unchanged.
// Covering tests: test/notes.test.ts, test/golden-outputs.test.ts, test/rules.test.ts, test/duty-fuzz.test.ts.
import type { AppState } from '../../model/state';
import type { CommandOf, Ctx, Result } from '../types';
import { noteCmd } from '../noteCmd';

/** Handler of the command handleNote. */
export function handleNote(
  s: AppState,
  c: CommandOf<'addNote' | 'editNote' | 'doneNote' | 'deleteNote'>,
  ctx: Ctx,
): Result {
  return noteCmd(s, c, ctx);
}
