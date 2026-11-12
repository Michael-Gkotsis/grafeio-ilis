// Σήμερα, ιατρικά/ποινές, δύναμη, ΗΚΑΙ, ιστορικό, templates/εισαγωγή/ρυθμίσεις, αναζήτηση (Ctrl+K)
import { RkName, rkShort } from '../rankName';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Card, PageHeader, Strip, Tabs, useMedia, useToast } from '../ui';
import { Combo, Select } from '../select';
import { useNav, useStore, searchPeople } from '../store';
import { requestLeave, usePending } from '../pending';
import { useNowMin } from '../clock';
import { ActiveFilter, DateBar, ExcelSheet, ExportButton, TemplateNote } from '../common';
import { hkaiFront, hkaiBack } from '../sheets';
import { HK_SECTIONS, hkLvOn, hkOn, hkToggle, type HkaiManual, type HkaiSettings, type HkSection, type HkVehicle, shortName, unitOf, type Person, platoonsOf, platoonShort, roomTxt } from '../../shared/domain';
import { HK_K, HK_A, HK_MANUAL, hkaiCounts, strengthAt } from '../../shared/rules';
import { addDays, dm, dmy, parseD, DOW_GEN } from '../../shared/dates';
import { strengthView, type SvCat, type SvGroup } from '../../shared/strengthView';
import { movesOn, outReason, personLine } from '../../shared/hkaiText';
import { PunTextDialog } from '../widgets/status-lists';
import { ApproveDialog, RequestDialog, RequestsLink } from '../widgets/requests';
import { cadreCountRows, hkRowList, rankTxt } from '../../shared/ranks';
import { UNIT, hkRowLabel, HK } from '../../shared/unit';
import { HkHeadCard, HkRowsButton } from './hkrows';
import { dutyOfficers, orderedCadre } from '../../shared/cadre';

// Deprecated path (Phase 6.0, removed in Phase 7): the dialog moved to widgets/status-lists.
export { PunTextDialog };
// Deprecated path (Phase 6.0, removed in Phase 7): the requests moved to widgets/requests.
export { ApproveDialog, RequestDialog };

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

// Η οθόνη ΗΚΑΙ δείχνει μόνο την ΗΚΑΙ. Οι Ποινές, οι Άδειες και οι Αιτήσεις πήγαν στις «Καταστάσεις» και η Ημερήσια
// Διαταγή έχει δικό της μενού (U5). Οι παλιοί σύνδεσμοι με hkTab περνούν από το app/normalizeRoute.ts.
export function HkaiScreen() { return html`<${HkaiMain}/>`; }
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
// Deprecated path (Phase 6, removed in Phase 7): the screen moved to pages/history.
export { HistoryScreen } from '../pages/history';

// Deprecated path: the command palette moved to src/renderer/app/CommandPalette.tsx. Re-exported so old imports work.
export { CommandPalette } from '../app/CommandPalette';

