// «Υπηρεσίες του μήνα με το χέρι» (Michael, 27/11): πλέγμα για να γράψεις γρήγορα, ανά άτομο, πόσες υπηρεσίες έκανε τον μήνα ανά ενεργή υπηρεσία.
// Ο αριθμός είναι το ΣΥΝΟΛΟ του μήνα (rules.ts handExtras): το γκρι «εφ. N» είναι όσες έχει ήδη η εφαρμογή με ημερομηνία.
// Απόδοση (Atom, 150+ γραμμές × ~9 πεδία): πεδία χωρίς έλεγχο από React (defaultValue), το πρόχειρο μένει σε ref, και σε κάθε πάτημα
// ξαναζωγραφίζεται μόνο το σύνολο της γραμμής που αλλάζει (memo ανά γραμμή)· ποτέ όλο το πλέγμα.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { html, Badge, Button, Dialog, useToast } from '../ui';
import { Select } from '../select';
import { RkName } from '../rankName';
import { useStore, searchPeople } from '../store';
import { KIND_NAME, everyBlock, type DutyKind, type Person } from '../../shared/domain';
import { appMonth, dutyMonths, fairKey, handExtras, postsOf, seatPeople } from '../../shared/rules';
import { MONTHS } from '../../shared/dates';
import { collator } from '../../shared/text';

type P = any;
export const monthName = (ym: string) => MONTHS[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4);
const num = (v: string) => (v ? Math.min(99, Math.floor(+v) || 0) : 0);

interface Col { key: string; label: string }
interface RowData { p: Person; app: Record<string, number>; appHol: number; extra: Record<string, number>; extraHol: number }
// πρόχειρο: id κελιού («pid:κλειδί») → τιμή που έγραψε ο χρήστης (κείμενο)· εκτός πρόχειρου το κελί έχει την αρχική του τιμή
type Draft = Map<string, string>;
const HOL = 'hol';
const cellId = (pid: number, key: string) => pid + ':' + key;

// το συνολικό του μήνα που δείχνει το κελί αρχικά: όσες έχει η εφαρμογή + το έξτρα που έχει ήδη γραφτεί
const initial = (r: RowData, key: string) => (key === HOL ? r.appHol + r.extraHol : (r.app[key] || 0) + (r.extra[key] || 0));
const minOf = (r: RowData, key: string) => (key === HOL ? r.appHol : r.app[key] || 0);

