// Which cadre is which: first ΑΜ, then surname and name.
//
// Purpose: `cadreMatcher` (a row of the sheet → the cadre) with `Ident` / `Found`, and `identsOf`.
// Does NOT: decide what to do with the match or write anything.
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/lib, core/model,
//   core/excel-in/cellText, core/excel-in/cadreCols.
// Why: the cadres have no id in the Excel; the same matching serves the read, the write and the memory of the last
//   sync, so a row is never put on the wrong cadre, and namesakes are left alone.
// Covering tests: test/cadre-excel.test.ts.
import { normGreek } from '../lib/text';
import type { Cadre } from '../model/cadreRecord';
import type { CellValue } from './roster';
import { sq } from './cadreCols';
import { cellText } from './cellText';

/** What identifies a cadre in the Excel: the id, the surname, the name and the ΑΜ. */
export interface Ident {
  id: string;
  last: string;
  first: string;
  am?: string;
}
/** The cadre a row is: `id` (null = not found) and `alts` (the ids of the namesakes that all fit). */
type Found = { id: string | null; alts?: string[] };
/** The key of a pair of names: capitals, only letters and digits, `a|b`. */
export const nk = (a: string, b: string) =>
  normGreek(a).replace(/[^Α-ΩA-Z0-9]/g, '') + '|' + normGreek(b).replace(/[^Α-ΩA-Z0-9]/g, '');
/**
 * Builds the matcher of a list of cadres: by ΑΜ first, then surname and name (either order), then by surname alone
 * when the row has no name. Several fits are namesakes (`alts`).
 */
export function cadreMatcher(list: Ident[]): (v: Record<string, CellValue>) => Found {
  const by = (f: (x: Ident) => string[]) => {
    const m = new Map<string, string[]>();
    for (const x of list) for (const k of f(x)) if (k) m.set(k, [...(m.get(k) || []), x.id]);
    return m;
  };
  const byAm = by((x) => [sq(x.am || '')]),
    byName = by((x) => [nk(x.last, x.first), nk(x.first, x.last)]),
    byLast = by((x) => [nk(x.last, '')]);
  return (v) => {
    const am = sq(cellText(v.am));
    const a = am ? byAm.get(am) : undefined;
    if (a?.length === 1) return { id: a[0] };
    const last = cellText(v.last),
      first = v.first != null ? cellText(v.first) : '';
    if (!last) return { id: null };
    const l = first ? byName.get(nk(last, first)) || [] : byLast.get(nk(last, '')) || [];
    if (l.length === 1) return { id: l[0] };
    return l.length > 1 ? { id: null, alts: l } : { id: null };
  };
}
/** The identities of a list of cadres. */
export const identsOf = (list: Cadre[]): Ident[] =>
  list.map((c) => ({ id: c.id, last: c.last, first: c.first, am: c.am }));
