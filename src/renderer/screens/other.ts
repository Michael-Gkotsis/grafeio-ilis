// Σήμερα, ιατρικά/ποινές, δύναμη, ΗΚΑΙ, ιστορικό, templates/εισαγωγή/ρυθμίσεις, αναζήτηση (Ctrl+K)
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { html, Alert, Badge, Button, Card, Dialog, PageHeader, Segmented, Strip, Tabs, useEscape, useMedia, useToast } from '../ui';
import { useNav, useStore, searchPeople } from '../store';
import { ActiveFilter, DateBar, DateRangeField, ExcelSheet, ExportButton, PersonPicker, StatusBadge, TemplateNote, useUsbCopy } from '../common';
import { USB_DAYS, newsSince, usbAge, usbDue } from '../../shared/reminders';
import { hkaiFront, hkaiBack, frouraEmpty } from '../sheets';
import { HK_SECTIONS, hkOn, type HkaiSettings, type HkSection, type HkVehicle, TYPES, TYPE_KEYS, RECORD_CATS, PHASE_NAME, blocksOf, effects, fullName, shortName, unitOf, type LeaveAsk, type Person, type PersonRequest, type Phase, type Settings, type Status } from '../../shared/domain';
import { AddBlockDialog, ReturnsList } from './guard';
import { HK_K, HK_A, HK_MANUAL, activePeople, hkaiCounts, hkMin, isRecordExpiredOn, personMap, statusesFrom, statusesOn, strengthOf } from '../../shared/rules';
import { addDays, daysBetween, dayName, dm, dmy, dow, greekHolidays, parseD, DOW_GEN } from '../../shared/dates';
import { norm, normGreek, upper } from '../../shared/text';
import { hkWho, overMax, punBySuggestions, punDays, punLbl, punText, skippedDays } from '../../shared/punish';
import { byName, movesOn, outReason, personLine, reqWhat } from '../../shared/hkaiText';
import { reqText } from '../../shared/commands';
import { codeErrors } from '../../shared/codes';
import type { BackupInfo, ImportPreview } from '../../shared/api';
import { recentPeople, usePrefs, type Prefs } from '../prefs';
import { FoldersCard, RosterPreview, SourcesAlert, SourcesView } from './sources';
import { ListsCard } from './lists';
import { SiCard } from './si';
import { StatCard } from './stat';
import { BrandCard, RoomsCard } from './units';
import { appTitle } from '../../shared/brand';
import { EssoCards } from './esso';
import { LeavesTab } from './leaves';
import { cadreCountRows, hkRowList, listOf, statusLbl } from '../../shared/ranks';
import { UNIT, UNIT_KINDS, hkRowLabel, unitKindOf, unitSettingsFor, unitText, type UnitKind, HK } from '../../shared/unit';
import { HkHeadCard, HkHeadFields, HkRowsButton, HkRowsCard, UnitKindField } from './hkrows';
import { dutyOfficers, orderedCadre } from '../../shared/cadre';
type P = any;

