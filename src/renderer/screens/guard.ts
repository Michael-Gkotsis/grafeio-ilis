// features/guard (Κατάσταση υπηρεσιών, έλεγχος) και features/outs (εξοδούχοι, ΔΝ)
import { HK } from '../../shared/unit';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Alert, Badge, Button, Why, Card, Dialog, Icon, PageHeader, Segmented, Strip, Tabs, VirtualList, useMedia, useDirty, useToast, useViewportHeight } from '../ui';
import { Select } from '../select';
import { useNav, useOpenFrom, useStore, searchPeople } from '../store';
import { ActiveFilter, DateBar, ExcelSheet, ExportButton, GoLink, PersonPicker, PrintButton, SigsButton, TemplateNote, TimeField, RangeField, MonthField, HoursField, shiftBad, shiftOf, type HoursMode, useExport, useExportBusy } from '../common';
import { normTime } from '../../shared/hours';
import { frouraSheet, checkSheet } from '../sheets';
import { TYPES, KIND_LBL, KIND_NAME, PHASE_NAME, blocksOf, everyBlock, dutyStartOf, frouraFile, phaseBase, phaseList, phaseName, fullName, shortName, unitOf, roomTxt, postTxt, type DutyKind, type Person, type Phase, type Post, type TypeKey } from '../../shared/domain';
import { whyAll, fairKey, isEpop, monthTxt, lastResort, monthStats, dutyMonths, nextFor, swapCheck, capBlock, capCell, capCols, dutyBlock, dutyStats, emptyStat, guardUnavailable, holName, offDayBlock, isHol, outBlock, outRoomsOn, personMap, seatMap, seatPeople, postOf, postsOf, ruleBlock, statusesFrom, outMin, dutyMin, DEFAULT_OUT_TIME, DEFAULT_HK_TIME, statusWarn, strengthOf, activePeople } from '../../shared/rules';
import { addDays, dayName, daysBetween, dm, dmy, dow, parseD, pskDays, weekday, DOW_FULL, DOW_GEN, MONTHS } from '../../shared/dates';
import { collator, norm } from '../../shared/text';
import { useRowH } from '../prefs';
import { isDeprivation } from '../../shared/punish';
import { statIsUnarmed, statNoDuty } from '../../shared/stat';
import { backDay, backWhen, dutyAt, isSat, isWk, outLbl, returnsOn } from '../../shared/weekend';
import { statusLbl } from '../../shared/ranks';
import { WhoDoes } from './whodoes';
import { SkipsView } from './skips';
type P = any;

const RULE_TXT = (r: P) => [r.restDays ? 'ανάπαυση ' + r.restDays + ' ημ. μετά από υπηρεσία' : 'χωρίς ανάπαυση', r.numRest ? '3ο/4ο νούμερο ξανά μετά από ' + r.numRest + ' ημ.' : '', r.noConsecHol ? 'όχι αργία/ΣΚ δύο συνεχόμενες εβδομάδες' : 'αργίες χωρίς περιορισμό', r.rotate === false ? 'χωρίς εναλλαγή υπηρεσιών' : 'εναλλαγή υπηρεσιών', r.strictUnarmed ? 'Αυστηρά Άοπλοι' : '', r.outTime && r.outTime !== DEFAULT_OUT_TIME ? 'ώρα εξόδου ' + r.outTime : '', r.hkTime && r.hkTime !== DEFAULT_HK_TIME ? 'ώρα ' + HK() + ' ' + r.hkTime : ''].filter(Boolean).join(', ');
const ROTATE_TXT = 'Κανείς δεν ξανακάνει την ίδια υπηρεσία (σκοπιά, μαγειρεία, θαλαμοφύλακα…) όσο κάποιος άλλος, που είναι η σειρά του σήμερα, δεν την έχει κάνει. Έτσι περνούν όλοι από όλες τις υπηρεσίες που μπορούν να κάνουν και μετά ξαναρχίζουν. Ποιοι μπαίνουν σήμερα το κρίνει η σειρά δικαιοσύνης, όπως πριν· όποιος δεν κάνει μια υπηρεσία (Ποιος κάνει τι, Σ.Ι., ιατρικά) δεν τη χρωστά.';
const STRICT_TXT = 'Οι άοπλοι μπαίνουν πρώτα στα μαγειρεία, μετά στο 2ο και 3ο νούμερο θαλαμοφύλακα και οπλοφύλακα (αν ο οπλοφύλακας είναι άοπλος στις Ρυθμίσεις), μετά στο 1ο και 4ο νούμερο θαλαμοφύλακα. Σκοποί μόνο ένοπλοι.';
// «οπλοφύλακας: ένοπλος» όπως είναι τώρα στις Ρυθμίσεις (μόνο αν η φάση έχει οπλοφύλακες)
const opState = (st: P) => { const b = blocksOf(st.settings).filter((x: P) => x.kind === 'op' && !x.hidden); return b.length ? 'οπλοφύλακας: ' + (b.every((x: P) => x.armed) ? 'ένοπλος' : 'άοπλος') + ' (Ρυθμίσεις)' : ''; };

// Ώρες σε στενή μορφή («14-16 · 22-00») όταν είναι ακέραιες ώρες· αλλιώς όπως είναι
const hrs = (x: Post) => (x.slots ? x.slots.map((t: string, i: number, all: string[]) => html`<span key=${i} className="nw">${t.replace(/:00/g, '') + (i < all.length - 1 ? '\u00a0·' : '')}</span>`) : x.hours);
// Γραμμή του πίνακα θέσεων: Θέση με τις ώρες από κάτω | Ποιος (+ ολόκληρο το «Γιατί») | Είδ./Σύν. | ενέργειες
function PostRow({ x, pid, date, statuses, lists, duty, ruleWarn, why, onAssign, onNext, unavailable, onBlocked, pm, locked, onOpen, hint, pickFrom }: P) {
  const [swap, setSwap] = useState(false);
  const p = pid && pm.get(pid); const r = pid && (dutyBlock(statuses, date, pid, x, lists) || ruleWarn);
  // βάρδιες: όλες οι ώρες η μία κάτω από την άλλη, δίπλα στο νούμερο, όπως στο έντυπο (Michael, 20/10)
  const head = x.slots && x.slots.length ? html`<div className="post__pos is-slots"><b>${x.short}</b><span className="post__slots">${x.slots.map((t: string, i: number) => html`<span key=${i}>${t}</span>`)}</span></div>`
    : html`<div className="post__pos"><b>${x.short}</b><span className="post__hrs">${hrs(x)}</span></div>`;
  const kenh = html`<span className="post__who"><span className="kenh-tag">Κενή</span></span>`;
  if (locked) return html`<li className=${cx('post', !p && 'is-empty')}>${head}${p ? html`<span className="post__who"><button type="button" className="post__name linkish" data-tip="Άνοιξε την καρτέλα" onClick=${() => onOpen(p.id)}>${fullName(p)}</button>${r && html`<${Badge} tone="bad">⚠ ${r}<//>`}</span>` : kenh}<span className="duty">${duty}</span><span></span></li>`;
  if (p && swap) return html`<li className="post is-swap">${head}
    <div className="post__wide"><div style=${{ flex: 1, minWidth: 0 }}><${PersonPicker} id=${'gs-' + x.k} autoFocus=${true} placeholder=${'Αντί για ' + fullName(p) + '… (ή ⇄ ανταλλαγή με άλλη θέση)'} date=${date} people=${pickFrom} hint=${hint} unavailable=${(q: Person) => { const r = unavailable(q); return r && r.startsWith('Ήδη ') ? '⇄ Ανταλλαγή: ' + r.slice(5) : r; }} onBlocked=${(q: Person, why: string) => { setSwap(false); onBlocked(x.k, q, why); }} onChange=${(id: number) => { setSwap(false); onAssign(x.k, id, p.id); }}/></div>
    <${Button} variant="ghost" size="sm" onClick=${() => setSwap(false)}>Άκυρο<//></div></li>`;
  if (!p) return html`<li className="post is-empty">${head}${kenh}<div className="post__pick"><${PersonPicker} id=${'gp-' + x.k} placeholder="Διάλεξε άτομο…" date=${date} people=${pickFrom} hint=${hint} unavailable=${unavailable} onBlocked=${(q: Person, why: string) => onBlocked(x.k, q, why)} onChange=${(id: number) => onAssign(x.k, id)}/></div></li>`;
  return html`<li className="post">${head}
    <span className="post__who"><span className="post__name"><button type="button" className="linkish" data-tip="Άνοιξε την καρτέλα" onClick=${() => onOpen(p.id)}>${fullName(p)}</button>${r && html` <${Badge} tone="warn" className="tag" data-tip="Πέρασε παρά τον κανόνα">⚠ ${r}<//>`}</span>${why && html`<small className="post__why" data-tip="Γιατί αυτός; Η σειρά δικαιοσύνης είναι στο κουμπί «Κανόνες»">Γιατί: ${why}</small>`}</span>
    <span className="duty" data-tip="Υπηρεσίες αυτού του είδους / σύνολο" data-tip-side="left">${duty}</span>
    <span className="post__acts"><${Button} variant="ghost" size="sm" data-tip="Βάλε άλλον στη θέση του (π.χ. αλλαγή τελευταίας στιγμής)" data-tip-side="left" onClick=${() => setSwap(true)}>Αλλαγή<//><${Button} variant="ghost" size="sm" data-tip="Βάλε τον επόμενο στη σειρά δικαιοσύνης, με τους ίδιους κανόνες. Ξαναπάτα για τον μεθεπόμενο." data-tip-side="left" onClick=${() => onNext(x.k)}>Επόμενος<//><${Button} variant="ghost" size="icon" aria-label="Αφαίρεση από τη θέση" data-tip="Αφαίρεση από τη θέση" data-tip-side="left" onClick=${() => onAssign(x.k, null)}>${Icon.x}<//></span></li>`;
}

// Μήνας για τις μετρήσεις υπηρεσιών: κοινός για Θέσεις, λίστα ελέγχου και πλέγμα. «Όλοι οι μήνες» μετρά και τις προηγούμενες υπηρεσίες.
const monLbl = (m: string) => MONTHS[+m.slice(5) - 1] + ' ' + m.slice(0, 4);
function useDutyMonth() {
  const { state, today } = useStore();
  const [ym, setYm] = useState(today.slice(0, 7)); const [allM, setAllM] = useState(false);
  const all = dutyStats(state);
  const st = useMemo(() => (allM ? all : monthStats(all, ym)), [all, allM, ym]);
  const months = useMemo(() => [...new Set([today.slice(0, 7), ym, ...dutyMonths(state)])].sort().reverse(), [state.guards, state.dutyLog, today, ym]);
  return { ym, setYm, allM, setAllM, st, months };
}
type DutyMonth = ReturnType<typeof useDutyMonth>;
const MonthSelect = ({ m, width = '190px', small }: { m: DutyMonth; width?: string; small?: boolean }) => html`<${Select} className="ui-input" style=${{ flex: '0 0 ' + width, width, ...(small ? { height: '32px', fontSize: '13px' } : {}) }} aria-label="Μήνας" data-tip="Υπηρεσίες μόνο αυτού του μήνα· «Όλοι οι μήνες» μετρά και τις προηγούμενες υπηρεσίες" value=${m.allM ? '' : m.ym} onChange=${(e: any) => { const v = e.target.value; m.setAllM(!v); if (v) m.setYm(v); }}><option value="">Όλοι οι μήνες</option>${m.months.map(x => html`<option key=${x} value=${x}>${monLbl(x)}</option>`)}<//>`;

