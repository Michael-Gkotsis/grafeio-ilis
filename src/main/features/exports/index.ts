// Public API of the exports feature: what main.ts and the other areas of main may import.
//
// Purpose: re-exports the form/Excel export service (`made`, `produce`, `X`, `excel`, the made-forms list, the form
//   lookups, `onPrintPreview`) and the IPC registrations.
// Does NOT: hold code; other files import this feature only through this index.
// Owner layer: main (architecture), `features/exports`.
// Why: one entry point per slice, as the target layout in CLAUDE.md asks.
// Covering test: test/architecture.test.ts (layers, no cycle).
export { X, excel, made, produce } from './build';
export { formBinding, formDir, formTpl, templates } from './forms';
export { lastDay, readOuts, regenForms, writeOuts } from './outs';
export { onPrintPreview } from './service';
export { registerExportsIpc, registerHdIpc, registerImerIpc } from './ipc';
