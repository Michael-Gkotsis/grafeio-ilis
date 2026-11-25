// Λίστες άλλης μονάδας: η οθόνη «Αντιστοίχιση…» για τα έντυπα ΦΡΟΥΡΑ (κατάσταση υπηρεσιών σε λίστα) και Εξοδούχοι (εξοδούχοι/αδειούχοι δίπλα δίπλα)
// και για τους θαλαμιζόμενους με τους τύπους της μονάδας (shared/unitLists.ts, shared/listMap.ts). Βήματα: Θέσεις · Στήλες · Θαλαμιζόμενοι · Δοκιμή.
// Κάθε μπλοκ θέσης του αρχείου δείχνει τι νομίζει η εφαρμογή: Σίγουρο (πράσινο) · Πρόταση (ένα κλικ «Σωστό») · Δεν το ξέρω (διαλέγεις από λίστα, «Δημιουργία» νέας υπηρεσίας ή «Αγνόησε»).
// Ό,τι μένει άγνωστο δεν γράφεται ποτέ στο αρχείο. ListMapBody: μόνο εμφάνιση· ListMapDialog: φορτώνει το αρχείο, δοκιμάζει και αποθηκεύει (εντολή adaptTpl).
import { useEffect, useState } from 'react';
import { html, Alert, Badge, Button, Dialog, Tabs, useToast } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { profilesOf, type ListAdd } from '../../shared/tplStore';
import { STATE_TARGETS, headsFor } from '../../shared/unitLists';
import { NEW_SVC, listProfileFrom, type ListColView, type ListModel, type ListReq, type ListTryRes, type SvcBlockView } from '../../shared/listMap';
type P = any;

export type Step = 'posts' | 'cols' | 'rooms' | 'try';
const TONE: Record<string, { tone: string; label: string }> = { sure: { tone: 'ok', label: 'Σίγουρο' }, suggest: { tone: 'warn', label: 'Πρόταση' }, unknown: { tone: 'bad', label: 'Δεν το ξέρω' }, mine: { tone: 'info', label: 'Το όρισες εσύ' }, ignored: { tone: 'outline', label: 'Το αφήνω' } };
const LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

export interface Edits { posts: Record<string, string>; creates: Record<string, string>; cols: Record<string, number | null>; rooms: Record<string, { on: boolean; who: string }>; show: Record<string, '' | 'keep' | 'remove'>; adds: ListAdd[] | null; skip: string[]; name: '' | 'short' | null }   // adds: null = όπως είναι αποθηκευμένα· skip: υπηρεσίες που ο χρήστης είπε «Όχι στο έντυπο» (μόνο στην οθόνη)
export const noEdits = (): Edits => ({ posts: {}, creates: {}, cols: {}, rooms: {}, show: {}, adds: null, skip: [], name: null });
export const showOf = (b: SvcBlockView, e: Edits): '' | 'keep' | 'remove' => (b.labelKey in e.show ? e.show[b.labelKey] : b.show);
export function nowOf(b: SvcBlockView, e: Edits): { state: string; value: string } {
  if (b.labelKey in e.posts) { const v = e.posts[b.labelKey]; return { state: v === 'ignore' ? 'ignored' : v ? 'mine' : 'unknown', value: v }; }
  return { state: b.sure, value: b.value };
}

