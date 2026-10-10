// features/guard (Κατάσταση υπηρεσιών, έλεγχος) και features/outs (εξοδούχοι, ΔΝ)
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Card, Dialog, Icon, PageHeader, Segmented, Tabs, VirtualList, useMedia, useToast, useViewportHeight } from '../ui';
import { useNav, useStore, searchPeople } from '../store';
import { ActiveFilter, DateBar, ExcelSheet, ExportButton, PersonPicker, TemplateNote, useExport } from '../common';
import { frouraSheet, checkSheet } from '../sheets';
import { TYPES, CAP_KINDS, KIND_LBL, fullName, shortName, unitOf, roomTxt, postTxt, type Person, type Post, type TypeKey } from '../../shared/domain';
import { whyText, fillDay, capBlock, capsOf, dutyBlock, dutyStats, emptyStat, guardUnavailable, holName, isHol, outBlock, outRoomsOn, personMap, postsOf, ruleBlock, statusesOn, strengthOf, activePeople } from '../../shared/rules';
import { addDays, dayName, dm, dmy, dow, parseD, DOW_GEN, MONTHS } from '../../shared/dates';
import { collator, norm } from '../../shared/text';
type P = any;

const RULE_TXT = (r: P) => [r.restDays ? 'ανάπαυση ' + r.restDays + ' ημ. μετά από υπηρεσία' : 'χωρίς ανάπαυση', r.noConsecHol ? 'όχι αργία/ΣΚ δύο συνεχόμενες εβδομάδες' : 'αργίες χωρίς περιορισμό'].join(', ');

