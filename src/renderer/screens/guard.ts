// features/guard (Κατάσταση υπηρεσιών, έλεγχος). Οι Εξοδούχοι είναι στο pages/outs
import { RkName, rkFull, rkShort } from '../rankName';
import { HK } from '../../shared/unit';
import { useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Alert, Badge, Button, Why, Card, Dialog, Icon, PageHeader, Segmented, Tabs, VirtualList, DialogLeave, useMedia, useToast } from '../ui';
import { Select } from '../select';
import { ARM_MAX, armMargin } from '../../shared/armed';
import { RULE_TXT, strictOrderTxt, strictTxt } from '../../shared/rulesText';
import { useNav, useStore, searchPeople } from '../store';
import { ActiveFilter, DateBar, ExcelSheet, ExportButton, GoLink, PersonPicker, PrintButton, SigsButton, TemplateNote, TimeField, MonthField, useExport, useExportBusy } from '../common';
import { normTime } from '../../shared/hours';
import { frouraSheet, checkSheet } from '../sheets';
import { blockShape, groupKey, TYPES, KIND_LBL, KIND_NAME, isOutsAll, DEFAULT_NUM_ROTS, DEFAULT_STRICT_ORDER, blocksOf, everyBlock, dutyStartOf, frouraFile, phaseName, fullName, shortName, postTxt, type DutyKind, type Rules, type Person, type Phase, type Post, type TypeKey } from '../../shared/domain';
import { whyAll, fairKey, isEpop, monthTxt, lastResort, monthStats, dutyMonths, nextFor, swapCheck, capBlock, capCell, capCols, dutyBlock, dutyStats, emptyStat, guardUnavailable, holName, offDayBlock, isHol, personMap, seatMap, seatPeople, pickPeople, postOf, postsOf, ruleBlock, statusesFrom, dutyMin, DEFAULT_HK_TIME, statusWarn, activePeople, strictKeys, aheadDays } from '../../shared/rules';
import { addDays, dayName, daysBetween, dm, dmy, dow, parseD, pskDays, weekday, DOW_FULL, DOW_GEN, MONTHS } from '../../shared/dates';
import { collator, norm } from '../../shared/text';
import { statIsUnarmed, statNoDuty } from '../../shared/stat';
import { WeekTable, weekDraft, weekIssue, WEEK_ORDER, type WeekDraft } from './outsPlan';
import { live, statusLbl } from '../../shared/ranks';
import { WhoDoes } from './whodoes';
import { AddBlockDialog, PhaseSelect } from '../features/duty-blocks';
import { SkipsView } from './skips';
type P = any;

// «οπλοφύλακας: ένοπλος» όπως είναι τώρα στις Ρυθμίσεις (μόνο αν η φάση έχει οπλοφύλακες)
const opState = (st: P) => { const b = blocksOf(st.settings).filter((x: P) => x.kind === 'op' && !x.hidden); return b.length ? 'οπλοφύλακας: ' + (b.every((x: P) => x.armed) ? 'ένοπλος' : 'άοπλος') + ' (Ρυθμίσεις)' : ''; };

