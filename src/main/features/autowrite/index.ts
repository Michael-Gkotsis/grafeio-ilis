// Public API of the autowrite feature: what main.ts and the other areas of main may import.
//
// Purpose: re-exports the write-back of the app's data into the bound Excel files (scheduling, the run, the manual and
//   automatic sync, the daily jobs, the holds) and the hook installer `onAutoWriteDeps`.
// Does NOT: hold code; other files import this feature only through this index.
// Owner layer: main (architecture), `features/autowrite`.
// Why: one entry point per slice, as the target layout in CLAUDE.md asks.
// Covering test: test/architecture.test.ts (layers, no cycle).
export { daily } from './daily';
export { autoReps, logWrite, onAutoWriteDeps, retryPending, runAuto, writeLog, type AutoWriteDeps } from './run';
export { HOLD_RESTORE, HOLD_UNDO, hold, holdAll, kindsOf, scheduleAuto } from './schedule';
export { syncOut } from './sync';
