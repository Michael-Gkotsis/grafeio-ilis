// features/cadre · «Στελέχη» (Michael, 17/10): δική τους καρτέλα στο μενού, χωριστά από το Δυναμολόγιο των οπλιτών.
// Οι καταστάσεις τους είναι οι στήλες της ΗΚΑΙ (κωλυόμενοι, απόντες) και ταΐζουν την ΗΚΑΙ όπως πριν.
import { useDeferredValue, useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Why, Dialog, PageHeader, Strip, useDirty, useToast } from '../ui';
import { Select } from '../select';
import { useNav, useStore } from '../store';
import { ActiveFilter, ChoiceField, DateRangeField, SigsMenu } from '../common';
import type { Sig } from '../../shared/sigs';
import { cadreAbsKinds, guessHk, hkCadreRows, listOf, optionsOf } from '../../shared/ranks';
import { hkRowLabel, HK, UNIT } from '../../shared/unit';
import type { Cadre, CadreAbs } from '../../shared/domain';
import { CADRE_FILTERS, GROUP_NAME, orderedCadre, cadreAbsFrom, cadreClash, cadreMatch, cadreSearch, cadreStatusOf, cadreStatusOn, colShort, groupOfCol, type CadreFilter, type CadreGroup, type CadreStatus } from '../../shared/cadre';
import { addDays, dayName, dm, dow } from '../../shared/dates';
import { EPOP_ROWS, cadreSeat, dutyStats, isEpop, monthTxt } from '../../shared/rules';
import type { AppState } from '../../shared/domain';
const lastDuty = (s: AppState, pid: number) => dutyStats(s).get(pid)?.last || null;
type P = any;

const TONE: Record<CadreGroup, string> = { kol: 'info', apo: 'warn', list: 'outline' };
// στήλες όπως στο Δυναμολόγιο (Michael, 18/10): βαθμός, Ο/Σ, επίθετο, όνομα, ΑΜ, τηλέφωνο, θέση. Χωρά σε οθόνη 1024 χωρίς
// κύλιση· η γραμμή της ΗΚΑΙ φαίνεται στην καρτέλα του στελέχους και στο Excel
const GRID = '28px 30px 84px 52px minmax(100px,1.2fr) minmax(84px,1fr) 84px 100px minmax(100px,1.1fr) minmax(160px,1.6fr) 118px';
const range = (a: CadreAbs) => dm(a.from) + (a.to !== a.from ? '–' + dm(a.to) : '');
const stBadge = (st: CadreStatus | undefined) => (st ? html`<${Badge} tone=${TONE[st.group]} data-tip=${st.group === 'list' ? 'Δεν μετρά στην ' + HK() : GROUP_NAME[st.group] + ' στην ' + HK() + ', στήλη «' + colShort(st.col) + '»'}>${st.label} · ${range(st.abs)}<//>` : html`<${Badge} tone="ok">Παρών<//>`);

