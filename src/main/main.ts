// Main process: βάση, κανόνες, αρχεία. Το UI ζητά ενέργειες μέσω IPC και παίρνει πίσω τη νέα κατάσταση.
import { app, BrowserWindow, dialog, Menu, session } from 'electron';
import fs from 'fs';
import path from 'path';
import { Store, CorruptDbError, listBackups } from './shared/db';
import { copyDurable } from './files';
// The bare imports keep the module evaluation order of the file: their code moved into features/exports,
// features/sources and features/reports, but they must still be evaluated at this position, before app/paths.ts runs
// setPath('userData').
import '../shared/preflight';
import '../shared/commands';
import { nowHM, today } from '../shared/dates';
import './xlsx';
import './ziphash';
import { off, useWorker, warmWorker } from './offload';
import { handle } from './ipc/handle';
import type { Boot, CmdResult } from '../shared/api';
import { setBookReader, readBook } from './sources';
import { KINDS } from '../shared/sources';
import '../shared/cadreSource';
import './hdDocx';
// Bare import: the print engine's code is still used (by features/print), but it must stay evaluated at this position.
import './print';
import './reports';
// Bare imports: the ΕΣΣΟ rules and archive engine are used by features/esso now, but stay evaluated at this position.
import '../shared/esso';
import './esso';
import { createUpdater } from './updater';
import './app/tables';
import {
  autoBusy, autoTimer, dirty, formsDirty, seenUntil, sessionStart, store, win,
  setFormsDirty, setSeenUntil, setSessionStart, setStore, setWin,
} from './app/state';
import { onCommandApplied, registerCommandsIpc, reply, runCmd, snapshot } from './features/commands';
import { outputDir } from './app/dirs';
// Bare import: features/esso uses it now, but it stays evaluated at this position.
import './app/serial';
// The exports feature (and, through it, app/paths.ts) is evaluated right before the last two imports below.
import {
  onPrintPreview, registerExportsIpc, registerHdIpc, registerImerIpc, templates,
} from './features/exports';
// bindings/autowrite stay after the exports import: app/bindings reads DATA, so app/paths.ts must not run earlier.
import { bindingOf, srcMeta } from './app/bindings';
import {
  HOLD_RESTORE, HOLD_UNDO, daily, hold, holdAll, kindsOf, onAutoWriteDeps, retryPending, runAuto, scheduleAuto,
} from './features/autowrite';
import { notify, registerRosterIpc, registerSourcesIpc, registerSourcesWriteIpc } from './features/sources';
import {
  regenReports, registerLayoutPreviewIpc, registerReportFilesIpc, registerReportPreviewIpc, registerReportRunIpc,
  registerReportTemplatesIpc,
} from './features/reports';
import { registerFormsIpc } from './features/forms';
import { printPreview, registerPrintIpc, registerPrintJobIpc, registerPrintOutputIpc } from './features/print';
import { registerEssoIpc } from './features/esso';
// The backups, diag, dirs and update features come after the exports import, so app/paths.ts is already evaluated.
import { registerBackupFoldersIpc, registerBackupsIpc } from './features/backups';
import { registerDiagIpc } from './features/diag';
import { registerDirsIpc } from './features/dirs';
import { registerUpdate, setUpd, upd } from './features/update';
// These two stay the LAST imports: app/paths.ts runs app.setPath('userData', ...) when it is evaluated, which must stay
// after every other imported module and before this file's body (as when it was a line of this file).
import {
  BACKUPS,
  DATA,
  DATA_AT,
  DEV,
  USER_TPL,
} from './app/paths';
import { readFlags, readMeta, writeMeta } from './app/meta';

const T0 = Date.now();
// GPU switch and Chromium switches stay here, at their boot position: flags.json is read by app/meta.ts.
if (readFlags().disableGpu || process.argv.includes('--disable-gpu')) app.disableHardwareAcceleration();
// Ελληνικά για το Chromium: τα πεδία ημερομηνίας δείχνουν ημέρα/μήνα/έτος και σε Windows με αγγλικές ρυθμίσεις (αλλιώς μήνας/ημέρα)
app.commandLine.appendSwitch('lang', 'el');
// runCmd (features/commands) may not import this file: it calls the auto-write scheduling through this hook, which is
// installed while main.ts loads, before any command can run.
onCommandApplied((prev, next) => scheduleAuto(prev, next));
// The exports print through this hook: features/print imports features/forms, which imports features/exports, so a
// direct import there would close a cycle.
onPrintPreview(printPreview);
// runAuto (features/autowrite) calls the status push (features/sources, which imports autowrite) and the report writer
// (features/reports, which imports autowrite's autoReps and logWrite): either import would be a cycle, so main.ts hands
// both over.
onAutoWriteDeps({ notify, regenReports });

