// features/people και features/status: προσωπικό, καρτέλα ατόμου, δήλωση κατάστασης
import { RkName, rkFull, rkOn, rkShort } from '../rankName';
import { HK, UNIT } from '../../shared/unit';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { destNote, reqWhat } from '../../shared/hkaiText';
import { html, cx, Alert, Badge, Button, Why, missingOf, Dialog, Icon, PageHeader, Segmented, Sheet, SheetNav, Strip, Tabs, VirtualList, useMedia, useSheetNav, useDirty, useToast, useViewportHeight } from '../ui';
import { Select } from '../select';
import { useNav, useOpenFrom, useStore, searchPeople } from '../store';
import { ActiveFilter, ChoiceField, SigsMenu, UnsavedDialog, StatusBadge, timesHelp, TimeField } from '../common';
import type { Sig } from '../../shared/sigs';
import { backBy, hasTimes, normTime, timeNames, timesTxt } from '../../shared/hours';
import { badgeLbl, live, medNote, isAway, listOf, optionsOf, rankTxt, statusLbl, type UserLists } from '../../shared/ranks';
import { TYPES, RECORD_CATS, KIND_LBL, KIND_NAME, blocksOf, plainName, unitOf, roomTxt, platoonsOf, platoonShort, type Cadre, type DutyKind, type Person, type SavedView, type TypeKey, type Status } from '../../shared/domain';
import { notesOn, noteTxt, isEpop, monthTxt, awayNow, statusesAt, baseTotal, dutyBlock, dutyStats, emptyStat, holName, outBlock, personMap, postBy, postsOf, statusesOf, statusesOn, strengthAt } from '../../shared/rules';
import { statIsUnarmed, statNoDuty, STAT_ROWS } from '../../shared/stat';
import { addDays, daysBetween, dayName, dm, dow } from '../../shared/dates';
import { SiField } from './si';
import { RoomField } from './units';
import { QuickAddDialog } from './quickAdd';
import { DeclareStatusDialog } from '../features/declare-status';
import { StatusFixDialog } from '../features/fix-status';
import { LeaveEndDialog, leaveStarted } from '../features/leave-end';
import { siOf, siShort } from '../../shared/si';
import { essoPersonTxt } from '../../shared/esso';
import { ROSTER_FILTERS, currentEssos, filterStatus, rosterMatch, statusKind, type RosterFilter } from '../../shared/rosterLists';
import { collator, normGreek, upper } from '../../shared/text';
import { useRowH } from '../prefs';
import { useNowMin } from '../clock';
import { NoteDot, NotesTab, TodayAlert, notesTabLabel } from './notes';
import { PersonalTab } from './personal';
import { ImerTab } from './imerologio';
import { noteIndex, personGroups, remLine } from '../../shared/notes';
type P = any;

