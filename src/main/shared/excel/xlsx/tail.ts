// Where a new element goes after `<sheetData>`.
//
// Purpose: `tailInsert` puts a worksheet element (e.g. `<mergeCells>`, `<dataValidations>`) at the position the
//   schema demands.
// Does NOT: parse the sheet or know what the element means.
// Owner layer: main (architecture), `shared/excel/xlsx`. Pure string work on OOXML text; no Electron, no fs.
// Why: Excel refuses a sheet whose trailing elements are in another order; Sheet.tail needs this for every addition.
//   Moved verbatim from the old src/main/xlsx.ts (Phase 4.7).
// Covering test: test/excel-misc.test.ts and test/new-files.test.ts (merges, validations and print setup go through
//   it).

// Order of the elements after <sheetData> (Excel does not open a sheet with any other order)
const TAIL_ORDER = [
  'sheetCalcPr',
  'sheetProtection',
  'protectedRanges',
  'scenarios',
  'autoFilter',
  'sortState',
  'dataConsolidate',
  'customSheetViews',
  'mergeCells',
  'phoneticPr',
  'conditionalFormatting',
  'dataValidations',
  'hyperlinks',
  'printOptions',
  'pageMargins',
  'pageSetup',
  'headerFooter',
  'rowBreaks',
  'colBreaks',
  'customProperties',
  'cellWatches',
  'ignoredErrors',
  'smartTags',
  'drawing',
  'legacyDrawing',
  'legacyDrawingHF',
  'drawingHF',
  'picture',
  'oleObjects',
  'controls',
  'webPublishItems',
  'tableParts',
  'extLst',
];
/**
 * Inserts `xml` (an element called `name`) into `tail` (the text after `</sheetData>`, ending with `</worksheet>`)
 * before the first later element of TAIL_ORDER that is present, or before `</worksheet>`.
 * @param name  element name; it must be listed in TAIL_ORDER (an unknown name inserts before the first element
 *   found)
 */
export function tailInsert(tail: string, name: string, xml: string): string {
  let at = tail.lastIndexOf('</worksheet>');
  for (const el of TAIL_ORDER.slice(TAIL_ORDER.indexOf(name) + 1)) {
    const i = tail.search(new RegExp('<' + el + '[\\s/>]'));
    if (i >= 0 && i < at) at = i;
  }
  return tail.slice(0, at) + xml + tail.slice(at);
}
