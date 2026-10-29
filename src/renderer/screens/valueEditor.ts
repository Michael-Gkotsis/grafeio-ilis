// Έντυπα › πίνακες τιμών (Michael, 24/10): ο επεξεργαστής στο βήμα 3. Κάθε γραμμή έχει δικό σου κείμενο και έναν υπολογισμό από τον κατάλογο
// μετρήσεων (shared/values.ts): όροι με + ή −, φίλτρο ανά όρο, προαιρετικά «ως ποσοστό του…». Η στιγμή μέτρησης είναι κοινή για όλους τους πίνακες.
import { useMemo, useState } from 'react';
import { html, cx, Button, Icon } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { TimeField } from '../common';
import { normTime } from '../../shared/hours';
import { HK } from '../../shared/unit';
import { hkMin, outMin } from '../../shared/rules';
import { AT_CUSTOM, FMTS, exprText, filterChoices, filterText, fmtOf, hasFilter, hhmm, metricGroups, metricOf, newRow, rowTag, tagId, tagText, tagsOf, type VFilter, type VRow, type VTerm } from '../../shared/values';
import { tagKey } from '../../shared/reports';
import { upper } from '../../shared/text';
import type { AppState } from '../../shared/domain';
type P = any;

// Ο κατάλογος μετρήσεων σε λίστα με αναζήτηση, ομαδοποιημένος όπως στο registry. Μέτρηση που χάθηκε φαίνεται ως τέτοια
function MetricSelect({ s, value, onChange, label }: P) {
  const groups = useMemo(() => metricGroups(s), [s.settings]);   // eslint-disable-line react-hooks/exhaustive-deps
  const m = metricOf(s, value);
  return html`<${Select} className=${cx('ui-select vt-metric', !m && 'is-off')} search=${true} aria-label=${label} data-tip=${m?.tip} value=${value} onChange=${onChange}>
    ${!m && html`<option value=${value}>(δεν υπάρχει πια)</option>`}
    ${groups.map(g => html`<optgroup key=${g.group} label=${g.group}>${g.items.map(x => html`<option key=${x.id} value=${x.id}>${x.label}</option>`)}</optgroup>`)}
  <//>`;
}

const ARM = [['', 'Όλοι'], ['armed', 'Ένοπλοι'], ['unarmed', 'Άοπλοι']];
const WHO = [['', 'Στρατιώτες και στελέχη'], ['soldiers', 'Μόνο στρατιώτες'], ['cadre', 'Μόνο στελέχη']];
function FilterEditor({ s, f, set }: P) {
  const ch = useMemo(() => filterChoices(s), [s.people, s.cadreList, s.settings]);   // eslint-disable-line react-hooks/exhaustive-deps
  const put = (x: Partial<VFilter>) => {
    const y: Record<string, unknown> = { ...f, ...x }; for (const k in y) if (y[k] === '' || y[k] == null) delete y[k];
    set(Object.keys(y).length ? y : undefined);
  };
  return html`<span className="vt-filter">
    <${Select} className="ui-select" aria-label="Ουλαμός" value=${f?.unit ?? ''} onChange=${(e: P) => put({ unit: e.target.value })}><option value="">Όλοι οι ουλαμοί</option>${ch.units.map(u => html`<option key=${u} value=${u}>${u}</option>`)}<//>
    <${Select} className="ui-select" aria-label="Θάλαμος" value=${f?.room != null ? String(f.room) : ''} onChange=${(e: P) => put({ room: e.target.value === '' ? undefined : +e.target.value })}><option value="">Όλοι οι θάλαμοι</option>${ch.rooms.map(n => html`<option key=${n} value=${String(n)}>Θάλαμος ${n}</option>`)}<//>
    <${Select} className="ui-select" aria-label="Βαθμός" value=${f?.rank ?? ''} onChange=${(e: P) => put({ rank: e.target.value })}><option value="">Όλοι οι βαθμοί</option>${ch.ranks.map(r => html`<option key=${r} value=${r}>${r}</option>`)}<//>
    <${Select} className="ui-select" aria-label="Οπλισμός" value=${f?.arm ?? ''} onChange=${(e: P) => put({ arm: e.target.value })}>${ARM.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}<//>
    <${Select} className="ui-select" aria-label="Στρατιώτες ή στελέχη" value=${f?.who ?? ''} onChange=${(e: P) => put({ who: e.target.value })}>${WHO.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}<//>
  </span>`;
}

