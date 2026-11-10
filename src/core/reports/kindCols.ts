// The columns of a table when its kind changes in «Φτιάξ' το εδώ».
//
// Purpose: `colsForKind` (keep the columns that exist in the new kind, add its basic ones), `switchCols` and
//   `retypeTable` (the same for table 2, 3…).
// Does NOT: list the fields of a kind (fields.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model, core/reports/fields,
//   core/reports/kinds.
// Why: changing the kind must not leave a column the new kind cannot fill, and a combination must keep only the
//   fields that exist, so the rule is applied in one place for the first table and for the others.
// Covering tests: test/report-blank-more.test.ts.
import type { RepKind, BuildCol, BuildTable } from '../model/reportTypes';
import { fieldOf } from './fields';
import { BLANK_ROWS } from './kinds';

// columns that come in by themselves when a kind is chosen in «Φτιάξ' το εδώ»
const KIND_COLS: Partial<Record<RepKind, string[]>> = {
  status: ['stype', 'from', 'to'],
  duty: ['seat', 'hours'],
  weapon: ['weapon', 'wtype', 'rack', 'inout'],
  wmove: ['weapon', 'mreason', 'mout', 'min'],
};
/**
 * «Φτιάξ' το εδώ», the kind changed: the columns that do not exist in the new kind go (e.g. ΑΣΜ for the cadres) and
 * its basic ones come in («Καταστάσεις»: kind, from, to; «Υπηρεσίες»: the post first, after Α/Α); a combination keeps
 * the fields that exist.
 */
export function colsForKind(cs: BuildCol[], kind: RepKind): BuildCol[] {
  if (kind === 'blank') {
    const aa = cs.find((c) => c.f === 'aa');
    const col = cs.filter((c) => c.f === 'col');
    return [
      ...(aa ? [aa] : [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }]),
      ...(col.length ? col : [1, 2].map((n) => ({ f: 'col', h: 'ΣΤΗΛΗ ' + n, w: 'auto' as const }))),
    ];
  }
  const cols = cs
    .filter(
      (c) => fieldOf(kind, c.f) && !Object.values(KIND_COLS).some((l) => l!.includes(c.f) && !fieldOf('people', c.f)),
    )
    .map((c) =>
      c.f === 'combo' && c.o?.parts ? { ...c, o: { ...c.o, parts: c.o.parts.filter((k) => fieldOf(kind, k)) } } : c,
    );
  for (const f of KIND_COLS[kind] || [])
    if (!cols.some((c) => c.f === f))
      cols.push({
        f,
        h: fieldOf(kind, f)!.head,
        w: ['stype', 'seat', 'inout', 'mreason'].includes(f) ? 'auto' : 'narrow',
      });
  if (kind === 'duty') {
    const i = cols.findIndex((c) => c.f === 'seat');
    const [x] = cols.splice(i, 1);
    cols.splice(cols[0]?.f === 'aa' ? 1 : 0, 0, x);
  }
  return cols;
}
/**
 * Changes the kind from `from` to `to` with its columns: coming back from «Κενός πίνακας», a table cannot exist
 * without columns, so rank and full name come in.
 */
export function switchCols(cs: BuildCol[], from: RepKind, to: RepKind): BuildCol[] {
  const cols = colsForKind(cs, to);
  return from === 'blank' && !cols.some((c) => c.f !== 'aa')
    ? [
        ...cols,
        ...['rank', 'name']
          .filter((f) => fieldOf(to, f))
          .map((f) => ({ f, h: fieldOf(to, f)!.head, w: 'auto' as const })),
      ]
    : cols;
}
/**
 * Table 2, 3… («Φτιάξ' το εδώ») changes kind: columns as in the 1st table (`switchCols`); in «Κενός πίνακας» 10 rows
 * and an empty grid, coming back from it no grid.
 */
export function retypeTable(t: BuildTable, kind: RepKind): BuildTable {
  const { grid: _g, nrows: _n, who: _w, src: _s, ...rest } = t;
  return { ...rest, kind, cols: switchCols(t.cols, t.kind, kind), ...(kind === 'blank' ? { nrows: BLANK_ROWS } : {}) };
}
