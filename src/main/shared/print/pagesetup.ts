// Page setup of a sheet and the types of the printed document.
//
// Purpose: the paper table `PAPER`, the types `PrintSheet` and `PrintDoc`, and readers of the defined names
//   (`definedName`, `areaOf`, `areasOf`, `titleRows`) and of the header/footer (`headerFooter`).
// Does NOT: measure the sheet (sheetGeo.ts) or plan pages (plan.ts, planFit.ts).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: the print area, the title rows and the header/footer live in the workbook as defined names and `&L &C &R` texts
//   (Phase 4.8a, verbatim).
// Covering test: test/print.test.ts and test/print-layout.test.ts.
import { colNum, unesc } from '../excel/xlsx';
import { nowParts } from '../../../shared/dates';
import type { SortCol } from './types';
import { attr } from './xml';

/** Excel `paperSize` ids the print engine knows, with their size in mm (portrait). */
export const PAPER: Record<number, { name: string; w: number; h: number }> = {
  1: { name: 'Letter', w: 215.9, h: 279.4 },
  5: { name: 'Legal', w: 215.9, h: 355.6 },
  8: { name: 'A3', w: 297, h: 420 },
  9: { name: 'A4', w: 210, h: 297 },
  11: { name: 'A5', w: 148, h: 210 },
};

/**
 * One sheet of the printed document. `pt` is the size on paper of the font of most cells (font and size in the Excel
 * file); `titles` says the sheet has title rows.
 */
export interface PrintSheet {
  name: string;
  paper: string;
  landscape: boolean;
  pages: number;
  scale: number;
  html: string;
  pt: number;
  font: string;
  size: number;
  titles: boolean;
}

/**
 * The printed document. `total` is all pages; `sug` is in how many pages the letters come out clear when they are
 * small; `cols` are the columns of the sortable tables (for the "Ταξινόμηση" of the window).
 */
export interface PrintDoc {
  sheets: PrintSheet[];
  all: string[];
  css: string;
  total: number;
  sug?: { n: number; pt: number };
  cols?: SortCol[];
}

/** The text of the defined name `name` that is local to sheet `idx` (0-based), XML-unescaped; null when absent. */
export function definedName(wbx: string, name: string, idx: number): string | null {
  for (const m of wbx.matchAll(/<definedName\b([^>]*)>([^<]*)<\/definedName>/g))
    if (attr(m[1], 'name') === name && attr(m[1], 'localSheetId') === String(idx)) return unesc(m[2]);
  return null;
}

/** Area of a reference such as `'Φύλλο'!$A$1:$M$46` (or several areas separated by commas: the first one is kept). */
export function areaOf(body: string | null): { r1: number; c1: number; r2: number; c2: number } | null {
  if (!body) return null;
  const first = body
    .split(/,(?=(?:[^']*'[^']*')*[^']*$)/)[0]
    .replace(/^.*!/, '')
    .replace(/\$/g, '');
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(first);
  if (!m) return null;
  return { c1: colNum(m[1].toUpperCase()), r1: +m[2], c2: colNum((m[3] || m[1]).toUpperCase()), r2: +(m[4] || m[2]) };
}

/** All areas of a name (e.g. the fixed parts: heading, date, signatures). */
export function areasOf(body: string | null): { r1: number; c1: number; r2: number; c2: number }[] {
  if (!body) return [];
  return body
    .split(/,(?=(?:[^']*'[^']*')*[^']*$)/)
    .map(areaOf)
    .filter((a): a is NonNullable<typeof a> => !!a);
}

/** The first `$1:$3`-style row range of a `Print_Titles` name as [first, last]; null when there is none. */
export function titleRows(body: string | null): [number, number] | null {
  if (!body) return null;
  for (const part of body.split(',')) {
    const m = /!?\$?(\d+):\$?(\d+)$/.exec(part.trim());
    if (m) return [+m[1], +m[2]];
  }
  return null;
}

/**
 * The `&L &C &R` parts of a header or footer, with page, page count, date, sheet name and file name. `noPage` drops the
 * parts (&L/&C/&R) that write the page or the page count, e.g. "ΣΕΛΙΔΑ &P ΑΠΟ &N" of the forms, when the user switched
 * off "Σελίδα 1 από 2" in the "Εκτύπωση" window.
 * @decision Michael 4/11: it kept appearing.
 */
export function headerFooter(
  src: string | null,
  ctx: { page: number; pages: number; sheet: string; file: string },
  noPage = false,
): [string, string, string] | null {
  if (!src) return null;
  const out: [string, string, string] = ['', '', ''];
  const num = [false, false, false];
  let sec = 1;
  const d = nowParts();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const s = src
    .replace(/&"[^"]*"/g, '')
    .replace(/&K[0-9A-F]{6}/gi, '')
    .replace(/&\d+/g, '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '&') {
      out[sec] += s[i];
      continue;
    }
    const k = s[++i]?.toUpperCase();
    if (k === 'L') sec = 0;
    else if (k === 'C') sec = 1;
    else if (k === 'R') sec = 2;
    else if (k === 'P') {
      out[sec] += String(ctx.page);
      num[sec] = true;
    } else if (k === 'N') {
      out[sec] += String(ctx.pages);
      num[sec] = true;
    } else if (k === 'D') out[sec] += p2(d.d) + '/' + p2(d.mo) + '/' + d.y;
    else if (k === 'T') out[sec] += p2(d.h) + ':' + p2(d.mi);
    else if (k === 'A') out[sec] += ctx.sheet;
    else if (k === 'F') out[sec] += ctx.file;
    else if (k === 'Z') out[sec] += '';
    else if (k === '&') out[sec] += '&';
  }
  if (noPage)
    num.forEach((n, i) => {
      if (n) out[i] = '';
    });
  return out.some(Boolean) ? out : null;
}
