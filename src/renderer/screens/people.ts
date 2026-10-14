// features/people και features/status: προσωπικό, καρτέλα ατόμου, δήλωση κατάστασης
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Dialog, Icon, PageHeader, Segmented, Sheet, Strip, Tabs, VirtualList, useMedia, useToast, useViewportHeight } from '../ui';
import { useNav, useStore, searchPeople } from '../store';
import { ActiveFilter, ChangePlanList, ChoiceField, DateRangeField, PersonPicker, StatusBadge, TIMES_HELP, TimeField } from '../common';
import { hasTimes, normTime, timesTxt } from '../../shared/hours';
import { listOf, medKinds, optionsOf, statusLbl } from '../../shared/ranks';
import { TYPES, TYPE_KEYS, RECORD_CATS, CAP_KINDS, CAP_ACC, KIND_LBL, KIND_NAME, WEEK, blocksOf, effects, fullName, plainName, shortName, unitOf, roomTxt, type DutyKind, type Person, type SavedView, type TypeKey, type Status } from '../../shared/domain';
import { baseTotal, capsOf, dutyBlock, dutyStats, emptyStat, holName, outBlock, personMap, planStatusChange, postBy, postsOf, statusesOn } from '../../shared/rules';
import { statIsUnarmed, statNoDuty, STAT_ROWS } from '../../shared/stat';
import { addDays, daysBetween, dayName, dm, dow, DOW, DOW_FULL } from '../../shared/dates';
import { deprivationEnd, isDeprivation, overMax, punBySuggestions, punLbl } from '../../shared/punish';
import { CadreView } from './cadre';
import { SiField } from './si';
import { siOf } from '../../shared/si';
import { RequestDialog } from './other';
import { collator, normGreek } from '../../shared/text';
import { useRowH } from '../prefs';
type P = any;

const CATS: [string, string][] = [['med', 'Ιατρικά'], ['abs', 'Απουσίες'], ['out', 'Έξοδος'], ['other', 'Άλλα'], ['pun', 'Ποινή']];

