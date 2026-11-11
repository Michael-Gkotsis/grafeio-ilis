// components/common: επιλογή ατόμου, κατάσταση, ημερομηνίες, προεπισκόπηση Excel, κουμπί εξαγωγής
import { HK } from '../shared/unit';
import { createContext, Fragment, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Alert, Button, Dialog, DialogLeave, Icon, Segmented } from './ui';
import { requestLeave } from './pending';
import { Combo, Select } from './select';
import { usePrefs } from './prefs';
import { useStore, useNav } from './store';
import { useToast } from './ui';
import { DEFAULT_HK_TIME } from '../shared/rules';
import { outTimesTxt } from '../shared/returns';
import { SHIFT_EVERY, MAX_SHIFT_OWN, dutyStartOf, hoursTxt, phaseBase, shiftList, shiftReport, shiftSlots, type Rules, type Settings, type ShiftDef, type ShiftOwn } from '../shared/domain';
import { dayName, dmy, type ISODate } from '../shared/dates';
import { normTime } from '../shared/hours';
import type { ExportKind } from '../shared/api';
import { sigFormOf, sigsSaved, sigsText, type Sig } from '../shared/sigs';
import { SigsDialog } from './sigs';
import { LayoutDialog } from './layout';
import { dropSigMoves, type Layout, type LayoutForm } from '../shared/layout';
import type { Check } from '../shared/preflight';
import type { Line } from '../shared/hkaiText';
export { USB_DAYS, usbDue, usbAge } from '../shared/reminders';
// Deprecated path: the domain-free fields moved to shared/ui (Phase 5.2), and the date/time fields and the two
// dialogs with them (Phase 5.3a); StatusBadge, PersonPicker and ChangePlanList moved to entities/ (Phase 5.3a).
import { TimeField, useTimeOptions } from './shared/ui';
export {
  ChoiceField, DateBar, DateField, DateRangeField, LegendDialog, MonthField, RangeField, TimeField, UnsavedDialog,
  useTimeOptions, type TimeQuick,
} from './shared/ui';
export { PersonPicker, StatusBadge } from './entities/person';
export { ChangePlanList } from './entities/status';
type P = any;

// Τι κάνουν οι ώρες (Michael, 13/10 και 18/10): υπηρεσίες, έξοδος την ημέρα της επιστροφής, ΗΚΑΙ
// Ώρες μιας υπηρεσίας (Michael, 20/10: «μια υπηρεσία μπορεί να μην έχει ωράρια»): όλη μέρα, ίδιες ώρες για κάθε θέση, ή
// βάρδιες που αλλάζουν κάθε τόσο. rot: υπηρεσία του εντύπου με νούμερα (θαλαμοφύλακες…), μόνο βάρδιες. labels: τα νούμερα.
export type HoursMode = 'day' | 'fixed' | 'shift';
const everyTxt = (m: number) => (m % 60 ? (m - 30) / 60 + '½ ώρα' : m === 60 ? '1 ώρα' : m / 60 + ' ώρες');
// Η φόρμα των βαρδιών: every/from/to όπως πριν· own = «Δικές μου βάρδιες» (list: ώρες γραμμένες όπως τις έγραψε, n = νούμερο από 0)
export type ShiftForm = { every: number; from?: string; to?: string; own?: boolean; list?: ShiftOwn[] };
export const shiftForm = (b?: { shift?: ShiftDef | null } | null): ShiftForm => ({ every: b?.shift?.every || 120, from: b?.shift?.from || '', to: b?.shift?.to || '', own: !!b?.shift?.list?.length, list: b?.shift?.list || [] });
export const shiftOf = (sh: ShiftForm): ShiftDef => ({ every: sh.every, ...(normTime(sh.from) ? { from: normTime(sh.from)! } : {}), ...(normTime(sh.to) ? { to: normTime(sh.to)! } : {}),
  ...(sh.own ? { list: (sh.list || []).map(x => ({ from: normTime(x.from) || '', to: normTime(x.to) || '', n: x.n })) } : {}) });
