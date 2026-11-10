// The files the app is allowed to open or print for the user.
//
// Purpose: `knownPath` says whether a file or folder is one the app knows: a bound source, a bound form template, a
//   form it made, or a file of a saved report.
// Does NOT: check that the file exists or has the right extension (the callers do), or open anything.
// Owner layer: main (architecture), `features/forms`. Imports app/*, `features/exports`.
// Why: moved verbatim from main.ts (Phase 4.5). It sits with the forms because `openPath` (forms) and `printFile`
//   (print) both guard with it, and print may import forms but not the other way round.
// Covering test: no unit test yet (it reads live store and meta.json); the refusals are covered by the Electron
//   comparison in the PR description.
import path from 'path';
import { readMeta } from '../../app/meta';
import { store } from '../../app/state';
import { readOuts } from '../exports';

/**
 * The user opens only files and folders that the app knows (sources, templates, made forms).
 * @param file absolute path; a folder matches when it is the parent of a known file
 */
export function knownPath(file: string): boolean {
  const f = path.resolve(file);
  const known = [
    ...Object.values(store.state.settings.sources || {}).map((b) => b && b.file),
    ...Object.values(store.state.settings.forms || {}).map((b) => b && b.file),
    ...readOuts().map((o) => o.file),
    ...Object.values(readMeta().repSheets || {}).map((x) => x.file),
    ...Object.values(readMeta().repHist || {})
      .flat()
      .map((x) => x.file),
  ]
    .filter(Boolean)
    .map((x) => path.resolve(x as string));
  return known.some((k) => k === f || path.dirname(k) === f);
}
