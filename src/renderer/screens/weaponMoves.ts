// features/weapons: έξοδοι και είσοδοι όπλων από τον οπλοβαστό (Michael, 18/10: «όπως οι εξοδούχοι και οι παραμένοντες»).
// Έξοδος: λόγος από τη λίστα «Λόγοι εξόδου όπλου» (ΕΚΠ, ΒΟΛΗ…), μέρα και ώρα (τώρα, αλλάζουν). Είσοδος: ο λόγος εισαγωγής
// μπαίνει μόνος του από τη λίστα (ΕΚΠ → ΛΗΞ ΕΚΠ), με ώρα (τώρα). Κάθε κίνηση διορθώνεται ή σβήνεται στις «Κινήσεις».
import { useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Dialog, Segmented, useToast } from '../ui';
import { useNav, useStore } from '../store';
import { ChoiceField, TimeField } from '../common';
import { shortName, plainName, type Person, type WeaponMove } from '../../shared/domain';
import { personMap } from '../../shared/rules';
import { listOf, weaponBack } from '../../shared/ranks';
import { normTime } from '../../shared/hours';
import { dm, dmy, nowHM, today as todayFn } from '../../shared/dates';
import { byOut, movesOn, openMoves } from '../../shared/weapons';
type P = any;

const names = (ps: Person[], n = 6) => ps.slice(0, n).map(shortName).join(', ') + (ps.length > n ? ' και ' + (ps.length - n) + ' ακόμα' : '');

// Έξοδος όπλων για όσους διάλεξες: μόνο όσοι έχουν αριθμό όπλου και είναι εντός
export function WeaponOutDialog({ pids, onClose, onDone }: P) {
  const { state, run, undoMark } = useStore(); const toast = useToast();
  const reasons = useMemo(() => listOf(state.settings.lists, 'weaponOut'), [state.settings.lists]);
  const [reason, setReason] = useState(''); const [day, setDay] = useState(todayFn()); const [time, setTime] = useState(nowHM()); const [note, setNote] = useState('');
  const pm = personMap(state.people); const open = openMoves(state.weaponLog);
  const ps: Person[] = pids.map((id: number) => pm.get(id)).filter(Boolean);
  const go = ps.filter(p => p.weapon && !open.has(p.id)); const noW = ps.filter(p => !p.weapon); const already = ps.filter(p => p.weapon && open.has(p.id));
  const ok = !!reason.trim() && !!normTime(time) && go.length > 0;
  const save = async () => {
    if (!ok) return;
    if (!(await run({ t: 'weaponOut', pids: go.map(p => p.id), reason, day, time: normTime(time)!, note }, false))) return;
    toast({ text: 'Έξοδος όπλων (' + reason.trim().toUpperCase() + ') ' + normTime(time) + ': ' + (go.length === 1 ? shortName(go[0]) : go.length + ' όπλα'), actions: [undoMark()] });
    onDone?.(); onClose();
  };
  return html`<${Dialog} title=${'Έξοδος όπλων' + (go.length > 1 ? ' (' + go.length + ')' : '')} description=${go.length === 1 ? go[0].rank + ' ' + plainName(go[0]) + ' · όπλο ' + go[0].weapon : go.length ? names(go) : 'Κανένα όπλο για έξοδο'} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} onClick=${save}>Έξοδος${go.length > 1 ? ' (' + go.length + ')' : ''}<//>`}>
    <${ChoiceField} id="wo-r" label="Λόγος εξόδου *" value=${reason} options=${reasons} autoFocus=${true} placeholder="π.χ. ΦΡΟΥΡΑ" otherLabel="Άλλος λόγος (γράψε τον)…" otherHelp="Για να προτείνεται κάθε φορά, με τον λόγο εισαγωγής του, πρόσθεσέ τον στις Ρυθμίσεις › Λίστες." onChange=${setReason}/>
    ${reason.trim() && html`<p className="note" style=${{ margin: '-4px 0 10px' }}>Όταν μπει πάλι: <b>${weaponBack(reason, state.settings.lists)}</b></p>`}
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="wo-d">Μέρα</label><input id="wo-d" type="date" className="ui-input" value=${day} onChange=${(e: any) => e.target.value && setDay(e.target.value)}/></div>
      <${TimeField} id="wo-t" label="Ώρα εξόδου *" value=${time} onChange=${setTime} help="Η τωρινή· άλλαξέ την αν βγήκε νωρίτερα"/></div>
    <div className="field"><label className="field__label" htmlFor="wo-n">Παρατήρηση</label><input id="wo-n" className="ui-input" placeholder="π.χ. πεδίο βολής Σχιστού" value=${note} onChange=${(e: any) => setNote(e.target.value)}/></div>
    ${(noW.length > 0 || already.length > 0) && html`<${Alert} tone="warn"><span>${noW.length > 0 && html`<span>Χωρίς αριθμό όπλου, δεν βγαίνουν: ${names(noW)}.</span>`}${already.length > 0 && html`<span>${noW.length ? html`<br/>` : ''}Είναι ήδη εκτός: ${names(already)}.</span>`}</span><//>`}
  <//>`;
}