function DutyCheck({ onOpen, m }: P) {
  const { state, today } = useStore();
  const [q, setQ] = useState(''); const dq = useDeferredValue(q); const [hol, setHol] = useState(false); const [view, setView] = useState('list');
  // μέρες χωρίς υπηρεσία: από την τελευταία υπηρεσία του, όποιου μήνα (όχι μόνο του μήνα που βλέπεις)
  const allSt = dutyStats(state);
  const idle = (pid: number): number => { const l = allSt.get(pid)?.last; return l ? Math.max(0, daysBetween(l, today) - 1) : 9999; };
  const { ym, setYm, allM, setAllM, st } = m as DutyMonth;
  // στήλες: τα είδη του εντύπου και κάθε δική σου υπηρεσία χωριστά (μετρά ως δική της), και των ανενεργών όσο έχουν
  // υπηρεσίες στο διάστημα (δεν χάνονται)· «Άλλη» μόνο για υπηρεσίες χωρίς θέση (π.χ. «Υ» από το Excel)
  const kinds = useMemo(() => {
    const on = new Set(postsOf(state.settings).map(p => fairKey(state, p)));
    for (const b of blocksOf(state.settings) || []) { const k = b.custom ? 'b:' + b.id : b.kind; if (b.hidden && !on.has(k) && [...st.values()].some(d => d.byKind[k])) on.add(k); }
    if ([...st.values()].some(d => d.log.some(e => e.kind === 'other' && !e.t))) on.add('other');
    return [...on];
  }, [state.settings, st]);
  const kindLbl = (k: string) => (k.startsWith('b:') ? everyBlock(state.settings).find(b => 'b:' + b.id === k)?.name || '?' : KIND_LBL[k as DutyKind]);
  // το πλέγμα διαβάζει μόνο υπηρεσίες, προσωπικό και ρυθμίσεις: δεν ξαναχτίζεται για άλλες αλλαγές (π.χ. εξοδούχοι, ιατρικά)
  const grid = useMemo(() => (view === 'grid' ? checkSheet(state, ym, dq.trim() ? new Set(searchPeople(state.people, dq).map(p => p.id)) : undefined) : null), [view, state.guards, state.dutyLog, state.people, state.settings, ym, dq]);
  // ταξινόμηση με κλικ στην επικεφαλίδα της στήλης (ξανά κλικ: αντίστροφα)
  const [sk, setSk] = useState<{ k: string; dir: number } | null>(null);
  const val = (r: P, k: string): number | string => (k === 'name' ? r.p.last + ' ' + r.p.first : k === 'total' ? r.d.total : k === 'hol' ? r.d.hol : k === 'last' ? r.d.last || '' : k === 'idle' ? r.idle : r.d.byKind[k] || 0);
  const rows = useMemo(() => searchPeople(seatPeople(state), dq).map(p => ({ p, d: st.get(p.id) || emptyStat(), idle: idle(p.id) })).sort((a, b) => { if (sk) { const x = val(a, sk.k), y = val(b, sk.k); const c = typeof x === 'number' ? x - (y as number) : collator.compare(x, y as string); if (c) return c * sk.dir; } // σειρά δικαιοσύνης (Michael, 17/10): πρώτα όσοι έχουν τις περισσότερες μέρες χωρίς υπηρεσία, μετά οι λιγότερες συνολικά, μετά οι λιγότερες αργίες
    return (hol ? a.d.hol - b.d.hol : 0) || b.idle - a.idle || a.d.total - b.d.total || a.d.hol - b.d.hol || collator.compare(a.p.last, b.p.last); }), [dq, st, hol, state.people, state.cadreList, sk, allSt, today]);
  const H = (k: string, l: string, tip?: string) => html`<button type="button" className="chk__sort" data-tip=${tip} aria-sort=${sk?.k === k ? (sk.dir > 0 ? 'ascending' : 'descending') : 'none'} onClick=${() => setSk(sk?.k === k ? { k, dir: -sk.dir } : { k, dir: k === 'name' ? 1 : -1 })}>${l}${sk?.k === k ? (sk.dir > 0 ? ' ▲' : ' ▼') : ''}</button>`;
  const mon = MONTHS[+ym.slice(5) - 1];
  return html`<${Card} title="Έλεγχος υπηρεσιών" actions=${html`<${Badge} tone="ok" data-tip="Βγαίνει από το ημερολόγιο υπηρεσιών (ποιος, ποια μέρα, ποια θέση) (Κ-03)" data-tip-side="left">Ενημερώνεται αυτόματα<//>`}>
    <div className="toolbar"><${Segmented} value=${view} onChange=${setView} items=${[{ value: 'list', label: 'Λίστα' }, { value: 'grid', label: 'Μηνιαίο πλέγμα (Excel)' }]}/>
      ${view === 'grid' && html`<input type="search" className="ui-input" style=${{ width: '240px' }} aria-label="Αναζήτηση στο πλέγμα" placeholder="Όνομα (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/><${MonthField} aria-label="Μήνας" style=${{ width: '170px' }} value=${ym} onChange=${(e: any) => { if (e.target.value) { setYm(e.target.value); setAllM(false); } }}/><${ExportButton} kind="check" date=${ym + '-01'} label=${'Έλεγχος υπηρεσιών ' + mon} size="sm"/>`}</div>
    ${view === 'grid' ? html`<${ExcelSheet} model=${grid} fileName=${'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + norm(mon) + '.xlsx'} sheetName="ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ" meta="A4 οριζόντιο" footer="Γκρι στήλες: ΣΚ και αργίες, από το ημερολόγιο. Θ θαλαμοφύλακας · Μ μαγειρεία · ΛΥ Λ/Υ-Δ/Υ. Στο Excel γράφεται και ο λόγος απουσίας."/>` : html`<div>
    <div className="toolbar" style=${{ marginBottom: 0 }}><input type="search" className="ui-input" aria-label="Αναζήτηση στον έλεγχο" placeholder="Όνομα (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${MonthSelect} m=${m}/>
      <${Segmented} value=${hol ? 'hol' : 'all'} onChange=${(v: string) => { setSk(null); setHol(v === 'hol'); }} items=${[{ value: 'all', label: 'Σειρά δικαιοσύνης', tip: 'Περισσότερες μέρες χωρίς υπηρεσία, μετά λιγότερες συνολικά, μετά λιγότερες αργίες' }, { value: 'hol', label: 'Λιγότερες αργίες' }]}/><${ActiveFilter} parts=${[dq && '«' + dq + '»']} onClear=${() => setQ('')}/><span className="toolbar__count">${rows.length} άτομα</span></div>
    <div className="chk"><div className="chk__in">
      <div className="chk__head" style=${{ gridTemplateColumns: 'minmax(130px,1fr) repeat(' + (kinds.length + 2) + ',52px) 70px 56px' }}>${H('name', 'Ονοματεπώνυμο')}${kinds.map(k => html`<span key=${k}>${H(k, kindLbl(k), k.startsWith('b:') ? kindLbl(k) : undefined)}</span>`)}${H('total', 'Σύν.')}${H('hol', 'Αργ.', 'Υπηρεσίες σε ΣΚ ή επίσημη αργία')}${H('last', 'Τελευταία')}${H('idle', 'Μέρες', 'Μέρες χωρίς υπηρεσία')}</div>
      <${VirtualList} items=${rows} rowHeight=${36} height=${380} renderRow=${(r: P, _i: number, style: P) => html`<div key=${r.p.id} className="chk__row" style=${{ ...style, gridTemplateColumns: 'minmax(130px,1fr) repeat(' + (kinds.length + 2) + ',52px) 70px 56px' }} role="button" tabIndex="0" onClick=${() => onOpen(r.p.id)}><span>${shortName(r.p)}</span>${kinds.map(k => html`<span key=${k} className="num">${r.d.byKind[k] || '·'}</span>`)}<span className="num tot">${r.d.total}</span><span className="num hol">${r.d.hol}</span><span className="num last">${r.d.last ? dm(r.d.last) : '—'}${r.d.last && isHol(state.settings, r.d.last) ? ' ★' : ''}</span><span className="num">${r.idle === 9999 ? '—' : r.idle}</span></div>`}/>
    </div></div></div>`}
    <p className="note" style=${{ margin: '8px 0 0' }}>${view === 'list' && !allM ? monLbl(ym) + ': μετρούν μόνο οι υπηρεσίες του μήνα, χωρίς τις προηγούμενες. ' : ''}Κάθε υπηρεσία κρατιέται με την ημερομηνία της (★ = ΣΚ ή αργία). Πάτα σε άτομο για όλο το ημερολόγιο.</p>
  <//>`;
}

// Μέρες σε κανόνα: οι συνηθισμένες στη λίστα και «Άλλο…» για όσες θέλεις (Michael, 20/10)
const MAX_DAYS = 30;
function DaysSelect({ id, value, onChange, opts, txt }: P) {
  const known = opts.some(([v]: [number]) => v === value);
  const [own, setOwn] = useState(!known);
  return html`<div className="field-row" style=${{ alignItems: 'center' }}>
    <${Select} id=${id} className="ui-input" value=${own ? 'own' : value} onChange=${(e: any) => { if (e.target.value === 'own') { setOwn(true); if (known) onChange(Math.max(1, value + 1)); } else { setOwn(false); onChange(+e.target.value); } }}>
      ${opts.map(([v, l]: [number, string]) => html`<option key=${v} value=${v}>${l}</option>`)}<option value="own" data-keep>${own ? txt(value) : 'Άλλο…'}</option><//>
    ${own && html`<input type="number" min="1" max=${MAX_DAYS} className="ui-input" style=${{ maxWidth: '90px' }} aria-label="Ημέρες" value=${value} onChange=${(e: any) => onChange(Math.max(1, Math.min(MAX_DAYS, Math.floor(+e.target.value) || 1)))}/><span className="note">ημέρες</span>`}
  </div>`;
}
function RulesDialog({ onClose }: P) {
  const { state, run } = useStore(); const toast = useToast();
  const [r, setR] = useState({ ...state.rules, outTime: state.rules.outTime || DEFAULT_OUT_TIME, hkTime: state.rules.hkTime || DEFAULT_HK_TIME });
  const [ds, setDs] = useState(dutyStartOf(state.settings));
  const badT = !normTime(r.outTime) || !normTime(r.hkTime) || !normTime(ds);
  const [r0] = useState(() => JSON.stringify([r, ds])); const dirty = JSON.stringify([r, ds]) !== r0;
  const save = async () => {
    const nr = { ...r, outTime: normTime(r.outTime)!, hkTime: normTime(r.hkTime)! }; const nds = normTime(ds)!;
    if (nds !== dutyStartOf(state.settings) && !(await run({ t: 'setSettings', settings: { dutyStart: nds }, text: 'ο κύκλος των υπηρεσιών ξεκινά στις ' + nds }, false))) return;
    if (await run({ t: 'setRules', rules: nr, text: RULE_TXT(nr) }, false)) { onClose(); toast({ text: 'Οι κανόνες άλλαξαν: ' + RULE_TXT(nr) }); }
  };
  return html`<${Dialog} title="Κανόνες υπηρεσιών" description="Ισχύουν στην επιλογή ατόμου και στην αυτόματη συμπλήρωση." onClose=${onClose} dirty=${dirty && 'Οι αλλαγές στους κανόνες δεν αποθηκεύτηκαν. Αν κλείσεις, μένουν οι παλιοί.'}
    footer=${html`<${Why} text=${badT && 'Μια ώρα δεν είναι σωστή (π.χ. 16:00)'}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${badT} why="Μια ώρα δεν είναι σωστή (π.χ. 16:00)" onClick=${save}>Αποθήκευση<//>`}>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${r.noConsecHol} onChange=${(e: any) => setR({ ...r, noConsecHol: e.target.checked })}/><span><b>Όχι αργία ή ΣΚ δύο συνεχόμενες εβδομάδες</b><small>Όποιος έκανε υπηρεσία σε ΣΚ ή αργία δεν μπαίνει στο επόμενο ΣΚ/αργία (Κ-13), ούτε σε αργία δύο μέρες μετά (π.χ. Παρασκευή αργία και Κυριακή).</small></span></label>
    <div className="field"><label className="field__label" htmlFor="rrest">Ανάπαυση πριν και μετά από υπηρεσία (Κ-14)</label><${DaysSelect} id="rrest" value=${r.restDays} onChange=${(v: number) => setR({ ...r, restDays: v })} opts=${[[0, 'Χωρίς'], [1, '1 ημέρα (όχι δύο μέρες στη σειρά)'], [2, '2 ημέρες']]} txt=${(n: number) => n + ' ημέρες'}/></div>
    <div className="field"><label className="field__label" htmlFor="rnum">3ο και 4ο νούμερο</label><${DaysSelect} id="rnum" value=${r.numRest || 0} onChange=${(v: number) => setR({ ...r, numRest: v })} opts=${[[0, 'Χωρίς περιορισμό'], [3, 'Ξανά στο ίδιο νούμερο μετά από 3 ημέρες'], [4, 'Μετά από 4 ημέρες']]} txt=${(n: number) => 'Μετά από ' + n + ' ημέρες'}/><span className="note">Ισχύει μαζί με την ανάπαυση: όποιος ήταν 3ος ή 4ος (θαλαμοφύλακας, οπλοφύλακας, σκοπός) δεν ξαναμπαίνει στο ίδιο νούμερο νωρίτερα.</span></div>
    <div className="field"><span className="field__label">Αρχή υπηρεσίας</span><div className="field-row">
      <${TimeField} id="rds" label="Ο κύκλος ξεκινά στις" value=${ds} onChange=${setDs} help=${'Η μέρα της υπηρεσίας είναι ' + (normTime(ds) || '14:00') + ' → ' + (normTime(ds) || '14:00') + ' της επόμενης. Από εδώ ξεκινούν και οι βάρδιες.'}/>
      <div className="field"><span className="field__label">Βάρδιες</span><span className="note">Κάθε πόσες ώρες αλλάζει το νούμερο το ορίζεις σε κάθε υπηρεσία: <${GoLink} view="templates" params=${{ tab: 'duty', dsub: 'blocks' }}>Ρυθμίσεις › Υπηρεσίες και αργίες › Υπηρεσίες<//> › Επεξεργασία.</span></div>
    </div></div>
    <div className="field"><span className="field__label">Επιστροφή με ώρα (άδεια, νοσοκομείο, ΣΤΕΠ)</span><div className="field-row">
      <${TimeField} id="rout" label="Ώρα εξόδου" value=${r.outTime} onChange=${(v: string) => setR({ ...r, outTime: v })} help="Όποιος γυρίσει ως τότε βγαίνει κανονικά έξοδο την ίδια μέρα"/>
      <${TimeField} id="rhk" label="Ώρα ${HK()}" value=${r.hkTime} onChange=${(v: string) => setR({ ...r, hkTime: v })} help="Όποιος γυρίσει ως τότε μετρά παρών στην ${HK()} της μέρας"/>
    </div><span className="note">Στις υπηρεσίες μετρά η ώρα που ξεκινά κάθε θέση (π.χ. επιστροφή 12:00 → μπαίνει στις 14:00). Η μέρα της αναχώρησης μετρά πάντα ολόκληρη.</span></div>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${r.rotate !== false} onChange=${(e: any) => setR({ ...r, rotate: e.target.checked })}/><span><b>Εναλλαγή υπηρεσιών</b><small>${ROTATE_TXT} Όταν είναι κλειστό, μετρούν μόνο τα νούμερα.</small></span></label>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${!!r.strictUnarmed} onChange=${(e: any) => setR({ ...r, strictUnarmed: e.target.checked })}/><span><b>Αυστηρά Άοπλοι</b><small>${STRICT_TXT}${opState(state) ? ' Τώρα: ' + opState(state) + '.' : ''} Όταν είναι κλειστό, ισχύει η κανονική σειρά.</small></span></label>
    <div className="field"><span className="field__label">Πάντα ισχύουν</span><span className="note" style=${{ fontSize: '13px' }}>Ένοπλες θέσεις χωρίς ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ (Κ-01) · ΕΥ και ΣΤΕΠ σε καμία υπηρεσία · όχι όποιος έχει άδεια ή απουσιάζει (Κ-02) · ΕΟ και ΕΑ όχι σε μαγειρεία, και σε σκοπιά μόνο αν δεν υπάρχει άλλος · η «Δυνατότητα υπηρεσιών» κάθε ατόμου (Κ-15) · ένα άτομο σε μία θέση τη μέρα · οι μόνιμοι Λ/Υ και Δ/Υ μπαίνουν μόνοι τους, εκτός σειράς.</span></div>
    <div className="field"><span className="field__label">Πώς διαλέγει η αυτόματη συμπλήρωση</span><ol className="note fairlist">
      <li>Πρώτα κρατά μόνο όσους επιτρέπουν <b>όλοι</b> οι παραπάνω κανόνες. Κανόνας δεν παραβαίνεται ποτέ σιωπηλά: αν δεν βρεθεί κανείς, η θέση μένει κενή και το λέει.</li>
      <li>Σε άοπλη θέση αφήνει τελευταίους όσους χρειάζονται για να γεμίσουν οι ένοπλες θέσεις της μέρας. Όταν οι ένοπλοι φτάνουν, όλοι (και οι ΕΑ/ΕΟ) μπαίνουν με τη σειρά δικαιοσύνης.</li>
      <li>Σε ΣΚ ή αργία: όποιος έχει κάνει τις <b>λιγότερες αργίες</b>, και μετά όποιος έκανε αργία πιο παλιά. ΔΝ, έξοδος και θάλαμος δεν μετράνε. Όποιος έκανε το προηγούμενο ΣΚ δεν μπαίνει στο αμέσως επόμενο (κανόνας πιο πάνω).</li>
      <li>Τις 2 μέρες πριν από ΣΚ ή αργία (Πέμπτη, Παρασκευή): όσοι <b>χρωστάνε ΣΚ</b> (οι λιγότερες αργίες, όσοι χρειάζονται για τις θέσεις του) μπαίνουν τελευταίοι, για να μην τους κόψει η ανάπαυση από το ΣΚ.</li>
      <li>Όποιος έχει <b>ήδη υπηρεσία τις επόμενες μέρες</b> (π.χ. τον έβαλες με το χέρι Παρασκευή ή ΣΚ): μέσα στις μέρες της ανάπαυσης δεν μπαίνει καθόλου, και ως 2 μέρες πριν μπαίνει τελευταίος, μόνο αν δεν φτάνουν οι άλλοι.</li>
      <li>Σε καθημερινή: όποιος έχει τις <b>περισσότερες μέρες χωρίς υπηρεσία</b>, μετά τις λιγότερες υπηρεσίες συνολικά και μετά τις λιγότερες αργίες.</li>
      <li><b>Εναλλαγή υπηρεσιών</b> (αν είναι ανοιχτή): από όσους είναι η σειρά τους σήμερα (οι πρώτοι στη σειρά, όσες οι κενές θέσεις της μέρας), στη θέση μπαίνει όποιος <b>χρωστά αυτή την υπηρεσία</b>: την έχει κάνει λιγότερο από τις άλλες που μπορεί να κάνει, και λιγότερες φορές από τους άλλους. Όποιος χωρά μόνο σε αυτή τη θέση μπαίνει πρώτος, για να μη μείνει χωρίς υπηρεσία.</li>
      <li>Μετά: τις λιγότερες υπηρεσίες <b>στο ίδιο είδος</b> θέσης.</li>
      <li>Αν ισοβαθμούν σε όλα: κλήρωση με σπόρο την ημερομηνία, ώστε την ίδια μέρα να βγαίνει πάντα το ίδιο αποτέλεσμα.</li>
    </ol><span className="note">Δίπλα σε κάθε όνομα το «Γιατί:» γράφει ποιο κριτήριο τον έφερε.</span></div>
    <span className="note">Οι αναθέσεις που ήδη υπάρχουν δεν αλλάζουν· όσες παραβαίνουν τους νέους κανόνες φαίνονται με ⚠.</span>
  <//>`;
}

