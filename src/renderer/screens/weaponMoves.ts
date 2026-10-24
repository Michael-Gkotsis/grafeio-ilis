// features/weapons: έξοδοι και είσοδοι όπλων από τον οπλοβαστό (Michael, 18/10: «όπως οι εξοδούχοι και οι παραμένοντες»).
// Έξοδος: λόγος από τη λίστα «Λόγοι εξόδου όπλου» (ΕΚΠ, ΒΟΛΗ…), μέρα και ώρα (τώρα, αλλάζουν). Είσοδος: ο λόγος εισαγωγής
// μπαίνει μόνος του από τη λίστα (ΕΚΠ → ΛΗΞ ΕΚΠ), με ώρα (τώρα). Κάθε κίνηση διορθώνεται ή σβήνεται στις «Κινήσεις».
// Στη γραμμή (Michael, 18/10: «πιο ξεκάθαρο… πάνω στο table»): διακόπτης ΕΝΤΟΣ | ΕΚΤΟΣ, και ένα μικρό παράθυρο ακριβώς από κάτω
// με ώρα (τώρα) και τους λόγους ως κουμπιά: ένα κλικ στον λόγο και βγήκε. Για είσοδο: ώρα και λόγος εισαγωγής έτοιμα, Enter.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { html, cx, Alert, Badge, Button, Why, missingOf, Dialog, Segmented, useEscape, useToast } from '../ui';
import { Combo } from '../select';
import { useNav, useStore } from '../store';
import { ChoiceField, DateField, GoLink, TimeField, useTimeOptions } from '../common';
import { shortName, plainName, type Person, type WeaponMove } from '../../shared/domain';
import { personMap } from '../../shared/rules';
import { listOf, rankTxt, weaponBack } from '../../shared/ranks';
import { normTime } from '../../shared/hours';
import { dm, dmy, nowHM, today as todayFn } from '../../shared/dates';
import { armedRows, armWhen, calDay, hmOf, stampMin, stampOf, type ArmRow } from '../../shared/armed';
import { armTxt, byOut, dutyMove, isAuto, moveInCell, moveOutCell, moveOutTxt, movesOn, openMoves, type ArmInfo } from '../../shared/weapons';
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
  const miss = !go.length ? 'Κανένα όπλο για έξοδο' : missingOf([['Λόγος', reason.trim()], ['Ώρα', normTime(time)]]);
  const save = async () => {
    if (!ok) return;
    if (!(await run({ t: 'weaponOut', pids: go.map(p => p.id), reason, day, time: normTime(time)!, note }, false))) return;
    toast({ text: 'Έξοδος όπλων (' + reason.trim().toUpperCase() + ') ' + normTime(time) + ': ' + (go.length === 1 ? shortName(go[0]) : go.length + ' όπλα'), actions: [undoMark()] });
    onDone?.(reason.trim().toUpperCase()); onClose();
  };
  return html`<${Dialog} title=${'Έξοδος όπλων' + (go.length > 1 ? ' (' + go.length + ')' : '')} description=${go.length === 1 ? rankTxt(go[0]) + ' ' + plainName(go[0]) + ' · όπλο ' + go[0].weapon : go.length ? names(go) : 'Κανένα όπλο για έξοδο'} onClose=${onClose}
    footer=${html`<${Why} text=${miss}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} why=${miss} data-autofocus=${r0 ? '' : undefined} onClick=${save}>Έξοδος${go.length > 1 ? ' (' + go.length + ')' : ''}<//>`}>
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
  const miss = !moves.length ? 'Κανένα όπλο εκτός' : !normTime(time) ? 'Λείπει: Ώρα' : early.length ? 'Η ώρα είναι πριν την έξοδο' : '';
  const save = async () => {
    if (!ok) return;
    if (!(await run({ t: 'weaponIn', ids: moves.map(m => m.id), day, time: normTime(time)!, reason: reason.trim() || undefined }, false))) return;
    toast({ text: 'Είσοδος όπλων (' + (reason.trim().toUpperCase() || backs.join(', ')) + ') ' + normTime(time) + ': ' + (moves.length === 1 ? shortName(pm.get(moves[0].pid)!) : moves.length + ' όπλα'), actions: [undoMark()] });
    onDone?.(); onClose();
  };
  return html`<${Dialog} title=${'Είσοδος όπλων' + (moves.length > 1 ? ' (' + moves.length + ')' : '')} description=${moves.length === 1 ? shortName(pm.get(moves[0].pid)!) + ' · όπλο ' + moves[0].weapon + ' · βγήκε ' + moves[0].reason + ' ' + dm(moves[0].outDay) + ' ' + moves[0].outTime : moves.length + ' όπλα που είναι εκτός'} onClose=${onClose}
    footer=${html`<${Why} text=${miss}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} why=${miss} data-autofocus="" onClick=${save}>Είσοδος${moves.length > 1 ? ' (' + moves.length + ')' : ''}<//>`}>
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="wi-d">Μέρα</label><${DateField} id="wi-d" className="ui-input" value=${day} onChange=${(e: any) => e.target.value && setDay(e.target.value)}/></div>
      <${TimeField} id="wi-t" now=${true} label="Ώρα εισόδου *" value=${time} onChange=${setTime} help="Η τωρινή· άλλαξέ την αν μπήκε νωρίτερα"/></div>
    <div className="field"><label className="field__label" htmlFor="wi-r">Λόγος εισαγωγής</label><input id="wi-r" className="ui-input" placeholder=${backs.length === 1 ? backs[0] : 'Αυτόματα: ' + backs.join(', ')} value=${reason} onChange=${(e: any) => setReason(e.target.value)}/>
      <span className="field__help">${reason.trim() ? 'Γράφεται σε όλα: ' + reason.trim().toUpperCase() : html`Κενό: ο λόγος εισαγωγής κάθε εξόδου από τη λίστα (<${GoLink} view="templates" params=${{ tab: 'lists' }}>Ρυθμίσεις › Λίστες<//>)`}</span></div>
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
  const miss = missingOf([['Λόγος', x.reason.trim()], ['Ώρα εξόδου', normTime(x.outTime)], ['Ώρα εισόδου', !x.inDay || normTime(x.inTime)]]);
  const save = async () => {
    if (!ok) return;
    const patch = { reason: x.reason, outDay: x.outDay, outTime: normTime(x.outTime)!, note: x.note, ...(x.inDay ? { inDay: x.inDay, inTime: normTime(x.inTime)!, inReason: x.inReason } : { inDay: '' }) };
    if (await run({ t: 'editWeaponMove', id: m.id, patch }, false)) { toast({ text: 'Διορθώθηκε η κίνηση' + (p ? ' ' + shortName(p) : ''), actions: [undoMark()] }); onClose(); }
  };
  const del = async () => { if (await run({ t: 'deleteWeaponMove', id: m.id }, false)) { toast({ text: 'Σβήστηκε η κίνηση' + (p ? ' ' + shortName(p) : ''), actions: [undoMark()] }); onClose(); } };
  const set = (k: string) => (v: string) => setX(o => ({ ...o, [k]: v }));
  return html`<${Dialog} title="Διόρθωση κίνησης όπλου" description=${(p ? rankTxt(p) + ' ' + plainName(p) : '') + ' · όπλο ' + m.weapon} onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${del} data-tip="Σβήνει την κίνηση (αναιρείται με Ctrl+Z)">Σβήσε<//><span style=${{ flex: 1 }}></span><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} why=${miss} onClick=${save}>Αποθήκευση<//>`}>
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

