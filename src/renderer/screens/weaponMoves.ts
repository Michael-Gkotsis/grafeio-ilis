// features/weapons: έξοδοι και είσοδοι όπλων από τον οπλοβαστό (Michael, 18/10: «όπως οι εξοδούχοι και οι παραμένοντες»).
// Έξοδος: λόγος από τη λίστα «Λόγοι εξόδου όπλου» (ΕΚΠ, ΒΟΛΗ…), μέρα και ώρα (τώρα, αλλάζουν). Είσοδος: ο λόγος εισαγωγής
// μπαίνει μόνος του από τη λίστα (ΕΚΠ → ΛΗΞ ΕΚΠ), με ώρα (τώρα). Κάθε κίνηση διορθώνεται ή σβήνεται στις «Κινήσεις».
// Στη γραμμή (Michael, 18/10: «πιο ξεκάθαρο… πάνω στο table»): διακόπτης ΕΝΤΟΣ | ΕΚΤΟΣ, και ένα μικρό παράθυρο ακριβώς από κάτω
// με ώρα (τώρα) και τους λόγους ως κουμπιά: ένα κλικ στον λόγο και βγήκε. Για είσοδο: ώρα και λόγος εισαγωγής έτοιμα, Enter.
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { html, cx, Alert, Badge, Button, Why, missingOf, Dialog, Segmented, VirtualList, typingText, useEscape, useToast, useViewportHeight } from '../ui';
import { Combo } from '../select';
import { useNav, useStore } from '../store';
import { ActiveFilter, ChoiceField, DateField, GoLink, TimeField, useTimeOptions } from '../common';
import { shortName, plainName, type Person, type WeaponMove } from '../../shared/domain';
import { personMap } from '../../shared/rules';
import { listOf, rankTxt, weaponBack } from '../../shared/ranks';
import { normTime } from '../../shared/hours';
import { dm, dmy, nowHM, today as todayFn } from '../../shared/dates';
import { armedRows, armWhen, calDay, hmOf, stampMin, stampOf, type ArmRow } from '../../shared/armed';
import { AUTO_KEY, armTxt, byOut, dutyMove, idRange, isAuto, moveInCell, moveOutCell, moveOutTxt, movesOn, openMoves, seatTxt, type ArmInfo } from '../../shared/weapons';
import { fixIds, inIds, moveFilter, moveReasons, openMoveList, stayOutByDuty } from '../../shared/weaponView';
type P = any;

// Στη λωρίδα και στο φίλτρο: ο λόγος όπως γράφτηκε, και «Υπηρεσία (αυτόματα)» για τις ένοπλες υπηρεσίες (ξεχωριστό από τον χειροκίνητο λόγο ΥΠΗΡΕΣΙΑ)
export const reasonLbl = (r: string) => (r === AUTO_KEY ? 'Υπηρεσία (αυτόματα)' : r);
// Ο αριθμός δίπλα σε κάθε λόγο (1-9): το πλήκτρο που τον διαλέγει
export const Key = ({ n }: { n: number }) => (n < 9 ? html`<kbd className="wkey" aria-hidden="true">${n + 1}</kbd>` : null);

