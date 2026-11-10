// Public API of the reports feature: what main.ts and the other areas of main may import.
//
// Purpose: re-exports the report writer used by the auto-write (`regenReports`) and the IPC registrations of the
//   Έντυπα screen (templates, previews, run, files).
// Does NOT: hold code; other files import this feature only through this index.
// Owner layer: main (architecture), `features/reports`.
// Why: one entry point per slice, as the target layout in CLAUDE.md asks.
// Covering test: test/architecture.test.ts (layers, no cycle).
export { registerReportRunIpc } from './runIpc';
export { registerLayoutPreviewIpc, registerReportPreviewIpc } from './previewIpc';
export { registerReportFilesIpc, registerReportTemplatesIpc } from './templatesIpc';
export { regenReports } from './regen';
