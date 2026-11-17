// «Επικεφαλίδα: X ★» τη στιγμή που βγαίνει ένα έγγραφο (Michael, 13/11): αλλάζει μόνο για αυτή τη φορά.
// Δείχνεται μόνο όταν το έγγραφο έχει πάνω από μία επικεφαλίδα διαθέσιμη (Ρυθμίσεις › Επικεφαλίδες εγγράφων › Πού μπαίνει).
import { useCallback, useId, useRef, useState } from 'react';
import { html } from './ui';
import { Select } from './select';
import { useStore } from './store';
import { headName, headPickOf, headPickShown, type HeadUse } from '../shared/docHead';
import type { SigForm } from '../shared/sigs';
type P = any;

export const HEAD_PICK_HINT = 'Αλλάζει μόνο για αυτή τη φορά. Η αρχική (★) ορίζεται στις Ρυθμίσεις › Επικεφαλίδες εγγράφων.';

// value: η επιλογή αυτής της φοράς (undefined = η αρχική)· onChange παίρνει undefined όταν ξαναδιαλέξεις την αρχική
export function HeadPick({ form, own, value, onChange, hint = false, id = 'headpick' }: { form: SigForm; own?: string; value?: string; onChange: (v: string | undefined) => void; hint?: boolean; id?: string }) {
  const { state } = useStore(); const st = state.settings;
  const u: HeadUse = headPickOf(st, form, own);
  if (!headPickShown(u)) return null;
  const cur = value && u.on.includes(value) ? value : u.def;
  return html`<span className="headpick" data-tip=${HEAD_PICK_HINT}>
    <label className="headpick__l" htmlFor=${id}>Επικεφαλίδα:</label>
    <${Select} id=${id} className="ui-select" value=${cur} onChange=${(e: P) => onChange(e.target.value === u.def ? undefined : e.target.value)}>${u.on.map(x => html`<option key=${x} value=${x}>${headName(st, x)}${x === u.def ? ' ★' : ''}</option>`)}<//>
    ${hint && html`<small className="headpick__h">${HEAD_PICK_HINT}</small>`}
  </span>`;
}
// Η επιλογή αυτής της φοράς: take() τη δίνει και την ξεχνά (το επόμενο έγγραφο ξαναρχίζει με την αρχική)
export function useHeadPick(form: SigForm, own?: string): { node: any; headId: string | undefined; take: () => string | undefined } {
  const [v, setV] = useState<string | undefined>(); const uid = useId(); const ref = useRef<string | undefined>();
  ref.current = v;
  const take = useCallback(() => { const x = ref.current; if (x !== undefined) setV(undefined); return x; }, []);
  return { node: html`<${HeadPick} form=${form} own=${own} value=${v} onChange=${setV} id=${'hp' + uid.replace(/:/g, '')}/>`, headId: v, take };
}
