// The IPC handlers of the auto-update.
//
// Purpose: `registerUpdate` registers the eleven `upd*` channels; each one forwards to the updater (`main/updater.ts`)
//   through `handleGuarded`, so a throwing updater answers a fallback instead of rejecting in the renderer.
// Does NOT: create the updater, check or download anything itself, or decide when the check runs (main.ts boot
//   creates it with `setUpd`, runs `startup()` before the window opens and `schedule()` after `ready-to-show`).
// Owner layer: main (architecture), `features/update`. Imports `ipc/handle` and `features/update/state`; never main.ts.
// Why: moved verbatim from main.ts (Phase 4.6b), same channels in the same order. The release file names and the
//   format `main/update.ts` reads are frozen (CLAUDE.md rule 3) and are untouched: only the registration moved.
// Covering test: test/ipc-contract.test.ts (channels), test/auto-update.test.ts (the update logic); the Electron
//   comparison in the PR (no-update and error paths, events).
import { handleGuarded } from '../../ipc/handle';
import { upd } from './state';

/**
 * Registers the update channels (`updInfo`, `updCheck`, `updAuto`, `updStart`, `updCancel`, `updSeen`, `updSkip`,
 * `updRestart`, `updFile`, `updRollback`, `updOpenReleases`). Call it once, inside the boot closure, after `setUpd`.
 * The handlers read `upd` when they run (not when they are registered), so a call before `setUpd` fails only inside
 * the guarded handler, as before.
 */
export function registerUpdate() {
  const on = handleGuarded;
  on(
    'updInfo',
    () => {
      upd?.confirm();
      return upd!.info();
    },
    null as never,
  );
  on('updCheck', () => upd!.check(true), null as never);
  on('updAuto', (v: boolean) => upd!.setAuto(v), null as never);
  on('updStart', () => upd!.start(), undefined);
  on('updCancel', () => upd!.cancel(), undefined);
  on('updSeen', () => upd!.seen(), undefined);
  on('updSkip', () => upd!.skip(), undefined);
  on('updRestart', () => upd!.restart(), undefined);
  on('updFile', () => upd!.fromFile(), { ok: false, error: 'Δεν ξεκίνησε η ενημέρωση' } as never);
  on('updRollback', () => upd!.rollback(), { ok: false, error: 'Δεν έγινε η επιστροφή' });
  on('updOpenReleases', () => upd!.openReleases(), undefined);
}
