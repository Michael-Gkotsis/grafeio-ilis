// features/people και features/status: προσωπικό, καρτέλα ατόμου, δήλωση κατάστασης
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Dialog, Icon, PageHeader, Segmented, Sheet, Strip, Tabs, VirtualList, useMedia, useToast, useViewportHeight } from '../ui';
import { useNav, useStore, searchPeople } from '../store';
import { ActiveFilter, ChangePlanList, DateRangeField, PersonPicker, StatusBadge } from '../common';
import { TYPES, TYPE_KEYS, PUN_KINDS, LEAVE_KINDS, RECORD_CATS, CAP_KINDS, CAP_ACC, KIND_LBL, KIND_NAME, effects, fullName, shortName, unitOf, roomTxt, type DutyKind, type Person, type SavedView, type TypeKey, type Status } from '../../shared/domain';
import { baseTotal, capsOf, dutyBlock, dutyStats, emptyStat, holName, outBlock, personMap, planStatusChange, postBy, postsOf, statusesOn } from '../../shared/rules';
import { addDays, daysBetween, dayName, dm, dow } from '../../shared/dates';
import { overMax, punBySuggestions } from '../../shared/punish';
import { CadreView } from './cadre';
import { collator, normGreek } from '../../shared/text';
import { useRowH } from '../prefs';
type P = any;

const CATS: [string, string][] = [['med', 'Ιατρικά'], ['abs', 'Απουσίες'], ['out', 'Έξοδος'], ['other', 'Άλλα'], ['pun', 'Ποινή']];

const PersonRow = memo(function PersonRow({ p, odd, style, statuses, today, duty, checked, selected, onToggle, onOpen }: P) {
  return html`<div className=${cx('ptable__row', odd && 'is-odd', selected && 'is-sel')} style=${style} role="row" tabIndex="0" onClick=${() => onOpen(p.id)} onKeyDown=${(e: any) => { if (e.key === 'Enter') onOpen(p.id); }}>
    <span onClick=${(e: any) => e.stopPropagation()}><input type="checkbox" className="ui-check" checked=${checked} aria-label=${'Επιλογή ' + fullName(p)} onChange=${() => onToggle(p.id)}/></span>
    <span><b>${fullName(p)}</b></span><span>${p.father}</span><span>${p.rank}</span><span>${unitOf(p)}</span><span>${roomTxt(p)}</span><span className="num">${duty}</span>
    <span><${StatusBadge} statuses=${statuses} pid=${p.id} date=${today}/></span></div>`;
});
const PersonCard = memo(function PersonCard({ p, style, statuses, today, checked, onToggle, onOpen }: P) {
  return html`<div className="pcard" style=${style} onClick=${() => onOpen(p.id)}>
    <span onClick=${(e: any) => e.stopPropagation()}><input type="checkbox" className="ui-check" checked=${checked} aria-label=${'Επιλογή ' + fullName(p)} onChange=${() => onToggle(p.id)}/></span>
    <div><b>${fullName(p)}</b><small>του ${p.father} · ${p.rank} · ${unitOf(p)} · ${roomTxt(p)}</small></div>
    <${StatusBadge} statuses=${statuses} pid=${p.id} date=${today}/></div>`;
});

