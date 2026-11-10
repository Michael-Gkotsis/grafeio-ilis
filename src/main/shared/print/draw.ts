// Draws the pages of a sheet as HTML.
//
// Purpose: `drawSheet` (a `<div class="pg">` per page: cells, merges, borders, header/footer, page number) and the
//   private `countHidden`.
// Does NOT: plan the pages or choose the sheets (plan.ts, render.ts).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: the page HTML is the output of the print window and of the PDF; it moves verbatim (Phase 4.8a).
// Covering test: test/print.test.ts, test/print-safety.test.ts and the golden hashes of `npm run bench:golden`.
import { colName, unesc } from '../excel/xlsx';
import type { Book } from './book';
import { sideCss } from './css';
import { XErr } from './formula';
import { fixK, rowAt } from './geometry';
import { formatValue } from './numfmt';
import type { RenderOpts } from './options';
import { headerFooter, type PrintSheet } from './pagesetup';
import type { Plan } from './plan';
import { richHtml } from './richtext';
import type { Geo } from './types';
import { esc, key } from './xml';

/**
 * Draws the pages of one sheet as HTML (`<div class="pg">` per page) from its geometry and plan. `used` collects the
 * style ids to emit CSS for; `pageAt` and `pageTotal` number the pages across the whole document.
 */