function PostRow({ x, pid, date, statuses, duty, ruleWarn, why, onAssign, unavailable, pm }: P) {
  const p = pid && pm.get(pid); const r = pid && (dutyBlock(statuses, date, pid, x) || ruleWarn);
  return html`<li className=${cx('post', !p && 'is-empty')}><div className="post__pos"><b>${x.short}</b><small>${x.slots ? x.slots.map((t: string, i: number) => html`<span key=${i} className="nw">${(i ? ' · ' : '') + t}</span>`) : x.hours}</small></div>
    <div className="post__slot">${p ? html`<span className="post__who"><span className="post__name">${fullName(p)}</span>${why && html`<small className="post__why" data-tip="Γιατί αυτός; Η σειρά δικαιοσύνης είναι στο κουμπί «Κανόνες»">Γιατί: ${why}</small>`}</span>${r && html`<${Badge} tone="bad" data-tip="Πέρασε παρά τον κανόνα">⚠ ${r}<//>`}<span className="duty" data-tip="Υπηρεσίες αυτού του είδους / σύνολο" data-tip-side="left">${duty}</span><${Button} variant="ghost" size="icon" aria-label="Αφαίρεση από τη θέση" data-tip="Αφαίρεση από τη θέση" data-tip-side="left" onClick=${() => onAssign(x.k, null)}>${Icon.x}<//>` :
    html`<div style=${{ flex: 1, minWidth: 0 }}><${PersonPicker} id=${'gp-' + x.k} placeholder="Διάλεξε άτομο…" date=${date} unavailable=${unavailable} onChange=${(id: number) => onAssign(x.k, id)}/></div>`}</div></li>`;
}

function DutyCheck({ onOpen }: P) {
  const { state, today } = useStore();
  const [q, setQ] = useState(''); const dq = useDeferredValue(q); const [hol, setHol] = useState(false); const [view, setView] = useState('list');
  const [ym, setYm] = useState(today.slice(0, 7));
  const st = dutyStats(state);
  const kinds = [...new Set(postsOf(state.settings).map(p => p.kind))];
  const grid = useMemo(() => (view === 'grid' ? checkSheet(state, ym) : null), [view, state, ym]);
  const rows = useMemo(() => searchPeople(state.people, dq).map(p => ({ p, d: st.get(p.id) || emptyStat() })).sort((a, b) => (hol ? a.d.hol - b.d.hol : 0) || a.d.total - b.d.total || collator.compare(a.p.last, b.p.last)), [dq, st, hol, state.people]);
  const mon = MONTHS[+ym.slice(5) - 1];
  return html`<${Card} title="Έλεγχος υπηρεσιών" actions=${html`<${Badge} tone="ok" data-tip="Βγαίνει από το ημερολόγιο υπηρεσιών (ποιος, ποια μέρα, ποια θέση) (Κ-03)" data-tip-side="left">Ενημερώνεται αυτόματα<//>`}>
    <div className="toolbar"><${Segmented} value=${view} onChange=${setView} items=${[{ value: 'list', label: 'Λίστα' }, { value: 'grid', label: 'Μηνιαίο πλέγμα (Excel)' }]}/>
      ${view === 'grid' && html`<input type="month" className="ui-input" style=${{ width: '170px' }} value=${ym} onChange=${(e: any) => e.target.value && setYm(e.target.value)}/><${ExportButton} kind="check" date=${ym + '-01'} label=${'Έλεγχος υπηρεσιών ' + mon} size="sm"/>`}</div>
    ${view === 'grid' ? html`<${ExcelSheet} model=${grid} fileName=${'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ' + norm(mon) + '.xlsx'} sheetName="ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ" meta="A4 οριζόντιο" footer="Γκρι στήλες: ΣΚ και αργίες, από το ημερολόγιο. Θ θαλαμοφύλακας · Μ μαγειρεία · ΛΥ Λ/Υ-Δ/Υ. Στο Excel γράφεται και ο λόγος απουσίας."/>` : html`<div>
    <div className="toolbar" style=${{ marginBottom: 0 }}><input type="search" className="ui-input" aria-label="Αναζήτηση στον έλεγχο" placeholder="Αναζήτηση…" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${Segmented} value=${hol ? 'hol' : 'all'} onChange=${(v: string) => setHol(v === 'hol')} items=${[{ value: 'all', label: 'Λιγότερες συνολικά' }, { value: 'hol', label: 'Λιγότερες αργίες' }]}/><${ActiveFilter} parts=${[dq && '«' + dq + '»']} onClear=${() => setQ('')}/><span className="toolbar__count">${rows.length} άτομα</span></div>
    <div className="chk"><div className="chk__in">
      <div className="chk__head" style=${{ gridTemplateColumns: 'minmax(130px,1fr) repeat(' + (kinds.length + 2) + ',52px) 70px' }}><span>Ονοματεπώνυμο</span>${kinds.map(k => html`<span key=${k}>${KIND_LBL[k]}</span>`)}<span>Σύν.</span><span data-tip="Υπηρεσίες σε ΣΚ ή επίσημη αργία">Αργ.</span><span>Τελευταία</span></div>
      <${VirtualList} items=${rows} rowHeight=${36} height=${380} renderRow=${(r: P, _i: number, style: P) => html`<div key=${r.p.id} className="chk__row" style=${{ ...style, gridTemplateColumns: 'minmax(130px,1fr) repeat(' + (kinds.length + 2) + ',52px) 70px' }} role="button" tabIndex="0" onClick=${() => onOpen(r.p.id)}><span>${shortName(r.p)}</span>${kinds.map(k => html`<span key=${k} className="num">${r.d.byKind[k] || '·'}</span>`)}<span className="num tot">${r.d.total}</span><span className="num hol">${r.d.hol}</span><span className="num last">${r.d.last ? dm(r.d.last) : '—'}${r.d.last && isHol(state.settings, r.d.last) ? ' ★' : ''}</span></div>`}/>
    </div></div></div>`}
    <p className="note" style=${{ margin: '8px 0 0' }}>Κάθε υπηρεσία κρατιέται με την ημερομηνία της (★ = ΣΚ ή αργία). Πάτα σε άτομο για όλο το ημερολόγιο.</p>
  <//>`;
}

