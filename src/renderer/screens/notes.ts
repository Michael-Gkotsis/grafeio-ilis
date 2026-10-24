// features/notes · «Σημειώσεις» (Michael, 24/10: «γράφουμε χαρτάκια και τα ξεχνάμε»): γενικές, ανά στρατιώτη, ανά στέλεχος, με
// προαιρετική υπενθύμιση. Γρήγορη προσθήκη πάνω πάνω (Ctrl+Enter), εύκολη ανάγνωση από κάτω, ίδια σημείωση στην καρτέλα του ατόμου.
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { html, cx, Badge, Button, Dialog, Icon, PageHeader, Segmented, Why, useDirty, useToast } from '../ui';
import { Select } from '../select';
import { searchPeople, useNav, useStore } from '../store';
import { DateField, PersonPicker } from '../common';
import { personMap } from '../../shared/rules';
import { orderedCadre, cadreSearch } from '../../shared/cadre';
import { rankTxt } from '../../shared/ranks';
import { dm } from '../../shared/dates';
import type { Note } from '../../shared/domain';
import { NOTE_FILTERS, NOTE_MAX, dueCount, noteGroups, noteIn, noteKey, noteSearch, noteWho, notesOf, quickRems, remLabel, type NoteFilter } from '../../shared/notes';
type P = any;

type Kind = 'gen' | 'sol' | 'cad';
interface Draft { text: string; kind: Kind; pid?: number; cid?: string; rem: string; star: boolean }
interface Start { pid?: number; cid?: string }

// Το κείμενο, για ποιον είναι, υπενθύμιση και «σημαντική»: κοινό για τη σελίδα, το παράθυρο Ctrl+Shift+N και την καρτέλα ατόμου
function useNoteDraft(start: Start = {}) {
  const { run, undoMark } = useStore(); const toast = useToast();
  const first = (): Draft => ({ text: '', kind: start.pid != null ? 'sol' : start.cid ? 'cad' : 'gen', pid: start.pid, cid: start.cid, rem: '', star: false });
  const [d, setD] = useState<Draft>(first);
  const set = (x: Partial<Draft>) => setD(o => ({ ...o, ...x }));
  const missing = [!d.text.trim() && 'Κείμενο σημείωσης', d.kind === 'sol' && d.pid == null && 'Στρατιώτης', d.kind === 'cad' && !d.cid && 'Στέλεχος'].filter(Boolean) as string[];
  const why = missing.length ? 'Λείπει: ' + missing.join(', ') : '';
  const save = async (): Promise<boolean> => {
    if (why) return false;
    const note = { text: d.text, ...(d.kind === 'sol' ? { pid: d.pid } : d.kind === 'cad' ? { cid: d.cid } : {}), ...(d.rem ? { rem: d.rem } : {}), ...(d.star ? { star: true } : {}) };
    if (!(await run({ t: 'addNote', note }, false))) return false;
    toast({ text: d.rem ? 'Σημειώθηκε. Υπενθύμιση ' + dm(d.rem) + '.' : 'Σημειώθηκε.', actions: [undoMark()] });
    setD(first());
    return true;
  };
  return { d, set, why, save, dirty: d.text.trim().length > 0 };
}

// Υπενθύμιση με ένα κλικ (αύριο, Δευτέρα, σε εβδομάδα) ή με ημερομηνία· «Καμία» την αφαιρεί
function RemPick({ value, onChange, id }: P) {
  const { today } = useStore();
  const quick = useMemo(() => quickRems(today), [today]);
  return html`<div className="note-rem"><span className="note-lbl">Υπενθύμιση</span>
    <button type="button" className="ui-chip" aria-pressed=${!value} onClick=${() => onChange('')}>Καμία</button>
    ${quick.map(q => html`<button key=${q.id} type="button" className="ui-chip" aria-pressed=${value === q.date} onClick=${() => onChange(q.date)}>${q.label}</button>`)}
    <div className="note-rem__date"><${DateField} id=${id} aria-label="Άλλη μέρα υπενθύμισης" value=${value} min=${today} onChange=${(e: P) => onChange(e.target.value)}/></div></div>`;
}