// « · Μένει ΕΚΤΟΣ λόγω υπηρεσίας …» στο μήνυμα αναίρεσης, όταν υπάρχει
const stayTxt = (l: string[]) => (l.length ? ' · ' + l.join(' · ') : '');
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
  // ένοπλο νούμερο που κρατά ακόμα το όπλο εκτός εκείνη την ώρα (η είσοδος γράφεται, το όπλο μένει ΕΚΤΟΣ)
  const stay = normTime(time) ? moves.map(m => ({ m, s: stayOutByDuty(state, m.pid, day, normTime(time)!) })).filter(x => !!x.s) : [];
  const ok = moves.length > 0 && !!normTime(time) && !early.length;
  const miss = !moves.length ? 'Κανένα όπλο εκτός' : !normTime(time) ? 'Λείπει: Ώρα' : early.length ? 'Η ώρα είναι πριν την έξοδο' : '';
  const save = async () => {
    if (!ok) return;
    if (!(await run({ t: 'weaponIn', ids: moves.map(m => m.id), day, time: normTime(time)!, reason: reason.trim() || undefined }, false))) return;
    toast({ text: 'Είσοδος όπλων (' + (reason.trim().toUpperCase() || backs.join(', ')) + ') ' + normTime(time) + ': ' + (moves.length === 1 ? shortName(pm.get(moves[0].pid)!) : moves.length + ' όπλα') + stayTxt(stay.map(x => shortName(pm.get(x.m.pid)!) + ': ' + x.s!.text)), actions: [undoMark()] });
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
    ${stay.length > 0 && html`<${Alert} tone="warn"><span>${stay.map((x, i) => html`<span key=${x.m.id}>${i ? html`<br/>` : ''}<b>${shortName(pm.get(x.m.pid)!)}</b>: ${x.s!.text}</span>`)}</span><//>`}
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

// Ομαδική διόρθωση λόγου/ώρας εξόδου για τις τσεκαρισμένες κινήσεις (Michael, 24/10): ένας λόγος με ένα κλικ (ή πλήκτρο 1-9), μία εντολή, μία αναίρεση
function BulkFixDialog({ ids, onClose, onDone }: P) {
  const { state, run, undoMark } = useStore(); const toast = useToast();
  const reasons: string[] = useMemo(() => listOf(state.settings.lists, 'weaponOut'), [state.settings.lists]);
  const pm = personMap(state.people);
  const ms: WeaponMove[] = (state.weaponLog || []).filter(m => ids.includes(m.id));
  const [reason, setReason] = useState(''); const [timeOn, setTimeOn] = useState(false);
  const [day, setDay] = useState(ms[0]?.outDay || todayFn()); const [time, setTime] = useState(ms[0]?.outTime || nowHM());
  const t = normTime(time); const rs = reason.trim().toUpperCase();
  const late = timeOn && !!t ? ms.filter(m => !!m.inDay && m.inDay + ' ' + (m.inTime || '') < day + ' ' + t) : [];
  const miss = !ms.length ? 'Καμία κίνηση' : !rs && !timeOn ? 'Διάλεξε τον νέο λόγο ή άλλαξε την ώρα εξόδου' : timeOn && !t ? 'Λείπει: Ώρα εξόδου' : late.length ? 'Η είσοδος είναι πριν τη νέα έξοδο' : '';
  const pick = (r: string) => { setReason(r); requestAnimationFrame(() => (document.querySelector('.ui-dialog__foot .ui-btn--default:not(:disabled)') as HTMLElement | null)?.focus()); };
  // 1-9 διαλέγουν λόγο όταν δεν γράφεις σε πεδίο
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.altKey || e.ctrlKey || e.metaKey || typingText(document.activeElement) || !/^[1-9]$/.test(e.key) || !reasons[+e.key - 1]) return; e.preventDefault(); pick(reasons[+e.key - 1]); };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, [reasons]);
  const save = async () => {
    if (miss) return;
    const patch = { ...(rs ? { reason: rs } : {}), ...(timeOn ? { outDay: day, outTime: t! } : {}) };
    if (!(await run({ t: 'editWeaponMoves', ids: ms.map(m => m.id), patch }, false))) return;
    toast({ text: 'Διορθώθηκαν ' + ms.length + (ms.length === 1 ? ' κίνηση' : ' κινήσεις') + ': ' + [rs && 'λόγος ' + rs, timeOn && 'έξοδος ' + dm(day) + ' ' + t].filter(Boolean).join(', '), actions: [undoMark()] });
    onDone?.(); onClose();
  };
  return html`<${Dialog} title=${'Διόρθωση λόγου/ώρας (' + ms.length + ')'} description=${names(ms.map(m => pm.get(m.pid)).filter(Boolean) as Person[])} onClose=${onClose}
    footer=${html`<${Why} text=${miss}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!!miss} why=${miss} onClick=${save}>Διόρθωση (${ms.length})<//>`}>
    <div className="field"><span className="field__label">Νέος λόγος εξόδου</span>
      <div className="wpop__reasons" tabIndex="-1" data-autofocus="" style=${{ outline: "none" }}>${reasons.map((r, i) => html`<button key=${r} type="button" className="wpop__reason wpop__reason--pick" aria-pressed=${rs === r} onClick=${() => pick(r)}><${Key} n=${i}/>${r}</button>`)}</div>
      <input className="ui-input" style=${{ marginTop: '8px' }} placeholder="Άλλος λόγος (γράψε τον)…" aria-label="Άλλος λόγος" value=${reasons.includes(rs) ? '' : reason} onChange=${(e: any) => setReason(e.target.value)}/>
      <span className="field__help">${rs ? html`Όταν μπουν πάλι: <b>${weaponBack(rs, state.settings.lists)}</b>` : 'Άφησέ το κενό αν αλλάζεις μόνο την ώρα.'}</span></div>
    <label className="ui-checkrow" style=${{ margin: '4px 0 10px' }}><input type="checkbox" className="ui-check" checked=${timeOn} onChange=${(e: any) => setTimeOn(e.target.checked)}/> Άλλαξε και την ώρα εξόδου (ίδια για όλες)</label>
    ${timeOn && html`<div className="field-row">
      <div className="field"><label className="field__label" htmlFor="bf-d">Μέρα εξόδου</label><${DateField} id="bf-d" className="ui-input" value=${day} onChange=${(e: any) => e.target.value && setDay(e.target.value)}/></div>
      <${TimeField} id="bf-t" now=${true} label="Ώρα εξόδου *" value=${time} onChange=${setTime}/></div>`}
    ${ms.length > 1 && html`<ul className="hist weapon-movelist">${ms.map(m => html`<li key=${m.id}><b>${pm.get(m.pid) ? shortName(pm.get(m.pid)!) : '—'}</b> <span className="muted">${m.weapon} · ${m.reason} ${dm(m.outDay)} ${m.outTime} →</span> ${rs || m.reason}${timeOn && t ? ' ' + dm(day) + ' ' + t : ''}</li>`)}</ul>`}
    ${late.length > 0 && html`<${Alert} tone="bad"><span>Η είσοδος είναι πριν τη νέα έξοδο για ${late.map(m => pm.get(m.pid) ? shortName(pm.get(m.pid)!) : '—').join(', ')}.</span><//>`}
  <//>`;
}