// Δυναμολόγιο (Michael, 17/10): μόνο τα στοιχεία του στρατιώτη, με τις στήλες του Δυναμολογίου. Οι άδειες και οι ποινές
// φαίνονται μόνο στα αντίστοιχα φίλτρα, με μία στήλη ακόμα (τι και από πότε έως πότε)· τα ιατρικά στα «Ιατρικά και ποινές».
const COLS: [string, string][] = [['rank', 'Βαθμός'], ['spec', 'Ο/Σ'], ['last', 'Επίθετο'], ['first', 'Όνομα'], ['father', 'Πατρώνυμο'], ['asm', 'ΑΣΜ'], ['phone', 'Τηλέφωνο'], ['room', 'Θάλαμος'], ['post', 'Πόστο'], ['role', 'Ρόλος'], ['si', 'Σ.Ι.'], ['dn', 'ΔΝ']];
// στις άδειες/ποινές η στήλη της κατάστασης μπαίνει μετά το πατρώνυμο, για να φαίνεται χωρίς κύλιση
const COL_W: Record<string, [string, number]> = { rank: ['100px', 100], spec: ['52px', 52], last: ['minmax(150px,1.6fr)', 150], first: ['minmax(100px,1fr)', 100], father: ['minmax(100px,1fr)', 100], asm: ['84px', 84], phone: ['102px', 102], room: ['76px', 76], post: ['minmax(76px,.7fr)', 76], role: ['minmax(120px,.8fr)', 120], si: ['96px', 96], dn: ['40px', 40] };
// σε στενή οθόνη (π.χ. 1024) φεύγουν Πατρώνυμο και Τηλέφωνο, που φαίνονται στην καρτέλα, για να χωρά ο πίνακας χωρίς κύλιση
const NARROW_HIDE = ['father', 'phone'];
const COL_WN: Record<string, [string, number]> = { rank: ['70px', 70], spec: ['46px', 46], last: ['minmax(110px,1.6fr)', 110], first: ['minmax(76px,1fr)', 76], asm: ['70px', 70], room: ['48px', 48], post: ['minmax(52px,.7fr)', 52], role: ['minmax(64px,.8fr)', 64], si: ['64px', 64], dn: ['38px', 38] };   // χωράει και με ανοιχτό μενού στο 1024 (710px)
const colsOf = (narrow: boolean): [string, string][] => (narrow ? COLS.filter(([k]) => !NARROW_HIDE.includes(k)).map(([k, l]) => [k, k === 'room' ? 'Θάλ.' : l]) : COLS);
const HEAD_KEYS = ['rank', 'spec', 'last', 'first', 'father'];
function gridOf(narrow: boolean, withSt: boolean): [string, number] {
  const ks = colsOf(narrow).map(([k]) => k), head = ks.filter(k => HEAD_KEYS.includes(k)), tail = ks.filter(k => !HEAD_KEYS.includes(k));
  const w = (k: string) => (narrow && COL_WN[k]) || COL_W[k];
  const aa = narrow ? 38 : 44;
  const cols = [aa + 'px', ...head.map(k => w(k)[0]), ...(withSt ? ['minmax(220px,1.6fr)'] : []), ...tail.map(k => w(k)[0])];
  return [cols.join(' '), aa + ks.reduce((a, k) => a + w(k)[1], 0) + (withSt ? 220 : 0) + 18];
}
const stTxt = (st: Status, lists: P) => statusKind(st, lists) + ' · ' + dm(st.from) + (st.open ? ' – χωρίς λήξη' : st.to !== st.from ? '–' + dm(st.to) : '');
const PersonRow = memo(function PersonRow({ p, n, odd, style, grid, st, lists, selected, onOpen, narrow, nm }: P) {
  const si = p.si ? siOf(p, lists).text : '';
  return html`<div className=${cx('ptable__row', odd && 'is-odd', selected && 'is-sel')} style=${{ ...style, gridTemplateColumns: grid }} role="row" tabIndex="0" onClick=${() => onOpen(p.id)} onKeyDown=${(e: any) => { if (e.key === 'Enter') onOpen(p.id); }}>
    <span className="num muted">${n}</span><span data-tip=${rankTxt(p)}>${rankTxt(p)}</span><span>${p.spec}</span><span data-tip=${p.last}><b>${p.last}</b>${nm && html`<${NoteDot} m=${nm}/>`}</span><span data-tip=${p.first}>${p.first}</span>${!narrow && html`<span>${p.father}</span>`}
    ${st && html`<span><${Badge} tone=${TYPES[st.type as TypeKey].tone}>${stTxt(st, lists)}<//></span>`}
    <span className="num">${p.asm}</span>${!narrow && html`<span className="num">${p.phone}</span>`}<span>${p.room ?? ''}</span><span data-tip=${p.post && p.post.length > 9 ? p.post : undefined}>${p.post || ''}</span><span data-tip=${p.role && p.role.length > 9 ? p.role : undefined}>${p.role || ''}</span>
    <span data-tip=${si !== siShort(si) ? si : undefined}>${siShort(si)}</span><span>${p.dn ? '✓' : ''}</span></div>`;
});
const PersonCard = memo(function PersonCard({ p, style, st, lists, onOpen }: P) {
  return html`<div className="pcard" style=${style} onClick=${() => onOpen(p.id)}>
    <div><b><${RkName} p=${p} fn=${plainName} keep=${true}/></b><small>${[p.father && 'του ' + p.father, !rkOn() && p.spec, roomTxt(p), p.phone, p.si && siOf(p, lists).text, p.post && 'πόστο ' + p.post, p.dn && 'ΔΝ'].filter(Boolean).join(' · ')}</small></div>
    ${st && html`<${Badge} tone=${TYPES[st.type as TypeKey].tone}>${stTxt(st, lists)}<//>`}</div>`;
});

type Filt = { unit: string; room: number | null; filter: string };
const DEF_SORT = { k: 'last', dir: 1 };
// φίλτρα αποθηκευμένων λιστών από πριν (Παρόντες, ΕΥ…): ισχύουν ακόμα, απλώς δεν είναι πια κουμπιά
const legacyMatch = (f: string, ss: Status[], lists?: UserLists) => { const away = ss.some(s => isAway(s, lists)); return f === 'present' ? !away : f === 'absent' ? away : (TYPES as any)[f] ? ss.some(s => s.type === f) : true; };
// Δυναμολόγιο: δύο καρτέλες, η Λίστα και το Ημερολόγιο κωλυομένων (imerologio.ts)
export function PeopleScreen() {
  const { state } = useStore(); const nav = useNav(); const tab = nav.params.ptab === 'imer' ? 'imer' : 'list';
  return html`<div><div style=${{ marginBottom: '14px' }}><${Tabs} value=${tab} onChange=${(v: string) => nav.set({ ptab: v === 'imer' ? 'imer' : undefined })} items=${[{ value: 'list', label: 'Λίστα (' + state.people.filter(p => p.active).length + ')' }, { value: 'imer', label: 'Ημερολόγιο κωλυομένων' }]}/></div>
    ${tab === 'imer' ? html`<${ImerTab}/>` : html`<${PeopleList}/>`}</div>`;
}
function PeopleList() {
  const { state, today, run, undoMark } = useStore(); const nav = useNav(); const toast = useToast(); const mobile = useMedia('(max-width: 767px)');
  const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  const marks = useMemo(() => noteIndex(state.notes, today), [state.notes, today]);   // ένδειξη «έχει σημειώσεις» δίπλα στο όνομα
  // φίλτρα στα params της οθόνης, ώστε να τα θυμάται όταν γυρνάς (Shell)
  const filter: string = nav.params.filter || 'all'; const unitP: string = nav.params.unit || 'all';
  // ουλαμός που θυμόταν η οθόνη αλλά δεν υπάρχει πια (άλλαξε όνομα στις Ρυθμίσεις): όλη η Ίλη
  const unit = unitP === 'all' || platoonsOf(state.settings).some(u => platoonShort(u.name) === unitP) ? unitP : 'all'; const room: number | null = nav.params.room ?? null;
  const date: string = nav.params.pdate && nav.params.pdate >= today ? nav.params.pdate : today;
  const sort: { k: string; dir: number } = nav.params.sort || DEF_SORT;
  const setFilter = (f: string) => nav.set({ filter: f }); const setUnit = (u: string) => nav.set({ unit: u, room: room != null && u !== 'all' && unitOf({ room }, state.settings) !== u ? null : room });
  const setRoom = (r: number | null) => nav.set({ room: r, unit: r != null && unit !== 'all' && unitOf({ room: r }, state.settings) !== unit ? 'all' : unit });
  const [saving, setSaving] = useState(false); const [adding, setAdding] = useState<false | 'one' | 'many'>(false); const [xl, setXl] = useState(false);
  // από το τέλος της Νέας ΕΣΣΟ: ανοίγει κατευθείαν η γρήγορη εισαγωγή
  useEffect(() => { if (nav.params.quickAdd) { setAdding(nav.params.quickAdd === 'one' ? 'one' : 'many'); nav.set({ quickAdd: undefined }); } }, [nav.params.quickAdd]);   // και από το Ctrl+K   // eslint-disable-line react-hooks/exhaustive-deps
  // ουλαμοί από τις Ρυθμίσεις › Θάλαμοι και ουλαμοί (προεπιλογή 1–4 → 1ος, 5–8 → 2ος)
  const UNITS = useMemo(() => [{ value: 'all', label: UNIT().all }, ...platoonsOf(state.settings).map(u => ({ value: platoonShort(u.name), label: platoonShort(u.name), tip: u.rooms.length ? 'Θάλαμοι ' + u.rooms.join(', ') : 'Χωρίς θαλάμους' }))], [state.settings.rooms]);
  const days = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(today, i)), [today]);
  const active = useMemo(() => state.people.filter(p => p.active), [state.people]);
  const total = active.length;
  const views = state.settings.views || [];
  const lists = state.settings.lists;
  const withSt = filter === 'leave' || filter === 'pun';
  // καταστάσεις της ημερομηνίας, μία φορά ανά άτομο (με το ευρετήριο των κανόνων)
  // σήμερα: όποιος γύρισε από άδεια ως τώρα είναι πάλι παρών (Michael, 20/10), με την ίδια στιγμή που μετρά το «Σήμερα»
  const nowM = useNowMin(); const at = date === today ? strengthAt(state.rules, date, today, nowM) : -1;
  // ... και ο εξοδούχος/ΔΝ με την ώρα, όπως η Δύναμη (αλλιώς δεν θα συμφωνούσαν οι Παρόντες του «Σήμερα» με αυτή τη λίστα)
  const ssOf = useMemo(() => { const m = new Map<number, Status[]>(); active.forEach(p => m.set(p.id, date === today ? statusesAt(state, p.id, date, at) : statusesOn(live(state), p.id, date))); return m; }, [active, state, date, today, at]);
  const place = (p: Person, f: Filt) => (f.unit === 'all' || unitOf(p, state.settings) === f.unit) && (f.room == null || p.room === f.room);
  const matches = useCallback((p: Person, f: Filt) => {
    if (!place(p, f)) return false;
    const ss = ssOf.get(p.id) || [];
    return ROSTER_FILTERS.some(([k]) => k === f.filter) ? rosterMatch(f.filter as RosterFilter, p, ss) : p.active && legacyMatch(f.filter, ss, state.settings.lists);
  }, [ssOf, state.settings.rooms]);
  const listFor = useCallback((f: Filt, text: string) => (f.filter === 'inactive' ? state.people.filter(p => !p.active).sort((a, b) => collator.compare(a.last, b.last)) : searchPeople(state.people, text)).filter(p => matches(p, f)), [state.people, matches]);
  // πόσοι ταιριάζουν σε κάθε φίλτρο (στον επιλεγμένο ουλαμό/θάλαμο), για να φαίνεται πριν πατήσεις
  const counts = useMemo(() => {
    const n: Record<string, number> = {};
    state.people.forEach(p => {
      if (!place(p, { unit, room, filter: 'all' })) return;
      const ss = ssOf.get(p.id) || [];
      for (const [k] of ROSTER_FILTERS) if (rosterMatch(k, p, ss)) n[k] = (n[k] || 0) + 1;
    });
    return n;
  }, [state.people, ssOf, unit, room, state.settings.rooms]);
  const rooms = useMemo(() => { const m = new Map<number, number>(); active.forEach(p => { if (p.room != null) m.set(p.room, (m.get(p.room) || 0) + 1); }); return [...m].sort((a, b) => a[0] - b[0]); }, [active]);
  const viewN = useMemo(() => views.map(v => listFor(v, v.q).length), [views, listFor]);
  const curView = views.find(v => v.unit === unit && v.room === room && v.filter === filter && normGreek(v.q) === normGreek(dq.trim()));
  const rows = useMemo(() => {
    let r = listFor({ unit, room, filter }, dq);
    const val = (p: Person) => sort.k === 'room' ? String(p.room ?? 99).padStart(2, '0') : sort.k === 'dn' ? (p.dn ? '0' : '1') : sort.k === 'si' ? siOf(p, lists).text : String((p as any)[sort.k] ?? '');
    if (!dq || sort.k !== 'last' || sort.dir !== 1) r = [...r].sort((a, b) => (collator.compare(val(a), val(b)) || collator.compare(a.last, b.last) || collator.compare(a.first, b.first)) * sort.dir);
    return r;
  }, [dq, filter, unit, room, sort, listFor, lists]);
  const stOf = (p: Person) => (withSt ? filterStatus(filter as RosterFilter, ssOf.get(p.id) || []) : undefined);
  const open = useOpenFrom(rows);
  const height = useViewportHeight(mobile ? 380 : 350);
  const rowH = useRowH(40, 32);
  const H = (k: string, l: string) => html`<button key=${k} type="button" aria-sort=${sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'} onClick=${() => nav.set({ sort: sort.k === k ? { k, dir: -sort.dir } : { k, dir: 1 } })}>${l}${sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button>`;
  const clear = () => { setQ(''); nav.set({ filter: 'all', unit: 'all', room: null, pdate: undefined }); };
  const applyView = (v: SavedView) => { if (curView === v) { clear(); return; } setQ(v.q); nav.set({ unit: v.unit, room: v.room, filter: v.filter }); };
  const delView = async (v: SavedView) => { if (await run({ t: 'setSettings', settings: { views: views.filter(x => x.id !== v.id) }, text: 'διαγραφή λίστας «' + v.name + '»' }, false)) toast({ text: 'Διαγράφηκε η λίστα «' + v.name + '»', actions: [undoMark()] }); };
  const dateLbl = date === today ? '' : dayName(date, today);
  const filtered = unit !== 'all' || room != null || filter !== 'all' || !!dq.trim();
  const fLabel = (ROSTER_FILTERS.find(([k]) => k === filter) || [, filter])[1];
  // sigs: υπογραφές μόνο για αυτή τη φορά («Υπογραφές…»)
  const exportXl = async (sigs?: Sig[]) => {
    setXl(true);
    try {
      const r = await window.api.exportLists(date, sigs);
      toast({ text: r.ok ? 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': ένα φύλλο για κάθε φίλτρο, ' + (date === today ? 'για σήμερα.' : 'για ' + dayName(date, today).toLowerCase() + ' ' + dm(date) + '.') : html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
    } finally { setXl(false); }
  };
  // Συνολικό Δυναμολόγιο με την κεφαλίδα της ΗΚΑΙ, για εκτύπωση (Michael, 17/10)
  const printRoster = async (sigs?: Sig[]) => {
    setXl(true);
    try {
      const r = await window.api.exportRoster(today, true, sigs);
      if (!r.ok) toast({ text: html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
      else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
    } finally { setXl(false); }
  };
  const dateSel = html`<${Select} className="ui-select" aria-label="Άδειες και ποινές στην ημερομηνία" data-tip="Οι άδειες και οι ποινές αυτής της μέρας, και στο Excel" value=${date} onChange=${(e: any) => nav.set({ pdate: e.target.value === today ? undefined : e.target.value })}>${days.map(d => html`<option key=${d} value=${d}>${dayName(d, today)}</option>`)}<//>`;
  const narrow = useMedia('(max-width: 1279px)');
  const [grid, gridMin] = gridOf(narrow, withSt); const cols = colsOf(narrow);
  return html`<div>
    <${PageHeader} title="Δυναμολόγιο" sub=${'Δύναμη ' + UNIT().gen + ': ' + total + ' άτομα. Πάτα ένα όνομα για την καρτέλα του.'}>
      <${Button} variant="outline" onClick=${() => setAdding('one')} data-tip="Γράφεται και στο Δυναμολόγιο, αν έχει οριστεί στα Αρχεία Excel">${narrow ? '+ Στρατιώτης' : '+ Νέος στρατιώτης'}<//>
      <${Button} variant="outline" onClick=${() => nav.go('templates', { tab: 'import' })} data-tip="Από το Excel του Δυναμολογίου (Ρυθμίσεις › Εισαγωγή Δυναμολογίου)">${narrow ? 'Εισαγωγή' : 'Εισαγωγή Δυναμολογίου'}<//>
      <${Button} variant="outline" disabled=${xl} onClick=${() => exportXl()} data-tip="Ένα Excel με ένα φύλλο για κάθε φίλτρο: Δυναμολόγιο, Άδειες, Τιμωρημένοι, Πόστα, Εκτός δύναμης, Δικαίωμα ΔΝ">${xl ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>
      <${Button} variant="outline" disabled=${xl} onClick=${() => printRoster()} aria-label="Εκτύπωση" data-tip="Συνολικό Δυναμολόγιο (όλοι σε δύναμη) με την κεφαλίδα της ${HK()}· βγαίνει και Excel">${Icon.print}${!narrow && 'Εκτύπωση'}<//>
      <${SigsMenu} form="roster" date=${today} label="το Δυναμολόγιο" disabled=${xl} go=${(pr: boolean, sigs?: Sig[]) => (pr ? printRoster(sigs) : exportXl(sigs))}/>
      <${Button} onClick=${() => nav.declare({})} data-tip="Ιατρικά, άδεια, έξοδος, ΔΝ, ποινή… (Ctrl+N)" data-tip-side="left">${narrow ? '+ Κατάσταση' : '+ Δήλωσε κατάσταση'}<//><//>
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση στη λίστα" placeholder="Όνομα, ΑΣΜ, βαθμός, ρόλος, πόστο, ΕΣΣΟ (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${Segmented} small=${true} value=${unit} onChange=${setUnit} items=${UNITS}/>
      <${Select} className="ui-select" aria-label="Θάλαμος" value=${room == null ? '' : String(room)} onChange=${(e: any) => setRoom(e.target.value ? +e.target.value : null)}>
        <option value="">Όλοι οι θάλαμοι</option>${rooms.map(([r, n]) => html`<option key=${r} value=${String(r)}>Θάλαμος ${r} · ${n}</option>`)}<//>
      ${dateSel}</div>
    <div className="filters"><${Strip} role="group" aria-label="Γρήγορα φίλτρα">${ROSTER_FILTERS.map(([k, l]) => html`<button key=${k} type="button" className="ui-chip" aria-pressed=${!curView && filter === k} data-tip=${k === 'leave' || k === 'pun' ? (k === 'leave' ? 'Σε άδεια ' : 'Με ποινή ') + (dateLbl ? dateLbl.toLowerCase() : 'σήμερα') : undefined} onClick=${() => setFilter(filter === k && k !== 'all' ? 'all' : k)}>${l}<span className="cnt">${counts[k] || 0}</span></button>`)}
      ${views.map((v, i) => html`<button key=${v.id} type="button" className=${cx('ui-chip', 'ui-chip--view', i === 0 && 'ui-chip--gap')} aria-pressed=${curView === v} data-tip="Αποθηκευμένη λίστα" onClick=${() => applyView(v)}>${Icon.star}${v.name}<span className="cnt">${viewN[i]}</span></button>`)}<//>
      <${ActiveFilter} parts=${curView ? ['★ ' + curView.name] : [unit !== 'all' && unit, room != null && 'Θάλαμος ' + room, filter !== 'all' && fLabel, withSt && dateLbl, dq.trim() && '«' + dq.trim() + '»']} onClear=${clear}
        extra=${curView ? html`<button type="button" className="actfilter__act" onClick=${() => delView(curView)} data-tip="Σβήνει τη λίστα (όχι τους ανθρώπους)">Διαγραφή λίστας</button>` : filtered && html`<button type="button" className="actfilter__act" onClick=${() => setSaving(true)} data-tip="Κράτα αυτό το φίλτρο ως λίστα με όνομα, π.χ. «Θαλαμάρχες»">☆ Αποθήκευση</button>`}/>
      <span className="toolbar__count">${rows.length} από ${filter === 'inactive' ? counts.inactive || 0 : total}</span></div>
    ${rows.length === 0 ? html`<div className="ui-card empty">${total === 0 ? html`Δεν υπάρχει ακόμα προσωπικό. <${Button} variant="link" onClick=${() => setAdding('many')}>Γράψε τους στρατιώτες τον έναν μετά τον άλλον<//> ή <${Button} variant="link" onClick=${() => nav.go('templates', { tab: 'import' })}>κάνε εισαγωγή από το Δυναμολόγιο<//>` : html`Κανείς δεν ταιριάζει. <${Button} variant="link" onClick=${clear}>Καθάρισε αναζήτηση και φίλτρα<//>`}</div>` :
    mobile ? html`<div className="ui-card" style=${{ overflow: 'hidden' }}><${VirtualList} items=${rows} rowHeight=${68} height=${height} renderRow=${(p: Person, _i: number, style: P) => html`<${PersonCard} key=${p.id} p=${p} style=${style} st=${stOf(p)} lists=${lists} onOpen=${open}/>`}/></div>` :
    html`<div className="ptable ptable--roster" role="table" aria-rowcount=${rows.length}><div style=${{ overflowX: 'auto' }}><div style=${{ minWidth: gridMin + 'px' }}>
      <div className="ptable__head" role="row" style=${{ gridTemplateColumns: grid }}><span>Α/Α</span>${cols.filter(([k]) => HEAD_KEYS.includes(k)).map(([k, l]) => H(k, l))}${withSt && html`<span>${filter === 'leave' ? 'Άδεια' : 'Ποινή'}</span>`}${cols.filter(([k]) => !HEAD_KEYS.includes(k)).map(([k, l]) => H(k, l))}</div>
      <${VirtualList} items=${rows} rowHeight=${rowH} height=${height} resetKey=${filter + '|' + unit + '|' + room + '|' + dq + '|' + sort.k + sort.dir} renderRow=${(p: Person, i: number, style: P) => html`<${PersonRow} key=${p.id} p=${p} n=${i + 1} odd=${i % 2 === 1} style=${style} grid=${grid} narrow=${narrow} st=${stOf(p)} lists=${lists} selected=${nav.params.person === p.id} nm=${marks.get('p' + p.id)} onOpen=${open}/>`}/>
    </div></div></div>`}
    ${adding === 'one' && html`<${NewPersonDialog} onClose=${() => setAdding(false)} onMany=${() => setAdding('many')}/>`}
    ${adding === 'many' && html`<${QuickAddDialog} onClose=${() => setAdding(false)}/>`}
    ${saving && html`<${SaveViewDialog} onClose=${() => setSaving(false)} onSave=${async (name: string) => {
      const v: SavedView = { id: Date.now().toString(36), name, unit, room, filter, q: dq.trim() };
      if (await run({ t: 'setSettings', settings: { views: [...views, v] }, text: 'αποθηκευμένη λίστα «' + name + '»' }, false)) { setSaving(false); toast({ text: 'Αποθηκεύτηκε η λίστα «' + name + '». Τη βρίσκεις στη γραμμή φίλτρων.' }); }
    }}/>`}
  </div>`;
}

export function SaveViewDialog({ onClose, onSave }: P) {
  const [name, setName] = useState('');
  const ok = name.trim().length > 0;
  return html`<${Dialog} title="Αποθήκευση λίστας" description="Το φίλτρο που βλέπεις γίνεται κουμπί στη γραμμή φίλτρων, με τον αριθμό ατόμων πάντα ενημερωμένο." onClose=${onClose}
    footer=${html`<${Why} text=${!ok && 'Λείπει: Όνομα'}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} why="Λείπει: Όνομα" onClick=${() => ok && onSave(name.trim())}>Αποθήκευση<//>`}>
    <div className="field"><label className="field__label" htmlFor="sv-n">Όνομα *</label><input id="sv-n" className="ui-input" data-autofocus="" maxLength="30" placeholder="π.χ. Θαλαμάρχες, Οδηγοί, ΕΣΣΟ Γ΄" value=${name} onChange=${(e: any) => setName(e.target.value)} onKeyDown=${(e: any) => { if (e.key === 'Enter' && ok) onSave(name.trim()); }}/></div>
  <//>`;
}

const SHEET_TABS = [{ value: 'info', label: 'Στοιχεία' }, { value: 'duty', label: 'Υπηρεσίες' }, { value: 'hist', label: 'Ιστορικό' }, { value: 'notes', label: 'Σημειώσεις' }, { value: 'pers', label: 'Προσωπικά' }];
// list: η λίστα από την οποία άνοιξε η καρτέλα (Δυναμολόγιο με τα φίλτρα του, Οπλισμός, Εξοδούχοι…)· αλλιώς όλοι σε δύναμη αλφαβητικά
export function PersonSheet({ pid, list, onMove, onClose }: P) {
  const { state, today, run } = useStore(); const nav = useNav(); const toast = useToast();
  const p = personMap(state.people).get(pid);
  const [edit, setEdit] = useState(false);
  const [fix, setFix] = useState<Status | null>(null);
  const [times, setTimes] = useState<Status | null>(null);
  const [end, setEnd] = useState<Status | null>(null);
  const [tab, setTab] = useState('info');
  const order: number[] = useMemo(() => list || state.people.filter(x => x.active || x.id === pid).sort((a, b) => collator.compare(a.last, b.last) || collator.compare(a.first, b.first)).map(x => x.id), [list, state.people]);   // eslint-disable-line react-hooks/exhaustive-deps
  const busy = edit || !!times || !!end;
  const { at, n: total, move } = useSheetNav(order, pid, onMove, busy);
  const nowM = useNowMin();
  useEffect(() => { setEdit(false); setTimes(null); setEnd(null); setFix(null); const b = document.querySelector('.ui-sheet__body'); if (b) b.scrollTop = 0; }, [pid]);
  if (!p) return null;
  const ng = personGroups(state.notes, { pid }, today); const rem = remLine(state.notes, { pid }, today);
  const reqs = state.requests.filter(r => r.pid === pid).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const posts = postsOf(state.settings);
  const hist = [...statusesOf(state.statuses, pid)].sort((a, b) => b.from.localeCompare(a.from));
  const dd = dutyStats(state).get(pid) || emptyStat();
  const duties = dd.log.slice().reverse().slice(0, 40).map(e => ({ d: e.d, x: e.k ? posts.find(q => q.k === e.k) || postBy(state, e.k) : undefined, kind: e.kind, h: e.h }));
  const ob = outBlock(state, today, pid);
  // ΕΑ/ΕΥ/ΕΟ/ΕΑΡΒ/ΣΤΕΠ όπως ορίζει ο πίνακας καταστάσεων· οι άλλες (άδειες, έξοδοι) όπως πριν
  const lists = state.settings.lists; const bl = (blocksOf(state.settings) || state.settings.blocks).filter(b => !b.hidden);
  const ssT = statusesOn(live(state), pid, today).filter(x => STAT_ROWS.includes(x.type)); const rest = statusesOf(live(state), pid).filter(x => !STAT_ROWS.includes(x.type) && !backBy(x, today, nowM));   // γύρισε σήμερα ως τώρα: όχι πια «καμία υπηρεσία»
  const noDutyT = ssT.some(x => statNoDuty(x, bl, lists)) || !!dutyBlock(rest, today, pid, { armed: false }, lists);
  const unarmedT = ssT.some(x => statIsUnarmed(x, bl.filter(b => b.kind !== 'ly'), lists)) || !!dutyBlock(rest, today, pid, { armed: true }, lists);
  const rules = [noDutyT ? 'Καμία υπηρεσία' : unarmedT ? 'Μόνο άοπλες θέσεις' : null, ob ? 'Δεν βγαίνει έξοδο (' + ob + ')' : null].filter(Boolean);
  const hn = notesOn(state, pid, today);   // «Σημειώσεις υγείας» (Michael, 4/11)
  const si = p.si ? siOf(p, lists) : null;
  // Η καρτέλα (Michael, 17/10): ό,τι έχει το Δυναμολόγιο για τον στρατιώτη, οι υπηρεσίες του (σύνολο, με τις αργίες/ΣΚ από κάτω),
  // το ημερολόγιο υπηρεσιών και το ιστορικό καταστάσεων. Το «Τι κάνει» είναι πλέον στις Υπηρεσίες, η ΕΣΣΟ πάνω δεξιά.
  return html`<${Sheet} onClose=${onClose} actions=${html`<${SheetNav} at=${at} n=${total} move=${move}/>`} title=${html`<h2 style=${{ fontSize: '18px' }}><${RkName} p=${p} fn=${plainName} keep=${true}/></h2>`} subtitle=${html`<div className="muted" style=${{ fontSize: '13px' }}>του ${p.father || '—'} · ${rkOn() ? '' : rankTxt(p) + ' · '}${unitOf(p, state.settings)}${p.active ? '' : ' · ΕΚΤΟΣ ΔΥΝΑΜΗΣ'}</div><div style=${{ marginTop: '6px' }}><${StatusBadge} statuses=${state.statuses} pid=${pid} date=${today} lists=${state.settings.lists}/></div>`}>
    <${TodayAlert} rules=${rules} rem=${rem} onRem=${() => setTab('notes')}/>
    ${hn.length > 0 && html`<div className="healthnote"><b>Σημειώσεις υγείας:</b> ${hn.map(x => noteTxt(x, lists)).join(' · ')}</div>`}
    <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><${Button} onClick=${() => nav.declare({ pids: [pid] })}>Δήλωσε κατάσταση<//><${Button} variant="outline" onClick=${() => setEdit(true)}>Διόρθωση στοιχείων<//></div>
    <${Tabs} value=${tab} onChange=${(t: string) => nav.guard(() => setTab(t))} items=${SHEET_TABS.map(t => ({ ...t, label: t.value === 'duty' ? t.label + ' (' + dd.total + ')' : t.value === 'hist' ? t.label + ' (' + hist.length + ')' : t.value === 'notes' ? notesTabLabel(ng) : t.label }))}/>
    ${tab === 'info' && html`
    <dl className="kv"><dt>Βαθμός</dt><dd>${p.rank || '—'}</dd><dt>Προέλευση</dt><dd>${p.origin || '—'}</dd><dt>Ο/Σ</dt><dd>${p.spec || '—'}</dd><dt>Επίθετο</dt><dd>${p.last || '—'}</dd><dt>Όνομα</dt><dd>${p.first || '—'}</dd><dt>Πατρώνυμο</dt><dd>${p.father || '—'}</dd>
      <dt>ΑΣΜ</dt><dd className="num">${p.asm || '—'}</dd><dt>Τηλέφωνο</dt><dd className="num">${p.phone || '—'}</dd><dt>Θάλαμος</dt><dd>${roomTxt(p)} <span className="muted" style=${{ fontSize: '12px' }}>(${unitOf(p, state.settings)})</span></dd>
      <dt>Πόστο</dt><dd>${p.post || '—'}</dd><dt>Ρόλος</dt><dd>${p.role || '—'}</dd><dt><abbr data-tip="Σωματική ικανότητα (από το Δυναμολόγιο)">Σ.Ι.</abbr></dt><dd>${si ? si.text : '—'}${si && p.siCat && si.cat ? ' · ' + si.cat : ''}</dd>
      ${isEpop(p, lists) && html`<dt>Υπηρεσίες τον μήνα</dt><dd>${monthTxt(state, today, p, true)} <span className="muted" style=${{ fontSize: '12px' }}>(ΕΠΟΠ/ΟΒΑ: μόνο με το χέρι)</span></dd>`}
      <dt>Δικαίωμα ΔΝ</dt><dd><label className="kv__check"><input type="checkbox" className="ui-check" checked=${!!p.dn} onChange=${async (e: any) => { const dn = e.target.checked; if (await run({ t: 'updatePerson', person: { ...p, dn } }, false)) toast({ text: rkShort(p) + (dn ? ' έχει δικαίωμα ΔΝ' : ' δεν έχει δικαίωμα ΔΝ') }); }}/><span>${p.dn ? 'Ναι' : 'Όχι'}</span></label></dd>
      ${p.notes && html`<dt>Σημ. Δυναμολογίου</dt><dd>${p.notes}</dd>`}
    </dl>
    `}
    ${tab === 'duty' && html`
    <dl className="kv"><dt>Υπηρεσίες</dt><dd className="num">${dd.total}</dd><dt className="kv__sub">Αργίες / ΣΚ</dt><dd><span className="num">${dd.hol}</span>${dd.lastHol && html` <span className="muted" style=${{ fontSize: '12px' }}>τελευταία ${holName(state.settings, dd.lastHol)} ${dm(dd.lastHol)}</span>`}</dd></dl>
    <section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Ημερολόγιο υπηρεσιών <span className="muted" style=${{ fontWeight: 400, fontSize: '13px' }}>(τελευταίες 40)</span></h3>${duties.length ? html`<ul className="hist">${duties.map(({ d, x, kind, h }) => html`<li key=${d + (x?.k || kind)}><span className="num">${dow(d)} ${dm(d)}</span>${x ? x.label : KIND_NAME[kind] + ' χωρίς θέση (από Excel)'}${h && html` <${Badge} tone="warn">${holName(state.settings, d)}<//>`}</li>`)}</ul>` : html`<span className="muted">Καμία υπηρεσία ακόμα.</span>`}</section>
    `}
    ${tab === 'hist' && html`
    <section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Καταστάσεις</h3>${hist.length ? html`<ul className="hist">${hist.map((s: Status) => html`<li key=${s.id}>${medNote(s, lists) ? html`<${Badge} tone="note">${badgeLbl(s, lists) + ' · σημείωση'}<//>` : html`<${Badge} tone=${TYPES[s.type].tone}>${badgeLbl(s, state.settings.lists)}<//>`}<span className="num">${dow(s.from)} ${dm(s.from)}${s.open ? ' – χωρίς λήξη' : s.to !== s.from ? ' – ' + dow(s.to) + ' ' + dm(s.to) : ''}</span><span className="muted">(${daysBetween(s.from, s.to)} ημ.${timesTxt(s) ? ', ' + timesTxt(s) : ''}${s.dest ? ', → ' + s.dest : ''})</span>${hasTimes(s.type) && !s.pending && s.to >= today && html`<${Button} variant="link" onClick=${() => setTimes(s)} data-tip=${'Ώρα ' + timeNames(s.type).fromG + ' την πρώτη μέρα και ώρα ' + timeNames(s.type).toG + ' την τελευταία'}>Ώρες…<//>`}${TYPES[s.type].cat === 'abs' && awayNow(s, today, nowM) && html`<${Button} variant="link" onClick=${() => setEnd(s)} data-tip=${leaveStarted(s, today) ? 'Γύρισε νωρίτερα: η άδεια τελειώνει τη μέρα και ώρα που λες' : 'Δεν θα φύγει: η άδεια φεύγει ολόκληρη'}>${leaveStarted(s, today) ? 'Λήξη νωρίτερα…' : 'Ακύρωση…'}<//>`}${(RECORD_CATS.includes(TYPES[s.type].cat) || s.type === 'KOL' || TYPES[s.type].cat === 'abs') && html`<${Button} variant="link" onClick=${() => setFix(s)} data-tip=${TYPES[s.type].cat === 'abs' ? 'Μπήκε λάθος; Άλλαξε είδος, ημερομηνίες, ώρες και κατεύθυνση' : 'Μπήκε λάθος; Άλλαξε ημερομηνίες και στοιχεία ή διάγραψέ το'}>Διόρθωση…<//>`}${s.pending && html`<${Badge} tone="warn">αιτείται<//>`}${s.to < today && RECORD_CATS.includes(TYPES[s.type].cat) && html`<span className="muted" style=${{ fontSize: '12px' }}>έληξε</span>`}</li>`)}</ul>` : html`<span className="muted">Καμία καταχώρηση ακόμα.</span>`}</section>
    ${reqs.length > 0 && html`<section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Αιτήσεις</h3><ul className="hist">${reqs.map(r => html`<li key=${r.id}><span className="num">${dow(r.date)} ${dm(r.date)}</span>αιτείται ${upper(reqWhat(r, state.settings.lists))}${r.decision && html` <${Badge} tone=${r.decision === 'ok' ? 'ok' : 'bad'}>${r.decision === 'ok' ? 'εγκρίθηκε' : 'απορρίφθηκε'}<//>`}${r.leave && r.decision === 'ok' && !(r.sid && state.statuses.some(x => x.id === r.sid)) && html` <${Badge} tone="bad">η άδεια ακυρώθηκε<//>`}${!r.decision && html` <${Badge} tone=${r.old ? 'outline' : 'warn'}>${r.old ? 'χωρίς απάντηση (παλιά)' : 'περιμένει'}<//>`}<${Button} variant="link" onClick=${() => nav.go('hkai', { hkaiDate: r.date })}>${HK()}<//></li>`)}</ul></section>`}
    `}
    ${tab === 'notes' && html`<${NotesTab} key=${pid} who=${{ pid }}/>`}
    ${tab === 'pers' && html`<${PersonalTab} key=${pid} who=${{ pid }} rec=${p}/>`}
    ${edit && html`<${EditPersonDialog} p=${p} onClose=${() => setEdit(false)}/>`}
    ${times && html`<${LeaveTimesDialog} st=${times} onClose=${() => setTimes(null)}/>`}
    ${end && html`<${LeaveEndDialog} st=${end} onClose=${() => setEnd(null)}/>`}
    ${fix && html`<${StatusFixDialog} st=${fix} onClose=${() => setFix(null)}/>`}
  <//>`;
}

// Ώρες μιας άδειας (νοσοκομείου, ΣΤΕΠ) που υπάρχει ήδη (π.χ. ήρθε από το Excel χωρίς ώρες)
export function LeaveTimesDialog({ st, onClose }: P) {
  const { state, run, undoMark } = useStore(); const toast = useToast();
  const p = personMap(state.people).get(st.pid)!;
  const tn = timeNames(st.type), what = TYPES[st.type as TypeKey].cat === 'abs' ? 'άδειας' : TYPES[st.type as TypeKey].label;
  const [f, setF] = useState({ fromTime: st.fromTime || '', toTime: st.toTime || '', dest: st.dest || '' });
  const abs = TYPES[st.type as TypeKey].cat === 'abs';
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const a = normTime(f.fromTime), b = normTime(f.toTime);
    if (a == null || b == null) { setErr('Η ώρα ' + (a == null ? tn.fromG : tn.toG) + ' δεν διαβάζεται. Γράψε π.χ. 14:00 ή άφησέ την κενή.'); return; }
    if (!(await run({ t: 'setTimes', id: st.id, fromTime: a, toTime: b, ...(abs ? { dest: f.dest } : {}) }, false))) return;
    onClose(); toast({ text: 'Ώρες ' + what + ' ' + rkShort(p) + ': ' + (timesTxt({ type: st.type, fromTime: a, toTime: b, open: st.open }) || 'χωρίς ώρες') + (abs && f.dest.trim() ? ' · κατεύθυνση ' + f.dest.trim() : ''), actions: [undoMark()] });
  };
  return html`<${Dialog} title=${abs ? 'Ώρες και κατεύθυνση' : 'Ώρες ' + what} description=${rkFull(p) + ' · ' + statusLbl(st, state.settings.lists) + ' ' + dm(st.from) + (st.to !== st.from ? '–' + dm(st.to) : '')} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
    <div className="field-row">
      <${TimeField} id="lt-out" label=${'Ώρα ' + tn.fromG} value=${f.fromTime} onChange=${(v: string) => { setF({ ...f, fromTime: v }); setErr(null); }} help=${dow(st.from) + ' ' + dm(st.from)}/>
      ${!st.open && html`<${TimeField} id="lt-in" label=${'Ώρα ' + tn.toG} value=${f.toTime} onChange=${(v: string) => { setF({ ...f, toTime: v }); setErr(null); }} help=${dow(st.to) + ' ' + dm(st.to)}/>`}
    </div>
    <span className="field__help">${timesHelp(state.rules, state.settings)} Υπηρεσίες που δεν γίνονται πια με τις νέες ώρες αδειάζουν.</span>
    ${abs && html`<div className="field"><label className="field__label" htmlFor="lt-dest">Κατεύθυνση (προαιρετικό)</label><input id="lt-dest" className="ui-input" placeholder="π.χ. Κόρινθος" value=${f.dest} onChange=${(e: any) => { setF({ ...f, dest: e.target.value }); setErr(null); }}/><span className="field__help">${destNote(st, f.dest, state.settings.lists)}</span></div>`}
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
}

// Υπηρεσίες πριν από την εφαρμογή: δεν γράφονται πια με το χέρι (Michael, 17/10: η ΕΣΣΟ ξεκινά από την αρχή).
// Όσες υπάρχουν ήδη μετρούν ακόμα· ο έλεγχος από κάτω τις μηδενίζει.
const BASE_KINDS: DutyKind[] = ['th', 'op', 'sk', 'mg', 'ly', 'tae', 'other'];

// Μία φορά μετά την αναβάθμιση στους κωδικούς θέσεων: οι παλιές «προηγούμενες υπηρεσίες» μπορεί να είναι διπλομετρημένες,
// γιατί κάθε ανάγνωση του ελέγχου υπηρεσιών πρόσθετε εκεί όσους δεν χωρούσαν σε θέση
export { needsBaselineReview } from './baselineReview';
export function BaselineReviewDialog({ onClose }: P) {
  const { state, run } = useStore(); const toast = useToast();
  const pm = personMap(state.people);
  const ids = useMemo(() => Object.keys(state.baseline).map(Number).filter(id => { const b = state.baseline[id]; return baseTotal(b) > 0 || (b?.hol || 0) > 0; })
    .sort((a, b) => collator.compare(pm.get(a)?.last || '', pm.get(b)?.last || '')), []);
  const [rows, setRows] = useState<Record<number, Record<string, number>>>(() => Object.fromEntries(ids.map(id => [id, { ...(state.baseline[id] || {}) } as Record<string, number>])));
  const cols = [...BASE_KINDS.filter(k => ids.some(id => (state.baseline[id] as any)?.[k])), 'hol'];
  const set = (id: number, k: string, v: number) => setRows({ ...rows, [id]: { ...rows[id], [k]: Math.max(0, v || 0) } });
  const save = async (baselines: Record<number, Record<string, number>>, text: string) => { if (await run({ t: 'setBaselines', baselines }, false)) { onClose(); toast({ text }); } };
  return html`<${Dialog} size="lg" title="Έλεγχος προηγούμενων υπηρεσιών" onClose=${onClose}
    description="Μέχρι τώρα η ανάγνωση του ελέγχου υπηρεσιών πρόσθετε εδώ όσους δεν χωρούσαν σε θέση, και κάθε ξαναδιάβασμα τους ξαναπρόσθετε. Τώρα αυτές οι υπηρεσίες μπαίνουν με την ημερομηνία τους. Αν δεν τις έγραψες με το χέρι, μηδένισέ τες και ξαναδιάβασε τους μήνες από τα Αρχεία Excel."
    footer=${html`<${Button} variant="outline" onClick=${() => save(Object.fromEntries(ids.map(id => [id, state.baseline[id] as any])), 'Οι προηγούμενες υπηρεσίες έμειναν όπως ήταν')}>Κράτα όπως είναι<//><${Button} variant="outline" onClick=${() => setRows(Object.fromEntries(ids.map(id => [id, {}])))}>Μηδένισε όλες<//><${Button} onClick=${() => save(rows, 'Αποθηκεύτηκαν οι προηγούμενες υπηρεσίες')}>Αποθήκευση<//>`}>
    <div className="xl__scroll" style=${{ maxHeight: '52vh' }}><table className="mapgrid basegrid">
      <thead><tr><th>Άτομο</th>${cols.map(k => html`<th key=${k}>${k === 'hol' ? 'ΣΚ/αργ.' : KIND_LBL[k as DutyKind]}</th>`)}</tr></thead>
      <tbody>${ids.map(id => { const p = pm.get(id); return html`<tr key=${id}><td>${p ? rkShort(p) : 'Άτομο ' + id}</td>${cols.map(k => html`<td key=${k}><input className="ui-input" type="number" min="0" aria-label=${(p ? rkShort(p) : '') + ' ' + (k === 'hol' ? 'ΣΚ/αργία' : KIND_NAME[k as DutyKind])} value=${rows[id]?.[k] || ''} placeholder="0" onChange=${(e: any) => set(id, k, +e.target.value)}/></td>`)}</tr>`; })}</tbody>
    </table></div>
    <p className="muted" style=${{ fontSize: '13px', marginTop: '8px' }}>Αν κλείσεις το παράθυρο, θα ξαναβγεί την επόμενη φορά.</p>
  <//>`;
}

// Πού πάει μια αλλαγή στοιχείων: και στο Δυναμολόγιο, αν έχει οριστεί στα Αρχεία Excel και η εφαρμογή γράφει εκεί
function rosterNote(state: P, isNew: boolean): string {
  const b = state.settings.sources?.people;
  if (!b || b.write === false) return isNew ? 'Μένει μόνο στην εφαρμογή: δεν έχει οριστεί Δυναμολόγιο στα Αρχεία Excel για να γραφτεί και εκεί.' : 'Αλλάζει μόνο στην εφαρμογή. Στην επόμενη εισαγωγή Δυναμολογίου θα πάρει τις τιμές του αρχείου.';
  const at = b.file.split(/[\\/]/).pop() + ' › ' + b.sheet;
  return isNew ? 'Γράφεται και στο Δυναμολόγιο (' + at + '), σε νέα γραμμή κάτω από τον τελευταίο.' : 'Βαθμός, προέλευση, Ο/Σ, ονοματεπώνυμο, ΑΣΜ, τηλέφωνο, θάλαμος, Σ.Ι. και ρόλος γράφονται και στο Δυναμολόγιο (' + at + ').';
}
// Τα πεδία ενός στρατιώτη: ίδια στη διόρθωση και στον νέο
function PersonFields({ x, setX, id, isNew }: P) {
  const { state } = useStore();
  const ranks = useMemo(() => optionsOf(listOf(state.settings.lists, 'soldierRanks'), state.people.map((y: Person) => y.rank)), [state.people, state.settings.lists]);
  const specs = useMemo(() => optionsOf(listOf(state.settings.lists, 'specs'), state.people.map((y: Person) => y.spec)), [state.people, state.settings.lists]);
  const origins = useMemo(() => optionsOf(listOf(state.settings.lists, 'origins'), [...state.people.map((y: Person) => y.origin), ...state.cadreList.map((c: Cadre) => c.origin)]), [state.people, state.cadreList, state.settings.lists]);
  const F = (k: keyof Person, label: string, opts: P = {}) => html`<div className="field"><label className="field__label" htmlFor=${id + '-' + k}>${label}</label><input id=${id + '-' + k} className="ui-input" type=${opts.type || 'text'} value=${(x as any)[k] ?? ''} placeholder=${opts.placeholder || ''} data-autofocus=${opts.focus ? '' : undefined} onChange=${(e: any) => setX({ ...x, [k]: opts.num ? (e.target.value ? Number(e.target.value) : null) : opts.nullable ? (e.target.value || null) : e.target.value })}/></div>`;
  return html`
    <div className="field-row"><${ChoiceField} id=${id + '-rank'} label="Βαθμός" value=${x.rank} options=${ranks} placeholder="π.χ. ΥΔΝΕΑΣ" otherLabel="+ Νέος βαθμός…" otherHelp="Μένει στη λίστα των βαθμών για την επόμενη φορά (Ρυθμίσεις › Λίστες)." onChange=${(v: string) => setX({ ...x, rank: v })}/><${ChoiceField} id=${id + '-origin'} label="Προέλευση" value=${x.origin || ''} options=${origins} placeholder="π.χ. ΕΠΟΠ" otherLabel="+ Νέα προέλευση…" otherHelp="Μένει στη λίστα των προελεύσεων για την επόμενη φορά (Ρυθμίσεις › Λίστες)." onChange=${(v: string) => setX({ ...x, origin: v || undefined })}/><${ChoiceField} id=${id + '-spec'} label="Ο/Σ (όπλο/σώμα)" value=${x.spec} options=${specs} placeholder="π.χ. ΠΖ" otherLabel="+ Νέο Ο/Σ…" otherHelp="Μένει στη λίστα για την επόμενη φορά." onChange=${(v: string) => setX({ ...x, spec: v })}/></div>
    <div className="field-row">${F('last', isNew ? 'Επώνυμο *' : 'Επώνυμο', { focus: isNew })}${F('first', isNew ? 'Όνομα *' : 'Όνομα')}${F('father', 'Πατρώνυμο')}</div>
    <div className="field-row">${F('asm', 'ΑΣΜ')}${F('phone', 'Τηλέφωνο')}<${RoomField} id=${id + '-room'} value=${x.room} onChange=${(v: number | null) => setX({ ...x, room: v })}/></div>
    <div className="field-row"><${SiField} id=${id + '-si'} value=${x.si} cat=${x.siCat || ''} onChange=${(v: string, c: string) => setX({ ...x, si: v, siCat: c || undefined })}/>${F('post', 'Πόστο', { nullable: true })}</div>
    <div className="field-row">${F('role', 'Ρόλος', { nullable: true })}${isNew && F('essos', 'ΕΣΣΟ', { placeholder: 'π.χ. 2026 Γ΄' })}${F('weapon', 'Αριθμός όπλου (γράφεται μόνο όταν είναι Λ/Υ ή Δ/Υ)')}</div>
    ${isEpop(x, state.settings.lists) && html`<div className="field"><label className="field__label" htmlFor=${id + '-mm'}>Υπηρεσίες τον μήνα (το πολύ)</label><input id=${id + '-mm'} className="ui-input" type="number" min="1" max="31" style=${{ maxWidth: '120px' }} placeholder="π.χ. 4" value=${x.monthMax ?? ''} onChange=${(e: any) => setX({ ...x, monthMax: e.target.value ? Math.max(0, Math.floor(+e.target.value)) || undefined : undefined })}/><span className="field__help">ΕΠΟΠ/ΟΒΑ: δεν μπαίνει στην αυτόματη συμπλήρωση, μόνο με το χέρι. Πάνω από το όριο ζητά επιβεβαίωση. Κενό = χωρίς όριο.</span></div>`}
    <label className="rule"><input type="checkbox" className="ui-check" checked=${x.attached} onChange=${(e: any) => setX({ ...x, attached: e.target.checked })}/><span><b>Προσκολλημένος</b><small>Μετράει στη στήλη «Προσκολλημένοι» της ${HK()}.</small></span></label>
    ${!isNew && html`<label className="rule"><input type="checkbox" className="ui-check" checked=${!x.active} onChange=${(e: any) => setX({ ...x, active: !e.target.checked })}/><span><b>Εκτός δύναμης</b><small>Περνά στους «Εκτός δύναμης» του Δυναμολογίου και στις ΔΙΑΓΡΑΦΕΣ της ${HK()}. Βγαίνει από τις υπηρεσίες που έχει από σήμερα και μετά.</small></span></label>`}
    ${F('notes', 'Σημειώσεις')}`;
}

export function EditPersonDialog({ p, onClose }: P) {
  const { run, state, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const [x, setX] = useState<Person>({ ...p }); const dirty = useDirty(x);
  // εκτός δύναμης (Michael, 17/10): περνά στους «Εκτός δύναμης» του Δυναμολογίου και βγαίνει από τις υπηρεσίες που έχει από σήμερα
  const save = async () => {
    if (!(await run({ t: 'updatePerson', person: x }, false))) return;
    onClose();
    if (p.active && !x.active) toast({ text: rkShort(x) + ' πέρασε στους Εκτός δύναμης.', actions: [{ label: 'Δες τους', fn: () => nav.go('people', { filter: 'inactive' }) }, undoMark()] });
    else if (!p.active && x.active) toast({ text: rkShort(x) + ' είναι ξανά σε δύναμη.', actions: [undoMark()] });
    else toast({ text: 'Αποθηκεύτηκαν τα στοιχεία του ' + rkShort(x) });
  };
  return html`<${Dialog} title="Διόρθωση στοιχείων" description=${rosterNote(state, false)} onClose=${onClose} dirty=${dirty && 'Οι διορθώσεις δεν αποθηκεύτηκαν. Αν κλείσεις, χάνονται.'}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
    <${PersonFields} x=${x} setX=${setX} id="ep"/>
  <//>`;
}

// Νέος στρατιώτης (π.χ. ήρθε μετάθεση): μπαίνει στην εφαρμογή και σε νέα γραμμή στο Δυναμολόγιο.
// «Προσθήκη και επόμενος» (Michael, 19/10): το παράθυρο μένει ανοιχτό με τον ίδιο βαθμό, Ο/Σ, θάλαμο και ΕΣΣΟ
export function NewPersonDialog({ onClose, onMany }: P) {
  const { run, state, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  // η πιο συχνή ΕΣΣΟ όσων είναι σε δύναμη
  const essos = useMemo(() => (state.settings.essos ? essoPersonTxt(state.settings.essos) : currentEssos(state.people)), [state.settings.essos, state.people]);
  const blank = (c: P = {}) => ({ rank: 'ΣΤΡ', spec: '', last: '', first: '', father: '', asm: '', phone: '', room: null, si: 'Ι1', post: null, role: null, essos, attached: false, notes: '', weapon: '', ...c });
  const [x, setX] = useState<P>(blank);
  const [done, setDone] = useState<string[]>([]);   // όσοι μπήκαν με «Προσθήκη και επόμενος»
  const [gen, setGen] = useState(0);
  const ok = !!x.last.trim() && !!x.first.trim();
  const miss = missingOf([['Επώνυμο', x.last.trim()], ['Όνομα', x.first.trim()]]);
  // γράφτηκε κάτι που δεν προστέθηκε: πριν κλείσει ρωτά (Michael, 19/10)
  const dirty = ['last', 'first', 'father', 'asm', 'phone', 'notes', 'weapon', 'post', 'role'].some(k => String(x[k] ?? '').trim());
  const [asking, setAsking] = useState<null | (() => void)>(null);
  const close = (after?: () => void) => { if (dirty) setAsking(() => () => { onClose(); after?.(); }); else { onClose(); after?.(); } };
  const name = x.last.trim().toUpperCase() + ' ' + x.first.trim().toUpperCase();
  const toExcel = () => { const b = state.settings.sources?.people; return !!b && b.write !== false; };
  const save = async () => {
    if (!ok) return;
    const next = await run({ t: 'addPerson', person: x }, false); if (!next) return;
    onClose(); nav.openPerson(next.people.reduce((a: number, y: Person) => Math.max(a, y.id), 0));   // ο νέος έχει τον μεγαλύτερο αριθμό
    toast({ text: 'Προστέθηκε ο ' + name + (toExcel() ? '. Γράφεται και στο Δυναμολόγιο.' : '.'), actions: [undoMark()] });
  };
  const saveNext = async () => {
    if (!ok) return;
    if (!(await run({ t: 'addPerson', person: x }, false))) return;
    setDone(d => [...d, name]); setX(blank({ rank: x.rank, origin: x.origin, spec: x.spec, room: x.room, essos: x.essos })); setGen(g => g + 1);
  };
  useEffect(() => { if (gen) (document.getElementById('np-last') as HTMLInputElement | null)?.focus(); }, [gen]);
  const keys = (e: any) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveNext(); } };
  return html`<${Dialog} title="Νέος στρατιώτης" description=${rosterNote(state, true)} onClose=${() => close()} closeOnOverlay=${!dirty && !done.length}
    footer=${html`<${Why} text=${miss}/><${Button} variant="outline" onClick=${() => close()}>${done.length ? 'Τέλος' : 'Άκυρο'}<//><${Button} variant="outline" disabled=${!ok} why=${miss} onClick=${saveNext} data-tip="Ctrl+Enter· μένει ανοιχτό για τον επόμενο, με τον ίδιο βαθμό, Ο/Σ και θάλαμο">Προσθήκη και επόμενος<//><${Button} disabled=${!ok} why=${miss} onClick=${save}>Προσθήκη<//>`}>
    <div onKeyDown=${keys} className="stack" style=${{ gap: '14px' }}>
    ${done.length > 0 ? html`<${Alert} tone="info"><span>Μπήκαν ${done.length}: ${done.slice(-4).join(', ')}${done.length > 4 ? '…' : ''}. ${toExcel() ? 'Γράφονται και στο Δυναμολόγιο.' : ''}</span><//>`
      : onMany && html`<span className="note" style=${{ margin: 0 }}>Πολλοί μαζί, π.χ. στη νέα ΕΣΣΟ; <${Button} variant="link" onClick=${() => close(onMany)}>Γρήγορη εισαγωγή σε πίνακα<//></span>`}
    <${PersonFields} key=${gen} x=${x} setX=${setX} id="np" isNew=${true}/></div>
    ${asking && html`<${UnsavedDialog} title=${ok ? 'Ο ' + name + ' δεν προστέθηκε' : 'Ο στρατιώτης δεν προστέθηκε'} saveLabel="Πρόσθεσέ τον" canSave=${ok}
      onSave=${() => { setAsking(null); save(); }} discardLabel="Κλείσε χωρίς προσθήκη" onDiscard=${() => { const go = asking; setAsking(null); go(); }} onBack=${() => setAsking(null)}>
      <p style=${{ margin: 0 }}>${ok ? 'Έγραψες στοιχεία που δεν έχουν αποθηκευτεί. Αν κλείσεις χωρίς προσθήκη, χάνονται.' : html`Έγραψες στοιχεία που δεν έχουν αποθηκευτεί. Για να προστεθεί γράψε <b>επώνυμο και όνομα</b>: πάτα «Πίσω».`}</p>
    <//>`}
  <//>`;
}

// Deprecated paths: these dialogs moved to renderer/features/ (Phase 5.3b); removed in Phase 7.
export { DeclareStatusDialog, StatusFixDialog, LeaveEndDialog, leaveStarted };
