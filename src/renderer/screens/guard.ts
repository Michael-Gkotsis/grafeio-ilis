// features/guard (Κατάσταση υπηρεσιών, έλεγχος) και features/outs (εξοδούχοι, ΔΝ)
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Alert, Badge, Button, Card, Dialog, Icon, PageHeader, Segmented, Strip, Tabs, VirtualList, useMedia, useToast, useViewportHeight } from '../ui';
import { useNav, useStore, searchPeople } from '../store';
import { ActiveFilter, DateBar, ExcelSheet, ExportButton, PersonPicker, PrintButton, TemplateNote, useExport, useExportBusy } from '../common';
import { frouraSheet, checkSheet } from '../sheets';
import { TYPES, CAP_KINDS, KIND_LBL, KIND_NAME, PHASE_NAME, blocksOf, fullName, shortName, unitOf, roomTxt, postTxt, type DutyKind, type Person, type Phase, type Post, type TypeKey } from '../../shared/domain';
import { whyAll, lastResort, monthStats, dutyMonths, nextFor, swapCheck, capBlock, capsOf, dutyBlock, dutyStats, emptyStat, guardUnavailable, holName, offDayBlock, isHol, outBlock, outRoomsOn, personMap, postOf, postsOf, ruleBlock, statusesOn, statusWarn, strengthOf, activePeople } from '../../shared/rules';
import { addDays, dayName, dm, dmy, dow, parseD, pskDays, weekday, DOW_FULL, DOW_GEN, MONTHS } from '../../shared/dates';
import { collator, norm } from '../../shared/text';
import { useRowH } from '../prefs';
type P = any;

const RULE_TXT = (r: P) => [r.restDays ? 'ανάπαυση ' + r.restDays + ' ημ. μετά από υπηρεσία' : 'χωρίς ανάπαυση', r.numRest ? '3ο/4ο νούμερο ξανά μετά από ' + r.numRest + ' ημ.' : '', r.noConsecHol ? 'όχι αργία/ΣΚ δύο συνεχόμενες εβδομάδες' : 'αργίες χωρίς περιορισμό', r.strictUnarmed ? 'Αυστηρά Άοπλοι' : ''].filter(Boolean).join(', ');
const STRICT_TXT = 'Οι άοπλοι μπαίνουν πρώτα στα μαγειρεία, μετά στο 2ο και 3ο νούμερο θαλαμοφύλακα και οπλοφύλακα (αν ο οπλοφύλακας είναι άοπλος στις Ρυθμίσεις), μετά στο 1ο και 4ο νούμερο θαλαμοφύλακα. Σκοποί μόνο ένοπλοι.';
// «οπλοφύλακας: ένοπλος» όπως είναι τώρα στις Ρυθμίσεις (μόνο αν η φάση έχει οπλοφύλακες)
const opState = (st: P) => { const b = blocksOf(st.settings).filter((x: P) => x.kind === 'op' && !x.hidden); return b.length ? 'οπλοφύλακας: ' + (b.every((x: P) => x.armed) ? 'ένοπλος' : 'άοπλος') + ' (Ρυθμίσεις)' : ''; };

// Ώρες σε στενή μορφή («14-16 · 22-00») όταν είναι ακέραιες ώρες· αλλιώς όπως είναι
const hrs = (x: Post) => (x.slots ? x.slots.map((t: string, i: number, all: string[]) => html`<span key=${i} className="nw">${t.replace(/:00/g, '') + (i < all.length - 1 ? '\u00a0·' : '')}</span>`) : x.hours);
// Γραμμή του πίνακα θέσεων: Θέση με τις ώρες από κάτω | Ποιος (+ ολόκληρο το «Γιατί») | Είδ./Σύν. | ενέργειες
function PostRow({ x, pid, date, statuses, duty, ruleWarn, why, onAssign, onNext, unavailable, onBlocked, pm, locked }: P) {
  const [swap, setSwap] = useState(false);
  const p = pid && pm.get(pid); const r = pid && (dutyBlock(statuses, date, pid, x) || ruleWarn);
  const head = html`<div className="post__pos"><b>${x.short}</b><span className="post__hrs">${hrs(x)}</span></div>`;
  const kenh = html`<span className="post__who"><span className="kenh-tag">Κενή</span></span>`;
  if (locked) return html`<li className=${cx('post', !p && 'is-empty')}>${head}${p ? html`<span className="post__who"><span className="post__name">${fullName(p)}</span>${r && html`<${Badge} tone="bad">⚠ ${r}<//>`}</span>` : kenh}<span className="duty">${duty}</span><span></span></li>`;
  if (p && swap) return html`<li className="post is-swap">${head}
    <div className="post__wide"><div style=${{ flex: 1, minWidth: 0 }}><${PersonPicker} id=${'gs-' + x.k} autoFocus=${true} placeholder=${'Αντί για ' + fullName(p) + '… (ή ⇄ ανταλλαγή με άλλη θέση)'} date=${date} unavailable=${(q: Person) => { const r = unavailable(q); return r && r.startsWith('Ήδη ') ? '⇄ Ανταλλαγή: ' + r.slice(5) : r; }} onBlocked=${(q: Person, why: string) => { setSwap(false); onBlocked(x.k, q, why); }} onChange=${(id: number) => { setSwap(false); onAssign(x.k, id, p.id); }}/></div>
    <${Button} variant="ghost" size="sm" onClick=${() => setSwap(false)}>Άκυρο<//></div></li>`;
  if (!p) return html`<li className="post is-empty">${head}${kenh}<div className="post__pick"><${PersonPicker} id=${'gp-' + x.k} placeholder="Διάλεξε άτομο…" date=${date} unavailable=${unavailable} onBlocked=${(q: Person, why: string) => onBlocked(x.k, q, why)} onChange=${(id: number) => onAssign(x.k, id)}/></div></li>`;
  return html`<li className="post">${head}
    <span className="post__who"><span className="post__name">${fullName(p)}${r && html` <${Badge} tone="warn" className="tag" data-tip="Πέρασε παρά τον κανόνα">⚠ ${r}<//>`}</span>${why && html`<small className="post__why" data-tip="Γιατί αυτός; Η σειρά δικαιοσύνης είναι στο κουμπί «Κανόνες»">Γιατί: ${why}</small>`}</span>
    <span className="duty" data-tip="Υπηρεσίες αυτού του είδους / σύνολο" data-tip-side="left">${duty}</span>
    <span className="post__acts"><${Button} variant="ghost" size="sm" data-tip="Βάλε άλλον στη θέση του (π.χ. αλλαγή τελευταίας στιγμής)" data-tip-side="left" onClick=${() => setSwap(true)}>Αλλαγή<//><${Button} variant="ghost" size="sm" data-tip="Βάλε τον επόμενο στη σειρά δικαιοσύνης, με τους ίδιους κανόνες. Ξαναπάτα για τον μεθεπόμενο." data-tip-side="left" onClick=${() => onNext(x.k)}>Επόμενος<//><${Button} variant="ghost" size="icon" aria-label="Αφαίρεση από τη θέση" data-tip="Αφαίρεση από τη θέση" data-tip-side="left" onClick=${() => onAssign(x.k, null)}>${Icon.x}<//></span></li>`;
}

