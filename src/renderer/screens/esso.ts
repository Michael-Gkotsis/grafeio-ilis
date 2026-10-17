// Ρυθμίσεις › ΕΣΣΟ: η τωρινή ΕΣΣΟ, «Νέα ΕΣΣΟ» σε βήματα και «Επαναφορά ΕΣΣΟ» από τον φάκελο του αρχείου της (Michael, 17/10)
import { useEffect, useState } from 'react';
import { html, Alert, Badge, Button, Card, Dialog, Segmented, useToast } from '../ui';
import { useNav, useStore } from '../store';
import { ESSO_SERIES, currentEsso, essoName, nextEsso, parseEsso, type Esso, type EssoSeries } from '../../shared/esso';
import { dmy } from '../../shared/dates';
import type { EssoArchiveInfo, EssoInfo, EssoResult, ImportPreview } from '../../shared/api';
type P = any;

const join = (dir: string, name: string) => dir.replace(/[\\/]+$/, '') + (dir.includes('\\') ? '\\' : '/') + name;
const seriesItems = ESSO_SERIES.map(s => ({ value: s, label: s + '΄' }));
// «2026-08-10 09:12» → «10/08/2026 09:12»
const atTxt = (at: string) => (/^\d{4}-\d{2}-\d{2}/.test(at) ? dmy(at.slice(0, 10)) + at.slice(10) : at);

function EssoFields({ v, onChange, id }: P) {
  return html`<div className="field-row" style=${{ alignItems: 'flex-end' }}>
    <div className="field" style=${{ flex: 'none' }}><span className="field__label">Σειρά</span><${Segmented} value=${v.s} onChange=${(s: EssoSeries) => onChange({ ...v, s })} items=${seriesItems}/></div>
    <div className="field" style=${{ flex: 'none', width: '120px' }}><label className="field__label" htmlFor=${id}>Έτος</label><input id=${id} className="ui-input" type="number" min="2000" max="2100" value=${v.y} onChange=${(e: any) => onChange({ ...v, y: Math.floor(+e.target.value) || v.y })}/></div>
  </div>`;
}

