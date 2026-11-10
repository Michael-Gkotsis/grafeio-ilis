// The pages on the left: captions, «sheets» of two in front-and-back, zoom to the width, and the break click.
//
// Purpose: `render` (settings column + page boxes + zoom), `zoom`, and `wirePages` (resize, click on a row).
// Does NOT: lay pages out (the app does) or print (printing.ts).
// Owner layer: main (architecture), `shared/print/previewWindow` (browser side of the print window).
// Why: pages are shown with a caption; with front-and-back they are grouped two by two into a «φύλλο». The zoom is a
//   screen-only fit to the width: on paper the pages print at their real size.
// Covering test: test/print-window-gen.test.ts; the DOM is compared step by step in the Electron run of the PR.
import { panel } from './panel';
import { request } from './request';
import { hasBreaks, pages, pagesEl, range, st, view } from './state';

/** Wraps every page in a `.pbox` with its caption «Σελίδα 1 από 2». */
function captionPages(list: HTMLElement[], back: boolean): void {
  for (const [i, page] of list.entries()) {
    const box = document.createElement('div');
    box.className = 'pbox';
    page.parentNode?.insertBefore(box, page);
    box.appendChild(page);
    const cap = document.createElement('small');
    cap.textContent = 'Σελίδα ' + (i + 1) + ' από ' + list.length + (back ? ' · ' + (i % 2 ? 'πίσω' : 'μπρος') : '');
    box.appendChild(cap);
  }
}

/** One dashed «φύλλο» with the front box and, when there is one, the back box. */
function sheetOfBoxes(n: number, front: Node, rear: Node | undefined): HTMLElement {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  const title = document.createElement('b');
  title.textContent = 'Φύλλο ' + (n + 1) + (rear ? ' · μπρος και πίσω' : ' · μόνο μπρος');
  sheet.appendChild(title);
  const pair = document.createElement('div');
  pair.className = 'pair';
  pair.appendChild(front);
  if (rear) pair.appendChild(rear);
  sheet.appendChild(pair);
  return sheet;
}

let resizeTimer = 0;

/** Fits the pages to the width of the preview (screen only). Side by side in front-and-back if half size is enough. */
function zoom(): void {
  const list = pages();
  if (!list.length) return;
  const back = st.opts.side === 'back' && list.length > 1;
  const room = view.clientWidth - 48;
  const w = list.reduce((widest, p) => Math.max(widest, parseFloat(p.style.width) || 0), 0);
  const side = back && room / (w * 2 + 48) >= 0.5;
  for (const pair of pagesEl.querySelectorAll('.pair')) pair.classList.toggle('stack', !side);
  // `zoom` is a Chromium property that the DOM typings do not list
  pagesEl.style.setProperty('zoom', String(Math.min(1, Math.max(0.2, room / ((side ? w * 2 + 24 : w) + 24)))));
}

/** Draws the settings column, then the captions (and the front-and-back sheets), then the zoom. */
export function render(): void {
  panel();
  const list = pages();
  const back = st.opts.side === 'back' && list.length > 1;
  captionPages(list, back);
  if (back) {
    const boxes = list.map((p) => p.parentNode as Node);
    const wrap = document.createDocumentFragment();
    for (const n of range(Math.ceil(boxes.length / 2)))
      wrap.appendChild(sheetOfBoxes(n, boxes[n * 2], boxes[n * 2 + 1]));
    pagesEl.innerHTML = '';
    pagesEl.appendChild(wrap);
  }
  zoom();
}

/** The Excel rows of the pages of `sheet` in the order they print (with a sort it is not the Excel order). */
const printedRows = (ofSheet: HTMLElement[]): number[] =>
  ofSheet.flatMap((p) =>
    [...p.querySelectorAll('tr[data-r]:not([data-t])')].map((t) => +(t.getAttribute('data-r') as string)),
  );

/** The page starts of every sheet as they are now, so the first click can move one of them. */
const currentBreaks = (): Record<string, number[]> =>
  Object.fromEntries(
    st.info.sheets.map((s) => [
      s.name,
      pages()
        .filter((p) => p.getAttribute('data-sheet') === s.name)
        .slice(1)
        .map((p) => +(p.getAttribute('data-first') as string)),
    ]),
  );

/** Click on a row: the page starts there, or (first row of a page) joins the previous one. */
function rowClick(e: MouseEvent): void {
  const target = e.target as Element;
  const row = target.closest?.('tr[data-r]') ?? null;
  const page = row?.closest('.pg');
  if (!row || !page) return;
  const r = +(row.getAttribute('data-r') as string);
  const sheet = page.getAttribute('data-sheet') as string;
  const ofSheet = pages().filter((p) => p.getAttribute('data-sheet') === sheet);
  // a repeated title row, or the first row of the sheet: nothing to break
  if (row.hasAttribute('data-t') || r <= +(ofSheet[0].getAttribute('data-first') as string)) return;
  const order = printedRows(ofSheet);
  const pos = (x: number) => order.indexOf(x);
  const had = hasBreaks();
  if (!had) st.opts.breaks = currentBreaks();
  const breaks = st.opts.breaks as Record<string, number[]>;
  const starts = (breaks[sheet] || []).slice();
  const at = starts.indexOf(r);
  if (at >= 0)
    starts.splice(at, 1); // first row of a page: joins the previous page
  else if (!had && st.opts.pages !== 'auto' && starts.length) {
    // 2 or 3 pages: the nearest break moves here
    const best = starts.reduce((b, s, i) => (Math.abs(pos(s) - pos(r)) < Math.abs(pos(starts[b]) - pos(r)) ? i : b), 0);
    starts[best] = r;
  } else starts.push(r);
  breaks[sheet] = starts.filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => pos(a) - pos(b));
  request(false);
}

/** Registers the resize (debounced 80 ms) and the click on a row. */
export function wirePages(): void {
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(zoom, 80);
  });
  view.addEventListener('click', rowClick);
}