function DutyCheck({ onOpen }: P) {
  const { state, today } = useStore();
  const [q, setQ] = useState(''); const dq = useDeferredValue(q); const [hol, setHol] = useState(false); const [view, setView] = useState('list');
  // ένας μήνας για λίστα και πλέγμα· η λίστα έχει και «Όλοι οι μήνες» (με τις προηγούμενες υπηρεσίες)
  const [ym, setYm] = useState(today.slice(0, 7)); const [allM, setAllM] = useState(false);
  const all = dutyStats(state);
  const st = useMemo(() => (allM ? all : monthStats(all, ym)), [all, allM, ym]);
  const months = useMemo(() => [...new Set([today.slice(0, 7), ym, ...dutyMonths(state)])].sort().reverse(), [state.guards, state.dutyLog, today, ym]);
  const monLbl = (m: string) => MONTHS[+m.slice(5) - 1] + ' ' + m.slice(0, 4);
  const kinds = [...new Set(postsOf(state.settings).map(p => p.kind))];
  // το πλέγμα διαβάζει μόνο υπηρεσίες, προσωπικό και ρυθμίσεις: δεν ξαναχτίζεται για άλλες αλλαγές (π.χ. εξοδούχοι, ιατρικά)
  const grid = useMemo(() => (view === 'grid' ? checkSheet(state, ym, dq.trim() ? new Set(searchPeople(state.people, dq).map(p => p.id)) : undefined) : null), [view, state.guards, state.dutyLog, state.people, state.settings, ym, dq]);
  // ταξινόμηση με κλικ στην επικεφαλίδα της στήλης (ξανά κλικ: αντίστροφα)
  const [sk, setSk] = useState<{ k: string; dir: number } | null>(null);
  const val = (r: P, k: string): number | string => (k === 'name' ? r.p.last + ' ' + r.p.first : k === 'total' ? r.d.total : k === 'hol' ? r.d.hol : k === 'last' ? r.d.last || '' : r.d.byKind[k] || 0);
  const rows = useMemo(() => searchPeople(state.people, dq).map(p => ({ p, d: st.get(p.id) || emptyStat() })).sort((a, b) => { if (sk) { const x = val(a, sk.k), y = val(b, sk.k); const c = typeof x === 'number' ? x - (y as number) : collator.compare(x, y as string); if (c) return c * sk.dir; } return (hol ? a.d.hol - b.d.hol : 0) || a.d.total - b.d.total || collator.compare(a.p.last, b.p.last); }), [dq, st, hol, state.people, sk]);
  const H = (k: string, l: string, tip?: string) => html`<button type="button" className="chk__sort" data-tip=${tip} aria-sort=${sk?.k === k ? (sk.dir > 0 ? 'ascending' : 'descending') : 'none'} onClick=${() => setSk(sk?.k === k ? { k, dir: -sk.dir } : { k, dir: k === 'name' ? 1 : -1 })}>${l}${sk?.k === k ? (sk.dir > 0 ? ' ▲' : ' ▼') : ''}</button>`;
  const mon = MONTHS[+ym.slice(5) - 1];
  return html`<${Card} title="Έλεγχος υπηρεσιών" actions=${html`<${Badge} tone="ok" data-tip="Βγαίνει από το ημερολόγιο υπηρεσιών (ποιος, ποια μέρα, ποια θέση) (Κ-03)" data-tip-side="left">Ενημερώνεται αυτόματα<//>`}>
    <div className="toolbar"><${Segmented} value=${view} onChange=${setView} items=${[{ value: 'list', label: 'Λίστα' }, { value: 'grid', label: 'Μηνιαίο πλέγμα (Excel)' }]}/>
      ${view === 'grid' && html`<input type="search" className="ui-input" style=${{ width: '200px' }} aria-label="Αναζήτηση στο πλέγμα" placeholder="Αναζήτηση…" value=${q} onChange=${(e: any) => setQ(e.target.value)}/><input type="month" className="ui-input" style=${{ width: '170px' }} value=${ym} onChange=${(e: any) => { if (e.target.value) { setYm(e.target.value); setAllM(false); } }}/><${ExportButton} kind="check" date=${ym + '-01'} label=${'Έλεγχος υπηρεσιών ' + mon} size="sm"/>`}</div>
    ${view === 'grid' ? html`<${ExcelSheet} model=${grid} fileName=${'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + norm(mon) + '.xlsx'} sheetName="ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ" meta="A4 οριζόντιο" footer="Γκρι στήλες: ΣΚ και αργίες, από το ημερολόγιο. Θ θαλαμοφύλακας · Μ μαγειρεία · ΛΥ Λ/Υ-Δ/Υ. Στο Excel γράφεται και ο λόγος απουσίας."/>` : html`<div>
    <div className="toolbar" style=${{ marginBottom: 0 }}><input type="search" className="ui-input" aria-label="Αναζήτηση στον έλεγχο" placeholder="Αναζήτηση…" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <select className="ui-input" style=${{ flex: '0 0 190px', width: '190px' }} aria-label="Μήνας" data-tip="Υπηρεσίες μόνο αυτού του μήνα· «Όλοι οι μήνες» μετρά και τις προηγούμενες υπηρεσίες" value=${allM ? '' : ym} onChange=${(e: any) => { const v = e.target.value; setAllM(!v); if (v) setYm(v); }}><option value="">Όλοι οι μήνες</option>${months.map(m => html`<option key=${m} value=${m}>${monLbl(m)}</option>`)}</select>
      <${Segmented} value=${hol ? 'hol' : 'all'} onChange=${(v: string) => { setSk(null); setHol(v === 'hol'); }} items=${[{ value: 'all', label: 'Λιγότερες συνολικά' }, { value: 'hol', label: 'Λιγότερες αργίες' }]}/><${ActiveFilter} parts=${[dq && '«' + dq + '»']} onClear=${() => setQ('')}/><span className="toolbar__count">${rows.length} άτομα</span></div>
    <div className="chk"><div className="chk__in">
      <div className="chk__head" style=${{ gridTemplateColumns: 'minmax(130px,1fr) repeat(' + (kinds.length + 2) + ',52px) 70px' }}>${H('name', 'Ονοματεπώνυμο')}${kinds.map(k => html`<span key=${k}>${H(k, KIND_LBL[k])}</span>`)}${H('total', 'Σύν.')}${H('hol', 'Αργ.', 'Υπηρεσίες σε ΣΚ ή επίσημη αργία')}${H('last', 'Τελευταία')}</div>
      <${VirtualList} items=${rows} rowHeight=${36} height=${380} renderRow=${(r: P, _i: number, style: P) => html`<div key=${r.p.id} className="chk__row" style=${{ ...style, gridTemplateColumns: 'minmax(130px,1fr) repeat(' + (kinds.length + 2) + ',52px) 70px' }} role="button" tabIndex="0" onClick=${() => onOpen(r.p.id)}><span>${shortName(r.p)}</span>${kinds.map(k => html`<span key=${k} className="num">${r.d.byKind[k] || '·'}</span>`)}<span className="num tot">${r.d.total}</span><span className="num hol">${r.d.hol}</span><span className="num last">${r.d.last ? dm(r.d.last) : '—'}${r.d.last && isHol(state.settings, r.d.last) ? ' ★' : ''}</span></div>`}/>
    </div></div></div>`}
    <p className="note" style=${{ margin: '8px 0 0' }}>${view === 'list' && !allM ? monLbl(ym) + ': μετρούν μόνο οι υπηρεσίες του μήνα, χωρίς τις προηγούμενες. ' : ''}Κάθε υπηρεσία κρατιέται με την ημερομηνία της (★ = ΣΚ ή αργία). Πάτα σε άτομο για όλο το ημερολόγιο.</p>
  <//>`;
}

