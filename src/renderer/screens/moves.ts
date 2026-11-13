// Κινήσεις δύναμης (Λειτουργία μονάδας): η «Κίνηση…» της καρτέλας, η «Απόλυση ΕΣΣΟ…», η λίστα με τις προγραμματισμένες και η κάρτα του «Σήμερα»
import { useMemo, useState } from 'react';
import { html, Alert, Button, Card, Dialog, Segmented, Why, useToast } from '../ui';
import { useNav, useStore } from '../store';
import { DateField } from '../common';
import { RkName, rkShort } from '../rankName';
import { addDays, dm, dmy } from '../../shared/dates';
import { essoDischarge, essoKeyOf, monthEnd, moveRows, pendingMoves } from '../../shared/mode';
import { parseEsso } from '../../shared/esso';
import { fullName, type Move, type Person } from '../../shared/domain';
import { HK } from '../../shared/unit';
type P = any;

const WHYS = ['ΜΕΤΑΘΕΣΗ', 'ΑΠΟΣΠΑΣΗ', 'ΑΠΟΛΥΣΗ', 'ΑΛΛΟ'];
const label = (m: Move) => [m.why, m.where].filter(Boolean).join(' · ');
const moveTxt = (m: Move) => dmy(m.on) + (m.dir === 'out' ? ' ' + label(m).toLowerCase() + (m.back ? ' (επιστρέφει ' + dmy(m.back) + ')' : '') : ' ξανά σε δύναμη') + (m.done ? '' : ' · προγραμματισμένη');

// Το ιστορικό κινήσεων στην καρτέλα
export function MovesHistory({ p }: P) {
  const { run } = useStore(); const toast = useToast();
  const list = [...(p.moves || [])].sort((a: Move, b: Move) => b.on.localeCompare(a.on));
  if (!list.length) return null;
  return html`<section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Προηγούμενες κινήσεις</h3><ul className="hist">${list.map((m: Move) => html`<li key=${m.id}>${moveTxt(m)}
    ${!m.done && html` <${Button} size="sm" variant="ghost" onClick=${async () => { if (await run({ t: 'cancelMove', pid: p.id, id: m.id }, false)) toast({ text: 'Ακυρώθηκε η κίνηση' }); }}>Ακύρωση<//>`}</li>`)}</ul></section>`;
}

