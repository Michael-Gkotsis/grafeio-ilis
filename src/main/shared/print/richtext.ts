// Cells with formatting per run (rich text) for the print engine.
//
// Purpose: the type `XCell` (a parsed cell), the type `Rich`, `richOf` (runs of a shared or inline string) and
//   `richHtml` (runs as HTML).
// Does NOT: read sheets (sheet.ts) or draw pages (draw.ts).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: a few texts (the underlined duration of a penalty on the ΗΚΑΙ) need underline/bold/italic inside one cell (Phase
//   4.8a, verbatim).
// Covering test: test/hkai.test.ts and test/print.test.ts.
import { texts } from '../excel/xlsx';
import type { Val } from './formula';
import { esc, on } from './xml';

/**
 * A cell as the print engine keeps it. `rich` is the text with formatting per run (e.g. the underlined duration of a
 * penalty on the ΗΚΑΙ).
 */
export interface XCell {
  v: Val;
  f?: string;
  s: number | null;
  rich?: Rich;
}

export type Rich = { t: string; u: boolean; b: boolean; i: boolean }[];

/** The `<r>` runs of a text with their underline, bold and italic flags; null when it has none (plain text). */
export function richOf(xml: string): Rich | null {
  if (!xml.includes('<r>') && !xml.includes('<r ')) return null;
  const out: Rich = [];
  for (const m of xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<r\b[^>]*>([\s\S]*?)<\/r>/g)) {
    const pr = /<rPr\b[^>]*>([\s\S]*?)<\/rPr>/.exec(m[1])?.[1] || '';
    const u = /<u\b([^>]*)\/?>/.exec(pr);
    out.push({ t: texts(m[1]), u: !!u && !/val="none"/.test(u[1]), b: on(pr, 'b'), i: on(pr, 'i') });
  }
  return out.some((r) => r.u || r.b || r.i) ? out : null;
}

/** The runs of a rich text as HTML (`<u>`, `<b>`, `<i>`), text escaped. */
export const richHtml = (r: Rich) =>
  r
    .map((x) => {
      let h = esc(x.t);
      if (x.u) h = '<u>' + h + '</u>';
      if (x.b) h = '<b>' + h + '</b>';
      if (x.i) h = '<i>' + h + '</i>';
      return h;
    })
    .join('');
