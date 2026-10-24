// features/weapons: Οπλισμός (Michael, 17/10: ο αριθμός όπλου βγήκε από την καρτέλα του οπλίτη σε δική του καρτέλα).
// Όλοι σε δύναμη με τον αριθμό όπλου τους, γραμμένο κατευθείαν στη γραμμή: Enter/↓ πάει στον επόμενο, επικόλληση στήλης
// από Excel γεμίζει τις επόμενες γραμμές με τη σειρά. Ίδιος αριθμός σε άλλον: ρωτά (μεταφορά ή και στους δύο), δεν μπλοκάρει.
// Τύπος όπλου από τη λίστα «Τύποι όπλων», θέση στον οπλοβαστό (Ε6), «Θέση» του όπλου (ελεύθερο κείμενο, Michael 18/10) και εντός/εκτός τη μέρα (εκτός με ένοπλη υπηρεσία, και γιατί).
// Έξοδος/είσοδος όπλων με λόγο και ώρα (Michael, 18/10): κουμπί στη γραμμή ή τσέκαρε πολλούς· ημερολόγιο στις «Κινήσεις» (weaponMoves.ts).
import { HK, UNIT } from '../../shared/unit';
import { Fragment, useCallback, useDeferredValue, useMemo, useRef, useState, useEffect, memo } from 'react';
import { html, cx, Badge, Button, Dialog, Icon, PageHeader, Segmented, Strip, Tabs, VirtualList, useToast, useViewportHeight } from '../ui';
import { Select } from '../select';
import { MovesView, Pop, WeaponInDialog, WeaponOutDialog, WeaponState, reasonLbl } from './weaponMoves';
import { useNav, useOpenFrom, useStore } from '../store';
import { ActiveFilter, DateBar, SigsMenu } from '../common';
import type { Sig } from '../../shared/sigs';
import { fullName, plainName, platoonsOf, platoonShort, shortName, unitOf, type Person } from '../../shared/domain';
import { siOf, siShort } from '../../shared/si';
import { byRoomName } from '../../shared/rosterLists';
import { personMatch } from '../../shared/weaponView';
import { AUTO_KEY, WEAPON_FILTERS, bySeat, canOut, dutyPicks, idRange, isOut, noSeat, normPos, normRack, normWeapon, outPeople, outReasonOf, outReasons as byReason, posKey, outSplit, rackKey, redoGroups, sameRack, scanFind, seatTxt, skipTxt, sameWeapon, weaponInfo, weaponKey, weaponMatch, type WeaponFilter, type WeaponInfo } from '../../shared/weapons';
import type { WeaponChange } from '../../shared/commands';
import { listOf, rankTxt } from '../../shared/ranks';
import { collator } from '../../shared/text';
import { dm, dow, nowHM, today as todayFn } from '../../shared/dates';
import { armWhen, hmOf } from '../../shared/armed';
type P = any;

// Χωρά σε 1366 χωρίς οριζόντια κύλιση (1140px): χωρίς πατρώνυμο (είναι στην καρτέλα και στο Excel). Η στήλη κατάστασης είναι η πιο φαρδιά: ο λόγος εξόδου διαβάζεται ολόκληρος
const GRID = '26px 30px 58px minmax(120px,1fr) minmax(70px,.8fr) 66px 40px 80px 80px 92px minmax(236px,2fr) 64px 64px minmax(124px,.7fr)';
const GRID_MIN = 1150;
const ROW_H = 46;   // κάτω από τον διακόπτη ΕΝΤΟΣ/ΕΚΤΟΣ γράφεται ο λόγος ολόκληρος (Michael, 24/10)
// Πάει στο κουτί της γραμμής i. Ο πίνακας στήνει μόνο τις γραμμές που φαίνονται: αν δεν είναι στη σελίδα, κυλά ως εκεί πρώτα.
const focusRow = (f: string, i: number) => {
  const find = () => document.querySelector('input[data-wf="' + f + '"][data-wrow="' + i + '"]') as HTMLInputElement | null;
  const go = (el: HTMLInputElement) => { el.focus(); el.select(); el.scrollIntoView({ block: 'nearest' }); };
  const el = find(); if (el) { go(el); return true; }
  const box = document.querySelector('.weapons__body') as HTMLElement | null;
  if (!box || i < 0 || i >= Number(box.dataset.rows || 0)) return false;
  box.scrollTop = Math.max(0, i * ROW_H - box.clientHeight / 2);
  requestAnimationFrame(() => requestAnimationFrame(() => { const x = find(); if (x) go(x); }));
  return true;
};
type WF = 'weapon' | 'rack' | 'wpos';
const NORM: Record<WF, (v: unknown) => string> = { weapon: normWeapon, rack: normRack, wpos: normPos };
const LBL: Record<WF, string> = { weapon: 'Αριθμός όπλου', rack: 'Θέση οπλοβαστού', wpos: 'Θέση όπλου' };

