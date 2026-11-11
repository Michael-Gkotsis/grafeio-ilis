// The draggable boxes drawn over the page preview of «Θέσεις στο χαρτί».
// Purpose: `drawBlocks` puts one box per movable block (header, place/date, each signature) over the cells of the preview
// that lives in a shadow DOM; a box moves by drag (snapped to cells) or by the arrow keys.
// Does NOT: own the layout (it reports a move through `moveRef`) or fetch the preview.
// Owner layer: renderer/features/layout-edit. Why: moved verbatim from renderer/layout.ts (Phase 5.3b); plain DOM code,
// so it is plain functions and not a component.
// Covering test: test/layout.test.ts, test/layout-fit.test.ts.
import { blockLabel } from '../../../../shared/layout';
import type { LayoutPv } from '../../../../shared/api';
import type { Sig } from '../../../../shared/sigs';

/** The shadow-DOM stylesheet of the boxes. Colours stay as they were (this is not an app theme). */
export const LAY_CSS = `.wrap{transform-origin:0 0;width:max-content;margin:0 auto}.lay{position:absolute;inset:0;pointer-events:none}
.blk{position:absolute;pointer-events:auto;cursor:grab;border:2px dashed #2f6fd6;background:rgba(47,111,214,.10);border-radius:3px;touch-action:none;outline:none}
.blk:hover,.blk:focus-visible,.blk.on{background:rgba(47,111,214,.2);border-style:solid}.blk.drag{cursor:grabbing;border-color:#d97a00;background:rgba(217,122,0,.18)}
.blk span{display:none;position:absolute;left:-2px;top:-17px;z-index:1;font:600 11px/15px Arial,sans-serif;background:#2f6fd6;color:#fff;padding:0 5px;border-radius:3px 3px 0 0;white-space:nowrap}
.blk.drag span{background:#d97a00}.blk:hover span,.blk:focus-visible span,.blk.on span,.blk.drag span{display:block}`;

/** «B12» to `{ c: 2, r: 12 }` (column letters to a 1-based number), or null when it is not a cell address. */
const cellOf = (a: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(a);
  if (!m) return null;
  return { c: m[1].split('').reduce((x, ch) => x * 26 + ch.charCodeAt(0) - 64, 0), r: +m[2] };
};
type Rect = { r1: number; c1: number; r2: number; c2: number };
type Box = { left: number; top: number; width: number; height: number };

/** One sheet of the preview. */
export type PvSheet = LayoutPv['sheets'][number];

/** What the boxes need from the dialog: which box is selected and how to report a move (delta rows, delta columns). */
export interface DrawCtx {
  sel: { current: string };
  moveRef: { current: (id: string, dr: number, dc: number) => void };
}

/** Where cells are on screen: the rectangle of a cell range, a box placed on the page, and the cell under a point. */
function geometry(r: ShadowRoot, el: HTMLElement) {
  const tds = [...r.querySelectorAll('td[data-a]')]
    .map((td) => ({ td, at: cellOf(td.getAttribute('data-a') || '') }))
    .filter((x) => x.at) as { td: Element; at: { r: number; c: number } }[];
  const hb = el.getBoundingClientRect();
  const rectOf = (b: Rect) => {
    let L = Infinity,
      T = Infinity,
      R = -Infinity,
      B = -Infinity;
    for (const x of tds)
      if (x.at.r >= b.r1 && x.at.r <= b.r2 && x.at.c >= b.c1 && x.at.c <= b.c2) {
        const q = x.td.getBoundingClientRect();
        L = Math.min(L, q.left);
        T = Math.min(T, q.top);
        R = Math.max(R, q.right);
        B = Math.max(B, q.bottom);
      }
    return L < R ? { left: L - hb.left, top: T - hb.top, width: R - L, height: B - T } : null;
  };
  const place = (d: HTMLElement, q: Box) => {
    d.style.left = q.left + 'px';
    d.style.top = q.top + 'px';
    d.style.width = Math.max(14, q.width) + 'px';
    d.style.height = Math.max(10, q.height) + 'px';
  };
  const at = (x: number, y: number) => {
    const td = r.elementsFromPoint(x, y).find((e) => e.matches?.('td[data-a]'));
    return td ? cellOf(td.getAttribute('data-a') || '') : null;
  };
  return { rectOf, place, at };
}
type Geo = ReturnType<typeof geometry>;
type PvBlock = PvSheet['blocks'][number];