// Στήλες των Κινήσεων: χωράνε στα 1366 χωρίς κύλιση, και τα ονόματα, οι λόγοι και τα κουμπιά δεν κόβονται (Michael, 24/10)
const MV_GRID = '36px minmax(180px,1.6fr) 100px minmax(170px,1.1fr) 128px minmax(130px,1fr) 128px minmax(76px,.6fr) 206px';
const MV_MIN = 1160;
const MV_ROW = 50;
// Μία γραμμή κίνησης. Ξαναζωγραφίζεται μόνο όταν αλλάξει κάτι δικό της.
const MRow = memo(function MRow({ m, i, style, selected, pm, lists, today, onToggle, onIn, onEdit, onFix, onOpen }: P) {
  const p = pm.get(m.pid); const auto = isAuto(m); const own = auto ? pm.get(m.row.owner) : p; const owner = auto && m.row.owner !== m.pid ? own : null;
  const dt = (day: string, t: string) => (day.slice(0, 4) === today.slice(0, 4) ? dm(day) : dmy(day)) + ' ' + t;
  const post = auto && m.row.mode === 'post';
  const seat = own ? seatTxt(own.rack, own.wpos) : '';
  return html`<div className=${cx('ptable__row', i % 2 === 1 && 'is-odd', auto && 'is-auto')} style=${{ ...style, gridTemplateColumns: MV_GRID, cursor: 'default' }} role="row">
    <span>${!auto && html`<input type="checkbox" className="ui-check" aria-label=${'Επιλογή ' + (p ? shortName(p) : m.weapon)} checked=${selected} onChange=${(e: any) => onToggle(m.id, !!e.nativeEvent?.shiftKey)}/>`}</span>
    <span className="wmv__who">${p ? html`<button type="button" className="linkish" onClick=${() => onOpen(p.id)}><b>${rankTxt(p)} ${shortName(p)}</b></button>` : '—'}${owner && html`<small data-tip=${'Όπλο της θέσης (' + m.row.label + '): το έχει βγάλει ο ' + shortName(owner) + ' και περνά από χέρι σε χέρι'}>κρατά το όπλο του ${shortName(owner)}</small>`}</span>
    <span className="wmv__w">${m.weapon ? html`<span className="num">${m.weapon}</span>` : auto ? html`<${Badge} tone="bad" data-tip=${'Ένοπλη υπηρεσία χωρίς αριθμό όπλου' + (own ? ': ο ' + shortName(own) + ' δεν έχει' : '')}>Χωρίς όπλο<//>` : '—'}${seat && html`<small>${seat}</small>`}</span>
    <span className="wmv__reason" data-tip=${m.reason}><${Badge} tone="warn">${m.reason}<//></span>
    <span className=${cx('num', post && 'wmv__post')}>${post ? moveOutCell(m) : dt(m.outDay, m.outTime)}</span>
    <span className="wmv__reason" data-tip=${m.inDay ? m.inReason || undefined : undefined}>${m.inDay ? html`<${Badge} tone="ok">${m.inReason || weaponBack(m.reason, lists)}<//>` : html`<${Badge} tone="bad">Εκτός<//>`}</span>
    <span className=${cx('num', post && 'wmv__post')} data-tip=${auto ? 'Η ώρα που προβλέπεται από τις υπηρεσίες' : undefined}>${!m.inDay ? '—' : post ? moveInCell(m) : dt(m.inDay, m.inTime || '')}</span>
    <span className="muted wmv__note" data-tip=${[auto && 'Βγαίνει από τις ένοπλες υπηρεσίες: οι ώρες μπαίνουν μόνες τους (Ρυθμίσεις › Υπηρεσίες, Κανόνες)', m.note].filter(Boolean).join(' · ') || undefined}>${auto && html`<i className="wmv__auto">αυτόματα</i>`}${m.note ? (auto ? ' · ' : '') + m.note : ''}</span>
    <span className="weapon-acts">${!auto && !m.inDay && html`<${Button} size="sm" variant="outline" onClick=${() => onIn([m.id])}>Είσοδος<//>`}<${Button} size="sm" variant="ghost" onClick=${() => (auto ? onFix(m.row) : onEdit(m))} data-tip=${auto ? 'Άλλαξε την ώρα εξόδου ή εισόδου, με λόγο' : 'Ώρες, λόγοι, παρατήρηση, ή σβήσιμο'}>Διόρθωση${auto ? '…' : ''}<//></span>
  </div>`;
});

// Κινήσεις: «Εκτός τώρα» (με chips ανά λόγο), της μέρας (και όσα ήταν εκτός εκείνη τη μέρα), ή όλες, νεότερες πρώτα. Οι ένοπλες υπηρεσίες
// φαίνονται ως αυτόματες γραμμές με τις ώρες τους (εκτός τώρα και της μέρας)· διορθώνονται μόνο με «Διόρθωση…», και δεν μπαίνουν
// στην ομαδική είσοδο ή διόρθωση (ακολουθούν τα νούμερα). Τσεκ ανά γραμμή, «Είσοδος όλων <λόγος>» και ομαδική διόρθωση λόγου/ώρας.
export function MovesView({ date, info, pm, outN }: P) {
  const { state, today } = useStore(); const nav = useNav();
  const view: string = nav.params.wmoves || 'open';
  const reasonF: string = view === 'open' ? nav.params.wmreason || '' : '';
  const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  const [edit, setEdit] = useState<WeaponMove | null>(null); const [fix, setFix] = useState<ArmRow | null>(null);
  const [inFor, setInFor] = useState<string[] | null>(null); const [bulkFix, setBulkFix] = useState<string[] | null>(null);
  const [sel, setSel] = useState(() => new Set<string>()); const anchor = useRef<string | null>(null); 
  const log = state.weaponLog || []; const lists = state.settings.lists;
  const all = useMemo(() => {
    if (view === 'open') return openMoveList(state, info);
    const auto = view === 'day' ? armedRows(state, date).map((r: ArmRow) => dutyMove(state, r)) : [];
    return [...(view === 'day' ? movesOn(log, date) : log), ...auto];
  }, [log, view, date, info, state.people, state.guards, state.dutyLog, state.settings, state.rules, state.dutyFix]);
  const reasons = useMemo(() => (view === 'open' ? moveReasons(all) : []), [all, view]);
  const rows = useMemo(() => moveFilter(all, pm, reasonF, dq).sort(byOut).reverse(), [all, pm, reasonF, dq]);
  // η επιλογή ισχύει για όσα φαίνονται· αλλάζεις προβολή, chip ή αναζήτηση και ξεκινά από την αρχή (τίποτα κρυφό)
  useEffect(() => { setSel(new Set()); anchor.current = null; }, [view, reasonF, dq]);
  const ticks = useMemo(() => fixIds(rows), [rows]);
  const selRows = rows.filter(m => sel.has(m.id)); const selIn = inIds(selRows); const selFix = fixIds(selRows);
  const allSel = ticks.length > 0 && ticks.every(id => sel.has(id));
  const toggle = useCallback((id: string, shift?: boolean) => {
    const a = anchor.current; anchor.current = id;
    setSel(s => { const n = new Set(s); const on = !s.has(id); const r = shift && a != null ? idRange(ticks, a, id) : []; (r.length ? r : [id]).forEach(x => (on ? n.add(x) : n.delete(x))); return n; });
  }, [ticks]);
  const openP = useCallback((id: number) => nav.openPerson(id, rows.map(m => m.pid)), [nav.openPerson, rows]);
  const inAll = view === 'open' ? inIds(rows) : [];
  const dayLbl = date === today ? 'Σήμερα' : dm(date);
  const clear = () => { setQ(''); nav.set({ wmreason: null }); };
  useEffect(() => { if (reasonF && !reasons.some(r => r[0] === reasonF)) nav.set({ wmreason: null }); }, [reasons, reasonF]);   // ο τελευταίος του λόγου μπήκε: το chip χάνεται
  const height = useViewportHeight(410 + (view === 'open' && reasons.length ? 40 : 0) + (selRows.length ? 48 : 0));
  // Ctrl+K «Είσοδος όλων…»: έρχεται εδώ και πάει στο κουμπί
  useEffect(() => { if (nav.params.wfocus === 'in') { (document.querySelector('[data-moves-in]') as HTMLElement | null)?.focus(); nav.set({ wfocus: null }); } }, [nav.params.wfocus, inAll.length]);
  return html`<div>
    <div className="toolbar"><${Segmented} small=${true} value=${view} onChange=${(v: string) => nav.set({ wmoves: v })} items=${[{ value: 'open', label: 'Εκτός τώρα (' + outN + ')', tip: 'Κινήσεις που δεν έχουν είσοδο και ένοπλες υπηρεσίες που τρέχουν: όσους μετράει και ο τίτλος της σελίδας' }, { value: 'day', label: dayLbl, tip: 'Όσα βγήκαν ή μπήκαν τη μέρα, όσα ήταν εκτός, και τα νούμερα των ένοπλων υπηρεσιών' }, { value: 'all', label: 'Όλες (' + log.length + ')' }]}/>
      <input type="search" className="ui-input wmv__search" aria-label="Αναζήτηση στις κινήσεις" placeholder="Όνομα, ΑΣΜ, αριθμός όπλου ή θέση (Ε 23)" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      ${view === 'open' && (inAll.length > 0 || reasonF === AUTO_KEY) && html`<${Button} data-moves-in="" size="sm" variant=${reasonF ? 'default' : 'outline'} disabled=${!inAll.length} why=${!inAll.length ? 'Οι ένοπλες υπηρεσίες μπαίνουν μόνες τους στις ώρες τους (διόρθωσε μία ώρα με «Διόρθωση…»)' : undefined} onClick=${() => setInFor(inAll)} data-tip="Μπαίνουν στον οπλοβαστό όλα όσα φαίνονται (με το φίλτρο λόγου και την αναζήτηση), με μία ώρα· ο διάλογος ρωτά πριν γραφτεί">Είσοδος όλων ${reasonF && reasonF !== AUTO_KEY ? reasonF + ' ' : ''}(${inAll.length})…<//>`}
      <span className="toolbar__count">${rows.length} ${rows.length === 1 ? 'κίνηση' : 'κινήσεις'}</span></div>
    ${reasons.length > 0 && html`<div className="wreasons" role="group" aria-label="Εκτός τώρα ανά λόγο"><b>Εκτός τώρα:</b>
      ${reasons.map(([r, n]) => html`<button key=${r} type="button" className=${cx('ui-chip ui-chip--sm', r === AUTO_KEY && 'ui-chip--auto')} aria-pressed=${reasonF === r} data-tip=${r === AUTO_KEY ? 'Ένοπλη υπηρεσία: το όπλο βγαίνει και μπαίνει αυτόματα στις ώρες του νούμερου. Κλικ: δείξε τις' : 'Κλικ: δείξε μόνο όσα βγήκαν για ' + r}
        onClick=${() => nav.set({ wmreason: reasonF === r ? null : r })}>${reasonLbl(r)}<span className="cnt">${n}</span></button>`)}
      <${ActiveFilter} parts=${[reasonF && 'Λόγος ' + reasonLbl(reasonF), dq.trim() && '«' + dq.trim() + '»']} onClear=${clear}/></div>`}
    ${(view !== 'open' || !reasons.length) && html`<${ActiveFilter} parts=${[dq.trim() && '«' + dq.trim() + '»']} onClear=${clear}/>`}
    ${selRows.length > 0 && html`<div className="bulkbar"><div className="bulkbar__sel">${selRows.length} επιλεγμένες</div>
      <div className="bulkbar__reasons">${selIn.length > 0 && html`<${Button} size="sm" variant="outline" onClick=${() => setInFor(selIn)}>ΕΝΤΟΣ ${selIn.length} ${selIn.length === 1 ? 'όπλο' : 'όπλα'}…<//>`}
        <${Button} size="sm" variant="outline" onClick=${() => setBulkFix(selFix)} data-tip="Άλλαξε μαζί τον λόγο ή την ώρα εξόδου: μία εγγραφή στο Ιστορικό, μία αναίρεση">Διόρθωση λόγου/ώρας (${selFix.length})…<//></div>
      <${Button} size="sm" variant="ghost" onClick=${() => setSel(new Set())}>Καθάρισε<//></div>`}
    ${rows.length === 0 ? html`<div className="ui-card empty">${dq.trim() || reasonF ? html`Καμία κίνηση δεν ταιριάζει. <${Button} variant="link" onClick=${clear}>Καθάρισε αναζήτηση και φίλτρο<//>` : view === 'open' ? 'Όλα τα όπλα είναι μέσα στον οπλοβαστό. Για έξοδο: τσέκαρε άτομα στα «Όπλα» ή πάτα «Έξοδος» στη γραμμή του.' : 'Καμία κίνηση.'}</div>` :
    html`<div className="ptable ptable--moves" role="table" aria-rowcount=${rows.length}><div style=${{ overflowX: 'auto' }}><div style=${{ minWidth: MV_MIN + 'px' }}>
      <div className="ptable__head" role="row" style=${{ gridTemplateColumns: MV_GRID }}><span><input type="checkbox" className="ui-check" aria-label="Επιλογή όλων" data-tip="Όλες οι κινήσεις που φαίνονται (όχι οι αυτόματες των ένοπλων υπηρεσιών). Shift-κλικ σε δύο γραμμές τσεκάρει ό,τι είναι ανάμεσα." disabled=${!ticks.length} checked=${allSel} onChange=${() => setSel(allSel ? new Set() : new Set(ticks))}/></span><span>Στρατιώτης</span><span>Όπλο</span><span>Λόγος εξόδου</span><span>Έξοδος</span><span>Λόγος εισόδου</span><span>Είσοδος</span><span>Παρατήρηση</span><span></span></div>
      <${VirtualList} className="weapons__body" items=${rows} rowHeight=${MV_ROW} height=${height} resetKey=${view + '|' + reasonF + '|' + dq} renderRow=${(m: WeaponMove, i: number, style: P) => html`<${MRow} key=${m.id} m=${m} i=${i} style=${style} selected=${sel.has(m.id)} pm=${pm} lists=${lists} today=${today} onToggle=${toggle} onIn=${setInFor} onEdit=${setEdit} onFix=${setFix} onOpen=${openP}/>`}/>
    </div></div></div>`}
    ${edit && html`<${EditMoveDialog} m=${edit} onClose=${() => setEdit(null)}/>`}
    ${fix && html`<${DutyFixDialog} row=${fix} onClose=${() => setFix(null)}/>`}
    ${inFor && html`<${WeaponInDialog} ids=${inFor} onClose=${() => setInFor(null)} onDone=${() => setSel(new Set())}/>`}
    ${bulkFix && html`<${BulkFixDialog} ids=${bulkFix} onClose=${() => setBulkFix(null)} onDone=${() => setSel(new Set())}/>`}
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
  useEffect(() => { ((box.current?.querySelector('[data-autofocus]') || box.current) as HTMLElement | null)?.focus(); }, []);
  return createPortal(html`<div ref=${box} className="wpop" role="dialog" aria-label=${label} tabIndex="-1" style=${pos || { left: -9999, top: 0 }}>${children}</div>`, document.body);
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
  // 1-9 διαλέγουν τον λόγο όταν δεν γράφεις σε πεδίο (η εστίαση ξεκινά στο παράθυρο, όχι στην ώρα)
  const keys = useRef(go); keys.current = go;
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || typingText(document.activeElement) || !/^[1-9]$/.test(e.key) || !reasons[+e.key - 1]) return; e.preventDefault(); keys.current(reasons[+e.key - 1]); };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, [reasons]);
  return html`<${Pop} anchor=${anchor} onClose=${onClose} label=${'Έξοδος όπλου ' + p.weapon}>
    <div className="wpop__head"><b>Έξοδος όπλου ${p.weapon}</b><small>${rankTxt(p)} ${plainName(p)}</small></div>
    <${WhenRow} label="Ώρα εξόδου" day=${day} time=${time} setDay=${setDay} setTime=${setTime}/>
    <input className="ui-input wpop__note" placeholder="Παρατήρηση (αν θες), π.χ. πεδίο βολής" value=${note} onChange=${(e: any) => setNote(e.target.value)} aria-label="Παρατήρηση"/>
    <div className="wpop__lbl">Γιατί βγαίνει; Πάτα τον λόγο ή τον αριθμό του:</div>
    <div className="wpop__reasons">${reasons.map((r, i) => html`<button key=${r} type="button" className="wpop__reason" disabled=${!normTime(time)}
      onMouseEnter=${() => setHover(r)} onMouseLeave=${() => setHover('')} onFocus=${() => setHover(r)} onBlur=${() => setHover('')} onClick=${() => go(r)}><${Key} n=${i}/>${r}</button>`)}</div>
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
  const stay = t ? stayOutByDuty(state, m.pid, day, t) : null;
  const go = async (e?: any) => {
    e?.preventDefault(); if (!ok) return;
    if (!(await run({ t: 'weaponIn', ids: [m.id], day, time: t!, reason: reason.trim() || undefined }, false))) return;
    toast({ text: shortName(p) + ': όπλο ' + m.weapon + ' ΕΝΤΟΣ (' + (reason.trim().toUpperCase() || auto) + ') ' + when(day, t!, today) + stayTxt(stay ? [stay.text] : []), actions: [undoMark()] });
    onClose();
  };
  return html`<${Pop} anchor=${anchor} onClose=${onClose} label=${'Είσοδος όπλου ' + m.weapon}>
    <div className="wpop__head"><b>Είσοδος όπλου ${m.weapon}</b><small>${rankTxt(p)} ${plainName(p)} · βγήκε ${m.reason} ${when(m.outDay, m.outTime, today)}</small></div>
    <form onSubmit=${go}>
      <${WhenRow} label="Ώρα εισόδου" day=${day} time=${time} setDay=${setDay} setTime=${setTime}/>
      <label className="wpop__field"><span>Λόγος εισαγωγής</span><input className="ui-input" value=${reason} placeholder=${auto} onChange=${(e: any) => setReason(e.target.value)} aria-label="Λόγος εισαγωγής"/></label>
      ${early && html`<p className="wpop__err">Η ώρα είναι πριν την έξοδο (${dm(m.outDay)} ${m.outTime}).</p>`}
      ${stay && html`<p className="wpop__err wpop__err--warn" role="status" data-tip="Η είσοδος γράφεται κανονικά, αλλά το όπλο μένει ΕΚΤΟΣ όσο τρέχει το νούμερο της ένοπλης υπηρεσίας">${stay.text}</p>`}
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
