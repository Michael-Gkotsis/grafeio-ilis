// features/weapons: έξοδοι και είσοδοι όπλων από τον οπλοβαστό (Michael, 18/10: «όπως οι εξοδούχοι και οι παραμένοντες»).
// Έξοδος: λόγος από τη λίστα «Λόγοι εξόδου όπλου» (ΕΚΠ, ΒΟΛΗ…), μέρα και ώρα (τώρα, αλλάζουν). Είσοδος: ο λόγος εισαγωγής
// μπαίνει μόνος του από τη λίστα (ΕΚΠ → ΛΗΞ ΕΚΠ), με ώρα (τώρα). Κάθε κίνηση διορθώνεται ή σβήνεται στις «Κινήσεις».
// Στη γραμμή (Michael, 18/10: «πιο ξεκάθαρο… πάνω στο table»): διακόπτης ΕΝΤΟΣ | ΕΚΤΟΣ, και ένα μικρό παράθυρο ακριβώς από κάτω
// με ώρα (τώρα) και τους λόγους ως κουμπιά: ένα κλικ στον λόγο και βγήκε. Για είσοδο: ώρα και λόγος εισαγωγής έτοιμα, Enter.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { html, cx, Alert, Badge, Button, Dialog, Segmented, useEscape, useToast } from '../ui';
import { Combo } from '../select';
import { useNav, useStore } from '../store';
import { ChoiceField, DateField, TimeField, useTimeOptions } from '../common';
import { shortName, plainName, type Person, type WeaponMove } from '../../shared/domain';
import { personMap } from '../../shared/rules';
import { listOf, weaponBack } from '../../shared/ranks';
import { normTime } from '../../shared/hours';
import { dm, dmy, nowHM, today as todayFn } from '../../shared/dates';
import { byOut, moveOutTxt, movesOn, openMoves } from '../../shared/weapons';
type P = any;

const names = (ps: Person[], n = 6) => ps.slice(0, n).map(shortName).join(', ') + (ps.length > n ? ' και ' + (ps.length - n) + ' ακόμα' : '');

