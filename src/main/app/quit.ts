// Quit handling: flush the pending Excel writes, close the database, run the update hook.
//
// Purpose: `installQuitHandlers()` registers the `before-quit`, `window-all-closed` and `will-quit` handlers.
// Does NOT: schedule or run auto-writes itself (features/autowrite owns `runAuto`), nor start the app (app/boot.ts).
// Owner layer: main (architecture), `app/`.
// Why: moved verbatim out of main.ts (Phase 4 boot). A change made just before closing sits behind the 1.2 s
//   auto-write timer; without the flush in `before-quit` it would never reach the Excel file. `quitting` stays
//   module-local: it is the re-entry guard of this handler only (the second `app.quit()` must pass through).
// Covering test: none of its own (Electron lifecycle); the pending-write flush on quit is driven under Electron in
//   the PR report.
import { app } from 'electron';
import { runAuto } from '../features/autowrite';
import { upd } from '../features/update';
import { autoBusy, autoTimer, dirty, formsDirty, store } from './state';

/** True once the flush has started, so the `app.quit()` that ends it is not intercepted again. */
let quitting = false;

/**
 * Registers the three quit handlers on `app`. Call once, in the process that holds the single-instance lock.
 *
 * - `before-quit`: if anything waits to be written to the Excel files or forms (the 1.2 s timer included), cancels
 *   the quit, writes it (waiting for a running write first), for at most 10 s, then quits for real. A failure is
 *   logged and the app still quits.
 * - `window-all-closed`: quits.
 * - `will-quit`: closes the database and runs the updater's `atQuit`; each failure is ignored on purpose.
 */
export function installQuitHandlers(): void {
  // On quit: whatever waits to be written to the Excel files and forms (the 1.2 s timer) is written before the app
  // closes, for 10 s at most. Otherwise a change made just before closing would never reach the Excel.
  app.on('before-quit', (e) => {
    if (quitting || !store || (!dirty.size && !formsDirty && !autoBusy)) return;
    e.preventDefault();
    quitting = true;
    clearTimeout(autoTimer);
    const work = (async () => {
      while (autoBusy) await new Promise((r) => setTimeout(r, 100));
      await runAuto();
    })();
    // The race is created synchronously, as the promise chain it replaces: the 10 s timer starts now. The finally
    // runs whether the race settled or threw, and quits last.
    const flushThenQuit = async () => {
      try {
        await Promise.race([work, new Promise((r) => setTimeout(r, 10000))]);
      } catch (err) {
        console.error('quit', err);
      } finally {
        app.quit();
      }
    };
    void flushThenQuit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    try {
      store?.close();
    } catch {
      /* already closed */
    }
    try {
      upd?.atQuit();
    } catch {
      /* will be tried again at the next start */
    }
  });
}
