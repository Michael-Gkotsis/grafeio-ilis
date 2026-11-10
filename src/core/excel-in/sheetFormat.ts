// The format of the sheets the app writes: header columns, titles, dropdowns, default layout and the fingerprint of
//   a table.
//
// Purpose: `timeCols` (extra columns appended at the end of a table), `titleSpans`, `listColumns` (dropdown lists),
//   `defaultBinding` (layout of a new table), `tableHash` (did the table change in the Excel?) and `bindingText`.
// Does NOT: plan the cells of a kind (writePlan.ts and the other writers do) or apply anything to a file
//   (src/main/xlsx.ts does).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/model, core/people,
//   core/excel-in/writePlan, core/excel-in/cadreCols.
// Why: the app adds only what the table needs and never moves a column of the sergeant: new columns go after the
//   last one, titles are merged over the width of the table, and the dropdowns follow the Lists of the Settings. The
//   hash tells «changed in the Excel» from «recalculated by Excel».
// Covering tests: test/sources.test.ts, test/new-files.test.ts, test/leave-hours.test.ts,
//   test/personal-excel.test.ts, test/xl-look.test.ts.
import { addDays, type ISODate } from '../lib/dates';
import { upper } from '../lib/text';
import type { AppState } from '../model/state';
import type { RawSheet } from './roster';
import { listOf, optionsOf } from '../people/ranks';
import type { ListId, UserLists } from '../model/lists';
import { parseSi, siCombos, siLabel } from '../people/si';
import { PKEYS, type PKey } from '../people/personal';
import type { SourceBinding, ListKind } from '../model/bindings';
import { CADRE_OPT } from './cadreCols';
import { cellText } from './cellText';
import { dutyDays } from './columns';
import { KIND, isStatusKind, TIME_KINDS, type StatusKind, TIME_FIELDS } from './fields';
import { tableRows } from './tableRows';
import { wanted } from './writePlan';

/**
 * Columns for the hours (leave, hospital, ΣΤΕΠ) in a table that has none: they come in only when some record has a
 * time, at the end of the table (in the first columns that are empty from the headers down), so that none of the
 * user's own columns moves.
 * `head`: the headers to write (in a new table `planWrite` writes them with the others).
 */
export function timeCols(
  kind: ListKind,
  sheet: RawSheet | null,
  b: SourceBinding,
  s: AppState,
  today: ISODate,
): { b: SourceBinding; head: { r: number; c: number; v: string }[] } {
  const timed = isStatusKind(kind) && TIME_KINDS.includes(kind);
  const want = timed ? wanted(kind as StatusKind, s, b, today) : [];
  // hours: when some record has a time; direction (leave only): when some leave has a direction
  // Δυναμολόγιο: IBAN, ΑΜΚΑ, ΑΦΜ when someone in strength has a value and the table does not have the column
  const need = [
    ...(want.some((x) => x.fromTime || (x.toTime && !x.open)) ? TIME_FIELDS.filter((k) => b.cols[k] == null) : []),
    ...(kind === 'leave' && b.cols.dest == null && want.some((x) => x.dest) ? ['dest'] : []),
    ...(kind === 'people' ? PKEYS.filter((k) => b.cols[k] == null && s.people.some((p) => p.active && p[k])) : []),
    // cadres: weapon, service limit, IBAN… only when some cadre has a value
    ...(kind === 'cadres' ? CADRE_OPT.filter((k) => b.cols[k] == null && (s.cadreList || []).some((c) => c[k])) : []),
  ];
  if (!(timed || kind === 'people' || kind === 'cadres') || !need.length) return { b, head: [] };
  const rows = sheet?.rows || [];
  const fresh = !(rows[b.header] || []).some((v) => cellText(v));
  const scan = sheet && !fresh ? tableRows(sheet, b.header, b.cols) : null;
  const last = scan ? Math.max(scan.end, b.header) : b.header;
  const empty = (c: number) => {
    for (let r = b.header; r <= last; r++) if (cellText((rows[r] || [])[c]) !== '') return false;
    return true;
  };
  const cols = { ...b.cols };
  const head: { r: number; c: number; v: string }[] = [];
  let c = Math.max(scan ? scan.width[1] : 0, ...Object.values(b.cols)) + 1;
  for (const k of need) {
    while (Object.values(cols).includes(c) || !empty(c)) c++;
    cols[k] = c;
    if (!fresh) head.push({ r: b.header, c, v: KIND[kind].fields.find((f) => f.k === k)!.head });
    c++;
  }
  return { b: { ...b, cols }, head };
}
/**
 * The titles above the table (text only in its first column, up to 3 rows above the headers): centred, in merged cells
 * across the width of the table. Which ones are already merged is known by whoever has the file (xlsx.ts).
 */
