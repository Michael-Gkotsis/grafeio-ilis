// Public face of the print engine (Excel files to print pages, and the print window).
//
// Purpose: the exports the old src/main/print.ts had, with the same names and nothing more; helpers shared between the
//   files of this folder (attr, esc, geoOf, planFit, ...) are imported from their own file and are not part of the
//   public face.
// Does NOT: contain code (re-exports only) or change what the engine renders: pages stay byte for byte as before (Phase
//   4.8a).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: src/main/print.ts re-exports this folder so the importers do not change; they move here later. The old file was
//   "Printing Excel without Excel" (Michael, 11/10): the file becomes HTML pages with its own page setup (paper,
//   orientation, margins, scale or "fit to pages", print area, page breaks, title rows, header/footer) and is printed
//   by the Chromium of Electron with the Windows printer dialog. It keeps fonts, borders, colours, alignment and
//   merges, and recalculates the simple formulas (SUM, ROW()-6, E17-Z17...), because the files the app writes hold the
//   old values until Excel opens them.
// Covering test: test/print.test.ts, test/print-layout.test.ts and the golden hashes of `npm run bench:golden`.
export { Book } from './book';
export { formatValue } from './numfmt';
export { bookSheets, openBook, renderBook, renderOpen, sheetFontSize } from './render';
export { cleanOpts, PRINT_DEFAULT, printDefaults, printKey, rememberedSheets } from './options';
export type { PrintOpts, PrintSort, RenderOpts } from './options';
export type { PrintDoc, PrintSheet } from './pagesetup';
export { sortKey } from './sortKey';
export type { SortCol, SortKind } from './types';
export { infoOf, previewHtml, sectionsHtml } from './window';
export type { PrintInfo } from './window';
