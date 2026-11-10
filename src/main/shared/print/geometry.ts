// Row heights of a sheet at a print scale (the hot path of the pagination).
//
// Purpose: `fixK`, `rowAt` and `sumsOf`: how tall rows are at scale `s`, with the fixed parts kept at their own size on
//   paper.
// Does NOT: plan pages (plan.ts and planFit.ts) or build the geometry (sheetGeo.ts).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: the scale search of planFit calls these dozens of times per sheet; the `sums` cache (a WeakMap per row group) is
//   one instance (Phase 4.8a, verbatim).
// Covering test: test/print-fixed-parts.test.ts and test/perf.test.ts.
import type { Geo } from './types';

/**
 * How much a fixed part grows inside a sheet with scale `s`, so that it comes out at its own size (limited, for the
 * extremes).
 */
export const fixK = (s: number) => Math.min(6, Math.max(0.4, 1 / s));
/** Height of row `r` at scale `s`: fixed rows are stretched by `fixK(s)` so they keep their own size on paper. */
export const rowAt = (g: Geo, r: number, s: number) => g.rowH(r) * (g.fixR?.has(r) ? fixK(s) : 1);

/**
 * The height of a group of rows, [normal, fixed], computed once for every group (the pagination searches the scale with
 * many tries).
 */
const sums = new WeakMap<number[], [number, number]>();
export function sumsOf(g: Geo, rows: number[]): [number, number] {
  let x = sums.get(rows);
  if (!x) {
    let a = 0,
      f = 0;
    for (const r of rows) {
      const h = g.rowH(r);
      if (g.fixR?.has(r)) f += h;
      else a += h;
    }
    x = [a, f];
    sums.set(rows, x);
  }
  return x;
}
