// Σήμερα, ιατρικά/ποινές, δύναμη, ΗΚΑΙ, ιστορικό, templates/εισαγωγή/ρυθμίσεις, αναζήτηση (Ctrl+K)
import { RkName, rkFull, rkShort } from '../rankName';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Why, Card, Dialog, PageHeader, Segmented, Strip, Tabs, useMedia, useToast } from '../ui';
import { Combo, Select } from '../select';
import { useNav, useStore, searchPeople } from '../store';
import { requestLeave, usePending } from '../pending';
import { useNowMin } from '../clock';
import { LeaveEndDialog, StatusFixDialog } from './people';
import { hasTimes, normTime, timeNames } from '../../shared/hours';
import { HdTab } from './hd';
import { ActiveFilter, ChangePlanList, DateBar, DateField, DateRangeField, ExcelSheet, ExportButton, PersonPicker, TemplateNote, TimeField } from '../common';
import { hkaiFront, hkaiBack } from '../sheets';
import { HK_SECTIONS, hkLvOn, hkOn, hkToggle, type HkaiManual, type HkaiSettings, type HkSection, type HkVehicle, TYPES, coversDay, effects, fullName, shortName, unitOf, isWaiting, type LeaveAsk, type Person, type PersonRequest, type Status, platoonsOf, platoonShort, roomTxt } from '../../shared/domain';
import { HK_K, HK_A, HK_MANUAL, approvalPlan, planNeedsOk, awayNow, hkaiCounts, personMap, strengthAt, type StatusPlan } from '../../shared/rules';
import { addDays, daysBetween, dayName, dm, dmy, dow, parseD, DOW_GEN } from '../../shared/dates';
import { strengthView, type SvCat, type SvGroup } from '../../shared/strengthView';
import { collator, normGreek, upper } from '../../shared/text';
import { hkWho, overMax, punBySuggestions, punDays, punLbl, punText, skippedDays } from '../../shared/punish';
import { byName, destNote, movesOn, outReason, personLine, reqWhat } from '../../shared/hkaiText';
import { reqText } from '../../shared/commands';
import { LeavesTab } from './leaves';
import { medNote, notesOf, hasNoteKinds, cadreCountRows, hkRowList, listOf, rankTxt, statusLbl } from '../../shared/ranks';
import { UNIT, hkRowLabel, HK } from '../../shared/unit';
import { HkHeadCard, HkRowsButton } from './hkrows';
import { dutyOfficers, orderedCadre } from '../../shared/cadre';
import { SRC } from './today';
import { reqWaiting } from './todayView';
type P = any;