// Γιατί δεν αποθηκεύονται οι βάρδιες (κενό = εντάξει): άκυρη ώρα, ίδιες ώρες Από και Ως, άδεια λίστα. Επικαλύψεις και κενά μόνο προειδοποιούν.
export const shiftWhy = (sh: ShiftForm) => {
  if (!sh.own) return normTime(sh.from) == null || normTime(sh.to) == null ? 'Οι βάρδιες δεν είναι σωστές' : '';
  const l = sh.list || []; if (!l.length) return 'Γράψε τουλάχιστον μία βάρδια';
  for (let i = 0; i < l.length; i++) {
    const a = normTime(l[i].from), b = normTime(l[i].to);
    if (!a || !b) return 'Στη βάρδια ' + (i + 1) + ' γράψε σωστά Από και Ως (π.χ. 14:00)';
    if (a === b) return 'Στη βάρδια ' + (i + 1) + ' οι ώρες Από και Ως είναι ίδιες';
  }
  return '';
};
export const shiftBad = (sh: ShiftForm) => !!shiftWhy(sh);
const addH = (t: string, h: number) => { const m = normTime(t); return m ? String(((+m.slice(0, 2) + h) % 24)).padStart(2, '0') + m.slice(2) : ''; };
const plural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);
// «Δικές μου βάρδιες» (Michael, 24/10): λίστα με νούμερο, Από, Ως· προεπισκόπηση ανά νούμερο και προειδοποιήσεις (δεν εμποδίζουν)
function OwnShifts({ id, sh, setSh, labels, start }: P) {
  const opts = useTimeOptions(); const list: ShiftOwn[] = sh.list || [];
  const last = labels.length - 1; const nOf = (x: ShiftOwn) => Math.min(Math.max(0, x.n | 0), last);
  const set = (i: number, patch: Partial<ShiftOwn>) => setSh({ ...sh, list: list.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const clean = list.map(x => ({ from: normTime(x.from) || '', to: normTime(x.to) || '', n: nOf(x) }));
  const rep = shiftReport(start, clean, labels.length);
  const slots = shiftSlots(start, { every: sh.every, list: clean }, labels.length);
  const txt = (x: ShiftOwn) => labels[x.n] + ' ' + x.from + '-' + x.to;
  const warn = [
    ...rep.overlaps.slice(0, 3).map(o => 'Οι βάρδιες «' + txt(clean[o.a]) + '» και «' + txt(clean[o.b]) + '» πέφτουν μαζί ' + o.from + '-' + o.to + '.'),
    ...(rep.overlaps.length > 3 ? ['Και άλλες ' + (rep.overlaps.length - 3) + ' επικαλύψεις.'] : []),
    ...rep.gaps.slice(0, 3).map(g => 'Κενό ' + g.from + '-' + g.to + ': δεν φυλάει κανείς.'),
    ...(rep.gaps.length > 3 ? ['Και άλλα ' + (rep.gaps.length - 3) + ' κενά.'] : []),
    ...(rep.empty.length && list.length ? ['Χωρίς καμία βάρδια: ' + rep.empty.map(n => labels[n]).join(', ') + '.'] : [])
  ];
  const add = () => { const l = list[list.length - 1]; const from = (l && normTime(l.to)) || start; setSh({ ...sh, list: [...list, { from, to: addH(from, 2), n: l ? (nOf(l) + 1) % labels.length : 0 }] }); };
  const norm = (i: number, k: 'from' | 'to') => { const t = normTime(list[i][k]); if (t != null && t !== list[i][k]) set(i, { [k]: t }); };
  return html`<${Fragment}>
    <div className="shiftown" role="group" aria-label="Δικές μου βάρδιες">
      ${list.length > 0 && html`<div className="shiftown__row shiftown__head"><span>Νούμερο</span><span>Από</span><span>Ως</span><span/></div>`}
      ${list.map((x, i) => { const bad = (k: 'from' | 'to') => normTime(x[k]) == null || (k === 'to' && !!x.to && normTime(x.to) === normTime(x.from)) || undefined;
        return html`<div key=${i} className="shiftown__row">
          <${Select} className="ui-input" aria-label=${'Βάρδια ' + (i + 1) + ': νούμερο'} value=${nOf(x)} onChange=${(e: any) => set(i, { n: +e.target.value })}>${labels.map((l: string, j: number) => html`<option key=${j} value=${j}>${l}</option>`)}<//>
          <${Combo} className="ui-input" inputMode="numeric" options=${opts} placeholder="14:00" aria-label=${'Βάρδια ' + (i + 1) + ': από'} value=${x.from} aria-invalid=${bad('from')} onChange=${(e: any) => set(i, { from: e.target.value })} onBlur=${() => norm(i, 'from')}/>
          <${Combo} className="ui-input" inputMode="numeric" options=${opts} placeholder="16:00" aria-label=${'Βάρδια ' + (i + 1) + ': ως'} value=${x.to} aria-invalid=${bad('to')} onChange=${(e: any) => set(i, { to: e.target.value })} onBlur=${() => norm(i, 'to')}/>
          <${Button} variant="outline" className="shiftown__x" aria-label=${'Αφαίρεση βάρδιας ' + (i + 1)} data-tip="Αφαίρεση" onClick=${() => setSh({ ...sh, list: list.filter((_, j) => j !== i) })}>✕<//></div>`; })}
      <div className="toolbar"><${Button} variant="outline" size="sm" disabled=${list.length >= MAX_SHIFT_OWN} data-tip=${list.length >= MAX_SHIFT_OWN ? 'Ως ' + MAX_SHIFT_OWN + ' βάρδιες' : undefined} onClick=${add}>+ Βάρδια<//>
        <${Button} variant="outline" size="sm" data-tip="Αντικαθιστά τη λίστα με τις βάρδιες του «Κάθε τόσες ώρες» που έχεις τώρα στα πεδία" onClick=${() => setSh({ ...sh, list: shiftList(start, shiftOf({ ...sh, own: false }), labels.length) })}>Ξεκίνα από «κάθε ${everyTxt(sh.every).replace('½ ώρα', ',5 ώρες')}»<//></div></div>
    ${list.length > 0 && html`<div className="shiftprev">${slots.map((t: string[], i: number) => html`<div key=${i}><b>${labels[i]}</b><span>${t.map((x, j) => html`<span key=${j} className="nw mono">${x}</span>`)}</span><small>${t.length ? plural(rep.per[i].count, 'βάρδια', 'βάρδιες') + ' · ' + hoursTxt(rep.per[i].min) : 'καμία βάρδια'}</small></div>`)}</div>`}
    ${warn.length > 0 && html`<${Alert} tone="warn"><span>${warn.join(' ')} (Δεν εμποδίζει την αποθήκευση.)</span><//>`}
    <span className="field__help">Γράψε τις βάρδιες όπως τις θέλεις (π.χ. τη νύχτα 3 ώρες, τη μέρα 2) και διάλεξε ποιο νούμερο κάνει την καθεμία. Το νούμερο μετρά και στους κανόνες: ο κανόνας «3ο/4ο νούμερο» και το «Αυστηρά Άοπλοι» κοιτούν το νούμερο που διάλεξες. Γράφονται στις Θέσεις και στη ΦΡΟΥΡΑ με τη σειρά της ώρας από τις ${start}.</span><//>`;
}
export function HoursField({ id, mode, setMode, sh, setSh, labels, rot, start, fixed }: P) {
  const slots = mode === 'shift' && !sh.own && !shiftBad(sh) ? shiftSlots(start, shiftOf(sh), labels.length) : [];
  // πρώτη φορά στις δικές μου βάρδιες: ξεκινά από τις βάρδιες του «κάθε τόσες ώρες», να μη γράφεις από το μηδέν
  const pick = (own: boolean) => setSh({ ...sh, own, ...(own && !(sh.list || []).length ? { list: shiftList(start, shiftOf({ ...sh, own: false }), labels.length) } : {}) });
  return html`<div className="field"><span className="field__label">Ώρες</span>
    ${!rot && html`<${Segmented} small=${true} value=${mode} onChange=${setMode} items=${[{ value: 'day', label: 'Όλη μέρα' }, { value: 'fixed', label: 'Ίδιες ώρες' }, { value: 'shift', label: 'Βάρδιες' }]}/>`}
    ${mode === 'day' && html`<span className="field__help">Χωρίς ώρες στις Θέσεις και στο έντυπο, όπως η μαγειρεία.</span>`}
    ${mode === 'fixed' && fixed}
    ${mode === 'shift' && html`<${Segmented} small=${true} value=${sh.own ? 'own' : 'every'} onChange=${(v: string) => pick(v === 'own')} items=${[{ value: 'every', label: 'Κάθε τόσες ώρες' }, { value: 'own', label: 'Δικές μου βάρδιες' }]}/>`}
    ${mode === 'shift' && sh.own && html`<${OwnShifts} id=${id} sh=${sh} setSh=${setSh} labels=${labels} start=${start}/>`}
    ${mode === 'shift' && !sh.own && html`<${Fragment}><div className="field-row" style=${{ alignItems: 'flex-start' }}>
      <div className="field"><label className="field__label" htmlFor=${id + '-ev'}>Αλλάζει κάθε</label><${Select} id=${id + '-ev'} className="ui-input" value=${sh.every} onChange=${(e: any) => setSh({ ...sh, every: +e.target.value })}>${SHIFT_EVERY.map(m => html`<option key=${m} value=${m}>${everyTxt(m)}</option>`)}<//></div>
      <${TimeField} id=${id + '-from'} label="Από" value=${sh.from || ''} onChange=${(v: string) => setSh({ ...sh, from: v })} help=${'Κενό = ' + start + ', η αρχή της υπηρεσίας'}/>
      <${TimeField} id=${id + '-to'} label="Ως" value=${sh.to || ''} onChange=${(v: string) => setSh({ ...sh, to: v })} help=${'Κενό = ' + start + ' της επόμενης'}/></div>
      <div className="shiftprev">${slots.map((t: string[], i: number) => html`<div key=${i}><b>${labels[i]}</b><span>${t.map((x, j) => html`<span key=${j} className="nw mono">${x}</span>`)}</span><small>${t.length} ${t.length === 1 ? 'βάρδια' : 'βάρδιες'}</small></div>`)}</div>
      ${slots.length > 1 && slots.some((t: string[]) => t.length !== slots[0].length) && html`<${Alert} tone="warn"><span>Οι βάρδιες δεν μοιράζονται ίσα: ${slots.map((t: string[], i: number) => labels[i] + ' ' + t.length).join(', ')}. Άλλαξε το «Αλλάζει κάθε» ή το «Από/Ως» αν θέλεις ίσα.</span><//>`}
      <span className="field__help">Γράφονται στις Θέσεις και στη ΦΡΟΥΡΑ, μία γραμμή για κάθε βάρδια. Η αρχή της υπηρεσίας (${start}) αλλάζει στους Κανόνες.</span><//>`}
  </div>`;
}
export const timesHelp = (r?: Rules | null, st?: Pick<Settings, 'dutyStart'> | null) => 'Η μέρα της υπηρεσίας είναι ' + dutyStartOf(st) + ' → ' + dutyStartOf(st) + '. Αν γυρίζει πριν ξεκινήσει μια θέση (π.χ. στις 12:00), μπαίνει σε αυτή την ίδια μέρα. Αν φεύγει πριν τελειώσει η υπηρεσία της προηγούμενης μέρας (π.χ. στις 10:00), δεν μπαίνει σε αυτήν. Αν γυρίζει ως την ώρα εξόδου της μέρας (' + outTimesTxt(r) + '), βγαίνει κανονικά έξοδο εκείνη τη μέρα· ως τις ' + (r?.hkTime || DEFAULT_HK_TIME) + ' μετρά παρών και στην ' + HK() + '. Χωρίς ώρες μετρά όλη η μέρα.';
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
type Gate = { kind: ExportKind; date: ISODate; label: string; print: boolean; sigs?: Sig[]; checks: Check[]; resolve: (ok: boolean) => void };
const ExportBusyCtx = createContext<ExportKind | null>(null);
// sigs: υπογραφές μόνο για αυτή τη φορά
const ExportCtx = createContext<(kind: ExportKind, date: ISODate, label: string, print?: boolean, sigs?: Sig[]) => Promise<boolean>>(async () => false);
/* Εκτύπωση ενός Excel που υπάρχει ήδη (έντυπο που βγήκε, αρχείο από τα «Αρχεία Excel»), χωρίς Excel */
export function usePrintFile() {
  const toast = useToast();
  return useCallback(async (file: string, sheet?: string | string[]) => {
    let r: Awaited<ReturnType<typeof window.api.printFile>>;
    try { r = await window.api.printFile(file, sheet); } catch (e) { r = { ok: false, error: String(e) }; }
    if (!r.ok) toast({ text: html`<span><b>Δεν άνοιξε η εκτύπωση.</b> ${r.error}</span>` });
    return r.ok;
  }, [toast]);
}
export const GO: Record<string, (d: ISODate) => [string, Record<string, unknown>]> = {
  guard: d => ['guard', { guardDate: d, }], outs: d => ['outs', { outDate: d }], records: () => ['hkai', { hkTab: 'pun' }],
  settings: () => ['templates', { tab: 'settings' }], people: () => ['people', {}], cadre: () => ['cadre', {}]
};
export function ExportProvider({ children }: P) {
  const toast = useToast(); const { sync } = useStore(); const nav = useNav(); const printFile = usePrintFile();
  const [gate, setGate] = useState<Gate | null>(null);
  // Ποιο έντυπο βγαίνει τώρα: τα κουμπιά δείχνουν «Δημιουργία…» και δεύτερο κλικ δεν ξεκινά δεύτερη εξαγωγή
  const [busy, setBusy] = useState<ExportKind | null>(null); const busyRef = useRef(false);
  const exec = useCallback(async (kind: ExportKind, date: ISODate, label: string, ack: boolean, print = false, sigs?: Sig[]): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(kind);
    let r: Awaited<ReturnType<typeof window.api.exportFile>>;
    try { r = await window.api.exportFile(kind, date, { open: !print, print, ack, ...(sigs ? { sigs } : {}) }); }
    catch (e) { r = { ok: false, error: String(e) } as typeof r; }
    finally { busyRef.current = false; setBusy(null); }
    if (!r.ok) {
      if (r.checks && r.checks.length) return new Promise<boolean>(resolve => setGate(g => { g && g.resolve(false); return { kind, date, label, print, sigs, checks: r.checks!, resolve }; }));
      toast({ text: html`<span><b>Δεν βγήκε ${label}.</b> ${r.error}</span>`, actions: r.locked ? [{ label: 'Ξανά', fn: () => { exec(kind, date, label, ack, print, sigs); } }] : undefined });
      return false;
    }
    await sync();   // «βγήκε» και ιστορικό: μόνο ό,τι άλλαξε
    const file = r.file;
    toast({ text: html`<span>Βγήκε ${label}: <b>${file.split(/[\\/]/).pop()}</b>${r.warnings.length ? html`<br/>⚠ ${r.warnings.join(' · ')}` : ''}</span>`, actions: [...(print ? [] : [{ label: 'Εκτύπωση', fn: () => { printFile(file); } }]), { label: 'Φάκελος', fn: () => window.api.openFolder('output') }] });
    return true;
  }, [toast, sync, printFile]);
  const start = useCallback((kind: ExportKind, date: ISODate, label: string, print?: boolean, sigs?: Sig[]) => exec(kind, date, label, false, !!print, sigs), [exec]);
  const close = (ok: boolean) => { const g = gate; setGate(null); g && g.resolve(ok); };
  const errs = gate ? gate.checks.filter(c => c.level === 'err') : [];
  const warns = gate ? gate.checks.filter(c => c.level === 'warn') : [];
  const show = (c: Check) => { const g = gate!; close(false); if (c.go) { const [v, p] = GO[c.go](g.date); nav.go(v, p); } };
  return html`<${ExportCtx.Provider} value=${start}><${ExportBusyCtx.Provider} value=${busy}>${children}
    ${gate && html`<${Dialog} role="alertdialog" title=${errs.length ? 'Δεν μπορεί να βγει ' + gate.label : 'Έλεγχος πριν βγει ' + gate.label} description=${dayName(gate.date) + ' ' + dmy(gate.date)} onClose=${() => close(false)}
      footer=${errs.length ? html`<${Button} data-autofocus="" onClick=${() => close(false)}>Κλείσιμο<//>` : html`<${Button} variant="outline" data-autofocus="" onClick=${() => close(false)}>Άκυρο<//><${Button} onClick=${async () => { const g = gate!; setGate(null); g.resolve(await exec(g.kind, g.date, g.label, true, g.print, g.sigs)); }}>Το ξέρω, συνέχισε<//>`}>
      <ul className="preflight">${[...errs, ...warns].map((c, i) => html`<li key=${i} className=${c.level === 'err' ? 'is-err' : 'is-warn'}><span className="preflight__ic">${c.level === 'err' ? '✕' : '⚠'}</span><span>${c.text}</span>${c.go && html`<${Button} size="sm" variant="link" onClick=${() => show(c)}>Δείξε μου<//>`}</li>`)}</ul>
      <p className="note" style=${{ margin: 0 }}>${errs.length ? 'Διόρθωσε τα ✕ και ξαναδοκίμασε. Έτσι δεν φεύγει ποτέ λάθος έντυπο.' : 'Αν συνεχίσεις, οι προειδοποιήσεις γράφονται στο Ιστορικό.'}</p>
    <//>`}<//><//>`;
}
export const useExport = () => useContext(ExportCtx);
export const useExportBusy = () => useContext(ExportBusyCtx);
export function ExportButton({ kind, date, label, variant, size, disabled }: P) {
  const ex = useExport(); const busy = useExportBusy();
  return html`<${Fragment}><${Button} variant=${variant} size=${size} disabled=${!!busy || disabled} onClick=${() => ex(kind, date, label)}>${busy === kind ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//><${PrintButton} kind=${kind} date=${date} label=${label} size=${size} disabled=${disabled}/><${SigsButton} kind=${kind} date=${date} label=${label} size=${size} disabled=${disabled}/><//>`;
}
/* «Υπογραφές…»: βγαίνει με άλλες υπογραφές αυτή τη φορά (ή και τις επόμενες, στις Ρυθμίσεις) */
export function SigsButton({ kind, date, label, variant = 'ghost', size, disabled }: P) {
  const ex = useExport(); const busy = useExportBusy();
  return html`<${SigsMenu} form=${sigFormOf(kind)} date=${date} label=${label} variant=${variant} size=${size} disabled=${!!busy || disabled} go=${(pr: boolean, sigs?: Sig[]) => ex(kind, date, label, pr, sigs)}/>`;
}
/* Το ίδιο σε κάθε έντυπο (Michael, 22/10): βάζεις, βγάζεις ή αλλάζεις σειρά στις υπογραφές, και «Θέσεις στο χαρτί…» για να
   σύρεις κεφαλίδα, ημερομηνία, τίτλο και υπογραφές. go(εκτύπωση, υπογραφές μόνο για αυτή τη φορά)· print: έχει και εκτύπωση */
export function SigsMenu({ form, date, label, go, print = true, variant = 'ghost', size, disabled }: { form: LayoutForm; date: ISODate; label: string; go: (print: boolean, sigs?: Sig[]) => unknown; print?: boolean; variant?: string; size?: string; disabled?: boolean }) {
  const { state, run } = useStore(); const [open, setOpen] = useState(false);
  const [lay, setLay] = useState<Sig[] | null>(null);   // «Θέσεις στο χαρτί…» με τις υπογραφές που βλέπεις στον διάλογο
  const cur = sigsSaved(state.settings, form); const name = label.replace(/^(η|οι|το) /, '');
  const onGo = async (sigs: Sig[], keep: boolean, pr: boolean) => {
    // άλλο πλήθος υπογραφών: οι θέσεις που είχες σύρει για τις υπογραφές δεν ταιριάζουν πια
    const l = sigs.length !== cur.length && state.settings.layout?.[form] ? { layout: { ...state.settings.layout, [form]: dropSigMoves(state.settings.layout[form]) } } : {};
    if (keep && !(await run({ t: 'setSettings', settings: { sigs: { ...(state.settings.sigs || {}), [form]: sigs }, ...l }, text: 'υπογραφές ' + name + ': ' + sigsText(sigs) }, false))) return;
    go(pr, keep ? undefined : sigs);
  };
  const saveLayout = async (l: Layout | undefined) => {
    const all = { ...(state.settings.layout || {}) }; if (l) all[form] = l; else delete all[form];
    await run({ t: 'setSettings', settings: { layout: all }, text: 'θέσεις στο χαρτί: ' + name }, 'Αποθηκεύτηκαν οι θέσεις: ' + name);
  };
  return html`<${Fragment}><${Button} variant=${variant} size=${size} disabled=${disabled} onClick=${() => setOpen(true)} data-tip=${'Υπογραφές: ' + sigsText(cur) + '. Βάλε, βγάλε ή άλλαξε σειρά, για αυτή τη φορά ή για πάντα, ή σύρε κεφαλίδα και υπογραφές αλλού πάνω στο χαρτί.'}>Υπογραφές…<//>
    ${open && html`<${SigsDialog} title=${name} initial=${cur} print=${print} keepText="Να μείνουν έτσι και για τις επόμενες φορές (Ρυθμίσεις › Υπογραφές)" onGo=${onGo} onClose=${() => setOpen(false)} onLayout=${setLay}/>`}
    ${lay && html`<${LayoutDialog} title=${name} form=${form} sigs=${lay} initial=${state.settings.layout?.[form]} onClose=${() => setLay(null)} onSave=${saveLayout}
      req=${(l: Layout) => ({ form, date, sigs: lay, layout: l })}/>`}<//>`;
}
/* Εκτύπωση: βγαίνει το Excel όπως πάντα και ανοίγει προεπισκόπηση με τον διάλογο εκτυπωτή των Windows (χωρίς Excel) */
export function PrintButton({ kind, date, label, variant = 'ghost', size, disabled }: P) {
  const ex = useExport(); const busy = useExportBusy();
  return html`<${Button} variant=${variant} size=${size} disabled=${!!busy || disabled} onClick=${() => ex(kind, date, label, true)} data-tip="Βγαίνει το Excel και ανοίγει προεπισκόπηση εκτύπωσης. Δεν χρειάζεται Excel.">${Icon.print}Εκτύπωση<//>`;
}
export function TemplateNote({ ids }: { ids: string[] }) {
  const { boot, state } = useStore(); const nav = useNav();
  const spen = phaseBase(state.settings) === 'spen';
  const ts = ids.map(id => boot.templates.find(t => t.id === id && (id !== 'froura' || (t.file === 'froura-spen.xlsx') === spen))).filter(Boolean) as Boot['templates'];
  return html`<span className="tplnote">Από template: ${ts.map((t, i) => html`<span key=${t.file}>${i ? ', ' : ''}<b>${t.name}</b>${t.custom ? ' (δικό σου)' : ''}</span>`)} · <${Button} variant="link" onClick=${() => nav.go('templates', { tab: 'templates' })}>Templates<//></span>`;
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

// «Ρυθμίσεις › …» ως σύνδεσμος που ανοίγει το σωστό σημείο (UX Χ5, 22/10· πριν ήταν απλό κείμενο). Μέσα σε παράθυρο το κλείνει
// πρώτα· αν έχει αλλαγές, ρωτά όπως το ✕. Στην ίδια οθόνη (π.χ. άλλη ενότητα των Ρυθμίσεων) ρωτά για όσα δεν αποθηκεύτηκαν.
export function GoLink({ view, params, children }: { view: string; params?: Record<string, any>; children: any }) {
  const nav = useNav(); const leave = useContext(DialogLeave);
  const go = () => { if (view === nav.view) requestLeave(() => nav.go(view, params)); else nav.go(view, params); };
  return html`<${Button} variant="link" className="golink" onClick=${() => (leave ? leave(go) : go())}>${children}<//>`;
}
