// The entry points of the print engine: Excel file in, print pages out.
//
// Purpose: `renderBook`, `openBook`, `bookSheets`, `sheetFontSize` and `renderOpen` (picks the sheets, sorts, plans and
//   draws).
// Does NOT: plan or draw by itself (plan.ts, planFit.ts and draw.ts do).
// Owner layer: main (architecture), `shared/print`. Pure string and number work on OOXML text; no Electron, no fs.
// Why: this is the face the app uses: the print window, the form previews and the reports call these (Phase 4.8a,
//   verbatim).
// Covering test: test/print.test.ts, test/print-layout.test.ts and the golden hashes of `npm run bench:golden`.
import { Book } from './book';
import { fontCss } from './css';
import { drawSheet } from './draw';
import { hasBreaks, PRINT_DEFAULT, type RenderOpts } from './options';
import type { PrintDoc, PrintSheet } from './pagesetup';
import { planFile, type Plan } from './plan';
import { planDoc } from './planFit';
import { geoOf } from './sheetGeo';
import { sortedGeo } from './sort';
import type { Geo, SortCol } from './types';

/**
 * Opens an Excel file and renders it into print pages.
 * @see test/print.test.ts
 */
export async function renderBook(buf: Buffer | Uint8Array, opts: RenderOpts): Promise<PrintDoc> {
  return renderOpen(await Book.open(buf), opts);
}

/** Opens an Excel file once, so that several renders (layouts) can reuse it. */
export async function openBook(buf: Buffer | Uint8Array): Promise<Book> {
  return Book.open(buf);
}

/** Names of the visible sheets, in book order. */
export const bookSheets = (book: Book) => book.sheets.filter((x) => !x.hidden).map((x) => x.name);

/**
 * The font size of the sheet in Excel (its most common font). With it in "Όσες χρειάζονται" the letters come out on
 * paper as big as in Excel (a form with "Σταθερό μέγεθος γραμμάτων").
 */
export async function sheetFontSize(book: Book, name: string): Promise<number> {
  const i = book.sheets.findIndex((x) => x.name === name);
  if (i < 0) return PRINT_DEFAULT.size;
  return (await geoOf(book, name, i)).dom.sz;
}

/**
 * Renders an opened book into pages: picks the sheets, plans the paper and scale, and draws every sheet.
 * @see test/print-layout.test.ts
 */
export async function renderOpen(book: Book, opts: RenderOpts): Promise<PrintDoc> {
  const visible = book.sheets.filter((x) => !x.hidden);
  const all = visible.map((x) => x.name);
  let want = opts.sheets?.filter((n) => all.includes(n)) || [];
  // no choice (or a sheet that does not exist any more): all sheets if they are few (forms), else the active sheet of
  // the book. An empty list = the user unchecked all sheets.
  if (!want.length && !(opts.sheets && !opts.sheets.length))
    want =
      all.length <= 4
        ? all
        : [
            book.sheets[book.activeTab] && !book.sheets[book.activeTab].hidden
              ? book.sheets[book.activeTab].name
              : all[0],
          ];
  const geos: Geo[] = [];
  const cols: SortCol[] = [];
  for (const name of want) {
    const g = await geoOf(
      book,
      name,
      book.sheets.findIndex((x) => x.name === name),
    );
    for (const t of g.tables)
      for (const c of t.cols) if (!cols.some((x) => x.k === c.k)) cols.push({ k: c.k, label: c.label, kind: c.kind });
    geos.push(opts.layout?.sort?.length ? sortedGeo(book, g, opts.layout.sort) : g);
  }
  const used = new Set<number>();
  let plans: Plan[];
  let sug: { n: number; pt: number } | undefined;
  if (opts.layout) {
    const o = opts.layout;
    plans = planDoc(geos, o);
    // small letters: in how many pages it reads clearly (10 pt)
    const pt = Math.min(...plans.map((p) => p.pt));
    if (plans.length && pt < 9.75 && typeof o.pages === 'number' && !hasBreaks(o)) {
      // the first that reaches 10 pt, else the one with the biggest letters (if it wins at least 1 pt)
      let best: { n: number; pt: number } | undefined;
      for (let n = o.pages + 1; n <= 8; n++) {
        const tp = Math.min(...planDoc(geos, { ...o, pages: n }).map((p) => p.pt));
        if (tp >= 9.75) {
          best = { n, pt: tp };
          break;
        }
        if (!best || tp > best.pt + 0.25) best = { n, pt: tp };
      }
      if (best && best.pt >= pt + 1) sug = { n: best.n, pt: Math.round(best.pt * 2) / 2 };
    }
  } else plans = geos.map((g) => planFile(g));
  const total = plans.reduce((a, p) => a + p.order.length, 0);
  let at = 0;
  const sheets: PrintSheet[] = geos.map((g, i) => {
    const p = plans[i];
    const s = drawSheet(book, g, p, opts.file, used, opts, at, total);
    at += p.order.length;
    return s;
  });
  const css = [...used]
    .map((i) => {
      const x = book.styles.xfs[i] || book.styles.xfs[0];
      return `.s${i}{${fontCss(book.styles.fonts[x.font] || book.styles.fonts[0])}${x.fill ? 'background:' + x.fill + ';' : ''}}`;
    })
    .join('\n');
  return { sheets, all, css, total, sug, cols };
}