// Αριθμός ή θέση οπλοβαστού στη γραμμή: γράφεται όταν φύγεις από το κουτί (Enter, ↑/↓, Tab ή κλικ αλλού)· Esc ξαναφέρνει
// τον παλιό. Επικόλληση στήλης από Excel: μία τιμή ανά γραμμή, από αυτή και κάτω.
const WeaponInput = memo(function WeaponInput({ p, i, f = 'weapon', reset, onCommit, onPaste }: P) {
  const cur = p[f] || '';
  const [v, setV] = useState(cur);
  useEffect(() => setV(cur), [cur, reset]);
  // η γραμμή φεύγει από τη σελίδα (κύλιση, φίλτρο) ενώ γράφεις: η τιμή γράφεται, δεν χάνεται
  const live = useRef({ v, cur, p, f, onCommit, sent: cur }); live.current = { ...live.current, v, cur, p, f, onCommit };
  useEffect(() => () => { const x = live.current; const n = NORM[x.f as WF](x.v); if (n !== x.cur && n !== NORM[x.f as WF](x.sent)) x.onCommit(x.p, x.v, x.f); }, []);
  const move = (e: any, to: number) => { e.preventDefault(); if (!focusRow(f, to)) e.target.blur(); };
  return html`<input className="ui-input weapon-input" data-wf=${f} data-wrow=${i} value=${v} placeholder="—" aria-label=${LBL[f as WF] + ' ' + fullName(p)} spellCheck="false" autoComplete="off"
    onChange=${(e: any) => setV(e.target.value)}
    onBlur=${() => { if (NORM[f as WF](v) !== cur) { live.current.sent = v; onCommit(p, v, f); } }}
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
  return html`<${Select} className="ui-select weapon-type" aria-label=${'Τύπος όπλου ' + fullName(p)} value=${p.wtype || ''} onChange=${(e: any) => onPick(p, e.target.value)}>
    <option value="">—</option>${opts.map((t: string) => html`<option key=${t} value=${t}>${t}</option>`)}<//>`;
}
// Παρατήρηση: μία ετικέτα· με περισσότερες, «⚠ 2» και όλες στη συμβουλή (για να μην κόβονται και πέφτουν η μία πάνω στην άλλη)
interface Note { tone: string; text: string; tip: string }
function notes(p: Person, info: WeaponInfo, lists: P, pm: Map<number, Person>) {
  const out: Note[] = [];
  if (!p.active) out.push({ tone: 'warn', text: 'Εκτός δύναμης', tip: p.outOn ? 'Εκτός δύναμης από ' + dm(p.outOn) : 'Εκτός δύναμης' });
  const has = !!weaponKey(p.weapon);
  if (has && info.unarmed.has(p.id)) out.push({ tone: 'warn', text: 'Άοπλος', tip: 'Άοπλος κατά τη Σ.Ι. (' + siOf(p, lists).text + ')' });
  const same = has ? sameWeapon(info, p) : [];
  if (same.length) out.push({ tone: 'bad', text: 'Ίδιος με ' + shortName(same[0]) + (same.length > 1 ? ' +' + (same.length - 1) : ''), tip: 'Ο ίδιος αριθμός: ' + same.map(x => shortName(x) + (x.active ? '' : ' (εκτός δύναμης)')).join(', ') });
  // θέση = οπλοβαστός + θέση μαζί (Ε 22 και Ε 23 δεν προειδοποιούν)
  const rk = p.active && rackKey(p.rack) ? sameRack(info, p) : [];
  if (rk.length) out.push({ tone: 'warn', text: 'Ίδια θέση ×' + (rk.length + 1), tip: 'Η ίδια θέση (' + seatTxt(p.rack, p.wpos) + '): ' + rk.map(shortName).join(', ') });
  if (noSeat(p)) out.push({ tone: 'warn', text: 'Χωρίς θέση', tip: 'Έχει οπλοβαστό (' + normRack(p.rack) + ') αλλά όχι θέση: γράψε τη Θέση' });
  // ένοπλη υπηρεσία χωρίς όπλο: και πριν ξεκινήσει το νούμερο, για να προλάβει να του δοθεί (Michael, 24/10)
  const soon = info.arm.next.get(p.id);
  if (!has && p.active && (isOut(info, p.id) || soon)) out.push({ tone: 'bad', text: 'Ένοπλη χωρίς όπλο', tip: 'Ένοπλη υπηρεσία (' + (info.out.get(p.id) || soon!.label + ' ' + armWhen(soon!)) + ') χωρίς αριθμό όπλου' });
  const hold = info.arm.holding.get(p.id);
  if (hold) out.push({ tone: 'info', text: 'Κρατά όπλο θέσης', tip: 'Κρατά το όπλο της θέσης (' + hold.label + ') του ' + (pm.get(hold.owner) ? shortName(pm.get(hold.owner)!) : '—') + ' ως τις ' + hmOf(hold.in) });
  // «αυτόματα»: εκτός λόγω ένοπλης υπηρεσίας (ξεχωρίζει από τον χειροκίνητο λόγο ΥΠΗΡΕΣΙΑ), δεν μετρά στο «⚠ n»
  const auto = !info.moves.has(p.id) && info.out.has(p.id) ? [html`<${Badge} key="auto" tone="warn" data-tip=${'Αυτόματα από τις ένοπλες υπηρεσίες: ' + info.out.get(p.id)}>αυτόματα<//>`] : [];
  if (out.length < 2) return [...auto, ...out.map(n => html`<${Badge} key=${n.text} tone=${n.tone} data-tip=${n.tip}>${n.text}<//>`)];
  const tone = out.some(n => n.tone === 'bad') ? 'bad' : 'warn';
  return [...auto, html`<${Badge} key="n" tone=${tone} data-tip=${out.map(n => n.tip).join(' · ')}>⚠ ${out.length}<//>`];
}



// Μία γραμμή του πίνακα. Ξαναζωγραφίζεται μόνο όταν αλλάξει κάτι δικό της ή ο οπλισμός (info), όχι σε κάθε πλήκτρο της αναζήτησης.
const WRow = memo(function WRow({ p, i, style, selected, info, pm, types, lists, reset, onToggle, onOpen, save, commit, paste }: P) {
  return html`<div className=${cx('ptable__row', i % 2 === 1 && 'is-odd', info.moves.has(p.id) && 'is-wout')} style=${{ ...style, gridTemplateColumns: GRID, cursor: 'default' }} role="row">
        <span><input type="checkbox" className="ui-check" aria-label=${'Επιλογή ' + fullName(p)} checked=${selected} onChange=${(e: any) => onToggle(p.id, !!e.nativeEvent?.shiftKey)}/></span>
        <span className="num muted">${i + 1}</span><span>${rankTxt(p)}</span>
        <span><button type="button" className="linkish" onClick=${() => onOpen(p.id)} data-tip="Καρτέλα οπλίτη"><b>${p.last}</b></button></span><span>${p.first}</span>
        <span className="num">${p.asm}</span><span>${p.room ?? ''}</span><span data-tip=${p.si ? siOf(p, lists).text : undefined}>${p.si ? siShort(siOf(p, lists).text) : ''}</span>
        <span className="weapon-cell"><${TypeSelect} p=${p} types=${types} onPick=${(q: Person, t: string) => save([{ pid: q.id, wtype: t }])}/></span>
        <span className="weapon-cell"><${WeaponInput} p=${p} i=${i} reset=${reset} onCommit=${commit} onPaste=${paste}/></span>
        <span className="weapon-cell"><${WeaponState} p=${p} info=${info} pm=${pm}/></span>
        <span className="weapon-cell"><${WeaponInput} p=${p} i=${i} f="rack" reset=${reset} onCommit=${commit} onPaste=${paste}/></span>
        <span className="weapon-cell"><${WeaponInput} p=${p} i=${i} f="wpos" reset=${reset} onCommit=${commit} onPaste=${paste}/></span>
        <span className="badges weapon-notes">${notes(p, info, lists, pm)}${!p.active && weaponKey(p.weapon) && html`<${Button} size="sm" variant="outline" onClick=${() => save([{ pid: p.id, weapon: '' }], { msg: shortName(p) + ': παρέδωσε το όπλο ' + p.weapon })} data-tip=${'Παρέδωσε το όπλο ' + p.weapon + ': σβήνεται ο αριθμός'}>Παρέδωσε<//>`}</span>
      </div>`;
});

// Μενού επιλογής («Ξανά οι ίδιοι», «Από υπηρεσία»): μικρό παράθυρο κάτω από το κουμπί, ένα κλικ τσεκάρει
interface PickItem { key: string; text: string; sub?: string; pick: () => void }
function PickMenu({ label, tip, items, empty }: { label: string; tip: string; items: PickItem[]; empty: string }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return html`<${Fragment}><span ref=${ref}><${Button} size="sm" variant="outline" aria-haspopup="true" aria-expanded=${open} data-tip=${tip} onClick=${() => setOpen(o => !o)}>${label} ▾<//></span>
    ${open && html`<${Pop} anchor=${ref} onClose=${close} label=${label}><ul className="wmenu">${items.length ? items.map(it => html`<li key=${it.key}><button type="button" className="wmenu__item" onClick=${() => { close(); it.pick(); }}><b>${it.text}</b><span className="muted">${it.sub}</span></button></li>`) : html`<li className="muted">${empty}</li>`}</ul><//>`}<//>`;
}

export function WeaponsScreen() {
  const { state, today, tomorrow, run, undoMark } = useStore(); const nav = useNav(); const toast = useToast();
  const date: string = nav.params.wdate || today;
  const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  const filter: WeaponFilter = nav.params.wfilter || 'all';
  const unitP: string = nav.params.unit || 'all';
  const unit = unitP === 'all' || platoonsOf(state.settings).some(u => platoonShort(u.name) === unitP) ? unitP : 'all';
  const room: number | null = nav.params.room ?? null;
  const sort: { k: string; dir: number } = nav.params.wsort || { k: 'room', dir: 1 };
  const reasonF: string = nav.params.wreason || '';   // φίλτρο λόγου εξόδου από τη λωρίδα «Εκτός τώρα»
  const [reset, setReset] = useState(0);
  const height = useViewportHeight(360);
  const [ask, setAsk] = useState<{ p: Person; w: string; others: Person[] } | null>(null);
  const [xl, setXl] = useState(false);
  const lists = state.settings.lists;
  // Σήμερα οι ένοπλες υπηρεσίες κρίνονται με την ώρα (νούμερο που τρέχει, πριν, μετά)· η ώρα ανανεώνεται μόνη της
  const [hm, setHm] = useState(nowHM());
  useEffect(() => { const t = setInterval(() => setHm(nowHM()), 15000); return () => clearInterval(t); }, []);
  const live = date === today ? hm : undefined;
  const info = useMemo(() => weaponInfo(state, date, live), [state.people, state.settings, state.rules, state.guards, state.dutyLog, state.weaponLog, state.dutyFix, date, live]);
  const pm = useMemo(() => new Map(state.people.map(p => [p.id, p])), [state.people]);
  // τσεκαρισμένοι για έξοδο/είσοδο μαζί· οι διάλογοι έξοδος (pids) και είσοδος (ids κινήσεων)
  const [sel, setSel] = useState(() => new Set<number>());
  const [outFor, setOutFor] = useState<number[] | null>(null); const [outReason, setOutReason] = useState('');
  const outReasons = useMemo(() => listOf(lists, 'weaponOut'), [lists]); const [inFor, setInFor] = useState<string[] | null>(null);
  const tab: string = nav.params.wtab || 'weapons';
  const [onlySel, setOnlySel] = useState(false);       // «Επιλεγμένοι»: δείχνει μόνο τους τσεκαρισμένους, όποια φίλτρα κι αν υπάρχουν
  const [scan, setScan] = useState(''); const [pickMsg, setPickMsg] = useState<{ tone: string; text: string } | null>(null);
  const [lastReason, setLastReason] = useState('');    // ο τελευταίος λόγος εξόδου: το «Ώρα…» ανοίγει με αυτόν, για να επιβεβαιώνει το Enter
  const rowsRef = useRef<Person[]>([]); const anchorRef = useRef<number | null>(null);
  // shift-κλικ: όλα τα ενδιάμεσα (όπως φαίνονται) παίρνουν την τιμή του τελευταίου κλικ
  const toggle = useCallback((id: number, shift?: boolean) => {
    const a = anchorRef.current; anchorRef.current = id;
    setSel(s => {
      const n = new Set(s); const on = !s.has(id); const r = shift && a != null ? idRange(rowsRef.current.map(p => p.id), a, id) : [];
      (r.length ? r : [id]).forEach(x => (on ? n.add(x) : n.delete(x))); return n;
    });
  }, []);
  const types = useMemo(() => listOf(lists, 'weaponTypes'), [lists]);
  const UNITS = useMemo(() => [{ value: 'all', label: UNIT().all }, ...platoonsOf(state.settings).map(u => ({ value: platoonShort(u.name), label: platoonShort(u.name), tip: u.rooms.length ? 'Θάλαμοι ' + u.rooms.join(', ') : 'Χωρίς θαλάμους' }))], [state.settings.rooms]);
  const place = (p: Person) => (unit === 'all' || unitOf(p, state.settings) === unit) && (room == null || p.room === room);
  const counts = useMemo(() => {
    const n: Record<string, number> = {};
    for (const p of state.people) { if (!place(p)) continue; for (const [k] of WEAPON_FILTERS) if (weaponMatch(k, p, info)) n[k] = (n[k] || 0) + 1; }
    return n;
  }, [state.people, info, unit, room, state.settings.rooms]);
  const rooms = useMemo(() => { const m = new Map<number, number>(); state.people.forEach(p => { if (p.active && p.room != null) m.set(p.room, (m.get(p.room) || 0) + 1); }); return [...m].sort((a, b) => a[0] - b[0]); }, [state.people]);
  const onlyS = onlySel && sel.size > 0;
  const rows = useMemo(() => {
    const r = onlyS ? state.people.filter(p => sel.has(p.id)) : state.people.filter(p => place(p) && weaponMatch(filter, p, info) && personMatch(p, dq) && (!reasonF || (p.active && isOut(info, p.id) && outReasonOf(info, p.id) === reasonF)));
    const cmp = sort.k === 'rack' ? (a: Person, b: Person) => (rackKey(a.rack) ? 0 : 1) - (rackKey(b.rack) ? 0 : 1) || bySeat(a, b) * sort.dir || byRoomName(a, b)
      : sort.k === 'weapon' ? (a: Person, b: Person) => (weaponKey(a.weapon) ? 0 : 1) - (weaponKey(b.weapon) ? 0 : 1) || collator.compare(weaponKey(a.weapon), weaponKey(b.weapon)) * sort.dir || byRoomName(a, b)
      : sort.k === 'last' ? (a: Person, b: Person) => (collator.compare(a.last, b.last) || collator.compare(a.first, b.first)) * sort.dir
      : (a: Person, b: Person) => (byRoomName(a, b)) * sort.dir;
    // ίδιος αριθμός: ο ένας κάτω από τον άλλον
    return r.sort(filter === 'dup' ? (a, b) => collator.compare(weaponKey(a.weapon), weaponKey(b.weapon)) || byRoomName(a, b) : cmp);
  }, [state.people, info, filter, dq, unit, room, sort, state.settings.rooms, onlyS, onlyS && sel, reasonF]);
  rowsRef.current = rows;
  const openP = useOpenFrom(rows);
  const total = state.people.filter(p => p.active).length;
  // Κεφαλίδα, chip «Εκτός οπλοβαστού» και καρτέλα «Κινήσεις» μετράνε τους ίδιους: κινήσεις και ένοπλες υπηρεσίες, μία φορά ο καθένας
  const outN = useMemo(() => outPeople(state.people, info).length, [state.people, info]);
  const reasons = useMemo(() => byReason(state.people, info), [state.people, info]);
  const selP = state.people.filter(p => sel.has(p.id));
  const sp = outSplit(selP, info); const selIn = sp.go;   // όσοι από τους τσεκαρισμένους μπορούν να βγουν
  const shown = useMemo(() => new Set(rows.map(p => p.id)), [rows]); const hidN = selP.filter(p => !shown.has(p.id)).length;
  const selOut = selP.map(p => info.moves.get(p.id)).filter(Boolean) as { id: string }[];
  // Τσεκ κεφαλίδας: όσοι φαίνονται ΚΑΙ μπορούν να βγουν· αν δεν υπάρχει κανείς (π.χ. φίλτρο «Εκτός οπλοβαστού»), όσοι είναι εκτός, για ΕΝΤΟΣ
  const tickable = useMemo(() => { const g = rows.filter(p => canOut(p, info)); return g.length ? g : rows.filter(p => info.moves.has(p.id)); }, [rows, info]);
  const allSel = tickable.length > 0 && tickable.every(p => sel.has(p.id));
  useEffect(() => { if (!sel.size) setOnlySel(false); }, [sel]);
  const armedN = state.people.filter(p => p.active && weaponKey(p.weapon)).length;

  // msg: το μήνυμα (αλλιώς «Χ: όπλο 123»)· warn: προειδοποίηση από κάτω, με αναίρεση
  const save = useCallback(async (changes: WeaponChange[], o: { warn?: string; what?: string; msg?: string } = {}) => {
    if (await run({ t: 'setWeapons', changes, what: o.what }, false) === null) { setReset(n => n + 1); return; }
    const c0 = changes[0]; const one = changes.length === 1 ? state.people.find(p => p.id === c0.pid) : null;
    const seatMsg = (rack: unknown, wpos: unknown) => (rackKey(rack) && posKey(wpos) ? 'θέση ' + seatTxt(rack, wpos) : rackKey(rack) ? 'οπλοβαστός ' + normRack(rack) : 'θέση ' + normPos(wpos));
    const part = c0 && (c0.weapon !== undefined ? (normWeapon(c0.weapon) ? 'όπλο ' + normWeapon(c0.weapon) : 'χωρίς όπλο') : c0.rack !== undefined ? (normRack(c0.rack) ? seatMsg(c0.rack, c0.wpos !== undefined ? c0.wpos : one?.wpos) : 'χωρίς οπλοβαστό') : c0.wpos !== undefined ? (normPos(c0.wpos) ? seatMsg(c0.rack !== undefined ? c0.rack : one?.rack, c0.wpos) : 'χωρίς θέση') : (c0.wtype ? 'τύπος ' + c0.wtype : 'χωρίς τύπο όπλου'));
    const msg = o.msg || (one ? shortName(one) + ': ' + part : 'Οπλισμός: ' + changes.length + ' άτομα');
    toast({ text: html`<span>${msg}${o.warn && html`<br/><b>Προσοχή:</b> ${o.warn}`}</span>`, actions: [undoMark()] });
  }, [run, toast, undoMark, state.people]);
  const commit = useCallback((p: Person, raw: string, f: WF = 'weapon') => {
    // ζεύγος Οπλοβ. + Θέση: προειδοποίηση μόνο όταν και τα δύο ίδια σε άλλον (σε δύναμη)
    if (f === 'wpos') { const o = normPos(raw) && rackKey(p.rack) && p.active ? sameRack(info, p, p.rack, raw) : []; save([{ pid: p.id, wpos: raw }], { warn: o.length ? 'η θέση ' + seatTxt(p.rack, raw) + ' είναι και του ' + o.map(shortName).join(', ') + '.' : undefined }); return; }
    if (f === 'rack') { const r = normRack(raw); const o = r && p.active && posKey(p.wpos) ? sameRack(info, p, r, p.wpos) : []; save([{ pid: p.id, rack: r }], { warn: o.length ? 'η θέση ' + seatTxt(r, p.wpos) + ' είναι και του ' + o.map(shortName).join(', ') + '.' : r && p.active && weaponKey(p.weapon) && !posKey(p.wpos) ? 'χωρίς θέση: γράψε και τη Θέση.' : undefined }); return; }
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
  const exportXl = async (print: boolean, sigs?: Sig[]) => {
    setXl(true);
    try {
      const r = await window.api.exportWeapons(date, print, sigs);
      if (!r.ok) toast({ text: html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
      else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
      else if (!print) toast({ text: 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': κατάσταση οπλισμού με στήλη υπογραφής, και ένα φύλλο για κάθε φίλτρο.' });
    } finally { setXl(false); }
  };
  // ΕΚΤΟΣ αμέσως (ώρα τώρα) για όσους μπορούν· όσοι παραλείπονται λέγονται στο μήνυμα· «Αναίρεση» τα φέρνει όλα πίσω
  const outNow = async (reason: string) => {
    if (!selIn.length) { toast({ text: 'Κανένα όπλο για έξοδο' + (skipTxt(sp) ? ': ' + skipTxt(sp) : '') }); return; }
    const time = nowHM(); const n = selIn.length;
    if (!(await run({ t: 'weaponOut', pids: selIn.map(p => p.id), reason, day: todayFn(), time }, false))) return;
    setLastReason(reason); setSel(new Set()); setOnlySel(false);
    toast({ text: 'ΕΚΤΟΣ ' + n + (n === 1 ? ' όπλο' : ' όπλα') + ' (' + reason.trim().toUpperCase() + ') ' + time + (skipTxt(sp) ? ' · ' + skipTxt(sp) : ''), actions: [undoMark()] });
  };
  // Τσεκάρει όσους μπορούν να βγουν από μια ομάδα, και λέει πόσοι και γιατί όχι οι υπόλοιποι
  const tick = (ps: Person[], label: string) => {
    const x = outSplit(ps, info); const have = x.go.filter(p => sel.has(p.id)).length;
    setSel(s => { const n = new Set(s); x.go.forEach(p => n.add(p.id)); return n; });
    setPickMsg({ tone: x.go.length ? 'ok' : 'warn', text: label + ': τσεκαρίστηκαν ' + x.go.length + ' από ' + ps.length + (have ? ' (' + have + ' ήδη επιλεγμένοι)' : '') + (skipTxt(x) ? ' · ' + skipTxt(x) : '') });
  };
  const byIds = (ids: number[]) => { const pm = new Map(state.people.map(p => [p.id, p])); return ids.map(id => pm.get(id)).filter(Boolean) as Person[]; };
  // Κουτί σάρωσης: θέση (Ε 23), αριθμός όπλου ή ΑΣΜ· από όλους σε δύναμη, όχι μόνο όσους φαίνονται
  const doScan = () => {
    const t = scan.trim(); if (!t) return;
    const { hits } = scanFind(t, state.people);
    if (!hits.length) { setPickMsg({ tone: 'bad', text: 'Δεν βρέθηκε: ' + t }); return; }
    const x = outSplit(hits, info); const add = x.go.filter(p => !sel.has(p.id)); const again = x.go.filter(p => sel.has(p.id));
    const nm = (l: Person[]) => l.map(shortName).join(', ');
    setSel(s => { const n = new Set(s); x.go.forEach(p => n.add(p.id)); return n; });
    setPickMsg({ tone: add.length ? 'ok' : 'warn', text: [add.length > 0 && '✓ ' + add.map(p => shortName(p) + ' · ' + p.weapon).join(', '), again.length > 0 && nm(again) + ': ήδη επιλεγμένος', x.already.length > 0 && nm(x.already) + ': ήδη εκτός', x.noW.length > 0 && nm(x.noW) + ': χωρίς αριθμό όπλου'].filter(Boolean).join(' · ') });
    setScan('');
  };
  const redo = useMemo(() => redoGroups(state.weaponLog), [state.weaponLog]);
  const duties = useMemo(() => dutyPicks(state, date), [state.guards, state.dutyLog, state.settings, date]);
  const clear = () => { setQ(''); setOnlySel(false); nav.set({ wfilter: 'all', unit: 'all', room: null, wreason: null }); };
  const fLabel = (WEAPON_FILTERS.find(([k]) => k === filter) || [, filter])[1];
  const H = (k: string, l: string) => html`<button key=${k} type="button" aria-sort=${sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'} onClick=${() => nav.set({ wsort: sort.k === k ? { k, dir: -sort.dir } : { k, dir: 1 } })}>${l}${sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button>`;
  // Τύπος σε όλους όσους φαίνονται και έχουν αριθμό όπλου αλλά όχι τύπο
  const noType = rows.filter(p => p.active && weaponKey(p.weapon) && !p.wtype);
  const typeAll = (t: string) => { if (t && noType.length) save(noType.map(p => ({ pid: p.id, wtype: t })), { what: 'τύπος ' + t, msg: 'Τύπος ' + t + ' σε ' + noType.length + (noType.length === 1 ? ' άτομο' : ' άτομα') + ' χωρίς τύπο' }); };
  const empty = { all: 'Δεν υπάρχει κανείς σε δύναμη.', with: 'Κανείς δεν έχει ακόμα όπλο.', out: 'Κανείς δεν είναι εκτός οπλοβαστού ' + (date === today ? 'τώρα' : dm(date)) + '.', without: 'Όλοι οι ένοπλοι έχουν όπλο.', unarmed: 'Κανένας άοπλος δεν έχει όπλο.', dup: 'Κανένας αριθμός δεν είναι σε δύο.', return: 'Όλοι οι εκτός δύναμης παρέδωσαν το όπλο τους.' }[filter];

  return html`<div>
    <${PageHeader} title="Οπλισμός" quote="«Το θέμα είναι ο οπλισμός» - Λοχαγός Μ. Γ' ΕΣΣΟ 2026" sub=${'Με όπλο ' + armedN + ' από ' + total + ' σε δύναμη, εκτός οπλοβαστού ' + (date === today ? 'τώρα' : dow(date) + ' ' + dm(date)) + ' ' + outN + '. Πάτα ΕΚΤΟΣ ή ΕΝΤΟΣ στη γραμμή.'}>
      <${DateBar} value=${date} onChange=${(d: string) => nav.set({ wdate: d === today ? null : d })} days=${[today, tomorrow]}/>
      <${Button} variant="outline" disabled=${xl} onClick=${() => exportXl(false)} data-tip="Κατάσταση οπλισμού με στήλη υπογραφής, και ένα φύλλο για κάθε φίλτρο (χωρίς όπλο, άοπλοι με όπλο, ίδιος αριθμός, να παραδώσουν)">${xl ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>
      <${Button} variant="outline" disabled=${xl} onClick=${() => exportXl(true)} data-tip="Κατάσταση οπλισμού με την κεφαλίδα της ${HK()} και στήλη υπογραφής" data-tip-side="left">${Icon.print}Εκτύπωση<//>
      <${SigsMenu} form="weapons" date=${date} label="ο Οπλισμός" disabled=${xl} go=${exportXl}/><//>
    <div style=${{ marginBottom: '12px' }}><${Tabs} value=${tab} onChange=${(v: string) => nav.set({ wtab: v })} items=${[{ value: 'weapons', label: 'Όπλα (' + armedN + ')' }, { value: 'moves', label: 'Κινήσεις' + (outN ? ' · εκτός ' + outN : '') }]}/></div>
    ${tab === 'moves' ? html`<${MovesView} date=${date} info=${info} pm=${pm} outN=${outN}/>` : html`<${Fragment}>
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση" placeholder="Όνομα, ΑΣΜ, θάλαμος ή αριθμός όπλου (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${Segmented} small=${true} value=${unit} onChange=${(u: string) => nav.set({ unit: u, room: room != null && u !== 'all' && unitOf({ room }, state.settings) !== u ? null : room })} items=${UNITS}/>
      <${Select} className="ui-select" aria-label="Θάλαμος" value=${room == null ? '' : String(room)} onChange=${(e: any) => { const r = e.target.value ? +e.target.value : null; nav.set({ room: r, unit: r != null && unit !== 'all' && unitOf({ room: r }, state.settings) !== unit ? 'all' : unit }); }}>
        <option value="">Όλοι οι θάλαμοι</option>${rooms.map(([r, n]) => html`<option key=${r} value=${String(r)}>Θάλαμος ${r} · ${n}</option>`)}<//>
      ${noType.length > 0 && html`<${Select} className="ui-select" aria-label="Τύπος σε όσους δεν έχουν" value="" onChange=${(e: any) => typeAll(e.target.value)} data-tip="Βάζει τον τύπο σε όσους φαίνονται και έχουν αριθμό όπλου αλλά όχι τύπο. Νέοι τύποι στις Ρυθμίσεις › Λίστες.">
        <option value="">Τύπος σε ${noType.length} χωρίς τύπο…</option>${types.map((t: string) => html`<option key=${t} value=${t}>${t}</option>`)}<//>`}</div>
    <div className="wpick"><input type="text" className="ui-input wpick__scan" aria-label="Επιλογή με θέση, αριθμό όπλου ή ΑΣΜ" placeholder="Γράψε θέση (Ε 23), αριθμό όπλου ή ΑΣΜ και Enter" value=${scan} spellCheck="false" autoComplete="off"
        onChange=${(e: any) => setScan(e.target.value)} onKeyDown=${(e: any) => { if (e.key === 'Enter') { e.preventDefault(); doScan(); } else if (e.key === 'Escape' && scan) { e.stopPropagation(); setScan(''); } }}
        data-tip="Τσεκάρει τον άνθρωπο από όλη τη δύναμη (όχι μόνο όσους φαίνονται). Πολλά Enter στη σειρά για πολλούς."/>
      <${PickMenu} label="Ξανά οι ίδιοι" tip="Οι τελευταίες ομαδικές έξοδοι: τσεκάρει όσους είναι ακόμα σε δύναμη με όπλο και μέσα στον οπλοβαστό" empty="Δεν έχει γίνει ακόμα ομαδική έξοδος."
        items=${redo.map(g => ({ key: g.reason + g.day + g.time, text: g.reason + ' ' + dm(g.day) + ' ' + g.time, sub: g.pids.length + ' άτομα', pick: () => tick(byIds(g.pids), g.reason + ' ' + dm(g.day) + ' ' + g.time) }))}/>
      <${PickMenu} label="Από υπηρεσία" tip=${'Οι υπηρεσίες ' + (date === today ? 'σήμερα' : dow(date) + ' ' + dm(date)) + ': τσεκάρει τους ανθρώπους τους'} empty=${'Δεν υπάρχουν υπηρεσίες ' + (date === today ? 'σήμερα' : dm(date)) + '.'}
        items=${duties.map(d => ({ key: d.block, text: d.name, sub: d.pids.length + (d.armed ? ' · ένοπλη' : ''), pick: () => tick(byIds(d.pids), d.name) }))}/>
      ${pickMsg && html`<span className=${cx('wpick__msg', 'wpick__msg--' + pickMsg.tone)} role="status">${pickMsg.text}</span>`}</div>
    ${reasons.length > 0 && html`<div className="wreasons" role="group" aria-label="Εκτός οπλοβαστού ανά λόγο"><b>Εκτός ${date === today ? 'τώρα' : dm(date)}:</b>
      ${reasons.map(([r, n]) => html`<button key=${r} type="button" className=${cx('ui-chip ui-chip--sm', r === AUTO_KEY && 'ui-chip--auto')} aria-pressed=${reasonF === r} data-tip=${r === AUTO_KEY ? 'Ένοπλη υπηρεσία: το όπλο βγαίνει και μπαίνει αυτόματα στις ώρες του νούμερου. Κλικ: δείξε τους' : 'Κλικ: δείξε μόνο όσους βγήκαν για ' + r}
        onClick=${() => nav.set({ wreason: reasonF === r ? null : r })}>${reasonLbl(r)}<span className="cnt">${n}</span></button>`)}</div>`}
    <div className="filters"><${Strip} role="group" aria-label="Φίλτρα οπλισμού">${WEAPON_FILTERS.map(([k, l, , tip]) => html`<button key=${k} type="button" className=${cx('ui-chip', (k === 'unarmed' || k === 'dup' || k === 'return') && (counts[k] || 0) > 0 && 'ui-chip--warn')} aria-pressed=${filter === k} data-tip=${tip} onClick=${() => nav.set({ wfilter: filter === k && k !== 'all' ? 'all' : k })}>${l}<span className="cnt">${counts[k] || 0}</span></button>`)}<//>
      <${ActiveFilter} parts=${[onlyS && 'Επιλεγμένοι', unit !== 'all' && unit, room != null && 'Θάλαμος ' + room, filter !== 'all' && fLabel, reasonF && 'Λόγος ' + reasonLbl(reasonF), dq.trim() && '«' + dq.trim() + '»']} onClear=${clear}/>
      <span className="toolbar__count">${rows.length} ${rows.length === 1 ? 'άτομο' : 'άτομα'}</span></div>
    ${sel.size > 0 && html`<div className="bulkbar"><div className="bulkbar__sel">${sel.size} επιλεγμένοι${hidN > 0 && html`<${Fragment}> <span className="bulkbar__hid">(${hidN} δεν φαίνονται)</span> · <${Button} size="sm" variant="link" onClick=${() => setOnlySel(true)} data-tip="Δείχνει μόνο όσους τσέκαρες, όποια φίλτρα κι αν υπάρχουν">Δείξε τους<//><//>`}${onlyS && html`<${Fragment}> · <${Button} size="sm" variant="link" onClick=${() => setOnlySel(false)}>Πίσω στη λίστα<//><//>`}</div>
      ${selIn.length > 0 ? html`<div className="bulkbar__reasons"><small>ΕΚΤΟΣ ${selIn.length}${selIn.length < sel.size ? ' από ' + sel.size : ''} για:</small>${outReasons.map(r => html`<${Button} key=${r} size="sm" onClick=${(e: any) => { if (e.shiftKey) { setOutReason(r); setOutFor(selIn.map(p => p.id)); } else return outNow(r); }} data-tip=${'Έξοδος για ' + r + ' τώρα, με «Αναίρεση» (Shift+κλικ: διάλεξε ώρα)'}>${r}<//>`)}<${Button} size="sm" variant="outline" onClick=${() => { setOutReason(lastReason); setOutFor(selIn.map(p => p.id)); }} data-tip="Άλλη ώρα ή μέρα, παρατήρηση, ή άλλος λόγος">Ώρα…<//></div>` : selOut.length === 0 && html`<small>Κανένας δεν μπορεί να βγει${skipTxt(sp) ? ': ' + skipTxt(sp) : ''}</small>`}
      ${selOut.length > 0 && html`<${Button} size="sm" variant="outline" onClick=${() => setInFor(selOut.map(m => m.id))}>ΕΝΤΟΣ ${selOut.length} ${selOut.length === 1 ? 'όπλο' : 'όπλα'}…<//>`}
      <${Button} size="sm" variant="ghost" onClick=${() => setSel(new Set())}>Καθάρισε<//></div>`}
    ${rows.length === 0 ? html`<div className="ui-card empty">${dq.trim() || unit !== 'all' || room != null ? html`Κανείς δεν ταιριάζει. <${Button} variant="link" onClick=${clear}>Καθάρισε αναζήτηση και φίλτρα<//>` : empty}</div>` :
    html`<div className="ptable ptable--weapons" role="table" aria-rowcount=${rows.length}><div style=${{ overflowX: 'auto' }}><div style=${{ minWidth: GRID_MIN + 'px' }}>
      <div className="ptable__head" role="row" style=${{ gridTemplateColumns: GRID }}><span><input type="checkbox" className="ui-check" aria-label="Επιλογή όλων" data-tip="Όλοι όσοι φαίνονται ΚΑΙ μπορούν να βγουν: έχουν αριθμό και δεν είναι ήδη εκτός (π.χ. ένας ουλαμός για ΕΚΠ). Αν δεν υπάρχει κανείς, όσοι είναι εκτός, για ΕΝΤΟΣ. Shift-κλικ σε δύο γραμμές τσεκάρει ό,τι είναι ανάμεσα." checked=${allSel} onChange=${() => setSel(s => { const n = new Set(s); tickable.forEach(p => (allSel ? n.delete(p.id) : n.add(p.id))); return n; })}/></span><span>Α/Α</span><span>Βαθμός</span>${H('last', 'Επίθετο')}<span>Όνομα</span><span>ΑΣΜ</span>${H('room', 'Θάλ.')}<span>Σ.Ι.</span><span data-tip="Από τη λίστα «Τύποι όπλων» (Ρυθμίσεις › Λίστες)">Τύπος</span>${H('weapon', 'Αριθμός όπλου')}<span data-tip="ΕΝΤΟΣ ή ΕΚΤΟΣ οπλοβαστού τώρα, και γιατί. Πάτα ΕΚΤΟΣ ή ΕΝΤΟΣ στη γραμμή· η ώρα μπαίνει μόνη της και αλλάζει. Ένοπλη υπηρεσία: εκτός αυτόματα.">Κατάσταση όπλου${date !== today ? ' · υπηρεσίες ' + dm(date) : ''}</span>${H('rack', 'Οπλοβ.')}<span data-tip="Η θέση του όπλου, ό,τι θέλεις να γράψεις (γράφεται με κεφαλαία και στο Excel)">Θέση</span><span>Παρατήρηση</span></div>
      <${VirtualList} className="weapons__body" items=${rows} rowHeight=${ROW_H} height=${height} resetKey=${filter + '|' + dq + '|' + unit + '|' + room + '|' + JSON.stringify(sort)} renderRow=${(p: Person, i: number, style: P) => html`<${WRow} key=${p.id} p=${p} i=${i} style=${style} selected=${sel.has(p.id)} info=${info} pm=${pm} types=${types} lists=${lists} reset=${reset} onToggle=${toggle} onOpen=${openP} save=${save} commit=${commit} paste=${paste}/>`}/>
    </div></div></div>`}<//>`}
    ${outFor && html`<${WeaponOutDialog} pids=${outFor} reason=${outReason} onClose=${() => setOutFor(null)} onDone=${(r: string) => { if (r) setLastReason(r); setSel(new Set()); setOnlySel(false); }}/>`}
    ${inFor && html`<${WeaponInDialog} ids=${inFor} onClose=${() => setInFor(null)} onDone=${() => setSel(new Set())}/>`}
    ${ask && html`<${Dialog} title=${'Το όπλο ' + ask.w + ' είναι ήδη χρεωμένο'} onClose=${() => { setAsk(null); setReset(n => n + 1); }}
      description=${html`<span>Ο αριθμός <b>${ask.w}</b> είναι στον ${ask.others.map(x => html`<b key=${x.id}>${rankTxt(x)} ${plainName(x)}</b>${x.active ? '' : ' (εκτός δύναμης)'}`).reduce((a: any[], x: any, j: number) => (j ? [...a, ', ', x] : [x]), [])}. Να μεταφερθεί στον ${ask.p.rank} ${plainName(ask.p)};</span>`}
      footer=${html`<${Button} variant="outline" onClick=${() => { setAsk(null); setReset(n => n + 1); }}>Άκυρο<//>
        <${Button} variant="outline" onClick=${async () => { const a = ask; setAsk(null); await save([{ pid: a.p.id, weapon: a.w }], { warn: 'ο ίδιος αριθμός μένει και σε ' + a.others.map(shortName).join(', ') + '.' }); }}>Κράτα και στους δύο<//>
        <${Button} data-autofocus="" onClick=${async () => { const a = ask; setAsk(null); await save([...a.others.map(x => ({ pid: x.id, weapon: '' })), { pid: a.p.id, weapon: a.w }], { what: 'μεταφορά όπλου ' + a.w, msg: 'Το όπλο ' + a.w + ' πήγε στον ' + shortName(a.p) + ' (σβήστηκε από ' + a.others.map(shortName).join(', ') + ')', warn: info.unarmed.has(a.p.id) ? 'είναι άοπλος κατά τη Σ.Ι. (' + siOf(a.p, lists).text + ').' : undefined }); }}>Μεταφορά<//>`}>
      <p className="muted" style=${{ margin: 0 }}>Με τη μεταφορά σβήνεται από ${ask.others.length === 1 ? 'τον άλλον' : 'τους άλλους'}. Αναιρείται με Ctrl+Z.</p><//>`}
  </div>`;
}
