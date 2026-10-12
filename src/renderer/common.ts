// components/common: επιλογή ατόμου, κατάσταση, ημερομηνίες, προεπισκόπηση Excel, κουμπί εξαγωγής
import { createContext, Fragment, memo, useCallback, useContext, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Badge, Button, Dialog, Icon, Kbd, Strip } from './ui';
import { usePrefs } from './prefs';
import { useStore, useNav, searchPeople } from './store';
import { useToast } from './ui';
import { statusesOn, isHol, holName } from '../shared/rules';
import { TYPES, TYPE_KEYS, effects, fullName, shortName, unitOf, type Status } from '../shared/domain';
import { daysBetween, dayName, dm, dmy, dow, type ISODate } from '../shared/dates';
import type { ExportKind } from '../shared/api';
import type { Check } from '../shared/preflight';
import type { Line } from '../shared/hkaiText';
export { USB_DAYS, usbDue, usbAge } from '../shared/reminders';
type P = any;

export const StatusBadge = memo(function StatusBadge({ statuses, pid, date }: { statuses: Status[]; pid: number; date: ISODate }) {
  const ss = statusesOn(statuses, pid, date);
  if (!ss.length) return html`<${Badge} tone="ok">Παρών<//>`;
  const s = ss[0], t = TYPES[s.type];
  const until = s.open ? ' χωρίς λήξη' : s.from === s.to ? (s.to === date ? '' : ' ' + dm(s.to)) : ' έως ' + dm(s.to);
  return html`<span className="badges"><${Badge} tone=${t.tone} data-tip=${t.long}>${(s.type === 'PUN' ? s.kind || t.label : t.label) + until}<//>${ss.length > 1 && html`<${Badge} tone="outline" data-tip=${'Επίσης: ' + ss.slice(1).map(x => TYPES[x.type].long + (x.open ? ' χωρίς λήξη' : ' έως ' + dm(x.to))).join(' · ')}>+${ss.length - 1}<//>`}</span>`;
});

