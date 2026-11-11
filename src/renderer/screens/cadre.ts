// features/cadre · «Στελέχη» (Michael, 17/10): δική τους καρτέλα στο μενού, χωριστά από το Δυναμολόγιο των οπλιτών.
// Οι καταστάσεις τους είναι οι στήλες της ΗΚΑΙ (κωλυόμενοι, απόντες) και ταΐζουν την ΗΚΑΙ όπως πριν.
import { useDeferredValue, useMemo, useState } from 'react';
import { html, cx, Badge, Button, PageHeader, Strip, useToast } from '../ui';
import { Select } from '../select';
import { useNav, useStore } from '../store';
import { ActiveFilter, SigsMenu } from '../common';
import type { Sig } from '../../shared/sigs';
import { rankTxt } from '../../shared/ranks';
import { HK } from '../../shared/unit';
import type { Cadre, CadreAbs } from '../../shared/domain';
import { CADRE_FILTERS, orderedCadre, cadreMatch, cadreSearch, cadreStatusOn, type CadreFilter, type CadreStatus } from '../../shared/cadre';
import { addDays, dayName, dm } from '../../shared/dates';
import { CadreDialog, StatusDialog } from '../features/cadre-edit';
import { cadreStatusBadge } from '../entities/person';
import { NoteDot } from './notes';
import { noteIndex } from '../../shared/notes';

// στήλες όπως στο Δυναμολόγιο (Michael, 18/10): βαθμός, Ο/Σ, επίθετο, όνομα, ΑΜ, τηλέφωνο, θέση. Χωρά σε οθόνη 1024 χωρίς
// κύλιση· η γραμμή της ΗΚΑΙ φαίνεται στην καρτέλα του στελέχους και στο Excel
const GRID = '24px 40px 92px 44px minmax(110px,1.4fr) minmax(80px,1fr) 66px 100px minmax(56px,.6fr) minmax(110px,1.4fr) 118px';   // χωράει στα 858px του 1024 με μαζεμένο μενού

