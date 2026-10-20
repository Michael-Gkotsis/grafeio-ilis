// Ρυθμίσεις (μενού Ρυθμίσεις): φορτώνεται όταν ανοίξει η οθόνη, για να ανοίγει πιο γρήγορα η εφαρμογή.
import { useEffect, useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Card, Dialog, PageHeader, Segmented, useToast } from '../ui';
import { Select } from '../select';
import { useNav, useStore } from '../store';
import { HoursField, shiftBad, shiftOf, useUsbCopy, type HoursMode } from '../common';
import { normTime } from '../../shared/hours';
import { USB_DAYS, usbDue } from '../../shared/reminders';
import { PHASE_NAME, blocksOf, dutyStartOf, shiftGroups, type Phase, type Settings, type ShiftDef } from '../../shared/domain';
import { AddBlockDialog } from './guard';
import { dmy, dow, greekHolidays } from '../../shared/dates';
import { codeErrors } from '../../shared/codes';
import type { BackupInfo, ImportPreview } from '../../shared/api';
import { usePrefs, type Prefs } from '../prefs';
import { FoldersCard, RosterPreview, SourcesView } from './sources';
import { ListsCard } from './lists';
import { SiCard } from './si';
import { StatCard } from './stat';
import { BrandCard, RoomsCard } from './units';
import { EssoCards } from './esso';
import { cadreCountRows } from '../../shared/ranks';
import { UNIT_KINDS, hkRowLabel, unitKindOf, unitSettingsFor, unitText, type UnitKind, HK } from '../../shared/unit';
import { HkHeadFields, HkRowsButton, HkRowsCard, UnitKindField } from './hkrows';
import { SigEditor } from '../sigs';
import { LayoutDialog } from '../layout';
import { dropSigMoves, moved, type Layout, type LayoutForm } from '../../shared/layout';
import { XL_FONTS, XL_H, XL_LOOK, XL_SIZES, XL_V, sameLook, xlLook, type XlLook } from '../../shared/xlLook';
import { SIG_FORMS, sameSigs, sigDefaults, sigsClean, sigsCustom, sigsSaved, sigsText, type Sig, type SigForm } from '../../shared/sigs';
type P = any;

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

