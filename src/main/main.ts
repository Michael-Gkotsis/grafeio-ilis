// Entry point of the main process: boot switches, hook installs, single-instance lock and the calls into app/.
//
// Purpose: the first file Electron runs. It keeps what must happen at the top of the process, in this order: the
//   module imports (their evaluation order is a contract), `T0`, the GPU and `lang` switches, the three hooks that
//   break import cycles, then the single-instance lock with the second-instance handler, and starts `app/boot`
//   (`startApp`) and `app/quit` (`installQuitHandlers`).
// Does NOT: hold any boot step, window, dialog or quit logic (see src/main/app/), any IPC handler (src/main/features/)
//   or any rule (src/shared/).
// Owner layer: main (architecture), entry.
// Why: it was the 372-line boot file; its parts moved to app/boot.ts, app/lockdown.ts, app/recover.ts, app/window.ts
//   and app/quit.ts (Phase 4 boot) with the same statements in the same order. Several imports below are now BARE: the
//   names moved to app/*, but the modules must still be evaluated at the position they always had.
// Covering test: test/architecture.test.ts (layer rules, no userData read before app/paths.ts); the boot is driven
//   under Electron and compared old vs new in the PR report.
import { app } from 'electron';
import './shared/db';
import './files';
// The bare imports keep the module evaluation order of the file: their code moved into features/exports,
// features/sources and features/reports, but they must still be evaluated at this position, before app/paths.ts runs
// setPath('userData').
import '../shared/preflight';
import '../shared/commands';
import '../shared/dates';
import './xlsx';
import './ziphash';
import './offload';
import './ipc/handle';
import './sources';
import '../shared/sources';
import '../shared/cadreSource';
import './hdDocx';
// Bare import: the print engine's code is still used (by features/print), but it must stay evaluated at this position.
import './print';
import './reports';
// Bare imports: the ΕΣΣΟ rules and archive engine are used by features/esso now, but stay evaluated at this position.
import '../shared/esso';
import './esso';
import './updater';
import './app/tables';
import { win } from './app/state';
import { onCommandApplied } from './features/commands';
import './app/dirs';
// Bare import: features/esso uses it now, but it stays evaluated at this position.
import './app/serial';
// The exports feature (and, through it, app/paths.ts) is evaluated right before the last two imports below.
import { onPrintPreview } from './features/exports';
// bindings/autowrite stay after the exports import: app/bindings reads DATA, so app/paths.ts must not run earlier.
import './app/bindings';
import { onAutoWriteDeps, scheduleAuto } from './features/autowrite';
import { notify } from './features/sources';
import { regenReports } from './features/reports';
import './features/forms';
import { printPreview } from './features/print';
import './features/esso';
// The backups, diag, dirs and update features come after the exports import, so app/paths.ts is already evaluated.
import './features/backups';
import './features/diag';
import './features/dirs';
import './features/update';
// These two stay the LAST of the imports that main.ts had before the boot moved out: app/paths.ts runs
// app.setPath('userData', ...) when it is evaluated, which must stay after every other imported module and before this
// file's body (as when it was a line of this file).
import './app/paths';
import { readFlags } from './app/meta';
// The boot modules are NEW and come last, so every module above keeps its evaluation order and only these are appended.
import { startApp } from './app/boot';
import { installQuitHandlers } from './app/quit';

const T0 = Date.now();
// GPU switch and Chromium switches stay here, at their boot position: flags.json is read by app/meta.ts.
if (readFlags().disableGpu || process.argv.includes('--disable-gpu')) app.disableHardwareAcceleration();
// Greek for Chromium: date fields show day/month/year even on Windows with English settings (otherwise month/day)
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

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  void startApp(T0);
  installQuitHandlers();
}
