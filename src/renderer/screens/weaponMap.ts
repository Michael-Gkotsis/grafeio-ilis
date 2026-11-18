// Αρχείο οπλισμού άλλης μονάδας: η οθόνη «Αντιστοίχιση…» του Μητρώου (shared/weaponUnit.ts). Βήματα: Φύλλα · Στήλες · Λέξεις · Δοκιμή.
// Κάθε φύλλο, στήλη, τύπος, λέξη θέσης και κείμενο κατόχου δείχνει τι νομίζει η εφαρμογή: Σίγουρο · Πρόταση (ένα κλικ «Σωστό») · Δεν το ξέρω.
// Ό,τι μένει άγνωστο δεν μπαίνει στο Μητρώο. Το αρχείο της μονάδας ΔΕΝ αλλάζει ποτέ (μόνο ανάγνωση). WeaponMapBody: μόνο εμφάνιση· WeaponMapDialog: φορτώνει, δοκιμάζει, αποθηκεύει και εισάγει.
import { useMemo, useState } from 'react';
import { html, Alert, Badge, Button, Dialog, Tabs, useToast } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { PROFILE_VERSION, type WeaponProfile } from '../../shared/tplStore';
import { SHEET_ROLE_OPTS, WROLES, WROLE_LABEL, buildWeaponModel, emptyWpn, planWeapons, weaponProfileFrom, weaponProfileOf, type WeaponModel, type WWord } from '../../shared/weaponUnit';
import type { TplCreate } from '../../shared/tplMap';
import type { RawSheet } from '../../shared/roster';
type P = any;

export type Step = 'sheets' | 'cols' | 'words' | 'try';
const TONE: Record<string, { tone: string; label: string }> = { sure: { tone: 'ok', label: 'Σίγουρο' }, suggest: { tone: 'warn', label: 'Πρόταση' }, unknown: { tone: 'bad', label: 'Δεν το ξέρω' }, mine: { tone: 'info', label: 'Το όρισες εσύ' }, ignored: { tone: 'outline', label: 'Το αφήνω' } };

