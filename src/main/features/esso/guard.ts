// The ΕΣΣΟ guards: which folders the user may name, which archives the app knows, and the "one change at a time" flag.
//
// Purpose: owns the two pieces of ΕΣΣΟ state (`essoDirs`, `essoBusy`) and the three small checks built on them:
//   `sameDir`, `okEssoDir` and `knownArchives`. Every ΕΣΣΟ file reads them, so they live in one owner file.
// Does NOT: archive, start or restore anything, show a dialog, or touch the database.
// Owner layer: main (architecture), `features/esso`. Imports `app/paths` and `app/meta`.
// Why: moved verbatim from main.ts (Phase 4.6a). `essoDirs` and `essoBusy` must stay single module-level instances:
//   the dialog handlers add to `essoDirs`, the start/restore code checks it, and `essoBusy` is the lock that makes a
//   second start/restore answer "already changing". `essoArchives` in meta.json is a frozen contract (CLAUDE.md
//   rule 3).
// Covering test: test/esso.test.ts (the archive engine and the pure ΕΣΣΟ rules, not these guards); the guards are
//   exercised by the Electron comparison of the PR. There is no unit test of them.
import path from 'path';
import { archiveRoot } from '../../app/paths';
import { readMeta } from '../../app/meta';

/** Folders the user picked in the ΕΣΣΟ dialogs; only these (and the archive root) are accepted as targets. */
export const essoDirs = new Set<string>();

/**
 * True while a new series or a restore is running. A live ESM binding: read it by name, change it only through
 * `setEssoBusy` (an importer cannot assign an imported binding).
 */
export let essoBusy = false;

/** Replace `essoBusy`. */
export function setEssoBusy(next: boolean) {
  essoBusy = next;
}

/** Two paths name the same folder (resolved, case-insensitive: Windows). */
export const sameDir = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** A folder the user may use for the archive or the new Excel: the archive root or one chosen in a ΕΣΣΟ dialog. */
export const okEssoDir = (d: unknown): d is string =>
  typeof d === 'string' && !!d && [archiveRoot(), ...essoDirs].some((x) => sameDir(x, d));

/** The archive folders `meta.json` remembers (`essoArchives`), without anything that is not a string. */
export const knownArchives = () => (readMeta().essoArchives || []).filter((d) => typeof d === 'string');