// Ιατρικά: δικό τους μενού. Ποινές: καρτέλα μέσα στο μενού ΗΚΑΙ (Michael, 18/10). Ίδια λίστα, άλλο φίλτρο.
export function RecordsScreen() { return html`<${RecordList} mode="med"/>`; }
const MED_TABS = ['med', 'changes', 'expired', 'notes'], PUN_TABS = ['pun', 'expired', 'allpun'];
function RecordList({ mode }: { mode: 'med' | 'pun' }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const pm = personMap(state.people); const now = useNowMin();
  const tabKey = mode === 'med' ? 'recTab' : 'punTab';
  const tab: string = (mode === 'med' ? MED_TABS : PUN_TABS).includes(nav.params[tabKey]) ? nav.params[tabKey] : mode;
  const [pq, setPq] = useState(''); const dpq = useDeferredValue(pq);
  const medF: string = nav.params.medF || '';
  const chDay: string = nav.params.recDate || today;   // καρτέλα «Μεταβολές ημέρας»: ιατρικά που ξεκινούν ή λήγουν αυτή τη μέρα
  const y = addDays(today, -1);
  // «Μόνο σημείωση» (Michael, 4/11): δεν μετρά στα Τώρα / Μεταβολές / Έληξαν, έχει τη δική της καρτέλα
  const nl = state.settings.lists; const hasNotes = hasNoteKinds(nl);
  const isMed = (s: Status) => ['med', 'other'].includes(TYPES[s.type].cat) && !medNote(s, nl);
  const list = useMemo(() => {
    // αναζήτηση σε όλες τις καρτέλες: όνομα, κωδικός, είδος ποινής, σημείωση, ποιος τιμώρησε, λόγος
    const qq = normGreek(dpq.trim());
    const ok = (s: Status) => pm.has(s.pid) && (!qq || normGreek(fullName(pm.get(s.pid)!) + ' ' + TYPES[s.type].label + ' ' + TYPES[s.type].long + ' ' + (s.kind || '') + ' ' + (s.note || '') + ' ' + (s.by || '') + ' ' + (s.reason || '')).includes(qq));
    if (tab === 'notes') return notesOf(state.statuses, nl).filter(s => pm.has(s.pid) && !s.pending && coversDay(s, today) && ok(s)).sort((a, b) => collator.compare(pm.get(a.pid)!.last, pm.get(b.pid)!.last) || collator.compare(pm.get(a.pid)!.first, pm.get(b.pid)!.first));
    if (tab === 'allpun') return state.statuses.filter(s => s.type === 'PUN' && ok(s)).sort((a, b) => b.from.localeCompare(a.from));
    if (tab === 'changes') return state.statuses.filter(s => isMed(s) && !s.pending && (s.from === chDay || (!s.open && s.to === chDay)) && ok(s)).sort((a, b) => Number(b.from === chDay) - Number(a.from === chDay) || a.to.localeCompare(b.to));
    if (tab === 'expired') return state.statuses.filter(s => (mode === 'med' ? isMed(s) : s.type === 'PUN') && !s.pending && !awayNow(s, today, now) && s.to >= addDays(today, -14) && ok(s)).sort((a, b) => b.to.localeCompare(a.to));
    return state.statuses.filter(s => awayNow(s, today, now) && (tab === 'med' ? isMed(s) && (!medF || statusLbl(s, state.settings.lists) === medF) : s.type === 'PUN') && ok(s)).sort((a, b) => a.to.localeCompare(b.to));
  }, [state.statuses, nl, tab, today, dpq, medF, mode, now, chDay]);
  // ΕΥ, ΕΑ, ΕΟ, ΣΤΕΠ… ως φίλτρα, με πόσοι έχουν τον καθένα (Michael, 17/10: τα ιατρικά εδώ, όχι στο Δυναμολόγιο)
  const medCnt = useMemo(() => { const m = new Map<string, number>(); state.statuses.forEach(s => { if (awayNow(s, today, now) && isMed(s) && pm.has(s.pid)) { const l = statusLbl(s, state.settings.lists); m.set(l, (m.get(l) || 0) + 1); } }); return [...m].sort((a, b) => b[1] - a[1]); }, [state.statuses, today, state.settings.lists, now]);
  const nMed = state.statuses.filter(s => awayNow(s, today, now) && isMed(s)).length;
  const nNote = hasNotes ? notesOf(state.statuses, nl).filter(s => pm.has(s.pid) && !s.pending && coversDay(s, today)).length : 0;
  const nPun = state.statuses.filter(s => s.to >= today && s.type === 'PUN' && pm.has(s.pid)).length;
  const left = (s: Status) => {
    if (s.to < today) { const d = daysBetween(s.to, today) - 1; return d === 1 ? 'έληξε χθες' : 'έληξε πριν από ' + d + ' ημ.'; }
    if (s.open) return 'χωρίς λήξη (κενό «έως» στο Excel)';
    const n = daysBetween(today, s.to) - 1; return s.from > today ? 'ξεκινά ' + dayName(s.from, today).toLowerCase() : n === 0 ? 'λήγει σήμερα' : n === 1 ? 'λήγει αύριο' : 'λήγει σε ' + n + ' ημ.'; };
  // στέρηση εξόδου: ποιες μέρες δεν μέτρησαν (υπηρεσία, βραδινή εκπαίδευση), για να φαίνεται γιατί μετακινήθηκε η λήξη
  const skipTxt = (s: Status) => { const k = skippedDays(state, s); return k.length ? ' · ' + punDays(s) + ' ημ. ποινή, δεν μετράνε: ' + k.map(x => dm(x.date) + ' ' + (x.why === 'duty' ? 'υπηρεσία' : 'βραδινή εκπαίδευση')).join(', ') : ''; };
  const [stop, setStop] = useState<Status | null>(null);
  const [end, setEnd] = useState<Status | null>(null);
  const [txt, setTxt] = useState<Status | null>(null);
  const [fix, setFix] = useState<Status | null>(null);
  const act = (fn: () => Promise<unknown>, text: string) => async () => { if (await fn()) toast({ text, actions: [undoMark()] }); };
  return html`<div>
    ${mode === 'med' ? html`<${PageHeader} title="Ιατρικά" sub="Όταν λήξει ένα ιατρικό, αφαιρείται μόνο του την επόμενη μέρα.">
      <${Button} onClick=${() => nav.declare({ cat: 'med', from: today, to: addDays(today, 2) })}>+ Ιατρικό<//><//>
    <div style=${{ marginBottom: '12px' }}><${Segmented} value=${tab} onChange=${(v: string) => nav.set({ recTab: v })} items=${[{ value: 'med', label: 'Τώρα (' + nMed + ')', tip: 'Όσα ισχύουν τώρα' }, { value: 'changes', label: 'Μεταβολές ημέρας', tip: 'Όσα ξεκινούν ή λήγουν τη μέρα που διαλέγεις' }, { value: 'expired', label: 'Έληξαν', tip: 'Όσα έληξαν τις τελευταίες 14 μέρες' }, ...(hasNotes ? [{ value: 'notes', label: 'Σημειώσεις (' + nNote + ')', tip: 'Ιατρικά «μόνο σημείωση»: φαίνονται μόνο εδώ και στην καρτέλα του στρατιώτη' }] : [])]}/>${tab === 'changes' && html`<span style=${{ marginLeft: '12px' }}><${DateBar} value=${chDay} onChange=${(d: string) => nav.set({ recDate: d })} days=${[y, today, addDays(today, 1)]}/></span>`}</div>`
    : html`<${PageHeader} title="Ποινές" sub="Ισχύουν αμέσως και γράφονται στην ${HK()} της μέρας που επιβλήθηκαν.">
      <${Button} onClick=${() => nav.declare({ cat: 'pun', from: today, to: addDays(today, 4) })}>+ Ποινή<//><//>
    <div style=${{ marginBottom: '12px' }}><${Segmented} value=${tab} onChange=${(v: string) => nav.set({ punTab: v })} items=${[{ value: 'pun', label: 'Τώρα (' + nPun + ')', tip: 'Όσες ισχύουν τώρα' }, { value: 'expired', label: 'Έληξαν', tip: 'Όσες έληξαν τις τελευταίες 14 μέρες' }, { value: 'allpun', label: 'Όλες', tip: 'Όλες οι ποινές, με αναζήτηση' }]}/></div>`}
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση" placeholder=${mode === 'med' ? 'Όνομα, κωδικός (π.χ. ΕΥ) ή σημείωση · Ctrl+F' : 'Όνομα, είδος ποινής, ποιος τιμώρησε ή λόγος · Ctrl+F'} value=${pq} onChange=${(e: any) => setPq(e.target.value)}/>${dpq.trim() && html`<span className="toolbar__count">${list.length} ${list.length === 1 ? 'βρέθηκε' : 'βρέθηκαν'}</span>`}</div>
    ${tab === 'med' && medCnt.length > 1 && html`<div className="filters"><${Strip} role="group" aria-label="Είδος ιατρικού">${[['', 'Όλα', nMed] as [string, string, number], ...medCnt.map(([l, n]) => [l, l, n] as [string, string, number])].map(([k, l, n]) => html`<button key=${k || 'all'} type="button" className="ui-chip" aria-pressed=${medF === k} onClick=${() => nav.set({ medF: medF === k ? '' : k })}>${l}<span className="cnt">${n}</span></button>`)}<//></div>`}
    <div className="ui-card">${list.length ? html`<ul className="rec">${list.map(s => { const t = TYPES[s.type]; const p = pm.get(s.pid)!; return html`<li key=${s.id}>
      <div><button type="button" className="linkish who" onClick=${() => nav.openPerson(s.pid)}><${RkName} p=${p} fn=${fullName}/></button> <${Badge} tone=${medNote(s, nl) ? 'note' : t.tone} data-tip=${t.long}>${statusLbl(s, state.settings.lists)}<//>
        <small>${dow(s.from)} ${dm(s.from)} – ${s.open ? '…' : dow(s.to) + ' ' + dm(s.to)} · ${tab === 'changes' ? [s.from === chDay && 'ξεκινά ' + (chDay === today ? 'σήμερα' : dm(chDay)), !s.open && s.to === chDay && (s.to < today ? 'έληξε ' : 'λήγει ') + (chDay === today ? 'σήμερα' : dm(chDay))].filter(Boolean).join(' και ') : tab === 'expired' ? (s.to === today ? timeNames(s.type).to + ' σήμερα ' + s.toTime : 'αφαιρέθηκε αυτόματα ' + (s.to === y ? 'σήμερα' : dm(addDays(s.to, 1)))) : tab === 'notes' ? (s.open ? 'χωρίς λήξη' : 'ως ' + dm(s.to)) : left(s)}${tab !== 'expired' && tab !== 'changes' && tab !== 'notes' && effects(t) ? ' · ' + effects(t) : ''}${s.note ? ' · ' + s.note : ''}${s.type === 'PUN' && (s.by || s.reason) ? ' · ' + [s.by && 'από ' + s.by, s.reason && 'διότι ' + s.reason].filter(Boolean).join(', ') : ''}${skipTxt(s)}</small></div>
      <${Button} size="sm" variant="ghost" onClick=${() => setFix(s)} data-tip="Μπήκε λάθος; Άλλαξε ημερομηνίες και στοιχεία ή διάγραψέ το" data-tip-side="left">Διόρθωση…<//>
      ${s.type === 'PUN' && html`<${Button} size="sm" variant="outline" onClick=${() => setTxt(s)} data-tip="Έτοιμο κείμενο για το Word, με «Αντιγραφή»" data-tip-side="left">Κείμενο<//>`}
      ${tab === 'expired' ? html`<${Badge} tone="ok">Αυτόματα<//>` : tab === 'allpun' || s.to < today ? html`<${Badge} tone=${s.to < today ? 'outline' : 'warn'}>${s.to < today ? 'Έληξε' : 'Ισχύει'}<//>` : html`<${Button} size="sm" variant="ghost" onClick=${() => (hasTimes(s.type) ? setEnd(s) : setStop(s))} data-tip=${'Μόνο αν σταμάτησε πριν από τις ' + dm(s.to) + ' (π.χ. τον έκοψε ο γιατρός). Αλλιώς λήγει μόνο του.'} data-tip-side="left">Λήξη νωρίτερα…<//>`}
    </li>`; })}</ul>` : html`<div className="empty">${tab === 'expired' ? 'Τίποτα δεν έληξε τις τελευταίες 14 μέρες.' : tab === 'changes' ? 'Κανένα ιατρικό δεν ξεκινά ή λήγει ' + (chDay === today ? 'σήμερα' : dm(chDay)) + '.' : mode === 'med' ? (tab === 'notes' ? 'Καμία σημείωση υγείας σε ισχύ.' : 'Κανένα ιατρικό σε ισχύ.') : 'Καμία ποινή σε ισχύ.'}</div>`}</div>
    ${stop && (() => { const t = TYPES[stop.type]; const p = pm.get(stop.pid)!; const what = (stop.type === 'PUN' ? 'Η ποινή' : t.label) + ' του ' + rkShort(p); return html`<${Dialog} role="alertdialog" title="Λήξη νωρίτερα;" description=${what + ' · ' + dm(stop.from) + '–' + (stop.open ? 'χωρίς λήξη' : dm(stop.to))} onClose=${() => setStop(null)}
      footer=${html`<${Button} variant="outline" data-autofocus="" onClick=${() => setStop(null)}>Όχι, να λήξει κανονικά<//><${Button} onClick=${async () => { const x = stop; setStop(null); await act(() => run({ t: 'endStatus', id: x.id }, false), what + ': σταμάτησε, από σήμερα δεν ισχύει')(); }}>Ναι, από σήμερα δεν ισχύει<//>`}>
      <p style=${{ margin: 0 }}>${what} ${stop.open ? html`είναι <b>χωρίς λήξη</b>` : html`θα έληγε <b>${dayName(stop.to, today).toLowerCase()} ${dm(stop.to)}</b>`}. Αν πατήσεις «Ναι», σταματά τώρα: από σήμερα ${t.noDuty ? 'ξαναμπαίνει σε υπηρεσίες' : t.noArmed ? 'ξαναμπαίνει και σε ένοπλες θέσεις' : t.noOut ? 'μπορεί να βγει έξοδο' : 'δεν ισχύει'}.</p><//>`; })()}
    ${txt && html`<${PunTextDialog} st=${txt} onClose=${() => setTxt(null)}/>`}
    ${end && html`<${LeaveEndDialog} st=${end} onClose=${() => setEnd(null)}/>`}
    ${fix && html`<${StatusFixDialog} st=${fix} onClose=${() => setFix(null)}/>`}
    ${tab === 'med' && html`<p className="note" style=${{ marginTop: '8px' }}>ΕΟ = ελεύθερος ορθοστασίας, ΕΑ = ελεύθερος ασκήσεων, ΕΥ = ελεύθερος υπηρεσίας. ΣΤΕΠ = εισαγωγή ΣΤΕΠ.</p>`}
  </div>`;
}

// Κείμενο ποινής για το Word: η διάρκεια υπογραμμισμένη, αντιγραφή με μορφοποίηση
function copyRich(htmlStr: string, plain: string): boolean {
  const div = document.createElement('div'); div.contentEditable = 'true'; div.innerHTML = htmlStr;
  div.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre-wrap'; document.body.appendChild(div);
  const r = document.createRange(); r.selectNodeContents(div); const sel = window.getSelection()!; sel.removeAllRanges(); sel.addRange(r);
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  sel.removeAllRanges(); div.remove();
  if (!ok && navigator.clipboard) { navigator.clipboard.writeText(plain).catch(() => undefined); ok = true; }
  return ok;
}
export function PunTextDialog({ st, onClose }: P) {
  const { state, run } = useStore(); const toast = useToast();
  const p = personMap(state.people).get(st.pid)!;
  const [f, setF] = useState({ by: st.by || '', reason: st.reason || '', on: st.on || st.from });
  const byList = useMemo(() => punBySuggestions(state), [state.statuses, state.cadreList]);
  const t = punText(p, { ...st, by: f.by.trim() || undefined, reason: f.reason.trim() || undefined, on: f.on }, state.settings.lists);
  const max = overMax(st.kind, punDays(st), state.settings.lists);
  const dirty = f.by !== (st.by || '') || f.reason !== (st.reason || '') || f.on !== (st.on || st.from);
  const save = async () => (dirty ? run({ t: 'setPunInfo', id: st.id, by: f.by, reason: f.reason, on: f.on }, false) : true);
  return html`<${Dialog} title="Κείμενο ποινής" description=${rkFull(p) + ' · ' + punLbl(st.kind) + ' ' + dm(st.from) + '–' + dm(st.to)} onClose=${onClose} dirty=${dirty && 'Τα στοιχεία της ποινής (ποιος, πότε, λόγος) δεν αποθηκεύτηκαν. Αν κλείσεις, χάνονται.'}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Κλείσιμο<//>${dirty && html`<${Button} variant="outline" onClick=${async () => { if (await save()) toast({ text: 'Αποθηκεύτηκαν τα στοιχεία της ποινής' }); }}>Αποθήκευση<//>`}<${Button} onClick=${async () => { if (!(await save())) return; toast({ text: copyRich(t.html, t.plain) ? 'Αντιγράφηκε. Στο Word πάτα Ctrl+V.' : 'Δεν έγινε αντιγραφή. Επίλεξε το κείμενο και πάτα Ctrl+C.' }); }}>Αντιγραφή<//>`}>
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="pt-by">Ποιος τιμώρησε</label><${Combo} id="pt-by" className="ui-input" options=${byList} placeholder="σε αιτιατική, π.χ. ΛΧΙΑ ΔΟΚΙΜΙΟ" value=${f.by} onChange=${(e: any) => setF({ ...f, by: e.target.value })}/></div>
      <div className="field"><label className="field__label" htmlFor="pt-on">Ημερομηνία τιμωρίας</label><${DateField} id="pt-on" className="ui-input" value=${f.on} onChange=${(e: any) => e.target.value && setF({ ...f, on: e.target.value })}/></div></div>
    <div className="field"><label className="field__label" htmlFor="pt-r">Λόγος (διότι…)</label><textarea id="pt-r" className="ui-input" rows="2" value=${f.reason} onChange=${(e: any) => setF({ ...f, reason: e.target.value })}></textarea></div>
    ${max > 0 && html`<${Alert} tone="warn"><span>${punLbl(st.kind)} πάνω από ${max} ημέρες. Έλεγξε τη διάρκεια.</span><//>`}
    <div className="puntext" aria-label="Προεπισκόπηση">${t.before}<u>${t.dur}</u>${t.after}</div>
  <//>`;
}

// Δύναμη (Michael, 26/10): 4 κάρτες που αθροίζουν (Παρόντες + Κωλυόμενοι + Απόντες = Δύναμη) και από κάτω ομάδες που ανοιγοκλείνουν.
// Οι Παρόντες (100+) είναι κλειστοί μέχρι να τους ανοίξεις: η κλειστή κάρτα δεν φτιάχνει τις γραμμές.
const SV_OPEN: Record<SvCat, boolean> = { kol: true, away: true, present: false };
const SV_ORDER: SvCat[] = ['kol', 'away', 'present'];
function SvRows({ g, onOpen }: { g: SvGroup; onOpen: (id: number) => void }) {
  return html`<div className="svsub"><div className="svsub__head" data-tip=${g.tip}><b>${g.label}</b><span className="num">${g.rows.length}</span></div>
    <ul className="svl">${g.rows.map(r => html`<li key=${r.p.id} className="svl__row"><button type="button" className="linkish svl__name" onClick=${() => onOpen(r.p.id)}><${RkName} p=${r.p}/></button><span className="svl__room muted">${roomTxt(r.p)}</span>
      <span className="svl__what">${r.what && html`<${Badge} tone=${r.tone} data-tip=${r.what}>${r.what}<//>`}</span><span className="svl__range muted">${r.range}</span><span className=${cx('svl__ret', r.retBad ? 'txt-bad' : 'muted')}>${r.tag ? html`<${Badge} tone="outline" data-tip="Στήλη της ΗΚΑΙ όπου μετρά">ΗΚΑΙ: ${r.tag}<//>` : r.ret}</span></li>`)}</ul></div>`;
}
export function StrengthScreen() {
  const { state, today, tomorrow } = useStore(); const nav = useNav();
  const date = nav.params.strengthDate || today;
  const now = useNowMin();
  // σήμερα με την ίδια στιγμή που μετρά το «Σήμερα» (όποιος γύρισε ως τώρα είναι παρών), για να βγαίνουν ίδια νούμερα
  const at = strengthAt(state.rules, date, today, now);
  const v = useMemo(() => strengthView(state, date, at), [state, date, at]);
  const [cat, setCat] = useState<SvCat | ''>((nav.params.svCat || '') as SvCat | '');
  useEffect(() => { if (nav.params.svCat) nav.set({ svCat: undefined }); }, []);
  const [q, setQ] = useState(''); const dq = useDeferredValue(q); const [unit, setUnit] = useState('');
  const [open, setOpen] = useState<Partial<Record<SvCat, boolean>>>({});
  const units = useMemo(() => platoonsOf(state.settings).map(u => platoonShort(u.name)), [state.settings]);
  const found = useMemo(() => (dq.trim() ? new Set(searchPeople(state.people, dq).map(p => p.id)) : null), [state.people, dq]);
  const filtering = !!found || !!unit;
  // οι γραμμές που περνούν από την αναζήτηση και τον ουλαμό· χωρίς φίλτρο τίποτα δεν ξαναχτίζεται
  const shown = useMemo(() => SV_ORDER.map(c => {
    const cv = v.cats[c];
    const groups = filtering ? cv.groups.map(g => ({ ...g, rows: g.rows.filter(r => (!found || found.has(r.p.id)) && (!unit || unitOf(r.p, state.settings) === unit)) })).filter(g => g.rows.length) : cv.groups;
    return { ...cv, groups, shown: filtering ? groups.reduce((n, g) => n + g.rows.length, 0) : cv.n };
  }), [v, found, unit, filtering, state.settings]);
  const pick = (c: SvCat | '') => { setCat(cat === c ? '' : c); if (c) setOpen(o => ({ ...o, [c]: undefined })); };
  const isOpen = (c: SvCat) => open[c] ?? (cat === c || !!found || SV_OPEN[c]);
  const ids = () => shown.filter(g => !cat || g.cat === cat).flatMap(g => g.groups.flatMap(x => x.rows.map(r => r.p.id)));
  const card = (c: SvCat | '', l: string, n: number, tip: string) => html`<button type="button" className=${cx('kpi', 'kpi--sv')} aria-pressed=${cat === c} data-tip=${tip} onClick=${() => pick(c)}><span className="kpi__l">${l}</span><span className="kpi__n">${n}</span></button>`;
  const vis = shown.filter(g => !cat || g.cat === cat);
  return html`<div>
    <${PageHeader} title=${'Δύναμη ' + DOW_GEN[parseD(date).getDay()] + ' ' + dmy(date)} sub="Βγαίνει μόνη της από ιατρικά, άδειες, εξόδους και ποινές."><div className="page-head__acts"><${DateBar} value=${date} onChange=${(d: string) => nav.set({ strengthDate: d })} days=${[today, tomorrow]}/>
      <${Button} size="sm" variant="outline" onClick=${() => nav.declare({ cat: 'kol', from: date, to: date })} data-tip="Υπηρεσία εκτός δικών μας, π.χ. ΣΤΕΠ">+ Κωλυόμενος<//><${Button} size="sm" variant="outline" onClick=${() => nav.go('hkai', { hkaiDate: date })}>${HK()}<//></div><//>
    <div className="kpis kpis--sv">
      ${card('', 'Δύναμη', v.total, 'Στρατιώτες σε δύναμη. Η ' + HK() + ' μετρά και τα στελέχη. Πάτα για να δεις όλους')}
      ${card('present', 'Παρόντες', v.present, 'Παρόντες που δεν είναι κωλυόμενοι. Μέσα και όσοι έχουν δική μας υπηρεσία, ΕΥ, ποινή ή ιατρικό')}
      ${card('kol', 'Κωλυόμενοι', v.kol, 'Δηλωμένοι κωλυόμενοι (π.χ. υπηρεσία ΣΤΕΠ) και εισαγωγές ΣΤΕΠ, που αφαιρούνται από τους παρόντες')}
      ${card('away', 'Απόντες', v.absent, 'Άδειες, νοσοκομείο, έξοδος και ΔΝ· κάθε άτομο μία φορά')}</div>
    <p className="svline"><span className="num"><b>${v.present}</b> + <b>${v.kol}</b> + <b>${v.absent}</b> = <b>${v.total}</b></span> <span className="muted">· στις ${v.time}${date === today ? ' (όποιος γύρισε ως τώρα είναι παρών)' : ''}</span></p>
    <p className="note svnote">Παρόντες + Κωλυόμενοι + Απόντες = Δύναμη, κάθε άτομο μία φορά. Κωλυόμενοι είναι όσοι δηλώθηκαν και αφαιρούνται από τους παρόντες, και όσοι έχουν εισαγωγή ΣΤΕΠ (αυτόματα)· όσοι έχουν δική μας υπηρεσία, ΕΥ ή ποινή μένουν στους Παρόντες. Η ${HK()} μετρά τους κωλυόμενους με δικό της ορισμό.</p>
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση" placeholder="Επώνυμο ή όνομα (χωρίς τόνους)" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      ${units.length > 1 && html`<${Strip} className="chips" role="group" aria-label="Ουλαμός"><button type="button" className="ui-chip" aria-pressed=${!unit} onClick=${() => setUnit('')}>Όλοι</button>${units.map(u => html`<button key=${u} type="button" className="ui-chip" aria-pressed=${unit === u} onClick=${() => setUnit(unit === u ? '' : u)}>${u}</button>`)}<//>`}
      <${ActiveFilter} parts=${[cat && v.cats[cat].label, unit, dq.trim() && '«' + dq.trim() + '»']} onClear=${() => { setCat(''); setQ(''); setUnit(''); }}/></div>
    <div className="stack">${vis.map(g => html`<${Card} key=${g.cat} title=${g.label + ' · ' + g.shown + (filtering ? ' από ' + g.n : '')} open=${isOpen(g.cat)} onToggle=${() => setOpen(o => ({ ...o, [g.cat]: !isOpen(g.cat) }))}
        summary=${g.groups.length ? g.groups.map(x => x.label + ' ' + x.rows.length).join(' · ') : 'Κανείς'}>
        ${g.groups.length ? g.groups.map(x => html`<${SvRows} key=${x.key} g=${x} onOpen=${(id: number) => nav.openPerson(id, ids())}/>`) : html`<div className="empty">${filtering ? 'Κανείς με αυτά τα φίλτρα.' : 'Κανείς.'}</div>`}
      <//>`)}</div>
  </div>`;
}

// Μενού ΗΚΑΙ (Michael, 18/10): πρώτη και προεπιλεγμένη καρτέλα η ίδια η ΗΚΑΙ, μετά ό,τι γράφεται μέσα της.
// Από το μενού (ή Alt+αριθμός) ανοίγει πάντα η καρτέλα ΗΚΑΙ (Shell, MENU_TAB).
export function HkaiScreen() {
  const { state, today } = useStore(); const nav = useNav();
  const tab: string = nav.params.hkTab || 'hkai';
  const pm = useMemo(() => personMap(state.people), [state.people]);
  const nPun = useMemo(() => state.statuses.filter(s => s.type === 'PUN' && s.to >= today && pm.has(s.pid)).length, [state.statuses, today, pm]);
  const now = useNowMin();
  // όσοι λείπουν με άδεια τώρα· όχι όσοι φεύγουν τις επόμενες μέρες (αλλιώς δεν συμφωνεί με τους Απόντες)
  const nLeave = useMemo(() => state.statuses.filter(s => TYPES[s.type].cat === 'abs' && s.from <= today && awayNow(s, today, now) && pm.has(s.pid)).length, [state.statuses, today, pm, now]);
  const nReq = useMemo(() => reqWaiting(state.requests).filter(r => pm.get(r.pid)?.active).length, [state.requests, pm]);
  const n = (l: string, k: number) => (k ? l + ' (' + k + ')' : l);
  return html`<div>
    <div style=${{ marginBottom: '14px' }}><${Tabs} value=${tab} onChange=${(v: string) => nav.set({ hkTab: v })} items=${[{ value: 'hkai', label: HK() }, { value: 'pun', label: n('Ποινές', nPun) }, { value: 'leave', label: n('Άδειες', nLeave) }, { value: 'req', label: n('Αιτήσεις', nReq) }, { value: 'hd', label: 'Ημερήσια Διαταγή' }]}/></div>
    ${tab === 'pun' ? html`<${RecordList} mode="pun"/>` : tab === 'leave' ? html`<${LeavesTab}/>` : tab === 'req' ? html`<${RequestsTab}/>` : tab === 'hd' ? html`<${HdTab}/>` : html`<${HkaiMain}/>`}
  </div>`;
}
function RequestsTab() {
  const { today } = useStore(); const nav = useNav();
  const date = nav.params.hkaiDate || today;
  return html`<div>
    <${PageHeader} title="Αιτήσεις" sub="Γράφονται μία φορά, στην ${HK()} της μέρας τους (5. Αιτήσεις)."><${DateBar} value=${date} onChange=${(d: string) => requestLeave(() => nav.set({ hkaiDate: d }))} days=${[addDays(today, -1), today, addDays(today, 1)]}/><//>
    <div style=${{ maxWidth: '960px' }}><${RequestsCard} date=${date}/></div>
  </div>`;
}
// Στη σύνοψη της ΗΚΑΙ μόνο πόσες είναι· οι αιτήσεις έχουν δική τους καρτέλα
function RequestsLink({ date }: { date: string }) {
  const { state, today } = useStore(); const nav = useNav();
  const pm = useMemo(() => personMap(state.people), [state.people]);
  const nDay = state.requests.filter(r => r.date === date && pm.has(r.pid)).length;
  const nWait = reqWaiting(state.requests).filter(r => pm.get(r.pid)?.active).length;
  return html`<${Card} title="5. Αιτήσεις" actions=${html`<${Button} size="sm" variant="outline" onClick=${() => nav.set({ hkTab: 'req' })}>Αιτήσεις<//>`}>
    <p className="note" style=${{ margin: 0 }}>${nDay ? nDay + (nDay === 1 ? ' αίτηση' : ' αιτήσεις') : 'Καμία αίτηση'} για ${date === today ? 'σήμερα' : dm(date)}${nWait ? ' · ' + nWait + (nWait === 1 ? ' αίτηση περιμένει' : ' αιτήσεις περιμένουν') + ' απάντηση' : ''}.</p>
  <//>`;
}

function HkaiMain() {
  const { state, today } = useStore(); const nav = useNav(); const mobile = useMedia('(max-width: 767px)');
  const date = nav.params.hkaiDate || today;
  const [side, setSide] = useState(mobile ? 'sum' : 'front');
  const h = useMemo(() => hkaiCounts(state, date), [state, date]);
  const front = useMemo(() => hkaiFront(state, date, h), [state, date, h]);
  const back = useMemo(() => hkaiBack(state, date), [state, date]);
  // στρατιώτες και στελέχη (καρτέλα Στελέχη, με τη σειρά της) σε κάθε στήλη
  const src = [...HK_K, ...HK_A].filter(([k]) => h.cols[k].length || h.cadre[k]?.length);
  const cOrd = useMemo(() => new Map(orderedCadre(state.cadreList).map((c, i) => [c.id, i])), [state.cadreList]);
  const cadreOf = (k: string) => [...(h.cadre[k] || [])].sort((a, b) => (cOrd.get(a.id) ?? 0) - (cOrd.get(b.id) ?? 0));
  const cadreSeen = [...new Set(src.flatMap(([k]) => cadreOf(k).map(c => c.id)))];   // ▲▼ στην κάρτα στελέχους: τα στελέχη όπως φαίνονται εδώ, στη σειρά των στηλών
  const fn = HK() + ' ' + dm(date).replace('/', '.') + '.' + date.slice(2, 4) + '.xlsx';
  const cadre = state.cadreList.filter(c => c.active).length || Object.values(state.settings.cadre).reduce((a, b) => a + (b || 0), 0);
  const sum = html`<div className="stack"><${Card} title="Από πού βγαίνει κάθε αριθμός">
    <div className="tiles" style=${{ marginBottom: '12px' }}><div className="tile tile--main" data-tip=${'Η δύναμη της ' + HK() + ': στρατιώτες και στελέχη, με τον κανόνα των ' + (state.rules?.hkTime || '08:00') + '. Το Σήμερα και η Δύναμη μετρούν μόνο στρατιώτες, τώρα.'}><span className="tile__n">${h.total}</span><span className="tile__l">Δύναμη</span></div><div className="tile"><span className="tile__n">${h.kol}</span><span className="tile__l">Κωλυόμενοι</span></div><div className="tile"><span className="tile__n">${h.apo}</span><span className="tile__l">Απόντες</span></div><div className="tile"><span className="tile__n">${h.avail}</span><span className="tile__l">Διαθέσιμοι</span></div></div>
    <p className="note" style=${{ margin: '-4px 0 12px' }}>Δύναμη = <b>${h.soldiers}</b> στρατιώτες + <b>${h.cadreN}</b> στελέχη · μετρά με τις ${state.rules?.hkTime || '08:00'} (όποιος γυρίσει ως τότε είναι παρών).</p>
    <ul className="hk-src">${src.map(([k, , full]) => html`<li key=${k}><b>${full}</b>: <span className="num">${h.cols[k].length + (h.cadre[k]?.length || 0)}</span><div className="cat__names">${cadreOf(k).map(c => html`<button key=${c.id} type="button" data-tip="Στέλεχος· ανοίγει η κάρτα του, όπου αλλάζει η κατάσταση" onClick=${() => nav.openCadre(c.id, cadreSeen)}>${rankTxt(c)} ${c.last}</button>`)}${h.cols[k].map(p => html`<button key=${p.id} type="button" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button>`)}</div></li>`)}</ul>
    <p className="note" style=${{ margin: '8px 0 0' }}>Υπηρεσία από την κατάσταση υπηρεσιών, ΕΥ και ποινές από τα ιατρικά και τις ποινές, απόντες από άδειες, αναρρωτικές και νοσοκομείο· τα στελέχη από τις καταστάσεις τους στην καρτέλα Στελέχη. Κάθε άτομο μετριέται μία φορά. Διαθέσιμοι = Δύναμη − Απόντες (ο τύπος του εντύπου). Οι εξοδούχοι δεν μετρούν.</p>
    ${h.noCol.length > 0 && html`<p className="note" style=${{ margin: '6px 0 0', opacity: 0.75 }}>${h.noCol.length} ${h.noCol.length === 1 ? 'απών της εφαρμογής δεν μετρά' : 'απόντες της εφαρμογής δεν μετρούν'} στην ${HK()} (${[...new Set(h.noCol.map(x => x.kind))].join(', ')}).</p>`}
  <//>
  <${CadreCard} warn=${!cadre}/>
  <${HkHeadCard}/>
  <${RequestsLink} date=${date}/>
  <${HkaiMovesCard} date=${date}/>
  <${HkaiManualCard} date=${date}/>
  <${HkaiSectionsCard}/></div>`;
  const sheets = html`<div>
    <div className="toolbar" style=${{ marginBottom: '8px' }}>${!mobile && html`<${Tabs} value=${side === 'sum' ? 'front' : side} onChange=${setSide} items=${[{ value: 'front', label: 'Μπροστά' }, { value: 'back', label: 'Πίσω' }]}/>`}<${HkLeavesToggle} date=${date} onToggle=${() => setSide('back')}/></div>
    ${side === 'back' ? html`<${ExcelSheet} model=${back} fileName=${fn} sheetName="πισω" meta="A4 οριζόντιο"/>` : html`<${ExcelSheet} model=${front} fileName=${fn} sheetName="μπροστινο" meta="A4 οριζόντιο · 1 σελίδα" footer="Γράφονται μόνο τα κελιά εισόδου· τα αθροίσματα μένουν τύποι του εντύπου."/>`}
    <${TemplateNote} ids=${['hkai']}/></div>`;
  return html`<div>
    <${PageHeader} title=${HK() + ' της ' + dmy(date)} sub="Βγαίνει μόνη της· κάθε αριθμός ανοίγει τα ονόματα."><${DateBar} value=${date} onChange=${(d: string) => requestLeave(() => nav.set({ hkaiDate: d }))} days=${[addDays(today, -1), today, addDays(today, 1)]}/>
      <div className="page-head__acts"><${ExportButton} kind="hkai" date=${date} label="η ${HK()}"/></div><//>
    ${mobile ? html`<div style=${{ marginBottom: '12px' }}><${Tabs} value=${side} onChange=${setSide} items=${[{ value: 'sum', label: 'Σύνοψη' }, { value: 'front', label: 'Μπροστά' }, { value: 'back', label: 'Πίσω' }]}/></div>${side === 'sum' ? sum : sheets}` : html`<div className="strength">${sum}${sheets}</div>`}
  </div>`;
}

// 3. ΑΔΕΙΕΣ ναι/όχι για τη μέρα που βλέπεις, δίπλα στην προεπισκόπηση: γυρίζει στην πίσω σελίδα για να φανεί αμέσως η αλλαγή
// (Michael, 22/10). Ισχύει μόνο για αυτή τη μέρα· η προεπιλογή για τις άλλες είναι στις «Ενότητες της ΗΚΑΙ» (Michael, 24/10)
function HkLeavesToggle({ date, onToggle }: { date: string; onToggle: () => void }) {
  const { state, run } = useStore(); const toast = useToast();
  const on = hkLvOn(state, date); const def = hkOn(state.settings, 'lv'); const own = state.hkaiManual[date]?.lv !== undefined;
  const set = async (v: boolean) => {
    if (await run({ t: 'setHkaiLv', date, on: v }, false)) { onToggle(); toast({ text: (v ? 'Οι άδειες γράφονται στο «3. Άδειες» της ' : 'Οι άδειες δεν γράφονται στο «3. Άδειες» της ') + dm(date) }); }
  };
  return html`<label className="rule" style=${{ margin: 0, alignItems: 'center' }} data-tip=${'Μόνο για τη ' + dm(date) + ': άδειες που δηλώνεις απευθείας (στρατιωτών και στελεχών), τη μέρα που ξεκινούν. Οι αιτήσεις που εγκρίθηκαν μένουν μόνο στο «5. Αιτήσεις». ' + (own ? 'Η προεπιλογή των άλλων ημερών είναι ' + (def ? 'ανοιχτή' : 'κλειστή') + ' (Ενότητες της ΗΚΑΙ).' : 'Τώρα ακολουθεί την προεπιλογή (Ενότητες της ΗΚΑΙ).')}><input type="checkbox" className="ui-check" checked=${on} onChange=${(e: any) => set(e.target.checked)}/><span><b>Άδειες στο «3. Άδειες»</b> <small>για αυτή τη μέρα</small></span></label>`;
}

// Στελέχη ανά βαθμό, μέσα στην ΗΚΑΙ (γραφέας, 10/10: «δεν έχει κάπου να τους προσθέσω»)
function CadreCard({ warn }: { warn: boolean }) {
  const { state, run } = useStore(); const toast = useToast(); const nav = useNav();
  const [c, setC] = useState(() => ({ ...state.settings.cadre }));
  const [open, setOpen] = useState(warn);
  const ranks = cadreCountRows(state.settings.lists);
  const dirty = ranks.some(r => (c[r] || 0) !== (state.settings.cadre[r] || 0));
  const saveC = async () => { const ok = await run({ t: 'setSettings', settings: { cadre: c }, text: 'στελέχη ' + HK() }, false); if (ok) { toast({ text: 'Αποθηκεύτηκαν τα στελέχη. Ισχύουν για κάθε μέρα.' }); setOpen(false); } return ok; };
  usePending(dirty, { label: 'Στελέχη ανά βαθμό', save: saveC, discard: () => setC({ ...state.settings.cadre }) });
  const list = state.cadreList.filter(x => x.active);
  if (list.length) {
    const by = new Map<string, number>(); list.forEach(x => by.set(hkRowLabel(x.hk), (by.get(hkRowLabel(x.hk)) || 0) + 1));
    return html`<${Card} title="Στελέχη ανά βαθμό" actions=${html`<${HkRowsButton}/><${Button} size="sm" variant="outline" onClick=${() => nav.go('cadre')}>Στελέχη<//>`}>
      <p className="note" style=${{ margin: 0 }}>${[...by].map(([r, n]) => r + ' ' + n).join(' · ')}. Βγαίνουν από την καρτέλα «Στελέχη», μαζί με τις καταστάσεις τους (κωλυόμενοι, απόντες).</p><//>`;
  }
  return html`<${Card} title="Στελέχη ανά βαθμό" actions=${html`<${HkRowsButton}/>${!open && html`<${Button} size="sm" variant="outline" onClick=${() => setOpen(true)}>Άλλαξε<//>`}`}>
    ${warn && html`<${Alert} tone="warn"><span>Δεν έχουν μπει ακόμα. Γράψε πόσοι είναι σε κάθε βαθμό και πάτα «Αποθήκευση», ή πέρασε τα στελέχη με ονόματα στο <button type="button" className="linkish" onClick=${() => nav.go('cadre')}>καρτέλα «Στελέχη»</button>.</span><//>`}
    ${open ? html`<div className="settings-grid">${ranks.map(r => html`<label key=${r} className="field"><span className="field__help">${hkRowLabel(r)}</span><input className="ui-input" type="number" min="0" value=${c[r] || ''} placeholder="0" onChange=${(e: any) => setC({ ...c, [r]: Math.max(0, +e.target.value || 0) })}/></label>`)}</div>
      <div className="toolbar" style=${{ marginTop: '8px' }}><${Button} disabled=${!dirty} why="Δεν άλλαξε κάτι" onClick=${saveC}>Αποθήκευση<//><span className="note">Λοχίες, δεκανείς και στρατιώτες μετρώνται από το προσωπικό.</span></div>`
    : html`<p className="note" style=${{ margin: 0 }}>${ranks.filter(r => state.settings.cadre[r]).map(r => hkRowLabel(r) + ' ' + state.settings.cadre[r]).join(' · ') || 'Κανένα'}. Ισχύουν για κάθε μέρα.</p>`}
  <//>`;
}
// Ό,τι στην ΗΚΑΙ δεν το ξέρει η εφαρμογή: αριθμοί ανά βαθμό και κείμενα της πίσω σελίδας, για τη συγκεκριμένη μέρα
const HK_TEXT_FIELDS: [string, string, string][] = [['egr', '1. Εγγραφές (επιπλέον, μετά από όσους μπήκαν στη δύναμη)', ''], ['dia', '2. Διαγραφές (επιπλέον, μετά από όσους βγήκαν εκτός δύναμης)', ''], ['lv', '3. Άδειες (ελεύθερο κείμενο, μετά τις αριθμημένες)', ''], ['ait', '5. Αιτήσεις (ελεύθερο κείμενο, μετά τις αριθμημένες)', ''], ['loi', '6. Λοιπά', ''], ['off', 'Αξιωματικός υπηρεσίας', 'π.χ. ΑΝΘΛΓΟΣ …']];
const HK_ACC_FIELDS: [string, string][] = [['accT', 'Ζημιές σε οχήματα: ολικές'], ['accP', 'Ζημιές σε οχήματα: μερικές'], ['accM', 'Σε άνδρες']];
// χωρίς το lv (3. ΑΔΕΙΕΣ ναι/όχι): αυτό αλλάζει από τον διακόπτη της μέρας, όχι από την Αποθήκευση εδώ
const manualOf = (x?: HkaiManual): HkaiManual => ({ cells: x?.cells || {}, text: x?.text || {} });
function HkaiManualCard({ date }: { date: string }) {
  const { state, run, today } = useStore(); const toast = useToast();
  const cur = manualOf(state.hkaiManual[date]); const curKey = JSON.stringify(cur); const lvOn = hkLvOn(state, date);
  const [m, setM] = useState(cur); const [rk, setRk] = useState('Στρατιώτες');
  useEffect(() => setM(manualOf(state.hkaiManual[date])), [date, curKey]);
  const dirty = JSON.stringify(m) !== JSON.stringify(cur);
  const saveM = async () => { const ok = await run({ t: 'setHkaiManual', date, manual: m }, false); if (ok) toast({ text: 'Αποθηκεύτηκαν τα στοιχεία της ' + HK() + ' ' + dm(date) }); return ok; };
  usePending(dirty, { label: 'Στοιχεία της ' + HK() + ' ' + dm(date), save: saveM, discard: () => setM(cur) });
  const setCell = (r: string, k: string, v: number) => { const row = { ...(m.cells[r] || {}) }; if (v) row[k] = v; else delete row[k]; const cells = { ...m.cells, [r]: row }; if (!Object.keys(row).length) delete cells[r]; setM({ ...m, cells }); };
  const used = Object.entries(m.cells).flatMap(([r, row]) => Object.entries(row).map(([k, v]) => ({ r, k, v })));
  const lbl = (k: string) => HK_MANUAL.find(x => x[0] === k)?.[1] || k;
  const auto = dutyOfficers(state, date);   // αξιωματικός υπηρεσίας από τα Στελέχη, όταν το πεδίο μένει κενό
  const offList = state.cadreList.filter(c => c.active).map(c => (rankTxt(c) + ' ' + c.last + ' ' + c.first).trim());
  return html`<${Card} title=${'Συμπληρώνεις εσύ (' + (date === today ? 'σήμερα' : dm(date)) + ')'}>
    <p className="note" style=${{ marginTop: 0 }}>Ό,τι δεν βγαίνει από τις καταστάσεις. Οι αριθμοί προστίθενται στη στήλη του βαθμού και τα σύνολα βγαίνουν από τους τύπους του εντύπου.</p>
    <div className="field"><span className="field__label">Αριθμοί ανά βαθμό</span>
      <div className="field-row"><${Select} className="ui-input" aria-label="Βαθμός" value=${rk} onChange=${(e: any) => setRk(e.target.value)}>${hkRowList(state.settings.lists).map(r => html`<option key=${r} value=${r}>${hkRowLabel(r)}</option>`)}<//></div>
      <div className="settings-grid" style=${{ marginTop: '6px' }}>${HK_MANUAL.map(([k, l]) => html`<label key=${k} className="field"><span className="field__help">${l}</span><input className="ui-input" type="number" min="0" placeholder="0" value=${m.cells[rk]?.[k] || ''} onChange=${(e: any) => setCell(rk, k, Math.max(0, +e.target.value || 0))}/></label>`)}</div>
      ${used.length > 0 && html`<span className="field__help">Έχεις γράψει: ${used.map(u => hkRowLabel(u.r) + ' ' + lbl(u.k) + ' ' + u.v).join(' · ')}</span>`}</div>
    ${HK_TEXT_FIELDS.map(([k, l, ph]) => html`<div key=${k} className="field"><label className="field__label" htmlFor=${'hk-' + k}>${l}</label><${k === 'off' ? Combo : 'input'} id=${'hk-' + k} className="ui-input" placeholder=${k === 'off' && auto ? auto : ph} options=${k === 'off' ? offList : undefined} disabled=${k === 'lv' && !lvOn} value=${m.text[k] || ''} onChange=${(e: any) => setM({ ...m, text: { ...m.text, [k]: e.target.value } })}/>${k === 'lv' && !lvOn && html`<span className="field__help">Γράφεται μόνο όταν είναι ανοιχτό το «3. Άδειες» για αυτή τη μέρα: άνοιξέ το με τον διακόπτη πάνω από την προεπισκόπηση.</span>`}${k === 'off' && html`<span className="field__help">${auto ? 'Κενό = από τα Στελέχη: ' + auto + '.' : 'Κενό = όποιος αξιωματικός έχει «Υπηρεσία» στα Στελέχη.'}</span>`}</div>`)}
    ${hkOn(state.settings, 'acc') && html`<div className="field"><span className="field__label">Ατυχήματα</span><div className="settings-grid">${HK_ACC_FIELDS.map(([k, l]) => html`<label key=${k} className="field"><span className="field__help">${l}</span><input className="ui-input" placeholder="Ø" value=${m.text[k] || ''} onChange=${(e: any) => setM({ ...m, text: { ...m.text, [k]: e.target.value } })}/></label>`)}</div><span className="field__help">Κενό = Ø, όπως στο έντυπο.</span></div>`}
    <p className="note">Οι αποφάσεις 1 (όσοι μπήκαν στη δύναμη), 2 (όσοι βγήκαν εκτός δύναμης), 4 (ποινές της μέρας) και 5 (αιτήσεις, και όσες άδειες εγκρίθηκαν) γράφονται μόνες τους. Η 3 (άδειες στρατιωτών και στελεχών που δήλωσες απευθείας) μόνο αν την ανοίξεις για αυτή τη μέρα, με τον διακόπτη πάνω από την προεπισκόπηση· η προεπιλογή για τις νέες μέρες είναι στις «Ενότητες της ${HK()}» πιο κάτω, όπου είναι και τα οχήματα και τα «Προβλέπονται».</p>
    <div className="toolbar"><${Button} disabled=${!dirty} why="Δεν άλλαξε κάτι" onClick=${saveM}>Αποθήκευση<//>${dirty && html`<${Button} variant="ghost" onClick=${() => setM(cur)}>Ακύρωση<//>`}</div>
  <//>`;
}

// 1. ΕΓΓΡΑΦΕΣ / 2. ΔΙΑΓΡΑΦΕΣ της μέρας: βγαίνουν μόνες τους από το προσωπικό· «Να μη γραφτεί» για όποιον δεν πρέπει
function HkaiMovesCard({ date }: { date: string }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const ins = useMemo(() => movesOn(state, 'inOn', date), [state, date]), outs = useMemo(() => movesOn(state, 'outOn', date), [state, date]);
  if (!ins.length && !outs.length) return null;
  const drop = async (p: Person, field: 'inOn' | 'outOn') => { if (await run({ t: 'setPersonMove', pid: p.id, field, date: null }, false)) toast({ text: rkShort(p) + ': δεν γράφεται στις ' + (field === 'inOn' ? 'εγγραφές' : 'διαγραφές'), actions: [undoMark()] }); };
  const list = (ps: Person[], field: 'inOn' | 'outOn') => html`<ol className="hk-req">${ps.map(p => html`<li key=${p.id}><div className="hk-req__row"><span><button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)}><${RkName} p=${p}/></button> <span className="muted">${personLine(p)}${field === 'outOn' && outReason(p) ? ': ' + outReason(p) : ''}</span></span>
    <span className="hk-req__acts"><${Button} size="sm" variant="ghost" onClick=${() => drop(p, field)} data-tip="Μένει όπως είναι στο προσωπικό, απλώς δεν γράφεται στην ${HK()}">Να μη γραφτεί<//></span></div></li>`)}</ol>`;
  return html`<${Card} title=${'Εγγραφές και διαγραφές (' + (date === today ? 'σήμερα' : dm(date)) + ')'}>
    ${ins.length > 0 && html`<div className="field"><span className="field__label">1. Εγγραφές: μπήκαν στη δύναμη</span>${list(ins, 'inOn')}</div>`}
    ${outs.length > 0 && html`<div className="field"><span className="field__label">2. Διαγραφές: βγήκαν εκτός δύναμης</span>${list(outs, 'outOn')}</div>`}
    <p className="note" style=${{ margin: 0 }}>Γράφονται μόνα τους με τα στοιχεία του Δυναμολογίου. Ο λόγος της διαγραφής βγαίνει από τις σημειώσεις του ατόμου.</p>
  <//>`;
}
// Ενότητες της ΗΚΑΙ που ανοιγοκλείνουν (Michael, 17/10), με ό,τι μένει ίδιο κάθε μέρα: όχημα και «Προβλέπονται»
function HkaiSectionsCard() {
  const { state, run } = useStore(); const toast = useToast();
  const cur: HkaiSettings = state.settings.hkai || {};
  const [veh, setVeh] = useState<HkVehicle>(() => ({ type: '1/4 τόνων', ...(cur.veh || {}) }));
  const [prov, setProv] = useState<Record<string, number>>(() => ({ ...(cur.prov || {}) }));
  const save = (hkai: HkaiSettings, text: string) => run({ t: 'setSettings', settings: { hkai }, text: HK() + ', ' + text }, false);
  const toggle = async (k: HkSection, on: boolean) => { if (await save(hkToggle(cur, k, on), (on ? 'άνοιξε: ' : 'έκλεισε: ') + HK_SECTIONS.find(x => x[0] === k)![1].toLowerCase())) toast({ text: (on ? 'Άνοιξε: ' : 'Έκλεισε: ') + HK_SECTIONS.find(x => x[0] === k)![1] }); };
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, +v || 0));
  const vehDirty = JSON.stringify(veh) !== JSON.stringify({ type: '1/4 τόνων', ...(cur.veh || {}) });
  const provDirty = JSON.stringify(prov) !== JSON.stringify(cur.prov || {});
  const VF: [keyof HkVehicle, string][] = [['prov', 'Προβλέπονται'], ['kin', 'Σε κίνηση'], ['maint', 'Για συντήρηση'], ['dmg', 'Λόγω βλάβης ή ατυχήματος']];
  return html`<${Card} title="Ενότητες της ${HK()}">
    <p className="note" style=${{ marginTop: 0 }}>Κλείσε όσα ${UNIT().nom === 'Λόχος' ? 'ο Λόχος' : 'η Ίλη'} δεν συμπληρώνει (π.χ. οχήματα, αν δεν έχετε): δεν φαίνονται εδώ και δεν γράφονται στο έντυπο.</p>
    ${HK_SECTIONS.map(([k, l, help]) => html`<label key=${k} className="rule"><input type="checkbox" className="ui-check" checked=${hkOn(state.settings, k)} onChange=${(e: any) => toggle(k, e.target.checked)}/><span><b>${l}</b><small>${help}</small></span></label>`)}
    ${hkOn(state.settings, 'veh') && html`<div className="field" style=${{ marginTop: '10px' }}><span className="field__label">Όχημα (ίδιο κάθε μέρα)</span>
      <div className="settings-grid"><label className="field"><span className="field__help">Είδος</span><input className="ui-input" value=${veh.type} onChange=${(e: any) => setVeh({ ...veh, type: e.target.value })}/></label>
      ${VF.map(([k, l]) => html`<label key=${k} className="field"><span className="field__help">${l}</span><input className="ui-input" type="number" min="0" value=${veh[k] ?? ''} onChange=${(e: any) => setVeh({ ...veh, [k]: num(e.target.value) })}/></label>`)}</div>
      ${vehDirty && html`<div className="toolbar" style=${{ marginTop: '6px' }}><${Button} size="sm" onClick=${async () => { if (await save({ ...cur, veh }, 'όχημα')) toast({ text: 'Αποθηκεύτηκε το όχημα της ' + HK() }); }}>Αποθήκευση<//></div>`}</div>`}
    ${hkOn(state.settings, 'prov') && html`<div className="field" style=${{ marginTop: '10px' }}><span className="field__label">Προβλέπονται από τη σύνθεση</span>
      <div className="settings-grid">${hkRowList(state.settings.lists).map(r => html`<label key=${r} className="field"><span className="field__help">${hkRowLabel(r)}</span><input className="ui-input" type="number" min="0" placeholder="0" value=${prov[r] || ''} onChange=${(e: any) => { const n = num(e.target.value); const x = { ...prov }; if (n) x[r] = n; else delete x[r]; setProv(x); }}/></label>`)}</div>
      ${provDirty && html`<div className="toolbar" style=${{ marginTop: '6px' }}><${Button} size="sm" onClick=${async () => { if (await save({ ...cur, prov }, 'προβλέπονται')) toast({ text: 'Αποθηκεύτηκαν τα «Προβλέπονται»' }); }}>Αποθήκευση<//></div>`}</div>`}
  <//>`;
}
// 5. ΑΙΤΗΣΕΙΣ: αιτήσεις στρατιωτών της μέρας, αριθμημένες όπως θα βγουν στην ΗΚΑΙ. Όλες οι αιτήσεις περιμένουν «Εγκρίθηκε» ή
// «Απορρίφθηκε» (1/11)· η αίτηση άδειας με την έγκριση γίνεται άδεια (στην ΗΚΑΙ μένει μόνο η αίτηση). Οι παλιές χωρίς απάντηση (old) δεν μετρούν.
function RequestsCard({ date }: { date: string }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const [edit, setEdit] = useState<Partial<PersonRequest> | null>(null);
  const pm = useMemo(() => personMap(state.people), [state.people]);
  const sorted = (rs: PersonRequest[]) => rs.filter(r => pm.has(r.pid)).sort((a, b) => byName(pm.get(a.pid)!, pm.get(b.pid)!) || a.id.localeCompare(b.id));
  const list = useMemo(() => sorted(state.requests.filter(r => r.date === date)), [state.requests, pm, date]);   // eslint-disable-line react-hooks/exhaustive-deps
  // αιτήσεις άλλων ημερών που ακόμα δεν απαντήθηκαν, και οι παλιές χωρίς απάντηση (old) από κάτω
  const other = useMemo(() => sorted(state.requests.filter(r => r.date !== date && !r.decision)), [state.requests, pm, date]);   // eslint-disable-line react-hooks/exhaustive-deps
  const waitN = other.filter(isWaiting).length;
  const [ask, setAsk] = useState<{ r: PersonRequest; plan: StatusPlan } | null>(null);
  const del = async (r: PersonRequest) => { if (await run({ t: 'deleteRequest', id: r.id }, false)) toast({ text: 'Διαγράφηκε η αίτηση του ' + rkShort(pm.get(r.pid)!), actions: [undoMark()] }); };
  const decide = async (r: PersonRequest, ok: boolean | null) => {
    if (!(await run({ t: 'decideRequest', id: r.id, ok }, false))) return;
    const who = rkShort(pm.get(r.pid)!); const what = r.leave ? 'άδεια' : 'αίτηση';
    toast({ text: ok === null ? 'Αναιρέθηκε η απόφαση για την ' + what + ' του ' + who : ok ? (r.leave ? 'Εγκρίθηκε η άδεια του ' + who + ' και μπήκε στις Άδειες.' : 'Εγκρίθηκε η αίτηση του ' + who + '.') : 'Απορρίφθηκε η αίτηση ' + (r.leave ? 'άδειας ' : '') + 'του ' + who, actions: [undoMark()] });
  };
  // «Εγκρίθηκε» σε αίτηση άδειας (Λ1, Λ2): ίδιος έλεγχος με τη Δήλωση· επικάλυψη με άλλη άδεια, υπηρεσίες που αδειάζουν ή μέρες στο παρελθόν ρωτούν πρώτα
  const approve = (r: PersonRequest) => {
    const plan = approvalPlan(state, r, today);
    if (plan && planNeedsOk(plan)) setAsk({ r, plan }); else decide(r, true);
  };
  const item = (r: PersonRequest, showDate: boolean) => { const p = pm.get(r.pid)!; const gone = r.leave && r.decision === 'ok' && !(r.sid && state.statuses.some(x => x.id === r.sid)); return html`<li key=${r.id}><div className="hk-req__row">
    <span>${showDate && html`<span className="num">${dm(r.date)} </span>`}<button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)}><${RkName} p=${p}/></button> αιτείται ${upper(reqWhat(r, state.settings.lists))}.
      ${r.decision === 'ok' && html` <${Badge} tone="ok" data-tip=${r.leave ? "Έγινε άδεια· στην " + HK() + " μένει μόνο η αίτηση" : 'Εγκρίθηκε από τον Διοικητή'}>Εγκρίθηκε ${dm(r.decided!)}<//>`}${gone && html` <${Badge} tone="bad" data-tip="Η άδεια ακυρώθηκε ή διαγράφηκε μετά την έγκριση· η αίτηση έμεινε εγκεκριμένη">η άδεια ακυρώθηκε<//>`}${r.decision === 'no' && html` <${Badge} tone="bad">Απορρίφθηκε ${dm(r.decided!)}<//>`}${!r.decision && (r.old ? html` <${Badge} tone="outline" data-tip="Από πριν την έγκριση σε όλες τις αιτήσεις· δεν μετρά στις αιτήσεις που περιμένουν">χωρίς απάντηση (παλιά)<//>` : html` <${Badge} tone="warn">Περιμένει απάντηση<//>`)}</span>
    <span className="hk-req__acts">${!r.decision && html`<${Button} size="sm" onClick=${() => (r.leave ? approve(r) : decide(r, true))} data-tip=${r.leave ? "Γίνεται άδεια· στην " + HK() + " μένει μόνο η αίτηση, δεν ξαναγράφεται" : 'Ο Διοικητής ενέκρινε την αίτηση'}>Εγκρίθηκε<//><${Button} size="sm" variant="outline" onClick=${() => decide(r, false)}>Απορρίφθηκε<//>`}
      ${r.decision ? html`<${Button} size="sm" variant="ghost" onClick=${() => decide(r, null)} data-tip=${r.decision === 'ok' && r.leave ? 'Η αίτηση ξαναπεριμένει απάντηση και η άδεια βγαίνει' : 'Η αίτηση ξαναπεριμένει απάντηση'}>Αναίρεση απόφασης<//>` : html`<${Button} size="sm" variant="ghost" onClick=${() => setEdit(r)}>Αλλαγή<//>`}<${Button} size="sm" variant="ghost" onClick=${() => del(r)}>Διαγραφή<//></span></div></li>`; };
  return html`<${Card} title=${'5. Αιτήσεις (' + (date === today ? 'σήμερα' : dm(date)) + ')'} actions=${html`<${Button} size="sm" variant="outline" onClick=${() => setEdit({ date, leave: { type: 'LEAVE', from: addDays(date, 1), to: addDays(date, 1) } })}>+ Αίτηση άδειας<//><${Button} size="sm" variant="ghost" onClick=${() => setEdit({ date })}>+ Άλλη αίτηση<//>`}>
    ${list.length ? html`<ol className="hk-req">${list.map(r => item(r, false))}</ol>`
      : html`<p className="note" style=${{ margin: 0 }}>Καμία αίτηση για ${dm(date)}. Γράφονται στην ${HK()} ως «1. ΣΤΡ (ΠΖ) … : ΑΙΤΕΙΤΑΙ …». Γράφονται μία φορά· με το «Εγκρίθηκε» η άδεια μπαίνει στις Άδειες χωρίς να ξαναγραφτεί.</p>`}
    ${other.length > 0 && html`<div className="field" style=${{ marginTop: '10px' }}><span className="field__label">Αιτήσεις άλλων ημερών που περιμένουν απάντηση${waitN < other.length ? (waitN ? ' και παλιές χωρίς απάντηση' : ': μόνο παλιές χωρίς απάντηση') : ''}</span><ul className="hk-req" style=${{ listStyle: 'none', paddingLeft: 0 }}>${other.map(r => item(r, true))}</ul></div>`}
    ${edit && html`<${RequestDialog} req=${edit} onClose=${() => setEdit(null)}/>`}
    ${ask && html`<${ApproveDialog} r=${ask.r} plan=${ask.plan} onClose=${() => setAsk(null)} onGo=${() => { const r = ask.r; setAsk(null); decide(r, true); }}/>`}
  <//>`;
}
// Έγκριση αίτησης άδειας που θέλει προσοχή (Λ1, Λ2): τα ίδια μηνύματα με τη Δήλωση, και «Έγκριση παρ' όλα αυτά» / «Άκυρο»
export function ApproveDialog({ r, plan, onClose, onGo }: { r: PersonRequest; plan: StatusPlan; onClose: () => void; onGo: () => void }) {
  const { state } = useStore(); const pm = personMap(state.people); const lv = r.leave!;
  const files = plan.files.filter(f => f.fn.startsWith('Υπηρεσίες'));
  return html`<${Dialog} role="alertdialog" title=${'Έγκριση: ' + rkShort(pm.get(r.pid)!) + ', άδεια ' + (lv.from === lv.to ? dm(lv.from) : dm(lv.from) + '–' + dm(lv.to))} onClose=${onClose}
    footer=${html`<${Button} variant="outline" data-autofocus="" onClick=${onClose}>Άκυρο<//><${Button} onClick=${onGo}>Έγκριση παρ' όλα αυτά<//>`}>
    ${plan.overlaps.length > 0 && html`<${Alert} tone="warn"><span>${plan.overlaps.map((o, i) => html`<span key=${i}>${i > 0 && html`<br/>`}<b><${RkName} p=${pm.get(o.pid)!}/></b> έχει ήδη ${statusLbl(o.status, state.settings.lists)} ${dm(o.status.from)}–${dm(o.status.to)}. Αν εγκριθεί, θα έχει δύο άδειες μαζί· στην ${HK()} θα μετρά μόνο η μία.</span>`)}</span><//>`}
    ${files.length > 0 && html`<${ChangePlanList} plan=${{ files }}/>`}
    <span className="note">Με την έγκριση γίνεται άδεια· στην ${HK()} μένει μόνο η αίτηση.</span>
  <//>`;
}
// Νέα αίτηση ή αλλαγή: από την ΗΚΑΙ ή από την καρτέλα του ατόμου (req.pid). Άδεια: είδος και από πότε έως πότε, με αιτιολόγηση.
const HON = 'Τιμητική';
export function RequestDialog({ req, onClose }: { req: Partial<PersonRequest>; onClose: () => void }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast();
  const kinds = [...listOf(state.settings.lists, 'leaveKinds'), HON];
  const lv0 = req.leave; const next = addDays(req.date || today, 1);
  const [f, setF] = useState({ pid: req.pid ?? null as number | null, date: req.date || today, text: req.text || '', isLeave: !!lv0, kind: lv0?.type === 'HON' ? HON : lv0?.kind || kinds[0], from: lv0?.from || next, to: lv0?.to || next, fromTime: lv0?.fromTime || '', toTime: lv0?.toTime || '', dest: lv0?.dest || '' });
  const [f0] = useState(() => JSON.stringify(f)); const dirty = JSON.stringify(f) !== f0;
  const p = f.pid != null ? personMap(state.people).get(f.pid) : undefined;
  const text = reqText(f.text);
  // ώρες προαιρετικές: γράφονται στην αίτηση μόνο αν μπήκαν (και διαβάζονται)
  const ft = normTime(f.fromTime), tt = normTime(f.toTime);
  const tms = { ...(ft ? { fromTime: ft } : {}), ...(tt ? { toTime: tt } : {}) };
  const leave: LeaveAsk | undefined = f.isLeave ? { type: f.kind === HON ? 'HON' : 'LEAVE', ...(f.kind === HON ? {} : { kind: f.kind }), from: f.from, to: f.to, ...tms, ...(f.dest.trim() ? { dest: f.dest.trim() } : {}) } : undefined;
  const ok = !!p && (f.isLeave || !!text) && (!f.isLeave || (ft != null && tt != null));
  const miss = ok ? '' : !p ? 'Λείπει: Στρατιώτης' : !f.isLeave ? 'Λείπει: Τι αιτείται' : 'Μια ώρα δεν είναι σωστή (π.χ. 14:00)';
  const save = async () => {
    if (!ok) return;
    const body = { pid: p!.id, date: f.date, text, ...(leave ? { leave } : {}) };
    const cmd = req.id ? { t: 'updateRequest' as const, req: { id: req.id, ...body } } : { t: 'addRequest' as const, req: body };
    if (await run(cmd, false)) { onClose(); toast({ text: (req.id ? 'Άλλαξε η αίτηση: ' : 'Αίτηση για την ' + HK() + ' ' + dm(f.date) + ': ') + rkShort(p!), actions: [undoMark()] }); }
  };
  const line = p && ok ? 'Στην ' + HK() + ': «' + upper(hkWho(p) + ': αιτείται ' + reqWhat({ id: '', pid: p.id, date: f.date, text, leave }, state.settings.lists)) + '.»' : '';
  return html`<${Dialog} title=${req.id ? 'Αλλαγή αίτησης' : f.isLeave ? 'Αίτηση άδειας' : 'Νέα αίτηση'} description="Γράφεται στην ${HK()} της ημέρας, στο «5. ΑΙΤΗΣΕΙΣ»." onClose=${onClose} dirty=${dirty && 'Η αίτηση δεν αποθηκεύτηκε. Αν κλείσεις, χάνεται.'}
    footer=${html`<${Why} text=${miss}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} why=${miss} onClick=${save}>Αποθήκευση<//>`}>
    <div className="field"><span className="field__label">Τι αιτείται</span><${Segmented} value=${f.isLeave ? 'leave' : 'other'} onChange=${(v: string) => setF({ ...f, isLeave: v === 'leave' })} items=${[{ value: 'leave', label: 'Άδεια' }, { value: 'other', label: 'Κάτι άλλο' }]}/></div>
    <div className="field"><label className="field__label" htmlFor="rq-p">Ποιος</label>
      ${p ? html`<div className="field-row"><b><${RkName} p=${p} fn=${fullName}/></b>${!req.pid && html`<${Button} size="sm" variant="ghost" onClick=${() => setF({ ...f, pid: null })}>Άλλος<//>`}</div>`
        : html`<${PersonPicker} id="rq-p" autoFocus=${true} onChange=${(pid: number) => setF({ ...f, pid })}/>`}</div>
    <div className="field"><label className="field__label" htmlFor="rq-d">Ημερομηνία ${HK()}</label><${DateField} id="rq-d" className="ui-input" value=${f.date} onChange=${(e: any) => e.target.value && setF({ ...f, date: e.target.value })}/></div>
    ${f.isLeave && html`<div className="field"><label className="field__label" htmlFor="rq-k">Είδος άδειας</label><${Select} id="rq-k" className="ui-input" value=${f.kind} onChange=${(e: any) => setF({ ...f, kind: e.target.value })}>${kinds.map(k => html`<option key=${k} value=${k}>${k}</option>`)}<//></div>
      <${DateRangeField} from=${f.from} to=${f.to} onChange=${(from: string, to: string) => setF({ ...f, from, to })}/>
      <div className="field"><div className="field-row">
        <${TimeField} id="rq-out" label="Ώρα αναχώρησης" value=${f.fromTime} onChange=${(v: string) => setF({ ...f, fromTime: v })} help=${'Προαιρετικό · ' + dow(f.from) + ' ' + dm(f.from)}/>
        <${TimeField} id="rq-in" label="Ώρα επιστροφής" value=${f.toTime} onChange=${(v: string) => setF({ ...f, toTime: v })} help=${'Προαιρετικό · ' + dow(f.to) + ' ' + dm(f.to)}/>
      </div><span className="field__help">Αν μπουν, γράφονται στην αίτηση της ${HK()} και περνούν στην άδεια με το «Εγκρίθηκε». Κενές = ολόκληρες μέρες.</span></div>
      <div className="field"><label className="field__label" htmlFor="rq-dest">Κατεύθυνση (προαιρετικό)</label><input id="rq-dest" className="ui-input" placeholder="π.χ. Κόρινθος" value=${f.dest} onChange=${(e: any) => setF({ ...f, dest: e.target.value })}/><span className="field__help">${destNote({ type: f.kind === HON ? 'HON' : 'LEAVE', kind: f.kind === HON ? undefined : f.kind }, f.dest, state.settings.lists)}</span></div>`}
    <div className="field"><label className="field__label" htmlFor="rq-t">${f.isLeave ? 'Αιτιολόγηση (προαιρετικό)' : 'Αιτείται'}</label><input id="rq-t" className="ui-input" placeholder=${f.isLeave ? 'π.χ. για οικογενειακούς λόγους' : 'π.χ. μετάθεση στην 2η ΕΠΧΙΑ'} value=${f.text} data-autofocus=${p ? '' : undefined} onChange=${(e: any) => setF({ ...f, text: e.target.value })} onKeyDown=${(e: any) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}/>
      <span className="field__help">${line || (f.isLeave ? 'Γράφεται μία φορά, στις αιτήσεις. Όταν εγκριθεί, γίνεται άδεια χωρίς να ξαναγραφτεί στην ' + HK() + '.' : 'Γράψε μόνο το τι ζητά· το «αιτείται» και η τελεία μπαίνουν μόνα τους.')}</span></div>
  <//>`;
}