// Διόρθωση ώρας ενός ένοπλου νούμερου (Michael, 24/10): οι ώρες βγαίνουν από τις υπηρεσίες· εδώ αλλάζουν για αυτό το νούμερο, με λόγο
function DutyFixDialog({ row, onClose }: P) {
  const { state, run, undoMark } = useStore(); const toast = useToast();
  const pm = personMap(state.people); const p = pm.get(row.who); const owner = pm.get(row.owner);
  const [x, setX] = useState(() => ({ od: calDay(row.day, row.out), ot: hmOf(row.out), id: calDay(row.day, row.in), it: hmOf(row.in), why: row.fix?.why || '' }));
  const ot = normTime(x.ot), it = normTime(x.it); const out = ot ? x.od + ' ' + ot : '', inn = it ? x.id + ' ' + it : '';
  const set = (k: string) => (v: string) => setX(o => ({ ...o, [k]: v }));
  const why = !ot ? 'Λείπει: Ώρα εξόδου' : !it ? 'Λείπει: Ώρα εισόδου' : stampMin(row.day, inn) < stampMin(row.day, out) ? 'Η είσοδος είναι πριν την έξοδο' : !x.why.trim() ? 'Λείπει: Λόγος διόρθωσης' : out === stampOf(row.day, row.out) && inn === stampOf(row.day, row.in) && x.why.trim() === (row.fix?.why || '') ? 'Άλλαξε μια ώρα' : '';
  const done = (text: string) => { toast({ text, actions: [undoMark()] }); onClose(); };
  const save = async () => { if (!why && await run({ t: 'fixDutyWeapon', day: row.day, post: row.post, n: row.n, out, in: inn, why: x.why }, false)) done('Διορθώθηκαν οι ώρες: ' + row.reason + (p ? ' ' + shortName(p) : '')); };
  const reset = async () => { if (await run({ t: 'fixDutyWeapon', day: row.day, post: row.post, n: row.n, why: '', reset: true }, false)) done('Οι ώρες γύρισαν στο αυτόματο: ' + row.reason + (p ? ' ' + shortName(p) : '')); };
  return html`<${Dialog} title="Διόρθωση ώρας ένοπλης υπηρεσίας" description=${row.reason + (p ? ' · ' + rankTxt(p) + ' ' + plainName(p) : '') + ' · αυτόματα ' + hmOf(row.autoOut) + '–' + hmOf(row.autoIn)} onClose=${onClose}
    footer=${html`${row.fix && html`<${Button} variant="ghost" onClick=${reset} data-tip="Σβήνει τη διόρθωση: οι ώρες ξαναβγαίνουν από τις υπηρεσίες (αναιρείται με Ctrl+Z)">Πίσω στο αυτόματο<//>`}<span style=${{ flex: 1 }}></span><${Why} text=${why}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!!why} why=${why} onClick=${save}>Αποθήκευση<//>`}>
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="df-od">Μέρα εξόδου</label><${DateField} id="df-od" className="ui-input" value=${x.od} onChange=${(e: any) => e.target.value && set('od')(e.target.value)}/></div>
      <${TimeField} id="df-ot" now=${true} label="Ώρα εξόδου *" value=${x.ot} onChange=${set('ot')} help=${row.take ? 'Πότε παραλαμβάνει το όπλο' : 'Πότε βγαίνει το όπλο από τον οπλοβαστό'}/></div>
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="df-id">Μέρα εισόδου</label><${DateField} id="df-id" className="ui-input" min=${x.od} value=${x.id} onChange=${(e: any) => e.target.value && set('id')(e.target.value)}/></div>
      <${TimeField} id="df-it" now=${true} label="Ώρα εισόδου *" value=${x.it} onChange=${set('it')} help=${row.give ? 'Πότε το παραδίδει στον επόμενο' : 'Πότε μπαίνει πάλι στον οπλοβαστό'}/></div>
    <div className="field"><label className="field__label" htmlFor="df-w">Λόγος της διόρθωσης *</label><input id="df-w" className="ui-input" placeholder="π.χ. άργησε η αλλαγή φρουράς" value=${x.why} onChange=${(e: any) => set('why')(e.target.value)}/>
      <span className="field__help">Γράφεται στο Ιστορικό και στην Παρατήρηση του Excel κινήσεων.</span></div>
    ${row.mode === 'post' && html`<${Alert} tone="info"><span>Όπλο της θέσης${owner ? ' (' + shortName(owner) + ')' : ''}: αλλάζει μόνο αυτή η γραμμή· οι άλλες μένουν όπως είναι.</span><//>`}
  <//>`;
}