type Filt = { unit: string; room: number | null; filter: string };
const DEF_SORT = { k: 'last', dir: 1 };
export function PeopleScreen() {
  const { state, today, run, undo } = useStore(); const nav = useNav(); const toast = useToast(); const mobile = useMedia('(max-width: 767px)');
  const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  // φίλτρα στα params της οθόνης, ώστε να τα θυμάται όταν γυρνάς (Shell)
  const filter: string = nav.params.filter || 'all'; const unit: string = nav.params.unit || 'all'; const room: number | null = nav.params.room ?? null;
  const date: string = nav.params.pdate && nav.params.pdate >= today ? nav.params.pdate : today;
  const sort: { k: string; dir: number } = nav.params.sort || DEF_SORT;
  const setFilter = (f: string) => nav.set({ filter: f }); const setUnit = (u: string) => nav.set({ unit: u, room: room != null && u !== 'all' && unitOf({ room } as Person) !== u ? null : room });
  const setRoom = (r: number | null) => nav.set({ room: r, unit: r != null && unit !== 'all' && unitOf({ room: r } as Person) !== unit ? 'all' : unit });
  const [selected, setSelected] = useState(() => new Set<number>());
  const [saving, setSaving] = useState(false);
  const ds = dutyStats(state);
  const FILTERS: [string, string][] = [['all', 'Όλοι'], ['present', 'Παρόντες'], ['absent', 'Απόντες'], ...TYPE_KEYS.map(k => [k, TYPES[k].label] as [string, string]), ['dnright', 'Με δικαίωμα ΔΝ'], ['inactive', 'Εκτός δύναμης']];
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
    if (f.filter === 'all') return true; if (f.filter === 'present') return !away; if (f.filter === 'absent') return away; if (f.filter === 'dnright') return !!p.dn;
    if ((TYPES as any)[f.filter]) return ss.some(s => s.type === f.filter); return unitOf(p) === f.filter;
  }, [ssOf]);
  const listFor = useCallback((f: Filt, text: string) => (f.filter === 'inactive' ? state.people.filter(p => !p.active).sort((a, b) => collator.compare(a.last, b.last)) : searchPeople(state.people, text)).filter(p => matches(p, f)), [state.people, matches]);
  // πόσοι ταιριάζουν σε κάθε φίλτρο (στον επιλεγμένο ουλαμό/θάλαμο), για να φαίνεται πριν πατήσεις
  const counts = useMemo(() => {
    const n: Record<string, number> = { all: 0, present: 0, absent: 0, dnright: 0, inactive: 0 };
    state.people.forEach(p => {
      if (!place(p, { unit, room, filter: 'all' })) return;
      if (!p.active) { n.inactive++; return; }
      const s = ssOf.get(p.id) || []; n.all++;
      if (s.some(x => TYPES[x.type].away)) n.absent++; else n.present++;
      if (p.dn) n.dnright++;
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
  const delView = async (v: SavedView) => { if (await run({ t: 'setSettings', settings: { views: views.filter(x => x.id !== v.id) }, text: 'διαγραφή λίστας «' + v.name + '»' }, false)) toast({ text: 'Διαγράφηκε η λίστα «' + v.name + '»', actions: [{ label: 'Αναίρεση', fn: () => { undo(); } }] }); };
  const dateLbl = date === today ? '' : dayName(date, today);
  const filtered = unit !== 'all' || room != null || filter !== 'all' || !!dq.trim();
  const ptab = nav.params.peopleTab || 'soldiers';
  const tabs = html`<div style=${{ marginBottom: '12px' }}><${Tabs} value=${ptab} onChange=${(v: string) => nav.set({ peopleTab: v })} items=${[{ value: 'soldiers', label: 'Οπλίτες (' + total + ')' }, { value: 'cadre', label: 'Στελέχη (' + state.cadreList.length + ')' }]}/></div>`;
  if (ptab === 'cadre') return html`<${CadreView} tabs=${tabs}/>`;
  const dateSel = html`<select className="hdsel" aria-label="Κατάσταση στην ημερομηνία" value=${date} onChange=${(e: any) => nav.set({ pdate: e.target.value === today ? undefined : e.target.value })}>${days.map(d => html`<option key=${d} value=${d}>${dayName(d, today)}</option>`)}</select>`;
  return html`<div>
    <${PageHeader} title="Προσωπικό" sub=${'Δύναμη Ίλης: ' + total + ' άτομα. Πάτα σε γραμμή για στοιχεία, ή επίλεξε πολλούς για μαζική δήλωση.'}>
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
    mobile ? html`<div className="ui-card" style=${{ overflow: 'hidden' }}><${VirtualList} items=${rows} rowHeight=${68} height=${height} renderRow=${(p: Person, _i: number, style: P) => html`<${PersonCard} key=${p.id} p=${p} style=${style} statuses=${state.statuses} today=${date} checked=${selected.has(p.id)} onToggle=${toggle} onOpen=${open}/>`}/></div>` :
    html`<div className="ptable" role="table" aria-rowcount=${rows.length}><div style=${{ overflowX: 'auto' }}><div style=${{ minWidth: '736px' }}>
      <div className="ptable__head" role="row"><span><input type="checkbox" className="ui-check" aria-label="Επιλογή όλων" checked=${allSel} onChange=${() => setSelected(allSel ? new Set() : new Set(rows.map(p => p.id)))}/></span>${H('last', 'Ονοματεπώνυμο')}${H('father', 'Πατρώνυμο')}${H('rank', 'Βαθμός')}${H('unit', 'Ουλαμός')}${H('room', 'Θάλαμος')}${H('duty', 'Υπηρ.')}<span>${dateSel}</span></div>
      <${VirtualList} items=${rows} rowHeight=${rowH} height=${height} resetKey=${filter + '|' + unit + '|' + room + '|' + dq + '|' + sort.k + sort.dir} renderRow=${(p: Person, i: number, style: P) => html`<${PersonRow} key=${p.id} p=${p} odd=${i % 2 === 1} style=${style} statuses=${state.statuses} today=${date} duty=${ds.get(p.id)?.total || 0} checked=${selected.has(p.id)} selected=${nav.params.person === p.id} onToggle=${toggle} onOpen=${open}/>`}/>
    </div></div></div>`}
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

export function PersonSheet({ pid, onClose }: P) {
  const { state, today, run } = useStore(); const nav = useNav(); const toast = useToast();
  const p = personMap(state.people).get(pid);
  const [edit, setEdit] = useState(false); const [baseOpen, setBaseOpen] = useState(false);
  if (!p) return null;
  const posts = postsOf(state.settings);
  const hist = state.statuses.filter(s => s.pid === pid).sort((a, b) => b.from.localeCompare(a.from));
  const dd = dutyStats(state).get(pid) || emptyStat();
  const duties = dd.log.slice().reverse().slice(0, 12).map(e => ({ d: e.d, x: posts.find(q => q.k === e.k) || postBy(state, e.k), h: e.h }));
  const base = state.baseline[pid]; const nBase = baseTotal(base);
  const caps = capsOf(state, pid);
  const ob = outBlock(state, today, pid);
  const rules = [dutyBlock(state.statuses, today, pid, { armed: false }) ? 'Καμία υπηρεσία' : dutyBlock(state.statuses, today, pid, { armed: true }) ? 'Μόνο άοπλες θέσεις' : null, ob ? 'Δεν βγαίνει έξοδο (' + ob + ')' : null].filter(Boolean);
  return html`<${Sheet} onClose=${onClose} title=${html`<h2 style=${{ fontSize: '18px' }}>${fullName(p)}</h2>`} subtitle=${html`<div className="muted" style=${{ fontSize: '13px' }}>του ${p.father || '—'} · ${p.rank} · ${unitOf(p)}${p.active ? '' : ' · ΕΚΤΟΣ ΔΥΝΑΜΗΣ'}</div><div style=${{ marginTop: '6px' }}><${StatusBadge} statuses=${state.statuses} pid=${pid} date=${today}/></div>`}>
    ${rules.length > 0 && html`<${Alert} tone="warn"><span><b>Σήμερα:</b> ${rules.join(' · ')}</span><//>`}
    <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><${Button} onClick=${() => nav.declare({ pids: [pid] })}>Δήλωσε κατάσταση<//><${Button} variant="outline" onClick=${() => nav.declare({ pids: [pid], type: 'DN', from: today, to: today })}>ΔΝ σήμερα<//><${Button} variant="ghost" onClick=${() => setEdit(true)}>Διόρθωση στοιχείων<//></div>
    <dl className="kv"><dt>ΑΣΜ</dt><dd className="num">${p.asm || '—'}</dd><dt><abbr data-tip="Έτος/Σειρά Στρατεύσιμων Οπλιτών">ΕΣΣΟ</abbr></dt><dd>${p.essos || '—'}</dd><dt>Ειδικότητα</dt><dd>${p.spec || '—'}</dd><dt>Θάλαμος</dt><dd>${roomTxt(p)} <span className="muted" style=${{ fontSize: '12px' }}>(${unitOf(p)})</span></dd><dt><abbr data-tip="Σωματική ικανότητα (από το Δυναμολόγιο)">Σ.Ι.</abbr></dt><dd>${p.si || '—'}</dd>${p.post && html`<dt>Πόστο</dt><dd>${p.post}</dd>`}${p.role && html`<dt>Ρόλος</dt><dd>${p.role}</dd>`}<dt>Τηλέφωνο</dt><dd className="num">${p.phone || '—'}</dd>${p.weapon && html`<dt>Όπλο</dt><dd className="num">${p.weapon}</dd>`}
      <dt>Υπηρεσίες</dt><dd><span className="num">${dd.total}</span> <span className="muted" style=${{ fontSize: '12px' }}>(${(Object.keys(dd.byKind).length ? Object.keys(dd.byKind) : ['th', 'mg']).map(k => (KIND_LBL as P)[k] + ' ' + (dd.byKind[k] || 0)).join(' · ')}${nBase ? ' · από αυτές ' + nBase + ' πριν την εφαρμογή' : ''})</span> <${Button} variant="link" onClick=${() => setBaseOpen(true)}>Προηγούμενες…<//></dd><dt>Αργίες / ΣΚ</dt><dd><span className="num">${dd.hol}</span>${dd.lastHol && html` <span className="muted" style=${{ fontSize: '12px' }}>τελευταία ${holName(state.settings, dd.lastHol)} ${dm(dd.lastHol)}</span>`}</dd>${p.notes && html`<dt>Σημειώσεις</dt><dd>${p.notes}</dd>`}</dl>
    <section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Δυνατότητα υπηρεσιών <span className="muted" style=${{ fontWeight: 400, fontSize: '13px' }}>(μόνιμα, όχι με ημερομηνίες)</span></h3>
      <div className="capgrid">${CAP_KINDS.map(([k, l]) => { const off = caps[k]; return html`<label key=${k} className=${off ? 'is-off' : ''} data-tip=${off ? 'Δεν κάνει: ' + off : 'Κάνει ' + CAP_ACC[k]}><input type="checkbox" className="ui-check" checked=${!off} onChange=${async (e: any) => { const allowed = e.target.checked; if (await run({ t: 'setCap', pid, kind: k, allowed }, false)) toast({ text: shortName(p) + (allowed ? ' κάνει ' : ' δεν κάνει ') + CAP_ACC[k] + '. Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση.' }); }}/>${l}</label>`; })}</div>
      <label className="rule" style=${{ marginTop: '8px' }}><input type="checkbox" className="ui-check" checked=${!!p.dn} onChange=${async (e: any) => { const dn = e.target.checked; if (await run({ t: 'updatePerson', person: { ...p, dn } }, false)) toast({ text: shortName(p) + (dn ? ' έχει δικαίωμα ΔΝ' : ' δεν έχει δικαίωμα ΔΝ') }); }}/><span><b>Δικαίωμα ΔΝ</b><small>Μόνιμο. Μόλις οριστεί σε έναν, στους Εξοδούχους το ΔΝ επιτρέπεται μόνο σε όσους το έχουν.</small></span></label>
      <p className="note" style=${{ margin: '6px 0 0' }}>Όπως το αρχείο «Δυνατότητα υπηρεσιών». Προεπιλογή από τη Σ.Ι. (Ι3 άοπλος, Ι4: όχι σκοπιά και οπλοφύλακας) και το πόστο.</p></section>
    <section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Ημερολόγιο υπηρεσιών <span className="muted" style=${{ fontWeight: 400, fontSize: '13px' }}>(τελευταίες 12)</span></h3>${duties.length ? html`<ul className="hist">${duties.map(({ d, x, h }) => html`<li key=${d + (x?.k || '')}><span className="num">${dow(d)} ${dm(d)}</span>${x ? x.label : '—'}${h && html` <${Badge} tone="warn">${holName(state.settings, d)}<//>`}</li>`)}</ul>` : html`<span className="muted">Καμία υπηρεσία ακόμα.</span>`}</section>
    <section><h3 style=${{ fontSize: '15px', marginBottom: '8px' }}>Ιστορικό καταστάσεων</h3>${hist.length ? html`<ul className="hist">${hist.map((s: Status) => html`<li key=${s.id}><${Badge} tone=${TYPES[s.type].tone}>${s.type === 'PUN' ? s.kind : TYPES[s.type].label}<//><span className="num">${dow(s.from)} ${dm(s.from)}${s.to !== s.from ? ' – ' + dow(s.to) + ' ' + dm(s.to) : ''}</span><span className="muted">(${daysBetween(s.from, s.to)} ημ.)</span>${s.pending && html`<${Badge} tone="warn">αιτείται<//>`}${s.to < today && RECORD_CATS.includes(TYPES[s.type].cat) && html`<span className="muted" style=${{ fontSize: '12px' }}>έληξε</span>`}</li>`)}</ul>` : html`<span className="muted">Καμία καταχώρηση ακόμα.</span>`}</section>
    ${edit && html`<${EditPersonDialog} p=${p} onClose=${() => setEdit(false)}/>`}
    ${baseOpen && html`<${BaselineDialog} p=${p} onClose=${() => setBaseOpen(false)}/>`}
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

function EditPersonDialog({ p, onClose }: P) {
  const { run } = useStore(); const toast = useToast();
  const [x, setX] = useState<Person>({ ...p });
  const F = (k: keyof Person, label: string, opts: P = {}) => html`<div className="field"><label className="field__label" htmlFor=${'ep-' + k}>${label}</label><input id=${'ep-' + k} className="ui-input" type=${opts.type || 'text'} value=${(x as any)[k] ?? ''} onChange=${(e: any) => setX({ ...x, [k]: opts.num ? (e.target.value ? Number(e.target.value) : null) : opts.nullable ? (e.target.value || null) : e.target.value })}/></div>`;
  return html`<${Dialog} title="Διόρθωση στοιχείων" description="Αλλάζει μόνο στην εφαρμογή. Στην επόμενη εισαγωγή Δυναμολογίου θα πάρει τις τιμές του αρχείου." onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${async () => { if (await run({ t: 'updatePerson', person: x }, false)) { onClose(); toast({ text: 'Αποθηκεύτηκαν τα στοιχεία του ' + shortName(x) }); } }}>Αποθήκευση<//>`}>
    <div className="field-row">${F('rank', 'Βαθμός')}${F('spec', 'Ειδικότητα')}</div>
    <div className="field-row">${F('last', 'Επώνυμο')}${F('first', 'Όνομα')}${F('father', 'Πατρώνυμο')}</div>
    <div className="field-row">${F('asm', 'ΑΣΜ')}${F('phone', 'Τηλέφωνο')}${F('room', 'Θάλαμος', { type: 'number', num: true })}</div>
    <div className="field-row">${F('si', 'Σ.Ι.')}${F('post', 'Πόστο', { nullable: true })}${F('role', 'Ρόλος', { nullable: true })}</div>
    <div className="field-row">${F('weapon', 'Αριθμός όπλου (γράφεται μόνο όταν είναι Λ/Υ ή Δ/Υ)')}</div>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${x.attached} onChange=${(e: any) => setX({ ...x, attached: e.target.checked })}/><span><b>Προσκολλημένος</b><small>Μετράει στη στήλη «Προσκολλημένοι» της ΗΚΑΙ.</small></span></label>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${!x.active} onChange=${(e: any) => setX({ ...x, active: !e.target.checked })}/><span><b>Εκτός δύναμης</b><small>Δεν εμφανίζεται στις λίστες, στις υπηρεσίες και στην ΗΚΑΙ.</small></span></label>
    ${F('notes', 'Σημειώσεις')}
  <//>`;
}

/* features/status/DeclareStatusDialog · 1 ή πολλά άτομα, 2 βήματα */
export function DeclareStatusDialog({ initial, onClose }: P) {
  const { state, run, today, tomorrow, undo } = useStore(); const toast = useToast(); const nav = useNav();
  const pm = personMap(state.people);
  const [step, setStep] = useState(1);
  const [cmd, setCmd] = useState(() => ({ pids: (initial.pids || []) as number[], type: (initial.type || 'EY') as TypeKey, from: initial.from || tomorrow, to: initial.to || initial.from || tomorrow, note: '', kind: initial.type === 'LEAVE' ? LEAVE_KINDS[0] : PUN_KINDS[0], by: '', reason: '', on: today }));
  const [err, setErr] = useState<any>(null);
  const set = (patch: P) => { setCmd(c => ({ ...c, ...patch, ...(patch.type ? { kind: patch.type === 'LEAVE' ? LEAVE_KINDS[0] : PUN_KINDS[0] } : {}) })); setErr(null); };
  const t = TYPES[cmd.type];
  const hasKind = cmd.type === 'PUN' || cmd.type === 'LEAVE';
  const isPun = cmd.type === 'PUN';
  const full = { ...cmd, kind: hasKind ? cmd.kind : undefined, note: cmd.note || undefined, by: isPun ? cmd.by : undefined, reason: isPun ? cmd.reason : undefined, on: isPun ? cmd.on : undefined };
  const byList = useMemo(() => punBySuggestions(state), [state.statuses, state.cadreList]);
  const max = isPun ? overMax(cmd.kind, daysBetween(cmd.from, cmd.to)) : 0;
  const plan = useMemo(() => (step === 2 ? planStatusChange(state, full) : null), [step, state, cmd]);
  const next = () => {
    if (!cmd.pids.length) { setErr('Διάλεξε ποιον αφορά η δήλωση. Γράψε τα πρώτα γράμματα του επωνύμου.'); return; }
    const p = planStatusChange(state, full);
    if (p.overlaps.length) { const o = p.overlaps[0]; setErr(shortName(pm.get(o.pid)!) + ' έχει ήδη ' + TYPES[o.status.type].label + ' ' + dm(o.status.from) + '–' + dm(o.status.to) + '. Βγάλ\' τον από τη λίστα ή άλλαξε τις ημερομηνίες.'); return; }
    if (p.blocked.length) { setErr(html`Δεν βγαίνουν έξοδο: ${p.blocked.map(b => html`<span key=${b.pid}><br/><b>${shortName(pm.get(b.pid)!)}</b> (${dayName(b.date, today).toLowerCase()}): ${b.reason}</span>`)}<br/>Βγάλ' τους από τη λίστα.`); return; }
    setStep(2);
  };
  const apply = async () => {
    if (!(await run({ t: 'declare', cmd: full }, false))) return;
    onClose();
    const w = cmd.pids.length === 1 ? shortName(pm.get(cmd.pids[0])!) : cmd.pids.length + ' άτομα';
    const acts = [{ label: 'Αναίρεση', fn: () => { undo(); } }];
    if (plan && plan.conflicts.length) acts.unshift({ label: 'Βρες αντικαταστάτη', fn: () => nav.go('guard', { guardDate: plan.conflicts[0].date }) });
    toast({ text: (cmd.type === 'PUN' ? 'Αιτείται ποινή: ' : 'Δηλώθηκε ' + t.label + ': ') + w, actions: acts });
  };
  const outPick = useCallback((p: Person) => outBlock(state, cmd.from, p.id), [state, cmd.from]);
  const desc = html`<span style=${{ fontWeight: step === 1 ? 700 : 400 }}>1 Στοιχεία</span> › <span style=${{ fontWeight: step === 2 ? 700 : 400 }}>2 Τι θα αλλάξει</span>`;
  if (step === 1) return html`<${Dialog} title="Δήλωση κατάστασης" description=${desc} onClose=${onClose} closeOnOverlay=${!cmd.pids.length}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${next}>Συνέχεια: Τι θα αλλάξει<//>`}>
    <div className="field"><span className="field__label">Τι δηλώνεις *</span>
      <div className="typegrid">${CATS.map(([c, l]) => html`<div key=${c} className="typegrid__row"><span className="typegrid__lbl">${l}</span><${Segmented} value=${cmd.type} onChange=${(k: TypeKey) => set({ type: k })} items=${TYPE_KEYS.filter(k => TYPES[k].cat === c).map(k => ({ value: k, label: TYPES[k].label, tip: TYPES[k].long }))}/></div>`)}</div>
      <span className="field__help"><b>${t.long}</b>${effects(t) ? ': ' + effects(t) : ''}${cmd.type === 'PUN' ? ' · αιτείται στην ΗΚΑΙ και ισχύει όταν εγκριθεί' : ''}</span></div>
    ${hasKind && html`<div className="field"><label className="field__label" htmlFor="dpk">${cmd.type === 'PUN' ? 'Είδος ποινής *' : 'Είδος άδειας'}</label><select id="dpk" className="ui-input" value=${cmd.kind} onChange=${(e: any) => setCmd(c => ({ ...c, kind: e.target.value }))}>${(cmd.type === 'PUN' ? PUN_KINDS : LEAVE_KINDS).map(k => html`<option key=${k}>${k}</option>`)}</select></div>`}
    <div className="field"><label className="field__label" htmlFor="dsp">Ποιοι * <span className="muted" style=${{ fontWeight: 400 }}>(ένας ή περισσότεροι)</span></label>
      <${PersonPicker} id="dsp" multiple=${true} value=${cmd.pids} onChange=${(pids: number[]) => set({ pids })} date=${cmd.from} unavailable=${t.cat === 'out' ? outPick : undefined} autoFocus=${!cmd.pids.length}/></div>
    <${DateRangeField} from=${cmd.from} to=${cmd.to} onChange=${(from: string, to: string) => set({ from, to })}/>
    ${isPun && max > 0 && html`<${Alert} tone="warn"><span>${cmd.kind} πάνω από ${max} ημέρες. Έλεγξε τη διάρκεια.</span><//>`}
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
    <p style=${{ margin: 0 }}>Δηλώνεις <${Badge} tone=${t.tone}>${hasKind ? (cmd.type === 'PUN' ? 'Ποινή: ' : 'Άδεια: ') + cmd.kind : t.long}<//> ${one ? html`τον <b>${fullName(one)}</b> του ${one.father}` : html`<b>${cmd.pids.length} άτομα</b> (${cmd.pids.map(id => shortName(pm.get(id)!)).join(', ')})`}, ${cmd.from === cmd.to ? html`<b>${dayName(cmd.from, today).toLowerCase()} ${dm(cmd.from)}</b>` : html`από <b>${dow(cmd.from)} ${dm(cmd.from)}</b> έως <b>${dow(cmd.to)} ${dm(cmd.to)}</b>`}.</p>
    ${plan && plan.files.length > 0 && html`<div className="field"><span className="field__label">Επηρεάζει</span><${ChangePlanList} plan=${plan}/></div>`}
    ${plan && plan.conflicts.length > 0 && html`<${Alert} tone="warn">Μετά την αποθήκευση θα σου προταθεί αντικαταστάτης στις Υπηρεσίες.<//>`}
    ${RECORD_CATS.includes(t.cat) && cmd.type !== 'PUN' && html`<span className="note">Στις ${dm(addDays(cmd.to, 1))} αφαιρείται αυτόματα και γράφεται στο Ιστορικό.</span>`}
    <span className="note">Μπορείς να το αναιρέσεις αμέσως μετά ή από το Ιστορικό.</span>
  <//>`;
}