// Είσοδος όπλων: κάθε έξοδος παίρνει τον λόγο εισαγωγής της (ΕΚΠ → ΛΗΞ ΕΚΠ), εκτός αν γράψεις άλλον για όλα
export function WeaponInDialog({ ids, onClose, onDone }: P) {
  const { state, run, undoMark } = useStore(); const toast = useToast();
  const [day, setDay] = useState(todayFn()); const [time, setTime] = useState(nowHM()); const [reason, setReason] = useState('');
  const pm = personMap(state.people); const lists = state.settings.lists;
  const moves: WeaponMove[] = (state.weaponLog || []).filter(m => ids.includes(m.id) && !m.inDay);
  const backs = [...new Set(moves.map(m => weaponBack(m.reason, lists)))];
  const early = moves.filter(m => day + ' ' + (normTime(time) || '') < m.outDay + ' ' + m.outTime);
  const ok = moves.length > 0 && !!normTime(time) && !early.length;
  const save = async () => {
    if (!ok) return;
    if (!(await run({ t: 'weaponIn', ids: moves.map(m => m.id), day, time: normTime(time)!, reason: reason.trim() || undefined }, false))) return;
    toast({ text: 'Είσοδος όπλων (' + (reason.trim().toUpperCase() || backs.join(', ')) + ') ' + normTime(time) + ': ' + (moves.length === 1 ? shortName(pm.get(moves[0].pid)!) : moves.length + ' όπλα'), actions: [undoMark()] });
    onDone?.(); onClose();
  };
  return html`<${Dialog} title=${'Είσοδος όπλων' + (moves.length > 1 ? ' (' + moves.length + ')' : '')} description=${moves.length === 1 ? shortName(pm.get(moves[0].pid)!) + ' · όπλο ' + moves[0].weapon + ' · βγήκε ' + moves[0].reason + ' ' + dm(moves[0].outDay) + ' ' + moves[0].outTime : moves.length + ' όπλα που είναι εκτός'} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} onClick=${save}>Είσοδος${moves.length > 1 ? ' (' + moves.length + ')' : ''}<//>`}>
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="wi-d">Μέρα</label><input id="wi-d" type="date" className="ui-input" value=${day} onChange=${(e: any) => e.target.value && setDay(e.target.value)}/></div>
      <${TimeField} id="wi-t" label="Ώρα εισόδου *" value=${time} onChange=${setTime} help="Η τωρινή· άλλαξέ την αν μπήκε νωρίτερα"/></div>
    <div className="field"><label className="field__label" htmlFor="wi-r">Λόγος εισαγωγής</label><input id="wi-r" className="ui-input" placeholder=${backs.length === 1 ? backs[0] : 'Αυτόματα: ' + backs.join(', ')} value=${reason} onChange=${(e: any) => setReason(e.target.value)}/>
      <span className="field__help">${reason.trim() ? 'Γράφεται σε όλα: ' + reason.trim().toUpperCase() : 'Κενό: ο λόγος εισαγωγής κάθε εξόδου από τη λίστα (Ρυθμίσεις › Λίστες)'}</span></div>
    ${moves.length > 1 && html`<ul className="hist weapon-movelist">${moves.map(m => html`<li key=${m.id}><b>${shortName(pm.get(m.pid)!)}</b> <span className="muted">${m.weapon} · ${m.reason} ${dm(m.outDay)} ${m.outTime} →</span> ${reason.trim().toUpperCase() || weaponBack(m.reason, lists)}</li>`)}</ul>`}
    ${early.length > 0 && html`<${Alert} tone="bad"><span>Η ώρα εισόδου είναι πριν την έξοδο για ${early.map(m => shortName(pm.get(m.pid)!) + ' (' + dm(m.outDay) + ' ' + m.outTime + ')').join(', ')}.</span><//>`}
  <//>`;
}

