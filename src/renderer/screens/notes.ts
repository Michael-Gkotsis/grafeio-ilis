// features/notes · «Σημειώσεις» (Michael, 24/10: «γράφουμε χαρτάκια και τα ξεχνάμε»): γενικές, ανά στρατιώτη, ανά στέλεχος, με
// προαιρετική υπενθύμιση. Γρήγορη προσθήκη πάνω πάνω (Ctrl+Enter), εύκολη ανάγνωση από κάτω, ίδια σημείωση στην καρτέλα «Σημειώσεις» του ατόμου.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Alert, Badge, Button, Icon, PageHeader, useToast } from '../ui';
import { useNav, useStore } from '../store';
import { dm } from '../../shared/dates';
import type { Note } from '../../shared/domain';
import { NOTE_FILTERS, dueCount, noteGroups, noteIn, noteKeys, noteSearch, noteWho, personGroups, remLabel, whoKey, type NoteFilter, type NoteWhoItem, type PersonGroups } from '../../shared/notes';
import { EditDialog, NoteComposer, useNoteDraft } from '../features/note-compose';
type P = any;

// Deprecated path: NoteDialog and EditDialog moved to features/note-compose (Phase 5.3b). Removed in Phase 7.
export { NoteDialog, EditDialog } from '../features/note-compose';

// Deprecated path: NoteDot moved to entities/note (Phase 5.3a).
export { NoteDot } from '../entities/note';

const whoIcon = (k: string) => (k === 'cad' ? Icon.shield : k === 'sol' ? Icon.people : Icon.notes);
// self: στην κάρτα ενός ατόμου δεν ξαναγράφεται το ίδιο, μόνο όσοι άλλοι είναι δεμένοι με τη σημείωση
function WhoChip({ n, onOpen, self }: P) {
  const { state } = useStore();
  const w = noteWho(state, n);
  if (!w.items.length) return html`<span className="who-chip is-gen">${Icon.notes}Γενική</span>`;
  return html`${w.items.filter((x: NoteWhoItem) => x.key !== self).map((x: NoteWhoItem) => html`<button key=${x.key} type="button" className=${cx('who-chip', !x.active && 'is-off')} data-tip=${x.active ? 'Άνοιγμα καρτέλας' : 'Εκτός δύναμης · άνοιγμα καρτέλας'} onClick=${() => onOpen(x)}>${whoIcon(x.kind)}${x.label}${!x.active && ' (εκτός δύναμης)'}</button>`)}`;
}

