// Public API of the dirs feature: what main.ts may import.
//
// Purpose: re-exports the folder-settings IPC registration.
// Does NOT: hold code, and does not export `dirOf` (only this slice uses it).
// Owner layer: main (architecture), `features/dirs`.
// Why: one entry point per slice, as the target layout in CLAUDE.md asks.
// Covering test: test/architecture.test.ts (layers, no cycle).
export { registerDirsIpc } from './ipc';
