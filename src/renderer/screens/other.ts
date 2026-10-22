// Σήμερα, ιατρικά/ποινές, δύναμη, ΗΚΑΙ, ιστορικό, templates/εισαγωγή/ρυθμίσεις, αναζήτηση (Ctrl+K)
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { html, Alert, Badge, Button, Why, Card, Dialog, Icon, PageHeader, Segmented, Strip, Tabs, useEscape, useMedia, useToast } from '../ui';
import { Combo, Select } from '../select';
import { useNav, useStore, searchPeople } from '../store';
import { requestLeave, usePending } from '../pending';
import { useNowMin } from '../clock';
import { LeaveEndDialog, StatusFixDialog } from './people';
import { hasTimes, normTime, timeNames } from '../../shared/hours';
import { DayFormsDialog } from './dayForms';
import { ActiveFilter, DateBar, DateField, DateRangeField, ExcelSheet, ExportButton, PersonPicker, StatusBadge, TemplateNote, TimeField, useUsbCopy } from '../common';
import { USB_DAYS, newsSince, usbAge, usbDue } from '../../shared/reminders';
import { hkaiFront, hkaiBack, frouraEmpty } from '../sheets';
import { HK_SECTIONS, dutyStartOf, hkOn, type HkaiSettings, type HkSection, type HkVehicle, TYPES, TYPE_KEYS, RECORD_CATS, effects, fullName, shortName, unitOf, type LeaveAsk, type Person, type PersonRequest, type Status, type TypeKey } from '../../shared/domain';
import { ReturnsList } from './guard';
import { HK_K, HK_A, HK_MANUAL, awayNow, activePeople, hkaiCounts, isRecordExpiredOn, personMap, statusesFrom, statusesOn, strengthOf, strengthAt, awayText } from '../../shared/rules';
import { addDays, daysBetween, dayName, dm, dmy, dow, parseD, DOW_GEN } from '../../shared/dates';
import { norm, normGreek, upper } from '../../shared/text';
import { hkWho, overMax, punBySuggestions, punDays, punLbl, punText, skippedDays } from '../../shared/punish';
import { byName, movesOn, outReason, personLine, reqWhat } from '../../shared/hkaiText';
import { reqText } from '../../shared/commands';
import { recentPeople } from '../prefs';
import { GUIDE_TITLES } from '../guideTopic';
import { SourcesAlert } from './srcStatus';
import { appTitle } from '../../shared/brand';
import { LeavesTab } from './leaves';
import { cadreCountRows, hkRowList, listOf, rankTxt, statusLbl } from '../../shared/ranks';
import { UNIT, hkRowLabel, HK } from '../../shared/unit';
import { HkHeadCard, HkRowsButton } from './hkrows';
import { dutyOfficers, orderedCadre } from '../../shared/cadre';
type P = any;