// ------------------------------------------------------------------ βήμα: θέσεις
function BlockRow({ b, model, e, setPost, setCreate, setShow }: P) {
  const [open, setOpen] = useState(false); const [name, setName] = useState('');
  const now = nowOf(b, e); const badge = TONE[now.state] || TONE.unknown; const made = e.creates[b.labelKey];
  return html`<div className="tm__word"><div className="tm__wgrid">
    <span><b>${b.label}</b> <small className="muted">${b.rows} ${b.rows === 1 ? 'γραμμή' : 'γραμμές'} · ${b.groups} ${b.groups === 1 ? 'νούμερο' : 'νούμερα'}</small></span>
    <${Select} className="ui-input" aria-label=${'Τι είναι η θέση ' + b.label} value=${made ? '' : now.value} onChange=${(ev: P) => setPost(b, ev.target.value)}>
      <option value="">${made ? 'Νέα υπηρεσία: ' + made : 'Διάλεξε…'}</option>
      ${[...new Set(model.svc.options.map((o: P) => o.group))].map((g: P) => html`<optgroup key=${g} label=${g}>${model.svc.options.filter((o: P) => o.group === g).map((o: P) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}</optgroup>`)}
      <option value="ignore">Δεν είναι υπηρεσία της εφαρμογής (αγνόησέ το)</option><//>
    <${Badge} tone=${badge.tone}>${badge.label}<//></div>
    <div className="tm__acts" style=${{ margin: '0 12px 6px', alignItems: 'center' }}><label className="muted" htmlFor=${'sh-' + b.labelKey}><small>Στο έντυπο που βγαίνει:</small></label>
      <${Select} id=${'sh-' + b.labelKey} className="ui-input" style=${{ maxWidth: '260px' }} value=${showOf(b, e)} onChange=${(ev: P) => setShow(b, ev.target.value)}>
        <option value="">Φαίνεται και γεμίζει</option><option value="keep">Φαίνεται, δεν γεμίζει (ανενεργό)</option><option value="remove">Δεν υπάρχει στο έντυπο (σβήνεται)</option><//></div>
    ${b.why && (now.state === 'suggest' || now.state === 'unknown') && html`<div className="tm__acts" style=${{ margin: '0 12px 6px' }}><small className="muted">${b.why}</small></div>`}
    ${now.state !== 'sure' && now.state !== 'mine' && html`<div className="tm__acts" style=${{ margin: '0 12px 8px' }}>
      ${b.value && now.state === 'suggest' && html`<${Button} size="sm" onClick=${() => setPost(b, b.value)}>Σωστό: ${b.suggestLabel}<//>`}
      <${Button} size="sm" variant="outline" onClick=${() => { setOpen(!open); setName(b.label.replace(/\s+/g, ' ')); }}>Δημιουργία…<//>
      <${Button} size="sm" variant="ghost" onClick=${() => setPost(b, 'ignore')}>Αγνόησε<//></div>`}
    ${open && html`<div className="tm__mini"><p className="tm__help">Νέα υπηρεσία στις Ρυθμίσεις (ανενεργή μέχρι να τη ρυθμίσεις, με δική της στήλη στις δυνατότητες υπηρεσιών):</p>
      <input className="ui-input" aria-label="Όνομα υπηρεσίας" value=${name} onChange=${(ev: P) => setName(ev.target.value)}/>
      <${Button} disabled=${!name.trim()} onClick=${() => { setCreate(b, name.trim().replace(/\s+/g, ' ')); setOpen(false); }}>Δημιουργία<//></div>`}
  </div>`;
}
// Υπηρεσίες της εφαρμογής που λείπουν από το έντυπο: διαλέγεις πού μπαίνουν και με τη μορφή ποιου μπλοκ· προστίθενται γραμμές στο έντυπο που βγαίνει (όχι στο αρχείο σου)
export const addsOf = (model: ListModel, e: Edits): ListAdd[] => e.adds ?? model.svc?.adds ?? [];
export function missingOf(model: ListModel, e: Edits): { value: string; label: string; nums: number; per: number }[] {
  const svc = model.svc; if (!svc) return [];
  const used = new Set(svc.blocks.map(b => nowOf(b, e).value).filter(Boolean)); const added = new Set(addsOf(model, e).map(a => a.value));
  return svc.targets.filter(t => !t.kept && t.nums > 0 && !used.has(t.value) && !added.has(t.value) && !e.skip.includes(t.value));
}
function AddCard({ t, model, onAdd, onSkip }: P) {
  const blocks: SvcBlockView[] = model.svc.blocks; const first = blocks.find(b => !b.labelKey.startsWith('st:') && !(b.value || '').startsWith('st:')) ?? blocks[0];
  const [after, setAfter] = useState(''); const [like, setLike] = useState(first?.labelKey || '');
  return html`<div className="tm__mini" style=${{ display: 'grid', gap: '8px' }}>
    <div><b>${t.label}</b> ${t.value.startsWith('st:') ? html`<${Badge} tone="info">λίστα ατόμων: γραμμές όσοι είναι σε αυτή την κατάσταση τη μέρα<//>` : html`<${Badge} tone="info">ενεργή · ${t.nums} ${t.nums === 1 ? 'νούμερο' : 'νούμερα'}${t.per > 1 ? ' × ' + t.per + ' άτομα' : ''}<//>`}</div>
    <div className="tm__acts" style=${{ alignItems: 'center' }}>
      <label className="muted" htmlFor=${'af-' + t.value}><small>Να μπει</small></label>
      <${Select} id=${'af-' + t.value} className="ui-input" value=${after} onChange=${(ev: P) => setAfter(ev.target.value)}>
        <option value="^">Στην αρχή</option>${blocks.map((b: SvcBlockView) => html`<option key=${b.labelKey} value=${b.labelKey}>Μετά το μπλοκ ${b.label}</option>`)}<option value="">Στο τέλος</option><//>
      <label className="muted" htmlFor=${'lk-' + t.value}><small>με τη μορφή του μπλοκ</small></label>
      <${Select} id=${'lk-' + t.value} className="ui-input" value=${like} onChange=${(ev: P) => setLike(ev.target.value)}>${blocks.map((b: SvcBlockView) => html`<option key=${b.labelKey} value=${b.labelKey}>${b.label}</option>`)}<//></div>
    <div className="tm__acts"><${Button} size="sm" disabled=${!like} onClick=${() => onAdd({ value: t.value, after, like })}>Πρόσθεσέ τη<//><${Button} size="sm" variant="ghost" onClick=${() => onSkip(t.value)}>Όχι στο έντυπο<//></div>
  </div>`;
}
export function missingStates(model: ListModel, e: Edits): { value: string; label: string }[] {
  const svc = model.svc; if (!svc) return [];
  const used = new Set(svc.blocks.map(b => nowOf(b, e).value).filter(Boolean)); const added = new Set(addsOf(model, e).map(a => a.value));
  return STATE_TARGETS.filter(t => !used.has(t.value) && !added.has(t.value)).map(t => ({ value: t.value, label: t.label }));
}
function AddsPanel({ model, e, addSvc, dropAdd, skipSvc }: P) {
  const [pickSt, setPickSt] = useState('');
  const missing = missingOf(model, e); const adds = addsOf(model, e); const blocks: SvcBlockView[] = model.svc.blocks; const sts = missingStates(model, e);
  const nameOf = (v: string) => model.svc.targets.find((t: P) => t.value === v)?.label || STATE_TARGETS.find(t => t.value === v)?.label || v; const blockOf = (k: string) => blocks.find(b => b.labelKey === k)?.label || '';
  if (!missing.length && !adds.length && !sts.length) return null;
  return html`<section className="ui-card"><div className="ui-card__head"><h2>Υπηρεσίες της εφαρμογής που λείπουν από το έντυπο</h2></div><div className="ui-card__body" style=${{ display: 'grid', gap: '10px' }}>
    <p className="tm__help">Το αρχείο της μονάδας σου δεν έχει μπλοκ για αυτές. Διάλεξε πού μπαίνουν και ποιο μπλοκ μιμούνται (πλαίσια, χρώματα, γράμματα): προστίθενται γραμμές στο έντυπο που βγαίνει, το αρχείο σου δεν αλλάζει ποτέ.</p>
    ${adds.map((a: ListAdd) => html`<div key=${a.value} className="tm__acts" style=${{ alignItems: 'center' }}><${Badge} tone="ok">Θα μπει<//><span><b>${nameOf(a.value)}</b> ${a.after === '' ? 'στο τέλος' : a.after === '^' ? 'στην αρχή' : 'μετά το μπλοκ ' + blockOf(a.after)}, με τη μορφή του «${blockOf(a.like)}»</span><${Button} size="sm" variant="ghost" onClick=${() => dropAdd(a.value)}>Βγάλ' την<//></div>`)}
    ${missing.map((t: P) => html`<${AddCard} key=${t.value} t=${t} model=${model} onAdd=${addSvc} onSkip=${skipSvc}/>`)}
    ${sts.length > 0 && html`<div className="tm__acts" style=${{ alignItems: 'center' }}><label className="muted" htmlFor="add-state"><small>Λίστα κατάστασης που λείπει από το έντυπο (νοσοκομείο, ΕΥ, αποσπασμένοι…)</small></label>
      <${Select} id="add-state" className="ui-input" style=${{ maxWidth: '320px' }} value=${pickSt} onChange=${(ev: P) => setPickSt(ev.target.value)}><option value="">Διάλεξε κατάσταση…</option>${sts.map(t => html`<option key=${t.value} value=${t.value}>${t.label}</option>`)}<//></div>`}
    ${pickSt && html`<${AddCard} key=${pickSt} t=${{ value: pickSt, label: nameOf(pickSt), nums: 0, per: 1 }} model=${model} onAdd=${(a: ListAdd) => { addSvc(a); setPickSt(''); }} onSkip=${() => setPickSt('')}/>`}
  </div></section>`;
}
function PostsStep({ model, e, setPost, setCreate, setShow, addSvc, dropAdd, skipSvc }: P) {
  const blocks: SvcBlockView[] = model.svc.blocks;
  const need = blocks.filter(b => ['suggest', 'unknown'].includes(nowOf(b, e).state)); const done = blocks.filter(b => !need.includes(b));
  const part = (title: string, list: SvcBlockView[]) => list.length ? html`<section className="ui-card"><div className="ui-card__head"><h2>${title} (${list.length})</h2></div>
    <div className="tm__wgrid tm__wgrid--head"><span>Η θέση του αρχείου</span><span>Τι είναι στην εφαρμογή</span><span></span></div>
    ${list.map(b => html`<${BlockRow} key=${b.labelKey} b=${b} model=${model} e=${e} setPost=${setPost} setCreate=${setCreate} setShow=${setShow}/>`)}</section>` : null;
  return html`<div className="tm">
    <div className="tm__note"><${Alert} tone="info"><span>Η εφαρμογή γράφει βαθμό και ονοματεπώνυμο μόνο στις θέσεις που ξέρει τι είναι. Στο αρχείο σου δεν αλλάζει τίποτα άλλο: ούτε τύποι, ούτε δικά σου κείμενα, ούτε οι ώρες.</span><//></div>
    ${part('Να τις δεις', need)}${part('Έτοιμες', done)}
    <${AddsPanel} model=${model} e=${e} addSvc=${addSvc} dropAdd=${dropAdd} skipSvc=${skipSvc}/>
    ${!blocks.length && html`<p className="note">Δεν βρέθηκαν θέσεις κάτω από την επικεφαλίδα.</p>`}
  </div>`;
}

// ------------------------------------------------------------------ βήμα: στήλες
function ColRow({ c, e, setCol }: { c: ListColView; e: Edits; setCol(k: string, v: number | null): void }) {
  const edited = c.key in e.cols; const cur = edited ? e.cols[c.key] : c.c;
  const st = edited ? 'mine' : c.c == null ? 'unknown' : c.how;
  return html`<div className="tm__word"><div className="tm__wgrid">
    <span><b>${c.label}</b>${c.head && c.head !== c.ref ? html` <small className="muted">η επικεφαλίδα είναι στη στήλη ${c.head}</small>` : null}</span>
    <${Select} className="ui-input" aria-label=${'Στήλη για ' + c.label} value=${cur == null ? '' : String(cur)} onChange=${(ev: P) => setCol(c.key, ev.target.value === '' ? null : Number(ev.target.value))}>
      <option value="">Καμία (δεν γράφεται)</option>${LETTERS.map((l, i) => html`<option key=${l} value=${i}>Στήλη ${l}</option>`)}<//>
    <${Badge} tone=${(st === 'unknown' ? TONE.ignored : TONE[st]).tone}>${st === 'unknown' ? 'Δεν τη γράφω' : TONE[st].label}<//></div></div>`;
}
function ColsStep({ model, e, setCol, setName }: P) {
  const groups: { title: string; cols: ListColView[] }[] = model.svc ? [{ title: 'Στήλες της λίστας', cols: model.svc.cols.filter((c: P) => c.role === 'rank' || c.role === 'name') }]
    : model.outs.lists.map((l: P) => ({ title: l.title + ' (' + l.ready + ' έτοιμες γραμμές)', cols: l.cols }));
  return html`<div className="tm">
    <p className="tm__help">Η εφαρμογή βρίσκει τις στήλες από αυτά που γράφει το αρχείο, όχι μόνο από τις επικεφαλίδες (που μπορεί να είναι μετατοπισμένες). Αν κάποια είναι λάθος, διάλεξε τη σωστή.</p>
    <div className="field" style=${{ maxWidth: '320px' }}><label className="field__label" htmlFor="lm-name">Μορφή ονόματος</label>
      <${Select} id="lm-name" className="ui-input" value=${e.name ?? model.name ?? ''} onChange=${(ev: P) => setName(ev.target.value)}>
        <option value="">Ονοματεπώνυμο (όπως τώρα)</option><option value="short">ΕΠΩΝΥΜΟ Α.</option><//></div>
    ${groups.map(g => html`<section className="ui-card" key=${g.title}><div className="ui-card__head"><h2>${g.title}</h2></div>
      <div className="tm__wgrid tm__wgrid--head"><span>Τι γράφεται</span><span>Σε ποια στήλη</span><span></span></div>
      ${g.cols.map((c: ListColView) => html`<${ColRow} key=${c.key} c=${c} e=${e} setCol=${setCol}/>`)}</section>`)}
    ${model.svc && html`<p className="note">Νούμερα, ώρες και βάρδιες (${model.svc.cols.filter((c: P) => c.role !== 'rank' && c.role !== 'name').map((c: P) => c.label + (c.ref ? ' ' + c.ref : '')).join(' · ')}) τα διαβάζει η εφαρμογή για να ξέρει ποια γραμμή είναι ποια. Δεν τα γράφει.</p>`}
  </div>`;
}

// ------------------------------------------------------------------ βήμα: θαλαμιζόμενοι
function RoomsStep({ model, e, setRoom }: P) {
  return html`<div className="tm">
    <p className="tm__help">Τα φύλλα αυτά έχουν τύπους που βρίσκουν βαθμό και όνομα από τη λίστα δεδομένων της μονάδας. Η εφαρμογή γράφει μόνο το κλειδί που διαβάζουν οι τύποι, ποτέ τους τύπους.</p>
    ${model.rooms.map((r: P) => { const x = e.rooms[r.sheet] || { on: r.saved, who: r.who };
      return html`<section className="ui-card" key=${r.sheet}><div className="ui-card__body">
        <label className="tm__check"><input type="checkbox" checked=${x.on} onChange=${(ev: P) => setRoom(r.sheet, { ...x, on: ev.target.checked })}/> <b>${r.sheet}</b> <small className="muted">${r.keys} γραμμές με κλειδί · λίστα δεδομένων «${r.table}» (${r.tableRows} άτομα)</small></label>
        <div className="field" style=${{ maxWidth: '320px' }}><label className="field__label" htmlFor=${'rw-' + r.sheet}>Ποιοι μπαίνουν σε αυτό το φύλλο</label>
          <${Select} id=${'rw-' + r.sheet} className="ui-input" value=${x.who} disabled=${!x.on} onChange=${(ev: P) => setRoom(r.sheet, { ...x, who: ev.target.value })}>
            <option value="">Όλοι όσοι έχουν θάλαμο</option>${model.subs.map((s: string) => html`<option key=${s} value=${s}>Μόνο: ${s}</option>`)}<//></div>
      </div></section>`; })}
  </div>`;
}

// ------------------------------------------------------------------ βήμα: δοκιμή
function TrialStep({ trial }: P) {
  const t: ListTryRes | null = trial; if (!t) return html`<p className="note">Γίνεται η δοκιμή…</p>`;
  return html`<div className="tm">
    <div className="tm__sum"><${Badge} tone=${t.placed ? 'ok' : 'warn'}>${t.placed} ${t.placed === 1 ? 'άτομο μπαίνει' : 'άτομα μπαίνουν'}<//><${Badge} tone="info">${t.written} κελιά θα γραφτούν<//>
      ${t.unplaced.length > 0 && html`<${Badge} tone="bad">${t.unplaced.length} χωρίς θέση στο αρχείο<//>`}${t.kept > 0 && html`<${Badge} tone="outline">${t.kept} κελιά μένουν όπως είναι<//>`}</div>
    ${t.lines.length > 0 && html`<section className="ui-card"><div className="ui-card__head"><h2>Τι θα γραφτεί σήμερα</h2></div><div className="ui-card__body"><ul className="tm__issues">
      ${t.lines.slice(0, 40).map((l, i) => html`<li key=${i}><b>${l.label}</b>: ${l.text}</li>`)}${t.lines.length > 40 ? html`<li>… και ${t.lines.length - 40} ακόμα</li>` : null}</ul></div></section>`}
    ${t.rooms.length > 0 && html`<section className="ui-card"><div className="ui-card__head"><h2>Θαλαμιζόμενοι</h2></div><div className="ui-card__body"><ul className="tm__issues">
      ${t.rooms.map((r, i) => html`<li key=${i}>${r.keys} κλειδιά · οι τύποι της μονάδας βρήκαν ${r.matched} από ${r.checked} κελιά${r.unevaluated ? ' (' + r.unevaluated + ' δεν ελέγχθηκαν)' : ''}${r.mismatches.length ? ' · δεν βρέθηκαν: ' + r.mismatches.slice(0, 5).join(', ') : ''}</li>`)}</ul></div></section>`}
    ${t.warnings.length > 0 && html`<${Alert} tone="warn"><div><b>Προειδοποιήσεις</b><ul className="tm__issues">${t.warnings.slice(0, 12).map((w, i) => html`<li key=${i}>${w}</li>`)}${t.warnings.length > 12 ? html`<li>… και ${t.warnings.length - 12} ακόμα</li>` : null}</ul></div><//>`}
  </div>`;
}

// ------------------------------------------------------------------ το σώμα της οθόνης (μόνο εμφάνιση)
export interface BodyProps { model: ListModel; step: Step; e: Edits; trial: ListTryRes | null; onStep(s: Step): void; setPost(b: SvcBlockView, v: string): void; setCreate(b: SvcBlockView, name: string): void; setShow(b: SvcBlockView, v: '' | 'keep' | 'remove'): void; addSvc(a: ListAdd): void; dropAdd(value: string): void; skipSvc(value: string): void; setCol(k: string, v: number | null): void; setName(v: '' | 'short'): void; setRoom(sheet: string, v: { on: boolean; who: string }): void }
export function ListMapBody(p: BodyProps) {
  const { model, step } = p;
  if (!model.found) return html`<${Alert} tone="bad"><span>${model.kind === 'services' ? 'Στο φύλλο δεν βρέθηκε λίστα υπηρεσιών (γραμμή με ΒΑΘΜΟΣ και ΟΝΟΜΑΤΕΠΩΝΥΜΟ και από κάτω οι θέσεις).' : 'Στο φύλλο δεν βρέθηκαν οι λίστες ΕΞΟΔΟΥΧΟΙ / ΑΔΕΙΟΥΧΟΙ.'} Διάλεξε άλλο φύλλο.</span><//>`;
  const blocks = model.svc?.blocks || []; const st = blocks.map(b => nowOf(b, p.e).state); const n = (s: string) => st.filter(x => x === s).length;
  const items = [...(model.svc ? [{ value: 'posts', label: '1. Θέσεις (' + blocks.length + ')' + (n('suggest') + n('unknown') ? ' · ' + (n('suggest') + n('unknown')) + ' να δεις' : '') }] : []), { value: 'cols', label: (model.svc ? '2' : '1') + '. Στήλες' }, ...(model.rooms.length ? [{ value: 'rooms', label: 'Θαλαμιζόμενοι (' + model.rooms.length + ')' }] : []), { value: 'try', label: 'Δοκιμή' }];
  return html`<div className="tm">
    ${model.svc && html`<div className="tm__sum"><${Badge} tone="ok">${n('sure')} σίγουρες<//><${Badge} tone="warn">${n('suggest')} προτάσεις<//><${Badge} tone="bad">${n('unknown')} δεν τις ξέρω<//>${n('mine') > 0 && html`<${Badge} tone="info">${n('mine')} τις όρισες εσύ<//>`}</div>`}
    <${Tabs} value=${step} onChange=${p.onStep} items=${items}/>
    ${step === 'posts' && model.svc && html`<${PostsStep} model=${model} e=${p.e} setPost=${p.setPost} setCreate=${p.setCreate} setShow=${p.setShow} addSvc=${p.addSvc} dropAdd=${p.dropAdd} skipSvc=${p.skipSvc}/>`}
    ${step === 'cols' && html`<${ColsStep} model=${model} e=${p.e} setCol=${p.setCol} setName=${p.setName}/>`}
    ${step === 'rooms' && html`<${RoomsStep} model=${model} e=${p.e} setRoom=${p.setRoom}/>`}
    ${step === 'try' && html`<${TrialStep} trial=${p.trial}/>`}
  </div>`;
}

// ------------------------------------------------------------------ το παράθυρο
export function ListMapDialog({ form, file, sheet, onClose, onSaved }: { form: P; file?: string; sheet?: string; onClose(): void; onSaved?(): void }) {
  const { state, run, refresh } = useStore(); const toast = useToast();
  const [model, setModel] = useState<ListModel | null>(null); const [err, setErr] = useState('');
  const [e, setE] = useState<Edits>(noEdits()); const [step, setStep] = useState<Step>('posts'); const [trial, setTrial] = useState<ListTryRes | null>(null); const [dirty, setDirty] = useState(false);
  const load = (sh?: string) => { window.api.listModel(form, file, sh).then((m: P) => { if (!m.ok) setErr(m.error); else { setErr(''); setModel(m); setStep(m.svc ? 'posts' : 'cols'); } }).catch((e: P) => setErr('Δεν διαβάστηκε το αρχείο: ' + (e?.message || e))); };
  useEffect(() => { load(sheet); }, []);
  const edit = (f: (x: Edits) => Edits) => { setDirty(true); setTrial(null); setE(f); };
  const setPost = (b: SvcBlockView, v: string) => edit(x => { const creates = { ...x.creates }; delete creates[b.labelKey]; return { ...x, creates, posts: { ...x.posts, [b.labelKey]: v } }; });
  const setCreate = (b: SvcBlockView, name: string) => edit(x => ({ ...x, creates: { ...x.creates, [b.labelKey]: name }, posts: { ...x.posts, [b.labelKey]: 'blk:' + NEW_SVC + name } }));
  const setShow = (b: SvcBlockView, v: '' | 'keep' | 'remove') => edit(x => ({ ...x, show: { ...x.show, [b.labelKey]: v } }));
  const addSvc = (a: ListAdd) => edit(x => ({ ...x, adds: [...(x.adds ?? model?.svc?.adds ?? []).filter(y => y.value !== a.value), a] }));
  const dropAdd = (value: string) => edit(x => ({ ...x, adds: (x.adds ?? model?.svc?.adds ?? []).filter(y => y.value !== value) }));
  const skipSvc = (value: string) => edit(x => ({ ...x, skip: [...x.skip, value] }));
  const setCol = (k: string, v: number | null) => edit(x => ({ ...x, cols: { ...x.cols, [k]: v } }));
  const setName = (v: '' | 'short') => edit(x => ({ ...x, name: v }));
  const setRoom = (sh: string, v: { on: boolean; who: string }) => edit(x => ({ ...x, rooms: { ...x.rooms, [sh]: v } }));
  const kind = form === 'outs' ? 'outs' : 'services';
  const prev = profilesOf(state.settings).find(p => p.kind === kind && p.lst) ?? null;
  // οι τελικές επιλογές: ό,τι είχε αποθηκευτεί και από πάνω ό,τι άλλαξε τώρα (null = σβήνεται)
  const finalPosts = () => { const out: Record<string, string> = { ...(prev?.lst?.posts || {}) }; for (const [k, v] of Object.entries(e.posts)) { if (v) out[k] = v; else delete out[k]; } return out; };
  const finalShow = () => { const out: Record<string, 'keep' | 'remove'> = { ...(prev?.lst?.show || {}) }; for (const [k, v] of Object.entries(e.show)) { if (v) out[k] = v; else delete out[k]; } return out; };
  const finalAdd = (): ListAdd[] => e.adds ?? prev?.lst?.add ?? [];
  const finalName = (): 'short' | undefined => ((e.name ?? prev?.lst?.name ?? '') === 'short' ? 'short' : undefined);
  const finalCols = () => { const out: Record<string, number> = { ...(prev?.lst?.cols || {}) }; for (const [k, v] of Object.entries(e.cols)) { if (v == null) delete out[k]; else out[k] = v; } return out; };
  const roomsOn = () => (model?.rooms || []).map(r => { const x = e.rooms[r.sheet] || { on: r.saved, who: r.who }; return { sheet: r.sheet, who: x.who, on: x.on }; });
  const req = (): ListReq => ({ ...(file ? { file } : {}), ...(model ? { sheet: model.sheet } : {}), posts: finalPosts(), creates: Object.values(e.creates).map(name => ({ name })), cols: finalCols(), rooms: roomsOn(), show: finalShow(), add: finalAdd(), ...(finalName() ? { name: 'short' as const } : {}), heads: headsFor(finalCols(), model?.headTexts) });
  const runTry = async () => { const r: P = await window.api.listTry(form, req()); if (!r.ok && 'error' in r) { toast({ text: r.error }); return; } setTrial(r); };
  const goStep = (s: Step) => { setStep(s); if (s === 'try' && !trial) void runTry(); };
  const save = async () => {
    if (!model) return;
    const profile = listProfileFrom(kind, { prev, sheet: model.sheet, posts: finalPosts(), cols: finalCols(), show: finalShow(), add: finalAdd(), name: finalName(), heads: headsFor(finalCols(), model.headTexts) });
    const r = await run({ t: 'adaptTpl', profile, create: Object.values(e.creates).map(name => ({ k: 'service' as const, name })), text: form === 'outs' ? 'εξοδούχοι/αδειούχοι της μονάδας' : 'κατάσταση υπηρεσιών της μονάδας' } as P);
    if ((r as P)?.ok === false) { toast({ text: (r as P).error }); return; }
    const on = roomsOn().filter(x => x.on);
    if (on.length) {
      const pr = listProfileFrom('rooms', { prev: profilesOf(state.settings).find(p => p.kind === 'rooms') ?? null, sheet: on[0].sheet, rooms: on });
      const r2 = await run({ t: 'adaptTpl', profile: pr, text: 'θαλαμιζόμενοι της μονάδας' } as P); if ((r2 as P)?.ok === false) { toast({ text: (r2 as P).error }); return; }
    }
    await refresh(); setDirty(false); toast({ text: 'Αποθηκεύτηκε. Το έντυπο θα γεμίζει το αρχείο της μονάδας σου.' }); onSaved?.(); onClose();
  };
  return html`<${Dialog} size="xl" title=${form === 'outs' ? 'Εξοδούχοι και αδειούχοι της μονάδας σου' : 'Κατάσταση υπηρεσιών της μονάδας σου'} description=${model ? (model.file.split(/[\\/]/).pop() || '') + ' · φύλλο «' + model.sheet + '»' : ''} onClose=${onClose} dirty=${dirty}
    footer=${html`<span className="tm__foot">Ό,τι μένει άγνωστο δεν γράφεται στο αρχείο σου. Τα κείμενα και οι τύποι σου δεν αλλάζουν ποτέ.</span>
      <${Button} variant="outline" disabled=${!model?.found} onClick=${() => goStep('try')}>Δοκιμή με τα σημερινά<//>
      <${Button} disabled=${!model?.found} why="Δεν βρέθηκε λίστα στο φύλλο" onClick=${save}>Αποθήκευση<//>`}>
    ${model && model.sheets.length > 1 && html`<div className="field" style=${{ maxWidth: '280px' }}><label className="field__label" htmlFor="lm-sh">Φύλλο</label>
      <${Select} id="lm-sh" className="ui-input" value=${model.sheet} onChange=${(ev: P) => { setE(noEdits()); setTrial(null); load(ev.target.value); }}>${model.sheets.map((n: string) => html`<option key=${n} value=${n}>${n}</option>`)}<//></div>`}
    ${err ? html`<${Alert} tone="bad"><span>${err}</span><//>` : !model ? html`<p className="note">Διαβάζεται το αρχείο… (ένα παλιό .xls μετατρέπεται πρώτα με το Excel, μπορεί να πάρει λίγο)</p>`
      : html`<${ListMapBody} model=${model} step=${step} e=${e} trial=${trial} onStep=${goStep} setPost=${setPost} setCreate=${setCreate} setShow=${setShow} addSvc=${addSvc} dropAdd=${dropAdd} skipSvc=${skipSvc} setCol=${setCol} setRoom=${setRoom} setName=${setName}/>`}
  <//>`;
}
