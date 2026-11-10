// Public API of the print feature: what main.ts and the other areas of main may import.
//
// Purpose: re-exports the print preview (`printPreview`) and the IPC registrations of the print window.
// Does NOT: hold code; other files import this feature only through this index.
// Owner layer: main (architecture), `features/print`.
// Why: one entry point per slice, as the target layout in CLAUDE.md asks.
// Covering test: test/architecture.test.ts (layers, no cycle).
export { registerPrintIpc, registerPrintJobIpc, registerPrintOutputIpc } from './ipc';
export { printPreview } from './preview';
