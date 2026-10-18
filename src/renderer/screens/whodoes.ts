// features/guard › «Ποιος κάνει τι» (Michael, 18/10): μία γραμμή ανά στρατιώτη, μία στήλη ανά υπηρεσία και οι μέρες της
// εβδομάδας. Ό,τι ήταν στην καρτέλα του οπλίτη («Τι κάνει»), για όλους μαζί. Οι στήλες βγαίνουν από τις υπηρεσίες των δύο
// εντύπων (capCols): νέα υπηρεσία εμφανίζεται μόνη της. Ίδια δεδομένα με το αρχείο «Δυνατότητα υπηρεσιών».
// Σ.Ι. και πόστο φαίνονται ως «—» (ισχύουν μόνα τους)· η κατάσταση της μέρας (ΕΥ, άδεια…) γράφεται κάτω από το όνομα.
// Τίποτα δεν απαγορεύεται: με το χέρι μπαίνει πάντα με επιβεβαίωση, και οι μόνιμοι Λ/Υ-Δ/Υ μπαίνουν πάντα.
import { useDeferredValue, useMemo, useState } from 'react';
import { html, cx, Button, Dialog, Segmented, Strip, useToast } from '../ui';
import { useNav, useStore } from '../store';
import { ActiveFilter } from '../common';
import { PHASE_NAME, WEEK, blocksOf, platoonsOf, platoonShort, shortName, unitOf, type Person } from '../../shared/domain';
import { capCell, capCols, statusesOn, type CapCell, type CapCol } from '../../shared/rules';
import { statIsUnarmed, statNoDuty } from '../../shared/stat';
import { statusLbl } from '../../shared/ranks';
import { siOf } from '../../shared/si';
import { byRoomName } from '../../shared/rosterLists';
import { dayName, dm, DOW, DOW_FULL, type ISODate } from '../../shared/dates';
import { normGreek, translit, norm } from '../../shared/text';
type P = any;

const SERGEANT = 'Από τον λοχία';
type Filt = 'all' | 'limited' | 'manual' | 'auto';
const FILTERS: [Filt, string, string][] = [
  ['all', 'Όλοι', 'Όλοι σε δύναμη'],
  ['limited', 'Με περιορισμό', 'Δεν κάνουν κάποια υπηρεσία ή κάποια μέρα, από οπουδήποτε'],
  ['manual', 'Από τον λοχία', 'Όσα όρισες εσύ (✕ και μέρες), όχι Σ.Ι. ή πόστο'],
  ['auto', 'Από Σ.Ι. ή πόστο', 'Όσοι δεν κάνουν κάτι λόγω Σ.Ι. ή πόστου (—), ή το κάνουν παρ’ όλα αυτά (✓!)']
];
// Δευτέρα πρώτη, με δύο γράμματα (Δε, Τρ, Τε…)
const DAY2 = (d: number) => DOW[d].slice(0, 2);
const colTip = (c: CapCol) => c.label + ' · ' + (c.phases.length === 2 ? 'ΣΒΕΝ και ΣΠΕΝ' : 'μόνο ' + PHASE_NAME[c.phases[0]]) + (c.armed ? ' · ένοπλη' : '') + (c.block ? ' · δική σου υπηρεσία' : '');
const untilTxt = (s: { open?: boolean; to: string }, date: ISODate) => (s.open ? ' χωρίς λήξη' : s.to === date ? '' : ' έως ' + dm(s.to));