// Για ποιον: γενική, στρατιώτης ή στέλεχος
function WhoField({ d, set, autoFocus }: P) {
  const { state } = useStore();
  const pm = useMemo(() => personMap(state.people), [state.people]);
  const cadre = useMemo(() => orderedCadre(state.cadreList).filter(c => c.active || c.id === d.cid), [state.cadreList, d.cid]);
  const p = d.pid != null ? pm.get(d.pid) : undefined;
  return html`<div className="note-who"><span className="note-lbl">Για</span>
    <${Segmented} small=${true} value=${d.kind} onChange=${(kind: Kind) => set({ kind, pid: undefined, cid: undefined })}
      items=${[{ value: 'gen', label: 'Γενική' }, { value: 'sol', label: 'Στρατιώτης' }, { value: 'cad', label: 'Στέλεχος' }]}/>
    ${d.kind === 'sol' && (p
      ? html`<span className="note-pick"><b>${p.last} ${p.first}</b><button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick=${() => set({ pid: undefined })}>Άλλαξε</button></span>`
      : html`<div className="note-pick"><${PersonPicker} id="nt-pid" placeholder="Επώνυμο, όνομα ή ΑΣΜ…" autoFocus=${autoFocus} onChange=${(pid: number) => set({ pid })}/></div>`)}
    ${d.kind === 'cad' && html`<div className="note-pick"><${Select} id="nt-cid" className="ui-input" aria-label="Στέλεχος" value=${d.cid || ''} onChange=${(e: P) => set({ cid: e.target.value || undefined })}>
      <option value="">Διάλεξε στέλεχος…</option>${cadre.map(c => html`<option key=${c.id} value=${c.id}>${rankTxt(c)} ${c.last} ${c.first}${c.active ? '' : ' (εκτός δύναμης)'}</option>`)}<//></div>`}</div>`;
}

// Γράφοντας «@» και τα πρώτα γράμματα, προτείνει στρατιώτες και στελέχη (το κείμενο μπορεί να έχει και email, γι' αυτό μόνο στο τέλος)
function useMention(text: string, setText: (t: string) => void, pick: (x: { kind: 'sol' | 'cad'; id: string | number }) => void) {
  const { state } = useStore();
  const [sel, setSel] = useState(0); const [off, setOff] = useState(false);
  const m = /(?:^|\s)@([^\s@]*)$/.exec(text); const q = m ? m[1] : null;
  useEffect(() => { setSel(0); setOff(false); }, [q]);
  const items = useMemo(() => {
    if (!q) return [];
    const ppl = searchPeople(state.people, q).slice(0, 5).map(p => ({ kind: 'sol' as const, id: p.id, label: p.last + ' ' + p.first, sub: rankTxt(p) || 'Στρατιώτης' }));
    const cad = orderedCadre(state.cadreList).filter(c => c.active && cadreSearch(c, q)).slice(0, 3).map(c => ({ kind: 'cad' as const, id: c.id, label: c.last + ' ' + c.first, sub: 'Στέλεχος · ' + rankTxt(c) }));
    return [...ppl, ...cad];
  }, [q, state.people, state.cadreList]);
  const open = q != null && !off;
  const choose = (i: number) => { const x = items[i]; if (!x) return; setText(text.replace(/@([^\s@]*)$/, '').trimEnd() + (text.replace(/@([^\s@]*)$/, '').trim() ? ' ' : '')); pick(x); };
  // true: το πλήκτρο το πήρε η λίστα
  const onKey = (e: P): boolean => {
    if (!open) return false;
    if (e.key === 'Escape') { e.stopPropagation(); setOff(true); return true; }
    if (!items.length) return false;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => (s + 1) % items.length); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => (s + items.length - 1) % items.length); return true; }
    if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') { e.preventDefault(); choose(sel); return true; }
    return false;
  };
  const list = open ? html`<ul className="note-sug" role="listbox" aria-label="Άτομα">
    ${items.length === 0 ? html`<li className="note-sug__hd">${q ? 'Κανείς δεν ταιριάζει.' : 'Γράψε τα πρώτα γράμματα του επωνύμου…'}</li>` :
      items.map((x, i) => html`<li key=${x.kind + x.id} role="option" aria-selected=${i === sel} onMouseDown=${(e: P) => { e.preventDefault(); choose(i); }} onMouseEnter=${() => setSel(i)}><b>${x.label}</b><small>${x.sub}</small></li>`)}</ul>` : null;
  return { onKey, list };
}