export function drawSheet(
  book: Book,
  g: Geo,
  P: Plan,
  file: string,
  used: Set<number>,
  opt: RenderOpts,
  pageAt: number,
  pageTotal: number,
): PrintSheet {
  const sh = g.sh;
  const st = book.styles;
  const fit = !!opt.layout;
  const { pw, ph, M, availW, availH, scale } = P;
  const mergeAt = new Map<number, { r1: number; c1: number; r2: number; c2: number }>();
  for (const m of sh.merges)
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) mergeAt.set(key(r, c), m);
  const colInfo = (c: number) => sh.cols.find((k) => c >= k.min && c <= k.max);
  const cellOf = (r: number, c: number) => sh.cells.get(key(r, c));
  const styleOf = (r: number, c: number) => {
    const k = cellOf(r, c);
    if (k?.s != null) return k.s;
    const rw = sh.rows.get(r);
    if (rw?.s != null) return rw.s;
    return colInfo(c)?.s ?? 0;
  };
  // sorted: the Α/Α shows the number of the position (of the row that was there before)
  const shown = (r0: number, c: number) => {
    const r = g.fix?.get(key(r0, c)) ?? r0;
    const k = cellOf(r, c);
    if (!k) return '';
    const v = k.f ? book.value(sh.name, r, c) : k.v;
    return v instanceof XErr ? v.code : v;
  };
  const fk = fixK(scale); // fixed parts: as much as the table shrank, so much they grow inside it
  const rowH = (r: number) => rowAt(g, r, scale) * (P.f !== 1 && g.framed.has(r) ? P.f : 1);
  const colW = (c: number) => g.colW(c) * P.cs;
  const withTitles = (first: number) => P.repeat && !!g.titles && first > g.titles[1];

  const pages = (opt.maxPages ? P.order.slice(0, opt.maxPages) : P.order).map(([rp, cp], pi) => {
    const rep = new Set(withTitles(rp[0]) ? g.titleList : []); // the repeated title rows (not for clicking)
    const rows = rep.size ? [...rep, ...rp] : rp;
    const rowIx = new Map(rows.map((r, i) => [r, i]));
    const colIx = new Map(cp.map((c, i) => [c, i]));
    const tw = cp.reduce((a, c) => a + colW(c), 0),
      th = rows.reduce((a, r) => a + rowH(r), 0);
    let body = '';
    for (const r of rows) {
      let tr = '';
      for (const c of cp) {
        const m = mergeAt.get(key(r, c));
        let rs = 1,
          cs = 1,
          ar = r,
          ac = c,
          isAnchor = true;
        if (m) {
          // the part of the merge that falls on this page; the value only where the top-left cell is
          const vr = rows.filter((y) => y >= m.r1 && y <= m.r2),
            vc = cp.filter((y) => y >= m.c1 && y <= m.c2);
          if (vr[0] !== r || vc[0] !== c) continue;
          let k = rowIx.get(r)!;
          while (
            k + 1 < rows.length &&
            rows[k + 1] <= m.r2 &&
            rows[k + 1] === rows[k] + 1 + countHidden(rows[k], rows[k + 1], g.rowH)
          ) {
            k++;
            rs++;
          }
          let j = colIx.get(c)!;
          while (j + 1 < cp.length && cp[j + 1] <= m.c2) {
            j++;
            cs++;
          }
          ar = m.r1;
          ac = m.c1;
          isAnchor = r === m.r1 && c === m.c1;
        }
        const s = styleOf(ar, ac);
        used.add(s);
        const xf = st.xfs[s] || st.xfs[0];
        const v = isAnchor ? shown(ar, ac) : '';
        const rich = isAnchor ? cellOf(ar, ac)?.rich : undefined;
        const txt =
          typeof v === 'number'
            ? formatValue(v, xf.fmt, st.codes, book.y1904)
            : typeof v === 'boolean'
              ? v
                ? 'TRUE'
                : 'FALSE'
              : v == null
                ? ''
                : String(v);
        // borders: from the edges of the merge
        const lastR = rs > 1 ? rows[rowIx.get(r)! + rs - 1] : r,
          lastC = cs > 1 ? cp[colIx.get(c)! + cs - 1] : c;
        const bT = xf.border.t,
          bL = xf.border.l;
        const bR = (cs > 1 ? st.xfs[styleOf(r, lastC)] || xf : xf).border.r,
          bB = (rs > 1 ? st.xfs[styleOf(lastR, c)] || xf : xf).border.b;
        let style = '';
        if (bT || bL || bR || bB)
          style += `border-top:${sideCss(bT)};border-left:${sideCss(bL)};border-right:${sideCss(bR)};border-bottom:${sideCss(bB)};`;
        const h = rows.slice(rowIx.get(r)!, rowIx.get(r)! + rs).reduce((a, y) => a + rowH(y), 0);
        let inner = '';
        if (txt !== '') {
          const hal =
            xf.h === 'general'
              ? typeof v === 'number'
                ? 'right'
                : typeof v === 'boolean'
                  ? 'center'
                  : 'left'
              : xf.h === 'centerContinuous' || xf.h === 'distributed'
                ? 'center'
                : xf.h === 'justify' || xf.h === 'fill'
                  ? 'left'
                  : xf.h;
          const val =
            xf.v === 'center' || xf.v === 'distributed' || xf.v === 'justify'
              ? 'center'
              : xf.v === 'top'
                ? 'flex-start'
                : 'flex-end';
          // text without wrapping continues into the empty neighbour cells (as in Excel), otherwise it is cut
          const nextEmpty = (dc: number) => {
            const y = cp[colIx.get(c)! + (dc > 0 ? cs : -1)];
            if (y == null || mergeAt.get(key(r, y))) return false;
            const w = shown(r, y);
            return w == null || w === '';
          };
          const spill =
            !xf.wrap &&
            !m &&
            typeof v !== 'number' &&
            (hal === 'left' ? nextEmpty(1) : hal === 'right' ? nextEmpty(-1) : nextEmpty(1) && nextEmpty(-1));
          const just = hal === 'left' ? 'flex-start' : hal === 'right' ? 'flex-end' : 'center';
          const pad = xf.indent ? `padding-${hal === 'right' ? 'right' : 'left'}:${xf.indent * 9 + 2}px;` : '';
          const rot =
            xf.rot === 90 || xf.rot === 180 || xf.rot === 255
              ? 'writing-mode:vertical-rl;' + (xf.rot === 90 ? 'transform:rotate(180deg);' : '')
              : '';
          // fixed part: at its own size, and whatever does not fit the (now smaller) cell shows beside it
          const fx = g.fixC?.has(key(ar, ac)) && Math.abs(fk - 1) > 0.005;
          inner = `<div class="x${xf.wrap ? ' w' : ''}${spill || fx ? ' o' : ''}" style="height:${Math.max(1, h - 1).toFixed(2)}px;justify-content:${just};align-items:${val};${pad}${xf.wrap ? 'text-align:' + hal + ';' : ''}${rot}"><span${fx ? ` style="font-size:${fk.toFixed(3)}em"` : ''}>${rich ? richHtml(rich) : esc(txt)}</span></div>`;
        }
        tr += `<td class="s${s}"${opt.refs ? ` data-a="${colName(ac)}${ar}"` : ''}${cs > 1 ? ` colspan="${cs}"` : ''}${rs > 1 ? ` rowspan="${rs}"` : ''}${style ? ` style="${style}"` : ''}>${inner}</td>`;
      }
      body += `<tr${fit ? ` data-r="${r}"${rep.has(r) ? ' data-t="1"' : ''}` : ''} style="height:${rowH(r).toFixed(2)}px">${tr}</tr>`;
    }
    const cg = '<colgroup>' + cp.map((c) => `<col style="width:${colW(c).toFixed(2)}px">`).join('') + '</colgroup>';
    const left = M.l + (P.centerH ? Math.max(0, (availW - tw * scale) / 2) : 0),
      top = M.t + (P.centerV ? Math.max(0, (availH - th * scale) / 2) : 0);
    const no = pageAt + pi + 1;
    const ctx = { page: fit ? no : g.firstNo + pi, pages: fit ? pageTotal : P.order.length, sheet: sh.name, file };
    // print window: the file numbering follows "Σελίδα 1 από 2" (shown only if it is on and pages > 1)
    const hf = (src: string | undefined, isHead: boolean) => {
      const p = headerFooter(src ? unesc(src) : null, ctx, fit && !(P.pno && pageTotal > 1));
      return p
        ? `<div class="hf" style="${isHead ? 'top' : 'bottom'}:${(isHead ? M.h : M.f).toFixed(1)}px;left:${M.l.toFixed(1)}px;right:${M.r.toFixed(1)}px"><span>${esc(p[0])}</span><span>${esc(p[1])}</span><span>${esc(p[2])}</span></div>`
        : '';
    };
    const pno =
      P.pno && pageTotal > 1 && !g.oddF
        ? `<div class="pno" style="bottom:${Math.max(3, M.b / 2 - 7).toFixed(1)}px">Σελίδα ${no} από ${pageTotal}</div>`
        : '';
    const data = fit
      ? ` data-n="${no}" data-sheet="${esc(sh.name)}" data-first="${rp[0] ?? 0}" data-land="${P.landscape ? 1 : 0}" data-paper="${P.paper.name}"`
      : '';
    return `<div class="pg"${data} style="width:${pw.toFixed(2)}px;height:${ph.toFixed(2)}px">${hf(g.oddH, true)}<div class="ar" style="left:${left.toFixed(2)}px;top:${top.toFixed(2)}px;transform:scale(${scale})"><table class="${g.grid ? 'grid' : ''}" style="width:${tw.toFixed(2)}px">${cg}<tbody>${body}</tbody></table></div>${hf(g.oddF, false)}${pno}</div>`;
  });
  return {
    name: sh.name,
    paper: P.paper.name,
    landscape: P.landscape,
    pages: P.order.length,
    scale,
    html: pages.join(''),
    pt: Math.round(P.pt * 2) / 2,
    font: g.dom.name,
    size: g.dom.sz,
    titles: !!g.titles,
  };
}

/** Hidden rows between two visible ones (so the merge from above can continue over them). */
const countHidden = (a: number, b: number, rowH: (r: number) => number) => {
  let n = 0;
  for (let r = a + 1; r < b; r++) if (rowH(r) === 0) n++;
  return n;
};
