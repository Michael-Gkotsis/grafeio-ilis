// Measures a sheet for printing: `geoOf`.
//
// Purpose: `geoOf` builds the `Geo` of one sheet (print area, visible rows and columns, title rows, blocks, tables,
//   fixed parts) and caches it per book in `geoCache`.
// Does NOT: plan pages or draw them.
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: every plan, sort and draw works from the same `Geo`; the cache keeps one per sheet for as long as the book is
//   open (Phase 4.8a, verbatim).
// Covering test: test/print.test.ts, test/print-sort.test.ts and test/print-fixed-parts.test.ts.
import { FIXED_MARK, NOHEAD_MARK } from '../excel/xlsx';
import type { Book } from './book';
import { XErr } from './formula';
import { areaOf, areasOf, definedName, titleRows } from './pagesetup';
import { ptPx } from './sheet';
import { normHead } from './sortKey';
import { tablesOf } from './tables';
import type { Geo } from './types';
import { attr, key, num } from './xml';

/** Geometry cache per opened book and sheet name (one instance for the whole app). */
const geoCache = new WeakMap<Book, Map<string, Geo>>();

/**
 * Reads, measures and caches the geometry of sheet `name` (`idx` = its 0-based place) of a book: print area, visible
 * rows and columns, title rows, blocks, tables and fixed parts. The sheet and the sheets its formulas refer to are
 * loaded first.
 */
