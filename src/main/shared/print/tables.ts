// Finds the sortable tables of a sheet.
//
// Purpose: `tablesOf` (heading row, rows, sortable columns with their kind, Α/Α columns that stay) and the value
//   patterns `NUMERIC`, `DATE` and `SEQ`.
// Does NOT: sort the rows (sort.ts) or measure the sheet (sheetGeo.ts calls `tablesOf`).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: sorting in the print window ("First room, then alphabetical...") moves only the rows of each table; headings,
//   titles, totals and signatures stay. Tables with rows joined by a vertical merge (ΦΡΟΥΡΑ) or two tables side by side
//   with the same heading are not sorted. Verbatim from the old src/main/print.ts (Phase 4.8a).
// Covering test: test/print-sort.test.ts and test/report-nohead.test.ts.
import type { Book } from './book';
import { XErr, type Val } from './formula';
import { BUILTIN, isDateFmt } from './numfmt';
import type { ParsedSheet } from './sheet';
import { sortKey } from './sortKey';
import type { SortCol, SortKind, Table } from './types';
import { key } from './xml';

/** A number: optional sign, digits, optional decimal comma or dot. */
export const NUMERIC = /^[-+]?\d+(?:[.,]\d+)?$/,
  DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?!\d)/;

const SEQ = /^(\d+)\s*(?:ο|η|\.|\))?$/i;

/**
 * Finds the sortable tables of a sheet: for each heading row, the rows below it, the sortable columns with their kind
 * and the Α/Α columns that stay in place. Side-by-side tables (separated by columns without a border) are found one by
 * one.
 */