// Το πλαίσιο γρήγορης προσθήκης της σελίδας και του παραθύρου Ctrl+Shift+N
function NoteComposer({ draft, autoFocus, onSaved, fixedWho }: P) {
  const { d, set, why, save } = draft;
  const men = useMention(d.text, (text: string) => set({ text }), (x: P) => (x.kind === 'sol' ? set({ kind: 'sol', pid: x.id, cid: undefined }) : set({ kind: 'cad', cid: x.id, pid: undefined })));
  const go = async () => { if (await save()) onSaved?.(); };
  return html`<div className="note-comp">
    <div className="note-comp__box"><textarea id="nt-text" className="ui-input note-text" rows="2" maxLength=${NOTE_MAX} data-autofocus=${autoFocus ? '' : undefined} aria-label="Κείμενο σημείωσης"
      placeholder=${'Γράψε τη σημείωση εδώ… (Ctrl+Enter για αποθήκευση)\nΜε @ τη δένεις σε άτομο, π.χ. @Παπαδ'} value=${d.text} onChange=${(e: P) => set({ text: e.target.value })}
      onKeyDown=${(e: P) => { if (men.onKey(e)) return; if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); go(); } }}/>${men.list}</div>
    ${!fixedWho && html`<${WhoField} d=${d} set=${set} autoFocus=${false}/>`}
    <${RemPick} id="nt-rem" value=${d.rem} onChange=${(rem: string) => set({ rem })}/>
    <div className="note-comp__foot">
      <label className="ui-checkrow"><input type="checkbox" className="ui-check" checked=${d.star} onChange=${() => set({ star: !d.star })}/>Σημαντική</label>
      <span className="note-comp__sp"></span><${Why} text=${why}/>
      <${Button} disabled=${!!why} why=${why} onClick=${go}>Αποθήκευση<//></div></div>`;
}

// Νέα σημείωση από οπουδήποτε (Ctrl+Shift+N, Ctrl+K): όταν είναι ανοιχτή η καρτέλα ενός ατόμου, δένεται σε αυτό
export function NoteDialog({ start, onClose }: P) {
  const draft = useNoteDraft(start || {});
  return html`<${Dialog} size="lg" title="Νέα σημείωση" onClose=${onClose} dirty=${draft.dirty && 'Η σημείωση δεν αποθηκεύτηκε. Αν κλείσεις, χάνεται.'}>
    <${NoteComposer} draft=${draft} autoFocus=${true} onSaved=${onClose}/><//>`;
}

// Μικρή ένδειξη δίπλα στο όνομα στους πίνακες: έχει σημειώσεις· κόκκινη όταν έφτασε υπενθύμιση
export function NoteDot({ m }: P) {
  if (!m) return null;
  return html`<span className=${cx('notedot', m.hot && 'is-hot')} data-tip=${(m.n === 1 ? '1 σημείωση' : m.n + ' σημειώσεις') + (m.hot ? ' · υπενθύμιση που έφτασε' : '')} aria-label=${m.n + ' σημειώσεις'}>${Icon.notes}</span>`;
}

const whoIcon = (k: Kind) => (k === 'cad' ? Icon.shield : k === 'sol' ? Icon.people : Icon.notes);
function WhoChip({ n, onOpen }: P) {
  const { state } = useStore();
  const w = noteWho(state, n);
  if (w.kind === 'gen') return html`<span className="who-chip is-gen">${Icon.notes}Γενική</span>`;
  return html`<button type="button" className=${cx('who-chip', !w.active && 'is-off')} data-tip=${w.active ? 'Άνοιγμα καρτέλας' : 'Εκτός δύναμης · άνοιγμα καρτέλας'} onClick=${() => onOpen(n)}>${whoIcon(w.kind)}${w.label}${!w.active && ' (εκτός δύναμης)'}</button>`;
}