// Κελί: ✓ κάνει · ✕ όχι (λοχίας) · — όχι από Σ.Ι./πόστο · ✓! κάνει παρά τη Σ.Ι./το πόστο
function cellView(c: CapCell, col: CapCol): { sym: string; cls: string; tip: string } {
  const what = col.label.toLowerCase();
  if (c.src === 'force') return { sym: '✓!', cls: 'is-force', tip: 'Κάνει ' + what + ' παρά το «' + c.why + '». Πάτα: πίσω σε ό,τι λέει η Σ.Ι./το πόστο' };
  if (c.on) return { sym: '✓', cls: 'is-on', tip: 'Κάνει ' + what + '. Πάτα: δεν κάνει' };
  if (c.src === 'auto') return { sym: '—', cls: 'is-auto', tip: 'Δεν κάνει ' + what + ' (' + c.why + '). Πάτα για να κάνει παρ’ όλα αυτά' };
  return { sym: '✕', cls: 'is-off', tip: 'Δεν κάνει ' + what + (c.why !== SERGEANT ? ' (' + c.why + ')' : '') + (c.src === 'kind' ? ' · ορίστηκε για όλες τις «Άλλες»' : '') + '. Πάτα: κάνει' };
}

function Row({ p, own, cols, cells, odd, grid, hint, lists, onCell, onDay, onReset, onOpen }: P) {
  const days: number[] = p.offDays || [];
  return html`<div className=${cx('ptable__row', 'whod__row', odd && 'is-odd')} role="row" style=${{ gridTemplateColumns: grid }}>
    <span className="whod__name"><button type="button" className="linkish" onClick=${() => onOpen(p.id)} data-tip="Καρτέλα οπλίτη"><b>${p.last}</b> ${p.first}</button>
      <small>${[p.room != null && 'Θ' + p.room, p.si && 'Σ.Ι. ' + siOf(p, lists).text, p.post && 'πόστο ' + p.post].filter(Boolean).join(' · ')}${hint && html`<span className=${cx('whod__hint', hint.bad && 'is-bad')} data-tip=${hint.tip}>${hint.txt}</span>`}</small></span>
    ${cols.map((col: CapCol, i: number) => { const v = cellView(cells[i], col); return html`<span key=${col.key} className="whod__c"><button type="button" className=${cx('whod__cell', v.cls)} aria-label=${shortName(p) + ', ' + col.label + ': ' + v.tip.split('.')[0]} data-tip=${v.tip} onClick=${() => onCell(p, col, cells[i])}>${v.sym}</button></span>`; })}
    <span className="whod__days" role="group" aria-label=${'Μέρες υπηρεσίας ' + shortName(p)}>${WEEK.map(d => { const off = days.includes(d); return html`<button key=${d} type="button" className=${cx('whod__day', off && 'is-off', (d === 6 || d === 0) && 'is-we')} aria-pressed=${!off} data-tip=${off ? 'Δεν κάνει υπηρεσία ' + DOW_FULL[d] + '. Πάτα: κάνει' : 'Κάνει υπηρεσία ' + DOW_FULL[d] + '. Πάτα: όχι ' + DOW_FULL[d]} onClick=${() => onDay(p, d)}>${DAY2(d)}</button>`; })}</span>
    <span className="whod__reset">${own && html`<button type="button" className="whod__x" aria-label=${'Καμία εξαίρεση για ' + shortName(p)} data-tip="Σβήνει ό,τι όρισες με το χέρι (✕, ✓! και μέρες)· μένουν μόνο Σ.Ι. και πόστο" data-tip-side="left" onClick=${() => onReset(p)}>↺</button>`}</span>
  </div>`;
}

