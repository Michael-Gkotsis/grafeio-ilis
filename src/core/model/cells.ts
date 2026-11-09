// The value type of a cell read from a spreadsheet.
//
// Purpose: `CellValue`, what an Excel cell can hold once read (text, number, boolean, date, empty).
// Does NOT: read any file or convert a value (roster.ts and the readers do).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: core code (for example statuses/hours.ts reading a time from a cell) needs the type without importing the
//   Excel reader that lives outside core.
// Covering tests: test/leave-hours.test.ts (a time read from a cell).

/** Value of one spreadsheet cell after reading; `Date` for date cells, null/undefined for empty ones. */
export type CellValue = string | number | boolean | Date | null | undefined;
