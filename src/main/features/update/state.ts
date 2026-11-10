// The updater instance that boot creates and the update handlers use.
//
// Purpose: owns the one module-level `upd` (a live ESM binding) and its setter.
// Does NOT: create the updater (boot does, `createUpdater` in main/updater.ts), register handlers (ipc.ts) or decide
//   when it checks for updates.
// Owner layer: main (architecture), `features/update`. Imports only a TYPE from `main/updater.ts`, so loading it never
//   evaluates anything.
// Why: `upd` was a private `let` of main.ts written by the boot closure and read by the update handlers and by the
//   boot code (`schedule()` on `ready-to-show`, `atQuit()` on `will-quit`). One owner file and a setter let the
//   handlers move out while boot keeps writing and reading it (Phase 4.6b). Live binding: esbuild bundles main into
//   one scope, so a read after `setUpd(...)` sees the new value, exactly as the `let` did.
// Covering test: none of its own; test/auto-update.test.ts covers the update logic, and the Electron comparison of
//   the PR covers the handlers.
import type { createUpdater } from '../../updater';

/** The updater, or null before boot created it (or when creating it failed). Only boot assigns it. */
export let upd: ReturnType<typeof createUpdater> | null = null;

/** Replace the updater (boot only). */
export function setUpd(next: ReturnType<typeof createUpdater> | null): void {
  upd = next;
}