export function titleSpans(kind: ListKind, sheet: RawSheet, b: SourceBinding): { r: number; c1: number; c2: number }[] {
  if (kind === 'duties') return []; // monthly grid: its title is as the sergeant set it
  const head = sheet.rows[b.header] || [];
  const hc = head.map((v, i) => (cellText(v) ? i : -1)).filter((i) => i >= 0);
  if (hc.length < 2) return [];
  const c1 = Math.min(...hc, ...Object.values(b.cols)),
    c2 = Math.max(...hc, ...Object.values(b.cols));
  const out: { r: number; c1: number; c2: number }[] = [];
  for (let r = b.header - 1; r >= Math.max(0, b.header - 3); r--) {
    const row = sheet.rows[r] || [];
    const filled = row.map((v, i) => (cellText(v) ? i : -1)).filter((i) => i >= 0);
    if (!filled.length) continue;
    if (filled.length !== 1 || filled[0] !== c1 || typeof row[c1] !== 'string') break;
    out.push({ r, c1, c2 });
  }
  return out;
}
/**
 * Choice lists (dropdowns) for rank and Ο/Σ in the rows of the table and in the empty ones below it (up to the next
 * table or 200 rows). The base list and any other values the column already has; Excel accepts another value too. With
 * the Lists of the Settings (`lists`): what the user added goes into the dropdown, what the user hid does not.
 * And for Σ.Ι.: the combinations of the Σ.Ι. table (Ι1 … Ι3 ΜΕ ΟΠΛΟ, Ι3 ΧΩΡΙΣ ΟΠΛΟ, Ι4 …). Entries: [field key, list,
 * name shown to the user].
 */
export const LIST_FIELDS: [string, ListId | 'si', string][] = [
  ['rank', 'soldierRanks', 'Βαθμός'],
  ['origin', 'origins', 'Προέλευση'],
  ['spec', 'specs', 'Ο/Σ'],
  ['si', 'si', 'Σ.Ι.'],
];
const fieldList = (lists: UserLists | undefined, id: ListId | 'si' | 'yn') =>
  id === 'si'
    ? siCombos(lists?.si)
    : id === 'yn'
      ? ['ΝΑΙ', 'ΟΧΙ']
      : id === 'cadreAbs'
        ? listOf(lists, id).map(upper)
        : listOf(lists, id);
// the cadres have their own ranks and statuses
const CADRE_LISTS: Partial<Record<ListKind, [string, ListId | 'si' | 'yn', string][]>> = {
  cadres: [
    ['rank', 'cadreRanks', 'Βαθμός'],
    ['origin', 'origins', 'Προέλευση'],
    ['spec', 'specs', 'Ο/Σ'],
    ['active', 'yn', 'Σε δύναμη'],
  ],
  cadreAbs: [
    ['rank', 'cadreRanks', 'Βαθμός'],
    ['spec', 'specs', 'Ο/Σ'],
    ['kind', 'cadreAbs', 'Κατάσταση'],
  ],
};
/**
 * The columns that get a dropdown: for each listed field that is mapped, the column `c`, the rows `r1` to `r2`, the
 * `items` (the base list plus the values already in the column, at most 250 characters), what it is (`what`) and the
 * `base` list.
 */
