// Δυναμολόγιο άλλης μονάδας: η οθόνη «Αντιστοίχιση…» του Προσωπικού (shared/rosterUnit.ts). Βήματα: Φύλλα · Στήλες · Λέξεις · Δοκιμή.
// Κάθε στήλη, βαθμός, λέξη ΚΑΤΑΣΤΑΣΗ και τιμή ΙΛΗ δείχνει τι νομίζει η εφαρμογή: Σίγουρο · Πρόταση (ένα κλικ «Σωστό») · Δεν το ξέρω.
// Ό,τι μένει άγνωστο δεν διαβάζεται και δεν γράφεται ποτέ στο αρχείο. RosterMapBody: μόνο εμφάνιση· RosterMapDialog: φορτώνει, δοκιμάζει και αποθηκεύει.
import { useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Dialog, Tabs, useToast } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { rosterChanges } from '../../shared/commands';
import { type SourceBinding } from '../../shared/sources';
import { PROFILE_VERSION, type RosterProfile } from '../../shared/tplStore';
import { ROLES, ROLE_LABEL, SHEET_ROLES, buildRosterModel, emptyRos, ownBinding, rosterProfileFrom, rosterProfileOf, rosterTrial, type RosterModel, type Trial, type WordView } from '../../shared/rosterUnit';
import type { TplCreate } from '../../shared/tplMap';
import type { RawSheet } from '../../shared/roster';
type P = any;

export type Step = 'sheets' | 'cols' | 'words' | 'try';
const TONE: Record<string, { tone: string; label: string }> = { sure: { tone: 'ok', label: 'Σίγουρο' }, suggest: { tone: 'warn', label: 'Πρόταση' }, unknown: { tone: 'bad', label: 'Δεν το ξέρω' }, mine: { tone: 'info', label: 'Το όρισες εσύ' }, ignored: { tone: 'outline', label: 'Το αφήνω' } };

// ------------------------------------------------------------------ βήμα 1: φύλλα
function SheetsStep({ model, ros, setRole, setRefill }: P) {
  return html`<div className="tm">
    <p className="tm__help">Διάλεξε ποιο φύλλο είναι ο κύριος κατάλογος και τι είναι τα άλλα. Οι λίστες απόντων / παρόντων βγαίνουν από τον κατάλογο: αν τις τσεκάρεις, η εφαρμογή ξαναγεμίζει μόνο την κατάσταση και την ΙΛΗ των στρατιωτών που έχουν ήδη γραμμή εκεί. Οι σύνοψες και οι τύποι δεν πειράζονται ποτέ.</p>
    <section className="ui-card"><div className="tm__wgrid tm__wgrid--head"><span>Φύλλο του αρχείου</span><span>Τι είναι</span><span></span></div>
      ${model.sheets.map((v: P) => html`<div key=${v.name} className="tm__word"><div className="tm__wgrid">
        <span><b>${v.name}</b> <small className="muted">${v.people} άτομα · ${v.formulas} τύποι${v.hint ? ' · ' + v.hint : ''}</small></span>
        <${Select} className="ui-input" aria-label=${'Τι είναι το φύλλο ' + v.name} value=${v.role} onChange=${(e: P) => setRole(v.name, e.target.value)}>${SHEET_ROLES.map(r => html`<option key=${r.value} value=${r.value}>${r.label}</option>`)}<//>
        <${Badge} tone=${v.role === 'master' || v.auto ? (v.role === 'skip' ? 'outline' : 'ok') : 'info'}>${v.role === 'master' ? 'Κατάλογος' : v.auto ? 'Από το αρχείο' : 'Το όρισες εσύ'}<//></div>
        ${(v.role === 'abs' || v.role === 'pres') && html`<label className="tm__check" style=${{ margin: '0 12px 8px' }}><input type="checkbox" checked=${ros.refill.includes(v.name)} onChange=${(e: P) => setRefill(v.name, e.target.checked)}/> Η εφαρμογή να ξαναγεμίζει αυτή τη λίστα (κατάσταση, ΙΛΗ)</label>`}
      </div>`)}
    </section></div>`;
}