const PersonRow = memo(function PersonRow({ p, odd, style, statuses, lists, today, duty, checked, selected, onToggle, onOpen }: P) {
  return html`<div className=${cx('ptable__row', odd && 'is-odd', selected && 'is-sel')} style=${style} role="row" tabIndex="0" onClick=${() => onOpen(p.id)} onKeyDown=${(e: any) => { if (e.key === 'Enter') onOpen(p.id); }}>
    <span onClick=${(e: any) => e.stopPropagation()}><input type="checkbox" className="ui-check" checked=${checked} aria-label=${'Επιλογή ' + fullName(p)} onChange=${() => onToggle(p.id)}/></span>
    <span><b>${plainName(p)}</b>${p.post && html` <${Badge} tone="outline" data-tip="Πόστο: δεν μπαίνει σε υπηρεσίες εκτός από Λ/Υ και Δ/Υ">${p.post}<//>`}</span><span>${p.father}</span><span>${p.rank}</span><span>${unitOf(p)}</span><span>${roomTxt(p)}</span><span className="num">${duty}</span>
    <span><${StatusBadge} statuses=${statuses} pid=${p.id} date=${today} lists=${lists}/></span></div>`;
});
const PersonCard = memo(function PersonCard({ p, style, statuses, lists, today, checked, onToggle, onOpen }: P) {
  return html`<div className="pcard" style=${style} onClick=${() => onOpen(p.id)}>
    <span onClick=${(e: any) => e.stopPropagation()}><input type="checkbox" className="ui-check" checked=${checked} aria-label=${'Επιλογή ' + fullName(p)} onChange=${() => onToggle(p.id)}/></span>
    <div><b>${plainName(p)}</b><small>του ${p.father} · ${p.rank} · ${unitOf(p)} · ${roomTxt(p)}${p.post ? ' · πόστο ' + p.post : ''}</small></div>
    <${StatusBadge} statuses=${statuses} pid=${p.id} date=${today} lists=${lists}/></div>`;
});

type Filt = { unit: string; room: number | null; filter: string };
const DEF_SORT = { k: 'last', dir: 1 };
export function PeopleScreen() {
  const { state, today, run, undoMark } = useStore(); const nav = useNav(); const toast = useToast(); const mobile = useMedia('(max-width: 767px)');
  const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  // φίλτρα στα params της οθόνης, ώστε να τα θυμάται όταν γυρνάς (Shell)
  const filter: string = nav.params.filter || 'all'; const unit: string = nav.params.unit || 'all'; const room: number | null = nav.params.room ?? null;
  const date: string = nav.params.pdate && nav.params.pdate >= today ? nav.params.pdate : today;
  const sort: { k: string; dir: number } = nav.params.sort || DEF_SORT;
  const setFilter = (f: string) => nav.set({ filter: f }); const setUnit = (u: string) => nav.set({ unit: u, room: room != null && u !== 'all' && unitOf({ room } as Person) !== u ? null : room });
  const setRoom = (r: number | null) => nav.set({ room: r, unit: r != null && unit !== 'all' && unitOf({ room: r } as Person) !== unit ? 'all' : unit });
  const [selected, setSelected] = useState(() => new Set<number>());
  const [saving, setSaving] = useState(false); const [adding, setAdding] = useState(false);
  const ds = dutyStats(state);
  const FILTERS: [string, string][] = [['all', 'Όλοι'], ['present', 'Παρόντες'], ['absent', 'Απόντες'], ...TYPE_KEYS.map(k => [k, TYPES[k].label] as [string, string]), ['dnright', 'Με δικαίωμα ΔΝ'], ['post', 'Με πόστο'], ['inactive', 'Εκτός δύναμης']];
  const UNITS = [{ value: 'all', label: 'Όλη η Ίλη' }, { value: '1ος Ουλ.', label: '1ος Ουλ.', tip: 'Θάλαμοι 1–4' }, { value: '2ος Ουλ.', label: '2ος Ουλ.', tip: 'Θάλαμοι 5–8' }];
  const days = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(today, i)), [today]);
  const active = useMemo(() => state.people.filter(p => p.active), [state.people]);
  const total = active.length;
  const views = state.settings.views || [];
  // καταστάσεις της ημερομηνίας, μία φορά ανά άτομο (με το ευρετήριο των κανόνων)
  const ssOf = useMemo(() => { const m = new Map<number, Status[]>(); active.forEach(p => m.set(p.id, statusesOn(state.statuses, p.id, date))); return m; }, [active, state.statuses, date]);
  const place = (p: Person, f: Filt) => (f.unit === 'all' || unitOf(p) === f.unit) && (f.room == null || p.room === f.room);
  const matches = useCallback((p: Person, f: Filt) => {
    if (!place(p, f)) return false;
    if (f.filter === 'inactive') return true;
    const ss = ssOf.get(p.id) || []; const away = ss.some(s => TYPES[s.type].away);
    if (f.filter === 'all') return true; if (f.filter === 'present') return !away; if (f.filter === 'absent') return away; if (f.filter === 'dnright') return !!p.dn; if (f.filter === 'post') return !!p.post;
    if ((TYPES as any)[f.filter]) return ss.some(s => s.type === f.filter); return unitOf(p) === f.filter;
  }, [ssOf]);
  const listFor = useCallback((f: Filt, text: string) => (f.filter === 'inactive' ? state.people.filter(p => !p.active).sort((a, b) => collator.compare(a.last, b.last)) : searchPeople(state.people, text)).filter(p => matches(p, f)), [state.people, matches]);
  // πόσοι ταιριάζουν σε κάθε φίλτρο (στον επιλεγμένο ουλαμό/θάλαμο), για να φαίνεται πριν πατήσεις
  const counts = useMemo(() => {
    const n: Record<string, number> = { all: 0, present: 0, absent: 0, dnright: 0, post: 0, inactive: 0 };
    state.people.forEach(p => {
      if (!place(p, { unit, room, filter: 'all' })) return;
      if (!p.active) { n.inactive++; return; }
      const s = ssOf.get(p.id) || []; n.all++;
      if (s.some(x => TYPES[x.type].away)) n.absent++; else n.present++;
      if (p.dn) n.dnright++; if (p.post) n.post++;
      new Set(s.map(x => x.type)).forEach(t => { n[t] = (n[t] || 0) + 1; });
    });
    return n;
  }, [state.people, ssOf, unit, room]);
  const rooms = useMemo(() => { const m = new Map<number, number>(); active.forEach(p => { if (p.room != null) m.set(p.room, (m.get(p.room) || 0) + 1); }); return [...m].sort((a, b) => a[0] - b[0]); }, [active]);
  const viewN = useMemo(() => views.map(v => listFor(v, v.q).length), [views, listFor]);
  const curView = views.find(v => v.unit === unit && v.room === room && v.filter === filter && normGreek(v.q) === normGreek(dq.trim()));
  const rows = useMemo(() => {
    let r = listFor({ unit, room, filter }, dq);
    const val = (p: Person) => sort.k === 'unit' ? unitOf(p) : sort.k === 'room' ? String(p.room ?? 99).padStart(2, '0') : String((p as any)[sort.k] ?? '');
    if (!dq || sort.k !== 'last' || sort.dir !== 1) r = [...r].sort((a, b) => (sort.k === 'duty' ? (ds.get(a.id)?.total || 0) - (ds.get(b.id)?.total || 0) : collator.compare(val(a), val(b)) || collator.compare(a.first, b.first)) * sort.dir);
    return r;
  }, [dq, filter, unit, room, sort, listFor, ds]);
  const toggle = useCallback((id: number) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const open = useCallback((id: number) => nav.openPerson(id), [nav.openPerson]);
  const height = useViewportHeight(mobile ? 330 : 300);
  const rowH = useRowH(40, 32);
  const H = (k: string, l: string) => html`<button type="button" aria-sort=${sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'} onClick=${() => nav.set({ sort: sort.k === k ? { k, dir: -sort.dir } : { k, dir: 1 } })}>${l}${sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button>`;
  const allSel = rows.length > 0 && rows.every(p => selected.has(p.id));
  const clear = () => { setQ(''); nav.set({ filter: 'all', unit: 'all', room: null, pdate: undefined }); };
  const applyView = (v: SavedView) => { if (curView === v) { clear(); return; } setQ(v.q); nav.set({ unit: v.unit, room: v.room, filter: v.filter }); };
  const delView = async (v: SavedView) => { if (await run({ t: 'setSettings', settings: { views: views.filter(x => x.id !== v.id) }, text: 'διαγραφή λίστας «' + v.name + '»' }, false)) toast({ text: 'Διαγράφηκε η λίστα «' + v.name + '»', actions: [undoMark()] }); };
  const dateLbl = date === today ? '' : dayName(date, today);
  const filtered = unit !== 'all' || room != null || filter !== 'all' || !!dq.trim();
  const ptab = nav.params.peopleTab || 'soldiers';
  const tabs = html`<div style=${{ marginBottom: '12px' }}><${Tabs} value=${ptab} onChange=${(v: string) => nav.set({ peopleTab: v })} items=${[{ value: 'soldiers', label: 'Οπλίτες (' + total + ')' }, { value: 'cadre', label: 'Στελέχη (' + state.cadreList.length + ')' }]}/></div>`;
  if (ptab === 'cadre') return html`<${CadreView} tabs=${tabs}/>`;
  const dateSel = html`<select className="hdsel" aria-label="Κατάσταση στην ημερομηνία" value=${date} onChange=${(e: any) => nav.set({ pdate: e.target.value === today ? undefined : e.target.value })}>${days.map(d => html`<option key=${d} value=${d}>${dayName(d, today)}</option>`)}</select>`;
  return html`<div>
    <${PageHeader} title="Προσωπικό" sub=${'Δύναμη Ίλης: ' + total + ' άτομα. Πάτα σε γραμμή για στοιχεία, ή επίλεξε πολλούς για μαζική δήλωση.'}>
      <${Button} variant="outline" onClick=${() => setAdding(true)} data-tip="Γράφεται και στο Δυναμολόγιο, αν έχει οριστεί στα Αρχεία Excel">+ Νέος στρατιώτης<//>
      <${Button} variant="outline" onClick=${() => nav.go('templates', { tab: 'import' })}>Εισαγωγή Δυναμολογίου<//>
      <${Button} onClick=${() => nav.declare({})} data-tip="Ιατρικά, άδεια, έξοδος, ΔΝ, ποινή… (Ctrl+N)" data-tip-side="left">+ Δήλωσε κατάσταση<//><//>
    ${tabs}
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση στη λίστα" placeholder="Όνομα, ΑΣΜ, βαθμός, ρόλος, πόστο, ΕΣΣΟ (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${Segmented} small=${true} value=${unit} onChange=${setUnit} items=${UNITS}/>
      <select className="ui-select" aria-label="Θάλαμος" value=${room == null ? '' : String(room)} onChange=${(e: any) => setRoom(e.target.value ? +e.target.value : null)}>
        <option value="">Όλοι οι θάλαμοι</option>${rooms.map(([r, n]) => html`<option key=${r} value=${String(r)}>Θάλαμος ${r} · ${n}</option>`)}</select>
      ${mobile && dateSel}</div>
    <div className="filters"><${Strip} role="group" aria-label="Γρήγορα φίλτρα">${FILTERS.filter(([k]) => k === filter || k === 'all' || k === 'present' || k === 'absent' || counts[k] > 0).map(([k, l], i, a) => html`<button key=${k} type="button" className=${cx('ui-chip', i > 0 && a[i - 1][0] === 'absent' && 'ui-chip--gap')} aria-pressed=${!curView && filter === k} data-tip=${(TYPES as any)[k] ? TYPES[k as TypeKey].long + (dateLbl ? ' · ' + dateLbl.toLowerCase() : '') : undefined} onClick=${() => setFilter(filter === k && k !== 'all' ? 'all' : k)}>${l}<span className="cnt">${counts[k] || 0}</span></button>`)}
      ${views.map((v, i) => html`<button key=${v.id} type="button" className=${cx('ui-chip', 'ui-chip--view', i === 0 && 'ui-chip--gap')} aria-pressed=${curView === v} data-tip="Αποθηκευμένη λίστα" onClick=${() => applyView(v)}>${Icon.star}${v.name}<span className="cnt">${viewN[i]}</span></button>`)}<//>
      <${ActiveFilter} parts=${curView ? ['★ ' + curView.name] : [unit !== 'all' && unit, room != null && 'Θάλαμος ' + room, filter !== 'all' && (FILTERS.find(([k]) => k === filter) || [, filter])[1], filter !== 'all' && dateLbl, dq.trim() && '«' + dq.trim() + '»']} onClear=${clear}
        extra=${curView ? html`<button type="button" className="actfilter__act" onClick=${() => delView(curView)} data-tip="Σβήνει τη λίστα (όχι τους ανθρώπους)">Διαγραφή λίστας</button>` : filtered && html`<button type="button" className="actfilter__act" onClick=${() => setSaving(true)} data-tip="Κράτα αυτό το φίλτρο ως λίστα με όνομα, π.χ. «Θαλαμάρχες»">☆ Αποθήκευση</button>`}/>
      <span className="toolbar__count">${rows.length} από ${filter === 'inactive' ? counts.inactive : total}</span></div>
    ${selected.size > 0 && html`<div className="bulkbar"><span>${selected.size} επιλεγμένοι</span>
      <${Button} size="sm" onClick=${() => nav.declare({ pids: [...selected], type: 'OUT', from: today, to: today })}>Εξοδούχοι σήμερα<//>
      <${Button} size="sm" variant="secondary" onClick=${() => nav.declare({ pids: [...selected], type: 'DN', from: today, to: today })} data-tip="Εξοδούχοι με διανυκτέρευση">ΔΝ σήμερα<//>
      <${Button} size="sm" variant="secondary" onClick=${() => nav.declare({ pids: [...selected] })}>Άλλη δήλωση…<//>
      <${Button} size="sm" variant="ghost" onClick=${() => setSelected(new Set())}>Καθάρισε<//></div>`}
    ${rows.length === 0 ? html`<div className="ui-card empty">${total === 0 ? html`Δεν υπάρχει ακόμα προσωπικό. <${Button} variant="link" onClick=${() => nav.go('templates', { tab: 'import' })}>Κάνε εισαγωγή από το Δυναμολόγιο<//>` : html`Κανείς δεν ταιριάζει. <${Button} variant="link" onClick=${clear}>Καθάρισε αναζήτηση και φίλτρα<//>`}</div>` :
    mobile ? html`<div className="ui-card" style=${{ overflow: 'hidden' }}><${VirtualList} items=${rows} rowHeight=${68} height=${height} renderRow=${(p: Person, _i: number, style: P) => html`<${PersonCard} key=${p.id} p=${p} style=${style} statuses=${state.statuses} lists=${state.settings.lists} today=${date} checked=${selected.has(p.id)} onToggle=${toggle} onOpen=${open}/>`}/></div>` :
    html`<div className="ptable" role="table" aria-rowcount=${rows.length}><div style=${{ overflowX: 'auto' }}><div style=${{ minWidth: '736px' }}>
      <div className="ptable__head" role="row"><span><input type="checkbox" className="ui-check" aria-label="Επιλογή όλων" checked=${allSel} onChange=${() => setSelected(allSel ? new Set() : new Set(rows.map(p => p.id)))}/></span>${H('last', 'Ονοματεπώνυμο')}${H('father', 'Πατρώνυμο')}${H('rank', 'Βαθμός')}${H('unit', 'Ουλαμός')}${H('room', 'Θάλαμος')}${H('duty', 'Υπηρ.')}<span>${dateSel}</span></div>
      <${VirtualList} items=${rows} rowHeight=${rowH} height=${height} resetKey=${filter + '|' + unit + '|' + room + '|' + dq + '|' + sort.k + sort.dir} renderRow=${(p: Person, i: number, style: P) => html`<${PersonRow} key=${p.id} p=${p} odd=${i % 2 === 1} style=${style} statuses=${state.statuses} lists=${state.settings.lists} today=${date} duty=${ds.get(p.id)?.total || 0} checked=${selected.has(p.id)} selected=${nav.params.person === p.id} onToggle=${toggle} onOpen=${open}/>`}/>
    </div></div></div>`}
    ${adding && html`<${NewPersonDialog} onClose=${() => setAdding(false)}/>`}
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
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} onClick=${() => ok && onSave(name.trim())}>Αποθήκευση<//>`}>
    <div className="field"><label className="field__label" htmlFor="sv-n">Όνομα *</label><input id="sv-n" className="ui-input" data-autofocus="" maxLength="30" placeholder="π.χ. Θαλαμάρχες, Οδηγοί, ΕΣΣΟ Γ΄" value=${name} onChange=${(e: any) => setName(e.target.value)} onKeyDown=${(e: any) => { if (e.key === 'Enter' && ok) onSave(name.trim()); }}/></div>
  <//>`;
}

// «Τι κάνει»: μία γραμμή με το αποτέλεσμα και συντομεύσεις που γράφουν στα ίδια κουτάκια (δυνατότητα και μέρες), με μία αναίρεση
const ALL_KINDS = CAP_KINDS.map(([k]) => k);
const SERGEANT = 'Από τον λοχία';
function doesText(p: Person, caps: Partial<Record<DutyKind, string>>): string {
  const off = ALL_KINDS.filter(k => caps[k]);
  const why = [...new Set(off.map(k => caps[k]!))].filter(r => r !== SERGEANT);
  const whyTxt = why.length ? ' (' + why.join(', ') + ')' : '';
  const kinds = !off.length ? 'Όλες τις υπηρεσίες' : off.length === ALL_KINDS.length ? 'Καμία υπηρεσία' + whyTxt
    : off.length > ALL_KINDS.length / 2 ? 'Μόνο ' + ALL_KINDS.filter(k => !caps[k]).map(k => CAP_ACC[k]).join(', ') + whyTxt
    : 'Όλες εκτός από ' + off.map(k => CAP_ACC[k]).join(', ') + whyTxt;
  const days = p.offDays || [];
  const dayTxt = !days.length ? '' : days.length === 2 && days.includes(6) && days.includes(0) ? ' · όχι ΣΚ' : ' · όχι ' + days.map(d => DOW_FULL[d]).join(', ');
  return kinds + dayTxt;
}
function DutyProfile({ p, caps, open, onMore }: P) {
  const { state, run } = useStore(); const toast = useToast();
  const days: number[] = p.offDays || []; const own = state.caps[p.id] || {};
  const offK = (ks: DutyKind[]) => ks.every(k => caps[k]);
  const hasOwn = Object.values(own).some(Boolean) || days.length > 0;
  const go = async (cmd: { off?: DutyKind[]; on?: DutyKind[]; days?: number[]; reset?: boolean }, text: string) => {
    if (await run({ t: 'setDutyProfile', pid: p.id, ...cmd, text }, false)) toast({ text: shortName(p) + ': ' + text + '. Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση.' });
  };
  const toggleDays = (ds: number[], label: string) => {
    const on = ds.every(d => days.includes(d));
    return { on, fn: () => go({ days: on ? days.filter(d => !ds.includes(d)) : [...new Set([...days, ...ds])] }, on ? 'ξανά υπηρεσία ' + label : 'όχι υπηρεσία ' + label) };
  };
  const sat = toggleDays([6], 'Σάββατο'), we = toggleDays([6, 0], 'ΣΚ');
  const armedK: DutyKind[] = ['op', 'sk'], restK = ALL_KINDS.filter(k => k !== 'mg');
  const unarmed = offK(armedK), onlyMg = offK(restK) && !caps.mg;
  const presets = [
    { lbl: 'Όχι Σάββατο', on: sat.on, fn: sat.fn, tip: 'Καμία υπηρεσία που ξεκινά Σάββατο' },
    { lbl: 'Όχι ΣΚ', on: we.on, fn: we.fn, tip: 'Καμία υπηρεσία που ξεκινά Σάββατο ή Κυριακή' },
    { lbl: 'Όχι σκοπιά/οπλοφύλακα', on: unarmed, fn: () => go(unarmed ? { on: armedK } : { off: armedK }, unarmed ? 'ξανά σκοπιά και οπλοφύλακας' : 'όχι σκοπιά και οπλοφύλακας'), tip: unarmed && armedK.some(k => caps[k] !== SERGEANT) ? 'Το ορίζει ' + caps.sk + ': αλλάζει από τη Σ.Ι.' : 'Μόνο θαλαμοφύλακας, μαγειρεία, ΤΑΕ, άλλες' },
    { lbl: 'Μόνο μαγειρεία', on: onlyMg, fn: () => go(onlyMg ? { on: restK } : { off: restK, on: ['mg'] }, onlyMg ? 'ξανά όλες οι υπηρεσίες' : 'μόνο μαγειρεία'), tip: 'Μπαίνει μόνο στα μαγειρεία' }
  ];
  return html`<div className="does">
    <p className="does__txt">${doesText(p, caps)}</p>
    <div className="does__presets" role="group" aria-label="Συντομεύσεις">${presets.map(x => html`<button key=${x.lbl} type="button" className="ui-chip ui-chip--sm" aria-pressed=${x.on} data-tip=${x.tip} onClick=${x.fn}>${x.lbl}<//>`)}
      ${hasOwn && html`<button type="button" className="ui-chip ui-chip--sm ui-chip--view" data-tip="Σβήνει ό,τι όρισες με το χέρι· μένουν μόνο όσα βγαίνουν από τη Σ.Ι. και το πόστο" onClick=${() => go({ reset: true }, 'χωρίς εξαιρέσεις από τον λοχία')}>Καμία εξαίρεση<//>`}
      <${Button} variant="link" onClick=${onMore}>${open ? 'Λιγότερα' : 'Λεπτομέρειες…'}<//></div>
  </div>`;
}

export function PersonSheet({ pid, onClose }: P) {
  const { state, today, run } = useStore(); const nav = useNav(); const toast = useToast();
  const p = personMap(state.people).get(pid);
  const [edit, setEdit] = useState(false); const [baseOpen, setBaseOpen] = useState(false); const [req, setReq] = useState(false);
  const [times, setTimes] = useState<Status | null>(null); const [capMore, setCapMore] = useState(false);
  if (!p) return null;
  const reqs = state.requests.filter(r => r.pid === pid).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const posts = postsOf(state.settings);
  const hist = state.statuses.filter(s => s.pid === pid).sort((a, b) => b.from.localeCompare(a.from));
  const dd = dutyStats(state).get(pid) || emptyStat();
  const duties = dd.log.slice().reverse().slice(0, 12).map(e => ({ d: e.d, x: e.k ? posts.find(q => q.k === e.k) || postBy(state, e.k) : undefined, kind: e.kind, h: e.h }));
  const base = state.baseline[pid]; const nBase = baseTotal(base);
  const caps = capsOf(state, pid);
  const ob = outBlock(state, today, pid);
  // ΕΑ/ΕΥ/ΕΟ/ΕΑΡΒ/ΣΤΕΠ όπως ορίζει ο πίνακας καταστάσεων· οι άλλες (άδειες, έξοδοι) όπως πριν
  const lists = state.settings.lists; const bl = (blocksOf(state.settings) || state.settings.blocks).filter(b => !b.hidden);
  const ssT = statusesOn(state.statuses, pid, today).filter(x => STAT_ROWS.includes(x.type)); const rest = state.statuses.filter(x => !STAT_ROWS.includes(x.type));
  const noDutyT = ssT.some(x => statNoDuty(x, bl, lists)) || !!dutyBlock(rest, today, pid, { armed: false });
  const unarmedT = ssT.some(x => statIsUnarmed(x, bl.filter(b => b.kind !== 'ly'), lists)) || !!dutyBlock(rest, today, pid, { armed: true });
  const rules = [noDutyT ? 'Καμία υπηρεσία' : unarmedT ? 'Μόνο άοπλες θέσεις' : null, ob ? 'Δεν βγαίνει έξοδο (' + ob + ')' : null].filter(Boolean);
  return html`<${Sheet} onClose=${onClose} title=${html`<h2 style=${{ fontSize: '18px' }}>${plainName(p)}</h2>`} subtitle=${html`<div className="muted" style=${{ fontSize: '13px' }}>του ${p.father || '—'} · ${p.rank} · ${unitOf(p)}${p.active ? '' : ' · ΕΚΤΟΣ ΔΥΝΑΜΗΣ'}</div><div style=${{ marginTop: '6px' }}><${StatusBadge} statuses=${state.statuses} pid=${pid} date=${today} lists=${state.settings.lists}/></div>`}>
    ${rules.length > 0 && html`<${Alert} tone="warn"><span><b>Σήμερα:</b> ${rules.join(' · ')}</span><//>`}
    <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><${Button} onClick=${() => nav.declare({ pids: [pid] })}>Δήλωσε κατάσταση<//><${Button} variant="outline" onClick=${() => nav.declare({ pids: [pid], type: 'DN', from: today, to: today })}>ΔΝ σήμερα<//><${Button} variant="ghost" onClick=${() => setReq(true)}>Νέα αίτηση<//><${Button} variant="ghost" onClick=${() => setEdit(true)}>Διόρθωση στοιχείων<//></div>
    <dl className="kv"><dt>ΑΣΜ</dt><dd className="num">${p.asm || '—'}</dd><dt><abbr data-tip="Έτος/Σειρά Στρατεύσιμων Οπλιτών">ΕΣΣΟ</abbr></dt><dd>${p.essos || '—'}</dd><dt>Ειδικότητα</dt><dd>${p.spec || '—'}</dd><dt>Θάλαμος</dt><dd>${roomTxt(p)} <span className="muted" style=${{ fontSize: '12px' }}>(${unitOf(p)})</span></dd><dt><abbr data-tip="Σωματική ικανότητα (από το Δυναμολόγιο)">Σ.Ι.</abbr></dt><dd>${p.si || '—'}${p.si && p.siCat && siOf(p, state.settings.lists).cat ? ' · ' + siOf(p, state.settings.lists).cat : ''}</dd>${p.post && html`<dt>Πόστο</dt><dd>${p.post}</dd>`}${p.role && html`<dt>Ρόλος</dt><dd>${p.role}</dd>`}<dt>Τηλέφωνο</dt><dd className="num">${p.phone || '—'}</dd>${p.weapon && html`<dt>Όπλο</dt><dd className="num">${p.weapon}</dd>`}
      <dt>Υπηρεσίες</dt><dd><span className="num">${dd.total}</span> <span className="muted" style=${{ fontSize: '12px' }}>(${(Object.keys(dd.byKind).length ? Object.keys(dd.byKind) : ['th', 'mg']).map(k => (KIND_LBL as P)[k] + ' ' + (dd.byKind[k] || 0)).join(' · ')}${nBase ? ' · από αυτές ' + nBase + ' πριν την εφαρμογή' : ''})</span> <${Button} variant="link" onClick=${() => setBaseOpen(true)}>Προηγούμενες…<//></dd><dt>Αργίες / ΣΚ</dt><dd><span className="num">${dd.hol}</span>${dd.lastHol && html` <span className="muted" style=${{ fontSize: '12px' }}>τελευταία ${holName(state.settings, dd.lastHol)} ${dm(dd.lastHol)}</span>`}</dd>${p.notes && html`<dt>Σημειώσεις</dt><dd>${p.notes}</dd>`}</dl>
    <section><h3 style=${{ fontSize: '15px', marginBottom: '6px' }}>Τι κάνει <span className="muted" style=${{ fontWeight: 400, fontSize: '13px' }}>(μόνιμα, όχι με ημερομηνίες)</span></h3>
      <${DutyProfile} p=${p} caps=${caps} open=${capMore} onMore=${() => setCapMore(!capMore)}/>
      ${capMore && html`<div style=${{ marginTop: '10px' }}>
      <div className="capgrid">${CAP_KINDS.map(([k, l]) => { const off = caps[k]; return html`<label key=${k} className=${off ? 'is-off' : ''} data-tip=${off ? 'Δεν κάνει: ' + off : 'Κάνει ' + CAP_ACC[k]}><input type="checkbox" className="ui-check" checked=${!off} onChange=${async (e: any) => { const allowed = e.target.checked; if (await run({ t: 'setCap', pid, kind: k, allowed }, false)) toast({ text: shortName(p) + (allowed ? ' κάνει ' : ' δεν κάνει ') + CAP_ACC[k] + '. Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση.' }); }}/>${l}</label>`; })}</div>
      <div className="capgrid" role="group" aria-label="Μέρες που κάνει υπηρεσία" style=${{ marginTop: '8px' }}><span className="muted" style=${{ fontSize: '13px', alignSelf: 'center' }}>Μέρες:</span>${WEEK.map(d => { const off = (p.offDays || []).includes(d); return html`<label key=${d} className=${off ? 'is-off' : ''} data-tip=${off ? 'Δεν κάνει υπηρεσία ' + DOW_FULL[d] : 'Κάνει υπηρεσία ' + DOW_FULL[d]}><input type="checkbox" className="ui-check" checked=${!off} onChange=${async (e: any) => { const on = e.target.checked; const days = on ? (p.offDays || []).filter(x => x !== d) : [...(p.offDays || []), d]; if (await run({ t: 'setOffDays', pid, days }, false)) toast({ text: shortName(p) + (on ? ' κάνει ξανά υπηρεσία ' : ' δεν κάνει υπηρεσία ') + DOW_FULL[d] + '. Η αυτόματη συμπλήρωση δεν τον βάζει εκείνες τις μέρες· με το χέρι μπαίνει μόνο με αιτία.' }); }}/>${DOW[d]}</label>`; })}</div>
      </div>`}
      <label className="rule" style=${{ marginTop: '8px' }}><input type="checkbox" className="ui-check" checked=${!!p.dn} onChange=${async (e: any) => { const dn = e.target.checked; if (await run({ t: 'updatePerson', person: { ...p, dn } }, false)) toast({ text: shortName(p) + (dn ? ' έχει δικαίωμα ΔΝ' : ' δεν έχει δικαίωμα ΔΝ') }); }}/><span><b>Δικαίωμα ΔΝ</b><small>Μόνιμο. Μόλις οριστεί σε έναν, στους Εξοδούχους το ΔΝ επιτρέπεται μόνο σε όσους το έχουν.</small></span></label>
      ${capMore && html`<p className="note" style=${{ margin: '6px 0 0' }}>Όπως το αρχείο «Δυνατότητα υπηρεσιών». Προεπιλογή από τη Σ.Ι. (Ρυθμίσεις › Σ.Ι.· αρχικά ο Ι3 ΑΟΠΛΟ και ο Ι4 όχι σε ένοπλη υπηρεσία) και το πόστο. Οι μέρες: ξετσέκαρε όσες δεν κάνει καμία υπηρεσία (μετρά η μέρα που ξεκινά η υπηρεσία, 14:00).</p>`}</section>
    <section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Ημερολόγιο υπηρεσιών <span className="muted" style=${{ fontWeight: 400, fontSize: '13px' }}>(τελευταίες 12)</span></h3>${duties.length ? html`<ul className="hist">${duties.map(({ d, x, kind, h }) => html`<li key=${d + (x?.k || kind)}><span className="num">${dow(d)} ${dm(d)}</span>${x ? x.label : KIND_NAME[kind] + ' χωρίς θέση (από Excel)'}${h && html` <${Badge} tone="warn">${holName(state.settings, d)}<//>`}</li>`)}</ul>` : html`<span className="muted">Καμία υπηρεσία ακόμα.</span>`}</section>
    <section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Ιστορικό καταστάσεων</h3>${hist.length ? html`<ul className="hist">${hist.map((s: Status) => html`<li key=${s.id}><${Badge} tone=${TYPES[s.type].tone}>${statusLbl(s, state.settings.lists)}<//><span className="num">${dow(s.from)} ${dm(s.from)}${s.open ? ' – χωρίς λήξη' : s.to !== s.from ? ' – ' + dow(s.to) + ' ' + dm(s.to) : ''}</span><span className="muted">(${daysBetween(s.from, s.to)} ημ.${timesTxt(s) ? ', ' + timesTxt(s) : ''})</span>${hasTimes(s.type) && !s.pending && s.to >= today && html`<${Button} variant="link" onClick=${() => setTimes(s)} data-tip="Ώρα αναχώρησης την πρώτη μέρα και ώρα επιστροφής την τελευταία">Ώρες…<//>`}${s.pending && html`<${Badge} tone="warn">αιτείται<//>`}${s.to < today && RECORD_CATS.includes(TYPES[s.type].cat) && html`<span className="muted" style=${{ fontSize: '12px' }}>έληξε</span>`}</li>`)}</ul>` : html`<span className="muted">Καμία καταχώρηση ακόμα.</span>`}</section>
    ${reqs.length > 0 && html`<section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Αιτήσεις</h3><ul className="hist">${reqs.map(r => html`<li key=${r.id}><span className="num">${dow(r.date)} ${dm(r.date)}</span>αιτείται ${r.text}<${Button} variant="link" onClick=${() => nav.go('hkai', { hkaiDate: r.date })}>ΗΚΑΙ<//></li>`)}</ul></section>`}
    ${edit && html`<${EditPersonDialog} p=${p} onClose=${() => setEdit(false)}/>`}
    ${req && html`<${RequestDialog} req=${{ pid, date: today }} onClose=${() => setReq(false)}/>`}
    ${baseOpen && html`<${BaselineDialog} p=${p} onClose=${() => setBaseOpen(false)}/>`}
    ${times && html`<${LeaveTimesDialog} st=${times} onClose=${() => setTimes(null)}/>`}
  <//>`;
}

// Ώρες μιας άδειας που υπάρχει ήδη (π.χ. ήρθε από το Excel χωρίς ώρες)
function LeaveTimesDialog({ st, onClose }: P) {
  const { state, run, undoMark } = useStore(); const toast = useToast();
  const p = personMap(state.people).get(st.pid)!;
  const [f, setF] = useState({ fromTime: st.fromTime || '', toTime: st.toTime || '' });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const a = normTime(f.fromTime), b = normTime(f.toTime);
    if (a == null || b == null) { setErr('Η ώρα ' + (a == null ? 'αναχώρησης' : 'επιστροφής') + ' δεν διαβάζεται. Γράψε π.χ. 14:00 ή άφησέ την κενή.'); return; }
    if (!(await run({ t: 'setTimes', id: st.id, fromTime: a, toTime: b }, false))) return;
    onClose(); toast({ text: 'Ώρες άδειας ' + shortName(p) + ': ' + (timesTxt({ fromTime: a, toTime: b, open: st.open }) || 'χωρίς ώρες'), actions: [undoMark()] });
  };
  return html`<${Dialog} title="Ώρες άδειας" description=${fullName(p) + ' · ' + statusLbl(st, state.settings.lists) + ' ' + dm(st.from) + (st.to !== st.from ? '–' + dm(st.to) : '')} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
    <div className="field-row">
      <${TimeField} id="lt-out" label="Ώρα αναχώρησης" value=${f.fromTime} onChange=${(v: string) => { setF({ ...f, fromTime: v }); setErr(null); }} help=${dow(st.from) + ' ' + dm(st.from)}/>
      ${!st.open && html`<${TimeField} id="lt-in" label="Ώρα επιστροφής" value=${f.toTime} onChange=${(v: string) => { setF({ ...f, toTime: v }); setErr(null); }} help=${dow(st.to) + ' ' + dm(st.to)}/>`}
    </div>
    <span className="field__help">${TIMES_HELP} Υπηρεσίες που δεν γίνονται πια με τις νέες ώρες αδειάζουν.</span>
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
}

// Υπηρεσίες πριν από την εφαρμογή (γραφέας, 10/10): μόνο αριθμός ανά είδος, χωρίς ημερομηνία. Μετρούν στη σειρά δικαιοσύνης.
const BASE_KINDS: DutyKind[] = ['th', 'op', 'sk', 'mg', 'ly', 'tae', 'other'];
function BaselineDialog({ p, onClose }: P) {
  const { state, run } = useStore(); const toast = useToast();
  const [b, setB] = useState<Record<string, number>>(() => ({ ...(state.baseline[p.id] || {}) } as Record<string, number>));
  const num = (k: string, label: string) => html`<label key=${k} className="field"><span className="field__help">${label}</span><input className="ui-input" type="number" min="0" value=${b[k] || ''} placeholder="0" onChange=${(e: any) => setB({ ...b, [k]: Math.max(0, +e.target.value || 0) })}/></label>`;
  return html`<${Dialog} title=${'Προηγούμενες υπηρεσίες: ' + fullName(p)} description="Όσες έκανε πριν μπουν στην εφαρμογή. Μόνο αριθμός, χωρίς ημερομηνία. Προστίθενται στον έλεγχο υπηρεσιών και στη σειρά δικαιοσύνης." onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${async () => { if (await run({ t: 'setBaseline', pid: p.id, baseline: b }, false)) { onClose(); toast({ text: 'Αποθηκεύτηκαν οι προηγούμενες υπηρεσίες του ' + shortName(p) }); } }}>Αποθήκευση<//>`}>
    <div className="settings-grid">${BASE_KINDS.map(k => num(k, KIND_NAME[k]))}${num('hol', 'Από αυτές σε ΣΚ ή αργία')}</div>
  <//>`;
}

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
  return isNew ? 'Γράφεται και στο Δυναμολόγιο (' + at + '), σε νέα γραμμή κάτω από τον τελευταίο.' : 'Βαθμός, Ο/Σ, ονοματεπώνυμο, ΑΣΜ, τηλέφωνο, θάλαμος, Σ.Ι. και ρόλος γράφονται και στο Δυναμολόγιο (' + at + ').';
}
// Τα πεδία ενός στρατιώτη: ίδια στη διόρθωση και στον νέο
function PersonFields({ x, setX, id, isNew }: P) {
  const { state } = useStore();
  const ranks = useMemo(() => optionsOf(listOf(state.settings.lists, 'soldierRanks'), state.people.map((y: Person) => y.rank)), [state.people, state.settings.lists]);
  const specs = useMemo(() => optionsOf(listOf(state.settings.lists, 'specs'), state.people.map((y: Person) => y.spec)), [state.people, state.settings.lists]);
  const F = (k: keyof Person, label: string, opts: P = {}) => html`<div className="field"><label className="field__label" htmlFor=${id + '-' + k}>${label}</label><input id=${id + '-' + k} className="ui-input" type=${opts.type || 'text'} value=${(x as any)[k] ?? ''} placeholder=${opts.placeholder || ''} data-autofocus=${opts.focus ? '' : undefined} onChange=${(e: any) => setX({ ...x, [k]: opts.num ? (e.target.value ? Number(e.target.value) : null) : opts.nullable ? (e.target.value || null) : e.target.value })}/></div>`;
  return html`
    <div className="field-row"><${ChoiceField} id=${id + '-rank'} label="Βαθμός" value=${x.rank} options=${ranks} placeholder="π.χ. ΣΤΡ" onChange=${(v: string) => setX({ ...x, rank: v })}/><${ChoiceField} id=${id + '-spec'} label="Ο/Σ (όπλο/σώμα)" value=${x.spec} options=${specs} placeholder="π.χ. ΠΖ" onChange=${(v: string) => setX({ ...x, spec: v })}/></div>
    <div className="field-row">${F('last', isNew ? 'Επώνυμο *' : 'Επώνυμο', { focus: isNew })}${F('first', isNew ? 'Όνομα *' : 'Όνομα')}${F('father', 'Πατρώνυμο')}</div>
    <div className="field-row">${F('asm', 'ΑΣΜ')}${F('phone', 'Τηλέφωνο')}${F('room', 'Θάλαμος', { type: 'number', num: true })}</div>
    <div className="field-row"><${SiField} id=${id + '-si'} value=${x.si} cat=${x.siCat || ''} onChange=${(v: string, c: string) => setX({ ...x, si: v, siCat: c || undefined })}/>${F('post', 'Πόστο', { nullable: true })}</div>
    <div className="field-row">${F('role', 'Ρόλος', { nullable: true })}${isNew && F('essos', 'ΕΣΣΟ', { placeholder: 'π.χ. 2026 Γ΄' })}${F('weapon', 'Αριθμός όπλου (γράφεται μόνο όταν είναι Λ/Υ ή Δ/Υ)')}</div>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${x.attached} onChange=${(e: any) => setX({ ...x, attached: e.target.checked })}/><span><b>Προσκολλημένος</b><small>Μετράει στη στήλη «Προσκολλημένοι» της ΗΚΑΙ.</small></span></label>
    ${!isNew && html`<label className="rule"><input type="checkbox" className="ui-check" checked=${!x.active} onChange=${(e: any) => setX({ ...x, active: !e.target.checked })}/><span><b>Εκτός δύναμης</b><small>Δεν εμφανίζεται στις λίστες, στις υπηρεσίες και στην ΗΚΑΙ.</small></span></label>`}
    ${F('notes', 'Σημειώσεις')}`;
}

function EditPersonDialog({ p, onClose }: P) {
  const { run, state } = useStore(); const toast = useToast();
  const [x, setX] = useState<Person>({ ...p });
  return html`<${Dialog} title="Διόρθωση στοιχείων" description=${rosterNote(state, false)} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${async () => { if (await run({ t: 'updatePerson', person: x }, false)) { onClose(); toast({ text: 'Αποθηκεύτηκαν τα στοιχεία του ' + shortName(x) }); } }}>Αποθήκευση<//>`}>
    <${PersonFields} x=${x} setX=${setX} id="ep"/>
  <//>`;
}