export function MoveDialog({ p, onClose }: P) {
  const { run, today } = useStore(); const toast = useToast();
  const pend = (p.moves || []).filter((m: Move) => !m.done);
  const [dir, setDir] = useState<'out' | 'in'>(p.active ? 'out' : 'in');
  const [why, setWhy] = useState('ΜΕΤΑΘΕΣΗ'); const [other, setOther] = useState(''); const [where, setWhere] = useState('');
  const [on, setOn] = useState<string>(today); const [back, setBack] = useState<string>('');
  const reason = why === 'ΑΛΛΟ' ? other.trim() : why;
  const miss = dir === 'out' && !reason ? 'Λείπει: Λόγος' : back && back <= on ? 'Η επιστροφή πρέπει να είναι μετά την ημέρα που φεύγει' : '';
  const save = async () => {
    const ok = await run({ t: 'addMove', pid: p.id, dir, why: dir === 'out' ? reason : undefined, where: where.trim() || undefined, on, back: dir === 'out' && back ? back : undefined }, false);
    if (ok) { toast({ text: rkShort(p) + (dir === 'out' ? (on <= today ? ': εκτός δύναμης' : ': φεύγει στις ' + dm(on)) : (on <= today ? ': ξανά σε δύναμη' : ': ξαναμπαίνει στις ' + dm(on))) }); onClose(); }
  };
  const info = on <= today ? (dir === 'out' ? 'Βγαίνει εκτός δύναμης από τώρα, φεύγει από τις υπηρεσίες από ' + 'σήμερα' + ' και γράφεται στις 2. ΔΙΑΓΡΑΦΕΣ της ' + HK() + ' της ' + dm(on) + '.' : 'Ξαναμπαίνει σε δύναμη και γράφεται στις 1. ΕΓΓΡΑΦΕΣ της ' + HK() + ' της ' + dm(on) + '.')
    : (dir === 'out' ? 'Ως τις ' + dm(addDays(on, -1)) + ' μένει σε δύναμη όπως τώρα. Στις ' + dm(on) + ' βγαίνει εκτός δύναμης μόνος του, φεύγει από τις υπηρεσίες από εκείνη τη μέρα και γράφεται στις 2. ΔΙΑΓΡΑΦΕΣ της ' + HK() + '.' : 'Στις ' + dm(on) + ' ξαναμπαίνει σε δύναμη μόνος του και γράφεται στις 1. ΕΓΓΡΑΦΕΣ.') + (back && dir === 'out' ? ' Στις ' + dm(back) + ' ξαναμπαίνει.' : '');
  return html`<${Dialog} title="Κίνηση δύναμης" description=${html`<${RkName} p=${p}/>`} onClose=${onClose}
    footer=${html`<${Why} text=${miss}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!!miss} why=${miss} onClick=${save}>Αποθήκευση κίνησης<//>`}>
    <div className="field"><${Segmented} value=${dir} onChange=${setDir} items=${[{ value: 'out', label: 'Φεύγει από τη δύναμη', disabled: !p.active && !pend.some((m: Move) => m.dir === 'in') }, { value: 'in', label: 'Ξαναμπαίνει στη δύναμη', disabled: p.active && !pend.some((m: Move) => m.dir === 'out') }]}/></div>
    ${dir === 'out' && html`<div className="field"><span className="field__label">Λόγος</span><${Segmented} value=${why} onChange=${setWhy} items=${WHYS.map(w => ({ value: w, label: w === 'ΑΛΛΟ' ? 'Άλλο…' : w[0] + w.slice(1).toLowerCase() }))}/>
      ${why === 'ΑΛΛΟ' && html`<input className="ui-input" aria-label="Λόγος" data-autofocus="" placeholder="π.χ. ΝΟΣΟΚΟΜΕΙΟ" value=${other} onChange=${(e: any) => setOther(e.target.value)}/>`}</div>`}
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="mv-wh">Πού</label><input id="mv-wh" className="ui-input" placeholder=${dir === 'out' ? 'π.χ. ΣΣΕ' : 'π.χ. από πού'} value=${where} onChange=${(e: any) => setWhere(e.target.value)}/></div>
      <div className="field"><label className="field__label" htmlFor="mv-on">Από</label><${DateField} id="mv-on" className="ui-input" max=${addDays(today, 366)} value=${on} onChange=${(e: any) => e.target.value && setOn(e.target.value)}/></div>
      ${dir === 'out' && html`<div className="field"><label className="field__label" htmlFor="mv-bk">Επιστρέφει (αν ξέρεις)</label><${DateField} id="mv-bk" className="ui-input" min=${addDays(on, 1)} max=${addDays(today, 730)} value=${back} onChange=${(e: any) => setBack(e.target.value)}/></div>`}
    </div>
    <div className="note">${info}</div>
    ${pend.length > 0 && html`<${Alert} tone="warn"><span>Έχει ήδη προγραμματισμένη κίνηση: ${pend.map(moveTxt).join(' · ')}</span><//>`}
    <${MovesHistory} p=${p}/>
  <//>`;
}