function RulesDialog({ onClose }: P) {
  const { state, run } = useStore(); const toast = useToast();
  const [r, setR] = useState(state.rules);
  return html`<${Dialog} title="Κανόνες υπηρεσιών" description="Ισχύουν στην επιλογή ατόμου και στην αυτόματη συμπλήρωση." onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${async () => { if (await run({ t: 'setRules', rules: r, text: RULE_TXT(r) }, false)) { onClose(); toast({ text: 'Οι κανόνες άλλαξαν: ' + RULE_TXT(r) }); } }}>Αποθήκευση<//>`}>
    <label className="rule"><input type="checkbox" className="ui-check" checked=${r.noConsecHol} onChange=${(e: any) => setR({ ...r, noConsecHol: e.target.checked })}/><span><b>Όχι αργία ή ΣΚ δύο συνεχόμενες εβδομάδες</b><small>Όποιος έκανε υπηρεσία σε ΣΚ ή αργία δεν μπαίνει στο επόμενο ΣΚ/αργία (Κ-13).</small></span></label>
    <div className="field"><label className="field__label" htmlFor="rrest">Ανάπαυση μετά από υπηρεσία (Κ-14)</label><select id="rrest" className="ui-input" value=${r.restDays} onChange=${(e: any) => setR({ ...r, restDays: +e.target.value })}><option value="0">Χωρίς</option><option value="1">1 ημέρα (όχι δύο μέρες στη σειρά)</option><option value="2">2 ημέρες</option></select></div>
    <div className="field"><span className="field__label">Πάντα ισχύουν</span><span className="note" style=${{ fontSize: '13px' }}>Ένοπλες θέσεις χωρίς ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ (Κ-01) · όχι όποιος έχει άδεια ή απουσιάζει (Κ-02) · η «Δυνατότητα υπηρεσιών» κάθε ατόμου (Κ-15) · ένα άτομο σε μία θέση τη μέρα.</span></div>
    <div className="field"><span className="field__label">Πώς διαλέγει η αυτόματη συμπλήρωση</span><ol className="note fairlist">
      <li>Πρώτα κρατά μόνο όσους επιτρέπουν <b>όλοι</b> οι παραπάνω κανόνες. Κανόνας δεν παραβαίνεται ποτέ σιωπηλά: αν δεν βρεθεί κανείς, η θέση μένει κενή και το λέει.</li>
      <li>Σε άοπλη θέση προτιμά όσους δεν μπορούν να πάνε σε ένοπλη, για να μείνουν οι άλλοι για τις ένοπλες.</li>
      <li>Σε ΣΚ ή αργία: όποιος έχει κάνει τις <b>λιγότερες αργίες</b>, και μετά όποιος έκανε αργία πιο παλιά.</li>
      <li>Σε καθημερινή: όποιος έχει τις <b>περισσότερες μέρες χωρίς υπηρεσία</b>, και μετά τις λιγότερες υπηρεσίες συνολικά.</li>
      <li>Μετά: τις λιγότερες υπηρεσίες <b>στο ίδιο είδος</b> θέσης.</li>
      <li>Αν ισοβαθμούν σε όλα: κλήρωση με σπόρο την ημερομηνία, ώστε την ίδια μέρα να βγαίνει πάντα το ίδιο αποτέλεσμα.</li>
    </ol><span className="note">Δίπλα σε κάθε όνομα το «Γιατί:» γράφει ποιο κριτήριο τον έφερε.</span></div>
    <span className="note">Οι αναθέσεις που ήδη υπάρχουν δεν αλλάζουν· όσες παραβαίνουν τους νέους κανόνες φαίνονται με ⚠.</span>
  <//>`;
}

