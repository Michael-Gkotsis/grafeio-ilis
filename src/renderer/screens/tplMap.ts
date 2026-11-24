// Πρότυπο μονάδας: η οθόνη αντιστοίχισης του δικού σου εντύπου ΗΚΑΙ / ΗΚΑΛ (shared/tplMap.ts).
// Βήματα: Στήλες · Γραμμές · Λέξεις (μόνο όταν οι αριθμοί μετριούνται από άλλο φύλλο) · Δοκιμή. Κάθε στήλη και γραμμή δείχνει τα λόγια του αρχείου και τι νομίζει η
// εφαρμογή: Σίγουρο (πράσινο) · Πρόταση (ένα κλικ «Σωστό») · Δεν το ξέρω (διαλέγεις από λίστα, ή «Δημιουργία»). Ό,τι δεν ξέρει δεν γράφεται ποτέ στο αρχείο.
// TplMapBody: μόνο εμφάνιση (παίρνει το μοντέλο και τις επιλογές)· TplMapDialog: φορτώνει, δοκιμάζει και αποθηκεύει μέσω window.api.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { html, cx, Alert, Badge, Button, Dialog, Tabs, useToast } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { HK } from '../../shared/unit';
import { phraseKey } from '../../shared/lexicon';
import { formatOf, sampleLine, type BackFormat } from '../../shared/backForm';
import { MANUAL_KEYS, choiceText, choiceValue, duplicates, effectiveChoices, emptyChoices, stateLabel, valueChoice, type Choices, type ColChoice, type ColView, type ModelRes, type RowView, type Sureness, type TplCreate, type TryRes } from '../../shared/tplMap';
type P = any;

export type Step = 'cols' | 'rows' | 'words' | 'back' | 'try';
const TONE: Record<Sureness, { tone: string; label: string }> = { sure: { tone: 'ok', label: 'Σίγουρο' }, suggest: { tone: 'warn', label: 'Πρόταση' }, unknown: { tone: 'bad', label: 'Δεν το ξέρω' }, ignored: { tone: 'outline', label: 'Το αφήνω' } };
const MINE = { tone: 'info', label: 'Το όρισες εσύ' };
const MANUAL_SET = new Set(MANUAL_KEYS);

// ------------------------------------------------------------------ τι δείχνει η στήλη / η γραμμή τώρα (η επιλογή του χρήστη πάνω από την απάντηση της εφαρμογής)
export interface Now { state: Sureness | 'mine'; to: string; badge: { tone: string; label: string } }
export function colNow(v: ColView, ch: Choices): Now {
  const c = ch.cols[v.c];
  if (c) return c.k === 'ignore' ? { state: 'ignored', to: 'Το αφήνω όπως είναι', badge: TONE.ignored } : { state: 'mine', to: choiceText(c, c.k === 'post' ? c.posts : []), badge: MINE };
  if (v.state === 'suggest') return { state: 'suggest', to: v.suggestText, badge: TONE.suggest };
  return { state: v.state, to: v.to, badge: TONE[v.state] };
}
export function rowNow(v: RowView, ch: Choices, label: (k: string) => string): Now {
  const c = ch.rows[v.r];
  if (c) return c.k === 'ignore' ? { state: 'ignored', to: 'Το αφήνω όπως είναι', badge: TONE.ignored } : { state: 'mine', to: label(c.key), badge: MINE };
  if (v.state === 'suggest') return { state: 'suggest', to: v.suggestText, badge: TONE.suggest };
  return { state: v.state, to: v.to, badge: TONE[v.state] };
}
const Pill = ({ n, tone, text }: P) => html`<${Badge} tone=${tone}>${n} ${text}<//>`;