// Διόρθωση μιας κίνησης: λόγοι, μέρες, ώρες, παρατήρηση· «Είναι ακόμα εκτός» σβήνει την είσοδο
function EditMoveDialog({ m, onClose }: P) {
  const { state, run, undoMark } = useStore(); const toast = useToast();
  const reasons = useMemo(() => listOf(state.settings.lists, 'weaponOut'), [state.settings.lists]);
  const [x, setX] = useState({ reason: m.reason, outDay: m.outDay, outTime: m.outTime, inDay: m.inDay || '', inTime: m.inTime || '', inReason: m.inReason || '', note: m.note || '' });
  const p = personMap(state.people).get(m.pid);
  const ok = !!x.reason.trim() && !!normTime(x.outTime) && (!x.inDay || !!normTime(x.inTime));
  const save = async () => {
    if (!ok) return;
    const patch = { reason: x.reason, outDay: x.outDay, outTime: normTime(x.outTime)!, note: x.note, ...(x.inDay ? { inDay: x.inDay, inTime: normTime(x.inTime)!, inReason: x.inReason } : { inDay: '' }) };
    if (await run({ t: 'editWeaponMove', id: m.id, patch }, false)) { toast({ text: 'Διορθώθηκε η κίνηση' + (p ? ' ' + shortName(p) : ''), actions: [undoMark()] }); onClose(); }
  };
  const del = async () => { if (await run({ t: 'deleteWeaponMove', id: m.id }, false)) { toast({ text: 'Σβήστηκε η κίνηση' + (p ? ' ' + shortName(p) : ''), actions: [undoMark()] }); onClose(); } };
  const set = (k: string) => (v: string) => setX(o => ({ ...o, [k]: v }));
  return html`<${Dialog} title="Διόρθωση κίνησης όπλου" description=${(p ? p.rank + ' ' + plainName(p) : '') + ' · όπλο ' + m.weapon} onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${del} data-tip="Σβήνει την κίνηση (αναιρείται με Ctrl+Z)">Σβήσε<//><span style=${{ flex: 1 }}></span><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} onClick=${save}>Αποθήκευση<//>`}>
    <${ChoiceField} id="we-r" label="Λόγος εξόδου *" value=${x.reason} options=${reasons} otherLabel="Άλλος λόγος (γράψε τον)…" onChange=${set('reason')}/>
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="we-od">Μέρα εξόδου</label><input id="we-od" type="date" className="ui-input" value=${x.outDay} onChange=${(e: any) => e.target.value && set('outDay')(e.target.value)}/></div>
      <${TimeField} id="we-ot" label="Ώρα εξόδου *" value=${x.outTime} onChange=${set('outTime')}/></div>
    <label className="ui-checkrow" style=${{ margin: '4px 0 10px' }}><input type="checkbox" className="ui-check" checked=${!x.inDay} onChange=${(e: any) => setX(o => (e.target.checked ? { ...o, inDay: '', inTime: '', inReason: '' } : { ...o, inDay: todayFn(), inTime: nowHM() }))}/> Είναι ακόμα εκτός (χωρίς είσοδο)</label>
    ${x.inDay && html`<div className="field-row">
      <div className="field"><label className="field__label" htmlFor="we-id">Μέρα εισόδου</label><input id="we-id" type="date" className="ui-input" min=${x.outDay} value=${x.inDay} onChange=${(e: any) => e.target.value && set('inDay')(e.target.value)}/></div>
      <${TimeField} id="we-it" label="Ώρα εισόδου *" value=${x.inTime} onChange=${set('inTime')}/></div>
      <div className="field"><label className="field__label" htmlFor="we-ir">Λόγος εισαγωγής</label><input id="we-ir" className="ui-input" placeholder=${weaponBack(x.reason, state.settings.lists)} value=${x.inReason} onChange=${(e: any) => set('inReason')(e.target.value)}/></div>`}
    <div className="field"><label className="field__label" htmlFor="we-n">Παρατήρηση</label><input id="we-n" className="ui-input" value=${x.note} onChange=${(e: any) => set('note')(e.target.value)}/></div>
  <//>`;
}

