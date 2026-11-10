// Cadre sheets: emptying rows and adding new ones.
//
// Purpose: `clearRow` (empty the cells of a row) and `addRows` (new rows: free rows first, then below the table).
// Does NOT: decide which rows change (cadreWrite.ts, cadreAbsWrite.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/excel-in/writeCells,
//   core/excel-in/tableRows, core/excel-in/cellText.
// Why: the two cadre writers add and clear rows the same way as the posts and the capabilities do, and must never
//   cut a table that stands beside theirs.
// Covering tests: test/cadre-excel.test.ts.
import type { SourceBinding } from '../model/bindings';
import type { RawSheet } from './roster';
import { cellText } from './cellText';
import { tableRows } from './tableRows';
import { type SourcePlan, sideBy, noRoomTxt } from './writeCells';

/** Plans to empty the cells of row `r` (inside the width of the table, except the Α/Α). */
export const clearRow = (
  plan: SourcePlan,
  sheet: RawSheet,
  scan: ReturnType<typeof tableRows>,
  b: SourceBinding,
  r: number,
) => {
  const row = sheet.rows[r] || [];
  for (let c = scan.width[0]; c <= scan.width[1]; c++)
    if (c !== b.cols.aa && cellText(row[c]) !== '') plan.sets.push({ r, c, v: null });
};
/**
 * New rows: first the free ones, then below the table (as in the posts and the capabilities). Returns the items that
 * got a row (`put` writes one item into a row); when new rows would cut a neighbouring table (`sideBy`) nothing is
 * inserted and a warning is set.
 */
export function addRows<T>(
  plan: SourcePlan,
  sheet: RawSheet,
  b: SourceBinding,
  scan: ReturnType<typeof tableRows>,
  free: number[],
  n0: number,
  items: T[],
  put: (r: number, x: T) => void,
  label: (x: T) => string,
): T[] {
  free.sort((a, c) => a - c);
  const rows = sheet.rows;
  let n = n0;
  let i = 0;
  const aa = (r: number) => {
    if (b.cols.aa != null && cellText((rows[r] || [])[b.cols.aa]) === '') plan.sets.push({ r, c: b.cols.aa, v: ++n });
    else n++;
  };
  for (; i < items.length && i < free.length; i++) {
    put(free[i], items[i]);
    aa(free[i]);
  }
  const rest = items.slice(i);
  const after = Math.max(scan.end, b.header);
  if (rest.length && sideBy(sheet, b, after)) {
    plan.warn = [noRoomTxt(b.sheet, rest.map(label))];
    plan.added = i;
    return items.slice(0, i);
  }
  if (rest.length) {
    const tpl = scan.records.length
      ? scan.records[scan.records.length - 1].r
      : scan.free.length
        ? scan.free[0]
        : b.header;
    plan.insert = { after, n: rest.length, tpl };
    rest.forEach((x, j) => {
      const r = after + 1 + j;
      put(r, x);
      if (b.cols.aa != null) plan.sets.push({ r, c: b.cols.aa, v: ++n });
    });
  }
  plan.added = items.length;
  return items;
}