export function CadreScreen() {
  const { state, today, run } = useStore(); const nav = useNav(); const toast = useToast();
  const [q, setQ] = useState(''); const dq = useDeferredValue(q);
  const filter: CadreFilter = nav.params.filter || 'all';
  const date: string = nav.params.cdate || today;
  const days = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(i => addDays(today, i)), [today]);
  const [edit, setEdit] = useState<Partial<Cadre> | null>(null);
  const [stFor, setStFor] = useState<{ c: Cadre; abs?: CadreAbs } | null>(null);
  const [xl, setXl] = useState(false);
  const all = useMemo(() => orderedCadre(state.cadreList), [state.cadreList]);
  const marks = useMemo(() => noteIndex(state.notes, today), [state.notes, today]);
  // χειροκίνητη σειρά (ιεραρχία): σύρσιμο γραμμής ή Alt+↑/↓. Η θέση μετρά σε όλη τη λίστα, και με φίλτρο.
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const move = (id: string, to: string, after: boolean) => {
    if (id === to) return;
    const ids = all.map(c => c.id).filter(x => x !== id); const i = ids.indexOf(to);
    ids.splice(after ? i + 1 : i, 0, id);
    run({ t: 'orderCadre', ids }, false);
  };
  const end = () => { setDrag(null); setOver(null); };
  const stOf = useMemo(() => { const m = new Map<string, CadreStatus | undefined>(); all.forEach(c => m.set(c.id, cadreStatusOn(state, c.id, date))); return m; }, [all, state.cadreAbs, state.settings, date]);
  const counts = useMemo(() => Object.fromEntries(CADRE_FILTERS.map(([f]) => [f, all.filter(c => cadreMatch(f, c, stOf.get(c.id))).length])), [all, stOf]);
  const rows = all.filter(c => cadreMatch(filter, c, stOf.get(c.id)) && cadreSearch(c, dq));
  const active = counts.all || 0;
  const setFilter = (f: CadreFilter) => nav.set({ filter: f === 'all' ? undefined : f });
  const clear = () => { setQ(''); nav.set({ filter: undefined }); };
  const dateLbl = date === today ? '' : dayName(date, today) + ' ' + dm(date);
  const exportXl = async (sigs?: Sig[]) => {
    setXl(true);
    try {
      const r = await window.api.exportCadre(date, sigs);
      toast({ text: r.ok ? 'Βγήκε ' + r.file.split(/[\\/]/).pop() + ': στελέχη, καταστάσεις' + (all.some(c => !c.active) ? ', εκτός δύναμης' : '') + (date === today ? ', για σήμερα.' : ', για ' + dayName(date, today).toLowerCase() + ' ' + dm(date) + '.') : html`<span><b>Δεν βγήκε.</b> ${r.error}</span>` });
    } finally { setXl(false); }
  };
  // η καρτέλα του στελέχους είναι πλαϊνή κάρτα του Shell (πάνω από κάθε οθόνη)· εδώ μόνο η επιλεγμένη γραμμή και η σειρά ↑/↓
  const card: string | null = nav.params.cadre ?? null; const openCard = (id: string) => nav.openCadre(id, rows.map(r => r.id));
  return html`<div>
    <${PageHeader} title="Στελέχη" sub=${'Δυναμικό στελεχών: ' + active + (active ? ' · κωλυόμενοι ' + (counts.kol || 0) + ' · απόντες ' + (counts.apo || 0) + (dateLbl ? ' (' + dateLbl.toLowerCase() + ')' : ' σήμερα') : '') + '. Σύρε μια γραμμή για τη σειρά της ιεραρχίας.'}>
      <${Button} variant="outline" disabled=${xl || !all.length} why=${!all.length ? 'Δεν υπάρχουν στελέχη' : undefined} onClick=${() => exportXl()} data-tip="Ένα Excel: στελέχη με την κατάσταση της μέρας, όλες οι καταστάσεις από τη μέρα αυτή και μετά, εκτός δύναμης">${xl ? 'Δημιουργία…' : 'Βγάλε το Excel'}<//>
      <${SigsMenu} form="cadre" date=${date} label="τα Στελέχη" print=${false} disabled=${xl || !all.length} go=${(_: boolean, sigs?: Sig[]) => exportXl(sigs)}/>
      <${Button} onClick=${() => setEdit({ hk: 'Λοχίες' })}>+ Νέο στέλεχος<//><//>
    <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση στα στελέχη" placeholder="Όνομα, βαθμός, Ο/Σ, ΑΜ, θέση, τηλέφωνο (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: any) => setQ(e.target.value)}/>
      <${Select} className="ui-select" aria-label="Καταστάσεις στην ημερομηνία" data-tip="Η κατάσταση αυτής της μέρας, και στο Excel" value=${date} onChange=${(e: any) => nav.set({ cdate: e.target.value === today ? undefined : e.target.value })}>${days.map(d => html`<option key=${d} value=${d}>${dayName(d, today)}</option>`)}<//></div>
    <div className="filters"><${Strip} role="group" aria-label="Γρήγορα φίλτρα">${CADRE_FILTERS.map(([k, l]) => html`<button key=${k} type="button" className="ui-chip" aria-pressed=${filter === k} data-tip=${k === 'kol' || k === 'apo' ? 'Στην ' + HK() + ' ' + (dateLbl ? dateLbl.toLowerCase() : 'σήμερα') : undefined} onClick=${() => setFilter(filter === k && k !== 'all' ? 'all' : k)}>${l}<span className="cnt">${counts[k] || 0}</span></button>`)}<//>
      <${ActiveFilter} parts=${[filter !== 'all' && (CADRE_FILTERS.find(([k]) => k === filter) || [, ''])[1], dateLbl, dq.trim() && '«' + dq.trim() + '»']} onClear=${clear}/>
      <span className="toolbar__count">${rows.length} από ${filter === 'inactive' ? counts.inactive || 0 : active}</span></div>
    ${rows.length === 0 ? html`<div className="ui-card empty">${!all.length ? html`Δεν έχουν μπει στελέχη. Αν δεν τα περάσεις, η ${HK()} παίρνει τους αριθμούς ανά βαθμό που γράφεις στην οθόνη της. <${Button} variant="link" onClick=${() => setEdit({ hk: 'Λοχίες' })}>Πέρασε το πρώτο<//>` : html`Κανείς δεν ταιριάζει. <${Button} variant="link" onClick=${clear}>Καθάρισε αναζήτηση και φίλτρα<//>`}</div>` :
    html`<div className="ptable ptable--roster" role="table" aria-rowcount=${rows.length}><div style=${{ overflowX: 'auto' }}><div style=${{ minWidth: '840px' }}>
      <div className="ptable__head" role="row" style=${{ gridTemplateColumns: GRID }}><span></span><span>Α/Α</span><span>Βαθμός</span><span>Ο/Σ</span><span>Επίθετο</span><span>Όνομα</span><span>ΑΜ</span><span>Τηλέφωνο</span><span>Θέση</span><span>${'Κατάσταση' + (dateLbl ? ' · ' + dateLbl : '')}</span><span></span></div>
      ${rows.map((c, i) => { const st = stOf.get(c.id); return html`<div key=${c.id} className=${cx('ptable__row', i % 2 === 1 && 'is-odd', card === c.id && 'is-sel', drag === c.id && 'is-drag', over?.id === c.id && drag !== c.id && (over.after ? 'is-drop-after' : 'is-drop-before'))} style=${{ gridTemplateColumns: GRID }} role="row" tabIndex="0"
        draggable="true" onDragStart=${(e: any) => { setDrag(c.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); }} onDragEnd=${end}
        onDragOver=${(e: any) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2; if (over?.id !== c.id || over.after !== after) setOver({ id: c.id, after }); }}
        onDrop=${(e: any) => { e.preventDefault(); if (drag && over) move(drag, over.id, over.after); end(); }}
        onClick=${() => openCard(c.id)} onKeyDown=${(e: any) => { if (e.key === 'Enter') openCard(c.id); else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const nb = rows[i + (e.key === 'ArrowUp' ? -1 : 1)]; if (nb) move(c.id, nb.id, e.key === 'ArrowDown'); } }}>
        <span className="drag-h" aria-hidden="true" data-tip="Σύρε για να αλλάξεις σειρά (ή Alt+↑/↓)">⠿</span><span className="num muted">${i + 1}</span><span data-tip=${rankTxt(c)}>${rankTxt(c)}</span><span>${c.spec || ''}</span><span data-tip=${c.last}><b>${c.last}</b>${marks.get('c' + c.id) && html`<${NoteDot} m=${marks.get('c' + c.id)}/>`}</span><span data-tip=${c.first}>${c.first}</span><span className="num">${c.am || ''}</span><span className="num">${c.phone || ''}</span><span data-tip=${c.role || undefined}>${c.role || ''}</span>
        <span className="badges">${c.active ? cadreStatusBadge(st) : html`<${Badge} tone="outline">Εκτός δύναμης<//>`}</span>
        <span onClick=${(e: any) => e.stopPropagation()}>${c.active && html`<${Button} size="sm" variant="outline" aria-label=${'Κατάσταση: ' + rankTxt(c) + ' ' + c.last} onClick=${() => setStFor({ c })} data-tip="Κατάσταση της ${HK()}: υπηρεσία, ΕΥ, άδεια, νοσοκομείο…" data-tip-side="left">Κατάσταση…<//>`}</span></div>`; })}
    </div></div></div>`}
    ${edit && html`<${CadreDialog} c=${edit} onClose=${() => setEdit(null)}/>`}
    ${stFor && html`<${StatusDialog} c=${stFor.c} abs=${stFor.abs} onClose=${() => setStFor(null)}/>`}
  </div>`;
}


// Deprecated paths: the sheet moved to widgets/cadre-sheet, the dialogs to features/cadre-edit (Phase 5.3c). Removed in Phase 7.
export { CadreSheet } from '../widgets/cadre-sheet';
export { CadreDialog, StatusDialog };
