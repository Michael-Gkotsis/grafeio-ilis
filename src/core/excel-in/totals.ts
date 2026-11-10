// The totals under the ΣΥΝΟΛΙΚΟ table of the roster (@decision Michael 3/11: «ΣΤΕΠ :», «ΑΝΑΡΡΩΤΙΚΕΣ ΑΔΕΙΕΣ», « ΑΔΕΙΕΣ»,
// «ΕΙΣΑΓΩΓΕΣ ΝΟΣΟΚΟΜΕΙΟ»).
//
// Purpose: `planTotals` (which cells under the table get a new number) and `totalsTouched` (did a change move a number
//   that is counted there).
// Does NOT: write the Excel file (src/main/sources.ts does with the plan) or count the numbers (`sheetTotals` in
//   core/outs/strengthView.ts does).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/outs/strengthView, core/model.
// Why: the value is the first non-empty cell to the right of the label on the same row (up to 3 columns). It is written
//   only where there is a plain number (never over a formula); a label that is not found writes nothing.
// Covering tests: test/room-extras-totals.test.ts.
import { norm } from '../lib/text';
import type { RawSheet } from './roster';
import type { SheetTotals } from '../outs/strengthView';
import type { Status, TypeKey } from '../model/status';

const LABELS: [keyof SheetTotals, RegExp][] = [
  ['step', /^ΣΤΕΠ$/],
  ['sick', /^ΑΝΑΡ+\S*ΑΔΕΙΕΣ$/],
  ['leave', /^ΑΔΕΙΕΣ$/],
  ['hosp', /^(ΕΙΣΑΓΩΓΕΣ)?ΝΟΣΟΚΟΜΕΙΟ$/],
];
const key = (v: unknown) => norm(v).replace(/[^A-ZΑ-Ω]/g, '');
/**
 * Plans the cells to rewrite: each `{ r, c, v }` is a row, a column (both from 0) and the new number.
 * `from`: the first row that is examined (below the people of the table); `isFx`: the cell has a formula.
 * @see test/room-extras-totals.test.ts
 */
export function planTotals(
  sheet: RawSheet,
  t: SheetTotals,
  from: number,
  isFx: (r: number, c: number) => boolean,
): { r: number; c: number; v: number }[] {
  const out: { r: number; c: number; v: number }[] = [];
  const done = new Set<keyof SheetTotals>();
  for (let r = Math.max(0, from); r < sheet.rows.length; r++) {
    const row = sheet.rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (typeof row[c] !== 'string') continue;
      const hit = LABELS.find(([k, re]) => !done.has(k) && re.test(key(row[c])));
      if (!hit) continue;
      done.add(hit[0]);
      let vc = -1;
      for (let x = c + 1; x <= c + 3 && vc < 0; x++) if (row[x] != null && row[x] !== '') vc = x;
      if (vc < 0 || isFx(r, vc)) continue;
      const cur = row[vc];
      if (!(typeof cur === 'number' || (typeof cur === 'string' && /^\s*\d+\s*$/.test(cur)))) continue;
      if (Number(cur) !== t[hit[0]]) out.push({ r, c: vc, v: t[hit[0]] });
    }
  }
  return out;
}

// @decision Michael 4/11: when something counted in the totals changes (ΣΤΕΠ, sick, leave, hospital) the roster is
// rewritten too, not only the sheet of the situation; otherwise the totals under the ΣΥΝΟΛΙΚΟ stayed old until the
// next change to a person. Not for outs/ΔΝ/penalties: they change often and do not count here.
const TOTAL_TYPES = new Set<TypeKey>(['STEP', 'SICK', 'LEAVE', 'HON', 'NOS']);
/** True when a status of a counted type was added or removed between `prev` and `next` (same array = false). */
export function totalsTouched(prev: Status[], next: Status[]): boolean {
  if (prev === next) return false;
  const a = new Set(prev),
    b = new Set(next);
  return (
    next.some((x) => !a.has(x) && TOTAL_TYPES.has(x.type)) || prev.some((x) => !b.has(x) && TOTAL_TYPES.has(x.type))
  );
}
