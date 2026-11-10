// Public API of the diag feature: what main.ts may import.
//
// Purpose: re-exports the diagnostics IPC registration and its parameter type.
// Does NOT: hold code.
// Owner layer: main (architecture), `features/diag`.
// Why: one entry point per slice, as the target layout in CLAUDE.md asks.
// Covering test: test/architecture.test.ts (layers, no cycle).
export { registerDiagIpc, type DiagDeps } from './ipc';
