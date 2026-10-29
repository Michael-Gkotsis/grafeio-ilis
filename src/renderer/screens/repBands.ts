// Έντυπα › Διάταξη πινάκων (Φάση 3, Michael, 24/10): κάθε πίνακας του εντύπου (και οι πίνακες τιμών) είναι ένα κουτί με ετικέτα, σε ζώνες (σειρές).
// Σύρε ένα κουτί πάνω σε άλλο: στην αριστερή ή δεξιά άκρη μπαίνει δίπλα του, στο πάνω ή κάτω μισό πάνω ή κάτω από αυτό. Ή διάλεξε ένα κουτί και
// χρησιμοποίησε τα βελάκια ή τη «Θέση». Η προεπισκόπηση δεξιά ζωγραφίζεται από Excel, οπότε το σύρσιμο γίνεται εδώ (HTML5, χωρίς βιβλιοθήκη).
import { useState } from 'react';
import { html, cx, Button } from '../ui';
import { Select } from '../select';
import { bandIndex, canStep, dropAt, put, step, type Bands, type Step } from '../../shared/repBands';
type P = any;
export interface BoxItem { id: string; name: string }
const DROP: Record<string, string> = { left: 'is-drop-left', beside: 'is-drop-right', above: 'is-drop-above', below: 'is-drop-below' };
// πού είναι ο πίνακας τώρα, ως τιμή της λίστας «Θέση»: πρώτος, κάτω από ένα άλλο, ή δίπλα σε ένα άλλο
const whereVal = (bands: Bands, id: string): string => {
  const bi = bandIndex(bands, id); if (bi < 0) return 'first';
  const b = bands[bi]; if (b.length > 1) { const j = b.indexOf(id); return 'beside:' + (j ? b[j - 1] : b[1]); }
  return bi ? 'below:' + bands[bi - 1][0] : 'first';
};
const applyWhere = (bands: Bands, id: string, v: string): Bands => (v === 'first' ? put(bands, id, { first: true }) : put(bands, id, { id: v.slice(v.indexOf(':') + 1), how: v.startsWith('below:') ? 'below' : 'beside' }));
const ARROWS: [Step, string, string][] = [['up', '↑', 'Πάνω'], ['down', '↓', 'Κάτω'], ['left', '←', 'Αριστερά'], ['right', '→', 'Δεξιά']];

export function BandsPanel({ items, bands, set }: P) {
  const [sel, setSel] = useState<string>(''); const [drag, setDrag] = useState<string | null>(null); const [over, setOver] = useState<{ id: string; how: string } | null>(null);
  const name = (id: string) => items.find((x: BoxItem) => x.id === id)?.name || '';
  const cur = items.some((x: BoxItem) => x.id === sel) ? sel : items[0]?.id;
  const end = () => { setDrag(null); setOver(null); };
  const go = (id: string, d: Step) => { set(step(bands, id, d)); setSel(id); };
  const where = whereVal(bands, cur);
  return html`<section className="rep-bands" aria-label="Διάταξη πινάκων">
    <b className="rep-bands__lbl" data-tip="Σύρε ένα κουτί πάνω σε άλλο: στην αριστερή ή δεξιά άκρη μπαίνει δίπλα του, στο πάνω ή κάτω μισό πάνω ή κάτω από αυτό. Ή διάλεξε ένα κουτί και χρησιμοποίησε τα βελάκια ή τη «Θέση».">Διάταξη</b>
    <div className="rep-bands__rows">${bands.map((b: string[], bi: number) => html`<div key=${bi} className="rep-bands__row" role="group" aria-label=${'Ζώνη ' + (bi + 1)}>
      ${b.map((id: string) => html`<div key=${id} role="button" tabIndex="0" draggable="true" data-id=${id} aria-pressed=${id === cur} aria-label=${'Πίνακας ' + name(id)}
        className=${cx('rep-box', id === cur && 'is-sel', drag === id && 'is-drag', over?.id === id && drag !== id && DROP[over.how])}
        onClick=${() => setSel(id)} onKeyDown=${(e: any) => { const k = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as Record<string, Step>)[e.key]; if (e.altKey && k) { e.preventDefault(); go(id, k); } }}
        onDragStart=${(e: any) => { setDrag(id); setSel(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); }} onDragEnd=${end}
        onDragOver=${(e: any) => { if (!drag || drag === id) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); const how = dropAt((e.clientX - r.left) / Math.max(1, r.width), (e.clientY - r.top) / Math.max(1, r.height)); if (over?.id !== id || over.how !== how) setOver({ id, how }); }}
        onDragLeave=${(e: any) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(o => (o?.id === id ? null : o)); }}
        onDrop=${(e: any) => { e.preventDefault(); if (drag && over && drag !== over.id) set(put(bands, drag, { id: over.id, how: over.how === 'beside' ? 'beside' : over.how as 'left' | 'above' | 'below' })); end(); }}>${name(id)}</div>`)}
    </div>`)}</div>
    <div className="rep-bands__ctl">
      <span className="rep-bands__arr">${ARROWS.map(([d, ch, lbl]) => html`<${Button} key=${d} size="icon" variant="ghost" aria-label=${lbl} data-tip=${lbl + ' (Alt+' + ch + ' στο κουτί)'} disabled=${!canStep(bands, cur, d)} onClick=${() => go(cur, d)}>${ch}<//>`)}</span>
      <${Select} className="ui-select rep-bands__where" aria-label=${'Θέση του πίνακα ' + name(cur)} value=${where} onChange=${(e: any) => set(applyWhere(bands, cur, e.target.value))}>
        <option value="first">Πρώτος (στην κορυφή)</option>
        ${items.filter((x: BoxItem) => x.id !== cur).map((x: BoxItem) => html`<${'optgroup'} key=${x.id} label=${x.name}><option value=${'below:' + x.id}>Κάτω από ${x.name}</option><option value=${'beside:' + x.id}>Δίπλα σε ${x.name}</option><//>`)}<//>
    </div>
  </section>`;
}
