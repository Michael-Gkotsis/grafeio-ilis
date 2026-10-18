// features/weapons: Οπλισμός (Michael, 17/10: ο αριθμός όπλου βγήκε από την καρτέλα του οπλίτη σε δική του καρτέλα).
// Όλοι σε δύναμη με τον αριθμό όπλου τους, γραμμένο κατευθείαν στη γραμμή: Enter/↓ πάει στον επόμενο, επικόλληση στήλης
// από Excel γεμίζει τις επόμενες γραμμές με τη σειρά. Ίδιος αριθμός σε άλλον: ρωτά (μεταφορά ή και στους δύο), δεν μπλοκάρει.
// Τύπος όπλου από τη λίστα «Τύποι όπλων», θέση στον οπλοβαστό (Ε6), «Θέση» του όπλου (ελεύθερο κείμενο, Michael 18/10) και εντός/εκτός τη μέρα (εκτός με ένοπλη υπηρεσία, και γιατί).
// Έξοδος/είσοδος όπλων με λόγο και ώρα (Michael, 18/10): κουμπί στη γραμμή ή τσέκαρε πολλούς· ημερολόγιο στις «Κινήσεις» (weaponMoves.ts).
import { Fragment, useCallback, useDeferredValue, useMemo, useState, useEffect, memo } from 'react';
import { html, cx, Badge, Button, Dialog, Icon, PageHeader, Segmented, Strip, Tabs, useToast } from '../ui';
import { MovesView, WeaponInDialog, WeaponOutDialog, WeaponState } from './weaponMoves';
import { useNav, useStore } from '../store';
import { ActiveFilter, DateBar } from '../common';
import { fullName, plainName, platoonsOf, platoonShort, shortName, unitOf, type Person } from '../../shared/domain';
import { siOf } from '../../shared/si';
import { byRoomName } from '../../shared/rosterLists';
import { WEAPON_FILTERS, isOut, normPos, normRack, normWeapon, rackKey, sameRack, sameWeapon, weaponInfo, weaponKey, weaponMatch, type WeaponFilter, type WeaponInfo } from '../../shared/weapons';
import type { WeaponChange } from '../../shared/commands';
import { listOf } from '../../shared/ranks';
import { collator, normGreek, translit, norm } from '../../shared/text';
import { dm, dow } from '../../shared/dates';
type P = any;

const GRID = '30px 40px 64px minmax(130px,1.4fr) minmax(84px,1fr) minmax(84px,1fr) 80px 86px minmax(84px,.7fr) 98px 128px minmax(280px,1.5fr) 96px minmax(110px,.9fr) minmax(110px,.8fr)';
const focusRow = (f: string, i: number) => { const el = document.querySelector('input[data-wf="' + f + '"][data-wrow="' + i + '"]') as HTMLInputElement | null; if (el) { el.focus(); el.select(); el.scrollIntoView({ block: 'nearest' }); } return !!el; };
type WF = 'weapon' | 'rack' | 'wpos';
const NORM: Record<WF, (v: unknown) => string> = { weapon: normWeapon, rack: normRack, wpos: normPos };
const LBL: Record<WF, string> = { weapon: 'Αριθμός όπλου', rack: 'Θέση οπλοβαστού', wpos: 'Θέση όπλου' };

