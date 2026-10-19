// components/ui: Button, Badge, Card, Dialog, Sheet, Toast… (ίδια με το mockup)
import React, { createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import htm from 'htm';

export const html = htm.bind(React.createElement) as (strings: TemplateStringsArray, ...values: any[]) => any;
export const cx = (...a: unknown[]) => a.filter(Boolean).join(' ');
type P = any;

const svg = (d: string, extra = '') => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" ...${extra ? { width: extra, height: extra } : {}} dangerouslySetInnerHTML=${{ __html: d }}></svg>`;
export const Icon: Record<string, any> = {
  print: svg('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>'),
  home: svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  people: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.7.2 4.6 2 5.3 5"/>'),
  cadre: svg('<circle cx="12" cy="7" r="3.5"/><path d="M5 21c.9-4 3.7-6.5 7-6.5s6.1 2.5 7 6.5"/><path d="M8.5 17.5l3.5-1.8 3.5 1.8"/>'),
  guard: svg('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>'),
  strength: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 15v-3M12 15V8M17 15v-5"/>'),
  history: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
  file: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  out: svg('<path d="M14 3h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-5"/><path d="M9 17l5-5-5-5M14 12H3"/>'),
  med: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>'),
  more: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', '18'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', '16'),
  shield: svg('<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>', '22'),
  back: svg('<path d="M19 12H5M11 18l-6-6 6-6"/>'),
  chev: svg('<path d="M9 6l6 6-6 6"/>', '16'),
  star: svg('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>', '14'),
  collapse: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M16 10l-2 2 2 2"/>'),
  // σταυρόνημα: Οπλισμός
  weapon: svg('<circle cx="12" cy="12" r="7.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  expand: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M14 10l2 2-2 2"/>')
};

/* Λογότυπο: ασπίδα με δύο σιρίτια και αστέρι (γραφείο λοχία). Ίδιο σχέδιο με το public/logo.svg και το εικονίδιο του παραθύρου. */
const LOGO = '<defs><linearGradient id="lg-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b7f2b"/><stop offset="1" stop-color="#2c4313"/></linearGradient>'
  + '<linearGradient id="lg-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d77a"/><stop offset="1" stop-color="#c39323"/></linearGradient></defs>'
  + '<path d="M32 3 L56 11 V30 C56 45 46 55 32 61 C18 55 8 45 8 30 V11 Z" fill="url(#lg-g)"/>'
  + '<path d="M32 7.2 L52.4 14 V30 C52.4 42.6 44.2 51.4 32 56.9 C19.8 51.4 11.6 42.6 11.6 30 V14 Z" fill="url(#lg-f)"/>'
  + '<path d="M32 7.2 V56.9 C19.8 51.4 11.6 42.6 11.6 30 V14 Z" fill="#fff" fill-opacity=".07"/>'
  + '<path d="M32 13.5 l2.35 4.76 5.25 .76 -3.8 3.7 .9 5.23 L32 25.48 l-4.7 2.47 .9-5.23 -3.8-3.7 5.25-.76 Z" fill="url(#lg-g)"/>'
  + '<path d="M19 37 L32 30 L45 37 V42.5 L32 35.5 L19 42.5 Z" fill="url(#lg-g)"/><path d="M19 45.5 L32 38.5 L45 45.5 V51 L32 44 L19 51 Z" fill="url(#lg-g)"/>';
// Ίδια ασπίδα με 1–3 αστέρια (αξιωματικοί, Ρυθμίσεις › Εμφάνιση)
const LOGO_SHIELD = LOGO.slice(0, LOGO.indexOf('<path d="M32 13.5'));
const star = (x: number, y: number, r: number) => '<path d="' + Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 5 * i - Math.PI / 2, d = i % 2 ? r * 0.42 : r; return (i ? 'L' : 'M') + (x + d * Math.cos(a)).toFixed(2) + ' ' + (y + d * Math.sin(a)).toFixed(2); }).join(' ') + 'Z" fill="url(#lg-g)"/>';
const STARS: Record<string, [number, number][]> = { star1: [[32, 32]], star2: [[32, 22], [32, 41]], star3: [[32, 18], [32, 32], [32, 46]] };
const LOGOS: Record<string, string> = { chev: LOGO, ...Object.fromEntries(Object.entries(STARS).map(([k, xs]) => [k, LOGO_SHIELD + xs.map(([x, y]) => star(x, y, xs.length === 3 ? 6.5 : 8)).join('')])) };
// kind: σχέδιο (brand.ts) · src: εικόνα που ανέβασε ο χρήστης
export const Logo = ({ size = 32, kind = 'chev', src }: P) => (src
  ? html`<img className="logo" src=${src} width=${size} height=${size} alt="" style=${{ objectFit: 'contain' }}/>`
  : html`<svg className="logo" viewBox="0 0 64 64" width=${size} height=${size} aria-hidden="true" dangerouslySetInnerHTML=${{ __html: LOGOS[kind] || LOGO }}></svg>`);

