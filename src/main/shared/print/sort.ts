// Sorting the rows of the tables for the print.
//
// Purpose: `sortedGeo` (the sorted geometry of a sheet, cached) with the private `sortRows`, `sortVal`, `cmpVal`, the
//   `RANKS` list and the Greek collator `greekOrder`.
// Does NOT: find the tables (tables.ts).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: only the rows of every table are sorted; the Α/Α stays in order. @decision Michael 22/10: sorting in the print
//   window. `greekOrder` (an `Intl.Collator("el")`) and `sortCache` are module-level, one instance each, built when
//   this module loads (Phase 4.8a, verbatim).
// Covering test: test/print-sort.test.ts.
import type { Book } from './book';
import { XErr, type Val } from './formula';
import type { PrintSort } from './options';
import { DATE, NUMERIC } from './tables';
import { sortKey } from './sortKey';
import type { Geo, SortCol, SortKind } from './types';
import { key } from './xml';

/** Ranks from the highest to the lowest: "Ανώτεροι πρώτα". */
const RANKS = [
  'ΤΧΗΣ',
  'ΕΠΛΧΟΣ',
  'ΛΓΟΣ',
  'ΥΠΛΓΟΣ',
  'ΑΝΘΛΓΟΣ',
  'ΙΛΧΟΣ',
  'ΥΠΛΧΟΣ',
  'ΑΝΘΛΧΟΣ',
  'ΔΕΑ',
  'ΑΝΘΣΤΗΣ',
  'ΑΛΧΙΑΣ',
  'ΕΠΛΧΙΑΣ',
  'ΛΧΙΑΣ',
  'ΔΝΕΑΣ',
  'ΥΔΝΕΑΣ',
  'ΣΤΡ',
];

/** Greek collation (numbers by value, accents and case ignored) for comparing text cells; one instance. */
const greekOrder = new Intl.Collator('el', { numeric: true, sensitivity: 'base' });

/**
 * Value to compare: a number (and "12/10/2026" → 20261012, a rank → its place in the list) or text; empty = null
 * (always last).
 */
function sortVal(v: Val, kind: SortKind): number | string | null {
  if (v == null || v === '' || v instanceof XErr) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const s = v.trim();
  if (!s) return null;
  if (kind === 'rank') {
    const i = RANKS.indexOf(sortKey(s.split(/[\s(]/)[0]));
    if (i >= 0) return i;
  }
  if (NUMERIC.test(s)) return +s.replace(',', '.');
  const d = DATE.exec(s);
  if (d) {
    const y = +d[3] < 100 ? 2000 + +d[3] : +d[3];
    return y * 10000 + +d[2] * 100 + +d[1];
  }
  return s;
}

/** Compares two sort values: numbers before text, numbers by value, text by `greekOrder`. */
const cmpVal = (a: number | string, b: number | string) =>
  typeof a === 'number' ? (typeof b === 'number' ? a - b : -1) : typeof b === 'number' ? 1 : greekOrder.compare(a, b);

/** The sheet with the rows of the tables in the new order (columns a table does not have do not count). */
const sortCache = new WeakMap<Geo, Map<string, Geo>>();

/** The sorted geometry of `g` for a sort list, cached per geometry and list. */
export function sortedGeo(book: Book, g: Geo, sort: PrintSort[]): Geo {
  const sig = sort.map((x) => x.c + (x.d ? '-' : '+')).join('|');
  let m = sortCache.get(g);
  if (!m) {
    m = new Map();
    sortCache.set(g, m);
  }
  const hit = m.get(sig);
  if (hit) return hit;
  const out = sortRows(book, g, sort);
  m.set(sig, out);
  return out;
}

/** Sorts the rows of every table of `g` by the levels of `sort`; returns `g` itself when nothing moves. */
function sortRows(book: Book, g: Geo, sort: PrintSort[]): Geo {
  const rowsAll = g.rowsAll.slice();
  const fix = new Map<number, number>();
  let moved = false;
  for (const t of g.tables) {
    const lv = sort.map((s) => ({ s, col: t.cols.find((c) => c.k === s.c) })).filter((x) => x.col) as {
      s: PrintSort;
      col: SortCol & { c: number };
    }[];
    if (!lv.length) continue;
    const vals = new Map(
      t.rows.map((r) => [
        r,
        lv.map((x) => {
          const k = g.sh.cells.get(key(r, x.col.c));
          const v = k ? (k.f ? book.value(g.sh.name, r, x.col.c) : k.v) : null;
          return sortVal(v, x.col.kind);
        }),
      ]),
    );
    const sorted = t.rows.slice().sort((a, b) => {
      const A = vals.get(a)!,
        B = vals.get(b)!;
      for (let i = 0; i < lv.length; i++) {
        if (A[i] == null || B[i] == null) {
          if (A[i] == null && B[i] == null) continue;
          return A[i] == null ? 1 : -1;
        }
        const d = cmpVal(A[i]!, B[i]!);
        if (d) return lv[i].s.d ? -d : d;
      }
      return 0;
    });
    if (sorted.every((r, i) => r === t.rows[i])) continue;
    moved = true;
    // table next to another: rows stay (they would drag the neighbour); each cell shows the row that was there, not Α/Α
    if (t.span) {
      sorted.forEach((r, i) => {
        if (r !== t.rows[i]) for (const c of t.span!) if (!t.fixed.includes(c)) fix.set(key(t.rows[i], c), r);
      });
      continue;
    }
    const at = rowsAll.indexOf(t.rows[0]);
    rowsAll.splice(at, sorted.length, ...sorted);
    sorted.forEach((r, i) => {
      for (const c of t.fixed) if (r !== t.rows[i]) fix.set(key(r, c), t.rows[i]);
    });
  }
  return moved
    ? { ...g, rowsAll, units: rowsAll.every((r, i) => r === g.rowsAll[i]) ? g.units : g.regroup(rowsAll), fix }
    : g;
}
