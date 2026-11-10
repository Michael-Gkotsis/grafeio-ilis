// Writing the details of the cadres into the sheet ΣΤΕΛΕΧΗ.
//
// Purpose: `planCadresWrite`.
// Does NOT: write the statuses (cadreAbsWrite.ts) or the file (src/main/sources.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/excel-in/cadreCols,
//   core/excel-in/cadreMatch, core/excel-in/cadreRows, core/excel-in/writeCells.
// Why: the cadres' Excel is theirs: the app writes a cell only when the app changed it since the last read or write,
//   so what they changed in the Excel is never overwritten.
// Covering tests: test/cadre-excel.test.ts, test/stelexi.test.ts.
import type { AppState } from '../model/state';
import type { Cadre } from '../model/cadreRecord';
import { orderedCadre } from '../cadre/cadre';
import type { SourceBinding } from '../model/bindings';
import type { RawSheet } from './roster';
import { type Meta, type CadrePlan, vals, parse, CADRE_KEYS, cmpKey, cadreCell, nameOf } from './cadreCols';
import { cadreMatcher, identsOf, type Ident } from './cadreMatch';
import { clearRow, addRows } from './cadreRows';
import { cellText } from './cellText';
import { tableRows } from './tableRows';

/**
 * Writes the details of the cadres into the ΣΤΕΛΕΧΗ sheet: the cells the app changed since the last read or write
 * (`meta.base`), new rows for new cadres, and the rows of cadres the app deleted are emptied. Namesakes are not
 * touched (`ambiguous`).
 */
export function planCadresWrite(sheet: RawSheet, b: SourceBinding, s: AppState, meta?: Meta): CadrePlan {
  const plan: CadrePlan = {
    sets: [],
    insert: null,
    header: [],
    keys: [],
    added: 0,
    changed: 0,
    cleared: 0,
    foreign: 0,
    notFound: [],
    base: {},
  };
  const list = s.cadreList || [];
  const hasO = b.cols.origin != null;
  const byId = new Map(list.map((c) => [c.id, c]));
  plan.base = Object.fromEntries(list.map((c) => [c.id, JSON.stringify(vals(c, s, hasO))]));
  const scan = tableRows(sheet, b.header, b.cols);
  const match = cadreMatcher(identsOf(list));
  // what the Excel had seen and the app deleted: their row goes
  const gone = (meta?.keys || [])
    .filter((id) => !byId.has(id))
    .map((id): Ident | null => {
      const o = parse(meta?.base?.[id]);
      return o?.last ? { id, last: o.last, first: o.first || '', am: o.am } : null;
    })
    .filter((x): x is Ident => !!x);
  const matchGone = cadreMatcher(gone);
  const placed = new Set<string>();
  const free = [...scan.free];
  let n = 0;
  for (const { r, v } of scan.records) {
    if (!cellText(v.last)) continue;
    n++;
    const m = match(v);
    if (m.alts) {
      m.alts.forEach((id) => placed.add(id));
      (plan.ambiguous = plan.ambiguous || []).push(r);
      continue;
    }
    if (m.id == null) {
      const g = matchGone(v);
      if (g.id) {
        clearRow(plan, sheet, scan, b, r);
        free.push(r);
        plan.cleared++;
        n--;
      } else plan.foreign++;
      continue;
    }
    if (placed.has(m.id)) {
      plan.foreign++;
      continue;
    }
    placed.add(m.id);
    const c = byId.get(m.id)!;
    const bv = parse(meta?.base?.[c.id]);
    const now = vals(c, s, hasO);
    let ch = false;
    for (const k of CADRE_KEYS) {
      const col = b.cols[k];
      if (col == null) continue;
      const cell = cellText(v[k]);
      if (cmpKey(k, now[k], s) === cmpKey(k, cell, s)) continue;
      // the app changed it since the last read/write (without a previous one: only if the cell is empty)
      if (bv ? cmpKey(k, bv[k] ?? '', s) === cmpKey(k, now[k], s) : cell !== '') continue;
      plan.sets.push({ r, c: col, v: cadreCell(k, c, s, hasO) });
      ch = true;
    }
    if (ch) plan.changed++;
  }
  const fresh = orderedCadre(list).filter((c) => !placed.has(c.id));
  const put = (r: number, c: Cadre) => {
    for (const [k, col] of Object.entries(b.cols)) {
      if (!(CADRE_KEYS as readonly string[]).includes(k)) continue;
      const val = cadreCell(k, c, s, hasO);
      if (val != null) plan.sets.push({ r, c: col, v: val });
    }
  };
  const added = addRows(plan, sheet, b, scan, free, n, fresh, put, (c) => nameOf(c));
  plan.keys = list.filter((c) => placed.has(c.id) || added.includes(c)).map((c) => c.id);
  return plan;
}