// Οι όροι ενός υπολογισμού: [±] μέτρηση [φίλτρο] [✕]· «+ Όρος». Όροι «−» αφαιρούν όσους είναι στους όρους «+» (κάθε άτομο μία φορά)
function Terms({ s, terms, set, id, min }: P) {
  const put = (i: number, x: Partial<VTerm>) => set(terms.map((t: VTerm, j: number) => (j === i ? { ...t, ...x } : t)));
  const [open, setOpen] = useState<number[]>(() => terms.map((t: VTerm, i: number) => (hasFilter(t.filter) ? i : -1)).filter((i: number) => i >= 0));
  const toggle = (i: number) => setOpen(o => (o.includes(i) ? o.filter(x => x !== i) : [...o, i]));
  return html`<div className="vt-terms">
    ${terms.map((t: VTerm, i: number) => {
      const num = metricOf(s, t.metric)?.kind === 'num'; const shown = open.includes(i) && !num;
      return html`<div key=${i} className="vt-term">
        <button type="button" className=${cx('vt-sign', t.sign === '-' && 'is-minus')} aria-label=${'Πρόσημο του όρου ' + (i + 1) + ': ' + (t.sign === '-' ? 'μείον' : 'συν')} data-tip=${t.sign === '-' ? 'Αφαιρεί όσους μετρά αυτός ο όρος. Πάτα για +' : 'Προσθέτει (κάθε άτομο μία φορά). Πάτα για −'} onClick=${() => put(i, { sign: t.sign === '-' ? '+' : '-' })}>${t.sign === '-' ? '−' : '+'}</button>
        <${MetricSelect} s=${s} value=${t.metric} label=${'Μέτρηση του όρου ' + (i + 1)} onChange=${(e: P) => put(i, { metric: e.target.value })}/>
        <${Button} size="sm" variant="ghost" aria-pressed=${shown} disabled=${num} why="Αριθμός (όχι άτομα): δεν φιλτράρεται" data-tip="Μόνο ουλαμός, θάλαμος, βαθμός, ένοπλοι ή στελέχη από αυτή τη μέτρηση" onClick=${() => toggle(i)}>Φίλτρο${!num && hasFilter(t.filter) ? ': ' + filterText(t.filter) : ''}<//>
        <${Button} size="icon" variant="ghost" aria-label=${'Βγάλε τον όρο ' + (i + 1)} disabled=${terms.length <= min} why="Χρειάζεται τουλάχιστον ένας όρος" onClick=${() => { set(terms.filter((_: VTerm, j: number) => j !== i)); setOpen(o => o.filter(x => x !== i).map(x => (x > i ? x - 1 : x))); }}>${Icon.x}<//>
        ${shown && html`<${FilterEditor} s=${s} f=${t.filter} set=${(filter?: VFilter) => set(terms.map((x: VTerm, j: number) => { if (j !== i) return x; const { filter: _, ...rest } = x; return filter ? { ...rest, filter } : rest; }))}/>`}
      </div>`;
    })}
    <${Button} size="sm" variant="outline" disabled=${terms.length >= 8} why="Ως 8 όροι" id=${id} onClick=${() => set([...terms, { sign: '+', metric: 'str.total' }])}>+ Όρος<//>
  </div>`;
}

