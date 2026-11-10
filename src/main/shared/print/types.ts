// The types of the sheet geometry: `Geo`, `Table` and the sort column types.
//
// Purpose: types only: `Geo` (a sheet measured for printing), `Table`, `SortCol` and `SortKind`.
// Does NOT: contain code. It exists so that sheetGeo.ts, tables.ts, sort.ts and the planners do not import each other
//   for their types.
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: a small owner file for the shared shapes keeps the import graph free of cycles, type cycles included (Phase
//   4.8a, verbatim).
// Covering test: test/print-sort.test.ts and test/print-layout.test.ts.
import type { ParsedSheet } from './sheet';

/** How a column is compared when sorting. */
export type SortKind = 'text' | 'num' | 'date' | 'rank';

/** A sortable column: `k` = heading key (sortKey), `label` as written, `kind` = how it compares. */
export interface SortCol {
  k: string;
  label: string;
  kind: SortKind;
}

/**
 * A table of the sheet: its heading row, its rows below (down to the totals or the first cell without a border), the
 * sortable columns (with the key of the heading: "Ο/Σ" → "ΟΣ") and the Α/Α columns that stay in place. `span`: the
 * columns of the table when it sits next to another one (Phase 3 of the forms): it is sorted alone, cell by cell, not
 * whole rows.
 */
export interface Table {
  head: number;
  rows: number[];
  cols: (SortCol & { c: number })[];
  fixed: number[];
  span?: number[];
}

/**
 * The geometry of one sheet for printing: area, visible rows and columns, title rows, header/footer, blocks, tables and
 * fixed parts.
 */
export interface Geo {
  sh: ParsedSheet;
  idx: number;
  ps: string;
  pm: string;
  po: string;
  rowsAll: number[];
  colsAll: number[];
  rowH: (r: number) => number;
  colW: (c: number) => number;
  W: number;
  titles: [number, number] | null;
  titleList: number[];
  titleH: number;
  oddH?: string;
  oddF?: string;
  firstNo: number;
  grid: boolean;
  dom: { name: string; sz: number }; // the font of most cells (for "Arial 12 → 10 pt")
  units: number[][][]; // blocks (room, table between empty rows) made of units (rows joined by a vertical merge)
  framed: Set<number>; // rows with a border (only these grow in "Ψηλότερες γραμμές")
  tables: Table[]; // tables with a heading row, which are sorted when printing
  regroup: (rows: number[]) => number[][][];
  fix?: Map<number, number>; // sorted: Α/Α cell (key) → the row that had this position (Α/Α stays 1, 2, 3...)
  // Forms (Michael, 22/10): heading, date, title and signatures (FIXED_MARK) print at their own size, whatever the
  // scale of the table is. fixC: their cells, fixR: the rows that have only these (they grow and shrink with them).
  fixC?: Set<number>;
  fixR?: Set<number>;
}
