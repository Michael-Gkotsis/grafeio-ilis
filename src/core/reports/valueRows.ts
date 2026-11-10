// Values tables («Έντυπα › πίνακες τιμών»): the rows and which of them come out.
//
// Purpose: `newValueTable` / `newRow`, `valsUsed` (the tables and rows that come out), `hasVals`, `noPeople`,
//   `hasFilter` and the value formats `FMTS`. The file also re-exports the value types of core/model/reportTypes.ts
//   that the old src/shared/values.ts exported.
// Does NOT: evaluate a row (valueEval.ts) or name its label (valueTags.ts).
// Owner layer: core/reports (pure: no fs, no Electron, no React); imports core/model.
// Why: a values table is lines with the user's own text on the left and a value on the right, taken from a catalogue
//   of measures (Michael, 24/10); every reader must agree on which rows come out.
// Covering tests: test/value-manual.test.ts, test/values.test.ts, test/axiologisi.test.ts.
import type { ValueTable, VRow, VFilter, VFmt } from '../model/reportTypes';
export type { VAt, ValueTable, TAlign, Spot, VRow, VFmt, VExpr, VTerm, VFilter } from '../model/reportTypes';

/** The formats of a value row: number, percent, percent with a decimal. */
export const FMTS: { id: VFmt; label: string }[] = [
  { id: 'int', label: 'Αριθμός' },
  { id: 'pct', label: 'Ποσοστό (96%)' },
  { id: 'pct1', label: 'Ποσοστό με δεκαδικό (96,2%)' },
];
/** A new values table with one row. */
export const newValueTable = (id: string): ValueTable => ({ id, title: '', rows: [newRow()] });
/** A new value row: the total of the strength. */
export const newRow = (): VRow => ({ label: '', expr: [{ sign: '+', metric: 'str.total' }] });
/** True when the filter (unit, room, rank, arms, who) restricts anything. */
export const hasFilter = (f?: VFilter): f is VFilter =>
  !!f && (f.unit != null || f.room != null || !!f.rank || !!f.arm || !!f.who);
/** A row that comes out: with terms, or with the user's own value. */
export const rowOn = (r: Pick<VRow, 'expr' | 'man'>) => r.man != null || r.expr.length > 0;
/** The values tables that come out: without the rows that do not come out, and without the tables left empty. */
export const valsUsed = (v?: ValueTable[]): ValueTable[] =>
  (v || []).map((t) => ({ ...t, rows: t.rows.filter(rowOn) })).filter((t) => t.rows.length);
/** True when some values table has a row that comes out. */
export const hasVals = (r: { vals?: ValueTable[] }) => valsUsed(r.vals).length > 0;
/**
 * A form with only values tables: no columns of people (nothing to choose, nothing to count in «κανείς δεν περνά τα
 * φίλτρα»).
 */
export const noPeople = (r: { vals?: ValueTable[]; cols: unknown[] }) => hasVals(r) && !r.cols.length;