function RowEditor({ s, row, n, set, del, move, last, tid, bad }: P) {
  const pct = !!row.percentOf?.length; const tg = rowTag(row);
  return html`<li className="vt-row">
    <div className="vt-row__top">
      <input className="ui-input vt-label" aria-label=${'Κείμενο της γραμμής ' + n} placeholder="Κείμενο της γραμμής (π.χ. Παρόντες)" value=${row.label} onChange=${(e: P) => set({ ...row, label: e.target.value })}/>
      <${Select} className="ui-select vt-fmt" aria-label=${'Μορφή τιμής της γραμμής ' + n} value=${fmtOf(row)} onChange=${(e: P) => set({ ...row, fmt: e.target.value })}>${FMTS.map(f => html`<option key=${f.id} value=${f.id}>${f.label}</option>`)}<//>
      <span className="rep-cols__mv"><${Button} size="icon" variant="ghost" aria-label="Πάνω" disabled=${n === 1} onClick=${() => move(-1)}>${Icon.up}<//><${Button} size="icon" variant="ghost" aria-label="Κάτω" disabled=${last} onClick=${() => move(1)}>${Icon.down}<//>
        <${Button} size="icon" variant="ghost" aria-label=${'Βγάλε τη γραμμή ' + n} onClick=${del}>${Icon.x}<//></span>
    </div>
    <${Terms} s=${s} terms=${row.expr} min=${1} set=${(expr: VTerm[]) => set({ ...row, expr })}/>
    <label className="ui-checkrow vt-pct"><input type="checkbox" className="ui-check" checked=${pct} onChange=${(e: P) => {
      const { percentOf: _p, fmt: _f, ...rest } = row;
      set(e.target.checked ? { ...rest, percentOf: [{ sign: '+', metric: 'str.total' }] } : rest);
    }}/>ως ποσοστό του…</label>
    ${pct && html`<div className="vt-den"><${Terms} s=${s} terms=${row.percentOf} min=${1} set=${(percentOf: VTerm[]) => set({ ...row, percentOf })}/></div>`}
    <small className="vt-sum muted">${row.expr.length ? exprText(s, row.expr) + (pct ? '  ÷  ' + exprText(s, row.percentOf) : '') : ''}</small>
    <div className="vt-tag">
      <label className="field__label" htmlFor=${tid}>Ετικέτα στο Excel</label>
      <input id=${tid} className=${cx('ui-input vt-tag__in', bad && 'is-bad')} aria-invalid=${bad ? 'true' : undefined} placeholder=${tagText(row.label) || 'ΟΝΟΜΑ'} value=${row.tag ?? ''}
        onChange=${(e: P) => { const v = upper(e.target.value).replace(/[{}]/g, ''); const { tag: _t, ...rest } = row; set(v ? { ...rest, tag: v } : rest); }}
        onBlur=${() => { if (row.tag != null) { const { tag: _t, ...rest } = row; set(tagText(row.tag) ? { ...rest, tag: tagText(row.tag) } : rest); } }}/>
      <small className=${cx('muted', bad && 'vt-tag__bad')}>${bad ? bad : tg ? 'Γράψε {' + tg + '} σε ένα κελί του Excel σου και μπαίνει εκεί ο αριθμός.' : 'Γράψε κείμενο στη γραμμή για να έχει ετικέτα.'}</small>
    </div>
  </li>`;
}

// Στιγμή μέτρησης (κοινή για όλους τους πίνακες τιμών του εντύπου): χωρίς επιλογή, όπως η Δύναμη της μέρας
export function AtPick({ at, set }: P) {
  const { state } = useStore();
  const v = at == null ? '' : AT_CUSTOM.test(at) ? '#c' : at;
  const [txt, setTxt] = useState(at && AT_CUSTOM.test(at) ? at : '');   // η ώρα όπως γράφεται (έγκυρη μόνο όταν είναι ΩΩ:ΛΛ)
  return html`<div className="rep-opts vt-at"><label className="field__label" htmlFor="vt-at">Στιγμή μέτρησης</label>
    <${Select} id="vt-at" className="ui-select" value=${v} onChange=${(e: P) => { const x = e.target.value; set(x === '' ? undefined : x === '#c' ? (setTxt(hhmm(hkMin(state.rules))), hhmm(hkMin(state.rules))) : x); }}>
      <option value="">Όπως η Δύναμη της μέρας</option><option value="hkai">Ώρα ${HK()} (${hhmm(hkMin(state.rules))})</option><option value="out">Ώρα εξόδου (${hhmm(outMin(state.rules))})</option><option value="now">Τώρα (την ώρα που βγαίνει)</option><option value="#c">Συγκεκριμένη ώρα…</option><//>
    ${v === '#c' && html`<${TimeField} id="vt-time" label="Ώρα" value=${txt} onChange=${(x: string) => { setTxt(x); const n = normTime(x); if (n && AT_CUSTOM.test(n)) set(n); }}/>`}
    <span className="field__help">Ισχύει για όλους τους πίνακες τιμών του εντύπου· καθορίζει ποιος είναι εξοδούχος, ΔΝ ή παρών εκείνη την ώρα.</span>
  </div>`;
}

