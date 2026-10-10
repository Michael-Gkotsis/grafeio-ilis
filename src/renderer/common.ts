// components/common: επιλογή ατόμου, κατάσταση, ημερομηνίες, προεπισκόπηση Excel, κουμπί εξαγωγής
import { createContext, memo, useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Badge, Button, Dialog } from './ui';
import { useStore, useNav, searchPeople } from './store';
import { useToast } from './ui';
import { statusesOn, isHol, holName } from '../shared/rules';
import { TYPES, fullName, shortName, unitOf, type Status } from '../shared/domain';
import { daysBetween, dayName, dm, dmy, type ISODate } from '../shared/dates';
import type { ExportKind } from '../shared/api';
import type { Check } from '../shared/preflight';
type P = any;

export const StatusBadge = memo(function StatusBadge({ statuses, pid, date }: { statuses: Status[]; pid: number; date: ISODate }) {
  const ss = statusesOn(statuses, pid, date);
  if (!ss.length) return html`<${Badge} tone="ok">Παρών<//>`;
  const s = ss[0], t = TYPES[s.type];
  const until = s.from === s.to ? (s.to === date ? '' : ' ' + dm(s.to)) : ' έως ' + dm(s.to);
  return html`<span className="badges"><${Badge} tone=${t.tone} data-tip=${t.long}>${(s.type === 'PUN' ? s.kind || t.label : t.label) + until}<//>${ss.length > 1 && html`<${Badge} tone="outline" data-tip=${'Επίσης: ' + ss.slice(1).map(x => TYPES[x.type].long + ' έως ' + dm(x.to)).join(' · ')}>+${ss.length - 1}<//>`}</span>`;
});

