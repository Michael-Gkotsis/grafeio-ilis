// Θέσεις πάνω στο χαρτί (Michael, 20/10): το έντυπο όπως θα βγει, και πάνω του η κεφαλίδα, ο τόπος/ημερομηνία και κάθε
// υπογραφή σαν κουτάκι που το σέρνεις όπου θέλεις (κουμπώνει στα κελιά). Με το πληκτρολόγιο: Tab στο κουτάκι και βελάκια.
// Μετά από κάθε μετακίνηση η σελίδα ξαναφτιάχνεται όπως θα τυπωθεί.
import { useCallback, useEffect, useRef, useState } from 'react';
import { html, cx, Alert, Button, Dialog, Segmented } from './ui';
import { PAGE_CSS } from './pageCss';
import { LAYOUT_SHEETS, blockLabel, cleanLayout, moved, type Layout, type LayoutForm, type Move } from '../shared/layout';
import type { LayoutPv, LayoutReq } from '../shared/api';
import type { Sig } from '../shared/sigs';

const LAY_CSS = `.wrap{transform-origin:0 0;width:max-content;margin:0 auto}.lay{position:absolute;inset:0;pointer-events:none}
.blk{position:absolute;pointer-events:auto;cursor:grab;border:2px dashed #2f6fd6;background:rgba(47,111,214,.10);border-radius:3px;touch-action:none;outline:none}
.blk:hover,.blk:focus-visible,.blk.on{background:rgba(47,111,214,.2);border-style:solid}.blk.drag{cursor:grabbing;border-color:#d97a00;background:rgba(217,122,0,.18)}
.blk span{display:none;position:absolute;left:-2px;top:-17px;z-index:1;font:600 11px/15px Arial,sans-serif;background:#2f6fd6;color:#fff;padding:0 5px;border-radius:3px 3px 0 0;white-space:nowrap}
.blk.drag span{background:#d97a00}.blk:hover span,.blk:focus-visible span,.blk.on span,.blk.drag span{display:block}`;
const cellOf = (a: string) => { const m = /^([A-Z]+)(\d+)$/.exec(a); if (!m) return null; return { c: m[1].split('').reduce((x, ch) => x * 26 + ch.charCodeAt(0) - 64, 0), r: +m[2] }; };
type Rect = { r1: number; c1: number; r2: number; c2: number };