// Απόλυση ΕΣΣΟ: όλη η ΕΣΣΟ εκτός δύναμης σε μία ημερομηνία, με εξαιρέσεις
export function DischargeDialog({ esso, onClose }: P) {
  const { state, run, today } = useStore(); const toast = useToast();
  const people: Person[] = useMemo(() => state.people.filter((p: Person) => p.active && essoKeyOf(p) === esso).sort((a: Person, b: Person) => a.last.localeCompare(b.last, 'el') || a.first.localeCompare(b.first, 'el')), [state.people, esso]);
  const e = parseEsso(esso);
  const def = e ? monthEnd(essoDischarge(e)) : today;
  const [on, setOn] = useState<string>(def < today ? today : def);
  const [keep, setKeep] = useState<Set<number>>(new Set());   // εξαιρέσεις: όσοι μένουν
  const pids = people.filter(p => !keep.has(p.id)).map(p => p.id);
  const miss = !pids.length ? 'Διάλεξε τουλάχιστον έναν' : '';
  const toggle = (id: number) => setKeep(k => { const n = new Set(k); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const go = async () => { if (await run({ t: 'dischargeEsso', esso, on, pids }, false)) { toast({ text: 'ΕΣΣΟ ' + esso + ': ' + (on <= today ? 'απολύθηκαν ' : 'απολύονται στις ' + dm(on) + ': ') + pids.length }); onClose(); } };
  return html`<${Dialog} title=${'Απόλυση ΕΣΣΟ ' + esso} description=${people.length + ' σε δύναμη. Ξετσέκαρε όσους μένουν.'} onClose=${onClose}
    footer=${html`<${Why} text=${miss}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} variant="destructive" disabled=${!!miss} why=${miss} onClick=${go}>Απόλυση ${pids.length}<//>`}>
    <div className="field" style=${{ maxWidth: '220px' }}><label className="field__label" htmlFor="ds-on">Ημερομηνία απόλυσης</label><${DateField} id="ds-on" className="ui-input" max=${addDays(today, 366)} value=${on} onChange=${(ev: any) => ev.target.value && setOn(ev.target.value)}/></div>
    <ul className="hist" style=${{ maxHeight: '320px', overflow: 'auto' }}>${people.map(p => html`<li key=${p.id}><label className="kv__check"><input type="checkbox" className="ui-check" checked=${!keep.has(p.id)} onChange=${() => toggle(p.id)}/><span>${fullName(p)}</span></label></li>`)}</ul>
    <div className="note">${on <= today ? 'Βγαίνουν εκτός δύναμης τώρα' : 'Μένουν σε δύναμη ως τις ' + dm(addDays(on, -1)) + ' και βγαίνουν μόνοι τους στις ' + dm(on)}, με λόγο ΑΠΟΛΥΣΗ, και γράφονται στις 2. ΔΙΑΓΡΑΦΕΣ της ${HK()}. Αναιρείται με μία αναίρεση.</div>
  <//>`;
}

// Ρυθμίσεις › ΕΣΣΟ και κινήσεις: οι προγραμματισμένες κινήσεις, με ακύρωση
export function ScheduledMoves() {
  const { state, run, today } = useStore(); const nav = useNav(); const toast = useToast();
  const rows = useMemo(() => moveRows(pendingMoves(state.people).filter(x => x.m.on > today), p => rkShort(p)), [state.people, today]);
  const cancel = async (r: any) => { for (const x of r.ids) if (!(await run({ t: 'cancelMove', pid: x.pid, id: x.id }, false))) return; toast({ text: 'Ακυρώθηκε' }); };
  return html`<${Card} title="Κινήσεις των επόμενων ημερών">
    ${rows.length ? html`<ul className="hist">${rows.map(r => html`<li key=${r.key}><span className="num">${dmy(r.on)}</span> ${r.pid ? html`<button type="button" className="linkish" onClick=${() => nav.openPerson(r.pid!)}>${r.text}</button>` : r.text} <${Button} size="sm" variant="ghost" onClick=${() => cancel(r)}>Ακύρωση<//></li>`)}</ul>`
      : html`<p className="note" style=${{ margin: 0 }}>Καμία προγραμματισμένη κίνηση. Τις βάζεις από την καρτέλα του στρατιώτη («Κίνηση…») ή με «Απόλυση ΕΣΣΟ…».</p>`}
  <//>`;
}

// Σήμερα: κινήσεις των επόμενων 7 ημερών (μόνο αν υπάρχουν)
export function TodayMoves() {
  const { state, today } = useStore(); const nav = useNav();
  const rows = useMemo(() => moveRows(pendingMoves(state.people, addDays(today, 7)).filter(x => x.m.on > today), p => rkShort(p)), [state.people, today]);
  if (!rows.length) return null;
  return html`<${Card} flush=${true} title="Κινήσεις δύναμης · 7 μέρες">
    <ul className="rows">${rows.slice(0, 8).map(r => html`<li key=${r.key}>${r.pid ? html`<button type="button" className="linkish" onClick=${() => nav.openPerson(r.pid!)}>${r.text}</button>` : html`<span>${r.text}</span>`}<span className="muted">${dm(r.on)}</span></li>`)}</ul>
    ${rows.length > 8 && html`<p className="note rows__more">Και άλλες ${rows.length - 8} στις Ρυθμίσεις › ΕΣΣΟ και κινήσεις.</p>`}
  <//>`;
}
