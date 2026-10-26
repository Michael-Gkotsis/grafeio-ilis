// features/people και features/status: προσωπικό, καρτέλα ατόμου, δήλωση κατάστασης
import { HK, UNIT } from '../../shared/unit';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { reqWhat } from '../../shared/hkaiText';
import { html, cx, Alert, Badge, Button, Why, missingOf, Dialog, Icon, PageHeader, Segmented, Sheet, SheetNav, Strip, Tabs, VirtualList, useMedia, useSheetNav, useDirty, useToast, useViewportHeight } from '../ui';
import { Combo, Select } from '../select';
import { useNav, useOpenFrom, useStore, searchPeople } from '../store';
import { ActiveFilter, ChangePlanList, ChoiceField, SigsMenu, UnsavedDialog, DateField, DateRangeField, PersonPicker, StatusBadge, timesHelp, TimeField } from '../common';
import type { Sig } from '../../shared/sigs';
import { backBy, hasTimes, normTime, timeNames, timesTxt } from '../../shared/hours';
import { listOf, medKinds, optionsOf, rankTxt, statusLbl } from '../../shared/ranks';
import { TYPES, TYPE_KEYS, RECORD_CATS, KIND_LBL, KIND_NAME, blocksOf, effects, fullName, plainName, shortName, unitOf, roomTxt, platoonsOf, platoonShort, type BlockDef, type Cadre, type DutyKind, type Person, type SavedView, type TypeKey, type Status } from '../../shared/domain';
import { DEFAULT_HK_TIME, DEFAULT_OUT_TIME, isEpop, monthTxt, awayNow, statusesAt, baseTotal, canOpen, dutyBlock, dutyStats, emptyStat, holName, outBlock, personMap, planStatusChanges, postBy, postsOf, statusesOf, statusesOn, strengthAt } from '../../shared/rules';
import { statIsUnarmed, statNoDuty, statSummary, STAT_ROWS } from '../../shared/stat';
import { addDays, daysBetween, dayName, dm, dow, nowHM } from '../../shared/dates';
import { deprivationEnd, isDeprivation, overMax, punBySuggestions, punLbl } from '../../shared/punish';
import { SiField } from './si';
import { RoomField } from './units';
import { QuickAddDialog } from './quickAdd';
import { siOf, siShort } from '../../shared/si';
import { essoPersonTxt } from '../../shared/esso';
import { ROSTER_FILTERS, currentEssos, filterStatus, rosterMatch, statusKind, type RosterFilter } from '../../shared/rosterLists';
import { collator, normGreek, upper } from '../../shared/text';
import { useRowH } from '../prefs';
import { useNowMin } from '../clock';
import { NoteDot, NotesTab, TodayAlert, notesTabLabel } from './notes';
import { noteIndex, personGroups, remLine } from '../../shared/notes';
type P = any;

const CATS: [string, string][] = [['med', 'Ιατρικά'], ['abs', 'Απουσίες'], ['out', 'Έξοδος'], ['other', 'Άλλα'], ['pun', 'Ποινή']];
const CAT_NAME: Record<string, string> = Object.fromEntries(CATS);
// Δήλωση σε βήματα (Michael, 17/10 και 18/10): πρώτα τον στρατιώτη, μετά την κατάσταση (στα ιατρικά μία ή περισσότερες),
// μετά από πότε έως πότε και παρατήρηση για τον λόγο· στο τέλος βλέπεις τι θα αλλάξει
const STEPS = ['Στρατιώτης', 'Κατάσταση', 'Πότε', 'Τι θα αλλάξει'];
// από τα «Ιατρικά και ποινές» (+ Ιατρικό, + Ποινή) πρώτα η κατάσταση και μετά προσθέτεις τους στρατιώτες έναν-έναν (Michael, 18/10)
const ORDER_STATUS_FIRST = [2, 1, 3, 4];
interface StatusPick { key: string; cat: string; type: TypeKey; kind?: string; short: string; long: string; help: string }
// Όλες οι καταστάσεις σε μία λίστα: κάθε είδος άδειας και ποινής χωριστά, και τα δικά σου ιατρικά δίπλα στα βασικά
function statusPicks(punKinds: string[], leaveKinds: string[], meds: { name: string; like?: string; warn?: boolean }[], sum: (s: Pick<Status, 'type' | 'kind'>) => string): StatusPick[] {
  const out: StatusPick[] = [];
  for (const [c] of CATS) for (const k of TYPE_KEYS.filter(x => TYPES[x].cat === c)) {
    const t = TYPES[k];
    if (k === 'LEAVE') leaveKinds.forEach(n => out.push({ key: 'LEAVE:' + n, cat: c, type: k, kind: n, short: n === 'Κανονική' ? t.label : n, long: n + ' άδεια', help: effects(t) }));
    else if (k === 'PUN') punKinds.forEach(n => out.push({ key: 'PUN:' + n, cat: c, type: k, kind: n, short: 'Ποινή', long: punLbl(n), help: sum({ type: k, kind: n }) + ' · ισχύει αμέσως και γράφεται στην ' + HK() + ' (4. Ποινές)' }));
    else out.push({ key: k, cat: c, type: k, short: t.label, long: t.long, help: sum({ type: k }) });
    // τα δικά σου ιατρικά: ό,τι όρισες στις Υπηρεσίες και αργίες (Michael, 18/10)
    if (c === 'med' && k === TYPE_KEYS.filter(x => TYPES[x].cat === 'med').slice(-1)[0])
      meds.forEach(m => out.push({ key: 'm:' + m.name, cat: c, type: m.like as TypeKey, kind: m.name, short: m.name, long: m.warn ? 'Μόνο προειδοποίηση' : 'Δικό σου ιατρικό', help: sum({ type: m.like as TypeKey, kind: m.name }) + (m.warn ? ' · προειδοποίηση όταν μπαίνει σε υπηρεσία' : '') }));
  }
  return out;
}