// Ώρες σε στενή μορφή («14-16 · 22-00») όταν είναι ακέραιες ώρες· αλλιώς όπως είναι
const hrs = (x: Post) => (x.slots ? x.slots.map((t: string, i: number, all: string[]) => html`<span key=${i} className="nw">${t.replace(/:00/g, '') + (i < all.length - 1 ? '\u00a0·' : '')}</span>`) : x.hours);
// Γραμμή του πίνακα θέσεων: Θέση με τις ώρες από κάτω | Ποιος (+ ολόκληρο το «Γιατί») | Είδ./Σύν. | ενέργειες
function PostRow({ x, same, pid, date, statuses, lists, duty, ruleWarn, why, onAssign, onNext, unavailable, onBlocked, pm, locked, onOpen, hint, pickFrom }: P) {
  const [swap, setSwap] = useState(false);
  const p = pid && pm.get(pid); const r = pid && (dutyBlock(statuses, date, pid, x, lists) || ruleWarn);
  // βάρδιες: όλες οι ώρες η μία κάτω από την άλλη, δίπλα στο νούμερο, όπως στο έντυπο (Michael, 20/10)
  // ζεύγος (Michael, 4/11): το β μέλος δεν επαναλαμβάνει τις ώρες, είναι οι ίδιες με το α του νούμερου
  const head = same ? html`<div className="post__pos"><b>${x.short}</b><span className="post__hrs">ίδιες ώρες με ${/^\d+η/.test(same) ? 'την' : 'τον'} ${same.replace('ος', 'ο')}</span></div>`
    : x.slots && x.slots.length ? html`<div className="post__pos is-slots"><b>${x.short}</b><span className="post__slots">${x.slots.map((t: string, i: number) => html`<span key=${i}>${t}</span>`)}</span></div>`
    : html`<div className="post__pos"><b>${x.short}</b><span className="post__hrs">${hrs(x)}</span></div>`;
  const kenh = html`<span className="post__who"><span className="kenh-tag">Κενή</span></span>`;
  if (locked) return html`<li className=${cx('post', !p && 'is-empty')}>${head}${p ? html`<span className="post__who"><button type="button" className="post__name linkish" data-tip=${rkFull(p) + ' · άνοιξε την καρτέλα'} onClick=${() => onOpen(p.id)}><${RkName} p=${p} fn=${fullName}/></button>${r && html`<${Badge} tone="bad">⚠ ${r}<//>`}</span>` : kenh}<span className="duty">${duty}</span><span></span></li>`;
  if (p && swap) return html`<li className="post is-swap">${head}
    <div className="post__wide"><div style=${{ flex: 1, minWidth: 0 }}><${PersonPicker} id=${'gs-' + x.k} autoFocus=${true} placeholder=${'Αντί για ' + rkFull(p) + '… (ή ⇄ ανταλλαγή με άλλη θέση)'} date=${date} people=${pickFrom} hint=${hint} unavailable=${(q: Person) => { const r = unavailable(q); return r && r.startsWith('Ήδη ') ? '⇄ Ανταλλαγή: ' + r.slice(5) : r; }} onBlocked=${(q: Person, why: string) => { setSwap(false); onBlocked(x.k, q, why); }} onChange=${(id: number) => { setSwap(false); onAssign(x.k, id, p.id); }}/></div>
    <${Button} variant="ghost" size="sm" onClick=${() => setSwap(false)}>Άκυρο<//></div></li>`;
  if (!p) return html`<li className="post is-empty">${head}${kenh}<div className="post__pick"><${PersonPicker} id=${'gp-' + x.k} placeholder="Διάλεξε άτομο…" date=${date} people=${pickFrom} hint=${hint} unavailable=${unavailable} onBlocked=${(q: Person, why: string) => onBlocked(x.k, q, why)} onChange=${(id: number) => onAssign(x.k, id)}/></div></li>`;
  return html`<li className="post">${head}
    <span className="post__who"><span className="post__name"><button type="button" className="linkish" data-tip=${rkFull(p) + ' · άνοιξε την καρτέλα'} onClick=${() => onOpen(p.id)}><${RkName} p=${p} fn=${fullName}/></button>${r && html` <${Badge} tone="warn" className="tag" data-tip="Πέρασε παρά τον κανόνα">⚠ ${r}<//>`}</span>${why && html`<small className="post__why" data-tip="Γιατί αυτός; Η σειρά δικαιοσύνης είναι στο κουμπί «Κανόνες»">Γιατί: ${why}</small>`}</span>
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
  // στήλες: όνομα (κολλά αριστερά), μία ανά υπηρεσία, Σύν., Αργ., Τελευταία, Μέρες· το πλάτος βγαίνει από το πλήθος τους: με πολλές υπηρεσίες κυλά μέσα στο πλαίσιο
  const chkCols = 'minmax(140px,1fr) repeat(' + kinds.length + ',84px) 52px 52px 78px 62px';
  const chkMin = 140 + kinds.length * 84 + 52 + 52 + 78 + 62;
  const chkHead = kinds.some(k => kindLbl(k).length > 9) ? 58 : 34;
  return html`<${Card} title="Έλεγχος υπηρεσιών" actions=${html`<${Badge} tone="ok" data-tip="Βγαίνει από το ημερολόγιο υπηρεσιών (ποιος, ποια μέρα, ποια θέση) (Κ-03)" data-tip-side="left">Ενημερώνεται αυτόματα<//>`}>
    <div className="toolbar"><${Segmented} value=${view} onChange=${setView} items=${[{ value: 'list', label: 'Λίστα' }, { value: 'grid', label: 'Μηνιαίο πλέγμα (Excel)' }]}/>
      ${view === 'grid' && html`<input type="search" className="ui-input" style=${{ width: '240px' }} aria-label="Αναζήτηση στο πλέγμα" placeholder="Όνομα (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/><${MonthField} aria-label="Μήνας" style=${{ width: '170px' }} value=${ym} onChange=${(e: any) => { if (e.target.value) { setYm(e.target.value); setAllM(false); } }}/><${ExportButton} kind="check" date=${ym + '-01'} label=${'Έλεγχος υπηρεσιών ' + mon} size="sm"/>`}</div>
    ${view === 'grid' ? html`<${ExcelSheet} model=${grid} fileName=${'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + norm(mon) + '.xlsx'} sheetName="ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ" meta="A4 οριζόντιο" footer="Γκρι στήλες: ΣΚ και αργίες, από το ημερολόγιο. Θ θαλαμοφύλακας · Μ μαγειρεία · ΛΥ Λ/Υ-Δ/Υ. Στο Excel γράφεται και ο λόγος απουσίας."/>` : html`<div>
    <div className="toolbar" style=${{ marginBottom: 0 }}><input type="search" className="ui-input" aria-label="Αναζήτηση στον έλεγχο" placeholder="Όνομα (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${MonthSelect} m=${m}/>
      <${Segmented} value=${hol ? 'hol' : 'all'} onChange=${(v: string) => { setSk(null); setHol(v === 'hol'); }} items=${[{ value: 'all', label: 'Σειρά δικαιοσύνης', tip: 'Περισσότερες μέρες χωρίς υπηρεσία, μετά λιγότερες συνολικά, μετά λιγότερες αργίες' }, { value: 'hol', label: 'Λιγότερες αργίες' }]}/><${ActiveFilter} parts=${[dq && '«' + dq + '»']} onClear=${() => setQ('')}/><span className="toolbar__count">${rows.length} άτομα</span></div>
    <div className="chk">
      <${VirtualList} items=${rows} rowHeight=${36} height=${380 + chkHead} headHeight=${chkHead} minWidth=${chkMin} head=${html`<div className="chk__head" style=${{ gridTemplateColumns: chkCols }}>${H('name', 'Ονοματεπώνυμο')}${kinds.map(k => html`<span key=${k}>${H(k, kindLbl(k), kindLbl(k))}</span>`)}${H('total', 'Σύν.')}${H('hol', 'Αργ.', 'Υπηρεσίες σε ΣΚ ή επίσημη αργία')}${H('last', 'Τελευταία')}${H('idle', 'Μέρες', 'Μέρες χωρίς υπηρεσία')}</div>`} renderRow=${(r: P, _i: number, style: P) => html`<div key=${r.p.id} className="chk__row" style=${{ ...style, gridTemplateColumns: chkCols }} role="button" tabIndex="0" onClick=${() => onOpen(r.p.id)}><span data-tip=${rkFull(r.p)}><${RkName} p=${r.p}/></span>${kinds.map(k => html`<span key=${k} className="num">${r.d.byKind[k] || '·'}</span>`)}<span className="num tot">${r.d.total}</span><span className="num hol">${r.d.hol}</span><span className="num last">${r.d.last ? dm(r.d.last) : '—'}${r.d.last && isHol(state.settings, r.d.last) ? ' ★' : ''}</span><span className="num">${r.idle === 9999 ? '—' : r.idle}</span></div>`}/>
    </div></div>`}
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
// Κανόνες υπηρεσιών (Michael, 1/11): τρεις καρτέλες σε ένα παράθυρο (Κανόνες · Σειρά δικαιοσύνης · Ώρες), ένα πρόχειρο, μία «Αποθήκευση»
const KEY_NAME: Record<string, [string, string]> = { mg: ['Μαγειρεία', ''], mid: ['2ο-3ο νούμερο', 'θαλαμοφύλακας, άοπλος οπλοφύλακας'], edge: ['1ο-4ο νούμερο', 'θαλαμοφύλακας, άοπλος οπλοφύλακας'] };
const ONOFF = (on: boolean) => html`<${Badge} tone=${on ? 'ok' : undefined}>${on ? 'ανοιχτό' : 'κλειστό'}<//>`;
// Σύνδεσμος που κλείνει το παράθυρο (με την ίδια ερώτηση αν έχει αλλαγές, όπως το GoLink) και κάνει κάτι στην οθόνη Υπηρεσίες
function TabLink({ onGo, children }: P) {
  const leave = useContext(DialogLeave);
  return html`<${Button} variant="link" className="golink" onClick=${() => (leave ? leave(onGo) : onGo())}>${children}<//>`;
}
export function RulesDialog({ onClose, onTab, onFixed }: P) {
  const { state, run, today } = useStore(); const toast = useToast(); const st = state.settings;
  const [tab, setTab] = useState('rules');
  const [r, setR] = useState<P>(() => ({ ...state.rules, hkTime: state.rules.hkTime || DEFAULT_HK_TIME, ...armMargin(state.rules) }));
  const [ds, setDs] = useState(dutyStartOf(st));
  // ώρες εξόδου/επιστροφής και εκπαίδευση ανά ημέρα εβδομάδας (Michael, 24/10), γράφονται με το setWeekRules
  const [wk, setWk] = useState<WeekDraft>(() => weekDraft(state.rules)); const wkBad = weekIssue(wk);
  const badT = !normTime(r.hkTime) || !normTime(ds) || !!wkBad; const badTxt = wkBad || 'Μια ώρα δεν είναι σωστή (π.χ. 16:00): δες την καρτέλα Ώρες';
  const [r0] = useState(() => JSON.stringify([r, ds, wk])); const dirty = JSON.stringify([r, ds, wk]) !== r0;
  const set = (k: string, v: unknown) => setR((x: P) => { const n = { ...x }; if (v === undefined) delete n[k]; else n[k] = v; return n; });   // undefined = η προεπιλογή, δεν αποθηκεύεται
  const txt = (x: P) => RULE_TXT({ ...x, armBefore: x.before, armAfter: x.after }, st);
  const save = async () => {
    const { before, after, outTime: _old, ...rest } = r;   // το παλιό «Ώρα εξόδου» (outTime) δεν υπάρχει πια: μία ώρα εξόδου, ο πίνακας εβδομάδας
    const nr = { ...rest, hkTime: normTime(r.hkTime)!, armBefore: before, armAfter: after } as Rules; const nds = normTime(ds)!;
    if (nds !== dutyStartOf(st) && !(await run({ t: 'setSettings', settings: { dutyStart: nds }, text: 'ο κύκλος των υπηρεσιών ξεκινά στις ' + nds }, false))) return;
    if (!(await run({ t: 'setRules', rules: nr, text: RULE_TXT(nr, st) }, false))) return;
    const week = Object.fromEntries(WEEK_ORDER.map(w => [w, { out: normTime(wk[w].out)!, backOut: normTime(wk[w].backOut)!, backDn: normTime(wk[w].backDn)!, train: wk[w].train }]));
    if (!(await run({ t: 'setWeekRules', week }, false))) return;
    onClose(); toast({ text: 'Οι κανόνες άλλαξαν: ' + RULE_TXT(nr, st) });
  };
  // Α. ποια νούμερα έχουν «ξανά στο ίδιο νούμερο» (τουλάχιστον ένα)
  const rots: number[] = r.numRots ?? DEFAULT_NUM_ROTS;
  const togRot = (n: number) => { const v = rots.includes(n) ? rots.filter(x => x !== n) : [...rots, n].sort((a, b) => a - b); if (v.length) set('numRots', v.join() === DEFAULT_NUM_ROTS.join() ? undefined : v); };
  // Β. η σειρά των Αυστηρά Άοπλοι: οι δικές σου άοπλες υπηρεσίες (όχι κρυφές, όχι Λ/Υ-Δ/Υ) μπαίνουν προαιρετικά
  const [editOrd, setEditOrd] = useState(false);
  const own = useMemo(() => capCols(st).filter(c => c.block && !c.armed).map(c => ({ key: c.key as string, name: c.label })), [st]);
  const nameOf = (k: string) => KEY_NAME[k]?.[0] || own.find(o => o.key === k)?.name || '';
  const order = [...strictKeys(r)].filter(nameOf);   // κλειδιά υπηρεσιών που διαγράφηκαν αγνοούνται σιωπηλά
  const setOrder = (v: string[]) => set('strictOrder', v.join() === DEFAULT_STRICT_ORDER.join() ? undefined : v);
  const move = (i: number, d: number) => { const v = [...order]; [v[i], v[i + d]] = [v[i + d], v[i]]; setOrder(v); };
  const spare = [...Object.keys(KEY_NAME), ...own.map(o => o.key)].filter(k => !order.includes(k));
  // «Τι άλλο κρίνει ποιος μπαίνει»: φθηνά νούμερα, μία φορά όταν ανοίγει το παράθυρο
  const info = useMemo(() => {
    const cnt = (c?: Record<string, Record<string, unknown>>) => Object.values(c || {}).reduce((n, row) => n + Object.keys(row).length, 0);
    const act = activePeople(state); const end = addDays(today, 6); const pm = personMap(state.people); const fx = state.settings.fixed || {};
    return {
      stat: cnt(st.lists?.stat?.cells), si: cnt(st.lists?.si?.cells),
      caps: act.filter(p => Object.values(state.caps[p.id] || {}).some(v => typeof v === 'string')).length,
      skips: act.reduce((n, p) => n + (p.skips?.filter(k => k.from <= end && k.to >= today).length || 0), 0),
      off: act.filter(p => p.offDays?.length).length, post: act.filter(p => p.post).length,
      fixed: (['ly', 'dy'] as const).filter(k => fx[k] && pm.get(fx[k]!)).map(k => (k === 'ly' ? 'Λ/Υ ' : 'Δ/Υ ') + shortName(pm.get(fx[k]!)!)),
      cadre: (state.cadreList || []).filter(c => c.active && c.monthMax).length
    };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const chg = (n: number) => (n ? n + (n === 1 ? ' αλλαγή' : ' αλλαγές') : 'όπως η προεπιλογή');
  const ppl = (n: number) => n + (n === 1 ? ' άτομο' : ' άτομα');
  const item = (k: string, body: any, more?: any) => html`<div className="rl-i"><b>${k}</b> · ${body}${more && html`<small className="muted">${more}</small>`}</div>`;
  const rulesTab = html`<div className="rl-tab">
    <p className="note rl-now">Ισχύουν τώρα: ${txt(r)}</p>
    <section className="rl-grp"><h3>Ανάπαυση</h3>
      <div className="rl-two">
        <div className="field"><label className="field__label" htmlFor="rrest">Ανάπαυση πριν και μετά από υπηρεσία</label><${DaysSelect} id="rrest" value=${r.restDays} onChange=${(v: number) => set('restDays', v)} opts=${[[0, 'Χωρίς'], [1, '1 ημέρα (όχι δύο μέρες στη σειρά)'], [2, '2 ημέρες']]} txt=${(n: number) => n + ' ημέρες'}/></div>
        <div className="field"><label className="field__label" htmlFor="rnum">Ξανά στο ίδιο νούμερο</label><${DaysSelect} id="rnum" value=${r.numRest || 0} onChange=${(v: number) => set('numRest', v)} opts=${[[0, 'Χωρίς περιορισμό'], [3, 'Μετά από 3 ημέρες'], [4, 'Μετά από 4 ημέρες']]} txt=${(n: number) => 'Μετά από ' + n + ' ημέρες'}/>
          <div className=${cx('rl-chips', !r.numRest && 'is-off')} role="group" aria-label="Ποια νούμερα"><span className="note">Ποια νούμερα:</span>${[0, 1, 2, 3].map(n => html`<button key=${n} type="button" className="rl-chip" aria-pressed=${rots.includes(n)} disabled=${!r.numRest} data-tip=${rots.length === 1 && rots.includes(n) ? 'Τουλάχιστον ένα νούμερο' : undefined} onClick=${() => togRot(n)}>${n + 1}ο</button>`)}</div></div>
      </div>
      <span className="note">Ισχύουν μαζί: όποιος ήταν σε ένα από τα νούμερα (θαλαμοφύλακας, οπλοφύλακας, σκοπός) δεν ξαναμπαίνει σε αυτό νωρίτερα.</span>
    </section>
    <section className="rl-grp"><h3>ΣΚ και αργίες</h3>
      <label className="rule"><input type="checkbox" className="ui-check" checked=${r.noConsecHol} onChange=${(e: any) => set('noConsecHol', e.target.checked)}/><span><b>Όχι ΣΚ ή αργία δύο συνεχόμενες εβδομάδες</b><small>Όποιος έκανε ΣΚ ή αργία δεν μπαίνει στο επόμενο, ούτε σε αργία δύο μέρες μετά. Αν σε αργία δεν φτάνουν οι υπόλοιποι, μπαίνουν και όσοι έκαναν πρόσφατα αργία (πρώτα όποιος την έκανε πιο παλιά), με ειδοποίηση.</small></span></label>
      <label className="rule"><input type="checkbox" className="ui-check" checked=${!!r.newAvg} onChange=${(e: any) => set('newAvg', e.target.checked ? true : undefined)}/><span><b>Οι νέοι στη δύναμη ξεκινούν από τον μέσο όρο</b><small>Όποιος μπαίνει στη δύναμη (νέα ΕΣΣΟ, μετάθεση) μετρά σαν να έχει κάνει όσες αργίες και υπηρεσίες ο μέσος όρος τη μέρα που ήρθε. Κλειστό: ξεκινά από το 0 και παίρνει σχεδόν κάθε δεύτερο ΣΚ ώσπου να φτάσει τους άλλους.</small></span></label>
    </section>
    <section className="rl-grp"><h3>Μοίρασμα</h3>
      <label className="rule"><input type="checkbox" className="ui-check" checked=${r.rotate !== false} onChange=${(e: any) => set('rotate', e.target.checked)}/><span><b>Εναλλαγή υπηρεσιών</b><small>Από όσους είναι η σειρά τους σήμερα, η θέση πάει σε όποιον έχει κάνει λιγότερο αυτή την υπηρεσία.</small></span></label>
      <div className="rule rl-strict"><input id="rstrict" type="checkbox" className="ui-check" checked=${!!r.strictUnarmed} onChange=${(e: any) => set('strictUnarmed', e.target.checked)}/><span><label htmlFor="rstrict"><b>Αυστηρά Άοπλοι</b></label>
        <small>Οι άοπλοι μπαίνουν πρώτα με αυτή τη σειρά: <b>${strictOrderTxt(r, st)}</b> <button type="button" className="linkish rl-lnk" aria-expanded=${editOrd} onClick=${() => setEditOrd(!editOrd)}>${editOrd ? 'Κλείσιμο' : 'Αλλαγή σειράς'}</button>. Σκοποί μόνο ένοπλοι.${opState(state) ? ' Τώρα: ' + opState(state) + '.' : ''}</small>
        ${editOrd && html`<ol className="rl-ord" aria-label="Σειρά των Αυστηρά Άοπλοι">
          ${order.map((k, i) => html`<li key=${k}><span className="rl-ord__mv"><button type="button" aria-label=${'Πάνω: ' + nameOf(k)} disabled=${i === 0} onClick=${() => move(i, -1)}>↑</button><button type="button" aria-label=${'Κάτω: ' + nameOf(k)} disabled=${i === order.length - 1} onClick=${() => move(i, 1)}>↓</button></span>
            <label><input type="checkbox" className="ui-check" checked=${true} disabled=${order.length < 2} data-tip=${order.length < 2 ? 'Τουλάχιστον μία υπηρεσία' : undefined} onChange=${() => setOrder(order.filter(x => x !== k))}/> <b>${nameOf(k)}</b>${KEY_NAME[k]?.[1] ? html`<small className="muted">${KEY_NAME[k][1]}</small>` : null}</label></li>`)}
          ${spare.map(k => html`<li key=${k} className="is-spare"><span className="rl-ord__mv"></span><label><input type="checkbox" className="ui-check" checked=${false} onChange=${() => setOrder([...order, k])}/> <span>${nameOf(k)}</span> <small className="muted">${KEY_NAME[k] ? KEY_NAME[k][1] : 'δική σου άοπλη υπηρεσία'}</small></label></li>`)}
        </ol>`}</span></div>
    </section>
    <section className="rl-grp"><h3>Τι άλλο κρίνει ποιος μπαίνει <small className="muted">(αλλάζουν εκεί, εδώ βλέπεις τι ισχύει)</small></h3>
      <div className="rl-box">
        ${item('Καταστάσεις', html`<span>${chg(info.stat)} <${GoLink} view="templates" params=${{ tab: 'duty', dsub: 'stat' }}>Ρυθμίσεις › Καταστάσεις<//></span>`, 'Προεπιλογή: ΕΥ, ΣΤΕΠ, κωλυόμενος: καμία υπηρεσία · ΕΑ/ΕΟ: όχι ένοπλη, όχι μαγειρεία, σκοπιά μόνο αν δεν υπάρχει άλλος')}
        ${item('Σ.Ι.', html`<span>${chg(info.si)} <${GoLink} view="templates" params=${{ tab: 'duty', dsub: 'si' }}>Ρυθμίσεις › Σ.Ι.<//></span>`)}
        ${item('Ποιος κάνει τι', html`<span>${ppl(info.caps)} με «δεν κάνει» <${TabLink} onGo=${() => onTab('who')}>Άνοιγμα<//></span>`)}
        ${item('Εξαιρέσεις', html`<span>${info.skips} τις επόμενες 7 μέρες <${TabLink} onGo=${() => onTab('skips')}>Άνοιγμα<//></span>`)}
        ${item('Μέρες χωρίς υπηρεσία', html`<span>${ppl(info.off)} <${GoLink} view="people">Δυναμολόγιο<//></span>`)}
        ${item('Πόστα', html`<span>${ppl(info.post)}, μόνο με το χέρι (ούτε Λ/Υ-Δ/Υ) <${GoLink} view="people">Δυναμολόγιο<//></span>`)}
        ${item('Μόνιμοι Λ/Υ-Δ/Υ', html`<span>${info.fixed.length ? info.fixed.join(', ') + ' · μπαίνουν μόνοι τους' : 'κανένας'} <${TabLink} onGo=${onFixed}>Όρισε<//></span>`)}
        ${item('ΕΠΟΠ/ΟΒΑ', html`<span>μόνο με το χέρι, ${info.cadre} με όριο τον μήνα <${GoLink} view="cadre">Στελέχη<//></span>`)}
      </div>
      <span className="note">Πάντα: ένας άνθρωπος σε μία θέση τη μέρα · όχι όποιος έχει άδεια ή λείπει. Οι αναθέσεις που υπάρχουν δεν αλλάζουν· όσες παραβαίνουν τους νέους κανόνες φαίνονται με ⚠.</span>
    </section>
  </div>`;
  // Σειρά δικαιοσύνης: μόνο ανάγνωση. Κάθε βήμα είναι αυτό που κάνει ο κώδικας (rules.ts: candidates, fairCompare, rotate, strictOrder, repair)
  const n = aheadDays(r), strictOn = !!r.strictUnarmed, rotOn = r.rotate !== false;
  const avgTxt = r.newAvg ? ' Οι νέοι στη δύναμη ξεκινούν από τον μέσο όρο.' : '';
  const steps: [string, any, string][] = [
    ['Κρατά όσους επιτρέπουν οι κανόνες', '', 'Καταστάσεις, Σ.Ι., Ποιος κάνει τι, Εξαιρέσεις, μέρες χωρίς υπηρεσία, ανάπαυση, ΣΚ μετά από ΣΚ. Κανείς δεν μπαίνει σιωπηλά παρά τον κανόνα: αν δεν βρεθεί κανείς, η θέση μένει κενή και το λέει.'],
    ['Τελευταίοι: «μόνο αν δεν υπάρχει άλλος»', '', 'π.χ. ΕΑ/ΕΟ σε σκοπιά, ιατρικό «μόνο προειδοποίηση».'],
    ['Κρατά τους ένοπλους για τις ένοπλες θέσεις', '', 'Σε άοπλη θέση μπαίνουν τελευταίοι όσοι χρειάζονται για να μη μείνει κενή ένοπλη θέση της μέρας.'],
    ['Τελευταίοι όσοι χρωστάνε ΣΚ ή έχουν ήδη υπηρεσία μπροστά', '', n ? 'Τις ' + n + ' μέρες πριν από ΣΚ ή αργία κρατά στην άκρη όσους θα πάρουν το ΣΚ (οι λιγότερες αργίες)· και όποιον έβαλες ήδη με το χέρι τις επόμενες ' + n + ' μέρες. Μπαίνουν μόνο αν δεν φτάνουν οι άλλοι.' : 'Ισχύει μόνο με ανάπαυση: τώρα η ανάπαυση είναι «Χωρίς».'],
    ['ΣΚ ή αργία: λιγότερες αργίες', '', 'Μετά όποιος έκανε αργία πιο παλιά. ΔΝ, έξοδος και θάλαμος δεν μετράνε.' + avgTxt],
    ['Καθημερινή: περισσότερες μέρες χωρίς υπηρεσία', '', 'Οι μέρες διορθώνονται με το «πόσες αναλογούν»: όποιος έλειπε (άδεια, νοσοκομείο, ΕΥ) δεν μένει πίσω, και όποιος έκανε λιγότερες από όσες του αναλογούν προηγείται (ως 2 υπηρεσίες). Μετά λιγότερες υπηρεσίες συνολικά, μετά λιγότερες αργίες.' + avgTxt],
    ['Εναλλαγή υπηρεσιών', ONOFF(rotOn), rotOn ? 'Από όσους είναι η σειρά τους σήμερα, η θέση πάει σε όποιον χρωστά αυτή την υπηρεσία: την έχει κάνει λιγότερο από τις άλλες που μπορεί να κάνει. Όποιος χωρά μόνο σε αυτή τη θέση μπαίνει πρώτος. Μετράει και το Λ/Υ-Δ/Υ (όταν δεν έχει μόνιμο). Δεν αλλάζει τα βήματα 2-4.' : 'Κλειστό: μένει η σειρά των βημάτων 5-6.'],
    ['Αυστηρά Άοπλοι', ONOFF(strictOn), strictOn ? 'Οι θέσεις της σειράς (' + strictOrderTxt(r, st) + ') γεμίζουν πρώτες και εκεί οι άοπλοι προηγούνται. Σκοπιά μόνο ένοπλοι. Κάθε ελεύθερος άοπλος προηγείται, ακόμα κι αν δεν είναι η σειρά του, οπότε οι άοπλοι κάνουν περισσότερες υπηρεσίες (πάντα με ανάπαυση). Για ίσες υπηρεσίες σε όλους, κλείσε τον διακόπτη. Άοπλος που χρειάζεται για ένοπλη θέση δεν παίρνει προτεραιότητα.' : 'Κλειστό: οι άοπλοι δεν προηγούνται, ισχύει η κανονική σειρά.'],
    ['Διόρθωση στο τέλος', '', 'Αν έμεινε κενή θέση ενώ γινόταν να γεμίσει, μετακινεί ως 3 από όσους έβαλε η ίδια συμπλήρωση. Όσους έβαλες με το χέρι και τους μόνιμους Λ/Υ-Δ/Υ δεν τους αγγίζει· κανόνας δεν παραβαίνεται.'],
    ['Ίσα νούμερα', ONOFF(rotOn), rotOn ? 'Όσους έβαλε η ίδια συμπλήρωση στα νούμερα του ίδιου εντύπου (2 ως 6 θέσεις) τους ανταλλάσσει ώστε να μην κάνει ο ίδιος τις ίδιες ώρες ξανά και ξανά (π.χ. πάντα τη νύχτα). Δεν αλλάζει ποιος έχει υπηρεσία σήμερα, ούτε τους κανόνες της θέσης.' : 'Κλειστό μαζί με την εναλλαγή.'],
    ['Αργία χωρίς αρκετούς', ONOFF(!!r.noConsecHol), r.noConsecHol ? 'Αν σε αργία μείνει θέση κενή επειδή όλοι έκαναν πρόσφατα αργία, μπαίνουν όσοι την έκαναν πιο παλιά (μόνο αυτός ο κανόνας χαλαρώνει) και βγαίνει ειδοποίηση.' : 'Κλειστό: ισχύει μόνο όταν είναι ανοιχτό το «Όχι ΣΚ ή αργία δύο συνεχόμενες εβδομάδες».'],
    ['Ισοπαλία: κλήρωση', '', 'Πρώτα λιγότερες φορές στο ίδιο είδος θέσης, μετά κλήρωση με σπόρο την ημερομηνία: την ίδια μέρα βγαίνει πάντα το ίδιο αποτέλεσμα.']
  ];
  const orderTab = html`<div className="rl-tab">
    <p className="note">Έτσι διαλέγει η αυτόματη συμπλήρωση και το «Επόμενος». Δίπλα σε κάθε όνομα το «Γιατί:» λέει ποιο βήμα τον έφερε.</p>
    <ol className="rl-steps">${steps.map(([t, badge, d], i) => html`<li key=${i}><b>${t}</b> ${badge}<small>${d}</small></li>`)}</ol>
    <span className="note">Πριν από όλα μπαίνουν οι μόνιμοι Λ/Υ και Δ/Υ. ΕΠΟΠ, ΟΒΑ και στελέχη δεν μπαίνουν ποτέ από την αυτόματη συμπλήρωση, μόνο με το χέρι. Το ίδιο όσοι έχουν πόστο (και στο Λ/Υ-Δ/Υ).</span>
    <span className="note">Τι έχει κάνει ο καθένας: <${TabLink} onGo=${() => onTab('check')}>Υπηρεσίες › Έλεγχος<//></span>
  </div>`;
  const hoursTab = html`<div className="rl-tab">
    <section className="rl-grp"><h3>Μέρα υπηρεσίας και ${HK()}</h3>
      <div className="rl-two">
        <${TimeField} id="rds" label="Ο κύκλος ξεκινά στις" value=${ds} onChange=${setDs} help=${'Η μέρα της υπηρεσίας είναι ' + (normTime(ds) || '14:00') + ' → ' + (normTime(ds) || '14:00') + ' της επόμενης. Από εδώ ξεκινούν και οι βάρδιες.'}/>
        <${TimeField} id="rhk" label=${'Ώρα ' + HK()} value=${r.hkTime} onChange=${(v: string) => set('hkTime', v)} help=${'Όποιος γυρίσει ως τότε μετρά παρών στην ' + HK() + ' της μέρας'}/>
      </div>
      <span className="note">Βάρδιες: κάθε πόσες ώρες αλλάζει το νούμερο («Κάθε τόσες ώρες») ή τις βάρδιες που γράφεις εσύ («Δικές μου βάρδιες») το ορίζεις σε κάθε υπηρεσία: <${GoLink} view="templates" params=${{ tab: 'duty', dsub: 'blocks' }}>Ρυθμίσεις › Υπηρεσίες και αργίες › Υπηρεσίες<//> › Επεξεργασία. Στις υπηρεσίες μετρά η ώρα που ξεκινά κάθε θέση (π.χ. επιστροφή 12:00 → μπαίνει στις 14:00). Η μέρα της αναχώρησης μετρά πάντα ολόκληρη.</span>
    </section>
    <section className="rl-grp"><h3>Εξοδούχοι: ώρες ανά ημέρα</h3>
      <${WeekTable} draft=${wk} onChange=${(w: number, k: string, v: string | boolean) => setWk(d => ({ ...d, [w]: { ...d[w], [k]: v } }))}/>
      <span className="note">Ισχύουν στους <${GoLink} view="outs">Εξοδούχους<//>: «Επιστροφή ΔΝ» της Δευτέρας = πότε γυρνά το πρωί της Δευτέρας όποιος είχε ΔΝ την Κυριακή. Αν η Δευτέρα δεν έχει εκπαίδευση και δεν έχει δηλωθεί, δεν ξέρουμε πότε γυρνά και η οθόνη Εξοδούχοι ζητά να δηλωθεί. Οι αργίες της εβδομάδας δεν έχουν εκπαίδευση. Για μία μέρα αλλάζουν από την ίδια την οθόνη Εξοδούχοι. <b>Μία ώρα εξόδου:</b> η «Αρχή εξόδου» της μέρας ισχύει και για όποιον γυρίζει από άδεια, νοσοκομείο ή ΣΤΕΠ· όποιος γυρίσει ως τότε βγαίνει κανονικά έξοδο εκείνη τη μέρα.</span></section>
    <section className="rl-grp"><h3>Ένοπλη υπηρεσία: πότε βγαίνει το όπλο</h3><div className="rl-two">
      <div className="field"><label className="field__label" htmlFor="rab">Βγαίνει πριν (λεπτά)</label><input id="rab" type="number" min="0" max=${ARM_MAX} className="ui-input" style=${{ maxWidth: '110px' }} value=${r.before} onChange=${(e: any) => set('before', Math.max(0, Math.min(ARM_MAX, Math.floor(+e.target.value) || 0)))}/></div>
      <div className="field"><label className="field__label" htmlFor="raa">Μπαίνει μετά (λεπτά)</label><input id="raa" type="number" min="0" max=${ARM_MAX} className="ui-input" style=${{ maxWidth: '110px' }} value=${r.after} onChange=${(e: any) => set('after', Math.max(0, Math.min(ARM_MAX, Math.floor(+e.target.value) || 0)))}/></div>
    </div><span className="note">Το όπλο βγαίνει ${r.before}′ πριν ξεκινήσει το νούμερο και μπαίνει ${r.after}′ μετά το τέλος του (προεπιλογή 15′ και 15′). Ποιο όπλο βγαίνει, δικό του ή της θέσης, το ορίζεις σε κάθε ένοπλη υπηρεσία: <${GoLink} view="templates" params=${{ tab: 'duty', dsub: 'blocks' }}>Ρυθμίσεις › Υπηρεσίες<//>.</span></section>
  </div>`;
  return html`<${Dialog} size="lg" title="Κανόνες υπηρεσιών" description="Ποιος μπαίνει σε υπηρεσία και με ποια σειρά. Ισχύουν στην επιλογή ατόμου και στην αυτόματη συμπλήρωση." onClose=${onClose} dirty=${dirty && 'Οι αλλαγές στους κανόνες δεν αποθηκεύτηκαν. Αν κλείσεις, μένουν οι παλιοί.'}
    footer=${html`<${Why} text=${badT && badTxt}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${badT} why=${badTxt} onClick=${save}>Αποθήκευση<//>`}>
    <${Segmented} value=${tab} onChange=${setTab} label="Καρτέλες των κανόνων" items=${[{ value: 'rules', label: 'Κανόνες' }, { value: 'order', label: 'Σειρά δικαιοσύνης' }, { value: 'hours', label: 'Ώρες' + (badT ? ' ⚠' : '') }]}/>
    ${tab === 'rules' ? rulesTab : tab === 'order' ? orderTab : hoursTab}
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
    people.forEach(p => { const ss = statusesFrom(live(state), p.id, date, dutyMin(state.settings)); const a = ss.find(s => statNoDuty(s, blocks, lists)); if (a) { noDuty.push({ p, s: a }); return; } const b = ss.find(s => statIsUnarmed(s, blocks.filter(x => x.kind !== 'ly'), lists)); if (b) unarmed.push({ p, s: b }); });
    // με πόστο: χωριστά, με το πόστο τους (μόνο με το χέρι, σε οποιαδήποτε θέση)
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
    const who = pid ? pm.get(pid) || pickPeople(state).find(q => q.id === pid) : undefined;   // στέλεχος χωρίς αριθμό θέσης ακόμα: τον δίνει το assign
    if (await run({ t: 'assign', date, k, pid, force: reason, move, ...(who?.cid ? { cid: who.cid } : {}) }, false)) toast({ text: (pid ? rkShort(who!) + (instead ? ' αντί για ' + rkShort(pm.get(instead)!) : '') + ' σε ' : 'Κενή η θέση ') + postTxt(x) + (printed ? ' · Είχε βγει Excel: χρειάζεται νέα εκτύπωση' : ''), actions: [undoMark()] });
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
    if (await run({ t: 'swapPosts', date, a, b, force: reason }, false)) toast({ text: 'Ανταλλαγή: ' + rkShort(pm.get(pb)!) + ' σε ' + postTxt(postsOf(state.settings).find(q => q.k === a)!) + ', ' + rkShort(pm.get(pa)!) + ' σε ' + postTxt(postsOf(state.settings).find(q => q.k === b)!), actions: [undoMark()] });
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
  const pill = (list: P[]) => html`<div className="avail">${list.map(({ p, s }: P) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => nav.openPerson(p.id)}>${rkShort(p)} <${Badge} tone=${TYPES[s.type as TypeKey].tone} data-tip=${s.type === 'KOL' && s.note ? 'Κωλυόμενος: ' + s.note : TYPES[s.type as TypeKey].long}>${s.type === 'LEAVE' ? statusLbl(s, state.settings.lists) : TYPES[s.type as TypeKey].label}<//></button>`)}</div>`;
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
      <${Button} size="sm" variant="ghost" disabled=${!!xb} onClick=${() => ex('outsPsk', psk[0], 'οι εξοδούχοι του ΠΣΚ')} data-tip=${'Εξοδούχοι' + (isOutsAll(state.settings) ? ' (όλη η δύναμη)' : '-παραμένοντες') + ' για τις τρεις μέρες, ένα φύλλο ανά μέρα' + (isOutsAll(state.settings) ? ' (στην «Όλη η δύναμη» δύο: σελίδα 1 οι εξοδούχοι, σελίδα 2 η υπόλοιπη δύναμη)' : '') + '. Η μορφή αλλάζει από τους Εξοδούχους.'}>${xb === 'outsPsk' ? 'Δημιουργία…' : 'Εξοδούχοι ΠΣΚ'}<//></span></div>`}
    <div className="gtable">
      <div className="gtable__head post" aria-hidden="true"><span>Θέση · ώρες</span><span>Ποιος</span><span data-tip=${'Υπηρεσίες αυτού του είδους / σύνολο · ' + (mon.allM ? 'όλοι οι μήνες, μαζί με τις προηγούμενες' : monLbl(mon.ym)) + ' (αλλάζει από τον μήνα πάνω δεξιά)'}>Είδ./Σύν.</span><span></span></div>
      ${blocks.filter(b => !b.hidden).map(b => { const ps = posts.filter(x => x.block === b.id); const emp = ps.filter(x => !g[x.k]).length; const open = fold[b.id] ?? emp > 0;
        const names = ps.map(x => (g[x.k] ? shortName(pm.get(g[x.k])!) : null)).filter(Boolean).join(', ');
        return html`<section key=${b.id} className=${cx('gblock', !open && 'is-closed')}>
          <h2 className="gblock__hd"><button type="button" aria-expanded=${open} onClick=${() => flip(b.id, open)}>${Icon.chev}<span>${b.name}</span><span className="gblock__meta" data-tip=${b.armed ? 'Ένοπλη: δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ (Κ-01)' : 'Άοπλη: μπαίνουν και όσοι έχουν ΕΑ, ΕΟ'}>· ${b.armed ? 'Ένοπλη' : 'Άοπλη'}</span>${blockShape(b).per > 1 && html`<span className="gblock__meta" data-tip="Κάθε νούμερο έχει περισσότερα από ένα άτομα, με τις ίδιες ώρες">· ${blockShape(b).nums} ${blockShape(b).nums === 1 ? 'νούμερο' : 'νούμερα'} × ${blockShape(b).per}</span>`}<span className=${cx('gblock__meta', emp && 'is-bad')}>· ${emp ? emp + ' ' + (emp === 1 ? 'κενή' : 'κενές') : 'πλήρης'}</span></button>${!open && names && html`<span className="gblock__sum">${names}</span>`}</h2>
          ${open && html`<ul className="posts">${ps.map((x: Post) => { const pid = g[x.k]; const d = pid ? st.get(pid) || emptyStat() : null; const first = ps.find((y: Post) => groupKey(y) === groupKey(x)); return html`<${PostRow} key=${x.k} onOpen=${nav.openPerson} x=${x} same=${first && first !== x ? first.short : ''} pid=${pid} pm=${pm} date=${date} lists=${state.settings.lists} statuses=${live(state)} duty=${d ? (d.byKind[fairKey(state, x)] || 0) + ' / ' + d.total : ''} ruleWarn=${pid ? capBlock(state, date, pid, x) || ruleBlock(state, date, pid, undefined, x.k) || lastResort(state.statuses, date, pid, x, state.settings.lists) || statusWarn(state, date, pid) : null} why=${pid ? why[x.k] || '' : ''} locked=${locked} onAssign=${assign} onNext=${next} onBlocked=${blocked} unavailable=${(p: Person) => guardUnavailable(state, date, p.id, x.k)} hint=${epopHint} pickFrom=${pickPeople(state)}/>`; })}</ul>${b.id === 'ly' && html`<${FixedLine} onEdit=${() => setFixedOpen(true)}/>`}`}
        </section>`; })}
    </div>
    ${!locked && Object.values(g).some(Boolean) && html`<div className="gb-clear"><${Button} size="sm" variant="ghost" onClick=${() => setClearAsk(true)} data-tip="Βγάζει όλους από τις θέσεις αυτής της μέρας (ρωτά πρώτα)">Άδειασε τη μέρα…<//></div>`}
    ${seatless.length > 0 && html`<section className="ui-card seatless" aria-label="Υπηρεσίες χωρίς θέση">
      <h2 className="minihd">Υπηρεσίες χωρίς θέση (από Excel) · ${seatless.length}</h2>
      <p className="note" style=${{ margin: '0 0 6px' }}>Σκέτο «Θ», «Μ», «Σ» στον έλεγχο υπηρεσιών: μετρούν στα σύνολα, στην ανάπαυση και στις αργίες, όχι στον κανόνα του ίδιου νούμερου. Όταν μπει ο ίδιος σε θέση του ίδιου είδους, φεύγει από εδώ.</p>
      <ul className="hist">${seatless.map((e: P) => html`<li key=${e.pid + e.kind}><span>${pm.get(e.pid) ? rkShort(pm.get(e.pid)!) : '?'}</span> <span className="muted">${KIND_NAME[e.kind as DutyKind]}</span> <${Button} size="sm" variant="ghost" aria-label=${'Βγάλε ' + (pm.get(e.pid) ? rkShort(pm.get(e.pid)!) : '') + ' από τις υπηρεσίες χωρίς θέση'} data-tip="Δεν έκανε αυτή την υπηρεσία" onClick=${async () => { if (await run({ t: 'removeDutyLog', date, pid: e.pid, kind: e.kind }, false)) toast({ text: 'Βγήκε από τις υπηρεσίες ' + dm(date), actions: [undoMark()] }); }}>✕<//></li>`)}</ul>
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
        ${excluded.posted.length > 0 && html`<h3 className="minihd">Με πόστο, μόνο με το χέρι (${excluded.posted.length})</h3><p className="note" style=${{ margin: '0 0 6px' }}>Η αυτόματη συμπλήρωση δεν τους βάζει πουθενά, ούτε στο Λ/Υ και Δ/Υ. Με το χέρι μπαίνουν σε οποιαδήποτε θέση: διάλεξέ τον στη θέση και γράψε την αιτία.</p><div className="avail">${excluded.posted.map((p: Person) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => nav.openPerson(p.id)} data-tip="Από το φύλλο ΠΟΣΤΑ (Αρχεία Excel)">${rkShort(p)} <${Badge} tone="outline">${p.post}<//></button>`)}</div>`}
        ${excluded.epop.length > 0 && html`<h3 className="minihd">ΕΠΟΠ/ΟΒΑ, μόνο με το χέρι (${excluded.epop.length})</h3><p className="note" style=${{ margin: '0 0 6px' }}>Η αυτόματη συμπλήρωση δεν τους βάζει. Διάλεξέ τον στη θέση· πάνω από το όριο του μήνα ζητά αιτία. Την απαλλαγή του στελέχους τη γράφεις με το χέρι στα Στελέχη.</p><div className="avail">${excluded.epop.map((p: Person) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => nav.openPerson(p.id)} data-tip=${p.cid ? 'Το όριο αλλάζει στα «Στοιχεία» του στελέχους' : 'Το όριο αλλάζει στη «Διόρθωση στοιχείων» της καρτέλας'}>${rkShort(p)} <${Badge} tone="outline">${epopHint(p)}<//></button>`)}</div>`}
        <h3 className="minihd">Μόνιμα όχι σε κάποιες θέσεις (${excluded.capped.length})</h3><div className="avail">${excluded.capped.map(({ p, c }: P) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => setProf(p.id)} data-tip=${c.map((o: P) => o.col.label + ': ' + o.x.why).join(' · ') + ' · Πάτα: «Ποιος κάνει τι»'}>${rkShort(p)} <${Badge} tone="outline">όχι ${c.map((o: P) => o.col.block ? o.col.label : (KIND_LBL as P)[o.col.kind]).join(', ')}<//></button>`)}</div>
        ${excluded.offDay.length > 0 && html`<h3 className="minihd">Όχι υπηρεσία ${DOW_FULL[weekday(date)]} (${excluded.offDay.length})</h3><div className="avail">${excluded.offDay.map(({ p }: P) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => setProf(p.id)} data-tip="Πάτα: «Ποιος κάνει τι»"><${RkName} p=${p}/></button>`)}</div>`}
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
      <div className="page-head__acts"><${Button} variant="outline" onClick=${() => setRules(true)} data-tip=${'Ισχύουν: ' + RULE_TXT(state.rules, state.settings)}>Κανόνες<//><label className="strict-sw" data-tip=${strictTxt(state.rules, state.settings) + (opState(state) ? ' Τώρα: ' + opState(state) + '.' : '')} data-tip-side="bottom"><input type="checkbox" className="ui-check" checked=${!!state.rules.strictUnarmed} onChange=${async (e: any) => { const on = e.target.checked; const nr = { ...state.rules, strictUnarmed: on }; if (await run({ t: 'setRules', rules: nr, text: RULE_TXT(nr, state.settings) }, false)) toast({ text: 'Αυστηρά Άοπλοι: ' + (on ? 'ανοιχτό. Ισχύει στην αυτόματη συμπλήρωση και στο «Επόμενος».' : 'κλειστό, κανονική σειρά.') }); }}/>Αυστηρά Άοπλοι</label><${Button} disabled=${!!afWhy} why=${afWhy} onClick=${autofill} data-tip="Γεμίζει τις κενές θέσεις μόνο με όσους επιτρέπουν οι κανόνες. Σειρά: αργίες (Πέμπτη-Παρασκευή κρατά στην άκρη όσους χρωστάνε ΣΚ), μέρες χωρίς υπηρεσία, λιγότερες υπηρεσίες· από όσους είναι η σειρά τους, η υπηρεσία πάει σε όποιον δεν την έχει κάνει (εναλλαγή υπηρεσιών), μετά κλήρωση. Λεπτομέρειες στο «Κανόνες»." data-tip-side="left">Αυτόματη συμπλήρωση<//>${!mobile && html`<${Button} variant="outline" disabled=${!!xb} onClick=${exportX}>${xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>`}</div><//>
    <div className="guard__days"><${DateBar} value=${date} onChange=${setDate} days=${[0, 1, 2, 3, 4, 5, 6].map(i => addDays(today, i))} count=${emptyOn}/></div>
    <div style=${{ marginBottom: '14px' }}><${Tabs} value=${cur} onChange=${setTab} items=${tabs}/></div>
    ${cur === 'skips' ? html`<${SkipsView} onPerson=${setProf}/>` : cur === 'who' ? whoTab : mobile ? (cur === 'posts' ? left : cur === 'check' ? check : xl) : (cur === 'posts' ? html`<div className="guard">${left}${side}</div>` : check)}
    ${preview && html`<${Dialog} size="xl" title=${'Προεπισκόπηση · ' + fileName} description="Ό,τι βλέπεις εδώ βγαίνει ίδιο στο Excel." onClose=${() => setPreview(false)}
      footer=${html`<${Button} variant="outline" onClick=${() => setPreview(false)}>Κλείσε<//><${PrintButton} kind="froura" date=${date} label="η κατάσταση υπηρεσιών" variant="outline"/><${Button} disabled=${!!xb} onClick=${exportX}>${xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>`}>${sheet()}<//>`}
    ${rules && html`<${RulesDialog} onClose=${() => setRules(false)} onTab=${setTab} onFixed=${() => { setTab('posts'); setFixedOpen(true); }}/>`}
    ${fixedOpen && html`<${FixedDialog} onClose=${() => setFixedOpen(false)}/>`}${addOpen && html`<${AddBlockDialog} onClose=${() => setAddOpen(false)}/>`}
    ${force && html`<${Dialog} title=${force.swapWith ? 'Ανταλλαγή παρά τον κανόνα;' : force.move ? rkShort(force.p) + ' είναι ήδη σε άλλη θέση' : 'Βάλε τον ' + rkShort(force.p) + ' παρά τον κανόνα;'} description=${force.why} onClose=${() => setForce(null)}
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
    ${f[k] && pm.get(f[k]!) ? html`<div className="fixedline"><b><${RkName} p=${pm.get(f[k]!)!}/></b><${Button} size="sm" variant="ghost" onClick=${() => setF({ ...f, [k]: undefined })}>Κανένας<//></div>` :
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
// Deprecated path: the service-block dialogs moved to features/duty-blocks (Phase 6, Ρυθμίσεις S3). Removed in Phase 7.
export { AddBlockDialog, PhaseDialog, PhaseSelect } from '../features/duty-blocks';

// Deprecated path: the «Εξοδούχοι» screen moved to pages/outs (Phase 6). Removed in Phase 7.
export { OutsScreen, OutsFmtSelect } from '../pages/outs';