// Ο πίνακας τιμών n: τίτλος (προαιρετικός), γραμμές, και η στιγμή μέτρησης
export function ValueTableEditor({ t, n, set, del, at, setAt, all, lay, upload }: P) {
  const { state } = useStore(); const s: AppState = state;
  // ετικέτες που δεν κάνουν: διπλές στο έντυπο ή ίδιες με στοιχείο εντύπου ({ΣΥΝΟΛΟ}…)
  const tg = useMemo(() => tagsOf(all || [t], id => !!tagKey(id)), [all, t]);   // eslint-disable-line react-hooks/exhaustive-deps
  const badOf = (r: VRow, i: number): string => {
    const x = rowTag(r); if (!x || !r.expr.length) return '';
    if (tg.taken.includes(x)) return 'Η {' + x + '} είναι ήδη στοιχείο εντύπου: γράψε άλλη ετικέτα.';
    const e = tg.map.get(tagId(x)); return e && (e.t.id !== t.id || e.i !== i) ? 'Η {' + x + '} υπάρχει ήδη σε άλλη γραμμή: γράψε άλλη ετικέτα.' : '';
  };
  const setRow = (i: number, r: VRow) => set({ ...t, rows: t.rows.map((x: VRow, j: number) => (j === i ? r : x)) });
  const move = (i: number, by: number) => { const rs = [...t.rows]; const j = i + by; if (j < 0 || j >= rs.length) return; [rs[i], rs[j]] = [rs[j], rs[i]]; set({ ...t, rows: rs }); };
  return html`<div className="stack vt-ed">
    <div className="field-row">
      <div className="field"><label className="field__label" htmlFor=${'vt-title' + n}>Τίτλος πάνω από τον πίνακα τιμών</label><input id=${'vt-title' + n} className="ui-input" placeholder="π.χ. ΔΥΝΑΜΗ (κενό: χωρίς τίτλο)" value=${t.title || ''} onChange=${(e: P) => set({ ...t, title: e.target.value })}/></div>
      <div className="field" style=${{ flex: 'none' }}><span className="field__label"> </span><${Button} variant="ghost" aria-label="Βγάλε τον πίνακα τιμών" onClick=${del}>${Icon.x}Βγάλε τον πίνακα<//></div>
    </div>
    <p className="note" style=${{ margin: 0 }}>Κάθε γραμμή γράφει το κείμενό σου αριστερά και έναν αριθμό δεξιά. ${upload ? 'Μπαίνει στο τέλος του εντύπου, ή όπου γράψεις την ετικέτα της γραμμής (π.χ. {ΠΑΡΟΝΤΕΣ}) μέσα στο Excel σου.' : 'Μπαίνει κάτω από τους πίνακες ατόμων και πριν τις υπογραφές, ή δίπλα σε πίνακα (από τη «Διάταξη πινάκων» δεξιά).'} Οι αριθμοί βγαίνουν από τα ίδια στοιχεία με τις οθόνες (Δύναμη, ${HK()}, Οπλισμός…).</p>
    ${lay}
    ${upload && html`<label className="ui-checkrow" data-tip="Για δικό σου πρότυπο Excel: οι αριθμοί μπαίνουν μόνο στα κελιά με ετικέτα (π.χ. {ΠΑΡΟΝΤΕΣ}), χωρίς να γραφτεί πίνακας"><input type="checkbox" className="ui-check" checked=${!!t.tagsOnly} onChange=${(e: P) => { const { tagsOnly: _o, ...rest } = t; set(e.target.checked ? { ...rest, tagsOnly: true } : rest); }}/>Μόνο στα κελιά του Excel με ετικέτα (χωρίς να γραφτεί πίνακας)</label>`}
    <${AtPick} at=${at} set=${setAt}/>
    <ul className="vt-rows">${t.rows.map((r: VRow, i: number) => html`<${RowEditor} key=${i} s=${s} row=${r} n=${i + 1} tid=${'vt-tag' + n + '-' + i} bad=${badOf(r, i)} last=${i === t.rows.length - 1} set=${(x: VRow) => setRow(i, x)} move=${(by: number) => move(i, by)} del=${() => set({ ...t, rows: t.rows.length > 1 ? t.rows.filter((_: VRow, j: number) => j !== i) : [newRow()] })}/>`)}</ul>
    <div><${Button} size="sm" variant="outline" disabled=${t.rows.length >= 30} why="Ως 30 γραμμές" onClick=${() => set({ ...t, rows: [...t.rows, newRow()] })}>+ Γραμμή<//></div>
  </div>`;
}
