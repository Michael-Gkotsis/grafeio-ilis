// The notes commands: add, edit, done, delete.
//
// Purpose: `noteCmd` runs the four notes commands; the text in the history is the beginning of the note.
// Does NOT: write Excel: notes are pure commands with `files: []`.
// Owner layer: core/commands (pure: no fs, no Electron, no React); imports core/model, core/duty and the other core
//   folders.
// Why: The four commands share the same checks and the same label, so they live in one function (the handler
//   `handleNote` calls it).
// Covering tests: test/notes.test.ts.
import { dm } from '../lib/dates';
import type { AppState } from '../model/state';
import type { Note } from '../model/records';
import { NOTE_MAX, noteHead, noteWho, normNote } from '../notes/notes';
import type { Command, Ctx, Result } from './types';

/** Notes: pure commands without Excel (files: []); the text in the History is the beginning of the note. */
export function noteCmd(
  s: AppState,
  c: Extract<Command, { t: 'addNote' | 'editNote' | 'doneNote' | 'deleteNote' }>,
  ctx: Ctx,
): Result {
  const notes = s.notes || [];
  const uniq = <T>(a: T[] | undefined): T[] => [...new Set(a || [])];
  const setWho = (n: Note, w: { pids?: number[]; cids?: string[] }) => {
    const pids = uniq(w.pids);
    const cids = uniq(w.cids);
    if (pids.some((id) => !s.people.some((p) => p.id === id))) throw new Error('Δεν βρέθηκε ο στρατιώτης');
    if (cids.some((id) => !s.cadreList.some((x) => x.id === id))) throw new Error('Δεν βρέθηκε το στέλεχος');
    delete n.pids;
    delete n.cids;
    delete n.pid;
    delete n.cid;
    if (pids.length) n.pids = pids;
    if (cids.length) n.cids = cids;
  };
  const checkRem = (rem: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rem)) throw new Error('Η ημερομηνία υπενθύμισης δεν είναι σωστή');
  };
  const text = (raw: string) => {
    const t = (raw || '').replace(/\r\n/g, '\n').trim();
    if (!t) throw new Error('Γράψε τη σημείωση');
    if (t.length > NOTE_MAX) throw new Error('Η σημείωση είναι πολύ μεγάλη (το πολύ ' + NOTE_MAX + ' γράμματα)');
    return t;
  };
  const label = (n: Note) => {
    const w = noteWho(s, n);
    return (w.kind === 'gen' ? '' : ' (' + w.label + ')') + ': «' + noteHead(n.text) + '»';
  };
  if (c.t === 'addNote') {
    const x = c.note;
    const n: Note = { id: 'n' + ctx.newId(), text: text(x.text), at: ctx.today };
    setWho(n, x);
    if (x.rem) {
      checkRem(x.rem);
      if (x.rem < ctx.today) throw new Error('Η υπενθύμιση είναι σε μέρα που πέρασε');
      n.rem = x.rem;
    }
    if (x.star) n.star = true;
    return {
      state: { ...s, notes: [...notes, n] },
      text: 'Σημείωση' + label(n) + (n.rem ? ' · υπενθύμιση ' + dm(n.rem) : ''),
      files: [],
    };
  }
  const old = notes.find((x) => x.id === c.id);
  if (!old) throw new Error('Δεν βρέθηκε η σημείωση');
  const put = (n: Note, t: string): Result => ({
    state: { ...s, notes: notes.map((x) => (x === old ? n : x)) },
    text: t,
    files: [],
  });
  if (c.t === 'deleteNote')
    return {
      state: { ...s, notes: notes.filter((x) => x !== old) },
      text: 'Σβήστηκε σημείωση' + label(old),
      files: [],
    };
  if (c.t === 'doneNote') {
    if (!!old.done === c.done) return { state: s, text: '', files: [] };
    const n = { ...old };
    if (c.done) n.done = ctx.today;
    else delete n.done;
    return put(n, (c.done ? 'Ολοκληρώθηκε σημείωση' : 'Ξανάνοιξε σημείωση') + label(old));
  }
  const p = c.patch;
  const n: Note = normNote(old);
  if (p.text !== undefined) n.text = text(p.text);
  if (p.who !== undefined) {
    setWho(n, p.who || {});
  }
  if (p.rem !== undefined) {
    if (p.rem) {
      checkRem(p.rem);
      if (p.rem !== old.rem && p.rem < ctx.today) throw new Error('Η υπενθύμιση είναι σε μέρα που πέρασε');
      n.rem = p.rem;
    } else delete n.rem;
  }
  if (p.star !== undefined) {
    if (p.star) n.star = true;
    else delete n.star;
  }
  if (JSON.stringify(n) === JSON.stringify(old)) return { state: s, text: '', files: [] };
  return put(
    n,
    'Άλλαξε σημείωση' +
      label(n) +
      (n.rem !== old.rem ? (n.rem ? ' · υπενθύμιση ' + dm(n.rem) : ' · χωρίς υπενθύμιση') : ''),
  );
}
