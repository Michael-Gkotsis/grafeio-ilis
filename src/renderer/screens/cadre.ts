// features/cadre · «Στελέχη» (Michael, 17/10): δική τους καρτέλα στο μενού, χωριστά από το Δυναμολόγιο των οπλιτών.
// Οι καταστάσεις τους είναι οι στήλες της ΗΚΑΙ (κωλυόμενοι, απόντες) και ταΐζουν την ΗΚΑΙ όπως πριν.
import { HeldBlock } from './assets';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Why, Dialog, PageHeader, Sheet, SheetNav, Strip, Tabs, useDirty, useSheetNav, useToast } from '../ui';
import { Select } from '../select';
import { useNav, useStore } from '../store';
import { ActiveFilter, ChoiceField, DateRangeField, SigsMenu } from '../common';
import { useHeadPick } from '../headPick';
import type { Sig } from '../../shared/sigs';
import { cadreAbsKinds, cadreAbsOf, guessHk, hkCadreRows, listOf, optionsOf, rankTxt, type UserLists } from '../../shared/ranks';
import { hkRowLabel, HK, UNIT } from '../../shared/unit';
import type { Cadre, CadreAbs } from '../../shared/domain';
import { CADRE_FILTERS, GROUP_NAME, orderedCadre, cadreAbsFrom, cadreClash, cadreMatch, cadreSearch, cadreStateOn, cadreStatusOf, colShort, groupOfCol, type CadreFilter, type CadreGroup, type CadreStatus } from '../../shared/cadre';
import { addDays, dayName, dm, dow } from '../../shared/dates';
import { EPOP_ROWS, cadreSeat, dutyStats, isEpop, monthTxt } from '../../shared/rules';
import { seatTxt } from '../../shared/weapons';
import type { AppState } from '../../shared/domain';
import { PersonalTab } from './personal';
import { LeaveTab } from './cadreLeave';
import { CadrePlanView } from './cadrePlan';
import { CadreDutyView, DutyPersonDialog } from './cadreDuty';
import { dutyCfgOf, monthLimit, personOf } from '../../shared/cadreDuty';
import { noDutyOf, quotaShort, rangeTxt } from '../../shared/cadrePlan';
import { apalLeft, leaveCols, leaveOverdraft, summaries } from '../../shared/cadreBalance';
import { NoteDot, NotesTab, TodayAlert, notesTabLabel } from './notes';
import { noteIndex, personGroups, remLine } from '../../shared/notes';
const lastDuty = (s: AppState, pid: number) => dutyStats(s).get(pid)?.last || null;
type P = any;

const TONE: Record<CadreGroup, string> = { kol: 'info', apo: 'warn', list: 'outline' };
// στήλες όπως στο Δυναμολόγιο (Michael, 18/10): βαθμός, Ο/Σ, επίθετο, όνομα, ΑΜ, τηλέφωνο, θέση. Χωρά σε οθόνη 1024 χωρίς
// κύλιση· η γραμμή της ΗΚΑΙ φαίνεται στην καρτέλα του στελέχους και στο Excel
const GRID = '24px 40px 92px 44px minmax(110px,1.4fr) minmax(80px,1fr) 66px 100px minmax(56px,.6fr) minmax(110px,1.4fr) 118px';   // χωράει στα 858px του 1024 με μαζεμένο μενού
// Άδειες ανά είδος και Απαλλ. (Michael, 17/11· ανά είδος: σχόλιο συναδέλφου): μία στενή στήλη για κάθε είδος άδειας (ΚΑ, ΑΜΔ…) και μία για τις απαλλαγές· κάτω από 1280px κρύβονται (styles.css .cadre-tbl) και ο πίνακας γυρνά στις παλιές στήλες
const gridLv = (nq: number) => GRID.replace(/ 118px$/, ' 58px'.repeat(nq) + ' 62px 118px');
const CADRE_VIEWS = [{ value: 'list', label: 'Λίστα' }, { value: 'plan', label: 'Πρόγραμμα αδειών' }, { value: 'duty', label: 'Υπηρεσίες στελεχών' }];
const range = (a: CadreAbs) => dm(a.from) + (a.to !== a.from ? '–' + dm(a.to) : '');
const stBadge = (st: CadreStatus | undefined, lists?: UserLists) => (st ? html`<${Badge} tone=${TONE[st.group]} data-tip=${st.label + ' · ' + range(st.abs) + ' · ' + (st.group === 'list' ? 'Δεν μετρά στην ' + HK() : GROUP_NAME[st.group] + ' στην ' + HK() + ', στήλη «' + colShort(st.col, lists) + '»')}>${st.label} · ${range(st.abs)}<//>` : html`<${Badge} tone="ok">Παρών<//>`);

