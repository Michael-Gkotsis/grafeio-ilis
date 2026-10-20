// components/select: λίστες επιλογής (Select) και πεδία με προτάσεις (Combo), ίδια σε όλη την εφαρμογή.
// Αντί για το <select> και το <datalist> των Windows (Michael, 20/10: «σε πολλά δεν έχουμε καθόλου styling και consistency»):
// ίδιο κουτί με τα πεδία, ίδια λίστα στο φωτεινό και στο σκοτεινό θέμα, ίδια πλήκτρα, αναζήτηση στις μεγάλες λίστες.
// Η λίστα στήνεται μόνο όσο είναι ανοιχτή: οι πίνακες με πολλές λίστες (Οπλισμός, Σ.Ι.) μένουν ελαφριοί.
// Το onChange παίρνει { target: { value } } όπως το <select>, ώστε οι οθόνες να μην αλλάζουν.
import { Children, Fragment, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { html, cx, Icon } from './ui';
import { normGreek, translit } from '../shared/text';
type P = any;

// Λίστα που «επιπλέει» κάτω από το πεδίο (ή από πάνω, αν δεν χωρά): δεν κόβεται από παράθυρα, κάρτες ή το κάτω μέρος της οθόνης.
// minWidth: πλάτος τουλάχιστον τόσο (επιλογή ατόμου)· χωρίς: όσο το πεδίο ή και φαρδύτερη, όσο χρειάζονται οι επιλογές
export function useFloat(ref: { current: HTMLElement | null }, open: boolean, minWidth?: number) {
  const [pos, setPos] = useState<Record<string, number> | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const upd = (e?: Event) => {
      const el = ref.current; if (!el) return;
      if (e && e.target instanceof Element && e.target.closest('.ui-dd__pop,.picker__list')) return;   // κύλισμα μέσα στη λίστα
      const r = el.getBoundingClientRect(), vh = window.innerHeight, below = vh - r.bottom - 12, above = r.top - 12;
      const up = below < 220 && above > below;
      const maxHeight = Math.max(120, Math.min(320, up ? above : below));
      const vw = document.documentElement.clientWidth;
      const at: Record<string, number> = up ? { bottom: vh - r.top + 4, maxHeight } : { top: r.bottom + 4, maxHeight };
      if (minWidth) {
        const width = Math.min(Math.max(r.width, minWidth), vw - 16), left = Math.max(8, Math.min(r.left, vw - width - 8));
        setPos({ left, width, ...at }); return;
      }
      const min = Math.min(Math.max(r.width, 160), vw - 16), left = Math.max(8, Math.min(r.left, vw - min - 8));
      setPos({ left, minWidth: min, maxWidth: Math.max(min, Math.min(520, vw - left - 8)), ...at });
    };
    upd();
    window.addEventListener('scroll', upd, true); window.addEventListener('resize', upd);
    return () => { window.removeEventListener('scroll', upd, true); window.removeEventListener('resize', upd); };
  }, [open]);
  return pos;
}

interface Item { value: string; text: string; disabled: boolean; keep: boolean; group?: string }
const textOf = (c: any): string => (c == null || typeof c === 'boolean' ? '' : Array.isArray(c) ? c.map(textOf).join('') : isValidElement(c) ? textOf((c.props as P).children) : String(c));
// οι επιλογές γράφονται όπως στο <select>: <option>, <optgroup>, και λίστες ή Fragment από αυτά.
// <option data-keep> φαίνεται και όταν η αναζήτηση δεν το βρίσκει (π.χ. «Άλλο (γράψε το)…»)
function itemsOf(children: any, group?: string, out: Item[] = []): Item[] {
  Children.forEach(children, (c: any) => {
    if (!isValidElement(c)) return;
    const p = c.props as P;
    if (c.type === 'optgroup') itemsOf(p.children, p.label, out);
    else if (c.type === Fragment) itemsOf(p.children, group, out);
    else if (c.type === 'option') { const text = textOf(p.children); out.push({ value: p.value == null ? text : String(p.value), text, disabled: !!p.disabled, keep: p['data-keep'] != null, group }); }
  });
  return out;
}
const matches = (text: string, q: string) => { const t = normGreek(text); return t.includes(normGreek(q)) || translit(text).includes(translit(q)); };
// επόμενη επιλογή που δεν είναι κλειστή, προς τα κάτω (d = 1) ή προς τα πάνω (d = -1)
const step = (xs: Item[], from: number, d: number, n = 1) => {
  let at = from;
  for (let i = from + d; i >= 0 && i < xs.length && n > 0; i += d) if (!xs[i].disabled) { at = i; n--; }
  return at;
};
const fakeEvent = (value: string) => ({ target: { value }, currentTarget: { value } });
const printable = (e: KeyboardEvent) => e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey;
let seq = 0;

