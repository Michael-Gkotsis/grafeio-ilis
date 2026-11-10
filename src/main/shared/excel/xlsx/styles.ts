// Order tables and the alignment edit for styles.xml.
//
// Purpose: `RPR_ORDER` / `FONT_ORDER` (the order Excel wants inside `<rPr>` and `<font>`) and `withAlign` (an `<xf>`
//   with a changed alignment).
// Does NOT: read or write styles.xml as a whole (Workbook does).
// Owner layer: main (architecture), `shared/excel/xlsx`. Pure string work on OOXML text; no Electron, no fs.
// Why: Workbook's style methods share these; kept as one owner file so the order lists exist once (Phase 4.7,
//   verbatim from the old src/main/xlsx.ts).
// Covering test: test/format.test.ts and test/auto-cols.test.ts (alignment and wrapping through Workbook).
import { setAttr } from './refs';

/** Order of the properties inside `<rPr>` (rich-text runs), as Excel writes them. */
export const RPR_ORDER = [
  'b',
  'i',
  'strike',
  'condense',
  'extend',
  'outline',
  'shadow',
  'u',
  'vertAlign',
  'sz',
  'color',
  'rFont',
  'family',
  'charset',
  'scheme',
];
/** Order of the properties inside `<font>` in styles.xml. */
export const FONT_ORDER = [
  'b',
  'i',
  'strike',
  'condense',
  'extend',
  'outline',
  'shadow',
  'u',
  'vertAlign',
  'sz',
  'color',
  'name',
  'family',
  'charset',
  'scheme',
];
/**
 * The `<xf>` with changed alignment (`set`), or with a new alignment `set` + `fresh` if it had none.
 * @param x  the whole `<xf>` element
 * @returns the `<xf>` with `applyAlignment="1"`
 */
export function withAlign(x: string, set: Record<string, string>, fresh: Record<string, string> = {}): string {
  const open = x.slice(0, x.indexOf('>') + 1).replace(/\/>$/, '>');
  const body = x.endsWith('/>') ? '' : x.slice(x.indexOf('>') + 1, x.lastIndexOf('</xf>'));
  const al = /<alignment\b[^>]*?\/?>(?:<\/alignment>)?/.exec(body)?.[0];
  const fixed =
    Object.entries(al ? set : { ...set, ...fresh }).reduce(
      (a, [k, v]) => setAttr(a, k, v),
      al ? al.replace(/\/?>(<\/alignment>)?$/, '') : '<alignment',
    ) + '/>';
  return (
    setAttr(open.slice(0, -1), 'applyAlignment', '1') + '>' + (al ? body.replace(al, fixed) : fixed + body) + '</xf>'
  );
}
