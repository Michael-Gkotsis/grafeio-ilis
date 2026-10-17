// features/weapons: Οπλισμός (Michael, 17/10: ο αριθμός όπλου βγήκε από την καρτέλα του οπλίτη σε δική του καρτέλα).
// Όλοι σε δύναμη με τον αριθμό όπλου τους, γραμμένο κατευθείαν στη γραμμή: Enter/↓ πάει στον επόμενο, επικόλληση στήλης
// από Excel γεμίζει τις επόμενες γραμμές με τη σειρά. Ίδιος αριθμός σε άλλον: ρωτά (μεταφορά ή και στους δύο), δεν μπλοκάρει.
import { useCallback, useDeferredValue, useMemo, useState, useEffect, memo } from 'react';
import { html, cx, Badge, Button, Dialog, Icon, PageHeader, Segmented, Strip, useToast } from '../ui';
import { useNav, useStore } from '../store';
import { ActiveFilter } from '../common';
import { fullName, plainName, platoonsOf, platoonShort, shortName, unitOf, type Person } from '../../shared/domain';
import { siOf } from '../../shared/si';
import { byRoomName } from '../../shared/rosterLists';
import { WEAPON_FILTERS, normWeapon, sameWeapon, weaponInfo, weaponKey, weaponMatch, type WeaponFilter, type WeaponInfo } from '../../shared/weapons';
import { collator, normGreek, translit, norm } from '../../shared/text';
import { dm } from '../../shared/dates';
type P = any;

const GRID = '44px 92px minmax(150px,1.4fr) minmax(100px,1fr) minmax(100px,1fr) 100px 96px minmax(110px,.9fr) 170px minmax(160px,1.3fr)';
const focusRow = (i: number) => { const el = document.querySelector('input[data-wrow="' + i + '"]') as HTMLInputElement | null; if (el) { el.focus(); el.select(); el.scrollIntoView({ block: 'nearest' }); } return !!el; };

// Ο αριθμός στη γραμμή: γράφεται όταν φύγεις από το κουτί (Enter, ↑/↓, Tab ή κλικ αλλού)· Esc ξαναφέρνει τον παλιό
const WeaponInput = memo(function WeaponInput({ p, i, reset, onCommit, onPaste }: P) {
  const [v, setV] = useState(p.weapon || '');
  useEffect(() => setV(p.weapon || ''), [p.weapon, reset]);
  const move = (e: any, to: number) => { e.preventDefault(); if (!focusRow(to)) e.target.blur(); };
  return html`<input className="ui-input weapon-input" data-wrow=${i} value=${v} placeholder="—" aria-label=${'Αριθμός όπλου ' + fullName(p)} spellCheck="false" autoComplete="off"
    onChange=${(e: any) => setV(e.target.value)}
    onBlur=${() => { if (normWeapon(v) !== (p.weapon || '')) onCommit(p, v); }}
    onKeyDown=${(e: any) => {
      if (e.key === 'Enter' || e.key === 'ArrowDown') move(e, i + 1);
      else if (e.key === 'ArrowUp') move(e, i - 1);
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setV(p.weapon || ''); }
    }}
    onPaste=${(e: any) => {
      const t: string = e.clipboardData?.getData('text') || '';
      const lines = t.replace(/\r/g, '').split('\n'); while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      if (lines.length < 2) return;
      e.preventDefault(); onPaste(i, lines.map(l => l.split('\t')[0]));
    }}/>`;
});

function notes(p: Person, info: WeaponInfo, lists: P) {
  const out: any[] = [];
  if (!p.active) out.push(html`<${Badge} key="out" tone="warn" data-tip=${p.outOn ? 'Εκτός δύναμης από ' + dm(p.outOn) : 'Εκτός δύναμης'}>Εκτός δύναμης<//>`);
  const has = !!weaponKey(p.weapon);
  if (has && info.unarmed.has(p.id)) out.push(html`<${Badge} key="ua" tone="warn" data-tip=${'Άοπλος κατά τη Σ.Ι. (' + siOf(p, lists).text + ')'}>Άοπλος<//>`);
  const same = has ? sameWeapon(info, p) : [];
  if (same.length) out.push(html`<${Badge} key="dup" tone="bad" data-tip=${'Ο ίδιος αριθμός: ' + same.map(x => shortName(x) + (x.active ? '' : ' (εκτός δύναμης)')).join(', ')}>Ίδιος με ${shortName(same[0])}${same.length > 1 ? ' +' + (same.length - 1) : ''}<//>`);
  return out;
}

