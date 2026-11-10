// The IPC handlers that bring in a backup, make a manual one and open or choose folders.
//
// Purpose: `registerBackupFoldersIpc` registers `importBackup`, `backup`, `openFolder` and `chooseOutputDir`.
// Does NOT: list or restore backups (ipc.ts), copy to a USB (`usbCopy`, features/diag) or set the per-kind and
//   per-form folders (features/dirs).
// Owner layer: main (architecture), `features/backups`. Imports app/*, `db`-free helpers, `ipc/handle` and
//   `features/commands`; never main.ts.
// Why: moved verbatim from main.ts (Phase 4.6b), same channels in the same order. The imported name keeps the frozen
//   form `ilh_YYYY-MM-DD_HHMMSS_από-αρχείο.db` (CLAUDE.md rule 3).
// Covering test: test/ipc-contract.test.ts (channels); the dialogs and the file copy are covered by the Electron
//   comparison in the PR (no unit test).
import fs from 'fs';
import path from 'path';
import { dialog, shell } from 'electron';
import { copyDurable } from '../../files';
import { nowParts, today } from '../../../shared/dates';
import { BACKUPS, DATA, USB_DIR, USER_TPL } from '../../app/paths';
import { readMeta } from '../../app/meta';
import { outputDir } from '../../app/dirs';
import { store, win } from '../../app/state';
import { handle } from '../../ipc/handle';
import { runCmd } from '../commands';

/** Registers `importBackup`, `backup`, `openFolder` and `chooseOutputDir`. */
export function registerBackupFoldersIpc() {
  // Brings a backup from a USB into the list of backups, so it can be restored from there (e.g. on a new PC)
  handle('importBackup', async () => {
    const m = readMeta();
    const r = await dialog.showOpenDialog(win!, {
      title: 'Διάλεξε αντίγραφο (ilh_….db)',
      defaultPath: m.usbDir ? path.join(m.usbDir, USB_DIR) : undefined,
      filters: [{ name: 'Αντίγραφο Γραφείου Ίλης', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const src = r.filePaths[0];
    const bad = store.validate(src);
    if (bad) return { ok: false, error: 'Το αρχείο δεν είναι καλό αντίγραφο: ' + bad };
    const d = nowParts();
    const name =
      'ilh_' + today() + '_' + [d.h, d.mi, d.s].map((n) => String(n).padStart(2, '0')).join('') + '_από-αρχείο.db';
    fs.mkdirSync(BACKUPS, { recursive: true });
    copyDurable(src, path.join(BACKUPS, name));
    return { ok: true, name };
  });
  handle('backup', () => {
    try {
      return { ok: true, file: store.backup('χειροκίνητο') };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
  handle('openFolder', (_e, which: string) => {
    const dir =
      which === 'output'
        ? outputDir()
        : which === 'templates'
          ? USER_TPL
          : which === 'backups'
            ? path.join(DATA, 'backups')
            : DATA;
    fs.mkdirSync(dir, { recursive: true });
    return shell.openPath(dir);
  });
  handle('chooseOutputDir', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Φάκελος για τα Excel',
      defaultPath: outputDir(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    runCmd({
      t: 'setSettings',
      settings: { outputDir: r.filePaths[0] },
      text: 'φάκελος αρχείων ' + r.filePaths[0],
    });
    return r.filePaths[0];
  });
}
