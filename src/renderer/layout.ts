// Θέσεις πάνω στο χαρτί (Michael, 20/10): το έντυπο όπως θα βγει, και πάνω του η κεφαλίδα, ο τόπος/ημερομηνία και κάθε
// υπογραφή σαν κουτάκι που το σέρνεις όπου θέλεις (κουμπώνει στα κελιά). Με το πληκτρολόγιο: Tab στο κουτάκι και βελάκια.
// Μετά από κάθε μετακίνηση η σελίδα ξαναφτιάχνεται όπως θα τυπωθεί.
import { useCallback, useEffect, useRef, useState } from 'react';
import { html, cx, Alert, Button, Dialog, Segmented, useToast } from './ui';
import { PAGE_CSS } from './pageCss';
import { Select } from './select';
import { LAYOUT_SHEETS, blockLabel, cleanLayout, moved, type Layout, type LayoutForm, type Move } from '../shared/layout';
import type { LayoutPv, LayoutReq } from '../shared/api';
import type { Sig } from '../shared/sigs';
import { REP_IMAGES_MAX, type RepImage } from '../shared/reports';
import { CM_PX } from '../shared/headLayout';

const LAY_CSS = `.wrap{transform-origin:0 0;width:max-content;margin:0 auto}.lay{position:absolute;inset:0;pointer-events:none}
.blk{position:absolute;pointer-events:auto;cursor:grab;border:2px dashed #2f6fd6;background:rgba(47,111,214,.10);border-radius:3px;touch-action:none;outline:none}
.blk:hover,.blk:focus-visible,.blk.on{background:rgba(47,111,214,.2);border-style:solid}.blk.drag{cursor:grabbing;border-color:#d97a00;background:rgba(217,122,0,.18)}
.blk span{display:none;position:absolute;left:-2px;top:-17px;z-index:1;font:600 11px/15px Arial,sans-serif;background:#2f6fd6;color:#fff;padding:0 5px;border-radius:3px 3px 0 0;white-space:nowrap}
.blk.img{border-color:#c99a1a;background:rgba(224,170,40,.12)}.blk.img span{background:#c99a1a}.blk.img.on,.blk.img:hover{background:rgba(224,170,40,.22)}
.blk .hd{position:absolute;width:9px;height:9px;background:#fff;border:2px solid #c99a1a;border-radius:2px;display:none;touch-action:none}.blk.on .hd{display:block}
.blk .hd.nw{left:-6px;top:-6px;cursor:nwse-resize}.blk .hd.ne{right:-6px;top:-6px;cursor:nesw-resize}.blk .hd.sw{left:-6px;bottom:-6px;cursor:nesw-resize}.blk .hd.se{right:-6px;bottom:-6px;cursor:nwse-resize}
.blk.drag span{background:#d97a00}.blk:hover span,.blk:focus-visible span,.blk.on span,.blk.drag span{display:block}`;
const cellOf = (a: string) => { const m = /^([A-Z]+)(\d+)$/.exec(a); if (!m) return null; return { c: m[1].split('').reduce((x, ch) => x * 26 + ch.charCodeAt(0) - 64, 0), r: +m[2] }; };
type Rect = { r1: number; c1: number; r2: number; c2: number };

