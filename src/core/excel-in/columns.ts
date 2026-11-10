// Which column holds which field: the mapping of the headers of a sheet to the fields (06 §3.2).
//
// Purpose: `mapColumns` (headers → columns), `refitCols` / `remapNeed` / `stampHeads` / `keepHeads` (follow the
//   columns when the sergeant moves or adds a column), `isHeaderRow`, the day columns of the monthly grid and
//   `missingFields`.
// Does NOT: find tables in a sheet (tableFind.ts) or read their rows (tableRows.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/excel-in/fields,
//   core/excel-in/cellText.
// Why: the sergeant adds and moves columns in the Excel; the app keeps working because it follows the headers, not
//   cell positions. The headers that the user chose are remembered (`heads`) so a later move is told from a wrong
//   choice.
// Covering tests: test/column-heads.test.ts, test/auto-cols.test.ts, test/duty-columns.test.ts,
//   test/sources.test.ts.
import type { CellValue, RawSheet } from './roster';
import type { SourceBinding, ListKind } from '../model/bindings';
import { headText, colLetter, cellText } from './cellText';
import { fieldsOf, isCadreKind, KIND, CAP_COLS, type FieldDef, PERSON_FIELDS, KINDS } from './fields';

/**
 * Finds the column of each field from a header row: the first column whose header matches the pattern of the field (a
 * column belongs to one field only). Keys are field keys, values are columns counted from 0.
 */
export function mapColumns(row: CellValue[] | undefined, fields: FieldDef[]): Record<string, number> {
  const cols: Record<string, number> = {};
  (row || []).forEach((v, c) => {
    const h = headText(v);
    if (!h) return;
    const f = fields.find((x) => cols[x.k] == null && x.re.test(h));
    if (f) cols[f.k] = c;
  });
  // days written as dates: the 1st of the month is the first of them
  if (cols.d1 == null && fields.some((x) => x.k === 'd1')) {
    const d = dayColumns(row);
    if (d.length >= 10) cols.d1 = d[0];
  }
  return cols;
}
/**
 * Columns that moved or were added in the Excel after the mapping (e.g. a new «ΔΝ» column in the ΣΥΝΟΛΙΚΟ).
 * The columns move as much as most of the columns with a known header moved (and those with a header of the user's own
 * move with them). A single column of the user's own that does not match is not enough for a change. Known columns
 * that were not set are added.
 */
export function refitCols(kind: ListKind, sheet: RawSheet | undefined, b: SourceBinding): SourceBinding {
  const row = sheet?.rows[b.header];
  if (!row) return b;
  const fields = fieldsOf(kind);
  const found = mapColumns(row, fields);
  const h = (c: number) => headText(row[c]);
  const ok = (k: string, c: number | undefined) => c != null && !!fields.find((f) => f.k === k)?.re.test(h(c));
  const known = (c: number) => !h(c) || ALL_FIELDS.some((f) => f.re.test(h(c)));
  const cand = Object.entries(b.cols)
    .filter(([k, c]) => !ok(k, c) && found[k] != null && found[k] !== c)
    .map(([k, c]) => ({ k, c, d: found[k] - c, sure: known(c) }));
  // the shift that most columns made (a column came in or went out)
  const mode = (l: typeof cand) => {
    const n = new Map<number, number>();
    l.forEach((x) => n.set(x.d, (n.get(x.d) || 0) + 1));
    return [...n].sort((x, y) => y[1] - x[1] || Math.abs(x[0]) - Math.abs(y[0]))[0];
  };
  const sure = cand.filter((x) => x.sure);
  const m = sure.length ? mode(sure) : cand.length > 1 ? mode(cand) : undefined;
  const D = m && (sure.length || m[1] > 1) ? m[0] : null;
  const cols: Record<string, number> = { ...b.cols };
  if (D != null) {
    const from = Math.min(...cand.filter((x) => x.d === D).map((x) => x.c));
    for (const [k, c] of Object.entries(b.cols)) {
      if (ok(k, c) || c < from) continue;
      const to = c + D;
      // another known header at the new place: the column went elsewhere (e.g. a second new column), follows its header
      cols[k] = ok(k, to) || !h(to) || !ALL_FIELDS.some((f) => f.re.test(h(to))) || found[k] == null ? to : found[k];
    }
  }
  for (const f of fields)
    if (cols[f.k] == null && found[f.k] != null && !Object.values(cols).includes(found[f.k])) cols[f.k] = found[f.k];
  // the column of a field no longer has the header it had (a column with its own, unknown header came in front of it):
  // it follows the header of the field if found in one other column only; otherwise it stays and remapNeed stops it
  if (b.heads)
    for (const [k, c] of Object.entries(cols)) {
      const f = fields.find((x) => x.k === k),
        was = b.heads[k];
      if (!f || was == null || headOk(f, was, h(c))) continue;
      const at = Array.from({ length: row.length }, (_, j) => j).filter(
        (j) => j !== c && (f.re.test(was) ? f.re.test(h(j)) : h(j) === was),
      );
      if (at.length === 1) cols[k] = at[0];
    }
  // two fields in the same column: something went wrong, the mapping stays as it was
  const used = Object.values(cols);
  if (new Set(used).size !== used.length || used.some((c) => c < 0)) return b;
  return JSON.stringify(cols) === JSON.stringify(b.cols) ? b : { ...b, cols };
}
/**
 * Every field of every table (the person fields and the fields of all kinds): to tell whether a header is known at
 * all.
 */
