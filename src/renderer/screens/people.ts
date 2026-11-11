// features/people και features/status: προσωπικό, καρτέλα ατόμου, δήλωση κατάστασης
import { RkName, rkOn, rkShort } from '../rankName';
import { HK, UNIT } from '../../shared/unit';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { html, cx, Badge, Button, Why, Dialog, Icon, PageHeader, Segmented, Strip, Tabs, VirtualList, useMedia, useToast, useViewportHeight } from '../ui';
import { Select } from '../select';
import { useNav, useOpenFrom, useStore, searchPeople } from '../store';
import { ActiveFilter, SigsMenu } from '../common';
import type { Sig } from '../../shared/sigs';
import { live, isAway, rankTxt, type UserLists } from '../../shared/ranks';
import { TYPES, KIND_LBL, KIND_NAME, plainName, unitOf, roomTxt, platoonsOf, platoonShort, type DutyKind, type Person, type SavedView, type TypeKey, type Status } from '../../shared/domain';
import { statusesAt, baseTotal, personMap, statusesOn, strengthAt } from '../../shared/rules';
import { addDays, dayName, dm } from '../../shared/dates';

import { EditPersonDialog, NewPersonDialog } from '../features/person-edit';
import { QuickAddDialog } from './quickAdd';
import { DeclareStatusDialog } from '../features/declare-status';
import { StatusFixDialog } from '../features/fix-status';
import { LeaveEndDialog, LeaveTimesDialog, leaveStarted } from '../features/leave-end';
import { siOf, siShort } from '../../shared/si';
import { ROSTER_FILTERS, filterStatus, rosterMatch, statusKind, type RosterFilter } from '../../shared/rosterLists';
import { collator, normGreek } from '../../shared/text';
import { useRowH } from '../prefs';
import { useNowMin } from '../clock';
import { NoteDot } from './notes';
import { ImerTab } from './imerologio';
import { noteIndex } from '../../shared/notes';
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

// Deprecated paths: these dialogs moved to renderer/features/ (Phase 5.3b); removed in Phase 7.
export { DeclareStatusDialog, StatusFixDialog, LeaveEndDialog, LeaveTimesDialog, leaveStarted };

// Deprecated path: these two dialogs moved to features/person-edit (Phase 5.3c). Removed in Phase 7.
export { EditPersonDialog, NewPersonDialog };

// Deprecated path: PersonSheet moved to widgets/person-sheet (Phase 5.3c). Removed in Phase 7.
export { PersonSheet } from '../widgets/person-sheet';