// Μία σημείωση: τσεκάρεις όταν τελειώσει, επεξεργασία και διαγραφή (με Αναίρεση) στο hover/focus
function NoteCard({ n, self, onEdit, onOpen }: P) {
  const { today, run, undoMark } = useStore(); const toast = useToast();
  const due = !n.done && !!n.rem && n.rem <= today;
  const rl = n.rem ? remLabel(n.rem, today, !!n.done) : null;
  const done = async () => { await run({ t: 'doneNote', id: n.id, done: !n.done }, false); };
  const star = () => run({ t: 'editNote', id: n.id, patch: { star: !n.star } }, false);
  const del = async () => { if (await run({ t: 'deleteNote', id: n.id }, false)) toast({ text: 'Σβήστηκε η σημείωση.', actions: [undoMark()] }); };
  return html`<article className=${cx('note-card', due && 'is-due', n.star && !n.done && 'is-star', n.done && 'is-done')}>
    <div className="note-card__top"><button type="button" className="note-ck" role="checkbox" aria-checked=${!!n.done} aria-label=${n.done ? 'Ξανάνοιξε τη σημείωση' : 'Ολοκληρώθηκε'} data-tip=${n.done ? 'Ξανάνοιξε' : 'Ολοκληρώθηκε'} onClick=${done}>${n.done ? Icon.check : null}</button>
      <div className="note-card__txt">${n.text}</div></div>
    <div className="note-card__meta"><${WhoChip} n=${n} onOpen=${onOpen} self=${self}/>
      ${rl && html`<${Badge} tone=${rl.tone === 'muted' ? undefined : rl.tone} className="note-rem-badge">${Icon.bell}${rl.text}<//>`}
      <span className="note-card__date">${n.done ? 'Ολοκληρώθηκε ' + dm(n.done) : dm(n.at)}</span>
      <span className="note-card__acts">
        <button type="button" className=${cx('note-ib', n.star && 'is-on')} aria-label=${n.star ? 'Βγάλε από τις σημαντικές' : 'Σημαντική'} aria-pressed=${!!n.star} data-tip=${n.star ? 'Σημαντική (πάτα για να φύγει)' : 'Σημείωσέ τη σημαντική'} onClick=${star}>${Icon.star}</button>
        <button type="button" className="note-ib" aria-label="Επεξεργασία" data-tip="Επεξεργασία, υπενθύμιση" onClick=${() => onEdit(n)}>${Icon.edit}</button>
        <button type="button" className="note-ib" aria-label="Διαγραφή" data-tip="Διαγραφή (με Αναίρεση)" onClick=${del}>${Icon.trash}</button></span></div></article>`;
}

// Chip ατόμου σε σημείωση: ανοίγει την καρτέλα του επί τόπου, πάνω από όποια οθόνη
function useOpenWho() {
  const nav = useNav();
  return (x: NoteWhoItem) => (x.kind === 'sol' ? nav.openPerson(Number(x.key.slice(1))) : nav.openCadre(x.key.slice(1)));
}

function Group({ title, list, ...rest }: P) {
  if (!list.length) return null;
  return html`<section className="note-group"><div className="note-group__h"><h2>${title} · ${list.length}</h2><span className="note-group__line"></span></div>
    <div className="note-list">${list.map((n: Note) => html`<${NoteCard} key=${n.id} n=${n} ...${rest}/>`)}</div></section>`;
}

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

// Η καρτέλα «Σημειώσεις» στην κάρτα στρατιώτη/στελέχους: ό,τι έχει η σελίδα (πλαίσιο, ομάδες, ολοκληρωμένες), για ένα άτομο.
// Ίδια δεδομένα με τη σελίδα, άρα ό,τι γίνεται εδώ φαίνεται εκεί και αντίστροφα. who: { pid } ή { cid }. Να μπαίνει με key ανά άτομο.
export function NotesTab({ who }: P) {
  const { state, today } = useStore(); const nav = useNav(); const openWho = useOpenWho();
  const draft = useNoteDraft(who);
  const [edit, setEdit] = useState<Note | null>(null); const [showDone, setShowDone] = useState(false);
  const g = useMemo(() => personGroups(state.notes, who, today), [state.notes, today, who.pid, who.cid]);   // eslint-disable-line react-hooks/exhaustive-deps
  const self = whoKey(who);
  // η κάρτα ρωτά πριν φύγει (άλλο άτομο, καρτέλα, κλείσιμο) όσο το πρόχειρο δεν έχει αποθηκευτεί
  useEffect(() => { nav.setDirty(draft.dirty); return () => nav.setDirty(false); }, [draft.dirty]);   // eslint-disable-line react-hooks/exhaustive-deps
  const rest = { self, onEdit: setEdit, onOpen: openWho };
  return html`<div className="note-tab">
    <div className="note-tab__bar"><span className="muted">${g.open} ${g.open === 1 ? 'ανοιχτή' : 'ανοιχτές'}</span>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" data-tip="Όλες οι σημειώσεις του στη σελίδα Σημειώσεις" onClick=${() => nav.go('notes', { nwho: self })}>Άνοιγμα στη σελίδα</button></div>
    <div className="ui-card note-quick"><${NoteComposer} draft=${draft} ns="np" compact=${true}/></div>
    <${Group} title="Πρέπει σήμερα" list=${g.due} ...${rest}/>
    <${Group} title="Με υπενθύμιση" list=${g.soon} ...${rest}/>
    <${Group} title="Χωρίς υπενθύμιση" list=${g.rest} ...${rest}/>
    ${g.open + g.done.length === 0 && html`<p className="muted note-tab__empty">Δεν υπάρχει καμία σημείωση για αυτό το άτομο ακόμα. Γράψε την πρώτη από πάνω.</p>`}
    ${g.done.length > 0 && html`<section className="note-group"><div className="note-group__h"><button type="button" className="note-group__fold" aria-expanded=${showDone} onClick=${() => setShowDone(!showDone)}>${showDone ? '▾' : '▸'} Ολοκληρωμένες · ${g.done.length}</button><span className="note-group__line"></span></div>
      ${showDone && html`<div className="note-list">${g.done.map((n: Note) => html`<${NoteCard} key=${n.id} n=${n} ...${rest}/>`)}</div>`}</section>`}
    ${edit && html`<${EditDialog} note=${edit} onClose=${() => setEdit(null)}/>`}</div>`;
}

// Το όνομα της καρτέλας στην κάρτα ατόμου: πόσες ανοιχτές, και κόκκινο όταν κάποια υπενθύμιση ζητά προσοχή σήμερα
export const notesTabLabel = (g: PersonGroups) => html`<span>Σημειώσεις (${g.open})${g.dueN > 0 && html` <${Badge} tone="bad" data-tip=${g.dueN === 1 ? '1 υπενθύμιση ζητά προσοχή σήμερα' : g.dueN + ' υπενθυμίσεις ζητούν προσοχή σήμερα'}>${g.dueN}<//>`}</span>`;

// «Σήμερα:» στην κάρτα ατόμου: οι κανόνες που ισχύουν και, αν έφτασε υπενθύμιση (shared/notes remLine), η γραμμή της με σύνδεσμο στην καρτέλα Σημειώσεις
export function TodayAlert({ rules, rem, onRem }: P) {
  if (!rules.length && !rem) return null;
  return html`<${Alert} tone="warn"><span><b>Σήμερα:</b> ${rules.join(' · ')}${rem && rules.length > 0 && html`<br/>`}${rem && html`<button type="button" className="linkish today-rem" data-tip="Άνοιγμα των σημειώσεων" onClick=${onRem}>${Icon.bell}${rem}</button>`}</span><//>`;
}
