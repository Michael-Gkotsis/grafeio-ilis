// Writing the statuses of the cadres into the sheet ΚΑΤΑΣΤΑΣΕΙΣ.
//
// Purpose: `planCadreAbsWrite`.
// Does NOT: write the details of the cadres (cadreWrite.ts) or read the sheet (cadreAbsRead.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/excel-in/cadreAbs,
//   core/excel-in/cadreCols, core/excel-in/cadreMatch, core/excel-in/cadreRows, core/excel-in/writeCells.
// Why: same rule as everywhere: a cell is written only when the app changed it, so edits made in the Excel survive;
//   a row is removed only when the app had seen it and it was deleted in the app.
// Covering tests: test/cadre-excel.test.ts, test/stelexi.test.ts.
import type { ISODate } from '../lib/dates';
import type { AppState } from '../model/state';
import type { CadreAbs } from '../model/cadreRecord';
import { orderedCadre } from '../cadre/cadre';
import type { SourceBinding } from '../model/bindings';
import type { CellValue, RawSheet } from './roster';
import { keyOf, absBaseOf, absRows, where, absNote, absLabel } from './cadreAbs';
import { type Meta, type CadrePlan, cmpKey, parse, cadreCell, sq, nameOf } from './cadreCols';
import { clearRow, addRows } from './cadreRows';
import { cellText, parseDate } from './cellText';
import { tableRows } from './tableRows';
import type { WVal } from './writeCells';

/**
 * Writes the statuses of the cadres into the ΚΑΤΑΣΤΑΣΕΙΣ sheet: one row per status (cadre, kind, from, to, note). Rows
 * of statuses the app has are added or updated, rows the app had seen and deleted go; `today` with the scope «active»
 * leaves the expired ones out.
 */
export function planCadreAbsWrite(
  sheet: RawSheet,
  b: SourceBinding,
  s: AppState,
  meta: Meta | undefined,
  today: ISODate,
): CadrePlan {
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
  const byId = new Map(list.map((c) => [c.id, c]));
  const hasO = false;
  const want = (s.cadreAbs || []).filter((a) => byId.has(a.cid) && (b.scope !== 'active' || a.to >= today));
  const wantBy = new Map(want.map((a) => [keyOf(a, s), a]));
  plan.base = absBaseOf(want, byId, s);
  const known = new Set(meta?.keys || []);
  const scan = tableRows(sheet, b.header, b.cols);
  const free = [...scan.free];
  const seen = new Set<string>();
  let n = 0;
  // writes the cell only if the value differs from what it already has
  const set = (r: number, k: string, val: WVal, cell: CellValue) => {
    const col = b.cols[k];
    if (col == null) return false;
    const t = cellText(cell);
    if (
      val != null && typeof val === 'object'
        ? parseDate(cell) === val.date
        : val == null
          ? t === ''
          : cmpKey(k, t, s) === cmpKey(k, String(val), s)
    )
      return false;
    plan.sets.push({ r, c: col, v: val });
    return true;
  };
  for (const e of absRows(sheet, b, s, meta)) {
    n++;
    if (e.key && wantBy.has(e.key) && !seen.has(e.key)) {
      seen.add(e.key);
      const a = wantBy.get(e.key)!;
      const c = byId.get(a.cid)!;
      const bv = parse(meta?.base?.[e.key]);
      let ch = false;
      // rank, Ο/Σ, name: follow the cadre (change of rank, renaming)
      for (const k of ['rank', 'spec', 'last', 'first']) {
        const val = cadreCell(k, c, s, hasO);
        if (val != null && set(e.r, k, val, e.v[k])) ch = true;
      }
      if (b.cols.hkcol != null && set(e.r, 'hkcol', where(a, s), e.v.hkcol)) ch = true;
      // the note: whoever changed it last (the app writes only what it changed)
      if (b.cols.note != null) {
        const app = a.note || '',
          cell = absNote(e.v.note);
        if (sq(app) !== sq(cell) && (bv ? sq(bv.n ?? '') !== sq(app) : cell === '')) {
          plan.sets.push({ r: e.r, c: b.cols.note, v: app || null });
          ch = true;
        }
      }
      if (ch) plan.changed++;
    } else if (e.key && wantBy.has(e.key)) plan.foreign++;
    else if (e.key && known.has(e.key)) {
      clearRow(plan, sheet, scan, b, e.r);
      free.push(e.r);
      plan.cleared++;
      n--;
    } else if (
      !e.cid &&
      e.code &&
      e.from &&
      e.to &&
      [...known].some(
        (k) =>
          k.endsWith('|' + e.code) &&
          k.includes('|' + e.from + '|' + e.to + '|') &&
          !wantBy.has(k) &&
          sq(parse(meta?.base?.[k])?.last || '') === sq(cellText(e.v.last)),
      )
    ) {
      clearRow(plan, sheet, scan, b, e.r);
      free.push(e.r);
      plan.cleared++;
      n--;
    } else plan.foreign++;
  }
  const order = new Map(orderedCadre(list).map((c, i) => [c.id, i]));
  const fresh = want
    .filter((a) => !seen.has(keyOf(a, s)))
    .sort(
      (x, y) =>
        x.from.localeCompare(y.from) || (order.get(x.cid) ?? 0) - (order.get(y.cid) ?? 0) || x.to.localeCompare(y.to),
    );
  const put = (r: number, a: CadreAbs) => {
    const c = byId.get(a.cid)!;
    for (const k of ['rank', 'spec', 'last', 'first']) {
      const col = b.cols[k],
        val = cadreCell(k, c, s, hasO);
      if (col != null && val != null) plan.sets.push({ r, c: col, v: val });
    }
    if (b.cols.kind != null) plan.sets.push({ r, c: b.cols.kind, v: absLabel(a, s) });
    if (b.cols.hkcol != null) plan.sets.push({ r, c: b.cols.hkcol, v: where(a, s) });
    if (b.cols.from != null) plan.sets.push({ r, c: b.cols.from, v: { date: a.from } });
    if (b.cols.to != null) plan.sets.push({ r, c: b.cols.to, v: { date: a.to } });
    if (b.cols.note != null && a.note) plan.sets.push({ r, c: b.cols.note, v: a.note });
  };
  const added = addRows(plan, sheet, b, scan, free, n, fresh, put, (a) => nameOf(byId.get(a.cid)!));
  plan.keys = want.filter((a) => seen.has(keyOf(a, s)) || added.includes(a)).map((a) => keyOf(a, s));
  return plan;
}