// Μία σημείωση: τσεκάρεις όταν τελειώσει, επεξεργασία και διαγραφή (με Αναίρεση) στο hover/focus
function NoteCard({ n, compact, onEdit, onOpen }: P) {
  const { today, run, undoMark } = useStore(); const toast = useToast();
  const due = !n.done && !!n.rem && n.rem <= today;
  const rl = n.rem ? remLabel(n.rem, today, !!n.done) : null;
  const done = async () => { await run({ t: 'doneNote', id: n.id, done: !n.done }, false); };
  const star = () => run({ t: 'editNote', id: n.id, patch: { star: !n.star } }, false);
  const del = async () => { if (await run({ t: 'deleteNote', id: n.id }, false)) toast({ text: 'Σβήστηκε η σημείωση.', actions: [undoMark()] }); };
  return html`<article className=${cx('note-card', due && 'is-due', n.star && !n.done && 'is-star', n.done && 'is-done', compact && 'is-compact')}>
    <div className="note-card__top"><button type="button" className="note-ck" role="checkbox" aria-checked=${!!n.done} aria-label=${n.done ? 'Ξανάνοιξε τη σημείωση' : 'Ολοκληρώθηκε'} data-tip=${n.done ? 'Ξανάνοιξε' : 'Ολοκληρώθηκε'} onClick=${done}>${n.done ? Icon.check : null}</button>
      <div className="note-card__txt">${n.text}</div></div>
    <div className="note-card__meta">${!compact && html`<${WhoChip} n=${n} onOpen=${onOpen}/>`}
      ${rl && html`<${Badge} tone=${rl.tone === 'muted' ? undefined : rl.tone} className="note-rem-badge">${Icon.bell}${rl.text}<//>`}
      <span className="note-card__date">${n.done ? 'Ολοκληρώθηκε ' + dm(n.done) : dm(n.at)}</span>
      <span className="note-card__acts">
        <button type="button" className=${cx('note-ib', n.star && 'is-on')} aria-label=${n.star ? 'Βγάλε από τις σημαντικές' : 'Σημαντική'} aria-pressed=${!!n.star} data-tip=${n.star ? 'Σημαντική (πάτα για να φύγει)' : 'Σημείωσέ τη σημαντική'} onClick=${star}>${Icon.star}</button>
        <button type="button" className="note-ib" aria-label="Επεξεργασία" data-tip="Επεξεργασία, υπενθύμιση" onClick=${() => onEdit(n)}>${Icon.edit}</button>
        <button type="button" className="note-ib" aria-label="Διαγραφή" data-tip="Διαγραφή (με Αναίρεση)" onClick=${del}>${Icon.trash}</button></span></div></article>`;
}

function EditDialog({ note, onClose }: P) {
  const { run } = useStore(); const toast = useToast();
  const [f, setF] = useState<Draft>({ text: note.text, kind: note.pid != null ? 'sol' : note.cid ? 'cad' : 'gen', pid: note.pid, cid: note.cid, rem: note.rem || '', star: !!note.star });
  const set = (x: Partial<Draft>) => setF(o => ({ ...o, ...x }));
  const dirty = useDirty(f);
  const missing = [!f.text.trim() && 'Κείμενο σημείωσης', f.kind === 'sol' && f.pid == null && 'Στρατιώτης', f.kind === 'cad' && !f.cid && 'Στέλεχος'].filter(Boolean) as string[];
  const why = missing.length ? 'Λείπει: ' + missing.join(', ') : '';
  const save = async () => {
    const who = f.kind === 'sol' ? { pid: f.pid! } : f.kind === 'cad' ? { cid: f.cid! } : null;
    if (await run({ t: 'editNote', id: note.id, patch: { text: f.text, who, rem: f.rem, star: f.star } }, false)) { onClose(); toast({ text: 'Αποθηκεύτηκε η σημείωση.' }); }
  };
  return html`<${Dialog} size="lg" title="Σημείωση" onClose=${onClose} dirty=${dirty && 'Οι αλλαγές δεν αποθηκεύτηκαν. Αν κλείσεις, χάνονται.'}
    footer=${html`<${Why} text=${why}/><${Button} variant="outline" onClick=${onClose}>Άκυρο<//><${Button} disabled=${!!why} why=${why} onClick=${save}>Αποθήκευση<//>`}>
    <div className="note-comp"><textarea id="ne-text" className="ui-input note-text" rows="4" maxLength=${NOTE_MAX} data-autofocus="" aria-label="Κείμενο σημείωσης" value=${f.text} onChange=${(e: P) => set({ text: e.target.value })}/>
      <${WhoField} d=${f} set=${set}/>
      <${RemPick} id="ne-rem" value=${f.rem} onChange=${(rem: string) => set({ rem })}/>
      <label className="ui-checkrow"><input type="checkbox" className="ui-check" checked=${f.star} onChange=${() => set({ star: !f.star })}/>Σημαντική</label></div><//>`;
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
    for (const n of notes) { if (n.done) continue; const k = noteKey(n); if (!k) continue; const w = noteWho(state, n); const x = m.get(k) || { k, label: w.label, n: 0, active: w.active }; x.n++; m.set(k, x); }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, 'el'));
  }, [notes, state.people, state.cadreList]);
  const rows = useMemo(() => notes.filter(n => noteIn(filter, n) && (!who || noteKey(n) === who) && noteSearch(state, n, dq)), [notes, filter, who, dq, state.people, state.cadreList]);
  const g = useMemo(() => noteGroups(rows, today), [rows, today]);
  const done = filter === 'done' ? [...rows].sort((a, b) => (b.done || '').localeCompare(a.done || '')) : [];
  const openWho = (n: Note) => { if (n.pid != null) nav.openPerson(n.pid); else if (n.cid) nav.go('cadre', { ccard: n.cid }); };
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