// ------------------------------------------------------------------ βήμα 2: στήλες
function ColsStep({ model, setPick, ros, setOrder }: P) {
  const hasName = model.cols.some((c: P) => c.role === 'name');
  return html`<div className="tm">
    <div className="tm__sum"><${Badge} tone="ok">${model.read?.counts.people ?? 0} άτομα στον κατάλογο<//>${model.read?.counts.vacant ? html`<${Badge} tone="info">${model.read.counts.vacant} θέσεις χωρίς όνομα<//>` : null}</div>
    <p className="tm__help">Πες τι είναι κάθε στήλη. Η κατάσταση είναι πληροφορία (δεν γίνεται κατάσταση με ημερομηνίες). Στήλες που δεν διαλέγεις δεν διαβάζονται και δεν γράφονται ποτέ.</p>
    <section className="ui-card"><div className="tm__wgrid tm__wgrid--head"><span>Στήλη του αρχείου</span><span>Τι είναι</span><span></span></div>
      ${model.cols.map((c: P) => html`<div key=${c.c} className="tm__word"><div className="tm__wgrid">
        <span><b>${c.ref}</b> <code className="tm__code">${c.text}</code></span>
        <${Select} className="ui-input" aria-label=${'Τι είναι η στήλη ' + c.ref} value=${c.role || ''} onChange=${(e: P) => setPick(c, e.target.value)}>
          <option value="">Δεν χρειάζεται (αγνόησέ την)</option>${ROLES.map((r: string) => html`<option key=${r} value=${r}>${(ROLE_LABEL as P)[r]}</option>`)}<//>
        <${Badge} tone=${(c.state === 'unknown' ? TONE.ignored : TONE[c.state]).tone}>${c.state === 'unknown' ? 'Δεν τη διαβάζω' : TONE[c.state].label}<//></div>
        ${c.why && html`<div className="tm__acts" style=${{ margin: '0 12px 6px' }}><small className="muted">${c.why}</small></div>`}
        ${c.state === 'suggest' && c.role && html`<div className="tm__acts" style=${{ margin: '0 12px 8px' }}><${Button} size="sm" onClick=${() => setPick(c, c.role)}>Σωστό: ${(ROLE_LABEL as P)[c.role]}<//></div>`}
      </div>`)}
    </section>
    ${hasName && html`<section className="ui-card"><div className="ui-card__body"><b>Ονοματεπώνυμο σε ένα κελί: ποιο είναι πρώτο;</b>
      <div className="tm__acts"><label className="tm__check"><input type="radio" name="ord" checked=${ros.order === 'last-first'} onChange=${() => setOrder('last-first')}/> Πρώτα το επώνυμο</label>
      <label className="tm__check"><input type="radio" name="ord" checked=${ros.order === 'first-last'} onChange=${() => setOrder('first-last')}/> Πρώτα το όνομα</label></div></div></section>`}
    ${model.issues.map((t: string, i: number) => html`<${Alert} key=${i} tone="warn"><span>${t}</span><//>`)}
  </div>`;
}

// ------------------------------------------------------------------ βήμα 3: λέξεις
function WordRow({ w, opts, set, create, kind }: P) {
  const [open, setOpen] = useState(false); const [name, setName] = useState('');
  const badge = TONE[w.state] || TONE.unknown;
  return html`<div className="tm__word"><div className="tm__wgrid">
    <span><code className="tm__code">${w.text}</code> <small className="muted">${w.n} ${w.n === 1 ? 'φορά' : 'φορές'}</small></span>
    <${Select} className="ui-input" aria-label=${'Τι σημαίνει ' + w.text} value=${w.value} onChange=${(e: P) => set(w, e.target.value)}>
      <option value="">Διάλεξε…</option>
      ${[...new Set(opts.map((o: P) => o.group))].map((g: P) => html`<optgroup key=${g} label=${g}>${opts.filter((o: P) => o.group === g).map((o: P) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}</optgroup>`)}
      ${w.value.startsWith('own:') && html`<option value=${w.value}>${'Νέα: ' + w.value.slice(4)}</option>`}<//>
    <${Badge} tone=${badge.tone}>${badge.label}<//></div>
    ${w.why && (w.state === 'suggest' || w.state === 'unknown') && html`<div className="tm__acts" style=${{ margin: '0 12px 6px' }}><small className="muted">${w.why}</small></div>`}
    ${w.state !== 'sure' && w.state !== 'mine' && html`<div className="tm__acts" style=${{ margin: '0 12px 8px' }}>
      ${w.suggest && html`<${Button} size="sm" onClick=${() => set(w, w.suggest)}>Σωστό: ${w.suggestText}<//>`}
      <${Button} size="sm" variant="outline" onClick=${() => { setOpen(!open); setName(''); }}>Δημιουργία…<//>
      <${Button} size="sm" variant="ghost" onClick=${() => set(w, 'ignore')}>Αγνόησε<//></div>`}
    ${open && html`<div className="tm__mini"><p className="tm__help">${kind === 'sub' ? 'Νέος Λόχος / Ίλα στη λίστα των Ρυθμίσεων για το «' + w.text + '»:' : 'Νέα κατάσταση στη λίστα των Ρυθμίσεων για το «' + w.text + '»:'}</p>
      <input className="ui-input" aria-label="Όνομα" value=${name} onChange=${(e: P) => setName(e.target.value)}/>
      <${Button} disabled=${!name.trim()} onClick=${() => { create(w, name.trim().replace(/\s+/g, ' ')); setOpen(false); }}>Δημιουργία<//></div>`}
  </div>`;
}
function WordsStep({ model, ros, setStatus, setSub, createStatus, createSub, setAsk }: P) {
  const block = (title: string, list: WordView[], opts: P, set: P, create: P, kind: string) => list.length ? html`<section className="ui-card"><div className="ui-card__head"><h2>${title} (${list.length})</h2></div>
    <div className="tm__wgrid tm__wgrid--head"><span>Η λέξη του αρχείου</span><span>Τι σημαίνει</span><span></span></div>
    ${list.map(w => html`<${WordRow} key=${w.key} w=${w} opts=${opts} set=${set} create=${create} kind=${kind}/>`)}</section>` : null;
  return html`<div className="tm">
    <div className="tm__note"><${Alert} tone="info"><span>Ό,τι δεν ξέρει η εφαρμογή δεν το μαντεύει. Οι βαθμοί που δεν ξεχωρίζουν στέλεχος από στρατιώτη ρωτιούνται εδώ· τα στελέχη δεν μπαίνουν στους στρατιώτες.</span><//></div>
    ${model.asks.length > 0 && html`<section className="ui-card"><div className="ui-card__head"><h2>Βαθμοί που ρωτάω (${model.asks.length})</h2></div>
      ${model.asks.map((a: P) => html`<div key=${a.key} className="tm__word"><div className="tm__wgrid"><span><code className="tm__code">${a.rank}</code> <small className="muted">${a.n} γραμμές · ${a.why}</small></span>
        <${Select} className="ui-input" aria-label=${'Ο βαθμός ' + a.rank} value=${a.value} onChange=${(e: P) => setAsk(a.key, e.target.value)}><option value="">Διάλεξε…</option><option value="soldier">Στρατιώτης</option><option value="cadre">Στέλεχος</option><//>
        <${Badge} tone=${a.value ? 'info' : 'bad'}>${a.value ? 'Το όρισες εσύ' : 'Δεν το ξέρω'}<//></div>
        ${!a.value && a.proposal && html`<div className="tm__acts" style=${{ margin: '0 12px 8px' }}><${Button} size="sm" onClick=${() => setAsk(a.key, a.proposal)}>Σωστό: ${a.proposal === 'cadre' ? 'στέλεχος' : 'στρατιώτης'}<//></div>`}</div>`)}</section>`}
    ${block('ΚΑΤΑΣΤΑΣΗ: λέξεις', model.statusWords, model.statusOptions, setStatus, createStatus, 'status')}
    ${block('ΙΛΗ / ΛΟΧΟΣ: τιμές', model.subWords, model.subOptions, setSub, createSub, 'sub')}
    ${!model.statusWords.length && !model.subWords.length && !model.asks.length && html`<p className="note">Δεν υπάρχει κάτι να δεις εδώ.</p>`}
  </div>`;
}

// ------------------------------------------------------------------ βήμα 4: δοκιμή
function TrialStep({ trial }: P) {
  const t: Trial | null = trial; if (!t) return html`<p className="note">Γίνεται η δοκιμή…</p>`;
  return html`<div className="tm">
    <div className="tm__sum"><${Badge} tone="ok">${t.people} άτομα διαβάστηκαν<//><${Badge} tone="info">${t.soldier} στρατιώτες · ${t.cadre} στελέχη<//>${t.asked > 0 && html`<${Badge} tone="bad">${t.asked} περιμένουν απάντηση για τον βαθμό<//>`}<${Badge} tone="outline">${t.vacant} θέσεις χωρίς όνομα<//></div>
    <section className="ui-card"><div className="ui-card__head"><h2>Τι θα διαβαστεί</h2></div><div className="ui-card__body">
      <p className="note">${t.add} νέοι στρατιώτες · ${t.change} με αλλαγές · ${t.same} ίδιοι${t.missing ? ' · ' + t.missing + ' της εφαρμογής δεν είναι στο αρχείο (φαίνονται στο «Τι θα αλλάξει», δεν αλλάζει κάτι χωρίς δική σου επιβεβαίωση)' : ''}</p>
      ${t.status.length > 0 && html`<p className="note">Κατάσταση (πληροφορία): ${t.status.map(s => s.label + ' ' + s.n).join(' · ')}</p>`}
      ${t.unknownStatus.length > 0 && html`<p className="txt-bad">Λέξεις κατάστασης που δεν ξέρω: ${t.unknownStatus.join(', ')}</p>`}
      ${t.unknownSub.length > 0 && html`<p className="txt-bad">Τιμές ΙΛΗ χωρίς Λόχο / Ίλα: ${t.unknownSub.join(', ')} (δεν αλλάζουν)</p>`}
      ${t.noName > 0 && html`<p className="txt-bad">${t.noName} στρατιώτες με ονοματεπώνυμο που δεν χωρίζεται με σιγουριά: δεν διαβάστηκαν</p>`}
      ${t.stopped && html`<p className="note">Η ανάγνωση σταμάτησε: ${t.stopped}</p>`}
    </div></section>
    <section className="ui-card"><div className="ui-card__head"><h2>Τι θα γραφτεί στο αρχείο</h2></div><div className="ui-card__body">
      <p className="note">Μόνο οι στήλες που αντιστοίχισες, μόνο σε γραμμές στρατιωτών που ταιριάζουν και μόνο ό,τι άλλαξε στην εφαρμογή· κελί με δικό σου κείμενο δεν αγγίζεται. Νέος στρατιώτης μπαίνει στην επόμενη κενή αριθμημένη γραμμή. Γραμμές δεν σβήνονται.</p>
      ${t.derived.map((d, i) => html`<p key=${i} className="note">Φύλλο «${d.name}» (${d.role === 'abs' ? 'απόντες' : 'παρόντες'}, ${d.rows} άτομα): ${d.refill ? 'θα ξαναγεμίζει η κατάσταση και η ΙΛΗ' : 'δεν πειράζεται'}</p>`)}
      ${t.warnings.length > 0 && html`<${Alert} tone="warn"><div><b>Προειδοποιήσεις</b><ul className="tm__issues">${t.warnings.slice(0, 6).map((w, i) => html`<li key=${i}>${w}</li>`)}</ul></div><//>`}
    </div></section></div>`;
}

export interface BodyProps {
  model: RosterModel; ros: RosterProfile; step: Step; trial: Trial | null; onStep(s: Step): void;
  setRole(n: string, r: string): void; setRefill(n: string, on: boolean): void; setPick(c: P, r: string): void; setOrder(o: 'last-first' | 'first-last'): void;
  setStatus(w: WordView, v: string): void; setSub(w: WordView, v: string): void; createStatus(w: WordView, n: string): void; createSub(w: WordView, n: string): void; setAsk(k: string, v: string): void;
}
export function RosterMapBody(p: BodyProps) {
  const { model, step } = p;
  if (!model.found) return html`<${Alert} tone="bad"><span>Στο φύλλο δεν βρέθηκε πίνακας με ονόματα. Διάλεξε άλλο φύλλο ως κατάλογο.</span><//>`;
  const need = model.statusWords.filter(w => w.state === 'suggest' || w.state === 'unknown').length + model.subWords.filter(w => w.state === 'suggest' || w.state === 'unknown').length + model.asks.filter(a => !a.value).length;
  const items = [{ value: 'sheets', label: '1. Φύλλα' }, { value: 'cols', label: '2. Στήλες' }, { value: 'words', label: '3. Λέξεις' + (need ? ' · ' + need + ' να δεις' : '') }, { value: 'try', label: '4. Δοκιμή' }];
  return html`<div className="tm"><${Tabs} value=${step} onChange=${p.onStep} items=${items}/>
    ${step === 'sheets' && html`<${SheetsStep} model=${model} ros=${p.ros} setRole=${p.setRole} setRefill=${p.setRefill}/>`}
    ${step === 'cols' && html`<${ColsStep} model=${model} ros=${p.ros} setPick=${p.setPick} setOrder=${p.setOrder}/>`}
    ${step === 'words' && html`<${WordsStep} model=${model} ros=${p.ros} setStatus=${p.setStatus} setSub=${p.setSub} createStatus=${p.createStatus} createSub=${p.createSub} setAsk=${p.setAsk}/>`}
    ${step === 'try' && html`<${TrialStep} trial=${p.trial}/>`}</div>`;
}

// ------------------------------------------------------------------ το παράθυρο
export function RosterMapDialog({ book, b, onClose, onSaved }: { book: { file: string; name: string; sheets: RawSheet[] }; b: Partial<SourceBinding>; onClose(): void; onSaved?(b: SourceBinding): void }) {
  const { state, run, refresh, today } = useStore(); const toast = useToast();
  const saved = rosterProfileOf(state.settings);
  const [ros, setRos] = useState<RosterProfile>(() => saved?.ros ?? emptyRos(b.sheet || ''));
  const [creates, setCreates] = useState<Record<string, TplCreate>>({}); const [step, setStep] = useState<Step>('sheets'); const [dirty, setDirty] = useState(false); const [trial, setTrial] = useState<Trial | null>(null);
  const model = useMemo(() => buildRosterModel({ settings: state.settings, people: state.people, sheets: book.sheets, ros }), [ros, state.settings, state.people, book]);
  const edit = (f: (r: RosterProfile) => RosterProfile) => { setDirty(true); setTrial(null); setRos(f); };
  const setRole = (name: string, role: string) => edit(r => {
    if (role === 'master') return { ...r, sheet: name };
    const roles = { ...r.roles, [name]: role as P }; return { ...r, roles, ...(r.sheet === name ? { sheet: '' } : {}), refill: role === 'abs' || role === 'pres' ? r.refill : r.refill.filter(x => x !== name) };
  });
  const setRefill = (name: string, on: boolean) => edit(r => ({ ...r, refill: on ? [...new Set([...r.refill, name])] : r.refill.filter(x => x !== name) }));
  const setPick = (c: P, role: string) => edit(r => {
    const cols = { ...r.cols }; for (const k of Object.keys(cols)) if (cols[k] === c.text || k === role) delete cols[k];
    const ignore = r.ignore.filter(x => x !== c.text);
    if (role) cols[role] = c.text; else ignore.push(c.text);
    return { ...r, cols, ignore };
  });
  const setOrder = (o: 'last-first' | 'first-last') => edit(r => ({ ...r, order: o }));
  const setStatus = (w: WordView, v: string) => edit(r => ({ ...r, status: { ...r.status, [w.key]: v } }));
  const setSub = (w: WordView, v: string) => edit(r => ({ ...r, subs: { ...r.subs, [w.key]: v } }));
  const createStatus = (w: WordView, n: string) => { setCreates(c => ({ ...c, ['s:' + w.key]: { k: 'leaveKind', name: n, col: '' } })); setStatus(w, 'own:' + n); };
  const createSub = (w: WordView, n: string) => { setCreates(c => ({ ...c, ['b:' + w.key]: { k: 'subUnit', name: n } })); setSub(w, n); };
  const setAsk = (k: string, v: string) => edit(r => { const ranks = { ...r.ranks }; if (v) ranks[k] = v as P; else delete ranks[k]; return { ...r, ranks }; });
  const runTrial = () => { try { setTrial(rosterTrial({ settings: state.settings, sheets: book.sheets, ros: { ...ros, sheet: model.master }, state, rosterChanges })); } catch (e) { toast({ text: String(e instanceof Error ? e.message : e) }); } };
  const goStep = (s: Step) => { setStep(s); if (s === 'try' && !trial && model.found) runTrial(); };
  const save = async () => {
    const prof = rosterProfileFrom(model, ros, saved);
    const r = await run({ t: 'adaptTpl', profile: { ...prof, v: PROFILE_VERSION }, create: Object.values(creates), text: 'Δυναμολόγιο της μονάδας' } as P);
    if ((r as P)?.ok === false) { toast({ text: (r as P).error }); return; }
    const nb = ownBinding(model.read!, book.file, b); const sv = await window.api.srcSave('people', nb); if (!sv.ok) { toast({ text: sv.error }); return; }
    await refresh(); setDirty(false);
    toast({ text: 'Αποθηκεύτηκε. Η εφαρμογή θα διαβάζει και θα γράφει το Δυναμολόγιο με τη δική σου διάταξη.' }); onSaved?.(nb); onClose();
  };
  void today;
  return html`<${Dialog} size="xl" title="Δυναμολόγιο της μονάδας σου: αντιστοίχιση" description=${book.name + ' · κατάλογος «' + model.master + '»'} onClose=${onClose} dirty=${dirty}
    footer=${html`<span className="tm__foot">Ό,τι μένει άγνωστο δεν διαβάζεται και δεν γράφεται στο αρχείο σου.</span>
      <${Button} variant="outline" disabled=${!model.found} onClick=${() => goStep('try')}>Δοκιμή<//>
      <${Button} disabled=${!model.found || model.issues.length > 0 && !model.read?.cols.rank && false} why="Δεν βρέθηκε κατάλογος με ονόματα" onClick=${save}>Αποθήκευση<//>`}>
    <${RosterMapBody} model=${model} ros=${ros} step=${step} trial=${trial} onStep=${goStep} setRole=${setRole} setRefill=${setRefill} setPick=${setPick} setOrder=${setOrder} setStatus=${setStatus} setSub=${setSub} createStatus=${createStatus} createSub=${createSub} setAsk=${setAsk}/>
  <//>`;
}
