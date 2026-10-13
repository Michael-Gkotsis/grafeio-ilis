// features/cadre · Στελέχη με ονόματα και απουσίες (από την εφαρμογή του άλλου γραφέα): ταΐζουν την ΗΚΑΙ
import { useMemo, useState } from 'react';
import { html, Badge, Button, Dialog, PageHeader, useToast } from '../ui';
import { useStore } from '../store';
import { ChoiceField, DateRangeField } from '../common';
import { guessHk, listOf, optionsOf } from '../../shared/ranks';
import { CADRE_ABS, type Cadre, type CadreAbs } from '../../shared/domain';
import { HK_NCO, HK_OFFICERS } from '../../shared/rules';
import { addDays, dm, dow } from '../../shared/dates';
import { collator } from '../../shared/text';
type P = any;

const HK_CADRE = [...HK_OFFICERS, ...HK_NCO.slice(0, 3)];
const absLbl = (k: string) => CADRE_ABS.find(x => x[0] === k)?.[1] || k;
export function CadreView({ tabs }: P) {
  const { state, run, today, undoMark } = useStore(); const toast = useToast();
  const [edit, setEdit] = useState<Partial<Cadre> | null>(null);
  const [absFor, setAbsFor] = useState<Cadre | null>(null);
  const [del, setDel] = useState<Cadre | null>(null);
  const order = (c: Cadre) => HK_CADRE.indexOf(c.hk);
  const list = useMemo(() => [...state.cadreList].sort((a, b) => order(a) - order(b) || collator.compare(a.last, b.last)), [state.cadreList]);
  const absOf = useMemo(() => { const m = new Map<string, CadreAbs[]>(); state.cadreAbs.filter(a => a.to >= today).sort((a, b) => a.from.localeCompare(b.from)).forEach(a => m.set(a.cid, [...(m.get(a.cid) || []), a])); return m; }, [state.cadreAbs, today]);
  const awayToday = list.filter(c => (absOf.get(c.id) || []).some(a => a.from <= today)).length;
  return html`<div>
    <${PageHeader} title="Προσωπικό" sub=${'Στελέχη: ' + list.length + (list.length ? ' · απόντες σήμερα: ' + awayToday : '') + '. Με τη λίστα, η ΗΚΑΙ βγάζει μόνη της στελέχη ανά βαθμό και απουσίες.'}>
      <${Button} onClick=${() => setEdit({ hk: 'Λοχίες' })}>+ Νέο στέλεχος<//><//>
    ${tabs}
    <div className="ui-card">${list.length ? html`<ul className="rec">${list.map(c => { const ab = absOf.get(c.id) || []; const now = ab.find(a => a.from <= today); return html`<li key=${c.id}>
      <div><b>${c.rank} ${c.last} ${c.first}</b> ${now ? html`<${Badge} tone="warn">${absLbl(now.kind)} έως ${dm(now.to)}<//>` : html`<${Badge} tone="ok">Παρών<//>`}
        <small>${[c.hk, c.role, c.phone && 'ΤΗΛ ' + c.phone].filter(Boolean).join(' · ')}${ab.filter(a => a !== now).map(a => ' · ' + absLbl(a.kind).toLowerCase() + ' ' + dow(a.from) + ' ' + dm(a.from) + '–' + dm(a.to)).join('')}</small>
        ${ab.length > 0 && html`<div className="chips" style=${{ marginTop: "6px" }}>${ab.map(a => html`<button key=${a.id} type="button" className="ui-chip" data-tip="Διαγραφή της απουσίας" onClick=${async () => { if (await run({ t: 'deleteCadreAbs', id: a.id }, false)) toast({ text: 'Διαγράφηκε η απουσία', actions: [undoMark()] }); }}>${absLbl(a.kind)} ${dm(a.from)}–${dm(a.to)} ✕</button>`)}</div>`}</div>
      <${Button} size="sm" variant="outline" onClick=${() => setAbsFor(c)}>Απουσία<//><${Button} size="sm" variant="ghost" onClick=${() => setEdit(c)}>Στοιχεία<//><${Button} size="sm" variant="ghost" onClick=${() => setDel(c)}>Διαγραφή<//>
    </li>`; })}</ul>` : html`<div className="empty">Δεν έχουν μπει στελέχη. Αν δεν τα περάσεις, η ΗΚΑΙ παίρνει τους αριθμούς ανά βαθμό που γράφεις στην οθόνη της.</div>`}</div>
    ${edit && html`<${CadreDialog} c=${edit} onClose=${() => setEdit(null)}/>`}
    ${absFor && html`<${AbsDialog} c=${absFor} onClose=${() => setAbsFor(null)}/>`}
    ${del && html`<${Dialog} role="alertdialog" title=${'Διαγραφή: ' + del.rank + ' ' + del.last + ';'} description="Φεύγει από τη λίστα και από την ΗΚΑΙ, μαζί με τις απουσίες του." onClose=${() => setDel(null)}
      footer=${html`<${Button} variant="outline" data-autofocus="" onClick=${() => setDel(null)}>Άκυρο<//><${Button} onClick=${async () => { const x = del; setDel(null); if (await run({ t: 'deleteCadre', id: x.id }, false)) toast({ text: 'Διαγράφηκε: ' + x.rank + ' ' + x.last, actions: [undoMark()] }); }}>Διαγραφή<//>`}><//>`}
  </div>`;
}

function CadreDialog({ c, onClose }: P) {
  const { run, state } = useStore(); const toast = useToast();
  const lists = state.settings.lists;
  const ranks = useMemo(() => optionsOf(listOf(lists, 'cadreRanks'), state.cadreList.map(x => x.rank)), [state.cadreList, lists]);
  const [f, setF] = useState({ rank: c.rank || '', hk: c.hk || 'Λοχίες', last: c.last || '', first: c.first || '', phone: c.phone || '', role: c.role || '' });
  const [hkTouched, setHkTouched] = useState(!!c.id);
  const save = async () => { if (await run({ t: 'saveCadre', cadre: { ...f, id: c.id } }, false)) { onClose(); toast({ text: (c.id ? 'Αποθηκεύτηκε: ' : 'Προστέθηκε: ') + f.rank.toUpperCase() + ' ' + f.last.toUpperCase() }); } };
  const fld = (k: string, label: string, ph = '', extra: P = {}) => html`<div className="field"><label className="field__label" htmlFor=${'cd-' + k}>${label}</label><input id=${'cd-' + k} className="ui-input" placeholder=${ph} value=${(f as P)[k]} onChange=${(e: any) => setF({ ...f, [k]: e.target.value, ...(k === 'rank' && !hkTouched ? { hk: guessHk(e.target.value, lists) } : {}) })} ...${extra}/></div>`;
  return html`<${Dialog} title=${c.id ? 'Στοιχεία στελέχους' : 'Νέο στέλεχος'} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!f.last.trim()} onClick=${save}>Αποθήκευση<//>`}>
    <div className="field-row"><${ChoiceField} id="cd-rank" label="Βαθμός" value=${f.rank} options=${ranks} placeholder="π.χ. ΛΧΙΑΣ" autoFocus onChange=${(v: string) => setF({ ...f, rank: v, ...(!hkTouched ? { hk: guessHk(v, lists) } : {}) })}/>
      <div className="field"><label className="field__label" htmlFor="cd-hk">Γραμμή στην ΗΚΑΙ</label><select id="cd-hk" className="ui-input" value=${f.hk} onChange=${(e: any) => { setHkTouched(true); setF({ ...f, hk: e.target.value }); }}>${HK_CADRE.map(r => html`<option key=${r}>${r}</option>`)}</select></div></div>
    <div className="field-row">${fld('last', 'Επώνυμο *')}${fld('first', 'Όνομα')}</div>
    <div className="field-row">${fld('role', 'Θέση', 'π.χ. Διοικητής Ίλης')}${fld('phone', 'Τηλέφωνο')}</div>
  <//>`;
}

function AbsDialog({ c, onClose }: P) {
  const { run, today } = useStore(); const toast = useToast();
  const [f, setF] = useState({ kind: 'ka', from: today, to: addDays(today, 4), note: '' });
  const col = CADRE_ABS.find(x => x[0] === f.kind)?.[2];
  const save = async () => { if (await run({ t: 'addCadreAbs', abs: { cid: c.id, ...f, note: f.note.trim() || undefined } }, false)) { onClose(); toast({ text: c.rank + ' ' + c.last + ': ' + absLbl(f.kind).toLowerCase() + ' ' + dm(f.from) + '–' + dm(f.to) }); } };
  return html`<${Dialog} title=${'Απουσία: ' + c.rank + ' ' + c.last} onClose=${onClose}
    footer=${html`<${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} onClick=${save}>Αποθήκευση<//>`}>
    <div className="field"><label className="field__label" htmlFor="ca-k">Είδος</label><select id="ca-k" className="ui-input" value=${f.kind} onChange=${(e: any) => setF({ ...f, kind: e.target.value })}>${CADRE_ABS.map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select>
      <span className="field__help">${col ? 'Μετρά στην ΗΚΑΙ στους απόντες (' + c.hk + ').' : 'Δεν μετρά στην ΗΚΑΙ, μόνο στη λίστα.'}</span></div>
    <${DateRangeField} from=${f.from} to=${f.to} onChange=${(from: string, to: string) => setF({ ...f, from, to })}/>
    <div className="field"><label className="field__label" htmlFor="ca-n">Παρατήρηση</label><input id="ca-n" className="ui-input" value=${f.note} onChange=${(e: any) => setF({ ...f, note: e.target.value })}/></div>
  <//>`;
}
