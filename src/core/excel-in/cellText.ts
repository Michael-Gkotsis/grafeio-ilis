// Cells as text and dates in the Ίλη's Excel files.
//
// Purpose: `cellText` / `headText` (what a cell says), `colLetter` and `parseDate` (every date format the sergeant
//   types).
// Does NOT: know anything about tables or fields (columns.ts and tableRows.ts do).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/lib, core/model/cells.
// Why: every reader of the Excel files needs the same reading of a cell, so a date or a header is understood in one
//   way.
// Covering tests: test/sources.test.ts, test/column-heads.test.ts, test/format.test.ts.
import type { ISODate } from '../lib/dates';
import { normGreek } from '../lib/text';
import type { CellValue } from './roster';

/**
 * The text of a cell: '' when empty, an ISODate for a date, an integer without decimals, otherwise the text with
 * single spaces and no edge spaces.
 */
export const cellText = (v: CellValue): string => {
  if (v == null) return '';
  if (v instanceof Date) return isoOf(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  return String(v).replace(/\s+/g, ' ').trim();
};
/** A header as text: capitals without accents, single spaces, no dots or colons at the end. */
export const headText = (v: CellValue) =>
  normGreek(cellText(v))
    .replace(/\s+/g, ' ')
    .replace(/[.:]+$/, '')
    .trim();
const isoOf = (d: Date) =>
  d.getUTCFullYear() +
  '-' +
  String(d.getUTCMonth() + 1).padStart(2, '0') +
  '-' +
  String(d.getUTCDate()).padStart(2, '0');
/** The Excel letter of a column counted from 0 (0 → A, 25 → Z, 26 → AA). */
export const colLetter = (n: number) => {
  let s = '';
  n++;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/**
 * A date from a cell: an Excel date, a day count, or text like 17/9/26, 17-09-2026, 17.9.2026. Null when it is not a
 * valid date.
 */
export function parseDate(v: CellValue): ISODate | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(+v) ? null : isoOf(v);
  if (typeof v === 'number')
    return v > 20000 && v < 80000 ? isoOf(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)) : null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2}|\d{4})$/.exec(s);
  if (m) return ok(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}
/** Checks a calendar date (year, month, day) and returns it as an ISODate; null when it does not exist (e.g. 31/2). */
function ok(y: number, m: number, d: number): ISODate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const x = new Date(Date.UTC(y, m - 1, d));
  if (x.getUTCMonth() !== m - 1) return null;
  return isoOf(x);
}
