// The cells the app writes to the Ίλη's Excel files: values, plans and the small helpers.
//
// Purpose: `WVal` (a value to write), `WritePlan` / `SourcePlan` (what to write on a sheet), `sideBy` / `noRoomTxt`
//   (new rows must not cut a neighbouring table), `num`, `rankCell`, `nameCell` and `same` (is the cell already
//   right).
// Does NOT: decide what to write (writePlan.ts, personnelBack.ts, postsBack.ts… do).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/people,
//   core/excel-in/cellText.
// Why: every writer (statuses, personnel, posts, cadres) shares one meaning of a value, one way to write a rank and
//   a name, and one rule for inserting rows, so the Excel looks the same whatever the kind. Kept low in the import
//   graph so that the cadre writers and the status writers can both use it.
// Covering tests: test/sources.test.ts, test/insert-rows.test.ts, test/write-group.test.ts,
//   test/cadre-excel.test.ts.
import type { ISODate } from '../lib/dates';
import { normGreek } from '../lib/text';
import { fatherTxt, type Person } from '../model/person';
import type { CellValue, RawSheet } from './roster';
import { rankTxt } from '../people/ranks';
import { cellText, parseDate } from './cellText';

/**
 * A value the app writes into a cell: text, a number, a date (`{ date }`, written as an Excel date) or null (an empty
 * cell).
 */
export type WVal = string | number | { date: ISODate } | null;
/**
 * What to write on a sheet. `sets`: cells of existing rows; `insert`: new rows after row `after`, shaped like row
 * `tpl`; `header`: a new table (title and headers); `keys`: the identities written; `added`, `changed`, `cleared`,
 * `foreign` (rows of people the app does not know) are counts; `ambiguous`: rows not touched; `warn`: messages for the
 * user. Rows and columns count from 0.
 */
export interface WritePlan {
  sets: { r: number; c: number; v: WVal }[]; // in existing rows (from 0)
  insert: { after: number; n: number; tpl: number } | null; // new rows after this one, shaped like tpl
  header: { r: number; c: number; v: string; title?: boolean }[]; // a new table: title and headers
  keys: string[];
  added: number;
  changed: number;
  cleared: number;
  foreign: number;
  ambiguous?: number[]; // rows of namesakes that we do not know whose they are: they are not touched
  warn?: string[];
}
/**
 * True when new whole rows after row `after` (from 0) would cut something in two: whole rows push everything below
 * down in all columns, so if outside the columns of the table there is something beside it (from the headers to
 * `after`) that continues further down, e.g. a neighbouring table, it would be cut (X12). A whole table further down
 * (and wider) simply moves down.
 * The columns of the table: from the columns of the mapping, as long as the headers continue without a gap (the
 * neighbouring table has its own headers, after an empty column).
 */
export function sideBy(
  sheet: RawSheet | null | undefined,
  b: { header: number; cols: Record<string, number> },
  after: number,
): boolean {
  if (!sheet) return false;
  const head = sheet.rows[b.header] || [];
  const used = Object.values(b.cols);
  if (!used.length) return false;
  let a = Math.min(...used),
    z = Math.max(...used);
  while (a > 0 && cellText(head[a - 1]) !== '') a--;
  while (z + 1 < head.length && cellText(head[z + 1]) !== '') z++;
  const out = (r: number) => (sheet.rows[r] || []).some((v, c) => (c < a || c > z) && cellText(v) !== '');
  let beside = false;
  for (let r = b.header; r <= after && !beside; r++) beside = out(r);
  if (!beside) return false;
  for (let r = after + 1; r < sheet.rows.length; r++) if (out(r)) return true;
  return false;
}
/**
 * The warning (in Greek) for new rows that do not fit in the sheet without cutting what stands beside the table
 * (`sideBy`); `who` are the names, at most 5 are listed.
 */
export const noRoomTxt = (sheet: string, who: string[]) =>
  'Δεν χωράει στο φύλλο «' +
  sheet +
  '» χωρίς να κοπεί στα δύο ό,τι είναι δίπλα στον πίνακα (πιο κάτω, σε άλλες στήλες): ' +
  who.slice(0, 5).join(', ') +
  (who.length > 5 ? ' κ.ά.' : '') +
  '. Πρόσθεσε κενές γραμμές στο τέλος του πίνακα ή μετακίνησε τον διπλανό πίνακα· γράφεται μόνο του μόλις χωρέσει.';
/**
 * A cell text as a number when it is a plain number (no leading zero, up to 15 digits), otherwise the text: ΑΣΜ and
 * phone numbers are written as numbers.
 */
export const num = (s: string): string | number => (/^[1-9]\d{0,14}$/.test(s) ? Number(s) : s);
/**
 * The rank in the Excel: with the origin in front («ΕΠΟΠ ΛΧΙΑΣ»), unless the table has a «Προέλευση» column of its
 * own.
 */
export const rankCell = (p: Person, b?: { cols: Record<string, number> }) =>
  (b && b.cols.origin != null ? p.rank : rankTxt(p)) || null;
/**
 * The «Ονοματεπώνυμο» column (or «Όνομα» without it): for namesakes also «του <father's name>», if the table has no
 * father's name column of its own, as in the duty check and in the outs (`makeMatcher` tells it apart when reading).
 */
export const nameCell = (p: Person, b?: { cols: Record<string, number> }) =>
  p.last + ' ' + p.first + (b && b.cols.father != null ? '' : fatherTxt(p));
/**
 * True when the cell `a` already holds the value `b`: texts compare without case and accents, a date by its ISODate,
 * null means empty.
 */
export const same = (a: CellValue, b: WVal) => {
  if (b == null) return cellText(a) === '';
  if (typeof b === 'object') return parseDate(a) === b.date;
  return normGreek(cellText(a)) === normGreek(String(b));
};
/**
 * The plan of writing for one kind (used by the preview, the write and the browser test): the `WritePlan` plus the
 * names that were not found (`notFound`) and warnings.
 */
export interface SourcePlan extends WritePlan {
  notFound: string[];
  warn?: string[];
}