/* PersonPicker: αναζήτηση χωρίς τόνους/με λατινικά, κατάσταση, λόγος μη διαθεσιμότητας, ένα ή πολλά */
export function PersonPicker({ id, multiple, value, onChange, date, unavailable, placeholder, autoFocus }: P) {
  const { state, today } = useStore();
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [sel, setSel] = useState(0);
  const dq = useDeferredValue(q);
  const chosen: number[] = multiple ? (value || []) : [];
  const pm = useMemo(() => new Map(state.people.map(p => [p.id, p])), [state.people]);
  const items = useMemo(() => searchPeople(state.people, dq).filter(p => !chosen.includes(p.id)).slice(0, 8).map(p => ({ p, na: unavailable ? unavailable(p) : null })), [dq, chosen.join(','), unavailable, state.people]);
  useEffect(() => { const i = items.findIndex(x => !x.na); setSel(i < 0 ? 0 : i); }, [items]);
  const pick = (i: number) => { const x = items[i]; if (!x || x.na) return; if (multiple) { onChange([...chosen, x.p.id]); setQ(''); } else { setOpen(false); setQ(''); onChange(x.p.id); } };
  return html`<div className="picker">
    ${multiple && chosen.length > 0 && html`<div className="picker__chips">${chosen.map(pid => html`<span key=${pid} className="picker__chip">${shortName(pm.get(pid)!)}<button type="button" aria-label=${'Αφαίρεση ' + shortName(pm.get(pid)!)} onClick=${() => onChange(chosen.filter(x => x !== pid))}>✕</button></span>`)}</div>`}
    <input id=${id} className="ui-input" autoComplete="off" role="combobox" aria-expanded=${open} data-autofocus=${autoFocus ? '' : undefined}
      placeholder=${placeholder || (multiple && chosen.length ? 'Πρόσθεσε κι άλλον…' : 'Επώνυμο, όνομα ή ΑΣΜ…')} value=${q}
      onChange=${(e: any) => { setQ(e.target.value); setOpen(true); }} onFocus=${() => setOpen(true)} onBlur=${() => setTimeout(() => setOpen(false), 150)}
      onKeyDown=${(e: any) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setSel(s => Math.min(items.length - 1, s + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); } else if (e.key === 'Enter') { e.preventDefault(); pick(sel); } else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } else if (e.key === 'Backspace' && !q && multiple && chosen.length) { onChange(chosen.slice(0, -1)); } }}/>
    ${open && html`<ul className="picker__list" role="listbox">
      ${items.length === 0 ? html`<li className="picker__hd">Κανείς δεν ταιριάζει. Δοκίμασε μόνο τα πρώτα γράμματα του επωνύμου.</li>` :
      items.map((x, i) => html`<li key=${x.p.id} role="option" aria-selected=${i === sel} className=${cx('picker__opt', x.na && 'picker__opt--na')} onMouseDown=${(e: any) => { e.preventDefault(); pick(i); }} onMouseEnter=${() => setSel(i)}>
        <div><b>${fullName(x.p)}</b><small>του ${x.p.father || '—'} · ${x.p.rank} · ${unitOf(x.p)}${x.p.room != null ? ' · Θ' + x.p.room : ''}</small></div>
        ${x.na ? html`<${Badge}>${x.na}<//>` : html`<${StatusBadge} statuses=${state.statuses} pid=${x.p.id} date=${date || today}/>`}</li>`)}
    </ul>`}
  </div>`;
}
export function DateRangeField({ from, to, onChange }: P) {
  const { today } = useStore();
  const n = daysBetween(from, to);
  return html`<div className="field"><div className="field-row">
    <div className="field"><label className="field__label" htmlFor="dr-from">Από *</label><input id="dr-from" type="date" className="ui-input" value=${from} onChange=${(e: any) => { const f = e.target.value; if (f) onChange(f, to < f ? f : to); }}/><span className="field__help">${dayName(from, today)}</span></div>
    <div className="field"><label className="field__label" htmlFor="dr-to">Έως *</label><input id="dr-to" type="date" className="ui-input" min=${from} value=${to} onChange=${(e: any) => { const t = e.target.value; if (t) onChange(from, t < from ? from : t); }}/><span className="field__help">${dayName(to, today)}</span></div>
  </div><span className="field__help">Διάρκεια: ${n} ${n === 1 ? 'ημέρα' : 'ημέρες'} (μετρούν και οι δύο ημερομηνίες)</span></div>`;
}
export function ChangePlanList({ plan }: P) {
  return html`<ul className="plan">${plan.files.map((f: P, i: number) => html`<li key=${i} className=${f.warn ? 'is-warn' : ''}><span className="plan__ic">${f.warn ? '!' : '✓'}</span><div><span className="plan__fn">${f.fn}</span><small>${f.desc}</small></div></li>`)}</ul>`;
}
export function DateBar({ value, onChange, days }: P) {
  const { state, today, tomorrow } = useStore();
  return html`<div className="datebar" role="group" aria-label="Ημερομηνία">${days.map((d: ISODate) => html`<button key=${d} type="button" className=${cx('ui-chip', isHol(state.settings, d) && 'is-hol')} aria-pressed=${value === d} data-tip=${isHol(state.settings, d) ? 'Αργία: ' + holName(state.settings, d) : undefined} onClick=${() => onChange(d)}>${d === today || d === tomorrow ? dayName(d, today) + ' ' + dm(d) : dayName(d, today)}</button>`)}
    <input type="date" className="ui-input" style=${{ width: '150px', height: '34px' }} aria-label="Άλλη ημερομηνία" value=${value} onChange=${(e: any) => e.target.value && onChange(e.target.value)}/></div>`;
}

/* ExcelSheet: ζωγραφίζει SheetModel και επισημαίνει τα κελιά που άλλαξαν */
export interface Cell { v: string; s: string; cs: number; rs: number }
export interface SheetModel { cols: number[]; rows: (Cell | null)[][] }
export const E = (v: unknown, s?: string, cs?: number, rs?: number): Cell => ({ v: v == null ? '' : String(v), s: s || '', cs: cs || 1, rs: rs || 1 });
export const ExcelSheet = memo(function ExcelSheet({ model, fileName, sheetName, meta, footer }: { model: SheetModel; fileName: string; sheetName: string; meta?: string; footer?: string }) {
  const prev = useRef<SheetModel | null>(null); const [flash, setFlash] = useState({ keys: new Set<string>(), gen: 0 });
  useEffect(() => {
    const p = prev.current;
    if (p && p !== model) { const ch = new Set<string>(); model.rows.forEach((r, ri) => r.forEach((c, ci) => { if (!c) return; const o = p.rows[ri] && p.rows[ri][ci]; if (!o || o.v !== c.v || o.s !== c.s) ch.add(ri + ':' + ci); })); if (ch.size) setFlash(f => ({ keys: ch, gen: f.gen + 1 })); }
    prev.current = model;
  }, [model]);
  useEffect(() => { if (!flash.keys.size) return; const t = setTimeout(() => setFlash(f => ({ keys: new Set(), gen: f.gen })), 1900); return () => clearTimeout(t); }, [flash]);
  const letters = model.cols.map((_, i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26))));
  return html`<div className="xl" aria-label=${'Προεπισκόπηση ' + fileName}>
    <div className="xl__bar"><span className="xl__fn">${fileName}</span><span>· φύλλο «${sheetName}»</span><span className="xl__meta">${meta}</span></div>
    <div className="xl__scroll"><table>
      <colgroup><col style=${{ width: '28px' }}/>${model.cols.map((w, i) => html`<col key=${i} style=${w ? { width: w + 'px' } : undefined}/>`)}</colgroup>
      <thead><tr><th></th>${model.cols.map((_, i) => html`<th key=${i}>${letters[i]}</th>`)}</tr></thead>
      <tbody>${model.rows.map((r, ri) => html`<tr key=${ri}><th>${ri + 1}</th>${r.map((c, ci) => { if (!c) return null; const f = flash.keys.has(ri + ':' + ci); return html`<td key=${ci + (f ? 'f' + flash.gen : '')} colSpan=${c.cs} rowSpan=${c.rs} className=${cx(c.s, f && 'flash')}>${c.v}</td>`; })}</tr>`)}</tbody>
    </table></div>
    ${footer && html`<div className="xl__foot">${footer}</div>`}
  </div>`;
});