let ready = 0;
// Χωρίς δίκτυο και χωρίς άδειες (έρευνα §4.3): ό,τι δεν είναι τοπικό αρχείο δεν φορτώνει
function lockdown() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);
  if (!DEV) ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(file|devtools|data|blob):/i.test(d.url) }));
  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', (ev) => ev.preventDefault());
    wc.on('will-navigate', (ev) => ev.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}
// Χαλασμένη βάση: προτείνουμε επαναφορά από το πιο πρόσφατο αντίγραφο που περνά τον έλεγχο
async function recover(reason: string, empty = false): Promise<boolean> {
  const good = listBackups(BACKUPS).find((b) => !store.validate(path.join(BACKUPS, b.name)));
  const db = path.join(DATA, 'ilh.db');
  const aside = () => {
    fs.mkdirSync(BACKUPS, { recursive: true });
    fs.renameSync(db, path.join(BACKUPS, 'χαλασμένη_' + Date.now() + '.db'));
  };
  if (!good) {
    // άδειο αρχείο χωρίς κανένα αντίγραφο: αλλιώς η εφαρμογή δεν θα άνοιγε ποτέ ξανά. Ξεκινά κενή, και από εκεί
    // γίνεται επαναφορά από USB.
    if (!empty) return false;
    const r = await dialog.showMessageBox({
      type: 'warning',
      title: 'Γραφείο Λοχία',
      noLink: true,
      buttons: ['Ξεκίνα με κενή βάση', 'Έξοδος'],
      defaultId: 1,
      cancelId: 1,
      message: 'Η βάση δεδομένων είναι άδεια και δεν βρέθηκε αντίγραφο ασφαλείας.',
      detail:
        'Λεπτομέρεια: ' +
        reason +
        '\n\nΑν έχεις αντίγραφο σε USB, ξεκίνα με κενή βάση και κάνε επαναφορά από εκεί (Ρυθμίσεις → Αντίγραφα ασφαλείας → «Φέρε αντίγραφο από USB…»).\nΤο άδειο αρχείο θα κρατηθεί στον φάκελο backups.',
    });
    if (r.response !== 0) return false;
    aside();
    await store.open();
    store.addAudit(
      {
        at: nowHM(),
        day: today(),
        text: 'Η βάση ήταν άδεια χωρίς αντίγραφο: ξεκίνησε κενή (' + reason + ')',
        files: [],
        source: 'auto',
        undoable: false,
      },
      null,
    );
    return true;
  }
  const r = await dialog.showMessageBox({
    type: 'warning',
    title: 'Γραφείο Λοχία',
    noLink: true,
    buttons: ['Επαναφορά', 'Έξοδος'],
    defaultId: 0,
    cancelId: 1,
    message: empty
      ? 'Η βάση δεδομένων είναι άδεια (π.χ. κόπηκε το ρεύμα την ώρα που γραφόταν).'
      : 'Η βάση δεδομένων φαίνεται χαλασμένη.',
    detail:
      'Λεπτομέρεια: ' +
      reason +
      '\n\nΕπαναφορά από το αντίγραφο ' +
      good.name +
      ';\nΗ χαλασμένη βάση θα κρατηθεί στον φάκελο backups.',
  });
  if (r.response !== 0) return false;
  aside();
  copyDurable(path.join(BACKUPS, good.name), db);
  await store.open();
  holdAll(HOLD_RESTORE);
  store.addAudit(
    {
      at: nowHM(),
      day: today(),
      text:
        'Επαναφορά βάσης από αντίγραφο ' + good.name + ' (η προηγούμενη ήταν ' + (empty ? 'άδεια' : 'χαλασμένη') + ')',
      files: [],
      source: 'auto',
      undoable: false,
    },
    null,
  );
  return true;
}