// Όσο τρέχει ό,τι ξεκίνησε το κλικ (onClick που επιστρέφει Promise), το κουμπί δεν ξαναπατιέται:
// διπλό κλικ στην «Αποθήκευση» δεν γράφει δύο φορές
export function Button({ variant = 'default', size, className, children, onClick, disabled, ...rest }: P) {
  const [busy, setBusy] = useState(false); const running = useRef(false); const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  const click = onClick && ((e: any) => {
    if (running.current) return;
    const r = onClick(e);
    if (!r || typeof r.then !== 'function') return;
    running.current = true; setBusy(true);
    const done = () => { running.current = false; if (live.current) setBusy(false); };
    r.then(done, (err: unknown) => { done(); console.error(err); });
  });
  return html`<button type="button" className=${cx('ui-btn', 'ui-btn--' + variant, size && 'ui-btn--' + size, className)} disabled=${disabled || busy} aria-busy=${busy || undefined} onClick=${click} ...${rest}>${children}</button>`;
}
export const Badge = ({ tone, className, children, ...rest }: P) => html`<span className=${cx('ui-badge', tone && 'ui-badge--' + tone, className)} ...${rest}>${children}</span>`;
export const Kbd = ({ children }: P) => html`<kbd className="ui-kbd">${children}</kbd>`;
// Card με open/onToggle: κλείνει με κλικ στην επικεφαλίδα· κλειστή δείχνει μόνο τη σύνοψη και δεν φτιάχνει το περιεχόμενο
export function Card({ title, actions, children, open, onToggle, summary, flush }: P) {
  if (onToggle) return html`<section className=${cx('ui-card', 'ui-card--fold', !open && 'is-closed')}>
    <div className="ui-card__head"><h2><button type="button" className="ui-card__toggle" aria-expanded=${!!open} onClick=${onToggle}>${Icon.chev}<span>${title}</span></button></h2>${actions}</div>
    ${open ? html`<div className="ui-card__body">${children}</div>` : summary && html`<div className="ui-card__sum">${summary}</div>`}</section>`;
  return html`<section className="ui-card">${title && html`<div className="ui-card__head"><h2>${title}</h2>${actions}</div>`}<div className=${cx('ui-card__body', flush && 'ui-card__body--flush')}>${children}</div></section>`;
}
export const Alert = ({ tone, children }: P) => html`<div className=${cx('ui-alert', tone && 'ui-alert--' + tone)} role=${tone === 'bad' ? 'alert' : undefined}>${children}</div>`;
export function Tabs({ value, onChange, items }: P) {
  return html`<div className="ui-tabs" role="tablist">${items.map((it: P) => html`<button key=${it.value} type="button" role="tab" aria-selected=${value === it.value} onClick=${() => onChange(it.value)}>${it.label}</button>`)}</div>`;
}
export function Segmented({ value, onChange, items, small }: P) {
  return html`<div className=${cx('ui-seg', small && 'ui-seg--sm')} role="group">${items.map((it: P) => html`<button key=${it.value} type="button" aria-pressed=${value === it.value} data-tip=${it.tip} onClick=${() => onChange(it.value)}>${it.label}</button>`)}</div>`;
}
// Esc κλείνει μόνο το πάνω πάνω παράθυρο (π.χ. το Υπόμνημα πάνω από μια δήλωση), όχι όλα μαζί
const escStack: { current: () => void }[] = [];
const onEsc = (e: KeyboardEvent) => { if (e.key !== 'Escape' || !escStack.length) return; e.stopPropagation(); escStack[escStack.length - 1].current(); };
export function useEscape(fn: () => void) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    if (!escStack.length) document.addEventListener('keydown', onEsc);
    escStack.push(ref);
    return () => { const i = escStack.lastIndexOf(ref); if (i >= 0) escStack.splice(i, 1); if (!escStack.length) document.removeEventListener('keydown', onEsc); };
  }, []);
}
export function Dialog({ title, description, onClose, children, footer, size, closeOnOverlay = true, role = 'dialog' }: P) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => {
    const el = ref.current; const f = el && (el.querySelector('[data-autofocus]') || el.querySelector('.ui-dialog__foot .ui-btn--default,.ui-dialog__body input')) as HTMLElement | null;
    f && f.focus(); const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; };
  }, []);
  return createPortal(html`<div className="ui-overlay" onMouseDown=${(e: MouseEvent) => { if (e.target === e.currentTarget && closeOnOverlay) onClose(); }}>
    <div ref=${ref} className=${cx('ui-dialog', size && 'ui-dialog--' + size)} role=${role} aria-modal="true" aria-labelledby="dlg-t">
      <div className="ui-dialog__head"><div><h2 id="dlg-t">${title}</h2>${description && html`<div className="ui-dialog__desc">${description}</div>`}</div>
        <${Button} variant="ghost" size="icon" aria-label="Κλείσιμο" data-tip="Κλείσιμο (Esc)" data-tip-side="left" onClick=${onClose}>${Icon.x}<//></div>
      <div className="ui-dialog__body">${children}</div>
      ${footer && html`<div className="ui-dialog__foot">${footer}</div>`}
    </div></div>`, document.body);
}
export function Sheet({ title, subtitle, onClose, children }: P) {
  useEscape(onClose);
  return createPortal(html`<${Fragment}>
    <div className="ui-sheet-overlay" onMouseDown=${onClose}></div>
    <aside className="ui-sheet" role="dialog" aria-modal="true" aria-label="Λεπτομέρειες">
      <div className="ui-sheet__head"><div>${title}${subtitle}</div><${Button} variant="ghost" size="icon" aria-label="Κλείσιμο" data-tip="Κλείσιμο (Esc)" data-tip-side="left" onClick=${onClose}>${Icon.x}<//></div>
      <div className="ui-sheet__body">${children}</div>
    </aside><//>`, document.body);
}