// Δυναμολόγιο (Michael, 17/10): μόνο τα στοιχεία του στρατιώτη, με τις στήλες του Δυναμολογίου. Οι άδειες και οι ποινές
// φαίνονται μόνο στα αντίστοιχα φίλτρα, με μία στήλη ακόμα (τι και από πότε έως πότε)· τα ιατρικά στα «Ιατρικά και ποινές».
const COLS: [string, string][] = [['rank', 'Βαθμός'], ['spec', 'Ο/Σ'], ['last', 'Επίθετο'], ['first', 'Όνομα'], ['father', 'Πατρώνυμο'], ['asm', 'ΑΣΜ'], ['phone', 'Τηλέφωνο'], ['room', 'Θάλαμος'], ['post', 'Πόστο'], ['role', 'Ρόλος'], ['si', 'Σ.Ι.'], ['dn', 'ΔΝ']];
// στις άδειες/ποινές η στήλη της κατάστασης μπαίνει μετά το πατρώνυμο, για να φαίνεται χωρίς κύλιση
const COL_W: Record<string, [string, number]> = { rank: ['112px', 112], spec: ['60px', 60], last: ['minmax(160px,1.6fr)', 160], first: ['minmax(100px,1fr)', 100], father: ['minmax(100px,1fr)', 100], asm: ['96px', 96], phone: ['106px', 106], room: ['70px', 70], post: ['minmax(76px,.7fr)', 76], role: ['minmax(120px,.8fr)', 120], si: ['104px', 104], dn: ['40px', 40] };
// σε στενή οθόνη (π.χ. 1024) φεύγουν Πατρώνυμο και Τηλέφωνο, που φαίνονται στην καρτέλα, για να χωρά ο πίνακας χωρίς κύλιση
const NARROW_HIDE = ['father', 'phone'];
const COL_WN: Record<string, [string, number]> = { rank: ['64px', 64], last: ['minmax(140px,1.6fr)', 140], asm: ['84px', 84], room: ['50px', 50], post: ['minmax(64px,.7fr)', 64], role: ['minmax(90px,.8fr)', 90], si: ['84px', 84] };
const colsOf = (narrow: boolean): [string, string][] => (narrow ? COLS.filter(([k]) => !NARROW_HIDE.includes(k)).map(([k, l]) => [k, k === 'room' ? 'Θάλ.' : l]) : COLS);
const HEAD_KEYS = ['rank', 'spec', 'last', 'first', 'father'];
function gridOf(narrow: boolean, withSt: boolean): [string, number] {
  const ks = colsOf(narrow).map(([k]) => k), head = ks.filter(k => HEAD_KEYS.includes(k)), tail = ks.filter(k => !HEAD_KEYS.includes(k));
  const w = (k: string) => (narrow && COL_WN[k]) || COL_W[k];
  const cols = ['44px', ...head.map(k => w(k)[0]), ...(withSt ? ['minmax(220px,1.6fr)'] : []), ...tail.map(k => w(k)[0])];
  return [cols.join(' '), 44 + ks.reduce((a, k) => a + w(k)[1], 0) + (withSt ? 220 : 0) + 18];
}
const stTxt = (st: Status, lists: P) => statusKind(st, lists) + ' · ' + dm(st.from) + (st.open ? ' – χωρίς λήξη' : st.to !== st.from ? '–' + dm(st.to) : '');
const PersonRow = memo(function PersonRow({ p, n, odd, style, grid, st, lists, selected, onOpen, narrow, nm }: P) {
  const si = p.si ? siOf(p, lists).text : '';
  return html`<div className=${cx('ptable__row', odd && 'is-odd', selected && 'is-sel')} style=${{ ...style, gridTemplateColumns: grid }} role="row" tabIndex="0" onClick=${() => onOpen(p.id)} onKeyDown=${(e: any) => { if (e.key === 'Enter') onOpen(p.id); }}>
    <span className="num muted">${n}</span><span data-tip=${p.origin ? rankTxt(p) : undefined}>${rankTxt(p)}</span><span>${p.spec}</span><span><b>${p.last}</b>${nm && html`<${NoteDot} m=${nm}/>`}</span><span>${p.first}</span>${!narrow && html`<span>${p.father}</span>`}
    ${st && html`<span><${Badge} tone=${TYPES[st.type as TypeKey].tone}>${stTxt(st, lists)}<//></span>`}
    <span className="num">${p.asm}</span>${!narrow && html`<span className="num">${p.phone}</span>`}<span>${p.room ?? ''}</span><span data-tip=${p.post && p.post.length > 9 ? p.post : undefined}>${p.post || ''}</span><span data-tip=${p.role && p.role.length > 9 ? p.role : undefined}>${p.role || ''}</span>
    <span data-tip=${si !== siShort(si) ? si : undefined}>${siShort(si)}</span><span>${p.dn ? '✓' : ''}</span></div>`;
});
const PersonCard = memo(function PersonCard({ p, style, st, lists, onOpen }: P) {
  return html`<div className="pcard" style=${style} onClick=${() => onOpen(p.id)}>
    <div><b>${rankTxt(p)} ${plainName(p)}</b><small>${[p.father && 'του ' + p.father, p.spec, roomTxt(p), p.phone, p.si && siOf(p, lists).text, p.post && 'πόστο ' + p.post, p.dn && 'ΔΝ'].filter(Boolean).join(' · ')}</small></div>
    ${st && html`<${Badge} tone=${TYPES[st.type as TypeKey].tone}>${stTxt(st, lists)}<//>`}</div>`;
});

type Filt = { unit: string; room: number | null; filter: string };
const DEF_SORT = { k: 'last', dir: 1 };
// φίλτρα αποθηκευμένων λιστών από πριν (Παρόντες, ΕΥ…): ισχύουν ακόμα, απλώς δεν είναι πια κουμπιά
const legacyMatch = (f: string, ss: Status[]) => { const away = ss.some(s => TYPES[s.type].away); return f === 'present' ? !away : f === 'absent' ? away : (TYPES as any)[f] ? ss.some(s => s.type === f) : true; };
export function PeopleScreen() {
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
  const ssOf = useMemo(() => { const m = new Map<number, Status[]>(); active.forEach(p => m.set(p.id, date === today ? statusesAt(state, p.id, date, at) : statusesOn(state.statuses, p.id, date))); return m; }, [active, state, date, today, at]);
  const place = (p: Person, f: Filt) => (f.unit === 'all' || unitOf(p, state.settings) === f.unit) && (f.room == null || p.room === f.room);
  const matches = useCallback((p: Person, f: Filt) => {
    if (!place(p, f)) return false;
    const ss = ssOf.get(p.id) || [];
    return ROSTER_FILTERS.some(([k]) => k === f.filter) ? rosterMatch(f.filter as RosterFilter, p, ss) : p.active && legacyMatch(f.filter, ss);
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
  const height = useViewportHeight(mobile ? 330 : 300);
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

function SaveViewDialog({ onClose, onSave }: P) {
  const [name, setName] = useState('');
  const ok = name.trim().length > 0;
  return html`<${Dialog} title="Αποθήκευση λίστας" description="Το φίλτρο που βλέπεις γίνεται κουμπί στη γραμμή φίλτρων, με τον αριθμό ατόμων πάντα ενημερωμένο." onClose=${onClose}
    footer=${html`<${Why} text=${!ok && 'Λείπει: Όνομα'}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} why="Λείπει: Όνομα" onClick=${() => ok && onSave(name.trim())}>Αποθήκευση<//>`}>
    <div className="field"><label className="field__label" htmlFor="sv-n">Όνομα *</label><input id="sv-n" className="ui-input" data-autofocus="" maxLength="30" placeholder="π.χ. Θαλαμάρχες, Οδηγοί, ΕΣΣΟ Γ΄" value=${name} onChange=${(e: any) => setName(e.target.value)} onKeyDown=${(e: any) => { if (e.key === 'Enter' && ok) onSave(name.trim()); }}/></div>
  <//>`;
}

const SHEET_TABS = [{ value: 'info', label: 'Στοιχεία' }, { value: 'duty', label: 'Υπηρεσίες' }, { value: 'hist', label: 'Ιστορικό' }, { value: 'notes', label: 'Σημειώσεις' }];
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
  const ssT = statusesOn(state.statuses, pid, today).filter(x => STAT_ROWS.includes(x.type)); const rest = statusesOf(state.statuses, pid).filter(x => !STAT_ROWS.includes(x.type) && !backBy(x, today, nowM));   // γύρισε σήμερα ως τώρα: όχι πια «καμία υπηρεσία»
  const noDutyT = ssT.some(x => statNoDuty(x, bl, lists)) || !!dutyBlock(rest, today, pid, { armed: false });
  const unarmedT = ssT.some(x => statIsUnarmed(x, bl.filter(b => b.kind !== 'ly'), lists)) || !!dutyBlock(rest, today, pid, { armed: true });
  const rules = [noDutyT ? 'Καμία υπηρεσία' : unarmedT ? 'Μόνο άοπλες θέσεις' : null, ob ? 'Δεν βγαίνει έξοδο (' + ob + ')' : null].filter(Boolean);
  const si = p.si ? siOf(p, lists) : null;
  // Η καρτέλα (Michael, 17/10): ό,τι έχει το Δυναμολόγιο για τον στρατιώτη, οι υπηρεσίες του (σύνολο, με τις αργίες/ΣΚ από κάτω),
  // το ημερολόγιο υπηρεσιών και το ιστορικό καταστάσεων. Το «Τι κάνει» είναι πλέον στις Υπηρεσίες, η ΕΣΣΟ πάνω δεξιά.
  return html`<${Sheet} onClose=${onClose} actions=${html`<${SheetNav} at=${at} n=${total} move=${move}/>`} title=${html`<h2 style=${{ fontSize: '18px' }}>${plainName(p)}</h2>`} subtitle=${html`<div className="muted" style=${{ fontSize: '13px' }}>του ${p.father || '—'} · ${rankTxt(p)} · ${unitOf(p, state.settings)}${p.active ? '' : ' · ΕΚΤΟΣ ΔΥΝΑΜΗΣ'}</div><div style=${{ marginTop: '6px' }}><${StatusBadge} statuses=${state.statuses} pid=${pid} date=${today} lists=${state.settings.lists}/></div>`}>
    <${TodayAlert} rules=${rules} rem=${rem} onRem=${() => setTab('notes')}/>
    <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><${Button} onClick=${() => nav.declare({ pids: [pid] })}>Δήλωσε κατάσταση<//><${Button} variant="outline" onClick=${() => setEdit(true)}>Διόρθωση στοιχείων<//></div>
    <${Tabs} value=${tab} onChange=${(t: string) => nav.guard(() => setTab(t))} items=${SHEET_TABS.map(t => ({ ...t, label: t.value === 'duty' ? t.label + ' (' + dd.total + ')' : t.value === 'hist' ? t.label + ' (' + hist.length + ')' : t.value === 'notes' ? notesTabLabel(ng) : t.label }))}/>
    ${tab === 'info' && html`
    <dl className="kv"><dt>Βαθμός</dt><dd>${p.rank || '—'}</dd><dt>Προέλευση</dt><dd>${p.origin || '—'}</dd><dt>Ο/Σ</dt><dd>${p.spec || '—'}</dd><dt>Επίθετο</dt><dd>${p.last || '—'}</dd><dt>Όνομα</dt><dd>${p.first || '—'}</dd><dt>Πατρώνυμο</dt><dd>${p.father || '—'}</dd>
      <dt>ΑΣΜ</dt><dd className="num">${p.asm || '—'}</dd><dt>Τηλέφωνο</dt><dd className="num">${p.phone || '—'}</dd><dt>Θάλαμος</dt><dd>${roomTxt(p)} <span className="muted" style=${{ fontSize: '12px' }}>(${unitOf(p, state.settings)})</span></dd>
      <dt>Πόστο</dt><dd>${p.post || '—'}</dd><dt>Ρόλος</dt><dd>${p.role || '—'}</dd><dt><abbr data-tip="Σωματική ικανότητα (από το Δυναμολόγιο)">Σ.Ι.</abbr></dt><dd>${si ? si.text : '—'}${si && p.siCat && si.cat ? ' · ' + si.cat : ''}</dd>
      ${isEpop(p, lists) && html`<dt>Υπηρεσίες τον μήνα</dt><dd>${monthTxt(state, today, p)} <span className="muted" style=${{ fontSize: '12px' }}>(ΕΠΟΠ/ΟΒΑ: μόνο με το χέρι)</span></dd>`}
      <dt>Δικαίωμα ΔΝ</dt><dd><label className="kv__check"><input type="checkbox" className="ui-check" checked=${!!p.dn} onChange=${async (e: any) => { const dn = e.target.checked; if (await run({ t: 'updatePerson', person: { ...p, dn } }, false)) toast({ text: shortName(p) + (dn ? ' έχει δικαίωμα ΔΝ' : ' δεν έχει δικαίωμα ΔΝ') }); }}/><span>${p.dn ? 'Ναι' : 'Όχι'}</span></label></dd>
      ${p.notes && html`<dt>Σημ. Δυναμολογίου</dt><dd>${p.notes}</dd>`}
    </dl>
    `}
    ${tab === 'duty' && html`
    <dl className="kv"><dt>Υπηρεσίες</dt><dd className="num">${dd.total}</dd><dt className="kv__sub">Αργίες / ΣΚ</dt><dd><span className="num">${dd.hol}</span>${dd.lastHol && html` <span className="muted" style=${{ fontSize: '12px' }}>τελευταία ${holName(state.settings, dd.lastHol)} ${dm(dd.lastHol)}</span>`}</dd></dl>
    <section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Ημερολόγιο υπηρεσιών <span className="muted" style=${{ fontWeight: 400, fontSize: '13px' }}>(τελευταίες 40)</span></h3>${duties.length ? html`<ul className="hist">${duties.map(({ d, x, kind, h }) => html`<li key=${d + (x?.k || kind)}><span className="num">${dow(d)} ${dm(d)}</span>${x ? x.label : KIND_NAME[kind] + ' χωρίς θέση (από Excel)'}${h && html` <${Badge} tone="warn">${holName(state.settings, d)}<//>`}</li>`)}</ul>` : html`<span className="muted">Καμία υπηρεσία ακόμα.</span>`}</section>
    `}
    ${tab === 'hist' && html`
    <section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Καταστάσεις</h3>${hist.length ? html`<ul className="hist">${hist.map((s: Status) => html`<li key=${s.id}><${Badge} tone=${TYPES[s.type].tone}>${statusLbl(s, state.settings.lists)}<//><span className="num">${dow(s.from)} ${dm(s.from)}${s.open ? ' – χωρίς λήξη' : s.to !== s.from ? ' – ' + dow(s.to) + ' ' + dm(s.to) : ''}</span><span className="muted">(${daysBetween(s.from, s.to)} ημ.${timesTxt(s) ? ', ' + timesTxt(s) : ''})</span>${hasTimes(s.type) && !s.pending && s.to >= today && html`<${Button} variant="link" onClick=${() => setTimes(s)} data-tip=${'Ώρα ' + timeNames(s.type).fromG + ' την πρώτη μέρα και ώρα ' + timeNames(s.type).toG + ' την τελευταία'}>Ώρες…<//>`}${TYPES[s.type].cat === 'abs' && awayNow(s, today, nowM) && html`<${Button} variant="link" onClick=${() => setEnd(s)} data-tip=${leaveStarted(s, today) ? 'Γύρισε νωρίτερα: η άδεια τελειώνει τη μέρα και ώρα που λες' : 'Δεν θα φύγει: η άδεια φεύγει ολόκληρη'}>${leaveStarted(s, today) ? 'Λήξη νωρίτερα…' : 'Ακύρωση…'}<//>`}${RECORD_CATS.includes(TYPES[s.type].cat) && html`<${Button} variant="link" onClick=${() => setFix(s)} data-tip="Μπήκε λάθος; Άλλαξε ημερομηνίες και στοιχεία ή διάγραψέ το">Διόρθωση…<//>`}${s.pending && html`<${Badge} tone="warn">αιτείται<//>`}${s.to < today && RECORD_CATS.includes(TYPES[s.type].cat) && html`<span className="muted" style=${{ fontSize: '12px' }}>έληξε</span>`}</li>`)}</ul>` : html`<span className="muted">Καμία καταχώρηση ακόμα.</span>`}</section>
    ${reqs.length > 0 && html`<section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Αιτήσεις</h3><ul className="hist">${reqs.map(r => html`<li key=${r.id}><span className="num">${dow(r.date)} ${dm(r.date)}</span>αιτείται ${upper(reqWhat(r))}${r.decision && html` <${Badge} tone=${r.decision === 'ok' ? 'ok' : 'bad'}>${r.decision === 'ok' ? 'εγκρίθηκε' : 'απορρίφθηκε'}<//>`}${r.leave && !r.decision && html` <${Badge} tone="warn">περιμένει<//>`}<${Button} variant="link" onClick=${() => nav.go('hkai', { hkaiDate: r.date })}>${HK()}<//></li>`)}</ul></section>`}
    `}
    ${tab === 'notes' && html`<${NotesTab} key=${pid} who=${{ pid }}/>`}
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
  const [f, setF] = useState({ fromTime: st.fromTime || '', toTime: st.toTime || '' });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const a = normTime(f.fromTime), b = normTime(f.toTime);
    if (a == null || b == null) { setErr('Η ώρα ' + (a == null ? tn.fromG : tn.toG) + ' δεν διαβάζεται. Γράψε π.χ. 14:00 ή άφησέ την κενή.'); return; }
    if (!(await run({ t: 'setTimes', id: st.id, fromTime: a, toTime: b }, false))) return;
    onClose(); toast({ text: 'Ώρες ' + what + ' ' + shortName(p) + ': ' + (timesTxt({ type: st.type, fromTime: a, toTime: b, open: st.open }) || 'χωρίς ώρες'), actions: [undoMark()] });
  };
  return html`<${Dialog} title=${'Ώρες ' + what} description=${fullName(p) + ' · ' + statusLbl(st, state.settings.lists) + ' ' + dm(st.from) + (st.to !== st.from ? '–' + dm(st.to) : '')} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
    <div className="field-row">
      <${TimeField} id="lt-out" label=${'Ώρα ' + tn.fromG} value=${f.fromTime} onChange=${(v: string) => { setF({ ...f, fromTime: v }); setErr(null); }} help=${dow(st.from) + ' ' + dm(st.from)}/>
      ${!st.open && html`<${TimeField} id="lt-in" label=${'Ώρα ' + tn.toG} value=${f.toTime} onChange=${(v: string) => { setF({ ...f, toTime: v }); setErr(null); }} help=${dow(st.to) + ' ' + dm(st.to)}/>`}
    </div>
    <span className="field__help">${timesHelp(state.rules, state.settings)} Υπηρεσίες που δεν γίνονται πια με τις νέες ώρες αδειάζουν.</span>
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
}

// Ιατρικό ή ποινή που μπήκε λάθος: «Διόρθωση» ανοίγει τη δήλωση με τα στοιχεία της (στην αποθήκευση η παλιά φεύγει),
// «Διαγραφή» τη σβήνει ολόκληρη. Και τα δύο με αναίρεση (πριν, έμενε μόνο το «Σταμάτησε», που κρατά τις περασμένες μέρες).
export function StatusFixDialog({ st, onClose }: P) {
  const { state, run, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const p = personMap(state.people).get(st.pid);
  const [del, setDel] = useState(false);
  const what = (st.type === 'PUN' ? 'ποινή (' + punLbl(st.kind) + ')' : statusLbl(st, state.settings.lists));
  const desc = (p ? fullName(p) + ' · ' : '') + what.replace(/^π/, 'Π') + ' ' + dm(st.from) + ' – ' + (st.open ? 'χωρίς λήξη' : dm(st.to));
  const edit = () => { onClose(); nav.declare({ replace: st.id, pids: [st.pid], type: st.type, kind: st.kind, from: st.from, to: st.to, open: st.open, note: st.note, by: st.by, reason: st.reason, on: st.on, fromTime: st.fromTime, toTime: st.toTime }); };
  const remove = async () => {
    if (!(await run({ t: 'deleteStatus', id: st.id }, false))) return;
    onClose(); toast({ text: 'Διαγράφηκε: ' + what + (p ? ' του ' + shortName(p) : ''), actions: [undoMark()] });
  };
  if (del) return html`<${Dialog} role="alertdialog" title="Διαγραφή: μπήκε λάθος;" description=${desc} onClose=${onClose}
    footer=${html`<${Button} variant="outline" data-autofocus="" onClick=${() => setDel(false)}>Πίσω<//><${Button} variant="destructive" onClick=${remove}>Ναι, διάγραψέ ${st.type === 'PUN' ? 'την' : 'το'}<//>`}>
    <p style=${{ margin: 0 }}>Φεύγει ολόκληρ${st.type === 'PUN' ? 'η' : 'ο'}, και οι μέρες που έχουν περάσει, από παντού (${st.type === 'PUN' ? 'Ποινές' : 'Ιατρικά'}, ${HK()}, Δύναμη, Excel), σαν να μην μπήκε ποτέ. Αν απλώς σταμάτησε νωρίτερα, πάτα «Πίσω» και κλείσε· το «Λήξη νωρίτερα…» κρατά τις μέρες που ίσχυσε.</p><//>`;
  return html`<${Dialog} title="Διόρθωση" description=${desc} onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${() => setDel(true)}>Διαγραφή (μπήκε λάθος)…<//><span style=${{ flex: 1 }}></span><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} data-autofocus="" onClick=${edit}>Άλλαξε στοιχεία…<//>`}>
    <p style=${{ margin: 0 }}><b>Άλλαξε στοιχεία</b>: ανοίγει η δήλωση με ό,τι έχει τώρα (ημερομηνίες, είδος, παρατήρηση${st.type === 'PUN' ? ', ποιος τιμώρησε, λόγος' : ''}) για να διορθώσεις ό,τι μπήκε λάθος. Στην αποθήκευση η παλιά καταχώρηση αντικαθίσταται.</p>
    <p style=${{ margin: '10px 0 0' }}><b>Διαγραφή</b>: μόνο αν μπήκε εντελώς λάθος (λάθος άνθρωπος ή δεν έγινε ποτέ).</p><//>`;
}

// Άδεια (κανονική, τιμητική, αναρρωτική) που ξεκίνησε ή όχι ακόμα (Michael, 18/10: «να μπορείς να ακυρώσεις / τερματίσεις άδεια»)
export const leaveStarted = (st: Status, today: string) => st.from < today || (st.from === today && (!st.fromTime || st.fromTime <= nowHM()));
// Πριν φύγει: ακύρωση (φεύγει όλη). Αφού έφυγε: διακοπή, γύρισε τη μέρα και ώρα που λες (τώρα)· η ακύρωση μένει για λάθος καταχώρηση.
// Το ίδιο για νοσοκομείο και ΣΤΕΠ (Michael, 20/10: «να γυρνάει την ώρα που έβαλες»): βγήκε νωρίτερα, στη μέρα και ώρα εξόδου.
export function LeaveEndDialog({ st, onClose }: P) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast();
  const p = personMap(state.people).get(st.pid)!;
  const started = leaveStarted(st, today);
  const [cancel, setCancel] = useState(!started);
  const max = st.open ? undefined : st.to;
  const [day, setDay] = useState(max && max < today ? max : today < st.from ? st.from : today);
  const [time, setTime] = useState(nowHM());
  const [err, setErr] = useState<string | null>(null);
  const abs = TYPES[st.type as TypeKey].cat === 'abs', tn = timeNames(st.type);
  const what = TYPES[st.type as TypeKey].long.toLowerCase();
  const W = abs ? { title: 'Διακοπή άδειας', cancel: 'Ακύρωση άδειας', go: 'Γύρισε', intro: 'Γύρισε νωρίτερα (π.χ. ανακλήθηκε): η άδεια τελειώνει' }
    : { title: 'Έξοδος νωρίτερα', cancel: 'Διαγραφή', go: 'Βγήκε', intro: 'Βγήκε νωρίτερα: η ' + what + ' τελειώνει' };
  const desc = fullName(p) + ' · ' + statusLbl(st, state.settings.lists) + ' ' + dm(st.from) + (st.fromTime ? ' ' + st.fromTime : '') + ' – ' + (st.open ? 'χωρίς λήξη' : dm(st.to) + (st.toTime ? ' ' + st.toTime : ''));
  const t = normTime(time);
  // τι σημαίνει η ώρα τη μέρα που γυρνά (ίδιοι κανόνες με τις ώρες της άδειας)· ο ΣΤΕΠ μετρά έτσι κι αλλιώς παρών
  const hk = state.rules?.hkTime || DEFAULT_HK_TIME, out = state.rules?.outTime || DEFAULT_OUT_TIME;
  const effect = !t ? 'Χωρίς ώρα η μέρα αυτή μετρά ολόκληρη· ' + (st.type === 'STEP' ? 'κανονικά' : 'παρών') + ' από την επόμενη μέρα.'
    : (t <= hk ? 'Εκείνη τη μέρα ' + (st.type === 'STEP' ? '' : 'μετρά παρών και στην ' + HK() + ', ') + 'βγαίνει έξοδο και μπαίνει σε υπηρεσίες.'
      : t <= out ? 'Εκείνη τη μέρα βγαίνει κανονικά έξοδο και μπαίνει σε υπηρεσίες που ξεκινούν μετά τις ' + t + (st.type === 'STEP' ? '.' : '· στην ' + HK() + ' μετρά παρών από την επόμενη μέρα.')
      : 'Εκείνη τη μέρα μπαίνει σε υπηρεσίες που ξεκινούν μετά τις ' + t + '· έξοδος' + (st.type === 'STEP' ? '' : ' και ' + HK()) + ' κανονικά από την επόμενη μέρα.');
  const doCancel = async () => {
    if (!(await run({ t: 'cancelLeave', id: st.id }, false))) return;
    onClose(); toast({ text: (abs ? 'Ακυρώθηκε η ' : 'Διαγράφηκε η ') + what + ' του ' + shortName(p), actions: [undoMark()] });
  };
  const doEnd = async () => {
    if (t == null) { setErr('Η ώρα δεν διαβάζεται. Γράψε π.χ. 22:00 ή άφησέ την κενή.'); return; }
    if (!(await run({ t: 'endLeave', id: st.id, date: day, time: t }, false))) return;
    onClose(); toast({ text: shortName(p) + ': ' + (abs ? 'γύρισε από ' + what : what + ', ' + tn.to) + ' ' + dm(day) + (t ? ' ' + t : ''), actions: [undoMark()] });
  };
  if (cancel) return html`<${Dialog} role="alertdialog" title=${W.cancel} description=${desc} onClose=${onClose}
    footer=${html`<${Button} variant="outline" data-autofocus="" onClick=${started ? () => setCancel(false) : onClose}>${started ? 'Πίσω' : 'Όχι'}<//><${Button} variant="destructive" onClick=${doCancel}>${abs ? 'Ναι, ακύρωσέ την' : 'Ναι, διάγραψέ την'}<//>`}>
    <p style=${{ margin: 0 }}>${started ? html`Έχει ήδη ξεκινήσει. ${abs ? 'Ακύρωση' : 'Διαγραφή'} μόνο αν <b>μπήκε κατά λάθος</b>· αν ${abs ? 'γύρισε' : 'βγήκε'} νωρίτερα, πάτα «Πίσω» και «${W.go}».` : html`Ξεκινά <b>${dayName(st.from, today).toLowerCase()} ${dm(st.from)}</b>.`} Φεύγει από παντού (${abs ? 'Άδειες' : 'Ιατρικά'}, ${HK()}, Δύναμη, Excel) και μετρά διαθέσιμος για υπηρεσίες και έξοδο.${st.req ? ' Η αίτηση μένει εγκεκριμένη.' : ''}</p><//>`;
  return html`<${Dialog} title=${W.title} description=${desc} onClose=${onClose}
    footer=${html`<${Button} variant="ghost" onClick=${() => setCancel(true)} data-tip="Μόνο αν μπήκε κατά λάθος: φεύγει ολόκληρη">${W.cancel}…<//><span style=${{ flex: 1 }}></span><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${doEnd}>${W.go}<//>`}>
    <p style=${{ margin: '0 0 10px' }}>${W.intro} τη μέρα και ώρα που λες και από εκεί και πέρα μετρά κανονικά σε υπηρεσίες, εξόδους, ${HK()}, Δύναμη, Δυναμολόγιο και Excel.</p>
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="le-d">Μέρα ${tn.toG}</label><${DateField} id="le-d" className="ui-input" min=${st.from} max=${max} value=${day} onChange=${(e: any) => { if (e.target.value) { setDay(e.target.value); setErr(null); } }}/><span className="field__help">${dayName(day, today)}</span></div>
      <${TimeField} id="le-t" label=${'Ώρα ' + tn.toG} value=${time} onChange=${(v: string) => { setTime(v); setErr(null); }} help=${'Η τωρινή· άλλαξέ την αν ' + (abs ? 'γύρισε' : 'βγήκε') + ' άλλη ώρα'}/>
    </div>
    <span className="field__help">${effect}</span>
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
}

// Υπηρεσίες πριν από την εφαρμογή: δεν γράφονται πια με το χέρι (Michael, 17/10: η ΕΣΣΟ ξεκινά από την αρχή).
// Όσες υπάρχουν ήδη μετρούν ακόμα· ο έλεγχος από κάτω τις μηδενίζει.
const BASE_KINDS: DutyKind[] = ['th', 'op', 'sk', 'mg', 'ly', 'tae', 'other'];

// Μία φορά μετά την αναβάθμιση στους κωδικούς θέσεων: οι παλιές «προηγούμενες υπηρεσίες» μπορεί να είναι διπλομετρημένες,
// γιατί κάθε ανάγνωση του ελέγχου υπηρεσιών πρόσθετε εκεί όσους δεν χωρούσαν σε θέση
export const needsBaselineReview = (state: any) => !state.settings.baselineReviewed && Object.values(state.baseline || {}).some((b: any) => baseTotal(b) > 0 || (b?.hol || 0) > 0);
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
      <tbody>${ids.map(id => { const p = pm.get(id); return html`<tr key=${id}><td>${p ? shortName(p) : 'Άτομο ' + id}</td>${cols.map(k => html`<td key=${k}><input className="ui-input" type="number" min="0" aria-label=${(p ? shortName(p) : '') + ' ' + (k === 'hol' ? 'ΣΚ/αργία' : KIND_NAME[k as DutyKind])} value=${rows[id]?.[k] || ''} placeholder="0" onChange=${(e: any) => set(id, k, +e.target.value)}/></td>`)}</tr>`; })}</tbody>
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

function EditPersonDialog({ p, onClose }: P) {
  const { run, state, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const [x, setX] = useState<Person>({ ...p }); const dirty = useDirty(x);
  // εκτός δύναμης (Michael, 17/10): περνά στους «Εκτός δύναμης» του Δυναμολογίου και βγαίνει από τις υπηρεσίες που έχει από σήμερα
  const save = async () => {
    if (!(await run({ t: 'updatePerson', person: x }, false))) return;
    onClose();
    if (p.active && !x.active) toast({ text: shortName(x) + ' πέρασε στους Εκτός δύναμης.', actions: [{ label: 'Δες τους', fn: () => nav.go('people', { filter: 'inactive' }) }, undoMark()] });
    else if (!p.active && x.active) toast({ text: shortName(x) + ' είναι ξανά σε δύναμη.', actions: [undoMark()] });
    else toast({ text: 'Αποθηκεύτηκαν τα στοιχεία του ' + shortName(x) });
  };
  return html`<${Dialog} title="Διόρθωση στοιχείων" description=${rosterNote(state, false)} onClose=${onClose} dirty=${dirty && 'Οι διορθώσεις δεν αποθηκεύτηκαν. Αν κλείσεις, χάνονται.'}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
    <${PersonFields} x=${x} setX=${setX} id="ep"/>
  <//>`;
}

// Νέος στρατιώτης (π.χ. ήρθε μετάθεση): μπαίνει στην εφαρμογή και σε νέα γραμμή στο Δυναμολόγιο.
// «Προσθήκη και επόμενος» (Michael, 19/10): το παράθυρο μένει ανοιχτό με τον ίδιο βαθμό, Ο/Σ, θάλαμο και ΕΣΣΟ
function NewPersonDialog({ onClose, onMany }: P) {
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

/* features/status/DeclareStatusDialog · 1 ή πολλά άτομα, 4 βήματα */
export function DeclareStatusDialog({ initial, onClose }: P) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const pm = personMap(state.people);
  // «Διόρθωση…» στα Ιατρικά/Ποινές: ίδια φόρμα με τα στοιχεία της, στην αποθήκευση η παλιά φεύγει (replaceStatus)
  const fix: Status | undefined = initial.replace ? state.statuses.find(x => x.id === initial.replace) : undefined;
  const base = useMemo(() => (fix ? { ...state, statuses: state.statuses.filter(x => x !== fix) } : state), [state, fix]);
  const ttl = fix ? 'Διόρθωση: ' + (fix.type === 'PUN' ? 'ποινή' : statusLbl(fix, state.settings.lists)) : 'Δήλωση κατάστασης';
  // πρώτα ο στρατιώτης (Michael, 18/10)· από την καρτέλα του ατόμου ξεκινά από την κατάσταση
  const statusFirst = !!initial.cat && !initial.pids?.length;
  const order = statusFirst ? ORDER_STATUS_FIRST : [1, 2, 3, 4];
  const [step, setStep] = useState(() => (initial.pids?.length ? (initial.type ? 3 : 2) : statusFirst ? 2 : 1)); const [unlock, setUnlock] = useState(false); const [ack, setAck] = useState(false);
  const punKinds = listOf(state.settings.lists, 'punKinds'), leaveKinds = listOf(state.settings.lists, 'leaveKinds');
  const [cmd, setCmd] = useState(() => ({ pids: (initial.pids || []) as number[], type: (initial.type || 'EY') as TypeKey, from: initial.from || today, to: initial.to || initial.from || today, note: initial.note || '', kind: initial.kind || (initial.type === 'LEAVE' ? leaveKinds[0] : initial.type === 'PUN' ? punKinds[0] : ''), by: initial.by || '', reason: initial.reason || '', on: initial.on || today, fromTime: initial.fromTime || '', toTime: initial.toTime || '', open: !!initial.open }));
  const [err, setErr] = useState<any>(null);
  const set = (patch: P) => { setCmd(c => ({ ...c, ...patch, ...(patch.type ? { kind: patch.type === 'LEAVE' ? leaveKinds[0] : punKinds[0] } : {}) })); setErr(null); setAck(false); };
  const t = TYPES[cmd.type];
  const hasKind = cmd.type === 'PUN' || cmd.type === 'LEAVE';
  const isPun = cmd.type === 'PUN';
  // δικά σου ιατρικά (Ρυθμίσεις › Λίστες): στη γραμμή «Ιατρικά» δίπλα στα βασικά· κρατούν τον βασικό τύπο και το όνομά τους στο «είδος»
  const meds = medKinds(state.settings.lists);
  const med = !hasKind ? meds.find(m => m.like === cmd.type && m.name === cmd.kind) : undefined;
  const picks = useMemo(() => {
    const bl = (blocksOf(state.settings) || state.settings.blocks) as BlockDef[];
    return statusPicks(punKinds, leaveKinds, meds, x => statSummary(x, bl, state.settings.lists));
  }, [state.settings]);   // eslint-disable-line react-hooks/exhaustive-deps
  // ιατρικά: ένα ή περισσότερα μαζί για τον ίδιο λόγο (Michael, 18/10)· καθένα γράφεται σε δική του γραμμή στο Excel
  const [medSel, setMedSel] = useState<string[]>(() => (initial.type && TYPES[initial.type as TypeKey]?.cat === 'med' ? [meds.some(m => m.like === initial.type && m.name === initial.kind) ? 'm:' + initial.kind : initial.type] : []));
  const medPicks = t.cat === 'med' ? picks.filter(x => medSel.includes(x.key)) : [];
  // ώρες: στις άδειες, στο νοσοκομείο και στον ΣΤΕΠ (hours.ts), προαιρετικές
  const timed = hasTimes(cmd.type);
  // χωρίς λήξη: μόνο ιατρικά, ΣΤΕΠ και νοσοκομείο (canOpen)· χωρίς «έως» και ώρα επιστροφής
  const open = cmd.open && canOpen(cmd.type);
  const tOut = timed ? normTime(cmd.fromTime) : '', tBack = timed && !open ? normTime(cmd.toTime) : '';
  const full = { ...cmd, open: open || undefined, kind: hasKind ? cmd.kind : med ? med.name : undefined, note: cmd.note || undefined, by: isPun ? cmd.by : undefined, reason: isPun ? cmd.reason : undefined, on: isPun ? cmd.on : undefined, fromTime: tOut || undefined, toTime: tBack || undefined, unlockPast: unlock || undefined, force: ack || undefined };
  const cmds = medPicks.length > 1 ? medPicks.map(x => ({ ...full, type: x.type, kind: x.key.startsWith('m:') ? x.kind : undefined })) : [full];
  const byList = useMemo(() => punBySuggestions(state), [state.statuses, state.cadreList]);
  const max = isPun ? overMax(cmd.kind, daysBetween(cmd.from, cmd.to), state.settings.lists) : 0;
  // στέρηση εξόδου: πότε λήγει για τον καθένα, αφού δεν μετράνε οι μέρες με υπηρεσία ή βραδινή εκπαίδευση
  const dep = isPun && isDeprivation({ type: 'PUN', kind: cmd.kind });
  const depEnds = dep ? cmd.pids.map(pid => ({ pid, to: deprivationEnd(base, pid, cmd.from, daysBetween(cmd.from, cmd.to)) })).filter(x => x.to !== cmd.to) : [];
  const plan = useMemo(() => (step === 4 ? planStatusChanges(base, cmds, today) : null), [step, base, cmd, medSel, today, unlock]);
  const next = () => {
    if (!cmd.pids.length) { setErr('Διάλεξε ποιον αφορά η δήλωση. Γράψε τα πρώτα γράμματα του επωνύμου.'); return; }
    if (tOut == null || tBack == null) { setErr('Η ώρα ' + (tOut == null ? timeNames(cmd.type).fromG : timeNames(cmd.type).toG) + ' δεν διαβάζεται. Γράψε π.χ. 14:00 ή άφησέ την κενή.'); return; }
    if (tOut && tBack && cmd.from === cmd.to && tBack <= tOut) { setErr('Την ίδια μέρα η ' + timeNames(cmd.type).to + ' πρέπει να είναι μετά την ' + timeNames(cmd.type).from + '.'); return; }
    // επικάλυψη ή «δεν βγαίνει έξοδο»: προειδοποίηση και επιβεβαίωση, όχι απαγόρευση (Michael, 17/10)
    const p = planStatusChanges(base, cmds, today);
    const warn = [...p.overlaps.map((o, i) => html`<span key=${'o' + i}><br/><b>${shortName(pm.get(o.pid)!)}</b> έχει ήδη ${statusLbl(o.status, state.settings.lists)} ${dm(o.status.from)}–${dm(o.status.to)}</span>`),
      ...p.blocked.map(b => html`<span key=${'b' + b.pid}><br/><b>${shortName(pm.get(b.pid)!)}</b> δεν βγαίνει έξοδο (${dayName(b.date, today).toLowerCase()}): ${b.reason}</span>`)];
    if (warn.length && !ack) { setAck(true); setErr(html`<b>Προσοχή:</b>${warn}<br/>Πάτα ξανά «Συνέχεια» για να το δηλώσεις παρ' όλα αυτά, ή άλλαξε άτομα και ημερομηνίες.`); return; }
    setStep(4);
  };
  const names = medPicks.length > 1 ? medPicks.map(x => x.short).join(' + ') : med ? med.name : t.label;
  const apply = async () => {
    if (!(await run(fix ? { t: 'replaceStatus', id: fix.id, cmds } : cmds.length > 1 ? { t: 'declareMany', cmds } : { t: 'declare', cmd: full }, false))) return;
    onClose();
    const w = cmd.pids.length === 1 ? shortName(pm.get(cmd.pids[0])!) : cmd.pids.length + ' άτομα';
    const acts = [undoMark()];
    if (plan && plan.conflicts.length) acts.unshift({ label: 'Βρες αντικαταστάτη', fn: () => nav.go('guard', { guardDate: plan.conflicts[0].date }) });
    toast({ text: (fix ? 'Διορθώθηκε ' + (cmd.type === 'PUN' ? 'η ποινή' : names) + ': ' : cmd.type === 'PUN' ? 'Ποινή: ' : 'Δηλώθηκε ' + names + ': ') + w, actions: acts });
  };
  const outPick = useCallback((p: Person) => outBlock(state, cmd.from, p.id), [state, cmd.from]);
  const curKey = hasKind ? cmd.type + ':' + cmd.kind : med ? 'm:' + med.name : cmd.type;
  const cur = picks.find(x => x.key === curKey);
  const [q, setQ] = useState(''); const [catF, setCatF] = useState<string>(initial.cat || ''); const [picked, setPicked] = useState(!!initial.type);
  const shown = picks.filter(x => (!catF || x.cat === catF || (catF === 'med' && x.cat === 'other')) && (!q.trim() || normGreek(x.short + ' ' + x.long + ' ' + CAT_NAME[x.cat]).includes(normGreek(q))));
  // σε κάθε βήμα ο κέρσορας πάει στο πεδίο του (αναζήτηση στρατιώτη, αναζήτηση κατάστασης)
  useEffect(() => { (document.querySelector('.ui-dialog [data-autofocus]') as HTMLElement | null)?.focus(); }, [step]);
  // μη ιατρικό: μία επιλογή και πας στο «Πότε»· ιατρικό: μπαίνει ή βγαίνει από τα επιλεγμένα
  const choose = (x: StatusPick) => {
    setErr(null); setAck(false);
    if (x.cat !== 'med') { setPicked(true); setMedSel([]); setCmd(c => ({ ...c, type: x.type, kind: x.kind || '' })); setStep(cmd.pids.length ? 3 : 1); return; }
    const sel = medSel.includes(x.key) ? medSel.filter(k => k !== x.key) : [...(t.cat === 'med' ? medSel : []), x.key];
    setMedSel(sel); setPicked(sel.length > 0);
    const first = picks.find(y => sel.includes(y.key));
    if (first) setCmd(c => ({ ...c, type: first.type, kind: first.kind || '' }));
  };
  const toStatus = () => { if (!cmd.pids.length) { setErr('Διάλεξε ποιον αφορά η δήλωση. Γράψε τα πρώτα γράμματα του επωνύμου.'); return; } setErr(null); setStep(picked ? 3 : 2); };
  const toDates = () => { if (!medPicks.length) { setErr('Διάλεξε ένα ή περισσότερα ιατρικά.'); return; } setErr(null); setStep(cmd.pids.length ? 3 : 1); };
  const desc = html`${order.map((n, i) => html`<span key=${n}>${i > 0 && ' › '}<span style=${{ fontWeight: step === n ? 700 : 400 }}>${i + 1} ${STEPS[n - 1]}</span></span>`)}`;
  const who = cmd.pids.length === 1 && pm.get(cmd.pids[0]) ? fullName(pm.get(cmd.pids[0])!) : cmd.pids.length + ' άτομα';
  // με διαλεγμένο άτομο: Esc, ✕ και κλικ έξω ρωτούν πριν πεταχτεί η δήλωση
  const dirty = cmd.pids.length > 0 && (fix ? 'Η διόρθωση δεν αποθηκεύτηκε. Αν κλείσεις, μένει όπως ήταν.' : 'Η δήλωση δεν αποθηκεύτηκε. Αν κλείσεις, χάνονται όσα διάλεξες.');
  const stBadges = medPicks.length > 1 ? html`${medPicks.map((x, i) => html`<span key=${x.key}>${i > 0 && ' + '}<${Badge} tone=${TYPES[x.type].tone}>${x.short}<//></span>`)}` : cur ? html`<${Badge} tone=${TYPES[cur.type].tone}>${cur.short}<//> ${cur.long}` : t.long;
  // τι διάλεξες στα προηγούμενα βήματα, με «Αλλαγή» για να γυρίσεις
  const sum = html`<div className="declsum">
    ${cmd.pids.length > 0 && html`<span><b>${who}</b></span><${Button} variant="link" onClick=${() => { setErr(null); setStep(1); }}>Αλλαγή<//>`}
    ${step === 3 && html`${cmd.pids.length > 0 && html`<span className="declsum__sep">·</span>`}<span>${stBadges}</span><${Button} variant="link" onClick=${() => { setErr(null); setStep(2); }}>Αλλαγή<//>`}</div>`;
  if (step === 1) return html`<${Dialog} title=${ttl} description=${desc} dirty=${dirty} onClose=${onClose} closeOnOverlay=${!cmd.pids.length}
    footer=${html`${statusFirst ? html`<${Button} variant="outline" onClick=${() => { setErr(null); setStep(2); }}>Πίσω<//>` : html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//>`}<${Button} onClick=${toStatus}>${picked ? 'Συνέχεια: Από πότε έως πότε' : 'Συνέχεια: Κατάσταση'}<//>`}>
    <div className="field"><label className="field__label" htmlFor="dsp">${statusFirst ? 'Ποιοι στρατιώτες *' : 'Ποιος στρατιώτης *'} <span className="muted" style=${{ fontWeight: 400 }}>${statusFirst ? '(γράψε επώνυμο και Enter, μετά τον επόμενο)' : '(ένας ή περισσότεροι)'}</span></label>
      <${PersonPicker} id="dsp" multiple=${true} value=${cmd.pids} onChange=${(pids: number[]) => set({ pids })} date=${cmd.from} unavailable=${picked && t.cat === 'out' ? outPick : undefined} onBlocked=${(q: Person, why: string) => { set({ pids: [...cmd.pids, q.id] }); toast({ text: shortName(q) + ': ' + why + '. Μπήκε· θα ζητηθεί επιβεβαίωση.' }); }} autoFocus=${true}/></div>
    ${picked && html`<div className="declsum"><span>${stBadges}</span><${Button} variant="link" onClick=${() => { setErr(null); setStep(2); }}>Αλλαγή<//></div>`}
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
  if (step === 2) return html`<${Dialog} title=${ttl} description=${desc} dirty=${dirty} size="lg" onClose=${onClose} closeOnOverlay=${!cmd.pids.length}
    footer=${html`${statusFirst ? html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//>` : html`<${Button} variant="outline" onClick=${() => { setErr(null); setStep(1); }}>Πίσω<//>`}${medPicks.length > 0 && html`<${Button} onClick=${toDates}>${cmd.pids.length ? 'Συνέχεια: Από πότε έως πότε' : 'Συνέχεια: Στρατιώτες'}${medPicks.length > 1 ? ' (' + medPicks.length + ' ιατρικά)' : ''}<//>`}`}>
    ${cmd.pids.length > 0 && sum}
    <div className="field"><label className="field__label" htmlFor="dsq">Ποια κατάσταση δηλώνεις;</label>
      <input id="dsq" className="ui-input" data-autofocus placeholder="Αναζήτηση, π.χ. ΕΥ, κανονική, κράτηση" value=${q} onChange=${(e: any) => setQ(e.target.value)} onKeyDown=${(e: any) => { if (e.key !== 'Enter') return; e.preventDefault(); if (!q.trim() && medPicks.length) toDates(); else if (shown.length) { choose(shown[0]); setQ(''); } }}/>
      ${catF && html`<span className="field__help">Μόνο ${catF === 'med' ? 'ιατρικά, ΣΤΕΠ και νοσοκομείο' : CAT_NAME[catF].toLowerCase()}. <${Button} variant="link" onClick=${() => setCatF('')}>Δείξε όλες τις καταστάσεις<//></span>`}</div>
    <div className="stpick">${CATS.filter(([c]) => shown.some(x => x.cat === c)).map(([c, l]) => html`<div key=${c}><div className="stpick__cat">${l}${c === 'med' && html`<span className="stpick__hint"> · ένα ή περισσότερα, γράφεται το καθένα σε δική του γραμμή</span>`}</div><div className="stpick__grid">${shown.filter(x => x.cat === c).map(x => {
      const on = c === 'med' ? medSel.includes(x.key) && t.cat === 'med' : picked && x.key === curKey;
      return html`<button key=${x.key} type="button" className=${cx('stpick__opt', on && 'is-on')} aria-pressed=${c === 'med' ? on : undefined} onClick=${() => choose(x)}>
        <span>${c === 'med' && html`<span className=${cx('stpick__box', on && 'is-on')} aria-hidden="true">${on ? '✓' : ''}</span>`}<${Badge} tone=${TYPES[x.type].tone}>${x.short}<//> <b>${x.long}</b></span>${x.help && html`<small>${x.help}</small>`}</button>`; })}</div></div>`)}
      ${!shown.length && html`<span className="muted">Καμία κατάσταση με «${q}».</span>`}</div>
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
  if (step === 3) return html`<${Dialog} title=${ttl} description=${desc} dirty=${dirty} onClose=${onClose} closeOnOverlay=${false}
    footer=${html`<${Button} variant="outline" onClick=${() => { setErr(null); setStep(statusFirst ? 1 : 2); }}>Πίσω<//><${Button} onClick=${next}>Συνέχεια: Τι θα αλλάξει<//>`}>
    ${sum}
    <${DateRangeField} from=${cmd.from} to=${cmd.to} open=${open} onChange=${(from: string, to: string) => set({ from, to })}/>
    ${canOpen(cmd.type) && html`<label className="rule"><input type="checkbox" className="ui-check" checked=${open} onChange=${(e: any) => set({ open: e.target.checked })}/><span><b>Χωρίς λήξη</b><small>Ισχύει μέχρι να πατήσεις «Λήξη νωρίτερα…» στα Ιατρικά. Στο Excel το «έως» μένει κενό.</small></span></label>`}
    ${timed && html`<div className="field"><div className="field-row">
      <${TimeField} id="dpt-out" label=${'Ώρα ' + timeNames(cmd.type).fromG} value=${cmd.fromTime} onChange=${(v: string) => set({ fromTime: v })} help=${'Προαιρετικό · ' + dow(cmd.from) + ' ' + dm(cmd.from)}/>
      ${!open && html`<${TimeField} id="dpt-in" label=${'Ώρα ' + timeNames(cmd.type).toG} value=${cmd.toTime} onChange=${(v: string) => set({ toTime: v })} help=${'Προαιρετικό · ' + dow(cmd.to) + ' ' + dm(cmd.to)}/>`}
    </div><span className="field__help">${timesHelp(state.rules, state.settings)}</span></div>`}
    ${isPun && max > 0 && html`<${Alert} tone="warn"><span>${punLbl(cmd.kind)} πάνω από ${max} ημέρες. Έλεγξε τη διάρκεια.</span><//>`}
    ${dep && html`<span className="note">${daysBetween(cmd.from, cmd.to)} ${daysBetween(cmd.from, cmd.to) === 1 ? 'ημέρα' : 'ημέρες'} στέρηση εξόδου. Οι μέρες με υπηρεσία ή βραδινή εκπαίδευση δεν μετράνε: η λήξη μετακινείται μόνη της.</span>`}
    ${isPun && html`<div className="field-row">
      <div className="field"><label className="field__label" htmlFor="dpby">Ποιος τιμώρησε</label><${Combo} id="dpby" className="ui-input" options=${byList} placeholder="π.χ. ΛΧΙΑ ΔΟΚΙΜΙΟ" value=${cmd.by} onChange=${(e: any) => set({ by: e.target.value })}/></div>
      <div className="field"><label className="field__label" htmlFor="dpon">Ημερομηνία τιμωρίας</label><${DateField} id="dpon" className="ui-input" value=${cmd.on} onChange=${(e: any) => e.target.value && set({ on: e.target.value })}/></div></div>
    <div className="field"><label className="field__label" htmlFor="dprs">Λόγος (διότι…)</label><textarea id="dprs" className="ui-input" rows="2" placeholder="π.χ. απουσίαζε από το προσκλητήριο" value=${cmd.reason} onChange=${(e: any) => set({ reason: e.target.value })}></textarea><span className="field__help">Βγαίνει έτοιμο κείμενο για το Word στα «Ιατρικά και ποινές». Τον τιμωρήσαντα γράψε τον σε αιτιατική («ΛΧΙΑ ΔΟΚΙΜΙΟ») και στην ${HK()} μπαίνει «ΑΠΟ ΤΟΝ ΛΧΙΑ ΔΟΚΙΜΙΟ»· για γυναίκα γράψε «την …» μπροστά.</span></div>`}
    <div className="field"><label className="field__label" htmlFor="dsn">${isPun ? 'Παρατήρηση' : 'Παρατήρηση (λόγος)'}</label><input id="dsn" className="ui-input" placeholder=${isPun ? 'Προαιρετικό, π.χ. αριθμός διαταγής' : 'Προαιρετικό, π.χ. γιατί ή αριθμός διαταγής'} value=${cmd.note} onChange=${(e: any) => set({ note: e.target.value })}/></div>
    ${err && html`<${Alert} tone=${ack ? 'warn' : 'bad'}><span>${err}</span><//>`}
  <//>`;
  const one = cmd.pids.length === 1 && pm.get(cmd.pids[0]);
  // μία γραμμή στα Ιατρικά για κάθε ιατρικό και κάθε στρατιώτη
  const rows = medPicks.length * cmd.pids.length > 1 ? medPicks.flatMap(x => cmd.pids.map(pid => ({ x, pid }))) : [];
  return html`<${Dialog} title="Τι θα αλλάξει" description=${desc} dirty=${dirty} onClose=${onClose} closeOnOverlay=${false}
    footer=${html`<${Button} variant="outline" onClick=${() => setStep(3)}>Πίσω<//><${Button} onClick=${apply}>Αποθήκευση<//>`}>
    ${fix && html`<${Alert} tone="info"><span>Η παλιά καταχώρηση (${fix.type === 'PUN' ? 'ποινή ' + punLbl(fix.kind) : statusLbl(fix, state.settings.lists)}, ${fix.open ? 'από ' + dm(fix.from) + ' χωρίς λήξη' : fix.from === fix.to ? dm(fix.from) : dm(fix.from) + '–' + dm(fix.to)}) φεύγει και στη θέση της γράφεται η παρακάτω.</span><//>`}
    <p style=${{ margin: 0 }}>${fix ? 'Γράφεται' : 'Δηλώνεις'} ${medPicks.length > 1 ? stBadges : html`<${Badge} tone=${t.tone}>${hasKind ? (cmd.type === 'PUN' ? 'Ποινή: ' + punLbl(cmd.kind) : 'Άδεια: ' + cmd.kind) : med ? med.name + (med.warn ? '' : ' (σαν ' + t.label + ')') : t.long}<//>`} ${one ? html`τον <b>${fullName(one)}</b> του ${one.father}` : html`<b>${cmd.pids.length} άτομα</b> (${cmd.pids.map(id => shortName(pm.get(id)!)).join(', ')})`}, ${open ? html`από <b>${dow(cmd.from)} ${dm(cmd.from)}</b>, <b>χωρίς λήξη</b>` : cmd.from === cmd.to ? html`<b>${dayName(cmd.from, today).toLowerCase()} ${dm(cmd.from)}</b>` : html`από <b>${dow(cmd.from)} ${dm(cmd.from)}</b> έως <b>${dow(cmd.to)} ${dm(cmd.to)}</b>`}${timesTxt(full) ? ' (' + timesTxt(full) + ')' : ''}.</p>
    ${rows.length > 0 && html`<div className="field"><span className="field__label">Γράφονται ${rows.length} γραμμές στα Ιατρικά, μία για κάθε ${medPicks.length > 1 ? 'ιατρικό' : 'στρατιώτη'}${medPicks.length > 1 && cmd.pids.length > 1 ? ' και στρατιώτη' : ''}</span><ul className="declrows">${rows.slice(0, 12).map(r => html`<li key=${r.x.key + r.pid}><${Badge} tone=${TYPES[r.x.type].tone}>${r.x.short}<//> ${fullName(pm.get(r.pid)!)} · ${open ? dm(cmd.from) + ' – χωρίς λήξη' : cmd.from === cmd.to ? dm(cmd.from) : dm(cmd.from) + '–' + dm(cmd.to)}${cmd.note ? ' · ' + upper(cmd.note) : ''}</li>`)}</ul>${rows.length > 12 && html`<span className="muted">και άλλες ${rows.length - 12}</span>`}</div>`}
    ${depEnds.length > 0 && html`<${Alert} tone="info"><span>${depEnds.map((x, i) => html`<span key=${x.pid}>${i > 0 && html`<br/>`}<b>${shortName(pm.get(x.pid)!)}</b> λήγει <b>${dow(x.to)} ${dm(x.to)}</b>, γιατί έχει υπηρεσία ή βραδινή εκπαίδευση μέσα στις μέρες της ποινής.</span>`)}</span><//>`}
    ${plan && plan.files.length > 0 && html`<div className="field"><span className="field__label">Επηρεάζει</span><${ChangePlanList} plan=${plan}/></div>`}
    ${plan && plan.conflicts.length > 0 && html`<${Alert} tone="warn">Μετά την αποθήκευση θα σου προταθεί αντικαταστάτης στις Υπηρεσίες.<//>`}
    ${plan && (plan.past.length > 0 || unlock) && html`<label className="rule"><input type="checkbox" className="ui-check" checked=${unlock} onChange=${(e: any) => setUnlock(e.target.checked)}/><span><b>Ξεκλείδωσε τις περασμένες μέρες</b><small>Βγαίνει και από υπηρεσίες που έχουν ήδη γίνει (π.χ. διόρθωση λάθους). Αλλιώς αυτές μένουν όπως έγιναν.</small></span></label>`}
    ${plan && plan.alongside.length > 0 && html`<${Alert} tone="info"><span>${plan.alongside.map((a, i) => html`<span key=${i}>${i > 0 && html`<br/>`}<b>${shortName(pm.get(a.pid)!)}</b> έχει ήδη ${statusLbl(a.status, state.settings.lists)} ${a.status.open ? 'χωρίς λήξη' : dm(a.status.from) + '–' + dm(a.status.to)}.</span>`)}<br/>Ισχύουν και τα δύο· στις υπηρεσίες και στην έξοδο μετρά ο πιο αυστηρός περιορισμός.</span><//>`}
    ${RECORD_CATS.includes(t.cat) && cmd.type !== 'PUN' && html`<span className="note">${open ? 'Χωρίς λήξη: μένει μέχρι να πατήσεις «Λήξη νωρίτερα…» στα Ιατρικά.' : 'Στις ' + dm(addDays(cmd.to, 1)) + ' αφαιρείται αυτόματα και γράφεται στο Ιστορικό.'}</span>`}
    ${ack && html`<${Alert} tone="warn"><span>Δηλώνεται παρά την προειδοποίηση (επικάλυψη ή «δεν βγαίνει έξοδο»).</span><//>`}
    <span className="note">Μπορείς να το αναιρέσεις αμέσως μετά ή από το Ιστορικό.</span>
  <//>`;
}
