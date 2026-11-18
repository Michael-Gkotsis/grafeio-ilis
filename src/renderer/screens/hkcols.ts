// Ρυθμίσεις › Μονάδα και έντυπα › «Δικές μου στήλες» (Michael, 17/11): στήλες της ΗΚΑΙ που προσθέτεις εσύ, δίπλα στις «Γραμμές της ΗΚΑΙ».
// Κάθε στήλη μπαίνει στο τέλος της ομάδας της (Κωλυόμενοι ή Απόντες), ακριβώς πριν από το σύνολό της, στην εφαρμογή και στο Excel.
// Τη διαλέγεις στη φόρμα της υπηρεσίας, στα είδη άδειας και στη δήλωση κωλυόμενου· ό,τι τη χρησιμοποιεί μετρά εκεί (shared/hkCols.ts).
import { useEffect, useState } from 'react';
import { html, Alert, Button, Card, Segmented, useToast } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { usePending } from '../pending';
import { HK_COLS_MAX, hkColsOf, typeHkChoices, typeHkOf, type UserLists } from '../../shared/ranks';
import { KOL_COLS, TYPES, kolColsOf, stepColOf, type TypeKey } from '../../shared/domain';
import { HK_COL_NAME_MAX, HK_COL_SHORT_MAX, type HkColInput } from '../../shared/hkCols';
import { HK } from '../../shared/unit';
type P = any;

const GRP: ['kol' | 'abs', string][] = [['kol', 'Κωλυόμενοι'], ['abs', 'Απόντες']];

export function HkColsCard() {
  const { state, run } = useStore(); const toast = useToast();
  const lists = state.settings.lists; const saved: HkColInput[] = hkColsOf(lists).map(x => ({ key: x.key, name: x.name, grp: x.grp, short: x.short || '' }));
  const [rows, setRows] = useState<HkColInput[]>(saved); const [err, setErr] = useState<string | null>(null);
  const sig = JSON.stringify(saved); useEffect(() => { setRows(saved); setErr(null); }, [sig]);
  const dirty = JSON.stringify(rows) !== sig;
  const set = (i: number, patch: Partial<HkColInput>) => { setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x))); setErr(null); };
  const save = async () => {
    const ok = await run({ t: 'setHkCols', cols: rows.map(x => ({ ...x, name: x.name.trim() })) }, false);
    if (ok) { toast({ text: 'Οι δικές σου στήλες της ' + HK() + ' αποθηκεύτηκαν.' }); setErr(null); }
    return !!ok;
  };
  usePending(dirty, { label: 'Δικές μου στήλες', save, discard: () => setRows(saved) });
  const gone = saved.filter(x => !rows.some(r => r.key === x.key));
  return html`<${Card} title="Δικές μου στήλες">
    <p className="note" style=${{ marginTop: 0 }}>Η νέα στήλη μπαίνει στο τέλος της ομάδας της, ακριβώς πριν από το «Σύνολο απόντων» ή το «Σύνολο κωλυομένων». Ο τύπος του συνόλου και οι «Διαθέσιμοι» τη μετράνε.</p>
    ${rows.length === 0 && html`<p className="muted">Δεν έχεις δικές σου στήλες. Η ${HK()} βγαίνει όπως το έντυπο.</p>`}
    ${rows.map((x, i) => html`<div key=${x.key || 'n' + i} className="field-row" style=${{ alignItems: 'flex-end' }}>
      <div className="field" style=${{ flex: '2 1 200px' }}><label className="field__label" htmlFor=${'hc-n' + i}>Όνομα</label><input id=${'hc-n' + i} className="ui-input" maxLength=${HK_COL_NAME_MAX} placeholder="π.χ. Καραντίνα" value=${x.name} onChange=${(e: P) => set(i, { name: e.target.value })}/></div>
      <div className="field" style=${{ flex: 'none' }}><span className="field__label">Ομάδα</span><${Segmented} value=${x.grp} onChange=${(grp: 'kol' | 'abs') => set(i, { grp })} items=${GRP.map(([v, l]) => ({ value: v, label: l }))}/></div>
      <div className="field" style=${{ flex: '1 1 110px' }}><label className="field__label" htmlFor=${'hc-s' + i}>Συντομία</label><input id=${'hc-s' + i} className="ui-input" maxLength=${HK_COL_SHORT_MAX} placeholder="προαιρετικό" value=${x.short || ''} onChange=${(e: P) => set(i, { short: e.target.value })}/></div>
      <${Button} size="sm" variant="ghost" onClick=${() => { setRows(rows.filter((_, j) => j !== i)); setErr(null); }}>Διαγραφή<//>
    </div>`)}
    ${gone.length > 0 && html`<${Alert} tone="warn"><span>Θα σβηστεί${gone.length > 1 ? 'ν οι στήλες ' : ' η στήλη '}${gone.map(x => '«' + x.name + '»').join(', ')}. Ό,τι τη χρησιμοποιούσε (υπηρεσίες, είδη άδειας, δηλώσεις) γυρνά στην προεπιλογή του και το Ιστορικό το γράφει· κανείς δεν χάνεται από την ${HK()}.</span><//>`}
    ${err && html`<${Alert} tone="bad"><span>${err}</span><//>`}
    <div className="toolbar">
      <${Button} size="sm" variant="outline" disabled=${rows.length >= HK_COLS_MAX} why=${'Το πολύ ' + HK_COLS_MAX + ' δικές σου στήλες'} onClick=${() => setRows([...rows, { name: '', grp: 'kol', short: '' }])}>+ Νέα στήλη<//>
      ${dirty && html`<${Button} size="sm" onClick=${save}>Αποθήκευση<//><${Button} size="sm" variant="ghost" onClick=${() => { setRows(saved); setErr(null); }}>Άκυρο<//>`}
    </div>
  <//>`;
}

