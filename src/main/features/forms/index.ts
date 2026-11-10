// Public API of the forms feature: what main.ts and the other areas of main may import.
//
// Purpose: re-exports the known-file guard (`knownPath`) and the IPC registration of the form templates.
// Does NOT: hold code; other files import this feature only through this index.
// Owner layer: main (architecture), `features/forms`.
// Why: one entry point per slice, as the target layout in CLAUDE.md asks.
// Covering test: test/architecture.test.ts (layers, no cycle).
export { registerFormsIpc } from './ipc';
export { knownPath } from './known';
