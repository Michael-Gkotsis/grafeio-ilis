// Ρυθμίσεις › Ονόματα αρχείων (Michael, 13/11): δικό σου όνομα, διαχωριστικό και μορφή ημερομηνίας ανά αρχείο, και μία μορφή για όλα.
// Κενό = το προκαθορισμένο. Τα παλιά αρχεία δεν αλλάζουν.
import { useState } from 'react';
import { html, Button, Card, useToast } from '../ui';
import { Select } from '../select';
import { useStore } from '../store';
import { usePending } from '../pending';
import { today } from '../../shared/dates';
import { DATE_FMTS, FILE_ROWS, FILE_SEPS, defaultStem, fileName, fmtDate, type DateFmt, type FileId, type FileNames, type FileSep } from '../../shared/fileNames';

type Row = { name: string; sep: FileSep | ''; date: DateFmt | '' };
type Draft = { date: DateFmt | ''; per: Partial<Record<FileId, Row>> };
const blank: Row = { name: '', sep: '', date: '' };
const fromSaved = (fn?: FileNames): Draft => ({ date: fn?.date || '', per: Object.fromEntries(Object.entries(fn?.per || {}).map(([k, v]) => [k, { name: v?.name || '', sep: v?.sep || '', date: v?.date || '' }])) });
// Ό,τι έμεινε κενό δεν αποθηκεύεται: χωρίς καμία επιλογή οι ρυθμίσεις μένουν όπως ήταν
function toSaved(d: Draft): FileNames | undefined {
  const per: NonNullable<FileNames['per']> = {};
  for (const [k, v] of Object.entries(d.per) as [FileId, Row][]) {
    const x = { ...(v.name.trim() ? { name: v.name.trim() } : {}), ...(v.sep ? { sep: v.sep } : {}), ...(v.date ? { date: v.date } : {}) };
    if (Object.keys(x).length) per[k] = x;
  }
  const out: FileNames = { ...(d.date ? { date: d.date } : {}), ...(Object.keys(per).length ? { per } : {}) };
  return Object.keys(out).length ? out : undefined;
}

export function FileNamesCard() {
  const { state, run } = useStore(); const toast = useToast(); const st = state.settings;
  const [d, setD] = useState(() => fromSaved(st.fileNames));
  const dirty = JSON.stringify(toSaved(d) || null) !== JSON.stringify(st.fileNames || null);
  const day = today();
  const save = async () => {
    const ok = await run({ t: 'setSettings', settings: { fileNames: toSaved(d) }, text: 'ονόματα αρχείων' }, false);
    if (ok) toast({ text: 'Αποθηκεύτηκαν τα ονόματα αρχείων. Ισχύουν από το επόμενο αρχείο.' });
    return ok;
  };
  usePending(dirty, { label: 'Ονόματα αρχείων', save, discard: () => setD(fromSaved(st.fileNames)) });
  const set = (id: FileId, p: Partial<Row>) => setD({ ...d, per: { ...d.per, [id]: { ...(d.per[id] || blank), ...p } } });
  const draft = toSaved(d); const view = { fileNames: draft };
  return html`<${Card} title="Ονόματα αρχείων">
    <p className="note" style=${{ marginTop: 0 }}>Πώς ονομάζονται τα αρχεία που βγάζει η εφαρμογή κάθε μέρα. Γράψε δικό σου όνομα (με ό,τι γράμματα θέλεις) και διάλεξε πώς γράφεται η ημερομηνία. Κενό = το προκαθορισμένο. Τα παλιά αρχεία δεν αλλάζουν.</p>
    <div className="field" style=${{ maxWidth: '360px' }}><label className="field__label" htmlFor="fn-date">Ημερομηνία σε όλα</label>
      <${Select} id="fn-date" className="ui-input" value=${d.date} onChange=${(e: any) => setD({ ...d, date: e.target.value })}>
        <option value="">${fmtDate(day, 'd-m-Y')} (όπως ήταν)</option>${DATE_FMTS.filter(f => f !== 'd-m-Y').map(f => html`<option key=${f} value=${f}>${fmtDate(day, f)}</option>`)}<//></div>
    <p className="note">Η ΗΚΑΙ γράφει ως τώρα την ημερομηνία με τελείες (${fmtDate(day, 'd.m.y')}): αν διαλέξεις μορφή για όλα ή για την ΗΚΑΙ, αλλάζει. Στο ΠΣΚ η αρχή του διαστήματος γράφεται χωρίς χρονιά.</p>
    <div style=${{ overflowX: 'auto' }}><table className="legend">
      <thead><tr><th>Αρχείο</th><th>Όνομα</th><th>Ανάμεσα</th><th>Ημερομηνία</th><th>Θα λέγεται</th></tr></thead>
      <tbody>${FILE_ROWS(st).map(r => {
        const x = d.per[r.id] || blank;
        return html`<tr key=${r.id}>
          <td>${r.label}</td>
          <td><input className="ui-input" style=${{ minWidth: '150px' }} aria-label=${'Όνομα: ' + r.label} placeholder=${defaultStem(st, r.id)} maxLength=${80} value=${x.name} onChange=${(e: any) => set(r.id, { name: e.target.value })}/></td>
          <td><${Select} className="ui-input" aria-label=${'Ανάμεσα: ' + r.label} value=${x.sep} onChange=${(e: any) => set(r.id, { sep: e.target.value })}>${FILE_SEPS.map(([v, l]) => html`<option key=${v} value=${v === ' ' ? '' : v}>${l}</option>`)}<//></td>
          <td><${Select} className="ui-input" aria-label=${'Ημερομηνία: ' + r.label} value=${x.date} onChange=${(e: any) => set(r.id, { date: e.target.value })}><option value="">Όπως όλα</option>${DATE_FMTS.map(f => html`<option key=${f} value=${f}>${fmtDate(day, f)}</option>`)}<//></td>
          <td><code>${fileName(view, r.id, defaultStem(st, r.id), r.id === 'check' ? { text: 'ΝΟΕΜΒΡΙΟΥ ' + day.slice(0, 4) } : r.id === 'imer' ? { from: day, to: day } : day, r.ext)}</code></td></tr>`;
      })}</tbody></table></div>
    <p className="note">Τα έντυπα από τα «Έντυπα» παίρνουν το όνομα του εντύπου τους και την ημερομηνία «Ημερομηνία σε όλα». Το Σαββατοκύριακο γράφεται «ΦΡΟΥΡΑ ΠΣΚ ${fmtDate(day, 'd-m-Y', false)} έως ${fmtDate(day, 'd-m-Y')}» με το δικό σου όνομα μπροστά. Το «Ανάμεσα» μπαίνει ανάμεσα στο όνομα και την ημερομηνία.</p>
    <div><${Button} disabled=${!dirty} why="Δεν άλλαξε κάτι" onClick=${save}>Αποθήκευση<//></div>
  <//>`;
}
