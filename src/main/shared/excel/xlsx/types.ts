// Types shared by Sheet and Workbook.
//
// Purpose: the parsed shape of a row and a cell, and the value type of a cell.
// Does NOT: hold any logic (types only; erased by the build).
// Owner layer: main (architecture), `shared/excel/xlsx`. Pure string work on OOXML text; no Electron, no fs.
// Why: Sheet.rows and the public value type of the engine were declared inside the old src/main/xlsx.ts; one type
//   file keeps sheet.ts and workbook.ts from importing each other for them (Phase 4.7).
// Covering test: test/excel-misc.test.ts (values read back through Workbook).

/**
 * One `<c>` of the sheet: column (1-based), attribute text, inner XML and whether it was written as `<c .../>`.
 */
export interface Cell {
  col: number;
  attrs: string;
  inner: string;
  selfClose: boolean;
}
/** One `<row>`: row number (1-based), attribute text and its cells in column order. */
export interface Row {
  r: number;
  attrs: string;
  cells: Cell[];
}
/** A cell value as the app passes it to the engine (Date = a calendar day in UTC). */
export type XlValue = string | number | boolean | Date | null;