const SEARCH_FROM = 10;   // από τόσες επιλογές και πάνω, η λίστα έχει πεδίο αναζήτησης

/* Select: κουμπί με την τιμή και βελάκι· η λίστα ανοίγει από κάτω (ή από πάνω).
   Κλειστή: ↑↓ αλλάζουν την τιμή όπως στα Windows, γράμμα πηγαίνει στην πρώτη που ξεκινά έτσι (στις μεγάλες λίστες ανοίγει την αναζήτηση),
   Enter, Space, F4 ή Alt+↓ ανοίγουν. Ανοιχτή: ↑↓ PgUp PgDn, Enter ή Tab διαλέγει, Esc κλείνει χωρίς αλλαγή. */
export function Select({ value, onChange, children, className, disabled, search, ...rest }: P) {
  const items = itemsOf(children);
  const v = value == null ? '' : String(value);
  const cur = items.findIndex(x => x.value === v);
  const shown = items[cur < 0 ? 0 : cur];
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const [act, setAct] = useState(0);
  const btn = useRef<HTMLButtonElement>(null); const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ s: '', t: 0 }); const lid = useRef('dd' + ++seq).current;
  const pos = useFloat(btn, open);
  const searchable = search ?? items.length >= SEARCH_FROM;
  const filter = (s: string) => (s ? items.filter(x => x.keep || matches(x.text, s)) : items);
  const vis = open ? filter(q) : items;

  useEffect(() => { (list.current?.querySelector('.is-act') as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' }); }, [act, open, pos != null]);
  useEffect(() => {
    if (!open) return;
    // κλικ έξω από το κουμπί και τη λίστα: κλείνει χωρίς αλλαγή
    const out = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !list.current?.parentElement?.contains(t)) setOpen(false); };
    document.addEventListener('mousedown', out, true); return () => document.removeEventListener('mousedown', out, true);
  }, [open]);

  const pick = (x?: Item) => { if (x && !x.disabled && x.value !== v) onChange?.(fakeEvent(x.value)); };
  const close = () => { setOpen(false); setQ(''); btn.current?.focus(); };
  const show = (text = '') => { if (disabled || !items.length) return; setQ(text); setAct(text ? Math.max(0, filter(text).findIndex(x => !x.disabled)) : cur < 0 ? step(items, -1, 1) : cur); setOpen(true); };
  // γράμματα στη σειρά (μέσα σε 0,8 δευτ.): η πρώτη επιλογή που ξεκινά έτσι, μετά από την τρέχουσα
  const seek = (key: string, xs: Item[], from: number) => {
    const now = Date.now(), t = typed.current; t.s = (now - t.t < 800 ? t.s : '') + key; t.t = now;
    const s = normGreek(t.s), n = xs.length;
    for (let k = t.s.length > 1 ? 0 : 1; k <= n; k++) { const i = (from + k + n) % n; if (!xs[i].disabled && normGreek(xs[i].text).startsWith(s)) return i; }
    return -1;
  };
  const onKey = (e: P) => {
    const k = e.key, inQ = e.target !== btn.current;
    if (!open) {
      if (k === 'Enter' || k === ' ' || k === 'F4' || (e.altKey && (k === 'ArrowDown' || k === 'ArrowUp'))) { e.preventDefault(); show(); }
      else if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End' || k === 'PageDown' || k === 'PageUp') {
        e.preventDefault();
        const i = k === 'Home' ? step(items, -1, 1) : k === 'End' ? step(items, items.length, -1) : step(items, cur, k === 'ArrowDown' || k === 'PageDown' ? 1 : -1, k.startsWith('Page') ? 8 : 1);
        if (i >= 0) pick(items[i]);
      } else if (printable(e)) {
        e.preventDefault();
        if (searchable) show(k); else { const i = seek(k, items, cur); if (i >= 0) pick(items[i]); }
      }
      return;
    }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (k === 'Enter') { e.preventDefault(); pick(vis[act]); close(); }
    else if (k === 'Tab') { pick(vis[act]); setOpen(false); setQ(''); btn.current?.focus(); }
    else if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'PageDown' || k === 'PageUp') { e.preventDefault(); setAct(step(vis, act, k === 'ArrowDown' || k === 'PageDown' ? 1 : -1, k.startsWith('Page') ? 8 : 1)); }
    else if (!inQ && (k === 'Home' || k === 'End')) { e.preventDefault(); setAct(k === 'Home' ? step(vis, -1, 1) : step(vis, vis.length, -1)); }
    else if (!inQ && printable(e)) {
      // στις μεγάλες λίστες τα γράμματα πάνε στην αναζήτηση (και όσα πατήθηκαν πριν εμφανιστεί)
      e.preventDefault();
      if (searchable) { const s = q + k; setQ(s); setAct(Math.max(0, filter(s).findIndex(x => !x.disabled))); } else { const i = seek(k, vis, act); if (i >= 0) setAct(i); }
    }
  };
  // η εστίαση έφυγε αλλού (π.χ. άλλο παράθυρο): κλείνει χωρίς αλλαγή
  const onBlur = (e: P) => { const to = e.relatedTarget as Element | null; if (open && !(to && (to === btn.current || to.closest('.ui-dd__pop')))) { setOpen(false); setQ(''); } };

  return html`<${Fragment}>
    <button ...${rest} ref=${btn} type="button" role="combobox" aria-haspopup="listbox" aria-expanded=${open} aria-controls=${open ? lid : undefined}
      aria-activedescendant=${open && !searchable && vis[act] ? lid + '-' + act : undefined} disabled=${disabled}
      className=${cx('ui-dd', className || 'ui-select', open && 'is-open')} onClick=${() => (open ? close() : show())} onKeyDown=${onKey} onBlur=${onBlur}>
      <span className="ui-dd__v">${shown ? shown.text : ''}</span>${Icon.down}</button>
    ${open && pos && createPortal(html`<div className="ui-dd__pop" style=${pos}>
      ${searchable && html`<input className="ui-dd__q" autoFocus autoComplete="off" placeholder="Αναζήτηση…" aria-label="Αναζήτηση στη λίστα" aria-controls=${lid}
        aria-activedescendant=${vis[act] ? lid + '-' + act : undefined} value=${q} onChange=${(e: P) => { const s = e.target.value; setQ(s); setAct(Math.max(0, filter(s).findIndex(x => !x.disabled))); }}
        onKeyDown=${onKey} onBlur=${onBlur}/>`}
      <ul ref=${list} id=${lid} className="ui-dd__list" role="listbox" onMouseDown=${(e: P) => e.preventDefault()}>
        ${vis.length === 0 ? html`<li className="ui-dd__none">Τίποτα δεν ταιριάζει</li>` : vis.map((x, i) => html`<${Fragment} key=${i}>
          ${x.group && x.group !== vis[i - 1]?.group && html`<li className="ui-dd__grp" role="presentation">${x.group}</li>`}
          <li id=${lid + '-' + i} role="option" aria-selected=${x.value === v} aria-disabled=${x.disabled || undefined} className=${cx('ui-opt', i === act && 'is-act', x.disabled && 'is-off')}
            onMouseMove=${() => i !== act && !x.disabled && setAct(i)} onClick=${() => { if (!x.disabled) { pick(x); close(); } }}>${x.text}</li><//>`)}
      </ul></div>`, document.body)}<//>`;
}