export interface ToastAction { label: string; fn: () => void }
export type Toast = (t: { text: any; actions?: ToastAction[] }) => void;
const ToastCtx = createContext<Toast>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: P) {
  const [items, setItems] = useState<any[]>([]);
  const remove = useCallback((id: string) => setItems(x => x.filter(t => t.id !== id)), []);
  const push = useCallback((t: any) => { const id = Math.random().toString(36).slice(2); setItems(x => [...x.slice(-1), { id, ...t }]); setTimeout(() => remove(id), t.actions ? 8000 : 5000); }, [remove]);
  return html`<${ToastCtx.Provider} value=${push}>${children}
    <div className="ui-toasts" aria-live="polite">${items.map(t => html`<div key=${t.id} className="ui-toast" role="status"><div>${t.text}</div>${(t.actions || []).map((a: ToastAction) => html`<button key=${a.label} type="button" onClick=${() => { a.fn(); remove(t.id); }}>${a.label}</button>`)}</div>`)}</div><//>`;
}

/* VirtualList: μόνο οι ορατές γραμμές υπάρχουν στη σελίδα */
// resetKey: πότε γυρνά στην αρχή (αλλαγή φίλτρου/αναζήτησης), όχι σε κάθε αλλαγή δεδομένων
// Στην κατάσταση μόνο η πρώτη ορατή γραμμή: το κύλισμα μέσα στην ίδια γραμμή δεν ξαναζωγραφίζει τίποτα. Το στυλ κάθε
// γραμμής μένει το ίδιο αντικείμενο, ώστε οι γραμμές με memo να μην ξαναζωγραφίζονται χωρίς λόγο.
export function VirtualList({ items, rowHeight, height, renderRow, resetKey, className, scrollRef }: P) {
  const own = useRef<HTMLDivElement>(null); const ref = scrollRef || own; const [first, setFirst] = useState(0);
  const styles = useRef<{ h: number; m: Map<number, object> }>({ h: rowHeight, m: new Map() });
  if (styles.current.h !== rowHeight) styles.current = { h: rowHeight, m: new Map() };
  const styleOf = (i: number) => { let st = styles.current.m.get(i); if (!st) { st = { position: 'absolute', top: i * rowHeight, left: 0, right: 0, height: rowHeight }; styles.current.m.set(i, st); } return st; };
  const start = Math.max(0, first - 6); const end = Math.min(items.length, first + Math.ceil(height / rowHeight) + 7);
  useEffect(() => { if (ref.current) { ref.current.scrollTop = 0; setFirst(0); } }, [resetKey === undefined ? items.length : resetKey]);
  return html`<div ref=${ref} className=${cx('vlist', className)} data-rows=${items.length} style=${{ height: Math.min(height, items.length * rowHeight + 2) }} onScroll=${(e: any) => setFirst(Math.floor(e.currentTarget.scrollTop / rowHeight))}>
    <div className="vlist__inner" style=${{ height: items.length * rowHeight }}>
      ${items.slice(start, end).map((it: P, i: number) => renderRow(it, start + i, styleOf(start + i)))}
    </div></div>`;
}
export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, [q]);
  return m;
}
export function useViewportHeight(offset: number) {
  const [h, setH] = useState(() => Math.max(320, window.innerHeight - offset));
  useEffect(() => { const f = () => setH(Math.max(320, window.innerHeight - offset)); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, [offset]);
  return h;
}
/* Strip: λωρίδα κουμπιών που κυλά οριζόντια. Η ροδέλα του ποντικιού την κυλά (χωρίς Shift), οι άκρες σβήνουν
   όταν κρύβονται κουμπιά, και το επιλεγμένο κουμπί φαίνεται πάντα. */
export function Strip({ className, children, ...rest }: P) {
  const ref = useRef<HTMLDivElement>(null); const shown = useRef<string | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const upd = () => { const max = el.scrollWidth - el.clientWidth; el.classList.toggle('fade-l', el.scrollLeft > 2); el.classList.toggle('fade-r', max > 2 && el.scrollLeft < max - 2); };
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const before = el.scrollLeft; el.scrollLeft += e.deltaY;
      if (el.scrollLeft !== before) e.preventDefault();
    };
    const ro = new ResizeObserver(upd); ro.observe(el);
    el.addEventListener('scroll', upd, { passive: true }); el.addEventListener('wheel', wheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener('scroll', upd); el.removeEventListener('wheel', wheel); };
  }, []);
  useEffect(() => {
    // μόνο όταν αλλάζει η επιλογή, για να μη γυρνά πίσω ενώ ο χρήστης κυλά
    const el = ref.current; const on = el && el.querySelector('[aria-pressed="true"]') as HTMLElement | null;
    if (!el || !on || shown.current === on.textContent) return;
    shown.current = on.textContent;
    const l = on.offsetLeft, r = l + on.offsetWidth;   // .strip είναι position:relative
    if (l < el.scrollLeft) el.scrollLeft = l - 24; else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth + 24;
  });
  return html`<div ref=${ref} className=${cx('strip', className)} ...${rest}>${children}</div>`;
}
// Ο υπότιτλος σε μία γραμμή, για να μένει χώρος για τον πίνακα σε 1366×768. Αν δεν χωρά: όλος στη συμβουλή, και με κλικ ανοίγει.
function PageSub({ sub }: P) {
  const ref = useRef<HTMLParagraphElement>(null); const [cut, setCut] = useState(false); const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const f = () => setCut(el.scrollWidth > el.clientWidth + 1);
    f(); const ro = new ResizeObserver(f); ro.observe(el); return () => ro.disconnect();
  });
  const el = ref.current;
  return html`<p ref=${ref} className=${cx('page-head__sub', open && 'is-open', cut && 'is-cut')} data-tip=${cut && !open && el ? el.textContent : undefined} onClick=${cut || open ? () => setOpen(!open) : undefined}>${sub}</p>`;
}
export function PageHeader({ title, sub, children }: P) { return html`<div className="page-head"><div><h1>${title}</h1>${sub && html`<${PageSub} sub=${sub}/>`}</div>${children}</div>`; }