/** Dragging one box: it follows the pointer cell by cell, and the move is reported when the pointer is released. */
function dragBox(e: PointerEvent, d: HTMLElement, b: PvBlock, g: Geo, ctx: DrawCtx) {
  if (e.button !== 0) return;
  e.preventDefault();
  d.focus();
  d.setPointerCapture(e.pointerId);
  d.classList.add('drag');
  const hit = g.at(e.clientX, e.clientY);
  const grab = hit ? { r: hit.r - b.r1, c: hit.c - b.c1 } : { r: 0, c: 0 };
  let cand = { r1: b.r1, c1: b.c1 };
  const mv = (ev: PointerEvent) => {
    const c = g.at(ev.clientX, ev.clientY);
    if (!c) return;
    const n = { r1: Math.max(1, c.r - grab.r), c1: Math.max(1, c.c - grab.c) };
    const q2 = g.rectOf({ ...n, r2: n.r1 + b.r2 - b.r1, c2: n.c1 + b.c2 - b.c1 });
    if (!q2) return;
    cand = n;
    g.place(d, q2);
  };
  const up = () => {
    d.removeEventListener('pointermove', mv);
    d.removeEventListener('pointerup', up);
    d.removeEventListener('pointercancel', up);
    ctx.moveRef.current(b.id, cand.r1 - b.r1, cand.c1 - b.c1);
  };
  d.addEventListener('pointermove', mv);
  d.addEventListener('pointerup', up);
  d.addEventListener('pointercancel', up);
}

/** One box over its cells, with its label, focus, arrow keys and drag. */
function addBox(lay: HTMLElement, b: PvBlock, q: Box, g: Geo, sigs: Sig[] | undefined, ctx: DrawCtx) {
  const { sel, moveRef } = ctx;
  const d = document.createElement('div');
  d.className = 'blk' + (b.id === sel.current ? ' on' : '');
  d.tabIndex = 0;
  d.setAttribute('role', 'button');
  d.setAttribute('aria-label', blockLabel(b.id, sigs) + ': σύρε το ή μετακίνησέ το με τα βελάκια');
  const lbl = document.createElement('span');
  lbl.textContent = blockLabel(b.id, sigs);
  d.appendChild(lbl);
  g.place(d, q);
  lay.appendChild(d);
  d.addEventListener('focus', () => {
    sel.current = b.id;
    for (const x of lay.querySelectorAll('.blk')) x.classList.toggle('on', x === d);
  });
  d.addEventListener('keydown', (e) => {
    const k2 = (
      { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, number[]>
    )[e.key];
    if (k2) {
      e.preventDefault();
      e.stopPropagation();
      moveRef.current(b.id, k2[0], k2[1]);
    }
  });
  d.addEventListener('pointerdown', (e) => dragBox(e, d, b, g, ctx));
}

/**
 * Τα κουτάκια πάνω στη σελίδα (μέσα στο shadow DOM, όπως η προεπισκόπηση των Εντύπων).
 * Scales the page to the host width, replaces the previous `.lay` layer and puts the focus back on the selected box.
 */
export function drawBlocks(
  r: ShadowRoot | null,
  el: HTMLDivElement | null,
  sheet: PvSheet | undefined,
  sigs: Sig[] | undefined,
  ctx: DrawCtx,
) {
  if (!r || !el || !sheet) return;
  const wrap = r.querySelector('.wrap') as HTMLElement | null;
  if (!wrap) return;
  const k = Math.min(1, (el.clientWidth - 8) / Math.max(1, wrap.scrollWidth));
  wrap.style.transform = 'scale(' + k + ')';
  el.style.height = Math.ceil(wrap.scrollHeight * k) + 'px';
  r.querySelector('.lay')?.remove();
  const lay = document.createElement('div');
  lay.className = 'lay';
  r.appendChild(lay);
  const g = geometry(r, el);
  for (const b of sheet.blocks) {
    const q = g.rectOf(b);
    if (!q) continue;
    addBox(lay, b, q, g, sigs, ctx);
  }
  if (ctx.sel.current) (lay.querySelector('.blk.on') as HTMLElement | null)?.focus({ preventScroll: true });
}