export const ALL_FIELDS = [...PERSON_FIELDS, ...KINDS.flatMap((k) => k.fields)];
/**
 * What blocks the automatic read and write after `refitCols`: a missing field, or a column whose header now says
 * another known field (e.g. «ΗΜΕΡΕΣ» in the column of the kind). A header of the user's own that is not a known field
 * does not count. Returns the reason in Greek for the user, or null.
 */
export function remapNeed(kind: ListKind, sheet: RawSheet | undefined, b: SourceBinding): string | null {
  const miss = missingFields(kind, b.cols);
  if (miss.length) return 'λείπει ' + miss.join(', ');
  const row = sheet?.rows[b.header];
  if (!row) return null;
  const fields = fieldsOf(kind);
  for (const [k, c] of Object.entries(b.cols)) {
    const h = headText(row[c]);
    const f = fields.find((x) => x.k === k);
    if (!h || !f || f.re.test(h)) continue;
    if (ALL_FIELDS.some((x) => x.re.test(h)))
      return (
        'η στήλη ' + colLetter(c) + ' («' + cellText(row[c]) + '») δεν είναι πια ' + f.label.replace(/ \(.*\)$/, '')
      );
  }
  // the column no longer has the header it had at the mapping and was not found elsewhere with certainty (refitCols)
  for (const [k, c] of Object.entries(b.cols)) {
    const f = fields.find((x) => x.k === k),
      was = b.heads?.[k];
    if (!f || was == null || headOk(f, was, headText(row[c]))) continue;
    return (
      'η στήλη ' +
      colLetter(c) +
      ' («' +
      (cellText(row[c]) || 'κενή') +
      '») δεν είναι πια ' +
      f.label.replace(/ \(.*\)$/, '') +
      ' («' +
      was +
      '»)'
    );
  }
  return null;
}
// The column of the field still has its header: the same as before, or (if the text changed) one that matches the field
const headOk = (f: FieldDef, was: string, now: string) => now === was || f.re.test(now);
/**
 * Remembers the headers of the columns that are surely the user's choice: those that match the field, and a header of
 * the user's own only when there is no known header of the field elsewhere and it does not look like another field
 * (otherwise we do not know whether the column was the user's choice or has already moved, and it stays as it was).
 * The same object when nothing was added.
 */
