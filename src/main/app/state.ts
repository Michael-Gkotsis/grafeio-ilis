// The mutable state that the main process shares between its service groups.
//
// Purpose: one home for the module-level `let`s (and the two shared collections) that more than one feature area of
//   main reads or writes, as ESM live bindings plus one tiny setter each.
// Does NOT: hold any rule, I/O or Electron call; evaluate any path (it imports only TYPES, so loading it can never
//   run app/paths.ts and `app.setPath('userData', ...)` early); own state that belongs to a single area (the
//   `sent` snapshot, `exporting`, `previewGate`, `essoBusy`, `upd`... stay private in main.ts until their area moves).
// Owner layer: main (architecture), `app/`.
// Why: the state lived as private `let`s of the 3700-line main.ts and the IPC handlers closed over it, so no handler
//   group could move to `features/<area>/` (Phase 4.2-4.6). Importers read the binding by its plain name
//   (`store.state...`) and can never assign an imported binding, hence the setters: they are the only writers.
//   Live binding: esbuild bundles main into one scope, so a read after `setStore(...)` sees the new value, exactly as
//   a module-level `let` did.
// Covering test: test/architecture.test.ts (layer imports, no `userData` path read before app/paths.ts); the boot
//   behaviour is covered by the golden/boot benchmarks (`npm run bench:golden`, `npm run bench:full`).
import type { BrowserWindow } from 'electron';
import type { ImportRow } from '../../shared/commands';
import type { ListKind, SourceBinding } from '../../shared/sources';
import type { RawSheet } from '../../shared/roster';
import type { Store } from '../db';

/** The open database and the app state it holds. Unset until boot opens it; only boot (`setStore`) assigns it. */
export let store: Store;
/** Replace the open database (boot only). */
export function setStore(next: Store): void {
  store = next;
}

/** The main window, or null before it exists and after it is closed. Assigned only by createWindow and its `closed`. */
export let win: BrowserWindow | null = null;
/** Replace the main window reference (`null` once the window is closed). */
export function setWin(next: BrowserWindow | null): void {
  win = next;
}

/**
 * «What changed since the last opening»: audit ids in (`seenUntil`, `sessionStart`] are the previous sessions' actions
 * the user has not seen yet. Audit id, 0 when there is none; reset to 0 when a new ΕΣΣΟ clears the history.
 */
export let seenUntil = 0;
/** Replace `seenUntil` (boot, and the history reset of a new ΕΣΣΟ). */
export function setSeenUntil(next: number): void {
  seenUntil = next;
}

/** Id of the newest audit row when this session started (0 for an empty history). See `seenUntil`. */
export let sessionStart = 0;
/** Replace `sessionStart` (boot, and the history reset of a new ΕΣΣΟ). */
export function setSessionStart(next: number): void {
  sessionStart = next;
}

/**
 * After every change: the kinds of Excel list that must be written back to their files, written by the auto-write
 * timer. Mutated in place (never reassigned), so it is a plain export.
 */
export const dirty = new Set<ListKind>();
/** True when the filled forms (ΗΚΑΙ, ΦΡΟΥΡΑ, Εξοδούχοι) that were already produced must be refreshed too. */
export let formsDirty = false;
/** Replace `formsDirty`. */
export function setFormsDirty(next: boolean): void {
  formsDirty = next;
}
/** True when the saved reports that update themselves ("Ενημερώνεται μόνο του") must be rewritten. */
export let repDirty = false;
/** Replace `repDirty`. */
export function setRepDirty(next: boolean): void {
  repDirty = next;
}
/** The pending auto-write timer (set a little after a change, cleared on quit), or undefined when none is armed. */
export let autoTimer: NodeJS.Timeout | undefined;
/** Replace the auto-write timer handle. */
export function setAutoTimer(next: NodeJS.Timeout | undefined): void {
  autoTimer = next;
}
/** True while an auto-write run is in progress (quit waits for it). */
export let autoBusy = false;
/** Replace `autoBusy`. */
export function setAutoBusy(next: boolean): void {
  autoBusy = next;
}

/**
 * Personnel imports that were previewed and wait for the user's confirmation, by token. Mutated in place (never
 * reassigned). Read by the roster import, the status import and the ESSO start.
 */
export const pending = new Map<
  string,
  {
    rows: ImportRow[];
    file: string;
    binding: SourceBinding | null;
    stamp: { mtime: number; size: number };
    sheet: RawSheet | null;
  }
>();