export function TodayScreen() {
  const { state, today, tomorrow, boot, audit } = useStore(); const nav = useNav(); const usb = useUsbCopy();
  const due = usbDue(boot.lastUsb, today);
  const news = newsSince(audit, boot.seenUntil, boot.sessionStart);
  const pm = personMap(state.people);
  const c = useMemo(() => strengthOf(state, today), [state, today]);
  // Απόντες σήμερα με τον λόγο και ως πότε· η λίστα τελειώνει στους 12, οι υπόλοιποι στη Δύναμη
  const away = useMemo(() => {
    const out: { p: Person; s: Status }[] = [];
    const at = hkMin(state.rules); activePeople(state).forEach(p => { const x = statusesFrom(state.statuses, p.id, today, at).find(q => TYPES[q.type].away); if (x) out.push({ p, s: x }); });
    return out.sort((a, b) => TYPE_KEYS.indexOf(a.s.type) - TYPE_KEYS.indexOf(b.s.type) || a.s.to.localeCompare(b.s.to) || shortName(a.p).localeCompare(shortName(b.p), 'el'));
  }, [state.statuses, state.people, state.rules, today]);
  const empty = frouraEmpty(state, tomorrow);
  // μία σάρωση όλων των καταστάσεων, μόνο όταν αλλάξουν (όχι σε κάθε απόδοση του «Σήμερα»)
  const { ending, endTom, expired, nRec } = useMemo(() => {
    const o = { ending: [] as Status[], endTom: [] as Status[], expired: [] as Status[], nRec: 0 };
    for (const s of state.statuses) {
      const cat = TYPES[s.type].cat; const rec = RECORD_CATS.includes(cat); const known = pm.has(s.pid);
      if (s.from <= today && s.to >= today && rec) o.nRec++;
      if (!known) continue;
      if (s.to === today && (cat === 'abs' || rec)) o.ending.push(s);
      if (s.to === tomorrow && (cat === 'abs' || rec || s.type === 'PUN')) o.endTom.push(s);
      if (isRecordExpiredOn(s, today)) o.expired.push(s);
    }
    return o;
  }, [state.statuses, state.people, today, tomorrow]);   // eslint-disable-line react-hooks/exhaustive-deps
  const endTxt = (s: Status) => {
    const t = TYPES[s.type]; if (t.cat === 'abs') return 'Αναμένεται επιστροφή' + (s.toTime ? ' στις ' + s.toTime : '');
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
  if (empty > 0) tasks.push({ key: 'empty', title: 'Υπηρεσίες αύριο, ' + dow(tomorrow) + ' ' + dm(tomorrow), sub: empty + (empty === 1 ? ' κενή θέση' : ' κενές θέσεις') + ' · πριν τις 14:00', urgent: true, btn: 'Συμπλήρωσε', fn: () => nav.go('guard', { guardDate: tomorrow }) });
  const waiting = reqWaiting(state.requests).filter(r => pm.has(r.pid));
  if (waiting.length) tasks.push({ key: 'req', title: waiting.length === 1 ? 'Αίτηση άδειας περιμένει απάντηση' : waiting.length + ' αιτήσεις άδειας περιμένουν απάντηση', sub: waiting.map(r => shortName(pm.get(r.pid)!)).join(', ') + ' · πάτα «Εγκρίθηκε» ή «Απορρίφθηκε» όταν υπογράψει ο Διοικητής', btn: 'Άνοιξε', fn: () => nav.go('hkai', { hkTab: 'req' }) });
  if (due) tasks.push({ key: 'usb', title: 'Αντίγραφο σε USB', sub: (boot.lastUsb ? 'Πέρασαν ' + usbAge(boot.lastUsb, today) + ' μέρες από το τελευταίο' : 'Δεν έχει παρθεί ποτέ') + '. Αν χαλάσει ο δίσκος του PC, χάνονται όλα (κάθε ' + USB_DAYS + ' μέρες).', btn: 'Αντίγραφο σε USB', fn: usb });
  const ends = [
    ...expired.map(s => ({ s, when: 'έληξε, βγήκε μόνο του', tip: 'Αφαιρέθηκε αυτόματα σήμερα' })),
    ...ending.map(s => ({ s, when: 'λήγει σήμερα', tip: endTxt(s) })),
    ...endTom.map(s => ({ s, when: 'λήγει αύριο', tip: '' }))
  ];
  const kpi = (l: string, n: number, fn: () => void, tone?: string, tip?: string) => html`<button type="button" className=${'kpi' + (tone ? ' kpi--' + tone : '')} data-tip=${tip} onClick=${fn}><span className="kpi__l">${l}</span><span className="kpi__n">${n}</span></button>`;
  return html`<div>
    <${PageHeader} title="Σήμερα" sub=${'Ημερήσια κατάσταση ' + DOW_GEN[parseD(today).getDay()] + ' ' + dmy(today) + '. ' + (tasks.length ? tasks.length + (tasks.length === 1 ? ' πράγμα θέλει εσένα' : ' πράγματα θέλουν εσένα') + (empty > 0 ? '. Το πρώτο πριν τις 14:00.' : '.') : 'Τίποτα δεν περιμένει από σένα αυτή τη στιγμή.')}>
      <div className="page-head__acts"><${Button} variant="outline" onClick=${() => nav.go('outs', { outDate: today })}>Εξοδούχοι σήμερα<//><${Button} variant="outline" onClick=${() => nav.go('hkai', { hkaiDate: today })} data-tip="Βγαίνει μόνη της από τις υπηρεσίες και τις καταστάσεις">${HK()} σήμερα<//><${Button} onClick=${() => nav.declare({})} data-tip="Ιατρικό, άδεια, έξοδος, ΔΝ ή ποινή, για έναν ή πολλούς">+ Δήλωσε κατάσταση<//></div><//>
    ${boot.dataFallback && html`<${Alert} tone="warn"><span><b>Τα δεδομένα είναι στο προφίλ του χρήστη</b> (${boot.dataDir}), όχι δίπλα στο GrafeioIlis.exe. Αν μεταφέρεις την εφαρμογή σε άλλο PC, πάρε μαζί και αυτόν τον φάκελο, ή κάνε «Αντίγραφο σε USB».</span><//>`}
    <${SourcesAlert}/>
    <div className="kpis">
      ${kpi('Δύναμη', c.total, () => nav.go('people', { filter: 'all' }))}
      ${kpi('Παρόντες', c.present, () => nav.go('people', { filter: 'present' }))}
      ${kpi('Απόντες', c.absent, () => nav.go('strength', { strengthDate: today }), undefined, 'Ιατρικά σε ισχύ: ' + nRec)}
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
  </div>`;
}

// Ιατρικά: δικό τους μενού. Ποινές: καρτέλα μέσα στο μενού ΗΚΑΙ (Michael, 18/10). Ίδια λίστα, άλλο φίλτρο.
export function RecordsScreen() { return html`<${RecordList} mode="med"/>`; }
const MED_TABS = ['med', 'expired'], PUN_TABS = ['pun', 'expired', 'allpun'];
function RecordList({ mode }: { mode: 'med' | 'pun' }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const pm = personMap(state.people);
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
    if (tab === 'expired') return state.statuses.filter(s => (mode === 'med' ? isMed(s) : s.type === 'PUN') && !s.pending && s.to < today && s.to >= addDays(today, -14) && ok(s)).sort((a, b) => b.to.localeCompare(a.to));
    return state.statuses.filter(s => s.to >= today && (tab === 'med' ? isMed(s) && (!medF || statusLbl(s, state.settings.lists) === medF) : s.type === 'PUN') && ok(s)).sort((a, b) => a.to.localeCompare(b.to));
  }, [state.statuses, tab, today, dpq, medF, mode]);
  // ΕΥ, ΕΑ, ΕΟ, ΣΤΕΠ… ως φίλτρα, με πόσοι έχουν τον καθένα (Michael, 17/10: τα ιατρικά εδώ, όχι στο Δυναμολόγιο)
  const medCnt = useMemo(() => { const m = new Map<string, number>(); state.statuses.forEach(s => { if (s.to >= today && isMed(s) && pm.has(s.pid)) { const l = statusLbl(s, state.settings.lists); m.set(l, (m.get(l) || 0) + 1); } }); return [...m].sort((a, b) => b[1] - a[1]); }, [state.statuses, today, state.settings.lists]);
  const nMed = state.statuses.filter(s => s.to >= today && isMed(s)).length;
  const nPun = state.statuses.filter(s => s.to >= today && s.type === 'PUN' && pm.has(s.pid)).length;
  const left = (s: Status) => {
    if (s.to < today) { const d = daysBetween(s.to, today) - 1; return d === 1 ? 'έληξε χθες' : 'έληξε πριν από ' + d + ' ημ.'; }
    if (s.open) return 'χωρίς λήξη (κενό «έως» στο Excel)';
    const n = daysBetween(today, s.to) - 1; return s.from > today ? 'ξεκινά ' + dayName(s.from, today).toLowerCase() : n === 0 ? 'λήγει σήμερα' : n === 1 ? 'λήγει αύριο' : 'λήγει σε ' + n + ' ημ.'; };
  // στέρηση εξόδου: ποιες μέρες δεν μέτρησαν (υπηρεσία, βραδινή εκπαίδευση), για να φαίνεται γιατί μετακινήθηκε η λήξη
  const skipTxt = (s: Status) => { const k = skippedDays(state, s); return k.length ? ' · ' + punDays(s) + ' ημ. ποινή, δεν μετράνε: ' + k.map(x => dm(x.date) + ' ' + (x.why === 'duty' ? 'υπηρεσία' : 'βραδινή εκπαίδευση')).join(', ') : ''; };
  const [stop, setStop] = useState<Status | null>(null);
  const [txt, setTxt] = useState<Status | null>(null);
  const act = (fn: () => Promise<unknown>, text: string) => async () => { if (await fn()) toast({ text, actions: [undoMark()] }); };
  return html`<div>
    ${mode === 'med' ? html`<${PageHeader} title="Ιατρικά" sub="Όταν λήξει ένα ιατρικό, αφαιρείται μόνο του την επόμενη μέρα και γράφεται στο Ιστορικό. Μετράνε στη Δύναμη και στην ${HK()} (ΕΥ, νοσοκομείο).">
      <${Button} onClick=${() => nav.declare({ cat: 'med', from: today, to: addDays(today, 2) })}>+ Ιατρικό<//><//>
    <div style=${{ marginBottom: '12px' }}><${Tabs} value=${tab} onChange=${(v: string) => nav.set({ recTab: v })} items=${[{ value: 'med', label: 'Σε ισχύ (' + nMed + ')' }, { value: 'expired', label: 'Έληξαν' }]}/></div>`
    : html`<${PageHeader} title="Ποινές" sub="Οι ποινές ισχύουν αμέσως και γράφονται στην ${HK()} (4. Ποινές) της μέρας που επιβλήθηκαν. Όταν λήξει μια ποινή, αφαιρείται μόνη της την επόμενη μέρα.">
      <${Button} onClick=${() => nav.declare({ cat: 'pun', from: today, to: addDays(today, 4) })}>+ Ποινή<//><//>
    <div style=${{ marginBottom: '12px' }}><${Segmented} value=${tab} onChange=${(v: string) => nav.set({ punTab: v })} items=${[{ value: 'pun', label: 'Ισχύουν (' + nPun + ')' }, { value: 'expired', label: 'Έληξαν' }, { value: 'allpun', label: 'Όλες οι ποινές' }]}/></div>`}
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση" placeholder=${mode === 'med' ? 'Όνομα, κωδικός (π.χ. ΕΥ) ή σημείωση · Ctrl+F' : 'Όνομα, είδος ποινής, ποιος τιμώρησε ή λόγος · Ctrl+F'} value=${pq} onChange=${(e: any) => setPq(e.target.value)}/>${dpq.trim() && html`<span className="toolbar__count">${list.length} ${list.length === 1 ? 'βρέθηκε' : 'βρέθηκαν'}</span>`}</div>
    ${tab === 'med' && medCnt.length > 1 && html`<div className="filters"><${Strip} role="group" aria-label="Είδος ιατρικού">${[['', 'Όλα', nMed] as [string, string, number], ...medCnt.map(([l, n]) => [l, l, n] as [string, string, number])].map(([k, l, n]) => html`<button key=${k || 'all'} type="button" className="ui-chip" aria-pressed=${medF === k} onClick=${() => nav.set({ medF: medF === k ? '' : k })}>${l}<span className="cnt">${n}</span></button>`)}<//></div>`}
    <div className="ui-card">${list.length ? html`<ul className="rec">${list.map(s => { const t = TYPES[s.type]; const p = pm.get(s.pid)!; return html`<li key=${s.id}>
      <div><button type="button" className="linkish who" onClick=${() => nav.openPerson(s.pid)}>${fullName(p)}</button> <${Badge} tone=${t.tone} data-tip=${t.long}>${statusLbl(s, state.settings.lists)}<//>
        <small>${dow(s.from)} ${dm(s.from)} – ${s.open ? '…' : dow(s.to) + ' ' + dm(s.to)} · ${tab === 'expired' ? 'αφαιρέθηκε αυτόματα ' + (s.to === y ? 'σήμερα' : dm(addDays(s.to, 1))) : left(s)}${tab !== 'expired' && effects(t) ? ' · ' + effects(t) : ''}${s.note ? ' · ' + s.note : ''}${s.type === 'PUN' && (s.by || s.reason) ? ' · ' + [s.by && 'από ' + s.by, s.reason && 'διότι ' + s.reason].filter(Boolean).join(', ') : ''}${skipTxt(s)}</small></div>
      ${s.type === 'PUN' && html`<${Button} size="sm" variant="outline" onClick=${() => setTxt(s)} data-tip="Έτοιμο κείμενο για το Word, με «Αντιγραφή»" data-tip-side="left">Κείμενο<//>`}
      ${tab === 'expired' ? html`<${Badge} tone="ok">Αυτόματα<//>` : tab === 'allpun' || s.to < today ? html`<${Badge} tone=${s.to < today ? 'outline' : 'warn'}>${s.to < today ? 'Έληξε' : 'Ισχύει'}<//>` : html`<${Button} size="sm" variant="ghost" onClick=${() => setStop(s)} data-tip=${'Μόνο αν σταμάτησε πριν από τις ' + dm(s.to) + ' (π.χ. τον έκοψε ο γιατρός). Αλλιώς λήγει μόνο του.'} data-tip-side="left">Σταμάτησε νωρίτερα…<//>`}
    </li>`; })}</ul>` : html`<div className="empty">${tab === 'expired' ? 'Τίποτα δεν έληξε τις τελευταίες 14 μέρες.' : mode === 'med' ? 'Κανένα ιατρικό σε ισχύ.' : 'Καμία ποινή σε ισχύ.'}</div>`}</div>
    ${stop && (() => { const t = TYPES[stop.type]; const p = pm.get(stop.pid)!; const what = (stop.type === 'PUN' ? 'Η ποινή' : t.label) + ' του ' + shortName(p); return html`<${Dialog} role="alertdialog" title="Σταμάτησε νωρίτερα;" description=${what + ' · ' + dm(stop.from) + '–' + dm(stop.to)} onClose=${() => setStop(null)}
      footer=${html`<${Button} variant="outline" data-autofocus="" onClick=${() => setStop(null)}>Όχι, να λήξει κανονικά<//><${Button} onClick=${async () => { const x = stop; setStop(null); await act(() => run({ t: 'endStatus', id: x.id }, false), what + ': σταμάτησε, από σήμερα δεν ισχύει')(); }}>Ναι, από σήμερα δεν ισχύει<//>`}>
      <p style=${{ margin: 0 }}>${what} θα έληγε <b>${dayName(stop.to, today).toLowerCase()} ${dm(stop.to)}</b>. Αν πατήσεις «Ναι», σταματά τώρα: από σήμερα ${t.noDuty ? 'ξαναμπαίνει σε υπηρεσίες' : t.noArmed ? 'ξαναμπαίνει και σε ένοπλες θέσεις' : t.noOut ? 'μπορεί να βγει έξοδο' : 'δεν ισχύει'}.</p><//>`; })()}
    ${txt && html`<${PunTextDialog} st=${txt} onClose=${() => setTxt(null)}/>`}
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
  return html`<${Dialog} title="Κείμενο ποινής" description=${fullName(p) + ' · ' + punLbl(st.kind) + ' ' + dm(st.from) + '–' + dm(st.to)} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Κλείσιμο<//>${dirty && html`<${Button} variant="outline" onClick=${async () => { if (await save()) toast({ text: 'Αποθηκεύτηκαν τα στοιχεία της ποινής' }); }}>Αποθήκευση<//>`}<${Button} onClick=${async () => { if (!(await save())) return; toast({ text: copyRich(t.html, t.plain) ? 'Αντιγράφηκε. Στο Word πάτα Ctrl+V.' : 'Δεν έγινε αντιγραφή. Επίλεξε το κείμενο και πάτα Ctrl+C.' }); }}>Αντιγραφή<//>`}>
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor="pt-by">Ποιος τιμώρησε</label><input id="pt-by" className="ui-input" list="pt-by-l" placeholder="σε αιτιατική, π.χ. ΛΧΙΑ ΔΟΚΙΜΙΟ" value=${f.by} onChange=${(e: any) => setF({ ...f, by: e.target.value })}/><datalist id="pt-by-l">${byList.map((x: string) => html`<option key=${x} value=${x}/>`)}</datalist></div>
      <div className="field"><label className="field__label" htmlFor="pt-on">Ημερομηνία τιμωρίας</label><input id="pt-on" type="date" className="ui-input" value=${f.on} onChange=${(e: any) => e.target.value && setF({ ...f, on: e.target.value })}/></div></div>
    <div className="field"><label className="field__label" htmlFor="pt-r">Λόγος (διότι…)</label><textarea id="pt-r" className="ui-input" rows="2" value=${f.reason} onChange=${(e: any) => setF({ ...f, reason: e.target.value })}></textarea></div>
    ${max > 0 && html`<${Alert} tone="warn"><span>${punLbl(st.kind)} πάνω από ${max} ημέρες. Έλεγξε τη διάρκεια.</span><//>`}
    <div className="puntext" aria-label="Προεπισκόπηση">${t.before}<u>${t.dur}</u>${t.after}</div>
  <//>`;
}

export function StrengthScreen() {
  const { state, today, tomorrow } = useStore(); const nav = useNav();
  const date = nav.params.strengthDate || today;
  const c = useMemo(() => strengthOf(state, date), [state, date]);
  return html`<div>
    <${PageHeader} title=${'Δύναμη ' + DOW_GEN[parseD(date).getDay()] + ' ' + dmy(date)} sub="Βγαίνει αυτόματα από τα ιατρικά, τις άδειες, τις εξόδους και τις ποινές. Απόντες: άδεια, αναρρωτική, νοσοκομείο, εξοδούχοι."><${DateBar} value=${date} onChange=${(d: string) => nav.set({ strengthDate: d })} days=${[today, tomorrow]}/><//>
    <${Card} title="Σύνοψη" actions=${html`<${Button} size="sm" variant="outline" onClick=${() => nav.go('hkai', { hkaiDate: date })}>${HK()}<//>`}>
      <div className="tiles" style=${{ marginBottom: '12px' }}><div className="tile tile--main"><span className="tile__n">${c.total}</span><span className="tile__l">Οργανική</span></div><div className="tile"><span className="tile__n">${c.present}</span><span className="tile__l">Παρόντες</span></div><div className="tile"><span className="tile__n">${c.absent}</span><span className="tile__l">Απόντες</span></div></div>
      ${TYPE_KEYS.map(k => html`<div key=${k} className="cat"><div className="cat__head"><${Badge} tone=${TYPES[k].tone}>${TYPES[k].label}<//><b>${TYPES[k].long}</b><span className="num">${c.counts[k]}</span></div>
        ${c.counts[k] > 0 && html`<div className="cat__names">${c.lists[k].map(p => html`<button key=${p.id} type="button" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button>`)}</div>`}</div>`)}
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
  const nLeave = useMemo(() => state.statuses.filter(s => TYPES[s.type].cat === 'abs' && s.to >= today && pm.has(s.pid)).length, [state.statuses, today, pm]);
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
    <${PageHeader} title="Αιτήσεις" sub="Γράφονται στην ${HK()} της μέρας (5. Αιτήσεις). Η άδεια, όταν εγκριθεί, περνά μόνη της στο 3. Άδειες και στην καρτέλα Άδειες."><${DateBar} value=${date} onChange=${(d: string) => nav.set({ hkaiDate: d })} days=${[addDays(today, -1), today, addDays(today, 1)]}/><//>
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
    <div className="tiles" style=${{ marginBottom: '12px' }}><div className="tile tile--main"><span className="tile__n">${h.total}</span><span className="tile__l">Δύναμη</span></div><div className="tile"><span className="tile__n">${h.kol}</span><span className="tile__l">Κωλυόμενοι</span></div><div className="tile"><span className="tile__n">${h.apo}</span><span className="tile__l">Απόντες</span></div><div className="tile"><span className="tile__n">${h.avail}</span><span className="tile__l">Διαθέσιμοι</span></div></div>
    <ul className="hk-src">${src.map(([k, , full]) => html`<li key=${k}><b>${full}</b>: <span className="num">${h.cols[k].length + (h.cadre[k]?.length || 0)}</span><div className="cat__names">${cadreOf(k).map(c => html`<button key=${c.id} type="button" data-tip="Στέλεχος· η κατάσταση αλλάζει στην καρτέλα Στελέχη" onClick=${() => nav.go('cadre')}>${c.rank} ${c.last}</button>`)}${h.cols[k].map(p => html`<button key=${p.id} type="button" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button>`)}</div></li>`)}</ul>
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
    <div className="toolbar" style=${{ marginTop: '10px' }}><${ExportButton} kind="hkai" date=${date} label="η ${HK()}"/></div><${TemplateNote} ids=${['hkai']}/></div>`;
  return html`<div>
    <${PageHeader} title=${HK() + ' της ' + dmy(date)} sub="Κατάσταση Ημερήσιας Αναφοράς. Βγαίνει μόνη της από τις υπηρεσίες και τις καταστάσεις· κάθε αριθμός ανοίγει τα ονόματα."><${DateBar} value=${date} onChange=${(d: string) => nav.set({ hkaiDate: d })} days=${[addDays(today, -1), today, addDays(today, 1)]}/><//>
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
  const list = state.cadreList.filter(x => x.active);
  if (list.length) {
    const by = new Map<string, number>(); list.forEach(x => by.set(hkRowLabel(x.hk), (by.get(hkRowLabel(x.hk)) || 0) + 1));
    return html`<${Card} title="Στελέχη ανά βαθμό" actions=${html`<${HkRowsButton}/><${Button} size="sm" variant="outline" onClick=${() => nav.go('cadre')}>Στελέχη<//>`}>
      <p className="note" style=${{ margin: 0 }}>${[...by].map(([r, n]) => r + ' ' + n).join(' · ')}. Βγαίνουν από την καρτέλα «Στελέχη», μαζί με τις καταστάσεις τους (κωλυόμενοι, απόντες).</p><//>`;
  }
  return html`<${Card} title="Στελέχη ανά βαθμό" actions=${html`<${HkRowsButton}/>${!open && html`<${Button} size="sm" variant="outline" onClick=${() => setOpen(true)}>Άλλαξε<//>`}`}>
    ${warn && html`<${Alert} tone="warn"><span>Δεν έχουν μπει ακόμα. Γράψε πόσοι είναι σε κάθε βαθμό και πάτα «Αποθήκευση», ή πέρασε τα στελέχη με ονόματα στο <button type="button" className="linkish" onClick=${() => nav.go('cadre')}>καρτέλα «Στελέχη»</button>.</span><//>`}
    ${open ? html`<div className="settings-grid">${ranks.map(r => html`<label key=${r} className="field"><span className="field__help">${hkRowLabel(r)}</span><input className="ui-input" type="number" min="0" value=${c[r] || ''} placeholder="0" onChange=${(e: any) => setC({ ...c, [r]: Math.max(0, +e.target.value || 0) })}/></label>`)}</div>
      <div className="toolbar" style=${{ marginTop: '8px' }}><${Button} disabled=${!dirty} onClick=${async () => { if (await run({ t: 'setSettings', settings: { cadre: c }, text: 'στελέχη ' + HK() }, false)) { toast({ text: 'Αποθηκεύτηκαν τα στελέχη. Ισχύουν για κάθε μέρα.' }); setOpen(false); } }}>Αποθήκευση<//><span className="note">Λοχίες, δεκανείς και στρατιώτες μετρώνται από το προσωπικό.</span></div>`
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
  const setCell = (r: string, k: string, v: number) => { const row = { ...(m.cells[r] || {}) }; if (v) row[k] = v; else delete row[k]; const cells = { ...m.cells, [r]: row }; if (!Object.keys(row).length) delete cells[r]; setM({ ...m, cells }); };
  const used = Object.entries(m.cells).flatMap(([r, row]) => Object.entries(row).map(([k, v]) => ({ r, k, v })));
  const lbl = (k: string) => HK_MANUAL.find(x => x[0] === k)?.[1] || k;
  const auto = dutyOfficers(state, date);   // αξιωματικός υπηρεσίας από τα Στελέχη, όταν το πεδίο μένει κενό
  return html`<${Card} title=${'Συμπληρώνεις εσύ (' + (date === today ? 'σήμερα' : dm(date)) + ')'}>
    <p className="note" style=${{ marginTop: 0 }}>Ό,τι δεν βγαίνει από τις καταστάσεις. Οι αριθμοί προστίθενται στη στήλη του βαθμού και τα σύνολα βγαίνουν από τους τύπους του εντύπου.</p>
    <div className="field"><span className="field__label">Αριθμοί ανά βαθμό</span>
      <div className="field-row"><select className="ui-input" aria-label="Βαθμός" value=${rk} onChange=${(e: any) => setRk(e.target.value)}>${hkRowList(state.settings.lists).map(r => html`<option key=${r} value=${r}>${hkRowLabel(r)}</option>`)}</select></div>
      <div className="settings-grid" style=${{ marginTop: '6px' }}>${HK_MANUAL.map(([k, l]) => html`<label key=${k} className="field"><span className="field__help">${l}</span><input className="ui-input" type="number" min="0" placeholder="0" value=${m.cells[rk]?.[k] || ''} onChange=${(e: any) => setCell(rk, k, Math.max(0, +e.target.value || 0))}/></label>`)}</div>
      ${used.length > 0 && html`<span className="field__help">Έχεις γράψει: ${used.map(u => hkRowLabel(u.r) + ' ' + lbl(u.k) + ' ' + u.v).join(' · ')}</span>`}</div>
    ${HK_TEXT_FIELDS.map(([k, l, ph]) => html`<div key=${k} className="field"><label className="field__label" htmlFor=${'hk-' + k}>${l}</label><input id=${'hk-' + k} className="ui-input" placeholder=${k === 'off' && auto ? auto : ph} list=${k === 'off' ? 'hk-off-l' : undefined} value=${m.text[k] || ''} onChange=${(e: any) => setM({ ...m, text: { ...m.text, [k]: e.target.value } })}/>${k === 'off' && html`<span className="field__help">${auto ? 'Κενό = από τα Στελέχη: ' + auto + '.' : 'Κενό = όποιος αξιωματικός έχει «Υπηρεσία» στα Στελέχη.'}</span>`}</div>`)}
    <datalist id="hk-off-l">${state.cadreList.filter(c => c.active).map(c => html`<option key=${c.id} value=${(c.rank + ' ' + c.last + ' ' + c.first).trim()}/>`)}</datalist>
    ${hkOn(state.settings, 'acc') && html`<div className="field"><span className="field__label">Ατυχήματα</span><div className="settings-grid">${HK_ACC_FIELDS.map(([k, l]) => html`<label key=${k} className="field"><span className="field__help">${l}</span><input className="ui-input" placeholder="Ø" value=${m.text[k] || ''} onChange=${(e: any) => setM({ ...m, text: { ...m.text, [k]: e.target.value } })}/></label>`)}</div><span className="field__help">Κενό = Ø, όπως στο έντυπο.</span></div>`}
    <p className="note">Οι αποφάσεις 1 (όσοι μπήκαν στη δύναμη), 2 (όσοι βγήκαν εκτός δύναμης), 3 (άδειες που ξεκινούν ή εγκρίθηκαν), 4 (ποινές της μέρας) και 5 (αιτήσεις) γράφονται μόνες τους. Οχήματα και «Προβλέπονται» στις «Ενότητες της ${HK()}» πιο κάτω.</p>
    <div className="toolbar"><${Button} disabled=${!dirty} onClick=${async () => { if (await run({ t: 'setHkaiManual', date, manual: m }, false)) toast({ text: 'Αποθηκεύτηκαν τα στοιχεία της ' + HK() + ' ' + dm(date) }); }}>Αποθήκευση<//>${dirty && html`<${Button} variant="ghost" onClick=${() => setM(cur)}>Ακύρωση<//>`}</div>
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
// «Εγκρίθηκε» ή «Απορρίφθηκε»· με την έγκριση γίνονται άδεια και πάνε στο 3. ΑΔΕΙΕΣ της μέρας της έγκρισης.
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
    const who = shortName(pm.get(r.pid)!); const on = r.date > today ? r.date : today;
    toast({ text: ok === null ? 'Αναιρέθηκε η απόφαση για την άδεια του ' + who : ok ? 'Εγκρίθηκε η άδεια του ' + who + '. Γράφεται στην ' + HK() + ' ' + dm(on) + ', 3. ΑΔΕΙΕΣ.' : 'Απορρίφθηκε η αίτηση άδειας του ' + who, actions: [undoMark()] });
  };
  const item = (r: PersonRequest, showDate: boolean) => { const p = pm.get(r.pid)!; return html`<li key=${r.id}><div className="hk-req__row">
    <span>${showDate && html`<span className="num">${dm(r.date)} </span>`}<button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button> αιτείται ${upper(reqWhat(r))}.
      ${r.decision === 'ok' && html` <${Badge} tone="ok" data-tip=${'Γράφτηκε στο 3. ΑΔΕΙΕΣ της ' + HK() + ' ' + dm(r.decided!)}>Εγκρίθηκε ${dm(r.decided!)}<//>`}${r.decision === 'no' && html` <${Badge} tone="bad">Απορρίφθηκε ${dm(r.decided!)}<//>`}${r.leave && !r.decision && html` <${Badge} tone="warn">Περιμένει απάντηση<//>`}</span>
    <span className="hk-req__acts">${r.leave && !r.decision && html`<${Button} size="sm" onClick=${() => decide(r, true)} data-tip="Γίνεται άδεια και γράφεται στο 3. ΑΔΕΙΕΣ της σημερινής ${HK()}">Εγκρίθηκε<//><${Button} size="sm" variant="outline" onClick=${() => decide(r, false)}>Απορρίφθηκε<//>`}
      ${r.decision ? html`<${Button} size="sm" variant="ghost" onClick=${() => decide(r, null)} data-tip=${r.decision === 'ok' ? 'Η αίτηση ξαναπεριμένει απάντηση και η άδεια βγαίνει' : 'Η αίτηση ξαναπεριμένει απάντηση'}>Αναίρεση απόφασης<//>` : html`<${Button} size="sm" variant="ghost" onClick=${() => setEdit(r)}>Αλλαγή<//>`}<${Button} size="sm" variant="ghost" onClick=${() => del(r)}>Διαγραφή<//></span></div></li>`; };
  return html`<${Card} title=${'5. Αιτήσεις (' + (date === today ? 'σήμερα' : dm(date)) + ')'} actions=${html`<${Button} size="sm" variant="outline" onClick=${() => setEdit({ date, leave: { type: 'LEAVE', from: addDays(date, 1), to: addDays(date, 1) } })}>+ Αίτηση άδειας<//><${Button} size="sm" variant="ghost" onClick=${() => setEdit({ date })}>+ Άλλη αίτηση<//>`}>
    ${list.length ? html`<ol className="hk-req">${list.map(r => item(r, false))}</ol>`
      : html`<p className="note" style=${{ margin: 0 }}>Καμία αίτηση για ${dm(date)}. Γράφονται στην ${HK()} ως «1. ΣΤΡ (ΠΖ) … : ΑΙΤΕΙΤΑΙ …». Η άδεια, όταν εγκριθεί, περνά μόνη της στο «3. ΑΔΕΙΕΣ».</p>`}
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
  const [f, setF] = useState({ pid: req.pid ?? null as number | null, date: req.date || today, text: req.text || '', isLeave: !!lv0, kind: lv0?.type === 'HON' ? HON : lv0?.kind || kinds[0], from: lv0?.from || next, to: lv0?.to || next });
  const p = f.pid != null ? personMap(state.people).get(f.pid) : undefined;
  const text = reqText(f.text);
  const leave: LeaveAsk | undefined = f.isLeave ? { type: f.kind === HON ? 'HON' : 'LEAVE', ...(f.kind === HON ? {} : { kind: f.kind }), from: f.from, to: f.to } : undefined;
  const ok = !!p && (f.isLeave || !!text);
  const save = async () => {
    if (!ok) return;
    const body = { pid: p!.id, date: f.date, text, ...(leave ? { leave } : {}) };
    const cmd = req.id ? { t: 'updateRequest' as const, req: { id: req.id, ...body } } : { t: 'addRequest' as const, req: body };
    if (await run(cmd, false)) { onClose(); toast({ text: (req.id ? 'Άλλαξε η αίτηση: ' : 'Αίτηση για την ' + HK() + ' ' + dm(f.date) + ': ') + shortName(p!), actions: [undoMark()] }); }
  };
  const line = p && ok ? 'Στην ' + HK() + ': «' + upper(hkWho(p) + ': αιτείται ' + reqWhat({ id: '', pid: p.id, date: f.date, text, leave })) + '.»' : '';
  return html`<${Dialog} title=${req.id ? 'Αλλαγή αίτησης' : f.isLeave ? 'Αίτηση άδειας' : 'Νέα αίτηση'} description="Γράφεται στην ${HK()} της ημέρας, στο «5. ΑΙΤΗΣΕΙΣ»." onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!ok} onClick=${save}>Αποθήκευση<//>`}>
    <div className="field"><span className="field__label">Τι αιτείται</span><${Segmented} value=${f.isLeave ? 'leave' : 'other'} onChange=${(v: string) => setF({ ...f, isLeave: v === 'leave' })} items=${[{ value: 'leave', label: 'Άδεια' }, { value: 'other', label: 'Κάτι άλλο' }]}/></div>
    <div className="field"><label className="field__label" htmlFor="rq-p">Ποιος</label>
      ${p ? html`<div className="field-row"><b>${fullName(p)}</b>${!req.pid && html`<${Button} size="sm" variant="ghost" onClick=${() => setF({ ...f, pid: null })}>Άλλος<//>`}</div>`
        : html`<${PersonPicker} id="rq-p" autoFocus=${true} onChange=${(pid: number) => setF({ ...f, pid })}/>`}</div>
    <div className="field"><label className="field__label" htmlFor="rq-d">Ημερομηνία ${HK()}</label><input id="rq-d" type="date" className="ui-input" value=${f.date} onChange=${(e: any) => e.target.value && setF({ ...f, date: e.target.value })}/></div>
    ${f.isLeave && html`<div className="field"><label className="field__label" htmlFor="rq-k">Είδος άδειας</label><select id="rq-k" className="ui-input" value=${f.kind} onChange=${(e: any) => setF({ ...f, kind: e.target.value })}>${kinds.map(k => html`<option key=${k} value=${k}>${k}</option>`)}</select></div>
      <${DateRangeField} from=${f.from} to=${f.to} onChange=${(from: string, to: string) => setF({ ...f, from, to })}/>`}
    <div className="field"><label className="field__label" htmlFor="rq-t">${f.isLeave ? 'Αιτιολόγηση (προαιρετικό)' : 'Αιτείται'}</label><input id="rq-t" className="ui-input" placeholder=${f.isLeave ? 'π.χ. για οικογενειακούς λόγους' : 'π.χ. μετάθεση στην 2η ΕΠΧΙΑ'} value=${f.text} data-autofocus=${p ? '' : undefined} onChange=${(e: any) => setF({ ...f, text: e.target.value })} onKeyDown=${(e: any) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}/>
      <span className="field__help">${line || (f.isLeave ? 'Όταν εγκριθεί, γίνεται άδεια και γράφεται στο «3. ΑΔΕΙΕΣ».' : 'Γράψε μόνο το τι ζητά· το «αιτείται» και η τελεία μπαίνουν μόνα τους.')}</span></div>
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

function ImportCard() {
  const nav = useNav();
  const [pv, setPv] = useState<ImportPreview | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const pick = async () => { setErr(''); setBusy(true); try { const r = await window.api.pickRoster(); if (!r) return; if (!r.ok) setErr(r.error); else setPv(r); } finally { setBusy(false); } };
  return html`<${Card} title="Εισαγωγή από το Δυναμολόγιο">
    <p style=${{ marginTop: 0 }}>Διαβάζει το φύλλο <b>ΣΥΝΟΛΙΚΟ</b> (βαθμός, Ο/Σ, ονοματεπώνυμο, πατρώνυμο, ΑΣΜ, τηλέφωνο, θάλαμος, Σ.Ι., ρόλος), τα <b>ΠΟΣΤΑ</b> και το <b>ΕΚΤΟΣ ΔΥΝΑΜΗΣ</b>. Οι στήλες βρίσκονται από τις επικεφαλίδες· αν κάτι δεν βρεθεί σωστά, το δείχνεις στα <${Button} variant="link" onClick=${() => nav.set({ tab: 'files' })}>Αρχεία Excel<//>.</p>
    <p className="note">Όσοι υπάρχουν ήδη ενημερώνονται (ταίριασμα με ΑΣΜ, αλλιώς ονοματεπώνυμο και πατρώνυμο). Οι υπηρεσίες, τα ιατρικά και οι ποινές τους μένουν. Μετά την εισαγωγή, όταν διορθώνεις στοιχεία ατόμου στην εφαρμογή (π.χ. Σ.Ι., τηλέφωνο), η διόρθωση γράφεται και στο κελί του στο Δυναμολόγιο.</p>
    ${!pv && html`<${Button} disabled=${busy} onClick=${pick}>${busy ? 'Ανάγνωση…' : 'Διάλεξε αρχείο Δυναμολογίου…'}<//>`}
    ${pv && html`<${RosterPreview} pv=${pv} onDone=${() => { setPv(null); nav.go('people'); }} onCancel=${() => setPv(null)}/>`}
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
}

// Ρυθμίσεις του PC (όχι της βάσης): ισχύουν αμέσως, χωρίς επανεκκίνηση
function AppearanceCard() {
  const { prefs, set } = usePrefs();
  const row = <K extends keyof Prefs>(k: K, label: string, help: string, items: { value: Prefs[K]; label: string }[]) => html`<div className="pref" key=${k}>
    <div><b>${label}</b><small>${help}</small></div><${Segmented} small=${true} value=${prefs[k]} onChange=${(v: Prefs[K]) => set(k, v)} items=${items}/></div>`;
  return html`<${Card} title="Εμφάνιση (αυτό το PC)">
    ${row('theme', 'Θέμα', 'Στα Windows 7 το «Όπως τα Windows» είναι φωτεινό.', [{ value: 'light', label: 'Φωτεινό' }, { value: 'dark', label: 'Σκοτεινό' }, { value: 'auto', label: 'Όπως τα Windows' }])}
    ${row('density', 'Πυκνότητα', 'Η συμπαγής χωρά περισσότερες γραμμές σε οθόνη 1024×768.', [{ value: 'normal', label: 'Κανονική' }, { value: 'compact', label: 'Συμπαγής' }])}
    ${row('nav', 'Μενού', 'Αυτόματο: στενό μενού σε οθόνες κάτω από 1500px. Αλλάζει και με Ctrl+B.', [{ value: 'full', label: 'Πλήρες' }, { value: 'rail', label: 'Στενό' }, { value: 'auto', label: 'Αυτόματο' }])}
    ${row('xlZoom', 'Προεπισκόπηση Excel', 'Το «Χωρά» μικραίνει το έντυπο για να φαίνεται όλο το πλάτος.', [{ value: 'fit', label: 'Χωρά' }, { value: '100', label: '100%' }])}
  <//>`;
}

function SettingsCard() {
  const { state, run, boot } = useStore(); const toast = useToast();
  const [s, setS] = useState(() => ({ unitKind: unitKindOf(state.settings), unit: [...state.settings.unit] as [string, string, string], unitName: state.settings.unitName, place: state.settings.place, cadre: { ...state.settings.cadre }, head: [state.settings.hkai?.head?.[0] || '', state.settings.hkai?.head?.[1] || ''] }));
  // άλλος τύπος μονάδας: η κεφαλίδα και ο τίτλος αλλάζουν μαζί («4η ΙΛΗ» → «4ος ΛΟΧΟΣ»), για να τα δεις πριν την αποθήκευση
  const setKind = (k: UnitKind) => setS({ ...s, unitKind: k, ...unitSettingsFor(s, k), head: s.head.map(x => unitText(x, k)) });
  const save = async () => {
    const head = s.head.map(x => x.trim()); const hkai = { ...(state.settings.hkai || {}) }; if (head.some(Boolean)) hkai.head = head; else delete hkai.head;
    const ok = await run({ t: 'setSettings', settings: { unitKind: s.unitKind, unit: s.unit, unitName: s.unitName, place: s.place, cadre: s.cadre, hkai }, text: 'μονάδα (' + UNIT_KINDS.find(k => k.id === s.unitKind)!.label + '), στελέχη ' + HK() }, false);
    if (ok) toast({ text: 'Αποθηκεύτηκαν οι ρυθμίσεις' });
  };
  return html`<${Card} title="Μονάδα και έντυπα">
    <${UnitKindField} value=${s.unitKind} onChange=${setKind}/>
    <div className="field"><span className="field__label">Κεφαλίδα εντύπων (3 γραμμές)</span><div className="field-row">${[0, 1, 2].map(i => html`<input key=${i} className="ui-input" style=${{ flex: 1, minWidth: '160px' }} value=${s.unit[i]} onChange=${(e: any) => { const u = [...s.unit] as [string, string, string]; u[i] = e.target.value; setS({ ...s, unit: u }); }}/>`)}</div></div>
    <${HkHeadFields} value=${s.head} onChange=${(head: string[]) => setS({ ...s, head })} kind=${s.unitKind}/>
    <div className="field-row"><div className="field"><label className="field__label" htmlFor="st-un">Μονάδα στον τίτλο της ${HK()}</label><input id="st-un" className="ui-input" value=${s.unitName} onChange=${(e: any) => setS({ ...s, unitName: e.target.value })}/></div>
      <div className="field"><label className="field__label" htmlFor="st-pl">Τόπος (υπογραφές)</label><input id="st-pl" className="ui-input" value=${s.place} onChange=${(e: any) => setS({ ...s, place: e.target.value })}/></div></div>
    <div className="field"><span className="field__label" style=${{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>Στελέχη ανά βαθμό (${HK()}, στήλη «Τοποθετημένοι») <${HkRowsButton}/></span><div className="settings-grid">${cadreCountRows(state.settings.lists).map(r => html`<label key=${r} className="field"><span className="field__help">${hkRowLabel(r)}</span><input className="ui-input" type="number" min="0" value=${s.cadre[r] || 0} onChange=${(e: any) => setS({ ...s, cadre: { ...s.cadre, [r]: Math.max(0, +e.target.value || 0) } })}/></label>`)}</div>
      <span className="field__help">Οι στρατιώτες, δεκανείς και λοχίες μετρώνται από το προσωπικό της εφαρμογής.</span></div>
    <p className="note" style=${{ margin: 0 }}>Οι θάλαμοι εξόδου του Σαββατοκύριακου είναι στους <b>Θαλάμους και ουλαμούς</b>.</p>
    <div><${Button} onClick=${save}>Αποθήκευση ρυθμίσεων<//></div>
    <hr style=${{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }}/>
    <dl className="kv"><dt>Αρχεία</dt><dd>Στο ${state.settings.outputDir || boot.outputDir}, εκτός αν διάλεξες άλλο στους <b>Φακέλους αρχείων</b> παρακάτω.</dd>
      <dt>Δεδομένα</dt><dd>${boot.dataDir} <${Button} variant="link" onClick=${() => window.api.openFolder('data')}>Άνοιξε<//></dd>
      <dt>Αντίγραφα</dt><dd>Κάθε μέρα αυτόματα και πριν από κάθε εισαγωγή (όλα των 14 τελευταίων ημερών, 1 ανά εβδομάδα για 8 εβδομάδες, 1 ανά μήνα). <${Button} variant="link" onClick=${async () => { const r = await window.api.backup(); toast({ text: r.ok ? 'Κρατήθηκε αντίγραφο της βάσης' : 'Δεν κρατήθηκε αντίγραφο: ' + r.error, actions: [{ label: 'Φάκελος', fn: () => window.api.openFolder('backups') }] }); }}>Αντίγραφο τώρα<//></dd>
      <dt>Έκδοση</dt><dd>${boot.version}</dd></dl>
  <//>`;
}

// Υπηρεσίες ανά έντυπο (ΣΒΕΝ/ΣΠΕΝ): ένοπλες ή άοπλες (Κ-Υ1), νέες υπηρεσίες, αφαίρεση όσων δεν χρειάζονται
function BlocksCard() {
  const { state, run } = useStore();
  const [phase, setPhase] = useState<Phase>(state.settings.phase || 'sven'); const [add, setAdd] = useState(false); const [ed, setEd] = useState<string | null>(null);
  const list = blocksOf(state.settings, phase) || [];
  const bad = useMemo(() => codeErrors(state.settings), [state.settings]);
  return html`<${Card} title="Υπηρεσίες" actions=${html`<${Segmented} small=${true} value=${phase} onChange=${setPhase} items=${[{ value: 'sven', label: 'ΣΒΕΝ' }, { value: 'spen', label: 'ΣΠΕΝ' }]}/>`}>
    ${bad.length > 0 && html`<${Alert} tone="warn"><span><b>Κωδικοί που θέλουν διόρθωση</b> (Επεξεργασία στην υπηρεσία τους): ${bad.join(' · ')}</span><//>`}
    <p className="note" style=${{ marginTop: 0 }}>Τώρα ισχύει η <b>ΦΡΟΥΡΑ ${PHASE_NAME[state.settings.phase || 'sven']}</b> (αλλάζει από τις Υπηρεσίες). Σε ένοπλη θέση δεν μπαίνει όποιος έχει ΕΑ, ΕΥ, ΕΟ, ΝΟΣ ή ΣΤΕΠ.</p>
    ${list.map(b => html`<div key=${b.id} className=${'rule' + (b.hidden ? ' is-off' : '')}><input type="checkbox" className="ui-check" aria-label=${'Ένοπλη: ' + b.name} disabled=${b.hidden || b.kind === 'ly'} checked=${b.armed} onChange=${(e: any) => run({ t: 'setBlock', phase, id: b.id, patch: { armed: e.target.checked } })}/><span style=${{ flex: 1 }}><b>${b.name}</b><small>${b.posts.filter(x => !x.hidden).length} ${b.posts.filter(x => !x.hidden).length === 1 ? 'θέση' : 'θέσεις'} · ${b.hidden ? 'αφαιρέθηκε' : b.armed ? 'ένοπλη' : 'άοπλη'}${b.custom ? ' · δική σου' : ''} · κωδικοί ${b.posts.filter(x => !x.hidden).map(x => x.code || '?').join(', ')}</small></span>
      ${b.kind !== 'ly' && !b.hidden && html`<${Button} size="sm" variant="ghost" aria-label=${'Πιο πάνω: ' + b.name} data-tip="Πιο πάνω (μπαίνει νωρίτερα στην αυτόματη συμπλήρωση)" onClick=${() => run({ t: 'editBlock', phase, id: b.id, name: b.name, n: 0, hrs: {}, move: -1 })}>↑<//><${Button} size="sm" variant="ghost" onClick=${() => setEd(b.id)}>Επεξεργασία<//>`}
      ${b.kind !== 'ly' && html`<${Button} size="sm" variant="ghost" onClick=${() => run({ t: 'setBlock', phase, id: b.id, patch: { hidden: !b.hidden } })} data-tip=${b.hidden ? 'Να ξαναφαίνεται στις θέσεις και στο έντυπο' : 'Να μη φαίνεται πια. Το ιστορικό της μένει στον έλεγχο υπηρεσιών.'}>${b.hidden ? 'Επαναφορά' : 'Αφαίρεση'}<//>`}</div>`)}
    <div style=${{ marginTop: '8px' }}><${Button} variant="outline" size="sm" disabled=${phase !== (state.settings.phase || 'sven')} data-tip=${phase !== (state.settings.phase || 'sven') ? 'Πρόσθεσε στο έντυπο που ισχύει τώρα' : undefined} onClick=${() => setAdd(true)}>+ Νέα υπηρεσία<//></div>
    ${add && html`<${AddBlockDialog} onClose=${() => setAdd(false)}/>`}
    ${ed && html`<${EditBlockDialog} phase=${phase} b=${list.find(x => x.id === ed)} onClose=${() => setEd(null)}/>`}
  <//>`;
}
function EditBlockDialog({ phase, b, onClose }: P) {
  const { run, state } = useStore(); const toast = useToast();
  const [name, setName] = useState(b.name); const [n, setN] = useState(b.posts.filter((x: P) => !x.hidden).length);
  const [hrs, setHrs] = useState<Record<string, string>>(() => Object.fromEntries(b.posts.filter((x: P) => x.rot == null).map((x: P) => [x.k, x.hrs || ''])));
  const [codes, setCodes] = useState<Record<string, string>>(() => Object.fromEntries(b.posts.map((x: P) => [x.k, x.code || ''])));
  const shown = b.posts.filter((x: P) => !x.hidden && x.rot == null);
  const coded = b.posts.filter((x: P) => !x.hidden);
  // λάθη στους κωδικούς αυτής της υπηρεσίας όπως θα ήταν μετά την αποθήκευση (ίδιος κωδικός αλλού, σκέτο γράμμα…):
  // εμποδίζουν την αποθήκευση. Λάθη σε άλλες υπηρεσίες μόνο φαίνονται.
  const [errs, others] = useMemo(() => {
    const key = phase === 'spen' ? 'blocksSpen' : 'blocks';
    const list = blocksOf(state.settings, phase).map((x: P) => (x.id === b.id ? { ...x, posts: x.posts.map((p: P) => (codes[p.k] != null && codes[p.k].trim() ? { ...p, code: codes[p.k].trim() } : p)) } : x));
    const st = { ...state.settings, [key]: list }; const mine = codeErrors(st, { phase, id: b.id });
    return [mine, codeErrors(st).filter(t => !mine.includes(t))];
  }, [codes, state.settings, phase, b.id]);
  const save = async () => { if (await run({ t: 'editBlock', phase, id: b.id, name, n, hrs, codes }, false)) { onClose(); toast({ text: 'Αποθηκεύτηκε: ' + (b.custom ? name : b.name) }); } };
  return html`<${Dialog} title=${'Επεξεργασία: ' + b.name} description=${b.custom ? 'Δική σου υπηρεσία: αλλάζουν όνομα, πλήθος και ώρες.' : 'Υπηρεσία του εντύπου: οι θέσεις είναι σταθερές· αλλάζουν οι ώρες όσων θέσεων δεν έχουν βάρδιες.'} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${errs.length > 0} onClick=${save}>Αποθήκευση<//>`}>
    ${b.custom && html`<div className="field-row"><div className="field"><label className="field__label" htmlFor="eb-n">Όνομα</label><input id="eb-n" className="ui-input" value=${name} onChange=${(e: any) => setName(e.target.value)}/></div>
      <div className="field"><label className="field__label" htmlFor="eb-c">Πόσα άτομα</label><input id="eb-c" type="number" min="1" max="10" className="ui-input" value=${n} onChange=${(e: any) => setN(Math.max(1, Math.min(10, +e.target.value || 1)))}/><span className="field__help">Όσες θέσεις φύγουν κρατούν το ιστορικό τους.</span></div></div>`}
    <div className="field"><span className="field__label">Κωδικός στον έλεγχο υπηρεσιών</span><div className="settings-grid">${coded.map((x: P) => html`<label key=${x.k} className="field"><span className="field__help">${x.label}</span><input className="ui-input" maxLength="8" value=${codes[x.k] ?? ''} placeholder="αυτόματα" onChange=${(e: any) => setCodes({ ...codes, [x.k]: e.target.value })}/></label>`)}</div>
      <span className="field__help">Αυτό γράφεται στο κελί της μέρας (π.χ. Θ1α) και έτσι διαβάζεται πίσω. Το σκέτο γράμμα (Θ, Μ, Σ) σημαίνει υπηρεσία χωρίς θέση.${b.custom ? ' Νέες θέσεις παίρνουν μόνες τους κωδικό.' : ''}</span>
      ${errs.map((t: string) => html`<${Alert} key=${t} tone="bad"><span>${t}</span><//>`)}
      ${others.length > 0 && html`<${Alert} tone="warn"><span>Σε άλλες υπηρεσίες (δεν εμποδίζει την αποθήκευση): ${others.join(' · ')}</span><//>`}</div>
    ${shown.length ? shown.map((x: P) => html`<div key=${x.k} className="field"><label className="field__label" htmlFor=${'eb-h-' + x.k}>Ώρες: ${x.label}</label><input id=${'eb-h-' + x.k} className="ui-input" placeholder="π.χ. 07:30-08:00 (κενό = όλη μέρα)" value=${hrs[x.k] || ''} onChange=${(e: any) => setHrs({ ...hrs, [x.k]: e.target.value })}/></div>`) : html`<p className="note">Οι ώρες αυτής της υπηρεσίας είναι οι βάρδιες του εντύπου.</p>`}
  <//>`;
}
// Αργίες (10 §4β): ΣΚ μετρούν πάντα· οι επίσημες βγαίνουν μόνες τους κάθε χρονιά (και από το Πάσχα)· εδώ αφαιρείς όποια
// δεν ισχύει για τη μονάδα και προσθέτεις δικές σου
function HolidaysCard() {
  const { state, run, today } = useStore();
  const [d, setD] = useState(''); const [n, setN] = useState('');
  const st = state.settings; const off = st.holidaysOff || []; const y = +today.slice(0, 4);
  const gen = [y, y + 1].flatMap(yy => Object.entries(greekHolidays(yy)));
  const list = [...gen.filter(([k]) => !off.includes(k) && !st.holidays[k]).map(([k, v]) => ({ k, v, gen: true })), ...Object.entries(st.holidays).map(([k, v]) => ({ k, v, gen: false }))].sort((a, b) => a.k.localeCompare(b.k));
  const removed = gen.filter(([k]) => off.includes(k));
  const save = (settings: Partial<Settings>, text: string) => run({ t: 'setSettings', settings, text });
  const drop = (x: { k: string; v: string; gen: boolean }) => {
    if (x.gen) return save({ holidaysOff: [...off, x.k] }, 'αφαιρέθηκε η αργία ' + x.v + ' ' + dmy(x.k));
    const h = { ...st.holidays }; delete h[x.k]; return save({ holidays: h }, 'αφαιρέθηκε η αργία ' + x.v + ' ' + dmy(x.k));
  };
  return html`<${Card} title="Αργίες">
    <p className="note" style=${{ marginTop: 0 }}>Σάββατο και Κυριακή μετρούν πάντα ως αργία. Οι επίσημες αργίες (και οι κινητές από το Πάσχα) μπαίνουν μόνες τους κάθε χρονιά· αφαίρεσε όποια δεν ισχύει για τη μονάδα και πρόσθεσε δικές σου. Μετρούν στον έλεγχο υπηρεσιών και στον κανόνα «όχι αργία δύο φορές στη σειρά».</p>
    <ul className="hist">${list.map(x => html`<li key=${x.k} className=${x.k < today ? 'muted' : ''}><span className="nw">${dow(x.k)} ${dmy(x.k)}</span> <b>${x.v}</b> ${x.gen ? html`<${Badge}>επίσημη<//>` : html`<${Badge} tone="info">δική σου<//>`} <${Button} size="sm" variant="ghost" aria-label=${'Αφαίρεση ' + x.v} onClick=${() => drop(x)}>✕<//></li>`)}</ul>
    ${removed.length > 0 && html`<details className="note"><summary>Επίσημες που αφαίρεσες (${removed.length})</summary><ul className="hist">${removed.map(([k, v]) => html`<li key=${k}><span className="nw">${dow(k)} ${dmy(k)}</span> ${v} <${Button} size="sm" variant="ghost" onClick=${() => save({ holidaysOff: off.filter(x => x !== k) }, 'ξανά αργία ' + v + ' ' + dmy(k))}>Επαναφορά<//></li>`)}</ul></details>`}
    <div className="field-row" style=${{ alignItems: 'flex-end' }}><div className="field"><label className="field__label" htmlFor="hol-d">Ημερομηνία</label><input id="hol-d" type="date" className="ui-input" value=${d} onChange=${(e: any) => setD(e.target.value)}/></div>
      <div className="field"><label className="field__label" htmlFor="hol-n">Όνομα</label><input id="hol-n" className="ui-input" placeholder="π.χ. Τοπική εορτή" value=${n} onChange=${(e: any) => setN(e.target.value)}/></div>
      <div className="field" style=${{ flex: 0 }}><${Button} disabled=${!d || !n.trim()} onClick=${async () => { if (await save({ holidays: { ...st.holidays, [d]: n.trim() }, holidaysOff: off.filter(x => x !== d) }, 'νέα αργία ' + n.trim() + ' ' + dmy(d))) { setD(''); setN(''); } }}>Πρόσθεσε<//></div></div>
  <//>`;
}
// Επαναφορά από αντίγραφο (έρευνα §4.2): πριν την επαναφορά κρατιέται αντίγραφο της τωρινής βάσης
function BackupsCard() {
  const toast = useToast(); const usb = useUsbCopy(); const { boot, today } = useStore();
  const [list, setList] = useState<BackupInfo[] | null>(null); const [pick, setPick] = useState<BackupInfo | null>(null);
  const load = () => window.api.listBackups().then(setList);
  useEffect(() => { load(); }, []);
  const imp = async () => { const r = await window.api.importBackup(); if (!r) return; if (!r.ok) { toast({ text: r.error }); return; } await load(); toast({ text: 'Το αντίγραφο μπήκε στη λίστα. Πάτα «Επαναφορά» δίπλα του.' }); };
  return html`<${Card} title="Αντίγραφα ασφαλείας">
    <p style=${{ marginTop: 0 }}>Αυτόματα: ένα κάθε μέρα και πριν από κάθε εισαγωγή, στον φάκελο data\\backups. Επειδή είναι στον ίδιο δίσκο, πάρε και <b>αντίγραφο σε USB</b> κάθε ${USB_DAYS} μέρες.
      Τελευταίο σε USB: <b className=${usbDue(boot.lastUsb, today) ? 'txt-bad' : ''}>${boot.lastUsb ? dow(boot.lastUsb) + ' ' + dmy(boot.lastUsb) : 'ποτέ'}</b>.</p>
    <div className="toolbar"><${Button} onClick=${async () => { if (await usb()) load(); }}>Αντίγραφο σε USB…<//><${Button} variant="outline" onClick=${imp} data-tip="Για καινούργιο PC ή αν χάλασε η βάση: διάλεξε ένα ilh_….db από το USB και μετά «Επαναφορά»">Φέρε αντίγραφο από USB…<//><${Button} variant="ghost" onClick=${() => window.api.openFolder('backups')}>Άνοιξε τον φάκελο<//></div>
    ${!list ? 'Φόρτωση…' : !list.length ? html`<p className="note">Δεν υπάρχει ακόμα αντίγραφο. Το πρώτο κρατιέται αυτόματα σήμερα.</p>` : html`<ul className="hist">${list.slice(0, 15).map(b => html`<li key=${b.name}><span className="nw">${dow(b.day)} ${dmy(b.day)}</span> ${b.label} <span className="muted">${Math.round(b.size / 1024)} KB</span> <${Button} size="sm" variant="outline" onClick=${() => setPick(b)}>Επαναφορά<//></li>`)}</ul>`}
    ${pick && html`<${Dialog} role="alertdialog" title="Επαναφορά από αντίγραφο" description=${dmy(pick.day) + ' · ' + pick.label} onClose=${() => setPick(null)}
      footer=${html`<${Button} variant="outline" data-autofocus="" onClick=${() => setPick(null)}>Άκυρο<//><${Button} variant="destructive" onClick=${async () => { const r = await window.api.restoreBackup(pick.name); setPick(null); if (!r.ok) toast({ text: r.error }); }}>Επαναφορά και επανεκκίνηση<//>`}>
      <p style=${{ margin: 0 }}>Τα δεδομένα θα γυρίσουν όπως ήταν στο αντίγραφο. Ό,τι έγινε μετά χάνεται, αλλά η τωρινή βάση κρατιέται πρώτα ως αντίγραφο «πριν-επαναφορά», οπότε μπορείς να γυρίσεις πίσω.</p><//>`}
  <//>`;
}

// Ρυθμίσεις: υπο-μενού αριστερά, ένα κομμάτι τη φορά (Michael, 13/10: «Ρυθμίσεις σαν οθόνη»). Τα παλιά tab (settings) ανοίγουν το «Μονάδα».
const SET_SECTIONS: [string, string][] = [['unit', 'Μονάδα και έντυπα'], ['rooms', 'Θάλαμοι και ουλαμοί'], ['duty', 'Υπηρεσίες και αργίες'], ['lists', 'Λίστες'], ['import', 'Εισαγωγή Δυναμολογίου'], ['files', 'Αρχεία Excel'], ['templates', 'Templates'], ['look', 'Εμφάνιση'], ['esso', 'ΕΣΣΟ'], ['backup', 'Αντίγραφα ασφαλείας']];
export function TemplatesScreen() {
  const { boot } = useStore(); const nav = useNav();
  const want = nav.params.tab === 'settings' ? 'unit' : nav.params.tab;
  const tab = SET_SECTIONS.some(([k]) => k === want) ? want : 'unit';
  const templates = html`<div>
      <div className="ui-card"><ul className="tpl">${boot.templates.map(t => html`<li key=${t.file}><div><b>${t.name}</b> <${Badge} tone="ok">Excel<//>${t.custom && html` <${Badge} tone="info">δικό σου<//>`}<small>${t.file}</small></div>
        ${t.ok ? html`<${Badge} tone="ok">✓ Έτοιμο<//>` : html`<${Badge} tone="bad">Λείπει<//>`}</li>`)}</ul></div>
      <p className="note" style=${{ marginTop: '10px' }}>Για να αλλάξεις ένα έντυπο (π.χ. νέα κεφαλίδα), άνοιξε τον φάκελο templates, βάλε εκεί το δικό σου αρχείο με το ίδιο όνομα και κράτα τα κελιά στις ίδιες θέσεις. Η εφαρμογή γράφει μόνο τιμές και δεν αλλάζει τύπους, στυλ ή διάταξη σελίδας.</p>
      <${Button} variant="outline" onClick=${() => window.api.openFolder('templates')}>Άνοιξε τον φάκελο templates<//>
    </div>`;
  const body = tab === 'unit' ? html`<div className="stack"><${SettingsCard}/><${HkRowsCard}/></div>` : tab === 'rooms' ? html`<${RoomsCard}/>` : tab === 'duty' ? html`<div className="stack"><${BlocksCard}/><${SiCard}/><${StatCard}/><${HolidaysCard}/></div>`
    : tab === 'lists' ? html`<${ListsCard}/>` : tab === 'import' ? html`<${ImportCard}/>` : tab === 'files' ? html`<div className="stack"><${SourcesView}/><${FoldersCard}/></div>`
    : tab === 'look' ? html`<div className="stack"><${BrandCard}/><${AppearanceCard}/></div>` : tab === 'backup' ? html`<${BackupsCard}/>` : tab === 'esso' ? html`<${EssoCards}/>` : templates;
  return html`<div>
    <${PageHeader} title="Ρυθμίσεις" sub="Η μονάδα, οι υπηρεσίες, οι λίστες, τα αρχεία Excel και τα έντυπα που συμπληρώνει η εφαρμογή."/>
    <div className="setgrid">
      <nav className="setnav" aria-label="Ρυθμίσεις">${SET_SECTIONS.map(([k, l]) => html`<button key=${k} type="button" aria-current=${tab === k ? 'page' : undefined} onClick=${() => nav.set({ tab: k })}>${l}</button>`)}</nav>
      <div className="setbody">${body}</div>
    </div>
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
    { t: 'Αντίγραφο σε USB', k: 'ΑΝΤΙΓΡΑΦΟ USB BACKUP ΑΣΦΑΛΕΙΑ', fn: () => usb() },
    { t: 'Νέα ΕΣΣΟ / Επαναφορά ΕΣΣΟ', k: 'ΝΕΑ ΕΣΣΟ ΣΕΙΡΑ ΑΡΧΕΙΟ ΕΠΑΝΑΦΟΡΑ RESTORE', fn: () => nav.go('templates', { tab: 'esso' }) },
    { t: 'Επαναφορά από αντίγραφο', k: 'ΕΠΑΝΑΦΟΡΑ ΑΝΤΙΓΡΑΦΟ BACKUP', fn: () => nav.go('templates', { tab: 'backup' }) },
    { t: 'Διάγνωση (μνήμη, ταχύτητα)', k: 'ΔΙΑΓΝΩΣΗ ΜΝΗΜΗ ΤΑΧΥΤΗΤΑ GPU', fn: () => nav.go('diag') },
    { t: 'Ρυθμίσεις', k: 'ΡΥΘΜΙΣΕΙΣ ΜΟΝΑΔΑ ΚΕΦΑΛΙΔΑ ΣΤΕΛΕΧΗ', fn: () => nav.go('templates', { tab: 'unit' }) },
    { t: 'Θάλαμοι και ουλαμοί', k: 'ΘΑΛΑΜΟΙ ΟΥΛΑΜΟΙ ΟΥΛΑΜΟΣ ΕΞΟΔΟΣ ΣΑΒΒΑΤΟ ΚΥΡΙΑΚΗ', fn: () => nav.go('templates', { tab: 'rooms' }) },
    { t: 'Τίτλος και λογότυπο', k: 'ΤΙΤΛΟΣ ΛΟΓΟΤΥΠΟ LOGO ΕΜΦΑΝΙΣΗ ΒΑΘΜΟΣ', fn: () => nav.go('templates', { tab: 'look' }) },
    { t: 'Ρυθμίσεις › Υπηρεσίες και αργίες', k: 'ΘΕΣΕΙΣ ΥΠΗΡΕΣΙΕΣ ΑΡΓΙΕΣ ΒΑΡΔΙΕΣ ΣΙ Σ.Ι. ΠΟΙΟΣ ΚΑΝΕΙ ΤΙ', fn: () => nav.go('templates', { tab: 'duty' }) },
    { t: 'Ρυθμίσεις › Λίστες', k: 'ΛΙΣΤΕΣ ΒΑΘΜΟΙ ΙΑΤΡΙΚΑ ΠΟΙΝΕΣ ΑΔΕΙΕΣ', fn: () => nav.go('templates', { tab: 'lists' }) },
    { t: 'Ρυθμίσεις › Εμφάνιση', k: 'ΕΜΦΑΝΙΣΗ ΘΕΜΑ ΣΚΟΤΕΙΝΟ ΠΥΚΝΟΤΗΤΑ', fn: () => nav.go('templates', { tab: 'look' }) }
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
      ${recent.map(p => { i++; const j = i; return html`<li key=${'r' + p.id} role="option" aria-selected=${sel === j} className="picker__opt" onMouseDown=${(e: any) => { e.preventDefault(); runI(j); }} onMouseEnter=${() => setSel(j)}><div><b>${fullName(p)}</b><small>του ${p.father} · ${p.rank} · ${unitOf(p, state.settings)}</small></div><${StatusBadge} statuses=${state.statuses} pid=${p.id} date=${today} lists=${state.settings.lists}/></li>`; })}
      ${acts.length > 0 && html`<li className="picker__hd">Ενέργειες</li>`}
      ${acts.map(a => { i++; const j = i; return html`<li key=${a.t} role="option" aria-selected=${sel === j} className="picker__opt" onMouseDown=${(e: any) => { e.preventDefault(); runI(j); }} onMouseEnter=${() => setSel(j)}><div><b>${a.t}</b></div></li>`; })}
      ${ppl.length > 0 && html`<li className="picker__hd">Πρόσωπα</li>`}
      ${ppl.map(p => { i++; const j = i; return html`<li key=${p.id} role="option" aria-selected=${sel === j} className="picker__opt" onMouseDown=${(e: any) => { e.preventDefault(); runI(j); }} onMouseEnter=${() => setSel(j)}><div><b>${fullName(p)}</b><small>του ${p.father} · ${p.rank} · ${unitOf(p, state.settings)}</small></div><${StatusBadge} statuses=${state.statuses} pid=${p.id} date=${today} lists=${state.settings.lists}/></li>`; })}
      ${!items.length && html`<li className="picker__hd">Δεν βρέθηκε τίποτα για «${q}».</li>`}
    </ul>
    <div className="note" style=${{ padding: '6px 4px 0' }}>↑↓ επιλογή · Enter άνοιγμα · Esc κλείσιμο · ψάχνει χωρίς τόνους και με λατινικά (π.χ. «papad»)</div>
  </div></div>`, document.body);
}