function createWindow() {
  const icon = path.join(__dirname, '..', 'renderer', 'icon.png'); // λογότυπο στη γραμμή εργασιών (στο dev μπορεί να λείπει)
  setWin(new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 600,
    show: false,
    title: 'Γραφείο Λοχία',
    backgroundColor: '#f4f5f0',
    ...(fs.existsSync(icon) ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  }));
  win!.once('ready-to-show', () => {
    win!.maximize();
    win!.show();
  });
  // καμία πλοήγηση ή νέο παράθυρο προς τα έξω
  win!.webContents.on('will-navigate', (e) => e.preventDefault());
  win!.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (DEV && process.env.VITE_URL) win!.loadURL(process.env.VITE_URL);
  else win!.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win!.on('closed', () => {
    setWin(null);
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      // Αυτόματη ενημέρωση: αν περιμένει αλλαγή του resources\app (ή η νέα έκδοση απέτυχε 2 φορές), γίνεται ΠΡΙΝ ανοίξει παράθυρο
      try {
        const updater = createUpdater({ dataDir: DATA, getWin: () => win, backup: (l) => store.backup(l), today });
        setUpd(updater);
        if (updater.startup()) return;
      } catch (e) {
        console.error('update', e);
      }
      Menu.setApplicationMenu(DEV ? Menu.buildFromTemplate([{ role: 'viewMenu' }]) : null);
      lockdown();
      // το νήμα των Excel: ανάγνωση, έντυπα και εγγραφή στο Δυναμολόγιο χωρίς να παγώνει το παράθυρο
      useWorker(path.join(__dirname, 'worker.js'));
      setBookReader((f) => off('readBook', [f], () => readBook(f)));
      setStore(new Store(DATA, path.join(__dirname, 'sql-wasm.wasm')));
      try {
        await store.open();
      } catch (e) {
        if (!(e instanceof CorruptDbError) || !(await recover(String(e.message), e.empty))) {
          dialog.showErrorBox('Γραφείο Λοχία', 'Δεν άνοιξε η βάση δεδομένων:\n' + String(e) + '\n\nΦάκελος: ' + DATA);
          app.quit();
          return;
        }
      }
      daily();
      setInterval(daily, 10 * 60 * 1000);
      // τα αρχεία που είναι ήδη ορισμένα (από παλιότερη έκδοση) είναι γνωστά
      const st0 = store.state.settings;
      srcMeta.allow([
        ...Object.values(st0.sources || {}).map((x) => x?.file || ''),
        ...Object.values(st0.forms || {}).flatMap((x) => [x?.file || '', x?.dir || '']),
      ]);
      setSessionStart(store.audit(1)[0]?.id || 0);
      const meta = readMeta();
      setSeenUntil(
        typeof meta.seenAudit === 'number' && meta.seenAudit <= sessionStart ? meta.seenAudit : sessionStart,
      );
      writeMeta({ seenAudit: sessionStart });

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
      const answer = (r: ReturnType<typeof runCmd>): CmdResult => (r.ok ? reply(r.text) : r);
      // αρχεία και φάκελοι αλλάζουν μόνο από τους διαλόγους του main (src:save, form:save, φάκελοι), όχι με εντολή από το UI
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
      // Αρχεία Excel
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
      // ready is assigned after createWindow, later in this closure: the diag handler reads it when it is asked.
      registerDiagIpc({ startupMs: () => ready - T0 });
      registerBackupFoldersIpc();
      registerDirsIpc();
      registerEssoIpc();
      registerUpdate();
      createWindow();
      ready = Date.now();
      win?.once('ready-to-show', () => {
        try {
          upd?.schedule();
        } catch {
          /* σιωπηλά */
        }
      });
      // Στην εκκίνηση: ό,τι δεν πρόλαβε να γραφτεί την προηγούμενη φορά (κλείσιμο, ρεύμα). Γράφεται μόνο ό,τι λείπει από τα
      // Excel και μόνο όπου ο πίνακας δεν άλλαξε στο μεταξύ, όπως σε κάθε αυτόματη εγγραφή.
      setTimeout(warmWorker, 2500);
      setTimeout(() => {
        for (const k of KINDS) if (bindingOf(k.id)) dirty.add(k.id);
        setFormsDirty(true);
        runAuto();
      }, 4000);
    })
    .catch((e) => {
      // λάθος στην εκκίνηση (π.χ. στην επαναφορά): μήνυμα και κλείσιμο, όχι διεργασία χωρίς παράθυρο που κρατά την εφαρμογή «ανοιχτή»
      console.error('startup', e);
      try {
        dialog.showErrorBox(
          'Γραφείο Λοχία',
          'Η εφαρμογή δεν ξεκίνησε:\n' + (e instanceof Error ? e.message : String(e)) + '\n\nΦάκελος: ' + DATA,
        );
      } finally {
        app.exit(1);
      }
    });
  // Στο κλείσιμο: ό,τι περιμένει να γραφτεί στα Excel και στα έντυπα (το χρονόμετρο των 1,2 δευτ.) γράφεται πριν κλείσει
  // η εφαρμογή, το πολύ για 10 δευτ. Αλλιώς μια αλλαγή λίγο πριν το κλείσιμο δεν θα έφτανε ποτέ στο Excel.
  let quitting = false;
  app.on('before-quit', (e) => {
    if (quitting || !store || (!dirty.size && !formsDirty && !autoBusy)) return;
    e.preventDefault();
    quitting = true;
    clearTimeout(autoTimer);
    const work = (async () => {
      while (autoBusy) await new Promise((r) => setTimeout(r, 100));
      await runAuto();
    })();
    Promise.race([work, new Promise((r) => setTimeout(r, 10000))])
      .catch((err) => console.error('quit', err))
      .finally(() => app.quit());
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    try {
      store?.close();
    } catch {
      /* ήδη κλειστή */
    }
    try {
      upd?.atQuit();
    } catch {
      /* θα ξαναδοκιμαστεί στην επόμενη εκκίνηση */
    }
  });
}