export function CadreScreen() {
  const { state, today, run, undoMark } = useStore(); const nav = useNav(); const toast = useToast();
  const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  const filter: CadreFilter = nav.params.filter || 'all';
  const date: string = nav.params.cdate || today;
  const days = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(today, i)), [today]);
  const [edit, setEdit] = useState<Partial<Cadre> | null>(null);
  const [stFor, setStFor] = useState<{ c: Cadre; abs?: CadreAbs } | null>(null);
  // από τις Υπηρεσίες (στέλεχος σε θέση): ανοίγει η καρτέλα του
  const [card, setCard] = useState<string | null>(() => (nav.params.seat != null ? state.cadreList.find(c => c.pid === nav.params.seat)?.id || null : null));
  const [xl, setXl] = useState(false);
  const all = useMemo(() => orderedCadre(state.cadreList), [state.cadreList]);
  // χειροκίνητη σειρά (ιεραρχία): σύρσιμο γραμμής ή Alt+↑/↓. Η θέση μετρά σε όλη τη λίστα, και με φίλτρο.
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const move = (id: string, to: string, after: boolean) => {
    if (id === to) return;
    const ids = all.map(c => c.id).filter(x => x !== id); const i = ids.indexOf(to);
    ids.splice(after ? i + 1 : i, 0, id);
    run({ t: 'orderCadre', ids }, false);
  };
  const end = () => { setDrag(null); setOver(null); };
  const stOf = useMemo(() => { const m = new Map<string, CadreStatus | undefined>(); all.forEach(c => m.set(c.id, cadreStatusOn(state, c.id, date))); return m; }, [all, state.cadreAbs, state.settings, date]);
  const counts = useMemo(() => Object.fromEntries(CADRE_FILTERS.map(([f]) => [f, all.filter(c => cadreMatch(f, c, stOf.get(c.id))).length])), [all, stOf]);
  const rows = all.filter(c => cadreMatch(filter, c, stOf.get(c.id)) && cadreSearch(c, dq));
  const active = counts.all || 0;
  const setFilter = (f: CadreFilter) => nav.set({ filter: f === 'all' ? undefined : f });
  const clear = () => { setQ(''); nav.set({ filter: undefined }); };
  const dateLbl = date === today ? '' : dayName(date, today) + ' ' + dm(date);
  const exportXl = async (sigs?: Sig[]) => {
    setXl(true);
    try {
      const r = await window.api.exportCadre(date, sigs);
      toast({ text: r.ok ? 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': στελέχη, καταστάσεις' + (all.some(c => !c.active) ? ', εκτός δύναμης' : '') + (date === today ? ', για σήμερα.' : ', για ' + dayName(date, today).toLowerCase() + ' ' + dm(date) + '.') : html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
    } finally { setXl(false); }
  };
  const cardOf = card ? all.find(c => c.id === card) : undefined;
  return html`<div>
    <${PageHeader} title="Στελέχη" sub=${'Δυναμικό στελεχών: ' + active + (active ? ' · κωλυόμενοι ' + (counts.kol || 0) + ' · απόντες ' + (counts.apo || 0) + (dateLbl ? ' (' + dateLbl.toLowerCase() + ')' : ' σήμερα') : '') + '. Σύρε μια γραμμή για τη σειρά της ιεραρχίας.'}>
      <${Button} variant="outline" disabled=${xl || !all.length} why=${!all.length ? 'Δεν υπάρχουν στελέχη' : undefined} onClick=${() => exportXl()} data-tip="Ένα Excel: στελέχη με την κατάσταση της μέρας, όλες οι καταστάσεις από τη μέρα αυτή και μετά, εκτός δύναμης">${xl ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>
      <${SigsMenu} form="cadre" date=${date} label="τα Στελέχη" print=${false} disabled=${xl || !all.length} go=${(_: boolean, sigs?: Sig[]) => exportXl(sigs)}/>
      <${Button} onClick=${() => setEdit({ hk: 'Λοχίες' })}>+ Νέο στέλεχος<//><//>
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση στα στελέχη" placeholder="Όνομα, βαθμός, Ο/Σ, ΑΜ, θέση, τηλέφωνο (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${Select} className="ui-select" aria-label="Καταστάσεις στην ημερομηνία" data-tip="Η κατάσταση αυτής της μέρας, και στο Excel" value=${date} onChange=${(e: any) => nav.set({ cdate: e.target.value === today ? undefined : e.target.value })}>${days.map(d => html`<option key=${d} value=${d}>${dayName(d, today)}</option>`)}<//></div>
    <div className="filters"><${Strip} role="group" aria-label="Γρήγορα φίλτρα">${CADRE_FILTERS.map(([k, l]) => html`<button key=${k} type="button" className="ui-chip" aria-pressed=${filter === k} data-tip=${k === 'kol' || k === 'apo' ? 'Στην ' + HK() + ' ' + (dateLbl ? dateLbl.toLowerCase() : 'σήμερα') : undefined} onClick=${() => setFilter(filter === k && k !== 'all' ? 'all' : k)}>${l}<span className="cnt">${counts[k] || 0}</span></button>`)}<//>
      <${ActiveFilter} parts=${[filter !== 'all' && (CADRE_FILTERS.find(([k]) => k === filter) || [, ''])[1], dateLbl, dq.trim() && '«' + dq.trim() + '»']} onClear=${clear}/>
      <span className="toolbar__count">${rows.length} από ${filter === 'inactive' ? counts.inactive || 0 : active}</span></div>
    ${rows.length === 0 ? html`<div className="ui-card empty">${!all.length ? html`Δεν έχουν μπει στελέχη. Αν δεν τα περάσεις, η ${HK()} παίρνει τους αριθμούς ανά βαθμό που γράφεις στην οθόνη της. <${Button} variant="link" onClick=${() => setEdit({ hk: 'Λοχίες' })}>Πέρασε το πρώτο<//>` : html`Κανείς δεν ταιριάζει. <${Button} variant="link" onClick=${clear}>Καθάρισε αναζήτηση και φίλτρα<//>`}</div>` :
    html`<div className="ptable ptable--roster" role="table" aria-rowcount=${rows.length}><div style=${{ overflowX: 'auto' }}><div style=${{ minWidth: '964px' }}>
      <div className="ptable__head" role="row" style=${{ gridTemplateColumns: GRID }}><span></span><span>Α/Α</span><span>Βαθμός</span><span>Ο/Σ</span><span>Επίθετο</span><span>Όνομα</span><span>ΑΜ</span><span>Τηλέφωνο</span><span>Θέση</span><span>${'Κατάσταση' + (dateLbl ? ' · ' + dateLbl : '')}</span><span></span></div>
      ${rows.map((c, i) => { const st = stOf.get(c.id); return html`<div key=${c.id} className=${cx('ptable__row', i % 2 === 1 && 'is-odd', card === c.id && 'is-sel', drag === c.id && 'is-drag', over?.id === c.id && drag !== c.id && (over.after ? 'is-drop-after' : 'is-drop-before'))} style=${{ gridTemplateColumns: GRID }} role="row" tabIndex="0"
        draggable="true" onDragStart=${(e: any) => { setDrag(c.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); }} onDragEnd=${end}
        onDragOver=${(e: any) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2; if (over?.id !== c.id || over.after !== after) setOver({ id: c.id, after }); }}
        onDrop=${(e: any) => { e.preventDefault(); if (drag && over) move(drag, over.id, over.after); end(); }}
        onClick=${() => setCard(c.id)} onKeyDown=${(e: any) => { if (e.key === 'Enter') setCard(c.id); else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const nb = rows[i + (e.key === 'ArrowUp' ? -1 : 1)]; if (nb) move(c.id, nb.id, e.key === 'ArrowDown'); } }}>
        <span className="drag-h" aria-hidden="true" data-tip="Σύρε για να αλλάξεις σειρά (ή Alt+↑/↓)">⠿</span><span className="num muted">${i + 1}</span><span>${c.rank}</span><span>${c.spec || ''}</span><span><b>${c.last}</b></span><span>${c.first}</span><span className="num">${c.am || ''}</span><span className="num">${c.phone || ''}</span><span>${c.role || ''}</span>
        <span className="badges">${c.active ? stBadge(st) : html`<${Badge} tone="outline">Εκτός δύναμης<//>`}</span>
        <span onClick=${(e: any) => e.stopPropagation()}>${c.active && html`<${Button} size="sm" variant="outline" aria-label=${'Κατάσταση: ' + c.rank + ' ' + c.last} onClick=${() => setStFor({ c })} data-tip="Κατάσταση της ${HK()}: υπηρεσία, ΕΥ, άδεια, νοσοκομείο…" data-tip-side="left">Κατάσταση…<//>`}</span></div>`; })}
    </div></div></div>`}
    ${cardOf && html`<${CadreCard} c=${cardOf} onClose=${() => setCard(null)} onEdit=${() => setEdit(cardOf)} onStatus=${(abs?: CadreAbs) => setStFor({ c: cardOf, abs })}
      onDelete=${async () => { const x = cardOf; setCard(null); if (await run({ t: 'deleteCadre', id: x.id }, false)) toast({ text: 'Διαγράφηκε: ' + x.rank + ' ' + x.last, actions: [undoMark()] }); }}/>`}
    ${edit && html`<${CadreDialog} c=${edit} onClose=${() => setEdit(null)}/>`}
    ${stFor && html`<${StatusDialog} c=${stFor.c} abs=${stFor.abs} onClose=${() => setStFor(null)}/>`}
  </div>`;
}

// Καρτέλα στελέχους: στοιχεία, κατάσταση σήμερα, όσες έρχονται και οι προηγούμενες
function CadreCard({ c, onClose, onEdit, onStatus, onDelete }: P) {
  const { state, today, run, undoMark } = useStore(); const toast = useToast();
  const [del, setDel] = useState(false);
  const lists = state.settings.lists;
  const next = cadreAbsFrom(state, c.id, today);
  const past = state.cadreAbs.filter(a => a.cid === c.id && a.to < today).sort((a, b) => b.from.localeCompare(a.from)).slice(0, 8);
  const delAbs = async (a: CadreAbs) => { if (await run({ t: 'deleteCadreAbs', id: a.id }, false)) toast({ text: 'Διαγράφηκε η κατάσταση', actions: [undoMark()] }); };
  const line = (a: CadreAbs, edit: boolean) => { const st = cadreStatusOf(a, lists); return html`<li key=${a.id}><div><${Badge} tone=${TONE[st.group]}>${st.label}<//> <b>${dow(a.from)} ${range(a)}</b>
      <small>${st.group === 'list' ? 'Δεν μετρά στην ' + HK() : GROUP_NAME[st.group] + ', στήλη «' + colShort(st.col) + '»'}${a.note ? ' · ' + a.note : ''}</small></div>
    ${edit && html`<${Button} size="sm" variant="ghost" onClick=${() => onStatus(a)}>Αλλαγή<//>`}<${Button} size="sm" variant="ghost" onClick=${() => delAbs(a)}>Διαγραφή<//></li>`; };
  if (del) return html`<${Dialog} role="alertdialog" title=${'Διαγραφή: ' + c.rank + ' ' + c.last + ';'} description="Φεύγει από τη λίστα και από την ${HK()}, μαζί με τις καταστάσεις του. Αν απλώς έφυγε από τη μονάδα, βάλ' τον «εκτός δύναμης» από τα «Στοιχεία»." onClose=${() => setDel(false)}
    footer=${html`<${Button} variant="outline" data-autofocus="" onClick=${() => setDel(false)}>Άκυρο<//><${Button} onClick=${onDelete}>Διαγραφή<//>`}><//>`;
  return html`<${Dialog} size="lg" title=${c.rank + ' ' + c.last + ' ' + c.first} description=${[c.spec, c.am && 'ΑΜ ' + c.am, c.role, c.phone && 'ΤΗΛ ' + c.phone, HK() + ': ' + hkRowLabel(c.hk), !c.active && 'εκτός δύναμης'].filter(Boolean).join(' · ')} onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${() => setDel(true)}>Διαγραφή<//><${Button} variant="outline" onClick=${onEdit}>Στοιχεία<//>${c.active && html`<${Button} onClick=${() => onStatus()}>+ Κατάσταση<//>`}`}>
    ${c.pid != null && c.monthMax && html`<div className="field"><span className="field__label">Υπηρεσίες</span><div>${monthTxt(state, today, cadreSeat(c))}${lastDuty(state, c.pid) ? ' · τελευταία ' + dow(lastDuty(state, c.pid)!) + ' ' + dm(lastDuty(state, c.pid)!) : ''} <span className="muted" style=${{ fontSize: '12px' }}>(μόνο με το χέρι, στις Υπηρεσίες)</span></div></div>`}
    <div className="field"><span className="field__label">Σήμερα</span><div>${c.active ? stBadge(cadreStatusOn(state, c.id, today)) : html`<${Badge} tone="outline">Εκτός δύναμης: δεν μετρά στην ${HK()}<//>`}</div></div>
    <div className="field"><span className="field__label">Τωρινές και επόμενες καταστάσεις</span>
      ${next.length ? html`<ul className="rec">${next.map(a => line(a, true))}</ul>` : html`<p className="note" style=${{ margin: 0 }}>Καμία. Χωρίς κατάσταση μετρά παρών στην ${HK()}.</p>`}</div>
    ${past.length > 0 && html`<div className="field"><span className="field__label">Προηγούμενες</span><ul className="rec">${past.map(a => line(a, false))}</ul></div>`}
  <//>`;
}

function CadreDialog({ c, onClose }: P) {
  const { run, state } = useStore(); const toast = useToast();
  const lists = state.settings.lists;
  const ranks = useMemo(() => optionsOf(listOf(lists, 'cadreRanks'), state.cadreList.map(x => x.rank)), [state.cadreList, lists]);
  const specs = useMemo(() => optionsOf(listOf(lists, 'specs'), state.cadreList.map(x => x.spec || '')), [state.cadreList, lists]);
  const [f, setF] = useState({ rank: c.rank || '', hk: c.hk || 'Λοχίες', spec: c.spec || '', last: c.last || '', first: c.first || '', am: c.am || '', phone: c.phone || '', role: c.role || '', active: c.active ?? true, monthMax: c.monthMax as number | undefined });
  // ΕΠΟΠ/ΟΒΑ (Michael, 21/10): πόσες υπηρεσίες τον μήνα· με όριο μπαίνει στις θέσεις των Υπηρεσιών, μόνο με το χέρι
  const duty = isEpop({ rank: f.rank }, lists) || EPOP_ROWS.includes(f.hk) || !!c.monthMax;
  const [hkTouched, setHkTouched] = useState(!!c.id); const dirty = useDirty(f);
  const save = async () => { if (await run({ t: 'saveCadre', cadre: { ...f, id: c.id } }, false)) { onClose(); toast({ text: (c.id ? 'Αποθηκεύτηκε: ' : 'Προστέθηκε: ') + f.rank.toUpperCase() + ' ' + f.last.toUpperCase() + (c.id && c.active !== f.active ? (f.active ? ', σε δύναμη' : ', εκτός δύναμης') : '') }); } };
  const fld = (k: string, label: string, ph = '') => html`<div className="field"><label className="field__label" htmlFor=${'cd-' + k}>${label}</label><input id=${'cd-' + k} className="ui-input" placeholder=${ph} value=${(f as P)[k]} onChange=${(e: any) => setF({ ...f, [k]: e.target.value })}/></div>`;
  return html`<${Dialog} title=${c.id ? 'Στοιχεία στελέχους' : 'Νέο στέλεχος'} onClose=${onClose} dirty=${dirty && 'Τα στοιχεία δεν αποθηκεύτηκαν. Αν κλείσεις, χάνονται.'}
    footer=${html`<${Why} text=${!f.last.trim() && 'Λείπει: Επώνυμο'}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!f.last.trim()} why="Λείπει: Επώνυμο" onClick=${save}>Αποθήκευση<//>`}>
    <div className="field-row"><${ChoiceField} id="cd-rank" label="Βαθμός" value=${f.rank} options=${ranks} placeholder="π.χ. ΛΧΙΑΣ" autoFocus onChange=${(v: string) => setF({ ...f, rank: v, ...(!hkTouched ? { hk: guessHk(v, lists) } : {}) })}/>
      <${ChoiceField} id="cd-spec" label="Ο/Σ" value=${f.spec} options=${specs} placeholder="π.χ. ΤΘ" onChange=${(v: string) => setF({ ...f, spec: v })}/></div>
    <div className="field-row">${fld('last', 'Επώνυμο *')}${fld('first', 'Όνομα')}</div>
    <div className="field-row">${fld('am', 'ΑΜ', 'αριθμός μητρώου')}${fld('phone', 'Τηλέφωνο')}</div>
    <div className="field-row">${fld('role', 'Θέση', 'π.χ. Διοικητής ' + UNIT().gen)}
      <div className="field"><label className="field__label" htmlFor="cd-hk">Γραμμή στην ${HK()}</label><${Select} id="cd-hk" className="ui-input" value=${f.hk} onChange=${(e: any) => { setHkTouched(true); setF({ ...f, hk: e.target.value }); }}>${hkCadreRows(lists).map(r => html`<option key=${r} value=${r}>${hkRowLabel(r)}</option>`)}<//></div></div>
    ${duty && html`<div className="field"><label className="field__label" htmlFor="cd-mm">Υπηρεσίες τον μήνα (το πολύ)</label><input id="cd-mm" className="ui-input" type="number" min="1" max="31" style=${{ maxWidth: '120px' }} placeholder="π.χ. 4" value=${f.monthMax ?? ''} onChange=${(e: any) => setF({ ...f, monthMax: Math.max(0, Math.floor(+e.target.value)) || undefined })}/><span className="field__help">Με αριθμό μπαίνει στις θέσεις των Υπηρεσιών, μόνο με το χέρι (ποτέ η αυτόματη συμπλήρωση). Πάνω από το όριο ζητά αιτία. Κενό = δεν κάνει υπηρεσίες.</span></div>`}
    ${c.id && html`<label className="field" style=${{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}><input type="checkbox" className="ui-check" checked=${f.active} onChange=${() => setF({ ...f, active: !f.active })}/>
      <span>Σε δύναμη <span className="field__help">(αν φύγει από τη μονάδα, βγάλ' το: μένει στη λίστα «Εκτός δύναμης» και δεν μετρά στην ${HK()})</span></span></label>`}
  <//>`;
}

// Κατάσταση στελέχους = στήλη της ΗΚΑΙ. Μία τη μέρα: αν πέφτει πάνω σε άλλη, ρωτά και η νέα μπαίνει στη θέση της
function StatusDialog({ c, abs, onClose }: P) {
  const { run, today, state } = useStore(); const toast = useToast();
  const lists = state.settings.lists;
  const [f, setF] = useState({ kind: abs?.kind || 'ka', from: abs?.from || today, to: abs?.to || addDays(today, 4), note: abs?.note || '' });
  const kinds = cadreAbsKinds(lists);
  // η τωρινή μένει στη λίστα ακόμα κι αν κρύφτηκε στις Ρυθμίσεις
  const opts = abs && !kinds.some(k => k[0] === abs.kind) ? [...kinds, ...cadreAbsKinds(lists, true).filter(k => k[0] === abs.kind)] : kinds;
  const st = cadreStatusOf({ id: '', cid: c.id, ...f }, lists);
  const clash = cadreClash(state, { id: abs?.id, cid: c.id, from: f.from, to: f.to });
  const bad = f.to < f.from; const dirty = useDirty(f);
  const save = async () => {
    const r = await run({ t: 'addCadreAbs', abs: { id: abs?.id, cid: c.id, ...f, note: f.note.trim() || undefined }, replace: clash.length > 0 }, false);
    if (r) { onClose(); toast({ text: c.rank + ' ' + c.last + ': ' + st.label.toLowerCase() + ' ' + dm(f.from) + (f.to !== f.from ? '–' + dm(f.to) : '') }); }
  };
  const group = (g: CadreGroup) => opts.filter(k => groupOfCol(k[2]) === g);
  return html`<${Dialog} title=${(abs ? 'Αλλαγή κατάστασης: ' : 'Κατάσταση: ') + c.rank + ' ' + c.last} onClose=${onClose} dirty=${dirty && 'Η κατάσταση δεν αποθηκεύτηκε. Αν κλείσεις, χάνεται.'}
    footer=${html`<${Why} text=${bad && '«Έως» πριν από «Από»'}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${bad} why="«Έως» πριν από «Από»" onClick=${save}>${clash.length ? 'Αποθήκευση στη θέση της' : 'Αποθήκευση'}<//>`}>
    <div className="field"><label className="field__label" htmlFor="ca-k">Κατάσταση (στήλη της ${HK()})</label><${Select} id="ca-k" className="ui-input" data-autofocus="" value=${f.kind} onChange=${(e: any) => setF({ ...f, kind: e.target.value })}>
      ${(['kol', 'apo', 'list'] as CadreGroup[]).map(g => group(g).length > 0 && html`<optgroup key=${g} label=${g === 'kol' ? 'Κωλυόμενοι' : g === 'apo' ? 'Απόντες' : 'Μόνο στη λίστα'}>${group(g).map(([k, l, col]) => html`<option key=${k} value=${k}>${l}${col ? ' (' + colShort(col) + ')' : ''}</option>`)}</optgroup>`)}<//>
      <span className="field__help">${st.group === 'list' ? 'Δεν μετρά στην ' + HK() + ', φαίνεται μόνο στη λίστα.' : 'Μετρά στην ' + HK() + ' στους ' + (st.group === 'kol' ? 'κωλυόμενους' : 'απόντες') + ', στήλη «' + colShort(st.col) + '», γραμμή «' + hkRowLabel(c.hk) + '».'}</span></div>
    <${DateRangeField} from=${f.from} to=${f.to} onChange=${(from: string, to: string) => setF({ ...f, from, to })}/>
    <div className="field"><label className="field__label" htmlFor="ca-n">Παρατήρηση</label><input id="ca-n" className="ui-input" value=${f.note} onChange=${(e: any) => setF({ ...f, note: e.target.value })}/></div>
    ${clash.length > 0 && html`<${Alert} tone="warn"><span>Έχει ήδη ${clash.map(a => cadreStatusOf(a, lists).label.toLowerCase() + ' ' + range(a)).join(', ')}. Στην ${HK()} μετρά μία κατάσταση τη μέρα: με «Αποθήκευση στη θέση της» η παλιά κόβεται σε αυτές τις μέρες και κρατά τις υπόλοιπες.</span><//>`}
  <//>`;
}