// ------------------------------------------------------------------ ο πίνακας του αρχείου (αριστερά)
function FileTable({ model, ch, step, sel, onSel }: P) {
  const rowLabel = (k: string) => model.rowOptions.find((o: P) => o.value === k)?.label || k;
  const colsNow = model.cols.map((c: ColView) => colNow(c, ch)); const rowsNow = model.rows.map((r: RowView) => rowNow(r, ch, rowLabel));
  const isCols = step === 'cols';
  return html`<div className="tm__scroll"><table className="tm__tbl">
    <thead><tr><th scope="col" className="tm__corner">ΓΡΑΜΜΗ</th>${model.cols.map((c: ColView, i: number) => html`<th key=${c.c} scope="col" className=${cx('tm__h', 'tm-' + colsNow[i].state, isCols && sel === c.c && 'is-sel')}>
      ${isCols ? html`<button type="button" onClick=${() => onSel(c.c)} aria-label=${'Στήλη ' + c.ref + ': ' + c.text}><b>${c.ref}</b> ${c.text}</button>` : html`<span><b>${c.ref}</b> ${c.text}</span>`}</th>`)}</tr></thead>
    <tbody>${model.rows.map((r: RowView, i: number) => html`<tr key=${r.r}><th scope="row" className=${cx('tm__rl', !isCols && 'tm-' + rowsNow[i].state, !isCols && sel === r.r && 'is-sel')}>
      ${!isCols ? html`<button type="button" onClick=${() => onSel(r.r)} aria-label=${'Γραμμή ' + r.ref + ': ' + r.text}>${r.text}</button>` : html`<span>${r.text}</span>`}</th>
      ${model.cols.map((c: ColView, j: number) => html`<td key=${c.c} className=${cx(isCols && sel === c.c && 'is-selcol')}>${model.cells[i]?.[j] || ''}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

// ------------------------------------------------------------------ η δεξιά πλευρά: οι λίστες με όλες τις στήλες / γραμμές
function AllList({ title, items, sel, onSel }: P) {
  return html`<section className="ui-card tm__all"><div className="ui-card__head"><h2>${title}</h2></div>
    <ul className="tm__list">${items.map((x: P) => html`<li key=${x.id} className=${cx(sel === x.id && 'is-sel')}><button type="button" onClick=${() => onSel(x.id)}>
      <span className="tm__list-name">${x.name}</span><${Badge} tone=${x.now.badge.tone}>${x.now.badge.label}<//>
      ${x.now.to && html`<span className="tm__list-to">→ ${x.now.to}</span>`}</button></li>`)}</ul></section>`;
}

// ------------------------------------------------------------------ ο πίνακας ρυθμίσεων μιας στήλης
function ColPanel({ model, v, ch, setCol, setCreate, dups, creates }: P) {
  const [mode, setMode] = useState(''); const [key, setKey] = useState('');
  useEffect(() => { setMode(''); setKey(''); }, [v.c]);
  const cur: ColChoice | undefined = ch.cols[v.c]; const now = colNow(v, ch);
  const eff = effectiveChoices(model, ch); const others = new Map<string, string>();
  for (const [c, x] of Object.entries(eff)) if (Number(c) !== v.c) { const name = model.cols.find((y: ColView) => y.c === Number(c))?.text || ''; if (x.k === 'keys') x.keys.forEach((k: string) => others.set('state:' + k, name)); else if (x.k === 'calc') others.set('calc:' + x.what, name); }
  const val = cur ? choiceValue(cur) : v.state === 'sure' ? v.value : '';
  const free = model.freeKeys.filter((k: string) => !others.has('state:' + k));
  const freeManual = free.filter((k: string) => MANUAL_SET.has(k)); const freeAway = free.filter((k: string) => !MANUAL_SET.has(k) || true);
  const groups = [...new Set(model.colOptions.map((o: P) => o.group))] as string[];
  const pick = (value: string) => {
    if (!value) return setCol(v.c, null);
    if (value === 'ignore') return setCol(v.c, { k: 'ignore' });
    if (value === 'post') return setCol(v.c, { k: 'post', posts: v.posts || [] });
    const x = valueChoice(value); if (x) setCol(v.c, x);
  };
  const posts: string[] = cur?.k === 'post' ? cur.posts : v.posts || [];
  const dup = dups.find((d: P) => d.cols.includes(v.c));
  const made = creates['c:' + v.c] as TplCreate | undefined;
  return html`<section className="ui-card tm__panel"><div className="ui-card__head"><h2>Στήλη «${v.text}»</h2><${Badge} tone=${now.badge.tone}>${now.badge.label}<//></div>
    <div className="ui-card__body tm__body">
      ${v.state === 'suggest' && !cur && html`<p className="tm__help">Η εφαρμογή νομίζει ότι η στήλη μετράει: <b>${v.suggestText}</b>. Αν είναι σωστό, πάτα «Σωστό». Αλλιώς διάλεξε από τη λίστα.</p>`}
      ${v.state === 'unknown' && !cur && html`<p className="tm__help">${v.why && !/^(η έννοια|μόνο πρόταση|στήλη «)/.test(v.why) ? v.why : 'Η εφαρμογή δεν ξέρει τι μετράει αυτή η στήλη. Διάλεξε από τη λίστα, ή φτιάξε κάτι νέο παρακάτω. Όσο μένει άγνωστη, δεν γράφεται τίποτα σε αυτή.'}</p>`}
      ${v.state === 'sure' && !cur && html`<p className="tm__help">Η εφαρμογή το κατάλαβε μόνη της: ${now.to}. Αν δεν είναι σωστό, άλλαξέ το εδώ.</p>`}
      <div className="field"><label className="field__label" htmlFor="tm-what">Τι σημαίνει (τι μετράει η στήλη)</label>
        <${Select} id="tm-what" className="ui-input" value=${val} onChange=${(e: P) => pick(e.target.value)}>
          <option value="">Διάλεξε…</option>
          ${groups.map(g => html`<optgroup key=${g} label=${g}>${model.colOptions.filter((o: P) => o.group === g).map((o: P) => html`<option key=${o.value} value=${o.value} disabled=${others.has(o.value)}>${o.label}${others.has(o.value) ? ' (τη μετρά ήδη η στήλη «' + others.get(o.value) + '»)' : ''}</option>`)}</optgroup>`)}
          <optgroup label="Άλλο"><option value="post">Όσους έχουν πόστο…</option><option value="ignore">Την αφήνω όπως είναι (δεν γράφεται)</option></optgroup><//></div>
      ${cur?.k === 'keys' && cur.keys.length > 1 && html`<p className="tm__help">Μετράει μαζί: ${cur.keys.map(stateLabel).join(' + ')}</p>`}
      ${val === 'post' && html`<div className="field"><span className="field__label">Ποια πόστα</span>
        ${model.posts.length ? html`<div className="tm__checks">${model.posts.map((p: string) => html`<label key=${p} className="tm__check"><input type="checkbox" className="ui-check" checked=${posts.some((x: string) => phraseKey(x) === phraseKey(p))} onChange=${(e: P) => setCol(v.c, { k: 'post', posts: e.target.checked ? [...posts, p] : posts.filter((x: string) => phraseKey(x) !== phraseKey(p)) })}/><span>${p}</span></label>`)}</div>`
          : html`<span className="field__help">Δεν υπάρχουν πόστα στο Δυναμολόγιο. Γράψε πρώτα το πόστο των ατόμων στην καρτέλα τους.</span>`}
        <span className="field__help">Μετράει όσους έχουν αυτά τα πόστα και είναι παρόντες (όχι σε άδεια ή απουσία).</span></div>`}
      ${dup && html`<${Alert} tone="bad"><span>Δύο στήλες δεν μπορούν να μετρούν το ίδιο: «${dup.what}». Άλλαξε μία από τις δύο.</span><//>`}
      <div className="tm__acts">
        ${v.state === 'suggest' && !cur && html`<${Button} onClick=${() => pick(v.suggest)}>Σωστό<//>`}
        ${!!cur && html`<${Button} variant="outline" onClick=${() => setCol(v.c, null)}>Άκυρο, όπως το κατάλαβε η εφαρμογή<//>`}
        ${(!cur || cur.k !== 'ignore') && html`<${Button} variant="ghost" onClick=${() => pick('ignore')}>Αγνόησε<//>`}
      </div>
      ${v.state !== 'sure' || cur ? html`<div className="tm__new"><h3>Δημιουργία</h3>
        <div className="tm__acts">
          <${Button} size="sm" variant="outline" onClick=${() => { setMode(mode === 'status' ? '' : 'status'); setKey(freeAway[0] || ''); }}>Νέα κατάσταση «${v.text}»<//>
          <${Button} size="sm" variant="outline" onClick=${() => { setMode(mode === 'manual' ? '' : 'manual'); setKey(freeManual[0] || ''); }}>Στήλη που τη γράφω εγώ κάθε μέρα<//>
          <${Button} size="sm" variant="outline" onClick=${() => pick('post')}>Ομάδα πόστων<//>
        </div>
        ${mode === 'status' && html`<div className="tm__mini"><p className="tm__help">Η κατάσταση «${v.text}» μπαίνει στις καταστάσεις της εφαρμογής (Λίστες › Είδη άδειας). Διάλεξε σε ποια στήλη της εφαρμογής μετράει.</p>
          <${Select} className="ui-input" aria-label="Στήλη της εφαρμογής" value=${key} onChange=${(e: P) => setKey(e.target.value)}>${freeAway.map((k: string) => html`<option key=${k} value=${k}>${stateLabel(k)}</option>`)}<//>
          <${Button} disabled=${!key} why="Διάλεξε στήλη" onClick=${() => { setCreate('c:' + v.c, { k: 'leaveKind', name: v.text, col: key }); setCol(v.c, { k: 'keys', keys: [key] }); setMode(''); }}>Δημιουργία<//></div>`}
        ${mode === 'manual' && html`<div className="tm__mini"><p className="tm__help">Τον αριθμό τον γράφεις κάθε μέρα στην οθόνη ${HK()} › «Συμπληρώνεις εσύ». Διάλεξε ποιο από τα πεδία που γράφονται με το χέρι θα χρησιμοποιηθεί.</p>
          ${freeManual.length ? html`<${Select} className="ui-input" aria-label="Πεδίο" value=${key} onChange=${(e: P) => setKey(e.target.value)}>${freeManual.map((k: string) => html`<option key=${k} value=${k}>${stateLabel(k)}</option>`)}<//>
            <${Button} disabled=${!key} why="Διάλεξε πεδίο" onClick=${() => { setCreate('c:' + v.c, null); setCol(v.c, { k: 'keys', keys: [key] }); setMode(''); }}>Δημιουργία<//>` : html`<span className="field__help">Όλα τα πεδία που γράφονται με το χέρι χρησιμοποιούνται ήδη.</span>`}</div>`}
        ${made && html`<p className="tm__help">Θα δημιουργηθεί η κατάσταση «${made.name}» στη στήλη «${'col' in made ? stateLabel(made.col) : ''}».</p>`}
      </div>` : null}
    </div></section>`;
}

// ------------------------------------------------------------------ ο πίνακας ρυθμίσεων μιας γραμμής
function RowPanel({ model, v, ch, setRow, setCreate, creates, rowLabel }: P) {
  const [mode, setMode] = useState(''); const [grp, setGrp] = useState('nco'); const [after, setAfter] = useState('');
  useEffect(() => { setMode(''); }, [v.r]);
  const cur = ch.rows[v.r]; const now = rowNow(v, ch, rowLabel);
  const made = Object.values(creates).filter((x: P) => x.k === 'hkRow') as P[];
  const opts = [...model.rowOptions, ...made.map((m: P) => ({ value: m.name, label: m.name }))];
  const val = cur ? (cur.k === 'ignore' ? 'ignore' : cur.key) : v.state === 'sure' && !v.total ? v.value : '';
  const name = v.text.replace(/\s+/g, ' ').trim();
  return html`<section className="ui-card tm__panel"><div className="ui-card__head"><h2>Γραμμή «${v.text}»</h2><${Badge} tone=${now.badge.tone}>${now.badge.label}<//></div>
    <div className="ui-card__body tm__body">
      ${v.total && !cur ? html`<p className="tm__help">Είναι γραμμή συνόλου. Τα σύνολα τα βγάζουν οι τύποι του εντύπου· όπου λείπουν, τα γράφει η εφαρμογή.</p>` : html`<${Fragment}>
      ${v.state === 'suggest' && !cur && html`<p className="tm__help">Η εφαρμογή νομίζει ότι είναι η γραμμή <b>${v.suggestText}</b>. Αν είναι σωστό, πάτα «Σωστό».</p>`}
      ${v.state === 'unknown' && !cur && html`<p className="tm__help">Η εφαρμογή δεν ξέρει ποιους βαθμούς μετράει αυτή η γραμμή. Διάλεξε από τη λίστα ή φτιάξε νέα γραμμή. Όσο μένει άγνωστη δεν γράφεται, και τα σύνολα που την περιέχουν δεν γράφονται.</p>`}
      <div className="field"><label className="field__label" htmlFor="tm-row">Τι σημαίνει (ποιους βαθμούς μετράει)</label>
        <${Select} id="tm-row" className="ui-input" value=${val} onChange=${(e: P) => { const x = e.target.value; setRow(v.r, !x ? null : x === 'ignore' ? { k: 'ignore' } : { k: 'row', key: x }); }}>
          <option value="">Διάλεξε…</option>${opts.map((o: P) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}<option value="ignore">Την αφήνω όπως είναι (δεν γράφεται)</option><//></div>
      <div className="tm__acts">
        ${v.state === 'suggest' && !cur && html`<${Button} onClick=${() => setRow(v.r, { k: 'row', key: v.suggest })}>Σωστό<//>`}
        ${!!cur && html`<${Button} variant="outline" onClick=${() => setRow(v.r, null)}>Άκυρο, όπως το κατάλαβε η εφαρμογή<//>`}
        ${(!cur || cur.k !== 'ignore') && html`<${Button} variant="ghost" onClick=${() => setRow(v.r, { k: 'ignore' })}>Αγνόησε<//>`}
      </div>
      <div className="tm__new"><h3>Δημιουργία</h3>
        <div className="tm__acts"><${Button} size="sm" variant="outline" onClick=${() => { setMode(mode === 'row' ? '' : 'row'); setAfter(model.rowOptions[model.rowOptions.length - 1]?.value || ''); }}>Νέα γραμμή «${name}»<//></div>
        ${mode === 'row' && html`<div className="tm__mini"><p className="tm__help">Η γραμμή «${name}» μπαίνει στις γραμμές της ${HK()} (Ρυθμίσεις › Γραμμές της ${HK()}). Μετά την ορίζεις στους βαθμούς που θέλεις εκεί.</p>
          <${Select} className="ui-input" aria-label="Ομάδα" value=${grp} onChange=${(e: P) => setGrp(e.target.value)}><option value="off">Αξιωματικοί</option><option value="nco">Υπαξιωματικοί και οπλίτες</option><//>
          <${Select} className="ui-input" aria-label="Κάτω από" value=${after} onChange=${(e: P) => setAfter(e.target.value)}>${model.rowOptions.map((o: P) => html`<option key=${o.value} value=${o.value}>Κάτω από: ${o.label}</option>`)}<//>
          <${Button} disabled=${!name} onClick=${() => { setCreate('r:' + v.r, { k: 'hkRow', name, grp, after }); setRow(v.r, { k: 'row', key: name }); setMode(''); }}>Δημιουργία<//></div>`}
      </div><//>`}
    </div></section>`;
}

// ------------------------------------------------------------------ λέξεις του φύλλου δεδομένων (ΗΚΑΛ με τύπους)
function WordsStep({ model, ch, setWord, setCreate, creates, setSkip }: P) {
  const [open, setOpen] = useState(''); const [key, setKey] = useState('');
  const skip: string[] = (ch.skip || []);   // «Αγνόησε»: αποθηκεύεται στο προφίλ της μονάδας (κλειδιά λέξεων)
  const used = new Set<string>(Object.values(effectiveChoices(model, ch)).flatMap((x: ColChoice) => (x.k === 'keys' ? x.keys : [])));
  const free = model.freeKeys.filter((k: string) => !used.has(k) || true);
  const block = (title: string, group: string) => {
    const ws = model.words.filter((w: P) => w.group === group); if (!ws.length) return null;
    return html`<section className="ui-card"><div className="ui-card__head"><h2>${title}</h2></div>
      <div className="tm__wgrid tm__wgrid--head"><span>Η λέξη του αρχείου</span><span>Τι σημαίνει</span><span></span></div>
      ${ws.map((w: P) => {
        const chosen = ch.words[w.text]; const st = chosen ? 'mine' : skip.includes(phraseKey(w.text)) ? 'ignored' : w.state;
        const badge = st === 'mine' ? MINE : TONE[st as Sureness];
        const opts = group === 'Βαθμοί' ? model.wordOptions.rank : model.wordOptions.status;
        return html`<div key=${w.col + w.text} className="tm__word"><div className="tm__wgrid">
          <code className="tm__code">${w.text}</code>
          ${w.state === 'sure' && !chosen ? html`<span>${w.to}</span>` : html`<${Select} className="ui-input" aria-label=${'Τι σημαίνει η λέξη ' + w.text} value=${chosen || ''} onChange=${(e: P) => setWord(w.text, e.target.value)}><option value="">Διάλεξε…</option>${opts.map((o: P) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}<//>`}
          <${Badge} tone=${badge.tone}>${badge.label}<//></div>
          ${st !== 'sure' && st !== 'mine' && html`<div className="tm__acts">
            ${w.suggest && !chosen && html`<${Button} size="sm" onClick=${() => setWord(w.text, w.suggest)}>Σωστό: ${w.suggestText}<//>`}
            ${group === 'Καταστάσεις' && html`<${Button} size="sm" variant="outline" onClick=${() => { setOpen(open === w.text ? '' : w.text); setKey(free[0] || ''); }}>Δημιούργησε<//>`}
            ${st !== 'ignored' && html`<${Button} size="sm" variant="ghost" onClick=${() => setSkip(w.text, true)}>Αγνόησε<//>`}</div>`}
          ${st === 'ignored' && html`<div className="tm__acts"><${Button} size="sm" variant="ghost" onClick=${() => setSkip(w.text, false)}>Δες την ξανά<//></div>`}
          ${open === w.text && html`<div className="tm__mini"><p className="tm__help">Η κατάσταση «${w.text}» μπαίνει στις καταστάσεις της εφαρμογής και μετράει σε αυτή τη στήλη:</p>
            <${Select} className="ui-input" aria-label="Στήλη της εφαρμογής" value=${key} onChange=${(e: P) => setKey(e.target.value)}>${free.map((k: string) => html`<option key=${k} value=${k}>${stateLabel(k)}</option>`)}<//>
            <${Button} disabled=${!key} onClick=${() => { setCreate('w:' + w.text, { k: 'leaveKind', name: w.text, col: key }); setWord(w.text, 'status:' + phraseKey(w.text)); setOpen(''); }}>Δημιουργία<//></div>`}
        </div>`;
      })}</section>`;
  };
  return html`<div className="tm">
    <div className="tm__note"><${Alert} tone="info"><span>Αυτό το έντυπο μετράει μόνο του, με τύπους πάνω στο φύλλο «${model.driven?.sheet}». Η εφαρμογή θα γράφει εκεί ένα άτομο ανά γραμμή με τις λέξεις του αρχείου και δεν θα αγγίζει κανέναν τύπο. Τις λέξεις τις διάβασε από τους τύπους και τις λίστες επιλογής του φύλλου.</span><//></div>
    ${block('Βαθμοί', 'Βαθμοί')}${block('Καταστάσεις', 'Καταστάσεις')}
    ${!model.words.length && html`<p className="note">Δεν βρέθηκαν λέξεις στους τύπους του φύλλου.</p>`}
  </div>`;
}


// ------------------------------------------------------------------ πίσω όψη: οι ενότητες του εντύπου και η μορφή της γραμμής
const NUM_OPTS: [BackFormat['num'], string][] = [['arabic', '1. 2. 3.'], ['greek', 'α. β. γ. … στ. ζ.']];
const DATE_OPTS: [BackFormat['date'], string][] = [['hk', '15 ΟΚΤ 26'], ['slash', '15/10/26'], ['slash4', '15/10/2026']];
const LINE_OPTS: [BackFormat['line'], string][] = [['app', 'Όπως τη γράφει η εφαρμογή σήμερα'], ['person', 'Βαθμός (Όπλο) Επώνυμο Όνομα (ΣΑ :αριθμός) : πρόταση']];
const BLOCKS: [string, string][] = [['vehicles', 'Κατάσταση οχημάτων'], ['organs', 'Όργανα υπηρεσίας'], ['meal', 'Συσσίτιο οπλιτών'], ['arms', 'Οπλισμός (σταθερό κείμενο)']];
function BackStep({ model, ch, setBack, accept }: P) {
  const b = model.back; const f = formatOf(ch.back);
  const acc: string[] = ch.back?.accepted || [];
  const sel = (label: string, value: string, opts: [string, string][], set: (v: string) => void) => html`<label className="tm__fmt"><span>${label}</span>
    <${Select} className="ui-input" aria-label=${label} value=${value} onChange=${(e: P) => set(e.target.value)}>${opts.map(([v, t]) => html`<option key=${v} value=${v}>${t}</option>`)}<//></label>`;
  return html`<div className="tm">
    ${!b ? html`<${Alert} tone="warn"><span>Δεν βρέθηκε πίσω όψη με ενότητες (Εγγραφές, Διαγραφές, Αιτήσεις…) στο αρχείο. Οι γραμμές της πίσω όψης δεν γράφονται και η εφαρμογή σου το λέει κάθε φορά.</span><//>` : html`
    <div className="tm__cols">
      <section className="ui-card tm__half"><div className="ui-card__head"><h2>Οι ενότητες του φύλλου «${b.sheet}»</h2></div>
        <ul className="tm__list tm__list--flat">${b.sections.map((x: P) => {
          const ok = x.state === 'sure' || acc.includes(x.key);
          return html`<li key=${x.ref + x.id}><div className="tm__sec">
            <span className="tm__list-name"><b>${x.name}</b> · «${x.text}» στο κελί ${x.ref}</span>
            <${Badge} tone=${ok ? 'ok' : 'warn'}>${ok ? 'Σίγουρο' : 'Πρόταση'}<//>
            ${!ok && html`<span className="tm__sec-btn"><${Button} size="sm" onClick=${() => accept(x.key)}>Σωστό<//></span>`}
            <small className="tm__sec-note">${!ok ? 'Δεν γράφεται μέχρι να το επιβεβαιώσεις' : x.layout === 'right' ? 'γράφεται στο κελί δίπλα στην ετικέτα' : x.rows ? 'γράφεται στις ' + x.rows + ' γραμμές από κάτω' : 'δεν έχει ελεύθερες γραμμές: δεν γράφεται'}</small>
            ${x.comment && html`<small className="tm__hint" title="Σχόλιο του εντύπου">Σχόλιο του εντύπου: «${x.comment}». Είναι υπόδειξη, δεν αλλάζει τον τρόπο που γράφει η εφαρμογή.</small>`}</div></li>`; })}</ul>
        ${b.decision > 0 && html`<p className="note tm__legend">Οι στήλες ΕΙΣΗΓΗΣΗ / ΑΠΟΦΑΣΗ και το «ΕΛΑΒΑ ΓΝΩΣΗ» δεν γράφονται ποτέ.</p>`}
        ${b.missing.length > 0 && html`<${Alert} tone="info"><span>Το έντυπο δεν έχει ενότητα: ${b.missing.map((id: string) => ({ enroll: 'Εγγραφές', delete: 'Διαγραφές', leaves: 'Άδειες', punish: 'Ποινές', requests: 'Αιτήσεις', misc: 'Λοιπά' } as P)[id]).join(', ')}. Ό,τι ανήκει εκεί δεν γράφεται αλλού, και η εφαρμογή σου το λέει όταν βγάζεις ${HK()}.</span><//>`}
      </section>
      <section className="ui-card tm__half"><div className="ui-card__head"><h2>Στην αριστερή στήλη και στο τέλος</h2></div><div className="ui-card__body">
        <ul className="tm__issues">${BLOCKS.map(([k, t]) => html`<li key=${k}>${t}: ${b.blocks[k] ? 'βρέθηκε' : 'δεν βρέθηκε'}</li>`)}
          <li>Σελίδα συνέχειας: ${b.continuation ? '«' + b.continuation + '» (αντίγραφό της μπαίνει μετά την πίσω όψη όταν δεν χωράνε οι γραμμές)' : 'δεν υπάρχει· ό,τι δεν χωράει αναφέρεται και δεν γράφεται'}</li></ul>
      </div></section>
    </div>`}
    <section className="ui-card"><div className="ui-card__head"><h2>Μορφή της γραμμής</h2></div><div className="ui-card__body">
      <div className="tm__fmts">
        ${sel('Αρίθμηση', f.num, NUM_OPTS, v => setBack({ num: v }))}
        ${sel('Ημερομηνία', f.date, DATE_OPTS, v => setBack({ date: v }))}
        ${sel('Γραμμή', f.line, LINE_OPTS, v => setBack({ line: v }))}</div>
      <p className="tm__help">Παράδειγμα (φανταστικό πρόσωπο):</p>
      <pre className="tm__sample" aria-label="Παράδειγμα γραμμής">${sampleLine(f)}</pre>
    </div></section>
  </div>`;
}

// ------------------------------------------------------------------ δοκιμή
function TrialStep({ trial, busy, onTry, onRestore }: P) {
  if (busy && !trial) return html`<p className="note">Γίνεται το δοκιμαστικό γέμισμα με τα σημερινά…</p>`;
  if (!trial) return html`<div className="tm"><p>Το δοκιμαστικό γέμισμα γεμίζει ένα αντίγραφο στη μνήμη με τα σημερινά στοιχεία. Δεν αλλάζει κανένα αρχείο.</p><div><${Button} onClick=${onTry}>Δοκιμαστικό γέμισμα με τα σημερινά<//></div></div>`;
  const staleN = trial.rows.reduce((a: number, r: P) => a + r.cells.filter((c: P) => c.how === 'stale').length, 0);
  const bad = trial.cross.mismatches.length; const hasData = trial.unmappedCols.filter((x: P) => x.hasData);
  return html`<div className="tm">
    <div className="tm__sum">
      <${Badge} tone="ok">${trial.written} κελιά γράφονται<//>
      ${trial.kept > 0 && html`<${Badge} tone="info">${trial.kept} τα μετρά το ίδιο το έντυπο<//>`}
      ${trial.refused.length > 0 && html`<${Badge} tone="warn">${trial.refused.length} δεν γράφονται<//>`}
      ${hasData.length > 0 && html`<${Badge} tone="bad">${hasData.length} στήλες με στοιχεία δεν αντιστοιχίστηκαν<//>`}
      <${Button} size="sm" variant="outline" onClick=${onTry}>Ξανά<//>
    </div>
    ${trial.front == null ? html`<${Alert} tone="bad"><span>Δεν βρέθηκε πίνακας ${HK()} στο αρχείο. Δεν γράφεται τίποτα.</span><//>` : html`
    <section className="ui-card"><div className="ui-card__head"><h2>Τα νούμερα όπως θα βγουν (φύλλο «${trial.front}»)</h2></div>
      <div className="tm__scroll tm__scroll--flat"><table className="tm__tbl tm__tbl--num">
        <thead><tr><th scope="col" className="tm__corner">ΓΡΑΜΜΗ</th>${trial.head.map((h: P) => html`<th key=${h.ref} scope="col" className="tm__h"><span><b>${h.ref}</b> ${h.text}</span></th>`)}</tr></thead>
        <tbody>${trial.rows.map((r: P) => html`<tr key=${r.ref} className=${cx(r.total && 'is-total')}><th scope="row" className="tm__rl"><span>${r.label}</span>${r.skipped && html`<small className="txt-bad"> δεν γράφεται: ${r.skipped}</small>`}</th>
          ${r.cells.map((c: P, i: number) => html`<td key=${i} className=${cx('tm__num', c.how === 'written' && 'is-written', c.how === 'formula' && 'is-formula', c.how === 'stale' && 'is-stale')} title=${c.how === 'stale' ? 'Αριθμός που έμεινε από παλιά στο έντυπο. Δεν είναι σημερινός και δεν γράφεται.' : undefined}>${c.v == null ? '' : c.v}</td>`)}</tr>`)}</tbody>
      </table></div>
      <p className="note tm__legend"><span className="tm__sw is-written"></span> γράφεται από την εφαρμογή · <span className="tm__sw is-formula"></span> το μετρά ο τύπος του εντύπου · <span className="tm__sw is-stale"></span> αριθμός που έμεινε από παλιά στο έντυπο, ΔΕΝ είναι σημερινός και δεν γράφεται</p>
      ${staleN > 0 && html`<p className="tm__stale-note">Σε ${staleN} κελιά συνόλων το έντυπο έχει γραμμένο αριθμό από παλιά (με πλάγια γράμματα και διακεκομμένη γραμμή). Η εφαρμογή δεν τα γράφει: μην τα πάρεις για σημερινά.</p>`}</section>`}
    <div className="tm__cols">
      <section className="ui-card tm__half"><div className="ui-card__head"><h2>Έλεγχος με τους τύπους του εντύπου</h2></div><div className="ui-card__body">
        ${trial.cross.checked === 0 ? html`<p className="note">Το έντυπο δεν έχει τύπους που να ελέγχονται.</p>` : bad === 0
          ? html`<p className="tm__ok">Και τα ${trial.cross.matched} κελιά με τύπους βγάζουν τον ίδιο αριθμό με την εφαρμογή.</p>`
          : html`<${Fragment}><p className="txt-bad">${bad} κελιά με τύπους βγάζουν άλλον αριθμό από την εφαρμογή. Δες αν κάποια στήλη ή γραμμή είναι αντιστοιχισμένη λάθος.</p><ul className="tm__issues">${trial.cross.mismatches.slice(0, 12).map((m: P) => html`<li key=${m.ref}>Κελί ${m.ref}: η εφαρμογή ${m.expected}, ο τύπος του εντύπου ${m.got || 'κενό'}</li>`)}</ul><//>`}
        ${trial.cross.unevaluated > 0 && html`<p className="note">${trial.cross.unevaluated} κελιά έχουν τύπους που η εφαρμογή δεν μπορεί να υπολογίσει: δεν ελέγχονται.</p>`}
      </div></section>
      <section className="ui-card tm__half"><div className="ui-card__head"><h2>Τι δεν γράφεται</h2></div><div className="ui-card__body">
        ${!trial.refused.length && !trial.unmappedCols.length && !trial.unmappedRows.length ? html`<p className="tm__ok">Τίποτα δεν μένει απέξω.</p>` : null}
        ${trial.unmappedCols.length > 0 && html`<${Fragment}><h3 className="tm__h3">Στήλες χωρίς αντιστοίχιση</h3><ul className="tm__issues">${trial.unmappedCols.slice(0, 12).map((x: P) => html`<li key=${x.ref}>${x.ref} «${x.text || 'χωρίς επικεφαλίδα'}»${x.hasData ? ' · έχει στοιχεία' : ''}</li>`)}</ul><//>`}
        ${trial.unmappedRows.length > 0 && html`<${Fragment}><h3 className="tm__h3">Γραμμές χωρίς αντιστοίχιση</h3><ul className="tm__issues">${trial.unmappedRows.slice(0, 12).map((x: P) => html`<li key=${x.ref}>Γραμμή ${x.ref} «${x.text}»${x.hasData ? ' · έχει στοιχεία' : ''}</li>`)}</ul><//>`}
        ${trial.refused.length > 0 && html`<${Fragment}><h3 className="tm__h3">Κελιά που δεν γράφτηκαν</h3><ul className="tm__issues">${trial.refused.slice(0, 12).map((x: P) => html`<li key=${x.ref}>Κελί ${x.ref}: ${x.why}</li>`)}</ul><//>`}
      </div></section>
    </div>
    ${trial.back && trial.back.length > 0 && html`<section className="ui-card"><div className="ui-card__head"><h2>Πίσω όψη</h2></div><div className="ui-card__body"><ul className="tm__issues">${trial.back.map((x: P) => html`<li key=${x.name}>${x.name}: ${x.entries} ${x.entries === 1 ? 'εγγραφή' : 'εγγραφές'}, γράφονται ${x.placed}${x.moved ? ', ' + x.moved + ' στη σελίδα συνέχειας' : ''}${x.unplaced ? ', ' + x.unplaced + ' ΔΕΝ χωράνε' : ''}</li>`)}</ul></div></section>`}
    ${trial.fixes.length > 0 && html`<${Alert} tone="warn"><div className="tm__fix"><span>Σε ${trial.fixes.length} κελιά των συνόλων υπάρχουν αριθμοί στη θέση του τύπου (π.χ. ${trial.fixes[0].ref}). Η εφαρμογή γράφει η ίδια τα σύνολα. Αν θες το έντυπο να τα ξαναβγάζει μόνο του, μπορείς να αποθηκεύσεις ένα <b>αντίγραφο</b> με τους τύπους πίσω· το αρχικό αρχείο δεν αλλάζει.</span><${Button} variant="outline" onClick=${onRestore}>Επαναφορά τύπων σε αντίγραφο…<//></div><//>`}
    ${trial.data && html`<p className="note">Φύλλο «${trial.data.sheet}»: γράφονται ${trial.data.rows} άτομα${trial.data.unwritable ? ', ' + trial.data.unwritable + ' δεν γράφονται (δες τις προειδοποιήσεις)' : ''}.</p>`}
    ${trial.warnings.length > 0 && html`<${Alert} tone="warn"><div><b>Προειδοποιήσεις</b><ul className="tm__issues">${trial.warnings.slice(0, 10).map((w: string, i: number) => html`<li key=${i}>${w}</li>`)}</ul></div><//>`}
  </div>`;
}

// ------------------------------------------------------------------ το σώμα της οθόνης (μόνο εμφάνιση)
export interface BodyProps {
  model: ModelRes; ch: Choices; creates: Record<string, TplCreate>; step: Step; sel: number | null; trial: TryRes | null; busy: boolean;
  onStep(s: Step): void; onSel(n: number): void; setCol(c: number, x: ColChoice | null): void; setRow(r: number, x: { k: 'row'; key: string } | { k: 'ignore' } | null): void;
  setWord(w: string, id: string): void; setSkip(w: string, on: boolean): void; setBack(patch: Partial<BackFormat>): void; accept(key: string): void; setCreate(k: string, x: TplCreate | null): void; onTry(): void; onRestore(): void;
}
export function TplMapBody(p: BodyProps) {
  const { model, ch, creates, step } = p;
  const rowLabel = (k: string) => model.rowOptions.find(o => o.value === k)?.label || k;
  const dups = useMemo(() => duplicates(model, ch), [model, ch]);
  const cols = model.cols.map(c => ({ id: c.c, name: c.ref + ' · ' + c.text, now: colNow(c, ch) }));
  const rows = model.rows.filter(r => !r.total).map(r => ({ id: r.r, name: r.ref + ' · ' + r.text, now: rowNow(r, ch, rowLabel) }));
  const all = [...cols.map(x => x.now.state), ...model.rows.filter(r => !r.total).map(r => rowNow(r, ch, rowLabel).state)];
  const n = (s: string) => all.filter(x => x === s).length;
  const needCols = cols.filter(x => x.now.state === 'suggest' || x.now.state === 'unknown').length;
  const needRows = rows.filter(x => x.now.state === 'suggest' || x.now.state === 'unknown').length;
  const items = [{ value: 'cols', label: '1. Στήλες (' + model.cols.length + ')' + (needCols ? ' · ' + needCols + ' να δεις' : '') }, { value: 'rows', label: '2. Γραμμές (' + rows.length + ')' + (needRows ? ' · ' + needRows + ' να δεις' : '') }, ...(model.driven ? [{ value: 'words', label: '3. Λέξεις' }] : []), { value: 'back', label: (model.driven ? '4' : '3') + '. Πίσω όψη' + (model.back?.sections.some(x => x.state === 'suggest' && !ch.back?.accepted?.includes(x.key)) ? ' · να δεις' : '') }, { value: 'try', label: (model.driven ? '5' : '4') + '. Δοκιμή' }];
  const selCol = step === 'cols' ? model.cols.find(c => c.c === p.sel) || model.cols.find(c => colNow(c, ch).state === 'suggest' || colNow(c, ch).state === 'unknown') || model.cols[0] : undefined;
  const selRow = step === 'rows' ? model.rows.find(r => r.r === p.sel && !r.total) || model.rows.find(r => !r.total && (rowNow(r, ch, rowLabel).state === 'suggest' || rowNow(r, ch, rowLabel).state === 'unknown')) || model.rows.find(r => !r.total) : undefined;
  if (model.noFront) return html`<${Alert} tone="bad"><span>Στο αρχείο δεν βρέθηκε πίνακας ${HK()} (γραμμές βαθμών και στήλες με αριθμούς). Διάλεξε άλλο φύλλο ως μπροστινή σελίδα στο παράθυρο του template.</span><//>`;
  return html`<div className="tm">
    <div className="tm__sum"><${Pill} n=${n('sure')} tone="ok" text="σίγουρες"/><${Pill} n=${n('suggest')} tone="warn" text="προτάσεις"/><${Pill} n=${n('unknown')} tone="bad" text="δεν τις ξέρω"/>${n('mine') > 0 && html`<${Pill} n=${n('mine')} tone="info" text="τις όρισες εσύ"/>`}${n('ignored') > 0 && html`<${Pill} n=${n('ignored')} tone="outline" text="τις αγνοείς"/>`}</div>
    <${Tabs} value=${step} onChange=${p.onStep} items=${items}/>
    ${dups.length > 0 && html`<${Alert} tone="bad"><span>Δύο στήλες μετρούν το ίδιο («${dups[0].what}»). Άλλαξε μία από τις δύο για να αποθηκευτεί.</span><//>`}
    ${step === 'cols' && html`<div className="tm__cols">
      <section className="ui-card tm__file"><div className="ui-card__head"><h2>Το αρχείο όπως είναι</h2></div><div className="ui-card__body">
        <p className="tm__help">Κάθε στήλη χρωματίζεται ανάλογα με το αν η εφαρμογή ξέρει τι μετράει. Πάτα μια στήλη για να τη δεις δεξιά. ${model.lost > 0 ? 'Σε ' + model.lost + ' κελιά συνόλων υπάρχουν αριθμοί αντί για τύπους· τα σύνολα τα γράφει η εφαρμογή.' : ''}</p>
        <${FileTable} model=${model} ch=${ch} step=${step} sel=${selCol?.c} onSel=${p.onSel}/></div></section>
      <div className="tm__side">${selCol && html`<${ColPanel} model=${model} v=${selCol} ch=${ch} setCol=${p.setCol} setCreate=${p.setCreate} dups=${dups} creates=${creates}/>`}
        <${AllList} title="Όλες οι στήλες" items=${cols} sel=${selCol?.c} onSel=${p.onSel}/></div></div>`}
    ${step === 'rows' && html`<div className="tm__cols">
      <section className="ui-card tm__file"><div className="ui-card__head"><h2>Το αρχείο όπως είναι</h2></div><div className="ui-card__body">
        <p className="tm__help">Κάθε γραμμή χρωματίζεται ανάλογα με το αν η εφαρμογή ξέρει ποιους βαθμούς μετράει. Πάτα μια γραμμή για να τη δεις δεξιά.</p>
        <${FileTable} model=${model} ch=${ch} step=${step} sel=${selRow?.r} onSel=${p.onSel}/></div></section>
      <div className="tm__side">${selRow && html`<${RowPanel} model=${model} v=${selRow} ch=${ch} setRow=${p.setRow} setCreate=${p.setCreate} creates=${creates} rowLabel=${rowLabel}/>`}
        <${AllList} title="Όλες οι γραμμές" items=${rows} sel=${selRow?.r} onSel=${p.onSel}/></div></div>`}
    ${step === 'words' && html`<${WordsStep} model=${model} ch=${ch} setWord=${p.setWord} setSkip=${p.setSkip} setCreate=${p.setCreate} creates=${creates}/>`}
    ${step === 'back' && html`<${BackStep} model=${model} ch=${ch} setBack=${p.setBack} accept=${p.accept}/>`}
    ${step === 'try' && html`<${TrialStep} trial=${p.trial} busy=${p.busy} onTry=${p.onTry} onRestore=${p.onRestore}/>`}
  </div>`;
}

// ------------------------------------------------------------------ το παράθυρο
export function TplMapDialog({ form, file, sheet, onClose, onSaved }: { form: P; file?: string; sheet?: string; onClose(): void; onSaved?(): void }) {
  const { refresh } = useStore(); const toast = useToast();
  const [model, setModel] = useState<ModelRes | null>(null); const [err, setErr] = useState('');
  const [ch, setCh] = useState<Choices>(emptyChoices()); const [creates, setCreates] = useState<Record<string, TplCreate>>({});
  const [step, setStep] = useState<Step>('cols'); const [sel, setSel] = useState<number | null>(null);
  const [trial, setTrial] = useState<TryRes | null>(null); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  useEffect(() => { let live = true; window.api.tplModel(form, file, sheet).then((m: P) => { if (!live) return; if (!m.ok) setErr(m.error); else { setModel(m); setCh(m.choices); if (m.noFront) setStep('cols'); } }).catch((e: P) => { if (live) setErr('Δεν διαβάστηκε το αρχείο: ' + (e?.message || e)); }); return () => { live = false; }; }, []);
  const edit = (f: () => void) => { setDirty(true); setTrial(null); f(); };
  const setCol = (c: number, x: ColChoice | null) => edit(() => { setCh(p => { const cols = { ...p.cols }; if (x) cols[c] = x; else delete cols[c]; return { ...p, cols }; }); if (!x || x.k !== 'keys') setCreates(p => { const n = { ...p }; delete n['c:' + c]; return n; }); });
  const setRow = (r: number, x: P) => edit(() => { setCh(p => { const rows = { ...p.rows }; if (x) rows[r] = x; else delete rows[r]; return { ...p, rows }; }); if (!x || x.k !== 'row') setCreates(p => { const n = { ...p }; delete n['r:' + r]; return n; }); });
  const setWord = (w: string, id: string) => edit(() => setCh(p => { const words = { ...p.words }; if (id) words[w] = id; else delete words[w]; return { ...p, words }; }));
  const setSkip = (w: string, on: boolean) => edit(() => setCh(p => { const k = phraseKey(w); const cur = (p.skip || []).filter(x => x !== k); return { ...p, skip: on ? [...cur, k] : cur }; }));
  const setBack = (patch: Partial<BackFormat>) => edit(() => setCh(p => ({ ...p, back: { ...(p.back || {}), ...patch } })));
  const accept = (key: string) => edit(() => setCh(p => ({ ...p, back: { ...(p.back || {}), accepted: [...new Set([...(p.back?.accepted || []), key])] } })));
  const setCreate = (k: string, x: TplCreate | null) => edit(() => setCreates(p => { const n = { ...p }; if (x) n[k] = x; else delete n[k]; return n; }));
  const req = () => ({ ...(file ? { file } : {}), ...(model ? { sheet: model.sheet } : {}), choices: ch, creates: Object.values(creates) });
  const dups = useMemo(() => (model ? duplicates(model, ch) : []), [model, ch]);
  const runTry = async () => { setBusy(true); const r: P = await window.api.tplTry(form, req()); setBusy(false); if (!r.ok && 'error' in r) { toast({ text: r.error }); return; } setTrial(r); };
  const goStep = (s: Step) => { setStep(s); if (s === 'try' && !trial && !busy) void runTry(); };
  const restore = async () => { const r: P = await window.api.tplRestore(form, req()); if (!r) return; if (!r.ok) { toast({ text: r.error }); return; } toast({ text: 'Αποθηκεύτηκε το αντίγραφο με τους τύπους (' + r.applied + ' κελιά): ' + r.file }); };
  const save = async () => {
    const r = await window.api.tplSave(form, req()); if (!r.ok) { toast({ text: r.error }); return; }
    await refresh(); toast({ text: 'Αποθηκεύτηκε το πρότυπο της μονάδας. Ό,τι έμαθε η εφαρμογή θα το ξέρει και στα επόμενα αρχεία.' }); setDirty(false); onSaved?.(); onClose();
  };
  const name = file ? file.split(/[\\/]/).pop() : '';
  return html`<${Dialog} size="xl" title=${'Πρότυπο μονάδας: ' + HK()} description=${model ? (name || model.file.split(/[\\/]/).pop()) + ' · φύλλο «' + model.sheet + '»' : ''} onClose=${onClose} dirty=${dirty}
    footer=${html`<span className="tm__foot">Ό,τι μένει άγνωστο δεν γράφεται στο αρχείο, και η εφαρμογή σου το λέει κάθε φορά που βγάζεις ${HK()}.</span>
      <${Button} variant="outline" disabled=${!model || model.noFront} onClick=${() => goStep('try')}>Δοκιμαστικό γέμισμα με τα σημερινά<//>
      <${Button} disabled=${!model || model.noFront || dups.length > 0} why=${dups.length ? 'Δύο στήλες μετρούν το ίδιο' : 'Δεν υπάρχει πίνακας στο αρχείο'} onClick=${save}>Αποθήκευση προφίλ μονάδας<//>`}>
    ${err ? html`<${Alert} tone="bad"><span>${err}</span><//>` : !model ? html`<p className="note">Διαβάζεται το αρχείο… (ένα παλιό .xls μετατρέπεται πρώτα με το Excel, μπορεί να πάρει λίγο)</p>`
      : html`<${TplMapBody} model=${model} ch=${ch} creates=${creates} step=${step} sel=${sel} trial=${trial} busy=${busy} onStep=${goStep} onSel=${setSel} setCol=${setCol} setRow=${setRow} setWord=${setWord} setSkip=${setSkip} setBack=${setBack} accept=${accept} setCreate=${setCreate} onTry=${runTry} onRestore=${restore}/>`}
  <//>`;
}
