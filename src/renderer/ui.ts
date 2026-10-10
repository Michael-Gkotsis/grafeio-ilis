// components/ui: Button, Badge, Card, Dialog, Sheet, Toast… (ίδια με το mockup)
import React, { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import htm from 'htm';

export const html = htm.bind(React.createElement) as (strings: TemplateStringsArray, ...values: any[]) => any;
export const cx = (...a: unknown[]) => a.filter(Boolean).join(' ');
type P = any;

const svg = (d: string, extra = '') => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" ...${extra ? { width: extra, height: extra } : {}} dangerouslySetInnerHTML=${{ __html: d }}></svg>`;
export const Icon: Record<string, any> = {
  home: svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  people: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.7.2 4.6 2 5.3 5"/>'),
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
  shield: svg('<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>', '22')
};

export function Button({ variant = 'default', size, className, children, ...rest }: P) {
  return html`<button type="button" className=${cx('ui-btn', 'ui-btn--' + variant, size && 'ui-btn--' + size, className)} ...${rest}>${children}</button>`;
}
export const Badge = ({ tone, children, ...rest }: P) => html`<span className=${cx('ui-badge', tone && 'ui-badge--' + tone)} ...${rest}>${children}</span>`;
export const Kbd = ({ children }: P) => html`<kbd className="ui-kbd">${children}</kbd>`;
export function Card({ title, actions, children }: P) {
  return html`<section className="ui-card">${title && html`<div className="ui-card__head"><h2>${title}</h2>${actions}</div>`}<div className="ui-card__body">${children}</div></section>`;
}
export const Alert = ({ tone, children }: P) => html`<div className=${cx('ui-alert', tone && 'ui-alert--' + tone)} role=${tone === 'bad' ? 'alert' : undefined}>${children}</div>`;
export function Tabs({ value, onChange, items }: P) {
  return html`<div className="ui-tabs" role="tablist">${items.map((it: P) => html`<button key=${it.value} type="button" role="tab" aria-selected=${value === it.value} onClick=${() => onChange(it.value)}>${it.label}</button>`)}</div>`;
}
export function Segmented({ value, onChange, items, small }: P) {
  return html`<div className=${cx('ui-seg', small && 'ui-seg--sm')} role="group">${items.map((it: P) => html`<button key=${it.value} type="button" aria-pressed=${value === it.value} data-tip=${it.tip} onClick=${() => onChange(it.value)}>${it.label}</button>`)}</div>`;
}
export function useEscape(fn: () => void) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); ref.current(); } }; document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h); }, []);
}
export function Dialog({ title, description, onClose, children, footer, size, closeOnOverlay = true, role = 'dialog' }: P) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(onClose);
  useEffect(() => {
    const el = ref.current; const f = el && (el.querySelector('[data-autofocus]') || el.querySelector('.ui-dialog__foot .ui-btn--default,.ui-dialog__body input')) as HTMLElement | null;
    f && f.focus(); const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; };
  }, []);
  return createPortal(html`<div className="ui-overlay" onMouseDown=${(e: MouseEvent) => { if (e.target === e.currentTarget && closeOnOverlay) onClose(); }}>
    <div ref=${ref} className=${cx('ui-dialog', size === 'lg' && 'ui-dialog--lg')} role=${role} aria-modal="true" aria-labelledby="dlg-t">
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
export function VirtualList({ items, rowHeight, height, renderRow, resetKey }: P) {
  const ref = useRef<HTMLDivElement>(null); const [top, setTop] = useState(0);
  const start = Math.max(0, Math.floor(top / rowHeight) - 6); const end = Math.min(items.length, Math.ceil((top + height) / rowHeight) + 6);
  useEffect(() => { if (ref.current) { ref.current.scrollTop = 0; setTop(0); } }, [resetKey === undefined ? items.length : resetKey]);
  return html`<div ref=${ref} className="vlist" style=${{ height: Math.min(height, items.length * rowHeight + 2) }} onScroll=${(e: any) => setTop(e.currentTarget.scrollTop)}>
    <div className="vlist__inner" style=${{ height: items.length * rowHeight }}>
      ${items.slice(start, end).map((it: P, i: number) => renderRow(it, start + i, { position: 'absolute', top: (start + i) * rowHeight, left: 0, right: 0, height: rowHeight }))}
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
export function PageHeader({ title, sub, children }: P) { return html`<div className="page-head"><div><h1>${title}</h1>${sub && html`<p>${sub}</p>`}</div>${children}</div>`; }