export function EssoCards() {
  const { state, run, today } = useStore(); const toast = useToast();
  const [info, setInfo] = useState<EssoInfo | null>(null);
  const [edit, setEdit] = useState<Esso | null>(null);
  const [wiz, setWiz] = useState(false); const [done, setDone] = useState<Extract<EssoResult, { ok: true }> | null>(null);
  const [restore, setRestore] = useState<EssoArchiveInfo | null>(null);
  const load = () => window.api.essoInfo().then(setInfo, () => setInfo(null));
  useEffect(() => { load(); }, []);
  const cur = currentEsso(state); const own = state.settings.essos;
  const saveEdit = async () => { if (!edit) return; if (await run({ t: 'setSettings', settings: { essos: { ...(own || {}), s: edit.s, y: edit.y } }, text: 'ΕΣΣΟ ' + essoName(edit) })) setEdit(null); };
  const pick = async () => { const r = await window.api.essoPick(); if (!r) return; if ('ok' in r) { toast({ text: r.error }); return; } setRestore(r); };
  return html`<div className="stack">
    <${Card} title="ΕΣΣΟ">
      <dl className="kv"><dt>Τωρινή</dt><dd>${cur ? html`<b>${essoName(cur)}</b>` : html`<span className="muted">δεν έχει οριστεί</span>`}
          ${!own && cur && html` <span className="muted">(από το Δυναμολόγιο)</span>`}${own?.from && html` <span className="muted">· από ${dmy(own.from)}</span>`}
          ${!edit && html` <${Button} variant="link" onClick=${() => setEdit(cur || nextEsso(null, today))}>Διόρθωση<//>`}</dd>
        <dt>Σε δύναμη</dt><dd>${state.people.filter(p => p.active).length} στρατιώτες</dd></dl>
      ${edit && html`<div className="field"><${EssoFields} v=${edit} onChange=${setEdit} id="es-y"/>
        <span className="field__help">Αλλάζει μόνο το όνομα που δείχνει η εφαρμογή (πάνω δεξιά, νέος στρατιώτης, νέα Excel). Για νέα σειρά νεοσυλλέκτων πάτα «Νέα ΕΣΣΟ».</span>
        <div className="toolbar"><${Button} size="sm" onClick=${saveEdit}>Αποθήκευση<//><${Button} size="sm" variant="ghost" onClick=${() => setEdit(null)}>Άκυρο<//></div></div>`}
      <p className="note">Η <b>Νέα ΕΣΣΟ</b> κρατά όλη την τωρινή (βάση, Excel, ιστορικό) σε φάκελο αρχείου, ξεκινά την εφαρμογή χωρίς στρατιώτες και φτιάχνει σε νέο φάκελο τα Excel της νέας ΕΣΣΟ, συνδεδεμένα. Οι ρυθμίσεις, οι υπηρεσίες, οι λίστες, οι αργίες, τα στελέχη και τα templates μένουν.</p>
      <div><${Button} variant="destructive" onClick=${() => setWiz(true)}>Νέα ΕΣΣΟ…<//></div>
    <//>
    <${Card} title="Επαναφορά ΕΣΣΟ" actions=${html`<${Button} size="sm" variant="outline" onClick=${pick}>Διάλεξε φάκελο…<//>`}>
      <p className="note" style=${{ marginTop: 0 }}>Ξαναφορτώνει μια παλιά ΕΣΣΟ από τον φάκελο του αρχείου της (π.χ. «Β΄ ΕΣΣΟ 2026 (έως …)», και από USB). Πριν από αυτό η τωρινή μπαίνει κι αυτή στο αρχείο, για να γυρίσεις πίσω.</p>
      ${!info ? 'Φόρτωση…' : !info.archives.length ? html`<p className="note">Δεν υπάρχει ακόμα αρχείο ΕΣΣΟ. Φτιάχνεται με τη «Νέα ΕΣΣΟ».</p>`
        : html`<ul className="hist">${info.archives.slice(0, 20).map(a => html`<li key=${a.dir}><b>${a.name}</b> <span className="muted">${atTxt(a.at)} · ${a.people} σε δύναμη · ${a.files} Excel</span>
          <${Button} size="sm" variant="ghost" onClick=${() => window.api.essoOpen(a.dir)}>Άνοιξε<//><${Button} size="sm" variant="outline" onClick=${() => setRestore(a)}>Επαναφορά<//></li>`)}</ul>`}
    <//>
    ${wiz && info && html`<${NewEssoWizard} info=${info} onClose=${() => setWiz(false)} onDone=${(r: Extract<EssoResult, { ok: true }>) => { setWiz(false); setDone(r); load(); }}/>`}
    ${done && html`<${EssoDone} r=${done} onClose=${() => setDone(null)}/>`}
    ${restore && html`<${RestoreDialog} a=${restore} onClose=${() => setRestore(null)}/>`}
  </div>`;
}

const STEPS = ['ΕΣΣΟ', 'Αρχείο τωρινής', 'Excel νέας', 'Επιβεβαίωση'];
function NewEssoWizard({ info, onClose, onDone }: P) {
  const { state, refresh, today } = useStore(); const toast = useToast();
  const cur = currentEsso(state);
  const [step, setStep] = useState(1);
  const [e, setE] = useState<Esso>(() => nextEsso(cur, today));
  const [root, setRoot] = useState<string>(info.archiveRoot);
  const [dir, setDir] = useState<string | null>(null);   // δικός σου φάκελος για τη νέα· αλλιώς newRoot\<όνομα>
  const [ros, setRos] = useState<ImportPreview | null>(null);
  const [ack, setAck] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const same = cur && cur.s === e.s && cur.y === e.y;
  const target = dir || join(info.newRoot, essoName(e));
  const rosEsso = ros?.essos ? parseEsso(ros.essos) : null;
  const choose = async (def: string, set: (d: string) => void) => { const d = await window.api.essoDir(def); if (d) set(d); };
  const pickRoster = async () => { const r = await window.api.essoRoster(); if (!r) return; if (!r.ok) { setErr(r.error); return; } setErr(null); setRos(r); };
  const start = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await window.api.essoStart({ esso: { s: e.s, y: e.y }, archiveRoot: root, ...(dir ? { newDir: dir } : {}), ...(ros ? { roster: ros.token } : {}) });
      if (!r.ok) { setErr(r.error); return; }
      await refresh(); toast({ text: 'Ξεκίνησε η ' + essoName(e) }); onDone(r);
    } finally { setBusy(false); }
  };
  const desc = html`${STEPS.map((l, i) => html`<span key=${l}>${i > 0 && ' › '}<span style=${{ fontWeight: step === i + 1 ? 700 : 400 }}>${i + 1} ${l}</span></span>`)}`;
  const back = html`<${Button} variant="outline" disabled=${busy} onClick=${() => { setErr(null); setStep(step - 1); }}>Πίσω<//>`;
  const foot = step === 1 ? html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${() => setStep(2)}>Συνέχεια<//>`
    : step < 4 ? html`${back}<${Button} onClick=${() => setStep(step + 1)}>Συνέχεια<//>`
    : html`${back}<${Button} variant="destructive" disabled=${!ack || busy} onClick=${start}>${busy ? 'Γίνεται…' : 'Ξεκίνα τη ' + essoName(e)}<//>`;
  return html`<${Dialog} title="Νέα ΕΣΣΟ" description=${desc} size="lg" onClose=${busy ? () => {} : onClose} closeOnOverlay=${false} footer=${foot}>
    ${step === 1 && html`
      <div className="field"><span className="field__label">Ποια ΕΣΣΟ ξεκινά;</span><${EssoFields} v=${e} onChange=${setE} id="ne-y"/>
        <span className="field__help">Τωρινή: ${cur ? essoName(cur) : 'δεν έχει οριστεί'}. Προτείνεται η επόμενη.</span></div>
      ${same && html`<${Alert} tone="warn"><span>Είναι η ίδια με την τωρινή. Αν θες μόνο να διορθώσεις το όνομα, κλείσε και πάτα «Διόρθωση».</span><//>`}
      <${Alert} tone="warn"><span><b>Η εφαρμογή θα ξεκινήσει χωρίς στρατιώτες.</b> Φεύγουν οι ${info.people} στρατιώτες της τωρινής ΕΣΣΟ με τις καταστάσεις, τις υπηρεσίες, τις αιτήσεις, την ΗΚΑΙ και το ιστορικό τους. Όλα κρατιούνται πρώτα στο αρχείο (επόμενο βήμα) και ξαναφορτώνονται από την «Επαναφορά ΕΣΣΟ».</span><//>
      <p className="note">Μένουν: κεφαλίδα και μονάδα, υπηρεσίες και κωδικοί, κανόνες, λίστες, Σ.Ι., αργίες, στελέχη, templates εντύπων. Το έντυπο υπηρεσιών ξεκινά από τη ΦΡΟΥΡΑ ΣΒΕΝ.</p>`}
    ${step === 2 && html`
      <div className="field"><span className="field__label">Φάκελος αρχείου ΕΣΣΟ</span>
        <div className="toolbar"><span className="plan__fn" title=${root}>${root}</span><${Button} size="sm" variant="outline" onClick=${() => choose(root, setRoot)}>Άλλαξε…<//></div>
        <span className="field__help">Εκεί φτιάχνεται ο φάκελος «${cur ? essoName(cur) : 'ΕΣΣΟ'} (έως ${dmy(today)})». Για σιγουριά διάλεξε USB ή άλλο δίσκο· αντίγραφο της βάσης κρατιέται και στα αντίγραφα ασφαλείας.</span></div>
      <div className="field"><span className="field__label">Τι μπαίνει στο αρχείο</span>
        <ul className="hist"><li>Η βάση της εφαρμογής (στρατιώτες, καταστάσεις, υπηρεσίες, ΗΚΑΙ, ιστορικό)</li>
          ${info.files.map((f: P) => html`<li key=${f.label + f.file}>${f.label}: <span className="plan__fn" title=${f.file}>${f.file}</span>${!f.exists && html` <${Badge} tone="bad">δεν βρέθηκε<//>`}</li>`)}
          ${!info.files.length && html`<li className="muted">Κανένα Excel δεν είναι συνδεδεμένο.</li>`}</ul>
        <span className="field__help">Τα έντυπα που βγήκαν (ΦΡΟΥΡΑ, ΗΚΑΙ, εξοδούχοι) δεν αντιγράφονται· μένουν εκεί που είναι: ${info.outDirs.join(' · ')}.</span></div>`}
    ${step === 3 && html`
      <div className="field"><span className="field__label">Φάκελος για τα Excel της νέας ΕΣΣΟ</span>
        <div className="toolbar"><span className="plan__fn" title=${target}>${target}</span><${Button} size="sm" variant="outline" onClick=${() => choose(dir || info.newRoot, setDir)}>Άλλαξε…<//>${dir && html`<${Button} size="sm" variant="ghost" onClick=${() => setDir(null)}>Προεπιλογή<//>`}</div>
        <span className="field__help">Γίνεται ο φάκελος των αρχείων: εκεί πηγαίνουν και τα έντυπα που βγάζεις.</span></div>
      <div className="field"><span className="field__label">Δυναμολόγιο</span>
        <${Segmented} value=${ros ? 'file' : 'new'} onChange=${(v: string) => { if (v === 'new') setRos(null); else pickRoster(); }} items=${[{ value: 'new', label: 'Νέο, χωρίς στρατιώτες' }, { value: 'file', label: 'Έχω το Excel της νέας ΕΣΣΟ…' }]}/>
        ${ros ? html`<span className="field__help"><b>${ros.file}</b>: ${ros.active} σε δύναμη από ${ros.total}${ros.essos ? ' · ΕΣΣΟ ' + ros.essos : ''}. Αντιγράφεται στον φάκελο της νέας, οι στρατιώτες μπαίνουν στην εφαρμογή και τα φύλλα που λείπουν (ΤΙΜΩΡΗΜΕΝΟΙ, ΑΔΕΙΕΣ, ΠΟΣΤΑ…) προστίθενται εκεί. <${Button} variant="link" onClick=${pickRoster}>Άλλο αρχείο<//></span>`
          : html`<span className="field__help">Φτιάχνεται κενό ΔΥΝΑΜΟΛΟΓΙΟ ${essoName(e)} με όλα τα φύλλα του. Τους στρατιώτες τους βάζεις μετά με «+ Νέος στρατιώτης» ή με εισαγωγή.</span>`}
        ${ros?.warnings.map(w => html`<${Alert} key=${w} tone="warn"><span>${w}</span><//>`)}
        ${rosEsso && (rosEsso.s !== e.s || rosEsso.y !== e.y) && html`<${Alert} tone="warn"><span>Το αρχείο γράφει ${essoName(rosEsso)}, ενώ διάλεξες ${essoName(e)}. <${Button} variant="link" onClick=${() => setE(rosEsso)}>Κράτα ${essoName(rosEsso)}<//></span><//>`}</div>
      <p className="note">Φτιάχνεται επίσης ο ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ${essoName(e)} με το φύλλο του μήνα. Όλα συνδέονται μόνα τους στα «Αρχεία Excel».</p>`}
    ${step === 4 && html`
      <ul className="hist">
        <li>Ξεκινά η <b>${essoName(e)}</b>${cur ? ' (μετά την ' + essoName(cur) + ')' : ''}.</li>
        <li>Αρχείο της τωρινής στο <span className="plan__fn">${root}</span></li>
        <li>Νέα Excel στο <span className="plan__fn">${target}</span>: ${ros ? ros.file + ' (' + ros.active + ' στρατιώτες)' : 'κενό Δυναμολόγιο'} και έλεγχος υπηρεσιών</li></ul>
      <label className="rule"><input type="checkbox" className="ui-check" checked=${ack} onChange=${(ev: any) => setAck(ev.target.checked)}/><span><b>Κατάλαβα: η εφαρμογή ξεκινά χωρίς τους ${info.people} στρατιώτες της τωρινής ΕΣΣΟ</b><small>Δεν αναιρείται με το «Αναίρεση»· γυρνά πίσω μόνο με την «Επαναφορά ΕΣΣΟ».</small></span></label>`}
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
  <//>`;
}

function EssoDone({ r, onClose }: P) {
  const { state } = useStore(); const nav = useNav(); const name = state.settings.essos ? essoName(state.settings.essos) : 'νέα ΕΣΣΟ';
  const n = state.people.filter(p => p.active).length;
  return html`<${Dialog} title=${'Ξεκίνησε η ' + name} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Κλείσιμο<//><${Button} onClick=${() => { onClose(); nav.go('people'); }}>${n ? 'Στο Δυναμολόγιο (' + n + ')' : 'Στο Δυναμολόγιο: πρόσθεσε στρατιώτες'}<//>`}>
    <dl className="kv"><dt>Αρχείο</dt><dd><span className="plan__fn">${r.archive}</span> <${Button} variant="link" onClick=${() => window.api.essoOpen(r.archive)}>Άνοιξε<//></dd>
      <dt>Φάκελος</dt><dd><span className="plan__fn">${r.dir}</span> <${Button} variant="link" onClick=${() => window.api.essoOpen(r.dir)}>Άνοιξε<//></dd>
      <dt>Excel</dt><dd>${r.files.length ? r.files.map((f: string) => html`<div key=${f}><${Button} variant="link" onClick=${() => window.api.openPath(f)}>${f.split(/[\\/]/).pop()}<//></div>`) : 'κανένα'}</dd></dl>
    ${r.warnings.map((w: string) => html`<${Alert} key=${w} tone="warn"><span>${w}</span><//>`)}
    ${r.warnings.length > 0 && html`<p className="note">Ό,τι δεν φτιάχτηκε το φτιάχνεις από Ρυθμίσεις › Αρχεία Excel › «Νέο αρχείο…».</p>`}
  <//>`;
}

function RestoreDialog({ a, onClose }: P) {
  const { state } = useStore(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const cur = currentEsso(state);
  const go = async () => { setBusy(true); const r = await window.api.essoRestore(a.dir); setBusy(false); if (!r.ok) toast({ text: r.error }); };
  return html`<${Dialog} role="alertdialog" title=${'Επαναφορά: ' + a.name} description=${atTxt(a.at) + ' · ' + a.people + ' σε δύναμη'} onClose=${busy ? () => {} : onClose}
    footer=${html`<${Button} variant="outline" data-autofocus="" disabled=${busy} onClick=${onClose}>Άκυρο<//><${Button} variant="destructive" disabled=${busy} onClick=${go}>${busy ? 'Γίνεται…' : 'Επαναφορά και επανεκκίνηση'}<//>`}>
    <p style=${{ marginTop: 0 }}>Η εφαρμογή θα γυρίσει όπως ήταν στην ${a.name}: στρατιώτες, καταστάσεις, υπηρεσίες, ΗΚΑΙ, ιστορικό και ρυθμίσεις. Τα Excel της ανοίγουν από εκεί που ήταν, ή από τα αντίγραφα του φακέλου αν δεν υπάρχουν πια.</p>
    <p>Πρώτα ${cur ? 'η ' + essoName(cur) : 'η τωρινή ΕΣΣΟ'} μπαίνει κι αυτή στο αρχείο, για να γυρίσεις σε αυτήν με τον ίδιο τρόπο. Η εφαρμογή δεν γράφει μόνη της στα Excel μέχρι να πατήσεις «Ανανέωση από Excel» ή «Ενημέρωση Excel».</p>
  <//>`;
}
