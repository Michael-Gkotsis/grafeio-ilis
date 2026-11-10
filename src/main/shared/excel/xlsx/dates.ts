// Excel date serial numbers and date number formats.
//
// Purpose: `toSerial` (ISO date to Excel serial), the epochs, and which number formats count as dates.
// Does NOT: read a date out of a cell (Workbook does, with the book's own date1904 flag) or format one for the
//   screen.
// Owner layer: main (architecture), `shared/excel/xlsx`. Pure string work on OOXML text; no Electron, no fs.
// Why: one owner for the two epochs and the built-in date format ids, used by Workbook for both writing and reading.
//   Moved verbatim from the old src/main/xlsx.ts (Phase 4.7).
// Covering test: test/datefmt.test.ts and test/excel-misc.test.ts (toSerial).

/** Milliseconds in a day. */
export const DAY = 86400000;
/** Excel day zero (30/12/1899, UTC) and the day zero of old Mac files (1/1/1904, UTC), as epoch milliseconds. */
export const EPOCH = Date.UTC(1899, 11, 30),
  EPOCH_1904 = Date.UTC(1904, 0, 1);
/**
 * Excel serial number of a date: days since 30/12/1899, or since 1/1/1904 when the book counts from there
 * (Workbook.date1904), as in reading.
 * @param iso  ISODate `yyyy-mm-dd`
 * @param y1904  the book uses the 1904 system
 */
export const toSerial = (iso: string, y1904 = false) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - (y1904 ? EPOCH_1904 : EPOCH)) / DAY);
};
/** Excel's built-in date number format ids (14-22, 27-36, 45-47, 50-58). */
export const DATE_IDS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56,
  57, 58,
]);
/**
 * Is a custom number-format code a date format? True when it has `d` or `y` outside quotes, escapes and brackets
 * (so a time-only format like `hh:mm` is not a date).
 * @param code  the format code from styles.xml
 */
export const isDateCode = (code: string) =>
  /[dy]/i.test(
    code
      .replace(/"[^"]*"/g, '')
      .replace(/\\./g, '')
      .replace(/\[[^\]]*\]/g, ''),
  );