/* PersonPicker: αναζήτηση χωρίς τόνους/με λατινικά, κατάσταση, λόγος μη διαθεσιμότητας, ένα ή πολλά */
export function PersonPicker({ id, multiple, value, onChange, date, unavailable, placeholder, autoFocus, onBlocked }: P) {
  const { state, today } = useStore();
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [sel, setSel] = useState(0);
  const dq = useDeferredValue(q);
  const chosen: number[] = multiple ? (value || []) : [];
  const pm = useMemo(() => new Map(state.people.map(p => [p.id, p])), [state.people]);
  const items = useMemo(() => searchPeople(state.people, dq).filter(p => !chosen.includes(p.id)).slice(0, 8).map(p => ({ p, na: unavailable ? unavailable(p) : null })), [dq, chosen.join(','), unavailable, state.people]);
  useEffect(() => { const i = items.findIndex(x => !x.na); setSel(i < 0 ? 0 : i); }, [items]);
  const pick = (i: number) => { const x = items[i]; if (!x) return; if (x.na) { if (onBlocked) { setOpen(false); setQ(''); onBlocked(x.p, x.na); } return; } if (multiple) { onChange([...chosen, x.p.id]); setQ(''); } else { setOpen(false); setQ(''); onChange(x.p.id); } };
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
// Κουμπιά ημερών: μέρα από πάνω, ημερομηνία από κάτω· με count (π.χ. κενές θέσεις) δίπλα στην ημερομηνία
export function DateBar({ value, onChange, days, count }: P) {
  const { state, today, tomorrow } = useStore();
  return html`<${Strip} className="datebar" role="group" aria-label="Ημερομηνία">${days.map((d: ISODate) => {
    const hol = isHol(state.settings, d); const n: number | null = count ? count(d) : null;
    const tip = [hol && 'Αργία: ' + holName(state.settings, d), n != null && (n ? n + (n === 1 ? ' κενή θέση' : ' κενές θέσεις') : 'Πλήρης')].filter(Boolean).join(' · ');
    return html`<button key=${d} type="button" className=${cx('daybtn', hol && 'is-hol')} aria-pressed=${value === d} data-tip=${tip || undefined} onClick=${() => onChange(d)}><span className="daybtn__d">${dow(d)}${d === today ? ' σήμερα' : d === tomorrow ? ' αύριο' : ''}</span><span className="daybtn__n">${dm(d)}${n == null ? '' : n ? html` · <b>${n}</b>` : ' ✓'}</span></button>`;
  })}
    <input type="date" className="ui-input datebar__pick" aria-label="Άλλη ημερομηνία" value=${value} onChange=${(e: any) => e.target.value && onChange(e.target.value)}/><//>`;
}

/* ExcelSheet: ζωγραφίζει SheetModel και επισημαίνει τα κελιά που άλλαξαν */
// rich: γραμμές με υπογραμμισμένα κομμάτια (ΗΚΑΙ, ποινές)· το v κρατά το ίδιο κείμενο απλό
export interface Cell { v: string; s: string; cs: number; rs: number; rich?: Line[] }
export interface SheetModel { cols: number[]; rows: (Cell | null)[][] }
export const E = (v: unknown, s?: string, cs?: number, rs?: number): Cell => ({ v: v == null ? '' : String(v), s: s || '', cs: cs || 1, rs: rs || 1 });
// Γραμμή του φύλλου: ξαναζωγραφίζεται μόνο όταν άλλαξε κελί της ή η επισήμανσή της
const sameCell = (a: Cell | null, b: Cell | null) => a === b || (!!a && !!b && a.v === b.v && a.s === b.s && a.cs === b.cs && a.rs === b.rs);
const sameRow = (a: (Cell | null)[], b: (Cell | null)[]) => a === b || (a.length === b.length && a.every((c, i) => sameCell(c, b[i])));
const XlRow = memo(function XlRow({ r, ri, fl, gen }: { r: (Cell | null)[]; ri: number; fl?: Set<number>; gen: number }) {
  return html`<tr><th>${ri + 1}</th>${r.map((c, ci) => { if (!c) return null; const f = !!fl && fl.has(ci); return html`<td key=${ci + (f ? 'f' + gen : '')} colSpan=${c.cs} rowSpan=${c.rs} className=${cx(c.s, f && 'flash')}>${c.rich ? c.rich.map((l, i) => html`<${Fragment} key=${i}>${i > 0 && html`<br/>`}${l.map((r, j) => (r.u ? html`<u key=${j}>${r.t}</u>` : r.t))}<//>`) : c.v}</td>`; })}</tr>`;
}, (a, b) => a.ri === b.ri && a.fl === b.fl && (!a.fl || a.gen === b.gen) && sameRow(a.r, b.r));

// Μεγάλα φύλλα (μηνιαίο πλέγμα: 150 άτομα × 31 μέρες ≈ 6.000 κελιά) σε κομμάτια των 20 γραμμών:
// ζωγραφίζονται μόνο όσα είναι κοντά στην οθόνη, τα άλλα κρατούν μόνο το ύψος τους. Όχι όταν υπάρχουν
// κελιά σε πολλές γραμμές (rowSpan), γιατί δεν κόβονται σε κομμάτια.
const CHUNK = 20, ROW_H = 29;
const chunked = (m: SheetModel) => m.rows.length > CHUNK * 3 && m.rows.every(r => r.every(c => !c || c.rs === 1));
function XlChunk({ i, rows, start, show, h, span, flash, gen, io, heights }: P) {
  const ref = useRef<HTMLTableSectionElement>(null);
  useEffect(() => { const el = ref.current!; io.observe(el); return () => io.unobserve(el); }, [io]);
  useLayoutEffect(() => { if (show) heights.current[i] = ref.current!.offsetHeight; });
  return html`<tbody ref=${ref} data-chunk=${i}>${show ? rows.map((r: (Cell | null)[], k: number) => html`<${XlRow} key=${start + k} r=${r} ri=${start + k} fl=${flash.get(start + k)} gen=${gen}/>`)
    : html`<tr className="xl__gap" style=${{ height: h + 'px' }}><td colSpan=${span}></td></tr>`}</tbody>`;
}

export const ExcelSheet = memo(function ExcelSheet({ model, fileName, sheetName, meta, footer }: { model: SheetModel; fileName: string; sheetName: string; meta?: string; footer?: string }) {
  // Επισήμανση μόνο όταν αλλάζουν κελιά του ίδιου εντύπου (π.χ. ανάθεση)· όχι σε άλλη μέρα/μήνα ή αναζήτηση,
  // όπου αλλάζουν όλα και η επισήμανση χιλιάδων κελιών θα κόλλαγε την οθόνη χωρίς να λέει κάτι
  const prev = useRef<{ model: SheetModel; doc: string } | null>(null); const [flash, setFlash] = useState({ rows: new Map<number, Set<number>>(), gen: 0 });
  useEffect(() => {
    const p = prev.current; const doc = fileName + '|' + sheetName;
    if (p && p.model !== model && p.doc === doc && p.model.rows.length === model.rows.length && p.model.cols.length === model.cols.length) {
      const ch = new Map<number, Set<number>>();
      model.rows.forEach((r, ri) => { const o = p.model.rows[ri]; if (o === r) return; r.forEach((c, ci) => { if (c && !sameCell(c, o[ci])) { let x = ch.get(ri); if (!x) ch.set(ri, x = new Set()); x.add(ci); } }); });
      if (ch.size) setFlash(f => ({ rows: ch, gen: f.gen + 1 }));
    }
    prev.current = { model, doc };
  }, [model]);
  useEffect(() => { if (!flash.rows.size) return; const t = setTimeout(() => setFlash(f => ({ rows: new Map(), gen: f.gen })), 1900); return () => clearTimeout(t); }, [flash]);
  const letters = model.cols.map((_, i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26))));
  // «Χωρά»: το έντυπο μικραίνει ώστε να φαίνεται όλο το πλάτος (CSS zoom, υπολογίζεται μόνο όταν αλλάζει το πλάτος)
  const { prefs, set } = usePrefs(); const fit = prefs.xlZoom === 'fit';
  const box = useRef<HTMLDivElement>(null); const [cw, setCw] = useState(0);
  useEffect(() => {
    const el = box.current; if (!el || !fit) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth)); ro.observe(el); setCw(el.clientWidth);
    return () => ro.disconnect();
  }, [fit]);
  const natural = 28 + model.cols.reduce((a, w) => a + (w || 64), 0);
  const z = fit && cw > 0 && natural > cw ? Math.max(0.4, (cw - 2) / natural) : 1;
  // ποια κομμάτια είναι κοντά στην οθόνη (με περιθώριο, για να μη φαίνεται κενό στο γρήγορο κύλισμα)
  const [vis, setVis] = useState(() => new Set([0, 1]));
  const heights = useRef<number[]>([]);
  const [io] = useState(() => new IntersectionObserver(es => setVis(v => {
    const n = new Set(v); es.forEach(e => { const i = +(e.target as HTMLElement).dataset.chunk!; if (e.isIntersecting) n.add(i); else n.delete(i); });
    return n.size === v.size && [...n].every(i => v.has(i)) ? v : n;
  }), { rootMargin: '600px 0px' }));
  useEffect(() => () => io.disconnect(), [io]);
  const big = useMemo(() => chunked(model), [model]);
  const nc = Math.ceil(model.rows.length / CHUNK);
  const rowH = () => { let h = 0, n = 0; heights.current.forEach((x, i) => { if (x && i < nc) { h += x; n += Math.min(CHUNK, model.rows.length - i * CHUNK); } }); return n ? h / n : ROW_H; };
  const body = big ? Array.from({ length: nc }, (_, i) => {
    const rows = model.rows.slice(i * CHUNK, (i + 1) * CHUNK);
    return html`<${XlChunk} key=${i} i=${i} rows=${rows} start=${i * CHUNK} show=${vis.has(i)} h=${Math.round(rows.length * rowH())} span=${model.cols.length + 1} flash=${flash.rows} gen=${flash.gen} io=${io} heights=${heights}/>`;
  }) : html`<tbody>${model.rows.map((r, ri) => html`<${XlRow} key=${ri} r=${r} ri=${ri} fl=${flash.rows.get(ri)} gen=${flash.gen}/>`)}</tbody>`;
  return html`<div className="xl" aria-label=${'Προεπισκόπηση ' + fileName}>
    <div className="xl__bar"><span className="xl__fn">${fileName}</span><span>· φύλλο «${sheetName}»</span><span className="xl__meta">${meta}</span>
      <button type="button" className="xl__zoom" aria-pressed=${fit} data-tip=${fit ? 'Σε πραγματικό μέγεθος (100%)' : 'Να χωρά όλο το πλάτος'} data-tip-side="left" onClick=${() => set('xlZoom', fit ? '100' : 'fit')}>${fit ? 'Χωρά' + (z < 1 ? ' · ' + Math.round(z * 100) + '%' : '') : '100%'}</button></div>
    <div className="xl__scroll" ref=${box}><table style=${z < 1 ? { width: natural + 'px', minWidth: 0, zoom: z } : undefined}>
      <colgroup><col style=${{ width: '28px' }}/>${model.cols.map((w, i) => html`<col key=${i} style=${w ? { width: w + 'px' } : undefined}/>`)}</colgroup>
      <thead><tr><th></th>${model.cols.map((_, i) => html`<th key=${i}>${letters[i]}</th>`)}</tr></thead>
      ${body}
    </table></div>
    ${footer && html`<div className="xl__foot">${footer}</div>`}
  </div>`;
});

