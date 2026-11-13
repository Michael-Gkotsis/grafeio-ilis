// features/outs · ώρες της μέρας, διόρθωση επιστροφής ανά άτομο και ο πίνακας ωρών των Κανόνων (Michael, 24/10, 25/10).
// Οι ώρες και η λογική είναι στο shared/returns.ts· εδώ μόνο οι φόρμες.
import { html } from '../ui';
import { normTime, mins } from '../../shared/hours';
import { DOW_FULL } from '../../shared/dates';
import { defaultRow, weekRow, type WeekRow } from '../../shared/returns';
type P = any;

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

// Deprecated path: BackFixDialog moved to features/back-fix (Phase 5.3c part 2). Removed in Phase 7.
export { BackFixDialog } from '../features/back-fix';