// Νέος στρατιώτης (π.χ. ήρθε μετάθεση): μπαίνει στην εφαρμογή και σε νέα γραμμή στο Δυναμολόγιο
function NewPersonDialog({ onClose }: P) {
  const { run, state, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  // η πιο συχνή ΕΣΣΟ όσων είναι σε δύναμη
  const essos = useMemo(() => { const n = new Map<string, number>(); state.people.forEach((y: Person) => { if (y.active && y.essos) n.set(y.essos, (n.get(y.essos) || 0) + 1); }); return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || ''; }, [state.people]);
  const [x, setX] = useState<P>({ rank: 'ΣΤΡ', spec: '', last: '', first: '', father: '', asm: '', phone: '', room: null, si: '', post: null, role: null, essos, attached: false, notes: '', weapon: '' });
  const ok = !!x.last.trim() && !!x.first.trim();
  const save = async () => {
    if (!ok) return;
    const next = await run({ t: 'addPerson', person: x }, false); if (!next) return;
    onClose(); nav.openPerson(next.people.reduce((a: number, y: Person) => Math.max(a, y.id), 0));   // ο νέος έχει τον μεγαλύτερο αριθμό
    const b = state.settings.sources?.people;
    toast({ text: 'Προστέθηκε ο ' + x.last.trim().toUpperCase() + ' ' + x.first.trim().toUpperCase() + (b && b.write !== false ? '. Γράφεται και στο Δυναμολόγιο.' : '.'), actions: [undoMark()] });
  };
  return html`<${Dialog} title="Νέος στρατιώτης" description=${rosterNote(state, true)} onClose=${onClose} closeOnOverlay=${!x.last && !x.first}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} onClick=${save}>Προσθήκη<//>`}>
    <${PersonFields} x=${x} setX=${setX} id="np" isNew=${true}/>
  <//>`;
}

