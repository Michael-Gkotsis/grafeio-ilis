// Σήμερα, ιατρικά/ποινές, δύναμη, ΗΚΑΙ, ιστορικό, templates/εισαγωγή/ρυθμίσεις, αναζήτηση (Ctrl+K)
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { html, Alert, Badge, Button, Card, Dialog, PageHeader, Segmented, Tabs, useEscape, useMedia, useToast } from '../ui';
import { useNav, useStore, searchPeople } from '../store';
import { ActiveFilter, DateBar, ExcelSheet, ExportButton, PersonPicker, StatusBadge, TemplateNote, useUsbCopy } from '../common';
import { USB_DAYS, newsSince, usbAge, usbDue } from '../../shared/reminders';
import { hkaiFront, hkaiBack, frouraEmpty } from '../sheets';
import { TYPES, TYPE_KEYS, RECORD_CATS, PHASE_NAME, blocksOf, effects, fullName, shortName, unitOf, type Person, type PersonRequest, type Phase, type Status } from '../../shared/domain';
import { AddBlockDialog } from './guard';
import { HK_K, HK_A, HK_MANUAL, HK_OFFICERS, HK_NCO, activePeople, hkaiCounts, isRecordExpiredOn, personMap, statusesOn, strengthOf } from '../../shared/rules';
import { addDays, daysBetween, dayName, dm, dmy, dow, parseD, DOW_GEN } from '../../shared/dates';
import { norm, normGreek } from '../../shared/text';
import { overMax, punBySuggestions, punDays, punLbl, punText, skippedDays } from '../../shared/punish';
import { byName } from '../../shared/hkaiText';
import { reqText } from '../../shared/commands';
import { codeErrors } from '../../shared/codes';
import type { BackupInfo, ImportPreview } from '../../shared/api';
import { recentPeople, usePrefs, type Prefs } from '../prefs';
import { FoldersCard, RosterPreview, SourcesAlert, SourcesView } from './sources';
import { ListsCard } from './lists';
import { SiCard } from './si';
import { statusLbl } from '../../shared/ranks';
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
    activePeople(state).forEach(p => { const x = statusesOn(state.statuses, p.id, today).find(q => TYPES[q.type].away); if (x) out.push({ p, s: x }); });
    return out.sort((a, b) => TYPE_KEYS.indexOf(a.s.type) - TYPE_KEYS.indexOf(b.s.type) || a.s.to.localeCompare(b.s.to) || shortName(a.p).localeCompare(shortName(b.p), 'el'));
  }, [state.statuses, state.people, today]);
  const empty = frouraEmpty(state, tomorrow);
  const ending = state.statuses.filter(s => s.to === today && !s.pending && (TYPES[s.type].cat === 'abs' || RECORD_CATS.includes(TYPES[s.type].cat)) && pm.has(s.pid));
  const endTom = state.statuses.filter(s => s.to === tomorrow && !s.pending && (TYPES[s.type].cat === 'abs' || RECORD_CATS.includes(TYPES[s.type].cat) || s.type === 'PUN') && pm.has(s.pid));
  const expired = state.statuses.filter(s => isRecordExpiredOn(s, today) && !s.pending && pm.has(s.pid));
  const pending = state.statuses.filter(s => s.pending && pm.has(s.pid));
  const nRec = state.statuses.filter(s => s.from <= today && s.to >= today && RECORD_CATS.includes(TYPES[s.type].cat)).length;
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
  if (!c.total) return html`<div className="onboard"><${Card} title="Καλώς ήρθες στο Γραφείο Λοχία">
    <p style=${{ marginTop: 0 }}>Για να ξεκινήσεις χρειάζεται το προσωπικό της Ίλης. Πάρ' το από το Δυναμολόγιο (το αρχείο .xlsm με το φύλλο «ΣΥΝΟΛΙΚΟ»).</p>
    <ol><li>Πάτα <b>Εισαγωγή Δυναμολογίου</b> και διάλεξε το αρχείο.</li><li>Δες τι βρέθηκε και πάτα <b>Εισαγωγή</b>.</li><li>Στις <b>Ρυθμίσεις</b> βάλε τα στελέχη ανά βαθμό για την ΗΚΑΙ.</li></ol>
    <${Button} onClick=${() => nav.go('templates', { tab: 'import' })}>Εισαγωγή Δυναμολογίου<//>
  <//></div>`;
  // Τι πρέπει να γίνει σήμερα (με αριθμό) και τι απλώς λήγει
  const tasks: { key: string; title: string; sub: string; urgent?: boolean; btn: string; fn: () => void }[] = [];
  if (empty > 0) tasks.push({ key: 'empty', title: 'Υπηρεσίες αύριο, ' + dow(tomorrow) + ' ' + dm(tomorrow), sub: empty + (empty === 1 ? ' κενή θέση' : ' κενές θέσεις') + ' · πριν τις 14:00', urgent: true, btn: 'Συμπλήρωσε', fn: () => nav.go('guard', { guardDate: tomorrow }) });
  if (pending.length) tasks.push({ key: 'pun', title: pending.length === 1 ? 'Ποινή που αιτείται' : pending.length + ' ποινές αιτούνται', sub: pending.map(s => shortName(pm.get(s.pid)!)).join(', ') + ' · πάτα «Εγκρίθηκε» όταν υπογράψει ο Διοικητής', btn: 'Άνοιξε', fn: () => nav.go('records', { recTab: 'pun' }) });
  if (due) tasks.push({ key: 'usb', title: 'Αντίγραφο σε USB', sub: (boot.lastUsb ? 'Πέρασαν ' + usbAge(boot.lastUsb, today) + ' μέρες από το τελευταίο' : 'Δεν έχει παρθεί ποτέ') + '. Αν χαλάσει ο δίσκος του PC, χάνονται όλα (κάθε ' + USB_DAYS + ' μέρες).', btn: 'Αντίγραφο σε USB', fn: usb });
  const ends = [
    ...expired.map(s => ({ s, when: 'έληξε, βγήκε μόνο του', tip: 'Αφαιρέθηκε αυτόματα σήμερα' })),
    ...ending.map(s => ({ s, when: 'λήγει σήμερα', tip: endTxt(s) })),
    ...endTom.map(s => ({ s, when: 'λήγει αύριο', tip: '' }))
  ];
  const kpi = (l: string, n: number, fn: () => void, tone?: string, tip?: string) => html`<button type="button" className=${'kpi' + (tone ? ' kpi--' + tone : '')} data-tip=${tip} onClick=${fn}><span className="kpi__l">${l}</span><span className="kpi__n">${n}</span></button>`;
  return html`<div>
    <${PageHeader} title="Σήμερα" sub=${'Ημερήσια κατάσταση ' + DOW_GEN[parseD(today).getDay()] + ' ' + dmy(today) + '. ' + (tasks.length ? tasks.length + (tasks.length === 1 ? ' πράγμα θέλει εσένα' : ' πράγματα θέλουν εσένα') + (empty > 0 ? '. Το πρώτο πριν τις 14:00.' : '.') : 'Τίποτα δεν περιμένει από σένα αυτή τη στιγμή.')}>
      <div className="page-head__acts"><${Button} variant="outline" onClick=${() => nav.go('outs', { outDate: today })}>Εξοδούχοι σήμερα<//><${Button} variant="outline" onClick=${() => nav.go('hkai', { hkaiDate: today })} data-tip=${'Βγαίνει μόνη της · ' + (pending.length ? pending.length + ' ποινές αιτούνται' : 'καμία ποινή προς αίτηση')}>ΗΚΑΙ σήμερα<//><${Button} onClick=${() => nav.declare({})} data-tip="Ιατρικό, άδεια, έξοδος, ΔΝ ή ποινή, για έναν ή πολλούς">+ Δήλωσε κατάσταση<//></div><//>
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

export function RecordsScreen() {
  const { state, run, today, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const pm = personMap(state.people);
  const tab = nav.params.recTab || 'med';
  const [pq, setPq] = useState(''); const dpq = useDeferredValue(pq);
  const y = addDays(today, -1);
  const isMed = (s: Status) => ['med', 'other'].includes(TYPES[s.type].cat);
  const list = useMemo(() => {
    // αναζήτηση σε όλες τις καρτέλες: όνομα, κωδικός, είδος ποινής, σημείωση, ποιος τιμώρησε, λόγος
    const qq = normGreek(dpq.trim());
    const ok = (s: Status) => pm.has(s.pid) && (!qq || normGreek(fullName(pm.get(s.pid)!) + ' ' + TYPES[s.type].label + ' ' + TYPES[s.type].long + ' ' + (s.kind || '') + ' ' + (s.note || '') + ' ' + (s.by || '') + ' ' + (s.reason || '')).includes(qq));
    if (tab === 'allpun') return state.statuses.filter(s => s.type === 'PUN' && ok(s)).sort((a, b) => b.from.localeCompare(a.from));
    if (tab === 'expired') return state.statuses.filter(s => RECORD_CATS.includes(TYPES[s.type].cat) && !s.pending && s.to < today && s.to >= addDays(today, -14) && ok(s)).sort((a, b) => b.to.localeCompare(a.to));
    return state.statuses.filter(s => s.to >= today && (tab === 'med' ? isMed(s) : s.type === 'PUN') && ok(s)).sort((a, b) => Number(!!b.pending) - Number(!!a.pending) || a.to.localeCompare(b.to));
  }, [state.statuses, tab, today, dpq]);
  const nMed = state.statuses.filter(s => s.to >= today && isMed(s)).length;
  const nPun = state.statuses.filter(s => s.to >= today && s.type === 'PUN').length;
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
    <${PageHeader} title="Ιατρικά και ποινές" sub="Όταν λήξει ένα ιατρικό ή μια ποινή, αφαιρείται μόνο του την επόμενη μέρα και γράφεται στο Ιστορικό. Οι ποινές αιτούνται στην ΗΚΑΙ και ισχύουν όταν εγκριθούν.">
      <${Button} variant="outline" onClick=${() => nav.declare({ type: 'EA', from: today, to: addDays(today, 2) })}>+ Ιατρικό<//><${Button} variant="outline" onClick=${() => nav.declare({ type: 'PUN', from: today, to: addDays(today, 4) })}>+ Ποινή<//><//>
    <div style=${{ marginBottom: '12px' }}><${Tabs} value=${tab} onChange=${(v: string) => nav.set({ recTab: v })} items=${[{ value: 'med', label: 'Ιατρικά (' + nMed + ')' }, { value: 'pun', label: 'Ποινές (' + nPun + ')' }, { value: 'expired', label: 'Έληξαν' }, { value: 'allpun', label: 'Όλες οι ποινές' }]}/></div>
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση" placeholder=${tab === 'med' || tab === 'expired' ? 'Όνομα, κωδικός (π.χ. ΕΥ) ή σημείωση · Ctrl+F' : 'Όνομα, είδος ποινής, ποιος τιμώρησε ή λόγος · Ctrl+F'} value=${pq} onChange=${(e: any) => setPq(e.target.value)}/>${dpq.trim() && html`<span className="toolbar__count">${list.length} ${list.length === 1 ? 'βρέθηκε' : 'βρέθηκαν'}</span>`}</div>
    <div className="ui-card">${list.length ? html`<ul className="rec">${list.map(s => { const t = TYPES[s.type]; const p = pm.get(s.pid)!; return html`<li key=${s.id}>
      <div><button type="button" className="linkish who" onClick=${() => nav.openPerson(s.pid)}>${fullName(p)}</button> <${Badge} tone=${t.tone} data-tip=${t.long}>${statusLbl(s, state.settings.lists)}<//>
        <small>${dow(s.from)} ${dm(s.from)} – ${s.open ? '…' : dow(s.to) + ' ' + dm(s.to)} · ${tab === 'expired' ? 'αφαιρέθηκε αυτόματα ' + (s.to === y ? 'σήμερα' : dm(addDays(s.to, 1))) : left(s)}${tab !== 'expired' && effects(t) ? ' · ' + effects(t) : ''}${s.note ? ' · ' + s.note : ''}${s.type === 'PUN' && (s.by || s.reason) ? ' · ' + [s.by && 'από ' + s.by, s.reason && 'διότι ' + s.reason].filter(Boolean).join(', ') : ''}${skipTxt(s)}</small></div>
      ${s.type === 'PUN' && html`<${Button} size="sm" variant="outline" onClick=${() => setTxt(s)} data-tip="Έτοιμο κείμενο για το Word, με «Αντιγραφή»" data-tip-side="left">Κείμενο<//>`}
      ${s.pending ? html`<${Badge} tone="warn" data-tip="Γράφεται στην ΗΚΑΙ (Αποφάσεις Διοικητή, 4. Ποινές). Ισχύει μόλις εγκριθεί" data-tip-side="left">Αιτείται στην ΗΚΑΙ<//><${Button} size="sm" onClick=${act(() => run({ t: 'approvePun', id: s.id }, false), 'Εγκρίθηκε η ποινή του ' + shortName(p) + '. Ισχύει από ' + dayName(s.from, today).toLowerCase() + ' (δεν βγαίνει έξοδο).')}>Εγκρίθηκε<//><${Button} size="sm" variant="ghost" onClick=${act(() => run({ t: 'deleteStatus', id: s.id }, false), 'Διαγράφηκε η αίτηση ποινής του ' + shortName(p))}>Δεν εγκρίθηκε<//>` :
        tab === 'expired' ? html`<${Badge} tone="ok">Αυτόματα<//>` : tab === 'allpun' || s.to < today ? html`<${Badge} tone=${s.to < today ? 'outline' : 'warn'}>${s.to < today ? 'Έληξε' : 'Ισχύει'}<//>` : html`<${Button} size="sm" variant="ghost" onClick=${() => setStop(s)} data-tip=${'Μόνο αν σταμάτησε πριν από τις ' + dm(s.to) + ' (π.χ. τον έκοψε ο γιατρός). Αλλιώς λήγει μόνο του.'} data-tip-side="left">Σταμάτησε νωρίτερα…<//>`}
    </li>`; })}</ul>` : html`<div className="empty">${tab === 'expired' ? 'Τίποτα δεν έληξε τις τελευταίες 14 μέρες.' : 'Καμία ενεργή καταχώρηση.'}</div>`}</div>
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
      <div className="field"><label className="field__label" htmlFor="pt-by">Ποιος τιμώρησε</label><input id="pt-by" className="ui-input" list="pt-by-l" value=${f.by} onChange=${(e: any) => setF({ ...f, by: e.target.value })}/><datalist id="pt-by-l">${byList.map((x: string) => html`<option key=${x} value=${x}/>`)}</datalist></div>
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
    <${Card} title="Σύνοψη" actions=${html`<${Button} size="sm" variant="outline" onClick=${() => nav.go('hkai', { hkaiDate: date })}>ΗΚΑΙ<//>`}>
      <div className="tiles" style=${{ marginBottom: '12px' }}><div className="tile tile--main"><span className="tile__n">${c.total}</span><span className="tile__l">Οργανική</span></div><div className="tile"><span className="tile__n">${c.present}</span><span className="tile__l">Παρόντες</span></div><div className="tile"><span className="tile__n">${c.absent}</span><span className="tile__l">Απόντες</span></div></div>
      ${TYPE_KEYS.map(k => html`<div key=${k} className="cat"><div className="cat__head"><${Badge} tone=${TYPES[k].tone}>${TYPES[k].label}<//><b>${TYPES[k].long}</b><span className="num">${c.counts[k]}</span></div>
        ${c.counts[k] > 0 && html`<div className="cat__names">${c.lists[k].map(p => html`<button key=${p.id} type="button" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button>`)}</div>`}</div>`)}
    <//>
  </div>`;
}

export function HkaiScreen() {
  const { state, today } = useStore(); const nav = useNav(); const mobile = useMedia('(max-width: 767px)');
  const date = nav.params.hkaiDate || today;
  const [side, setSide] = useState(mobile ? 'sum' : 'front');
  const h = useMemo(() => hkaiCounts(state, date), [state, date]);
  const front = useMemo(() => hkaiFront(state, date, h), [state, date, h]);
  const back = useMemo(() => hkaiBack(state, date), [state, date]);
  const src = [...HK_K, ...HK_A].filter(([k]) => h.cols[k].length);
  const fn = 'ΗΚΑΙ ' + dm(date).replace('/', '.') + '.' + date.slice(2, 4) + '.xlsx';
  const cadre = state.cadreList.filter(c => c.active).length || Object.values(state.settings.cadre).reduce((a, b) => a + (b || 0), 0);
  const sum = html`<div className="stack"><${Card} title="Από πού βγαίνει κάθε αριθμός">
    <div className="tiles" style=${{ marginBottom: '12px' }}><div className="tile tile--main"><span className="tile__n">${h.total}</span><span className="tile__l">Δύναμη</span></div><div className="tile"><span className="tile__n">${h.kol}</span><span className="tile__l">Κωλυόμενοι</span></div><div className="tile"><span className="tile__n">${h.apo}</span><span className="tile__l">Απόντες</span></div><div className="tile"><span className="tile__n">${h.avail}</span><span className="tile__l">Διαθέσιμοι</span></div></div>
    <ul className="hk-src">${src.map(([k, , full]) => html`<li key=${k}><b>${full}</b>: <span className="num">${h.cols[k].length}</span><div className="cat__names">${h.cols[k].map(p => html`<button key=${p.id} type="button" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button>`)}</div></li>`)}</ul>
    <p className="note" style=${{ margin: '8px 0 0' }}>Υπηρεσία από την κατάσταση υπηρεσιών, ΕΥ και ποινές από τα ιατρικά και τις ποινές, απόντες από άδειες, αναρρωτικές και νοσοκομείο. Κάθε άτομο μετριέται μία φορά. Διαθέσιμοι = Δύναμη − Απόντες (ο τύπος του εντύπου). Οι εξοδούχοι δεν μετρούν.</p>
  <//>
  <${CadreCard} warn=${!cadre}/>
  <${RequestsCard} date=${date}/>
  <${HkaiManualCard} date=${date}/></div>`;
  const sheets = html`<div>
    ${!mobile && html`<div style=${{ marginBottom: '8px' }}><${Tabs} value=${side === 'sum' ? 'front' : side} onChange=${setSide} items=${[{ value: 'front', label: 'Μπροστά' }, { value: 'back', label: 'Πίσω' }]}/></div>`}
    ${side === 'back' ? html`<${ExcelSheet} model=${back} fileName=${fn} sheetName="πισω" meta="A4 οριζόντιο"/>` : html`<${ExcelSheet} model=${front} fileName=${fn} sheetName="μπροστινο" meta="A4 οριζόντιο · 1 σελίδα" footer="Γράφονται μόνο τα κελιά εισόδου· τα αθροίσματα μένουν τύποι του εντύπου."/>`}
    <div className="toolbar" style=${{ marginTop: '10px' }}><${ExportButton} kind="hkai" date=${date} label="η ΗΚΑΙ"/></div><${TemplateNote} ids=${['hkai']}/></div>`;
  return html`<div>
    <${PageHeader} title=${'ΗΚΑΙ της ' + dmy(date)} sub="Κατάσταση Ημερήσιας Αναφοράς. Βγαίνει μόνη της από τις υπηρεσίες και τις καταστάσεις· κάθε αριθμός ανοίγει τα ονόματα."><${DateBar} value=${date} onChange=${(d: string) => nav.set({ hkaiDate: d })} days=${[addDays(today, -1), today, addDays(today, 1)]}/><//>
    ${mobile ? html`<div style=${{ marginBottom: '12px' }}><${Tabs} value=${side} onChange=${setSide} items=${[{ value: 'sum', label: 'Σύνοψη' }, { value: 'front', label: 'Μπροστά' }, { value: 'back', label: 'Πίσω' }]}/></div>${side === 'sum' ? sum : sheets}` : html`<div className="strength">${sum}${sheets}</div>`}
  </div>`;
}

// Στελέχη ανά βαθμό, μέσα στην ΗΚΑΙ (γραφέας, 10/10: «δεν έχει κάπου να τους προσθέσω»)
function CadreCard({ warn }: { warn: boolean }) {
  const { state, run } = useStore(); const toast = useToast(); const nav = useNav();
  const [c, setC] = useState(() => ({ ...state.settings.cadre }));
  const [open, setOpen] = useState(warn);
  const ranks = [...HK_OFFICERS, ...HK_NCO.slice(0, 2)];
  const dirty = ranks.some(r => (c[r] || 0) !== (state.settings.cadre[r] || 0));
  const list = state.cadreList.filter(x => x.active);
  if (list.length) {
    const by = new Map<string, number>(); list.forEach(x => by.set(x.hk, (by.get(x.hk) || 0) + 1));
    return html`<${Card} title="Στελέχη ανά βαθμό" actions=${html`<${Button} size="sm" variant="outline" onClick=${() => nav.go('people', { peopleTab: 'cadre' })}>Στελέχη<//>`}>
      <p className="note" style=${{ margin: 0 }}>${[...by].map(([r, n]) => r + ' ' + n).join(' · ')}. Βγαίνουν από τη λίστα στελεχών, μαζί με τις απουσίες τους.</p><//>`;
  }
  return html`<${Card} title="Στελέχη ανά βαθμό" actions=${!open && html`<${Button} size="sm" variant="outline" onClick=${() => setOpen(true)}>Άλλαξε<//>`}>
    ${warn && html`<${Alert} tone="warn"><span>Δεν έχουν μπει ακόμα. Γράψε πόσοι είναι σε κάθε βαθμό και πάτα «Αποθήκευση», ή πέρασε τα στελέχη με ονόματα στο <button type="button" className="linkish" onClick=${() => nav.go('people', { peopleTab: 'cadre' })}>Προσωπικό › Στελέχη</button>.</span><//>`}
    ${open ? html`<div className="settings-grid">${ranks.map(r => html`<label key=${r} className="field"><span className="field__help">${r}</span><input className="ui-input" type="number" min="0" value=${c[r] || ''} placeholder="0" onChange=${(e: any) => setC({ ...c, [r]: Math.max(0, +e.target.value || 0) })}/></label>`)}</div>
      <div className="toolbar" style=${{ marginTop: '8px' }}><${Button} disabled=${!dirty} onClick=${async () => { if (await run({ t: 'setSettings', settings: { cadre: c }, text: 'στελέχη ΗΚΑΙ' }, false)) { toast({ text: 'Αποθηκεύτηκαν τα στελέχη. Ισχύουν για κάθε μέρα.' }); setOpen(false); } }}>Αποθήκευση<//><span className="note">Λοχίες, δεκανείς και στρατιώτες μετρώνται από το προσωπικό.</span></div>`
    : html`<p className="note" style=${{ margin: 0 }}>${ranks.filter(r => state.settings.cadre[r]).map(r => r + ' ' + state.settings.cadre[r]).join(' · ') || 'Κανένα'}. Ισχύουν για κάθε μέρα.</p>`}
  <//>`;
}
// Ό,τι στην ΗΚΑΙ δεν το ξέρει η εφαρμογή: αριθμοί ανά βαθμό και κείμενα της πίσω σελίδας, για τη συγκεκριμένη μέρα
const HK_TEXT_FIELDS: [string, string, string][] = [['egr', '1. Εγγραφές', ''], ['dia', '2. Διαγραφές', ''], ['ait', '5. Αιτήσεις (ελεύθερο κείμενο, μετά τις αριθμημένες)', ''], ['loi', '6. Λοιπά', ''], ['off', 'Αξιωματικός υπηρεσίας', 'π.χ. ΑΝΘΛΓΟΣ …']];
function HkaiManualCard({ date }: { date: string }) {
  const { state, run, today } = useStore(); const toast = useToast();
  const cur = state.hkaiManual[date] || { cells: {}, text: {} };
  const [m, setM] = useState(cur); const [rk, setRk] = useState(HK_NCO[HK_NCO.length - 1]);
  useEffect(() => setM(state.hkaiManual[date] || { cells: {}, text: {} }), [date, state.hkaiManual]);
  const dirty = JSON.stringify(m) !== JSON.stringify(cur);
  const setCell = (r: string, k: string, v: number) => { const row = { ...(m.cells[r] || {}) }; if (v) row[k] = v; else delete row[k]; const cells = { ...m.cells, [r]: row }; if (!Object.keys(row).length) delete cells[r]; setM({ ...m, cells }); };
  const used = Object.entries(m.cells).flatMap(([r, row]) => Object.entries(row).map(([k, v]) => ({ r, k, v })));
  const lbl = (k: string) => HK_MANUAL.find(x => x[0] === k)?.[1] || k;
  return html`<${Card} title=${'Συμπληρώνεις εσύ (' + (date === today ? 'σήμερα' : dm(date)) + ')'}>
    <p className="note" style=${{ marginTop: 0 }}>Ό,τι δεν βγαίνει από τις καταστάσεις. Οι αριθμοί προστίθενται στη στήλη του βαθμού και τα σύνολα βγαίνουν από τους τύπους του εντύπου.</p>
    <div className="field"><span className="field__label">Αριθμοί ανά βαθμό</span>
      <div className="field-row"><select className="ui-input" aria-label="Βαθμός" value=${rk} onChange=${(e: any) => setRk(e.target.value)}>${[...HK_OFFICERS, ...HK_NCO].map(r => html`<option key=${r}>${r}</option>`)}</select></div>
      <div className="settings-grid" style=${{ marginTop: '6px' }}>${HK_MANUAL.map(([k, l]) => html`<label key=${k} className="field"><span className="field__help">${l}</span><input className="ui-input" type="number" min="0" placeholder="0" value=${m.cells[rk]?.[k] || ''} onChange=${(e: any) => setCell(rk, k, Math.max(0, +e.target.value || 0))}/></label>`)}</div>
      ${used.length > 0 && html`<span className="field__help">Έχεις γράψει: ${used.map(u => u.r + ' ' + lbl(u.k) + ' ' + u.v).join(' · ')}</span>`}</div>
    ${HK_TEXT_FIELDS.map(([k, l, ph]) => html`<div key=${k} className="field"><label className="field__label" htmlFor=${'hk-' + k}>${l}</label><input id=${'hk-' + k} className="ui-input" placeholder=${ph} value=${m.text[k] || ''} onChange=${(e: any) => setM({ ...m, text: { ...m.text, [k]: e.target.value } })}/></div>`)}
    <p className="note">Οι αποφάσεις 3 (άδειες που ξεκινούν) και 4 (ποινές που επιβλήθηκαν τη μέρα) γράφονται μόνες τους, όπως και οι αριθμημένες αιτήσεις του 5. Οχήματα και ατυχήματα συμπληρώνονται στο Excel.</p>
    <div className="toolbar"><${Button} disabled=${!dirty} onClick=${async () => { if (await run({ t: 'setHkaiManual', date, manual: m }, false)) toast({ text: 'Αποθηκεύτηκαν τα στοιχεία της ΗΚΑΙ ' + dm(date) }); }}>Αποθήκευση<//>${dirty && html`<${Button} variant="ghost" onClick=${() => setM(cur)}>Ακύρωση<//>`}</div>
  <//>`;
}

