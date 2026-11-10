// Names the app puts inside the files it writes, and the safe sheet name.
//
// Purpose: REPORT_MARK, FIXED_MARK and NOHEAD_MARK (hidden defined names that tag sheets and areas) and `sheetSafe`.
// Does NOT: write or read any name (Workbook.markReport / markFixed / markAreas do), or know what the marks mean to
//   print.ts.
// Owner layer: main (architecture), `shared/excel/xlsx`. Pure string work on OOXML text; no Electron, no fs.
// Why: the three marks and `sheetSafe` were top-level constants of the old src/main/xlsx.ts. Moved verbatim (Phase
//   4.7); each has one owner here, so the strings exist exactly once.
// Covering test: test/excel-misc.test.ts (sheetSafe) and test/new-files.test.ts (marks through Workbook).

/** Hidden defined name that tags a sheet as written by the Έντυπα (so lookups by sheet name skip it). */
export const REPORT_MARK = 'GL_ENTYPO';
/**
 * Hidden defined name for the parts of a sheet that keep a fixed size when printing (header, date, title,
 * signatures); read by print.ts.
 */
export const FIXED_MARK = 'GL_STATHERA';
/**
 * Hidden defined name for the areas where the header row of a Έντυπα table without one was (hidden now, or empty),
 * for the sorting done by printing. @decision Michael 29/10.
 */
export const NOHEAD_MARK = 'GL_XORIS_EPIKEFALIDA';
/**
 * Sheet name Excel accepts: replaces `\ / ? * [ ] :` by `-` and cuts to 31 characters.
 * @param name  any text
 * @returns the safe name (not unique: callers check for duplicates themselves)
 */
export const sheetSafe = (name: string) => name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
