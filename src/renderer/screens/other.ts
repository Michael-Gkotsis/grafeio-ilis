// Σήμερα, ιατρικά/ποινές, δύναμη, ΗΚΑΙ, ιστορικό, templates/εισαγωγή/ρυθμίσεις, αναζήτηση (Ctrl+K)
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { html, Alert, Badge, Button, Card, PageHeader, Tabs, useEscape, useMedia, useToast } from '../ui';
import { useNav, useStore, searchPeople } from '../store';
import { DateBar, ExcelSheet, ExportButton, StatusBadge, TemplateNote } from '../common';
import { hkaiFront, hkaiBack, frouraEmpty } from '../sheets';
import { TYPES, TYPE_KEYS, RECORD_CATS, effects, fullName, shortName, unitOf, type Status } from '../../shared/domain';
import { HK_K, HK_A, HK_OFFICERS, HK_NCO, hkaiCounts, isRecordExpiredOn, personMap, strengthOf } from '../../shared/rules';
import { addDays, daysBetween, dayName, dm, dmy, parseD, DOW_GEN } from '../../shared/dates';
import { norm } from '../../shared/text';
import type { ImportPreview } from '../../shared/api';
type P = any;

export function TodayScreen() {
  const { state, today, tomorrow } = useStore(); const nav = useNav();
  const pm = personMap(state.people);
  const c = useMemo(() => strengthOf(state, today), [state, today]);
  const empty = frouraEmpty(state, tomorrow);
  const ending = state.statuses.filter(s => s.to === today && !s.pending && (TYPES[s.type].cat === 'abs' || RECORD_CATS.includes(TYPES[s.type].cat)) && pm.has(s.pid));
  const expired = state.statuses.filter(s => isRecordExpiredOn(s, today) && !s.pending && pm.has(s.pid));
  const pending = state.statuses.filter(s => s.pending && pm.has(s.pid));
  const nRec = state.statuses.filter(s => s.from <= today && s.to >= today && RECORD_CATS.includes(TYPES[s.type].cat)).length;
  const dn = c.lists.DN;
  const hour = new Date().getHours();
  const endTxt = (s: Status) => { const t = TYPES[s.type]; return t.cat === 'abs' ? 'Αναμένεται επιστροφή' : t.noDuty ? 'Από αύριο ξαναμπαίνει σε υπηρεσίες' : t.noArmed ? 'Από αύριο ξαναμπαίνει και σε ένοπλες θέσεις' : 'Από αύριο μπορεί να βγει έξοδο'; };
  const what = (s: Status) => (s.type === 'PUN' ? 'ποινή (' + (s.kind || '').toLowerCase() + ')' : TYPES[s.type].label);
  if (!c.total) return html`<div className="onboard"><${Card} title="Καλώς ήρθες στο Γραφείο Ίλης">
    <p style=${{ marginTop: 0 }}>Για να ξεκινήσεις χρειάζεται το προσωπικό της Ίλης. Πάρ' το από το Δυναμολόγιο (το αρχείο .xlsm με το φύλλο «ΣΥΝΟΛΙΚΟ»).</p>
    <ol><li>Πάτα <b>Εισαγωγή Δυναμολογίου</b> και διάλεξε το αρχείο.</li><li>Δες τι βρέθηκε και πάτα <b>Εισαγωγή</b>.</li><li>Στις <b>Ρυθμίσεις</b> βάλε τα στελέχη ανά βαθμό για την ΗΚΑΙ.</li></ol>
    <${Button} onClick=${() => nav.go('templates', { tab: 'import' })}>Εισαγωγή Δυναμολογίου<//>
  <//></div>`;
  return html`<div>
    <${PageHeader} title=${hour < 12 ? 'Καλημέρα' : hour < 18 ? 'Καλησπέρα' : 'Καλό βράδυ'} sub=${DOW_GEN[parseD(today).getDay()] + ' ' + dmy(today) + ' · ' + state.settings.unit.join(' · ')}/>
    <div className="quick">
      <button type="button" onClick=${() => nav.declare({})}><b>Δήλωσε κατάσταση</b><span>Ιατρικό, άδεια, έξοδος, ΔΝ ή ποινή, για έναν ή πολλούς</span></button>
      <button type="button" onClick=${() => nav.go('guard', { guardDate: tomorrow })}><b>Υπηρεσίες αύριο</b><span>${empty ? empty + ' κενές θέσεις' : 'Πλήρης'} · προεπισκόπηση Excel</span></button>
      <button type="button" onClick=${() => nav.go('outs', { outDate: today })}><b>Εξοδούχοι σήμερα</b><span>${c.counts.OUT} έξοδος · ${c.counts.DN} ΔΝ · με τους κανόνες</span></button>
      <button type="button" onClick=${() => nav.go('hkai', { hkaiDate: today })}><b>ΗΚΑΙ σήμερα</b><span>Βγαίνει μόνη της · ${pending.length ? pending.length + ' ποινές αιτούνται' : 'καμία ποινή προς αίτηση'}</span></button>
    </div>
    <div className="cols">
      <${Card} title="Δύναμη σήμερα" actions=${html`<${Button} size="sm" variant="outline" onClick=${() => nav.go('strength', { strengthDate: today })}>Άνοιξε<//>`}>
        <div className="tiles">
          <button type="button" className="tile tile--main" onClick=${() => nav.go('people', { filter: 'all' })}><span className="tile__n">${c.total}</span><span className="tile__l">Σύνολο</span></button>
          <button type="button" className="tile" onClick=${() => nav.go('people', { filter: 'present' })}><span className="tile__n">${c.present}</span><span className="tile__l">Παρόντες</span></button>
          ${TYPE_KEYS.filter(k => c.counts[k] > 0).map(k => html`<button key=${k} type="button" className="tile" onClick=${() => nav.go('people', { filter: k })}><span className="tile__n">${c.counts[k]}</span><span className="tile__l">${TYPES[k].label}</span></button>`)}
        </div><p className="note" style=${{ margin: '10px 0 0' }}>Πάτα σε έναν αριθμό για να δεις ποιοι είναι. Ιατρικά σε ισχύ: ${nRec}.</p>
      <//>
      <${Card} title="Θέλει προσοχή">
        <ul className="attn">
          ${empty > 0 && html`<li className="is-bad"><div><b>${empty} κενές θέσεις στις υπηρεσίες αύριο</b><small>Πρέπει να συμπληρωθούν πριν τις 14:00</small></div><${Button} size="sm" variant="outline" onClick=${() => nav.go('guard', { guardDate: tomorrow })}>Συμπλήρωσε<//></li>`}
          ${pending.length > 0 && html`<li><div><b>${pending.length} ${pending.length === 1 ? 'ποινή αιτείται' : 'ποινές αιτούνται'} στην ΗΚΑΙ</b><small>${pending.map(s => shortName(pm.get(s.pid)!)).join(', ')} · πάτα «Εγκρίθηκε» όταν υπογράψει ο Διοικητής</small></div><${Button} size="sm" variant="outline" onClick=${() => nav.go('records', { recTab: 'pun' })}>Άνοιξε<//></li>`}
          ${expired.length > 0 && html`<li className="is-ok"><div><b>Αφαιρέθηκαν αυτόματα σήμερα (έληξαν χθες)</b><small>${expired.map(s => what(s) + ' του ' + shortName(pm.get(s.pid)!)).join(' · ')}</small></div><${Button} size="sm" variant="outline" onClick=${() => nav.go('records', { recTab: 'expired' })}>Δες<//></li>`}
          ${ending.map(s => html`<li key=${s.id}><div><b>Λήγει σήμερα: ${what(s)} του ${shortName(pm.get(s.pid)!)}</b><small>${endTxt(s)}</small></div><${Button} size="sm" variant="outline" onClick=${() => nav.openPerson(s.pid)}>Άνοιξε<//></li>`)}
          ${dn.length > 0 && html`<li className="is-info"><div><b>${dn.length} με ΔΝ απόψε</b><small>${dn.map(shortName).join(', ')}</small></div><${Button} size="sm" variant="outline" onClick=${() => nav.go('outs', { outDate: today })}>Άνοιξε<//></li>`}
          ${!empty && !pending.length && !expired.length && !ending.length && !dn.length && html`<li className="is-ok"><div><b>Όλα εντάξει</b><small>Τίποτα δεν περιμένει από σένα αυτή τη στιγμή.</small></div></li>`}
        </ul>
      <//>
    </div>
  </div>`;
}

export function RecordsScreen() {
  const { state, run, today, undo } = useStore(); const toast = useToast(); const nav = useNav();
  const pm = personMap(state.people);
  const tab = nav.params.recTab || 'med';
  const y = addDays(today, -1);
  const isMed = (s: Status) => ['med', 'other'].includes(TYPES[s.type].cat);
  const list = useMemo(() => {
    const ok = (s: Status) => pm.has(s.pid);
    if (tab === 'expired') return state.statuses.filter(s => ok(s) && RECORD_CATS.includes(TYPES[s.type].cat) && !s.pending && s.to < today && s.to >= addDays(today, -14)).sort((a, b) => b.to.localeCompare(a.to));
    return state.statuses.filter(s => ok(s) && s.to >= today && (tab === 'med' ? isMed(s) : s.type === 'PUN')).sort((a, b) => Number(!!b.pending) - Number(!!a.pending) || a.to.localeCompare(b.to));
  }, [state.statuses, tab, today]);
  const nMed = state.statuses.filter(s => s.to >= today && isMed(s)).length;
  const nPun = state.statuses.filter(s => s.to >= today && s.type === 'PUN').length;
  const left = (s: Status) => { const n = daysBetween(today, s.to) - 1; return s.from > today ? 'ξεκινά ' + dayName(s.from, today).toLowerCase() : n === 0 ? 'λήγει σήμερα' : n === 1 ? 'λήγει αύριο' : 'λήγει σε ' + n + ' ημ.'; };
  const act = (fn: () => Promise<boolean>, text: string) => async () => { if (await fn()) toast({ text, actions: [{ label: 'Αναίρεση', fn: () => { undo(); } }] }); };
  return html`<div>
    <${PageHeader} title="Ιατρικά και ποινές" sub="Όταν λήξει ένα ιατρικό ή μια ποινή, αφαιρείται μόνο του την επόμενη μέρα και γράφεται στο Ιστορικό. Οι ποινές αιτούνται στην ΗΚΑΙ και ισχύουν όταν εγκριθούν.">
      <${Button} variant="outline" onClick=${() => nav.declare({ type: 'EA', from: today, to: addDays(today, 2) })}>+ Ιατρικό<//><${Button} variant="outline" onClick=${() => nav.declare({ type: 'PUN', from: addDays(today, 1), to: addDays(today, 5) })}>+ Ποινή<//><//>
    <div style=${{ marginBottom: '12px' }}><${Tabs} value=${tab} onChange=${(v: string) => nav.set({ recTab: v })} items=${[{ value: 'med', label: 'Ιατρικά (' + nMed + ')' }, { value: 'pun', label: 'Ποινές (' + nPun + ')' }, { value: 'expired', label: 'Έληξαν' }]}/></div>
    <div className="ui-card">${list.length ? html`<ul className="rec">${list.map(s => { const t = TYPES[s.type]; const p = pm.get(s.pid)!; return html`<li key=${s.id}>
      <div><button type="button" className="linkish who" onClick=${() => nav.openPerson(s.pid)}>${fullName(p)}</button> <${Badge} tone=${t.tone} data-tip=${t.long}>${s.type === 'PUN' ? s.kind : t.label}<//>
        <small>${dm(s.from)} – ${dm(s.to)} · ${tab === 'expired' ? 'αφαιρέθηκε αυτόματα ' + (s.to === y ? 'σήμερα' : dm(addDays(s.to, 1))) : left(s)}${tab !== 'expired' && effects(t) ? ' · ' + effects(t) : ''}${s.note ? ' · ' + s.note : ''}</small></div>
      ${s.pending ? html`<${Badge} tone="warn" data-tip="Γράφεται στην ΗΚΑΙ (Αποφάσεις Διοικητή, 4. Ποινές). Ισχύει μόλις εγκριθεί" data-tip-side="left">Αιτείται στην ΗΚΑΙ<//><${Button} size="sm" onClick=${act(() => run({ t: 'approvePun', id: s.id }, false), 'Εγκρίθηκε η ποινή του ' + shortName(p) + '. Ισχύει από ' + dayName(s.from, today).toLowerCase() + ' (δεν βγαίνει έξοδο).')}>Εγκρίθηκε<//><${Button} size="sm" variant="ghost" onClick=${act(() => run({ t: 'deleteStatus', id: s.id }, false), 'Διαγράφηκε η αίτηση ποινής του ' + shortName(p))}>Δεν εγκρίθηκε<//>` :
        tab === 'expired' ? html`<${Badge} tone="ok">Αυτόματα<//>` : html`<${Button} size="sm" variant="ghost" onClick=${act(() => run({ t: 'endStatus', id: s.id }, false), 'Τέλος από σήμερα: ' + (s.type === 'PUN' ? 'ποινή' : t.label) + ' του ' + shortName(p))} data-tip="Αν τελείωσε νωρίτερα από το προβλεπόμενο" data-tip-side="left">Τέλος σήμερα<//>`}
    </li>`; })}</ul>` : html`<div className="empty">${tab === 'expired' ? 'Τίποτα δεν έληξε τις τελευταίες 14 μέρες.' : 'Καμία ενεργή καταχώρηση.'}</div>`}</div>
    ${tab === 'med' && html`<p className="note" style=${{ marginTop: '8px' }}>ΕΟ = ελεύθερος ορθοστασίας, ΕΑ = ελεύθερος ασκήσεων, ΕΥ = ελεύθερος υπηρεσίας. ΣΤΕΠ = εισαγωγή ΣΤΕΠ.</p>`}
  </div>`;
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
  const cadre = Object.values(state.settings.cadre).reduce((a, b) => a + (b || 0), 0);
  const sum = html`<div><${Card} title="Από πού βγαίνει κάθε αριθμός">
    <div className="tiles" style=${{ marginBottom: '12px' }}><div className="tile tile--main"><span className="tile__n">${h.total}</span><span className="tile__l">Δύναμη</span></div><div className="tile"><span className="tile__n">${h.kol}</span><span className="tile__l">Κωλυόμενοι</span></div><div className="tile"><span className="tile__n">${h.apo}</span><span className="tile__l">Απόντες</span></div><div className="tile"><span className="tile__n">${h.avail}</span><span className="tile__l">Διαθέσιμοι</span></div></div>
    <ul className="hk-src">${src.map(([k, , full]) => html`<li key=${k}><b>${full}</b>: <span className="num">${h.cols[k].length}</span><div className="cat__names">${h.cols[k].map(p => html`<button key=${p.id} type="button" onClick=${() => nav.openPerson(p.id)}>${shortName(p)}</button>`)}</div></li>`)}</ul>
    <p className="note" style=${{ margin: '8px 0 0' }}>Υπηρεσία από την κατάσταση υπηρεσιών, ΕΥ και ποινές από τα ιατρικά και τις ποινές, απόντες από άδειες, αναρρωτικές και νοσοκομείο. Κάθε άτομο μετριέται μία φορά. Διαθέσιμοι = Δύναμη − Απόντες (ο τύπος του εντύπου). Οι εξοδούχοι δεν μετρούν.</p>
    ${!cadre && html`<${Alert} tone="warn"><span>Δεν έχουν μπει στελέχη ανά βαθμό. <${Button} variant="link" onClick=${() => nav.go('templates', { tab: 'settings' })}>Ρυθμίσεις<//></span><//>`}
  <//>
  <${Card} title="Συμπληρώνεις στο Excel">
    <p className="note" style=${{ margin: 0, fontSize: '13px' }}>Οχήματα, ατυχήματα, 1–2 εγγραφές/διαγραφές, 5 αιτήσεις και 6 λοιπά γράφονται στο αρχείο μετά την εξαγωγή. Οι αποφάσεις 3 (άδειες που ξεκινούν) και 4 (ποινές που αιτούνται) γράφονται μόνες τους.</p>
  <//></div>`;
  const sheets = html`<div>
    ${!mobile && html`<div style=${{ marginBottom: '8px' }}><${Tabs} value=${side === 'sum' ? 'front' : side} onChange=${setSide} items=${[{ value: 'front', label: 'Μπροστά' }, { value: 'back', label: 'Πίσω' }]}/></div>`}
    ${side === 'back' ? html`<${ExcelSheet} model=${back} fileName=${fn} sheetName="πισω" meta="A4 οριζόντιο"/>` : html`<${ExcelSheet} model=${front} fileName=${fn} sheetName="μπροστινο" meta="A4 οριζόντιο · 1 σελίδα" footer="Γράφονται μόνο τα κελιά εισόδου· τα αθροίσματα μένουν τύποι του εντύπου."/>`}
    <div className="toolbar" style=${{ marginTop: '10px' }}><${ExportButton} kind="hkai" date=${date} label="η ΗΚΑΙ"/></div><${TemplateNote} ids=${['hkai']}/></div>`;
  return html`<div>
    <${PageHeader} title=${'ΗΚΑΙ της ' + dmy(date)} sub="Κατάσταση Ημερήσιας Αναφοράς. Βγαίνει μόνη της από τις υπηρεσίες και τις καταστάσεις· κάθε αριθμός ανοίγει τα ονόματα."><${DateBar} value=${date} onChange=${(d: string) => nav.set({ hkaiDate: d })} days=${[addDays(today, -1), today, addDays(today, 1)]}/><//>
    ${mobile ? html`<div style=${{ marginBottom: '12px' }}><${Tabs} value=${side} onChange=${setSide} items=${[{ value: 'sum', label: 'Σύνοψη' }, { value: 'front', label: 'Μπροστά' }, { value: 'back', label: 'Πίσω' }]}/></div>${side === 'sum' ? sum : sheets}` : html`<div className="strength">${sum}${sheets}</div>`}
  </div>`;
}

