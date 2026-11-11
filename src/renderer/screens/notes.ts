// features/notes · «Σημειώσεις» (Michael, 24/10: «γράφουμε χαρτάκια και τα ξεχνάμε»): γενικές, ανά στρατιώτη, ανά στέλεχος, με
// προαιρετική υπενθύμιση. Γρήγορη προσθήκη πάνω πάνω (Ctrl+Enter), εύκολη ανάγνωση από κάτω, ίδια σημείωση στην καρτέλα «Σημειώσεις» του ατόμου.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Button, PageHeader } from '../ui';
import { useNav, useStore } from '../store';
import type { Note } from '../../shared/domain';
import { NOTE_FILTERS, dueCount, noteGroups, noteIn, noteKeys, noteSearch, noteWho, type NoteFilter } from '../../shared/notes';
import { EditDialog, NoteComposer, NoteGroup as Group, useNoteDraft, useOpenWho } from '../features/note-compose';
type P = any;

// Deprecated path: NoteDialog and EditDialog moved to features/note-compose (Phase 5.3b). Removed in Phase 7.
export { NoteDialog, EditDialog } from '../features/note-compose';

// Deprecated path: NoteDot moved to entities/note (Phase 5.3a).
export { NoteDot } from '../entities/note';

// Η σελίδα
export function NotesScreen() {
  const { state, today } = useStore(); const nav = useNav();
  const notes = state.notes || [];
  const filter: NoteFilter = nav.params.nfilter || 'all';
  const who: string = nav.params.nwho || '';
  const [q, setQ] = useState<string>(nav.params.nq || ''); const dq = useDeferredValue(q);
  useEffect(() => { if (nav.params.nq != null && nav.params.nq !== q) setQ(nav.params.nq); }, [nav.params.nq]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [edit, setEdit] = useState<Note | null>(null);
  const draft = useNoteDraft();
  const compRef = useRef<HTMLDivElement>(null);
  const due = dueCount(notes, today);
  const open = notes.filter(n => !n.done);
  const counts = useMemo(() => Object.fromEntries(NOTE_FILTERS.map(([f]) => [f, notes.filter(n => noteIn(f, n)).length])) as Record<NoteFilter, number>, [notes]);
  // άτομα με ανοιχτές σημειώσεις (και πόσες)
  const people = useMemo(() => {
    const m = new Map<string, { k: string; label: string; n: number; active: boolean }>();
    for (const n of notes) { if (n.done) continue; for (const it of noteWho(state, n).items) { const x = m.get(it.key) || { k: it.key, label: it.label, n: 0, active: it.active }; x.n++; m.set(it.key, x); } }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, 'el'));
  }, [notes, state.people, state.cadreList]);
  const rows = useMemo(() => notes.filter(n => noteIn(filter, n) && (!who || noteKeys(n).includes(who)) && noteSearch(state, n, dq)), [notes, filter, who, dq, state.people, state.cadreList]);
  const g = useMemo(() => noteGroups(rows, today), [rows, today]);
  const done = filter === 'done' ? [...rows].sort((a, b) => (b.done || '').localeCompare(a.done || '')) : [];
  const openWho = useOpenWho();
  const setFilter = (f: NoteFilter) => nav.set({ nfilter: f === 'all' ? undefined : f, nwho: undefined });
  const filtered = filter !== 'all' || !!who || !!dq.trim();
  const clear = () => { setQ(''); nav.set({ nfilter: undefined, nwho: undefined, nq: undefined }); };
  return html`<div>
    <${PageHeader} title="Σημειώσεις" sub=${open.length + (open.length === 1 ? ' ανοιχτή' : ' ανοιχτές') + (due ? ' · ' + due + (due === 1 ? ' υπενθύμιση ζητά' : ' υπενθυμίσεις ζητούν') + ' προσοχή σήμερα' : ' · καμία υπενθύμιση για σήμερα')}>
      <${Button} variant="outline" data-tip="Από οποιαδήποτε οθόνη: Ctrl+Shift+N" onClick=${() => { (document.getElementById('nt-text') as HTMLElement | null)?.focus(); compRef.current?.scrollIntoView?.({ block: 'nearest' }); }}>+ Νέα σημείωση<//><//>
    <div className="notes-layout">
      <aside className="notes-side" aria-label="Φίλτρα σημειώσεων">
        <div className="notes-filters" role="group">${NOTE_FILTERS.map(([f, l]) => html`<button key=${f} type="button" className="notes-f" aria-pressed=${filter === f && !who} onClick=${() => setFilter(f)}>${l}<span className=${cx('cnt', f === 'rem' && due > 0 && 'is-hot')}>${f === 'rem' && due > 0 ? due : counts[f]}</span></button>`)}</div>
        ${people.length > 0 && html`<div className="notes-sep">Άτομα με σημειώσεις</div>
        <div className="notes-filters notes-people" role="group">${people.map(x => html`<button key=${x.k} type="button" className="notes-f" aria-pressed=${who === x.k} onClick=${() => nav.set({ nwho: who === x.k ? undefined : x.k, nfilter: undefined })}><span className="notes-f__t">${x.label}</span><span className="cnt">${x.n}</span></button>`)}</div>`}
      </aside>
      <div className="notes-main">
        <div className="ui-card note-quick" ref=${compRef}><${NoteComposer} draft=${draft}/></div>
        <div className="toolbar"><input type="search" className="ui-input" aria-label="Αναζήτηση στις σημειώσεις" placeholder="Αναζήτηση στο κείμενο και στο όνομα (χωρίς τόνους) · Ctrl+F" value=${q} onChange=${(e: P) => setQ(e.target.value)}/>
          ${filtered && html`<button type="button" className="actfilter__act" onClick=${clear}>Καθάρισε τα φίλτρα</button>`}
          <span className="toolbar__count">${rows.length} από ${filter === 'done' ? counts.done : open.length}</span></div>
        ${rows.length === 0
          ? html`<div className="ui-card empty">${notes.length === 0 ? 'Δεν υπάρχει καμία σημείωση ακόμα. Γράψε την πρώτη στο πλαίσιο από πάνω: ό,τι θα έγραφες σε χαρτάκι και θα το ξεχνούσες.' : filtered ? 'Καμία σημείωση δεν ταιριάζει με αυτά τα φίλτρα.' : 'Δεν έχεις ανοιχτές σημειώσεις.'}</div>`
          : filter === 'done' ? html`<${Group} title="Ολοκληρωμένες" list=${done} onEdit=${setEdit} onOpen=${openWho}/>`
          : html`<${Group} title="Πρέπει σήμερα" list=${g.due} onEdit=${setEdit} onOpen=${openWho}/>
            <${Group} title="Με υπενθύμιση" list=${g.soon} onEdit=${setEdit} onOpen=${openWho}/>
            <${Group} title=${g.due.length || g.soon.length ? 'Χωρίς υπενθύμιση' : 'Σημειώσεις'} list=${g.rest} onEdit=${setEdit} onOpen=${openWho}/>`}
      </div></div>
    ${edit && html`<${EditDialog} note=${edit} onClose=${() => setEdit(null)}/>`}
  </div>`;
}

// Deprecated paths: the tab moved to features/note-compose, the label and the alert to entities/note (Phase 5.3c). Removed in Phase 7.
export { NotesTab } from '../features/note-compose';
export { TodayAlert, notesTabLabel } from '../entities/note';
