// Cell references, XML attributes and formula shifting.
//
// Purpose: column letters <-> numbers, `splitRef`, attribute read/write on a tag, and the formula rewriting that
//   follows rows inserted into or removed from a sheet (`shiftRef`, `shiftFormula`, `growFormula`,
//   `shiftCellFormulas`).
// Does NOT: know sheets, styles or workbooks; it only transforms strings.
// Owner layer: main (architecture), `shared/excel/xlsx`. Pure string work on OOXML text; no Electron, no fs.
// Why: the old src/main/xlsx.ts kept these next to Sheet; Sheet and Workbook both need them, and the
//   regular-expression cache `ATTR_RE` must stay a single instance. Moved verbatim (Phase 4.7).
// Covering test: test/insert-rows.test.ts, test/new-soldier.test.ts (growFormula) and test/excel-misc.test.ts.
import { unesc } from './text';

/**
 * Column number from letters, 1-based: `A` = 1, `AA` = 27.
 * @param c  upper-case letters
 */
export const colNum = (c: string) => c.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
/**
 * Column letters from a 1-based number, the inverse of `colNum`.
 * @param n  1-based; `0` or less gives an empty string
 */
export const colName = (n: number) => {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
/**
 * Splits an A1 reference (`$` marks allowed) into a 1-based column and row.
 * @param ref  e.g. `B7` or `$B$7`
 * @throws Error (Greek message) when it is not a cell reference
 */
export const splitRef = (ref: string) => {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref);
  if (!m) throw new Error('Λάθος κελί: ' + ref);
  return { c: colNum(m[1]), r: Number(m[2]) };
};
// one regular expression per name (attr is called for every cell)
const ATTR_RE = new Map<string, RegExp>();
/**
 * The regular expression that reads attribute `name` (`\sname="value"`), cached per name because `attr` is called
 * for
 * every cell.
 * @param name  attribute name; a single instance per name for the lifetime of the process
 */
export const attrRe = (name: string) => {
  let re = ATTR_RE.get(name);
  if (!re) {
    re = new RegExp('\\s' + name + '="([^"]*)"');
    ATTR_RE.set(name, re);
  }
  return re;
};
/**
 * Value of attribute `name` in a tag's attribute text.
 * @returns the (still escaped) value, or null when absent
 */
export const attr = (attrs: string, name: string) => {
  const m = attrRe(name).exec(attrs);
  return m ? m[1] : null;
};
/** Sets (or, with null, removes) attribute `name`; a new attribute is appended at the end. */
export const setAttr = (attrs: string, name: string, v: string | null) => {
  const re = new RegExp('\\s' + name + '="[^"]*"');
  if (v == null) return attrs.replace(re, '');
  return re.test(attrs) ? attrs.replace(re, ` ${name}="${v}"`) : attrs + ` ${name}="${v}"`;
};
// Move a row reference: every row > after goes +n. With n < 0 (the rows after `after` are deleted) the start of a
// range that was on the deleted row stays there (it now points at the next row) and the end moves up, as in Excel.
const shiftRange = (a: string, b: string | undefined, after: number, n: number) => {
  const at = (x: string, th: number) => {
    const m = /^(\$?[A-Z]+\$?)(\d+)$/.exec(x);
    if (!m) return { s: x, r: 0 };
    const r = Number(m[2]) > th ? Number(m[2]) + n : Number(m[2]);
    return { s: m[1] + r, r, c: m[1] };
  };
  if (b == null) return at(a, after).s;
  const x = at(a, n < 0 ? after - n : after),
    y = at(b, after);
  return x.s + ':' + (y.r < x.r && y.c ? y.c + x.r : y.s);
};
/**
 * Shifts every reference in a `ref` attribute / range text (see the rule above `shiftRange`).
 * @param after  rows greater than this move
 * @param n  rows to add (negative: rows were deleted)
 */
export const shiftRef = (ref: string, after: number, n: number) =>
  ref.replace(/(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?/g, (_m, a: string, b: string | undefined) =>
    shiftRange(a, b, after, n),
  );
// The same inside a formula: only references to the sheet that changed. In its own sheet (own) references that name
// no sheet count too; in other sheets only those that name it. Quoted texts and function names stay as they are.
const REF_RE =
  /(?<![\p{L}\p{N}_.$])((?:'(?:[^']|'')+'|[\p{L}\p{N}_.]+)!)?(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?(?![\p{L}\p{N}_(!])/gu;
const sheetOf = (q: string) => (q.startsWith("'") ? q.slice(1, -2).replace(/''/g, "'") : q.slice(0, -1)).toLowerCase();
/**
 * Shifts the references in a formula that point at rows of `sheet` (own = the formula lives in that sheet).
 * Quoted texts and function names stay as they are.
 * @param f  formula text as stored in the XML (escaped); returned as is (same string) when nothing changed
 */
export function shiftFormula(f: string, sheet: string, own: boolean, after: number, n: number): string {
  const name = sheet.toLowerCase();
  const plain = unesc(f);
  const out = plain
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(REF_RE, (m, q: string | undefined, a: string, b: string | undefined) => {
            if (q ? sheetOf(q) !== name : !own) return m;
            return (q || '') + shiftRange(a, b, after, n);
          }),
    )
    .join('');
  return out === plain ? f : out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/**
 * Makes ranges that end at row `last` and start at row `from` or `from + 1` end at row `to` instead, for new rows
 * right below the end of a list, e.g. `COUNTIF(I4:I158, "1")` becomes `COUNTIF(I4:I159, "1")`.
 * @param own  true when the formula lives in sheet `sheet` (references without a sheet name count too)
 * @returns the formula, the same string when nothing changed
 */
export function growFormula(f: string, sheet: string, own: boolean, from: number, last: number, to: number): string {
  const name = sheet.toLowerCase();
  const plain = unesc(f);
  const out = plain
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(REF_RE, (m, q: string | undefined, a: string, b: string | undefined) => {
            if (!b || (q ? sheetOf(q) !== name : !own)) return m;
            const ra = splitRef(a).r,
              rb = splitRef(b).r;
            return ra >= from && ra <= from + 1 && rb === last
              ? (q || '') + a + ':' + b.replace(/\d+$/, String(to))
              : m;
          }),
    )
    .join('');
  return out === plain ? f : out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/**
 * Applies `shiftFormula` to every `<f>` of a cell and shifts the `ref` range of shared / array formulas (own sheet
 * only).
 * @param inner  the inner XML of a `<c>`
 */
export const shiftCellFormulas = (inner: string, sheet: string, own: boolean, after: number, n: number) =>
  inner.replace(/<f(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/f>)/g, (_m, fa = '', body: string | undefined) => {
    const a = own ? fa.replace(/\sref="([^"]+)"/, (_x: string, r: string) => ` ref="${shiftRef(r, after, n)}"`) : fa;
    return body == null ? `<f${a}/>` : `<f${a}>${shiftFormula(body, sheet, own, after, n)}</f>`;
  });