// Κινήσεις: «Εκτός τώρα», της μέρας (και όσα ήταν εκτός εκείνη τη μέρα), ή όλες, νεότερες πρώτα
export function MovesView({ date, onIn }: P) {
  const { state, today } = useStore(); const nav = useNav();
  const view: string = nav.params.wmoves || 'open';
  const [edit, setEdit] = useState<WeaponMove | null>(null);
  const pm = personMap(state.people); const log = state.weaponLog || [];
  const openN = log.filter(m => !m.inDay).length;
  const rows = useMemo(() => (view === 'open' ? log.filter(m => !m.inDay) : view === 'day' ? movesOn(log, date) : [...log]).sort(byOut).reverse(), [log, view, date]);
  const dayLbl = date === today ? 'Σήμερα' : dm(date);
  return html`<div>
    <div className="toolbar"><${Segmented} small=${true} value=${view} onChange=${(v: string) => nav.set({ wmoves: v })} items=${[{ value: 'open', label: 'Εκτός τώρα (' + openN + ')' }, { value: 'day', label: dayLbl, tip: 'Όσα βγήκαν ή μπήκαν τη μέρα, και όσα ήταν εκτός' }, { value: 'all', label: 'Όλες (' + log.length + ')' }]}/>
      ${view === 'open' && openN > 0 && html`<${Button} size="sm" variant="outline" onClick=${() => onIn(log.filter(m => !m.inDay).map(m => m.id))}>Είσοδος όλων (${openN})…<//>`}
      <span className="toolbar__count">${rows.length} ${rows.length === 1 ? 'κίνηση' : 'κινήσεις'}</span></div>
    ${rows.length === 0 ? html`<div className="ui-card empty">${view === 'open' ? 'Όλα τα όπλα είναι μέσα στον οπλοβαστό. Για έξοδο: τσέκαρε άτομα στα «Όπλα» ή πάτα «Έξοδος» στη γραμμή του.' : 'Καμία κίνηση.'}</div>` :
    html`<div className="ptable ptable--moves" role="table"><div style=${{ overflowX: 'auto' }}><div style=${{ minWidth: '1140px' }}>
      <div className="ptable__head" role="row"><span>Στρατιώτης</span><span>Όπλο</span><span>Λόγος εξόδου</span><span>Έξοδος</span><span>Λόγος εισόδου</span><span>Είσοδος</span><span>Παρατήρηση</span><span></span></div>
      <div className="weapons__body">${rows.map((m, i) => { const p = pm.get(m.pid); return html`<div key=${m.id} className=${cx('ptable__row', i % 2 === 1 && 'is-odd')} role="row" style=${{ cursor: 'default' }}>
        <span>${p ? html`<button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)}><b>${p.rank} ${shortName(p)}</b></button>` : '—'}</span>
        <span className="num">${m.weapon}</span><span><${Badge} tone="warn">${m.reason}<//></span><span className="num">${dmy(m.outDay)} ${m.outTime}</span>
        <span>${m.inDay ? html`<${Badge} tone="ok">${m.inReason || weaponBack(m.reason, state.settings.lists)}<//>` : html`<${Badge} tone="bad">Εκτός<//>`}</span>
        <span className="num">${m.inDay ? dmy(m.inDay) + ' ' + (m.inTime || '') : '—'}</span><span className="muted">${m.note || ''}</span>
        <span className="weapon-acts">${!m.inDay && html`<${Button} size="sm" variant="outline" onClick=${() => onIn([m.id])}>Είσοδος<//>`}<${Button} size="sm" variant="ghost" onClick=${() => setEdit(m)} data-tip="Ώρες, λόγοι, παρατήρηση, ή σβήσιμο">Διόρθωση<//></span>
      </div>`; })}</div></div></div></div>`}
    ${edit && html`<${EditMoveDialog} m=${edit} onClose=${() => setEdit(null)}/>`}
  </div>`;
}
