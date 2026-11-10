// The extra tables of the ΦΡΟΥΡΑ for the own services of the user.
//
// Purpose: `frouraTablesInto` and its type `ExtraAt`.
// Does NOT: decide which services need a table (frouraTables in core) or place the numbers in the boxes
//   (frouraSeats.ts).
// Owner layer: main (architecture), `shared/forms`: the engine that FILLS the Excel forms of the Ίλη from the state of
//   the app. It is not `features/forms` (the IPC of the form templates: pick, bind, info) and not `core/forms` (pure
//   rules of layout, signatures and the ΗΔ). Uses the Excel engine `shared/excel/xlsx`; no Electron.
// Why: a service of the user that the template has no box for gets a table under the tables of the form; it moved
//   verbatim from src/main/exports.ts (Phase 4.9a).
// Covering test: test/own-phases.test.ts, test/service-edit.test.ts and test/exports.test.ts.
import { type Workbook, colName, colNum, type Sheet } from '../excel/xlsx';
import { tableRowSpan, type FrouraTable, type TableCols } from '../../../shared/froura';

/**
 * Where the extra tables go: `after` = the row after which they are inserted, `look` = cells whose style the new cells
 * copy, `left`/`right` = the columns of the two places side by side.
 */
export interface ExtraAt {
  after: number;
  look: TableCols | null;
  left: TableCols;
  right: TableCols | null;
}

/**
 * Tables of the own services of the user under the tables of the form, two side by side (in the columns of the first
 * two tables of the form), with one empty row before each row of tables. Returns how many rows were inserted.
 */
export function frouraTablesInto(wb: Workbook, ws: Sheet, at0: ExtraAt, tabs: FrouraTable[]): number {
  if (!tabs.length) return 0;
  const lk = at0.look;
  const st = lk
    ? { aa: ws.style(lk.aa), name: ws.style(lk.name), hours: ws.style(lk.hours), note: ws.style(lk.note) }
    : { aa: null, name: null, hours: null, note: null };
  const groups: { t: FrouraTable; at: TableCols }[][] = [];
  const step = at0.right ? 2 : 1;
  for (let i = 0; i < tabs.length; i += step)
    groups.push([
      { t: tabs[i], at: at0.left },
      ...(at0.right && tabs[i + 1] ? [{ t: tabs[i + 1], at: at0.right }] : []),
    ]);
  const height = (t: FrouraTable) => t.rows.reduce((a, x) => a + tableRowSpan(x), 0);
  const n = groups.reduce((a, g) => a + 2 + Math.max(...g.map((x) => height(x.t))), 0);
  const after = at0.after;
  ws.insertRows(after, n, after + 1, wb);
  const put = (ref: string, v: string | null, style: number | null, keep = false) => {
    ws.set(ref, v, keep);
    if (style != null) ws.setStyle(ref, style);
  };
  // Α/Α "1ο" as written, not "1Ο" (Michael, 4/11)
  // a number over rs rows (one per shift): Α/Α, name and ΠΑΡ/ΣΕΙΣ merged vertically, the hours one per row
  const line = (
    at: TableCols,
    t: FrouraTable,
    r: number,
    v: { aa: string; name: string; hours: string[]; note: string },
  ) => {
    const rs = Math.max(1, v.hours.length);
    const end = r + rs - 1;
    const last = colName(colNum(t.hours ? at.hours : at.note) - 1);
    for (let rr = r; rr <= end; rr++) {
      put(at.aa + rr, rr === r ? v.aa : null, st.aa, true);
      put(at.note + rr, rr === r ? v.note : null, st.note);
      for (let c = colNum(at.name); c <= colNum(last); c++)
        put(colName(c) + rr, rr === r && c === colNum(at.name) ? v.name : null, st.name);
      if (t.hours) put(at.hours + rr, v.hours[rr - r] || '', st.hours);
    }
    if (last !== at.name || end > r) ws.addMerge(at.name + r + ':' + last + end);
    if (end > r) {
      ws.addMerge(at.aa + r + ':' + at.aa + end);
      ws.addMerge(at.note + r + ':' + at.note + end);
    }
  };
  let r = after + 1;
  for (const g of groups) {
    r++;
    for (const { t, at } of g) {
      line(at, t, r, { aa: 'Α/Α', name: t.title, hours: ['ΩΡΕΣ'], note: 'ΠΑΡ/ΣΕΙΣ' });
      let rr = r + 1;
      for (const x of t.rows) {
        line(at, t, rr, {
          aa: x.n,
          name: x.name,
          hours: x.shifts && x.shifts.length > 1 ? x.shifts : [x.hours],
          note: '',
        });
        rr += tableRowSpan(x);
      }
    }
    r += 1 + Math.max(...g.map((x) => height(x.t)));
  }
  return n;
}