// Αριθμός ή θέση οπλοβαστού στη γραμμή: γράφεται όταν φύγεις από το κουτί (Enter, ↑/↓, Tab ή κλικ αλλού)· Esc ξαναφέρνει
// τον παλιό. Επικόλληση στήλης από Excel: μία τιμή ανά γραμμή, από αυτή και κάτω.
const WeaponInput = memo(function WeaponInput({ p, i, f = 'weapon', reset, onCommit, onPaste }: P) {
  const cur = p[f] || '';
  const [v, setV] = useState(cur);
  useEffect(() => setV(cur), [cur, reset]);
  const move = (e: any, to: number) => { e.preventDefault(); if (!focusRow(f, to)) e.target.blur(); };
  return html`<input className="ui-input weapon-input" data-wf=${f} data-wrow=${i} value=${v} placeholder="—" aria-label=${LBL[f as WF] + ' ' + fullName(p)} spellCheck="false" autoComplete="off"
    onChange=${(e: any) => setV(e.target.value)}
    onBlur=${() => { if (NORM[f as WF](v) !== cur) onCommit(p, v, f); }}
    onKeyDown=${(e: any) => {
      if (e.key === 'Enter' || e.key === 'ArrowDown') move(e, i + 1);
      else if (e.key === 'ArrowUp') move(e, i - 1);
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setV(cur); }
    }}
    onPaste=${(e: any) => {
      const t: string = e.clipboardData?.getData('text') || '';
      const lines = t.replace(/\r/g, '').split('\n'); while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      if (lines.length < 2) return;
      e.preventDefault(); onPaste(i, lines.map(l => l.split('\t')[0]), f);
    }}/>`;
});
// Τύπος όπλου: από τη λίστα «Τύποι όπλων» (Ρυθμίσεις › Λίστες), και ό,τι έχει ήδη κάποιος
function TypeSelect({ p, types, onPick }: P) {
  const opts = p.wtype && !types.includes(p.wtype) ? [...types, p.wtype] : types;
  return html`<select className="ui-select weapon-type" aria-label=${'Τύπος όπλου ' + fullName(p)} value=${p.wtype || ''} onChange=${(e: any) => onPick(p, e.target.value)}>
    <option value="">—</option>${opts.map((t: string) => html`<option key=${t} value=${t}>${t}</option>`)}</select>`;
}
function notes(p: Person, info: WeaponInfo, lists: P) {
  const out: any[] = [];
  if (!p.active) out.push(html`<${Badge} key="out" tone="warn" data-tip=${p.outOn ? 'Εκτός δύναμης από ' + dm(p.outOn) : 'Εκτός δύναμης'}>Εκτός δύναμης<//>`);
  const has = !!weaponKey(p.weapon);
  if (has && info.unarmed.has(p.id)) out.push(html`<${Badge} key="ua" tone="warn" data-tip=${'Άοπλος κατά τη Σ.Ι. (' + siOf(p, lists).text + ')'}>Άοπλος<//>`);
  const same = has ? sameWeapon(info, p) : [];
  if (same.length) out.push(html`<${Badge} key="dup" tone="bad" data-tip=${'Ο ίδιος αριθμός: ' + same.map(x => shortName(x) + (x.active ? '' : ' (εκτός δύναμης)')).join(', ')}>Ίδιος με ${shortName(same[0])}${same.length > 1 ? ' +' + (same.length - 1) : ''}<//>`);
  const rk = p.active && rackKey(p.rack) ? sameRack(info, p) : [];
  if (rk.length) out.push(html`<${Badge} key="rk" tone="warn" data-tip=${'Η ίδια θέση οπλοβαστού (' + p.rack + '): ' + rk.map(shortName).join(', ')}>Θέση ${p.rack} και σε ${shortName(rk[0])}${rk.length > 1 ? ' +' + (rk.length - 1) : ''}<//>`);
  if (!has && isOut(info, p.id)) out.push(html`<${Badge} key="noW" tone="bad" data-tip=${'Ένοπλη υπηρεσία (' + info.out.get(p.id) + ') χωρίς αριθμό όπλου'}>Ένοπλη χωρίς όπλο<//>`);
  return out;
}

const matchText = (p: Person, q: string) => {
  const n = normGreek(q.trim()); if (!n) return true;
  const key = normGreek([p.last, p.first, p.father, p.asm, p.rank, p.spec, p.room != null ? 'Θ' + p.room : '', p.wtype || '', p.rack || '', p.wpos || ''].join(' '));
  const wk = weaponKey(q);
  return n.split(/\s+/).every(t => key.includes(t)) || translit(p.last + ' ' + p.first).includes(norm(q.trim())) || (!!wk && weaponKey(p.weapon).includes(wk));
};