// req: η αίτηση για την προεπισκόπηση με τις θέσεις που βλέπεις τώρα· onSave: οι θέσεις ανά φύλλο (key)· form: για τα ονόματα των φύλλων
export function LayoutDialog({ title, req, initial, sigs, form, onSave, onClose }: { title: string; req: (l: Layout) => LayoutReq; initial?: Layout; sigs?: Sig[]; form?: LayoutForm; onSave: (l: Layout | undefined) => unknown; onClose: () => void }) {
  const [layout, setLayout] = useState<Layout>(() => JSON.parse(JSON.stringify(initial || {})));
  const [pv, setPv] = useState<LayoutPv | null>(null); const [busy, setBusy] = useState(true); const [err, setErr] = useState('');
  const [tab, setTab] = useState(''); const sel = useRef('');   // το κουτάκι που διάλεξες (μένει διαλεγμένο μετά την ανανέωση)
  const host = useRef<HTMLDivElement>(null); const root = useRef<ShadowRoot | null>(null);
  const seq = useRef(0); const reqRef = useRef(req); reqRef.current = req;
  useEffect(() => {
    const n = ++seq.current; setBusy(true);
    window.api.layoutPreview(reqRef.current(layout)).then(x => {
      if (n !== seq.current) return;
      if ('ok' in x) { setErr(x.error); setBusy(false); return; }
      setErr(''); setPv(x); setBusy(false); setTab(t => (x.sheets.some(s => s.key === t) ? t : x.sheets[0]?.key || ''));
    }, e => { if (n === seq.current) { setErr(String(e)); setBusy(false); } });
  }, [layout]);
  const sheet = pv?.sheets.find(s => s.key === tab);
  const moveBy = useCallback((id: string, dr: number, dc: number) => {
    if (!dr && !dc) return;
    setLayout(l => { const ms = { ...(l[tab] || {}) }; const m: Move = ms[id] || [0, 0]; ms[id] = [m[0] + dr, m[1] + dc]; return { ...l, [tab]: ms }; });
  }, [tab]);
  const moveRef = useRef(moveBy); moveRef.current = moveBy;

  // τα κουτάκια πάνω στη σελίδα (μέσα στο shadow DOM, όπως η προεπισκόπηση των Εντύπων)
  const draw = useCallback(() => {
    const r = root.current, el = host.current; if (!r || !el || !sheet) return;
    const wrap = r.querySelector('.wrap') as HTMLElement | null; if (!wrap) return;
    const k = Math.min(1, (el.clientWidth - 8) / Math.max(1, wrap.scrollWidth));
    wrap.style.transform = 'scale(' + k + ')'; el.style.height = Math.ceil(wrap.scrollHeight * k) + 'px';
    r.querySelector('.lay')?.remove();
    const lay = document.createElement('div'); lay.className = 'lay'; r.appendChild(lay);
    const tds = [...r.querySelectorAll('td[data-a]')].map(td => ({ td, at: cellOf(td.getAttribute('data-a') || '') })).filter(x => x.at) as { td: Element; at: { r: number; c: number } }[];
    const hb = el.getBoundingClientRect();
    const rectOf = (b: Rect) => {
      let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
      for (const x of tds) if (x.at.r >= b.r1 && x.at.r <= b.r2 && x.at.c >= b.c1 && x.at.c <= b.c2) { const q = x.td.getBoundingClientRect(); L = Math.min(L, q.left); T = Math.min(T, q.top); R = Math.max(R, q.right); B = Math.max(B, q.bottom); }
      return L < R ? { left: L - hb.left, top: T - hb.top, width: R - L, height: B - T } : null;
    };
    const place = (d: HTMLElement, q: { left: number; top: number; width: number; height: number }) => { d.style.left = q.left + 'px'; d.style.top = q.top + 'px'; d.style.width = Math.max(14, q.width) + 'px'; d.style.height = Math.max(10, q.height) + 'px'; };
    const at = (x: number, y: number) => { const td = r.elementsFromPoint(x, y).find(e => e.matches?.('td[data-a]')); return td ? cellOf(td.getAttribute('data-a') || '') : null; };
    for (const b of sheet.blocks) {
      const q = rectOf(b); if (!q) continue;
      const d = document.createElement('div'); d.className = 'blk' + (b.id === sel.current ? ' on' : ''); d.tabIndex = 0;
      d.setAttribute('role', 'button'); d.setAttribute('aria-label', blockLabel(b.id, sigs) + ': σύρε το ή μετακίνησέ το με τα βελάκια');
      const lbl = document.createElement('span'); lbl.textContent = blockLabel(b.id, sigs); d.appendChild(lbl);
      place(d, q); lay.appendChild(d);
      d.addEventListener('focus', () => { sel.current = b.id; lay.querySelectorAll('.blk').forEach(x => x.classList.toggle('on', x === d)); });
      d.addEventListener('keydown', e => {
        const k2 = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, number[]>)[e.key];
        if (k2) { e.preventDefault(); e.stopPropagation(); moveRef.current(b.id, k2[0], k2[1]); }
      });
      d.addEventListener('pointerdown', e => {
        if (e.button !== 0) return; e.preventDefault(); d.focus(); d.setPointerCapture(e.pointerId); d.classList.add('drag');
        const g = at(e.clientX, e.clientY); const grab = g ? { r: g.r - b.r1, c: g.c - b.c1 } : { r: 0, c: 0 };
        let cand = { r1: b.r1, c1: b.c1 };
        const mv = (ev: PointerEvent) => {
          const c = at(ev.clientX, ev.clientY); if (!c) return;
          const n = { r1: Math.max(1, c.r - grab.r), c1: Math.max(1, c.c - grab.c) };
          const q2 = rectOf({ ...n, r2: n.r1 + b.r2 - b.r1, c2: n.c1 + b.c2 - b.c1 }); if (!q2) return;
          cand = n; place(d, q2);
        };
        const up = () => {
          d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up);
          moveRef.current(b.id, cand.r1 - b.r1, cand.c1 - b.c1);
        };
        d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
      });
    }
    if (sel.current) (lay.querySelector('.blk.on') as HTMLElement | null)?.focus({ preventScroll: true });
  }, [sheet, sigs]);
  useEffect(() => { const el = host.current; if (el && !root.current) root.current = el.attachShadow({ mode: 'open' }); }, []);
  useEffect(() => {
    const r = root.current; if (!r) return;
    r.innerHTML = '<style>' + PAGE_CSS + (pv?.css || '') + LAY_CSS + '</style><div class="wrap">' + (sheet?.html || '') + '</div>';
  }, [pv, sheet]);
  useEffect(draw, [draw]);
  useEffect(() => { const el = host.current; if (!el) return; const ro = new ResizeObserver(() => draw()); ro.observe(el.parentElement || el); return () => ro.disconnect(); }, [draw]);

  const mine = layout[tab] || {};
  const any = Object.values(mine).some(moved);
  const save = () => { onClose(); onSave(cleanLayout(layout)); };
  return html`<${Dialog} title=${'Θέσεις στο χαρτί: ' + title} description="Σύρε την κεφαλίδα, την ημερομηνία, τον τίτλο ή μια υπογραφή όπου θέλεις. Κουμπώνει στα κελιά του Excel. Με το πληκτρολόγιο: Tab σε ένα κουτάκι και βελάκια." onClose=${onClose} size="xl"
    footer=${html`<${Button} variant="ghost" disabled=${!any} why="Όλα είναι ήδη στη θέση του εντύπου" onClick=${() => setLayout(l => { const x = { ...l }; delete x[tab]; return x; })} style=${{ marginRight: 'auto' }} data-tip="Όλα στη θέση του εντύπου, σε αυτό το φύλλο">Αρχικό<//><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
    ${pv && pv.sheets.length > 1 && html`<div><${Segmented} small=${true} value=${tab} onChange=${(v: string) => { setTab(v); sel.current = ''; }} items=${pv.sheets.map(s => ({ value: s.key, label: ((form ? LAYOUT_SHEETS[form] : []).find(x => x.key === s.key)?.label || s.sheet) + (Object.values(layout[s.key] || {}).some(moved) ? ' •' : '') }))}/></div>`}
    ${err && html`<${Alert} variant="destructive">${err}<//>`}
    <div className=${cx('rep-pv', 'lay-pv', busy && 'is-busy')}>
      <div ref=${host} className="rep-pv__page lay-pv__page"></div>
      ${!pv && !err && html`<div className="empty">Φτιάχνεται η σελίδα…</div>`}
    </div>
    ${sheet && html`<p className="note" style=${{ margin: 0 }}>${sheet.blocks.length ? sheet.blocks.map(b => blockLabel(b.id, sigs) + (moved(mine[b.id]) ? ' (μετακινήθηκε)' : '')).join(' · ') : 'Δεν βρέθηκε τίποτα να μετακινηθεί σε αυτό το φύλλο.'}</p>`}
    ${pv?.warnings.length ? html`<p className="note" style=${{ margin: 0 }}>${pv.warnings.join(' ')}</p>` : null}
  <//>`;
}
