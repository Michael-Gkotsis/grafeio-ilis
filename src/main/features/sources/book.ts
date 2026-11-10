// Reading an Excel book for the sources screens: which sheets count, and the roster override of a binding.
//
// Purpose: `bookOf` (the book the «Αρχεία Excel» pickers show), `sheetOf`, `ovOf` (a binding as the roster parser's
//   override), and `notReports` / `sameFile` (the sheets the forms wrote into a file are not tables to read).
// Does NOT: bind a file, import anything, push the status, or write a file; no timers and no events.
// Owner layer: main (architecture), `features/sources`. Imports app/*, shared/* and `main/sources.ts` (the engine).
// Why: moved verbatim from main.ts (Phase 4.3b). Every other file of this feature reads books through these helpers,
//   so they sit at the bottom and import nothing from the feature. `sameFile` is exported because the report-sheet
//   writer still in main.ts uses it too.
// Covering test: test/sources*.test.ts (reading and detection); `npm run bench:golden`.
import path from 'path';
import type { SourceBook } from '../../../shared/api';
import type { RawSheet, RosterOverride } from '../../../shared/roster';
import { detectTables, type SourceBinding } from '../../../shared/sources';
import { readMeta } from '../../app/meta';
import { readBook } from '../../sources';

/** True when both paths are the same file, compared case-insensitively as Windows does. */
export const sameFile = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
// the sheets of a file that the forms wrote (so that the import does not read them as tables)
const repOwned = (file: string): Set<string> =>
  new Set(
    Object.values(readMeta().repSheets || {})
      .filter((x) => sameFile(x.file, file))
      .flatMap((x) => x.sheets),
  );
/**
 * The sheets of `file` without the ones the forms wrote into it (`meta.json` `repSheets`).
 * @param file the Excel file the sheets were read from
 */
export const notReports = <T extends { name: string }>(file: string, sheets: T[]): T[] => {
  const own = repOwned(file);
  return own.size ? sheets.filter((x) => !own.has(x.name)) : sheets;
};
/**
 * A binding as the roster parser's override of its sheet, header row and columns.
 * @param file when given, the binding counts only if it points at this file
 */
export const ovOf = (b?: SourceBinding, file?: string): RosterOverride | undefined =>
  b && (!file || path.resolve(b.file) === path.resolve(file))
    ? { sheet: b.sheet, header: b.header, cols: b.cols }
    : undefined;
/** The book the pickers show: the sheets without the form sheets (first 1000 rows each) and the detected tables. */
export async function bookOf(file: string): Promise<SourceBook> {
  const r = await readBook(file);
  const sheets = notReports(file, r.sheets);
  return {
    ok: true,
    file,
    name: path.basename(file),
    mtime: r.mtime,
    size: r.size,
    sheets: sheets.map((x) => ({ name: x.name, rows: x.rows.slice(0, 1000) })),
    hits: detectTables(sheets),
  };
}
/** The sheet called `name`, or undefined. */
export const sheetOf = (sheets: RawSheet[], name: string) => sheets.find((x) => x.name === name);
