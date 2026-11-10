// The startup sequence of the main process, from `app.whenReady()` to the first window and the delayed auto-write.
//
// Purpose: `startApp(t0)` runs, in this order: the updater's pre-window step, the menu, the lockdown, the Excel worker,
//   the database open (with recovery), the daily jobs, the session/seen audit marks, every IPC registration, the
//   window, the update schedule and the two startup timers; and it reports a startup failure and exits.
// Does NOT: hold the GPU/lang switches, the hook installs or the single-instance lock (main.ts, which must run them
//   before the app is ready), nor the quit handlers (app/quit.ts); it contains no rule of its own.
// Owner layer: main (architecture), `app/`.
// Why: moved out of the `whenReady().then(...)` closure of main.ts (Phase 4 boot). The closure is split into named
//   steps only so that each stays under the 80-line limit; the statements and their ORDER are unchanged. The order
//   is a contract: handlers must exist before the window loads, the store before any handler runs, `ready` right
//   after `createWindow()` for the diag screen's startup time.
//   The step that can stop the boot answers a boolean ("go on?") instead of `return`ing from the closure.
// Covering test: none of its own (Electron lifecycle); the fresh start, the damaged-db cases, the failure box and the
//   startup time are driven under Electron in the PR report; test/architecture.test.ts covers the layer rules.
import { app, dialog, Menu } from 'electron';
import path from 'path';
import { KINDS } from '../../shared/sources';
import type { Boot, CmdResult } from '../../shared/api';
import { today } from '../../shared/dates';
import { handle } from '../ipc/handle';
import { off, useWorker, warmWorker } from '../offload';
import { readBook, setBookReader } from '../sources';
import { CorruptDbError, Store } from '../shared/db';
import { createUpdater } from '../updater';
import { HOLD_UNDO, daily, hold, kindsOf, retryPending, runAuto, scheduleAuto } from '../features/autowrite';
import { registerBackupFoldersIpc, registerBackupsIpc } from '../features/backups';
import { registerCommandsIpc, reply, type runCmd, snapshot } from '../features/commands';
import { registerDiagIpc } from '../features/diag';
import { registerDirsIpc } from '../features/dirs';
import { registerEssoIpc } from '../features/esso';
import { registerExportsIpc, registerHdIpc, registerImerIpc, templates } from '../features/exports';
import { registerFormsIpc } from '../features/forms';
import { registerPrintIpc, registerPrintJobIpc, registerPrintOutputIpc } from '../features/print';
import {
  registerLayoutPreviewIpc,
  registerReportFilesIpc,
  registerReportPreviewIpc,
  registerReportRunIpc,
  registerReportTemplatesIpc,
} from '../features/reports';
import { notify, registerRosterIpc, registerSourcesIpc, registerSourcesWriteIpc } from '../features/sources';
import { registerUpdate, setUpd, upd } from '../features/update';
import { srcMeta, bindingOf } from './bindings';
import { outputDir } from './dirs';
import { lockdown } from './lockdown';
import { readMeta, writeMeta } from './meta';
import { DATA, DATA_AT, DEV, USER_TPL } from './paths';
import { recover } from './recover';
import {
  dirty,
  seenUntil,
  sessionStart,
  setFormsDirty,
  setSeenUntil,
  setSessionStart,
  setStore,
  store,
  win,
} from './state';
import { createWindow } from './window';

/** `Date.now()` right after the window was created; 0 before. The diag screen reads `ready - t0` when it is asked. */
let ready = 0;

/**
 * Auto-update step that runs BEFORE any window opens: if a change of `resources\app` is pending (or the new version
 * failed twice), the updater applies it and the app restarts. Creates the updater and stores it with `setUpd`.
 * @returns true when the updater took over and the boot must stop; false to go on (also when it threw: the error is
 *   logged and the boot goes on without an update).
 */
function runUpdaterStartup(): boolean {
  try {
    const updater = createUpdater({ dataDir: DATA, getWin: () => win, backup: (l) => store.backup(l), today });
    setUpd(updater);
    if (updater.startup()) return true;
  } catch (e) {
    console.error('update', e);
  }
  return false;
}

/**
 * Menu, lockdown, the Excel worker thread and the (not yet open) database object.
 * The worker keeps reading, forms and the write to the Δυναμολόγιο off the UI thread so the window does not freeze.
 */
function prepareRuntime(): void {
  Menu.setApplicationMenu(DEV ? Menu.buildFromTemplate([{ role: 'viewMenu' }]) : null);
  lockdown();
  useWorker(path.join(__dirname, 'worker.js'));
  setBookReader((f) => off('readBook', [f], () => readBook(f)));
  setStore(new Store(DATA, path.join(__dirname, 'sql-wasm.wasm')));
}

/**
 * Opens the database; a damaged or empty one goes through `recover`.
 * @returns true when the store is open; false when the open failed and the user did not recover it (the error box was
 *   shown and `app.quit()` was called, so the boot must stop). A non-corruption error is shown the same way.
 */
async function openStore(): Promise<boolean> {
  try {
    await store.open();
  } catch (e) {
    if (!(e instanceof CorruptDbError) || !(await recover(String(e.message), e.empty))) {
      dialog.showErrorBox('Γραφείο Λοχία', 'Δεν άνοιξε η βάση δεδομένων:\n' + String(e) + '\n\nΦάκελος: ' + DATA);
      app.quit();
      return false;
    }
  }
  return true;
}