const HISTORY_PAGE = 60;
export function HistoryScreen() {
  const { audit, today, undo } = useStore();
  const last = audit.find(x => x.undoable && !x.undone);
  // αναζήτηση σε ενέργειες και αρχεία (π.χ. ένα επώνυμο), και φίλτρο ανά πηγή
  const [q, setQ] = useState(''); const dq = useDeferredValue(q); const [src, setSrc] = useState('all');
  const list = useMemo(() => { const n = normGreek(dq.trim()); return audit.filter(e => (src === 'all' || e.source === src) && (!n || normGreek(e.text + ' ' + e.files.join(' ')).includes(n))); }, [audit, dq, src]);
  // 300 γραμμές είναι πάνω από 2.000 στοιχεία στη σελίδα: πρώτα οι 60 πιο πρόσφατες, οι άλλες με κουμπί
  const [more, setMore] = useState(0); useEffect(() => setMore(0), [dq, src]);
  const shown = list.slice(0, HISTORY_PAGE * (more + 1));
  return html`<div>
    <${PageHeader} title="Ιστορικό" sub="Κάθε ενέργεια, από πού έγινε και ποια έντυπα αφορά. Η αναίρεση γίνεται από την πιο πρόσφατη προς τα πίσω."/>
    ${audit.length > 0 && html`<div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση στο ιστορικό" placeholder="Επώνυμο, ενέργεια ή αρχείο (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${Segmented} small=${true} value=${src} onChange=${setSrc} items=${[{ value: 'all', label: 'Όλα' }, ...Object.keys(SRC).filter(k => audit.some(e => e.source === k)).map(k => ({ value: k, label: SRC[k][0] }))]}/>
      <${ActiveFilter} parts=${[src !== 'all' && SRC[src][0], dq && '«' + dq + '»']} onClear=${() => { setQ(''); setSrc('all'); }}/><span className="toolbar__count">${list.length} από ${audit.length}</span></div>`}
    <div className="ui-card">${audit.length && !list.length ? html`<div className="empty">Καμία ενέργεια δεν ταιριάζει.</div>` : audit.length ? html`<ul className="log">${shown.map(e => html`<li key=${e.id} className=${e.undone ? 'is-undone' : ''}>
      <span className="log__time">${e.day === today ? 'Σήμερα' : dm(e.day)}<br/>${e.at}</span>
      <div><b>${e.text}</b> <${Badge} tone=${SRC[e.source][1]}>${SRC[e.source][0]}<//>${e.undone && html` <${Badge}>Αναιρέθηκε<//>`}<div className="log__files">${e.files.join(' · ')}</div></div>
      ${e === last ? html`<${Button} size="sm" variant="outline" onClick=${() => undo(e.id)}>Αναίρεση<//>` : null}
    </li>`)}</ul>${shown.length < list.length && html`<div className="toolbar" style=${{ justifyContent: 'center', margin: '8px 0' }}><${Button} variant="outline" size="sm" onClick=${() => setMore(m => m + 1)}>Δείξε παλιότερες (${list.length - shown.length})<//></div>`}` : html`<div className="empty">Δεν έχει γίνει ακόμα καμία ενέργεια.</div>`}</div>
  </div>`;
}

// Deprecated path: the command palette moved to src/renderer/app/CommandPalette.tsx. Re-exported so old imports work.
export { CommandPalette } from '../app/CommandPalette';

