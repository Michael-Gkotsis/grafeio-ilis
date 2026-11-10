// The month of a duty-check sheet.
//
// Purpose: `monthOf` (a month from a text), `sheetMonth` (from the titles or the name of a sheet) and `bindingMonth`
//   (the month of a binding).
// Does NOT: read the duty check itself (dutyCheckIn.ts).
// Owner layer: core/excel-in (pure: no fs, no Electron, no React); imports core/lib, core/model,
//   core/excel-in/cellText.
// Why: the monthly grid has only day numbers; the month comes from its title («ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΣΕΠΤΕΜΒΡΙΟΥ 2026»)
//   or, if the title has none, from what the user chose. Used by the reader and by the writer, so it sits apart from
//   both.
// Covering tests: test/duties-import.test.ts, test/sources.test.ts.
import type { ISODate } from '../lib/dates';
import { normGreek } from '../lib/text';
import type { RawSheet } from './roster';
import type { SourceBinding } from '../model/bindings';
import { cellText } from './cellText';

/** The month of a duty-check sheet: from the title, otherwise the one the user chose when reading. */
export const bindingMonth = (sheet: RawSheet, b: SourceBinding, today: ISODate) =>
  sheetMonth(sheet, b.header, today) || b.month || null;
const MONTHS = ['ΙΑΝ', 'ΦΕΒ', 'ΜΑΡ', 'ΑΠΡ', 'ΜΑΙ', 'ΙΟΥΝ', 'ΙΟΥΛ', 'ΑΥΓ', 'ΣΕΠ', 'ΟΚΤ', 'ΝΟΕ', 'ΔΕΚ'];
/**
 * A month from a text: «ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΣΕΠΤΕΜΒΡΙΟΥ 2026» → 2026-09. Without a year: the latest such month up to
 * `today`.
 */
export function monthOf(text: string, today: ISODate): string | null {
  const t = normGreek(text).replace(/[^Α-ΩA-Z0-9]+/g, ' ');
  const i = MONTHS.findIndex((m) => new RegExp('(^| )' + m + '[Α-Ω]*( |$)').test(t));
  if (i < 0) return null;
  const y = /(20\d\d)/.exec(t);
  const cy = +today.slice(0, 4);
  const year = y ? +y[1] : i + 1 > +today.slice(5, 7) ? cy - 1 : cy;
  return year + '-' + String(i + 1).padStart(2, '0');
}
/**
 * The month of a duty-check sheet: from the titles up to 4 rows above the header row, otherwise from the sheet name
 * (see `monthOf`).
 */
export function sheetMonth(sheet: RawSheet, header: number, today: ISODate): string | null {
  for (let r = header - 1; r >= Math.max(0, header - 4); r--)
    for (const v of sheet.rows[r] || []) {
      const m = monthOf(cellText(v), today);
      if (m) return m;
    }
  return monthOf(sheet.name, today);
}