export function GuardScreen() {
  const { state, run, today, tomorrow, undo } = useStore(); const toast = useToast(); const nav = useNav(); const mobile = useMedia('(max-width: 767px)');
  const ex = useExport();
  const date = nav.params.guardDate || tomorrow; const setDate = (d: string) => nav.set({ guardDate: d });
  const [tab, setTab] = useState('posts'); const [rules, setRules] = useState(false);
  const g = state.guards[date] || {};
  const posts = postsOf(state.settings);
  const pm = personMap(state.people);
  const blocks = state.settings.blocks;
  const empty = posts.filter(x => !g[x.k]);
  const printed = state.printed[date];
  const st = dutyStats(state);
  const people = activePeople(state);
  const excluded = useMemo(() => {
    const noDuty: P[] = [], unarmed: P[] = [];
    people.forEach(p => { const ss = statusesOn(state.statuses, p.id, date); const a = ss.find(s => TYPES[s.type].noDuty); if (a) { noDuty.push({ p, s: a }); return; } const b = ss.find(s => TYPES[s.type].noArmed); if (b) unarmed.push({ p, s: b }); });
    const capped = people.filter(p => Object.keys(capsOf(state, p.id)).length).map(p => ({ p, c: capsOf(state, p.id) }));
    return { noDuty, unarmed, capped };
  }, [state.statuses, state.caps, state.people, date]);
  const model = useMemo(() => frouraSheet(state, date), [state, date]);
  const undoAct = { label: 'Αναίρεση', fn: () => { undo(); } };
  const assign = useCallback(async (k: string, pid: number | null) => {
    const x = posts.find(q => q.k === k)!;
    if (await run({ t: 'assign', date, k, pid }, false)) toast({ text: (pid ? shortName(pm.get(pid)!) + ' σε ' : 'Κενή η θέση ') + postTxt(x) + (printed ? ' · Είχε βγει Excel: χρειάζεται νέα εκτύπωση' : ''), actions: [undoAct] });
  }, [date, printed, state]);
  const exportX = () => ex('froura', date, 'η κατάσταση υπηρεσιών');
  const pill = (list: P[]) => html`<div className="avail">${list.map(({ p, s }: P) => html`<span key=${p.id} className="na">${shortName(p)} <${Badge} tone=${TYPES[s.type as TypeKey].tone} data-tip=${TYPES[s.type as TypeKey].long}>${TYPES[s.type as TypeKey].label}<//></span>`)}</div>`;
  const left = html`<div className="guard__left">
    ${printed && html`<${Alert} tone="info"><span>Βγήκε Excel για αυτή τη μέρα στις <b>${printed}</b>. Αν αλλάξεις κάτι, βγάλ' το ξανά.</span><//>`}
    <div className="guard__bar">${empty.length ? html`<${Badge} tone="bad">${empty.length} κενές από ${posts.length}<//>` : html`<${Badge} tone="ok">Πλήρης<//>`}
      <span className="guard__rules">${isHol(state.settings, date) && html`<${Badge} tone="warn" data-tip="Μετρά ως αργία στον έλεγχο υπηρεσιών">Αργία: ${holName(state.settings, date)}<//>`}<${Button} size="sm" variant="outline" onClick=${() => setRules(true)} data-tip=${'Ισχύουν: ' + RULE_TXT(state.rules)}>Κανόνες<//></span>
      ${Object.keys(g).length > 0 && html`<${Button} size="sm" variant="ghost" onClick=${async () => { if (await run({ t: 'clearDay', date }, false)) toast({ text: 'Καθαρίστηκαν οι θέσεις ' + dm(date), actions: [undoAct] }); }}>Καθάρισε<//>`}
      <${Button} size="sm" disabled=${!empty.length || !people.length} onClick=${async () => { const left = fillDay(state, date).empty.length; if (await run({ t: 'autofill', date }, false)) toast({ text: left ? 'Συμπληρώθηκαν όσες θέσεις γινόταν. ' + left + (left === 1 ? ' έμεινε κενή' : ' έμειναν κενές') + ' γιατί κανείς δεν επιτρέπεται εκεί με τους κανόνες.' : 'Συμπληρώθηκαν οι κενές θέσεις με τη σειρά δικαιοσύνης, τηρώντας όλους τους κανόνες', actions: [undoAct] }); }} data-tip="Γεμίζει τις κενές θέσεις μόνο με όσους επιτρέπουν οι κανόνες. Σειρά: αργίες, μέρες χωρίς υπηρεσία, λιγότερες υπηρεσίες, ίδιο είδος, κλήρωση. Λεπτομέρειες στο «Κανόνες»." data-tip-side="left">Αυτόματη συμπλήρωση<//></div>
    ${blocks.map(b => { const ps = posts.filter(x => x.block === b.id); const emp = ps.filter(x => !g[x.k]).length;
      return html`<${Card} key=${b.id} title=${html`${b.name} <${Badge} tone=${b.armed ? 'warn' : 'outline'} data-tip=${b.armed ? 'Ένοπλη: δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ (Κ-01)' : 'Άοπλη: μπαίνουν και όσοι έχουν ΕΑ, ΕΟ, ΣΤΕΠ'}>${b.armed ? 'Ένοπλη' : 'Άοπλη'}<//>`} actions=${emp ? html`<${Badge} tone="bad">${emp} ${emp === 1 ? 'κενή' : 'κενές'}<//>` : html`<${Badge} tone="ok">✓<//>`}>
        <ul className="posts">${ps.map((x: Post) => { const pid = g[x.k]; const d = pid ? st.get(pid) || emptyStat() : null; return html`<${PostRow} key=${x.k} x=${x} pid=${pid} pm=${pm} date=${date} statuses=${state.statuses} duty=${d ? (d.byKind[x.kind] || 0) + ' / ' + d.total : ''} ruleWarn=${pid ? capBlock(state, pid, x) || ruleBlock(state, date, pid) : null} why=${pid ? whyText(state, date, x.k) : ''} onAssign=${assign} unavailable=${(p: Person) => guardUnavailable(state, date, p.id, x.k)}/>`; })}</ul><//>`; })}
    <${Card} title=${'Ποιοι δεν μπαίνουν (' + dayName(date, today).toLowerCase() + ')'}>
      <h3 className="minihd">Σε καμία υπηρεσία (${excluded.noDuty.length})</h3>${pill(excluded.noDuty)}
      <h3 className="minihd">Μόνο σε άοπλες θέσεις (${excluded.unarmed.length})</h3>${pill(excluded.unarmed)}
      <h3 className="minihd">Μόνιμα όχι σε κάποιες θέσεις (${excluded.capped.length})</h3><div className="avail">${excluded.capped.map(({ p, c }: P) => html`<button key=${p.id} type="button" className="na linkish" onClick=${() => nav.openPerson(p.id)} data-tip=${Object.keys(c).map(k => CAP_KINDS.find(x => x[0] === k)![1] + ': ' + c[k]).join(' · ')}>${shortName(p)} <${Badge} tone="outline">όχι ${Object.keys(c).map(k => (KIND_LBL as P)[k]).join(', ')}<//></button>`)}</div>
      <p className="note" style=${{ margin: '10px 0 0' }}>Βγαίνει από τα ιατρικά, τις άδειες και τις εξόδους. Όταν λήξει ένα ιατρικό, ο άνθρωπος ξαναμπαίνει μόνος του.</p>
    <//>
  </div>`;
  const xl = html`<div className="guard__right"><${ExcelSheet} model=${model} fileName=${'ΦΡΟΥΡΑ ' + dmy(date).replace(/\//g, '-') + '.xlsx'} sheetName="ΦΡΟΥΡΑ ΣΒΕΝ" meta=${(empty.length ? '⚠ ' + empty.length + ' κενές' : '✓ Πλήρης') + ' · A4 οριζόντιο'}/>
    <div className="toolbar" style=${{ marginTop: '10px' }}><${Button} onClick=${exportX}>Βγάλε το Excel<//></div><${TemplateNote} ids=${['froura', 'check']}/></div>`;
  const check = html`<${DutyCheck} onOpen=${nav.openPerson}/>`;
  const tabs = [{ value: 'posts', label: 'Θέσεις' + (empty.length ? ' (' + empty.length + ')' : '') }, { value: 'check', label: mobile ? 'Έλεγχος' : 'Έλεγχος υπηρεσιών' }].concat(mobile ? [{ value: 'xl', label: 'Excel' }] : []);
  const cur = !mobile && tab === 'xl' ? 'posts' : tab;
  return html`<div>
    <${PageHeader} title=${'Υπηρεσίες ' + DOW_GEN[parseD(date).getDay()] + ' ' + dmy(date)} sub=${html`Κύκλος <b>${dow(date)} ${dm(date)} 14:00 → ${dow(addDays(date, 1))} ${dm(addDays(date, 1))} 14:00</b>. Όσοι δεν επιτρέπονται σε μια θέση φαίνονται γκρι με τον λόγο.`}><${DateBar} value=${date} onChange=${setDate} days=${[0, 1, 2, 3, 4, 5, 6].map(i => addDays(today, i))}/><//>
    <div style=${{ marginBottom: '12px' }}><${Tabs} value=${cur} onChange=${setTab} items=${tabs}/></div>
    ${mobile ? (cur === 'posts' ? left : cur === 'check' ? check : xl) : (cur === 'posts' ? html`<div className="guard">${left}${xl}</div>` : check)}
    ${rules && html`<${RulesDialog} onClose=${() => setRules(false)}/>`}
  </div>`;
}

/* features/outs · Εξοδούχοι και ΔΝ (Κ-06 έως Κ-09, Κ-16) */
const OUT_OPTS = [{ value: '', label: 'Μένει' }, { value: 'OUT', label: 'Έξοδος' }, { value: 'DN', label: 'ΔΝ' }];
const roomsTxt = (rs: number[]) => rs[0] + '–' + rs[rs.length - 1];
const OutRow = memo(function OutRow({ p, style, reason, value, changed, onSet, onOpen }: P) {
  return html`<div className=${cx('orow', changed && 'is-changed', reason && 'is-blocked')} style=${style}>
    <div><button type="button" className="linkish" onClick=${() => onOpen(p.id)}><b>${fullName(p)}</b></button><small>${unitOf(p)} · ${roomTxt(p)}</small></div>
    ${reason ? html`<${Badge} tone="outline" data-tip="Δεν βγαίνει έξοδο σύμφωνα με τους κανόνες">✕ ${reason}<//>` :
    html`<div className="ui-seg ui-seg--sm" role="group" aria-label=${'Έξοδος ' + fullName(p)}>${OUT_OPTS.map(o => html`<button key=${o.value} type="button" aria-pressed=${(value || '') === o.value} onClick=${() => onSet(p.id, o.value || null)}>${o.label}</button>`)}</div>`}
  </div>`;
});
export function OutsScreen() {
  const { state, run, today, tomorrow, undo } = useStore(); const toast = useToast(); const nav = useNav(); const mobile = useMedia('(max-width: 767px)');
  const date = nav.params.outDate || today;
  const nextDow = (w: number) => { for (let i = 0; i < 7; i++) { const d = addDays(today, i); if (parseD(d).getDay() === w) return d; } return today; };
  const outDays = [...new Set([today, tomorrow, nextDow(6), nextDow(0)])].sort();
  const rooms = outRoomsOn(state.rules, date);
  const people = activePeople(state);
  const saved = useMemo(() => { const m: Record<number, TypeKey> = {}; state.statuses.forEach(s => { if (TYPES[s.type].cat === 'out' && s.from <= date && date <= s.to) m[s.pid] = s.type; }); return m; }, [state.statuses, date]);
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const [filter, setFilter] = useState('all'); const [q, setQ] = useState(''); const dq = useDeferredValue(q); const [confirm, setConfirm] = useState(false);
  const reasons = useMemo(() => { const m: Record<number, string | null> = {}; people.forEach(p => { m[p.id] = outBlock(state, date, p.id); }); return m; }, [state, date]);
  const rows = useMemo(() => searchPeople(state.people, dq).filter(p => filter === 'all' || (filter === 'can' ? !reasons[p.id] : filter === 'cant' ? !!reasons[p.id] : !!draft[p.id])), [dq, filter, reasons, draft, state.people]);
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
  const allCan = () => setDraft(d => { const n = { ...d }; people.forEach(p => { if (!reasons[p.id] && !n[p.id]) n[p.id] = 'OUT'; }); return n; });
  const height = useViewportHeight(mobile ? 380 : 330);
  const c0 = strengthOf(state, date);
  const awayDelta = changes.reduce((a, c) => a + (c.to ? 1 : 0) - (c.from ? 1 : 0), 0);
  const save = async () => { if (await run({ t: 'outs', date, changes }, false)) { setConfirm(false); toast({ text: 'Αποθηκεύτηκαν οι εξοδούχοι ' + dm(date) + ' (' + changes.length + ' αλλαγές)', actions: [{ label: 'Αναίρεση', fn: () => { undo(); } }] }); } };
  const rh = mobile ? 96 : 52;
  return html`<div>
    <${PageHeader} title=${'Εξοδούχοι ' + DOW_GEN[parseD(date).getDay()] + ' ' + dmy(date)} sub="Διάλεξε ποιοι βγαίνουν και ποιοι με ΔΝ. Όσοι έχουν υπηρεσία, ΕΥ, ΣΤΕΠ ή ποινή δεν επιλέγονται."><${DateBar} value=${date} onChange=${(d: string) => nav.set({ outDate: d })} days=${outDays}/><//>
    ${rooms ? html`<${Alert} tone="info"><span>${parseD(date).getDay() === 6 ? 'Σάββατο' : 'Κυριακή'}: βγαίνουν οι <b>θάλαμοι ${roomsTxt(rooms)}</b>, μένουν οι υπόλοιποι (Κ-16). <${Button} size="sm" variant="secondary" onClick=${byRooms}>Πρότεινε θαλάμους ${roomsTxt(rooms)}<//></span><//>` : null}
    <div className="bulkbar outbar"><span>Έξοδος <b>${cnt('OUT')}</b> · ΔΝ <b>${cnt('DN')}</b> · Παραμένοντες <b>${stayN}</b> <span className="muted">(${blockedN} λόγω κανόνων)</span></span>
      ${changes.length ? html`<${Button} size="sm" variant="ghost" onClick=${() => setDraft(saved)}>Ακύρωση<//><${Button} size="sm" onClick=${() => setConfirm(true)}>Αποθήκευση (${changes.length})<//>` : html`<${Button} size="sm" variant="secondary" onClick=${allCan} data-tip="Βάζει «Έξοδος» σε όλους όσοι επιτρέπεται και δεν έχουν ήδη επιλογή">Όλοι όσοι μπορούν: έξοδος<//>`}</div>
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση" placeholder="Επώνυμο ή όνομα (χωρίς τόνους)" value=${q} onChange=${(e: any) => setQ(e.target.value)}/></div>
    <div className="toolbar"><div className="chips" role="group" aria-label="Φίλτρα">${[['all', 'Όλοι'], ['can', 'Μπορούν να βγουν'], ['cant', 'Δεν μπορούν'], ['sel', 'Επιλεγμένοι']].map(([k, l]) => html`<button key=${k} type="button" className="ui-chip" aria-pressed=${filter === k} onClick=${() => setFilter(k)}>${l}</button>`)}</div><${ActiveFilter} parts=${[filter !== 'all' && ({ can: 'Μπορούν να βγουν', cant: 'Δεν μπορούν', sel: 'Επιλεγμένοι' } as P)[filter], dq && '«' + dq + '»']} onClear=${() => { setFilter('all'); setQ(''); }}/><span className="toolbar__count">${rows.length} άτομα</span></div>
    <div className="toolbar"><${ExportButton} kind="outs" date=${date} label="οι εξοδούχοι και παραμένοντες" variant="outline" size="sm" disabled=${changes.length > 0}/>${changes.length > 0 && html`<span className="note">Αποθήκευσε πρώτα τις αλλαγές.</span>`}<${TemplateNote} ids=${['outs']}/></div>
    <div className="ui-card" style=${{ overflow: 'hidden' }}>${rows.length ? html`<${VirtualList} items=${rows} resetKey=${filter + '|' + dq + '|' + date} rowHeight=${rh} height=${height} renderRow=${(p: Person, _i: number, style: P) => html`<${OutRow} key=${p.id} p=${p} style=${style} reason=${reasons[p.id]} value=${draft[p.id]} changed=${(saved[p.id] || null) !== (draft[p.id] || null)} onSet=${set} onOpen=${open}/>`}/>` : html`<div className="empty">Κανείς σε αυτό το φίλτρο.</div>`}</div>
    ${confirm && html`<${Dialog} title="Τι θα αλλάξει" description=${'Εξοδούχοι ' + dayName(date, today).toLowerCase() + ' ' + dm(date)} onClose=${() => setConfirm(false)} footer=${html`<${Button} variant="outline" onClick=${() => setConfirm(false)}>Πίσω<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
      <ul className="hist">${changes.map(c => html`<li key=${c.pid}><b>${shortName(personMap(state.people).get(c.pid)!)}</b> <span className="muted">${c.from ? TYPES[c.from].label : 'Μένει'} →</span> ${c.to ? html`<${Badge} tone=${TYPES[c.to].tone}>${TYPES[c.to].label}<//>` : 'Μένει'}</li>`)}</ul>
      <p className="note" style=${{ margin: 0 }}>Παρόντες απόψε: ${c0.present} → ${c0.present - awayDelta}. Οι Παραμένοντες βγαίνουν στο Excel με τον λόγο στις Παρατηρήσεις.</p>
    <//>`}
  </div>`;
}