export function CadreScreen() {
  const { state, today, run } = useStore(); const nav = useNav(); const toast = useToast();
  const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  const filter: CadreFilter = nav.params.filter || 'all';
  const date: string = nav.params.cdate || today;
  const days = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(today, i)), [today]);
  const [edit, setEdit] = useState<Partial<Cadre> | null>(null);
  const [stFor, setStFor] = useState<{ c: Cadre; abs?: CadreAbs } | null>(null);
  const [xl, setXl] = useState(false); const hp = useHeadPick('cadre');
  const all = useMemo(() => orderedCadre(state.cadreList), [state.cadreList]);
  const marks = useMemo(() => noteIndex(state.notes, today), [state.notes, today]);
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
  const year = +today.slice(0, 4);
  const sums = useMemo(() => summaries(state, year, today), [state.cadreList, state.cadreAbs, state.cadreGrants, state.settings, state.guards, state.dutyLog, year, today]);
  const lvCols = useMemo(() => leaveCols(state, sums), [state.cadreList, state.settings, sums]);
  const GRID_LV = useMemo(() => gridLv(lvCols.length), [lvCols]);
  const stOf = useMemo(() => { const m = new Map<string, CadreStatus | undefined>(); all.forEach(c => m.set(c.id, cadreStateOn(state, c.id, date))); return m; }, [all, state.cadreAbs, state.cadreDuties, state.settings, date]);
  const counts = useMemo(() => Object.fromEntries(CADRE_FILTERS.map(([f]) => [f, all.filter(c => cadreMatch(f, c, stOf.get(c.id))).length])), [all, stOf]);
  const rows = all.filter(c => cadreMatch(filter, c, stOf.get(c.id)) && cadreSearch(c, dq));
  const active = counts.all || 0;
  const setFilter = (f: CadreFilter) => nav.set({ filter: f === 'all' ? undefined : f });
  const clear = () => { setQ(''); nav.set({ filter: undefined }); };
  const dateLbl = date === today ? '' : dayName(date, today) + ' ' + dm(date);
  const [xlLv, setXlLv] = useState(false);
  const exportLeave = async () => {
    setXlLv(true);
    try { const r = await window.api.exportCadreLeave(year); toast({ text: r.ok ? 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': άδειες και απαλλαγές στελεχών ' + year + '.' : html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` }); }
    finally { setXlLv(false); }
  };
  const exportXl = async (sigs?: Sig[], hid?: string) => {
    setXl(true);
    try {
      const r = await window.api.exportCadre(date, sigs, hid ?? hp.take());
      toast({ text: r.ok ? 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': στελέχη, καταστάσεις' + (all.some(c => !c.active) ? ', εκτός δύναμης' : '') + (date === today ? ', για σήμερα.' : ', για ' + dayName(date, today).toLowerCase() + ' ' + dm(date) + '.') : html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
    } finally { setXl(false); }
  };
  // η καρτέλα του στελέχους είναι πλαϊνή κάρτα του Shell (πάνω από κάθε οθόνη)· εδώ μόνο η επιλεγμένη γραμμή και η σειρά ↑/↓
  const card: string | null = nav.params.cadre ?? null; const openCard = (id: string) => nav.openCadre(id, rows.map(r => r.id));
  // δύο όψεις (Michael, 17/11): Λίστα και Πρόγραμμα αδειών· η επιλογή μένει όπως τις άλλες οθόνες (nav.params.cview)
  const view: string = nav.params.cview === 'plan' ? 'plan' : nav.params.cview === 'duty' ? 'duty' : 'list';
  const [dutyFor, setDutyFor] = useState<Cadre | null>(null);
  const tabs = html`<${Tabs} value=${view} onChange=${(v: string) => nav.set({ cview: v === 'list' ? undefined : v })} items=${CADRE_VIEWS}/>`;
  if (view === 'plan') return html`<div>
    <${PageHeader} title="Στελέχη" sub="Πρόγραμμα αδειών του μήνα: ποιος λείπει και πότε. Σύρε πάνω στις μέρες για να βάλεις άδεια ή απαλλαγή."/>
    ${tabs}
    <${CadrePlanView} onOpen=${(id: string, ids: string[]) => nav.openCadre(id, ids)}/>
  </div>`;
  if (view === 'duty') return html`<div>
    <${PageHeader} title="Στελέχη" sub="Υπηρεσίες στελεχών του μήνα: ομάδες, όρια και περιορισμοί. Μετρούν μαζί με όσες κάνουν με το χέρι στις θέσεις των στρατιωτών."/>
    ${tabs}
    <${CadreDutyView} onInfo=${(c: Cadre) => setDutyFor(c)}/>
    ${dutyFor && html`<${DutyPersonDialog} key=${dutyFor.id} c=${dutyFor} onClose=${() => setDutyFor(null)}/>`}
  </div>`;
  return html`<div>
    <${PageHeader} title="Στελέχη" sub=${'Δυναμικό στελεχών: ' + active + (active ? ' · κωλυόμενοι ' + (counts.kol || 0) + ' · απόντες ' + (counts.apo || 0) + (dateLbl ? ' (' + dateLbl.toLowerCase() + ')' : ' σήμερα') : '') + '. Σύρε μια γραμμή για τη σειρά της ιεραρχίας.'}>
      ${hp.node}
      <${Button} variant="outline" disabled=${xl || !all.length} why=${!all.length ? 'Δεν υπάρχουν στελέχη' : undefined} onClick=${() => exportXl()} data-tip="Ένα Excel: στελέχη με την κατάσταση της μέρας, όλες οι καταστάσεις από τη μέρα αυτή και μετά, εκτός δύναμης">${xl ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>
      <${Button} variant="outline" disabled=${xlLv || !all.length} why=${!all.length ? 'Δεν υπάρχουν στελέχη' : undefined} onClick=${exportLeave} data-tip="Νέο Excel: πόσες μέρες άδειας και απαλλαγές μένουν σε κάθε στέλεχος">${xlLv ? 'Δημιουργία…' : 'Άδειες σε Excel'}<//>
      <${SigsMenu} form="cadre" date=${date} label="τα Στελέχη" print=${false} disabled=${xl || !all.length} headId=${hp.headId} go=${(_: boolean, sigs?: Sig[], hid?: string) => exportXl(sigs, hid)}/>
      <${Button} onClick=${() => setEdit({ hk: 'Λοχίες' })}>+ Νέο στέλεχος<//><//>
    ${tabs}
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση στα στελέχη" placeholder="Όνομα, βαθμός, Ο/Σ, ΑΜ, θέση, τηλέφωνο (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${Select} className="ui-select" aria-label="Καταστάσεις στην ημερομηνία" data-tip="Η κατάσταση αυτής της μέρας, και στο Excel" value=${date} onChange=${(e: any) => nav.set({ cdate: e.target.value === today ? undefined : e.target.value })}>${days.map(d => html`<option key=${d} value=${d}>${dayName(d, today)}</option>`)}<//></div>
    <div className="filters"><${Strip} role="group" aria-label="Γρήγορα φίλτρα">${CADRE_FILTERS.map(([k, l]) => html`<button key=${k} type="button" className="ui-chip" aria-pressed=${filter === k} data-tip=${k === 'kol' || k === 'apo' ? 'Στην ' + HK() + ' ' + (dateLbl ? dateLbl.toLowerCase() : 'σήμερα') : undefined} onClick=${() => setFilter(filter === k && k !== 'all' ? 'all' : k)}>${l}<span className="cnt">${counts[k] || 0}</span></button>`)}<//>
      <${ActiveFilter} parts=${[filter !== 'all' && (CADRE_FILTERS.find(([k]) => k === filter) || [, ''])[1], dateLbl, dq.trim() && '«' + dq.trim() + '»']} onClear=${clear}/>
      <span className="toolbar__count">${rows.length} από ${filter === 'inactive' ? counts.inactive || 0 : active}</span></div>
    ${rows.length === 0 ? html`<div className="ui-card empty">${!all.length ? html`Δεν έχουν μπει στελέχη. Αν δεν τα περάσεις, η ${HK()} παίρνει τους αριθμούς ανά βαθμό που γράφεις στην οθόνη της. <${Button} variant="link" onClick=${() => setEdit({ hk: 'Λοχίες' })}>Πέρασε το πρώτο<//>` : html`Κανείς δεν ταιριάζει. <${Button} variant="link" onClick=${clear}>Καθάρισε αναζήτηση και φίλτρα<//>`}</div>` :
    html`<div className="ptable ptable--roster" role="table" aria-rowcount=${rows.length}><div style=${{ overflowX: 'auto' }}><div className="cadre-tbl">
      <div className="ptable__head" role="row" style=${{ gridTemplateColumns: GRID_LV }}><span></span><span>Α/Α</span><span>Βαθμός</span><span>Ο/Σ</span><span>Επίθετο</span><span>Όνομα</span><span>ΑΜ</span><span>Τηλέφωνο</span><span>Θέση</span><span>${'Κατάσταση' + (dateLbl ? ' · ' + dateLbl : '')}</span>${lvCols.map(q => html`<span key=${q.id} className="cadre-lv" data-tip=${q.name + ': μένουν από όσες δικαιούται το ' + year}>${quotaShort(q, state.settings.lists)}</span>`)}<span className="cadre-lv" data-tip="Απαλλαγές που μένουν">Απαλλ.</span><span></span></div>
      ${rows.map((c, i) => { const st = stOf.get(c.id); return html`<div key=${c.id} className=${cx('ptable__row', i % 2 === 1 && 'is-odd', card === c.id && 'is-sel', drag === c.id && 'is-drag', over?.id === c.id && drag !== c.id && (over.after ? 'is-drop-after' : 'is-drop-before'))} style=${{ gridTemplateColumns: GRID_LV }} role="row" tabIndex="0"
        draggable="true" onDragStart=${(e: any) => { setDrag(c.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); }} onDragEnd=${end}
        onDragOver=${(e: any) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2; if (over?.id !== c.id || over.after !== after) setOver({ id: c.id, after }); }}
        onDrop=${(e: any) => { e.preventDefault(); if (drag && over) move(drag, over.id, over.after); end(); }}
        onClick=${() => openCard(c.id)} onKeyDown=${(e: any) => { if (e.key === 'Enter') openCard(c.id); else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const nb = rows[i + (e.key === 'ArrowUp' ? -1 : 1)]; if (nb) move(c.id, nb.id, e.key === 'ArrowDown'); } }}>
        <span className="drag-h" aria-hidden="true" data-tip="Σύρε για να αλλάξεις σειρά (ή Alt+↑/↓)">⠿</span><span className="num muted">${i + 1}</span><span data-tip=${rankTxt(c)}>${rankTxt(c)}</span><span>${c.spec || ''}</span><span data-tip=${c.last}><b>${c.last}</b>${marks.get('c' + c.id) && html`<${NoteDot} m=${marks.get('c' + c.id)}/>`}</span><span data-tip=${c.first}>${c.first}</span><span className="num">${c.am || ''}</span><span className="num">${c.phone || ''}</span><span data-tip=${c.role || undefined}>${c.role || ''}</span>
        <span className="badges">${c.active ? stBadge(st, state.settings.lists) : html`<${Badge} tone="outline">Εκτός δύναμης<//>`}</span>
        ${(() => { const sm = c.active ? sums.get(c.id) : undefined; const num = (n: number) => String(Math.round(n * 100) / 100).replace('.', ','); return html`${lvCols.map(q => { const b = sm?.quotas.find(x => x.quota.id === q.id); return html`<span key=${q.id} className="cadre-lv num" data-tip=${b ? q.name + ': μένουν ' + num(b.left) + ' από ' + num(b.entitled) + ' το ' + year : undefined} style=${b && b.left < 0 ? { color: 'var(--bad)' } : undefined}>${b ? num(b.left) + '/' + num(b.entitled) : ''}</span>`; })}<span key="apal" className="cadre-lv num" data-tip=${sm ? 'Απαλλαγές που μένουν' : undefined} style=${sm && sm.apal < 0 ? { color: 'var(--bad)' } : undefined}>${sm ? num(sm.apal) : ''}</span>`; })()}
        <span onClick=${(e: any) => e.stopPropagation()}>${c.active && html`<${Button} size="sm" variant="outline" aria-label=${'Κατάσταση: ' + rankTxt(c) + ' ' + c.last} onClick=${() => setStFor({ c })} data-tip="Κατάσταση της ${HK()}: υπηρεσία, ΕΥ, άδεια, νοσοκομείο…" data-tip-side="left">Κατάσταση…<//>`}</span></div>`; })}
    </div></div></div>`}
    ${edit && html`<${CadreDialog} c=${edit} onClose=${() => setEdit(null)}/>`}
    ${stFor && html`<${StatusDialog} c=${stFor.c} abs=${stFor.abs} onClose=${() => setStFor(null)}/>`}
  </div>`;
}

// Καρτέλα στελέχους, πλαϊνή όπως του στρατιώτη (Michael, 24/10): ανοίγει πάνω από κάθε οθόνη (Shell), ▲▼/↑↓ στη λίστα από όπου άνοιξε.
// Καρτέλες: Καταστάσεις (σήμερα, όσες έρχονται, προηγούμενες), Άδειες και απαλλαγές (υπόλοιπα της χρονιάς, καρτέλα απαλλαγών), Στοιχεία (+ Διαγραφή), Σημειώσεις, Προσωπικά (IBAN/ΑΜΚΑ/ΑΦΜ). list: τα id της λίστας που βλέπεις
const CADRE_TABS = [{ value: 'abs', label: 'Καταστάσεις' }, { value: 'leave', label: 'Άδειες και απαλλαγές' }, { value: 'info', label: 'Στοιχεία' }, { value: 'notes', label: 'Σημειώσεις' }, { value: 'pers', label: 'Προσωπικά' }];
export function CadreSheet({ cid, list, onMove, onClose }: P) {
  const { state, today, run, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const c: Cadre | undefined = state.cadreList.find(x => x.id === cid);
  const [tab, setTab] = useState('abs');
  const [edit, setEdit] = useState(false); const [stFor, setStFor] = useState<{ abs?: CadreAbs; apal?: boolean } | null>(null); const [del, setDel] = useState(false);
  const [lvYear, setLvYear] = useState(+today.slice(0, 4)); const [dutyDlg, setDutyDlg] = useState(false);
  const order: string[] = useMemo(() => list || orderedCadre(state.cadreList).map(x => x.id), [list, state.cadreList]);
  const { at, n: total, move } = useSheetNav(order, cid, onMove, edit || !!stFor || del);
  useEffect(() => { setEdit(false); setStFor(null); setDel(false); const b = document.querySelector('.ui-sheet__body'); if (b) b.scrollTop = 0; }, [cid]);
  if (!c) return null;
  const lists = state.settings.lists;
  const next = cadreAbsFrom(state, c.id, today);
  const past = state.cadreAbs.filter(a => a.cid === c.id && a.to < today).sort((a, b) => b.from.localeCompare(a.from)).slice(0, 8);
  const ty = +today.slice(0, 4);
  const leaveYears = [...new Set([ty - 1, ty, ty + 1, lvYear, ...(state.cadreGrants || []).filter(g => g.cid === c.id).map(g => g.year), ...state.cadreAbs.filter(a => a.cid === c.id).flatMap(a => [+a.from.slice(0, 4), +a.to.slice(0, 4)])])].sort();
  const ng = personGroups(state.notes, { cid }, today); const rem = remLine(state.notes, { cid }, today);
  const noDuty = noDutyOf(state, c.id);
  const delNoDuty = async (id: string) => { if (await run({ t: 'deleteCadreNoDuty', id }, false)) toast({ text: 'Διαγράφηκε «δεν θέλει υπηρεσία»', actions: [undoMark()] }); };
  const delAbs = async (a: CadreAbs) => { if (await run({ t: 'deleteCadreAbs', id: a.id }, false)) toast({ text: 'Διαγράφηκε η κατάσταση', actions: [undoMark()] }); };
  const line = (a: CadreAbs, edit: boolean) => { const st = cadreStatusOf(a, lists); return html`<li key=${a.id}><div><${Badge} tone=${TONE[st.group]}>${st.label}<//> <b>${dow(a.from)} ${range(a)}</b>
      <small>${st.group === 'list' ? 'Δεν μετρά στην ' + HK() : GROUP_NAME[st.group] + ', στήλη «' + colShort(st.col, lists) + '»'}${a.note ? ' · ' + a.note : ''}</small></div>
    ${edit && html`<${Button} size="sm" variant="ghost" onClick=${() => setStFor({ abs: a })}>Αλλαγή<//>`}<${Button} size="sm" variant="ghost" onClick=${() => delAbs(a)}>Διαγραφή<//></li>`; };
  const doDelete = async () => { setDel(false); onClose(); if (await run({ t: 'deleteCadre', id: c.id }, false)) toast({ text: 'Διαγράφηκε: ' + rankTxt(c) + ' ' + c.last, actions: [undoMark()] }); };
  // μετρητής υπηρεσιών του μήνα: κάθε ενεργό στέλεχος (και το «0» όσο δεν έχει μπει ποτέ σε θέση)· ΕΠΟΠ/ΟΒΑ «2 από 4 τον μήνα»
  const ym0 = today.slice(0, 7); const dl = c.active ? monthLimit(state, c, ym0) : null;
  const month0 = c.active ? (c.pid != null ? monthTxt(state, today, cadreSeat(c), true) + (lastDuty(state, c.pid) ? ' · τελευταία ' + dow(lastDuty(state, c.pid)!) + ' ' + dm(lastDuty(state, c.pid)!) : '') : '0 τον μήνα') : '';
  // με υπηρεσίες από το πρόγραμμα στελεχών: μετρούν μαζί με όσες έκανε με το χέρι στις θέσεις (cadreDuty.ts)
  const month = dl && dl.roster > 0 ? dl.done + ' τον μήνα (πρόγραμμα ' + dl.roster + ' · θέσεις στρατιωτών ' + dl.seat + ') · όριο ' + dl.effBase + (dl.extra ? '+' + dl.extra : '') : month0;
  const dutyCfg = dutyCfgOf(state.settings); const dutyP = personOf(state, c.id);
  const wtxt = [c.wtype, c.weapon && 'αριθμός ' + c.weapon, (c.rack || c.wpos) && 'θέση ' + seatTxt(c.rack, c.wpos)].filter(Boolean).join(' · ');
  return html`<${Sheet} onClose=${onClose} wide=${true} actions=${html`<${SheetNav} at=${at} n=${total} move=${move}/>`} title=${html`<h2 style=${{ fontSize: '18px' }}>${rankTxt(c)} ${c.last} ${c.first}</h2>`}
    subtitle=${html`<div className="muted" style=${{ fontSize: '13px' }}>${[c.origin && 'Προέλευση ' + c.origin, c.spec, c.role, HK() + ': ' + hkRowLabel(c.hk), !c.active && 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ'].filter(Boolean).join(' · ')}</div>`}>
    <${TodayAlert} rules=${[]} rem=${rem} onRem=${() => setTab('notes')}/>
    <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>${c.active && html`<${Button} onClick=${() => setStFor({})}>+ Κατάσταση<//>`}<${Button} variant="outline" onClick=${() => setEdit(true)}>Διόρθωση στοιχείων<//></div>
    <${Tabs} value=${tab} onChange=${(t: string) => nav.guard(() => setTab(t))} items=${CADRE_TABS.map(t => (t.value === 'notes' ? { ...t, label: notesTabLabel(ng) } : t))}/>
    ${tab === 'abs' && html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="field"><span className="field__label">Σήμερα</span><div>${c.active ? stBadge(cadreStateOn(state, c.id, today), state.settings.lists) : html`<${Badge} tone="outline">Εκτός δύναμης: δεν μετρά στην ${HK()}<//>`}</div></div>
      <div className="field"><span className="field__label">Τωρινές και επόμενες καταστάσεις</span>
        ${next.length ? html`<ul className="rec">${next.map(a => line(a, true))}</ul>` : html`<p className="note" style=${{ margin: 0 }}>Καμία. Χωρίς κατάσταση μετρά παρών στην ${HK()}.</p>`}</div>
      ${past.length > 0 && html`<div className="field"><span className="field__label">Προηγούμενες</span><ul className="rec">${past.map(a => line(a, false))}</ul></div>`}
      ${noDuty.length > 0 && html`<div className="field" data-cadre-noduty=""><span className="field__label">Δεν θέλει υπηρεσία</span>
        <ul className="rec">${noDuty.map(x => html`<li key=${x.id}><div><b>${dow(x.from)} ${rangeTxt(x)}</b><small>Μόνο για το πρόγραμμα, δεν είναι κατάσταση και δεν μπαίνει στην ${HK()}${x.note ? ' · ' + x.note : ''}</small></div><${Button} size="sm" variant="ghost" onClick=${() => delNoDuty(x.id)}>Διαγραφή<//></li>`)}</ul></div>`}
      ${month && html`<div className="field"><span className="field__label">Υπηρεσίες τον μήνα</span><div data-cadre-month="">${month} <span className="muted" style=${{ fontSize: '12px' }}>${dl && dl.roster > 0 ? '(μαζί: πρόγραμμα στελεχών και θέσεις στρατιωτών)' : '(μόνο με το χέρι, στις Υπηρεσίες)'}</span></div></div>`}</div>`}
    ${tab === 'leave' && html`<${LeaveTab} key=${cid} c=${c} year=${lvYear} setYear=${setLvYear} years=${leaveYears} onApal=${() => setStFor({ apal: true })}/>`}
    ${tab === 'info' && html`<dl className="kv"><dt>Βαθμός</dt><dd>${c.rank || '—'}</dd><dt>Προέλευση</dt><dd>${c.origin || '—'}</dd><dt>Ο/Σ</dt><dd>${c.spec || '—'}</dd><dt>Επίθετο</dt><dd>${c.last || '—'}</dd><dt>Όνομα</dt><dd>${c.first || '—'}</dd>
      <dt>ΑΜ</dt><dd className="num">${c.am || '—'}</dd><dt>Τηλέφωνο</dt><dd className="num">${c.phone || '—'}</dd><dt>Θέση</dt><dd>${c.role || '—'}</dd><dt>Γραμμή ${HK()}</dt><dd>${hkRowLabel(c.hk)}</dd>
      ${c.monthMax != null && html`<dt>Υπηρεσίες τον μήνα</dt>`}${c.monthMax != null && html`<dd>το πολύ ${c.monthMax}</dd>`}<dt>Όπλο</dt><dd>${wtxt || '—'}</dd><dt>Σε δύναμη</dt><dd>${c.active ? 'Ναι' : 'Όχι'}</dd><${HeldBlock} cid=${c.id}/>
      ${(dutyP.group || dutyP.limit != null || dutyP.none || dutyP.only || dutyP.no24 || dutyP.noDow?.length) && html`<dt>Υπηρεσίες στελεχών</dt>`}${(dutyP.group || dutyP.limit != null || dutyP.none || dutyP.only || dutyP.no24 || dutyP.noDow?.length) && html`<dd data-cadre-dutyof="">${[dutyCfg.groups.find(g => g.id === dutyP.group)?.name, dutyP.limit != null && 'όριο ' + dutyP.limit, dutyP.none && 'ελαφράς: καμία', dutyP.only && 'ελαφράς: μόνο', dutyP.no24 && 'όχι 24ωρες', dutyP.noDow?.length && 'μέρες που δεν θέλει: ' + dutyP.noDow.length].filter(Boolean).join(' · ')}</dd>`}</dl>
      <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><${Button} variant="outline" onClick=${() => setDutyDlg(true)} data-tip="Ομάδα υπηρεσιών, όριο του μήνα και περιορισμοί (ελαφράς, μητέρα…)">Στοιχεία υπηρεσιών…<//><${Button} variant="ghost" onClick=${() => setDel(true)}>Διαγραφή στελέχους…<//></div>`}
    ${tab === 'notes' && html`<${NotesTab} key=${cid} who=${{ cid }}/>`}
    ${tab === 'pers' && html`<${PersonalTab} key=${cid} who=${{ cid }} rec=${c}/>`}
    ${edit && html`<${CadreDialog} c=${c} onClose=${() => setEdit(false)}/>`}
    ${dutyDlg && html`<${DutyPersonDialog} c=${c} onClose=${() => setDutyDlg(false)}/>`}
    ${stFor && html`<${StatusDialog} c=${c} abs=${stFor.abs} apal=${stFor.apal} onClose=${() => setStFor(null)}/>`}
    ${del && html`<${Dialog} role="alertdialog" title=${'Διαγραφή: ' + rankTxt(c) + ' ' + c.last + ';'} description="Φεύγει από τη λίστα και από την ${HK()}, μαζί με τις καταστάσεις του. Αν απλώς έφυγε από τη μονάδα, βάλ' τον «εκτός δύναμης» από τα «Στοιχεία»." onClose=${() => setDel(false)}
      footer=${html`<${Button} variant="outline" data-autofocus="" onClick=${() => setDel(false)}>Άκυρο<//><${Button} onClick=${doDelete}>Διαγραφή<//>`}><//>`}
  <//>`;
}

function CadreDialog({ c, onClose }: P) {
  const { run, state } = useStore(); const toast = useToast();
  const lists = state.settings.lists;
  const ranks = useMemo(() => optionsOf(listOf(lists, 'cadreRanks'), state.cadreList.map(x => x.rank)), [state.cadreList, lists]);
  const specs = useMemo(() => optionsOf(listOf(lists, 'specs'), state.cadreList.map(x => x.spec || '')), [state.cadreList, lists]);
  const eids = useMemo(() => optionsOf([], state.cadreList.map(x => x.eid || '')), [state.cadreList]);
  const wtypes = useMemo(() => optionsOf(listOf(lists, 'weaponTypes'), [c.wtype || '']), [lists, c.wtype]);
  const origins = useMemo(() => optionsOf(listOf(lists, 'origins'), [...state.cadreList.map(x => x.origin), ...state.people.map(p => p.origin)]), [state.cadreList, state.people, lists]);
  const [f, setF] = useState({ rank: c.rank || '', origin: c.origin || '', hk: c.hk || 'Λοχίες', spec: c.spec || '', eid: c.eid || '', last: c.last || '', first: c.first || '', am: c.am || '', phone: c.phone || '', role: c.role || '', active: c.active ?? true, monthMax: c.monthMax as number | undefined, wtype: c.wtype || '', weapon: c.weapon || '', rack: c.rack || '', wpos: c.wpos || '' });
  // ΕΠΟΠ/ΟΒΑ (Michael, 21/10): πόσες υπηρεσίες τον μήνα· με όριο μπαίνει στις θέσεις των Υπηρεσιών, μόνο με το χέρι
  const duty = isEpop({ rank: f.rank, origin: f.origin }, lists) || EPOP_ROWS.includes(f.hk) || !!c.monthMax;
  const [hkTouched, setHkTouched] = useState(!!c.id); const dirty = useDirty(f);
  const save = async () => { if (await run({ t: 'saveCadre', cadre: { ...f, id: c.id } }, false)) { onClose(); toast({ text: (c.id ? 'Αποθηκεύτηκε: ' : 'Προστέθηκε: ') + rankTxt({ rank: f.rank, origin: f.origin }).toUpperCase() + ' ' + f.last.toUpperCase() + (c.id && c.active !== f.active ? (f.active ? ', σε δύναμη' : ', εκτός δύναμης') : '') }); } };
  const fld = (k: string, label: string, ph = '') => html`<div className="field"><label className="field__label" htmlFor=${'cd-' + k}>${label}</label><input id=${'cd-' + k} className="ui-input" placeholder=${ph} value=${(f as P)[k]} onChange=${(e: any) => setF({ ...f, [k]: e.target.value })}/></div>`;
  return html`<${Dialog} title=${c.id ? 'Στοιχεία στελέχους' : 'Νέο στέλεχος'} onClose=${onClose} dirty=${dirty && 'Τα στοιχεία δεν αποθηκεύτηκαν. Αν κλείσεις, χάνονται.'}
    footer=${html`<${Why} text=${!f.last.trim() && 'Λείπει: Επώνυμο'}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!f.last.trim()} why="Λείπει: Επώνυμο" onClick=${save}>Αποθήκευση<//>`}>
    <div className="field-row"><${ChoiceField} id="cd-rank" label="Βαθμός" value=${f.rank} options=${ranks} placeholder="π.χ. ΛΧΙΑΣ" autoFocus onChange=${(v: string) => setF({ ...f, rank: v, ...(!hkTouched ? { hk: guessHk(v, lists, f.origin) } : {}) })}/>
      <${ChoiceField} id="cd-origin" label="Προέλευση" value=${f.origin} options=${origins} placeholder="π.χ. ΣΜΥ" otherLabel="+ Νέα προέλευση…" otherHelp="Μένει στη λίστα των προελεύσεων για την επόμενη φορά (Ρυθμίσεις › Λίστες)." onChange=${(v: string) => setF({ ...f, origin: v, ...(!hkTouched ? { hk: guessHk(f.rank, lists, v) } : {}) })}/>
      <${ChoiceField} id="cd-spec" label="Ο/Σ" value=${f.spec} options=${specs} placeholder="π.χ. ΤΘ" onChange=${(v: string) => setF({ ...f, spec: v })}/></div>
    <div className="field-row">${fld('last', 'Επώνυμο *')}${fld('first', 'Όνομα')}</div>
    <div className="field-row">${fld('am', 'ΑΜ', 'αριθμός μητρώου')}${fld('phone', 'Τηλέφωνο')}</div>
    <div className="field-row"><${ChoiceField} id="cd-eid" label="Ειδικότητα" value=${f.eid} options=${eids} placeholder="π.χ. ΔΙΟΙΚΗΤΙΚΟΣ" otherLabel="+ Νέα ειδικότητα…" otherHelp="Γράφεται με κεφαλαία και μένει στη λίστα για την επόμενη φορά." onChange=${(v: string) => setF({ ...f, eid: v })}/></div>
    <div className="field-row">${fld('role', 'Θέση', 'π.χ. Διοικητής ' + UNIT().gen)}
      <div className="field"><label className="field__label" htmlFor="cd-hk">Γραμμή στην ${HK()}</label><${Select} id="cd-hk" className="ui-input" value=${f.hk} onChange=${(e: any) => { setHkTouched(true); setF({ ...f, hk: e.target.value }); }}>${hkCadreRows(lists).map(r => html`<option key=${r} value=${r}>${hkRowLabel(r)}</option>`)}<//></div></div>
    ${duty && html`<div className="field"><label className="field__label" htmlFor="cd-mm">Υπηρεσίες τον μήνα (το πολύ)</label><input id="cd-mm" className="ui-input" type="number" min="1" max="31" style=${{ maxWidth: '120px' }} placeholder="π.χ. 4" value=${f.monthMax ?? ''} onChange=${(e: any) => setF({ ...f, monthMax: Math.max(0, Math.floor(+e.target.value)) || undefined })}/><span className="field__help">Με αριθμό μπαίνει στις θέσεις των Υπηρεσιών, μόνο με το χέρι (ποτέ η αυτόματη συμπλήρωση). Πάνω από το όριο ζητά αιτία. Κενό = δεν κάνει υπηρεσίες.</span></div>`}
    <div className="field"><span className="field__label">Όπλο (προαιρετικό)</span><div className="field-row">
      <div className="field"><label className="field__label" htmlFor="cd-wtype">Τύπος</label><${Select} id="cd-wtype" className="ui-input" value=${f.wtype} onChange=${(e: any) => setF({ ...f, wtype: e.target.value })}><option value="">—</option>${wtypes.map((w: string) => html`<option key=${w} value=${w}>${w}</option>`)}<//></div>
      ${fld('weapon', 'Αριθμός όπλου')}${fld('rack', 'Οπλοβ.', 'π.χ. Ε')}${fld('wpos', 'Θέση', 'π.χ. 23')}</div>
      <span className="field__help">Αν μπει σε ένοπλη υπηρεσία, το όπλο του βγαίνει ΕΚΤΟΣ στις ώρες του νούμερου (Οπλισμός › Κινήσεις). Χωρίς αριθμό φαίνεται «Ένοπλη χωρίς όπλο».</span></div>
    ${c.id && html`<label className="field" style=${{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}><input type="checkbox" className="ui-check" checked=${f.active} onChange=${() => setF({ ...f, active: !f.active })}/>
      <span>Σε δύναμη <span className="field__help">(αν φύγει από τη μονάδα, βγάλ' το: μένει στη λίστα «Εκτός δύναμης» και δεν μετρά στην ${HK()})</span></span></label>`}
  <//>`;
}

// Κατάσταση στελέχους = στήλη της ΗΚΑΙ. Μία τη μέρα: αν πέφτει πάνω σε άλλη, ρωτά και η νέα μπαίνει στη θέση της
function StatusDialog({ c, abs, apal, onClose }: P) {
  const { run, today, state } = useStore(); const toast = useToast();
  const lists = state.settings.lists;
  const [f, setF] = useState({ kind: abs?.kind || (apal ? 'apal' : 'ka'), from: abs?.from || today, to: abs?.to || (apal ? today : addDays(today, 4)), note: abs?.note || '' });
  const kinds = cadreAbsKinds(lists);
  // η τωρινή μένει στη λίστα ακόμα κι αν κρύφτηκε στις Ρυθμίσεις
  const opts = abs && !kinds.some(k => k[0] === abs.kind) ? [...kinds, ...cadreAbsKinds(lists, true).filter(k => k[0] === abs.kind)] : kinds;
  const st = cadreStatusOf({ id: '', cid: c.id, ...f }, lists);
  const clash = cadreClash(state, { id: abs?.id, cid: c.id, from: f.from, to: f.to });
  const bad = f.to < f.from; const dirty = useDirty(f);
  // ⚠ άδεια που περνά το υπόλοιπο της χρονιάς, ή απαλλαγή χωρίς απαλλαγές (δεν μπλοκάρει, Michael 17/11)
  const over = useMemo(() => (bad ? [] : leaveOverdraft(state, c.id, { id: abs?.id, ...f })), [state.cadreAbs, state.cadreGrants, state.settings, c.id, abs?.id, f.kind, f.from, f.to, bad]);
  const apalOver = useMemo(() => {
    if (bad || cadreAbsOf(f.kind, lists)?.[0] !== 'apal') return null;
    const rest = state.cadreAbs.filter(a => a.id !== abs?.id && !(a.cid === c.id && a.from <= f.to && f.from <= a.to));
    const left = apalLeft({ ...state, cadreAbs: [...rest, { id: '', cid: c.id, kind: f.kind, from: f.from, to: f.to }] }, c, +f.to.slice(0, 4), today);
    return left < 0 ? left : null;
  }, [state.cadreAbs, state.guards, state.dutyLog, state.cadreGrants, state.settings, c, abs?.id, f.kind, f.from, f.to, bad]);
  const save = async () => {
    const r = await run({ t: 'addCadreAbs', abs: { id: abs?.id, cid: c.id, ...f, note: f.note.trim() || undefined }, replace: clash.length > 0 }, false);
    if (r) { onClose(); toast({ text: rankTxt(c) + ' ' + c.last + ': ' + st.label.toLowerCase() + ' ' + dm(f.from) + (f.to !== f.from ? '–' + dm(f.to) : '') }); }
  };
  const group = (g: CadreGroup) => opts.filter(k => groupOfCol(k[2], state.settings.lists) === g);
  return html`<${Dialog} title=${(abs ? 'Αλλαγή κατάστασης: ' : 'Κατάσταση: ') + rankTxt(c) + ' ' + c.last} onClose=${onClose} dirty=${dirty && 'Η κατάσταση δεν αποθηκεύτηκε. Αν κλείσεις, χάνεται.'}
    footer=${html`<${Why} text=${bad && '«Έως» πριν από «Από»'}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${bad} why="«Έως» πριν από «Από»" onClick=${save}>${clash.length ? 'Αποθήκευση στη θέση της' : 'Αποθήκευση'}<//>`}>
    <div className="field"><label className="field__label" htmlFor="ca-k">Κατάσταση (στήλη της ${HK()})</label><${Select} id="ca-k" className="ui-input" data-autofocus="" value=${f.kind} onChange=${(e: any) => setF({ ...f, kind: e.target.value })}>
      ${(['kol', 'apo', 'list'] as CadreGroup[]).map(g => group(g).length > 0 && html`<optgroup key=${g} label=${g === 'kol' ? 'Κωλυόμενοι' : g === 'apo' ? 'Απόντες' : 'Μόνο στη λίστα'}>${group(g).map(([k, l, col]) => html`<option key=${k} value=${k}>${l}${col ? ' (' + colShort(col) + ')' : ''}</option>`)}</optgroup>`)}<//>
      <span className="field__help">${st.group === 'list' ? 'Δεν μετρά στην ' + HK() + ', φαίνεται μόνο στη λίστα.' : 'Μετρά στην ' + HK() + ' στους ' + (st.group === 'kol' ? 'κωλυόμενους' : 'απόντες') + ', στήλη «' + colShort(st.col, lists) + '», γραμμή «' + hkRowLabel(c.hk) + '».'}</span></div>
    <${DateRangeField} from=${f.from} to=${f.to} onChange=${(from: string, to: string) => setF({ ...f, from, to })}/>
    <div className="field"><label className="field__label" htmlFor="ca-n">Παρατήρηση</label><input id="ca-n" className="ui-input" value=${f.note} onChange=${(e: any) => setF({ ...f, note: e.target.value })}/></div>
    ${over.map(o => html`<${Alert} key=${o.name + o.year} tone="warn"><span>⚠ ${o.name} ${o.year}: θα μείνει ${String(Math.round(o.left * 100) / 100).replace('.', ',')} μέρες (δεν φτάνουν). Αποθηκεύεται κανονικά.</span><//>`)}
    ${apalOver != null && html`<${Alert} tone="warn"><span>⚠ Δεν έχει αρκετές απαλλαγές: θα μείνουν ${apalOver}. Αποθηκεύεται κανονικά.</span><//>`}
    ${clash.length > 0 && html`<${Alert} tone="warn"><span>Έχει ήδη ${clash.map(a => cadreStatusOf(a, lists).label.toLowerCase() + ' ' + range(a)).join(', ')}. Στην ${HK()} μετρά μία κατάσταση τη μέρα: με «Αποθήκευση στη θέση της» η παλιά κόβεται σε αυτές τις μέρες και κρατά τις υπόλοιπες.</span><//>`}
  <//>`;
}
