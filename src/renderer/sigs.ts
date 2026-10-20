// Υπογραφές (Michael, 20/10): η λίστα ενός εντύπου, από αριστερά προς τα δεξιά. Ίδια στις Ρυθμίσεις και τη στιγμή που
// βγαίνει ένα έντυπο («Υπογραφές…» δίπλα στο «Βγάλε το Excel»).
import { useState } from 'react';
import { html, Button, Dialog, Icon } from './ui';
import { Combo, Select } from './select';
import { useStore } from './store';
import { ARTS, artOf, sigTitles, sigsClean, type Sig } from '../shared/sigs';
import { unitKindOf, unitText } from '../shared/unit';
type P = any;

// Η λίστα με αλλαγές: λέξη από πάνω, θέση, όνομα, ← → για τη σειρά, ✕ για αφαίρεση
export function SigEditor({ value, onChange, id = 'sg' }: { value: Sig[]; onChange: (v: Sig[]) => void; id?: string }) {
  const { state } = useStore(); const kind = unitKindOf(state.settings);
  const set = (i: number, patch: Partial<Sig>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => { const v = [...value]; const [x] = v.splice(i, 1); v.splice(i + d, 0, x); onChange(v); };
  const titles = sigTitles(state.settings);
  return html`<div className="sigs">
    ${value.length ? html`<ol className="sigs__list">${value.map((x, i) => html`<li key=${i} className="sigs__row">
      <span className="sigs__n" data-tip="Σειρά από αριστερά προς τα δεξιά">${i + 1}</span>
      <${Select} className="ui-select" aria-label=${'Λέξη από πάνω, υπογραφή ' + (i + 1)} value=${x.art} onChange=${(e: P) => set(i, { art: e.target.value })}>${ARTS.map(a => html`<option key=${a} value=${a}>${a || '(χωρίς)'}</option>`)}<//>
      <${Combo} className="ui-input sigs__title" options=${titles} aria-label=${'Θέση, υπογραφή ' + (i + 1)} placeholder="π.χ. ΔΚΤΗΣ ΙΛΗΣ" value=${unitText(x.title, kind)}
        onChange=${(e: P) => set(i, { title: e.target.value, ...(!x.title && !x.name ? { art: artOf(e.target.value) } : {}) })}/>
      <input className="ui-input sigs__name" aria-label=${'Όνομα κάτω από την υπογραφή ' + (i + 1)} placeholder="Όνομα (προαιρετικό)" value=${x.name || ''} onChange=${(e: P) => set(i, { name: e.target.value })}/>
      <span className="sigs__acts"><${Button} size="icon" variant="ghost" aria-label="Μία θέση αριστερά" data-tip="Πιο αριστερά" disabled=${i === 0} onClick=${() => move(i, -1)}>←<//><${Button} size="icon" variant="ghost" aria-label="Μία θέση δεξιά" data-tip="Πιο δεξιά" disabled=${i === value.length - 1} onClick=${() => move(i, 1)}>→<//><${Button} size="icon" variant="ghost" aria-label=${'Αφαίρεση υπογραφής ' + (i + 1)} data-tip="Αφαίρεση" onClick=${() => onChange(value.filter((_, j) => j !== i))}>${Icon.x}<//></span>
    </li>`)}</ol>` : html`<p className="note" style=${{ margin: 0 }}>Χωρίς υπογραφές.</p>`}
    <div><${Button} size="sm" variant="outline" onClick=${() => onChange([...value, { art: 'Ο', title: '' }])}>+ Υπογραφή<//></div>
    ${value.length > 1 && html`<div className="sigs__strip" aria-hidden="true">${value.map((x, i) => html`<span key=${i}><small>${x.art}</small>${unitText(x.title, kind) || '…'}</span>`)}</div>`}
  </div>`;
}

// Τη στιγμή που βγαίνει: αλλαγές μόνο για αυτή τη φορά, ή και για τις επόμενες (keepText). onGo(λίστα, κράτα, εκτύπωση)
export function SigsDialog({ title, initial, keepText, onGo, onClose, print = true, reset, onLayout, onceText = 'Αλλιώς ισχύουν μόνο για αυτό το αρχείο (και όταν ενημερώνεται μόνο του).' }: { title: string; initial: Sig[]; keepText: string; onGo: (sigs: Sig[], keep: boolean, print: boolean) => unknown; onClose: () => void; print?: boolean; reset?: { text: string; onClick: () => unknown }; onLayout?: (list: Sig[]) => unknown; onceText?: string }) {
  const [list, setList] = useState<Sig[]>(() => initial.map(x => ({ ...x })));
  const [keep, setKeep] = useState(false);
  const go = (pr: boolean) => { onClose(); onGo(sigsClean(list), keep, pr); };
  return html`<${Dialog} title=${'Υπογραφές: ' + title} description="Με τη σειρά που θα φαίνονται στο χαρτί, από αριστερά προς τα δεξιά." onClose=${onClose} size="lg"
    footer=${html`${onLayout && html`<${Button} variant="outline" onClick=${() => onLayout(sigsClean(list))} style=${reset ? undefined : { marginRight: 'auto' }} data-tip="Σύρε κεφαλίδα, ημερομηνία και υπογραφές όπου θέλεις πάνω στο χαρτί">Θέσεις στο χαρτί…<//>`}${reset && html`<${Button} variant="ghost" onClick=${() => { onClose(); reset.onClick(); }} style=${{ marginRight: 'auto' }}>${reset.text}<//>`}<${Button} variant="outline" onClick=${onClose}>Άκυρο<//>${print && html`<${Button} variant="outline" onClick=${() => go(true)}>${Icon.print}Εκτύπωση<//>`}<${Button} onClick=${() => go(false)}>Βγάλε το Excel<//>`}>
    <${SigEditor} value=${list} onChange=${setList} id="sgd"/>
    <label className="rule" style=${{ marginTop: '12px' }}><input type="checkbox" className="ui-check" checked=${keep} onChange=${(e: P) => setKeep(e.target.checked)}/><span><b>${keepText}</b><small>${onceText}</small></span></label>
  <//>`;
}
