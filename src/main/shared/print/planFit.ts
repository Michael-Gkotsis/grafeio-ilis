// The page plan of the "Εκτύπωση" window (`planDoc`, with the private `planFit`).
//
// Purpose: `planDoc` plans all sheets: orientation, common scale and pages; `planFit` finds the biggest scale at which
//   the rows fit the chosen pages.
// Does NOT: read the Excel (sheetGeo.ts) or draw (draw.ts).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: the scale search (`count`, `split`, the bisections) is a measured hot path and moves verbatim, with its comments
//   (Phase 4.8a).
// Covering test: test/print-layout.test.ts, test/print-fixed-parts.test.ts and test/perf.test.ts.
import { fixK, sumsOf } from './geometry';
import { MARGIN, type PrintOpts } from './options';
import { PAPER } from './pagesetup';
import { geomOf, type Plan } from './plan';
import type { Geo } from './types';

/** The two papers of the window. */
const PAPERS = { A4: PAPER[9], A3: PAPER[8] };

/**
 * Plans one sheet for the window: the biggest scale at which the rows fit in the chosen number of pages (or the chosen
 * letter size). `sFix` caps the scale (a common scale for all sheets).
 */
function planFit(g: Geo, o: PrintOpts, landscape: boolean, sFix?: number): Plan {
  const paper = PAPERS[o.paper];
  const { pw, ph } = geomOf(paper, landscape);
  const m = (MARGIN[o.m] / 2.54) * 96;
  // header/footer of the file: room in the margin
  const M = { l: m, r: m, t: g.oddH ? Math.max(m, 38) : m, b: g.oddF ? Math.max(m, 38) : m, h: 12, f: 12 };
  const availW = Math.max(50, pw - M.l - M.r),
    availH = Math.max(50, ph - M.t - M.b);
  const maxScale = Math.min(availW / Math.max(1, g.W), 2, 16 / g.dom.sz);
  const repeat = o.repeat && !!g.titles;
  const tH = (first: number) => (repeat && g.titles && first > g.titles[1] ? g.titleH : 0);
  // height of rows at scale s (the fixed parts always take the same room on paper)
  const hOf = (rows: number[], s: number) => {
    const [a, f] = sumsOf(g, rows);
    return f ? a + f * fixK(s) : a;
  };
  const blocks = o.keep ? g.units : g.units.flat().map((u) => [u]);
  // fills pages in order; limit = the largest height per page (for an even split)
  const split = (s: number, limit: number): number[][] => {
    const cap = availH / s;
    const pages: number[][] = [];
    let cur: number[] = [];
    let h = 0;
    const room = (first: number) => Math.min(limit, cap - tH(first));
    const put = (u: number[]) => {
      const uh = hOf(u, s);
      if (cur.length && h + uh > room(cur[0]) + 0.5) {
        pages.push(cur);
        cur = [];
        h = 0;
      }
      cur.push(...u);
      h += uh;
    };
    for (const b of blocks) {
      const bh = b.reduce((a, u) => a + hOf(u, s), 0);
      if (cur.length && h + bh > room(cur[0]) + 0.5 && bh <= room(b[0][0]) + 0.5) {
        pages.push(cur);
        cur = [];
        h = 0;
      }
      b.forEach(put);
    }
    if (cur.length || !pages.length) pages.push(cur);
    return pages;
  };
  // how many pages split gives, without building the pages (the scale search calls it dozens of times); the same
  // calculations in the same order, so always the same result as split(s, limit).length
  const flat = blocks.map((b) => ({ first: b[0][0], us: b.map((u) => ({ first: u[0], ab: sumsOf(g, u) })) }));
  const count = (s: number, limit: number): number => {
    const cap = availH / s;
    const k = fixK(s);
    let n = 0,
      has = false,
      first = 0,
      h = 0;
    const room = (r: number) => Math.min(limit, cap - tH(r));
    for (const b of flat) {
      let bh = 0;
      for (const u of b.us) bh += u.ab[1] ? u.ab[0] + u.ab[1] * k : u.ab[0];
      if (has && h + bh > room(first) + 0.5 && bh <= room(b.first) + 0.5) {
        n++;
        has = false;
        h = 0;
      }
      for (const u of b.us) {
        const uh = u.ab[1] ? u.ab[0] + u.ab[1] * k : u.ab[0];
        if (has && h + uh > room(first) + 0.5) {
          n++;
          has = false;
          h = 0;
        }
        if (!has) {
          has = true;
          first = u.first;
        }
        h += uh;
      }
    }
    return has || !n ? n + 1 : n;
  };
  const fitsAll = (s: number, pages: number[][]) => pages.every((p) => tH(p[0] ?? 0) + hOf(p, s) <= availH / s + 0.5);
  let s: number;
  let pages: number[][];
  const br = (o.breaks?.[g.sh.name] || []).filter((r) => r > g.rowsAll[0] && g.rowsAll.includes(r));
  if (br.length) {
    pages = [];
    let cur: number[] = [];
    for (const r of g.rowsAll) {
      if (cur.length && br.includes(r)) {
        pages.push(cur);
        cur = [];
      }
      cur.push(r);
    }
    pages.push(cur);
    // the biggest scale at which each page fits (with fixed parts height is not proportional to scale: a search)
    const fitOne = (p: number[]) => {
      if (!g.fixR?.size) return availH / Math.max(1, tH(p[0]) + hOf(p, 1));
      let lo = 0.02,
        hi = maxScale;
      if (hi * (tH(p[0]) + hOf(p, hi)) <= availH) return hi;
      for (let i = 0; i < 26; i++) {
        const mid = (lo + hi) / 2;
        if (mid * (tH(p[0]) + hOf(p, mid)) <= availH) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    s = Math.min(maxScale, ...pages.map(fitOne));
    if (sFix) s = Math.min(s, sFix);
  } else if (o.pages === 'auto') {
    s = Math.min(maxScale, o.size / g.dom.sz);
    if (sFix) s = Math.min(s, sFix);
    pages = split(s, Infinity);
  } else {
    const N = o.pages;
    if (sFix) s = Math.min(sFix, maxScale);
    else if (count(maxScale, Infinity) <= N) s = maxScale;
    else {
      let lo = 0.02,
        hi = maxScale;
      for (let i = 0; i < 26; i++) {
        const mid = (lo + hi) / 2;
        if (count(mid, Infinity) <= N) lo = mid;
        else hi = mid;
      }
      s = lo;
    }
    s = Math.max(0.02, Math.floor(s * 1000) / 1000);
    // even split: the smallest limit per page that keeps the same pages
    const need = count(s, Infinity);
    const total = hOf(g.rowsAll, s);
    let a = total / Math.max(1, need),
      b = availH / s;
    for (let i = 0; i < 22; i++) {
      const L = (a + b) / 2;
      if (count(s, L) <= need) b = L;
      else a = L;
    }
    pages = split(s, b + 0.5);
    if (pages.length > need || !fitsAll(s, pages)) pages = split(s, Infinity);
  }
  s = Math.max(0.02, Math.floor(s * 1000) / 1000);
  // few columns: they widen so that the table takes the width (the letters stay the same)
  const cs = o.stretch && g.W * s < availW - 1 ? availW / (g.W * s) : 1;
  // space left: the table rows grow taller (same height on all pages; the last, half empty, does not count)
  let f = 1;
  if (o.sp === 'fill') {
    f = 1.9;
    pages.forEach((p, i) => {
      if (pages.length > 1 && i === pages.length - 1) return;
      const grow = p.filter((r) => g.framed.has(r));
      const gh = hOf(grow, s);
      if (!gh) return;
      f = Math.min(f, (availH / s - tH(p[0]) - (hOf(p, s) - gh)) / gh);
    });
    f = Math.max(1, Math.floor(f * 100) / 100);
  }
  return {
    paper,
    landscape,
    pw,
    ph,
    M,
    availW,
    availH,
    scale: s,
    maxScale,
    pt: g.dom.sz * s,
    cs,
    f,
    centerH: true,
    centerV: o.sp === 'center',
    pno: o.pno,
    repeat,
    order: pages.map((p) => [p, g.colsAll]),
  };
}

/**
 * All sheets: orientation (automatic: the one that gives bigger letters; with front and back the same for all) and a
 * common scale.
 */
export function planDoc(geos: Geo[], o: PrintOpts): Plan[] {
  if (!geos.length) return [];
  const better = (a: Plan[], b: Plan[]) => {
    // true if b is better: bigger letters, and with the same letters fewer pages
    const sa = Math.min(...a.map((p) => p.scale)),
      sb = Math.min(...b.map((p) => p.scale));
    if (Math.abs(sa - sb) > 0.005) return sb > sa;
    return b.reduce((x, p) => x + p.order.length, 0) < a.reduce((x, p) => x + p.order.length, 0);
  };
  let lands: boolean[];
  if (o.or !== 'auto') lands = geos.map(() => o.or === 'l');
  else if (o.side === 'back' || o.same) {
    const P = geos.map((g) => planFit(g, o, false)),
      L = geos.map((g) => planFit(g, o, true));
    const same = (ps: Plan[]) =>
      o.same && ps.length > 1
        ? geos.map((g, i) => planFit(g, o, ps[i].landscape, Math.min(...ps.map((p) => p.scale))))
        : ps;
    lands = geos.map(() => better(same(P), same(L)));
  } else lands = geos.map((g) => better([planFit(g, o, false)], [planFit(g, o, true)]));
  let plans = geos.map((g, i) => planFit(g, o, lands[i]));
  if (o.same && plans.length > 1) {
    const s = Math.min(...plans.map((p) => p.scale));
    plans = geos.map((g, i) => planFit(g, o, lands[i], s));
  }
  return plans;
}
