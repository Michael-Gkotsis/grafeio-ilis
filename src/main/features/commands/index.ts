// Public API of the commands feature: what main.ts and the other areas of main may import.
//
// Purpose: re-exports the command service (`runCmd`, `reply`, `fail`, `snapshot`, `ctx`, `onCommandApplied`) and the
//   IPC registration (`registerCommandsIpc`, `AutoWriteHooks`).
// Does NOT: hold code; other files import this feature only through this index.
// Owner layer: main (architecture), `features/commands`.
// Why: one entry point per slice, as the target layout in CLAUDE.md asks.
// Covering test: test/architecture.test.ts (layers, no cycle).
export { ctx, fail, onCommandApplied, reply, runCmd, snapshot } from './service';
export { registerCommandsIpc, type AutoWriteHooks } from './ipc';
