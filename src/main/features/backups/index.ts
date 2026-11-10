// Public API of the backups feature: what main.ts may import.
//
// Purpose: re-exports the two IPC registrations (the backup list/restore and the backup folders).
// Does NOT: hold code.
// Owner layer: main (architecture), `features/backups`.
// Why: one entry point per slice, as the target layout in CLAUDE.md asks.
// Covering test: test/architecture.test.ts (layers, no cycle).
export { registerBackupFoldersIpc } from './folders';
export { registerBackupsIpc } from './ipc';
