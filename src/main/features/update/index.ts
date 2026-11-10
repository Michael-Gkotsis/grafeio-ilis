// Public API of the update feature: what main.ts may import.
//
// Purpose: re-exports the update IPC registration and the updater holder (`upd`, `setUpd`) that boot needs.
// Does NOT: hold code.
// Owner layer: main (architecture), `features/update`.
// Why: one entry point per slice, as the target layout in CLAUDE.md asks.
// Covering test: test/architecture.test.ts (layers, no cycle).
export { registerUpdate } from './ipc';
export { setUpd, upd } from './state';