/* Combo: πεδίο κειμένου με προτάσεις από κάτω (π.χ. ώρες, «Ποιος τιμώρησε»). Γράφεις ό,τι θέλεις· η λίστα δείχνει όσες ταιριάζουν.
   Ανοίγει με κλικ, με ↓ ή όταν γράφεις· ↑↓ και Enter διαλέγουν, Esc κλείνει. Τα υπόλοιπα πλήκτρα πάνε στο onKeyDown του πεδίου. */
export function Combo({ options, value, onChange, onKeyDown, onBlur, onClick, ...rest }: P) {
  const [open, setOpen] = useState(false); const [act, setAct] = useState(-1);
  const box = useRef<HTMLInputElement>(null); const lid = useRef('cb' + ++seq).current;
  const pos = useFloat(box, open);
  const v = value == null ? '' : String(value), nv = normGreek(v);
  const opts: string[] = options || [];
  // ό,τι είναι γραμμένο ήδη μία από τις επιλογές: δείχνει όλες, για να διαλέξεις άλλη
  const vis = !open ? [] : !nv || opts.some(o => normGreek(o) === nv) ? opts : opts.filter(o => matches(o, v));
  // ανοίγει στην τιμή που είναι γραμμένη· μετά ακολουθεί τα βελάκια
  useEffect(() => { (document.querySelector('#' + lid + (act < 0 ? ' [aria-selected="true"]' : '-' + act)) as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' }); }, [act, pos != null]);
  const set = (s: string) => { onChange?.(fakeEvent(s)); setOpen(false); setAct(-1); };
  const key = (e: P) => {
    const k = e.key;
    if (k === 'ArrowDown' || (e.altKey && k === 'ArrowUp')) {
      e.preventDefault();
      if (!open) { setOpen(true); setAct(Math.max(0, opts.indexOf(v))); } else setAct(a => Math.min(vis.length - 1, a + 1));
      return;
    }
    if (open && k === 'ArrowUp') { e.preventDefault(); setAct(a => Math.max(0, a - 1)); return; }
    if (open && k === 'Enter' && vis[act] != null) { e.preventDefault(); set(vis[act]); return; }
    if (open && k === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
    if (k === 'Tab' || k === 'Enter') setOpen(false);
    onKeyDown?.(e);
  };
  return html`<${Fragment}>
    <input ...${rest} ref=${box} value=${v} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded=${open && vis.length > 0} aria-controls=${open ? lid : undefined}
      aria-activedescendant=${open && vis[act] != null ? lid + '-' + act : undefined}
      onChange=${(e: P) => { onChange?.(e); setOpen(true); setAct(-1); }} onKeyDown=${key}
      onClick=${(e: P) => { setOpen(true); onClick?.(e); }} onBlur=${(e: P) => { setOpen(false); setAct(-1); onBlur?.(e); }}/>
    ${open && pos && vis.length > 0 && createPortal(html`<div className="ui-dd__pop" style=${pos}>
      <ul id=${lid} className="ui-dd__list" role="listbox" onMouseDown=${(e: P) => e.preventDefault()}>
        ${vis.map((o, i) => html`<li key=${o} id=${lid + '-' + i} role="option" aria-selected=${o === v} className=${cx('ui-opt', i === act && 'is-act')}
          onMouseMove=${() => i !== act && setAct(i)} onClick=${() => set(o)}>${o}</li>`)}
      </ul></div>`, document.body)}<//>`;
}