export function TodayScreen() {
  const { state, today, tomorrow, boot, audit } = useStore(); const nav = useNav(); const usb = useUsbCopy();
  const [forms, setForms] = useState(false);
  const due = usbDue(boot.lastUsb, today);
  const news = newsSince(audit, boot.seenUntil, boot.sessionStart);
  const pm = personMap(state.people);
  const now = useNowMin();
  const c = useMemo(() => strengthOf(state, today, strengthAt(state.rules, today, today, now)), [state, today, now]);
  // Απόντες σήμερα με τον λόγο και ως πότε· η λίστα τελειώνει στους 12, οι υπόλοιποι στη Δύναμη
  const away = useMemo(() => {
    const out: { p: Person; s: Status }[] = [];
    // όπως η ΗΚΑΙ (ως τις 08:00 παρών), και μετά όποιος γύρισε ως τώρα (Michael, 20/10)
    const at = strengthAt(state.rules, today, today, now); activePeople(state).forEach(p => { const x = statusesFrom(state.statuses, p.id, today, at).find(q => TYPES[q.type].away); if (x) out.push({ p, s: x }); });
    return out.sort((a, b) => TYPE_KEYS.indexOf(a.s.type) - TYPE_KEYS.indexOf(b.s.type) || a.s.to.localeCompare(b.s.to) || shortName(a.p).localeCompare(shortName(b.p), 'el'));
  }, [state.statuses, state.people, state.rules, today, now]);
  const empty = frouraEmpty(state, tomorrow);
  // μία σάρωση όλων των καταστάσεων, μόνο όταν αλλάξουν (όχι σε κάθε απόδοση του «Σήμερα»)
  const { ending, endTom, expired, nRec } = useMemo(() => {
    const o = { ending: [] as Status[], endTom: [] as Status[], expired: [] as Status[], nRec: 0 };
    for (const s of state.statuses) {
      const cat = TYPES[s.type].cat; const rec = RECORD_CATS.includes(cat); const known = pm.has(s.pid);
      if (s.from <= today && s.to >= today && rec) o.nRec++;
      if (!known) continue;
      // μόνο ιατρικά και ποινές: οι άδειες φαίνονται στο «Ποιοι γυρίζουν» (όχι ο ίδιος τρεις φορές)
      if (s.to === today && rec) o.ending.push(s);
      if (s.to === tomorrow && (rec || s.type === 'PUN')) o.endTom.push(s);
      if (isRecordExpiredOn(s, today)) o.expired.push(s);
    }
    return o;
  }, [state.statuses, state.people, today, tomorrow]);   // eslint-disable-line react-hooks/exhaustive-deps
  const endTxt = (s: Status) => {
    const t = TYPES[s.type]; if (t.cat === 'abs') return awayNow(s, today, now) ? 'Αναμένεται επιστροφή' + (s.toTime ? ' στις ' + s.toTime : '') : 'Γύρισε στις ' + s.toTime;
    // άλλο ιατρικό που συνεχίζει αύριο: λέει τι μένει, όχι ότι ξαναμπαίνει
    const rest = statusesOn(state.statuses, s.pid, tomorrow).filter(x => x.id !== s.id && TYPES[x.type].cat !== 'out');
    const lbl = (x: Status) => statusLbl(x, state.settings.lists) + (x.open ? ' χωρίς λήξη' : ' έως ' + dm(x.to));
    const nd = rest.find(x => TYPES[x.type].noDuty), na = rest.find(x => TYPES[x.type].noArmed);
    if (t.noDuty) return nd ? 'Μένει ' + lbl(nd) : na ? 'Από αύριο ξαναμπαίνει σε υπηρεσίες, όχι σε ένοπλες (' + lbl(na) + ')' : 'Από αύριο ξαναμπαίνει σε υπηρεσίες';
    if (t.noArmed) return nd || na ? 'Μένει ' + lbl((nd || na)!) : 'Από αύριο ξαναμπαίνει και σε ένοπλες θέσεις';
    return 'Από αύριο μπορεί να βγει έξοδο';
  };
  const what = (s: Status) => (s.type === 'PUN' ? 'ποινή (' + punLbl(s.kind) + ')' : statusLbl(s, state.settings.lists));
  if (!c.total) return html`<div className="onboard"><${Card} title=${'Καλώς ήρθες στο ' + appTitle(state.settings)}>
    <p style=${{ marginTop: 0 }}>Για να ξεκινήσεις χρειάζεται το προσωπικό ${UNIT().nom === 'Λόχος' ? 'του Λόχου' : 'της Ίλης'}. Πάρ' το από το Δυναμολόγιο (το αρχείο .xlsm με το φύλλο «ΣΥΝΟΛΙΚΟ»).</p>
    <ol><li>Πάτα <b>Εισαγωγή Δυναμολογίου</b> και διάλεξε το αρχείο.</li><li>Δες τι βρέθηκε και πάτα <b>Εισαγωγή</b>.</li><li>Στις <b>Ρυθμίσεις</b> βάλε τα στελέχη ανά βαθμό για την ${HK()}.</li></ol>
    <${Button} onClick=${() => nav.go('templates', { tab: 'import' })}>Εισαγωγή Δυναμολογίου<//>
  <//></div>`;
  // Τι πρέπει να γίνει σήμερα (με αριθμό) και τι απλώς λήγει
  const tasks: { key: string; title: string; sub: string; urgent?: boolean; btn: string; fn: () => void }[] = [];
  if (empty > 0) tasks.push({ key: 'empty', title: 'Υπηρεσίες αύριο, ' + dow(tomorrow) + ' ' + dm(tomorrow), sub: empty + (empty === 1 ? ' κενή θέση' : ' κενές θέσεις') + ' · πριν τις ' + dutyStartOf(state.settings), urgent: true, btn: 'Συμπλήρωσε', fn: () => nav.go('guard', { guardDate: tomorrow }) });
  const waiting = reqWaiting(state.requests).filter(r => pm.has(r.pid));
  if (waiting.length) tasks.push({ key: 'req', title: waiting.length === 1 ? 'Αίτηση άδειας περιμένει απάντηση' : waiting.length + ' αιτήσεις άδειας περιμένουν απάντηση', sub: waiting.map(r => shortName(pm.get(r.pid)!)).join(', ') + ' · πάτα «Εγκρίθηκε» ή «Απορρίφθηκε» όταν υπογράψει ο Διοικητής', btn: 'Άνοιξε', fn: () => nav.go('hkai', { hkTab: 'req' }) });
  if (due) tasks.push({ key: 'usb', title: 'Αντίγραφο σε USB', sub: (boot.lastUsb ? 'Πέρασαν ' + usbAge(boot.lastUsb, today) + ' μέρες από το τελευταίο' : 'Δεν έχει παρθεί ποτέ') + '. Αν χαλάσει ο δίσκος του PC, χάνονται όλα (κάθε ' + USB_DAYS + ' μέρες).', btn: 'Αντίγραφο σε USB', fn: usb });
  const ends = [
    ...expired.map(s => ({ s, when: 'έληξε χθες, αφαιρέθηκε αυτόματα', tip: 'Από σήμερα δεν ισχύει· γράφτηκε στο Ιστορικό' })),
    ...ending.map(s => ({ s, when: 'λήγει σήμερα', tip: endTxt(s) })),
    ...endTom.map(s => ({ s, when: 'λήγει αύριο', tip: '' }))
  ];
  const kpi = (l: string, n: number, fn: () => void, tone?: string, tip?: string) => html`<button type="button" className=${'kpi' + (tone ? ' kpi--' + tone : '')} data-tip=${tip} onClick=${fn}><span className="kpi__l">${l}</span><span className="kpi__n">${n}</span></button>`;
  return html`<div>
    <${PageHeader} title="Σήμερα" sub=${'Ημερήσια κατάσταση ' + DOW_GEN[parseD(today).getDay()] + ' ' + dmy(today) + '. ' + (tasks.length ? tasks.length + (tasks.length === 1 ? ' πράγμα θέλει εσένα' : ' πράγματα θέλουν εσένα') + (empty > 0 ? '. Το πρώτο πριν τις ' + dutyStartOf(state.settings) + '.' : '.') : 'Τίποτα δεν περιμένει από σένα αυτή τη στιγμή.')}>
      <div className="page-head__acts"><${Button} variant="outline" onClick=${() => setForms(true)} data-tip=${'Αυριανή ΦΡΟΥΡΑ, σημερινή ' + HK() + ' και Εξοδούχοι: ένας έλεγχος για όλα, μετά «Βγάλε όλα» ή «Τύπωσε όλα»'}>${Icon.print}Έντυπα ημέρας<//><${Button} variant="outline" onClick=${() => nav.go('outs', { outDate: today })}>Εξοδούχοι σήμερα<//><${Button} variant="outline" onClick=${() => nav.go('hkai', { hkaiDate: today })} data-tip="Βγαίνει μόνη της από τις υπηρεσίες και τις καταστάσεις">${HK()} σήμερα<//><${Button} onClick=${() => nav.declare({})} data-tip="Ιατρικό, άδεια, έξοδος, ΔΝ ή ποινή, για έναν ή πολλούς">+ Δήλωσε κατάσταση<//></div><//>
    ${boot.dataFallback && html`<${Alert} tone="warn"><span><b>Τα δεδομένα είναι στο προφίλ του χρήστη</b> (${boot.dataDir}), όχι δίπλα στο GrafeioIlis.exe. Αν μεταφέρεις την εφαρμογή σε άλλο PC, πάρε μαζί και αυτόν τον φάκελο, ή κάνε «Αντίγραφο σε USB».</span><//>`}
    <${SourcesAlert}/>
    <div className="kpis">
      ${kpi('Στρατιώτες', c.total, () => nav.go('people', { filter: 'all' }), undefined, 'Στρατιώτες σε δύναμη. Η ' + HK() + ' μετρά και τα στελέχη, με τις 08:00')}
      ${kpi('Παρόντες', c.present, () => nav.go('people', { filter: 'present' }))}
      ${kpi('Απόντες', c.absent, () => nav.go('strength', { strengthDate: today }), undefined, (awayText(c) || 'Κανείς') + '. Κάθε άτομο μία φορά. Ιατρικά σε ισχύ: ' + nRec)}
      ${kpi('Εξοδούχοι', c.counts.OUT + c.counts.DN, () => nav.go('outs', { outDate: today }), undefined, c.counts.OUT + ' έξοδος · ' + c.counts.DN + ' ΔΝ')}
      ${kpi('Κενές αύριο', empty, () => nav.go('guard', { guardDate: tomorrow }), empty ? 'bad' : 'ok')}
    </div>
    <div className="cols">
      <${Card} flush=${true} title="Πρέπει σήμερα" actions=${html`<span className="card__meta">${tasks.length ? tasks.length + ' ανοιχτά' : 'όλα εντάξει'}</span>`}>
        ${tasks.length ? html`<ol className="tasks">${tasks.map((t, i) => html`<li key=${t.key}><span className="tasks__n">${i + 1}</span><div><b>${t.title}</b><small className=${t.urgent ? 'txt-bad' : undefined}>${t.sub}</small></div><${Button} variant=${i === 0 ? 'default' : 'outline'} onClick=${t.fn}>${t.btn}<//></li>`)}</ol>` : html`<div className="empty">Όλα εντάξει. Τίποτα δεν περιμένει από σένα αυτή τη στιγμή.</div>`}
      <//>
      <${Card} flush=${true} title=${'Απόντες σήμερα · ' + away.length} actions=${html`<${Button} size="sm" variant="ghost" onClick=${() => nav.go('strength', { strengthDate: today })}>Δύναμη<//>`}>
        ${away.length ? html`<ul className="rows">${away.slice(0, 12).map(({ p, s }) => html`<li key=${s.id}><button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button><${Badge} tone=${TYPES[s.type].tone} className="tag" data-tip=${TYPES[s.type].long} data-tip-side="left">${statusLbl(s, state.settings.lists)} ${TYPES[s.type].cat === 'out' ? 'σήμερα' : s.open ? 'χωρίς λήξη' : 'έως ' + dm(s.to) + (s.toTime ? ' ' + s.toTime : '')}<//></li>`)}</ul>
          ${away.length > 12 && html`<p className="note rows__more">Και άλλοι ${away.length - 12} στη Δύναμη.</p>`}` : html`<div className="empty">Κανείς δεν λείπει σήμερα.</div>`}
      <//>
    </div>
    <div className="cols cols--b">
      ${away.length > 0 && html`<${Card} flush=${true} title="Ποιοι γυρίζουν και πότε" actions=${html`<${Button} size="sm" variant="ghost" onClick=${() => nav.go('outs', { outDate: today })}>Εξοδούχοι<//>`}><${ReturnsList} date=${today} limit=${12}/><//>`}
      ${ends.length > 0 && html`<${Card} flush=${true} title="Λήγουν" actions=${html`<${Button} size="sm" variant="ghost" onClick=${() => nav.go('records', { recTab: expired.length ? 'expired' : 'med' })}>Ιατρικά<//>`}>
        <ul className="rows">${ends.map(({ s, when, tip }) => html`<li key=${s.id}><button type="button" className="linkish" onClick=${() => nav.openPerson(s.pid)}>${shortName(pm.get(s.pid)!)}</button><span className="muted" data-tip=${tip || undefined} data-tip-side="left">${what(s)} · ${when}</span></li>`)}</ul>
      <//>`}
      ${news.length > 0 && html`<${Card} flush=${true} title="Από το προηγούμενο άνοιγμα" actions=${html`<${Button} size="sm" variant="ghost" onClick=${() => nav.go('history')}>Όλο το ιστορικό<//>`}>
        <ul className="log log--compact">${news.slice(0, 10).map(e => html`<li key=${e.id}><span className="log__time">${e.day === today ? '' : dow(e.day) + ' ' + dm(e.day) + ' '}<b>${e.at}</b></span><div>${e.text}</div><span className="log__src">${SRC[e.source][0]}</span></li>`)}</ul>
        ${news.length > 10 && html`<p className="note" style=${{ margin: '8px 0 0' }}>Και άλλες ${news.length - 10} ενέργειες στο Ιστορικό.</p>`}
      <//>`}
    </div>
    ${forms && html`<${DayFormsDialog} onClose=${() => setForms(false)}/>`}
  </div>`;
}

// Ιατρικά: δικό τους μενού. Ποινές: καρτέλα μέσα στο μενού ΗΚΑΙ (Michael, 18/10). Ίδια λίστα, άλλο φίλτρο.
export function RecordsScreen() { return html`<${RecordList} mode="med"/>`; }
const MED_TABS = ['med', 'expired'], PUN_TABS = ['pun', 'expired', 'allpun'];
function RecordList({ mode }: { mode: 'med' | 'pun' }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const pm = personMap(state.people); const now = useNowMin();
  const tabKey = mode === 'med' ? 'recTab' : 'punTab';
  const tab: string = (mode === 'med' ? MED_TABS : PUN_TABS).includes(nav.params[tabKey]) ? nav.params[tabKey] : mode;
  const [pq, setPq] = useState(''); const dpq = useDeferredValue(pq);
  const medF: string = nav.params.medF || '';
  const y = addDays(today, -1);
  const isMed = (s: Status) => ['med', 'other'].includes(TYPES[s.type].cat);
  const list = useMemo(() => {
    // αναζήτηση σε όλες τις καρτέλες: όνομα, κωδικός, είδος ποινής, σημείωση, ποιος τιμώρησε, λόγος
    const qq = normGreek(dpq.trim());
    const ok = (s: Status) => pm.has(s.pid) && (!qq || normGreek(fullName(pm.get(s.pid)!) + ' ' + TYPES[s.type].label + ' ' + TYPES[s.type].long + ' ' + (s.kind || '') + ' ' + (s.note || '') + ' ' + (s.by || '') + ' ' + (s.reason || '')).includes(qq));
    if (tab === 'allpun') return state.statuses.filter(s => s.type === 'PUN' && ok(s)).sort((a, b) => b.from.localeCompare(a.from));
    if (tab === 'expired') return state.statuses.filter(s => (mode === 'med' ? isMed(s) : s.type === 'PUN') && !s.pending && !awayNow(s, today, now) && s.to >= addDays(today, -14) && ok(s)).sort((a, b) => b.to.localeCompare(a.to));
    return state.statuses.filter(s => awayNow(s, today, now) && (tab === 'med' ? isMed(s) && (!medF || statusLbl(s, state.settings.lists) === medF) : s.type === 'PUN') && ok(s)).sort((a, b) => a.to.localeCompare(b.to));
  }, [state.statuses, tab, today, dpq, medF, mode, now]);
  // ΕΥ, ΕΑ, ΕΟ, ΣΤΕΠ… ως φίλτρα, με πόσοι έχουν τον καθένα (Michael, 17/10: τα ιατρικά εδώ, όχι στο Δυναμολόγιο)
  const medCnt = useMemo(() => { const m = new Map<string, number>(); state.statuses.forEach(s => { if (awayNow(s, today, now) && isMed(s) && pm.has(s.pid)) { const l = statusLbl(s, state.settings.lists); m.set(l, (m.get(l) || 0) + 1); } }); return [...m].sort((a, b) => b[1] - a[1]); }, [state.statuses, today, state.settings.lists, now]);
  const nMed = state.statuses.filter(s => awayNow(s, today, now) && isMed(s)).length;
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
    <div style=${{ marginBottom: '12px' }}><${Segmented} value=${tab} onChange=${(v: string) => nav.set({ recTab: v })} items=${[{ value: 'med', label: 'Τώρα (' + nMed + ')', tip: 'Όσα ισχύουν τώρα' }, { value: 'expired', label: 'Έληξαν', tip: 'Όσα έληξαν τις τελευταίες 14 μέρες' }]}/></div>`
    : html`<${PageHeader} title="Ποινές" sub="Ισχύουν αμέσως και γράφονται στην ${HK()} της μέρας που επιβλήθηκαν.">
      <${Button} onClick=${() => nav.declare({ cat: 'pun', from: today, to: addDays(today, 4) })}>+ Ποινή<//><//>
    <div style=${{ marginBottom: '12px' }}><${Segmented} value=${tab} onChange=${(v: string) => nav.set({ punTab: v })} items=${[{ value: 'pun', label: 'Τώρα (' + nPun + ')', tip: 'Όσες ισχύουν τώρα' }, { value: 'expired', label: 'Έληξαν', tip: 'Όσες έληξαν τις τελευταίες 14 μέρες' }, { value: 'allpun', label: 'Όλες', tip: 'Όλες οι ποινές, με αναζήτηση' }]}/></div>`}
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση" placeholder=${mode === 'med' ? 'Όνομα, κωδικός (π.χ. ΕΥ) ή σημείωση · Ctrl+F' : 'Όνομα, είδος ποινής, ποιος τιμώρησε ή λόγος · Ctrl+F'} value=${pq} onChange=${(e: any) => setPq(e.target.value)}/>${dpq.trim() && html`<span className="toolbar__count">${list.length} ${list.length === 1 ? 'βρέθηκε' : 'βρέθηκαν'}</span>`}</div>
    ${tab === 'med' && medCnt.length > 1 && html`<div className="filters"><${Strip} role="group" aria-label="Είδος ιατρικού">${[['', 'Όλα', nMed] as [string, string, number], ...medCnt.map(([l, n]) => [l, l, n] as [string, string, number])].map(([k, l, n]) => html`<button key=${k || 'all'} type="button" className="ui-chip" aria-pressed=${medF === k} onClick=${() => nav.set({ medF: medF === k ? '' : k })}>${l}<span className="cnt">${n}</span></button>`)}<//></div>`}
    <div className="ui-card">${list.length ? html`<ul className="rec">${list.map(s => { const t = TYPES[s.type]; const p = pm.get(s.pid)!; return html`<li key=${s.id}>
      <div><button type="button" className="linkish who" onClick=${() => nav.openPerson(s.pid)}>${fullName(p)}</button> <${Badge} tone=${t.tone} data-tip=${t.long}>${statusLbl(s, state.settings.lists)}<//>
        <small>${dow(s.from)} ${dm(s.from)} – ${s.open ? '…' : dow(s.to) + ' ' + dm(s.to)} · ${tab === 'expired' ? (s.to === today ? timeNames(s.type).to + ' σήμερα ' + s.toTime : 'αφαιρέθηκε αυτόματα ' + (s.to === y ? 'σήμερα' : dm(addDays(s.to, 1)))) : left(s)}${tab !== 'expired' && effects(t) ? ' · ' + effects(t) : ''}${s.note ? ' · ' + s.note : ''}${s.type === 'PUN' && (s.by || s.reason) ? ' · ' + [s.by && 'από ' + s.by, s.reason && 'διότι ' + s.reason].filter(Boolean).join(', ') : ''}${skipTxt(s)}</small></div>
      <${Button} size="sm" variant="ghost" onClick=${() => setFix(s)} data-tip="Μπήκε λάθος; Άλλαξε ημερομηνίες και στοιχεία ή διάγραψέ το" data-tip-side="left">Διόρθωση…<//>
      ${s.type === 'PUN' && html`<${Button} size="sm" variant="outline" onClick=${() => setTxt(s)} data-tip="Έτοιμο κείμενο για το Word, με «Αντιγραφή»" data-tip-side="left">Κείμενο<//>`}
      ${tab === 'expired' ? html`<${Badge} tone="ok">Αυτόματα<//>` : tab === 'allpun' || s.to < today ? html`<${Badge} tone=${s.to < today ? 'outline' : 'warn'}>${s.to < today ? 'Έληξε' : 'Ισχύει'}<//>` : html`<${Button} size="sm" variant="ghost" onClick=${() => (hasTimes(s.type) ? setEnd(s) : setStop(s))} data-tip=${'Μόνο αν σταμάτησε πριν από τις ' + dm(s.to) + ' (π.χ. τον έκοψε ο γιατρός). Αλλιώς λήγει μόνο του.'} data-tip-side="left">Λήξη νωρίτερα…<//>`}
    </li>`; })}</ul>` : html`<div className="empty">${tab === 'expired' ? 'Τίποτα δεν έληξε τις τελευταίες 14 μέρες.' : mode === 'med' ? 'Κανένα ιατρικό σε ισχύ.' : 'Καμία ποινή σε ισχύ.'}</div>`}</div>
    ${stop && (() => { const t = TYPES[stop.type]; const p = pm.get(stop.pid)!; const what = (stop.type === 'PUN' ? 'Η ποινή' : t.label) + ' του ' + shortName(p); return html`<${Dialog} role="alertdialog" title="Λήξη νωρίτερα;" description=${what + ' · ' + dm(stop.from) + '–' + (stop.open ? 'χωρίς λήξη' : dm(stop.to))} onClose=${() => setStop(null)}
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
function PunTextDialog({ st, onClose }: P) {
  const { state, run } = useStore(); const toast = useToast();
  const p = personMap(state.people).get(st.pid)!;
  const [f, setF] = useState({ by: st.by || '', reason: st.reason || '', on: st.on || st.from });
  const byList = useMemo(() => punBySuggestions(state), [state.statuses, state.cadreList]);
  const t = punText(p, { ...st, by: f.by.trim() || undefined, reason: f.reason.trim() || undefined, on: f.on }, state.settings.lists);
  const max = overMax(st.kind, punDays(st), state.settings.lists);
  const dirty = f.by !== (st.by || '') || f.reason !== (st.reason || '') || f.on !== (st.on || st.from);
  const save = async () => (dirty ? run({ t: 'setPunInfo', id: st.id, by: f.by, reason: f.reason, on: f.on }, false) : true);
  return html`<${Dialog} title="Κείμενο ποινής" description=${fullName(p) + ' · ' + punLbl(st.kind) + ' ' + dm(st.from) + '–' + dm(st.to)} onClose=${onClose} dirty=${dirty && 'Τα στοιχεία της ποινής (ποιος, πότε, λόγος) δεν αποθηκεύτηκαν. Αν κλείσεις, χάνονται.'}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Κλείσιμο<//>${dirty && html`<${Button} variant="outline" onClick=${async () => { if (await save()) toast({ text: 'Αποθηκεύτηκαν τα στοιχεία της ποινής' }); }}>Αποθήκευση<//>`}<${Button} onClick=${async () => { if (!(await save())) return; toast({ text: copyRich(t.html, t.plain) ? 'Αντιγράφηκε. Στο Word πάτα Ctrl+V.' : 'Δεν έγινε αντιγραφή. Επίλεξε το κείμενο και πάτα Ctrl+C.' }); }}>Αντιγραφή<//>`}>
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="pt-by">Ποιος τιμώρησε</label><${Combo} id="pt-by" className="ui-input" options=${byList} placeholder="σε αιτιατική, π.χ. ΛΧΙΑ ΔΟΚΙΜΙΟ" value=${f.by} onChange=${(e: any) => setF({ ...f, by: e.target.value })}/></div>
      <div className="field"><label className="field__label" htmlFor="pt-on">Ημερομηνία τιμωρίας</label><${DateField} id="pt-on" className="ui-input" value=${f.on} onChange=${(e: any) => e.target.value && setF({ ...f, on: e.target.value })}/></div></div>
    <div className="field"><label className="field__label" htmlFor="pt-r">Λόγος (διότι…)</label><textarea id="pt-r" className="ui-input" rows="2" value=${f.reason} onChange=${(e: any) => setF({ ...f, reason: e.target.value })}></textarea></div>
    ${max > 0 && html`<${Alert} tone="warn"><span>${punLbl(st.kind)} πάνω από ${max} ημέρες. Έλεγξε τη διάρκεια.</span><//>`}
    <div className="puntext" aria-label="Προεπισκόπηση">${t.before}<u>${t.dur}</u>${t.after}</div>
  <//>`;
}

export function StrengthScreen() {
  const { state, today, tomorrow } = useStore(); const nav = useNav();
  const date = nav.params.strengthDate || today;
  const now = useNowMin();
  // σήμερα με την ίδια στιγμή που μετρά το «Σήμερα» (όποιος γύρισε ως τώρα είναι παρών), για να βγαίνουν ίδια νούμερα
  const c = useMemo(() => strengthOf(state, date, strengthAt(state.rules, date, today, now)), [state, date, today, now]);
  // οι απουσίες με κάθε άτομο μία φορά (στον πρώτο λόγο), ώστε να αθροίζουν στους Απόντες· τα υπόλοιπα όλα
  const nOf = (k: TypeKey) => (TYPES[k].away ? c.away[k] : c.counts[k]);
  const listOf = (k: TypeKey) => (TYPES[k].away ? c.awayLists[k] : c.lists[k]);
  // οι κατηγορίες χωρίς κανέναν σε μία γραμμή στο τέλος, για να χωρά η Δύναμη σε μία οθόνη
  const zeros = TYPE_KEYS.filter(k => !nOf(k));
  return html`<div>
    <${PageHeader} title=${'Δύναμη ' + DOW_GEN[parseD(date).getDay()] + ' ' + dmy(date)} sub="Βγαίνει μόνη της από ιατρικά, άδειες, εξόδους και ποινές."><${DateBar} value=${date} onChange=${(d: string) => nav.set({ strengthDate: d })} days=${[today, tomorrow]}/><//>
    <${Card} title="Σύνοψη" actions=${html`<${Button} size="sm" variant="outline" onClick=${() => nav.go('hkai', { hkaiDate: date })}>${HK()}<//>`}>
      <div className="tiles" style=${{ marginBottom: '12px' }}><div className="tile tile--main"><span className="tile__n">${c.total}</span><span className="tile__l">Στρατιώτες</span></div><div className="tile"><span className="tile__n">${c.present}</span><span className="tile__l">Παρόντες</span></div><div className="tile"><span className="tile__n">${c.absent}</span><span className="tile__l">Απόντες</span></div></div>
      ${c.absent > 0 && html`<p className="note" style=${{ margin: '0 0 10px' }}>Απόντες ${c.absent} = ${awayText(c)}. Κάθε άτομο μετριέται μία φορά: όποιος έχει και άδεια και έξοδο μετρά στην άδεια.${date === today ? ' Όποιος γύρισε σήμερα ως τώρα είναι παρών.' : ''}</p>`}
      ${TYPE_KEYS.filter(k => nOf(k) > 0).map(k => html`<div key=${k} className="cat"><div className="cat__head"><${Badge} tone=${TYPES[k].tone}>${TYPES[k].label}<//><b>${TYPES[k].long}</b><span className="num">${nOf(k)}</span></div>
        ${nOf(k) > 0 && html`<div className="cat__names">${listOf(k).map(p => html`<button key=${p.id} type="button" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button>`)}</div>`}</div>`)}
      ${zeros.length > 0 && html`<p className="cat__zero"><b>Κανείς σε:</b> ${zeros.map(k => TYPES[k].label).join(', ')}</p>`}
    <//>
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
    <div style=${{ marginBottom: '14px' }}><${Tabs} value=${tab} onChange=${(v: string) => nav.set({ hkTab: v })} items=${[{ value: 'hkai', label: HK() }, { value: 'pun', label: n('Ποινές', nPun) }, { value: 'leave', label: n('Άδειες', nLeave) }, { value: 'req', label: n('Αιτήσεις', nReq) }]}/></div>
    ${tab === 'pun' ? html`<${RecordList} mode="pun"/>` : tab === 'leave' ? html`<${LeavesTab}/>` : tab === 'req' ? html`<${RequestsTab}/>` : html`<${HkaiMain}/>`}
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
    <p className="note" style=${{ margin: 0 }}>${nDay ? nDay + (nDay === 1 ? ' αίτηση' : ' αιτήσεις') : 'Καμία αίτηση'} για ${date === today ? 'σήμερα' : dm(date)}${nWait ? ' · ' + nWait + (nWait === 1 ? ' αίτηση άδειας περιμένει' : ' αιτήσεις άδειας περιμένουν') + ' απάντηση' : ''}.</p>
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
  const fn = HK() + ' ' + dm(date).replace('/', '.') + '.' + date.slice(2, 4) + '.xlsx';
  const cadre = state.cadreList.filter(c => c.active).length || Object.values(state.settings.cadre).reduce((a, b) => a + (b || 0), 0);
  const sum = html`<div className="stack"><${Card} title="Από πού βγαίνει κάθε αριθμός">
    <div className="tiles" style=${{ marginBottom: '12px' }}><div className="tile tile--main" data-tip=${'Η δύναμη της ' + HK() + ': στρατιώτες και στελέχη, με τον κανόνα των ' + (state.rules?.hkTime || '08:00') + '. Το Σήμερα και η Δύναμη μετρούν μόνο στρατιώτες, τώρα.'}><span className="tile__n">${h.total}</span><span className="tile__l">Δύναμη</span></div><div className="tile"><span className="tile__n">${h.kol}</span><span className="tile__l">Κωλυόμενοι</span></div><div className="tile"><span className="tile__n">${h.apo}</span><span className="tile__l">Απόντες</span></div><div className="tile"><span className="tile__n">${h.avail}</span><span className="tile__l">Διαθέσιμοι</span></div></div>
    <p className="note" style=${{ margin: '-4px 0 12px' }}>Δύναμη = <b>${h.soldiers}</b> στρατιώτες + <b>${h.cadreN}</b> στελέχη · μετρά με τις ${state.rules?.hkTime || '08:00'} (όποιος γυρίσει ως τότε είναι παρών).</p>
    <ul className="hk-src">${src.map(([k, , full]) => html`<li key=${k}><b>${full}</b>: <span className="num">${h.cols[k].length + (h.cadre[k]?.length || 0)}</span><div className="cat__names">${cadreOf(k).map(c => html`<button key=${c.id} type="button" data-tip="Στέλεχος· η κατάσταση αλλάζει στην καρτέλα Στελέχη" onClick=${() => nav.go('cadre')}>${rankTxt(c)} ${c.last}</button>`)}${h.cols[k].map(p => html`<button key=${p.id} type="button" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button>`)}</div></li>`)}</ul>
    <p className="note" style=${{ margin: '8px 0 0' }}>Υπηρεσία από την κατάσταση υπηρεσιών, ΕΥ και ποινές από τα ιατρικά και τις ποινές, απόντες από άδειες, αναρρωτικές και νοσοκομείο· τα στελέχη από τις καταστάσεις τους στην καρτέλα Στελέχη. Κάθε άτομο μετριέται μία φορά. Διαθέσιμοι = Δύναμη − Απόντες (ο τύπος του εντύπου). Οι εξοδούχοι δεν μετρούν.</p>
  <//>
  <${CadreCard} warn=${!cadre}/>
  <${HkHeadCard}/>
  <${RequestsLink} date=${date}/>
  <${HkaiMovesCard} date=${date}/>
  <${HkaiManualCard} date=${date}/>
  <${HkaiSectionsCard}/></div>`;
  const sheets = html`<div>
    ${!mobile && html`<div style=${{ marginBottom: '8px' }}><${Tabs} value=${side === 'sum' ? 'front' : side} onChange=${setSide} items=${[{ value: 'front', label: 'Μπροστά' }, { value: 'back', label: 'Πίσω' }]}/></div>`}
    ${side === 'back' ? html`<${ExcelSheet} model=${back} fileName=${fn} sheetName="πισω" meta="A4 οριζόντιο"/>` : html`<${ExcelSheet} model=${front} fileName=${fn} sheetName="μπροστινο" meta="A4 οριζόντιο · 1 σελίδα" footer="Γράφονται μόνο τα κελιά εισόδου· τα αθροίσματα μένουν τύποι του εντύπου."/>`}
    <${TemplateNote} ids=${['hkai']}/></div>`;
  return html`<div>
    <${PageHeader} title=${HK() + ' της ' + dmy(date)} sub="Βγαίνει μόνη της· κάθε αριθμός ανοίγει τα ονόματα."><${DateBar} value=${date} onChange=${(d: string) => requestLeave(() => nav.set({ hkaiDate: d }))} days=${[addDays(today, -1), today, addDays(today, 1)]}/>
      <div className="page-head__acts"><${ExportButton} kind="hkai" date=${date} label="η ${HK()}"/></div><//>
    ${mobile ? html`<div style=${{ marginBottom: '12px' }}><${Tabs} value=${side} onChange=${setSide} items=${[{ value: 'sum', label: 'Σύνοψη' }, { value: 'front', label: 'Μπροστά' }, { value: 'back', label: 'Πίσω' }]}/></div>${side === 'sum' ? sum : sheets}` : html`<div className="strength">${sum}${sheets}</div>`}
  </div>`;
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
const HK_TEXT_FIELDS: [string, string, string][] = [['egr', '1. Εγγραφές (επιπλέον, μετά από όσους μπήκαν στη δύναμη)', ''], ['dia', '2. Διαγραφές (επιπλέον, μετά από όσους βγήκαν εκτός δύναμης)', ''], ['ait', '5. Αιτήσεις (ελεύθερο κείμενο, μετά τις αριθμημένες)', ''], ['loi', '6. Λοιπά', ''], ['off', 'Αξιωματικός υπηρεσίας', 'π.χ. ΑΝΘΛΓΟΣ …']];
const HK_ACC_FIELDS: [string, string][] = [['accT', 'Ζημιές σε οχήματα: ολικές'], ['accP', 'Ζημιές σε οχήματα: μερικές'], ['accM', 'Σε άνδρες']];
function HkaiManualCard({ date }: { date: string }) {
  const { state, run, today } = useStore(); const toast = useToast();
  const cur = state.hkaiManual[date] || { cells: {}, text: {} };
  const [m, setM] = useState(cur); const [rk, setRk] = useState('Στρατιώτες');
  useEffect(() => setM(state.hkaiManual[date] || { cells: {}, text: {} }), [date, state.hkaiManual]);
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
    ${HK_TEXT_FIELDS.map(([k, l, ph]) => html`<div key=${k} className="field"><label className="field__label" htmlFor=${'hk-' + k}>${l}</label><${k === 'off' ? Combo : 'input'} id=${'hk-' + k} className="ui-input" placeholder=${k === 'off' && auto ? auto : ph} options=${k === 'off' ? offList : undefined} value=${m.text[k] || ''} onChange=${(e: any) => setM({ ...m, text: { ...m.text, [k]: e.target.value } })}/>${k === 'off' && html`<span className="field__help">${auto ? 'Κενό = από τα Στελέχη: ' + auto + '.' : 'Κενό = όποιος αξιωματικός έχει «Υπηρεσία» στα Στελέχη.'}</span>`}</div>`)}
    ${hkOn(state.settings, 'acc') && html`<div className="field"><span className="field__label">Ατυχήματα</span><div className="settings-grid">${HK_ACC_FIELDS.map(([k, l]) => html`<label key=${k} className="field"><span className="field__help">${l}</span><input className="ui-input" placeholder="Ø" value=${m.text[k] || ''} onChange=${(e: any) => setM({ ...m, text: { ...m.text, [k]: e.target.value } })}/></label>`)}</div><span className="field__help">Κενό = Ø, όπως στο έντυπο.</span></div>`}
    <p className="note">Οι αποφάσεις 1 (όσοι μπήκαν στη δύναμη), 2 (όσοι βγήκαν εκτός δύναμης), 3 (άδειες που ξεκινούν ή εγκρίθηκαν), 4 (ποινές της μέρας) και 5 (αιτήσεις) γράφονται μόνες τους. Οχήματα και «Προβλέπονται» στις «Ενότητες της ${HK()}» πιο κάτω.</p>
    <div className="toolbar"><${Button} disabled=${!dirty} why="Δεν άλλαξε κάτι" onClick=${saveM}>Αποθήκευση<//>${dirty && html`<${Button} variant="ghost" onClick=${() => setM(cur)}>Ακύρωση<//>`}</div>
  <//>`;
}

// 1. ΕΓΓΡΑΦΕΣ / 2. ΔΙΑΓΡΑΦΕΣ της μέρας: βγαίνουν μόνες τους από το προσωπικό· «Να μη γραφτεί» για όποιον δεν πρέπει
function HkaiMovesCard({ date }: { date: string }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const ins = useMemo(() => movesOn(state, 'inOn', date), [state, date]), outs = useMemo(() => movesOn(state, 'outOn', date), [state, date]);
  if (!ins.length && !outs.length) return null;
  const drop = async (p: Person, field: 'inOn' | 'outOn') => { if (await run({ t: 'setPersonMove', pid: p.id, field, date: null }, false)) toast({ text: shortName(p) + ': δεν γράφεται στις ' + (field === 'inOn' ? 'εγγραφές' : 'διαγραφές'), actions: [undoMark()] }); };
  const list = (ps: Person[], field: 'inOn' | 'outOn') => html`<ol className="hk-req">${ps.map(p => html`<li key=${p.id}><div className="hk-req__row"><span><button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button> <span className="muted">${personLine(p)}${field === 'outOn' && outReason(p) ? ': ' + outReason(p) : ''}</span></span>
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
  const toggle = async (k: HkSection, on: boolean) => { const off = (cur.off || []).filter(x => x !== k); if (!on) off.push(k); if (await save({ ...cur, off }, (on ? 'άνοιξε: ' : 'έκλεισε: ') + HK_SECTIONS.find(x => x[0] === k)![1].toLowerCase())) toast({ text: (on ? 'Άνοιξε: ' : 'Έκλεισε: ') + HK_SECTIONS.find(x => x[0] === k)![1] }); };
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
// 5. ΑΙΤΗΣΕΙΣ: αιτήσεις στρατιωτών της μέρας, αριθμημένες όπως θα βγουν στην ΗΚΑΙ. Οι αιτήσεις άδειας περιμένουν
// «Εγκρίθηκε» ή «Απορρίφθηκε»· με την έγκριση γίνονται άδεια (στην ΗΚΑΙ μένει μόνο η αίτηση).
export const reqWaiting = (rs: PersonRequest[]) => rs.filter(r => r.leave && !r.decision);
function RequestsCard({ date }: { date: string }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const [edit, setEdit] = useState<Partial<PersonRequest> | null>(null);
  const pm = useMemo(() => personMap(state.people), [state.people]);
  const sorted = (rs: PersonRequest[]) => rs.filter(r => pm.has(r.pid)).sort((a, b) => byName(pm.get(a.pid)!, pm.get(b.pid)!) || a.id.localeCompare(b.id));
  const list = useMemo(() => sorted(state.requests.filter(r => r.date === date)), [state.requests, pm, date]);   // eslint-disable-line react-hooks/exhaustive-deps
  // αιτήσεις άδειας άλλων ημερών που ακόμα δεν απαντήθηκαν
  const other = useMemo(() => sorted(reqWaiting(state.requests).filter(r => r.date !== date)), [state.requests, pm, date]);   // eslint-disable-line react-hooks/exhaustive-deps
  const del = async (r: PersonRequest) => { if (await run({ t: 'deleteRequest', id: r.id }, false)) toast({ text: 'Διαγράφηκε η αίτηση του ' + shortName(pm.get(r.pid)!), actions: [undoMark()] }); };
  const decide = async (r: PersonRequest, ok: boolean | null) => {
    if (!(await run({ t: 'decideRequest', id: r.id, ok }, false))) return;
    const who = shortName(pm.get(r.pid)!);
    toast({ text: ok === null ? 'Αναιρέθηκε η απόφαση για την άδεια του ' + who : ok ? 'Εγκρίθηκε η άδεια του ' + who + ' και μπήκε στις Άδειες.' : 'Απορρίφθηκε η αίτηση άδειας του ' + who, actions: [undoMark()] });
  };
  const item = (r: PersonRequest, showDate: boolean) => { const p = pm.get(r.pid)!; return html`<li key=${r.id}><div className="hk-req__row">
    <span>${showDate && html`<span className="num">${dm(r.date)} </span>`}<button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button> αιτείται ${upper(reqWhat(r))}.
      ${r.decision === 'ok' && html` <${Badge} tone="ok" data-tip=${"Έγινε άδεια· στην " + HK() + " μένει μόνο η αίτηση"}>Εγκρίθηκε ${dm(r.decided!)}<//>`}${r.decision === 'no' && html` <${Badge} tone="bad">Απορρίφθηκε ${dm(r.decided!)}<//>`}${r.leave && !r.decision && html` <${Badge} tone="warn">Περιμένει απάντηση<//>`}</span>
    <span className="hk-req__acts">${r.leave && !r.decision && html`<${Button} size="sm" onClick=${() => decide(r, true)} data-tip=${"Γίνεται άδεια· στην " + HK() + " μένει μόνο η αίτηση, δεν ξαναγράφεται"}>Εγκρίθηκε<//><${Button} size="sm" variant="outline" onClick=${() => decide(r, false)}>Απορρίφθηκε<//>`}
      ${r.decision ? html`<${Button} size="sm" variant="ghost" onClick=${() => decide(r, null)} data-tip=${r.decision === 'ok' ? 'Η αίτηση ξαναπεριμένει απάντηση και η άδεια βγαίνει' : 'Η αίτηση ξαναπεριμένει απάντηση'}>Αναίρεση απόφασης<//>` : html`<${Button} size="sm" variant="ghost" onClick=${() => setEdit(r)}>Αλλαγή<//>`}<${Button} size="sm" variant="ghost" onClick=${() => del(r)}>Διαγραφή<//></span></div></li>`; };
  return html`<${Card} title=${'5. Αιτήσεις (' + (date === today ? 'σήμερα' : dm(date)) + ')'} actions=${html`<${Button} size="sm" variant="outline" onClick=${() => setEdit({ date, leave: { type: 'LEAVE', from: addDays(date, 1), to: addDays(date, 1) } })}>+ Αίτηση άδειας<//><${Button} size="sm" variant="ghost" onClick=${() => setEdit({ date })}>+ Άλλη αίτηση<//>`}>
    ${list.length ? html`<ol className="hk-req">${list.map(r => item(r, false))}</ol>`
      : html`<p className="note" style=${{ margin: 0 }}>Καμία αίτηση για ${dm(date)}. Γράφονται στην ${HK()} ως «1. ΣΤΡ (ΠΖ) … : ΑΙΤΕΙΤΑΙ …». Γράφονται μία φορά· με το «Εγκρίθηκε» η άδεια μπαίνει στις Άδειες χωρίς να ξαναγραφτεί.</p>`}
    ${other.length > 0 && html`<div className="field" style=${{ marginTop: '10px' }}><span className="field__label">Αιτήσεις άδειας άλλων ημερών που περιμένουν απάντηση</span><ul className="hk-req" style=${{ listStyle: 'none', paddingLeft: 0 }}>${other.map(r => item(r, true))}</ul></div>`}
    ${edit && html`<${RequestDialog} req=${edit} onClose=${() => setEdit(null)}/>`}
  <//>`;
}
// Νέα αίτηση ή αλλαγή: από την ΗΚΑΙ ή από την καρτέλα του ατόμου (req.pid). Άδεια: είδος και από πότε έως πότε, με αιτιολόγηση.
const HON = 'Τιμητική';
export function RequestDialog({ req, onClose }: { req: Partial<PersonRequest>; onClose: () => void }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast();
  const kinds = [...listOf(state.settings.lists, 'leaveKinds'), HON];
  const lv0 = req.leave; const next = addDays(req.date || today, 1);
  const [f, setF] = useState({ pid: req.pid ?? null as number | null, date: req.date || today, text: req.text || '', isLeave: !!lv0, kind: lv0?.type === 'HON' ? HON : lv0?.kind || kinds[0], from: lv0?.from || next, to: lv0?.to || next, fromTime: lv0?.fromTime || '', toTime: lv0?.toTime || '' });
  const [f0] = useState(() => JSON.stringify(f)); const dirty = JSON.stringify(f) !== f0;
  const p = f.pid != null ? personMap(state.people).get(f.pid) : undefined;
  const text = reqText(f.text);
  // ώρες προαιρετικές: γράφονται στην αίτηση μόνο αν μπήκαν (και διαβάζονται)
  const ft = normTime(f.fromTime), tt = normTime(f.toTime);
  const tms = { ...(ft ? { fromTime: ft } : {}), ...(tt ? { toTime: tt } : {}) };
  const leave: LeaveAsk | undefined = f.isLeave ? { type: f.kind === HON ? 'HON' : 'LEAVE', ...(f.kind === HON ? {} : { kind: f.kind }), from: f.from, to: f.to, ...tms } : undefined;
  const ok = !!p && (f.isLeave || !!text) && (!f.isLeave || (ft != null && tt != null));
  const miss = ok ? '' : !p ? 'Λείπει: Στρατιώτης' : !f.isLeave ? 'Λείπει: Τι αιτείται' : 'Μια ώρα δεν είναι σωστή (π.χ. 14:00)';
  const save = async () => {
    if (!ok) return;
    const body = { pid: p!.id, date: f.date, text, ...(leave ? { leave } : {}) };
    const cmd = req.id ? { t: 'updateRequest' as const, req: { id: req.id, ...body } } : { t: 'addRequest' as const, req: body };
    if (await run(cmd, false)) { onClose(); toast({ text: (req.id ? 'Άλλαξε η αίτηση: ' : 'Αίτηση για την ' + HK() + ' ' + dm(f.date) + ': ') + shortName(p!), actions: [undoMark()] }); }
  };
  const line = p && ok ? 'Στην ' + HK() + ': «' + upper(hkWho(p) + ': αιτείται ' + reqWhat({ id: '', pid: p.id, date: f.date, text, leave })) + '.»' : '';
  return html`<${Dialog} title=${req.id ? 'Αλλαγή αίτησης' : f.isLeave ? 'Αίτηση άδειας' : 'Νέα αίτηση'} description="Γράφεται στην ${HK()} της ημέρας, στο «5. ΑΙΤΗΣΕΙΣ»." onClose=${onClose} dirty=${dirty && 'Η αίτηση δεν αποθηκεύτηκε. Αν κλείσεις, χάνεται.'}
    footer=${html`<${Why} text=${miss}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} why=${miss} onClick=${save}>Αποθήκευση<//>`}>
    <div className="field"><span className="field__label">Τι αιτείται</span><${Segmented} value=${f.isLeave ? 'leave' : 'other'} onChange=${(v: string) => setF({ ...f, isLeave: v === 'leave' })} items=${[{ value: 'leave', label: 'Άδεια' }, { value: 'other', label: 'Κάτι άλλο' }]}/></div>
    <div className="field"><label className="field__label" htmlFor="rq-p">Ποιος</label>
      ${p ? html`<div className="field-row"><b>${fullName(p)}</b>${!req.pid && html`<${Button} size="sm" variant="ghost" onClick=${() => setF({ ...f, pid: null })}>Άλλος<//>`}</div>`
        : html`<${PersonPicker} id="rq-p" autoFocus=${true} onChange=${(pid: number) => setF({ ...f, pid })}/>`}</div>
    <div className="field"><label className="field__label" htmlFor="rq-d">Ημερομηνία ${HK()}</label><${DateField} id="rq-d" className="ui-input" value=${f.date} onChange=${(e: any) => e.target.value && setF({ ...f, date: e.target.value })}/></div>
    ${f.isLeave && html`<div className="field"><label className="field__label" htmlFor="rq-k">Είδος άδειας</label><${Select} id="rq-k" className="ui-input" value=${f.kind} onChange=${(e: any) => setF({ ...f, kind: e.target.value })}>${kinds.map(k => html`<option key=${k} value=${k}>${k}</option>`)}<//></div>
      <${DateRangeField} from=${f.from} to=${f.to} onChange=${(from: string, to: string) => setF({ ...f, from, to })}/>
      <div className="field"><div className="field-row">
        <${TimeField} id="rq-out" label="Ώρα αναχώρησης" value=${f.fromTime} onChange=${(v: string) => setF({ ...f, fromTime: v })} help=${'Προαιρετικό · ' + dow(f.from) + ' ' + dm(f.from)}/>
        <${TimeField} id="rq-in" label="Ώρα επιστροφής" value=${f.toTime} onChange=${(v: string) => setF({ ...f, toTime: v })} help=${'Προαιρετικό · ' + dow(f.to) + ' ' + dm(f.to)}/>
      </div><span className="field__help">Αν μπουν, γράφονται στην αίτηση της ${HK()} και περνούν στην άδεια με το «Εγκρίθηκε». Κενές = ολόκληρες μέρες.</span></div>`}
    <div className="field"><label className="field__label" htmlFor="rq-t">${f.isLeave ? 'Αιτιολόγηση (προαιρετικό)' : 'Αιτείται'}</label><input id="rq-t" className="ui-input" placeholder=${f.isLeave ? 'π.χ. για οικογενειακούς λόγους' : 'π.χ. μετάθεση στην 2η ΕΠΧΙΑ'} value=${f.text} data-autofocus=${p ? '' : undefined} onChange=${(e: any) => setF({ ...f, text: e.target.value })} onKeyDown=${(e: any) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}/>
      <span className="field__help">${line || (f.isLeave ? 'Γράφεται μία φορά, στις αιτήσεις. Όταν εγκριθεί, γίνεται άδεια χωρίς να ξαναγραφτεί στην ' + HK() + '.' : 'Γράψε μόνο το τι ζητά· το «αιτείται» και η τελεία μπαίνουν μόνα τους.')}</span></div>
  <//>`;
}

const SRC: Record<string, [string, string]> = { app: ['Εφαρμογή', 'outline'], excel: ['Excel', 'info'], import: ['Εισαγωγή', 'ey'], auto: ['Αυτόματα', 'ok'] };
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

export function CommandPalette({ onClose }: P) {
  const { state, today, tomorrow } = useStore(); const nav = useNav(); const usb = useUsbCopy();
  const [q, setQ] = useState(''); const [sel, setSel] = useState(0); const dq = useDeferredValue(q);
  const ACTIONS = [
    { t: 'Εξοδούχοι σήμερα', k: 'ΕΞΟΔΟΥΧΟΙ ΕΞΟΔΟΣ ΔΝ ΔΙΑΝΥΚΤΕΡΕΥΣΗ ΠΑΡΑΜΕΝΟΝΤΕΣ', fn: () => nav.go('outs', { outDate: today }) },
    { t: 'Υπηρεσίες αύριο', k: 'ΥΠΗΡΕΣΙΕΣ ΦΡΟΥΡΑ ΘΑΛΑΜΟΦΥΛΑΚΕΣ ΜΑΓΕΙΡΕΙΑ ΛΥ', fn: () => nav.go('guard', { guardDate: tomorrow }) },
    { t: HK() + ' σήμερα', k: HK() + ' ΗΜΕΡΗΣΙΑ ΑΝΑΦΟΡΑ ΚΑΤΑΣΤΑΣΗ', fn: () => nav.go('hkai', { hkaiDate: today }) },
    { t: 'Δήλωσε ιατρικό (ΕΑ, ΕΑΡΒ, ΕΥ, ΕΟ, ΝΟΣ)', k: 'ΙΑΤΡΙΚΑ ΕΑ ΕΑΡΒ ΑΡΒΥΛΩΝ ΕΥ ΕΟ ΝΟΣ', fn: () => nav.declare({ cat: 'med', from: today, to: addDays(today, 2) }) },
    { t: 'Νέα ποινή (αίτηση στην ' + HK() + ')', k: 'ΠΟΙΝΗ ΤΙΜΩΡΗΜΕΝΟΣ ΚΡΑΤΗΣΗ ΠΕΡΙΟΡΙΣΜΟΣ', fn: () => nav.declare({ cat: 'pun', from: today, to: addDays(today, 4) }) },
    { t: 'Ιατρικά', k: 'ΙΑΤΡΙΚΑ ΕΥ ΕΑ ΕΟ ΣΤΕΠ ΛΗΞΗ', fn: () => nav.go('records', { recTab: 'med' }) },
    { t: HK() + ' › Ποινές', k: 'ΠΟΙΝΕΣ ΤΙΜΩΡΗΜΕΝΟΙ ΣΤΕΡΗΣΗ ΚΡΑΤΗΣΗ', fn: () => nav.go('hkai', { hkTab: 'pun' }) },
    { t: HK() + ' › Άδειες', k: 'ΑΔΕΙΕΣ ΤΙΜΗΤΙΚΗ ΑΝΑΡΡΩΤΙΚΗ ΕΠΙΣΤΡΟΦΗ', fn: () => nav.go('hkai', { hkTab: 'leave' }) },
    { t: HK() + ' › Αιτήσεις', k: 'ΑΙΤΗΣΕΙΣ ΑΙΤΗΣΗ ΑΔΕΙΑΣ ΕΓΚΡΙΣΗ', fn: () => nav.go('hkai', { hkTab: 'req' }) },
    { t: 'Δώσε άδεια', k: 'ΑΔΕΙΑ', fn: () => nav.declare({ cat: 'abs' }) },
    { t: 'Δύναμη σήμερα', k: 'ΔΥΝΑΜΗ ΚΑΤΑΣΤΑΣΗ', fn: () => nav.go('strength', { strengthDate: today }) },
    { t: 'Εισαγωγή Δυναμολογίου', k: 'ΕΙΣΑΓΩΓΗ ΔΥΝΑΜΟΛΟΓΙΟ ΕΣΣΟ EXCEL', fn: () => nav.go('templates', { tab: 'import' }) },
    { t: 'Αρχεία Excel (από πού διαβάζει, πού γράφει)', k: 'ΑΡΧΕΙΑ EXCEL ΦΥΛΛΟ ΣΤΗΛΕΣ ΑΝΤΙΣΤΟΙΧΙΣΗ ΠΗΓΕΣ', fn: () => nav.go('templates', { tab: 'files' }) },
    { t: 'Ιστορικό ενεργειών', k: 'ΙΣΤΟΡΙΚΟ ΑΝΑΙΡΕΣΗ', fn: () => nav.go('history') },
    { t: 'Οδηγός χρήσης (πώς δουλεύει, τι επηρεάζει τι)', k: 'ΟΔΗΓΟΣ ΟΔΗΓΙΕΣ ΒΟΗΘΕΙΑ ΣΧΕΤΙΚΑ ΕΚΔΟΣΗ HELP ABOUT ΠΩΣ', fn: () => nav.go('guide') },
    { t: 'Έντυπα (δικά σου Excel)', k: 'ΕΝΤΥΠΑ ΕΝΤΥΠΟ ΠΡΟΤΥΠΑ ΠΡΟΤΥΠΟ ΚΑΤΑΣΤΑΣΗ ΟΝΟΜΑΣΤΙΚΗ ΠΑΡΟΥΣΙΟΛΟΓΙΟ ΤΥΧΑΙΑ ΑΓΓΑΡΕΙΑ EXCEL', fn: () => nav.go('reports') },
    ...(state.settings.reports || []).map(r => ({ t: 'Βγάλε: ' + r.name, k: 'ΕΝΤΥΠΟ ΕΝΤΥΠΑ ΒΓΑΛΕ ' + norm(r.name), fn: () => nav.go('reports', { repRun: r.id }) })),
    { t: 'Αντίγραφο σε USB', k: 'ΑΝΤΙΓΡΑΦΟ USB BACKUP ΑΣΦΑΛΕΙΑ', fn: () => usb() },
    { t: 'Νέα ΕΣΣΟ / Επαναφορά ΕΣΣΟ', k: 'ΝΕΑ ΕΣΣΟ ΣΕΙΡΑ ΑΡΧΕΙΟ ΕΠΑΝΑΦΟΡΑ RESTORE', fn: () => nav.go('templates', { tab: 'esso' }) },
    { t: 'Επαναφορά από αντίγραφο', k: 'ΕΠΑΝΑΦΟΡΑ ΑΝΤΙΓΡΑΦΟ BACKUP', fn: () => nav.go('templates', { tab: 'backup' }) },
    { t: 'Διάγνωση (μνήμη, ταχύτητα)', k: 'ΔΙΑΓΝΩΣΗ ΜΝΗΜΗ ΤΑΧΥΤΗΤΑ GPU', fn: () => nav.go('diag') },
    { t: 'Ρυθμίσεις', k: 'ΡΥΘΜΙΣΕΙΣ ΜΟΝΑΔΑ ΚΕΦΑΛΙΔΑ ΣΤΕΛΕΧΗ', fn: () => nav.go('templates', { tab: 'unit' }) },
    { t: 'Θάλαμοι και ουλαμοί', k: 'ΘΑΛΑΜΟΙ ΟΥΛΑΜΟΙ ΟΥΛΑΜΟΣ ΕΞΟΔΟΣ ΣΑΒΒΑΤΟ ΚΥΡΙΑΚΗ', fn: () => nav.go('templates', { tab: 'rooms' }) },
    { t: 'Τίτλος και λογότυπο', k: 'ΤΙΤΛΟΣ ΛΟΓΟΤΥΠΟ LOGO ΕΜΦΑΝΙΣΗ ΒΑΘΜΟΣ', fn: () => nav.go('templates', { tab: 'look' }) },
    { t: 'Ρυθμίσεις › Υπηρεσίες και αργίες', k: 'ΘΕΣΕΙΣ ΥΠΗΡΕΣΙΕΣ ΑΡΓΙΕΣ ΒΑΡΔΙΕΣ ΣΙ Σ.Ι. ΠΟΙΟΣ ΚΑΝΕΙ ΤΙ', fn: () => nav.go('templates', { tab: 'duty' }) },
    { t: 'Ρυθμίσεις › Λίστες', k: 'ΛΙΣΤΕΣ ΒΑΘΜΟΙ ΙΑΤΡΙΚΑ ΠΟΙΝΕΣ ΑΔΕΙΕΣ', fn: () => nav.go('templates', { tab: 'lists' }) },
    { t: 'Ρυθμίσεις › Εμφάνιση', k: 'ΕΜΦΑΝΙΣΗ ΘΕΜΑ ΣΚΟΤΕΙΝΟ ΠΥΚΝΟΤΗΤΑ', fn: () => nav.go('templates', { tab: 'look' }) },
    // όλες οι οθόνες, οι καρτέλες, τα «+ Νέο…» και οι ενότητες των Ρυθμίσεων (UX Μ8, 22/10: πριν, το «εκτ» δεν έβρισκε τίποτα)
    { t: 'Σήμερα', k: 'ΣΗΜΕΡΑ ΑΡΧΙΚΗ ΑΠΟΝΤΕΣ ΛΗΓΟΥΝ ΓΥΡΙΖΟΥΝ', fn: () => nav.go('home') },
    { t: 'Δυναμολόγιο', k: 'ΔΥΝΑΜΟΛΟΓΙΟ ΣΤΡΑΤΙΩΤΕΣ ΠΡΟΣΩΠΙΚΟ ΛΙΣΤΑ', fn: () => nav.go('people') },
    { t: 'Νέος στρατιώτης', k: 'ΝΕΟΣ ΣΤΡΑΤΙΩΤΗΣ ΠΡΟΣΘΗΚΗ ΚΑΤΑΤΑΞΗ', fn: () => nav.go('people', { quickAdd: 'one' }) },
    { t: 'Γρήγορη εισαγωγή στρατιωτών (πολλοί μαζί)', k: 'ΓΡΗΓΟΡΗ ΕΙΣΑΓΩΓΗ ΠΟΛΛΟΙ ΣΤΡΑΤΙΩΤΕΣ ΕΠΙΚΟΛΛΗΣΗ ΝΕΑ ΕΣΣΟ', fn: () => nav.go('people', { quickAdd: 'many' }) },
    { t: 'Εκτός δύναμης (Δυναμολόγιο)', k: 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ ΔΙΑΓΡΑΦΕΣ ΑΠΟΛΥΣΗ ΜΕΤΑΘΕΣΗ ΜΕΤΑΚΙΝΗΣΗ', fn: () => nav.go('people', { filter: 'inactive' }) },
    { t: 'Στελέχη', k: 'ΣΤΕΛΕΧΗ ΥΠΑΞΙΩΜΑΤΙΚΟΙ ΑΞΙΩΜΑΤΙΚΟΙ ΕΠΟΠ ΟΒΑ ΔΥΝΑΜΙΚΟ', fn: () => nav.go('cadre') },
    { t: 'Υπηρεσίες › Έλεγχος υπηρεσιών', k: 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΣΕΙΡΑ ΔΙΚΑΙΟΣΥΝΗΣ ΜΗΝΙΑΙΟ ΠΛΕΓΜΑ', fn: () => nav.go('guard', { gopen: 'check' }) },
    { t: 'Υπηρεσίες › Ποιος κάνει τι', k: 'ΠΟΙΟΣ ΚΑΝΕΙ ΤΙ ΠΙΝΑΚΑΣ ΥΠΗΡΕΣΙΕΣ ΑΝΑ ΑΤΟΜΟ', fn: () => nav.go('guard', { gopen: 'who' }) },
    { t: 'Κανόνες υπηρεσιών', k: 'ΚΑΝΟΝΕΣ ΥΠΗΡΕΣΙΩΝ ΑΝΑΠΑΥΣΗ ΟΡΙΑ ΣΕΙΡΑ ΔΙΚΑΙΟΣΥΝΗΣ ΑΥΣΤΗΡΑ ΑΟΠΛΟΙ', fn: () => nav.go('guard', { gopen: 'rules' }) },
    { t: 'Εξοδούχοι αύριο', k: 'ΕΞΟΔΟΥΧΟΙ ΑΥΡΙΟ ΕΞΟΔΟΣ', fn: () => nav.go('outs', { outDate: tomorrow }) },
    { t: 'Ιατρικά που έληξαν', k: 'ΙΑΤΡΙΚΑ ΕΛΗΞΑΝ ΛΗΞΗ', fn: () => nav.go('records', { recTab: 'expired' }) },
    { t: HK() + ' (η αναφορά)', k: HK() + ' ΗΜΕΡΗΣΙΑ ΑΝΑΦΟΡΑ ΕΚΤΥΠΩΣΗ ΜΠΡΟΣΤΙΝΟ ΠΙΣΩ', fn: () => nav.go('hkai', { hkTab: 'hkai' }) },
    { t: 'Οπλισμός', k: 'ΟΠΛΙΣΜΟΣ ΟΠΛΑ ΟΠΛΟ ΟΠΛΟΣΤΑΣΙΟ ΤΥΦΕΚΙΟ', fn: () => nav.go('weapons') },
    { t: 'Οπλισμός › Κινήσεις', k: 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ ΕΝΤΟΣ ΕΚΤΟΣ ΧΡΕΩΣΗ', fn: () => nav.go('weapons', { wtab: 'moves' }) },
    { t: 'Εκτύπωση (ΦΡΟΥΡΑ, ' + HK() + ', Εξοδούχοι, Έντυπα)', k: 'ΕΚΤΥΠΩΣΗ ΕΚΤΥΠΩΣΕ ΤΥΠΩΣΕ ΧΑΡΤΙ ΕΚΤΥΠΩΤΗΣ PDF PRINT ΣΕΛΙΔΕΣ', fn: () => nav.go('reports') },
    { t: 'Τα έντυπά μου', k: 'ΤΑ ΕΝΤΥΠΑ ΜΟΥ ΔΙΚΑ ΜΟΥ ΑΠΟΘΗΚΕΥΜΕΝΑ', fn: () => nav.go('reports', { repTab: undefined }) },
    { t: 'Ρυθμίσεις › Μονάδα και έντυπα', k: 'ΜΟΝΑΔΑ ΚΕΦΑΛΙΔΑ ΙΛΗ ΛΟΧΟΣ ΔΙΟΙΚΗΤΗΣ ΣΕΙΡΕΣ ' + HK(), fn: () => nav.go('templates', { tab: 'unit' }) },
    { t: 'Ρυθμίσεις › Υπογραφές', k: 'ΥΠΟΓΡΑΦΕΣ ΥΠΟΓΡΑΦΗ ΘΕΩΡΗΘΗΚΕ ΔΙΟΙΚΗΤΗΣ', fn: () => nav.go('templates', { tab: 'unit' }) },
    { t: 'Ρυθμίσεις › Υπηρεσίες', k: 'ΘΕΣΕΙΣ ΥΠΗΡΕΣΙΩΝ ΒΑΡΔΙΕΣ ΩΡΕΣ ΕΝΕΡΓΗ ΝΕΑ ΥΠΗΡΕΣΙΑ', fn: () => nav.go('templates', { tab: 'duty', dsub: 'blocks' }) },
    { t: 'Ρυθμίσεις › Σ.Ι.', k: 'ΣΙ Σ.Ι. ΣΥΝΤΗΡΗΣΗ ΙΚΑΝΟΤΗΤΑ Ι1 Ι2 Ι3 Ι4', fn: () => nav.go('templates', { tab: 'duty', dsub: 'si' }) },
    { t: 'Ρυθμίσεις › Καταστάσεις και υπηρεσίες', k: 'ΚΑΤΑΣΤΑΣΕΙΣ ΙΑΤΡΙΚΑ ΠΟΙΝΕΣ ΠΟΙΟΣ ΚΑΝΕΙ ΤΙ ΕΞΑΙΡΕΣΕΙΣ', fn: () => nav.go('templates', { tab: 'duty', dsub: 'stat' }) },
    { t: 'Ρυθμίσεις › Αργίες', k: 'ΑΡΓΙΕΣ ΑΡΓΙΑ ΓΙΟΡΤΕΣ ΠΑΣΧΑ', fn: () => nav.go('templates', { tab: 'duty', dsub: 'hol' }) },
    { t: 'Ρυθμίσεις › Πρότυπα εφαρμογής', k: 'ΠΡΟΤΥΠΑ ΕΦΑΡΜΟΓΗΣ TEMPLATES ΦΑΚΕΛΟΣ ' + HK() + ' ΦΡΟΥΡΑ', fn: () => nav.go('templates', { tab: 'templates' }) },
    { t: 'Ρυθμίσεις › Γράμματα Excel', k: 'ΓΡΑΜΜΑΤΑ EXCEL ΓΡΑΜΜΑΤΟΣΕΙΡΑ ΜΕΓΕΘΟΣ ARIAL ΕΝΤΟΝΑ', fn: () => nav.go('templates', { tab: 'excel' }) },
    { t: 'Ρυθμίσεις › Αντίγραφα ασφαλείας', k: 'ΑΝΤΙΓΡΑΦΑ ΑΣΦΑΛΕΙΑΣ BACKUP', fn: () => nav.go('templates', { tab: 'backup' }) },
    { t: 'Υπόμνημα κωδικών', k: 'ΥΠΟΜΝΗΜΑ ΚΩΔΙΚΟΙ ΣΥΝΤΟΜΟΓΡΑΦΙΕΣ ΤΙ ΣΗΜΑΙΝΕΙ', fn: () => nav.go('guide', { topic: 'legend' }) },
    ...GUIDE_TITLES.map(([id, t]) => { const h = t.replace(/ΗΚΑΙ/g, HK()); return { t: 'Οδηγός: ' + h, k: 'ΟΔΗΓΟΣ ' + norm(h), fn: () => nav.go('guide', { topic: id }) }; })
  ];
  const n = norm(dq.trim());
  const acts = ACTIONS.filter(a => !n || a.k.includes(n) || norm(a.t).includes(n));
  const ppl = n ? searchPeople(state.people, dq).slice(0, 6) : [];
  // με άδειο πεδίο: πρώτα οι 5 τελευταίοι που άνοιξες
  const pm = personMap(state.people);
  const rec = useMemo(() => recentPeople().map(id => pm.get(id)).filter((p): p is Person => !!p && p.active), [pm]);
  const recent = n ? [] : rec;
  const items: P[] = [...recent.map(p => ({ p })), ...acts.map(a => ({ a })), ...ppl.map(p => ({ p }))];
  useEffect(() => setSel(0), [dq]);
  const runI = (i: number) => { const x = items[i]; if (!x) return; onClose(); if (x.a) x.a.fn(); else nav.openPerson(x.p.id); };
  useEscape(onClose);
  let i = -1;
  return createPortal(html`<div className="ui-overlay" onMouseDown=${(e: any) => { if (e.target === e.currentTarget) onClose(); }}><div className="palette" role="dialog" aria-modal="true" aria-label="Αναζήτηση">
    <input className="ui-input" autoFocus=${true} placeholder="Γράψε επώνυμο ή τι θέλεις να κάνεις (π.χ. «δν», «ποινη»)" value=${q} onChange=${(e: any) => setQ(e.target.value)}
      onKeyDown=${(e: any) => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); } else if (e.key === 'Enter') { e.preventDefault(); runI(sel); } }}/>
    <ul className="picker__list" role="listbox">
      ${recent.length > 0 && html`<li className="picker__hd">Πρόσφατα</li>`}
      ${recent.map(p => { i++; const j = i; return html`<li key=${'r' + p.id} role="option" aria-selected=${sel === j} className="picker__opt" onMouseDown=${(e: any) => { e.preventDefault(); runI(j); }} onMouseEnter=${() => setSel(j)}><div><b>${fullName(p)}</b><small>του ${p.father} · ${rankTxt(p)} · ${unitOf(p, state.settings)}</small></div><${StatusBadge} statuses=${state.statuses} pid=${p.id} date=${today} lists=${state.settings.lists}/></li>`; })}
      ${acts.length > 0 && html`<li className="picker__hd">Ενέργειες</li>`}
      ${acts.map(a => { i++; const j = i; return html`<li key=${a.t} role="option" aria-selected=${sel === j} className="picker__opt" onMouseDown=${(e: any) => { e.preventDefault(); runI(j); }} onMouseEnter=${() => setSel(j)}><div><b>${a.t}</b></div></li>`; })}
      ${ppl.length > 0 && html`<li className="picker__hd">Πρόσωπα</li>`}
      ${ppl.map(p => { i++; const j = i; return html`<li key=${p.id} role="option" aria-selected=${sel === j} className="picker__opt" onMouseDown=${(e: any) => { e.preventDefault(); runI(j); }} onMouseEnter=${() => setSel(j)}><div><b>${fullName(p)}</b><small>του ${p.father} · ${rankTxt(p)} · ${unitOf(p, state.settings)}</small></div><${StatusBadge} statuses=${state.statuses} pid=${p.id} date=${today} lists=${state.settings.lists}/></li>`; })}
      ${!items.length && html`<li className="picker__hd">Δεν βρέθηκε τίποτα για «${q}».</li>`}
    </ul>
    <div className="note" style=${{ padding: '6px 4px 0' }}>↑↓ επιλογή · Enter άνοιγμα · Esc κλείσιμο · ψάχνει χωρίς τόνους και με λατινικά (π.χ. «papad»)</div>
  </div></div>`, document.body);
}

