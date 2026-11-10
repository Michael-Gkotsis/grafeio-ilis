// Public API of the esso feature: what main.ts may import.
//
// Purpose: re-exports the IPC registration of Settings › ΕΣΣΟ.
// Does NOT: hold code, and does not export the helpers (`sameDir`, `newRoot`, `outDirsOf`, `settleAuto`...): nothing
//   outside the slice uses them, so they stay private to it.
// Owner layer: main (architecture), `features/esso`.
// Why: one entry point per slice, as the target layout in CLAUDE.md asks.
// Covering test: test/architecture.test.ts (layers, no cycle).
export { registerEssoIpc } from './ipc';
