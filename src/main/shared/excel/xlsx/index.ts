// Public face of the xlsx engine (fills and reads Ίλη's Excel templates at XML level).
//
// Purpose: the exports the old src/main/xlsx.ts had, with the same names and nothing more; helpers shared between the
//   files of this folder (esc, attr, tailInsert, ...) are imported from their own file and are not part of the public
//   face.
// Does NOT: contain code (re-exports only) or change what the engine writes: outputs stay byte for byte as before
//   (Phase 4.7).
// Owner layer: main (architecture), `shared/excel/xlsx`. Pure string work on OOXML text; no Electron, no fs.
// Why: src/main/xlsx.ts re-exports this folder so the importers do not change; they move here later.
// Covering test: test/excel-misc.test.ts and the golden hashes of `npm run bench:golden`.
export { FIXED_MARK, NOHEAD_MARK, REPORT_MARK, sheetSafe } from './marks';
export { texts, unesc } from './text';
export { Workbook } from './workbook';
export { fitBook, mergeFirstSheets, mergeSheets } from './merge';
export { attrRe, colName, colNum, growFormula, shiftFormula, splitRef } from './refs';
export { toSerial } from './dates';
export type { XlValue } from './types';
export { Sheet } from './sheet';