export function GuardScreen() {
  const { state, run, today, tomorrow, undoMark } = useStore(); const toast = useToast(); const nav = useNav(); const mobile = useMedia('(max-width: 767px)');
  const ex = useExport(); const xb = useExportBusy();
  const date = nav.params.guardDate || tomorrow; const setDate = (d: string) => nav.set({ guardDate: d });
  const [tab, setTab] = useState('posts'); const [rules, setRules] = useState(false);
  // από το Ctrl+K: ανοίγει κατευθείαν μια καρτέλα ή τους Κανόνες
  useEffect(() => { const o = nav.params.gopen; if (!o) return; nav.set({ gopen: undefined }); if (o === 'rules') setRules(true); else setTab(o); }, [nav.params.gopen]);   // eslint-disable-line react-hooks/exhaustive-deps
  // «Ποιος κάνει τι»: η καρτέλα, μόνο με τον στρατιώτη όταν έρχεσαι από ένα όνομα (κλειδί για να ξαναρχίσει)
  const [who, setWho] = useState<{ pid: number | null; n: number }>({ pid: null, n: 0 });
  const setProf = (pid: number) => { setWho(w => ({ pid: pid >= 0 ? pid : null, n: w.n + 1 })); setTab('who'); };
  const g = state.guards[date] || {}; const seatless = state.dutyLog?.[date] || [];
  const posts = postsOf(state.settings);
  const pm = seatMap(state);
  const blocks = blocksOf(state.settings) || state.settings.blocks; const phase = state.settings.phase || 'sven';
  const empty = posts.filter(x => !g[x.k]);
  const printed = state.printed[date];
  const mon = useDutyMonth(); const st = mon.st;
  const people = activePeople(state);
  const excluded = useMemo(() => {
    const noDuty: P[] = [], unarmed: P[] = [];
    // όπως ορίζει ο πίνακας καταστάσεων (Ρυθμίσεις › Υπηρεσίες): καμία υπηρεσία του εντύπου, ή καμία ένοπλη
    const lists = state.settings.lists; const blocks = (blocksOf(state.settings) || state.settings.blocks).filter(b => !b.hidden);
    people.forEach(p => { const ss = statusesFrom(state.statuses, p.id, date, dutyMin(state.settings)); const a = ss.find(s => statNoDuty(s, blocks, lists)); if (a) { noDuty.push({ p, s: a }); return; } const b = ss.find(s => statIsUnarmed(s, blocks.filter(x => x.kind !== 'ly'), lists)); if (b) unarmed.push({ p, s: b }); });
    // με πόστο: χωριστά, με το πόστο τους (μόνο Λ/Υ και Δ/Υ)
    const posted = people.filter(p => p.post && !noDuty.some(x => x.p === p));
    const cols = capCols(state.settings);
    const capped = people.filter(p => !p.post).map(p => ({ p, c: cols.map(col => ({ col, x: capCell(state, p, col) })).filter(o => !o.x.on) })).filter(o => o.c.length);
    const offDay = people.filter(p => !noDuty.some(x => x.p === p) && offDayBlock(state, date, p.id)).map(p => ({ p }));
    // ΕΠΟΠ/ΟΒΑ: μόνο με το χέρι, με τις υπηρεσίες του μήνα
    const epop = [...people.filter(p => isEpop(p, lists)), ...seatPeople(state).filter(p => p.cid)];
    return { noDuty, unarmed, posted, capped, offDay, epop };
  }, [state.statuses, state.caps, state.people, state.cadreList, state.settings, date]);
  const epopHint = useCallback((p: Person) => monthTxt(state, date, p), [state.guards, state.dutyLog, state.settings, date]);   // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(() => frouraSheet(state, date), [state, date]);
  // «Γιατί αυτός;» μία φορά ανά αλλαγή, όχι σε κάθε απόδοση (π.χ. όσο γράφεις αιτία στο παράθυρο «παρά τον κανόνα»)
  const why = useMemo(() => whyAll(state, date), [state.guards, state.dutyLog, state.people, state.settings, state.baseline, state.statuses, state.caps, state.rules, date]);
  const [force, setForce] = useState<{ k: string; p: Person; why: string; reason: string; swapWith?: string; move?: string } | null>(null);
  const [skipped, setSkipped] = useState<Record<string, number[]>>({});
  useEffect(() => setSkipped({}), [date]);
  // Παλιές μέρες κλειδωμένες, για να μην αλλάξει κατά λάθος ο έλεγχος υπηρεσιών· ξεκλειδώνουν για διόρθωση
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const locked = date < today && !unlocked[date];
  const [addOpen, setAddOpen] = useState(false);
  const [clearAsk, setClearAsk] = useState(false);
  const [fixedOpen, setFixedOpen] = useState(false);
  // κάρτες που κλείνουν: πλήρη μπλοκ κλειστά, με κενά ανοιχτά. Ό,τι αλλάξεις με το χέρι μένει όσο δουλεύεις.
  const [fold, setFold] = useState<Record<string, boolean>>({});
  const flip = (id: string, open: boolean) => setFold(f => ({ ...f, [id]: !open }));
  const assign = useCallback(async (k: string, pid: number | null, instead?: number, reason?: string, move?: string) => {
    const x = posts.find(q => q.k === k)!;
    if (await run({ t: 'assign', date, k, pid, force: reason, move }, false)) toast({ text: (pid ? shortName(pm.get(pid)!) + (instead ? ' αντί για ' + shortName(pm.get(instead)!) : '') + ' σε ' : 'Κενή η θέση ') + postTxt(x) + (printed ? ' · Είχε βγει Excel: χρειάζεται νέα εκτύπωση' : ''), actions: [undoMark()] });
  }, [date, printed, state]);
  // Τίποτα δεν απαγορεύεται πλήρως (Michael, 17/10): κατάσταση (ΕΥ, άδεια…), ανάπαυση, ΣΚ, δυνατότητα περνούν με αιτιολογία.
  // Ήδη σε άλλη θέση: ανταλλαγή αν η θέση μας έχει κάποιον, αλλιώς μετακίνηση (ή και στις δύο, με αιτία).
  const blocked = useCallback((k: string, p: Person, why: string) => {
    const other = postOf(state, date, p.id, k);
    if (other && g[k]) {
      const chk = swapCheck(state, date, k, other.k);
      if (chk.hard) { toast({ text: 'Δεν γίνεται ανταλλαγή: ' + chk.hard }); return; }
      if (chk.soft) { setForce({ k, p, why: chk.soft, reason: '', swapWith: other.k }); return; }
      swap(k, other.k); return;
    }
    if (other) { setForce({ k, p, why: 'Είναι ήδη ' + postTxt(other) + '.', reason: '', move: other.k }); return; }
    setForce({ k, p, why, reason: '' });
  }, [date, state]);
  const swap = useCallback(async (a: string, b: string, reason?: string) => {
    const pa = g[a], pb = g[b];
    if (await run({ t: 'swapPosts', date, a, b, force: reason }, false)) toast({ text: 'Ανταλλαγή: ' + shortName(pm.get(pb)!) + ' σε ' + postTxt(postsOf(state.settings).find(q => q.k === a)!) + ', ' + shortName(pm.get(pa)!) + ' σε ' + postTxt(postsOf(state.settings).find(q => q.k === b)!), actions: [undoMark()] });
  }, [date, state]);
  // «Επόμενος»: ο επόμενος στη σειρά δικαιοσύνης, με τους ίδιους κανόνες· ξαναπατάς για τον μεθεπόμενο
  const next = useCallback(async (k: string) => {
    const cur = g[k]; const skip = [...(skipped[k] || []), ...(cur ? [cur] : [])];
    const pid = nextFor(state, date, k, skip);
    if (!pid) { toast({ text: 'Δεν υπάρχει άλλος που να επιτρέπεται σε αυτή τη θέση' }); return; }
    setSkipped({ ...skipped, [k]: skip });
    await assign(k, pid, cur);
  }, [date, state, skipped]);
  const exportX = () => ex('froura', date, 'η κατάσταση υπηρεσιών');
  // ΠΣΚ: όταν η μέρα είναι Παρασκευή, Σάββατο ή Κυριακή
  const psk = [5, 6, 0].includes(parseD(date).getDay()) ? pskDays(date) : null;
  const pskEmpty = (d: string) => posts.filter(x => !(state.guards[d] || {})[x.k]).length;
  const pill = (list: P[]) => html`<div className="avail">${list.map(({ p, s }: P) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => nav.openPerson(p.id)}>${shortName(p)} <${Badge} tone=${TYPES[s.type as TypeKey].tone} data-tip=${TYPES[s.type as TypeKey].long}>${TYPES[s.type as TypeKey].label}<//></button>`)}</div>`;
  const autofill = async () => { const ns = await run({ t: 'autofill', date }, false); const left = ns ? postsOf(ns.settings).filter(x => !(ns.guards[date] || {})[x.k]).length : 0; if (ns) toast({ text: left ? 'Συμπληρώθηκαν όσες θέσεις γινόταν. ' + left + (left === 1 ? ' έμεινε κενή' : ' έμειναν κενές') + ' γιατί κανείς δεν επιτρέπεται εκεί με τους κανόνες.' : 'Συμπληρώθηκαν οι κενές θέσεις με τη σειρά δικαιοσύνης, τηρώντας όλους τους κανόνες', actions: [undoMark()] }); };
  const [preview, setPreview] = useState(false);
  // «Επόμενη κενή» (κουμπί ή πλήκτρο Ν): πάει στην επόμενη κενή θέση, ανοίγει την ομάδα της και την επιλογή ατόμου
  // Συνεχίζει μετά την τελευταία θέση που πήγες (ή που γράφεις τώρα), αλλιώς από όσα φαίνονται στην οθόνη
  const [goK, setGoK] = useState<string | null>(null); const lastK = useRef<string | null>(null);
  useEffect(() => { lastK.current = null; }, [date]);
  const nextEmpty = useCallback(() => {
    const shown = new Set(blocks.filter(b => !b.hidden).map(b => b.id));
    const vis = posts.filter(x => shown.has(x.block));
    const ks = vis.filter(x => !g[x.k]).map(x => x.k);
    if (!ks.length) { toast({ text: 'Δεν έμεινε κενή θέση' }); return; }
    const id = (document.activeElement as HTMLElement | null)?.id || '';
    const from = id.startsWith('gp-') ? id.slice(3) : lastK.current;
    const at = from ? vis.findIndex(x => x.k === from) : -1;
    let k = at >= 0 ? (vis.slice(at + 1).find(x => !g[x.k]) || vis.find(x => !g[x.k]))!.k : '';
    if (!k) { const top = (document.querySelector('.topbar') as HTMLElement | null)?.offsetHeight || 60; k = ks.find(q => { const el = document.getElementById('gp-' + q); return !el || el.getBoundingClientRect().top > top + 60; }) || ks[0]; }
    const b = posts.find(x => x.k === k)!.block;
    lastK.current = k; setFold(f => ({ ...f, [b]: true })); setGoK(k);
  }, [posts, blocks, g]);
  useEffect(() => {
    if (!goK) return; setGoK(null);
    const el = document.getElementById('gp-' + goK) as HTMLInputElement | null;
    if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); }
  }, [goK]);
  useEffect(() => {
    if (locked || tab !== 'posts') return;
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName || '') || document.querySelector('.ui-overlay,.ui-sheet')) return;
      if (e.key === 'n' || e.key === 'N' || e.key === 'ν' || e.key === 'Ν') { e.preventDefault(); nextEmpty(); }
    };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, [locked, tab, nextEmpty]);
  // η μπάρα των θέσεων μένει πάνω όταν κυλάς, με τα βασικά κουμπιά της σελίδας
  const sentinel = useRef<HTMLDivElement>(null); const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const top = (document.querySelector('.topbar') as HTMLElement | null)?.offsetHeight || 60;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < top + 1), { rootMargin: '-' + (top + 1) + 'px 0px 0px 0px' });
    io.observe(el); return () => io.disconnect();
  }, [tab, mobile]);
  // γιατί είναι γκρι η «Αυτόματη συμπλήρωση» (UX Μ5)
  const afWhy = locked ? 'Περασμένη μέρα: πάτα πρώτα «Ξεκλείδωσε για διόρθωση»' : !people.length ? 'Δεν υπάρχουν στρατιώτες στο Δυναμολόγιο' : !empty.length ? 'Δεν υπάρχουν κενές θέσεις' : '';
  const fileName = frouraFile(state.settings, phase) + dmy(date).replace(/\//g, '-') + '.xlsx';
  const sheet = () => html`<${ExcelSheet} model=${model} fileName=${fileName} sheetName=${'ΦΡΟΥΡΑ ' + phaseName(state.settings, phase)} meta=${(empty.length ? '⚠ ' + empty.length + ' κενές' : '✓ Πλήρης') + ' · A4 οριζόντιο'}/>`;
  const left = html`<div className="guard__left">
    ${locked && html`<${Alert} tone="info"><span>Περασμένη μέρα: οι θέσεις είναι κλειδωμένες για να μην αλλάξει κατά λάθος ο έλεγχος υπηρεσιών.</span><${Button} size="sm" variant="outline" onClick=${() => setUnlocked({ ...unlocked, [date]: true })}>Ξεκλείδωσε για διόρθωση<//><//>`}
    ${printed && html`<${Alert} tone="info"><span>Βγήκε Excel για αυτή τη μέρα στις <b>${printed}</b>. Αν αλλάξεις κάτι, βγάλ' το ξανά.</span><//>`}
    <div ref=${sentinel} aria-hidden="true"></div>
    <div className=${cx('guard__bar', stuck && 'is-stuck')}><span className="gb-stuck"><b>${dow(date)} ${dm(date)}</b></span><${PhaseSelect} value=${phase} onChange=${(v: Phase) => run({ t: 'setPhase', phase: v })} prefix="ΦΡΟΥΡΑ "/>${empty.length ? html`<${Badge} tone="bad">${empty.length} κενές από ${posts.length}<//>` : html`<${Badge} tone="ok">Πλήρης<//>`}${!locked && empty.length > 0 && html`<${Button} size="sm" variant="outline" className="gb-keep" onClick=${nextEmpty} data-tip="Πάει στην επόμενη κενή θέση και ανοίγει την επιλογή ατόμου (πλήκτρο Ν)">Επόμενη κενή<//>`}
      <span className="gb-stuck"><${Button} size="sm" disabled=${!!afWhy} why=${afWhy} onClick=${autofill}>Αυτόματη συμπλήρωση<//><${Button} size="sm" variant="outline" disabled=${!!xb} onClick=${exportX}>${xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//></span>
      <span className="guard__rules">${isHol(state.settings, date) && html`<${Badge} tone="warn" data-tip="Μετρά ως αργία στον έλεγχο υπηρεσιών">Αργία: ${holName(state.settings, date)}<//>`}</span>
      <span className="gb-mon"><span className="gb-mon__lbl" data-tip="Από ποιον μήνα μετρά τις υπηρεσίες (στήλη Είδ./Σύν. και σειρά)">Μετρά:</span><${MonthSelect} m=${mon} width="150px" small=${true}/></span><${Button} variant="outline" size="sm" onClick=${() => setAddOpen(true)} data-tip="Π.χ. σκοπιά, πύλη, ΤΑΕ. Μπαίνει στο έντυπο σε δική της γραμμή.">+ Νέα υπηρεσία<//></div>
    ${clearAsk && html`<${Dialog} role="alertdialog" title=${'Να αδειάσει η ' + dow(date) + ' ' + dm(date) + ';'} onClose=${() => setClearAsk(false)}
      footer=${html`<${Button} variant="outline" data-autofocus="" onClick=${() => setClearAsk(false)}>Όχι<//><${Button} variant="destructive" onClick=${async () => { setClearAsk(false); if (await run({ t: 'clearDay', date }, false)) toast({ text: 'Άδειασαν οι θέσεις ' + dow(date) + ' ' + dm(date), actions: [undoMark()] }); }}>Ναι, άδειασέ τη<//>`}>
      <p style=${{ margin: 0 }}>Βγαίνουν και οι <b>${Object.values(g).filter(Boolean).length}</b> από τις θέσεις αυτής της μέρας (μένουν κενές). Μπορείς να το αναιρέσεις αμέσως μετά.</p><//>`}
    ${psk && html`<div className="psk"><div><b>Φρουρά ΠΣΚ</b><small>${psk.map(d => dow(d) + ' ' + dm(d) + ': ' + (pskEmpty(d) ? pskEmpty(d) + ' κενές' : 'πλήρης')).join(' · ')}</small></div>
      <span className="psk__acts"><${Button} size="sm" variant="outline" disabled=${!people.length || psk.every(d => !pskEmpty(d)) || psk.some(d => d < today && !unlocked[d])} why=${!people.length ? 'Δεν υπάρχουν στρατιώτες στο Δυναμολόγιο' : psk.every(d => !pskEmpty(d)) ? 'Δεν υπάρχουν κενές θέσεις στο ΠΣΚ' : 'Μια μέρα του ΠΣΚ πέρασε: ξεκλείδωσέ τη πρώτα'} onClick=${async () => { if (await run({ t: 'autofillRange', dates: psk.filter(d => pskEmpty(d)) }, false)) toast({ text: 'Συμπληρώθηκε το ΠΣΚ ' + dm(psk[0]) + '–' + dm(psk[2]) + ', μία μέρα μετά την άλλη, με τους κανόνες και ανάμεσά τους.', actions: [undoMark()] }); }} data-tip="Γεμίζει Παρασκευή, Σάββατο και Κυριακή μαζί. Οι κανόνες (ανάπαυση, νούμερα, ΣΚ) ισχύουν και ανάμεσα στις τρεις μέρες.">Συμπλήρωση ΠΣΚ<//>
      <${Button} size="sm" variant="outline" disabled=${!!xb} onClick=${() => ex('frouraPsk', psk[0], 'η ΦΡΟΥΡΑ του ΠΣΚ')} data-tip="Ένα Excel με τρία φύλλα: Παρ, Σαβ, Κυρ">${xb === 'frouraPsk' ? 'Δημιουργία…' : 'Excel ΠΣΚ'}<//>
      <${Button} size="sm" variant="ghost" disabled=${!!xb} onClick=${() => ex('outsPsk', psk[0], 'οι εξοδούχοι του ΠΣΚ')} data-tip="Εξοδούχοι-παραμένοντες για τις τρεις μέρες, ένα φύλλο ανά μέρα">${xb === 'outsPsk' ? 'Δημιουργία…' : 'Εξοδούχοι ΠΣΚ'}<//></span></div>`}
    <div className="gtable">
      <div className="gtable__head post" aria-hidden="true"><span>Θέση · ώρες</span><span>Ποιος</span><span data-tip=${'Υπηρεσίες αυτού του είδους / σύνολο · ' + (mon.allM ? 'όλοι οι μήνες, μαζί με τις προηγούμενες' : monLbl(mon.ym)) + ' (αλλάζει από τον μήνα πάνω δεξιά)'}>Είδ./Σύν.</span><span></span></div>
      ${blocks.filter(b => !b.hidden).map(b => { const ps = posts.filter(x => x.block === b.id); const emp = ps.filter(x => !g[x.k]).length; const open = fold[b.id] ?? emp > 0;
        const names = ps.map(x => (g[x.k] ? shortName(pm.get(g[x.k])!) : null)).filter(Boolean).join(', ');
        return html`<section key=${b.id} className=${cx('gblock', !open && 'is-closed')}>
          <h2 className="gblock__hd"><button type="button" aria-expanded=${open} onClick=${() => flip(b.id, open)}>${Icon.chev}<span>${b.name}</span><span className="gblock__meta" data-tip=${b.armed ? 'Ένοπλη: δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ (Κ-01)' : 'Άοπλη: μπαίνουν και όσοι έχουν ΕΑ, ΕΟ'}>· ${b.armed ? 'Ένοπλη' : 'Άοπλη'}</span><span className=${cx('gblock__meta', emp && 'is-bad')}>· ${emp ? emp + ' ' + (emp === 1 ? 'κενή' : 'κενές') : 'πλήρης'}</span></button>${!open && names && html`<span className="gblock__sum">${names}</span>`}</h2>
          ${open && html`<ul className="posts">${ps.map((x: Post) => { const pid = g[x.k]; const d = pid ? st.get(pid) || emptyStat() : null; return html`<${PostRow} key=${x.k} onOpen=${nav.openPerson} x=${x} pid=${pid} pm=${pm} date=${date} lists=${state.settings.lists} statuses=${state.statuses} duty=${d ? (d.byKind[fairKey(state, x)] || 0) + ' / ' + d.total : ''} ruleWarn=${pid ? capBlock(state, date, pid, x) || ruleBlock(state, date, pid, undefined, x.k) || lastResort(state.statuses, date, pid, x, state.settings.lists) || statusWarn(state, date, pid) : null} why=${pid ? why[x.k] || '' : ''} locked=${locked} onAssign=${assign} onNext=${next} onBlocked=${blocked} unavailable=${(p: Person) => guardUnavailable(state, date, p.id, x.k)} hint=${epopHint} pickFrom=${seatPeople(state)}/>`; })}</ul>${b.id === 'ly' && html`<${FixedLine} onEdit=${() => setFixedOpen(true)}/>`}`}
        </section>`; })}
    </div>
    ${!locked && Object.values(g).some(Boolean) && html`<div className="gb-clear"><${Button} size="sm" variant="ghost" onClick=${() => setClearAsk(true)} data-tip="Βγάζει όλους από τις θέσεις αυτής της μέρας (ρωτά πρώτα)">Άδειασε τη μέρα…<//></div>`}
    ${seatless.length > 0 && html`<section className="ui-card seatless" aria-label="Υπηρεσίες χωρίς θέση">
      <h2 className="minihd">Υπηρεσίες χωρίς θέση (από Excel) · ${seatless.length}</h2>
      <p className="note" style=${{ margin: '0 0 6px' }}>Σκέτο «Θ», «Μ», «Σ» στον έλεγχο υπηρεσιών: μετρούν στα σύνολα, στην ανάπαυση και στις αργίες, όχι στον κανόνα του ίδιου νούμερου. Όταν μπει ο ίδιος σε θέση του ίδιου είδους, φεύγει από εδώ.</p>
      <ul className="hist">${seatless.map((e: P) => html`<li key=${e.pid + e.kind}><span>${pm.get(e.pid) ? shortName(pm.get(e.pid)!) : '?'}</span> <span className="muted">${KIND_NAME[e.kind as DutyKind]}</span> <${Button} size="sm" variant="ghost" aria-label=${'Βγάλε ' + (pm.get(e.pid) ? shortName(pm.get(e.pid)!) : '') + ' από τις υπηρεσίες χωρίς θέση'} data-tip="Δεν έκανε αυτή την υπηρεσία" onClick=${async () => { if (await run({ t: 'removeDutyLog', date, pid: e.pid, kind: e.kind }, false)) toast({ text: 'Βγήκε από τις υπηρεσίες ' + dm(date), actions: [undoMark()] }); }}>✕<//></li>`)}</ul>
    </section>`}
  </div>`;
  const side = html`<div className="guard__right">
    <section className="ui-card side">
      <h2 className="side__hd">Δεν μπαίνουν ${dayName(date, today).toLowerCase()}</h2>
      <ul className="side__sum">
        <li><button type="button" className="linkish" aria-expanded=${!!fold.ex} onClick=${() => flip('ex', !!fold.ex)}><b>${excluded.noDuty.length}</b> σε καμία υπηρεσία</button></li>
        <li><button type="button" className="linkish" aria-expanded=${!!fold.ex} onClick=${() => flip('ex', !!fold.ex)}><b>${excluded.unarmed.length}</b> μόνο σε άοπλες</button></li>
        ${excluded.posted.length > 0 && html`<li><button type="button" className="linkish" aria-expanded=${!!fold.ex} onClick=${() => flip('ex', !!fold.ex)}><b>${excluded.posted.length}</b> με πόστο</button></li>`}
        ${excluded.epop.length > 0 && html`<li><button type="button" className="linkish" aria-expanded=${!!fold.ex} onClick=${() => flip('ex', !!fold.ex)}><b>${excluded.epop.length}</b> ΕΠΟΠ/ΟΒΑ, μόνο με το χέρι</button></li>`}
        <li><button type="button" className="linkish" aria-expanded=${!!fold.ex} onClick=${() => flip('ex', !!fold.ex)}><b>${excluded.capped.length}</b> μόνιμα όχι σε κάποιες θέσεις</button></li>
        ${excluded.offDay.length > 0 && html`<li><button type="button" className="linkish" aria-expanded=${!!fold.ex} onClick=${() => flip('ex', !!fold.ex)}><b>${excluded.offDay.length}</b> όχι υπηρεσία ${DOW_FULL[weekday(date)]}</button></li>`}
      </ul>
      ${fold.ex ? html`<div className="side__more">
        <h3 className="minihd">Σε καμία υπηρεσία (${excluded.noDuty.length})</h3>${pill(excluded.noDuty)}
        <h3 className="minihd">Μόνο σε άοπλες θέσεις (${excluded.unarmed.length})</h3>${pill(excluded.unarmed)}
        ${excluded.posted.length > 0 && html`<h3 className="minihd">Με πόστο, μόνο Λ/Υ και Δ/Υ (${excluded.posted.length})</h3><p className="note" style=${{ margin: '0 0 6px' }}>Η αυτόματη συμπλήρωση δεν τους βάζει. Με το χέρι μπαίνουν σε οποιαδήποτε θέση: διάλεξέ τον στη θέση και γράψε την αιτία.</p><div className="avail">${excluded.posted.map((p: Person) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => nav.openPerson(p.id)} data-tip="Από το φύλλο ΠΟΣΤΑ (Αρχεία Excel)">${shortName(p)} <${Badge} tone="outline">${p.post}<//></button>`)}</div>`}
        ${excluded.epop.length > 0 && html`<h3 className="minihd">ΕΠΟΠ/ΟΒΑ, μόνο με το χέρι (${excluded.epop.length})</h3><p className="note" style=${{ margin: '0 0 6px' }}>Η αυτόματη συμπλήρωση δεν τους βάζει. Διάλεξέ τον στη θέση· πάνω από το όριο του μήνα ζητά αιτία. Την απαλλαγή του στελέχους τη γράφεις με το χέρι στα Στελέχη.</p><div className="avail">${excluded.epop.map((p: Person) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => nav.openPerson(p.id)} data-tip=${p.cid ? 'Το όριο αλλάζει στα «Στοιχεία» του στελέχους' : 'Το όριο αλλάζει στη «Διόρθωση στοιχείων» της καρτέλας'}>${shortName(p)} <${Badge} tone="outline">${epopHint(p)}<//></button>`)}</div>`}
        <h3 className="minihd">Μόνιμα όχι σε κάποιες θέσεις (${excluded.capped.length})</h3><div className="avail">${excluded.capped.map(({ p, c }: P) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => setProf(p.id)} data-tip=${c.map((o: P) => o.col.label + ': ' + o.x.why).join(' · ') + ' · Πάτα: «Ποιος κάνει τι»'}>${shortName(p)} <${Badge} tone="outline">όχι ${c.map((o: P) => o.col.block ? o.col.label : (KIND_LBL as P)[o.col.kind]).join(', ')}<//></button>`)}</div>
        ${excluded.offDay.length > 0 && html`<h3 className="minihd">Όχι υπηρεσία ${DOW_FULL[weekday(date)]} (${excluded.offDay.length})</h3><div className="avail">${excluded.offDay.map(({ p }: P) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => setProf(p.id)} data-tip="Πάτα: «Ποιος κάνει τι»">${shortName(p)}</button>`)}</div>`}
        <${Button} size="sm" variant="outline" onClick=${() => setProf(-1)} data-tip="Όλοι οι στρατιώτες: ποιες υπηρεσίες κάνει ο καθένας και ποιες μέρες (όπως το αρχείο «Δυνατότητα υπηρεσιών»)">Ποιος κάνει τι…<//>
        <p className="note" style=${{ margin: '10px 0 0' }}>Βγαίνει από τα ιατρικά, τις άδειες και τις εξόδους. Όταν λήξει ένα ιατρικό, ο άνθρωπος ξαναμπαίνει μόνος του.</p>
        <${Button} size="sm" variant="ghost" onClick=${() => flip('ex', true)}>Λιγότερα<//></div>` : html`<button type="button" className="side__link" onClick=${() => flip('ex', false)}>Ποιοι είναι</button>`}
    </section>
    <section className="xlcard">
      <h2 className="xlcard__hd">Excel</h2>
      <p><span className="mono">${fileName}</span> · A4 οριζόντιο. ${empty.length ? 'Με ' + empty.length + (empty.length === 1 ? ' κενή γράφεται' : ' κενές γράφεται') + ' «ΚΕΝΗ».' : 'Πλήρες.'}</p>
      <${Button} variant="outline" onClick=${() => setPreview(true)}>Προεπισκόπηση<//>
      <${PrintButton} kind="froura" date=${date} label="η κατάσταση υπηρεσιών"/>
      <${SigsButton} kind="froura" date=${date} label="η κατάσταση υπηρεσιών"/>
      <${TemplateNote} ids=${['froura', 'check']}/>
    </section>
  </div>`;
  const xl = html`<div className="guard__xl">${sheet()}<div className="toolbar" style=${{ marginTop: '10px' }}><${Button} disabled=${!!xb} onClick=${exportX}>${xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//><${PrintButton} kind="froura" date=${date} label="η κατάσταση υπηρεσιών" variant="outline"/><${SigsButton} kind="froura" date=${date} label="η κατάσταση υπηρεσιών"/></div><${TemplateNote} ids=${['froura', 'check']}/></div>`;
  const check = html`<${DutyCheck} onOpen=${nav.openPerson} m=${mon}/>`;
  const skipN = useMemo(() => state.people.reduce((n, p) => n + (p.skips?.filter(k => k.to >= today).length || 0), 0), [state.people, today]);   // ισχύουν τώρα ή έρχονται
  const whoTab = html`<${WhoDoes} key=${who.n} date=${date} pid=${who.pid}/>`;
  const tabs = [{ value: 'posts', label: 'Θέσεις' + (empty.length ? ' (' + empty.length + ')' : '') }, { value: 'check', label: mobile ? 'Έλεγχος' : 'Έλεγχος υπηρεσιών' }, { value: 'who', label: 'Ποιος κάνει τι' }, { value: 'skips', label: 'Εξαιρέσεις' + (skipN ? ' (' + skipN + ')' : '') }].concat(mobile ? [{ value: 'xl', label: 'Excel' }] : []);
  const cur = !mobile && tab === 'xl' ? 'posts' : tab;
  const emptyOn = (d: string) => { const gd = state.guards[d] || {}; let n = 0; for (const x of posts) if (!gd[x.k]) n++; return n; };
  return html`<div>
    <${PageHeader} title=${'Υπηρεσίες ' + DOW_GEN[parseD(date).getDay()] + ' ' + dm(date)} sub=${html`Κύκλος <b className="mono-lg">${dow(date)} ${dm(date)} ${dutyStartOf(state.settings)} → ${dow(addDays(date, 1))} ${dm(addDays(date, 1))} ${dutyStartOf(state.settings)}</b>`}>
      <div className="page-head__acts"><${Button} variant="outline" onClick=${() => setRules(true)} data-tip=${'Ισχύουν: ' + RULE_TXT(state.rules)}>Κανόνες<//><label className="strict-sw" data-tip=${STRICT_TXT + (opState(state) ? ' Τώρα: ' + opState(state) + '.' : '')} data-tip-side="bottom"><input type="checkbox" className="ui-check" checked=${!!state.rules.strictUnarmed} onChange=${async (e: any) => { const on = e.target.checked; const nr = { ...state.rules, strictUnarmed: on }; if (await run({ t: 'setRules', rules: nr, text: RULE_TXT(nr) }, false)) toast({ text: 'Αυστηρά Άοπλοι: ' + (on ? 'ανοιχτό. Ισχύει στην αυτόματη συμπλήρωση και στο «Επόμενος».' : 'κλειστό, κανονική σειρά.') }); }}/>Αυστηρά Άοπλοι</label><${Button} disabled=${!!afWhy} why=${afWhy} onClick=${autofill} data-tip="Γεμίζει τις κενές θέσεις μόνο με όσους επιτρέπουν οι κανόνες. Σειρά: αργίες (Πέμπτη-Παρασκευή κρατά στην άκρη όσους χρωστάνε ΣΚ), μέρες χωρίς υπηρεσία, λιγότερες υπηρεσίες· από όσους είναι η σειρά τους, η υπηρεσία πάει σε όποιον δεν την έχει κάνει (εναλλαγή υπηρεσιών), μετά κλήρωση. Λεπτομέρειες στο «Κανόνες»." data-tip-side="left">Αυτόματη συμπλήρωση<//>${!mobile && html`<${Button} variant="outline" disabled=${!!xb} onClick=${exportX}>${xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>`}</div><//>
    <div className="guard__days"><${DateBar} value=${date} onChange=${setDate} days=${[0, 1, 2, 3, 4, 5, 6].map(i => addDays(today, i))} count=${emptyOn}/></div>
    <div style=${{ marginBottom: '14px' }}><${Tabs} value=${cur} onChange=${setTab} items=${tabs}/></div>
    ${cur === 'skips' ? html`<${SkipsView} onPerson=${setProf}/>` : cur === 'who' ? whoTab : mobile ? (cur === 'posts' ? left : cur === 'check' ? check : xl) : (cur === 'posts' ? html`<div className="guard">${left}${side}</div>` : check)}
    ${preview && html`<${Dialog} size="xl" title=${'Προεπισκόπηση · ' + fileName} description="Ό,τι βλέπεις εδώ βγαίνει ίδιο στο Excel." onClose=${() => setPreview(false)}
      footer=${html`<${Button} variant="outline" onClick=${() => setPreview(false)}>Κλείσε<//><${PrintButton} kind="froura" date=${date} label="η κατάσταση υπηρεσιών" variant="outline"/><${Button} disabled=${!!xb} onClick=${exportX}>${xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>`}>${sheet()}<//>`}
    ${rules && html`<${RulesDialog} onClose=${() => setRules(false)}/>`}
    ${fixedOpen && html`<${FixedDialog} onClose=${() => setFixedOpen(false)}/>`}${addOpen && html`<${AddBlockDialog} onClose=${() => setAddOpen(false)}/>`}
    ${force && html`<${Dialog} title=${force.swapWith ? 'Ανταλλαγή παρά τον κανόνα;' : force.move ? shortName(force.p) + ' είναι ήδη σε άλλη θέση' : 'Βάλε τον ' + shortName(force.p) + ' παρά τον κανόνα;'} description=${force.why} onClose=${() => setForce(null)}
      footer=${html`<${Button} variant="outline" onClick=${() => setForce(null)}>Άκυρο<//>${force.move
        ? html`<${Button} variant="outline" disabled=${!force.reason.trim()} why="Γράψε πρώτα την αιτία" onClick=${async () => { const f = force; setForce(null); await assign(f.k, f.p.id, g[f.k], f.reason.trim()); }} data-tip="Μένει και στην άλλη θέση">Και στις δύο<//><${Button} onClick=${async () => { const f = force; setForce(null); await assign(f.k, f.p.id, g[f.k], f.reason.trim() || undefined, f.move); }}>Μετακίνησέ τον εδώ<//>`
        : html`<${Why} text=${!force.reason.trim() && 'Λείπει: Αιτία'}/><${Button} disabled=${!force.reason.trim()} why="Λείπει: Αιτία" onClick=${async () => { const f = force; setForce(null); if (f.swapWith) await swap(f.k, f.swapWith, f.reason.trim()); else await assign(f.k, f.p.id, g[f.k], f.reason.trim()); }}>${force.swapWith ? 'Ανταλλαγή' : 'Βάλ\' τον'}<//>`}`}>
      <p style=${{ marginTop: 0 }}>${force.move ? 'Μετακίνησέ τον εδώ (η άλλη θέση μένει κενή) ή βάλ\' τον και στις δύο, με αιτία.' : 'Ο κανόνας λέει όχι. Αν χρειάζεται (π.χ. ΣΚ, άλλος αρρώστησε), γράψε γιατί. Γράφεται στο Ιστορικό και η θέση φαίνεται με ⚠.'}</p>
      <div className="field"><label className="field__label" htmlFor="frc">${force.move ? 'Αιτία (μόνο για «Και στις δύο» ή αν ο κανόνας λέει όχι)' : 'Αιτία *'}</label><input id="frc" className="ui-input" data-autofocus="" placeholder="π.χ. αλλαγή με συνάδελφο, εντολή λοχία" value=${force.reason} onChange=${(e: any) => setForce({ ...force, reason: e.target.value })}/></div>
    <//>`}
  </div>`;
}

// Νέα υπηρεσία (γραφέας, 10/10): σκοπιά, πύλη, ΤΑΕ ή ό,τι άλλο. Μπαίνει στο έντυπο που ισχύει, σε δική της γραμμή.
// Μόνιμος Λ/Υ και Δ/Υ (λοχίας, 10/10): μπαίνουν μόνοι τους κάθε μέρα, εκτός σειράς· η αλλαγή για μία μέρα γίνεται με «Αλλαγή»
function FixedLine({ onEdit }: P) {
  const { state } = useStore(); const pm = personMap(state.people); const f = state.settings.fixed || {};
  const nm = (id?: number) => (id && pm.get(id) ? shortName(pm.get(id)!) : '—');
  return html`<div className="fixedline"><span>Μόνιμοι: Λ/Υ <b>${nm(f.ly)}</b> · Δ/Υ <b>${nm(f.dy)}</b></span><${Button} size="sm" variant="ghost" onClick=${onEdit} data-tip="Μπαίνουν μόνοι τους κάθε μέρα, εκτός σειράς δικαιοσύνης. Για μία μέρα άλλαξέ τους με «Αλλαγή» στη θέση· ο αντικαταστάτης μετρά υπηρεσία κανονικά.">${f.ly || f.dy ? 'Άλλαξε' : 'Όρισε μόνιμους'}<//></div>`;
}
export function FixedDialog({ onClose }: P) {
  const { state, run } = useStore(); const toast = useToast(); const pm = personMap(state.people);
  const [f, setF] = useState<{ ly?: number; dy?: number }>({ ...(state.settings.fixed || {}) });
  const row = (k: 'ly' | 'dy', label: string) => html`<div className="field"><label className="field__label" htmlFor=${'fx-' + k}>${label}</label>
    ${f[k] && pm.get(f[k]!) ? html`<div className="fixedline"><b>${shortName(pm.get(f[k]!)!)}</b><${Button} size="sm" variant="ghost" onClick=${() => setF({ ...f, [k]: undefined })}>Κανένας<//></div>` :
      html`<${PersonPicker} id=${'fx-' + k} value=${null} onChange=${(id: number) => setF({ ...f, [k]: id })} unavailable=${(p: Person) => (!p.active ? 'Εκτός δύναμης' : p.id === f[k === 'ly' ? 'dy' : 'ly'] ? 'Ήδη μόνιμος' : null)}/>`}</div>`;
  const save = async () => {
    const fixed: { ly?: number; dy?: number } = {}; if (f.ly) fixed.ly = f.ly; if (f.dy) fixed.dy = f.dy;
    const txt = 'μόνιμος Λ/Υ ' + (fixed.ly ? shortName(pm.get(fixed.ly)!) : 'κανένας') + ', Δ/Υ ' + (fixed.dy ? shortName(pm.get(fixed.dy)!) : 'κανένας');
    if (await run({ t: 'setSettings', settings: { fixed }, text: txt }, false)) { onClose(); toast({ text: 'Αποθηκεύτηκε: ' + txt + '. Μπαίνουν μόνοι τους με την αυτόματη συμπλήρωση.' }); }
  };
  return html`<${Dialog} title="Μόνιμοι Λ/Υ και Δ/Υ" description="Μπαίνουν μόνοι τους κάθε μέρα και δεν μπαίνουν στη σειρά για άλλες υπηρεσίες. Αν λείπει κάποιος, η θέση γεμίζει με τη σειρά. Για μία μέρα, άλλαξέ τον με «Αλλαγή» στη θέση." onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
    ${row('ly', 'Λ/Υ')}${row('dy', 'Δ/Υ')}
  <//>`;
}
// Έντυπο υπηρεσιών (Michael, 22/10): λίστα με ΣΒΕΝ, ΣΠΕΝ και τα δικά σου, και στο τέλος «Νέο έντυπο υπηρεσιών…»
const PHASE_TIP: Record<string, string> = { sven: '2 πίνακες θαλαμοφυλάκων και μαγειρεία', spen: 'Θαλαμοφύλακες, οπλοφύλακες, σκοποί, ΤΑΕ, μαγειρεία' };
const NEW_PHASE = '__new';
export function PhaseSelect({ value, onChange, prefix = '', id }: { value: Phase; onChange: (v: Phase) => void; prefix?: string; id?: string }) {
  const { state } = useStore(); const [add, setAdd] = useState(false);
  const list = phaseList(state.settings); const cur = list.find(x => x.id === value) || list[0];
  const tip = cur.custom ? 'Δικό σου έντυπο υπηρεσιών, βγαίνει στο Excel με το έντυπο της ' + PHASE_NAME[cur.base] : PHASE_TIP[cur.id];
  return html`<${Select} id=${id} className="ui-select" aria-label="Έντυπο υπηρεσιών" data-tip=${tip} value=${cur.id} onChange=${(e: any) => (e.target.value === NEW_PHASE ? setAdd(true) : onChange(e.target.value))}>
    ${list.map(x => html`<option key=${x.id} value=${x.id}>${prefix + x.name}</option>`)}<option value=${NEW_PHASE} data-keep>+ Νέο έντυπο υπηρεσιών…</option><//>
    ${add && html`<${PhaseDialog} from=${cur.id} onClose=${(nid?: Phase) => { setAdd(false); if (nid) onChange(nid); }}/>`}`;
}
// Νέο έντυπο υπηρεσιών (αντίγραφο ενός άλλου) ή μετονομασία δικού σου (edit = το id του)
export function PhaseDialog({ from, edit, onClose }: { from?: Phase; edit?: Phase; onClose: (id?: Phase) => void }) {
  const { state, run } = useStore(); const toast = useToast();
  const list = phaseList(state.settings); const mine = edit ? list.find(x => x.id === edit) : undefined;
  const [name, setName] = useState(mine ? mine.name : ''); const [src, setSrc] = useState<Phase>(from && list.some(x => x.id === from) ? from : 'sven');
  const dirty = useDirty([name, src]);
  const save = async () => {
    const before = new Set((state.settings.phases || []).map(x => x.id));
    const ns = await run(edit ? { t: 'renamePhase', id: edit, name } : { t: 'addPhase', name, from: src }, false); if (!ns) return;
    const nid = edit ? undefined : (ns.settings.phases || []).find(x => !before.has(x.id))?.id;
    toast({ text: edit ? 'Άλλαξε το όνομα' : 'Προστέθηκε η ΦΡΟΥΡΑ ' + phaseName(ns.settings, nid) + ': έχει τις υπηρεσίες της ' + phaseName(state.settings, src) + ', άλλαξέ τες στις Ρυθμίσεις › Υπηρεσίες' });
    onClose(nid);
  };
  const why = !name.trim() ? 'Λείπει: Όνομα' : '';
  return html`<${Dialog} title=${edit ? 'Όνομα: ΦΡΟΥΡΑ ' + mine!.name : 'Νέο έντυπο υπηρεσιών'} description=${edit ? 'Γράφεται στο όνομα του Excel και στη λίστα.' : 'Ξεκινά με τις υπηρεσίες και τις θέσεις ενός άλλου εντύπου· μετά τις αλλάζεις χωριστά (Ρυθμίσεις › Υπηρεσίες). Οι κοινές θέσεις κρατούν το ιστορικό τους.'} onClose=${() => onClose()}
    dirty=${dirty && (edit ? 'Το όνομα δεν άλλαξε. Αν κλείσεις, χάνεται.' : 'Το έντυπο δεν προστέθηκε. Αν κλείσεις, χάνεται.')}
    footer=${html`<${Why} text=${why}/><${Button} variant="outline" onClick=${() => onClose()}>Άκυρο<//><${Button} disabled=${!!why} why=${why} onClick=${save}>${edit ? 'Αποθήκευση' : 'Προσθήκη'}<//>`}>
    <div className="field"><label className="field__label" htmlFor="ph-n">Όνομα *</label><div style=${{ display: 'flex', alignItems: 'center', gap: '6px' }}><span className="muted">ΦΡΟΥΡΑ</span><input id="ph-n" className="ui-input" data-autofocus="" placeholder="π.χ. ΑΣΚΗΣΗ, ΣΠΕΝ 2" value=${name} onChange=${(e: any) => setName(e.target.value)}/></div>
      <span className="field__help">Με κεφαλαία, όπως στο Excel (π.χ. «ΦΡΟΥΡΑ ΑΣΚΗΣΗ 22-10-2026.xlsx»).</span></div>
    ${!edit && html`<div className="field"><label className="field__label" htmlFor="ph-f">Αντίγραφο του</label><${Select} id="ph-f" className="ui-input" value=${src} onChange=${(e: any) => setSrc(e.target.value)}>${list.map(x => html`<option key=${x.id} value=${x.id}>${'ΦΡΟΥΡΑ ' + x.name}</option>`)}<//>
      <span className="field__help">Βγαίνει στο Excel με το έντυπο της ${PHASE_NAME[phaseBase(state.settings, src)]}: ίδια κελιά για τις υπηρεσίες του, και οι υπόλοιπες σε δικούς τους πίνακες από κάτω.</span></div>`}
  <//>`;
}
export function AddBlockDialog({ onClose, phase: ph }: P) {
  const { state, run } = useStore(); const toast = useToast(); const nav = useNav();
  const phase: Phase = ph || state.settings.phase || 'sven'; const now = phase === (state.settings.phase || 'sven');
  const [f, setF] = useState({ name: '', armed: false, n: 1, hrs: '', off: false });
  const [mode, setMode] = useState<HoursMode>('day'); const [sh, setSh] = useState({ every: 120, from: '', to: '' }); const dirty = useDirty([f, mode, sh]);
  const save = async () => { if (await run({ t: 'addBlock', phase, ...f, hrs: mode === 'fixed' ? f.hrs : '', shift: mode === 'shift' ? shiftOf(sh) : null }, false)) { onClose(); toast({ text: 'Προστέθηκε: ' + f.name + (f.off ? '. Είναι ανενεργή: την ενεργοποιείς στις Ρυθμίσεις › Υπηρεσίες.' : now ? '. Τη βλέπεις στις θέσεις και στο έντυπο.' : '. Τη βλέπεις όταν ισχύει η ΦΡΟΥΡΑ ' + phaseName(state.settings, phase) + '.'), ...(f.off ? { actions: [{ label: 'Άνοιξε', fn: () => nav.go('templates', { tab: 'duty', dsub: 'blocks' }) }] } : {}) }); } };
  const nbWhy = !f.name.trim() ? 'Λείπει: Όνομα' : mode === 'shift' && shiftBad(sh) ? 'Οι βάρδιες δεν είναι σωστές' : '';
  return html`<${Dialog} title="Νέα υπηρεσία" description=${'Στη ΦΡΟΥΡΑ ' + phaseName(state.settings, phase) + '. Βγαίνει στο Excel σε δική της γραμμή κάτω από τα μαγειρεία.'} onClose=${onClose}
    dirty=${dirty && 'Η υπηρεσία δεν προστέθηκε. Αν κλείσεις, χάνεται.'}
    footer=${html`<${Why} text=${nbWhy}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!!nbWhy} why=${nbWhy} onClick=${save}>Προσθήκη<//>`}>
    <div className="field"><label className="field__label" htmlFor="nb-n">Όνομα *</label><input id="nb-n" className="ui-input" data-autofocus="" placeholder="π.χ. Πύλη, Σκοπιά ΤΑΕ" value=${f.name} onChange=${(e: any) => setF({ ...f, name: e.target.value })}/></div>
    <div className="field"><label className="field__label" htmlFor="nb-c">Πόσα άτομα</label><input id="nb-c" type="number" min="1" max="10" className="ui-input" style=${{ maxWidth: '120px' }} value=${f.n} onChange=${(e: any) => setF({ ...f, n: Math.max(1, Math.min(10, +e.target.value || 1)) })}/></div>
    <p className="field__help" style=${{ marginTop: 0 }}>${f.name.trim() ? html`Η «${f.name.trim()}»` : 'Η νέα υπηρεσία'} μετρά ως δική της: δική της στήλη στον Έλεγχο υπηρεσιών, στη σειρά δικαιοσύνης, στο «Ποιος κάνει τι» και στο Excel δυνατοτήτων, όπου την ενεργοποιείς ή απενεργοποιείς για τον καθένα χωριστά.</p>
    <${HoursField} id="nb" mode=${mode} setMode=${setMode} sh=${sh} setSh=${setSh} labels=${Array.from({ length: f.n }, (_, i) => (i + 1) + 'ος')} start=${dutyStartOf(state.settings)}
      fixed=${html`<${RangeField} id="nb-h" aria-label="Ώρες" placeholder="π.χ. 08:00-20:00" value=${f.hrs} onChange=${(e: any) => setF({ ...f, hrs: e.target.value })}/>`}/>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${f.armed} onChange=${(e: any) => setF({ ...f, armed: e.target.checked })}/><span><b>Ένοπλη</b><small>Δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ, ούτε οι άοπλοι (Σ.Ι.). Ποια Σ.Ι. μπαίνουν σε κάθε υπηρεσία το ρυθμίζεις στις <${GoLink} view="templates" params=${{ tab: 'duty', dsub: 'si' }}>Ρυθμίσεις › Σ.Ι.<//></small></span></label>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${!f.off} onChange=${(e: any) => setF({ ...f, off: !e.target.checked })}/><span><b>Ενεργή</b><small>Ανενεργή δεν μπαίνει στις θέσεις, στην αυτόματη συμπλήρωση και στο έντυπο, ώσπου να την ενεργοποιήσεις στις <${GoLink} view="templates" params=${{ tab: 'duty', dsub: 'blocks' }}>Ρυθμίσεις › Υπηρεσίες<//>.</small></span></label>
  <//>`;
}

