// The preview of a write: what each row will say after the update.
//
// Purpose: `describeSets` (the cells to set as lines for the user), `ambiguousLines` and `PlanLine`.
// Does NOT: plan the write or touch the file.
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/excel-in/columns,
//   core/excel-in/peopleMatch, core/excel-in/writeCells.
// Why: the user must see before the update which rows change and how; the lines are built from the same cell list
//   that is written, so the preview and the write cannot differ.
// Covering tests: test/sources.test.ts, test/excel-misc.test.ts.
import type { CellValue, RawSheet } from './roster';
import type { SourceBinding, ListKind } from '../model/bindings';
import { colLetter, cellText } from './cellText';
import { dutyDays } from './columns';
import { fieldsOf } from './fields';
import { rowName } from './peopleMatch';
import type { WVal } from './writeCells';

/** A line for the preview of a write: «Γραμμή 14 · ΠΑΠΑΔΟΠΟΥΛΟΣ Γ.: Σ.Ι Ι1 → Ι3» (row, who, what changes). */
export interface PlanLine {
  r: number;
  who: string;
  text: string;
}
/** The preview lines of the namesake rows that are not touched (X2). */
export const ambiguousLines = (sheet: RawSheet, b: SourceBinding, rows: number[] = []): PlanLine[] =>
  rows.map((r) => {
    const v: Record<string, CellValue> = {};
    for (const k in b.cols) v[k] = (sheet.rows[r] || [])[b.cols[k]];
    return { r, who: rowName(v), text: 'αμφίσημη γραμμή: ίδιο ονοματεπώνυμο με άλλον χωρίς ΑΣΜ, δεν αγγίζεται' };
  });
const fmtW = (v: WVal) =>
  v == null
    ? '(κενό)'
    : typeof v === 'object'
      ? v.date.slice(8) + '/' + v.date.slice(5, 7) + '/' + v.date.slice(0, 4)
      : String(v);
/**
 * Describes the cells to set as preview lines, one per row: a new record, a deleted row, or «column: old → new» for
 * each changed cell. `newRows`: rows that are new after the write.
 */
export function describeSets(
  kind: ListKind,
  sheet: RawSheet,
  b: SourceBinding,
  sets: { r: number; c: number; v: WVal }[],
  newRows: Set<number> = new Set(),
): PlanLine[] {
  const label = new Map<number, string>();
  const defs = fieldsOf(kind);
  if (kind === 'duties') dutyDays(sheet, b).forEach((c, i) => label.set(c, 'μέρα ' + (i + 1)));
  for (const [k, c] of Object.entries(b.cols))
    if (k !== 'd1') label.set(c, defs.find((f) => f.k === k)?.label.replace(/ \(.*\)$/, '') || k);
  const byRow = new Map<number, { c: number; v: WVal }[]>();
  for (const x of sets) {
    const l = byRow.get(x.r) || [];
    l.push(x);
    byRow.set(x.r, l);
  }
  const out: PlanLine[] = [];
  for (const [r, l] of [...byRow].sort((a, c) => a[0] - c[0])) {
    const row = sheet.rows[r] || [];
    const v: Record<string, CellValue> = {};
    for (const k in b.cols) v[k] = row[b.cols[k]];
    if (newRows.has(r) || !rowName(v).trim() || rowName(v) === '(χωρίς όνομα)') {
      const nv: Record<string, CellValue> = {};
      for (const x of l)
        for (const k in b.cols) if (b.cols[k] === x.c) nv[k] = typeof x.v === 'object' && x.v ? x.v.date : x.v;
      out.push({
        r,
        who: rowName(nv),
        text:
          'νέα εγγραφή' +
          (nv.from ? ' ' + fmtW({ date: String(nv.from) }) + (nv.to ? '–' + fmtW({ date: String(nv.to) }) : '') : ''),
      });
      continue;
    }
    if (l.every((x) => x.v == null)) {
      out.push({ r, who: rowName(v), text: 'σβήνεται (δεν υπάρχει πια στην εφαρμογή)' });
      continue;
    }
    if (l.every((x) => x.c === b.cols.aa)) continue; // only the Α/Α, because someone came in or left above
    out.push({
      r,
      who: rowName(v),
      text: l
        .filter((x) => x.c !== b.cols.aa)
        .map(
          (x) =>
            (label.get(x.c) || colLetter(x.c)) +
            ': ' +
            (row[x.c] instanceof Date ? fmtW({ date: cellText(row[x.c]) }) : cellText(row[x.c]) || '(κενό)') +
            ' → ' +
            fmtW(x.v),
        )
        .join(' · '),
    });
  }
  return out;
}
