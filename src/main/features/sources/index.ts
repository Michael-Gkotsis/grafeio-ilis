// Public API of the sources feature: what main.ts and the other areas of main may import.
//
// Purpose: re-exports the reading side of the bound Excel files (status and its push, the roster and status imports,
//   the new-file and write-plan helpers) and the IPC registration of the Αρχεία Excel screen.
// Does NOT: hold code; other files import this feature only through this index.
// Owner layer: main (architecture), `features/sources`.
// Why: one entry point per slice, as the target layout in CLAUDE.md asks.
// Covering test: test/architecture.test.ts (layers, no cycle).
export { sameFile } from './book';
export { registerRosterIpc, registerSourcesIpc, registerSourcesWriteIpc } from './ipc';
export { createNew } from './plan';
export { afterRoster, rosterPreview } from './roster';
export { notify } from './status';