// Γράμματα Excel (Michael, 20/10): γραμματοσειρά, μέγεθος και στοίχιση των κελιών σε ό,τι φτιάχνει η εφαρμογή στο Excel.
// Προεπιλογή Arial 12, στο κέντρο οριζόντια και κάθετα. Τα έντυπα με σταθερή διάταξη και τα δικά σου Excel μένουν όπως είναι.
const lookText = (x: XlLook) => x.font + ' ' + x.sz + ', ' + XL_H.find(o => o.value === x.h)!.label.toLowerCase() + ' / ' + XL_V.find(o => o.value === x.v)!.label.toLowerCase();
function XlLookCard() {
  const { state, run } = useStore(); const toast = useToast();
  const saved = xlLook(state.settings);
  const [x, setX] = useState<XlLook>(saved);
  const changed = !sameLook(x, saved);
  const save = async (v: XlLook) => {
    if (await run({ t: 'setSettings', settings: { xl: v }, text: 'γράμματα Excel: ' + lookText(v) }, false)) { setX(v); toast({ text: 'Αποθηκεύτηκαν τα γράμματα Excel: ' + lookText(v) }); }
  };
  const row = (label: string, help: string, ctl: unknown) => html`<div className="pref"><div><b>${label}</b><small>${help}</small></div>${ctl}</div>`;
  const cell = { fontFamily: x.font === 'Times New Roman' ? '"Times New Roman",serif' : x.font === 'Calibri' ? 'Calibri,Carlito,Arial,sans-serif' : 'Arial,"Liberation Sans",sans-serif', fontSize: x.sz + 'pt', textAlign: x.h, verticalAlign: x.v === 'center' ? 'middle' : x.v, border: '1px solid #9aa0a6', padding: '0 6px', height: (x.sz * 2.6) + 'pt', color: '#202124', background: '#fff' };
  return html`<${Card} title="Γράμματα Excel">
    <p className="note" style=${{ marginTop: 0 }}>Σε ό,τι φτιάχνει η εφαρμογή στο Excel: τα Excel που βγάζεις (Δυναμολόγιο και καταστάσεις, Συνολικό δυναμολόγιο, Στελέχη, Οπλισμός, Έλεγχος υπηρεσιών), τα νέα αρχεία και φύλλα στα <b>Αρχεία Excel</b> (π.χ. Ιατρικά, Ποινές, ΘΑΛΑΜΟΙ, νέος μήνας) και τα πρότυπα του «Φτιάξ' το εδώ» στα Έντυπα (εκεί το μέγεθος το διαλέγεις στο πρότυπο).
      Οι ${HK()}, ΦΡΟΥΡΑ και Εξοδούχοι κρατούν τη διάταξη του εντύπου. Στα δικά σου Excel οι νέες γραμμές παίρνουν τη μορφή της γραμμής από πάνω. Ό,τι δεν χωρά μικραίνει λίγο ή αναδιπλώνεται, για να μην κόβεται.</p>
    ${row('Γραμματοσειρά', 'Υπάρχουν σε κάθε PC με Windows 7.', html`<${Segmented} small=${true} value=${x.font} onChange=${(font: string) => setX({ ...x, font })} items=${XL_FONTS.map(f => ({ value: f, label: f }))}/>`)}
    ${row('Μέγεθος', 'Ο τίτλος του φύλλου βγαίνει 2 μεγέθη μεγαλύτερος.', html`<${Select} className="ui-select" aria-label="Μέγεθος γραμμάτων" value=${String(x.sz)} onChange=${(e: any) => setX({ ...x, sz: +e.target.value })}>${XL_SIZES.map(n => html`<option key=${n} value=${String(n)}>${n}</option>`)}<//>`)}
    ${row('Οριζόντια στοίχιση', 'Στα κελιά του πίνακα και στις επικεφαλίδες. Ο τίτλος μένει στο κέντρο.', html`<${Segmented} small=${true} value=${x.h} onChange=${(h: XlLook['h']) => setX({ ...x, h })} items=${XL_H}/>`)}
    ${row('Κάθετη στοίχιση', 'Πού κάθεται το κείμενο όταν η γραμμή είναι ψηλότερη.', html`<${Segmented} small=${true} value=${x.v} onChange=${(v: XlLook['v']) => setX({ ...x, v })} items=${XL_V}/>`)}
    <div style=${{ overflowX: 'auto', margin: '8px 0 12px' }}><table style=${{ borderCollapse: 'collapse', minWidth: '360px' }} aria-label="Δείγμα"><tbody>
      <tr>${['Α/Α', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ'].map(t => html`<td key=${t} style=${{ ...cell, fontWeight: 700, background: '#d9d9d9' }}>${t}</td>`)}</tr>
      <tr>${['1', 'ΠΑΠΑΔΟΠΟΥΛΟΣ', 'ΓΕΩΡΓΙΟΣ'].map(t => html`<td key=${t} style=${cell}>${t}</td>`)}</tr>
    </tbody></table></div>
    <div className="toolbar"><${Button} disabled=${!changed} onClick=${() => save(x)}>Αποθήκευση<//>
      ${changed && html`<${Button} variant="ghost" onClick=${() => setX(saved)}>Άκυρο<//>`}
      ${!sameLook(x, XL_LOOK) && html`<${Button} variant="ghost" onClick=${() => (sameLook(saved, XL_LOOK) ? setX(XL_LOOK) : save(XL_LOOK))} data-tip=${'Προεπιλογή: ' + lookText(XL_LOOK)}>Προεπιλογή<//>`}</div>
  <//>`;
}

// Υπογραφές ανά έντυπο (Michael, 20/10): όσες θέλεις, από αριστερά προς τα δεξιά. Αλλάζουν και τη στιγμή που βγαίνει
// το έντυπο («Υπογραφές…» δίπλα στο «Βγάλε το Excel»).
const SIG_LABEL = (f: SigForm) => (f === 'hkai' ? HK() : f === 'froura' ? 'ΦΡΟΥΡΑ' : f === 'outs' ? 'Εξοδούχοι' : 'Έντυπα');
function SigsCard() {
  const { state, run, today } = useStore(); const toast = useToast();
  const [form, setForm] = useState<SigForm>('hkai'); const [lay, setLay] = useState(false);
  const lf = form === 'reports' ? null : form as LayoutForm;
  // άλλο πλήθος υπογραφών: οι θέσεις που είχες σύρει για τις υπογραφές δεν ταιριάζουν πια
  const layoutFor = (n: number) => (lf && n !== saved.length && state.settings.layout?.[lf] ? { layout: { ...state.settings.layout, [lf]: dropSigMoves(state.settings.layout[lf]) } } : {});
  const saveLayout = async (l: Layout | undefined) => {
    if (!lf) return; const all = { ...(state.settings.layout || {}) }; if (l) all[lf] = l; else delete all[lf];
    if (await run({ t: 'setSettings', settings: { layout: all }, text: 'θέσεις στο χαρτί: ' + SIG_LABEL(form) }, false)) toast({ text: 'Αποθηκεύτηκαν οι θέσεις: ' + SIG_LABEL(form) });
  };
  const movedAny = !!lf && Object.values(state.settings.layout?.[lf] || {}).some(ms => Object.values(ms).some(moved));
  const [edit, setEdit] = useState<Partial<Record<SigForm, Sig[]>>>({});
  const saved = sigsSaved(state.settings, form); const list = edit[form] ?? saved;
  const changed = !sameSigs(list, saved);
  const setList = (v: Sig[]) => setEdit({ ...edit, [form]: v });
  const save = async () => {
    const v = sigsClean(list);
    if (await run({ t: 'setSettings', settings: { sigs: { ...(state.settings.sigs || {}), [form]: v }, ...layoutFor(v.length) }, text: 'υπογραφές ' + SIG_LABEL(form) + ': ' + sigsText(v) }, false)) { setEdit({ ...edit, [form]: undefined }); toast({ text: 'Αποθηκεύτηκαν οι υπογραφές: ' + SIG_LABEL(form) }); }
  };
  const reset = async () => {
    const all = { ...(state.settings.sigs || {}) }; delete all[form];
    if (await run({ t: 'setSettings', settings: { sigs: all, ...layoutFor(sigDefaults(state.settings, form).length) }, text: 'υπογραφές ' + SIG_LABEL(form) + ': όπως το έντυπο' }, false)) { setEdit({ ...edit, [form]: undefined }); toast({ text: 'Οι υπογραφές ' + SIG_LABEL(form) + ' είναι πάλι όπως το έντυπο' }); }
  };
  return html`<${Card} title="Υπογραφές" actions=${html`<${Segmented} small=${true} value=${form} onChange=${setForm} items=${SIG_FORMS.map(f => ({ value: f, label: SIG_LABEL(f) + (edit[f] && !sameSigs(edit[f]!, sigsSaved(state.settings, f)) ? ' •' : '') }))}/>`}>
    <p className="note" style=${{ marginTop: 0 }}>Με τη σειρά που φαίνονται στο χαρτί, από αριστερά προς τα δεξιά. Οι λέξεις της μονάδας αλλάζουν μόνες τους όταν αλλάζει ο τύπος της (π.χ. ΔΚΤΗΣ ΙΛΗΣ → ΔΚΤΗΣ ΛΟΧΟΥ). Το όνομα γράφεται λίγο πιο κάτω, για να χωρά η υπογραφή.
      ${form === 'reports' ? ' Στα Έντυπα μπαίνουν όπου έχει {ΥΠΟΓΡΑΦΕΣ} (στο «Φτιάξ\' το εδώ»: «Υπογραφές: Ναι»), εκτός αν το έντυπο έχει δικές του.' : ' Για μία φορά μόνο: «Υπογραφές…» δίπλα στο «Βγάλε το Excel».'}</p>
    <${SigEditor} value=${list} onChange=${setList} id=${'sg-' + form}/>
    <div className="toolbar" style=${{ marginTop: '12px' }}><${Button} disabled=${!changed} onClick=${save}>Αποθήκευση<//>
      ${changed && html`<${Button} variant="ghost" onClick=${() => setEdit({ ...edit, [form]: undefined })}>Άκυρο<//>`}
      ${(sigsCustom(state.settings, form) || changed) && html`<${Button} variant="ghost" onClick=${reset} data-tip=${'Όπως το έντυπο: ' + sigsText(sigDefaults(state.settings, form))}>Όπως το έντυπο<//>`}
      ${lf ? html`<${Button} variant="outline" style=${{ marginLeft: 'auto' }} onClick=${() => setLay(true)} data-tip="Σύρε κεφαλίδα, ημερομηνία και υπογραφές όπου θέλεις πάνω στο χαρτί">Θέσεις στο χαρτί…${movedAny ? ' •' : ''}<//>` : html`<span className="muted" style=${{ marginLeft: 'auto', fontSize: '13px' }}>Θέσεις στο χαρτί: σε κάθε έντυπο, από το «Υπογραφές…»</span>`}</div>
    ${lay && lf && html`<${LayoutDialog} title=${SIG_LABEL(form)} sigs=${sigsClean(list)} initial=${state.settings.layout?.[lf]} onClose=${() => setLay(false)} onSave=${saveLayout}
      req=${(l: Layout) => ({ form: lf, date: today, sigs: changed ? sigsClean(list) : undefined, layout: l })}/>`}
  <//>`;
}

// Υπηρεσίες ανά έντυπο (ΣΒΕΝ/ΣΠΕΝ): ενεργές ή όχι (Michael, 20/10), ένοπλες ή άοπλες (Κ-Υ1), νέες υπηρεσίες
function BlocksCard() {
  const { state, run } = useStore();
  const [phase, setPhase] = useState<Phase>(state.settings.phase || 'sven'); const [add, setAdd] = useState(false); const [ed, setEd] = useState<string | null>(null);
  const list = blocksOf(state.settings, phase) || [];
  const bad = useMemo(() => codeErrors(state.settings), [state.settings]);
  return html`<${Card} title="Υπηρεσίες" actions=${html`<${Segmented} small=${true} value=${phase} onChange=${setPhase} items=${[{ value: 'sven', label: 'ΣΒΕΝ' }, { value: 'spen', label: 'ΣΠΕΝ' }]}/>`}>
    ${bad.length > 0 && html`<${Alert} tone="warn"><span><b>Κωδικοί που θέλουν διόρθωση</b> (Επεξεργασία στην υπηρεσία τους): ${bad.join(' · ')}</span><//>`}
    <p className="note" style=${{ marginTop: 0 }}>Τώρα ισχύει η <b>ΦΡΟΥΡΑ ${PHASE_NAME[state.settings.phase || 'sven']}</b> (αλλάζει από τις Υπηρεσίες). Σε ένοπλη θέση δεν μπαίνει όποιος έχει ΕΑ, ΕΥ, ΕΟ, ΝΟΣ ή ΣΤΕΠ.</p>
    ${list.map(b => { const ps = b.posts.filter(x => !x.hidden); const ly = b.kind === 'ly';
      return html`<div key=${b.id} className="rule" style=${{ alignItems: 'center', padding: '3px 0' }}><span style=${{ flex: 1, ...(b.hidden ? { opacity: 0.6 } : {}) }}><b>${b.name}</b><small>${ps.length} ${ps.length === 1 ? 'θέση' : 'θέσεις'} · ${b.hidden ? 'ανενεργή' : b.armed ? 'ένοπλη' : 'άοπλη'}${b.custom ? ' · δική σου' : ''} · κωδικοί ${ps.map(x => x.code || '?').join(', ')}</small></span>
      <label className="ui-checkrow" data-tip=${ly ? 'Ο Λ/Υ και ο Δ/Υ μένουν πάντα ενεργοί (χρειάζονται στην ΗΚΑΙ)' : b.hidden ? 'Ανενεργή: δεν μπαίνει στις θέσεις, στην αυτόματη συμπλήρωση και στο έντυπο. Οι υπηρεσίες που έγιναν μένουν στον έλεγχο υπηρεσιών. Τσέκαρε για να ξαναμπεί.' : 'Ξετσέκαρε για να μη μπαίνει πια στις θέσεις, στην αυτόματη συμπλήρωση και στο έντυπο, χωρίς να σβηστεί. Οι υπηρεσίες που έγιναν μένουν στον έλεγχο υπηρεσιών.'}><input type="checkbox" className="ui-check" aria-label=${'Ενεργή: ' + b.name} disabled=${ly} checked=${!b.hidden} onChange=${(e: any) => run({ t: 'setBlock', phase, id: b.id, patch: { hidden: !e.target.checked } })}/> Ενεργή</label>
      <label className="ui-checkrow" data-tip=${ly ? undefined : 'Σε ένοπλη θέση δεν μπαίνουν ΕΑ, ΕΥ, ΕΟ, ΝΟΣ, ΣΤΕΠ, ούτε οι άοπλοι (Σ.Ι.)'}><input type="checkbox" className="ui-check" aria-label=${'Ένοπλη: ' + b.name} disabled=${b.hidden || ly} checked=${b.armed} onChange=${(e: any) => run({ t: 'setBlock', phase, id: b.id, patch: { armed: e.target.checked } })}/> Ένοπλη</label>
      <span style=${{ display: 'flex', ...(ly || b.hidden ? { visibility: 'hidden' } : {}) }}><${Button} size="sm" variant="ghost" aria-label=${'Πιο πάνω: ' + b.name} data-tip="Πιο πάνω (μπαίνει νωρίτερα στην αυτόματη συμπλήρωση)" onClick=${() => run({ t: 'editBlock', phase, id: b.id, name: b.name, n: 0, hrs: {}, move: -1 })}>↑<//><${Button} size="sm" variant="ghost" onClick=${() => setEd(b.id)}>Επεξεργασία<//></span></div>`; })}
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
  // Ώρες (Michael, 20/10): όλη μέρα, ίδιες ώρες για κάθε θέση, ή βάρδιες. Οι υπηρεσίες του εντύπου με νούμερα
  // (θαλαμοφύλακες, οπλοφύλακες, σκοποί) έχουν πάντα βάρδιες· οι 2 ώρες από την αρχή της υπηρεσίας είναι οι βάρδιες του εντύπου.
  const rotB = b.posts.some((x: P) => x.rot != null); const start = dutyStartOf(state.settings);
  const [mode, setMode] = useState<HoursMode>(rotB || b.shift ? 'shift' : shown.some((x: P) => x.hrs && x.hrs !== 'ημέρα') ? 'fixed' : 'day');
  const [sh, setSh] = useState(() => ({ every: b.shift?.every || 120, from: b.shift?.from || '', to: b.shift?.to || '' }));
  // νούμερα: 1ος, 2ος… (σκοποί: 3η, 4η σκοπιά)
  const labels = b.custom || !rotB ? Array.from({ length: b.custom ? n : shown.length }, (_, i) => (i + 1) + 'ος') : shiftGroups(b).map(k => (+k.slice(1) + 1) + (b.kind === 'sk' ? 'η' : 'ος'));
  const shiftOut = (): ShiftDef | null => (mode !== 'shift' ? null : rotB && sh.every === 120 && !normTime(sh.from) && !normTime(sh.to) ? null : shiftOf(sh));
  const save = async () => { const h = mode === 'day' ? Object.fromEntries(Object.keys(hrs).map(k => [k, ''])) : hrs; if (await run({ t: 'editBlock', phase, id: b.id, name, n, hrs: h, codes, shift: shiftOut() }, false)) { onClose(); toast({ text: 'Αποθηκεύτηκε: ' + (b.custom ? name : b.name) }); } };
  return html`<${Dialog} title=${'Επεξεργασία: ' + b.name} description=${b.custom ? 'Δική σου υπηρεσία: αλλάζουν όνομα, πλήθος και ώρες.' : 'Υπηρεσία του εντύπου: οι θέσεις είναι σταθερές· αλλάζουν οι κωδικοί και οι ώρες.'} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${errs.length > 0 || (mode === 'shift' && shiftBad(sh))} onClick=${save}>Αποθήκευση<//>`}>
    ${b.custom && html`<div className="field-row"><div className="field"><label className="field__label" htmlFor="eb-n">Όνομα</label><input id="eb-n" className="ui-input" value=${name} onChange=${(e: any) => setName(e.target.value)}/></div>
      <div className="field"><label className="field__label" htmlFor="eb-c">Πόσα άτομα</label><input id="eb-c" type="number" min="1" max="10" className="ui-input" value=${n} onChange=${(e: any) => setN(Math.max(1, Math.min(10, +e.target.value || 1)))}/><span className="field__help">Όσες θέσεις φύγουν κρατούν το ιστορικό τους.</span></div></div>`}
    <div className="field"><span className="field__label">Κωδικός στον έλεγχο υπηρεσιών</span><div className="settings-grid">${coded.map((x: P) => html`<label key=${x.k} className="field"><span className="field__help">${x.label}</span><input className="ui-input" maxLength="8" value=${codes[x.k] ?? ''} placeholder="αυτόματα" onChange=${(e: any) => setCodes({ ...codes, [x.k]: e.target.value })}/></label>`)}</div>
      <span className="field__help">Αυτό γράφεται στο κελί της μέρας (π.χ. Θ1α) και έτσι διαβάζεται πίσω. Το σκέτο γράμμα (Θ, Μ, Σ) σημαίνει υπηρεσία χωρίς θέση.${b.custom ? ' Νέες θέσεις παίρνουν μόνες τους κωδικό.' : ''}</span>
      ${errs.map((t: string) => html`<${Alert} key=${t} tone="bad"><span>${t}</span><//>`)}
      ${others.length > 0 && html`<${Alert} tone="warn"><span>Σε άλλες υπηρεσίες (δεν εμποδίζει την αποθήκευση): ${others.join(' · ')}</span><//>`}</div>
    ${b.kind !== 'ly' && html`<${HoursField} id="eb" mode=${mode} setMode=${setMode} sh=${sh} setSh=${setSh} labels=${labels} rot=${rotB} start=${start}
      fixed=${shown.map((x: P) => html`<div key=${x.k} className="field"><label className="field__help" htmlFor=${'eb-h-' + x.k}>${x.label}</label><input id=${'eb-h-' + x.k} className="ui-input" placeholder="π.χ. 07:30-08:00" value=${hrs[x.k] || ''} onChange=${(e: any) => setHrs({ ...hrs, [x.k]: e.target.value })}/></div>`)}/>`}
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
const SET_SECTIONS: [string, string][] = [['unit', 'Μονάδα και έντυπα'], ['rooms', 'Θάλαμοι και ουλαμοί'], ['duty', 'Υπηρεσίες και αργίες'], ['lists', 'Λίστες'], ['import', 'Εισαγωγή Δυναμολογίου'], ['files', 'Αρχεία Excel'], ['templates', 'Templates'], ['excel', 'Γράμματα Excel'], ['look', 'Εμφάνιση'], ['esso', 'ΕΣΣΟ'], ['backup', 'Αντίγραφα ασφαλείας']];
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
  const body = tab === 'unit' ? html`<div className="stack"><${SettingsCard}/><${SigsCard}/><${HkRowsCard}/></div>` : tab === 'rooms' ? html`<${RoomsCard}/>` : tab === 'duty' ? html`<div className="stack"><${BlocksCard}/><${SiCard}/><${StatCard}/><${HolidaysCard}/></div>`
    : tab === 'lists' ? html`<${ListsCard}/>` : tab === 'import' ? html`<${ImportCard}/>` : tab === 'files' ? html`<div className="stack"><${SourcesView}/><${FoldersCard}/></div>`
    : tab === 'excel' ? html`<${XlLookCard}/>` : tab === 'look' ? html`<div className="stack"><${BrandCard}/><${AppearanceCard}/></div>` : tab === 'backup' ? html`<${BackupsCard}/>` : tab === 'esso' ? html`<${EssoCards}/>` : templates;
  return html`<div>
    <${PageHeader} title="Ρυθμίσεις" sub="Η μονάδα, οι υπηρεσίες, οι λίστες, τα αρχεία Excel και τα έντυπα που συμπληρώνει η εφαρμογή."/>
    <div className="setgrid">
      <nav className="setnav" aria-label="Ρυθμίσεις">${SET_SECTIONS.map(([k, l]) => html`<button key=${k} type="button" aria-current=${tab === k ? 'page' : undefined} onClick=${() => nav.set({ tab: k })}>${l}</button>`)}</nav>
      <div className="setbody">${body}</div>
    </div>
  </div>`;
}