const SRC: Record<string, [string, string]> = { app: ['Εφαρμογή', 'outline'], excel: ['Excel', 'info'], import: ['Εισαγωγή', 'ey'], auto: ['Αυτόματα', 'ok'] };
export function HistoryScreen() {
  const { audit, today, undo } = useStore();
  const last = audit.find(x => x.undoable && !x.undone);
  return html`<div>
    <${PageHeader} title="Ιστορικό" sub="Κάθε ενέργεια, από πού έγινε και ποια έντυπα αφορά. Η αναίρεση γίνεται από την πιο πρόσφατη προς τα πίσω."/>
    <div className="ui-card">${audit.length ? html`<ul className="log">${audit.map(e => html`<li key=${e.id} className=${e.undone ? 'is-undone' : ''}>
      <span className="log__time">${e.day === today ? 'Σήμερα' : dm(e.day)}<br/>${e.at}</span>
      <div><b>${e.text}</b> <${Badge} tone=${SRC[e.source][1]}>${SRC[e.source][0]}<//>${e.undone && html` <${Badge}>Αναιρέθηκε<//>`}<div className="log__files">${e.files.join(' · ')}</div></div>
      ${e === last ? html`<${Button} size="sm" variant="outline" onClick=${() => undo()}>Αναίρεση<//>` : null}
    </li>`)}</ul>` : html`<div className="empty">Δεν έχει γίνει ακόμα καμία ενέργεια.</div>`}</div>
  </div>`;
}

function ImportCard() {
  const { refresh } = useStore(); const toast = useToast(); const nav = useNav();
  const [pv, setPv] = useState<ImportPreview | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [deact, setDeact] = useState(true);
  const pick = async () => { setErr(''); setBusy(true); try { const r = await window.api.pickRoster(); if (!r) return; if (!r.ok) setErr(r.error); else setPv(r); } finally { setBusy(false); } };
  const go = async () => {
    if (!pv) return; setBusy(true);
    try { const r = await window.api.applyRoster(pv.token, deact); if (!r.ok) { setErr(r.error); return; } await refresh(); setPv(null); toast({ text: r.text }); nav.go('people'); }
    finally { setBusy(false); }
  };
  return html`<${Card} title="Εισαγωγή από το Δυναμολόγιο">
    <p style=${{ marginTop: 0 }}>Διαβάζει το φύλλο <b>ΣΥΝΟΛΙΚΟ</b> (βαθμός, Ο/Σ, ονοματεπώνυμο, πατρώνυμο, ΑΣΜ, τηλέφωνο, θάλαμος, Σ.Ι., ρόλος), τα <b>ΠΟΣΤΑ</b> και το <b>ΕΚΤΟΣ ΔΥΝΑΜΗΣ</b>. Οι στήλες βρίσκονται από τις επικεφαλίδες. Το αρχείο δεν αλλάζει.</p>
    <p className="note">Όσοι υπάρχουν ήδη ενημερώνονται (ταίριασμα με ΑΣΜ, αλλιώς ονοματεπώνυμο και πατρώνυμο). Οι υπηρεσίες, τα ιατρικά και οι ποινές τους μένουν.</p>
    ${!pv && html`<${Button} disabled=${busy} onClick=${pick}>${busy ? 'Ανάγνωση…' : 'Διάλεξε αρχείο Δυναμολογίου…'}<//>`}
    ${pv && html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div><span className="plan__fn">${pv.file}</span>${pv.essos && html` <${Badge} tone="info">ΕΣΣΟ ${pv.essos}<//>`}</div>
      <div className="tiles"><div className="tile tile--main"><span className="tile__n">${pv.active}</span><span className="tile__l">Σε δύναμη</span></div><div className="tile"><span className="tile__n">${pv.added}</span><span className="tile__l">Νέοι</span></div><div className="tile"><span className="tile__n">${pv.updated}</span><span className="tile__l">Ενημερώνονται</span></div><div className="tile"><span className="tile__n">${pv.total - pv.active}</span><span className="tile__l">Εκτός δύναμης</span></div></div>
      ${pv.warnings.map(w => html`<${Alert} key=${w} tone="warn"><span>${w}</span><//>`)}
      <label className="rule"><input type="checkbox" className="ui-check" checked=${deact} onChange=${(e: any) => setDeact(e.target.checked)}/><span><b>Όσοι δεν είναι στο αρχείο → εκτός δύναμης</b><small>${pv.missing ? pv.missing + ' άτομα της εφαρμογής δεν βρέθηκαν στο αρχείο.' : 'Όλοι της εφαρμογής βρέθηκαν στο αρχείο.'} Δεν σβήνονται, κρατιέται το ιστορικό τους.</small></span></label>
      <div style=${{ display: 'flex', gap: '8px' }}><${Button} variant="outline" onClick=${() => setPv(null)}>Άκυρο<//><${Button} disabled=${busy} onClick=${go}>Εισαγωγή ${pv.total} ατόμων<//></div>
      <span className="note">Πριν την εισαγωγή κρατιέται αντίγραφο της βάσης. Αναιρείται από το Ιστορικό.</span>
    </div>`}
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
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
    <dl className="kv"><dt>Excel βγαίνουν στο</dt><dd>${state.settings.outputDir || boot.outputDir} <${Button} variant="link" onClick=${async () => { const d = await window.api.chooseOutputDir(); if (d) toast({ text: 'Τα Excel θα βγαίνουν στο ' + d }); }}>Άλλαξε<//> · <${Button} variant="link" onClick=${() => window.api.openFolder('output')}>Άνοιξε<//></dd>
      <dt>Δεδομένα</dt><dd>${boot.dataDir} <${Button} variant="link" onClick=${() => window.api.openFolder('data')}>Άνοιξε<//></dd>
      <dt>Αντίγραφα</dt><dd>Κάθε μέρα αυτόματα (14 τελευταία + 1 ανά μήνα). <${Button} variant="link" onClick=${async () => { const r = await window.api.backup(); toast({ text: r.ok ? 'Κρατήθηκε αντίγραφο της βάσης' : 'Δεν κρατήθηκε αντίγραφο: ' + r.error, actions: [{ label: 'Φάκελος', fn: () => window.api.openFolder('backups') }] }); }}>Αντίγραφο τώρα<//></dd>
      <dt>Έκδοση</dt><dd>${boot.version}</dd></dl>
  <//>`;
}

export function TemplatesScreen() {
  const { boot } = useStore(); const nav = useNav();
  const tab = nav.params.tab || 'templates';
  return html`<div>
    <${PageHeader} title="Templates, εισαγωγή, ρυθμίσεις" sub="Τα έντυπα που συμπληρώνει η εφαρμογή, η εισαγωγή προσωπικού και οι ρυθμίσεις της Ίλης."/>
    <div style=${{ marginBottom: '12px' }}><${Tabs} value=${tab} onChange=${(v: string) => nav.set({ tab: v })} items=${[{ value: 'templates', label: 'Templates' }, { value: 'import', label: 'Εισαγωγή Δυναμολογίου' }, { value: 'settings', label: 'Ρυθμίσεις' }]}/></div>
    ${tab === 'import' ? html`<${ImportCard}/>` : tab === 'settings' ? html`<${SettingsCard}/>` : html`<div>
      <div className="ui-card"><ul className="tpl">${boot.templates.map(t => html`<li key=${t.id}><div><b>${t.name}</b> <${Badge} tone="ok">Excel<//>${t.custom && html` <${Badge} tone="info">δικό σου<//>`}<small>${t.file}</small></div>
        ${t.ok ? html`<${Badge} tone="ok">✓ Έτοιμο<//>` : html`<${Badge} tone="bad">Λείπει<//>`}</li>`)}</ul></div>
      <p className="note" style=${{ marginTop: '10px' }}>Για να αλλάξεις ένα έντυπο (π.χ. νέα κεφαλίδα), άνοιξε τον φάκελο templates, βάλε εκεί το δικό σου αρχείο με το ίδιο όνομα και κράτα τα κελιά στις ίδιες θέσεις. Η εφαρμογή γράφει μόνο τιμές και δεν αλλάζει τύπους, στυλ ή διάταξη σελίδας.</p>
      <${Button} variant="outline" onClick=${() => window.api.openFolder('templates')}>Άνοιξε τον φάκελο templates<//>
    </div>`}
  </div>`;
}

export function CommandPalette({ onClose }: P) {
  const { state, today, tomorrow } = useStore(); const nav = useNav();
  const [q, setQ] = useState(''); const [sel, setSel] = useState(0); const dq = useDeferredValue(q);
  const ACTIONS = [
    { t: 'Εξοδούχοι σήμερα', k: 'ΕΞΟΔΟΥΧΟΙ ΕΞΟΔΟΣ ΔΝ ΔΙΑΝΥΚΤΕΡΕΥΣΗ ΠΑΡΑΜΕΝΟΝΤΕΣ', fn: () => nav.go('outs', { outDate: today }) },
    { t: 'Υπηρεσίες αύριο', k: 'ΥΠΗΡΕΣΙΕΣ ΦΡΟΥΡΑ ΘΑΛΑΜΟΦΥΛΑΚΕΣ ΜΑΓΕΙΡΕΙΑ ΛΥ', fn: () => nav.go('guard', { guardDate: tomorrow }) },
    { t: 'ΗΚΑΙ σήμερα', k: 'ΗΚΑΙ ΗΜΕΡΗΣΙΑ ΑΝΑΦΟΡΑ ΚΑΤΑΣΤΑΣΗ', fn: () => nav.go('hkai', { hkaiDate: today }) },
    { t: 'Δήλωσε ιατρικό (ΕΑ, ΕΥ, ΕΟ, ΝΟΣ)', k: 'ΙΑΤΡΙΚΑ ΕΑ ΕΥ ΕΟ ΝΟΣ', fn: () => nav.declare({ type: 'EA', from: today, to: addDays(today, 2) }) },
    { t: 'Νέα ποινή (αίτηση στην ΗΚΑΙ)', k: 'ΠΟΙΝΗ ΤΙΜΩΡΗΜΕΝΟΣ ΚΡΑΤΗΣΗ ΠΕΡΙΟΡΙΣΜΟΣ', fn: () => nav.declare({ type: 'PUN', from: addDays(today, 1), to: addDays(today, 5) }) },
    { t: 'Ιατρικά και ποινές', k: 'ΙΑΤΡΙΚΑ ΠΟΙΝΕΣ ΛΗΞΗ', fn: () => nav.go('records', { recTab: 'med' }) },
    { t: 'Δώσε άδεια', k: 'ΑΔΕΙΑ', fn: () => nav.declare({ type: 'LEAVE' }) },
    { t: 'Δύναμη σήμερα', k: 'ΔΥΝΑΜΗ ΚΑΤΑΣΤΑΣΗ', fn: () => nav.go('strength', { strengthDate: today }) },
    { t: 'Εισαγωγή Δυναμολογίου', k: 'ΕΙΣΑΓΩΓΗ ΔΥΝΑΜΟΛΟΓΙΟ ΕΣΣΟ EXCEL', fn: () => nav.go('templates', { tab: 'import' }) },
    { t: 'Ιστορικό ενεργειών', k: 'ΙΣΤΟΡΙΚΟ ΑΝΑΙΡΕΣΗ', fn: () => nav.go('history') },
    { t: 'Ρυθμίσεις', k: 'ΡΥΘΜΙΣΕΙΣ ΣΤΕΛΕΧΗ ΘΑΛΑΜΟΙ', fn: () => nav.go('templates', { tab: 'settings' }) }
  ];
  const n = norm(dq.trim());
  const acts = ACTIONS.filter(a => !n || a.k.includes(n) || norm(a.t).includes(n));
  const ppl = n ? searchPeople(state.people, dq).slice(0, 6) : [];
  const items: P[] = [...acts.map(a => ({ a })), ...ppl.map(p => ({ p }))];
  useEffect(() => setSel(0), [dq]);
  const runI = (i: number) => { const x = items[i]; if (!x) return; onClose(); if (x.a) x.a.fn(); else nav.openPerson(x.p.id); };
  useEscape(onClose);
  let i = -1;
  return createPortal(html`<div className="ui-overlay" onMouseDown=${(e: any) => { if (e.target === e.currentTarget) onClose(); }}><div className="palette" role="dialog" aria-modal="true" aria-label="Αναζήτηση">
    <input className="ui-input" autoFocus=${true} placeholder="Γράψε επώνυμο ή τι θέλεις να κάνεις (π.χ. «δν», «ποινη»)" value=${q} onChange=${(e: any) => setQ(e.target.value)}
      onKeyDown=${(e: any) => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(items.length - 1, s + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); } else if (e.key === 'Enter') { e.preventDefault(); runI(sel); } }}/>
    <ul className="picker__list" role="listbox">
      ${acts.length > 0 && html`<li className="picker__hd">Ενέργειες</li>`}
      ${acts.map(a => { i++; const j = i; return html`<li key=${a.t} role="option" aria-selected=${sel === j} className="picker__opt" onMouseDown=${(e: any) => { e.preventDefault(); runI(j); }} onMouseEnter=${() => setSel(j)}><div><b>${a.t}</b></div></li>`; })}
      ${ppl.length > 0 && html`<li className="picker__hd">Πρόσωπα</li>`}
      ${ppl.map(p => { i++; const j = i; return html`<li key=${p.id} role="option" aria-selected=${sel === j} className="picker__opt" onMouseDown=${(e: any) => { e.preventDefault(); runI(j); }} onMouseEnter=${() => setSel(j)}><div><b>${fullName(p)}</b><small>του ${p.father} · ${p.rank} · ${unitOf(p)}</small></div><${StatusBadge} statuses=${state.statuses} pid=${p.id} date=${today}/></li>`; })}
      ${!items.length && html`<li className="picker__hd">Δεν βρέθηκε τίποτα για «${q}».</li>`}
    </ul>
    <div className="note" style=${{ padding: '6px 4px 0' }}>↑↓ επιλογή · Enter άνοιγμα · Esc κλείσιμο · ψάχνει χωρίς τόνους και με λατινικά (π.χ. «papad»)</div>
  </div></div>`, document.body);
}

