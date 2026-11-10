// XML text helpers of the print engine.
//
// Purpose: small readers for attributes and blocks of OOXML text (`attr`, `num`, `on`, `block`, `items`), the HTML
//   escape `esc` and the cell key `key`.
// Does NOT: parse a whole file or know anything about sheets (the other files do).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: every file of this folder reads XML with the same few regex helpers; kept as one owner file (Phase 4.8a,
//   verbatim from the old src/main/print.ts).
// Covering test: test/print.test.ts and test/print-safety.test.ts (escaping).
import { attrRe, unesc } from '../excel/xlsx';

/** Attribute `n` of a tag text, XML-unescaped; null when the tag has no such attribute. */
export const attr = (s: string, n: string) => {
  const m = attrRe(n).exec(s);
  return m ? unesc(m[1]) : null;
};

/** Numeric attribute `n` of a tag text; `d` when it is missing, empty or not a number. */
export const num = (s: string, n: string, d: number) => {
  const v = attr(s, n);
  return v == null || v === '' || isNaN(+v) ? d : +v;
};

/** True when the boolean tag `<tag/>` is present and not switched off with `val="0"` or `val="false"`. */
export const on = (s: string, tag: string) => {
  const m = new RegExp('<' + tag + '\\b([^>]*)/?>').exec(s);
  return !!m && !/val="(0|false)"/.test(m[1]);
};

/** Inner text of the first `<tag>...</tag>` of `xml`; empty string when there is none. */
export const block = (xml: string, tag: string) =>
  new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>').exec(xml)?.[1] || '';

/** Every `<tag .../>` or `<tag>...</tag>` of `xml`, each as its whole text. */
export const items = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp('<' + tag + '\\b[^>]*?(?:/>|>[\\s\\S]*?</' + tag + '>)', 'g'))].map((m) => m[0]);

/** HTML-escapes `& < > "` for text and attribute values of the generated page. */
export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Cell key of 1-based row `r` and column `c`: `r * 16384 + c` (16384 = the column count of Excel), so it is unique. */
export const key = (r: number, c: number) => r * 16384 + c;
