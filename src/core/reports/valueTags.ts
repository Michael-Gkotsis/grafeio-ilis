// The {LABELS} of the rows of the values tables.
//
// Purpose: `tagText` / `rowTag` / `tagId` (the label of a row and how labels are compared) and `tagsOf` (label to
//   table and row, with the duplicates).
// Does NOT: evaluate a row (valueEval.ts) or fill a cell (core/reports/blankFill.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model, core/lib,
//   core/reports/valueRows.
// Why: a «Κενός πίνακας» and the Excel templates name the rows of a values table by label, and the user types Latin
//   letters that look like Greek, so one function decides when two labels are the same.
// Covering tests: test/report-bands.test.ts, test/value-manual.test.ts, test/report-blank-lists.test.ts,
//   test/report-blank-tags.test.ts.
import type { ValueTable, VRow } from '../model/reportTypes';
import { normGreek, upper } from '../lib/text';
import { rowOn } from './valueRows';

/**
 * A {LABEL}: capitals, only letters, digits and spaces (up to 40, as much as `TAG_RE` accepts). The row's own label,
 * otherwise from the text of the row.
 */
export const tagText = (s: unknown): string =>
  upper(s)
    .replace(/[^\p{L}\p{N}_ ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
/** The label of a row: its own `tag`, otherwise made from its text. */
export const rowTag = (r: Pick<VRow, 'label' | 'tag'>): string =>
  tagText(r.tag != null && r.tag.trim() ? r.tag : r.label);
/** A label for comparing with what the user wrote in the Excel (Latin letters that look like Greek count as Greek). */
export const tagId = (s: unknown): string => normGreek(tagText(s));
/**
 * The labels of the rows that come out (computed or the user's own value): id → {table, row}. With a duplicate label
 * (or a label a form cell already has, `reserved`) the first wins; `dup` / `taken`: the others.
 */
export function tagsOf(
  vals: ValueTable[] | undefined,
  reserved: (id: string) => boolean = () => false,
): { map: Map<string, { t: ValueTable; i: number }>; dup: string[]; taken: string[] } {
  const map = new Map<string, { t: ValueTable; i: number }>();
  const dup: string[] = [],
    taken: string[] = [];
  for (const t of vals || [])
    t.rows.forEach((r, i) => {
      if (!rowOn(r)) return;
      const tg = rowTag(r);
      if (!tg) return;
      const id = tagId(tg);
      if (reserved(id)) {
        if (!taken.includes(tg)) taken.push(tg);
        return;
      }
      if (map.has(id)) {
        if (!dup.includes(tg)) dup.push(tg);
        return;
      }
      map.set(id, { t, i });
    });
  return { map, dup, taken };
}
