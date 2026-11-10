// The statuses of the cadres (sheet ΚΑΤΑΣΤΑΣΕΙΣ): keys, labels and the reading of the rows.
//
// Purpose: `absRows` (the rows of the sheet → which status each is), `keyOf` / `absKey` / `absIdent` (identities),
//   `absBaseOf` (what the base keeps) and the small helpers.
// Does NOT: write the sheet (cadreAbsWrite.ts) or read it into a plan (cadreAbsRead.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/cadre, core/model, core/lib,
//   core/excel-in/cadreMatch, core/excel-in/cadreCols, core/excel-in/tableRows.
// Why: the reader, the writer and the memory of the last sync identify a status the same way, so a status renamed or
//   edited in the Excel is still found.
// Covering tests: test/cadre-excel.test.ts.
import type { ISODate } from '../lib/dates';
import { upper } from '../lib/text';
import type { AppState } from '../model/state';
import type { Cadre, CadreAbs } from '../model/cadreRecord';
import { cadreAbsOf } from '../people/kinds';
import { cadreStatusOf, colShort } from '../cadre/cadre';
import type { SourceBinding } from '../model/bindings';
import type { CellValue, RawSheet } from './roster';
import { type Meta, parse, type Cfg } from './cadreCols';
import { cadreMatcher, identsOf, nk } from './cadreMatch';
import { cellText, parseDate } from './cellText';
import { tableRows } from './tableRows';

/** The code of a status kind (the first of its names in the lists of the settings), as the Excel shows it. */
export const absCode = (kind: string, s: Cfg) => cadreAbsOf(kind, s.settings.lists)?.[0] ?? kind;
/** The key of a status: cadre, dates and code. */
const absKey = (cid: string, from: string, to: string, code: string) => [cid, from, to, code].join('|');
/** The key of a status of the app. */
export const keyOf = (a: CadreAbs, s: Cfg) => absKey(a.cid, a.from, a.to, absCode(a.kind, s));
/** The note of a status row as text. */
export const absNote = (v: CellValue) => cellText(v).trim();
/** Where a status counts in the ΗΚΑΙ: only in the list, or the group and the column. */
export const where = (a: CadreAbs, s: Cfg) => {
  const st = cadreStatusOf(a, s.settings.lists);
  return st.group === 'list'
    ? 'ΜΟΝΟ ΣΤΗ ΛΙΣΤΑ'
    : (st.group === 'kol' ? 'ΚΩΛΥΟΜΕΝΟΙ' : 'ΑΠΟΝΤΕΣ') + ' · ' + colShort(st.col);
};
/** The name of the kind of a status as the Excel shows it (capitals). */
export const absLabel = (a: CadreAbs, s: Cfg) => upper(cadreAbsOf(a.kind, s.settings.lists)?.[1] || a.kind);
/** The identity of a status row by name (code, dates, surname and name), for finding it after a rename. */
const absIdent = (code: string, from: string, to: string, last: string, first: string) =>
  [code, from, to, nk(last, first)].join('|');
/** The records the base keeps (so the row can be found even if the name of the cadre changed or he was deleted). */
export const absBaseOf = (want: CadreAbs[], byId: Map<string, Cadre>, s: Cfg): Record<string, string> =>
  Object.fromEntries(
    want.map((a) => [
      keyOf(a, s),
      JSON.stringify({ n: a.note || '', last: byId.get(a.cid)?.last || '', first: byId.get(a.cid)?.first || '' }),
    ]),
  );

/**
 * A row of the statuses sheet, read: the cells, the `key` of the status it is (null when it cannot be read: `why` says
 * the reason), the cadre, code and dates, who it is, and whether the name was changed (`renamed`).
 */
interface AbsRow {
  r: number;
  v: Record<string, CellValue>;
  key: string | null;
  cid: string | null;
  code: string | null;
  from: ISODate | null;
  to: ISODate | null;
  why: string;
  who: string;
  renamed: boolean;
}
/**
 * Reads the rows of the statuses sheet and tells which status each one is, using the memory of the last sync (`meta`)
 * to find a row whose cadre was renamed.
 */
export function absRows(sheet: RawSheet, b: SourceBinding, s: AppState, meta?: Meta): AbsRow[] {
  const list = s.cadreList || [];
  const match = cadreMatcher(identsOf(list));
  // the rows we know from the previous sync, with the name they had
  const ident = new Map<string, string>();
  for (const key of meta?.keys || []) {
    const o = parse(meta?.base?.[key]);
    const [cid, from, to, ...code] = key.split('|');
    if (o?.last) ident.set(absIdent(code.join('|'), from, to, o.last, o.first || ''), cid);
  }
  const out: AbsRow[] = [];
  for (const { r, v } of tableRows(sheet, b.header, b.cols).records) {
    if (!cellText(v.last)) continue;
    const who = [cellText(v.rank), cellText(v.last), cellText(v.first)].filter(Boolean).join(' ');
    const kindText = cellText(v.kind);
    const code = kindText ? (cadreAbsOf(kindText, s.settings.lists)?.[0] ?? null) : null;
    const from = parseDate(v.from),
      to = parseDate(v.to);
    const m = match(v);
    let cid = m.id;
    let renamed = false;
    if (!cid && !m.alts && code && from && to) {
      const x = ident.get(absIdent(code, from, to, cellText(v.last), cellText(v.first)));
      if (x && list.some((c) => c.id === x)) {
        cid = x;
        renamed = true;
      }
    }
    const why = m.alts
      ? 'ίδιο ονοματεπώνυμο με άλλο στέλεχος'
      : !cid
        ? 'δεν ταιριάζει με στέλεχος'
        : !kindText
          ? 'λείπει η κατάσταση'
          : !code
            ? 'άγνωστη κατάσταση «' + kindText + '»'
            : !from
              ? 'λείπει ή δεν διαβάζεται το «από»'
              : !to
                ? 'λείπει ή δεν διαβάζεται το «έως»'
                : to < from
                  ? 'το «έως» είναι πριν από το «από»'
                  : '';
    out.push({ r, v, key: why ? null : absKey(cid!, from!, to!, code!), cid, code, from, to, why, who, renamed });
  }
  return out;
}
