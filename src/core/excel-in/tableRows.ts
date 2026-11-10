// The rows of a table: records, free rows and where the table ends.
//
// Purpose: `tableRows` (scan of one table below its header row) with `TableRow` / `TableScan`.
// Does NOT: decide which kind a table is (tableFind.ts) or write into it (writePlan.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/excel-in/columns,
//   core/excel-in/cellText, core/model/cells.
// Why: reading and writing must agree where a table ends and which rows are free: a new person goes to a free row,
//   and a half-written row is never overwritten. The scan also stops at the next title or totals, so two tables on
//   one sheet stay apart.
// Covering tests: test/sources.test.ts, test/insert-rows.test.ts, test/roster-sync.test.ts.
import type { CellValue, RawSheet } from './roster';
import { cellText } from './cellText';
import { isHeaderRow } from './columns';

/** A record of a table: `r` is the row (from 0), `v` the cell of each mapped field. */
export interface TableRow {
  r: number;
  v: Record<string, CellValue>;
}
/**
 * What `tableRows` found: `records` (rows with a person), `free` rows, `end` (the last row of the table), `open` (the
 * table runs to the end of the sheet), `width` (first and last column) and `partial` rows.
 */
export interface TableScan {
  records: TableRow[];
  free: number[];
  end: number;
  open: boolean;
  width: [number, number];
  partial: number[];
}
/**
 * Scans a table from below the headers to the next title or table: records (with a person), free rows (empty, or only
 * with Α/Α and a pre-filled rank/specialty or type) and where the table ends. `open`: until the end of the sheet.
 * `partial`: half-written rows without a name (e.g. only dates): they are not free, nothing is written on them.
 */
export function tableRows(sheet: RawSheet, header: number, cols: Record<string, number>): TableScan {
  const head = sheet.rows[header] || [];
  const used = Object.values(cols);
  const hcols = head.map((v, i) => (cellText(v) ? i : -1)).filter((i) => i >= 0);
  const width: [number, number] = [Math.min(...hcols, ...used, 99), Math.max(...hcols, ...used, 0)];
  const mapped = new Set(used);
  const aa = cols.aa;
  const records: TableRow[] = [];
  const free: number[] = [];
  const partial: number[] = [];
  const blankOk = new Set(['aa', 'rank', 'origin', 'spec', 'days']);
  let empty = 0,
    r = header + 1,
    last = header;
  const max = sheet.rows.length;
  for (; r < max; r++) {
    const row = sheet.rows[r] || [];
    if (isHeaderRow(row)) break;
    const has = (k: string) => cols[k] != null && cellText(row[cols[k]]) !== '';
    if (has('last') || has('first') || has('name') || has('asm')) {
      const v: Record<string, CellValue> = {};
      for (const k in cols) v[k] = row[cols[k]];
      records.push({ r, v });
      empty = 0;
      last = r;
      continue;
    }
    // title of the next table or totals: text in a column without a field, or text in the Α/Α column
    const stop = row.some((v, c) => {
      const t = cellText(v);
      if (!t) return false;
      return (c === aa && !/^\d+$/.test(t)) || (!mapped.has(c) && /[Α-ΩA-Zα-ωa-z]/.test(t));
    });
    if (stop) break;
    if (
      Object.entries(cols).some(([k, c]) => !blankOk.has(k) && !sheet.fx?.has(r + ':' + c) && cellText(row[c]) !== '')
    ) {
      partial.push(r);
      empty = 0;
      last = r;
      continue;
    }
    free.push(r);
    last = Math.max(last, r);
    if (++empty > 60) break;
  }
  // empty rows right before the next title separate the tables: they are not free seats
  const lastUsed = Math.max(
    records.length ? records[records.length - 1].r : header,
    partial.length ? partial[partial.length - 1] : header,
  );
  if (r < max)
    while (
      free.length &&
      free[free.length - 1] > lastUsed &&
      !(sheet.rows[free[free.length - 1]] || []).some((v) => cellText(v))
    )
      free.pop();
  if (r < max) last = Math.max(lastUsed, free.length ? free[free.length - 1] : header);
  return { records, free, end: last, open: r >= max, width, partial };
}