export async function geoOf(book: Book, name: string, idx: number): Promise<Geo> {
  let m = geoCache.get(book);
  if (!m) {
    m = new Map();
    geoCache.set(book, m);
  }
  const hit = m.get(name);
  if (hit) return hit;
  const sh = (await book.load(name))!;
  await book.loadRefs(sh);
  const x = sh.xml;
  const st = book.styles;
  const ps = /<pageSetup\b[^>]*>/.exec(x)?.[0] || '',
    pm = /<pageMargins\b[^>]*>/.exec(x)?.[0] || '',
    po = /<printOptions\b[^>]*>/.exec(x)?.[0] || '';
  // print area: the defined one, else whatever has a value, a border or a fill
  let area = areaOf(definedName(book.wbXml, '_xlnm.Print_Area', idx));
  if (!area) {
    let r2 = sh.maxR,
      c2 = sh.maxC;
    for (const [k, c] of sh.cells) {
      if (c.s == null) continue;
      const xf = st.xfs[c.s];
      if (!xf || (!xf.fill && !xf.border.l && !xf.border.r && !xf.border.t && !xf.border.b)) continue;
      const r = Math.floor(k / 16384),
        cc = k % 16384;
      if (r > r2) r2 = r;
      if (cc > c2) c2 = cc;
    }
    for (const mg of sh.merges) {
      if (mg.r2 > r2 && sh.cells.has(key(mg.r1, mg.c1))) r2 = mg.r2;
      if (mg.c2 > c2 && sh.cells.has(key(mg.r1, mg.c1))) c2 = mg.c2;
    }
    area = { r1: 1, c1: 1, r2: Math.max(1, r2), c2: Math.max(1, c2) };
  }
  const colInfo = (c: number) => sh.cols.find((k) => c >= k.min && c <= k.max);
  const colW = (c: number) => {
    const k = colInfo(c);
    return k?.hidden ? 0 : (k?.w ?? sh.defW);
  };
  const rowH = (r: number) => {
    const k = sh.rows.get(r);
    return k?.hidden ? 0 : ptPx(k?.ht ?? sh.defH);
  };
  const rowsAll: number[] = [],
    colsAll: number[] = [];
  for (let r = area.r1; r <= area.r2; r++) if (rowH(r) > 0) rowsAll.push(r);
  for (let c = area.c1; c <= area.c2; c++) if (colW(c) > 0) colsAll.push(c);
  const titles = titleRows(definedName(book.wbXml, '_xlnm.Print_Titles', idx));
  const titleList = titles
    ? Array.from({ length: titles[1] - titles[0] + 1 }, (_, i) => titles[0] + i).filter((r) => rowH(r) > 0)
    : [];
  const hdr = /<headerFooter\b[^>]*>([\s\S]*?)<\/headerFooter>/.exec(x)?.[1] || '';
  const oddH = /<oddHeader>([\s\S]*?)<\/oddHeader>/.exec(hdr)?.[1],
    oddF = /<oddFooter>([\s\S]*?)<\/oddFooter>/.exec(hdr)?.[1];

  // cells: value, border, font (for the units, the blocks and the "dominant" font size)
  const styleOf = (r: number, c: number) => {
    const k = sh.cells.get(key(r, c));
    if (k?.s != null) return k.s;
    const rw = sh.rows.get(r);
    if (rw?.s != null) return rw.s;
    return colInfo(c)?.s ?? 0;
  };
  const shown = (r: number, c: number) => {
    const k = sh.cells.get(key(r, c));
    if (!k) return '';
    const v = k.f ? book.value(sh.name, r, c) : k.v;
    return v == null ? '' : v instanceof XErr ? v.code : String(v);
  };
  const sizes = new Map<string, number>();
  const framed = new Set<number>();
  const blank = new Set<number>();
  const usedC = new Set<number>();
  const painted = (f: string | null) => !!f && !/^#?F{6}$/i.test(f); // white fill = empty
  for (const r of rowsAll) {
    let any = false;
    for (const c of colsAll) {
      const xf = st.xfs[styleOf(r, c)] || st.xfs[0];
      const v = shown(r, c);
      if (xf.border.l || xf.border.r || xf.border.t || xf.border.b) {
        framed.add(r);
        any = true;
        usedC.add(c);
      }
      if (painted(xf.fill)) {
        any = true;
        usedC.add(c);
      }
      if (v !== '') {
        any = true;
        usedC.add(c);
        const f = st.fonts[xf.font] || st.fonts[0];
        const k = f.name + '|' + f.sz;
        sizes.set(k, (sizes.get(k) || 0) + 1);
      }
    }
    if (!any) blank.add(r);
  }
  for (const mg of sh.merges)
    if ((mg.r1 !== mg.r2 || mg.c1 !== mg.c2) && shown(mg.r1, mg.c1) !== '') {
      for (let r = mg.r1; r <= mg.r2; r++) blank.delete(r);
      for (let c = mg.c1; c <= mg.c2; c++) usedC.add(c);
    }
  // empty rows and columns at the end (formulas that give "", a print area bigger than the table) are not printed,
  // otherwise the letters shrink to fit paper that stays blank
  while (rowsAll.length > 1 && blank.has(rowsAll[rowsAll.length - 1])) rowsAll.pop();
  while (colsAll.length > 1 && !usedC.has(colsAll[colsAll.length - 1])) colsAll.pop();
  const W = colsAll.reduce((a, c) => a + colW(c), 0);
  const top = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] || st.fonts[0].name + '|' + st.fonts[0].sz;
  const dom = { name: top.split('|')[0], sz: +top.split('|')[1] || 11 };

  // units: rows joined by a vertical merge are never split
  const unitsOf = (list: number[]) => {
    const at = new Map(list.map((r, i) => [r, i]));
    const link = new Array(list.length).fill(false);
    for (const mg of sh.merges)
      if (mg.r2 > mg.r1)
        for (let r = mg.r1; r < mg.r2; r++) {
          const i = at.get(r);
          if (i != null) link[i] = true;
        }
    const out: number[][] = [];
    list.forEach((r, i) => {
      if (i && link[i - 1]) out[out.length - 1].push(r);
      else out.push([r]);
    });
    return out;
  };
  // blocks: between empty rows (tables of the ΦΡΟΥΡΑ) or where the room/platoon changes (a column of the title row)
  const groupCol = titleList.length
    ? colsAll.find((c) => titleList.some((r) => /^(ΘΑΛΑΜΟΣ|ΘΑΛ|ΟΥΛΑΜΟΣ)$/.test(normHead(shown(r, c)))))
    : undefined;
  const after = titles ? titles[1] : 0;
  const regroup = (list: number[]) => {
    const units: number[][][] = [];
    let cur: number[][] = [];
    let prevG: string | null = null;
    let prevBlank = false;
    for (const u of unitsOf(list)) {
      const r = u[0];
      const isBlank = u.every((y) => blank.has(y));
      const g = groupCol != null && r > after ? shown(r, groupCol) : null;
      const brk = cur.length && ((prevBlank && !isBlank) || (g != null && prevG != null && g !== prevG));
      if (brk) {
        units.push(cur);
        cur = [];
      }
      cur.push(u);
      prevBlank = isBlank;
      if (g != null) prevG = g;
    }
    if (cur.length) units.push(cur);
    // signatures: the last block without borders stays together with the last 2 rows of the table above it
    if (units.length > 1) {
      const last = units[units.length - 1];
      const rows = last.flat();
      if (rows.length <= 12 && !rows.some((r) => framed.has(r))) {
        const prev = units[units.length - 2];
        let n = 0;
        const glue: number[][] = [];
        while (prev.length && n < 2) {
          const u = prev.pop()!;
          glue.unshift(u);
          if (!u.every((y) => blank.has(y))) n++;
        }
        if (!prev.length) units.splice(units.length - 2, 1);
        units[units.length - 1] = [[...glue.flat(), ...rows]];
      }
    }
    return units;
  };
  // Forms, tables without headings (NOHEAD_MARK): the hidden row stays in the table search (it still holds the
  // headings, so it sorts normally), and its emptied areas tell tablesOf that no heading exists there
  const noHead = new Set<number>();
  const hid: number[] = [];
  for (const a of areasOf(definedName(book.wbXml, NOHEAD_MARK, idx))) {
    if (rowH(a.r1) === 0) {
      if (!hid.includes(a.r1)) hid.push(a.r1);
      continue;
    }
    if (Array.from({ length: a.c2 - a.c1 + 1 }, (_, i) => a.c1 + i).every((c) => shown(a.r1, c) === ''))
      for (let c = a.c1; c <= a.c2; c++) noHead.add(key(a.r1, c));
  }
  const withHidden = hid.length ? [...rowsAll, ...hid].sort((a, b) => a - b) : rowsAll;
  const framedT = hid.length
    ? new Set([
        ...framed,
        ...hid.filter((r) =>
          colsAll.some((c) => {
            const xf = st.xfs[styleOf(r, c)] || st.xfs[0];
            return xf.border.l || xf.border.r || xf.border.t || xf.border.b;
          }),
        ),
      ])
    : framed;
  const g: Geo = {
    sh,
    idx,
    ps,
    pm,
    po,
    rowsAll,
    colsAll,
    rowH,
    colW,
    W,
    titles,
    titleList,
    titleH: titleList.reduce((a, r) => a + rowH(r), 0),
    oddH,
    oddF,
    firstNo: /useFirstPageNumber="(1|true)"/.test(ps) ? num(ps, 'firstPageNumber', 1) : 1,
    grid: attr(po, 'gridLines') === '1' || attr(po, 'gridLines') === 'true',
    dom,
    units: regroup(rowsAll),
    framed,
    tables: tablesOf(book, sh, unitsOf(withHidden), colsAll, framedT, noHead),
    regroup,
  };
  const fixed = areasOf(definedName(book.wbXml, FIXED_MARK, idx));
  if (fixed.length) {
    const fixC = new Set<number>(),
      near = new Set<number>();
    for (const a of fixed)
      for (let r = a.r1; r <= a.r2; r++) {
        near.add(r);
        for (let c = a.c1; c <= a.c2; c++) fixC.add(key(r, c));
      }
    // a row with only fixed parts (and blanks): no border and nothing else written
    const fixR = new Set(
      [...near].filter(
        (r) => rowH(r) > 0 && !framed.has(r) && colsAll.every((c) => fixC.has(key(r, c)) || shown(r, c) === ''),
      ),
    );
    g.fixC = fixC;
    g.fixR = fixR;
  }
  m.set(name, g);
  return g;
}