// Στην καρτέλα στρατιώτη/στελέχους: οι ανοιχτές σημειώσεις του και γρήγορη προσθήκη με Enter. who: { pid } ή { cid }
export function PersonNotes({ who }: P) {
  const { state, today } = useStore(); const nav = useNav();
  const list = notesOf(state.notes, who);
  const draft = useNoteDraft(who);
  const [more, setMore] = useState(false); const [rem, setRem] = useState(false);
  const [edit, setEdit] = useState<Note | null>(null);
  const { d, set, why, save } = draft;
  const sorted = useMemo(() => { const g = noteGroups(list, today); return [...g.due, ...g.soon, ...g.rest]; }, [state.notes, today, who.pid, who.cid]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shown = more ? sorted : sorted.slice(0, 3);
  const go = async () => { if (await save()) setRem(false); };
  return html`<section className="note-person" aria-label="Σημειώσεις">
    <div className="note-person__h"><h3>Σημειώσεις${list.length > 0 && ' · ' + list.length}</h3>
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" data-tip="Όλες οι σημειώσεις στη σελίδα Σημειώσεις" onClick=${() => nav.go('notes', { nwho: noteKey(who) })}>Άνοιγμα στη σελίδα</button></div>
    <div className="note-person__add"><input className="ui-input" aria-label="Νέα σημείωση για αυτό το άτομο" maxLength=${NOTE_MAX} placeholder="Γράψε σημείωση και πάτα Enter" value=${d.text} onChange=${(e: P) => set({ text: e.target.value })}
        onKeyDown=${(e: P) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }}/>
      <${Button} variant=${rem || d.rem ? 'secondary' : 'outline'} data-tip=${d.rem ? 'Υπενθύμιση ' + dm(d.rem) : 'Πρόσθεσε υπενθύμιση (ημερομηνία)'} aria-label="Υπενθύμιση" onClick=${() => setRem(!rem)}>${Icon.bell}${d.rem ? dm(d.rem) : ''}<//>
      <${Button} disabled=${!!why} why=${why} onClick=${go}>Πρόσθεσε<//></div>
    ${(rem || d.rem) && html`<${RemPick} id="np-rem" value=${d.rem} onChange=${(r: string) => set({ rem: r })}/>`}
    ${shown.map(n => html`<${NoteCard} key=${n.id} n=${n} compact=${true} onEdit=${setEdit} onOpen=${() => {}}/>`)}
    ${sorted.length > 3 && html`<button type="button" className="ui-btn ui-btn--link" onClick=${() => setMore(!more)}>${more ? 'Λιγότερες' : 'Και ' + (sorted.length - 3) + ' ακόμα'}</button>`}
    ${edit && html`<${EditDialog} note=${edit} onClose=${() => setEdit(null)}/>`}</section>`;
}