/* features/outs · Εξοδούχοι και ΔΝ (Κ-06 έως Κ-09, Κ-16) */
const OUT_OPTS = [{ value: '', label: 'Μένει' }, { value: 'OUT', label: 'Έξοδος' }, { value: 'DN', label: 'ΔΝ' }];
// Σάββατο: και «ΔΝ ΣΚ» = ΔΝ σήμερα και ΔΝ την Κυριακή (Michael, 18/10, 24/10)
const OUT_OPTS_SAT = [...OUT_OPTS, { value: 'DNSK', label: 'ΔΝ ΣΚ' }];
type OutVal = TypeKey | 'DNSK';
const DNSK_TIP = 'ΔΝ το Σάββατο και ΔΝ την Κυριακή (μπαίνει μόνη της). Αν την Κυριακή έχει υπηρεσία ή κάτι τον κρατά μέσα, μένει μόνο η ΔΝ του Σαββάτου και γυρίζει Κυριακή πρωί· αν ξεκινά άδεια, φεύγει για άδεια.';
const valLbl = (v: OutVal | null | undefined) => (v === 'DNSK' ? 'ΔΝ ΣΚ' : v ? TYPES[v].label : 'Μένει');
const valTone = (v: OutVal) => TYPES[v === 'DNSK' ? 'DN' : v].tone;
// 1–4 αν είναι συνεχόμενοι, αλλιώς 1, 3, 5 (Ρυθμίσεις › Θάλαμοι και ουλαμοί)
const roomsTxt = (rs: number[]) => (rs.length > 2 && rs[rs.length - 1] - rs[0] === rs.length - 1 ? rs[0] + '–' + rs[rs.length - 1] : rs.join(', '));
// Όποιος δεν βγαίνει σύμφωνα με τους κανόνες (υπηρεσία, ποινή, ΕΥ…) ή δεν έχει δικαίωμα ΔΝ επιλέγεται κι αυτός, με
// προειδοποίηση· στην αποθήκευση ζητείται επιβεβαίωση (Michael, 17/10: ποτέ πλήρες μπλοκάρισμα)
// sun: ΔΝ ΣΚ και την Κυριακή κάτι τον κρατά (υπηρεσία, ποινή…): γυρίζει Κυριακή πρωί, ή ξεκινά άδεια (leave)· wkNote: «από ΔΝ ΣΚ» την Κυριακή
// note: παρατήρηση της μέρας, γράφεται σε παρένθεση δίπλα στην κατάσταση («ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)», Michael 18/10)
const OutRow = memo(function OutRow({ p, unit, style, reason, value, changed, onSet, onOpen, noDn, sat, sun, wkNote, note, onNote }: P) {
  return html`<div className=${cx('orow', changed && 'is-changed', reason && 'is-blocked')} style=${style}>
    <div><button type="button" className="linkish" onClick=${() => onOpen(p.id)}><b>${fullName(p)}</b></button><small>${roomTxt(p)} · ${unit}${p.dn ? ' · δικαίωμα ΔΝ' : ''}${wkNote && ' · από ΔΝ ΣΚ'}${reason && html` · <span className="orow__warn" data-tip="Σύμφωνα με τους κανόνες δεν βγαίνει έξοδο· αν τον βγάλεις, θα ζητηθεί επιβεβαίωση">⚠ ${reason}</span>`}${value === 'DNSK' && sun && html` · <span className="orow__warn" data-tip=${sun.leave ? 'Την Κυριακή ξεκινά η άδειά του: μένει μόνο η ΔΝ του Σαββάτου' : 'Την Κυριακή δεν μπαίνει ΔΝ: μένει μόνο η ΔΝ του Σαββάτου'}>Κυριακή: ${sun.why}${sun.leave ? '' : ', γυρίζει Κυριακή πρωί'}</span>`}</small></div>
    <input className="ui-input orow__note" aria-label=${'Παρατήρηση ' + fullName(p)} placeholder="Παρατήρηση" data-tip="Προαιρετική. Γράφεται σε παρένθεση δίπλα στην κατάσταση, π.χ. «ΔΝ (ΙΑΤΡΟΣ ΣΤΕΠ)», και στο Excel" value=${note} onChange=${(e: any) => onNote(p.id, e.target.value)}/>
    <div className="ui-seg ui-seg--sm" role="group" aria-label=${'Έξοδος ' + fullName(p)}>${(sat ? OUT_OPTS_SAT : OUT_OPTS).map(o => { const warn = o.value && reason ? 'Δεν βγαίνει έξοδο (' + reason + '): θα ζητηθεί επιβεβαίωση' : (o.value === 'DN' || o.value === 'DNSK') && noDn ? 'Δεν έχει δικαίωμα ΔΝ: θα ζητηθεί επιβεβαίωση' : undefined; return html`<button key=${o.value} type="button" className=${warn ? 'is-warn' : undefined} data-tip=${warn || (o.value === 'DNSK' ? DNSK_TIP : undefined)} aria-pressed=${(value || '') === o.value} onClick=${() => onSet(p.id, o.value || null)}>${o.label}${warn ? ' ⚠' : ''}</button>`; })}</div>
  </div>`;
});
// Ποιοι λείπουν τη μέρα d και πότε πρέπει να γυρίσουν, ανά μέρα επιστροφής· πρώτοι όσοι γυρίζουν για υπηρεσία
export function ReturnsList({ date, limit }: { date: string; limit?: number }) {
  const { state } = useStore(); const nav = useNav();
  const list = useMemo(() => returnsOn(state, date), [state, date]);
  if (!list.length) return html`<div className="empty">Κανείς δεν λείπει.</div>`;
  const shown = limit ? list.slice(0, limit) : list;
  const days = [...new Set(shown.map(backDay))];
  return html`<div className="backs">${days.map(d => html`<div key=${d}><div className="backs__day">${d}</div><ul className="rows">${shown.filter(b => backDay(b) === d).map(b => html`<li key=${b.p.id}><button type="button" className="linkish" onClick=${() => nav.openPerson(b.p.id)}>${shortName(b.p)}</button><span className=${b.duty ? 'txt-bad' : 'muted'}><${Badge} tone=${TYPES[b.st.type].tone} className="tag">${TYPES[b.st.type].cat === 'out' ? outLbl(b.st) : statusLbl(b.st, state.settings.lists)}<//> ${backWhen(b)}</span></li>`)}</ul></div>`)}
    ${limit && list.length > limit && html`<p className="note rows__more">Και άλλοι ${list.length - limit} στους Εξοδούχους.</p>`}</div>`;
}
const NO_NOTES: Record<number, string> = {};
export function OutsScreen() {
  const { state, run, today, tomorrow, undoMark } = useStore(); const toast = useToast(); const nav = useNav(); const mobile = useMedia('(max-width: 767px)');
  const date = nav.params.outDate || today;
  const nextDow = (w: number) => { for (let i = 0; i < 7; i++) { const d = addDays(today, i); if (parseD(d).getDay() === w) return d; } return today; };
  const outDays = [...new Set([today, tomorrow, nextDow(6), nextDow(0)])].sort();
  const rooms = outRoomsOn(state.rules, date);
  const people = activePeople(state);
  const sat = isSat(date);
  const saved = useMemo(() => { const m: Record<number, OutVal> = {}; state.statuses.forEach(s => { if (TYPES[s.type].cat === 'out' && s.from <= date && date <= s.to) m[s.pid] = sat && s.type === 'DN' && isWk(s) ? 'DNSK' : s.type; }); return m; }, [state.statuses, date]);
  // την Κυριακή: όσοι μπήκαν μόνοι τους από τη ΔΝ ΣΚ του Σαββάτου
  const wkSun = useMemo(() => new Set(sat ? [] : state.statuses.filter(s => isWk(s) && s.from <= date && date <= s.to).map(s => s.pid)), [state.statuses, date, sat]);
  const savedNotes = state.outNotes?.[date] || NO_NOTES;
  const [notes, setNotes] = useState<Record<number, string>>(savedNotes);
  useEffect(() => setNotes(savedNotes), [savedNotes]);
  const [draft, setDraft] = useState(saved);
  // άλλη μέρα: από την αρχή. Ίδια μέρα και άλλαξαν οι καταστάσεις αλλού (δήλωση, ανάγνωση από Excel): ό,τι άλλαξες εδώ
  // και δεν άλλαξε αλλού μένει στο πρόχειρο, αντί να χαθεί
  const last = useRef({ saved, date });
  useEffect(() => {
    const old = last.current; last.current = { saved, date };
    if (old.date !== date) { setDraft(saved); return; }
    if (old.saved === saved) return;
    setDraft(d => {
      const n: Record<number, OutVal> = { ...saved };
      for (const id of new Set([...Object.keys(d), ...Object.keys(old.saved)].map(Number)))
        if ((old.saved[id] || null) === (saved[id] || null) && (d[id] || null) !== (old.saved[id] || null)) { if (d[id]) n[id] = d[id]; else delete n[id]; }
      return n;
    });
  }, [saved, date]);
  const [filter, setFilter] = useState('all'); const [q, setQ] = useState(''); const dq = useDeferredValue(q); const [confirm, setConfirm] = useState(false);
  const [room, setRoom] = useState<number | null>(null); const [sort, setSort] = useState('room');
  const roomList = useMemo(() => [...new Set(people.map(p => p.room).filter((r): r is number => r != null))].sort((a, b) => a - b), [people]);
  const dnSet = people.some(p => p.dn);   // μόλις οριστεί σε κάποιον, ΔΝ μόνο όσοι έχουν δικαίωμα
  const reasons = useMemo(() => { const m: Record<number, string | null> = {}; people.forEach(p => { m[p.id] = outBlock(state, date, p.id); }); return m; }, [state, date]);
  const rows = useMemo(() => {
    const r = searchPeople(state.people, dq).filter(p => p.active && (room == null || p.room === room) && (filter === 'all' || (filter === 'can' ? !reasons[p.id] : filter === 'cant' ? !!reasons[p.id] : !!draft[p.id])));
    return sort === 'room' && !dq ? [...r].sort((a, b) => (a.room ?? 99) - (b.room ?? 99) || collator.compare(a.last, b.last) || collator.compare(a.first, b.first)) : r;
  }, [dq, filter, reasons, draft, state.people, room, sort]);
  const diffs = useMemo(() => people.filter(p => (saved[p.id] || null) !== (draft[p.id] || null)).map(p => ({ pid: p.id, from: saved[p.id] || null, to: draft[p.id] || null })), [saved, draft, people]);
  const noteChanges = useMemo(() => [...new Set([...Object.keys(notes), ...Object.keys(savedNotes)].map(Number))].filter(pid => (notes[pid] || '').trim() !== (savedNotes[pid] || '')).map(pid => ({ pid, note: (notes[pid] || '').trim() })), [notes, savedNotes]);
  const changes = useMemo(() => diffs.map(c => ({ pid: c.pid, from: c.from === 'DNSK' ? 'DN' as TypeKey : c.from, to: c.to === 'DNSK' ? 'DN' as TypeKey : c.to, ...(c.to === 'DNSK' ? { wk: true } : {}) })), [diffs]);
  const nChanges = diffs.length + noteChanges.length;
  // ΔΝ ΣΚ: τι τον κρατά μέσα την Κυριακή (υπηρεσία, ποινή…), οπότε δεν μπαίνει στους εξοδούχους της Κυριακής
  const sunday = addDays(date, 1);
  // ή ξεκινά άδεια (leave): τότε φεύγει, δεν γυρίζει
  const sunWhy = useCallback((pid: number): { why: string; leave: boolean } | null => {
    if (!sat) return null;
    const lv = state.statuses.find(x => x.pid === pid && TYPES[x.type].cat === 'abs' && x.from === sunday);
    if (lv) return { why: 'ξεκινά ' + statusLbl(lv, state.settings.lists), leave: true };
    const d = dutyAt(state, sunday, pid); const why = d ? d.label + (d.time ? ' από ' + d.time : '') : outBlock(state, sunday, pid);
    return why ? { why, leave: false } : null;
  }, [state, sat, sunday]);
  const backs = useMemo(() => returnsOn(state, date), [state, date]);
  const backEarly = backs.some(b => b.duty), backN = backs.length;
  const cnt = (t: string) => Object.keys(draft).filter(k => (draft as P)[k] === t).length;
  const blockedN = people.filter(p => reasons[p.id]).length;
  const stayN = people.filter(p => !draft[p.id] && !statusesFrom(state.statuses, p.id, date, outMin(state.rules)).some(s => TYPES[s.type].away && TYPES[s.type].cat !== 'out')).length;
  const set = useCallback((pid: number, v: OutVal | null) => setDraft(d => { const n = { ...d }; if (v) n[pid] = v; else delete n[pid]; return n; }), []);
  const setNote = useCallback((pid: number, v: string) => setNotes(d => ({ ...d, [pid]: v })), []);
  const open = useOpenFrom(rows);
  const byRooms = () => {
    if (!rooms) return;
    const n: Record<number, OutVal> = {}; people.forEach(p => { if (p.room != null && rooms.includes(p.room) && !reasons[p.id]) n[p.id] = draft[p.id] === 'DN' || draft[p.id] === 'DNSK' ? draft[p.id] : 'OUT'; }); setDraft(n);
    const kept = people.filter(p => p.room != null && rooms.includes(p.room) && reasons[p.id]).length;
    toast({ text: 'Πρόταση: θάλαμοι ' + roomsTxt(rooms) + ' έξω (' + Object.keys(n).length + '). ' + kept + ' από αυτούς μένουν λόγω κανόνων και μπαίνουν στους Παραμένοντες.' });
  };
  const allCan = () => setDraft(d => { const n = { ...d }; people.forEach(p => { if (!reasons[p.id] && !n[p.id] && (room == null || p.room === room)) n[p.id] = 'OUT'; }); return n; });
  const height = useViewportHeight(mobile ? 380 : 330);
  const c0 = strengthOf(state, date, outMin(state.rules));   // «Παρόντες απόψε»: από την ώρα εξόδου
  const awayDelta = diffs.reduce((a, c) => a + (c.to ? 1 : 0) - (c.from ? 1 : 0), 0);
  // όσοι βγαίνουν παρά τους κανόνες ή με ΔΝ χωρίς δικαίωμα: φαίνονται στο «Τι θα αλλάξει» και η αποθήκευση τους επιβεβαιώνει
  const pmO = useMemo(() => personMap(state.people), [state.people]);
  const warns = changes.filter(c => c.to && (reasons[c.pid] || (c.to === 'DN' && dnSet && !pmO.get(c.pid)?.dn))).map(c => ({ pid: c.pid, why: reasons[c.pid] || 'χωρίς δικαίωμα ΔΝ' }));
  // ΔΝ ΣΚ που γυρίζουν Κυριακή πρωί (υπηρεσία ή κάτι άλλο την Κυριακή)
  const sunBack = diffs.filter(c => c.to === 'DNSK').map(c => ({ pid: c.pid, ...sunWhy(c.pid)! })).filter(x => x.why);
  const sunBackOnly = sunBack.filter(x => !x.leave), sunLeave = sunBack.filter(x => x.leave);
  const save = async () => { if (await run({ t: 'outs', date, changes, notes: noteChanges.length ? noteChanges : undefined, force: warns.length > 0 || undefined }, false)) { setConfirm(false); toast({ text: 'Αποθηκεύτηκαν οι εξοδούχοι ' + dm(date) + ' (' + nChanges + ' αλλαγές)' + (sunBackOnly.length ? '. Γυρίζουν Κυριακή πρωί: ' + sunBackOnly.map(x => shortName(pmO.get(x.pid)!)).join(', ') : '') + (sunLeave.length ? '. Άδεια από Κυριακή: ' + sunLeave.map(x => shortName(pmO.get(x.pid)!)).join(', ') : ''), actions: [undoMark()] }); } };
  const rh = useRowH(mobile ? 136 : 52, mobile ? 136 : 44);
  // Βραδινή εκπαίδευση (Michael, 13/10): η μέρα δεν μετρά στη στέρηση εξόδου κανενός· η λήξη τους μετακινείται μόνη της
  const night = !!state.nightTraining?.[date];
  const setNight = async (on: boolean) => {
    const before = new Map(state.statuses.filter(isDeprivation).map(x => [x.id, x.to]));
    const next = await run({ t: 'setNightTraining', date, on }, false); if (!next) return;
    const pm = personMap(next.people);
    const moved = next.statuses.filter(x => before.has(x.id) && before.get(x.id) !== x.to).map(x => shortName(pm.get(x.pid)!) + ' ως ' + dm(x.to));
    toast({ text: (on ? 'Βραδινή εκπαίδευση ' : 'Χωρίς βραδινή εκπαίδευση ') + dayName(date, today).toLowerCase() + ' ' + dm(date) + '. ' + (moved.length ? 'Στέρηση εξόδου: ' + moved.join(', ') + '.' : on ? 'Δεν μετρά στη στέρηση εξόδου.' : ''), actions: [undoMark()] });
  };
  const NIGHT_TIP = 'Όταν έχει βραδινή εκπαίδευση, η μέρα δεν μετρά στη στέρηση εξόδου (όπως και οι μέρες με υπηρεσία): η λήξη μετακινείται μία μέρα. Δεν αλλάζει τους εξοδούχους.';
  return html`<div>
    <${PageHeader} title=${'Εξοδούχοι ' + DOW_GEN[parseD(date).getDay()] + ' ' + dmy(date)} sub="Διάλεξε ποιοι βγαίνουν και ποιοι με ΔΝ· όσοι έχουν ⚠ βγαίνουν μόνο με επιβεβαίωση."><div className="page-head__acts"><${DateBar} value=${date} onChange=${(d: string) => nav.set({ outDate: d })} days=${outDays}/><label className="strict-sw" data-tip=${NIGHT_TIP} data-tip-side="bottom"><input type="checkbox" className="ui-check" checked=${night} onChange=${(e: any) => setNight(e.target.checked)}/>Βραδινή εκπαίδευση</label></div><//>
    ${rooms ? html`<${Alert} tone="info"><span>${parseD(date).getDay() === 6 ? 'Σάββατο' : 'Κυριακή'}: βγαίνουν οι <b>θάλαμοι ${roomsTxt(rooms)}</b>, μένουν οι υπόλοιποι (Κ-16). <${Button} size="sm" variant="secondary" onClick=${byRooms}>Πρότεινε θαλάμους ${roomsTxt(rooms)}<//></span><//>` : null}
    <details className="note backs-box"><summary>Ποιοι γυρίζουν και πότε <span className="cnt">${backN}</span>${backEarly ? html` <${Badge} tone="bad">κάποιοι για υπηρεσία<//>` : null}</summary><${ReturnsList} date=${date}/></details>
    <div className="bulkbar outbar"><span>Έξοδος <b>${cnt('OUT')}</b> · ΔΝ <b>${cnt('DN')}</b>${sat ? html` · ΔΝ ΣΚ <b>${cnt('DNSK')}</b>` : null} · Παραμένοντες <b>${stayN}</b> <span className="muted">(${blockedN} λόγω κανόνων)</span></span>
      ${nChanges ? html`<${Button} size="sm" variant="ghost" onClick=${() => { setDraft(saved); setNotes(savedNotes); }}>Ακύρωση<//><${Button} size="sm" onClick=${() => setConfirm(true)}>Αποθήκευση (${nChanges})<//>` : html`<${Button} size="sm" variant="secondary" onClick=${allCan} data-tip="Βάζει «Έξοδος» σε όλους όσοι επιτρέπεται και δεν έχουν ήδη επιλογή">${room == null ? 'Όλοι όσοι μπορούν: έξοδος' : 'Θάλαμος ' + room + ': όσοι μπορούν έξοδος'}<//>`}
      <span className="outbar__xl">${nChanges > 0 ? html`<span className="note">Αποθήκευσε πρώτα για Excel.</span>` : html`<${ExportButton} kind="outs" date=${date} label="οι εξοδούχοι και παραμένοντες" variant="outline" size="sm"/>`}</span></div>
    <div className="toolbar"><${Strip} className="chips" role="group" aria-label="Θάλαμος"><button type="button" className="ui-chip" aria-pressed=${room == null} onClick=${() => setRoom(null)}>Όλοι οι θάλαμοι</button>${roomList.map(r => { const n = people.filter(p => p.room === r); const out = n.filter(p => draft[p.id]).length; return html`<button key=${r} type="button" className="ui-chip" aria-pressed=${room === r} onClick=${() => setRoom(room === r ? null : r)} data-tip=${out + ' από ' + n.length + ' βγαίνουν'}>Θ${r}<span className="cnt">${out}/${n.length}</span></button>`; })}<//>
      <${Segmented} small=${true} value=${sort} onChange=${setSort} items=${[{ value: 'room', label: 'Ανά θάλαμο' }, { value: 'name', label: 'Αλφαβητικά' }]}/></div>
    <div className="toolbar outs__find"><input type="search" className="ui-input" aria-label="Αναζήτηση" placeholder="Επώνυμο ή όνομα (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/><${Strip} className="chips" role="group" aria-label="Φίλτρα">${[['all', 'Όλοι', people.length], ['can', 'Μπορούν να βγουν', people.length - blockedN], ['cant', 'Δεν μπορούν', blockedN], ['sel', 'Επιλεγμένοι', cnt('OUT') + cnt('DN') + cnt('DNSK')]].map(([k, l, n]) => html`<button key=${k} type="button" className="ui-chip" aria-pressed=${filter === k} onClick=${() => setFilter(k as string)}>${l}<span className="cnt">${n}</span></button>`)}<//><${ActiveFilter} parts=${[room != null && 'Θάλαμος ' + room, filter !== 'all' && ({ can: 'Μπορούν να βγουν', cant: 'Δεν μπορούν', sel: 'Επιλεγμένοι' } as P)[filter], dq && '«' + dq + '»']} onClear=${() => { setFilter('all'); setQ(''); setRoom(null); }}/><span className="toolbar__count">${rows.length} άτομα</span></div>
    <div className="ui-card" style=${{ overflow: 'hidden' }}>${rows.length ? html`<${VirtualList} items=${rows} resetKey=${filter + '|' + dq + '|' + date + '|' + room + '|' + sort} rowHeight=${rh} height=${height} renderRow=${(p: Person, _i: number, style: P) => html`<${OutRow} key=${p.id} p=${p} unit=${unitOf(p, state.settings)} style=${style} reason=${reasons[p.id]} value=${draft[p.id]} changed=${(saved[p.id] || null) !== (draft[p.id] || null)} onSet=${set} onOpen=${open} noDn=${dnSet && !p.dn} sat=${sat} sun=${draft[p.id] === 'DNSK' ? sunWhy(p.id) : null} wkNote=${wkSun.has(p.id)} note=${notes[p.id] || ''} onNote=${setNote}/>`}/>` : html`<div className="empty">Κανείς σε αυτό το φίλτρο.</div>`}</div>
    <p className="note" style=${{ margin: '8px 0 0' }}><${TemplateNote} ids=${['outs']}/></p>
    ${confirm && html`<${Dialog} title="Τι θα αλλάξει" description=${'Εξοδούχοι ' + dayName(date, today).toLowerCase() + ' ' + dm(date)} onClose=${() => setConfirm(false)} footer=${html`<${Button} variant="outline" onClick=${() => setConfirm(false)}>Πίσω<//><${Button} onClick=${save}>${warns.length ? 'Αποθήκευση παρά τους κανόνες' : 'Αποθήκευση'}<//>`}>
      ${warns.length > 0 && html`<${Alert} tone="warn"><span><b>Παρά τους κανόνες:</b>${warns.map(w => html`<span key=${w.pid}><br/>${shortName(pmO.get(w.pid)!)}: ${w.why}</span>`)}<br/>Με την αποθήκευση το επιβεβαιώνεις.</span><//>`}
      ${sunBackOnly.length > 0 && html`<${Alert} tone="info"><span><b>ΔΝ ΣΚ, γυρίζουν Κυριακή πρωί</b> (δεν μπαίνει ΔΝ την Κυριακή):${sunBackOnly.map(x => html`<span key=${x.pid}><br/>${shortName(pmO.get(x.pid)!)}: ${x.why}</span>`)}</span><//>`}
      ${sunLeave.length > 0 && html`<${Alert} tone="info"><span><b>ΔΝ ΣΚ, ξεκινά άδεια την Κυριακή</b> (μένει μόνο η ΔΝ του Σαββάτου· γράφεται στις Παρατηρήσεις):${sunLeave.map(x => html`<span key=${x.pid}><br/>${shortName(pmO.get(x.pid)!)}: ${x.why}</span>`)}</span><//>`}
      <ul className="hist">${diffs.map(c => html`<li key=${c.pid}><b>${shortName(pmO.get(c.pid)!)}</b> <span className="muted">${valLbl(c.from)} →</span> ${c.to ? html`<${Badge} tone=${valTone(c.to)}>${valLbl(c.to)}<//>` : 'Μένει'}${c.to === 'DNSK' && !sunWhy(c.pid) ? html` <span className="muted">και ΔΝ την Κυριακή</span>` : null}</li>`)}
        ${noteChanges.map(n => html`<li key=${'n' + n.pid}><b>${shortName(pmO.get(n.pid)!)}</b> <span className="muted">παρατήρηση →</span> ${n.note ? '«' + n.note + '»' : html`<span className="muted">καμία</span>`}</li>`)}</ul>
      <p className="note" style=${{ margin: 0 }}>Παρόντες απόψε: ${c0.present} → ${c0.present - awayDelta}. Οι Παραμένοντες βγαίνουν στο Excel με τον λόγο στις Παρατηρήσεις.</p>
    <//>`}
  </div>`;
}