const Row = memo(function Row({ r, ri, cols, draft, onEdit }: P) {
  const [, tick] = useState(0);
  const cur = (key: string) => { const d = draft.get(cellId(r.p.id, key)); return Math.max(d === undefined ? initial(r, key) : num(d), minOf(r, key)); };
  const total = cols.reduce((n: number, c: Col) => n + cur(c.key), 0);
  const cell = (key: string, ci: number, hol?: boolean) => {
    const id = cellId(r.p.id, key); const d = draft.get(id); const v = d === undefined ? initial(r, key) : num(d); const app = minOf(r, key);
    const tip = (el: HTMLInputElement, n: number) => { if (n < app) { el.setAttribute('data-tip', 'Η εφαρμογή έχει ήδη ' + app + '· για λιγότερες, σβήσε μέρες στο ημερολόγιο'); el.classList.add('is-min'); } else { el.removeAttribute('data-tip'); el.classList.remove('is-min'); } };
    return html`<span key=${key} className="hand__c"><input className="ui-input hand__in" inputMode="numeric" maxLength="2" placeholder="0" autoComplete="off"
      data-r=${ri} data-c=${ci} aria-label=${r.p.last + ' ' + (hol ? 'ΣΚ/αργία' : cols[ci].label)} defaultValue=${v ? String(v) : ''}
      onFocus=${(e: any) => e.target.select()}
      onInput=${(e: any) => { const el = e.target as HTMLInputElement; const t = el.value.replace(/\D/g, '').slice(0, 2); if (t !== el.value) el.value = t; draft.set(id, t); tip(el, num(t)); onEdit(id, t); tick(n => n + 1); }}
      onBlur=${(e: any) => { const el = e.target as HTMLInputElement; const n = num(el.value); if (el.value && n < app) { el.value = String(app); draft.set(id, String(app)); tick(x => x + 1); } tip(el, num(el.value)); }}
      onKeyDown=${(e: any) => {
        const el = e.target as HTMLInputElement; const box = el.closest('.hand') as HTMLElement | null; if (!box) return;
        const at = (r2: number, c2: number) => box.querySelector('input[data-r="' + r2 + '"][data-c="' + c2 + '"]') as HTMLInputElement | null;
        const k = e.key; const w = cols.length + 1;
        let t: HTMLInputElement | null | undefined;
        if (k === 'Enter' || k === 'ArrowDown') t = at(ri + 1, ci);
        else if (k === 'ArrowUp') t = at(ri - 1, ci);
        else if (k === 'ArrowRight') t = at(ri, ci + 1) || at(ri + 1, 0);
        else if (k === 'ArrowLeft') t = at(ri, ci - 1) || (ri > 0 ? at(ri - 1, w - 1) : null);
        else if ((k === 'Delete' || k === 'Backspace') && el.selectionStart === 0 && el.selectionEnd === el.value.length) { e.preventDefault(); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); return; }
        else return;
        e.preventDefault(); if (t) t.focus();
      }}/>${app > 0 && html`<small className="hand__app" data-tip="Όσες έχει ήδη η εφαρμογή αυτόν τον μήνα, με ημερομηνία">εφ. ${app}</small>`}</span>`;
  };
  return html`<div className="hand__row" style=${{ gridTemplateColumns: 'minmax(190px,1fr) repeat(' + (cols.length + 1) + ',100px) 86px' }}>
    <span className="hand__name"><${RkName} p=${r.p}/>${r.p.cid && html` <${Badge} tone="info">στέλεχος<//>`}</span>
    ${cols.map((c: Col, i: number) => cell(c.key, i))}${cell(HOL, cols.length, true)}<span className="num hand__tot">${total}</span></div>`;
});

export function DutyHandDialog({ ym: ym0, onClose }: P) {
  const { state, run, today } = useStore(); const toast = useToast();
  const [ym, setYm] = useState<string>(ym0); const [q, setQ] = useState(''); const [dirty, setDirty] = useState(false); const [gen, setGen] = useState(0);
  const draft = useRef<Draft>(new Map()); const changed = useRef<Set<string>>(new Set());
  const search = useRef<HTMLInputElement>(null);
  // Ctrl+F: στο πεδίο ονόματος του παραθύρου (το γενικό ψάχνει στην οθόνη πίσω)
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); e.stopPropagation(); search.current?.focus(); search.current?.select(); } };
    window.addEventListener('keydown', f, true); return () => window.removeEventListener('keydown', f, true);
  }, []);
  const active = useMemo(() => { const seen = new Set<string>(); const out: Col[] = []; for (const p of postsOf(state.settings)) { const k = fairKey(state, p); if (!seen.has(k)) { seen.add(k); out.push({ key: k, label: label(state, k) }); } } return out; }, [state.settings]);
  // ενεργές υπηρεσίες, και όσες έχουν τιμές αυτόν τον μήνα (ανενεργές: δεν χάνονται)
  const cols = useMemo(() => {
    const out = [...active]; const seen = new Set(active.map(c => c.key));
    for (const r of Object.values(state.dutyHand?.[ym] || {})) for (const k of Object.keys(r.n)) if (!seen.has(k)) { seen.add(k); out.push({ key: k, label: label(state, k) + ' (ανενεργή)' }); }
    return out;
  }, [active, state.dutyHand, ym, state.settings]);
  const rows: RowData[] = useMemo(() => {
    const app = appMonth(state, ym); const ex = handExtras(state).get(ym);
    return [...seatPeople(state)].sort((a, b) => (+!!a.cid - +!!b.cid) || collator.compare(a.last, b.last) || collator.compare(a.first, b.first))
      .map(p => ({ p, app: app.get(p.id)?.by || {}, appHol: app.get(p.id)?.hol || 0, extra: ex?.get(p.id)?.byKey || {}, extraHol: ex?.get(p.id)?.hol || 0 }));
  }, [state.guards, state.dutyLog, state.dutyHand, state.people, state.cadreList, state.settings, ym]);
  const shown = useMemo(() => { if (!q.trim()) return rows; const ids = new Set(searchPeople(rows.map(r => r.p), q).map(p => p.id)); return rows.filter(r => ids.has(r.p.id)); }, [rows, q]);
  const rowOf = useMemo(() => new Map(rows.map(r => [r.p.id, r])), [rows]);
  const keyOf = (id: string) => id.slice(id.indexOf(':') + 1);
  // αλλαγή κελιού: αν επιστρέψει στην αρχική του τιμή, δεν μετρά ως αλλαγή
  const onEdit = (id: string, t: string) => {
    const r = rowOf.get(Number(id.slice(0, id.indexOf(':')))); const k = keyOf(id);
    const was = r ? initial(r, k) : 0;
    if ((t ? num(t) : 0) === was) changed.current.delete(id); else changed.current.add(id);
    setDirty(changed.current.size > 0);
  };
  const onMonth = (v: string) => { if (dirty) return; setYm(v); draft.current.clear(); changed.current.clear(); setGen(g => g + 1); };
  // «Μηδένισε τον μήνα»: όλα τα κελιά δείχνουν μόνο όσες έχει η εφαρμογή (το έξτρα φεύγει)· χρειάζεται ακόμα Αποθήκευση
  const zero = () => {
    draft.current.clear(); changed.current.clear();
    for (const r of rows) for (const k of [...cols.map(c => c.key), HOL]) { const id = cellId(r.p.id, k); const a = minOf(r, k); draft.current.set(id, a ? String(a) : ''); if (a !== initial(r, k)) changed.current.add(id); }
    setDirty(changed.current.size > 0); setGen(g => g + 1);
  };
  const save = async () => {
    // τιμή κελιού → αυτό που αποθηκεύεται: το σύνολο ως τη μέρα on (όσες έχει η εφαρμογή μετά την on δεν μετρούν στο γραμμένο)
    const appOn = appMonth(state, ym, ym < today.slice(0, 7) ? ym + '-31' : today);
    const pids = new Set<number>(); for (const id of changed.current) pids.add(Number(id.slice(0, id.indexOf(':'))));
    const out: Record<number, { n: Record<string, number>; hol?: number }> = {};
    for (const pid of pids) {
      const r = rowOf.get(pid); if (!r) continue;
      const a = appOn.get(pid);
      const val = (k: string) => { const d = draft.current.get(cellId(pid, k)); const v = Math.max(d === undefined ? initial(r, k) : num(d), minOf(r, k)); const future = minOf(r, k) - (k === HOL ? a?.hol || 0 : a?.by[k] || 0); const st = v - future; return st > (k === HOL ? a?.hol || 0 : a?.by[k] || 0) ? st : 0; };
      const n: Record<string, number> = {}; for (const c of cols) { const v = val(c.key); if (v) n[c.key] = v; }
      out[pid] = { n, hol: val(HOL) };
    }
    if (await run({ t: 'setDutyHand', ym, rows: out }, false)) { onClose(); toast({ text: 'Αποθηκεύτηκαν οι υπηρεσίες με το χέρι, ' + monthName(ym) }); }
  };
  const months = useMemo(() => [...new Set([today.slice(0, 7), ym0, ym, ...Object.keys(state.dutyHand || {}), ...dutyMonths(state)])].sort().reverse(), [state.guards, state.dutyLog, state.dutyHand, today, ym0, ym]);
  return html`<${Dialog} size="xl" title="Υπηρεσίες του μήνα με το χέρι" dirty=${dirty} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${zero} data-tip="Βγάζει ό,τι έχει γραφτεί με το χέρι αυτόν τον μήνα (ό,τι έχει η εφαρμογή μένει). Χρειάζεται «Αποθήκευση»." style=${{ marginRight: 'auto' }}>Μηδένισε τον μήνα<//><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
    <div className="toolbar" style=${{ marginBottom: '6px' }}>
      <${Select} className="ui-input" style=${{ flex: '0 0 200px', width: '200px' }} aria-label="Μήνας" disabled=${dirty} data-tip=${dirty ? 'Αποθήκευσε ή πάτα «Άκυρο» πριν αλλάξεις μήνα' : undefined} value=${ym} onChange=${(e: any) => onMonth(e.target.value)}>${months.map(m => html`<option key=${m} value=${m}>${monthName(m)}</option>`)}<//>
      <input ref=${search} type="search" className="ui-input" style=${{ width: '260px', flex: '0 0 260px' }} aria-label="Αναζήτηση ονόματος" placeholder="Όνομα (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <span className="toolbar__count">${shown.length} άτομα · ${active.length} ενεργές υπηρεσίες</span></div>
    <p className="note" style=${{ margin: '0 0 8px' }}>Γράψε το σύνολο του μήνα για κάθε υπηρεσία. Ο γκρι αριθμός είναι όσες έχει ήδη η εφαρμογή με ημερομηνία. Όσες γράψει η εφαρμογή μετά την αποθήκευση προστίθενται.</p>
    <div className="hand" key=${ym + ':' + gen}>
      <div className="hand__head" style=${{ gridTemplateColumns: 'minmax(190px,1fr) repeat(' + (cols.length + 1) + ',100px) 86px' }}><span>Ονοματεπώνυμο</span>${cols.map(c => html`<span key=${c.key} data-tip=${c.label}>${c.label}</span>`)}<span>Από αυτές ΣΚ/αργία</span><span>Σύνολο μήνα</span></div>
      ${shown.map((r, i) => html`<${Row} key=${r.p.id} r=${r} ri=${i} cols=${cols} draft=${draft.current} onEdit=${onEdit}/>`)}
    </div>
    <p className="note" style=${{ margin: '8px 0 0' }}>Enter ή ↓ κάτω · Tab ή → δεξιά · ↑ ← πίσω · γράψε ψηφίο για να αλλάξει η τιμή · Del = 0. Οι αριθμοί μετρούν στη σειρά δικαιοσύνης και στα όρια· δεν αλλάζει κανένα Excel.</p>
  <//>`;
}
const label = (state: P, k: string): string => (k.startsWith('b:') ? everyBlock(state.settings).find((b: any) => 'b:' + b.id === k)?.name || '?' : KIND_NAME[k as DutyKind] || k);