function RulesDialog({ onClose }: P) {
  const { state, run } = useStore(); const toast = useToast();
  const [r, setR] = useState(state.rules);
  return html`<${Dialog} title="Κανόνες υπηρεσιών" description="Ισχύουν στην επιλογή ατόμου και στην αυτόματη συμπλήρωση." onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${async () => { if (await run({ t: 'setRules', rules: r, text: RULE_TXT(r) }, false)) { onClose(); toast({ text: 'Οι κανόνες άλλαξαν: ' + RULE_TXT(r) }); } }}>Αποθήκευση<//>`}>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${r.noConsecHol} onChange=${(e: any) => setR({ ...r, noConsecHol: e.target.checked })}/><span><b>Όχι αργία ή ΣΚ δύο συνεχόμενες εβδομάδες</b><small>Όποιος έκανε υπηρεσία σε ΣΚ ή αργία δεν μπαίνει στο επόμενο ΣΚ/αργία (Κ-13), ούτε σε αργία δύο μέρες μετά (π.χ. Παρασκευή αργία και Κυριακή).</small></span></label>
    <div className="field"><label className="field__label" htmlFor="rrest">Ανάπαυση μετά από υπηρεσία (Κ-14)</label><select id="rrest" className="ui-input" value=${r.restDays} onChange=${(e: any) => setR({ ...r, restDays: +e.target.value })}><option value="0">Χωρίς</option><option value="1">1 ημέρα (όχι δύο μέρες στη σειρά)</option><option value="2">2 ημέρες</option></select></div>
    <div className="field"><label className="field__label" htmlFor="rnum">3ο και 4ο νούμερο</label><select id="rnum" className="ui-input" value=${r.numRest || 0} onChange=${(e: any) => setR({ ...r, numRest: +e.target.value })}><option value="0">Χωρίς περιορισμό</option><option value="3">Ξανά στο ίδιο νούμερο μετά από 3 ημέρες</option><option value="4">Μετά από 4 ημέρες</option></select><span className="note">Ισχύει μαζί με την ανάπαυση: όποιος ήταν 3ος ή 4ος (θαλαμοφύλακας, οπλοφύλακας, σκοπός) δεν ξαναμπαίνει στο ίδιο νούμερο νωρίτερα.</span></div>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${!!r.strictUnarmed} onChange=${(e: any) => setR({ ...r, strictUnarmed: e.target.checked })}/><span><b>Αυστηρά Άοπλοι</b><small>${STRICT_TXT}${opState(state) ? ' Τώρα: ' + opState(state) + '.' : ''} Όταν είναι κλειστό, ισχύει η κανονική σειρά.</small></span></label>
    <div className="field"><span className="field__label">Πάντα ισχύουν</span><span className="note" style=${{ fontSize: '13px' }}>Ένοπλες θέσεις χωρίς ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ (Κ-01) · όχι όποιος έχει άδεια ή απουσιάζει (Κ-02) · ΕΟ και ΕΑ όχι σε μαγειρεία, και σε σκοπιά μόνο αν δεν υπάρχει άλλος · η «Δυνατότητα υπηρεσιών» κάθε ατόμου (Κ-15) · ένα άτομο σε μία θέση τη μέρα · οι μόνιμοι Λ/Υ και Δ/Υ μπαίνουν μόνοι τους, εκτός σειράς.</span></div>
    <div className="field"><span className="field__label">Πώς διαλέγει η αυτόματη συμπλήρωση</span><ol className="note fairlist">
      <li>Πρώτα κρατά μόνο όσους επιτρέπουν <b>όλοι</b> οι παραπάνω κανόνες. Κανόνας δεν παραβαίνεται ποτέ σιωπηλά: αν δεν βρεθεί κανείς, η θέση μένει κενή και το λέει.</li>
      <li>Σε άοπλη θέση αφήνει τελευταίους όσους χρειάζονται για να γεμίσουν οι ένοπλες θέσεις της μέρας. Όταν οι ένοπλοι φτάνουν, όλοι (και οι ΕΑ/ΕΟ) μπαίνουν με τη σειρά δικαιοσύνης.</li>
      <li>Σε ΣΚ ή αργία: όποιος έχει κάνει τις <b>λιγότερες αργίες</b>, και μετά όποιος έκανε αργία πιο παλιά.</li>
      <li>Σε καθημερινή: όποιος έχει τις <b>περισσότερες μέρες χωρίς υπηρεσία</b>, και μετά τις λιγότερες υπηρεσίες συνολικά.</li>
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
  const g = state.guards[date] || {}; const seatless = state.dutyLog?.[date] || [];
  const posts = postsOf(state.settings);
  const pm = personMap(state.people);
  const blocks = blocksOf(state.settings) || state.settings.blocks; const phase = state.settings.phase || 'sven';
  const empty = posts.filter(x => !g[x.k]);
  const printed = state.printed[date];
  const st = dutyStats(state);
  const people = activePeople(state);
  const excluded = useMemo(() => {
    const noDuty: P[] = [], unarmed: P[] = [];
    people.forEach(p => { const ss = statusesOn(state.statuses, p.id, date); const a = ss.find(s => TYPES[s.type].noDuty); if (a) { noDuty.push({ p, s: a }); return; } const b = ss.find(s => TYPES[s.type].noArmed); if (b) unarmed.push({ p, s: b }); });
    // με πόστο: χωριστά, με το πόστο τους (μόνο Λ/Υ και Δ/Υ)
    const posted = people.filter(p => p.post && !noDuty.some(x => x.p === p));
    const capped = people.filter(p => !p.post && Object.keys(capsOf(state, p.id)).length).map(p => ({ p, c: capsOf(state, p.id) }));
    const offDay = people.filter(p => !noDuty.some(x => x.p === p) && offDayBlock(state, date, p.id)).map(p => ({ p }));
    return { noDuty, unarmed, posted, capped, offDay };
  }, [state.statuses, state.caps, state.people, date]);
  const model = useMemo(() => frouraSheet(state, date), [state, date]);
  // «Γιατί αυτός;» μία φορά ανά αλλαγή, όχι σε κάθε απόδοση (π.χ. όσο γράφεις αιτία στο παράθυρο «παρά τον κανόνα»)
  const why = useMemo(() => whyAll(state, date), [state.guards, state.people, state.settings, state.baseline, date]);
  const [force, setForce] = useState<{ k: string; p: Person; why: string; reason: string; swapWith?: string } | null>(null);
  const [skipped, setSkipped] = useState<Record<string, number[]>>({});
  useEffect(() => setSkipped({}), [date]);
  // Παλιές μέρες κλειδωμένες, για να μην αλλάξει κατά λάθος ο έλεγχος υπηρεσιών· ξεκλειδώνουν για διόρθωση
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const locked = date < today && !unlocked[date];
  const [addOpen, setAddOpen] = useState(false);
  const [fixedOpen, setFixedOpen] = useState(false);
  // κάρτες που κλείνουν: πλήρη μπλοκ κλειστά, με κενά ανοιχτά. Ό,τι αλλάξεις με το χέρι μένει όσο δουλεύεις.
  const [fold, setFold] = useState<Record<string, boolean>>({});
  const flip = (id: string, open: boolean) => setFold(f => ({ ...f, [id]: !open }));
  const assign = useCallback(async (k: string, pid: number | null, instead?: number, reason?: string) => {
    const x = posts.find(q => q.k === k)!;
    if (await run({ t: 'assign', date, k, pid, force: reason }, false)) toast({ text: (pid ? shortName(pm.get(pid)!) + (instead ? ' αντί για ' + shortName(pm.get(instead)!) : '') + ' σε ' : 'Κενή η θέση ') + postTxt(x) + (printed ? ' · Είχε βγει Excel: χρειάζεται νέα εκτύπωση' : ''), actions: [undoMark()] });
  }, [date, printed, state]);
  // Κανόνας που παρακάμπτεται μόνο με αιτιολογία (ανάπαυση, ΣΚ, δυνατότητα)· καταστάσεις και «ήδη σε θέση» ποτέ
  const blocked = useCallback((k: string, p: Person, why: string) => {
    const x = posts.find(q => q.k === k)!;
    const other = postOf(state, date, p.id, k);
    // ήδη σε άλλη θέση και η θέση μας έχει κάποιον: ανταλλαγή των δύο
    if (other && g[k] && !dutyBlock(state.statuses, date, p.id, x)) {
      const chk = swapCheck(state, date, k, other.k);
      if (chk.hard) { toast({ text: 'Δεν γίνεται ανταλλαγή: ' + chk.hard }); return; }
      if (chk.soft) { setForce({ k, p, why: chk.soft, reason: '', swapWith: other.k }); return; }
      swap(k, other.k); return;
    }
    if (dutyBlock(state.statuses, date, p.id, x) || other) { toast({ text: shortName(p) + ' δεν μπαίνει: ' + why }); return; }
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
  const pill = (list: P[]) => html`<div className="avail">${list.map(({ p, s }: P) => html`<span key=${p.id} className="na">${shortName(p)} <${Badge} tone=${TYPES[s.type as TypeKey].tone} data-tip=${TYPES[s.type as TypeKey].long}>${TYPES[s.type as TypeKey].label}<//></span>`)}</div>`;
  const autofill = async () => { const ns = await run({ t: 'autofill', date }, false); const left = ns ? postsOf(ns.settings).filter(x => !(ns.guards[date] || {})[x.k]).length : 0; if (ns) toast({ text: left ? 'Συμπληρώθηκαν όσες θέσεις γινόταν. ' + left + (left === 1 ? ' έμεινε κενή' : ' έμειναν κενές') + ' γιατί κανείς δεν επιτρέπεται εκεί με τους κανόνες.' : 'Συμπληρώθηκαν οι κενές θέσεις με τη σειρά δικαιοσύνης, τηρώντας όλους τους κανόνες', actions: [undoMark()] }); };
  const [preview, setPreview] = useState(false);
  const fileName = 'ΦΡΟΥΡΑ ' + (phase === 'spen' ? 'ΣΠΕΝ ' : '') + dmy(date).replace(/\//g, '-') + '.xlsx';
  const sheet = () => html`<${ExcelSheet} model=${model} fileName=${fileName} sheetName=${phase === 'spen' ? 'ΦΡΟΥΡΑ ΣΠΕΝ' : 'ΦΡΟΥΡΑ ΣΒΕΝ'} meta=${(empty.length ? '⚠ ' + empty.length + ' κενές' : '✓ Πλήρης') + ' · A4 οριζόντιο'}/>`;
  const left = html`<div className="guard__left">
    ${locked && html`<${Alert} tone="info"><span>Περασμένη μέρα: οι θέσεις είναι κλειδωμένες για να μην αλλάξει κατά λάθος ο έλεγχος υπηρεσιών.</span><${Button} size="sm" variant="outline" onClick=${() => setUnlocked({ ...unlocked, [date]: true })}>Ξεκλείδωσε για διόρθωση<//><//>`}
    ${printed && html`<${Alert} tone="info"><span>Βγήκε Excel για αυτή τη μέρα στις <b>${printed}</b>. Αν αλλάξεις κάτι, βγάλ' το ξανά.</span><//>`}
    <div className="guard__bar"><${Segmented} small=${true} value=${phase} onChange=${(v: Phase) => run({ t: 'setPhase', phase: v })} items=${[{ value: 'sven', label: 'ΦΡΟΥΡΑ ΣΒΕΝ', tip: '2 πίνακες θαλαμοφυλάκων και μαγειρεία' }, { value: 'spen', label: 'ΦΡΟΥΡΑ ΣΠΕΝ', tip: 'Θαλαμοφύλακες, οπλοφύλακες, σκοποί, ΤΑΕ, μαγειρεία' }]}/>${empty.length ? html`<${Badge} tone="bad">${empty.length} κενές από ${posts.length}<//>` : html`<${Badge} tone="ok">Πλήρης<//>`}
      <span className="guard__rules">${isHol(state.settings, date) && html`<${Badge} tone="warn" data-tip="Μετρά ως αργία στον έλεγχο υπηρεσιών">Αργία: ${holName(state.settings, date)}<//>`}</span>
      ${!locked && Object.keys(g).length > 0 && html`<${Button} size="sm" variant="ghost" onClick=${async () => { if (await run({ t: 'clearDay', date }, false)) toast({ text: 'Καθαρίστηκαν οι θέσεις ' + dm(date), actions: [undoMark()] }); }}>Καθάρισε<//>`}
      <${Button} variant="outline" size="sm" onClick=${() => setAddOpen(true)} data-tip="Π.χ. σκοπιά, πύλη, ΤΑΕ. Μπαίνει στο έντυπο σε δική της γραμμή.">+ Νέα υπηρεσία<//></div>
    ${psk && html`<div className="psk"><div><b>Φρουρά ΠΣΚ</b><small>${psk.map(d => dow(d) + ' ' + dm(d) + ': ' + (pskEmpty(d) ? pskEmpty(d) + ' κενές' : 'πλήρης')).join(' · ')}</small></div>
      <span className="psk__acts"><${Button} size="sm" variant="outline" disabled=${!people.length || psk.every(d => !pskEmpty(d)) || psk.some(d => d < today && !unlocked[d])} onClick=${async () => { if (await run({ t: 'autofillRange', dates: psk.filter(d => pskEmpty(d)) }, false)) toast({ text: 'Συμπληρώθηκε το ΠΣΚ ' + dm(psk[0]) + '–' + dm(psk[2]) + ', μία μέρα μετά την άλλη, με τους κανόνες και ανάμεσά τους.', actions: [undoMark()] }); }} data-tip="Γεμίζει Παρασκευή, Σάββατο και Κυριακή μαζί. Οι κανόνες (ανάπαυση, νούμερα, ΣΚ) ισχύουν και ανάμεσα στις τρεις μέρες.">Συμπλήρωση ΠΣΚ<//>
      <${Button} size="sm" variant="outline" disabled=${!!xb} onClick=${() => ex('frouraPsk', psk[0], 'η ΦΡΟΥΡΑ του ΠΣΚ')} data-tip="Ένα Excel με τρία φύλλα: Παρ, Σαβ, Κυρ">${xb === 'frouraPsk' ? 'Δημιουργία…' : 'Excel ΠΣΚ'}<//>
      <${Button} size="sm" variant="ghost" disabled=${!!xb} onClick=${() => ex('outsPsk', psk[0], 'οι εξοδούχοι του ΠΣΚ')} data-tip="Εξοδούχοι-παραμένοντες για τις τρεις μέρες, ένα φύλλο ανά μέρα">${xb === 'outsPsk' ? 'Δημιουργία…' : 'Εξοδούχοι ΠΣΚ'}<//></span></div>`}
    <div className="gtable">
      <div className="gtable__head post" aria-hidden="true"><span>Θέση · ώρες</span><span>Ποιος</span><span data-tip="Υπηρεσίες αυτού του είδους / σύνολο">Είδ./Σύν.</span><span></span></div>
      ${blocks.filter(b => !b.hidden).map(b => { const ps = posts.filter(x => x.block === b.id); const emp = ps.filter(x => !g[x.k]).length; const open = fold[b.id] ?? emp > 0;
        const names = ps.map(x => (g[x.k] ? shortName(pm.get(g[x.k])!) : null)).filter(Boolean).join(', ');
        return html`<section key=${b.id} className=${cx('gblock', !open && 'is-closed')}>
          <h2 className="gblock__hd"><button type="button" aria-expanded=${open} onClick=${() => flip(b.id, open)}>${Icon.chev}<span>${b.name}</span><span className="gblock__meta" data-tip=${b.armed ? 'Ένοπλη: δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ (Κ-01)' : 'Άοπλη: μπαίνουν και όσοι έχουν ΕΑ, ΕΟ, ΣΤΕΠ'}>· ${b.armed ? 'Ένοπλη' : 'Άοπλη'}</span><span className=${cx('gblock__meta', emp && 'is-bad')}>· ${emp ? emp + ' ' + (emp === 1 ? 'κενή' : 'κενές') : 'πλήρης'}</span></button>${!open && names && html`<span className="gblock__sum">${names}</span>`}</h2>
          ${open && html`<ul className="posts">${ps.map((x: Post) => { const pid = g[x.k]; const d = pid ? st.get(pid) || emptyStat() : null; return html`<${PostRow} key=${x.k} x=${x} pid=${pid} pm=${pm} date=${date} statuses=${state.statuses} duty=${d ? (d.byKind[x.kind] || 0) + ' / ' + d.total : ''} ruleWarn=${pid ? capBlock(state, date, pid, x) || ruleBlock(state, date, pid, undefined, x.k) || lastResort(state.statuses, date, pid, x) || statusWarn(state, date, pid) : null} why=${pid ? why[x.k] || '' : ''} locked=${locked} onAssign=${assign} onNext=${next} onBlocked=${blocked} unavailable=${(p: Person) => guardUnavailable(state, date, p.id, x.k)}/>`; })}</ul>${b.id === 'ly' && html`<${FixedLine} onEdit=${() => setFixedOpen(true)}/>`}`}
        </section>`; })}
    </div>
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
        <li><button type="button" className="linkish" aria-expanded=${!!fold.ex} onClick=${() => flip('ex', !!fold.ex)}><b>${excluded.capped.length}</b> μόνιμα όχι σε κάποιες θέσεις</button></li>
        ${excluded.offDay.length > 0 && html`<li><button type="button" className="linkish" aria-expanded=${!!fold.ex} onClick=${() => flip('ex', !!fold.ex)}><b>${excluded.offDay.length}</b> όχι υπηρεσία ${DOW_FULL[weekday(date)]}</button></li>`}
      </ul>
      ${fold.ex ? html`<div className="side__more">
        <h3 className="minihd">Σε καμία υπηρεσία (${excluded.noDuty.length})</h3>${pill(excluded.noDuty)}
        <h3 className="minihd">Μόνο σε άοπλες θέσεις (${excluded.unarmed.length})</h3>${pill(excluded.unarmed)}
        ${excluded.posted.length > 0 && html`<h3 className="minihd">Με πόστο, μόνο Λ/Υ και Δ/Υ (${excluded.posted.length})</h3><div className="avail">${excluded.posted.map((p: Person) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => nav.openPerson(p.id)} data-tip="Από το φύλλο ΠΟΣΤΑ (Αρχεία Excel)">${shortName(p)} <${Badge} tone="outline">${p.post}<//></button>`)}</div>`}
        <h3 className="minihd">Μόνιμα όχι σε κάποιες θέσεις (${excluded.capped.length})</h3><div className="avail">${excluded.capped.map(({ p, c }: P) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => nav.openPerson(p.id)} data-tip=${Object.keys(c).map(k => CAP_KINDS.find(x => x[0] === k)![1] + ': ' + c[k]).join(' · ')}>${shortName(p)} <${Badge} tone="outline">όχι ${Object.keys(c).map(k => (KIND_LBL as P)[k]).join(', ')}<//></button>`)}</div>
        ${excluded.offDay.length > 0 && html`<h3 className="minihd">Όχι υπηρεσία ${DOW_FULL[weekday(date)]} (${excluded.offDay.length})</h3><div className="avail">${excluded.offDay.map(({ p }: P) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => nav.openPerson(p.id)} data-tip="Από την κάρτα του, «Μέρες»">${shortName(p)}</button>`)}</div>`}
        <p className="note" style=${{ margin: '10px 0 0' }}>Βγαίνει από τα ιατρικά, τις άδειες και τις εξόδους. Όταν λήξει ένα ιατρικό, ο άνθρωπος ξαναμπαίνει μόνος του.</p>
        <${Button} size="sm" variant="ghost" onClick=${() => flip('ex', true)}>Λιγότερα<//></div>` : html`<button type="button" className="side__link" onClick=${() => flip('ex', false)}>Ποιοι είναι</button>`}
    </section>
    <section className="xlcard">
      <h2 className="xlcard__hd">Excel</h2>
      <p><span className="mono">${fileName}</span> · A4 οριζόντιο. ${empty.length ? 'Με ' + empty.length + (empty.length === 1 ? ' κενή γράφεται' : ' κενές γράφεται') + ' «ΚΕΝΗ».' : 'Πλήρες.'}</p>
      <${Button} variant="outline" onClick=${() => setPreview(true)}>Προεπισκόπηση<//>
      <${Button} variant="outline" disabled=${!!xb} onClick=${exportX}>${xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>
      <${PrintButton} kind="froura" date=${date} label="η κατάσταση υπηρεσιών"/>
      <${TemplateNote} ids=${['froura', 'check']}/>
    </section>
  </div>`;
  const xl = html`<div className="guard__xl">${sheet()}<div className="toolbar" style=${{ marginTop: '10px' }}><${Button} disabled=${!!xb} onClick=${exportX}>${xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//><${PrintButton} kind="froura" date=${date} label="η κατάσταση υπηρεσιών" variant="outline"/></div><${TemplateNote} ids=${['froura', 'check']}/></div>`;
  const check = html`<${DutyCheck} onOpen=${nav.openPerson}/>`;
  const tabs = [{ value: 'posts', label: 'Θέσεις' + (empty.length ? ' (' + empty.length + ')' : '') }, { value: 'check', label: mobile ? 'Έλεγχος' : 'Έλεγχος υπηρεσιών' }].concat(mobile ? [{ value: 'xl', label: 'Excel' }] : []);
  const cur = !mobile && tab === 'xl' ? 'posts' : tab;
  const emptyOn = (d: string) => { const gd = state.guards[d] || {}; let n = 0; for (const x of posts) if (!gd[x.k]) n++; return n; };
  return html`<div>
    <${PageHeader} title=${'Υπηρεσίες ' + DOW_GEN[parseD(date).getDay()] + ' ' + dm(date)} sub=${html`Κύκλος <b className="mono-lg">${dow(date)} ${dm(date)} 14:00 → ${dow(addDays(date, 1))} ${dm(addDays(date, 1))} 14:00</b>`}>
      <div className="page-head__acts"><${Button} variant="outline" onClick=${() => setRules(true)} data-tip=${'Ισχύουν: ' + RULE_TXT(state.rules)}>Κανόνες<//><label className="strict-sw" data-tip=${STRICT_TXT + (opState(state) ? ' Τώρα: ' + opState(state) + '.' : '')} data-tip-side="bottom"><input type="checkbox" className="ui-check" checked=${!!state.rules.strictUnarmed} onChange=${async (e: any) => { const on = e.target.checked; const nr = { ...state.rules, strictUnarmed: on }; if (await run({ t: 'setRules', rules: nr, text: RULE_TXT(nr) }, false)) toast({ text: 'Αυστηρά Άοπλοι: ' + (on ? 'ανοιχτό. Ισχύει στην αυτόματη συμπλήρωση και στο «Επόμενος».' : 'κλειστό, κανονική σειρά.') }); }}/>Αυστηρά Άοπλοι</label><${Button} disabled=${locked || !empty.length || !people.length} onClick=${autofill} data-tip="Γεμίζει τις κενές θέσεις μόνο με όσους επιτρέπουν οι κανόνες. Σειρά: αργίες, μέρες χωρίς υπηρεσία, λιγότερες υπηρεσίες, ίδιο είδος, κλήρωση. Λεπτομέρειες στο «Κανόνες»." data-tip-side="left">Αυτόματη συμπλήρωση<//>${!mobile && html`<${Button} variant="outline" disabled=${!!xb} onClick=${exportX}>${xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>`}</div><//>
    <div className="guard__days"><${DateBar} value=${date} onChange=${setDate} days=${[0, 1, 2, 3, 4, 5, 6].map(i => addDays(today, i))} count=${emptyOn}/></div>
    <div style=${{ marginBottom: '14px' }}><${Tabs} value=${cur} onChange=${setTab} items=${tabs}/></div>
    ${mobile ? (cur === 'posts' ? left : cur === 'check' ? check : xl) : (cur === 'posts' ? html`<div className="guard">${left}${side}</div>` : check)}
    ${preview && html`<${Dialog} size="xl" title=${'Προεπισκόπηση · ' + fileName} description="Ό,τι βλέπεις εδώ βγαίνει ίδιο στο Excel." onClose=${() => setPreview(false)}
      footer=${html`<${Button} variant="outline" onClick=${() => setPreview(false)}>Κλείσε<//><${PrintButton} kind="froura" date=${date} label="η κατάσταση υπηρεσιών" variant="outline"/><${Button} disabled=${!!xb} onClick=${exportX}>${xb === 'froura' ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>`}>${sheet()}<//>`}
    ${rules && html`<${RulesDialog} onClose=${() => setRules(false)}/>`}
    ${fixedOpen && html`<${FixedDialog} onClose=${() => setFixedOpen(false)}/>`}${addOpen && html`<${AddBlockDialog} onClose=${() => setAddOpen(false)}/>`}
    ${force && html`<${Dialog} title=${force.swapWith ? 'Ανταλλαγή παρά τον κανόνα;' : 'Βάλε τον ' + shortName(force.p) + ' παρά τον κανόνα;'} description=${force.why} onClose=${() => setForce(null)}
      footer=${html`<${Button} variant="outline" onClick=${() => setForce(null)}>Άκυρο<//><${Button} disabled=${!force.reason.trim()} onClick=${async () => { const f = force; setForce(null); if (f.swapWith) await swap(f.k, f.swapWith, f.reason.trim()); else await assign(f.k, f.p.id, g[f.k], f.reason.trim()); }}>${force.swapWith ? 'Ανταλλαγή' : 'Βάλ\' τον'}<//>`}>
      <p style=${{ marginTop: 0 }}>Ο κανόνας λέει όχι. Αν έγινε αλλαγή (π.χ. ΣΚ, άλλος αρρώστησε), γράψε γιατί. Γράφεται στο Ιστορικό και η θέση φαίνεται με ⚠.</p>
      <div className="field"><label className="field__label" htmlFor="frc">Αιτία *</label><input id="frc" className="ui-input" data-autofocus="" placeholder="π.χ. αλλαγή με συνάδελφο, εντολή λοχία" value=${force.reason} onChange=${(e: any) => setForce({ ...force, reason: e.target.value })}/></div>
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
export function AddBlockDialog({ onClose }: P) {
  const { state, run } = useStore(); const toast = useToast();
  const phase: Phase = state.settings.phase || 'sven';
  const [f, setF] = useState({ name: '', kind: 'other' as DutyKind, armed: false, n: 1, hrs: '' });
  const save = async () => { if (await run({ t: 'addBlock', phase, ...f }, false)) { onClose(); toast({ text: 'Προστέθηκε: ' + f.name + '. Τη βλέπεις στις θέσεις και στο έντυπο.' }); } };
  return html`<${Dialog} title="Νέα υπηρεσία" description=${'Στη ΦΡΟΥΡΑ ' + PHASE_NAME[phase] + '. Βγαίνει στο Excel σε δική της γραμμή κάτω από τα μαγειρεία.'} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!f.name.trim()} onClick=${save}>Προσθήκη<//>`}>
    <div className="field"><label className="field__label" htmlFor="nb-n">Όνομα *</label><input id="nb-n" className="ui-input" data-autofocus="" placeholder="π.χ. Πύλη, Σκοπιά ΤΑΕ" value=${f.name} onChange=${(e: any) => setF({ ...f, name: e.target.value })}/></div>
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="nb-k">Είδος (για τη δυνατότητα και τον έλεγχο)</label><select id="nb-k" className="ui-input" value=${f.kind} onChange=${(e: any) => setF({ ...f, kind: e.target.value, armed: e.target.value === 'op' || e.target.value === 'sk' ? true : f.armed })}>${(['other', 'sk', 'op', 'th', 'tae', 'mg'] as DutyKind[]).map(k => html`<option key=${k} value=${k}>${KIND_NAME[k]}</option>`)}</select></div>
      <div className="field"><label className="field__label" htmlFor="nb-c">Πόσα άτομα</label><input id="nb-c" type="number" min="1" max="10" className="ui-input" value=${f.n} onChange=${(e: any) => setF({ ...f, n: Math.max(1, Math.min(10, +e.target.value || 1)) })}/></div>
    </div>
    <div className="field"><label className="field__label" htmlFor="nb-h">Ώρες</label><input id="nb-h" className="ui-input" placeholder="π.χ. 08:00-20:00 (κενό = όλη μέρα)" value=${f.hrs} onChange=${(e: any) => setF({ ...f, hrs: e.target.value })}/></div>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${f.armed} onChange=${(e: any) => setF({ ...f, armed: e.target.checked })}/><span><b>Ένοπλη</b><small>Δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ</small></span></label>
  <//>`;
}

/* features/outs · Εξοδούχοι και ΔΝ (Κ-06 έως Κ-09, Κ-16) */
const OUT_OPTS = [{ value: '', label: 'Μένει' }, { value: 'OUT', label: 'Έξοδος' }, { value: 'DN', label: 'ΔΝ' }];
const roomsTxt = (rs: number[]) => rs[0] + '–' + rs[rs.length - 1];
const OutRow = memo(function OutRow({ p, style, reason, value, changed, onSet, onOpen, noDn }: P) {
  return html`<div className=${cx('orow', changed && 'is-changed', reason && 'is-blocked')} style=${style}>
    <div><button type="button" className="linkish" onClick=${() => onOpen(p.id)}><b>${fullName(p)}</b></button><small>${roomTxt(p)} · ${unitOf(p)}${p.dn ? ' · δικαίωμα ΔΝ' : ''}</small></div>
    ${reason ? html`<${Badge} tone="outline" data-tip="Δεν βγαίνει έξοδο σύμφωνα με τους κανόνες">✕ ${reason}<//>` :
    html`<div className="ui-seg ui-seg--sm" role="group" aria-label=${'Έξοδος ' + fullName(p)}>${OUT_OPTS.map(o => { const off = o.value === 'DN' && noDn && value !== 'DN'; return html`<button key=${o.value} type="button" disabled=${off} data-tip=${off ? 'Δεν έχει δικαίωμα ΔΝ (ορίζεται στην καρτέλα του)' : undefined} aria-pressed=${(value || '') === o.value} onClick=${() => onSet(p.id, o.value || null)}>${o.label}</button>`; })}</div>`}
  </div>`;
});
export function OutsScreen() {
  const { state, run, today, tomorrow, undoMark } = useStore(); const toast = useToast(); const nav = useNav(); const mobile = useMedia('(max-width: 767px)');
  const date = nav.params.outDate || today;
  const nextDow = (w: number) => { for (let i = 0; i < 7; i++) { const d = addDays(today, i); if (parseD(d).getDay() === w) return d; } return today; };
  const outDays = [...new Set([today, tomorrow, nextDow(6), nextDow(0)])].sort();
  const rooms = outRoomsOn(state.rules, date);
  const people = activePeople(state);
  const saved = useMemo(() => { const m: Record<number, TypeKey> = {}; state.statuses.forEach(s => { if (TYPES[s.type].cat === 'out' && s.from <= date && date <= s.to) m[s.pid] = s.type; }); return m; }, [state.statuses, date]);
  const [draft, setDraft] = useState(saved);
  // άλλη μέρα: από την αρχή. Ίδια μέρα και άλλαξαν οι καταστάσεις αλλού (δήλωση, ανάγνωση από Excel): ό,τι άλλαξες εδώ
  // και δεν άλλαξε αλλού μένει στο πρόχειρο, αντί να χαθεί
  const last = useRef({ saved, date });
  useEffect(() => {
    const old = last.current; last.current = { saved, date };
    if (old.date !== date) { setDraft(saved); return; }
    if (old.saved === saved) return;
    setDraft(d => {
      const n: Record<number, TypeKey> = { ...saved };
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
  const changes = useMemo(() => people.filter(p => (saved[p.id] || null) !== (draft[p.id] || null)).map(p => ({ pid: p.id, from: saved[p.id] || null, to: draft[p.id] || null })), [saved, draft, people]);
  const cnt = (t: string) => Object.keys(draft).filter(k => (draft as P)[k] === t).length;
  const blockedN = people.filter(p => reasons[p.id]).length;
  const stayN = people.filter(p => !draft[p.id] && !statusesOn(state.statuses, p.id, date).some(s => TYPES[s.type].away && TYPES[s.type].cat !== 'out')).length;
  const set = useCallback((pid: number, v: TypeKey | null) => setDraft(d => { const n = { ...d }; if (v) n[pid] = v; else delete n[pid]; return n; }), []);
  const open = useCallback((id: number) => nav.openPerson(id), [nav.openPerson]);
  const byRooms = () => {
    if (!rooms) return;
    const n: Record<number, TypeKey> = {}; people.forEach(p => { if (p.room != null && rooms.includes(p.room) && !reasons[p.id]) n[p.id] = draft[p.id] === 'DN' ? 'DN' : 'OUT'; }); setDraft(n);
    const kept = people.filter(p => p.room != null && rooms.includes(p.room) && reasons[p.id]).length;
    toast({ text: 'Πρόταση: θάλαμοι ' + roomsTxt(rooms) + ' έξω (' + Object.keys(n).length + '). ' + kept + ' από αυτούς μένουν λόγω κανόνων και μπαίνουν στους Παραμένοντες.' });
  };
  const allCan = () => setDraft(d => { const n = { ...d }; people.forEach(p => { if (!reasons[p.id] && !n[p.id] && (room == null || p.room === room)) n[p.id] = 'OUT'; }); return n; });
  const height = useViewportHeight(mobile ? 380 : 330);
  const c0 = strengthOf(state, date);
  const awayDelta = changes.reduce((a, c) => a + (c.to ? 1 : 0) - (c.from ? 1 : 0), 0);
  const save = async () => { if (await run({ t: 'outs', date, changes }, false)) { setConfirm(false); toast({ text: 'Αποθηκεύτηκαν οι εξοδούχοι ' + dm(date) + ' (' + changes.length + ' αλλαγές)', actions: [undoMark()] }); } };
  const rh = useRowH(mobile ? 96 : 52, mobile ? 96 : 44);
  return html`<div>
    <${PageHeader} title=${'Εξοδούχοι ' + DOW_GEN[parseD(date).getDay()] + ' ' + dmy(date)} sub="Διάλεξε ποιοι βγαίνουν και ποιοι με ΔΝ. Όσοι έχουν υπηρεσία, ΕΥ, ΣΤΕΠ ή ποινή δεν επιλέγονται."><${DateBar} value=${date} onChange=${(d: string) => nav.set({ outDate: d })} days=${outDays}/><//>
    ${rooms ? html`<${Alert} tone="info"><span>${parseD(date).getDay() === 6 ? 'Σάββατο' : 'Κυριακή'}: βγαίνουν οι <b>θάλαμοι ${roomsTxt(rooms)}</b>, μένουν οι υπόλοιποι (Κ-16). <${Button} size="sm" variant="secondary" onClick=${byRooms}>Πρότεινε θαλάμους ${roomsTxt(rooms)}<//></span><//>` : null}
    <div className="bulkbar outbar"><span>Έξοδος <b>${cnt('OUT')}</b> · ΔΝ <b>${cnt('DN')}</b> · Παραμένοντες <b>${stayN}</b> <span className="muted">(${blockedN} λόγω κανόνων)</span></span>
      ${changes.length ? html`<${Button} size="sm" variant="ghost" onClick=${() => setDraft(saved)}>Ακύρωση<//><${Button} size="sm" onClick=${() => setConfirm(true)}>Αποθήκευση (${changes.length})<//>` : html`<${Button} size="sm" variant="secondary" onClick=${allCan} data-tip="Βάζει «Έξοδος» σε όλους όσοι επιτρέπεται και δεν έχουν ήδη επιλογή">${room == null ? 'Όλοι όσοι μπορούν: έξοδος' : 'Θάλαμος ' + room + ': όσοι μπορούν έξοδος'}<//>`}</div>
    <div className="toolbar"><${Strip} className="chips" role="group" aria-label="Θάλαμος"><button type="button" className="ui-chip" aria-pressed=${room == null} onClick=${() => setRoom(null)}>Όλοι οι θάλαμοι</button>${roomList.map(r => { const n = people.filter(p => p.room === r); const out = n.filter(p => draft[p.id]).length; return html`<button key=${r} type="button" className="ui-chip" aria-pressed=${room === r} onClick=${() => setRoom(room === r ? null : r)} data-tip=${out + ' από ' + n.length + ' βγαίνουν'}>Θ${r}<span className="cnt">${out}/${n.length}</span></button>`; })}<//>
      <${Segmented} small=${true} value=${sort} onChange=${setSort} items=${[{ value: 'room', label: 'Ανά θάλαμο' }, { value: 'name', label: 'Αλφαβητικά' }]}/></div>
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση" placeholder="Επώνυμο ή όνομα (χωρίς τόνους)" value=${q} onChange=${(e: any) => setQ(e.target.value)}/></div>
    <div className="toolbar"><${Strip} className="chips" role="group" aria-label="Φίλτρα">${[['all', 'Όλοι', people.length], ['can', 'Μπορούν να βγουν', people.length - blockedN], ['cant', 'Δεν μπορούν', blockedN], ['sel', 'Επιλεγμένοι', cnt('OUT') + cnt('DN')]].map(([k, l, n]) => html`<button key=${k} type="button" className="ui-chip" aria-pressed=${filter === k} onClick=${() => setFilter(k as string)}>${l}<span className="cnt">${n}</span></button>`)}<//><${ActiveFilter} parts=${[room != null && 'Θάλαμος ' + room, filter !== 'all' && ({ can: 'Μπορούν να βγουν', cant: 'Δεν μπορούν', sel: 'Επιλεγμένοι' } as P)[filter], dq && '«' + dq + '»']} onClear=${() => { setFilter('all'); setQ(''); setRoom(null); }}/><span className="toolbar__count">${rows.length} άτομα</span></div>
    <div className="toolbar"><${ExportButton} kind="outs" date=${date} label="οι εξοδούχοι και παραμένοντες" variant="outline" size="sm" disabled=${changes.length > 0}/>${changes.length > 0 && html`<span className="note">Αποθήκευσε πρώτα τις αλλαγές.</span>`}<${TemplateNote} ids=${['outs']}/></div>
    <div className="ui-card" style=${{ overflow: 'hidden' }}>${rows.length ? html`<${VirtualList} items=${rows} resetKey=${filter + '|' + dq + '|' + date + '|' + room + '|' + sort} rowHeight=${rh} height=${height} renderRow=${(p: Person, _i: number, style: P) => html`<${OutRow} key=${p.id} p=${p} style=${style} reason=${reasons[p.id]} value=${draft[p.id]} changed=${(saved[p.id] || null) !== (draft[p.id] || null)} onSet=${set} onOpen=${open} noDn=${dnSet && !p.dn}/>`}/>` : html`<div className="empty">Κανείς σε αυτό το φίλτρο.</div>`}</div>
    ${confirm && html`<${Dialog} title="Τι θα αλλάξει" description=${'Εξοδούχοι ' + dayName(date, today).toLowerCase() + ' ' + dm(date)} onClose=${() => setConfirm(false)} footer=${html`<${Button} variant="outline" onClick=${() => setConfirm(false)}>Πίσω<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
      <ul className="hist">${changes.map(c => html`<li key=${c.pid}><b>${shortName(personMap(state.people).get(c.pid)!)}</b> <span className="muted">${c.from ? TYPES[c.from].label : 'Μένει'} →</span> ${c.to ? html`<${Badge} tone=${TYPES[c.to].tone}>${TYPES[c.to].label}<//>` : 'Μένει'}</li>`)}</ul>
      <p className="note" style=${{ margin: 0 }}>Παρόντες απόψε: ${c0.present} → ${c0.present - awayDelta}. Οι Παραμένοντες βγαίνουν στο Excel με τον λόγο στις Παρατηρήσεις.</p>
    <//>`}
  </div>`;
}
