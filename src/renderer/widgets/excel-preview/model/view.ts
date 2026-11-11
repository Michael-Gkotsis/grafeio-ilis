// Pure helpers of the Excel preview: when a row is the same, how a big sheet is cut into chunks, column letters.
// Purpose: `sameCell`, `sameRow`, `chunked`, `columnLetters` and the chunk constants of `ExcelSheet`.
// Does NOT: build a sheet (shared/lib/sheets does) or touch React.
// Owner layer: renderer/widgets/excel-preview. Why: moved verbatim from common.ts (Phase 5.3c part 2).
// Covering test: test/screens-main.test.ts.
import type { Cell, SheetModel } from '../../../shared/lib/sheets/model';

/** Rows per chunk of a big sheet: only chunks near the screen are drawn, the others keep only their height. */
export const CHUNK = 20;
/** Fallback row height in px before any chunk has been measured. */
export const ROW_H = 29;

/** True when two cells draw the same (value, style class, spans). */
export const sameCell = (a: Cell | null, b: Cell | null) =>
  a === b || (!!a && !!b && a.v === b.v && a.s === b.s && a.cs === b.cs && a.rs === b.rs);

/** True when two rows draw the same: a row is redrawn only when one of its cells or its flash changed. */
export const sameRow = (a: (Cell | null)[], b: (Cell | null)[]) =>
  a === b || (a.length === b.length && a.every((c, i) => sameCell(c, b[i])));

/**
 * Big sheets (monthly grid: 150 people x 31 days, about 6000 cells) are cut into chunks of `CHUNK` rows. Not when
 * cells span several rows (rowSpan), because those cannot be cut.
 */
export const chunked = (m: SheetModel) =>
  m.rows.length > CHUNK * 3 && m.rows.every((r) => r.every((c) => !c || c.rs === 1));

/** Excel column letters A..Z, AA.. for the header row. */
export const columnLetters = (cols: number[]) =>
  cols.map((_, i) =>
    i < 26
      ? String.fromCharCode(65 + i)
      : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)),
  );

/** Rows that changed between two models of the same sheet, as row index -> changed column indexes. */
export const changedCells = (prev: SheetModel, model: SheetModel) => {
  const changed = new Map<number, Set<number>>();
  for (const [ri, r] of model.rows.entries()) {
    const o = prev.rows[ri];
    if (o === r) continue;
    for (const [ci, c] of r.entries()) {
      if (c && !sameCell(c, o[ci])) {
        const x = changed.get(ri) ?? new Set<number>();
        changed.set(ri, x);
        x.add(ci);
      }
    }
  }
  return changed;
};
