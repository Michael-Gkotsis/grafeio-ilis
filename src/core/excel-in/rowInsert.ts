// Rows that go into a sheet.
//
// Purpose: `RowInsert` (n new rows after a row), `placeRows` (the steps, the new place of an old row, the first new
//   row), `withRows` (the preview sheet) and `stepFin` / `stepRows`.
// Does NOT: decide which rows to insert (the writers do) or insert them (src/main/xlsx.ts does).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/excel-in/roster (types).
// Why: inserting rows moves everything below; the plan, the preview and the real write must agree on where each old
//   row went, so the arithmetic is kept in one place.
// Covering tests: test/insert-rows.test.ts, test/new-soldier.test.ts.
import type { CellValue, RawSheet } from './roster';

/**
 * Rows to insert in a sheet: `n` new rows after row `after`, shaped like row `tpl` (rows of the sheet as it was,
 * counted from 0).
 */
export interface RowInsert {
  after: number;
  n: number;
  tpl: number;
}
/**
 * Turns insertions (in increasing order of `after`) into `steps` (one by one, each at the positions after the previous
 * ones), `fin` (where a row of the sheet as it was ends up) and `at` (the first new row of insertion k).
 */
export function placeRows(ins: RowInsert[]): {
  steps: RowInsert[];
  fin: (r: number) => number;
  at: (k: number) => number;
} {
  const fin = (r: number) => r + ins.reduce((t, x) => t + (x.after < r ? x.n : 0), 0);
  const steps = ins.map((x, k) => ({
    after: x.after + ins.slice(0, k).reduce((t, y) => t + y.n, 0),
    n: x.n,
    tpl: x.tpl + ins.slice(0, k).reduce((t, y) => t + (y.after < x.tpl ? y.n : 0), 0),
  }));
  return { steps, fin, at: (k) => fin(ins[k].after) + 1 };
}
/** A sheet with the inserted rows empty (for the preview: who is in each row after the write). */
export function withRows(sheet: RawSheet, steps: RowInsert[]): RawSheet {
  const rows = [...sheet.rows];
  for (const x of steps) rows.splice(x.after + 1, 0, ...Array.from({ length: x.n }, () => [] as CellValue[]));
  return { ...sheet, rows };
}
/** After the steps of `placeRows`: where a row of the sheet went. */
export const stepFin = (steps: RowInsert[]) => (r: number) => steps.reduce((x, st) => (x > st.after ? x + st.n : x), r);
/** After the steps of `placeRows`: which rows of the new sheet are new. */
export const stepRows = (steps: RowInsert[]) =>
  new Set(steps.flatMap((st) => Array.from({ length: st.n }, (_, i) => st.after + 1 + i)));
