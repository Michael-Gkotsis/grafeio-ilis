// components/common: επιλογή ατόμου, κατάσταση, ημερομηνίες, προεπισκόπηση Excel, κουμπί εξαγωγής
import { Fragment, useCallback } from 'react';
import { html, Alert, Button, Segmented } from './ui';
import { Combo, Select } from './select';
import { useStore } from './store';
import { useToast } from './ui';
import { SHIFT_EVERY, MAX_SHIFT_OWN, hoursTxt, shiftList, shiftReport, shiftSlots, type ShiftDef, type ShiftOwn } from '../shared/domain';
import { normTime } from '../shared/hours';
import { GO } from './shared/lib/exportGo';
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
// Deprecated path: `timesHelp` moved to shared/lib/timesHelp.ts (Phase 5.3b).
export { timesHelp } from './shared/lib/timesHelp';
// Deprecated paths (Phase 5.3c part 2, removed in Phase 7): ExcelSheet moved to widgets/excel-preview, the sheet
// types and `E` to shared/lib/sheets/model.
export { ExcelSheet } from './widgets/excel-preview';
export { E, type Cell, type SheetModel } from './shared/lib/sheets/model';

// Deprecated paths (Phase 5.3b, removed in Phase 7): the export context moved to shared/model, the buttons to
// widgets/export, GO to shared/lib/exportGo and GoLink to shared/ui.
export { ExportProvider, useExport, useExportBusy, usePrintFile } from './shared/model';
export { ExportButton, PrintButton, SigsButton, SigsMenu, TemplateNote } from './widgets/export';
export { GoLink } from './shared/ui';
export { GO };

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