// 5. ΑΙΤΗΣΕΙΣ: αιτήσεις στρατιωτών της μέρας, αριθμημένες όπως θα βγουν στην ΗΚΑΙ
function RequestsCard({ date }: { date: string }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast(); const nav = useNav();
  const [edit, setEdit] = useState<Partial<PersonRequest> | null>(null);
  const pm = useMemo(() => personMap(state.people), [state.people]);
  const list = useMemo(() => state.requests.filter(r => r.date === date && pm.has(r.pid)).sort((a, b) => byName(pm.get(a.pid)!, pm.get(b.pid)!) || a.id.localeCompare(b.id)), [state.requests, pm, date]);
  const del = async (r: PersonRequest) => { if (await run({ t: 'deleteRequest', id: r.id }, false)) toast({ text: 'Διαγράφηκε η αίτηση του ' + shortName(pm.get(r.pid)!), actions: [undoMark()] }); };
  return html`<${Card} title=${'5. Αιτήσεις (' + (date === today ? 'σήμερα' : dm(date)) + ')'} actions=${html`<${Button} size="sm" variant="outline" onClick=${() => setEdit({ date })}>+ Νέα αίτηση<//>`}>
    ${list.length ? html`<ol className="hk-req">${list.map(r => { const p = pm.get(r.pid)!; return html`<li key=${r.id}><div className="hk-req__row">
      <span><button type="button" className="linkish" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button> αιτείται ${r.text}.</span>
      <span className="hk-req__acts"><${Button} size="sm" variant="ghost" onClick=${() => setEdit(r)}>Αλλαγή<//><${Button} size="sm" variant="ghost" onClick=${() => del(r)}>Διαγραφή<//></span></div></li>`; })}</ol>`
      : html`<p className="note" style=${{ margin: 0 }}>Καμία αίτηση για ${dm(date)}. Γράφονται στην ΗΚΑΙ ως «1) Ο ΣΤΡ … αιτείται …».</p>`}
    ${edit && html`<${RequestDialog} req=${edit} onClose=${() => setEdit(null)}/>`}
  <//>`;
}
// Νέα αίτηση ή αλλαγή: από την ΗΚΑΙ ή από την καρτέλα του ατόμου (req.pid)
export function RequestDialog({ req, onClose }: { req: Partial<PersonRequest>; onClose: () => void }) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast();
  const [f, setF] = useState({ pid: req.pid ?? null as number | null, date: req.date || today, text: req.text || '' });
  const p = f.pid != null ? personMap(state.people).get(f.pid) : undefined;
  const text = reqText(f.text);
  const save = async () => {
    if (!p || !text) return;
    const cmd = req.id ? { t: 'updateRequest' as const, req: { id: req.id, pid: p.id, date: f.date, text } } : { t: 'addRequest' as const, req: { pid: p.id, date: f.date, text } };
    if (await run(cmd, false)) { onClose(); toast({ text: (req.id ? 'Άλλαξε η αίτηση: ' : 'Αίτηση για την ΗΚΑΙ ' + dm(f.date) + ': ') + shortName(p), actions: [undoMark()] }); }
  };
  return html`<${Dialog} title=${req.id ? 'Αλλαγή αίτησης' : 'Νέα αίτηση'} description="Γράφεται στην ΗΚΑΙ της ημέρας, στο «5. ΑΙΤΗΣΕΙΣ»." onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!p || !text} onClick=${save}>Αποθήκευση<//>`}>
    <div className="field"><label className="field__label" htmlFor="rq-p">Ποιος</label>
      ${p ? html`<div className="field-row"><b>${fullName(p)}</b>${!req.pid && html`<${Button} size="sm" variant="ghost" onClick=${() => setF({ ...f, pid: null })}>Άλλος<//>`}</div>`
        : html`<${PersonPicker} id="rq-p" autoFocus=${true} onChange=${(pid: number) => setF({ ...f, pid })}/>`}</div>
    <div className="field"><label className="field__label" htmlFor="rq-d">Ημερομηνία ΗΚΑΙ</label><input id="rq-d" type="date" className="ui-input" value=${f.date} onChange=${(e: any) => e.target.value && setF({ ...f, date: e.target.value })}/></div>
    <div className="field"><label className="field__label" htmlFor="rq-t">Αιτείται</label><input id="rq-t" className="ui-input" placeholder="π.χ. μετάθεση στην 2η ΕΠΧΙΑ" value=${f.text} data-autofocus=${p ? '' : undefined} onChange=${(e: any) => setF({ ...f, text: e.target.value })} onKeyDown=${(e: any) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}/>
      <span className="field__help">${p && text ? 'Στην ΗΚΑΙ: «Ο ' + p.rank + (p.spec ? ' (' + p.spec + ')' : '') + ' ' + fullName(p) + ' αιτείται ' + text + '.»' : 'Γράψε μόνο το τι ζητά· το «αιτείται» και η τελεία μπαίνουν μόνα τους.'}</span></div>
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
  const [s, setS] = useState(() => ({ unit: [...state.settings.unit] as [string, string, string], unitName: state.settings.unitName, place: state.settings.place, cadre: { ...state.settings.cadre } }));
  const [outRooms, setOutRooms] = useState(() => ({ 6: (state.rules.outRooms[6] || []).join(','), 0: (state.rules.outRooms[0] || []).join(',') }));
  const save = async () => {
    const ok = await run({ t: 'setSettings', settings: { unit: s.unit, unitName: s.unitName, place: s.place, cadre: s.cadre }, text: 'μονάδα, στελέχη ΗΚΑΙ' }, false);
    const rooms = (v: string) => v.split(/[,\s]+/).map(Number).filter(n => n > 0 && n < 50);
    const nr = { ...state.rules, outRooms: { ...state.rules.outRooms, 6: rooms(outRooms[6]), 0: rooms(outRooms[0]) } };
    if (ok && JSON.stringify(nr.outRooms) !== JSON.stringify(state.rules.outRooms)) await run({ t: 'setRules', rules: nr, text: 'θάλαμοι εξόδου ΣΑΒ ' + outRooms[6] + ', ΚΥΡ ' + outRooms[0] }, false);
    if (ok) toast({ text: 'Αποθηκεύτηκαν οι ρυθμίσεις' });
  };
  return html`<${Card} title="Ρυθμίσεις">
    <div className="field"><span className="field__label">Κεφαλίδα εντύπων (3 γραμμές)</span><div className="field-row">${[0, 1, 2].map(i => html`<input key=${i} className="ui-input" style=${{ flex: 1, minWidth: '160px' }} value=${s.unit[i]} onChange=${(e: any) => { const u = [...s.unit] as [string, string, string]; u[i] = e.target.value; setS({ ...s, unit: u }); }}/>`)}</div></div>
    <div className="field-row"><div className="field"><label className="field__label" htmlFor="st-un">Μονάδα στον τίτλο της ΗΚΑΙ</label><input id="st-un" className="ui-input" value=${s.unitName} onChange=${(e: any) => setS({ ...s, unitName: e.target.value })}/></div>
      <div className="field"><label className="field__label" htmlFor="st-pl">Τόπος (υπογραφές)</label><input id="st-pl" className="ui-input" value=${s.place} onChange=${(e: any) => setS({ ...s, place: e.target.value })}/></div></div>
    <div className="field"><span className="field__label">Στελέχη ανά βαθμό (ΗΚΑΙ, στήλη «Τοποθετημένοι»)</span><div className="settings-grid">${[...HK_OFFICERS, ...HK_NCO.slice(0, 2)].map(r => html`<label key=${r} className="field"><span className="field__help">${r}</span><input className="ui-input" type="number" min="0" value=${s.cadre[r] || 0} onChange=${(e: any) => setS({ ...s, cadre: { ...s.cadre, [r]: Math.max(0, +e.target.value || 0) } })}/></label>`)}</div>
      <span className="field__help">Οι στρατιώτες, δεκανείς και λοχίες μετρώνται από το προσωπικό της εφαρμογής.</span></div>
    <div className="field-row"><div className="field"><label className="field__label" htmlFor="st-r6">Θάλαμοι εξόδου Σάββατο (Κ-16)</label><input id="st-r6" className="ui-input" value=${outRooms[6]} onChange=${(e: any) => setOutRooms({ ...outRooms, 6: e.target.value })}/></div>
      <div className="field"><label className="field__label" htmlFor="st-r0">Θάλαμοι εξόδου Κυριακή</label><input id="st-r0" className="ui-input" value=${outRooms[0]} onChange=${(e: any) => setOutRooms({ ...outRooms, 0: e.target.value })}/></div></div>
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
  return html`<${Card} title="Υπηρεσίες" actions=${html`<${Segmented} small=${true} value=${phase} onChange=${setPhase} items=${[{ value: 'sven', label: 'ΣΒΕΝ' }, { value: 'spen', label: 'ΣΠΕΝ' }]}/>`}>
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
  // λάθη στους κωδικούς όπως θα ήταν μετά την αποθήκευση (ίδιος κωδικός αλλού, σκέτο γράμμα…)
  const errs = useMemo(() => {
    const key = phase === 'spen' ? 'blocksSpen' : 'blocks';
    const list = blocksOf(state.settings, phase).map((x: P) => (x.id === b.id ? { ...x, posts: x.posts.map((p: P) => (codes[p.k] != null && codes[p.k].trim() ? { ...p, code: codes[p.k].trim() } : p)) } : x));
    return codeErrors({ ...state.settings, [key]: list });
  }, [codes, state.settings, phase, b.id]);
  const save = async () => { if (await run({ t: 'editBlock', phase, id: b.id, name, n, hrs, codes }, false)) { onClose(); toast({ text: 'Αποθηκεύτηκε: ' + (b.custom ? name : b.name) }); } };
  return html`<${Dialog} title=${'Επεξεργασία: ' + b.name} description=${b.custom ? 'Δική σου υπηρεσία: αλλάζουν όνομα, πλήθος και ώρες.' : 'Υπηρεσία του εντύπου: οι θέσεις είναι σταθερές· αλλάζουν οι ώρες όσων θέσεων δεν έχουν βάρδιες.'} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${errs.length > 0} onClick=${save}>Αποθήκευση<//>`}>
    ${b.custom && html`<div className="field-row"><div className="field"><label className="field__label" htmlFor="eb-n">Όνομα</label><input id="eb-n" className="ui-input" value=${name} onChange=${(e: any) => setName(e.target.value)}/></div>
      <div className="field"><label className="field__label" htmlFor="eb-c">Πόσα άτομα</label><input id="eb-c" type="number" min="1" max="10" className="ui-input" value=${n} onChange=${(e: any) => setN(Math.max(1, Math.min(10, +e.target.value || 1)))}/><span className="field__help">Όσες θέσεις φύγουν κρατούν το ιστορικό τους.</span></div></div>`}
    <div className="field"><span className="field__label">Κωδικός στον έλεγχο υπηρεσιών</span><div className="settings-grid">${coded.map((x: P) => html`<label key=${x.k} className="field"><span className="field__help">${x.label}</span><input className="ui-input" maxLength="8" value=${codes[x.k] ?? ''} placeholder="αυτόματα" onChange=${(e: any) => setCodes({ ...codes, [x.k]: e.target.value })}/></label>`)}</div>
      <span className="field__help">Αυτό γράφεται στο κελί της μέρας (π.χ. Θ1α) και έτσι διαβάζεται πίσω. Το σκέτο γράμμα (Θ, Μ, Σ) σημαίνει υπηρεσία χωρίς θέση.${b.custom ? ' Νέες θέσεις παίρνουν μόνες τους κωδικό.' : ''}</span>
      ${errs.map((t: string) => html`<${Alert} key=${t} tone="bad"><span>${t}</span><//>`)}</div>
    ${shown.length ? shown.map((x: P) => html`<div key=${x.k} className="field"><label className="field__label" htmlFor=${'eb-h-' + x.k}>Ώρες: ${x.label}</label><input id=${'eb-h-' + x.k} className="ui-input" placeholder="π.χ. 07:30-08:00 (κενό = όλη μέρα)" value=${hrs[x.k] || ''} onChange=${(e: any) => setHrs({ ...hrs, [x.k]: e.target.value })}/></div>`) : html`<p className="note">Οι ώρες αυτής της υπηρεσίας είναι οι βάρδιες του εντύπου.</p>`}
  <//>`;
}
// Αργίες (10 §4β): ΣΚ μετρούν πάντα· εδώ οι επίσημες αργίες που αλλάζουν κάθε χρόνο (π.χ. Πάσχα)
function HolidaysCard() {
  const { state, run, today } = useStore();
  const [d, setD] = useState(''); const [n, setN] = useState('');
  const list = Object.entries(state.settings.holidays).sort(([a], [b]) => a.localeCompare(b));
  const save = (h: Record<string, string>, text: string) => run({ t: 'setSettings', settings: { holidays: h }, text });
  return html`<${Card} title="Αργίες">
    <p className="note" style=${{ marginTop: 0 }}>Σάββατο και Κυριακή μετρούν πάντα ως αργία. Εδώ οι επίσημες αργίες για τον έλεγχο υπηρεσιών και τον κανόνα «όχι αργία δύο φορές στη σειρά».</p>
    <ul className="hist">${list.map(([k, v]) => html`<li key=${k} className=${k < today ? 'muted' : ''}><span className="nw">${dow(k)} ${dmy(k)}</span> <b>${v}</b> <${Button} size="sm" variant="ghost" aria-label=${'Αφαίρεση ' + v} onClick=${() => { const h = { ...state.settings.holidays }; delete h[k]; save(h, 'αφαιρέθηκε η αργία ' + v + ' ' + dmy(k)); }}>✕<//></li>`)}</ul>
    <div className="field-row" style=${{ alignItems: 'flex-end' }}><div className="field"><label className="field__label" htmlFor="hol-d">Ημερομηνία</label><input id="hol-d" type="date" className="ui-input" value=${d} onChange=${(e: any) => setD(e.target.value)}/></div>
      <div className="field"><label className="field__label" htmlFor="hol-n">Όνομα</label><input id="hol-n" className="ui-input" placeholder="π.χ. Μεγάλη Παρασκευή" value=${n} onChange=${(e: any) => setN(e.target.value)}/></div>
      <div className="field" style=${{ flex: 0 }}><${Button} disabled=${!d || !n.trim()} onClick=${async () => { if (await save({ ...state.settings.holidays, [d]: n.trim() }, 'νέα αργία ' + n.trim() + ' ' + dmy(d))) { setD(''); setN(''); } }}>Πρόσθεσε<//></div></div>
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

export function TemplatesScreen() {
  const { boot } = useStore(); const nav = useNav();
  const tab = nav.params.tab || 'templates';
  return html`<div>
    <${PageHeader} title="Templates, εισαγωγή, ρυθμίσεις" sub="Τα έντυπα που συμπληρώνει η εφαρμογή, η εισαγωγή προσωπικού, τα αρχεία Excel που διαβάζει και ενημερώνει, και οι ρυθμίσεις της Ίλης."/>
    <div style=${{ marginBottom: '12px' }}><${Tabs} value=${tab} onChange=${(v: string) => nav.set({ tab: v })} items=${[{ value: 'templates', label: 'Templates' }, { value: 'import', label: 'Εισαγωγή Δυναμολογίου' }, { value: 'files', label: 'Αρχεία Excel' }, { value: 'settings', label: 'Ρυθμίσεις' }]}/></div>
    ${tab === 'import' ? html`<${ImportCard}/>` : tab === 'files' ? html`<${SourcesView}/>` : tab === 'settings' ? html`<div className="stack"><${AppearanceCard}/><${SettingsCard}/><${ListsCard}/><${SiCard}/><${FoldersCard}/><${BlocksCard}/><${HolidaysCard}/><${BackupsCard}/></div>` : html`<div>
      <div className="ui-card"><ul className="tpl">${boot.templates.map(t => html`<li key=${t.file}><div><b>${t.name}</b> <${Badge} tone="ok">Excel<//>${t.custom && html` <${Badge} tone="info">δικό σου<//>`}<small>${t.file}</small></div>
        ${t.ok ? html`<${Badge} tone="ok">✓ Έτοιμο<//>` : html`<${Badge} tone="bad">Λείπει<//>`}</li>`)}</ul></div>
      <p className="note" style=${{ marginTop: '10px' }}>Για να αλλάξεις ένα έντυπο (π.χ. νέα κεφαλίδα), άνοιξε τον φάκελο templates, βάλε εκεί το δικό σου αρχείο με το ίδιο όνομα και κράτα τα κελιά στις ίδιες θέσεις. Η εφαρμογή γράφει μόνο τιμές και δεν αλλάζει τύπους, στυλ ή διάταξη σελίδας.</p>
      <${Button} variant="outline" onClick=${() => window.api.openFolder('templates')}>Άνοιξε τον φάκελο templates<//>
    </div>`}
  </div>`;
}

export function CommandPalette({ onClose }: P) {
  const { state, today, tomorrow } = useStore(); const nav = useNav(); const usb = useUsbCopy();
  const [q, setQ] = useState(''); const [sel, setSel] = useState(0); const dq = useDeferredValue(q);
  const ACTIONS = [
    { t: 'Εξοδούχοι σήμερα', k: 'ΕΞΟΔΟΥΧΟΙ ΕΞΟΔΟΣ ΔΝ ΔΙΑΝΥΚΤΕΡΕΥΣΗ ΠΑΡΑΜΕΝΟΝΤΕΣ', fn: () => nav.go('outs', { outDate: today }) },
    { t: 'Υπηρεσίες αύριο', k: 'ΥΠΗΡΕΣΙΕΣ ΦΡΟΥΡΑ ΘΑΛΑΜΟΦΥΛΑΚΕΣ ΜΑΓΕΙΡΕΙΑ ΛΥ', fn: () => nav.go('guard', { guardDate: tomorrow }) },
    { t: 'ΗΚΑΙ σήμερα', k: 'ΗΚΑΙ ΗΜΕΡΗΣΙΑ ΑΝΑΦΟΡΑ ΚΑΤΑΣΤΑΣΗ', fn: () => nav.go('hkai', { hkaiDate: today }) },
    { t: 'Δήλωσε ιατρικό (ΕΑ, ΕΑΡΒ, ΕΥ, ΕΟ, ΝΟΣ)', k: 'ΙΑΤΡΙΚΑ ΕΑ ΕΑΡΒ ΑΡΒΥΛΩΝ ΕΥ ΕΟ ΝΟΣ', fn: () => nav.declare({ type: 'EA', from: today, to: addDays(today, 2) }) },
    { t: 'Νέα ποινή (αίτηση στην ΗΚΑΙ)', k: 'ΠΟΙΝΗ ΤΙΜΩΡΗΜΕΝΟΣ ΚΡΑΤΗΣΗ ΠΕΡΙΟΡΙΣΜΟΣ', fn: () => nav.declare({ type: 'PUN', from: today, to: addDays(today, 4) }) },
    { t: 'Ιατρικά και ποινές', k: 'ΙΑΤΡΙΚΑ ΠΟΙΝΕΣ ΛΗΞΗ', fn: () => nav.go('records', { recTab: 'med' }) },
    { t: 'Δώσε άδεια', k: 'ΑΔΕΙΑ', fn: () => nav.declare({ type: 'LEAVE' }) },
    { t: 'Δύναμη σήμερα', k: 'ΔΥΝΑΜΗ ΚΑΤΑΣΤΑΣΗ', fn: () => nav.go('strength', { strengthDate: today }) },
    { t: 'Εισαγωγή Δυναμολογίου', k: 'ΕΙΣΑΓΩΓΗ ΔΥΝΑΜΟΛΟΓΙΟ ΕΣΣΟ EXCEL', fn: () => nav.go('templates', { tab: 'import' }) },
    { t: 'Αρχεία Excel (από πού διαβάζει, πού γράφει)', k: 'ΑΡΧΕΙΑ EXCEL ΦΥΛΛΟ ΣΤΗΛΕΣ ΑΝΤΙΣΤΟΙΧΙΣΗ ΠΗΓΕΣ', fn: () => nav.go('templates', { tab: 'files' }) },
    { t: 'Ιστορικό ενεργειών', k: 'ΙΣΤΟΡΙΚΟ ΑΝΑΙΡΕΣΗ', fn: () => nav.go('history') },
    { t: 'Αντίγραφο σε USB', k: 'ΑΝΤΙΓΡΑΦΟ USB BACKUP ΑΣΦΑΛΕΙΑ', fn: () => usb() },
    { t: 'Επαναφορά από αντίγραφο', k: 'ΕΠΑΝΑΦΟΡΑ ΑΝΤΙΓΡΑΦΟ BACKUP', fn: () => nav.go('templates', { tab: 'settings' }) },
    { t: 'Διάγνωση (μνήμη, ταχύτητα)', k: 'ΔΙΑΓΝΩΣΗ ΜΝΗΜΗ ΤΑΧΥΤΗΤΑ GPU', fn: () => nav.go('diag') },
    { t: 'Ρυθμίσεις', k: 'ΡΥΘΜΙΣΕΙΣ ΣΤΕΛΕΧΗ ΘΑΛΑΜΟΙ', fn: () => nav.go('templates', { tab: 'settings' }) }
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
      ${recent.map(p => { i++; const j = i; return html`<li key=${'r' + p.id} role="option" aria-selected=${sel === j} className="picker__opt" onMouseDown=${(e: any) => { e.preventDefault(); runI(j); }} onMouseEnter=${() => setSel(j)}><div><b>${fullName(p)}</b><small>του ${p.father} · ${p.rank} · ${unitOf(p)}</small></div><${StatusBadge} statuses=${state.statuses} pid=${p.id} date=${today} lists=${state.settings.lists}/></li>`; })}
      ${acts.length > 0 && html`<li className="picker__hd">Ενέργειες</li>`}
      ${acts.map(a => { i++; const j = i; return html`<li key=${a.t} role="option" aria-selected=${sel === j} className="picker__opt" onMouseDown=${(e: any) => { e.preventDefault(); runI(j); }} onMouseEnter=${() => setSel(j)}><div><b>${a.t}</b></div></li>`; })}
      ${ppl.length > 0 && html`<li className="picker__hd">Πρόσωπα</li>`}
      ${ppl.map(p => { i++; const j = i; return html`<li key=${p.id} role="option" aria-selected=${sel === j} className="picker__opt" onMouseDown=${(e: any) => { e.preventDefault(); runI(j); }} onMouseEnter=${() => setSel(j)}><div><b>${fullName(p)}</b><small>του ${p.father} · ${p.rank} · ${unitOf(p)}</small></div><${StatusBadge} statuses=${state.statuses} pid=${p.id} date=${today} lists=${state.settings.lists}/></li>`; })}
      ${!items.length && html`<li className="picker__hd">Δεν βρέθηκε τίποτα για «${q}».</li>`}
    </ul>
    <div className="note" style=${{ padding: '6px 4px 0' }}>↑↓ επιλογή · Enter άνοιγμα · Esc κλείσιμο · ψάχνει χωρίς τόνους και με λατινικά (π.χ. «papad»)</div>
  </div></div>`, document.body);
}