// Έξοδος όπλων για όσους διάλεξες: μόνο όσοι έχουν αριθμό όπλου και είναι εντός
export function WeaponOutDialog({ pids, reason: r0 = '', onClose, onDone }: P) {
  const { state, run, undoMark } = useStore(); const toast = useToast();
  const reasons = useMemo(() => listOf(state.settings.lists, 'weaponOut'), [state.settings.lists]);
  const [reason, setReason] = useState(r0); const [day, setDay] = useState(todayFn()); const [time, setTime] = useState(nowHM()); const [note, setNote] = useState('');
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
    <${ChoiceField} id="wo-r" label="Λόγος εξόδου *" value=${reason} options=${reasons} autoFocus=${!r0} placeholder="π.χ. ΦΡΟΥΡΑ" otherLabel="Άλλος λόγος (γράψε τον)…" otherHelp="Για να προτείνεται κάθε φορά, με τον λόγο εισαγωγής του, πρόσθεσέ τον στις Ρυθμίσεις › Λίστες." onChange=${setReason}/>
    ${reason.trim() && html`<p className="note" style=${{ margin: '-4px 0 10px' }}>Όταν μπει πάλι: <b>${weaponBack(reason, state.settings.lists)}</b></p>`}
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="wo-d">Μέρα</label><${DateField} id="wo-d" className="ui-input" value=${day} onChange=${(e: any) => e.target.value && setDay(e.target.value)}/></div>
      <${TimeField} id="wo-t" now=${true} label="Ώρα εξόδου *" value=${time} onChange=${setTime} help="Η τωρινή· άλλαξέ την αν βγήκε νωρίτερα"/></div>
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
      <div className="field"><label className="field__label" htmlFor="wi-d">Μέρα</label><${DateField} id="wi-d" className="ui-input" value=${day} onChange=${(e: any) => e.target.value && setDay(e.target.value)}/></div>
      <${TimeField} id="wi-t" now=${true} label="Ώρα εισόδου *" value=${time} onChange=${setTime} help="Η τωρινή· άλλαξέ την αν μπήκε νωρίτερα"/></div>
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
      <div className="field"><label className="field__label" htmlFor="we-od">Μέρα εξόδου</label><${DateField} id="we-od" className="ui-input" value=${x.outDay} onChange=${(e: any) => e.target.value && set('outDay')(e.target.value)}/></div>
      <${TimeField} id="we-ot" now=${true} label="Ώρα εξόδου *" value=${x.outTime} onChange=${set('outTime')}/></div>
    <label className="ui-checkrow" style=${{ margin: '4px 0 10px' }}><input type="checkbox" className="ui-check" checked=${!x.inDay} onChange=${(e: any) => setX(o => (e.target.checked ? { ...o, inDay: '', inTime: '', inReason: '' } : { ...o, inDay: todayFn(), inTime: nowHM() }))}/> Είναι ακόμα εκτός (χωρίς είσοδο)</label>
    ${x.inDay && html`<div className="field-row">
      <div className="field"><label className="field__label" htmlFor="we-id">Μέρα εισόδου</label><${DateField} id="we-id" className="ui-input" min=${x.outDay} value=${x.inDay} onChange=${(e: any) => e.target.value && set('inDay')(e.target.value)}/></div>
      <${TimeField} id="we-it" now=${true} label="Ώρα εισόδου *" value=${x.inTime} onChange=${set('inTime')}/></div>
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

// Μικρό παράθυρο κάτω από τον διακόπτη (ή από πάνω, αν δεν χωρά)· κλείνει με Esc ή κλικ έξω
function Pop({ anchor, onClose, children, label }: P) {
  const box = useRef<HTMLDivElement>(null); const [pos, setPos] = useState<Record<string, number> | null>(null);
  useEscape(onClose);
  useLayoutEffect(() => {
    const upd = () => {
      const el = anchor.current; if (!el) return;
      const r = el.getBoundingClientRect(), vh = window.innerHeight, vw = document.documentElement.clientWidth, h = box.current?.offsetHeight || 300;
      const width = Math.min(380, vw - 16), left = Math.max(8, Math.min(r.left, vw - width - 8));
      setPos(vh - r.bottom - 12 < h && r.top - 12 > vh - r.bottom ? { left, width, bottom: vh - r.top + 6 } : { left, width, top: r.bottom + 6 });
    };
    upd(); const t = setTimeout(upd);
    window.addEventListener('scroll', upd, true); window.addEventListener('resize', upd);
    return () => { clearTimeout(t); window.removeEventListener('scroll', upd, true); window.removeEventListener('resize', upd); };
  }, []);
  useEffect(() => {
    // η λίστα μιας ώρας ή μέρας (select.ts) είναι έξω από το παράθυρο αλλά ανήκει σε αυτό
    const out = (e: MouseEvent) => { const t = e.target as Element; if (!box.current?.contains(t) && !anchor.current?.contains(t) && !t.closest?.('.ui-dd__pop')) onClose(); };
    document.addEventListener('mousedown', out); return () => document.removeEventListener('mousedown', out);
  }, [onClose]);
  useEffect(() => { (box.current?.querySelector('[data-autofocus]') as HTMLElement | null)?.focus(); }, []);
  return createPortal(html`<div ref=${box} className="wpop" role="dialog" aria-label=${label} style=${pos || { left: -9999, top: 0 }}>${children}</div>`, document.body);
}
const when = (day: string, time: string, today: string) => (day === today ? '' : dm(day) + ' ') + time;
// Ώρα και μέρα στο μικρό παράθυρο: η τωρινή, αλλάζουν
function WhenRow({ day, time, setDay, setTime, label, focus }: P) {
  const bad = !normTime(time); const opts = useTimeOptions(undefined, true);
  return html`<div className="wpop__when"><label><span>${label}</span><${Combo} className="ui-input wpop__time" inputMode="numeric" options=${opts} value=${time} aria-invalid=${bad || undefined} aria-label=${label} data-autofocus=${focus ? '' : undefined}
      onChange=${(e: any) => setTime(e.target.value)} onBlur=${() => { const t = normTime(time); if (t && t !== time) setTime(t); }}/></label>
    <label><span>Μέρα</span><${DateField} className="ui-input wpop__day" value=${day} aria-label="Μέρα" onChange=${(e: any) => e.target.value && setDay(e.target.value)}/></label></div>`;
}

// Έξοδος ενός όπλου από τη γραμμή: ώρα (τώρα), παρατήρηση, και ένα κλικ στον λόγο
function OutPop({ p, anchor, onClose }: P) {
  const { state, run, undoMark, today } = useStore(); const toast = useToast(); const lists = state.settings.lists;
  const reasons: string[] = useMemo(() => listOf(lists, 'weaponOut'), [lists]);
  const [day, setDay] = useState(todayFn()); const [time, setTime] = useState(nowHM()); const [note, setNote] = useState(''); const [other, setOther] = useState('');
  const [hover, setHover] = useState('');
  const go = async (reason: string) => {
    const t = normTime(time); if (!reason.trim() || !t) return;
    if (!(await run({ t: 'weaponOut', pids: [p.id], reason, day, time: t, note }, false))) return;
    toast({ text: shortName(p) + ': όπλο ' + p.weapon + ' ΕΚΤΟΣ (' + reason.trim().toUpperCase() + ') ' + when(day, t, today), actions: [undoMark()] });
    onClose();
  };
  const tip = hover || other.trim();
  return html`<${Pop} anchor=${anchor} onClose=${onClose} label=${'Έξοδος όπλου ' + p.weapon}>
    <div className="wpop__head"><b>Έξοδος όπλου ${p.weapon}</b><small>${p.rank} ${plainName(p)}</small></div>
    <${WhenRow} label="Ώρα εξόδου" focus=${true} day=${day} time=${time} setDay=${setDay} setTime=${setTime}/>
    <input className="ui-input wpop__note" placeholder="Παρατήρηση (αν θες), π.χ. πεδίο βολής" value=${note} onChange=${(e: any) => setNote(e.target.value)} aria-label="Παρατήρηση"/>
    <div className="wpop__lbl">Γιατί βγαίνει; Πάτα τον λόγο:</div>
    <div className="wpop__reasons">${reasons.map(r => html`<button key=${r} type="button" className="wpop__reason" disabled=${!normTime(time)}
      onMouseEnter=${() => setHover(r)} onMouseLeave=${() => setHover('')} onFocus=${() => setHover(r)} onBlur=${() => setHover('')} onClick=${() => go(r)}>${r}</button>`)}</div>
    <form className="wpop__other" onSubmit=${(e: any) => { e.preventDefault(); go(other); }}>
      <input className="ui-input" placeholder="Άλλος λόγος…" value=${other} onChange=${(e: any) => setOther(e.target.value)} aria-label="Άλλος λόγος"/>
      <${Button} size="sm" type="submit" disabled=${!other.trim() || !normTime(time)}>Έξοδος<//></form>
    <p className="wpop__foot">${tip ? html`<span>Όταν μπει πάλι: <b>${weaponBack(tip, lists)}</b></span>` : 'Κάθε λόγος έχει τον λόγο εισαγωγής του (Ρυθμίσεις › Λίστες › Λόγοι εξόδου όπλου).'}</p>
  <//>`;
}
// Είσοδος από τη γραμμή: ώρα (τώρα) και λόγος εισαγωγής από τη λίστα, έτοιμα· Enter και μπήκε
function InPop({ p, m, anchor, onClose, onEdit }: P) {
  const { state, run, undoMark, today } = useStore(); const toast = useToast();
  const auto = weaponBack(m.reason, state.settings.lists);
  const [day, setDay] = useState(todayFn()); const [time, setTime] = useState(nowHM()); const [reason, setReason] = useState(auto);
  const t = normTime(time); const early = !!t && day + ' ' + t < m.outDay + ' ' + m.outTime;
  const ok = !!t && !early;
  const go = async (e?: any) => {
    e?.preventDefault(); if (!ok) return;
    if (!(await run({ t: 'weaponIn', ids: [m.id], day, time: t!, reason: reason.trim() || undefined }, false))) return;
    toast({ text: shortName(p) + ': όπλο ' + m.weapon + ' ΕΝΤΟΣ (' + (reason.trim().toUpperCase() || auto) + ') ' + when(day, t!, today), actions: [undoMark()] });
    onClose();
  };
  return html`<${Pop} anchor=${anchor} onClose=${onClose} label=${'Είσοδος όπλου ' + m.weapon}>
    <div className="wpop__head"><b>Είσοδος όπλου ${m.weapon}</b><small>${p.rank} ${plainName(p)} · βγήκε ${m.reason} ${when(m.outDay, m.outTime, today)}</small></div>
    <form onSubmit=${go}>
      <${WhenRow} label="Ώρα εισόδου" day=${day} time=${time} setDay=${setDay} setTime=${setTime}/>
      <label className="wpop__field"><span>Λόγος εισαγωγής</span><input className="ui-input" value=${reason} placeholder=${auto} onChange=${(e: any) => setReason(e.target.value)} aria-label="Λόγος εισαγωγής"/></label>
      ${early && html`<p className="wpop__err">Η ώρα είναι πριν την έξοδο (${dm(m.outDay)} ${m.outTime}).</p>`}
      <div className="wpop__acts"><${Button} variant="ghost" size="sm" onClick=${() => { onClose(); onEdit(m); }} data-tip="Άλλαξε λόγο, ώρα εξόδου ή παρατήρηση, ή σβήσε την κίνηση">Διόρθωση εξόδου…<//>
        <${Button} size="sm" type="submit" disabled=${!ok} data-autofocus="">Μπαίνει ΕΝΤΟΣ<//></div>
    </form>
  <//>`;
}

// Κατάσταση του όπλου στη γραμμή: ΕΝΤΟΣ | ΕΚΤΟΣ, και δίπλα γιατί και από πότε. Ένοπλη υπηρεσία: εκτός αυτόματα.
export function WeaponState({ p, info }: P) {
  const { state, today } = useStore(); const lists = state.settings.lists;
  const ref = useRef<HTMLDivElement>(null); const [open, setOpen] = useState(false); const [edit, setEdit] = useState<WeaponMove | null>(null);
  const m: WeaponMove | undefined = info.moves.get(p.id); const duty: string | undefined = info.out.get(p.id);
  const has = !!p.weapon;
  if (!m && !duty && !(p.active && has)) return html`<span className="muted wstate__none">${has ? '—' : 'χωρίς όπλο'}</span>`;
  const out = !!m || !!duty; const auto = !m && !!duty;
  const why = m ? html`<span className="wstate__why" data-tip=${'Βγήκε: ' + moveOutTxt(m) + (m.note ? ' · ' + m.note : '') + (duty ? ' · και ένοπλη υπηρεσία: ' + duty : '') + ' · μπαίνει με ' + weaponBack(m.reason, lists)}><b>${m.reason}</b> <span>${when(m.outDay, m.outTime, today)}</span>${m.note ? html` <i>· ${m.note}</i>` : ''}</span>`
    : auto ? html`<span className="wstate__why" data-tip=${'Αυτόματα: ένοπλη υπηρεσία ' + duty + '. Για να αλλάξει, άλλαξε τις υπηρεσίες.'}><b>ΥΠΗΡΕΣΙΑ</b> <span>${duty}</span></span>`
    : null;   // ΕΝΤΟΣ: το λέει ήδη ο διακόπτης
  const click = (want: boolean) => { if (auto || want === out) return; setOpen(true); };
  return html`<div className=${cx('wstate', out && 'is-out', auto && 'is-auto')}>
    <div ref=${ref} className="wstate__sw" role="group" aria-label=${'Κατάσταση όπλου ' + p.weapon}>
      <button type="button" aria-pressed=${!out} disabled=${auto} onClick=${() => click(false)} data-tip=${out && !auto ? 'Μπαίνει στον οπλοβαστό: ώρα και λόγος εισαγωγής' : undefined}>ΕΝΤΟΣ</button>
      <button type="button" aria-pressed=${out} disabled=${auto} onClick=${() => click(true)} data-tip=${!out ? 'Βγαίνει από τον οπλοβαστό: ώρα και λόγος' : undefined}>ΕΚΤΟΣ</button>
    </div>${why}
    ${open && (m ? html`<${InPop} p=${p} m=${m} anchor=${ref} onClose=${() => setOpen(false)} onEdit=${setEdit}/>` : html`<${OutPop} p=${p} anchor=${ref} onClose=${() => setOpen(false)}/>`)}
    ${edit && html`<${EditMoveDialog} m=${edit} onClose=${() => setEdit(null)}/>`}
  </div>`;
}
