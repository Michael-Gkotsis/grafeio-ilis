// The sheet model: what the engine knows about a workbook sheet (pure data, no file access).
// Built by src/main/bookModel.ts from an .xlsx/.xls file, or by hand in tests. All coordinates are 0-based.
import type { CellValue } from './roster';

export interface MergeRange { r1: number; c1: number; r2: number; c2: number }   // inclusive
export interface Validation {
  r1: number; c1: number; r2: number; c2: number;
  type: string;            // 'list', 'whole', ...
  items?: string[];        // list values: inline "A,B,C" or resolved from a cell range
  ref?: string;            // the range/name as written when the list points at cells
}
export type SheetState = 'visible' | 'hidden' | 'veryHidden';
export interface SheetModel {
  name: string;
  state: SheetState;
  rows: CellValue[][];                    // values (formula results for formula cells)
  fx: Set<string>;                        // 'r:c' of cells that hold a formula
  formulas: Map<string, string>;          // 'r:c' -> formula text without '=' (shared formulas expanded)
  merges: MergeRange[];
  validations: Validation[];
  comments?: Record<string, string>;      // 'r:c' -> text of the cell's note (a hint for the screen, never written)
  truncated?: boolean;                    // the sheet has more rows/columns than were read
}
export interface BookModel {
  sheets: SheetModel[];
  mtime: number;
  size: number;
  from: 'xlsx' | 'xls';
  converter?: string;                     // 'excel' | 'libreoffice' | 'custom' when the file was an .xls
}

export const key = (r: number, c: number) => r + ':' + c;
export const colLetter = (c: number): string => { let n = c + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const colIndex = (s: string): number => s.toUpperCase().split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export const cellRef = (r: number, c: number) => colLetter(c) + (r + 1);

// Plain text of a value, trimmed, with inner whitespace collapsed
export function valueText(v: CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v).replace(/\s+/g, ' ').trim();
}

// Lookup helper over a sheet: text of a cell, the merge it belongs to, and whether it is the merge anchor
export class Grid {
  readonly nRows: number;
  readonly nCols: number;
  private anchors = new Map<string, MergeRange>();   // anchor 'r:c' -> merge
  private byRow = new Map<number, MergeRange[]>();   // every row a merge touches -> its merges
  constructor(readonly sheet: SheetModel) {
    this.nRows = sheet.rows.length;
    let w = 0; for (const row of sheet.rows) if (row && row.length > w) w = row.length;
    for (const m of sheet.merges) {
      if (m.c2 + 1 > w) w = m.c2 + 1;
      this.anchors.set(key(m.r1, m.c1), m);
      for (let r = m.r1; r <= Math.min(m.r2, m.r1 + 400); r++) { const l = this.byRow.get(r); if (l) l.push(m); else this.byRow.set(r, [m]); }
    }
    this.nCols = w;
  }
  value(r: number, c: number): CellValue { return this.sheet.rows[r]?.[c]; }
  text(r: number, c: number): string { return valueText(this.sheet.rows[r]?.[c]); }
  isFormula(r: number, c: number) { return this.sheet.fx.has(key(r, c)); }
  formula(r: number, c: number) { return this.sheet.formulas.get(key(r, c)); }
  mergeAt(r: number, c: number): MergeRange | undefined { return this.anchors.get(key(r, c)); }
  // The merge covering (r,c), anchor or not
  mergeOf(r: number, c: number): MergeRange | undefined {
    const l = this.byRow.get(r); if (!l) return undefined;
    for (const m of l) if (c >= m.c1 && c <= m.c2) return m;
    return undefined;
  }
  // Text of a cell, or of the anchor of the merge that covers it
  textThrough(r: number, c: number): string {
    const m = this.mergeOf(r, c); return m ? this.text(m.r1, m.c1) : this.text(r, c);
  }
  isEmpty(r: number, c: number) { return this.textThrough(r, c) === '' && !this.isFormula(r, c); }
  rowHasContent(r: number, c1 = 0, c2 = this.nCols - 1): boolean {
    const row = this.sheet.rows[r]; if (!row) return false;
    for (let c = c1; c <= c2; c++) if (valueText(row[c]) !== '' || this.sheet.fx.has(key(r, c))) return true;
    return false;
  }
}