/* features/status/DeclareStatusDialog · 1 ή πολλά άτομα, 2 βήματα */
export function DeclareStatusDialog({ initial, onClose }: P) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const pm = personMap(state.people);
  const [step, setStep] = useState(1);
  const punKinds = listOf(state.settings.lists, 'punKinds'), leaveKinds = listOf(state.settings.lists, 'leaveKinds');
  const [cmd, setCmd] = useState(() => ({ pids: (initial.pids || []) as number[], type: (initial.type || 'EY') as TypeKey, from: initial.from || today, to: initial.to || initial.from || today, note: '', kind: initial.type === 'LEAVE' ? leaveKinds[0] : punKinds[0], by: '', reason: '', on: today, fromTime: '', toTime: '' }));
  const [err, setErr] = useState<any>(null);
  const set = (patch: P) => { setCmd(c => ({ ...c, ...patch, ...(patch.type ? { kind: patch.type === 'LEAVE' ? leaveKinds[0] : punKinds[0] } : {}) })); setErr(null); };
  const t = TYPES[cmd.type];
  const hasKind = cmd.type === 'PUN' || cmd.type === 'LEAVE';
  const isPun = cmd.type === 'PUN';
  // δικά σου ιατρικά (Ρυθμίσεις › Λίστες): στη γραμμή «Ιατρικά» δίπλα στα βασικά· κρατούν τον βασικό τύπο και το όνομά τους στο «είδος»
  const meds = medKinds(state.settings.lists);
  const med = !hasKind ? meds.find(m => m.like === cmd.type && m.name === cmd.kind) : undefined;
  const pickType = (v: string) => { const m = meds.find(x => 'm:' + x.name === v); if (m) { setCmd(c => ({ ...c, type: m.like!, kind: m.name })); setErr(null); } else set({ type: v as TypeKey }); };
  // ώρες: μόνο στις άδειες (κανονική, τιμητική), προαιρετικές
  const timed = hasTimes(cmd.type);
  const tOut = timed ? normTime(cmd.fromTime) : '', tBack = timed ? normTime(cmd.toTime) : '';
  const full = { ...cmd, kind: hasKind ? cmd.kind : med ? med.name : undefined, note: cmd.note || undefined, by: isPun ? cmd.by : undefined, reason: isPun ? cmd.reason : undefined, on: isPun ? cmd.on : undefined, fromTime: tOut || undefined, toTime: tBack || undefined };
  const byList = useMemo(() => punBySuggestions(state), [state.statuses, state.cadreList]);
  const max = isPun ? overMax(cmd.kind, daysBetween(cmd.from, cmd.to), state.settings.lists) : 0;
  // στέρηση εξόδου: πότε λήγει για τον καθένα, αφού δεν μετράνε οι μέρες με υπηρεσία ή βραδινή εκπαίδευση
  const dep = isPun && isDeprivation({ type: 'PUN', kind: cmd.kind });
  const depEnds = dep ? cmd.pids.map(pid => ({ pid, to: deprivationEnd(state, pid, cmd.from, daysBetween(cmd.from, cmd.to)) })).filter(x => x.to !== cmd.to) : [];
  const plan = useMemo(() => (step === 2 ? planStatusChange(state, full, today) : null), [step, state, cmd, today]);
  const next = () => {
    if (!cmd.pids.length) { setErr('Διάλεξε ποιον αφορά η δήλωση. Γράψε τα πρώτα γράμματα του επωνύμου.'); return; }
    if (tOut == null || tBack == null) { setErr('Η ώρα ' + (tOut == null ? 'αναχώρησης' : 'επιστροφής') + ' δεν διαβάζεται. Γράψε π.χ. 14:00 ή άφησέ την κενή.'); return; }
    if (tOut && tBack && cmd.from === cmd.to && tBack <= tOut) { setErr('Την ίδια μέρα η επιστροφή πρέπει να είναι μετά την αναχώρηση.'); return; }
    const p = planStatusChange(state, full, today);
    if (p.overlaps.length) { const o = p.overlaps[0]; setErr(shortName(pm.get(o.pid)!) + ' έχει ήδη ' + statusLbl(o.status, state.settings.lists) + ' ' + dm(o.status.from) + '–' + dm(o.status.to) + '. Βγάλ\' τον από τη λίστα ή άλλαξε τις ημερομηνίες.'); return; }
    if (p.blocked.length) { setErr(html`Δεν βγαίνουν έξοδο: ${p.blocked.map(b => html`<span key=${b.pid}><br/><b>${shortName(pm.get(b.pid)!)}</b> (${dayName(b.date, today).toLowerCase()}): ${b.reason}</span>`)}<br/>Βγάλ' τους από τη λίστα.`); return; }
    setStep(2);
  };
  const apply = async () => {
    if (!(await run({ t: 'declare', cmd: full }, false))) return;
    onClose();
    const w = cmd.pids.length === 1 ? shortName(pm.get(cmd.pids[0])!) : cmd.pids.length + ' άτομα';
    const acts = [undoMark()];
    if (plan && plan.conflicts.length) acts.unshift({ label: 'Βρες αντικαταστάτη', fn: () => nav.go('guard', { guardDate: plan.conflicts[0].date }) });
    toast({ text: (cmd.type === 'PUN' ? 'Αιτείται ποινή: ' : 'Δηλώθηκε ' + (med ? med.name : t.label) + ': ') + w, actions: acts });
  };
  const outPick = useCallback((p: Person) => outBlock(state, cmd.from, p.id), [state, cmd.from]);
  const desc = html`<span style=${{ fontWeight: step === 1 ? 700 : 400 }}>1 Στοιχεία</span> › <span style=${{ fontWeight: step === 2 ? 700 : 400 }}>2 Τι θα αλλάξει</span>`;
  if (step === 1) return html`<${Dialog} title="Δήλωση κατάστασης" description=${desc} onClose=${onClose} closeOnOverlay=${!cmd.pids.length}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${next}>Συνέχεια: Τι θα αλλάξει<//>`}>
    <div className="field"><span className="field__label">Τι δηλώνεις *</span>
      <div className="typegrid">${CATS.map(([c, l]) => html`<div key=${c} className="typegrid__row"><span className="typegrid__lbl">${l}</span><${Segmented} value=${med ? 'm:' + med.name : cmd.type} onChange=${pickType} items=${[...TYPE_KEYS.filter(k => TYPES[k].cat === c).map(k => ({ value: k, label: TYPES[k].label, tip: TYPES[k].long })), ...(c === 'med' ? meds.map(m => ({ value: 'm:' + m.name, label: m.name, tip: m.name + (m.warn ? ': μόνο προειδοποίηση στις υπηρεσίες' : ': σαν ' + TYPES[m.like!].label) })) : [])]}/></div>`)}</div>
      <span className="field__help"><b>${med ? med.name + (med.warn ? '' : ' (σαν ' + t.label + ', ' + t.long.toLowerCase() + ')') : t.long}</b>${med?.warn ? ': χωρίς περιορισμούς· όταν μπαίνει σε υπηρεσία βγαίνει προειδοποίηση' : effects(t) ? ': ' + effects(t) : ''}${cmd.type === 'PUN' ? ' · αιτείται στην ΗΚΑΙ και ισχύει όταν εγκριθεί' : ''}</span></div>
    ${hasKind && html`<div className="field"><label className="field__label" htmlFor="dpk">${cmd.type === 'PUN' ? 'Είδος ποινής *' : 'Είδος άδειας'}</label><select id="dpk" className="ui-input" value=${cmd.kind} onChange=${(e: any) => setCmd(c => ({ ...c, kind: e.target.value }))}>${(cmd.type === 'PUN' ? punKinds : leaveKinds).map(k => html`<option key=${k} value=${k}>${cmd.type === 'PUN' ? punLbl(k) : k}</option>`)}</select></div>`}
    <div className="field"><label className="field__label" htmlFor="dsp">Ποιοι * <span className="muted" style=${{ fontWeight: 400 }}>(ένας ή περισσότεροι)</span></label>
      <${PersonPicker} id="dsp" multiple=${true} value=${cmd.pids} onChange=${(pids: number[]) => set({ pids })} date=${cmd.from} unavailable=${t.cat === 'out' ? outPick : undefined} autoFocus=${!cmd.pids.length}/></div>
    <${DateRangeField} from=${cmd.from} to=${cmd.to} onChange=${(from: string, to: string) => set({ from, to })}/>
    ${timed && html`<div className="field"><div className="field-row">
      <${TimeField} id="dpt-out" label="Ώρα αναχώρησης" value=${cmd.fromTime} onChange=${(v: string) => set({ fromTime: v })} help=${'Προαιρετικό · ' + dow(cmd.from) + ' ' + dm(cmd.from)}/>
      <${TimeField} id="dpt-in" label="Ώρα επιστροφής" value=${cmd.toTime} onChange=${(v: string) => set({ toTime: v })} help=${'Προαιρετικό · ' + dow(cmd.to) + ' ' + dm(cmd.to)}/>
    </div><span className="field__help">${TIMES_HELP}</span></div>`}
    ${isPun && max > 0 && html`<${Alert} tone="warn"><span>${punLbl(cmd.kind)} πάνω από ${max} ημέρες. Έλεγξε τη διάρκεια.</span><//>`}
    ${dep && html`<span className="note">${daysBetween(cmd.from, cmd.to)} ${daysBetween(cmd.from, cmd.to) === 1 ? 'ημέρα' : 'ημέρες'} στέρηση εξόδου. Οι μέρες με υπηρεσία ή βραδινή εκπαίδευση δεν μετράνε: η λήξη μετακινείται μόνη της.</span>`}
    ${isPun && html`<div className="field-row">
      <div className="field"><label className="field__label" htmlFor="dpby">Ποιος τιμώρησε</label><input id="dpby" className="ui-input" list="dpby-l" placeholder="π.χ. ΛΧΙΑ ΔΟΚΙΜΙΟ" value=${cmd.by} onChange=${(e: any) => set({ by: e.target.value })}/><datalist id="dpby-l">${byList.map((x: string) => html`<option key=${x} value=${x}/>`)}</datalist></div>
      <div className="field"><label className="field__label" htmlFor="dpon">Ημερομηνία τιμωρίας</label><input id="dpon" type="date" className="ui-input" value=${cmd.on} onChange=${(e: any) => e.target.value && set({ on: e.target.value })}/></div></div>
    <div className="field"><label className="field__label" htmlFor="dprs">Λόγος (διότι…)</label><textarea id="dprs" className="ui-input" rows="2" placeholder="π.χ. απουσίαζε από το προσκλητήριο" value=${cmd.reason} onChange=${(e: any) => set({ reason: e.target.value })}></textarea><span className="field__help">Βγαίνει έτοιμο κείμενο για το Word στα «Ιατρικά και ποινές».</span></div>`}
    <div className="field"><label className="field__label" htmlFor="dsn">Παρατήρηση</label><input id="dsn" className="ui-input" placeholder="Προαιρετικό, π.χ. αριθμός διαταγής" value=${cmd.note} onChange=${(e: any) => set({ note: e.target.value })}/></div>
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
  const one = cmd.pids.length === 1 && pm.get(cmd.pids[0]);
  return html`<${Dialog} title="Τι θα αλλάξει" description=${desc} onClose=${onClose} closeOnOverlay=${false}
    footer=${html`<${Button} variant="outline" onClick=${() => setStep(1)}>Πίσω<//><${Button} onClick=${apply}>Αποθήκευση<//>`}>
    <p style=${{ margin: 0 }}>Δηλώνεις <${Badge} tone=${t.tone}>${hasKind ? (cmd.type === 'PUN' ? 'Ποινή: ' + punLbl(cmd.kind) : 'Άδεια: ' + cmd.kind) : med ? med.name + (med.warn ? '' : ' (σαν ' + t.label + ')') : t.long}<//> ${one ? html`τον <b>${fullName(one)}</b> του ${one.father}` : html`<b>${cmd.pids.length} άτομα</b> (${cmd.pids.map(id => shortName(pm.get(id)!)).join(', ')})`}, ${cmd.from === cmd.to ? html`<b>${dayName(cmd.from, today).toLowerCase()} ${dm(cmd.from)}</b>` : html`από <b>${dow(cmd.from)} ${dm(cmd.from)}</b> έως <b>${dow(cmd.to)} ${dm(cmd.to)}</b>`}${timesTxt(full) ? ' (' + timesTxt(full) + ')' : ''}.</p>
    ${depEnds.length > 0 && html`<${Alert} tone="info"><span>${depEnds.map((x, i) => html`<span key=${x.pid}>${i > 0 && html`<br/>`}<b>${shortName(pm.get(x.pid)!)}</b> λήγει <b>${dow(x.to)} ${dm(x.to)}</b>, γιατί έχει υπηρεσία ή βραδινή εκπαίδευση μέσα στις μέρες της ποινής.</span>`)}</span><//>`}
    ${plan && plan.files.length > 0 && html`<div className="field"><span className="field__label">Επηρεάζει</span><${ChangePlanList} plan=${plan}/></div>`}
    ${plan && plan.conflicts.length > 0 && html`<${Alert} tone="warn">Μετά την αποθήκευση θα σου προταθεί αντικαταστάτης στις Υπηρεσίες.<//>`}
    ${plan && plan.alongside.length > 0 && html`<${Alert} tone="info"><span>${plan.alongside.map((a, i) => html`<span key=${i}>${i > 0 && html`<br/>`}<b>${shortName(pm.get(a.pid)!)}</b> έχει ήδη ${statusLbl(a.status, state.settings.lists)} ${a.status.open ? 'χωρίς λήξη' : dm(a.status.from) + '–' + dm(a.status.to)}.</span>`)}<br/>Ισχύουν και τα δύο· στις υπηρεσίες και στην έξοδο μετρά ο πιο αυστηρός περιορισμός.</span><//>`}
    ${RECORD_CATS.includes(t.cat) && cmd.type !== 'PUN' && html`<span className="note">Στις ${dm(addDays(cmd.to, 1))} αφαιρείται αυτόματα και γράφεται στο Ιστορικό.</span>`}
    <span className="note">Μπορείς να το αναιρέσεις αμέσως μετά ή από το Ιστορικό.</span>
  <//>`;
}
