// The IPC handlers of the list of backups and the restore.
//
// Purpose: `registerBackupsIpc` registers `listBackups` (the files in `data/backups`) and `restoreBackup` (validate,
//   copy beside the database, keep a copy of the current one, swap the file, relaunch).
// Does NOT: make backups (`store.backup`, `features/autowrite`'s `daily`), copy to a USB (`usbCopy` in features/diag),
//   import a backup or open folders (folders.ts), or open the database at boot (main.ts `recover`).
// Owner layer: main (architecture), `features/backups`. Imports app/*, `db`, `files`, `ipc/handle`, `features/commands`
//   and `features/autowrite`; never main.ts.
// Why: moved verbatim from main.ts (Phase 4.6b), same channels in the same order. The backup names
//   `ilh_YYYY-MM-DD_*.db` and the folder `data/backups` are frozen (CLAUDE.md rule 3); the order of the restore steps
//   (validate, copy, backup of the current database, close, rename with retries, relaunch) is the contract.
// Covering test: test/ipc-contract.test.ts (channels), test/db.test.ts (store.backup, validate);
//   the restore itself is covered by the Electron comparison in the PR (no unit test).
import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';
import { listBackups } from '../../shared/db';
import { copyDurable } from '../../files';
import { BACKUPS, DATA } from '../../app/paths';
import { store } from '../../app/state';
import { handle } from '../../ipc/handle';
import { fail } from '../commands';
import { HOLD_RESTORE, holdAll } from '../autowrite';

/** Registers `listBackups` and `restoreBackup`. A restore ends with `app.relaunch()` and `app.exit(0)`. */
export function registerBackupsIpc() {
  handle('listBackups', () => listBackups(BACKUPS));
  handle('restoreBackup', async (_e, name: string) => {
    const file = path.join(BACKUPS, path.basename(name));
    const bad = fs.existsSync(file) ? store.validate(file) : 'Δεν βρέθηκε το αντίγραφο';
    if (bad) return { ok: false, error: 'Το αντίγραφο δεν είναι καλό: ' + bad };
    // first a copy next to the database and a check; the current database is closed only if that succeeded
    const db = path.join(DATA, 'ilh.db'),
      tmp = db + '.restore.tmp';
    try {
      copyDurable(file, tmp);
      const b2 = store.validate(tmp);
      if (b2) throw new Error(b2);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      return fail('Δεν έγινε η επαναφορά, η βάση έμεινε όπως ήταν: ' + (e instanceof Error ? e.message : String(e)));
    }
    // no restore without a copy of the current database: otherwise everything done since that backup would be lost
    // for good
    try {
      store.backup('πριν-επαναφορά');
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      return fail(
        'Δεν έγινε η επαναφορά: δεν κρατήθηκε αντίγραφο της τωρινής βάσης πριν από αυτή (' +
          (e instanceof Error ? e.message : String(e)) +
          '). Η βάση έμεινε όπως ήταν. Δες αν ο φάκελος data\\backups γράφεται ή αν ο δίσκος είναι γεμάτος.',
      );
    }
    try {
      store.close();
    } catch {
      /* carry on */
    }
    try {
      for (let i = 0; ; i++) {
        try {
          fs.renameSync(tmp, db);
          break;
        } catch (e) {
          if (i >= 20 || !['EBUSY', 'EPERM', 'EACCES'].includes((e as NodeJS.ErrnoException).code as string)) throw e;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
        }
      }
    } catch (e) {
      // the database is reopened as it was, so the app keeps working
      fs.rmSync(tmp, { force: true });
      try {
        await store.open();
      } catch (e2) {
        dialog.showErrorBox('Γραφείο Λοχία', 'Δεν ξανάνοιξε η βάση: ' + String(e2));
        app.exit(1);
      }
      return fail('Δεν έγινε η επαναφορά, η βάση έμεινε όπως ήταν: ' + (e instanceof Error ? e.message : String(e)));
    }
    holdAll(HOLD_RESTORE);
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });
}