export function WeaponsScreen() {
  const { state, today, tomorrow, run, undoMark } = useStore(); const nav = useNav(); const toast = useToast();
  const date: string = nav.params.wdate || today;
  const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  const filter: WeaponFilter = nav.params.wfilter || 'all';
  const unitP: string = nav.params.unit || 'all';
  const unit = unitP === 'all' || platoonsOf(state.settings).some(u => platoonShort(u.name) === unitP) ? unitP : 'all';
  const room: number | null = nav.params.room ?? null;
  const sort: { k: string; dir: number } = nav.params.wsort || { k: 'room', dir: 1 };
  const [reset, setReset] = useState(0);
  const [ask, setAsk] = useState<{ p: Person; w: string; others: Person[] } | null>(null);
  const [xl, setXl] = useState(false);
  const lists = state.settings.lists;
  const info = useMemo(() => weaponInfo(state, date), [state.people, state.settings, state.guards, state.dutyLog, state.weaponLog, date]);
  // τσεκαρισμένοι για έξοδο/είσοδο μαζί· οι διάλογοι έξοδος (pids) και είσοδος (ids κινήσεων)
  const [sel, setSel] = useState(() => new Set<number>());
  const [outFor, setOutFor] = useState<number[] | null>(null); const [outReason, setOutReason] = useState('');
  const outReasons = useMemo(() => listOf(lists, 'weaponOut'), [lists]); const [inFor, setInFor] = useState<string[] | null>(null);
  const tab: string = nav.params.wtab || 'weapons';
  const toggle = useCallback((id: number) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const types = useMemo(() => listOf(lists, 'weaponTypes'), [lists]);
  const UNITS = useMemo(() => [{ value: 'all', label: 'Όλη η Ίλη' }, ...platoonsOf(state.settings).map(u => ({ value: platoonShort(u.name), label: platoonShort(u.name), tip: u.rooms.length ? 'Θάλαμοι ' + u.rooms.join(', ') : 'Χωρίς θαλάμους' }))], [state.settings.rooms]);
  const place = (p: Person) => (unit === 'all' || unitOf(p, state.settings) === unit) && (room == null || p.room === room);
  const counts = useMemo(() => {
    const n: Record<string, number> = {};
    for (const p of state.people) { if (!place(p)) continue; for (const [k] of WEAPON_FILTERS) if (weaponMatch(k, p, info)) n[k] = (n[k] || 0) + 1; }
    return n;
  }, [state.people, info, unit, room, state.settings.rooms]);
  const rooms = useMemo(() => { const m = new Map<number, number>(); state.people.forEach(p => { if (p.active && p.room != null) m.set(p.room, (m.get(p.room) || 0) + 1); }); return [...m].sort((a, b) => a[0] - b[0]); }, [state.people]);
  const rows = useMemo(() => {
    const r = state.people.filter(p => place(p) && weaponMatch(filter, p, info) && matchText(p, dq));
    const cmp = sort.k === 'rack' ? (a: Person, b: Person) => (rackKey(a.rack) ? 0 : 1) - (rackKey(b.rack) ? 0 : 1) || collator.compare(rackKey(a.rack), rackKey(b.rack)) * sort.dir || byRoomName(a, b)
      : sort.k === 'weapon' ? (a: Person, b: Person) => (weaponKey(a.weapon) ? 0 : 1) - (weaponKey(b.weapon) ? 0 : 1) || collator.compare(weaponKey(a.weapon), weaponKey(b.weapon)) * sort.dir || byRoomName(a, b)
      : sort.k === 'last' ? (a: Person, b: Person) => (collator.compare(a.last, b.last) || collator.compare(a.first, b.first)) * sort.dir
      : (a: Person, b: Person) => (byRoomName(a, b)) * sort.dir;
    // ίδιος αριθμός: ο ένας κάτω από τον άλλον
    return r.sort(filter === 'dup' ? (a, b) => collator.compare(weaponKey(a.weapon), weaponKey(b.weapon)) || byRoomName(a, b) : cmp);
  }, [state.people, info, filter, dq, unit, room, sort, state.settings.rooms]);
  const total = state.people.filter(p => p.active).length;
  const outN = new Set([...info.moves.keys(), ...info.out.keys()]).size;
  const selP = state.people.filter(p => sel.has(p.id));
  const selIn = selP.filter(p => p.weapon && !info.moves.has(p.id)); const selOut = selP.map(p => info.moves.get(p.id)).filter(Boolean) as { id: string }[];
  const allSel = rows.length > 0 && rows.every(p => sel.has(p.id));
  const armedN = state.people.filter(p => p.active && weaponKey(p.weapon)).length;

  // msg: το μήνυμα (αλλιώς «Χ: όπλο 123»)· warn: προειδοποίηση από κάτω, με αναίρεση
  const save = useCallback(async (changes: WeaponChange[], o: { warn?: string; what?: string; msg?: string } = {}) => {
    if (await run({ t: 'setWeapons', changes, what: o.what }, false) === null) { setReset(n => n + 1); return; }
    const c0 = changes[0]; const one = changes.length === 1 ? state.people.find(p => p.id === c0.pid) : null;
    const part = c0 && (c0.weapon !== undefined ? (normWeapon(c0.weapon) ? 'όπλο ' + normWeapon(c0.weapon) : 'χωρίς όπλο') : c0.rack !== undefined ? (normRack(c0.rack) ? 'οπλοβαστός ' + normRack(c0.rack) : 'χωρίς θέση οπλοβαστού') : c0.wpos !== undefined ? (normPos(c0.wpos) ? 'θέση ' + normPos(c0.wpos) : 'χωρίς θέση') : (c0.wtype ? 'τύπος ' + c0.wtype : 'χωρίς τύπο όπλου'));
    const msg = o.msg || (one ? shortName(one) + ': ' + part : 'Οπλισμός: ' + changes.length + ' άτομα');
    toast({ text: html`<span>${msg}${o.warn && html`<br/><b>Προσοχή:</b> ${o.warn}`}</span>`, actions: [undoMark()] });
  }, [run, toast, undoMark, state.people]);
  const commit = useCallback((p: Person, raw: string, f: WF = 'weapon') => {
    if (f === 'wpos') { save([{ pid: p.id, wpos: raw }]); return; }
    if (f === 'rack') { const r = normRack(raw); const o = r && p.active ? sameRack(info, p, r) : []; save([{ pid: p.id, rack: r }], { warn: o.length ? 'η θέση ' + r + ' είναι και του ' + o.map(shortName).join(', ') + '.' : undefined }); return; }
    const w = normWeapon(raw);
    const others = w ? sameWeapon(info, p, w) : [];
    if (others.length) { setAsk({ p, w, others }); return; }
    save([{ pid: p.id, weapon: w }], { warn: w && info.unarmed.has(p.id) ? 'είναι άοπλος κατά τη Σ.Ι. (' + siOf(p, lists).text + ').' : undefined });
  }, [info, save, lists]);
  // Επικόλληση στήλης από Excel: ένας αριθμός ανά γραμμή, από αυτή τη γραμμή και κάτω, με τη σειρά που φαίνεται
  const paste = useCallback((i: number, vals: string[], f: WF = 'weapon') => {
    const left = vals.length - Math.min(vals.length, rows.length - i);
    if (f !== 'weapon') {
      const ch = vals.slice(0, rows.length - i).map((v, j) => ({ pid: rows[i + j].id, [f]: v }));
      const what = f === 'rack' ? [' θέση οπλοβαστού', ' θέσεις οπλοβαστού'] : [' θέση όπλου', ' θέσεις όπλων'];
      setReset(n => n + 1);
      save(ch, { what: 'επικόλληση θέσεων', msg: 'Επικόλληση: ' + ch.length + (ch.length === 1 ? what[0] : what[1]) + ' από ' + shortName(rows[i]) + ' και κάτω', warn: left > 0 ? left + ' περίσσεψαν (δεν υπάρχουν άλλες γραμμές)' : undefined });
      return;
    }
    const changes = vals.slice(0, rows.length - i).map((v, j) => ({ pid: rows[i + j].id, weapon: v }));
    const next = new Map<string, number>(); state.people.forEach(p => { if (!changes.some(c => c.pid === p.id)) { const k = weaponKey(p.weapon); if (k) next.set(k, (next.get(k) || 0) + 1); } });
    changes.forEach(c => { const k = weaponKey(c.weapon); if (k) next.set(k, (next.get(k) || 0) + 1); });
    const dups = [...next.values()].filter(n => n > 1).length;
    const warn = [left > 0 && left + (left === 1 ? ' αριθμός περίσσεψε' : ' αριθμοί περίσσεψαν') + ' (δεν υπάρχουν άλλες γραμμές)', dups > 0 && dups + (dups === 1 ? ' αριθμός είναι' : ' αριθμοί είναι') + ' σε δύο ή περισσότερους (φίλτρο «Ίδιος αριθμός»)'].filter(Boolean).join(' · ');
    setReset(n => n + 1);
    save(changes, { warn: warn || undefined, what: 'επικόλληση', msg: 'Επικόλληση: ' + changes.length + (changes.length === 1 ? ' αριθμός όπλου' : ' αριθμοί όπλων') + ' από ' + shortName(rows[i]) + ' και κάτω' });
  }, [rows, state.people, save]);
  const exportXl = async (print: boolean) => {
    setXl(true);
    try {
      const r = await window.api.exportWeapons(date, print);
      if (!r.ok) toast({ text: html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
      else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
      else if (!print) toast({ text: 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': κατάσταση οπλισμού με στήλη υπογραφής, και ένα φύλλο για κάθε φίλτρο.' });
    } finally { setXl(false); }
  };
  const clear = () => { setQ(''); nav.set({ wfilter: 'all', unit: 'all', room: null }); };
  const fLabel = (WEAPON_FILTERS.find(([k]) => k === filter) || [, filter])[1];
  const H = (k: string, l: string) => html`<button key=${k} type="button" aria-sort=${sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'} onClick=${() => nav.set({ wsort: sort.k === k ? { k, dir: -sort.dir } : { k, dir: 1 } })}>${l}${sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button>`;
  // Τύπος σε όλους όσους φαίνονται και έχουν αριθμό όπλου αλλά όχι τύπο
  const noType = rows.filter(p => p.active && weaponKey(p.weapon) && !p.wtype);
  const typeAll = (t: string) => { if (t && noType.length) save(noType.map(p => ({ pid: p.id, wtype: t })), { what: 'τύπος ' + t, msg: 'Τύπος ' + t + ' σε ' + noType.length + (noType.length === 1 ? ' άτομο' : ' άτομα') + ' χωρίς τύπο' }); };
  const empty = { all: 'Δεν υπάρχει κανείς σε δύναμη.', with: 'Κανείς δεν έχει ακόμα όπλο.', out: 'Κανείς δεν έχει ένοπλη υπηρεσία ' + (date === today ? 'σήμερα' : dm(date)) + '.', without: 'Όλοι οι ένοπλοι έχουν όπλο.', unarmed: 'Κανένας άοπλος δεν έχει όπλο.', dup: 'Κανένας αριθμός δεν είναι σε δύο.', return: 'Όλοι οι εκτός δύναμης παρέδωσαν το όπλο τους.' }[filter];

  return html`<div>
    <${PageHeader} title="Οπλισμός" sub=${'Με όπλο ' + armedN + ' από ' + total + ' σε δύναμη, εκτός οπλοβαστού ' + (date === today ? 'σήμερα' : dow(date) + ' ' + dm(date)) + ' ' + outN + '. Κατάσταση: πάτα ΕΚΤΟΣ ή ΕΝΤΟΣ στη γραμμή και διάλεξε λόγο, η ώρα μπαίνει μόνη της· για πολλά μαζί τσέκαρέ τα. Αριθμός και θέση γράφονται στη γραμμή (Enter για τον επόμενο, επικόλληση στήλης από Excel).'}>
      <${DateBar} value=${date} onChange=${(d: string) => nav.set({ wdate: d === today ? null : d })} days=${[today, tomorrow]}/>
      <${Button} variant="outline" disabled=${xl} onClick=${() => exportXl(false)} data-tip="Κατάσταση οπλισμού με στήλη υπογραφής, και ένα φύλλο για κάθε φίλτρο (χωρίς όπλο, άοπλοι με όπλο, ίδιος αριθμός, να παραδώσουν)">${xl ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>
      <${Button} variant="outline" disabled=${xl} onClick=${() => exportXl(true)} data-tip="Κατάσταση οπλισμού με την κεφαλίδα της ΗΚΑΙ και στήλη υπογραφής" data-tip-side="left">${Icon.print}Εκτύπωση<//><//>
    <div style=${{ marginBottom: '12px' }}><${Tabs} value=${tab} onChange=${(v: string) => nav.set({ wtab: v })} items=${[{ value: 'weapons', label: 'Όπλα (' + armedN + ')' }, { value: 'moves', label: 'Κινήσεις' + (info.moves.size ? ' · εκτός ' + info.moves.size : '') }]}/></div>
    ${tab === 'moves' ? html`<${MovesView} date=${date} onIn=${setInFor}/>` : html`<${Fragment}>
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση" placeholder="Όνομα, ΑΣΜ, θάλαμος ή αριθμός όπλου (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${Segmented} small=${true} value=${unit} onChange=${(u: string) => nav.set({ unit: u, room: room != null && u !== 'all' && unitOf({ room }, state.settings) !== u ? null : room })} items=${UNITS}/>
      <select className="ui-select" aria-label="Θάλαμος" value=${room == null ? '' : String(room)} onChange=${(e: any) => { const r = e.target.value ? +e.target.value : null; nav.set({ room: r, unit: r != null && unit !== 'all' && unitOf({ room: r }, state.settings) !== unit ? 'all' : unit }); }}>
        <option value="">Όλοι οι θάλαμοι</option>${rooms.map(([r, n]) => html`<option key=${r} value=${String(r)}>Θάλαμος ${r} · ${n}</option>`)}</select>
      ${noType.length > 0 && html`<select className="ui-select" aria-label="Τύπος σε όσους δεν έχουν" value="" onChange=${(e: any) => typeAll(e.target.value)} data-tip="Βάζει τον τύπο σε όσους φαίνονται και έχουν αριθμό όπλου αλλά όχι τύπο. Νέοι τύποι στις Ρυθμίσεις › Λίστες.">
        <option value="">Τύπος σε ${noType.length} χωρίς τύπο…</option>${types.map((t: string) => html`<option key=${t} value=${t}>${t}</option>`)}</select>`}</div>
    <div className="filters"><${Strip} role="group" aria-label="Φίλτρα οπλισμού">${WEAPON_FILTERS.map(([k, l, , tip]) => html`<button key=${k} type="button" className=${cx('ui-chip', (k === 'unarmed' || k === 'dup' || k === 'return') && (counts[k] || 0) > 0 && 'ui-chip--warn')} aria-pressed=${filter === k} data-tip=${tip} onClick=${() => nav.set({ wfilter: filter === k && k !== 'all' ? 'all' : k })}>${l}<span className="cnt">${counts[k] || 0}</span></button>`)}<//>
      <${ActiveFilter} parts=${[unit !== 'all' && unit, room != null && 'Θάλαμος ' + room, filter !== 'all' && fLabel, dq.trim() && '«' + dq.trim() + '»']} onClear=${clear}/>
      <span className="toolbar__count">${rows.length} ${rows.length === 1 ? 'άτομο' : 'άτομα'}</span></div>
    ${sel.size > 0 && html`<div className="bulkbar"><span>${sel.size} επιλεγμένοι</span>
      ${selIn.length > 0 && html`<div className="bulkbar__reasons"><small>ΕΚΤΟΣ ${selIn.length} ${selIn.length === 1 ? 'όπλο' : 'όπλα'} για:</small>${outReasons.map(r => html`<${Button} key=${r} size="sm" onClick=${() => { setOutReason(r); setOutFor(selIn.map(p => p.id)); }} data-tip=${'Έξοδος για ' + r + ': βλέπεις την ώρα (τώρα) πριν το γράψεις'}>${r}<//>`)}<${Button} size="sm" variant="outline" onClick=${() => { setOutReason(''); setOutFor(selIn.map(p => p.id)); }}>Άλλος…<//></div>`}
      ${selOut.length > 0 && html`<${Button} size="sm" variant="outline" onClick=${() => setInFor(selOut.map(m => m.id))}>ΕΝΤΟΣ ${selOut.length} ${selOut.length === 1 ? 'όπλο' : 'όπλα'}…<//>`}
      <${Button} size="sm" variant="ghost" onClick=${() => setSel(new Set())}>Καθάρισε<//></div>`}
    ${rows.length === 0 ? html`<div className="ui-card empty">${dq.trim() || unit !== 'all' || room != null ? html`Κανείς δεν ταιριάζει. <${Button} variant="link" onClick=${clear}>Καθάρισε αναζήτηση και φίλτρα<//>` : empty}</div>` :
    html`<div className="ptable ptable--weapons" role="table" aria-rowcount=${rows.length}><div style=${{ overflowX: 'auto' }}><div style=${{ minWidth: '1510px' }}>
      <div className="ptable__head" role="row" style=${{ gridTemplateColumns: GRID }}><span><input type="checkbox" className="ui-check" aria-label="Επιλογή όλων" data-tip="Όλοι όσοι φαίνονται (π.χ. ένας ουλαμός για ΕΚΠ)" checked=${allSel} onChange=${() => setSel(allSel ? new Set() : new Set(rows.map(p => p.id)))}/></span><span>Α/Α</span><span>Βαθμός</span>${H('last', 'Επίθετο')}<span>Όνομα</span><span>Πατρώνυμο</span><span>ΑΣΜ</span>${H('room', 'Θάλαμος')}<span>Σ.Ι.</span><span data-tip="Από τη λίστα «Τύποι όπλων» (Ρυθμίσεις › Λίστες)">Τύπος</span>${H('weapon', 'Αριθμός όπλου')}<span data-tip="ΕΝΤΟΣ ή ΕΚΤΟΣ οπλοβαστού τώρα, και γιατί. Πάτα ΕΚΤΟΣ ή ΕΝΤΟΣ στη γραμμή· η ώρα μπαίνει μόνη της και αλλάζει. Ένοπλη υπηρεσία: εκτός αυτόματα.">Κατάσταση όπλου${date !== today ? ' · υπηρεσίες ' + dm(date) : ''}</span>${H('rack', 'Οπλοβαστός')}<span data-tip="Η θέση του όπλου, ό,τι θέλεις να γράψεις (γράφεται με κεφαλαία και στο Excel)">Θέση</span><span>Παρατήρηση</span></div>
      <div className="weapons__body">${rows.map((p, i) => html`<div key=${p.id} className=${cx('ptable__row', i % 2 === 1 && 'is-odd', info.moves.has(p.id) && 'is-wout')} style=${{ gridTemplateColumns: GRID, cursor: 'default' }} role="row">
        <span><input type="checkbox" className="ui-check" aria-label=${'Επιλογή ' + fullName(p)} checked=${sel.has(p.id)} onChange=${() => toggle(p.id)}/></span>
        <span className="num muted">${i + 1}</span><span>${p.rank}</span>
        <span><button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)} data-tip="Καρτέλα οπλίτη"><b>${p.last}</b></button></span><span>${p.first}</span><span>${p.father}</span>
        <span className="num">${p.asm}</span><span>${p.room ?? ''}</span><span>${p.si ? siOf(p, lists).text : ''}</span>
        <span className="weapon-cell"><${TypeSelect} p=${p} types=${types} onPick=${(q: Person, t: string) => save([{ pid: q.id, wtype: t }])}/></span>
        <span className="weapon-cell"><${WeaponInput} p=${p} i=${i} reset=${reset} onCommit=${commit} onPaste=${paste}/></span>
        <span className="weapon-cell"><${WeaponState} p=${p} info=${info}/></span>
        <span className="weapon-cell"><${WeaponInput} p=${p} i=${i} f="rack" reset=${reset} onCommit=${commit} onPaste=${paste}/></span>
        <span className="weapon-cell"><${WeaponInput} p=${p} i=${i} f="wpos" reset=${reset} onCommit=${commit} onPaste=${paste}/></span>
        <span className="badges weapon-notes">${notes(p, info, lists)}${!p.active && weaponKey(p.weapon) && html`<${Button} size="sm" variant="outline" onClick=${() => save([{ pid: p.id, weapon: '' }], { msg: shortName(p) + ': παρέδωσε το όπλο ' + p.weapon })} data-tip=${'Παρέδωσε το όπλο ' + p.weapon + ': σβήνεται ο αριθμός'}>Παρέδωσε<//>`}</span>
      </div>`)}</div>
    </div></div></div>`}<//>`}
    ${outFor && html`<${WeaponOutDialog} pids=${outFor} reason=${outReason} onClose=${() => setOutFor(null)} onDone=${() => setSel(new Set())}/>`}
    ${inFor && html`<${WeaponInDialog} ids=${inFor} onClose=${() => setInFor(null)} onDone=${() => setSel(new Set())}/>`}
    ${ask && html`<${Dialog} title=${'Το όπλο ' + ask.w + ' είναι ήδη χρεωμένο'} onClose=${() => { setAsk(null); setReset(n => n + 1); }}
      description=${html`<span>Ο αριθμός <b>${ask.w}</b> είναι στον ${ask.others.map(x => html`<b key=${x.id}>${x.rank} ${plainName(x)}</b>${x.active ? '' : ' (εκτός δύναμης)'}`).reduce((a: any[], x: any, j: number) => (j ? [...a, ', ', x] : [x]), [])}. Να μεταφερθεί στον ${ask.p.rank} ${plainName(ask.p)};</span>`}
      footer=${html`<${Button} variant="outline" onClick=${() => { setAsk(null); setReset(n => n + 1); }}>Άκυρο<//>
        <${Button} variant="outline" onClick=${async () => { const a = ask; setAsk(null); await save([{ pid: a.p.id, weapon: a.w }], { warn: 'ο ίδιος αριθμός μένει και σε ' + a.others.map(shortName).join(', ') + '.' }); }}>Κράτα και στους δύο<//>
        <${Button} data-autofocus="" onClick=${async () => { const a = ask; setAsk(null); await save([...a.others.map(x => ({ pid: x.id, weapon: '' })), { pid: a.p.id, weapon: a.w }], { what: 'μεταφορά όπλου ' + a.w, msg: 'Το όπλο ' + a.w + ' πήγε στον ' + shortName(a.p) + ' (σβήστηκε από ' + a.others.map(shortName).join(', ') + ')', warn: info.unarmed.has(a.p.id) ? 'είναι άοπλος κατά τη Σ.Ι. (' + siOf(a.p, lists).text + ').' : undefined }); }}>Μεταφορά<//>`}>
      <p className="muted" style=${{ margin: 0 }}>Με τη μεταφορά σβήνεται από ${ask.others.length === 1 ? 'τον άλλον' : 'τους άλλους'}. Αναιρείται με Ctrl+Z.</p><//>`}
  </div>`;
}