/* Βγάζει ένα έντυπο από το template και ανοίγει το αρχείο στο Excel (ή, με print, την προεπισκόπηση εκτύπωσης).
   Πρώτα ο προέλεγχος (έρευνα §3.6): ✕ σταματά με «Δείξε μου», ⚠ θέλει «Το ξέρω, συνέχισε» και γράφεται στο ιστορικό. */
type Gate = { kind: ExportKind; date: ISODate; label: string; print: boolean; checks: Check[]; resolve: (ok: boolean) => void };
const ExportBusyCtx = createContext<ExportKind | null>(null);
const ExportCtx = createContext<(kind: ExportKind, date: ISODate, label: string, print?: boolean) => Promise<boolean>>(async () => false);
/* Εκτύπωση ενός Excel που υπάρχει ήδη (έντυπο που βγήκε, αρχείο από τα «Αρχεία Excel»), χωρίς Excel */
export function usePrintFile() {
  const toast = useToast();
  return useCallback(async (file: string, sheet?: string) => {
    let r: Awaited<ReturnType<typeof window.api.printFile>>;
    try { r = await window.api.printFile(file, sheet); } catch (e) { r = { ok: false, error: String(e) }; }
    if (!r.ok) toast({ text: html`<span><b>Δεν άνοιξε η εκτύπωση.</b> ${r.error}</span>` });
    return r.ok;
  }, [toast]);
}
const GO: Record<string, (d: ISODate) => [string, Record<string, unknown>]> = {
  guard: d => ['guard', { guardDate: d, }], outs: d => ['outs', { outDate: d }], records: () => ['records', { recTab: 'pun' }],
  settings: () => ['templates', { tab: 'settings' }], people: () => ['people', {}]
};
export function ExportProvider({ children }: P) {
  const toast = useToast(); const { sync } = useStore(); const nav = useNav(); const printFile = usePrintFile();
  const [gate, setGate] = useState<Gate | null>(null);
  // Ποιο έντυπο βγαίνει τώρα: τα κουμπιά δείχνουν «Δημιουργία…» και δεύτερο κλικ δεν ξεκινά δεύτερη εξαγωγή
  const [busy, setBusy] = useState<ExportKind | null>(null); const busyRef = useRef(false);
  const exec = useCallback(async (kind: ExportKind, date: ISODate, label: string, ack: boolean, print = false): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(kind);
    let r: Awaited<ReturnType<typeof window.api.exportFile>>;
    try { r = await window.api.exportFile(kind, date, { open: !print, print, ack }); }
    catch (e) { r = { ok: false, error: String(e) } as typeof r; }
    finally { busyRef.current = false; setBusy(null); }
    if (!r.ok) {
      if (r.checks && r.checks.length) return new Promise<boolean>(resolve => setGate(g => { g && g.resolve(false); return { kind, date, label, print, checks: r.checks!, resolve }; }));
      toast({ text: html`<span><b>Δεν βγήκε ${label}.</b> ${r.error}</span>`, actions: r.locked ? [{ label: 'Ξανά', fn: () => { exec(kind, date, label, ack, print); } }] : undefined });
      return false;
    }
    await sync();   // «βγήκε» και ιστορικό: μόνο ό,τι άλλαξε
    const file = r.file;
    toast({ text: html`<span>Βγήκε ${label}: <b>${file.split(/[\\/]/).pop()}</b>${r.warnings.length ? html`<br/>⚠ ${r.warnings.join(' · ')}` : ''}</span>`, actions: [...(print ? [] : [{ label: 'Εκτύπωση', fn: () => { printFile(file); } }]), { label: 'Φάκελος', fn: () => window.api.openFolder('output') }] });
    return true;
  }, [toast, sync, printFile]);
  const start = useCallback((kind: ExportKind, date: ISODate, label: string, print?: boolean) => exec(kind, date, label, false, !!print), [exec]);
  const close = (ok: boolean) => { const g = gate; setGate(null); g && g.resolve(ok); };
  const errs = gate ? gate.checks.filter(c => c.level === 'err') : [];
  const warns = gate ? gate.checks.filter(c => c.level === 'warn') : [];
  const show = (c: Check) => { const g = gate!; close(false); if (c.go) { const [v, p] = GO[c.go](g.date); nav.go(v, p); } };
  return html`<${ExportCtx.Provider} value=${start}><${ExportBusyCtx.Provider} value=${busy}>${children}
    ${gate && html`<${Dialog} role="alertdialog" title=${errs.length ? 'Δεν μπορεί να βγει ' + gate.label : 'Έλεγχος πριν βγει ' + gate.label} description=${dayName(gate.date) + ' ' + dmy(gate.date)} onClose=${() => close(false)}
      footer=${errs.length ? html`<${Button} data-autofocus="" onClick=${() => close(false)}>Κλείσιμο<//>` : html`<${Button} variant="outline" data-autofocus="" onClick=${() => close(false)}>Άκυρο<//><${Button} onClick=${async () => { const g = gate!; setGate(null); g.resolve(await exec(g.kind, g.date, g.label, true, g.print)); }}>Το ξέρω, συνέχισε<//>`}>
      <ul className="preflight">${[...errs, ...warns].map((c, i) => html`<li key=${i} className=${c.level === 'err' ? 'is-err' : 'is-warn'}><span className="preflight__ic">${c.level === 'err' ? '✕' : '⚠'}</span><span>${c.text}</span>${c.go && html`<${Button} size="sm" variant="link" onClick=${() => show(c)}>Δείξε μου<//>`}</li>`)}</ul>
      <p className="note" style=${{ margin: 0 }}>${errs.length ? 'Διόρθωσε τα ✕ και ξαναδοκίμασε. Έτσι δεν φεύγει ποτέ λάθος έντυπο.' : 'Αν συνεχίσεις, οι προειδοποιήσεις γράφονται στο Ιστορικό.'}</p>
    <//>`}<//><//>`;
}
export const useExport = () => useContext(ExportCtx);
export const useExportBusy = () => useContext(ExportBusyCtx);
export function ExportButton({ kind, date, label, variant, size, disabled }: P) {
  const ex = useExport(); const busy = useExportBusy();
  return html`<${Fragment}><${Button} variant=${variant} size=${size} disabled=${!!busy || disabled} onClick=${() => ex(kind, date, label)}>${busy === kind ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//><${PrintButton} kind=${kind} date=${date} label=${label} size=${size} disabled=${disabled}/><//>`;
}
/* Εκτύπωση: βγαίνει το Excel όπως πάντα και ανοίγει προεπισκόπηση με τον διάλογο εκτυπωτή των Windows (χωρίς Excel) */
export function PrintButton({ kind, date, label, variant = 'ghost', size, disabled }: P) {
  const ex = useExport(); const busy = useExportBusy();
  return html`<${Button} variant=${variant} size=${size} disabled=${!!busy || disabled} onClick=${() => ex(kind, date, label, true)} data-tip="Βγαίνει το Excel και ανοίγει προεπισκόπηση εκτύπωσης. Δεν χρειάζεται Excel.">${Icon.print}Εκτύπωση<//>`;
}
export function TemplateNote({ ids }: { ids: string[] }) {
  const { boot, state } = useStore(); const nav = useNav();
  const spen = state.settings.phase === 'spen';
  const ts = ids.map(id => boot.templates.find(t => t.id === id && (id !== 'froura' || (t.file === 'froura-spen.xlsx') === spen))).filter(Boolean) as Boot['templates'];
  return html`<span className="tplnote">Από template: ${ts.map((t, i) => html`<span key=${t.file}>${i ? ', ' : ''}<b>${t.name}</b>${t.custom ? ' (δικό σου)' : ''}</span>`)} · <${Button} variant="link" onClick=${() => nav.go('templates')}>Templates<//></span>`;
}
type Boot = import('../shared/api').Boot;

/* Ορατό ενεργό φίλτρο με ✕ (έρευνα §3.7) */
export function ActiveFilter({ parts, onClear, extra }: { parts: (string | false | null | undefined)[]; onClear: () => void; extra?: any }) {
  const ps = parts.filter(Boolean) as string[];
  if (!ps.length) return null;
  return html`<span className="actfilter" role="status">Φίλτρο: <b>${ps.join(' · ')}</b>${extra}<button type="button" aria-label="Καθάρισε το φίλτρο" data-tip="Καθάρισε το φίλτρο" onClick=${onClear}>✕</button></span>`;
}

/* Αντίγραφο σε USB (έρευνα §4.2): ένα κουμπί, και υπενθύμιση στο «Σήμερα» αν πέρασαν πάνω από 7 μέρες */
export function useUsbCopy() {
  const { refresh } = useStore(); const toast = useToast();
  return useCallback(async () => {
    const r = await window.api.usbCopy(); if (!r) return false;
    if (!r.ok) { toast({ text: html`<span><b>Δεν έγινε.</b> ${r.error}</span>` }); return false; }
    await refresh();
    toast({ text: r.warning ? html`<span><b>Πάρθηκε αντίγραφο, αλλά:</b> ${r.warning}</span>` : 'Πάρθηκε αντίγραφο στο ' + r.file + '. Κράτα το USB έξω από το PC.' });
    return true;
  }, [refresh, toast]);
}

/* Υπόμνημα κωδικών (έρευνα 10): τι σημαίνει κάθε κωδικός και τι κάνει στην εφαρμογή. Βγαίνει από τον ίδιο πίνακα που χρησιμοποιούν οι κανόνες. */
const SHORTCUTS: [string, string][] = [
  ['Ctrl K', 'Αναζήτηση προσώπου ή ενέργειας από οπουδήποτε'], ['Ctrl F', 'Αναζήτηση στη λίστα της οθόνης'], ['Ctrl N', 'Δήλωσε κατάσταση (ιατρικό, άδεια, έξοδος, ποινή)'],
  ['Ctrl Z', 'Αναίρεση της τελευταίας ενέργειας'], ['Alt 1 … 9', 'Σήμερα, Προσωπικό, Υπηρεσίες, Εξοδούχοι, Ιατρικά, Δύναμη, ΗΚΑΙ, Ιστορικό, Ρυθμίσεις'],
  ['Alt ←', 'Πίσω στην προηγούμενη οθόνη (και το πλαϊνό κουμπί του ποντικιού)'], ['Ctrl B', 'Μενού πλήρες ή μόνο εικονίδια'], ['F1', 'Αυτό το υπόμνημα'], ['Esc', 'Κλείσιμο παραθύρου ή καρτέλας']
];
export function LegendDialog({ onClose }: { onClose: () => void }) {
  const CAT: Record<string, string> = { med: 'Ιατρικό', other: 'Άλλο', pun: 'Ποινή', abs: 'Απουσία', out: 'Έξοδος' };
  return html`<${Dialog} size="lg" title="Υπόμνημα κωδικών" description="Τι σημαίνει κάθε κωδικός και τι αλλάζει στις υπηρεσίες, στις εξόδους και στην ΗΚΑΙ." onClose=${onClose} footer=${html`<${Button} onClick=${onClose}>Κλείσιμο<//>`}>
    <table className="legend"><thead><tr><th>Κωδικός</th><th>Σημαίνει</th><th>Τι κάνει</th></tr></thead><tbody>
      ${TYPE_KEYS.map(k => { const t = TYPES[k]; return html`<tr key=${k}><td><${Badge} tone=${t.tone}>${t.label}<//></td><td>${t.long}<small className="muted"> · ${CAT[t.cat] || t.cat}${t.code ? ' · στο ημερολόγιο: ' + t.code : ''}</small></td><td>${effects(t) || 'Μπαίνει κανονικά σε υπηρεσίες και έξοδο'}${k === 'PUN' ? '. Αιτείται στην ΗΚΑΙ και ισχύει όταν εγκριθεί.' : ''}</td></tr>`; })}
    </tbody></table>
    <p className="note" style=${{ margin: '10px 0 0' }}>Στις υπηρεσίες: <b>Ένοπλη</b> θέση = δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ. <b>★</b> = υπηρεσία σε ΣΚ ή αργία. <b>⚠</b> = πέρασε παρά τον κανόνα. Στον έλεγχο υπηρεσιών: Θ θαλαμοφύλακας · Μ μαγειρεία · ΛΥ Λ/Υ-Δ/Υ.</p>
    <h3 style=${{ fontSize: '15px', margin: '14px 0 6px' }}>Συντομεύσεις</h3>
    <table className="legend"><tbody>${SHORTCUTS.map(([k, t]) => html`<tr key=${k}><td className="nw"><${Kbd}>${k}<//></td><td>${t}</td></tr>`)}</tbody></table>
  <//>`;
}