export function stampHeads(kind: ListKind, sheet: RawSheet | undefined, b: SourceBinding): SourceBinding {
  const row = sheet?.rows[b.header];
  if (!row) return b;
  const fields = fieldsOf(kind);
  const found = mapColumns(row, fields);
  const heads = { ...b.heads };
  let n = 0;
  for (const [k, c] of Object.entries(b.cols)) {
    const f = fields.find((x) => x.k === k),
      h = headText(row[c]);
    if (heads[k] != null || !f || !h) continue;
    if (f.re.test(h) || (found[k] == null && !ALL_FIELDS.some((x) => x.re.test(h)))) {
      heads[k] = h;
      n++;
    }
  }
  return n ? { ...b, heads } : b;
}
/**
 * A mapping that came from the UI or from detection: only the main process puts the headers (`heads`), from the file
 * itself, so only those we already know for the same table and the same columns stay; otherwise they are put again at
 * the next read.
 */
export function keepHeads(b: SourceBinding, cur?: SourceBinding): SourceBinding {
  const out = { ...b };
  delete out.heads;
  return cur?.heads &&
    cur.sheet === b.sheet &&
    cur.header === b.header &&
    JSON.stringify(cur.cols) === JSON.stringify(b.cols)
    ? { ...out, heads: cur.heads }
    : out;
}
const IDENT = ['last', 'name', 'asm'];
/** A header row: at least 3 known headers, one of which points to a person. */
export function isHeaderRow(row: CellValue[] | undefined): boolean {
  if (!row) return false;
  let t = 0;
  for (const v of row) if (typeof v === 'string' && v.trim()) t++;
  if (t < 3) return false;
  let n = 0,
    id = false;
  for (const v of row) {
    const h = headText(v);
    if (!h) continue;
    const f = ALL_FIELDS.find((x) => x.re.test(h));
    if (f) {
      n++;
      if (IDENT.includes(f.k)) id = true;
    }
  }
  return n >= 3 && id;
}
/** A day of the month in a header: a number 1–31 (also as text) or a date. */
export const dayNum = (v: CellValue): number | null => {
  if (v instanceof Date) return isNaN(+v) ? null : v.getUTCDate();
  const t = cellText(v);
  return /^\d{1,2}$/.test(t) && +t >= 1 && +t <= 31 ? +t : null;
};
/**
 * The day columns of the monthly grid: from the column of the 1st and as many consecutive ones as say a day (day =
 * position, not the value: in the sample the 29 is written twice); stops at the first column that does not say a day.
 */
export function dayColumns(header: CellValue[] | undefined, from?: number): number[] {
  const row = header || [];
  const start = from ?? row.findIndex((v) => dayNum(v) === 1);
  if (start < 0) return [];
  const out: number[] = [];
  for (let c = start; c < row.length && dayNum(row[c]) != null && out.length < 31; c++) out.push(c);
  return out;
}
/**
 * The days of a duty-check sheet: in the row of the headers, otherwise in the row above or below (a header on two
 * rows).
 */
export function dutyDays(sheet: RawSheet, b: { header: number; cols: Record<string, number> }): number[] {
  let best: number[] = [];
  for (const r of [b.header, b.header - 1, b.header + 1]) {
    if (r < 0) continue;
    const c = dayColumns(sheet.rows[r], b.cols.d1);
    if (c.length > best.length) best = c;
    if (best.length >= 28) break;
  }
  return best;
}
/**
 * What a mapping lacks to work: the names (in Greek, for the user) of the missing fields; empty when nothing is
 * missing.
 */
export function missingFields(kind: ListKind, cols: Record<string, number>): string[] {
  const out: string[] = [];
  const hasPerson = isCadreKind(kind)
    ? cols.last != null && (kind === 'cadreAbs' || cols.first != null)
    : cols.asm != null || cols.name != null || (cols.last != null && cols.first != null);
  if (!hasPerson) out.push(isCadreKind(kind) ? 'Επώνυμο και Όνομα' : 'Επώνυμο και Όνομα (ή ΑΣΜ)');
  if (kind === 'cadreAbs' && cols.from == null) out.push('Από (ημερομηνία)');
  for (const f of KIND[kind].fields) if (f.req && cols[f.k] == null) out.push(f.label);
  if (kind === 'caps' && !CAP_COLS.some((k) => cols[k] != null))
    out.push('μία τουλάχιστον στήλη υπηρεσίας (Θαλαμοφύλακας, Μαγειρεία…)');
  return out;
}