export function WhoDoes({ date, pid }: { date: ISODate; pid?: number | null }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  // ήρθες από ένα όνομα (Θέσεις › Δεν μπαίνουν): μόνο αυτός, μέχρι να ψάξεις ή να καθαρίσεις το φίλτρο
  const [only, setOnly] = useState<number | null>(pid ?? null);
  const [filter, setFilter] = useState<Filt>('all'); const [colF, setColF] = useState<string | null>(null);
  const [unit, setUnit] = useState('all'); const [room, setRoom] = useState<number | null>(null);
  const [ask, setAsk] = useState<{ p: Person; col: CapCol; why: string } | null>(null);
  const lists = state.settings.lists;
  const cols = capCols(state.settings);
  const grid = 'minmax(190px,1.6fr) repeat(' + cols.length + ',minmax(72px,84px)) 212px 34px';
  const people = useMemo(() => state.people.filter(p => p.active).sort(byRoomName), [state.people]);
  // όλα τα κελιά μία φορά ανά αλλαγή (όχι σε κάθε πλήκτρο της αναζήτησης)
  const cells = useMemo(() => new Map(people.map(p => [p.id, cols.map(c => capCell(state, p, c))])), [people, cols, state.caps, state.settings]);
  const ownOf = (p: Person) => Object.keys(state.caps[p.id] || {}).length > 0 || !!p.offDays?.length;
  const kindOf = (p: Person) => {
    const cs = cells.get(p.id)!;
    return { limited: cs.some(c => !c.on) || !!p.offDays?.length, manual: ownOf(p), auto: cs.some(c => c.src === 'auto' && !c.on || c.src === 'force') };
  };
  // η κατάσταση της μέρας που βλέπεις στις Υπηρεσίες: μόνο για πληροφορία, δεν αλλάζει τίποτα εδώ
  const bl = useMemo(() => (blocksOf(state.settings) || state.settings.blocks).filter(b => !b.hidden), [state.settings]);
  const hintOf = (p: Person) => {
    const ss = statusesOn(state.statuses, p.id, date); const when = dayName(date, today);
    const a = ss.find(x => statNoDuty(x, bl, lists)); if (a) return { txt: when + ': ' + statusLbl(a, lists) + untilTxt(a, date), tip: 'Δεν μπαίνει σε καμία υπηρεσία λόγω κατάστασης· ξαναμπαίνει μόνος του όταν λήξει', bad: true };
    const b = ss.find(x => statIsUnarmed(x, bl.filter(y => y.kind !== 'ly'), lists)); if (b) return { txt: when + ': μόνο άοπλες (' + statusLbl(b, lists) + untilTxt(b, date) + ')', tip: 'Λόγω κατάστασης, μέχρι να λήξει', bad: false };
    return null;
  };
  const place = (p: Person) => (unit === 'all' || unitOf(p, state.settings) === unit) && (room == null || p.room === room);
  const text = (p: Person) => { const n = normGreek(dq.trim()); if (!n) return true; const key = normGreek([p.last, p.first, p.father, p.asm, p.room != null ? 'Θ' + p.room : '', p.si, p.post].filter(Boolean).join(' ')); return n.split(/\s+/).every(t => key.includes(t)) || translit(p.last + ' ' + p.first).includes(norm(dq.trim())); };
  const ci = colF ? cols.findIndex(c => c.key === colF) : -1;
  const base = useMemo(() => people.filter(p => (only == null || p.id === only) && place(p) && text(p)), [people, unit, room, dq, only, state.settings.rooms]);
  const counts = useMemo(() => { const n: Record<string, number> = { all: base.length, limited: 0, manual: 0, auto: 0 }; base.forEach(p => { const k = kindOf(p); if (k.limited) n.limited++; if (k.manual) n.manual++; if (k.auto) n.auto++; }); return n; }, [base, cells]);
  const colN = useMemo(() => cols.map((_, i) => base.filter(p => !cells.get(p.id)![i].on).length), [base, cells, cols]);
  const rows = base.filter(p => (filter === 'all' || kindOf(p)[filter]) && (ci < 0 || !cells.get(p.id)![ci].on));
  const UNITS = useMemo(() => [{ value: 'all', label: 'Όλη η Ίλη' }, ...platoonsOf(state.settings).map(u => ({ value: platoonShort(u.name), label: platoonShort(u.name), tip: u.rooms.length ? 'Θάλαμοι ' + u.rooms.join(', ') : 'Χωρίς θαλάμους' }))], [state.settings.rooms]);
  const rooms = useMemo(() => { const m = new Map<number, number>(); people.forEach(p => { if (p.room != null) m.set(p.room, (m.get(p.room) || 0) + 1); }); return [...m].sort((a, b) => a[0] - b[0]); }, [people]);

  const done = (r: unknown, txt: string) => { if (r) toast({ text: txt + '. Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση.', actions: [undoMark()] }); };
  const setCap = async (p: Person, col: CapCol, v: 'on' | 'off' | 'clear', txt: string) => done(await run({ t: 'setCap', pid: p.id, key: col.key, v }, false), shortName(p) + ': ' + txt);
  const onCell = (p: Person, col: CapCol, c: CapCell) => {
    const what = col.label.toLowerCase();
    if (c.src === 'force') return setCap(p, col, 'clear', 'ξανά όπως λέει ' + (c.why.startsWith('Πόστο') ? 'το πόστο' : 'η Σ.Ι.') + ', όχι ' + what);
    if (c.on) return setCap(p, col, 'off', 'δεν κάνει ' + what);
    if (c.src === 'auto') { setAsk({ p, col, why: c.why }); return; }
    // ✕ του λοχία: σβήνεται· αν από κάτω η Σ.Ι./το πόστο λένε «όχι», μένει «—»
    if (c.src === 'kind') return setCap(p, col, 'on', 'κάνει ' + what);
    return setCap(p, col, 'clear', 'κάνει ξανά ' + what);
  };
  const onDay = async (p: Person, d: number) => {
    const cur = p.offDays || []; const on = cur.includes(d);
    done(await run({ t: 'setOffDays', pid: p.id, days: on ? cur.filter(x => x !== d) : [...cur, d] }, false), shortName(p) + (on ? ': κάνει ξανά υπηρεσία ' : ': όχι υπηρεσία ') + DOW_FULL[d]);
  };
  const onReset = async (p: Person) => done(await run({ t: 'setDutyProfile', pid: p.id, reset: true, text: 'χωρίς εξαιρέσεις από τον λοχία' }, false), shortName(p) + ': χωρίς εξαιρέσεις από τον λοχία');
  const clear = () => { setQ(''); setOnly(null); setFilter('all'); setColF(null); setUnit('all'); setRoom(null); };
  const onlyP = only != null ? people.find(p => p.id === only) : undefined;
  const colLbl = ci >= 0 ? 'όχι ' + cols[ci].label.toLowerCase() : null;

  return html`<div className="whod">
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση στρατιώτη" placeholder="Όνομα, ΑΣΜ, θάλαμος, Σ.Ι., πόστο (χωρίς τόνους)" value=${q} onChange=${(e: any) => { setQ(e.target.value); setOnly(null); }}/>
      <${Segmented} small=${true} value=${unit} onChange=${(u: string) => { setUnit(u); if (room != null && u !== 'all' && unitOf({ room }, state.settings) !== u) setRoom(null); }} items=${UNITS}/>
      <select className="ui-select" aria-label="Θάλαμος" value=${room == null ? '' : String(room)} onChange=${(e: any) => { const r = e.target.value ? +e.target.value : null; setRoom(r); if (r != null && unit !== 'all' && unitOf({ room: r }, state.settings) !== unit) setUnit('all'); }}>
        <option value="">Όλοι οι θάλαμοι</option>${rooms.map(([r, n]) => html`<option key=${r} value=${String(r)}>Θάλαμος ${r} · ${n}</option>`)}</select></div>
    <div className="filters"><${Strip} role="group" aria-label="Φίλτρα">${FILTERS.map(([k, l, tip]) => html`<button key=${k} type="button" className="ui-chip" aria-pressed=${filter === k} data-tip=${tip} onClick=${() => setFilter(filter === k ? 'all' : k)}>${l}<span className="cnt">${counts[k]}</span></button>`)}<//>
      <${ActiveFilter} parts=${[onlyP && shortName(onlyP), unit !== 'all' && unit, room != null && 'Θάλαμος ' + room, filter !== 'all' && FILTERS.find(f => f[0] === filter)![1], colLbl, dq.trim() && '«' + dq.trim() + '»']} onClear=${clear}/>
      <span className="toolbar__count">${rows.length} ${rows.length === 1 ? 'άτομο' : 'άτομα'}</span></div>
    ${!cols.length ? html`<div className="ui-card empty">Δεν υπάρχουν υπηρεσίες στα έντυπα (εκτός από Λ/Υ και Δ/Υ).</div>` : rows.length === 0 ? html`<div className="ui-card empty">${people.length ? html`Κανείς δεν ταιριάζει. <${Button} variant="link" onClick=${clear}>Καθάρισε αναζήτηση και φίλτρα<//>` : 'Δεν υπάρχει κανείς σε δύναμη.'}</div>` :
    html`<div className="ptable ptable--whod" role="table" aria-rowcount=${rows.length}><div style=${{ overflowX: 'auto' }}><div style=${{ minWidth: (190 + cols.length * 72 + 246) + 'px' }}>
      <div className="ptable__head whod__head" role="row" style=${{ gridTemplateColumns: grid }}><span>Στρατιώτης</span>
        ${cols.map((c, i) => html`<button key=${c.key} type="button" className="whod__colhd" aria-pressed=${colF === c.key} data-tip=${colTip(c) + '. Πάτα: μόνο όσοι δεν κάνουν ' + c.label.toLowerCase()} onClick=${() => setColF(colF === c.key ? null : c.key)}><span className="whod__lbl">${c.short}</span><small className=${cx(colN[i] > 0 && 'has-n')}>${colN[i] ? 'όχι ' + colN[i] : 'όλοι'}</small></button>`)}
        <span className="whod__dayhd" data-tip="Μέρες που κάνει υπηρεσία (καμία υπηρεσία τις άλλες). Μετρά η μέρα που ξεκινά η υπηρεσία, 14:00."><span>Μέρες υπηρεσίας</span><small>${WEEK.map(d => html`<i key=${d}>${DAY2(d)}</i>`)}</small></span><span></span></div>
      <div className="whod__body">${rows.map((p, i) => html`<${Row} key=${p.id} p=${p} own=${ownOf(p)} cols=${cols} cells=${cells.get(p.id)} odd=${i % 2 === 1} grid=${grid} hint=${hintOf(p)} lists=${lists} onCell=${onCell} onDay=${onDay} onReset=${onReset} onOpen=${nav.openPerson}/>`)}</div>
    </div></div></div>`}
    <p className="note whod__legend"><b>✓</b> κάνει · <b className="whod__lg is-off">✕</b> δεν κάνει (το όρισες εσύ) · <b className="whod__lg is-auto">—</b> δεν κάνει λόγω Σ.Ι. ή πόστου (Ρυθμίσεις › Σ.Ι.) · <b className="whod__lg is-force">✓!</b> κάνει παρά τη Σ.Ι./το πόστο · μέρα με γραμμή: καμία υπηρεσία εκείνη τη μέρα.
      Ισχύει στην επιλογή ατόμου και στην αυτόματη συμπλήρωση· με το χέρι μπαίνει πάντα, με επιβεβαίωση. Οι μόνιμοι Λ/Υ και Δ/Υ μπαίνουν πάντα στην κενή θέση, με προειδοποίηση. Κάθε νέα υπηρεσία («+ Νέα υπηρεσία») γίνεται μόνη της στήλη εδώ.</p>
    ${ask && html`<${Dialog} title=${'Να κάνει ' + ask.col.label.toLowerCase() + ' ο ' + shortName(ask.p) + ';'} description=${'Κανονικά δεν μπαίνει: ' + ask.why + '.'} onClose=${() => setAsk(null)}
      footer=${html`<${Button} variant="outline" onClick=${() => setAsk(null)}>Άκυρο<//><${Button} data-autofocus="" onClick=${() => { const a = ask; setAsk(null); setCap(a.p, a.col, 'on', 'κάνει ' + a.col.label.toLowerCase() + ' παρά το «' + a.why + '»'); }}>Να κάνει παρ’ όλα αυτά<//>`}>
      <p className="muted" style=${{ margin: 0 }}>Ισχύει μόνο για αυτόν και μόνο για ${ask.col.label.toLowerCase()}. Φαίνεται με <b>✓!</b> και αναιρείται με ένα κλικ ή Ctrl+Z.</p><//>`}
  </div>`;
}