// req: η αίτηση για την προεπισκόπηση με τις θέσεις που βλέπεις τώρα· onSave: οι θέσεις ανά φύλλο (key)· form: για τα ονόματα των φύλλων
// Μόνο στα Έντυπα (extra): η επικεφαλίδα του εντύπου και οι δικές σου εικόνες πάνω στο χαρτί
export interface LayExtra { hdId?: string; images: RepImage[] }
export function LayoutDialog({ title, req, initial, sigs, form, onSave, onClose, extra, heads }: { title: string; req: (l: Layout, x?: LayExtra) => LayoutReq; initial?: Layout; sigs?: Sig[]; form?: LayoutForm; onSave: (l: Layout | undefined, x?: LayExtra) => unknown; onClose: () => void; extra?: LayExtra; heads?: { value: string; label: string }[] }) {
  const [hd, setHd] = useState(extra?.hdId || 'today'); const [imgs, setImgs] = useState<RepImage[]>(() => JSON.parse(JSON.stringify(extra?.images || [])));
  const [selI, setSelI] = useState(''); const imgsRef = useRef(imgs); imgsRef.current = imgs; const xRef = useRef<LayExtra | undefined>(); xRef.current = extra ? { hdId: hd === 'today' ? undefined : hd, images: imgs } : undefined;
  const toast = useToast();
  const [layout, setLayout] = useState<Layout>(() => JSON.parse(JSON.stringify(initial || {})));
  const [pv, setPv] = useState<LayoutPv | null>(null); const [busy, setBusy] = useState(true); const [err, setErr] = useState('');
  const [tab, setTab] = useState(''); const sel = useRef('');   // το κουτάκι που διάλεξες (μένει διαλεγμένο μετά την ανανέωση)
  const host = useRef<HTMLDivElement>(null); const root = useRef<ShadowRoot | null>(null);
  const seq = useRef(0); const reqRef = useRef(req); reqRef.current = req;
  useEffect(() => {
    const n = ++seq.current; setBusy(true);
    window.api.layoutPreview(reqRef.current(layout, xRef.current)).then(x => {
      if (n !== seq.current) return;
      if ('ok' in x) { setErr(x.error); setBusy(false); return; }
      setErr(''); setPv(x); setBusy(false); setTab(t => (x.sheets.some(s => s.key === t) ? t : x.sheets[0]?.key || ''));
    }, e => { if (n === seq.current) { setErr(String(e)); setBusy(false); } });
  }, [layout, hd, imgs]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sheet = pv?.sheets.find(s => s.key === tab);
  const moveBy = useCallback((id: string, dr: number, dc: number) => {
    if (!dr && !dc) return;
    const im = /^img(\d+)$/.exec(id);
    if (im) {   // εικόνα: νέο κελί· κάτω από τον πίνακα μετριέται από την τελευταία γραμμή του, αλλιώς από την κορυφή
      const b = sheet?.blocks.find(x => x.id === id), end = sheet?.end ?? 0; if (!b) return;
      const r1 = Math.max(1, b.r1 + dr), c1 = Math.max(1, b.c1 + dc), foot = end > 0 && r1 > end;
      setImgs(a => a.map((x, i) => (i === +im[1] ? { ...x, at: { rel: foot ? 'foot' : 'top', r: foot ? r1 - end : r1, c: c1 } } : x))); return;
    }
    setLayout(l => { const ms = { ...(l[tab] || {}) }; const m: Move = ms[id] || [0, 0]; ms[id] = [m[0] + dr, m[1] + dc]; return { ...l, [tab]: ms }; });
  }, [tab, sheet]);
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
      const isImg = /^img\d+$/.test(b.id); const d = document.createElement('div'); d.className = 'blk' + (isImg ? ' img' : '') + (b.id === sel.current ? ' on' : ''); d.tabIndex = 0;
      d.setAttribute('role', 'button'); d.setAttribute('aria-label', blockLabel(b.id, sigs) + ': σύρε το ή μετακίνησέ το με τα βελάκια');
      const lbl = document.createElement('span'); lbl.textContent = blockLabel(b.id, sigs); d.appendChild(lbl);
      place(d, q); lay.appendChild(d);
      if (isImg) for (const pos of ['nw', 'ne', 'sw', 'se']) {
        const hdl = document.createElement('i'); hdl.className = 'hd ' + pos; d.appendChild(hdl);
        hdl.addEventListener('pointerdown', e => {   // γωνία: αλλάζει το ύψος (εκ.), η αναλογία μένει, η εικόνα μένει με την πάνω αριστερή γωνία της
          if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); hdl.setPointerCapture(e.pointerId);
          const i = +b.id.slice(3), y0 = e.clientY, h0 = imgsRef.current[i]?.h || 2, up2 = pos[0] === 'n' ? -1 : 1; const kk = Math.min(1, (el.clientWidth - 8) / Math.max(1, wrap.scrollWidth));
          const mv = (ev: PointerEvent) => { const nh = Math.round(Math.min(12, Math.max(0.3, h0 + (up2 * (ev.clientY - y0)) / kk / CM_PX)) * 10) / 10; d.style.height = Math.max(10, q.height * nh / h0) + 'px'; };
          const fin = (ev: PointerEvent) => { hdl.removeEventListener('pointermove', mv); hdl.removeEventListener('pointerup', fin); hdl.removeEventListener('pointercancel', fin);
            const nh = Math.round(Math.min(12, Math.max(0.3, h0 + (up2 * (ev.clientY - y0)) / kk / CM_PX)) * 10) / 10; if (nh !== h0) setImgs(a => a.map((x, j) => (j === i ? { ...x, h: nh } : x))); };
          hdl.addEventListener('pointermove', mv); hdl.addEventListener('pointerup', fin); hdl.addEventListener('pointercancel', fin);
        });
        hdl.addEventListener('keydown', e => e.stopPropagation());
      }
      d.addEventListener('focus', () => { sel.current = b.id; setSelI(isImg ? b.id : ''); lay.querySelectorAll('.blk').forEach(x => x.classList.toggle('on', x === d)); });
      d.addEventListener('keydown', e => {
        const k2 = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, number[]>)[e.key];
        if (k2) { e.preventDefault(); e.stopPropagation(); moveRef.current(b.id, k2[0], k2[1]); }
      });
      d.addEventListener('pointerdown', e => {
        if (e.button !== 0 || (e.target as HTMLElement).classList?.contains('hd')) return; e.preventDefault(); d.focus(); d.setPointerCapture(e.pointerId); d.classList.add('drag');
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
  const save = () => { onClose(); onSave(cleanLayout(layout), xRef.current); };
  // εικόνες: νέα (μπαίνει πάνω αριστερά, τη σέρνεις), άλλη εικόνα, ύψος, σελίδες, χρώμα, σβήσιμο
  const selN = /^img(\d+)$/.exec(selI); const cur = selN ? imgs[+selN[1]] : undefined;
  const pickImg = async (replace: number | null) => {
    const r = await window.api.pickImage(); if (!r) return; if (!r.ok) { toast({ text: r.error }); return; }
    if (replace != null) { setImgs(a => a.map((x, i) => (i === replace ? { ...x, id: r.id } : x))); return; }
    setImgs(a => [...a, { id: r.id, at: { rel: 'top', r: 1, c: 1 }, h: 2 }]); setSelI('img' + imgs.length); sel.current = 'img' + imgs.length;
  };
  const setCur = (p: Partial<RepImage>) => selN && setImgs(a => a.map((x, i) => (i === +selN[1] ? { ...x, ...p } : x)));
  const heading = extra && heads ? html`<span className="lay-head"><span>Θέσεις στο χαρτί: ${title}</span>
    <label className="lay-head__sel">Επικεφαλίδα: <${Select} className="ui-select" value=${hd} aria-label="Επικεφαλίδα του εντύπου" onChange=${(e: any) => setHd(e.target.value)}>${heads.map(h => html`<option key=${h.value} value=${h.value}>${h.label}</option>`)}<//></label></span>` : 'Θέσεις στο χαρτί: ' + title;
  return html`<${Dialog} title=${heading} description="Σύρε την κεφαλίδα, την ημερομηνία, τον τίτλο ή μια υπογραφή όπου θέλεις. Κουμπώνει στα κελιά του Excel. Με το πληκτρολόγιο: Tab σε ένα κουτάκι και βελάκια." onClose=${onClose} size="xl"
    footer=${html`${extra && html`<${Button} variant="outline" disabled=${imgs.length >= REP_IMAGES_MAX} why=${imgs.length >= REP_IMAGES_MAX && 'Έως ' + REP_IMAGES_MAX + ' εικόνες'} onClick=${() => pickImg(null)} style=${{ marginRight: '8px' }} data-tip="Βάλε μια εικόνα (λογότυπο, σφραγίδα) όπου θέλεις πάνω στο χαρτί">+ Εικόνα…<//>`}<${Button} variant="ghost" disabled=${!any} why="Όλα είναι ήδη στη θέση του εντύπου" onClick=${() => setLayout(l => { const x = { ...l }; delete x[tab]; return x; })} style=${{ marginRight: 'auto' }} data-tip="Όλα στη θέση του εντύπου, σε αυτό το φύλλο">Αρχικό<//><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
    ${pv && pv.sheets.length > 1 && html`<div><${Segmented} small=${true} value=${tab} onChange=${(v: string) => { setTab(v); sel.current = ''; }} items=${pv.sheets.map(s => ({ value: s.key, label: ((form ? LAYOUT_SHEETS[form] : []).find(x => x.key === s.key)?.label || s.sheet) + (Object.values(layout[s.key] || {}).some(moved) ? ' •' : '') }))}/></div>`}
    ${err && html`<${Alert} variant="destructive">${err}<//>`}
    <div className=${cx('lay-row', extra && 'lay-row--side')}>
    <div className=${cx('rep-pv', 'lay-pv', busy && 'is-busy')}>
      <div ref=${host} className="rep-pv__page lay-pv__page"></div>
      ${!pv && !err && html`<div className="empty">Φτιάχνεται η σελίδα…</div>`}
    </div>
    ${extra && html`<div className="lay-side">
      <b>Κομμάτια στο χαρτί</b>
      <ul className="lay-side__l">${(sheet?.blocks || []).map(b => html`<li key=${b.id} className=${cx(b.id === selI && 'on')}>${blockLabel(b.id, sigs)}${/^img\d+$/.test(b.id) ? ' · ' + (imgs[+b.id.slice(3)]?.id || '').slice(0, 6) : ''}</li>`)}</ul>
      ${cur ? html`<div className="lay-card"><b>Εικόνα ${+selN![1] + 1}</b>
        <label className="lay-card__r"><span>Ύψος</span><input type="range" min="0.5" max="8" step="0.1" value=${cur.h} onChange=${(e: any) => setCur({ h: Math.round(+e.target.value * 10) / 10 })}/><output>${String(cur.h).replace('.', ',')} εκ.</output></label>
        <div className="lay-card__r"><span>Σελίδες</span><${Segmented} small=${true} value=${cur.pages === 'all' ? 'all' : 'one'} onChange=${(v: string) => setCur({ pages: v === 'all' ? 'all' : undefined })} items=${[{ value: 'one', label: 'Μόνο στην 1η' }, { value: 'all', label: 'Σε όλες' }]}/></div>
        <p className="note" style=${{ margin: 0 }}>«Σε όλες» επαναλαμβάνεται σε κάθε σελίδα μόνο αν η εικόνα είναι πάνω από τον πίνακα, μέσα στις γραμμές που επαναλαμβάνονται· αλλιώς βγαίνει μόνο στην πρώτη.</p>
        <div className="lay-card__r"><span>Χρώμα</span><${Segmented} small=${true} value=${cur.gray ? 'g' : 'c'} onChange=${(v: string) => setCur({ gray: v === 'g' ? true : undefined })} items=${[{ value: 'c', label: 'Ίδια' }, { value: 'g', label: 'Ασπρόμαυρη' }]}/></div>
        <div className="toolbar" style=${{ margin: 0 }}><${Button} size="sm" variant="outline" onClick=${() => pickImg(+selN![1])}>Άλλη εικόνα…<//><${Button} size="sm" variant="outline" onClick=${() => { setImgs(a => a.filter((_, i) => i !== +selN![1])); setSelI(''); sel.current = ''; }}>Σβήσε<//></div></div>`
        : html`<p className="note" style=${{ margin: 0 }}>${imgs.length ? 'Πάτα μια εικόνα για να αλλάξεις το ύψος της.' : 'Με το «+ Εικόνα…» βάζεις όσες εικόνες θέλεις (π.χ. λογότυπο πάνω, σφραγίδα δίπλα στις υπογραφές).'} Σύρε την εικόνα όπου θέλεις· οι γωνίες τη μεγαλώνουν. Κουμπώνει στα κελιά, για να μένει στο ίδιο σημείο και στο Excel.</p>`}
    </div>`}
    </div>
    ${sheet && html`<p className="note" style=${{ margin: 0 }}>${sheet.blocks.length ? sheet.blocks.map(b => blockLabel(b.id, sigs) + (moved(mine[b.id]) ? ' (μετακινήθηκε)' : '')).join(' · ') : 'Δεν βρέθηκε τίποτα να μετακινηθεί σε αυτό το φύλλο.'}</p>`}
    ${pv?.warnings.length ? html`<p className="note" style=${{ margin: 0 }}>${pv.warnings.join(' ')}</p>` : null}
  <//>`;
}