// Ρυθμίσεις › Μονάδα και έντυπα › «Στήλη ΗΚΑΙ ανά κατάσταση»: σε ποια στήλη της ΗΚΑΙ μετρά κάθε βασική κατάσταση (προεπιλογή: όπως πάντα) και η στήλη του ΣΤΕΠ.
// Αλλάζει αμέσως, με αναίρεση· στο lists.typeCols μένουν μόνο όσες άλλαξες. Μια στήλη της ίδιας ομάδας (κωλυόμενοι ή απόντες), βασική ή δική σου.
const TYPE_COL_KEYS: TypeKey[] = ['EY', 'PUN', 'NOS', 'LEAVE', 'HON', 'SICK', 'AGN', 'LIP', 'ADK'];
export function TypeColsCard() {
  const { state, run } = useStore();
  const lists: UserLists = state.settings.lists || {}; const step = stepColOf(lists, null) || '';
  const set = (patch: Partial<UserLists>, text: string) => {
    const next: UserLists = { ...lists, ...patch };
    if (!next.stepCol) delete next.stepCol; if (next.typeCols && !Object.keys(next.typeCols).length) delete next.typeCols;
    return run({ t: 'setSettings', settings: { lists: next }, text: text + ' (' + HK() + ')' }, false);
  };
  const pickType = (k: TypeKey, col: string) => {
    const cur = { ...(lists.typeCols || {}) }; if (!col || col === TYPES[k].hkai) delete cur[k]; else cur[k] = col;
    return set({ typeCols: cur }, 'στήλη «' + TYPES[k].label + '»: ' + (hkLabel(typeHkChoices(k, lists), col || TYPES[k].hkai!)));
  };
  const hkLabel = (opts: [string, string][], c: string) => opts.find(x => x[0] === c)?.[1] || c;
  const stepOpts = kolColsOf(lists);
  return html`<${Card} title=${'Στήλη ' + HK() + ' ανά κατάσταση'}>
    <p className="note" style=${{ marginTop: 0 }}>Σε ποια στήλη της ${HK()} μετρά κάθε κατάσταση. Αν δεν αλλάξεις τίποτα, μετρά όπως πάντα. Διαλέγεις στήλη από την ίδια ομάδα με την προεπιλογή της (κωλυόμενοι ή απόντες), και τις δικές σου στήλες. Οι άδειες δικού σου είδους έχουν τη στήλη τους στις Λίστες › Είδη άδειας.</p>
    <div className="field-row" style=${{ alignItems: 'flex-end' }}>
      <div className="field" style=${{ flex: '1 1 260px' }}><label className="field__label" htmlFor="tc-step">Στήλη ${HK()} για ΣΤΕΠ</label>
        <${Select} id="tc-step" className="ui-select" value=${step} onChange=${(e: any) => set({ stepCol: e.target.value || undefined }, 'στήλη για ΣΤΕΠ: ' + (e.target.value ? hkLabel(stepOpts, e.target.value) : 'πουθενά'))}>
          <option value="">Πουθενά</option>${stepOpts.map(([k, n]) => html`<option key=${k} value=${k}>${KOL_COLS.some(x => x[0] === k) ? n : n + ' (δική σου στήλη)'}</option>`)}<//></div>
    </div>
    <p className="note" style=${{ marginTop: 0 }}>«Πουθενά»: ο ΣΤΕΠ είναι κωλυόμενος στη Δύναμη και στο Σήμερα, αλλά δεν μετρά σε στήλη της ${HK()}.</p>
    ${TYPE_COL_KEYS.map(k => {
      const opts = typeHkChoices(k, lists), cur = typeHkOf(k, lists)!;
      return html`<div key=${k} className="field-row" style=${{ alignItems: 'flex-end' }}>
        <div className="field" style=${{ flex: '1 1 260px' }}><label className="field__label" htmlFor=${'tc-' + k}>${k === 'LEAVE' ? 'Κανονική άδεια, ΑΜΔ, ΥΕΘΑ' : TYPES[k].long}</label>
          <${Select} id=${'tc-' + k} className="ui-select" value=${cur} onChange=${(e: any) => pickType(k, e.target.value)}>${opts.map(([c, n]) => html`<option key=${c} value=${c}>${n}${c === TYPES[k].hkai ? ' (προεπιλογή)' : ''}</option>`)}<//></div>
      </div>`;
    })}
  <//>`;
}