const matchText = (p: Person, q: string) => {
  const n = normGreek(q.trim()); if (!n) return true;
  const key = normGreek([p.last, p.first, p.father, p.asm, p.rank, p.spec, p.room != null ? 'Θ' + p.room : ''].join(' '));
  const wk = weaponKey(q);
  return n.split(/\s+/).every(t => key.includes(t)) || translit(p.last + ' ' + p.first).includes(norm(q.trim())) || (!!wk && weaponKey(p.weapon).includes(wk));
};

export function WeaponsScreen() {
  const { state, today, run, undoMark } = useStore(); const nav = useNav(); const toast = useToast();
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
  const info = useMemo(() => weaponInfo(state), [state.people, state.settings]);
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
    const cmp = sort.k === 'weapon' ? (a: Person, b: Person) => (weaponKey(a.weapon) ? 0 : 1) - (weaponKey(b.weapon) ? 0 : 1) || collator.compare(weaponKey(a.weapon), weaponKey(b.weapon)) * sort.dir || byRoomName(a, b)
      : sort.k === 'last' ? (a: Person, b: Person) => (collator.compare(a.last, b.last) || collator.compare(a.first, b.first)) * sort.dir
      : (a: Person, b: Person) => (byRoomName(a, b)) * sort.dir;
    // ίδιος αριθμός: ο ένας κάτω από τον άλλον
    return r.sort(filter === 'dup' ? (a, b) => collator.compare(weaponKey(a.weapon), weaponKey(b.weapon)) || byRoomName(a, b) : cmp);
  }, [state.people, info, filter, dq, unit, room, sort, state.settings.rooms]);
  const total = state.people.filter(p => p.active).length;
  const armedN = state.people.filter(p => p.active && weaponKey(p.weapon)).length;

  // msg: το μήνυμα (αλλιώς «Χ: όπλο 123»)· warn: προειδοποίηση από κάτω, με αναίρεση
  const save = useCallback(async (changes: { pid: number; weapon: string }[], o: { warn?: string; what?: string; msg?: string } = {}) => {
    if (await run({ t: 'setWeapons', changes, what: o.what }, false) === null) { setReset(n => n + 1); return; }
    const one = changes.length === 1 ? state.people.find(p => p.id === changes[0].pid) : null;
    const w = changes.length === 1 ? normWeapon(changes[0].weapon) : '';
    const msg = o.msg || (one ? shortName(one) + ': ' + (w ? 'όπλο ' + w : 'χωρίς όπλο') : 'Οπλισμός: ' + changes.length + ' άτομα');
    toast({ text: html`<span>${msg}${o.warn && html`<br/><b>Προσοχή:</b> ${o.warn}`}</span>`, actions: [undoMark()] });
  }, [run, toast, undoMark, state.people]);
  const commit = useCallback((p: Person, raw: string) => {
    const w = normWeapon(raw);
    const others = w ? sameWeapon(info, p, w) : [];
    if (others.length) { setAsk({ p, w, others }); return; }
    save([{ pid: p.id, weapon: w }], { warn: w && info.unarmed.has(p.id) ? 'είναι άοπλος κατά τη Σ.Ι. (' + siOf(p, lists).text + ').' : undefined });
  }, [info, save, lists]);
  // Επικόλληση στήλης από Excel: ένας αριθμός ανά γραμμή, από αυτή τη γραμμή και κάτω, με τη σειρά που φαίνεται
  const paste = useCallback((i: number, vals: string[]) => {
    const changes = vals.slice(0, rows.length - i).map((v, j) => ({ pid: rows[i + j].id, weapon: v }));
    const left = vals.length - changes.length;
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
      const r = await window.api.exportWeapons(today, print);
      if (!r.ok) toast({ text: html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
      else if (r.warnings.length) toast({ text: r.warnings.join(' · ') });
      else if (!print) toast({ text: 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': κατάσταση οπλισμού με στήλη υπογραφής, και ένα φύλλο για κάθε φίλτρο.' });
    } finally { setXl(false); }
  };
  const clear = () => { setQ(''); nav.set({ wfilter: 'all', unit: 'all', room: null }); };
  const fLabel = (WEAPON_FILTERS.find(([k]) => k === filter) || [, filter])[1];
  const H = (k: string, l: string) => html`<button key=${k} type="button" aria-sort=${sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'} onClick=${() => nav.set({ wsort: sort.k === k ? { k, dir: -sort.dir } : { k, dir: 1 } })}>${l}${sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</button>`;
  const empty = { all: 'Δεν υπάρχει κανείς σε δύναμη.', with: 'Κανείς δεν έχει ακόμα όπλο.', without: 'Όλοι οι ένοπλοι έχουν όπλο.', unarmed: 'Κανένας άοπλος δεν έχει όπλο.', dup: 'Κανένας αριθμός δεν είναι σε δύο.', return: 'Όλοι οι εκτός δύναμης παρέδωσαν το όπλο τους.' }[filter];

  return html`<div>
    <${PageHeader} title="Οπλισμός" sub=${'Με όπλο ' + armedN + ' από ' + total + ' σε δύναμη. Γράψε τον αριθμό στη γραμμή· Enter για τον επόμενο. Επικόλληση στήλης από Excel γεμίζει τις γραμμές από κάτω με τη σειρά.'}>
      <${Button} variant="outline" disabled=${xl} onClick=${() => exportXl(false)} data-tip="Κατάσταση οπλισμού με στήλη υπογραφής, και ένα φύλλο για κάθε φίλτρο (χωρίς όπλο, άοπλοι με όπλο, ίδιος αριθμός, να παραδώσουν)">${xl ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>
      <${Button} variant="outline" disabled=${xl} onClick=${() => exportXl(true)} data-tip="Κατάσταση οπλισμού με την κεφαλίδα της ΗΚΑΙ και στήλη υπογραφής" data-tip-side="left">${Icon.print}Εκτύπωση<//><//>
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση" placeholder="Όνομα, ΑΣΜ, θάλαμος ή αριθμός όπλου (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${Segmented} small=${true} value=${unit} onChange=${(u: string) => nav.set({ unit: u, room: room != null && u !== 'all' && unitOf({ room }, state.settings) !== u ? null : room })} items=${UNITS}/>
      <select className="ui-select" aria-label="Θάλαμος" value=${room == null ? '' : String(room)} onChange=${(e: any) => { const r = e.target.value ? +e.target.value : null; nav.set({ room: r, unit: r != null && unit !== 'all' && unitOf({ room: r }, state.settings) !== unit ? 'all' : unit }); }}>
        <option value="">Όλοι οι θάλαμοι</option>${rooms.map(([r, n]) => html`<option key=${r} value=${String(r)}>Θάλαμος ${r} · ${n}</option>`)}</select></div>
    <div className="filters"><${Strip} role="group" aria-label="Φίλτρα οπλισμού">${WEAPON_FILTERS.map(([k, l, , tip]) => html`<button key=${k} type="button" className=${cx('ui-chip', (k === 'unarmed' || k === 'dup' || k === 'return') && (counts[k] || 0) > 0 && 'ui-chip--warn')} aria-pressed=${filter === k} data-tip=${tip} onClick=${() => nav.set({ wfilter: filter === k && k !== 'all' ? 'all' : k })}>${l}<span className="cnt">${counts[k] || 0}</span></button>`)}<//>
      <${ActiveFilter} parts=${[unit !== 'all' && unit, room != null && 'Θάλαμος ' + room, filter !== 'all' && fLabel, dq.trim() && '«' + dq.trim() + '»']} onClear=${clear}/>
      <span className="toolbar__count">${rows.length} ${rows.length === 1 ? 'άτομο' : 'άτομα'}</span></div>
    ${rows.length === 0 ? html`<div className="ui-card empty">${dq.trim() || unit !== 'all' || room != null ? html`Κανείς δεν ταιριάζει. <${Button} variant="link" onClick=${clear}>Καθάρισε αναζήτηση και φίλτρα<//>` : empty}</div>` :
    html`<div className="ptable ptable--weapons" role="table" aria-rowcount=${rows.length}><div style=${{ overflowX: 'auto' }}><div style=${{ minWidth: '1100px' }}>
      <div className="ptable__head" role="row" style=${{ gridTemplateColumns: GRID }}><span>Α/Α</span><span>Βαθμός</span>${H('last', 'Επίθετο')}<span>Όνομα</span><span>Πατρώνυμο</span><span>ΑΣΜ</span>${H('room', 'Θάλαμος')}<span>Σ.Ι.</span>${H('weapon', 'Αριθμός όπλου')}<span>Παρατήρηση</span></div>
      <div className="weapons__body">${rows.map((p, i) => html`<div key=${p.id} className=${cx('ptable__row', i % 2 === 1 && 'is-odd')} style=${{ gridTemplateColumns: GRID, cursor: 'default' }} role="row">
        <span className="num muted">${i + 1}</span><span>${p.rank}</span>
        <span><button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)} data-tip="Καρτέλα οπλίτη"><b>${p.last}</b></button></span><span>${p.first}</span><span>${p.father}</span>
        <span className="num">${p.asm}</span><span>${p.room ?? ''}</span><span>${p.si ? siOf(p, lists).text : ''}</span>
        <span className="weapon-cell"><${WeaponInput} p=${p} i=${i} reset=${reset} onCommit=${commit} onPaste=${paste}/></span>
        <span className="badges weapon-notes">${notes(p, info, lists)}${!p.active && weaponKey(p.weapon) && html`<${Button} size="sm" variant="outline" onClick=${() => save([{ pid: p.id, weapon: '' }], { msg: shortName(p) + ': παρέδωσε το όπλο ' + p.weapon })} data-tip=${'Παρέδωσε το όπλο ' + p.weapon + ': σβήνεται ο αριθμός'}>Παρέδωσε<//>`}</span>
      </div>`)}</div>
    </div></div></div>`}
    ${ask && html`<${Dialog} title=${'Το όπλο ' + ask.w + ' είναι ήδη χρεωμένο'} onClose=${() => { setAsk(null); setReset(n => n + 1); }}
      description=${html`<span>Ο αριθμός <b>${ask.w}</b> είναι στον ${ask.others.map(x => html`<b key=${x.id}>${x.rank} ${plainName(x)}</b>${x.active ? '' : ' (εκτός δύναμης)'}`).reduce((a: any[], x: any, j: number) => (j ? [...a, ', ', x] : [x]), [])}. Να μεταφερθεί στον ${ask.p.rank} ${plainName(ask.p)};</span>`}
      footer=${html`<${Button} variant="outline" onClick=${() => { setAsk(null); setReset(n => n + 1); }}>Άκυρο<//>
        <${Button} variant="outline" onClick=${async () => { const a = ask; setAsk(null); await save([{ pid: a.p.id, weapon: a.w }], { warn: 'ο ίδιος αριθμός μένει και σε ' + a.others.map(shortName).join(', ') + '.' }); }}>Κράτα και στους δύο<//>
        <${Button} data-autofocus="" onClick=${async () => { const a = ask; setAsk(null); await save([...a.others.map(x => ({ pid: x.id, weapon: '' })), { pid: a.p.id, weapon: a.w }], { what: 'μεταφορά όπλου ' + a.w, msg: 'Το όπλο ' + a.w + ' πήγε στον ' + shortName(a.p) + ' (σβήστηκε από ' + a.others.map(shortName).join(', ') + ')', warn: info.unarmed.has(a.p.id) ? 'είναι άοπλος κατά τη Σ.Ι. (' + siOf(a.p, lists).text + ').' : undefined }); }}>Μεταφορά<//>`}>
      <p className="muted" style=${{ margin: 0 }}>Με τη μεταφορά σβήνεται από ${ask.others.length === 1 ? 'τον άλλον' : 'τους άλλους'}. Αναιρείται με Ctrl+Z.</p><//>`}
  </div>`;
}