// ------------------------------------------------------------------ βήμα 1: φύλλα
function SheetsStep({ model, setRole, setCat }: P) {
  return html`<div className="tm">
    <p className="tm__help">Διάλεξε ποια φύλλα είναι λίστες οπλισμού. Φύλλα που βγαίνουν από άλλο φύλλο με τύπους (π.χ. απόντων / παρόντων) δεν διαβάζονται και δεν πειράζονται ποτέ. Το αρχείο σου δεν αλλάζει: η εφαρμογή μόνο το διαβάζει.</p>
    <section className="ui-card"><div className="tm__wgrid tm__wgrid--head"><span>Φύλλο του αρχείου</span><span>Τι είναι</span><span></span></div>
      ${model.sheets.map((v: P) => html`<div key=${v.name} className="tm__word"><div className="tm__wgrid">
        <span><b>${v.name}</b> <small className="muted">${v.items} όπλα · ${v.formulas} τύποι${v.hint ? ' · ' + v.hint : ''}</small></span>
        <${Select} className="ui-input" aria-label=${'Τι είναι το φύλλο ' + v.name} value=${v.role} onChange=${(e: P) => setRole(v.name, e.target.value)}>${SHEET_ROLE_OPTS.map(r => html`<option key=${r.value} value=${r.value}>${r.label}</option>`)}<//>
        <${Badge} tone=${v.role === 'skip' ? 'outline' : v.auto ? 'ok' : 'info'}>${v.auto ? 'Από το αρχείο' : 'Το όρισες εσύ'}<//></div>
        ${v.role === 'items' && html`<div className="tm__wgrid" style=${{ margin: '0 12px 8px' }}><span><small className="muted">Κατηγορία του Μητρώου${v.catWhy ? ' · ' + v.catWhy : ''}</small></span>
          <${Select} className="ui-input" aria-label=${'Κατηγορία του φύλλου ' + v.name} value=${v.cat} onChange=${(e: P) => setCat(v.name, e.target.value)}><option value="">Κάθε τύπος μόνος του</option>
            ${model.catOpts.map((o: P) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}<//>
          <${Badge} tone=${(TONE[v.catState] || TONE.unknown).tone}>${v.cat ? (TONE[v.catState] || TONE.unknown).label : 'Δεν το ξέρω'}<//></div>
          ${v.catState === 'suggest' && v.cat && html`<div className="tm__acts" style=${{ margin: '0 12px 8px' }}><${Button} size="sm" onClick=${() => setCat(v.name, v.cat)}>Σωστό: ${model.catOpts.find((o: P) => o.value === v.cat)?.label}<//></div>`}`}
      </div>`)}
    </section></div>`;
}

// ------------------------------------------------------------------ βήμα 2: στήλες
function ColsStep({ model, setPick }: P) {
  return html`<div className="tm">
    <p className="tm__help">Πες τι είναι κάθε στήλη. Στήλες που δεν διαλέγεις δεν διαβάζονται. Οι κάνες των πολυβόλων μπαίνουν στα πεδία «Αριθμός κάνης» και «Εφεδρική κάνη» της κατηγορίας.</p>
    <section className="ui-card"><div className="tm__wgrid tm__wgrid--head"><span>Στήλη του αρχείου</span><span>Τι είναι</span><span></span></div>
      ${model.cols.map((c: P) => html`<div key=${c.key} className="tm__word"><div className="tm__wgrid">
        <span><code className="tm__code">${c.text}</code> <small className="muted">${c.sheets} ${c.sheets === 1 ? 'φύλλο' : 'φύλλα'}</small></span>
        <${Select} className="ui-input" aria-label=${'Τι είναι η στήλη ' + c.text} value=${c.role || ''} onChange=${(e: P) => setPick(c, e.target.value)}>
          <option value="">Δεν χρειάζεται (αγνόησέ την)</option>${WROLES.map((r: string) => html`<option key=${r} value=${r}>${(WROLE_LABEL as P)[r]}</option>`)}<//>
        <${Badge} tone=${(c.state === 'unknown' ? TONE.ignored : TONE[c.state]).tone}>${c.state === 'unknown' ? 'Δεν τη διαβάζω' : TONE[c.state].label}<//></div>
        ${c.why && html`<div className="tm__acts" style=${{ margin: '0 12px 6px' }}><small className="muted">${c.why}</small></div>`}
        ${c.state === 'suggest' && c.role && html`<div className="tm__acts" style=${{ margin: '0 12px 8px' }}><${Button} size="sm" onClick=${() => setPick(c, c.role)}>Σωστό: ${(WROLE_LABEL as P)[c.role]}<//></div>`}
      </div>`)}
    </section>
    ${model.issues.map((t: string, i: number) => html`<${Alert} key=${i} tone="warn"><span>${t}</span><//>`)}
  </div>`;
}

// ------------------------------------------------------------------ βήμα 3: λέξεις
type Grp = { group: string; value: string; label: string };
function WordRow({ w, opts, set, create, kind, catOpts }: P) {
  const [open, setOpen] = useState(false); const [cat, setCat] = useState(''); const [name, setName] = useState('');
  const badge = TONE[w.state] || TONE.unknown;
  const groups = [...new Set(opts.map((o: Grp) => o.group))];
  const can = kind === 'type' ? !!cat && (cat !== 'new' || !!name.trim()) : kind === 'place' ? !!w.value && w.value !== 'ignore' : false;
  return html`<div className="tm__word"><div className="tm__wgrid">
    <span><code className="tm__code">${w.text}</code> <small className="muted">${w.n} ${w.n === 1 ? 'φορά' : 'φορές'}</small></span>
    <${Select} className="ui-input" aria-label=${'Τι σημαίνει ' + w.text} value=${w.value} onChange=${(e: P) => set(w, e.target.value)}>
      <option value="">Διάλεξε…</option>
      ${groups.map((g: P) => html`<optgroup key=${g} label=${g}>${opts.filter((o: Grp) => o.group === g).map((o: Grp) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}</optgroup>`)}
      ${w.value.startsWith('new:') && html`<option value=${w.value}>${'Νέα: ' + w.value.slice(4)}</option>`}<//>
    <${Badge} tone=${badge.tone}>${badge.label}<//></div>
    ${w.why && (w.state === 'suggest' || w.state === 'unknown') && html`<div className="tm__acts" style=${{ margin: '0 12px 6px' }}><small className="muted">${w.why}</small></div>`}
    ${w.state !== 'sure' && w.state !== 'mine' && html`<div className="tm__acts" style=${{ margin: '0 12px 8px' }}>
      ${w.suggest && html`<${Button} size="sm" onClick=${() => set(w, w.suggest)}>Σωστό: ${w.suggestText}<//>`}
      ${(kind === 'type' || kind === 'place') && html`<${Button} size="sm" variant="outline" onClick=${() => { setOpen(!open); setName(''); setCat(''); }}>Δημιουργία…<//>`}
      <${Button} size="sm" variant="ghost" onClick=${() => set(w, 'ignore')}>Αγνόησε<//></div>`}
    ${open && kind === 'type' && html`<div className="tm__mini"><p className="tm__help">Πρόσθεσε τον τύπο «${w.text}» σε κατηγορία στις Ρυθμίσεις:</p>
      <${Select} className="ui-input" aria-label="Κατηγορία" value=${cat} onChange=${(e: P) => setCat(e.target.value)}><option value="">Διάλεξε κατηγορία…</option>${catOpts.map((o: P) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}<option value="new">Νέα κατηγορία…</option><//>
      ${cat === 'new' && html`<input className="ui-input" aria-label="Όνομα νέας κατηγορίας" placeholder="Όνομα κατηγορίας" value=${name} onChange=${(e: P) => setName(e.target.value)}/>`}
      <${Button} disabled=${!can} onClick=${() => { create(w, cat, name.trim().replace(/\s+/g, ' ')); setOpen(false); }}>Δημιουργία<//></div>`}
    ${open && kind === 'place' && html`<div className="tm__mini"><p className="tm__help">Η λέξη «${w.text}» μπαίνει στις λέξεις θέσης των Ρυθμίσεων με το νόημα που διάλεξες πιο πάνω.</p>
      <${Button} disabled=${!can} why=${!can && 'Διάλεξε πρώτα τι σημαίνει'} onClick=${() => { create(w); setOpen(false); }}>Δημιουργία<//></div>`}
  </div>`;
}
function WordsStep({ model, setType, setPlace, setHolder, createType, createPlace }: P) {
  const hold: Grp[] = [{ group: 'Τι είναι', value: 'free', label: 'Κάτοχος που δεν είναι στο Δυναμολόγιο (αχρέωτο, το κείμενο μένει στη σημείωση)' }, { group: 'Τι είναι', value: 'place', label: 'Είναι λέξη θέσης (π.χ. Α.Ο)' }, { group: 'Αγνόησε', value: 'skip', label: 'Μην περάσεις αυτή τη γραμμή' }];
  const block = (title: string, list: WWord[], opts: P, set: P, create: P, kind: string) => list.length ? html`<section className="ui-card"><div className="ui-card__head"><h2>${title} (${list.length})</h2></div>
    <div className="tm__wgrid tm__wgrid--head"><span>Η λέξη του αρχείου</span><span>Τι σημαίνει</span><span></span></div>
    ${list.map(w => html`<${WordRow} key=${w.key} w=${w} opts=${opts} set=${set} create=${create} kind=${kind} catOpts=${model.catOpts}/>`)}</section>` : null;
  const none = !model.typeWords.length && !model.placeWords.length && !model.holderWords.length;
  return html`<div className="tm">
    <div className="tm__note"><${Alert} tone="info"><span>Ό,τι δεν ξέρει η εφαρμογή δεν το μαντεύει: η γραμμή περιμένει απάντηση και δεν μπαίνει στο Μητρώο. «_» ή κενό στο όνομα σημαίνει αχρέωτο.</span><//></div>
    ${block('Τύποι όπλων', model.typeWords, model.catOpts, setType, createType, 'type')}
    ${block('Λέξεις θέσης', model.placeWords, model.meansOpts, setPlace, createPlace, 'place')}
    ${block('Κείμενα στη στήλη ονόματος που δεν είναι άτομα', model.holderWords, hold, setHolder, null, 'holder')}
    ${none && html`<p className="note">Δεν υπάρχει κάτι να δεις εδώ.</p>`}
  </div>`;
}

// ------------------------------------------------------------------ βήμα 4: δοκιμή = «Τι θα αλλάξει»
function TrialStep({ model }: P) {
  const c = model.plan.counts; const lines = model.plan.lines;
  return html`<div className="tm">
    <div className="tm__sum"><${Badge} tone="ok">${c.read} όπλα διαβάστηκαν σε ${c.sheets} φύλλα<//><${Badge} tone="info">${c.primary} κύρια όπλα στο Δυναμολόγιο<//><${Badge} tone="info">${c.assets} νέες εγγραφές Μητρώου (${c.second} με κάτοχο, ${c.unassigned} αχρέωτες)<//>
      <${Badge} tone="outline">${c.same} υπάρχουν ήδη<//>${c.conflicts > 0 && html`<${Badge} tone="bad">${c.conflicts} συγκρούσεις<//>`}${c.dups > 0 && html`<${Badge} tone="warn">${c.dups} διπλοί αριθμοί<//>`}${c.wait > 0 && html`<${Badge} tone="bad">${c.wait} περιμένουν απάντηση<//>`}</div>
    <section className="ui-card"><div className="ui-card__head"><h2>Τι θα αλλάξει στο Μητρώο</h2></div><div className="ui-card__body">
      <p className="note">Δεν αλλάζει τίποτα που υπάρχει ήδη και δεν σβήνεται τίποτα. Το αρχείο σου μένει όπως είναι (μόνο ανάγνωση). Ο κάτοχος βρίσκεται από το ονοματεπώνυμο και τον βαθμό· ό,τι δεν βρέθηκε μπαίνει αχρέωτο με το όνομα στη σημείωση.</p>
      ${c.markedHeldNoName > 0 && html`<p className="note">${c.markedHeldNoName} όπλα γράφονται «ΧΡΕΩΜΕΝΟ» στο αρχείο χωρίς όνομα κατόχου: μπαίνουν αχρέωτα.</p>`}
      ${c.markedFreeButHeld > 0 && html`<p className="note">${c.markedFreeButHeld} όπλα γράφονται «ΑΧΡΕΩΤΟ» αλλά έχουν κάτοχο.</p>`}
      ${c.absent + c.ambiguous + c.rankdiff > 0 && html`<p className="note">Κάτοχοι χωρίς σίγουρη αντιστοίχιση: ${c.absent} δεν βρέθηκαν · ${c.ambiguous} με πολλά άτομα ίδιου ονόματος · ${c.rankdiff} με άλλο βαθμό.</p>`}
      <ul className="tm__issues">${lines.slice(0, 60).map((l: P, i: number) => html`<li key=${i}>${l.text}</li>`)}${lines.length > 60 && html`<li>… και ${lines.length - 60} ακόμα</li>`}</ul>
    </div></section></div>`;
}

export interface BodyProps {
  model: WeaponModel; step: Step; onStep(s: Step): void;
  setRole(n: string, r: string): void; setCat(n: string, c: string): void; setPick(c: P, r: string): void;
  setType(w: WWord, v: string): void; setPlace(w: WWord, v: string): void; setHolder(w: WWord, v: string): void; createType(w: WWord, cat: string, name: string): void; createPlace(w: WWord): void;
}
export function WeaponMapBody(p: BodyProps) {
  const { model, step } = p;
  const need = model.typeWords.filter(w => w.state === 'suggest' || w.state === 'unknown').length + model.placeWords.filter(w => w.state === 'suggest' || w.state === 'unknown').length + model.holderWords.filter(w => w.state === 'unknown').length;
  const items = [{ value: 'sheets', label: '1. Φύλλα' }, { value: 'cols', label: '2. Στήλες' }, { value: 'words', label: '3. Λέξεις' + (need ? ' · ' + need + ' να δεις' : '') }, { value: 'try', label: '4. Δοκιμή' }];
  return html`<div className="tm"><${Tabs} value=${step} onChange=${p.onStep} items=${items}/>
    ${step === 'sheets' && html`<${SheetsStep} model=${model} setRole=${p.setRole} setCat=${p.setCat}/>`}
    ${step === 'cols' && html`<${ColsStep} model=${model} setPick=${p.setPick}/>`}
    ${step === 'words' && html`<${WordsStep} model=${model} setType=${p.setType} setPlace=${p.setPlace} setHolder=${p.setHolder} createType=${p.createType} createPlace=${p.createPlace}/>`}
    ${step === 'try' && html`<${TrialStep} model=${model}/>`}</div>`;
}

// ------------------------------------------------------------------ το παράθυρο
export function WeaponMapDialog({ book, onClose }: { book: { file: string; name: string; sheets: RawSheet[] }; onClose(): void }) {
  const { state, run, today } = useStore(); const toast = useToast();
  const saved = weaponProfileOf(state.settings);
  const [prof, setProf] = useState<WeaponProfile>(() => saved?.wpn ?? emptyWpn());
  const [creates, setCreates] = useState<Record<string, TplCreate>>({}); const [step, setStep] = useState<Step>('sheets'); const [dirty, setDirty] = useState(false); const [ask, setAsk] = useState(false); const [busy, setBusy] = useState(false);
  const model = useMemo(() => buildWeaponModel({ settings: state.settings, people: state.people, cadreList: state.cadreList, sheets: book.sheets, prof, state }), [prof, state, book]);
  const edit = (f: (r: WeaponProfile) => WeaponProfile) => { setDirty(true); setAsk(false); setProf(f); };
  const setRole = (n: string, role: string) => edit(r => ({ ...r, roles: { ...r.roles, [n]: role as P } }));
  const setCat = (n: string, cat: string) => edit(r => { const cats = { ...r.cats }; if (cat) cats[n] = cat; else delete cats[n]; return { ...r, cats }; });
  const setPick = (c: P, role: string) => edit(r => {
    const cols = { ...r.cols }; for (const k of Object.keys(cols)) if (cols[k] === c.text || k === role) delete cols[k];
    const ignore = r.ignore.filter(x => x !== c.text);
    if (role) cols[role] = c.text; else ignore.push(c.text);
    return { ...r, cols, ignore };
  });
  const setType = (w: WWord, v: string) => edit(r => ({ ...r, types: { ...r.types, [w.key]: v } }));
  const setPlace = (w: WWord, v: string) => edit(r => ({ ...r, places: { ...r.places, [w.key]: v } }));
  const setHolder = (w: WWord, v: string) => edit(r => ({ ...r, holders: { ...r.holders, [w.key]: v } }));
  const createType = (w: WWord, cat: string, name: string) => {
    if (cat === 'new') { setCreates(c => ({ ...c, ['a:' + w.key]: { k: 'assetCat', name, kind: 'weapon' }, ['t:' + w.key]: { k: 'assetType', name: w.text, cat: 'new:' + name } })); setType(w, 'new:' + name); }
    else { setCreates(c => ({ ...c, ['t:' + w.key]: { k: 'assetType', name: w.text, cat } })); setType(w, cat); }
  };
  const createPlace = (w: WWord) => { setCreates(c => ({ ...c, ['p:' + w.key]: { k: 'placeWord', name: w.text, means: w.value as P } })); };
  const save = async (): Promise<typeof state | null> => {
    const p = weaponProfileFrom(prof, saved);
    const list = Object.values(creates); const ordered = [...list.filter(x => x.k === 'assetCat'), ...list.filter(x => x.k !== 'assetCat')];
    const s1 = await run({ t: 'adaptTpl', profile: { ...p, v: PROFILE_VERSION }, create: ordered, text: 'Αρχείο οπλισμού της μονάδας' } as P, false);
    if (!s1) return null; setDirty(false); setCreates({}); return s1;
  };
  const doImport = async () => {
    setBusy(true);
    try {
      const s1 = await save(); if (!s1) return;
      const plan = planWeapons({ settings: s1.settings, people: s1.people, cadreList: s1.cadreList, sheets: book.sheets, prof, state: s1 });
      const n = plan.apply.primary.length + plan.apply.assets.length;
      if (!n) { toast({ text: 'Αποθηκεύτηκε. Δεν υπάρχει κάτι νέο να μπει στο Μητρώο.' }); onClose(); return; }
      const s2 = await run({ t: 'importWeapons', apply: plan.apply, source: book.name, date: today } as P, false);
      if (s2) { toast({ text: 'Μπήκαν στο Μητρώο ' + plan.apply.primary.length + ' κύρια όπλα στο Δυναμολόγιο και ' + plan.apply.assets.length + ' νέες εγγραφές. Η αναίρεση τα βγάζει.' }); onClose(); }
    } finally { setBusy(false); }
  };
  const n = model.plan.apply.primary.length + model.plan.apply.assets.length;
  return html`<${Dialog} size="xl" title="Αρχείο οπλισμού της μονάδας σου: αντιστοίχιση" description=${book.name + ' · μόνο ανάγνωση, το αρχείο δεν αλλάζει'} onClose=${onClose} dirty=${dirty}
    footer=${html`<span className="tm__foot">${ask ? 'Να μπουν ' + model.plan.apply.primary.length + ' κύρια όπλα στο Δυναμολόγιο και ' + model.plan.apply.assets.length + ' νέες εγγραφές στο Μητρώο; Δεν αλλάζει και δεν σβήνεται τίποτα που υπάρχει.' : 'Ό,τι μένει άγνωστο δεν μπαίνει στο Μητρώο.'}</span>
      ${ask ? html`<${Button} variant="outline" onClick=${() => setAsk(false)}>Όχι<//><${Button} disabled=${busy} onClick=${doImport}>Ναι, εισαγωγή<//>`
        : html`<${Button} variant="outline" onClick=${() => setStep('try')}>Δοκιμή<//><${Button} variant="outline" disabled=${busy} onClick=${async () => { if (await save()) { toast({ text: 'Αποθηκεύτηκε η αντιστοίχιση.' }); onClose(); } }}>Αποθήκευση αντιστοίχισης<//>
          <${Button} disabled=${!n || busy} why=${!n && 'Δεν υπάρχει κάτι νέο να μπει'} onClick=${() => { setStep('try'); setAsk(true); }}>Εισαγωγή στο Μητρώο…<//>`}`}>
    <${WeaponMapBody} model=${model} step=${step} onStep=${setStep} setRole=${setRole} setCat=${setCat} setPick=${setPick} setType=${setType} setPlace=${setPlace} setHolder=${setHolder} createType=${createType} createPlace=${createPlace}/>
  <//>`;
}