/** Daily jobs, the known source files, and the «what changed since the last opening» marks (`seenUntil`). */
function restoreSession(): void {
  daily();
  setInterval(daily, 10 * 60 * 1000);
  // the files that are already set (from an older version) are known
  const st0 = store.state.settings;
  srcMeta.allow([
    ...Object.values(st0.sources || {}).map((x) => x?.file || ''),
    ...Object.values(st0.forms || {}).flatMap((x) => [x?.file || '', x?.dir || '']),
  ]);
  setSessionStart(store.audit(1)[0]?.id || 0);
  const meta = readMeta();
  setSeenUntil(typeof meta.seenAudit === 'number' && meta.seenAudit <= sessionStart ? meta.seenAudit : sessionStart);
  writeMeta({ seenAudit: sessionStart });
}

/** The `boot` handler: the first payload the renderer asks for (state snapshot plus the folders and versions). */
function registerBootIpc(): void {
  handle(
    'boot',
    (): Boot => ({
      ...snapshot(),
      dataDir: DATA,
      outputDir: outputDir(),
      templatesDir: USER_TPL,
      version: app.getVersion(),
      templates: templates(),
      lastUsb: readMeta().lastUsb || null,
      seenUntil,
      sessionStart,
      dataFallback: DATA_AT.fallback,
    }),
  );
}

/** Registers every IPC handler, in the order the boot always did (the order is part of the contract, see header). */
function registerAllIpc(t0: number): void {
  registerBootIpc();
  const answer = (r: ReturnType<typeof runCmd>): CmdResult => (r.ok ? reply(r.text) : r);
  // files and folders change only from main's dialogs (src:save, form:save, folders), never by a UI command
  const MAIN_ONLY = ['sources', 'forms', 'outputDir', 'newDirs'];
  registerCommandsIpc(answer, MAIN_ONLY, { daily, hold, kindsOf, HOLD_UNDO, scheduleAuto, notify });
  registerExportsIpc();
  registerHdIpc();
  registerImerIpc();
  registerReportTemplatesIpc();
  registerReportPreviewIpc();
  registerLayoutPreviewIpc();
  registerReportRunIpc();
  registerReportFilesIpc();
  registerRosterIpc(answer);
  // Excel files
  const pickXlsx = async (title: string) => {
    const res = await dialog.showOpenDialog(win!, {
      title,
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'xls'] }],
      properties: ['openFile'],
    });
    const file = res.canceled ? null : res.filePaths[0] || null;
    if (file) srcMeta.allow([file]);
    return file;
  };
  registerSourcesIpc(pickXlsx);
  registerSourcesWriteIpc();
  registerFormsIpc(pickXlsx);
  registerPrintIpc();
  registerPrintOutputIpc();
  registerPrintJobIpc();
  setInterval(retryPending, 60 * 1000);
  registerBackupsIpc();
  // `ready` is assigned after createWindow, in showWindow: the diag handler reads it when it is asked.
  registerDiagIpc({ startupMs: () => ready - t0 });
  registerBackupFoldersIpc();
  registerDirsIpc();
  registerEssoIpc();
  registerUpdate();
}

/** Creates the window, marks `ready`, schedules the update check and the two delayed startup jobs. */
function showWindow(): void {
  createWindow();
  ready = Date.now();
  win?.once('ready-to-show', () => {
    try {
      upd?.schedule();
    } catch {
      /* silent */
    }
  });
  // At start: whatever did not get written last time (closing, power cut). Only what is missing from the Excel files
  // is written, and only where the table did not change in the meantime, as in every automatic write.
  setTimeout(warmWorker, 2500);
  setTimeout(() => {
    for (const k of KINDS) if (bindingOf(k.id)) dirty.add(k.id);
    setFormsDirty(true);
    runAuto();
  }, 4000);
}

/**
 * Shows the "app did not start" box and exits with code 1. `app.exit(1)` runs even if the box throws.
 * Why exit: a failed boot (for example in the restore) must not leave a process without a window that keeps the app
 * "open" and holds the single-instance lock.
 */
function onStartupError(e: unknown): void {
  console.error('startup', e);
  try {
    dialog.showErrorBox(
      'Γραφείο Λοχία',
      'Η εφαρμογή δεν ξεκίνησε:\n' + (e instanceof Error ? e.message : String(e)) + '\n\nΦάκελος: ' + DATA,
    );
  } finally {
    app.exit(1);
  }
}

/**
 * Runs the whole startup once Electron is ready. Call once, from main.ts, inside the single-instance branch.
 * `app.whenReady()` is called synchronously by this call, as before.
 *
 * Any rejection (of `whenReady` or of any step) ends in `onStartupError`; it never rejects unless that handler throws.
 * @param t0 `Date.now()` taken at the top of main.ts; `diag.startupMs` is `ready - t0`.
 */
export async function startApp(t0: number): Promise<void> {
  try {
    await app.whenReady();
    if (runUpdaterStartup()) return;
    prepareRuntime();
    if (!(await openStore())) return;
    restoreSession();
    registerAllIpc(t0);
    showWindow();
  } catch (e) {
    onStartupError(e);
  }
}
