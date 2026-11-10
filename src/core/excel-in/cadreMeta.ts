// The memory of the last sync of a cadre sheet.
//
// Purpose: `cadreMeta` (which cadres or statuses are in the sheet and the values of the app at that moment).
// Does NOT: read or write the sheet.
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/excel-in/cadreAbs,
//   core/excel-in/cadreCols, core/excel-in/cadreMatch, core/excel-in/tableRows.
// Why: the next write needs to know what the app has seen, to tell «the Excel changed it» from «the app changed it».
// Covering tests: test/cadre-excel.test.ts.
import type { ISODate } from '../lib/dates';
import type { AppState } from '../model/state';
import type { SourceBinding } from '../model/bindings';
import type { RawSheet } from './roster';
import { absRows, keyOf, absBaseOf } from './cadreAbs';
import { vals } from './cadreCols';
import { cadreMatcher, identsOf } from './cadreMatch';
import { tableRows } from './tableRows';

/**
 * What the Excel knows after a read (for the next write). `keys`: which cadres or statuses are now in the sheet;
 * `base`: the values of the app at that moment.
 */
export function cadreMeta(
  kind: 'cadres' | 'cadreAbs',
  sheet: RawSheet,
  b: SourceBinding,
  s: AppState,
  today: ISODate,
): { keys: string[]; base: Record<string, string> } {
  const list = s.cadreList || [];
  const byId = new Map(list.map((c) => [c.id, c]));
  if (kind === 'cadres') {
    const hasO = b.cols.origin != null;
    const match = cadreMatcher(identsOf(list));
    const on = new Set<string>();
    for (const { v } of tableRows(sheet, b.header, b.cols).records) {
      const m = match(v);
      if (m.id) on.add(m.id);
      else m.alts?.forEach((id) => on.add(id));
    }
    return {
      keys: list.filter((c) => on.has(c.id)).map((c) => c.id),
      base: Object.fromEntries(list.map((c) => [c.id, JSON.stringify(vals(c, s, hasO))])),
    };
  }
  const want = (s.cadreAbs || []).filter((a) => byId.has(a.cid));
  const rows = new Set(
    absRows(sheet, b, s)
      .map((e) => e.key)
      .filter(Boolean),
  );
  return { keys: want.map((a) => keyOf(a, s)).filter((k) => rows.has(k)), base: absBaseOf(want, byId, s) };
}
