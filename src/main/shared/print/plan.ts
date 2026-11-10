// The page plan of a sheet and the plan of the file's own page setup.
//
// Purpose: the type `Plan`, `geomOf` (page size in px) and `planFile` (the page setup stored in the Excel file:
//   percentage or "fit to X x Y pages", page breaks, columns across pages).
// Does NOT: plan for the window (planFit.ts).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: a plan says which rows and columns go on each page and at what scale; form previews use the file's own plan
//   (Phase 4.8a, verbatim).
// Covering test: test/print.test.ts.
import { rowAt } from './geometry';
import { PAPER } from './pagesetup';
import type { Geo } from './types';
import { attr, block, num } from './xml';

/** The plan of one sheet: paper, margins, scale and which rows and columns go on each page. */
export interface Plan {
  paper: { name: string; w: number; h: number };
  landscape: boolean;
  pw: number;
  ph: number;
  M: { l: number; r: number; t: number; b: number; h: number; f: number };
  availW: number;
  availH: number;
  scale: number;
  maxScale: number;
  pt: number;
  cs: number;
  f: number;
  centerH: boolean;
  centerV: boolean;
  pno: boolean;
  repeat: boolean;
  order: [number[], number[]][];
}

/** Page size in CSS px (96 dpi) of a paper in mm, portrait or landscape. */
export const geomOf = (paper: { w: number; h: number }, landscape: boolean) => ({
  pw: ((landscape ? paper.h : paper.w) / 25.4) * 96,
  ph: ((landscape ? paper.w : paper.h) / 25.4) * 96,
});

/**
 * The page setup of the file itself (Excel): a percentage or "fit to X × Y pages", page breaks, columns across pages.
 */
export function planFile(g: Geo): Plan {
  const x = g.sh.xml,
    ps = g.ps,
    pm = g.pm;
  const paper = PAPER[num(ps, 'paperSize', 9)] || PAPER[9];
  const landscape = attr(ps, 'orientation') === 'landscape';
  const { pw, ph } = geomOf(paper, landscape);
  const M = {
    l: num(pm, 'left', 0.7) * 96,
    r: num(pm, 'right', 0.7) * 96,
    t: num(pm, 'top', 0.75) * 96,
    b: num(pm, 'bottom', 0.75) * 96,
    h: num(pm, 'header', 0.3) * 96,
    f: num(pm, 'footer', 0.3) * 96,
  };
  const availW = Math.max(50, pw - M.l - M.r),
    availH = Math.max(50, ph - M.t - M.b);
  const H = g.rowsAll.reduce((a, r) => a + g.rowH(r), 0);
  const fit = /<pageSetUpPr\b[^>]*fitToPage="(1|true)"/.test(x);
  let scale = num(ps, 'scale', 100) / 100;
  if (fit) {
    const fw = num(ps, 'fitToWidth', 1),
      fh = num(ps, 'fitToHeight', 1);
    scale = 1;
    if (fw > 0 && g.W > 0) scale = Math.min(scale, (availW * fw) / g.W);
    if (fh > 0 && H > 0) scale = Math.min(scale, (availH * fh) / H);
    scale = Math.floor(scale * 100) / 100;
  }
  scale = Math.min(4, Math.max(0.1, scale));
  // pages: manual breaks and whatever does not fit, with the title rows on every page
  const brk = (tag: string) => new Set([...block(x, tag).matchAll(/<brk\b[^>]*>/g)].map((m) => num(m[0], 'id', 0)));
  const rowBrk = brk('rowBreaks'),
    colBrk = brk('colBreaks');
  const split = (list: number[], size: (n: number) => number, room: (first: number) => number, breaks: Set<number>) => {
    const out: number[][] = [];
    let cur: number[] = [];
    let acc = 0;
    for (const n of list) {
      const s = size(n);
      if (cur.length && (acc + s > room(cur[0]) + 0.5 || breaks.has(n - 1))) {
        out.push(cur);
        cur = [];
        acc = 0;
      }
      cur.push(n);
      acc += s;
    }
    if (cur.length) out.push(cur);
    return out;
  };
  const withT = (first: number) => !!g.titles && first > g.titles[1];
  const rowPages = split(
    g.rowsAll,
    (r) => rowAt(g, r, scale),
    (f) => availH / scale - (withT(f) ? g.titleH : 0),
    rowBrk,
  );
  const colPages = split(g.colsAll, g.colW, () => availW / scale, colBrk);
  const order: [number[], number[]][] = [];
  if (attr(ps, 'pageOrder') === 'overThenDown')
    rowPages.forEach((rp) => colPages.forEach((cp) => order.push([rp, cp])));
  else colPages.forEach((cp) => rowPages.forEach((rp) => order.push([rp, cp])));
  const on1 = (n: string) => attr(g.po, n) === '1' || attr(g.po, n) === 'true';
  return {
    paper,
    landscape,
    pw,
    ph,
    M,
    availW,
    availH,
    scale,
    maxScale: scale,
    pt: g.dom.sz * scale,
    cs: 1,
    f: 1,
    centerH: on1('horizontalCentered'),
    centerV: on1('verticalCentered'),
    pno: false,
    repeat: true,
    order,
  };
}