// Κινήσεις: «Εκτός τώρα», της μέρας (και όσα ήταν εκτός εκείνη τη μέρα), ή όλες, νεότερες πρώτα. Οι ένοπλες υπηρεσίες φαίνονται
// ως αυτόματες γραμμές με τις ώρες τους (εκτός τώρα και της μέρας)· διορθώνονται μόνο με «Διόρθωση…»
export function MovesView({ date, info, pm, outN, onIn }: P) {
  const { state, today } = useStore(); const nav = useNav();
  const view: string = nav.params.wmoves || 'open';
  const [edit, setEdit] = useState<WeaponMove | null>(null); const [fix, setFix] = useState<ArmRow | null>(null);
  const log = state.weaponLog || [];
  const openN = log.filter(m => !m.inDay).length;
  const rows = useMemo(() => {
    const auto = (view === 'open' ? (info.arm.live ? [...info.arm.cur.values()] : info.arm.rows) : view === 'day' ? armedRows(state, date) : []).map((r: ArmRow) => dutyMove(state, r));
    return [...(view === 'open' ? log.filter(m => !m.inDay) : view === 'day' ? movesOn(log, date) : [...log]), ...auto].sort(byOut).reverse();
  }, [log, view, date, info, state.people, state.guards, state.dutyLog, state.settings, state.rules, state.dutyFix]);
  const dayLbl = date === today ? 'Σήμερα' : dm(date);
  return html`<div>
    <div className="toolbar"><${Segmented} small=${true} value=${view} onChange=${(v: string) => nav.set({ wmoves: v })} items=${[{ value: 'open', label: 'Εκτός τώρα (' + outN + ')', tip: 'Κινήσεις που δεν έχουν είσοδο και ένοπλες υπηρεσίες που τρέχουν: όσους μετράει και ο τίτλος της σελίδας' }, { value: 'day', label: dayLbl, tip: 'Όσα βγήκαν ή μπήκαν τη μέρα, όσα ήταν εκτός, και τα νούμερα των ένοπλων υπηρεσιών' }, { value: 'all', label: 'Όλες (' + log.length + ')' }]}/>
      ${view === 'open' && openN > 0 && html`<${Button} size="sm" variant="outline" onClick=${() => onIn(log.filter(m => !m.inDay).map(m => m.id))}>Είσοδος όλων (${openN})…<//>`}
      <span className="toolbar__count">${rows.length} ${rows.length === 1 ? 'κίνηση' : 'κινήσεις'}</span></div>
    ${rows.length === 0 ? html`<div className="ui-card empty">${view === 'open' ? 'Όλα τα όπλα είναι μέσα στον οπλοβαστό. Για έξοδο: τσέκαρε άτομα στα «Όπλα» ή πάτα «Έξοδος» στη γραμμή του.' : 'Καμία κίνηση.'}</div>` :
    html`<div className="ptable ptable--moves" role="table"><div style=${{ overflowX: 'auto' }}><div style=${{ minWidth: '1190px' }}>
      <div className="ptable__head" role="row"><span>Στρατιώτης</span><span>Όπλο</span><span>Λόγος εξόδου</span><span>Έξοδος</span><span>Λόγος εισόδου</span><span>Είσοδος</span><span>Παρατήρηση</span><span></span></div>
      <div className="weapons__body">${rows.map((m, i) => { const p = pm.get(m.pid); const auto = isAuto(m); const owner = auto && m.row.owner !== m.pid ? pm.get(m.row.owner) : null;
        return html`<div key=${m.id} className=${cx('ptable__row', i % 2 === 1 && 'is-odd', auto && 'is-auto')} role="row" style=${{ cursor: 'default' }}>
        <span>${p ? html`<button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)}><b>${rankTxt(p)} ${shortName(p)}</b></button>` : '—'}</span>
        <span className="num">${m.weapon || '—'}</span><span data-tip=${m.reason}><${Badge} tone="warn">${m.reason}<//></span>
        <span className="num">${auto ? moveOutCell(m) : dmy(m.outDay) + ' ' + m.outTime}</span>
        <span data-tip=${m.inDay ? m.inReason || undefined : undefined}>${m.inDay ? html`<${Badge} tone="ok">${m.inReason || weaponBack(m.reason, state.settings.lists)}<//>` : html`<${Badge} tone="bad">Εκτός<//>`}</span>
        <span className="num" data-tip=${auto ? 'Η ώρα που προβλέπεται από τις υπηρεσίες' : undefined}>${auto ? moveInCell(m) : m.inDay ? dmy(m.inDay) + ' ' + (m.inTime || '') : '—'}</span>
        <span className="muted" data-tip=${auto ? [owner ? 'Όπλο της θέσης του ' + shortName(owner) : m.row.mode === 'post' ? 'Όπλο της θέσης' : '', m.note].filter(Boolean).join(' · ') : m.note || undefined}>${auto ? html`<i className="wmv__auto" data-tip="Βγαίνει από τις ένοπλες υπηρεσίες: οι ώρες μπαίνουν μόνες τους (Ρυθμίσεις › Υπηρεσίες, Κανόνες)">αυτόματα</i>${[owner ? ' · όπλο της θέσης του ' + shortName(owner) : m.row.mode === 'post' ? ' · όπλο της θέσης' : '', m.note ? ' · ' + m.note : ''].join('')}` : m.note || ''}</span>
        <span className="weapon-acts">${!auto && !m.inDay && html`<${Button} size="sm" variant="outline" onClick=${() => onIn([m.id])}>Είσοδος<//>`}<${Button} size="sm" variant="ghost" onClick=${() => (auto ? setFix(m.row) : setEdit(m))} data-tip=${auto ? 'Άλλαξε την ώρα εξόδου ή εισόδου, με λόγο' : 'Ώρες, λόγοι, παρατήρηση, ή σβήσιμο'}>Διόρθωση${auto ? '…' : ''}<//></span>
      </div>`; })}</div></div></div></div>`}
    ${edit && html`<${EditMoveDialog} m=${edit} onClose=${() => setEdit(null)}/>`}
    ${fix && html`<${DutyFixDialog} row=${fix} onClose=${() => setFix(null)}/>`}
  </div>`;
}

// Μικρό παράθυρο κάτω από τον διακόπτη (ή από πάνω, αν δεν χωρά)· κλείνει με Esc ή κλικ έξω
export function Pop({ anchor, onClose, children, label }: P) {
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
    <div className="wpop__head"><b>Έξοδος όπλου ${p.weapon}</b><small>${rankTxt(p)} ${plainName(p)}</small></div>
    <${WhenRow} label="Ώρα εξόδου" focus=${true} day=${day} time=${time} setDay=${setDay} setTime=${setTime}/>
    <input className="ui-input wpop__note" placeholder="Παρατήρηση (αν θες), π.χ. πεδίο βολής" value=${note} onChange=${(e: any) => setNote(e.target.value)} aria-label="Παρατήρηση"/>
    <div className="wpop__lbl">Γιατί βγαίνει; Πάτα τον λόγο:</div>
    <div className="wpop__reasons">${reasons.map(r => html`<button key=${r} type="button" className="wpop__reason" disabled=${!normTime(time)}
      onMouseEnter=${() => setHover(r)} onMouseLeave=${() => setHover('')} onFocus=${() => setHover(r)} onBlur=${() => setHover('')} onClick=${() => go(r)}>${r}</button>`)}</div>
    <form className="wpop__other" onSubmit=${(e: any) => { e.preventDefault(); go(other); }}>
      <input className="ui-input" placeholder="Άλλος λόγος…" value=${other} onChange=${(e: any) => setOther(e.target.value)} aria-label="Άλλος λόγος"/>
      <${Button} size="sm" type="submit" disabled=${!other.trim() || !normTime(time)} why=${!normTime(time) ? 'Λείπει: Ώρα' : 'Γράψε πρώτα τον λόγο'}>Έξοδος<//></form>
    <p className="wpop__foot">${tip ? html`<span>Όταν μπει πάλι: <b>${weaponBack(tip, lists)}</b></span>` : html`Κάθε λόγος έχει τον λόγο εισαγωγής του (<${GoLink} view="templates" params=${{ tab: 'lists' }}>Ρυθμίσεις › Λίστες<//> › Λόγοι εξόδου όπλου).`}</p>
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
    <div className="wpop__head"><b>Είσοδος όπλου ${m.weapon}</b><small>${rankTxt(p)} ${plainName(p)} · βγήκε ${m.reason} ${when(m.outDay, m.outTime, today)}</small></div>
    <form onSubmit=${go}>
      <${WhenRow} label="Ώρα εισόδου" day=${day} time=${time} setDay=${setDay} setTime=${setTime}/>
      <label className="wpop__field"><span>Λόγος εισαγωγής</span><input className="ui-input" value=${reason} placeholder=${auto} onChange=${(e: any) => setReason(e.target.value)} aria-label="Λόγος εισαγωγής"/></label>
      ${early && html`<p className="wpop__err">Η ώρα είναι πριν την έξοδο (${dm(m.outDay)} ${m.outTime}).</p>`}
      <div className="wpop__acts"><${Button} variant="ghost" size="sm" onClick=${() => { onClose(); onEdit(m); }} data-tip="Άλλαξε λόγο, ώρα εξόδου ή παρατήρηση, ή σβήσε την κίνηση">Διόρθωση εξόδου…<//>
        <${Button} size="sm" type="submit" disabled=${!ok} why=${!t ? 'Λείπει: Ώρα' : 'Η ώρα είναι πριν την έξοδο'} data-autofocus="">Μπαίνει ΕΝΤΟΣ<//></div>
    </form>
  <//>`;
}

// Κατάσταση του όπλου στη γραμμή: ΕΝΤΟΣ | ΕΚΤΟΣ, και από κάτω γιατί και πότε (όλος ο λόγος). Ένοπλη υπηρεσία: εκτός αυτόματα, με τις ώρες
// του νούμερου· πριν ή μετά το νούμερο φαίνεται πότε βγαίνει ή γύρισε (Michael, 24/10).
export function WeaponState({ p, info, pm }: P) {
  const { state, today } = useStore(); const lists = state.settings.lists;
  const ref = useRef<HTMLDivElement>(null); const [open, setOpen] = useState(false); const [edit, setEdit] = useState<WeaponMove | null>(null); const [fix, setFix] = useState<ArmRow | null>(null);
  const m: WeaponMove | undefined = info.moves.get(p.id); const duty: string | undefined = info.out.get(p.id);
  const arm: ArmInfo = info.arm; const has = !!p.weapon;
  const cur = arm.cur.get(p.id); const day = !arm.live && duty ? arm.rows.filter((r: ArmRow) => r.owner === p.id) : [];   // τρέχον νούμερο, ή όλα της μέρας
  const nxt = arm.next.get(p.id), prv = arm.prev.get(p.id), hold = arm.holding.get(p.id);
  const pn = (id: number) => (pm.get(id) ? shortName(pm.get(id)) : '—');
  const when2 = (r: ArmRow, m: number) => (calDay(r.day, m) === today ? '' : dm(calDay(r.day, m)) + ' ') + hmOf(m);
  if (!m && !duty && !(p.active && has) && !nxt) return html`<span className="muted wstate__none">${has ? '—' : 'χωρίς όπλο'}</span>`;
  const out = !!m || !!duty; const auto = !m && !!duty;
  const first = cur || day[0];
  const autoTip = first ? 'Αυτόματα από τις ένοπλες υπηρεσίες: ' + first.reason + ' ' + (arm.live ? armWhen(first) : armTxt(day)) + (first.mode === 'post' ? '. Όπλο της θέσης: περνά από χέρι σε χέρι στις αλλαγές' : '') + '. Για άλλες ώρες: Διόρθωση…' : '';
  const why = m ? html`<span className="wstate__why" data-tip=${'Βγήκε: ' + moveOutTxt(m) + (m.note ? ' · ' + m.note : '') + (duty ? ' · και ένοπλη υπηρεσία: ' + duty : '') + ' · μπαίνει με ' + weaponBack(m.reason, lists)}><b>${m.reason}</b> <span>${when(m.outDay, m.outTime, today)}</span>${m.note ? html` <i>· ${m.note}</i>` : ''}</span>`
    : auto && first ? html`<span className="wstate__why" data-tip=${autoTip}><b>${first.reason}</b>${cur && cur.who !== cur.owner ? html` <i>· ${pn(cur.who)}</i>` : ''}</span>`
    : hold ? html`<span className="wstate__soon" data-tip=${'Κρατά το όπλο της θέσης (' + hold.label + ') του ' + pn(hold.owner) + ' ως τις ' + hmOf(hold.in)}>κρατά το όπλο του ${pn(hold.owner)} ως ${hmOf(hold.in)}</span>`
    : nxt || (prv && calDay(prv.day, prv.in) === today) ? html`<span className="wstate__soon" data-tip=${[nxt && 'Ένοπλη υπηρεσία: ' + nxt.reason + ' ' + armWhen(nxt), prv && 'Προηγούμενο νούμερο: ' + prv.reason + ' ' + armWhen(prv)].filter(Boolean).join(' · ')}>${[nxt && 'βγαίνει ' + when2(nxt, nxt.out), prv && calDay(prv.day, prv.in) === today && 'γύρισε ' + hmOf(prv.in)].filter(Boolean).join(' · ')}</span>`
    : null;   // ΕΝΤΟΣ: το λέει ήδη ο διακόπτης
  const click = (want: boolean) => { if (auto || want === out) return; setOpen(true); };
  const canFix = auto && (cur || day.length === 1);
  const times = first ? (arm.live ? armWhen(first) : day.length > 1 && first.mode === 'own' ? day.map(armWhen).join(' ') : armWhen({ out: first.out, in: day[day.length - 1].in })) : '';
  return html`<div className=${cx('wstate', out && 'is-out', auto && 'is-auto')}>
    <div className="wstate__row"><div ref=${ref} className="wstate__sw" role="group" aria-label=${'Κατάσταση όπλου ' + p.weapon}>
      <button type="button" aria-pressed=${!out} disabled=${auto} onClick=${() => click(false)} data-tip=${out && !auto ? 'Μπαίνει στον οπλοβαστό: ώρα και λόγος εισαγωγής' : undefined}>ΕΝΤΟΣ</button>
      <button type="button" aria-pressed=${out} disabled=${auto} onClick=${() => click(true)} data-tip=${!out ? 'Βγαίνει από τον οπλοβαστό: ώρα και λόγος' : undefined}>ΕΚΤΟΣ</button>
    </div>${auto && first && (canFix ? html`<button type="button" className="wstate__fix" onClick=${() => setFix(cur || day[0])} aria-label=${'Διόρθωση…: ' + first.reason} data-tip="Διόρθωση…: άλλαξε την ώρα εξόδου ή εισόδου αυτού του νούμερου, με λόγο">${times} ✎</button>` : html`<span className="wstate__time" data-tip="Για να αλλάξει μία ώρα: Κινήσεις › Διόρθωση…">${times}</span>`)}</div>${why}
    ${open && (m ? html`<${InPop} p=${p} m=${m} anchor=${ref} onClose=${() => setOpen(false)} onEdit=${setEdit}/>` : html`<${OutPop} p=${p} anchor=${ref} onClose=${() => setOpen(false)}/>`)}
    ${edit && html`<${EditMoveDialog} m=${edit} onClose=${() => setEdit(null)}/>`}
    ${fix && html`<${DutyFixDialog} row=${fix} onClose=${() => setFix(null)}/>`}
  </div>`;
}
