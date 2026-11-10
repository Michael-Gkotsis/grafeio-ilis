// XML text helpers: escape, unescape, strip and capitalise.
//
// Purpose: `esc` (to XML text), `unesc` (back), `clean` (drop characters XML forbids), `text` (what the app writes
//   into a cell: capitals without accents, then clean) and `texts` (the visible text of a shared-string / rich-text
//   item).
// Does NOT: touch cell references, formulas or styles, and does not know about sheets.
// Owner layer: main (architecture), `shared/excel/xlsx`. Pure string work on OOXML text; no Electron, no fs.
// Why: these five were private helpers (two public: unesc, texts) of the old src/main/xlsx.ts and both Sheet and
//   Workbook use them. Moved verbatim (Phase 4.7).
// Covering test: test/excel-misc.test.ts (unesc, texts) and test/format.test.ts (capitals through Sheet/Workbook).
import { upper } from '../../../../shared/text';

/**
 * XML-escapes `& < > "` (the order matters: `&` first).
 * @param s  plain text
 * @returns text safe inside an element or attribute
 */
export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/**
 * Removes the control characters XML 1.0 does not allow (everything below 0x20 except tab, LF, CR), e.g. from
 * pasting.
 * @param s  any text
 */
export const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
/**
 * What the app writes into an Excel cell: capitals without accents, then `clean`. Formulas and numbers are not
 * passed through here (they stay as they are). @decision Michael 13/10: cell texts, rich text and choice lists.
 * @param s  user text
 */
export const text = (s: string) => clean(upper(s));
/**
 * Reverses `esc` and also decodes numeric entities (`&#10;`, `&#x1F;`) and `&apos;`.
 * @param t  XML text; returned as is (same string) when it has no `&`
 */
export const unesc = (t: string) =>
  t.indexOf('&') < 0
    ? t
    : t
        .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
/**
 * The visible text of a shared-string or rich-text item: every `<t>` joined, phonetic runs (`<rPh>`) skipped.
 * @param xml  the inner XML of an `<si>` or `<is>`
 */
export const texts = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?\/>|<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((m) => unesc(m[1] || ''))
    .join('');
