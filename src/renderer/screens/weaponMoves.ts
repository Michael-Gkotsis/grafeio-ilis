// features/weapons: έξοδοι και είσοδοι όπλων από τον οπλοβαστό (Michael, 18/10: «όπως οι εξοδούχοι και οι παραμένοντες»).
// Έξοδος: λόγος από τη λίστα «Λόγοι εξόδου όπλου» (ΕΚΠ, ΒΟΛΗ…), μέρα και ώρα (τώρα, αλλάζουν). Είσοδος: ο λόγος εισαγωγής
// μπαίνει μόνος του από τη λίστα (ΕΚΠ → ΛΗΞ ΕΚΠ), με ώρα (τώρα). Κάθε κίνηση διορθώνεται ή σβήνεται στις «Κινήσεις».
// Στη γραμμή (Michael, 18/10: «πιο ξεκάθαρο… πάνω στο table»): διακόπτης ΕΝΤΟΣ | ΕΚΤΟΣ, και ένα μικρό παράθυρο ακριβώς από κάτω
// με ώρα (τώρα) και τους λόγους ως κουμπιά: ένα κλικ στον λόγο και βγήκε. Για είσοδο: ώρα και λόγος εισαγωγής έτοιμα, Enter.
import { RkName, rkShort, rkText } from '../rankName';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Badge, Button, Segmented, VirtualList, useViewportHeight } from '../ui';
import { useNav, useStore } from '../store';
import { ActiveFilter } from '../common';
import { shortName, fullName, type WeaponMove } from '../../shared/domain';
import { weaponBack } from '../../shared/ranks';
import { dm, dmy } from '../../shared/dates';
import { armedRows, type ArmRow } from '../../shared/armed';
import { AUTO_KEY, byOut, dutyMove, idRange, isAuto, moveInCell, moveOutCell, movesOn, seatTxt } from '../../shared/weapons';
import { fixIds, inIds, moveFilter, moveReasons, openMoveList } from '../../shared/weaponView';
import { BulkFixDialog, DutyFixDialog, EditMoveDialog, WeaponInDialog, reasonLbl } from '../features/weapon-move';
// The dialogs, pop-ups and the row switch moved to features/weapon-move; the old names stay valid until Phase 7.
export { BulkFixDialog, DutyFixDialog, EditMoveDialog, Key, Pop, WeaponInDialog, WeaponOutDialog, WeaponState, reasonLbl } from '../features/weapon-move';
type P = any;

// Στήλες των Κινήσεων: χωράνε στα 1366 χωρίς κύλιση, και τα ονόματα, οι λόγοι και τα κουμπιά δεν κόβονται (Michael, 24/10)
const MV_GRID = '36px minmax(150px,1.4fr) 104px minmax(150px,1fr) 116px minmax(120px,1fr) 116px minmax(100px,.6fr) 212px';
const MV_MIN = 1104;
const MV_HEAD = 40;
const MV_ROW = 50;
// Μία γραμμή κίνησης. Ξαναζωγραφίζεται μόνο όταν αλλάξει κάτι δικό της.
const MRow = memo(function MRow({ m, i, style, selected, pm, lists, today, onToggle, onIn, onEdit, onFix, onOpen }: P) {
  const p = pm.get(m.pid); const auto = isAuto(m); const own = auto ? pm.get(m.row.owner) : p; const owner = auto && m.row.owner !== m.pid ? own : null;
  const dt = (day: string, t: string) => (day.slice(0, 4) === today.slice(0, 4) ? dm(day) : dmy(day)) + ' ' + t;
  const post = auto && m.row.mode === 'post';
  const seat = own ? seatTxt(own.rack, own.wpos) : '';
  return html`<div className=${cx('ptable__row', i % 2 === 1 && 'is-odd', auto && 'is-auto')} style=${{ ...style, gridTemplateColumns: MV_GRID, cursor: 'default' }} role="row">
    <span>${!auto && html`<input type="checkbox" className="ui-check" aria-label=${'Επιλογή ' + (p ? rkShort(p) : m.weapon)} checked=${selected} onChange=${(e: any) => onToggle(m.id, !!e.nativeEvent?.shiftKey)}/>`}</span>
    <span className="wmv__who">${p ? html`<button type="button" className="linkish" data-tip=${rkText(p, fullName, true)} onClick=${() => onOpen(p.id)}><b><${RkName} p=${p} keep=${true}/></b></button>${p.cid && html` <${Badge} tone="outline" data-tip="Στέλεχος σε ένοπλη υπηρεσία: το όπλο του είναι από την κάρτα στελέχους">στέλεχος<//>`}` : '—'}${owner && html`<small data-tip=${'Όπλο της θέσης (' + m.row.label + '): το έχει βγάλει ο ' + shortName(owner) + ' και περνά από χέρι σε χέρι'}>κρατά το όπλο του ${shortName(owner)}</small>`}</span>
    <span className="wmv__w">${m.weapon ? html`<span className="num">${m.weapon}</span>` : auto ? html`<${Badge} tone="bad" data-tip=${'Ένοπλη υπηρεσία χωρίς αριθμό όπλου' + (own ? ': ο ' + rkShort(own) + ' δεν έχει' : '')}>Χωρίς όπλο<//>` : '—'}${seat && html`<small>${seat}</small>`}</span>
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
    html`<div className="ptable ptable--moves" role="table" aria-rowcount=${rows.length}>
      <${VirtualList} className="weapons__body" items=${rows} rowHeight=${MV_ROW} height=${height + MV_HEAD} headHeight=${MV_HEAD} minWidth=${MV_MIN} head=${html`<div className="ptable__head" role="row" style=${{ gridTemplateColumns: MV_GRID }}><span><input type="checkbox" className="ui-check" aria-label="Επιλογή όλων" data-tip="Όλες οι κινήσεις που φαίνονται (όχι οι αυτόματες των ένοπλων υπηρεσιών). Shift-κλικ σε δύο γραμμές τσεκάρει ό,τι είναι ανάμεσα." disabled=${!ticks.length} checked=${allSel} onChange=${() => setSel(allSel ? new Set() : new Set(ticks))}/></span><span>Στρατιώτης</span><span>Όπλο</span><span>Λόγος εξόδου</span><span>Έξοδος</span><span>Λόγος εισόδου</span><span>Είσοδος</span><span>Παρατήρηση</span><span></span></div>`} resetKey=${view + '|' + reasonF + '|' + dq} renderRow=${(m: WeaponMove, i: number, style: P) => html`<${MRow} key=${m.id} m=${m} i=${i} style=${style} selected=${sel.has(m.id)} pm=${pm} lists=${lists} today=${today} onToggle=${toggle} onIn=${setInFor} onEdit=${setEdit} onFix=${setFix} onOpen=${openP}/>`}/>
    </div>`}
    ${edit && html`<${EditMoveDialog} m=${edit} onClose=${() => setEdit(null)}/>`}
    ${fix && html`<${DutyFixDialog} row=${fix} onClose=${() => setFix(null)}/>`}
    ${inFor && html`<${WeaponInDialog} ids=${inFor} onClose=${() => setInFor(null)} onDone=${() => setSel(new Set())}/>`}
    ${bulkFix && html`<${BulkFixDialog} ids=${bulkFix} onClose=${() => setBulkFix(null)} onDone=${() => setSel(new Set())}/>`}
  </div>`;
}