export function tablesOf(
  book: Book,
  sh: ParsedSheet,
  units: number[][],
  cols: number[],
  framed: Set<number>,
  noHead: Set<number> = new Set(),
): Table[] {
  const raw = (r: number, c: number): Val => {
    const k = sh.cells.get(key(r, c));
    if (!k) return null;
    const v = k.f ? book.value(sh.name, r, c) : k.v;
    return v instanceof XErr ? null : v;
  };
  const text = (r: number, c: number) => {
    const v = raw(r, c);
    return v == null ? '' : String(v).trim();
  };
  const dateFmt = (r: number, c: number) => {
    const k = sh.cells.get(key(r, c));
    const xf = k?.s != null ? book.styles.xfs[k.s] : null;
    if (!xf || !xf.fmt) return false;
    const code = book.styles.codes.get(xf.fmt) ?? BUILTIN[xf.fmt] ?? '';
    return isDateFmt(code);
  };
  const bord = (r: number, c: number) => {
    const k = sh.cells.get(key(r, c));
    const xf = k?.s != null ? book.styles.xfs[k.s] : null;
    return !!xf && !!(xf.border.l || xf.border.r || xf.border.t || xf.border.b);
  };
  // headless cell of row h (NOHEAD_MARK): the table exists, is not sorted, and its first row is no heading
  const blind = (h: number, c: number) => noHead.has(key(h, c));
  const out: Table[] = [];
  // one table with headings at unit i and columns cs. split: it sits next to another table, so its rows are those with
  // a border in its columns, not in the whole row. j: where the search continues (i + 1 if it is not a sorted table)
  const one = (i: number, cs: number[], split: boolean): { t?: Table; j: number } => {
    const h = units[i][0];
    const none = { j: i + 1 };
    const heads = cs.map((c) => ({ c, t: text(h, c) })).filter((x) => /\p{L}/u.test(x.t));
    if (cs.some((c) => blind(h, c))) {
      // a table without headings: only show where its rows end, so they are not taken for the headings of the next one
      let j = i + 1;
      while (j < units.length && units[j].every((r) => cs.some((c) => bord(r, c)))) j++;
      return { j };
    }
    if (heads.length < 2) return none;
    const keys = heads.map((x) => sortKey(x.t));
    // every heading once (not tables side by side, not a row with 0 | 0 | 0 like the ranks of the ΗΚΑΙ)
    const all = cs.map((c) => text(h, c)).filter(Boolean);
    if (
      new Set(keys).size !== keys.length ||
      new Set(all).size !== all.length ||
      keys.some((k) => !k || /^ΣΥΝΟΛ/.test(k))
    )
      return none;
    // table titles above the headings ("ΤΙΜΩΡΗΜΕΝΟΙ", "ΑΠΟΝΤΕΣ" in merged cells): not a heading. Headings that are
    // merged the same way in the row below (a table in a column grid, "Φτιάξ' το εδώ") are column headings
    const nr = units[i + 1]?.[0];
    const title = (x: { c: number }) => {
      const m = sh.merges.find((y) => y.r1 === h && y.c1 === x.c && y.c2 > y.c1);
      return !!m && !(nr != null && sh.merges.some((y) => y.r1 === nr && y.c1 === m.c1 && y.c2 === m.c2));
    };
    if (heads.filter(title).length * 2 >= heads.length) return none;
    const rows: number[] = [];
    let multi = false;
    let j = i + 1;
    for (; j < units.length; j++) {
      const v = units[j];
      if (!(split ? v.every((r) => cs.some((c) => bord(r, c))) : v.every((r) => framed.has(r)))) break;
      if (cs.some((c) => /^ΣΥΝΟΛ/.test(sortKey(text(v[0], c))))) break;
      if (v.length > 1) multi = true;
      rows.push(...v);
    }
    if (multi || rows.length < 2) return { j };
    const list: (SortCol & { c: number })[] = [];
    const fixed: number[] = [];
    heads.forEach((x, n) => {
      const k = keys[n];
      const full = rows.filter((r) => raw(r, x.c) != null && raw(r, x.c) !== '');
      const vals = full.map((r) => raw(r, x.c));
      // Α/Α: the heading, or numbers that go up one by one from top to bottom
      const seq = rows.map((r) => SEQ.exec(text(r, x.c))?.[1]);
      if (
        /^(ΑΑ|ΑΡ|ΑΡΙΘ|NO|ΝΟ)$/.test(k) ||
        (seq.length >= 2 && seq.every((v, m) => v != null && +v === +seq[0]! + m))
      ) {
        fixed.push(x.c);
        return;
      }
      if (/^\d+$/.test(k) || !vals.length) return; // day columns of the Έλεγχος (1...31) and empty ones (ΥΠΟΓΡΑΦΗ)
      const kind: SortKind = /^ΒΑΘΜ/.test(k)
        ? 'rank'
        : vals.length &&
            full.every(
              (r, m) =>
                (typeof vals[m] === 'string' && DATE.test(String(vals[m]).trim())) ||
                (typeof vals[m] === 'number' && dateFmt(r, x.c)),
            )
          ? 'date'
          : vals.length && vals.every((v) => typeof v === 'number' || NUMERIC.test(String(v).trim()))
            ? 'num'
            : 'text';
      list.push({ c: x.c, k, label: x.t.replace(/\s+/g, ' '), kind });
    });
    return { j, ...(list.length ? { t: { head: h, rows, cols: list, fixed, ...(split ? { span: cs } : {}) } } : {}) };
  };
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.length !== 1 || !framed.has(u[0])) continue;
    const h = u[0];
    // tables side by side: groups of columns with a border on the heading row, separated by columns without one (the
    // gap that "Φτιάξ' το εδώ" leaves), each with at least two headings: they are sorted separately
    const segs: number[][] = [];
    let cur: number[] = [];
    for (const c of cols) {
      if (bord(h, c) || blind(h, c)) cur.push(c);
      else if (cur.length) {
        segs.push(cur);
        cur = [];
      }
    }
    if (cur.length) segs.push(cur);
    const parts =
      segs.length > 1
        ? segs.filter((g) => g.some((c) => blind(h, c)) || g.filter((c) => /\p{L}/u.test(text(h, c))).length >= 2)
        : [];
    const split = parts.length > 1;
    let end = i + 1;
    for (const g of split ? parts : [cols]) {
      const x = one(i, g, split);
      if (x.t) out.push(x.t);
      end = Math.max(end, x.j);
    }
    i = end - 1;
  }
  return out;
}
