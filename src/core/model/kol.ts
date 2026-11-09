// «Κωλυόμενος» (prevented) columns of the «ΗΚΑΙ» and the column a status counts in.
//
// Purpose: KOL_COLS (the columns a prevented declaration can choose), the «no column» marker, and the readers
//   kolColOf / kolHk / kolColName; STEP_COL, the one-line switch for «ΣΤΕΠ».
// Does NOT: compute who is prevented on a day (core/duty, rules.ts kolView today).
// Owner layer: core/model (no fs, no Electron, no React).
// Why: statuses (status.ts) and the «ΗΚΑΙ» both name these columns; keeping them below both avoids a type cycle.
// Covering tests: test/kolyomenoi.test.ts, test/hkai.test.ts.
import { CADRE_ABS } from './cadreRecord';

/** «ΗΚΑΙ» prevented-columns chosen by the declaration of a prevented person: the first seven of CADRE_ABS. */
export const KOL_COLS: [string, string][] = CADRE_ABS.slice(0, 7).map(([k, l]) => [k, k === 'yp' ? 'Υπηρεσία' : l]);
export const KOL_DEFAULT_COL = 'yp';
/**
 * «No column» (Michael, 29/10: the «ΗΚΑΙ» column is optional): hkCol '-' = prevented in the strength and in «Σήμερα»,
 * but in no prevented column of the «ΗΚΑΙ». Old declarations (hkCol missing) stay in «Υπηρεσία» as always.
 */
export const KOL_NO_COL = '-';
/** The «ΗΚΑΙ» column of a prevented person (invalid or missing: «Υπηρεσία»; '-' = none). */
export const kolColOf = (s: { hkCol?: string }): string =>
  s.hkCol === KOL_NO_COL ? KOL_NO_COL : KOL_COLS.some((x) => x[0] === s.hkCol) ? s.hkCol! : KOL_DEFAULT_COL;
/** The «ΗΚΑΙ» column that really counts, null when he is in none. */
export const kolHk = (s: { hkCol?: string }): string | null => {
  const c = kolColOf(s);
  return c === KOL_NO_COL ? null : c;
};
/** Screen name of a column key. */
export const kolColName = (k: string): string =>
  k === KOL_NO_COL ? 'χωρίς στήλη ΗΚΑΙ' : KOL_COLS.find((x) => x[0] === k)?.[1] || k;
/**
 * The «ΗΚΑΙ» column for anyone with «ΣΤΕΠ» (Michael, 29/10: prevented automatically, «πουθενά» for now).
 * null = counts in no column (only in the strength and in «Σήμερα»); a key of KOL_COLS ('ey', 'yp'…) = goes into that
 * «ΗΚΑΙ» column as prevented. One line to change.
 */
export const STEP_COL = null as string | null;