export function listColumns(
  kind: ListKind,
  sheet: RawSheet,
  b: SourceBinding,
  lists?: UserLists,
): { c: number; r1: number; r2: number; items: string[]; what: string; base: string[] }[] {
  if (kind === 'duties') return [];
  const scan = tableRows(sheet, b.header, b.cols);
  let r = scan.end + 1;
  while (r < sheet.rows.length && !(sheet.rows[r] || []).some((v) => cellText(v))) r++;
  const r1 = b.header + 1,
    r2 = r < sheet.rows.length ? r - 1 : Math.max(scan.end, b.header) + 200;
  if (r2 < r1) return [];
  const out: { c: number; r1: number; r2: number; items: string[]; what: string; base: string[] }[] = [];
  for (const [k, id, what] of CADRE_LISTS[kind] || LIST_FIELDS) {
    const c = b.cols[k];
    if (c == null) continue;
    // Σ.Ι.: what the list already has under another name (e.g. the old «Ι3 ΑΟΠΛΟ» = «Ι3 ΧΩΡΙΣ ΟΠΛΟ») is not added twice
    const known = (v: string) => {
      if (id !== 'si') return false;
      const x = parseSi(v, lists?.si);
      return !!x?.ok && fieldList(lists, id).includes(siLabel(x.base, x.sub));
    };
    const seen = scan.records.map((x) => cellText(x.v[k])).filter((v) => !/[,"]/.test(v) && !known(v));
    // Excel accepts up to 255 characters in the list: the rare values from the end go
    const base = fieldList(lists, id);
    const items = optionsOf(base, seen);
    while (items.join(',').length > 250) items.pop();
    out.push({ c, r1, r2, items, what, base });
  }
  return out;
}

// Default layout of a new cadre table (like the sheets of the roster)
const CADRE_DEFAULT: Partial<Record<ListKind, string[]>> = {
  cadres: ['aa', 'rank', 'origin', 'spec', 'last', 'first', 'am', 'phone', 'role', 'hk', 'active'],
  cadreAbs: ['aa', 'rank', 'spec', 'last', 'first', 'kind', 'hkcol', 'from', 'to', 'note'],
};
/**
 * The binding of a new table of `kind` in `file`: the default columns in the default order (like the sheets of the
 * roster), header on row 1, scope «active».
 */
export function defaultBinding(kind: ListKind, file: string, sheet = KIND[kind].title.slice(0, 31)): SourceBinding {
  const own = CADRE_DEFAULT[kind];
  if (own)
    return {
      file,
      sheet,
      header: 1,
      cols: Object.fromEntries(own.map((k, i) => [k, i])),
      write: true,
      scope: 'active',
    };
  const keys = [
    'aa',
    'rank',
    'spec',
    'last',
    'first',
    'father',
    'asm',
    'phone',
    'room',
    ...KIND[kind].fields
      .filter((f) => f.k !== 'days' && f.k !== 'dest' && !PKEYS.includes(f.k as PKey))
      .map((f) => f.k),
  ]; // the direction and IBAN/ΑΜΚΑ/ΑΦΜ come later, only when there are values (timeCols)
  return {
    file,
    sheet,
    header: 1,
    cols: Object.fromEntries(keys.map((k, i) => [k, i])),
    write: isStatusKind(kind),
    scope: 'active',
  };
}
/**
 * A fingerprint of the table of a kind: only the columns the app reads (and the days of the monthly grid), from the
 * headers to the end of the table. A change on another sheet or in another table of the same file does not change it
 * (Michael, 11/10).
 * The position of each row counts from the headers, so the same table a little lower (rows added above) does not look
 * «changed». Cells with a formula do not count: Excel recalculates them on opening (e.g. the room totals under the
 * ΣΥΝΟΛΙΚΟ) and they would show «Changed in the Excel» when nothing changed.
 */
export function tableHash(sheet: RawSheet | undefined, b: SourceBinding): string {
  if (!sheet) return '-';
  const cols = [...new Set([...Object.values(b.cols), ...(b.cols.d1 != null ? dutyDays(sheet, b) : [])])].sort(
    (a, c) => a - c,
  );
  const line = (r: number) =>
    cols.map((c) => (sheet.fx?.has(r + ':' + c) ? '' : cellText((sheet.rows[r] || [])[c]))).join('\t');
  const scan = tableRows(sheet, b.header, b.cols);
  // the half-written rows too: when they are completed (or deleted) the table changed
  const rows = [...scan.records.map((x) => x.r), ...scan.partial].sort((a, c) => a - c);
  const text = [line(b.header), ...rows.map((r) => r - b.header + ':' + line(r))].join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return HASH_V + (h >>> 0).toString(16) + ':' + text.length;
}
/** The version prefix of `tableHash`: change it when the way the hash is computed changes. */
export const HASH_V = 'v2:';
/** How a binding is shown to the user: «file › sheet · row N» (in Greek). */
export const bindingText = (b: SourceBinding) =>
  b.file.split(/[\\/]/).pop() + ' › ' + b.sheet + ' · γραμμή ' + (b.header + 1);
/** `addDays`, kept under the name the callers of this module use. */
export const addDaysSafe = addDays;