/* Βγάζει ένα έντυπο από το template και ανοίγει το αρχείο στο Excel.
   Πρώτα ο προέλεγχος (έρευνα §3.6): ✕ σταματά με «Δείξε μου», ⚠ θέλει «Το ξέρω, συνέχισε» και γράφεται στο ιστορικό. */
type Gate = { kind: ExportKind; date: ISODate; label: string; checks: Check[]; resolve: (ok: boolean) => void };
const ExportCtx = createContext<(kind: ExportKind, date: ISODate, label: string) => Promise<boolean>>(async () => false);
const GO: Record<string, (d: ISODate) => [string, Record<string, unknown>]> = {
  guard: d => ['guard', { guardDate: d, }], outs: d => ['outs', { outDate: d }], records: () => ['records', { recTab: 'pun' }],
  settings: () => ['templates', { tab: 'settings' }], people: () => ['people', {}]
};
export function ExportProvider({ children }: P) {
  const toast = useToast(); const { refresh } = useStore(); const nav = useNav();
  const [gate, setGate] = useState<Gate | null>(null);
  const exec = useCallback(async (kind: ExportKind, date: ISODate, label: string, ack: boolean): Promise<boolean> => {
    const r = await window.api.exportFile(kind, date, { open: true, ack });
    if (!r.ok) {
      if (r.checks && r.checks.length) return new Promise<boolean>(resolve => setGate({ kind, date, label, checks: r.checks!, resolve }));
      toast({ text: html`<span><b>Δεν βγήκε ${label}.</b> ${r.error}</span>`, actions: r.locked ? [{ label: 'Ξανά', fn: () => { exec(kind, date, label, ack); } }] : undefined });
      return false;
    }
    await refresh();
    toast({ text: html`<span>Βγήκε ${label}: <b>${r.file.split(/[\\/]/).pop()}</b>${r.warnings.length ? html`<br/>⚠ ${r.warnings.join(' · ')}` : ''}</span>`, actions: [{ label: 'Φάκελος', fn: () => window.api.openFolder('output') }] });
    return true;
  }, [toast, refresh]);
  const start = useCallback((kind: ExportKind, date: ISODate, label: string) => exec(kind, date, label, false), [exec]);
  const close = (ok: boolean) => { const g = gate; setGate(null); g && g.resolve(ok); };
  const errs = gate ? gate.checks.filter(c => c.level === 'err') : [];
  const warns = gate ? gate.checks.filter(c => c.level === 'warn') : [];
  const show = (c: Check) => { const g = gate!; close(false); if (c.go) { const [v, p] = GO[c.go](g.date); nav.go(v, p); } };
  return html`<${ExportCtx.Provider} value=${start}>${children}
    ${gate && html`<${Dialog} role="alertdialog" title=${errs.length ? 'Δεν μπορεί να βγει ' + gate.label : 'Έλεγχος πριν βγει ' + gate.label} description=${dayName(gate.date) + ' ' + dmy(gate.date)} onClose=${() => close(false)}
      footer=${errs.length ? html`<${Button} data-autofocus="" onClick=${() => close(false)}>Κλείσιμο<//>` : html`<${Button} variant="outline" data-autofocus="" onClick=${() => close(false)}>Άκυρο<//><${Button} onClick=${async () => { const g = gate!; setGate(null); g.resolve(await exec(g.kind, g.date, g.label, true)); }}>Το ξέρω, συνέχισε<//>`}>
      <ul className="preflight">${[...errs, ...warns].map((c, i) => html`<li key=${i} className=${c.level === 'err' ? 'is-err' : 'is-warn'}><span className="preflight__ic">${c.level === 'err' ? '✕' : '⚠'}</span><span>${c.text}</span>${c.go && html`<${Button} size="sm" variant="link" onClick=${() => show(c)}>Δείξε μου<//>`}</li>`)}</ul>
      <p className="note" style=${{ margin: 0 }}>${errs.length ? 'Διόρθωσε τα ✕ και ξαναδοκίμασε. Έτσι δεν φεύγει ποτέ λάθος έντυπο.' : 'Αν συνεχίσεις, οι προειδοποιήσεις γράφονται στο Ιστορικό.'}</p>
    <//>`}<//>`;
}
export const useExport = () => useContext(ExportCtx);
export function ExportButton({ kind, date, label, variant, size, disabled }: P) {
  const ex = useExport(); const [busy, setBusy] = useState(false);
  return html`<${Button} variant=${variant} size=${size} disabled=${busy || disabled} onClick=${async () => { setBusy(true); try { await ex(kind, date, label); } finally { setBusy(false); } }}>${busy ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>`;
}
export function TemplateNote({ ids }: { ids: string[] }) {
  const { boot } = useStore(); const nav = useNav();
  const ts = ids.map(id => boot.templates.find(t => t.id === id)).filter(Boolean) as Boot['templates'];
  return html`<span className="tplnote">Από template: ${ts.map((t, i) => html`<span key=${t.id}>${i ? ', ' : ''}<b>${t.name}</b>${t.custom ? ' (δικό σου)' : ''}</span>`)} · <${Button} variant="link" onClick=${() => nav.go('templates')}>Templates<//></span>`;
}
type Boot = import('../shared/api').Boot;

/* Ορατό ενεργό φίλτρο με ✕ (έρευνα §3.7) */
export function ActiveFilter({ parts, onClear }: { parts: (string | false | null | undefined)[]; onClear: () => void }) {
  const ps = parts.filter(Boolean) as string[];
  if (!ps.length) return null;
  return html`<span className="actfilter" role="status">Φίλτρο: <b>${ps.join(' · ')}</b><button type="button" aria-label="Καθάρισε το φίλτρο" data-tip="Καθάρισε το φίλτρο" onClick=${onClear}>✕</button></span>`;
}
