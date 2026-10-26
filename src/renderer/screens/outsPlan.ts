// features/outs · ώρες της μέρας, διόρθωση επιστροφής ανά άτομο και ο πίνακας ωρών των Κανόνων (Michael, 24/10, 25/10).
// Οι ώρες και η λογική είναι στο shared/returns.ts· εδώ μόνο οι φόρμες.
import { useEffect, useState } from 'react';
import { html, Button, Dialog, Why, Segmented, useToast } from '../ui';
import { useStore } from '../store';
import { DateField, TimeField } from '../common';
import { normTime, mins } from '../../shared/hours';
import { addDays, dm, weekday, DOW_FULL } from '../../shared/dates';
import { baseOf, dayTimes, defaultRow, retTxt, weekRow, type Back, type WeekRow } from '../../shared/returns';
import { shortName } from '../../shared/domain';
type P = any;

// Η μπάρα της μέρας D στους Εξοδούχους: αρχή εξόδου και επιστροφή εξοδούχων είναι της D· επιστροφή ΔΝ και εκπαίδευση είναι της επόμενης
// (η ΔΝ της D γυρνά το πρωί της D+1). Αλλάζουν μόνο γι' αυτές τις μέρες, πάνω από την ημέρα εβδομάδας των Κανόνων.
export function OutsDayBar({ date }: { date: string }) {
  const { state, run, undoMark } = useStore(); const toast = useToast();
  const nx = addDays(date, 1);
  const t = dayTimes(state, date), n = dayTimes(state, nx), bt = baseOf(state, date), bn = baseOf(state, nx);
  const cur = { out: t.out, backOut: t.backOut, backDn: n.backDn, train: n.train };
  const [v, setV] = useState(cur);
  const key = JSON.stringify(cur);
  useEffect(() => setV(cur), [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof cur, x: string | boolean) => setV(d => ({ ...d, [k]: x }));
  const nv = { out: normTime(v.out), backOut: normTime(v.backOut), backDn: normTime(v.backDn) };
  const bad = !nv.out || !nv.backOut || !nv.backDn || mins(nv.backOut) <= mins(nv.out);
  const dirty = (nv.out || v.out) !== cur.out || (nv.backOut || v.backOut) !== cur.backOut || (nv.backDn || v.backDn) !== cur.backDn || v.train !== cur.train;
  const changed = t.out !== bt.out || t.backOut !== bt.backOut || n.backDn !== bn.backDn || n.train !== bn.train;
  const go = async (plans: { date: string; plan: P }[], text: string) => {
    if (await run({ t: 'setDayPlans', plans }, false)) toast({ text, actions: [undoMark()] });
  };
  const save = () => go([
    { date, plan: { out: nv.out!, backOut: nv.backOut!, backDn: t.backDn, train: t.train } },
    { date: nx, plan: { out: n.out, backOut: n.backOut, backDn: nv.backDn!, train: v.train } }
  ], 'Αποθηκεύτηκαν οι ώρες εξόδου ' + dm(date) + ' και η επιστροφή ΔΝ ' + dm(nx));
  // επαναφορά: μόνο όσα δείχνει η μπάρα (οι άλλες ώρες των δύο μερών μένουν όπως είναι)
  const reset = [
    { date, plan: { out: bt.out, backOut: bt.backOut, backDn: t.backDn, train: t.train } },
    { date: nx, plan: { out: n.out, backOut: n.backOut, backDn: bn.backDn, train: bn.train } }
  ];
  const nxName = DOW_FULL[weekday(nx)] + (n.hol && n.hol !== 'ΣΚ' ? ' · αργία' : '');
  return html`<div className="daybar" role="group" aria-label="Ώρες της μέρας">
    <${TimeField} id="dbo" label="Αρχή εξόδου" value=${v.out} onChange=${(x: string) => set('out', x)} help=${t.over?.out ? 'άλλαξε (προεπιλογή ' + bt.out + ')' : ''}/>
    <${TimeField} id="dbb" label="Επιστροφή εξοδούχων" value=${v.backOut} onChange=${(x: string) => set('backOut', x)} help=${t.over?.backOut ? 'άλλαξε (προεπιλογή ' + bt.backOut + ')' : 'το ίδιο βράδυ'}/>
    <${TimeField} id="dbd" label=${'Επιστροφή ΔΝ · ' + nxName} value=${v.backDn} onChange=${(x: string) => set('backDn', x)} help=${n.over?.backDn ? 'άλλαξε (προεπιλογή ' + bn.backDn + ')' : 'το πρωί της επόμενης'}/>
    <div className="field"><span className="field__label">Αύριο εκπαίδευση</span>
      <${Segmented} small=${true} value=${v.train ? 'y' : 'n'} onChange=${(x: string) => set('train', x === 'y')} items=${[{ value: 'y', label: 'Ναι' }, { value: 'n', label: 'Όχι' }]}/>
      <span className="field__help">${n.over?.train != null ? 'άλλαξε (προεπιλογή ' + (bn.train ? 'ναι' : 'όχι') + ')' : n.hol && n.hol !== 'ΣΚ' ? 'αργία: ' + n.hol : ' '}</span></div>
    <div className="daybar__acts">
      ${dirty ? html`<${Button} size="sm" disabled=${bad} why=${bad ? 'Μια ώρα δεν είναι σωστή ή οι εξοδούχοι γυρνούν πριν ξεκινήσει η έξοδος' : undefined} onClick=${save}>Αποθήκευση ωρών<//><${Button} size="sm" variant="ghost" onClick=${() => setV(cur)}>Ακύρωση<//>` : null}
      ${changed && !dirty ? html`<${Button} size="sm" variant="outline" onClick=${() => go(reset, 'Οι ώρες ' + dm(date) + ' και ' + dm(nx) + ' γύρισαν στην προεπιλογή')} data-tip="Σβήνει τις αλλαγές αυτών των ωρών και ισχύουν οι ώρες της ημέρας εβδομάδας (Κανόνες)">Επαναφορά στην προεπιλογή<//>` : null}
    </div></div>`;
}

// Διόρθωση επιστροφής ενός εξοδούχου/ΔΝ: «δεν γυρνά, συνεχίζει» ή «γυρνά <μέρα> <ώρα>», με υποχρεωτικό λόγο
export function BackFixDialog({ b, date, onClose }: { b: Back; date: string; onClose: () => void }) {
  const { state, run, undoMark } = useStore(); const toast = useToast();
  const old = state.backFix?.find(f => f.pid === b.p.id && f.day === date);
  const [mode, setMode] = useState<'at' | 'stay'>(old?.stay ? 'stay' : 'at');
  const first = b.st.type === 'DN' ? addDays(date, 1) : date;
  const [day, setDay] = useState(old?.at?.day || (!b.r.pending && !b.r.open ? b.r.day : first));
  const [time, setTime] = useState(old?.at?.time || (b.r.time || '06:00'));
  const [why, setWhy] = useState(old?.why || '');
  const t = normTime(time);
  const problem = !why.trim() ? 'Γράψε τον λόγο της διόρθωσης' : mode === 'at' && !t ? 'Η ώρα επιστροφής δεν είναι σωστή' : mode === 'at' && day < first ? 'Η επιστροφή είναι πριν από την έξοδο' : '';
  const save = async () => {
    if (await run({ t: 'setBackFix', pid: b.p.id, day: date, ...(mode === 'stay' ? { stay: true } : { at: { day, time: t! } }), why }, false)) { onClose(); toast({ text: 'Διόρθωση επιστροφής ' + shortName(b.p), actions: [undoMark()] }); }
  };
  const del = async () => { if (old && await run({ t: 'delBackFix', id: old.id }, false)) { onClose(); toast({ text: 'Η επιστροφή ' + shortName(b.p) + ' πάλι βγαίνει αυτόματα', actions: [undoMark()] }); } };
  return html`<${Dialog} title=${'Διόρθωση επιστροφής · ' + shortName(b.p)} description=${'Τώρα: ' + retTxt(b.r)} onClose=${onClose}
    footer=${html`<${Why} text=${problem}/>${old ? html`<${Button} variant="ghost" onClick=${del} data-tip="Σβήνει τη διόρθωση και η επιστροφή βγαίνει πάλι από τους κανόνες">Πίσω στο αυτόματο<//>` : null}<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!!problem} why=${problem} onClick=${save}>Αποθήκευση<//>`}>
    <p className="note" style=${{ marginTop: 0 }}>Για ό,τι άλλαξε προφορικά και δεν βγαίνει από τις δηλώσεις. Μπαίνει στο Ιστορικό και αναιρείται.</p>
    <div className="field"><${Segmented} value=${mode} onChange=${setMode} items=${[{ value: 'at', label: 'Γυρνά…' }, { value: 'stay', label: 'Δεν γυρνά, συνεχίζει' }]}/></div>
    ${mode === 'at' ? html`<div className="field-row">
      <div className="field"><label className="field__label" htmlFor="bfd">Μέρα</label><${DateField} id="bfd" className="ui-input" min=${first} value=${day} onChange=${(e: any) => setDay(e.target.value)}/></div>
      <${TimeField} id="bft" label="Ώρα" value=${time} onChange=${setTime}/></div>` : null}
    <div className="field"><label className="field__label" htmlFor="bfw">Λόγος (υποχρεωτικό)</label><input id="bfw" className="ui-input" maxLength=${120} placeholder="π.χ. εξετάσεις, το είπε ο λοχαγός" value=${why} onChange=${(e: any) => setWhy(e.target.value)}/></div>
  <//>`;
}

// Πίνακας των Κανόνων: 7 ημέρες × (αρχή εξόδου, επιστροφή εξοδούχων, επιστροφή ΔΝ, εκπαίδευση το πρωί). rows: κείμενα ώρας (φόρμα), onChange(w, πεδίο, τιμή)
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export type WeekDraft = Record<number, { out: string; backOut: string; backDn: string; train: boolean }>;
export const weekDraft = (rules: P): WeekDraft => Object.fromEntries(WEEK_ORDER.map(w => [w, weekRow(rules, w)])) as WeekDraft;
// Κάθε ημέρα: οι ώρες σε κανονική μορφή, ή null αν κάποια δεν είναι σωστή ή οι εξοδούχοι γυρνούν πριν ξεκινήσει η έξοδος
export function weekIssue(d: WeekDraft): string {
  for (const w of WEEK_ORDER) {
    const x = d[w], o = normTime(x.out), b = normTime(x.backOut);
    if (!o || !b || !normTime(x.backDn)) return DOW_FULL[w] + ': μια ώρα δεν είναι σωστή (π.χ. 17:00)';
    if (mins(b) <= mins(o)) return DOW_FULL[w] + ': οι εξοδούχοι πρέπει να γυρνούν μετά την αρχή της εξόδου';
  }
  return '';
}
export function WeekTable({ draft, onChange }: { draft: WeekDraft; onChange: (w: number, k: keyof WeekRow, v: string | boolean) => void }) {
  const cell = (w: number, k: 'out' | 'backOut' | 'backDn', label: string) => {
    const bad = normTime(draft[w][k]) == null || normTime(draft[w][k]) === '';
    return html`<td><input className="ui-input weekt__in" inputMode="numeric" aria-label=${label + ' ' + DOW_FULL[w]} aria-invalid=${bad || undefined} placeholder=${defaultRow(w)[k]} value=${draft[w][k]}
      onChange=${(e: any) => onChange(w, k, e.target.value)} onBlur=${() => { const t = normTime(draft[w][k]); if (t && t !== draft[w][k]) onChange(w, k, t); }}/></td>`;
  };
  return html`<table className="weekt"><thead><tr><th>Ημέρα</th><th>Αρχή εξόδου</th><th>Επιστροφή εξοδούχων</th><th>Επιστροφή ΔΝ</th><th>Εκπαίδευση το πρωί</th></tr></thead>
    <tbody>${WEEK_ORDER.map(w => html`<tr key=${w}><th scope="row">${DOW_FULL[w]}</th>${cell(w, 'out', 'Αρχή εξόδου')}${cell(w, 'backOut', 'Επιστροφή εξοδούχων')}${cell(w, 'backDn', 'Επιστροφή ΔΝ')}
      <td><input type="checkbox" className="ui-check" aria-label=${'Εκπαίδευση το πρωί ' + DOW_FULL[w]} checked=${draft[w].train} onChange=${(e: any) => onChange(w, 'train', e.target.checked)}/></td></tr>`)}</tbody></table>`;
}
