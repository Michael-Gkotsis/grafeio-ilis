// Έλεγχος υπηρεσιών άλλης μονάδας: η οθόνη «Αντιστοίχιση…» (shared/dutyGrid.ts). Βήματα: Στήλες · Λέξεις · Δοκιμή.
// Κάθε κωδικός που γράφει η μονάδα στα κελιά των ημερών δείχνει τι νομίζει η εφαρμογή: Σίγουρο (πράσινο) · Πρόταση (ένα κλικ «Σωστό») ·
// Δεν το ξέρω (διαλέγεις από λίστα, ή «Δημιουργία» νέας υπηρεσίας / κατάστασης). Ό,τι μένει άγνωστο δεν διαβάζεται και δεν πατιέται ποτέ στο Excel.
// DutyMapBody: μόνο εμφάνιση· DutyMapDialog: φορτώνει το αρχείο, δοκιμάζει και αποθηκεύει το προφίλ (εντολή adaptTpl) και την αντιστοίχιση.
import { useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Dialog, Tabs, useToast } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { apply } from '../../shared/commands';
import { colLetter, type SourceBinding } from '../../shared/sources';
import { dutyProfileOf } from '../../shared/dutyUnit';
import { NEW_PREFIX, ROLES, ROLE_LABEL, buildDutyModel, colsByRole, dutyProfileFrom, dutyTrial, meaningOf, type CodeView, type DutyModel, type Role, type Trial } from '../../shared/dutyGrid';
import { buildLexicon } from '../../shared/lexicon';
import { profilesOf, type DutyMeaning } from '../../shared/tplStore';
import type { TplCreate } from '../../shared/tplMap';
import type { AppState } from '../../shared/domain';
import type { RawSheet } from '../../shared/roster';
type P = any;

export type Step = 'cols' | 'words' | 'try';
const TONE: Record<string, { tone: string; label: string }> = { sure: { tone: 'ok', label: 'Σίγουρο' }, suggest: { tone: 'warn', label: 'Πρόταση' }, unknown: { tone: 'bad', label: 'Δεν το ξέρω' }, mine: { tone: 'info', label: 'Το όρισες εσύ' }, ignored: { tone: 'outline', label: 'Το αφήνω' } };

