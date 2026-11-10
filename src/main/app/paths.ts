// Where main's files live: install root, `data/`, backups, form templates, USB copy folder, Documents folders.
//
// Purpose: the leaf path constants and helpers of the main process, plus the one `app.setPath('userData', ...)`
//   call that every later path depends on.
// Does NOT: read `store` or the window, read or write meta.json / flags.json (see app/meta.ts), nor decide anything
//   about boot order (main.ts keeps `T0`, the GPU switch and the `lang` switch).
// Owner layer: main (architecture), `app/`.
// Why: these lived at the top of the 3700-line main.ts. Moved verbatim (Phase 4.1a) so later slices import them
//   instead of reaching into main.ts.
//   Evaluation order: main.ts imports this module LAST. `app.setPath('userData', ...)` therefore still runs after
//   every other module main.ts imports has been evaluated and before main.ts's own body, exactly as before. Keep
//   it the last import; no other module may import this one while main.ts still holds code that relies on that.
// Covering test: test/architecture.test.ts (no `app.getPath('userData')` before this module; layer imports); the
//   data folder and file names are frozen contracts (CLAUDE.md rule 3), checked by the golden/boot benchmarks.
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { dataDirOf } from '../files';

/** True when running from source (`electron .`), false in the packaged app. */
export const DEV = !app.isPackaged;
/** Folder that holds the bundled `templates/`: the working directory in dev, `resources/app` when packaged. */
export const BUNDLED = DEV ? process.cwd() : path.join(process.resourcesPath, 'app');

// Portable install: the data sits next to the .exe if that folder is writable, otherwise in the user's profile
/**
 * Whether `dir` can be created and written to (creates it, writes and removes a probe file `.w`).
 * Side effect: `mkdir -p dir`. Never throws; any failure answers `false`.
 */
export function writableDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const t = path.join(dir, '.w');
    fs.writeFileSync(t, '');
    fs.unlinkSync(t);
    return true;
  } catch {
    return false;
  }
}
// The name changed to «Γραφείο Λοχία» (11/10). The profile stays in the old folder so it finds the data and the
// preferences.
app.setPath('userData', path.join(app.getPath('appData'), 'Γραφείο Ίλης'));
// Windows: portable folder next to the .exe. Linux (/opt) and macOS (inside the .app) are not writable or break with
// updates, so data\ and templates\ stay in the user's profile.
/** Install root: cwd in dev, the .exe folder on Windows, otherwise the Electron userData folder. */
export const ROOT = DEV
  ? process.cwd()
  : process.platform === 'win32'
    ? path.dirname(process.execPath)
    : app.getPath('userData');
// Where the database already exists (next to the exe first): a momentary failure of the write check no longer splits
// the data in two
/** The chosen data folder and whether it is the profile fallback (`fallback`); resolved once at startup. */
export const DATA_AT = dataDirOf(path.join(ROOT, 'data'), path.join(app.getPath('userData'), 'data'), writableDir);
/** The `data/` folder: `ilh.db`, `meta.json`, `flags.json`, `forms.json`, `sources.json` (frozen names). */
export const DATA = DATA_AT.dir;
/** `data/backups`: backup files `ilh_YYYY-MM-DD_*.db` (frozen names). */
export const BACKUPS = path.join(DATA, 'backups');
/** Folder name of the USB backup copies, created inside the folder the user picks (frozen). */
export const USB_DIR = 'Γραφείο Ίλης αντίγραφα';
/** How many backup copies are kept in the USB folder. */
export const USB_KEEP = 10;
/** The user's own form templates next to the install root (`templates\`). */
export const USER_TPL = path.join(ROOT, 'templates');
// Forms: your own templates (uploaded or made here), named <id>.xlsx; they stay on a New ΕΣΣΟ too
/** `data/Πρότυπα εντύπων`: uploaded or generated report templates (frozen folder name). */
export const TPL_DIR = path.join(DATA, 'Πρότυπα εντύπων');
/** Valid file name of a stored template: `<uuid>.xlsx` or `.xlsm`. */
export const TPL_NAME = /^[0-9a-f-]{36}\.xls[xm]$/i;
/** Largest template file accepted, in bytes (5 MB). */
export const TPL_MAX = 5 * 1024 * 1024;
/**
 * Reads a stored template from `TPL_DIR`.
 * @param file `<uuid>.xlsx` name (checked against `TPL_NAME`).
 * @throws Error (Greek text) for an unknown name or a missing file.
 */
export const tplBuf = (file: string) => {
  if (!TPL_NAME.test(file)) throw new Error('Άγνωστο πρότυπο');
  const f = path.join(TPL_DIR, file);
  if (!fs.existsSync(f)) throw new Error('Λείπει το αρχείο του προτύπου. Ανέβασέ το ξανά στα Έντυπα › Πρότυπα.');
  return fs.promises.readFile(f);
}; // the sergeant can put his own version of a form here
/**
 * Path of a bundled form template: the user's `templates\<file>` if it exists, else the one shipped with the app.
 * @param file e.g. `froura.xlsx`.
 */
export const tplPath = (file: string) =>
  fs.existsSync(path.join(USER_TPL, file)) ? path.join(USER_TPL, file) : path.join(BUNDLED, 'templates', file);
/** `data/forms.json`: the list of forms already written (frozen name). */
export const OUTS_FILE = path.join(DATA, 'forms.json');
/** Documents folder of the app, `Έγγραφα\Γραφείο Ίλης` (frozen name); a function because it asks Electron each time. */
export const DOCS = () => path.join(app.getPath('documents'), 'Γραφείο Ίλης');
/** `Αρχείο ΕΣΣΟ` inside `DOCS()`: default folder of ΕΣΣΟ archives. */
export const archiveRoot = () => path.join(DOCS(), 'Αρχείο ΕΣΣΟ');
