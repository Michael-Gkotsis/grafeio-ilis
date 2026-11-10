// Finding the tables of a file: which kind each table is, and where its headers are now.
//
// Purpose: `detectTables` (every table of every sheet with its best kind), `bestFor` (the best table for a kind),
//   `scoreKind`, `locateHeader` (the table moved down) and `suggestCols`.
// Does NOT: read the rows of a table (tableRows.ts) or write to it.
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/excel-in/columns,
//   core/excel-in/fields, core/excel-in/tableRows.
// Why: when the user opens a file the app proposes what each table is, so a file with several tables (punishments,
//   medical, leave…) maps in one step; the user only confirms or corrects.
// Covering tests: test/sources.test.ts, test/new-files.test.ts, test/review.test.ts, test/linked.test.ts.
import { normGreek } from '../lib/text';
import type { CellValue, RawSheet } from './roster';
import type { SourceBinding, ListKind } from '../model/bindings';
import { cellText } from './cellText';
import { isHeaderRow, mapColumns, ALL_FIELDS, dayColumns } from './columns';
import { fieldsOf, KINDS, KIND, PERSON_FIELDS } from './fields';
import { tableRows } from './tableRows';

/**
 * A table found in a sheet: its header row, the title above it, the number of people rows, the kind it fits best (null
 * = none), the score of every kind and the mapped columns of the best kind.
 */
export interface TableHit {
  sheet: string;
  header: number;
  title: string;
  rows: number;
  best: ListKind | null;
  score: Partial<Record<ListKind, number>>;
  cols: Record<string, number>;
}

function titleAbove(sheet: RawSheet, header: number): string {
  for (let r = header - 1; r >= Math.max(0, header - 3); r--) {
    const t = (sheet.rows[r] || []).map(cellText).filter(Boolean);
    if (t.length && t.length <= 2 && /[Α-ΩA-Zα-ωa-z]/.test(t[0])) return t[0];
  }
  return '';
}
/**
 * How well a header row fits `kind`: +3 per own field found, -6 per missing required field, +4 when the sheet name
 * fits, +6 when the title fits, with special rules for the monthly grid and the cadres.
 */