// ------------------------------------------------------------------ βήμα 1: οι στήλες
function ColsStep({ model, picks, setPick }: P) {
  const g = model.grid as NonNullable<DutyModel['grid']>;
  const left = model.cols.filter((c: P) => c.c < g.d1);
  return html`<div className="tm">
    <div className="tm__sum"><${Badge} tone="ok">${g.days} μέρες (στήλες ${colLetter(g.d1)}–${colLetter(g.dayCols[g.dayCols.length - 1])})<//><${Badge} tone="ok">${g.rows.length} γραμμές ατόμων<//>${model.month ? html`<${Badge} tone="info">μήνας ${model.month}<//>` : html`<${Badge} tone="warn">ο μήνας δεν γράφεται στον τίτλο<//>`}</div>
    <p className="tm__help">Πες ποια στήλη είναι το όνομα, ποια ο Α/Α κ.λπ. Οι στήλες μετά τις μέρες (σύνολα, άδειες, τύποι) δεν διαβάζονται και δεν γράφονται ποτέ.</p>
    <section className="ui-card"><div className="tm__wgrid tm__wgrid--head"><span>Στήλη του αρχείου</span><span>Τι είναι</span><span></span></div>
      ${left.map((c: P) => {
        const now: Role | '' = c.c in picks ? picks[c.c] : (c.role || '');
        const st = c.c in picks ? 'mine' : c.role ? (c.sure ? 'sure' : 'suggest') : 'unknown';
        return html`<div key=${c.c} className="tm__word"><div className="tm__wgrid">
          <span><b>${c.ref}</b> <code className="tm__code">${c.text}</code></span>
          <${Select} className="ui-input" aria-label=${'Τι είναι η στήλη ' + c.ref} value=${now} onChange=${(e: P) => setPick(c.c, e.target.value)}>
            <option value="">Δεν χρειάζεται (αγνόησέ την)</option>${ROLES.map((r: Role) => html`<option key=${r} value=${r}>${ROLE_LABEL[r]}</option>`)}<//>
          <${Badge} tone=${(st === 'unknown' ? TONE.ignored : TONE[st]).tone}>${st === 'unknown' ? 'Δεν τη διαβάζω' : TONE[st].label}<//></div></div>`;
      })}
    </section>
    ${model.cols.some((c: P) => c.c > g.d1) && html`<p className="tm__help">Αγνοούνται (μετά τις μέρες): ${model.cols.filter((c: P) => c.c > g.d1).map((c: P) => c.ref + ' ' + c.text).join(' · ')}</p>`}
  </div>`;
}

// ------------------------------------------------------------------ βήμα 2: οι λέξεις (κωδικοί)
function CodeRow({ v, opts, now, setChoice, setCreate, create }: P) {
  const [open, setOpen] = useState(false); const [kind, setKind] = useState<'service' | 'status'>('service'); const [name, setName] = useState('');
  const st = now.state; const badge = TONE[st] || TONE.unknown;
  return html`<div className="tm__word"><div className="tm__wgrid">
    <span><code className="tm__code">${v.text}</code> <small className="muted">${v.n} ${v.n === 1 ? 'φορά' : 'φορές'}</small></span>
    <${Select} className="ui-input" aria-label=${'Τι σημαίνει ο κωδικός ' + v.text} value=${create ? '' : now.value} onChange=${(e: P) => setChoice(v, e.target.value)}>
      <option value="">${create ? (create.k === 'service' ? 'Νέα υπηρεσία: ' + create.name : 'Νέα κατάσταση: ' + create.name) : 'Διάλεξε…'}</option>
      ${[...new Set(opts.map((o: P) => o.group))].map((g: P) => html`<optgroup key=${g} label=${g}>${opts.filter((o: P) => o.group === g).map((o: P) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}</optgroup>`)}<//>
    <${Badge} tone=${badge.tone}>${badge.label}<//></div>
    ${v.why && (st === 'suggest' || st === 'unknown') && html`<div className="tm__acts" style=${{ margin: '0 12px 6px' }}><small className="muted">${v.why}</small></div>`}
    ${st !== 'sure' && st !== 'mine' && html`<div className="tm__acts" style=${{ margin: '0 12px 8px' }}>
      ${v.suggest && html`<${Button} size="sm" onClick=${() => setChoice(v, v.suggest)}>Σωστό: ${v.suggestText}<//>`}
      <${Button} size="sm" variant="outline" onClick=${() => { setOpen(!open); setName(''); }}>Δημιουργία…<//>
      <${Button} size="sm" variant="ghost" onClick=${() => setChoice(v, 'ignore')}>Αγνόησε<//></div>`}
    ${open && html`<div className="tm__mini"><p className="tm__help">Το «${v.text}» είναι:</p>
      <div className="tm__acts"><label className="tm__check"><input type="radio" name=${'k' + v.key} checked=${kind === 'service'} onChange=${() => setKind('service')}/> Νέα υπηρεσία (μπαίνει στις δυνατότητες υπηρεσιών, ανενεργή μέχρι να τη ρυθμίσεις)</label>
        <label className="tm__check"><input type="radio" name=${'k' + v.key} checked=${kind === 'status'} onChange=${() => setKind('status')}/> Νέα κατάσταση (όχι υπηρεσία)</label></div>
      <input className="ui-input" aria-label="Όνομα" placeholder=${kind === 'service' ? 'π.χ. Πύλη 2' : 'π.χ. Μετάθεση'} value=${name} onChange=${(e: P) => setName(e.target.value)}/>
      <${Button} disabled=${!name.trim()} onClick=${() => { setCreate(v, kind, name.trim().replace(/\s+/g, ' ')); setOpen(false); }}>Δημιουργία<//></div>`}
  </div>`;
}
function WordsStep({ model, now, setChoice, setCreate, creates }: P) {
  const need = model.codes.filter((c: CodeView) => ['suggest', 'unknown'].includes(now(c).state) && !creates[c.key]);
  const done = model.codes.filter((c: CodeView) => !need.includes(c));
  const block = (title: string, list: CodeView[]) => list.length ? html`<section className="ui-card"><div className="ui-card__head"><h2>${title} (${list.length})</h2></div>
    <div className="tm__wgrid tm__wgrid--head"><span>Ο κωδικός του αρχείου</span><span>Τι σημαίνει</span><span></span></div>
    ${list.map((v: CodeView) => html`<${CodeRow} key=${v.key} v=${v} opts=${model.options} now=${now(v)} setChoice=${setChoice} setCreate=${setCreate} create=${creates[v.key]}/>`)}</section>` : null;
  return html`<div className="tm">
    <div className="tm__note"><${Alert} tone="info"><span>Η εφαρμογή διαβάζει και γράφει <b>μόνο</b> τους κωδικούς που ξέρει τι σημαίνουν. Όταν γράφει υπηρεσίες στο αρχείο σου, γράφει τους δικούς σου κωδικούς, μόνο στα κελιά των ημερών και ποτέ πάνω σε κείμενο ή άδεια που έχεις γράψει εσύ.</span><//></div>
    ${block('Να τους δεις', need)}${block('Έτοιμοι', done)}
    ${!model.codes.length && html`<p className="note">Δεν βρέθηκαν κωδικοί στα κελιά των ημερών.</p>`}
    ${model.vocab.numbers > 0 && html`<p className="note">${model.vocab.numbers} κελιά έχουν μόνο αριθμό: μένουν όπως είναι και δεν διαβάζονται ως υπηρεσίες.</p>`}
  </div>`;
}

// ------------------------------------------------------------------ βήμα 3: δοκιμή
function TrialStep({ trial }: P) {
  const t: Trial | null = trial; if (!t) return html`<p className="note">Γίνεται η δοκιμή…</p>`;
  return html`<div className="tm">
    <div className="tm__sum"><${Badge} tone=${t.people.matched === t.people.rows ? 'ok' : 'warn'}>${t.people.matched} από ${t.people.rows} άτομα βρέθηκαν στην εφαρμογή<//>
      <${Badge} tone="info">${t.days} μέρες · ${t.cells} κελιά με κάτι γραμμένο<//>${t.numbers > 0 && html`<${Badge} tone="outline">${t.numbers} κελιά με αριθμό: δεν διαβάζονται<//>`}</div>
    ${!t.month && html`<${Alert} tone="warn"><span>Δεν βρέθηκε ο μήνας στον τίτλο του φύλλου: διάλεξέ τον όταν πατήσεις «Ανανέωση από Excel». Δεν μπορεί να γίνει δοκιμή ανάγνωσης και εγγραφής χωρίς μήνα.</span><//>`}
    <div className="tm__cols">
      <section className="ui-card tm__half"><div className="ui-card__head"><h2>Τι σημαίνουν τα κελιά</h2></div><div className="ui-card__body">
        ${t.meanings.length ? html`<ul className="tm__issues">${t.meanings.map((m: P) => html`<li key=${m.label}>${m.label}: ${m.n}</li>`)}</ul>` : html`<p className="note">Κανένας κωδικός ακόμα.</p>`}
        ${t.read.unknown.length > 0 && html`<p className="txt-bad">Δεν διαβάζονται (άγνωστοι κωδικοί): ${t.read.unknown.slice(0, 12).join(', ')}${t.read.unknown.length > 12 ? '…' : ''}</p>`}
      </div></section>
      <section className="ui-card tm__half"><div className="ui-card__head"><h2>Τι θα διαβαστεί</h2></div><div className="ui-card__body">
        <p className="note">${t.read.adds} υπηρεσίες περνούν στην εφαρμογή · ${t.read.same} μέρες ίδιες${t.read.future ? ' · ' + t.read.future + ' μέλλουσες (δεν περνούν)' : ''}${t.read.errors ? ' · ' + t.read.errors + ' μέρες με λάθος' : ''}</p>
        ${t.people.unmatched.length > 0 && html`<h3 className="tm__h3">Γραμμές χωρίς άτομο στην εφαρμογή (δεν δημιουργούνται μόνες τους)</h3><ul className="tm__issues">${t.people.unmatched.slice(0, 8).map((x: string, i: number) => html`<li key=${i}>${x}</li>`)}${t.people.unmatched.length > 8 ? html`<li>… και ${t.people.unmatched.length - 8} ακόμα</li>` : null}</ul>`}
      </div></section>
    </div>
    <section className="ui-card"><div className="ui-card__head"><h2>Τι θα γραφτεί στο αρχείο</h2></div><div className="ui-card__body">
      <p className="note">${t.write.cells} κελιά ημερών για ${t.write.people} άτομα, με τους κωδικούς της μονάδας. Στήλες συνόλων, τύποι και κελιά με δικό σου κείμενο δεν αγγίζονται.</p>
      ${t.write.warn.length > 0 && html`<${Alert} tone="warn"><div><b>Προειδοποιήσεις</b><ul className="tm__issues">${t.write.warn.map((w: string, i: number) => html`<li key=${i}>${w}</li>`)}</ul></div><//>`}
      ${t.write.notFound.length > 0 && html`<p className="note">Άτομα με υπηρεσίες χωρίς γραμμή στο φύλλο: ${t.write.notFound.slice(0, 8).join(', ')}</p>`}
    </div></section>
  </div>`;
}

// ------------------------------------------------------------------ το σώμα της οθόνης (μόνο εμφάνιση)
export interface BodyProps {
  model: DutyModel; step: Step; picks: Record<number, Role | ''>; choices: Record<string, DutyMeaning | null>; creates: Record<string, TplCreate & { code?: string; as?: 'service' | 'status' }>; trial: Trial | null;
  now(v: CodeView): { state: string; value: string }; onStep(s: Step): void; setPick(c: number, r: string): void; setChoice(v: CodeView, value: string): void; setCreate(v: CodeView, kind: 'service' | 'status', name: string): void;
}
export function DutyMapBody(p: BodyProps) {
  const { model, step } = p;
  if (!model.found) return html`<${Alert} tone="bad"><span>Στο φύλλο δεν βρέθηκε μηνιαίο πλέγμα (σειρά ημερών 1, 2, 3… με άτομα από κάτω). Διάλεξε άλλο φύλλο ή δείξε τις στήλες με το κουμπί «Στήλες…».</span><//>`;
  const nWords = model.codes.filter(c => ['suggest', 'unknown'].includes(p.now(c).state) && !p.creates[c.key]).length;
  const items = [{ value: 'cols', label: '1. Στήλες' }, { value: 'words', label: '2. Λέξεις (' + model.codes.length + ')' + (nWords ? ' · ' + nWords + ' να δεις' : '') }, { value: 'try', label: '3. Δοκιμή' }];
  const all = model.codes.map(c => p.now(c).state); const n = (s: string) => all.filter(x => x === s).length;
  return html`<div className="tm">
    <div className="tm__sum"><${Badge} tone="ok">${n('sure')} σίγουροι<//><${Badge} tone="warn">${n('suggest')} προτάσεις<//><${Badge} tone="bad">${n('unknown')} δεν τους ξέρω<//>${n('mine') > 0 && html`<${Badge} tone="info">${n('mine')} τους όρισες εσύ<//>`}</div>
    <${Tabs} value=${step} onChange=${p.onStep} items=${items}/>
    ${step === 'cols' && html`<${ColsStep} model=${model} picks=${p.picks} setPick=${p.setPick}/>`}
    ${step === 'words' && html`<${WordsStep} model=${model} now=${p.now} setChoice=${p.setChoice} setCreate=${p.setCreate} creates=${p.creates}/>`}
    ${step === 'try' && html`<${TrialStep} trial=${p.trial}/>`}
  </div>`;
}

// ------------------------------------------------------------------ το παράθυρο
export function DutyMapDialog({ book, b, onClose, onSaved }: { book: { file: string; name: string; sheets: RawSheet[] }; b: SourceBinding; onClose(): void; onSaved?(b: SourceBinding): void }) {
  const { state, run, refresh, today } = useStore(); const toast = useToast();
  const [sheetName, setSheetName] = useState(b.sheet); const [step, setStep] = useState<Step>('cols');
  const [picks, setPicks] = useState<Record<number, Role | ''>>({}); const [choices, setChoices] = useState<Record<string, DutyMeaning | null>>({});
  const [creates, setCreates] = useState<Record<string, P>>({}); const [dirty, setDirty] = useState(false);
  const profile = useMemo(() => dutyProfileOf(state.settings), [state.settings.tplProfiles]);
  const sheet = book.sheets.find(s => s.name === sheetName) || book.sheets[0];
  const lex = useMemo(() => buildLexicon({ lists: state.settings.lists }), [state.settings.lists]);
  const model0 = useMemo(() => buildDutyModel({ settings: state.settings, profile, file: book.file, today, sheet }), [sheet, profile, state.settings]);
  const hints = Object.keys(picks).length && model0.found ? colsByRole(model0.cols, picks) : undefined;
  const model = useMemo(() => (hints ? buildDutyModel({ settings: state.settings, profile, file: book.file, today, sheet, cols: hints }) : model0), [model0, hints && JSON.stringify(hints)]);
  const edit = (f: () => void) => { setDirty(true); f(); };
  // η τρέχουσα απάντηση ενός κωδικού: η επιλογή του χρήστη, αλλιώς του προφίλ, αλλιώς η σίγουρη της εφαρμογής
  const now = (v: CodeView): { state: string; value: string } => {
    if (creates[v.key]) return { state: 'mine', value: '' };
    const ch = choices[v.key];
    if (ch) return { state: ch.t === 'ignore' ? 'ignored' : 'mine', value: ch.t === 'seat' ? 'seat:' + ch.k : ch.t === 'kind' ? 'kind:' + ch.kind : ch.t === 'status' ? 'status:' + ch.id : 'ignore' };
    if (ch === null) return { state: 'unknown', value: '' };
    return { state: v.state, value: v.value };
  };
  const setChoice = (v: CodeView, value: string) => edit(() => {
    setTrial(null); setCreates(p => { const n = { ...p }; delete n[v.key]; return n; });
    setChoices(p => { const n = { ...p }; const m = value ? meaningOf(value, v.text, state.settings, lex) : null; if (m) n[v.key] = m; else if (value === '') n[v.key] = null; else delete n[v.key]; return n; });
  });
  const setCreate = (v: CodeView, kind: 'service' | 'status', name: string) => edit(() => {
    setTrial(null);
    if (kind === 'service') { setCreates(p => ({ ...p, [v.key]: { k: 'service', name, as: 'service' } })); setChoices(p => ({ ...p, [v.key]: { t: 'seat', k: NEW_PREFIX + name, text: v.text } })); }
    else { setCreates(p => ({ ...p, [v.key]: { k: 'status', name, as: 'status' } })); setChoices(p => ({ ...p, [v.key]: { t: 'status', id: 'own:' + name.toUpperCase(), name, text: v.text } })); }
  });
  const setPick = (c: number, r: string) => edit(() => { setTrial(null); setPicks(p => ({ ...p, [c]: r as Role | '' })); });
  // το προφίλ και οι δημιουργίες από τις επιλογές
  const draft = () => {
    const cols = hints ?? profile?.duty?.cols;
    const prof = dutyProfileFrom(model, { prev: profilesOf(state.settings).find(x => x.kind === 'duties') ?? null, choices, ...(cols ? { cols } : {}) });
    const create: TplCreate[] = Object.values(creates).filter(x => x.k === 'service').map(x => ({ k: 'service' as const, name: x.name }));
    return { prof, create };
  };
  const binding = (): SourceBinding => ({ ...model.binding!, file: b.file, sheet: model.sheet, write: b.write ?? true, scope: b.scope ?? 'active', ...(b.month ? { month: b.month } : {}) });
  const [trial, setTrial] = useState<Trial | null>(null);
  const runTrial = () => {
    try {
      const { prof, create } = draft(); let n = 0;
      const st: AppState = apply(state, { t: 'adaptTpl', profile: prof, create, text: 'δοκιμή' }, { today, newId: () => 'x' + ++n }).state;
      setTrial(dutyTrial(sheet, binding(), st, today));
    } catch (e) { toast({ text: String(e instanceof Error ? e.message : e) }); }
  };
  const goStep = (s: Step) => { setStep(s); if (s === 'try' && !trial && model.found) runTrial(); };
  const save = async () => {
    const { prof, create } = draft();
    const r = await run({ t: 'adaptTpl', profile: prof, create, text: 'έλεγχος υπηρεσιών της μονάδας' } as P);
    if ((r as P)?.ok === false) { toast({ text: (r as P).error }); return; }
    const sv = await window.api.srcSave('duties', binding()); if (!sv.ok) { toast({ text: sv.error }); return; }
    await refresh(); setDirty(false);
    toast({ text: 'Αποθηκεύτηκε. Η εφαρμογή θα διαβάζει και θα γράφει τους κωδικούς της μονάδας σου.' }); onSaved?.(binding()); onClose();
  };
  const sheets = book.sheets.map(s => s.name);
  return html`<${Dialog} size="xl" title="Έλεγχος υπηρεσιών: οι κωδικοί της μονάδας σου" description=${book.name + ' · φύλλο «' + sheetName + '»'} onClose=${onClose} dirty=${dirty}
    footer=${html`<span className="tm__foot">Ό,τι μένει άγνωστο δεν διαβάζεται και δεν γράφεται στο αρχείο σου.</span>
      <${Button} variant="outline" disabled=${!model.found} onClick=${() => goStep('try')}>Δοκιμή με τα σημερινά<//>
      <${Button} disabled=${!model.found} why="Δεν βρέθηκε πλέγμα ημερών στο φύλλο" onClick=${save}>Αποθήκευση<//>`}>
    ${sheets.length > 1 && html`<div className="field" style=${{ maxWidth: '280px' }}><label className="field__label" htmlFor="dm-sh">Φύλλο</label>
      <${Select} id="dm-sh" className="ui-input" value=${sheetName} onChange=${(e: P) => { setSheetName(e.target.value); setPicks({}); setTrial(null); }}>${sheets.map((n: string) => html`<option key=${n} value=${n}>${n}</option>`)}<//></div>`}
    <${DutyMapBody} model=${model} step=${step} picks=${picks} choices=${choices} creates=${creates} trial=${trial} now=${now} onStep=${goStep} setPick=${setPick} setChoice=${setChoice} setCreate=${setCreate}/>
  <//>`;
}
void cx;
