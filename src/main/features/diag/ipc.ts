// The IPC handlers of the «Διάγνωση» screen and the USB copy.
//
// Purpose: `registerDiagIpc` registers `diag` (versions, memory, counts, startup time), `setGpu` (writes flags.json and
//   relaunches) and `usbCopy` (a backup to a folder or USB the user picks, old copies trimmed to `USB_KEEP`).
// Does NOT: read the clock of the boot (it receives `startupMs`), make the daily backup, or relaunch by itself
//   outside `setGpu`. `usbCopy` sits here, not in features/backups, because it was registered between `setGpu` and
//   `importBackup`: moving it would change the registration order.
// Owner layer: main (architecture), `features/diag`. Imports app/*, `db`, `files`, `offload`, `ipc/handle`,
//   `features/commands` and `features/autowrite`; never main.ts.
// Why: moved verbatim from main.ts (Phase 4.6b), same channels in the same order. `flags.json`, `meta.json` and the
//   USB folder name are frozen (CLAUDE.md rule 3).
// Covering test: test/ipc-contract.test.ts (channels), test/db.test.ts (store.backup, validate); the
//   Electron comparison in the PR exercises every channel.
import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';
import { listBackups } from '../../shared/db';
import { writeJson } from '../../files';
import { workerUp } from '../../offload';
import { nowHM, today } from '../../../shared/dates';
import type { Diag } from '../../../shared/api';
import { BACKUPS, DATA, USB_DIR, USB_KEEP } from '../../app/paths';
import { FLAGS, readFlags, readMeta, writeMeta } from '../../app/meta';
import { store, win } from '../../app/state';
import { handle } from '../../ipc/handle';
import { fail } from '../commands';
import { writeLog } from '../autowrite';

/** What boot hands over: the time from process start to the window being created, read when `diag` is asked. */
export type DiagDeps = {
  /** Milliseconds from `T0` (top of main.ts) to `ready` (set after `createWindow`); 0-based, read on every call. */
  startupMs: () => number;
};

/**
 * Registers `diag`, `setGpu` and `usbCopy`.
 * @param deps `startupMs` is a function (not a number) because `ready` is assigned after this call, later in boot.
 */
export function registerDiagIpc({ startupMs }: DiagDeps) {
  handle(
    'diag',
    (): Diag => ({
      startupMs: startupMs(),
      procs: app.getAppMetrics().map((m) => ({
        type: m.type,
        kb: m.memory.workingSetSize,
        cpu: Math.round(m.cpu.percentCPUUsage * 10) / 10,
      })),
      gpuDisabled: !!readFlags().disableGpu,
      versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
      },
      dbKb: Math.round(fs.statSync(path.join(DATA, 'ilh.db')).size / 1024),
      people: store.state.people.length,
      statuses: store.state.statuses.length,
      guardDays: Object.keys(store.state.guards).length,
      dataDir: DATA,
      backups: listBackups(BACKUPS).length,
      writes: writeLog,
      worker: workerUp(),
    }),
  );
  handle('setGpu', (_e, disable: boolean) => {
    writeJson(FLAGS, { ...readFlags(), disableGpu: !!disable });
    app.relaunch();
    app.exit(0);
  });
  // Copy to a USB (research §4.2): if the PC's disk fails, the data is elsewhere
  handle('usbCopy', async () => {
    const m = readMeta();
    const r = await dialog.showOpenDialog(win!, {
      title: 'Διάλεξε το USB (ή φάκελο σε άλλο δίσκο)',
      defaultPath: m.usbDir && fs.existsSync(m.usbDir) ? m.usbDir : undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const chosen = r.filePaths[0];
    const dir = path.join(chosen, USB_DIR);
    try {
      const file = store.backup('usb', dir);
      const bad = store.validate(file);
      if (bad) {
        fs.rmSync(file, { force: true });
        return { ok: false, error: 'Το αντίγραφο δεν γράφτηκε σωστά (' + bad + '). Δοκίμασε άλλο USB.' };
      }
      for (const b of listBackups(dir).slice(USB_KEEP)) fs.rmSync(path.join(dir, b.name), { force: true });
      const day = today();
      writeMeta({ lastUsb: day, usbDir: chosen });
      store.addAudit(
        { at: nowHM(), day, text: 'Αντίγραφο ασφαλείας σε ' + dir, files: [], source: 'app', undoable: false },
        null,
      );
      const same =
        path.parse(path.resolve(chosen)).root.toLowerCase() === path.parse(path.resolve(DATA)).root.toLowerCase();
      return {
        ok: true,
        file,
        day,
        warning: same
          ? 'Ο φάκελος είναι στον ίδιο δίσκο με την εφαρμογή. Αν χαλάσει ο δίσκος, χάνεται και το αντίγραφο. Προτίμησε USB.'
          : undefined,
      };
    } catch (e) {
      return fail('Δεν γράφτηκε στο ' + chosen + ': ' + (e instanceof Error ? e.message : String(e)));
    }
  });
}