export function scoreKind(kind: ListKind, sheetName: string, title: string, header: CellValue[] | undefined): number {
  const k = KIND[kind];
  const cols = mapColumns(header, fieldsOf(kind));
  const own = k.fields.filter((f) => cols[f.k] != null).length,
    miss = k.fields.filter((f) => f.req && cols[f.k] == null).length;
  let s = own * 3 - miss * 6;
  if (k.sheetRe.test(normGreek(sheetName))) s += 4;
  if (k.titleRe && k.titleRe.test(normGreek(title))) s += 6;
  // monthly grid: many columns with day numbers (1, 2, 3…) in the headers
  const days = dayColumns(header).length;
  if (kind === 'duties') s += days >= 10 ? 10 : -10;
  else if (days >= 10) s -= 20;
  // their own file: without columns only cadres have (ΑΜ, ΗΚΑΙ line, in strength) and without «ΣΤΕΛΕΧΗ»
  // in the name it is no such table
  const cadreSheet = /ΣΤΕΛΕΧ/.test(normGreek(sheetName + ' ' + title));
  if (kind === 'cadres' && cols.hk == null && cols.active == null && !cadreSheet) s -= 12;
  if (kind === 'cadreAbs' && !cadreSheet && cols.hkcol == null) s -= 12;
  if (kind === 'people') {
    const cc = mapColumns(header, KIND.cadres.fields);
    if (cc.hk != null || cc.active != null) s -= 12;
  }
  if (kind === 'people') {
    const person = PERSON_FIELDS.filter((f) => cols[f.k] != null).length;
    if (cols.from == null && cols.to == null) s += 2;
    s += person * 0.5;
    if (cols.last == null || cols.first == null) s -= 10;
    // ΔΝ beneficiaries: read together with the personnel
    if (/^Δ\s?\.?\s?Ν(?![Α-Ω])|ΔΙΚΑΙΟΥΧΟΙ/.test(normGreek(sheetName))) s -= 12;
  }
  return s;
}
// A kind is proposed for a table only from this score up.
const THRESHOLD = 8;
/** All tables with people in all sheets, each with the kind it fits best (one kind per file, the surest). */
export function detectTables(sheets: RawSheet[]): TableHit[] {
  const hits: TableHit[] = [];
  for (const sh of sheets) {
    const max = Math.min(sh.rows.length, 2000);
    for (let r = 0; r < max; r++) {
      if (!isHeaderRow(sh.rows[r])) continue;
      const title = titleAbove(sh, r) || sh.name;
      const score: Partial<Record<ListKind, number>> = {};
      for (const k of KINDS) score[k.id] = scoreKind(k.id, sh.name, title, sh.rows[r]);
      const rows = tableRows(sh, r, mapColumns(sh.rows[r], ALL_FIELDS)).records.length;
      hits.push({ sheet: sh.name, header: r, title, rows, best: null, score, cols: {} });
    }
  }
  // each kind gets the table that fits it best; the others get the next kind or none
  const taken = new Set<ListKind>();
  const order = hits
    .flatMap((h) => (Object.entries(h.score) as [ListKind, number][]).map(([k, v]) => ({ h, k, v })))
    .filter((x) => x.v >= THRESHOLD)
    .sort((a, b) => b.v - a.v);
  for (const { h, k } of order) {
    if (h.best || taken.has(k)) continue;
    h.best = k;
    taken.add(k);
  }
  for (const h of hits)
    if (h.best) h.cols = mapColumns(sheets.find((s) => s.name === h.sheet)!.rows[h.header], fieldsOf(h.best));
  return hits;
}
/** The table that fits a kind best (when the user chose a file for a specific kind). */
export function bestFor(
  kind: ListKind,
  sheets: RawSheet[],
): { sheet: string; header: number; cols: Record<string, number> } | null {
  let best: { sheet: string; header: number; cols: Record<string, number>; v: number } | null = null;
  for (const sh of sheets)
    for (let r = 0; r < Math.min(sh.rows.length, 2000); r++) {
      if (!isHeaderRow(sh.rows[r])) continue;
      const v = scoreKind(kind, sh.name, titleAbove(sh, r) || sh.name, sh.rows[r]);
      if (!best || v > best.v) best = { sheet: sh.name, header: r, cols: mapColumns(sh.rows[r], fieldsOf(kind)), v };
    }
  return best && { sheet: best.sheet, header: best.header, cols: best.cols };
}
/**
 * Where the headers of a table are now: if rows came in above (from the Excel, or from the app on another table of the
 * same sheet) the table has moved down. Score = how many fields of the mapping are in the same column.
 * It stays on its row if it fits there as well as anywhere else; otherwise it goes to the nearest row with the highest
 * score.
 */
export function locateHeader(kind: ListKind, sheet: RawSheet, b: SourceBinding): number {
  const fields = fieldsOf(kind);
  const keys = Object.keys(b.cols);
  const score = (r: number) => {
    const m = mapColumns(sheet.rows[r], fields);
    return keys.filter((k) => m[k] != null && m[k] === b.cols[k]).length;
  };
  const s0 = score(b.header);
  let best = s0,
    at = b.header;
  for (let r = 0; r < Math.min(sheet.rows.length, 2000); r++) {
    if (r === b.header || !isHeaderRow(sheet.rows[r])) continue;
    const v = score(r);
    if (v > best || (v === best && v > s0 && Math.abs(r - b.header) < Math.abs(at - b.header))) {
      best = v;
      at = r;
    }
  }
  return best > s0 && best >= 3 ? at : b.header;
}
/** The suggested column of each field, from the headers (for the «προτείνεται» of the mapping). */
export const suggestCols = (kind: ListKind, sheet: RawSheet | undefined, header: number) =>
  mapColumns(sheet?.rows[header], fieldsOf(kind));
