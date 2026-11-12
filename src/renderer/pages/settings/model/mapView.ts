// Pure rules of the «πού βρίσκεται στο Excel» mapping dialog: moving a column, the rows shown and the sample lines.
// Purpose: `setColIn`, `nextField`, `mapRange`, `colLabel` and `mapSample` for `useMap` and their test.
// Does NOT: render anything, touch React or call `window.api`.
// Owner layer: renderer/pages/settings. Why: moved verbatim from screens/sources.ts (Phase 6) so the rules are
//   testable without a render.
// Covering test: test/settings-sources-view.test.ts.
import { readDuty } from '../../../../shared/codes';
import { dm, type ISODate } from '../../../../shared/dates';
import { TYPES, type AppState } from '../../../../shared/domain';
import {
  CAP_COLS,
  DEFAULT_TYPE,
  capAcc,
  capExtraCols,
  capExtras,
  capNo,
  cellText,
  colLetter,
  dutyDays,
  type FieldDef,
  isStatusKind,
  parseStatuses,
  rowName,
  sheetMonth,
  tableRows,
  type ListKind,
  type SourceBinding,
} from '../../../../shared/sources';
import type { RawSheet } from '../../../../shared/roster';

/**
 * The columns after the sergeant gave field `k` the column `c`.
 * @param cols - field key → column index (0-based)
 * @param k - the field that is being set
 * @param c - the column, or null to clear the field
 * @returns a new object; another field that had column `c` loses it (one column, one field)
 */
export function setColIn(cols: Record<string, number>, k: string, c: number | null): Record<string, number> {
  const next = { ...cols };
  for (const kk in next) if (next[kk] === c && kk !== k) delete next[kk];
  if (c == null) delete next[k];
  else next[k] = c;
  return next;
}

/**
 * The field to select after a cell click: the first one still empty that is required (or the person's name).
 * @param fields - the fields of the kind, in order
 * @param active - the field that was just set
 * @param cols - the columns before this click
 * @returns the key of the next field, or null when none is left
 */
export function nextField(fields: FieldDef[], active: string, cols: Record<string, number>): string | null {
  const next = fields.find((f) => f.k !== active && cols[f.k] == null && (f.req || ['last', 'first'].includes(f.k)));
  return next ? next.k : null;
}

/**
 * Which columns and rows the grid shows.
 * @param sheet - the sheet being mapped
 * @param b - the binding (header row and columns)
 * @param extra - how many extra rows «Δείξε κι άλλες γραμμές» added
 * @returns `maxCol` (last column shown), `from` (first row) and `to` (one past the last row)
 */
export function mapRange(sheet: RawSheet, b: SourceBinding, extra: number) {
  const maxCol = Math.max(
    8,
    ...Object.values(b.cols),
    ...sheet.rows.slice(b.header, b.header + 30).map((r) => (r || []).length - 1),
  );
  const from = Math.max(0, b.header - 2);
  const to = Math.min(Math.max(sheet.rows.length, b.header + 1), b.header + 16 + extra);
  return { maxCol, from, to };
}

/** «Β · ΕΠΩΝΥΜΟ»: the column letter with the first 24 characters of its header text. */
export function colLabel(sheet: RawSheet, header: number, c: number): string {
  const head = cellText((sheet.rows[header] || [])[c]);
  return colLetter(c) + (head ? ' · ' + head.slice(0, 24) : '');
}

/** The first rows of a status sheet as the app reads them, one line each. */
function statusSample(
  list: Parameters<typeof parseStatuses>[0],
  sheet: RawSheet,
  b: SourceBinding,
  state: AppState,
  today: ISODate,
) {
  return parseStatuses(list, sheet, b, state.people, today, state.settings.lists)
    .cands.slice(0, 5)
    .map(
      (c) =>
        c.who +
        ' · ' +
        TYPES[c.type || DEFAULT_TYPE[list]].label +
        (c.kind && c.kind !== TYPES[c.type || DEFAULT_TYPE[list]].label ? ' (' + c.kind + ')' : '') +
        ' · ' +
        dm(c.from) +
        '–' +
        dm(c.to) +
        (c.pid == null ? ' · ⚠ δεν βρέθηκε στην εφαρμογή' : ''),
    );
}

/** The month line and the first rows of a duty-check sheet, with the codes that read as duties. */
function dutiesSample(sheet: RawSheet, b: SourceBinding, state: AppState, today: ISODate) {
  const cols = dutyDays(sheet, b);
  return [
    (sheetMonth(sheet, b.header, today) ? 'Μήνας ' + sheetMonth(sheet, b.header, today) + ' · ' : '') +
      cols.length +
      ' στήλες ημερών',
    ...tableRows(sheet, b.header, b.cols)
      .records.slice(0, 4)
      .map(
        (r) =>
          rowName(r.v) +
            ' · ' +
            cols
              .map((c) => cellText((sheet.rows[r.r] || [])[c]))
              .filter((x) => typeof readDuty(x, state.settings) === 'object' && readDuty(x, state.settings) !== null)
              .join(' ') || '—',
      ),
  ];
}

/** The first rows of the abilities sheet: what each person does not do. */
function capsSample(sheet: RawSheet, b: SourceBinding, state: AppState) {
  const bx = capExtraCols('caps', sheet, b, state, false).b;
  const ks = [...CAP_COLS, ...capExtras(state.settings).map((x) => x.key)].filter((k) => bx.cols[k] != null);
  return tableRows(sheet, bx.header, bx.cols)
    .records.slice(0, 5)
    .map(
      (r) =>
        rowName(r.v) +
        ' · ' +
        (ks
          .filter((k) => capNo(cellText(r.v[k])))
          .map((k) => 'όχι ' + capAcc(k, state.settings))
          .join(', ') || 'κάνει όλες'),
    );
}

/**
 * «Έτσι διαβάζει η εφαρμογή τις πρώτες γραμμές»: up to five sample lines (four for the duty check).
 * @param p - the kind, the sheet, the binding being edited, the app state and the day
 * @returns `[]` while the sheet is new or a required field is missing
 */
export function mapSample(p: {
  list: ListKind;
  sheet: RawSheet;
  b: SourceBinding;
  state: AppState;
  today: ISODate;
  isNew: boolean;
  missing: number;
}): string[] {
  const { list, sheet, b, state, today } = p;
  if (p.isNew || p.missing) return [];
  if (isStatusKind(list)) return statusSample(list, sheet, b, state, today);
  if (list === 'duties') return dutiesSample(sheet, b, state, today);
  if (list === 'caps') return capsSample(sheet, b, state);
  return tableRows(sheet, b.header, b.cols)
    .records.slice(0, 5)
    .map(
      (r) =>
        rowName(r.v) +
        (list === 'posts'
          ? ' · ' + cellText(r.v.post)
          : list === 'outside' && cellText(r.v.remarks)
            ? ' · ' + cellText(r.v.remarks)
            : ''),
    );
}
