// Σημειώσεις του γραφείου (24/10): εντολές, ομαδοποίηση, υπενθυμίσεις, αποθήκευση και αναίρεση, νέα ΕΣΣΟ, σύνδεση στο UI. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readFileSync } from 'fs';
import { Store } from '../src/main/db';
import { apply, type Command } from '../src/shared/commands';
import type { AppState, Note } from '../src/shared/domain';
import { freshState } from '../src/shared/esso';
import { NOTE_MAX, dueCount, noteKind, noteLinks, normNote, noteDue, noteGroups, noteHead, noteIn, noteIndex, noteSearch, noteWho, notesOf, quickRems, remLabel } from '../src/shared/notes';
import { fakeState } from './fixtures';

const D = '2026-10-24';   // Σάββατο
let n = 0;
const ctx = { today: D, newId: () => 'u' + ++n };
const base = (): AppState => ({ ...fakeState(6), cadreList: [{ id: 's1', rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΔΗΣ', first: 'ΔΟΚΙΜΟΣ', active: true }, { id: 's2', rank: 'ΥΠΑΣΠΙΣΤΗΣ', hk: 'Λοχίες', last: 'ΤΥΧΑΙΟΠΟΥΛΟΣ', first: 'ΠΕΤΡΟΣ', active: false }] });
const run = (s: AppState, c: Command) => apply(s, c, ctx);
const add = (s: AppState, note: Extract<Command, { t: 'addNote' }>['note']) => run(s, { t: 'addNote', note }).state;

describe('εντολές σημειώσεων', () => {
  it('γενική σημείωση: κείμενο, μέρα, χωρίς Excel', () => {
    const r = run(base(), { t: 'addNote', note: { text: '  Έλεγχος κλειδιών οπλοστασίου  ' } });
    expect(r.state.notes).toEqual([{ id: expect.stringMatching(/^n/), text: 'Έλεγχος κλειδιών οπλοστασίου', at: D }]);
    expect(r.files).toEqual([]);
    expect(r.text).toBe('Σημείωση: «Έλεγχος κλειδιών οπλοστασίου»');
  });
  it('για στρατιώτη και για στέλεχος, με υπενθύμιση και αστέρι· το Ιστορικό λέει για ποιον', () => {
    const a = run(base(), { t: 'addNote', note: { text: 'Ζήτησε να μην μπει ΣΚ', pids: [2], rem: '2026-10-26', star: true } });
    expect(a.state.notes[0]).toMatchObject({ pids: [2], rem: '2026-10-26', star: true });
    expect(a.text).toContain('Ζήτησε να μην μπει ΣΚ');
    expect(a.text).toContain('υπενθύμιση 26/10');
    const b = add(a.state, { text: 'Λείπει σε σεμινάριο', cids: ['s1'] });
    expect(b.notes[1]).toMatchObject({ cids: ['s1'] }); expect(b.notes[1].pids).toBeUndefined();
  });
  it('σφάλματα: κενό, πολύ μεγάλο, άγνωστο άτομο', () => {
    const s = base();
    expect(() => run(s, { t: 'addNote', note: { text: '   ' } })).toThrow(/Γράψε τη σημείωση/);
    expect(() => run(s, { t: 'addNote', note: { text: 'x'.repeat(NOTE_MAX + 1) } })).toThrow(/πολύ μεγάλη/);
    expect(() => run(s, { t: 'addNote', note: { text: 'α', pids: [999] } })).toThrow(/στρατιώτη/);
    expect(() => run(s, { t: 'addNote', note: { text: 'α', cids: ['zz'] } })).toThrow(/στέλεχος/);
    expect(() => run(s, { t: 'addNote', note: { text: 'α', rem: '2026-10-23' } })).toThrow(/μέρα που πέρασε/);
    expect(() => run(s, { t: 'addNote', note: { text: 'α', rem: '24/10' } })).toThrow(/ημερομηνία/);
    expect(run(s, { t: 'addNote', note: { text: 'α', rem: D } }).state.notes[0].rem).toBe(D);   // σήμερα επιτρέπεται
  });
  it('ολοκλήρωση, επαναφορά, επεξεργασία και διαγραφή', () => {
    let s = add(base(), { text: 'Α', pids: [1], rem: '2026-10-25' });
    const id = s.notes[0].id;
    s = run(s, { t: 'doneNote', id, done: true }).state;
    expect(s.notes[0].done).toBe(D);
    expect(run(s, { t: 'doneNote', id, done: true })).toMatchObject({ text: '', state: s });   // ίδιο: τίποτα δεν αλλάζει
    s = run(s, { t: 'doneNote', id, done: false }).state; expect(s.notes[0].done).toBeUndefined();
    // άλλαξε το κείμενο, πέρασε σε άλλο άτομο, έφυγε η υπενθύμιση, έγινε σημαντική
    s = run(s, { t: 'editNote', id, patch: { text: 'Β', who: { cids: ['s1'] }, rem: '', star: true } }).state;
    expect(s.notes[0]).toEqual({ id, text: 'Β', at: D, cids: ['s1'], star: true });
    s = run(s, { t: 'editNote', id, patch: { who: null, star: false } }).state;
    expect(s.notes[0]).toEqual({ id, text: 'Β', at: D });
    const same = run(s, { t: 'editNote', id, patch: { text: 'Β' } }); expect(same.state).toBe(s); expect(same.text).toBe('');
    expect(() => run(s, { t: 'editNote', id, patch: { text: ' ' } })).toThrow();
    expect(() => run(s, { t: 'editNote', id: 'zz', patch: { star: true } })).toThrow(/Δεν βρέθηκε/);
    // παλιά υπενθύμιση που δεν αλλάζει μένει ακόμα κι αν πέρασε
    const old: AppState = { ...s, notes: [{ ...s.notes[0], rem: '2026-10-01' }] };
    expect(run(old, { t: 'editNote', id, patch: { rem: '2026-10-01', star: true } }).state.notes[0].star).toBe(true);
    expect(run(s, { t: 'deleteNote', id }).state.notes).toEqual([]);
  });
});

describe('ομαδοποίηση και υπενθυμίσεις', () => {
  const mk = (id: string, x: Partial<Note> = {}): Note => ({ id, text: id, at: '2026-10-20', ...x });
  const list = [mk('a'), mk('b', { rem: '2026-10-22' }), mk('c', { rem: D }), mk('d', { rem: '2026-10-27' }), mk('e', { rem: '2026-10-25' }), mk('f', { star: true }), mk('g', { rem: D, done: '2026-10-23' })];
  it('«πρέπει σήμερα»: σήμερα και παλιότερες, πρώτα οι πιο παλιές· ολοκληρωμένες ποτέ', () => {
    expect(list.filter(x => noteDue(x, D)).map(x => x.id)).toEqual(['b', 'c']);
    expect(dueCount(list, D)).toBe(2);
    expect(dueCount(undefined, D)).toBe(0);
    const g = noteGroups(list.filter(x => !x.done), D);
    expect(g.due.map(x => x.id)).toEqual(['b', 'c']);
    expect(g.soon.map(x => x.id)).toEqual(['e', 'd']);
    expect(g.rest.map(x => x.id)).toEqual(['f', 'a']);   // σημαντική πρώτη, μετά νεότερες
  });
  it('φίλτρα', () => {
    const ppl = [mk('p', { pids: [1] }), mk('q', { cids: ['s1'] }), mk('r'), mk('s', { done: D, pids: [1] })];
    const ids = (f: Parameters<typeof noteIn>[0]) => ppl.filter(x => noteIn(f, x)).map(x => x.id);
    expect(ids('all')).toEqual(['p', 'q', 'r']);
    expect(ids('sol')).toEqual(['p']); expect(ids('cad')).toEqual(['q']); expect(ids('gen')).toEqual(['r']); expect(ids('done')).toEqual(['s']);
  });
  it('ετικέτες υπενθύμισης', () => {
    expect(remLabel('2026-10-22', D)).toEqual({ text: 'Εκπρόθεσμη 2 μέρες', tone: 'bad' });
    expect(remLabel('2026-10-23', D).text).toBe('Εκπρόθεσμη 1 μέρα');
    expect(remLabel(D, D)).toEqual({ text: 'Σήμερα', tone: 'bad' });
    expect(remLabel('2026-10-25', D)).toEqual({ text: 'Αύριο', tone: 'warn' });
    expect(remLabel('2026-10-29', D)).toMatchObject({ text: expect.stringContaining('29/10'), tone: 'info' });
    expect(remLabel('2026-10-29', D).text).toContain('σε 5 μέρες');
    expect(remLabel(D, D, true)).toEqual({ text: '24/10', tone: 'muted' });
  });
  it('γρήγορες υπενθυμίσεις: αύριο, επόμενη Δευτέρα, σε εβδομάδα', () => {
    expect(quickRems(D)).toEqual([{ id: 'tom', label: 'Αύριο', date: '2026-10-25' }, { id: 'mon', label: 'Δευτέρα 26/10', date: '2026-10-26' }, { id: 'wk', label: 'Σε μία εβδομάδα', date: '2026-10-31' }]);
    // Κυριακή: η Δευτέρα είναι αύριο, δεν επαναλαμβάνεται
    expect(quickRems('2026-10-25').map(x => x.id)).toEqual(['tom', 'wk']);
    // Δευτέρα: η επόμενη Δευτέρα είναι σε 7 μέρες, δεν επαναλαμβάνεται
    expect(quickRems('2026-10-26').map(x => x.date)).toEqual(['2026-10-27', '2026-11-02']);
    expect(quickRems('2026-10-27').map(x => x.id)).toEqual(['tom', 'mon', 'wk']);
  });
});

describe('ονόματα, αναζήτηση, ένδειξη στους πίνακες', () => {
  const s = (() => { let x = base(); x = add(x, { text: 'Ζήτησε άδεια τιμητική', pids: [2] }); x = add(x, { text: 'Σεμινάριο', cids: ['s1'], rem: D }); x = add(x, { text: 'Γενικό θέμα' }); x = add(x, { text: 'Του εκτός', cids: ['s2'] }); return x; })();
  it('όνομα και «εκτός δύναμης»', () => {
    const w = s.notes.map(x => noteWho(s, x));
    expect(w[0]).toMatchObject({ kind: 'sol', active: true }); expect(w[0].label).toMatch(/^\S+ \S\.$/);
    expect(w[1]).toMatchObject({ kind: 'cad', label: 'ΛΧΙΑΣ ΔΟΚΙΜΙΔΗΣ Δ.' });
    expect(w[2]).toEqual({ kind: 'gen', label: 'Γενική', active: true, items: [] });
    expect(w[3].active).toBe(false);
    expect(noteWho(s, { id: 'x', text: '', at: D, pids: [999] }).active).toBe(false);
  });
  it('αναζήτηση χωρίς τόνους, στο κείμενο και στο όνομα', () => {
    const f = (q: string) => s.notes.filter(x => noteSearch(s, x, q)).map(x => x.text);
    expect(f('ΤΙΜΗΤΙΚΗ')).toEqual(['Ζήτησε άδεια τιμητική']);
    expect(f('σεμιναριο δοκιμιδ')).toEqual(['Σεμινάριο']);
    expect(f('')).toHaveLength(4);
    expect(f('ξξξ')).toEqual([]);
  });
  it('ένδειξη ανά άτομο: πόσες ανοιχτές, και αν έφτασε υπενθύμιση', () => {
    const m = noteIndex(s.notes, D);
    expect(m.get('p2')).toEqual({ n: 1, hot: false }); expect(m.get('cs1')).toEqual({ n: 1, hot: true });
    expect(m.has('cu1')).toBe(false);   // η γενική δεν μετρά σε κανέναν
    expect(notesOf(s.notes, { pid: 2 })).toHaveLength(1); expect(notesOf(s.notes, { cid: 's1' })).toHaveLength(1);
    const done = run(s, { t: 'doneNote', id: s.notes[1].id, done: true }).state;
    expect(noteIndex(done.notes, D).has('cs1')).toBe(false);
  });
  it('μικρό κείμενο για το Ιστορικό', () => {
    expect(noteHead('α  β\nγ')).toBe('α β γ');
    expect(noteHead('x'.repeat(100), 10)).toBe('xxxxxxxxx…');
  });
});

describe('αποθήκευση, αναίρεση, νέα ΕΣΣΟ', () => {
  const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  it('οι σημειώσεις μένουν μετά το κλείσιμο, και η αναίρεση τις γυρίζει πίσω', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ginotes-'));
    let st = new Store(dir, WASM); await st.open();
    st.commit(add(st.state, { text: 'Πρώτη', rem: '2026-10-27' }));
    const patch = st.commit(add(st.state, { text: 'Δεύτερη', star: true }));
    const p2 = st.commit(run(st.state, { t: 'doneNote', id: st.state.notes[0].id, done: true }).state);
    st.close();
    st = new Store(dir, WASM); await st.open();
    expect(st.state.notes.map(x => [x.text, !!x.done, !!x.star])).toEqual([['Πρώτη', true, false], ['Δεύτερη', false, true]]);
    st.revert(p2); expect(st.state.notes[0].done).toBeUndefined();
    st.revert(patch); expect(st.state.notes.map(x => x.text)).toEqual(['Πρώτη']);
    st.close();
  });
  it('νέα ΕΣΣΟ: μένουν οι γενικές και των στελεχών, των στρατιωτών μένουν στο αρχείο της παλιάς', () => {
    let s = base();
    s = add(s, { text: 'Γενική' }); s = add(s, { text: 'Στρατιώτη', pids: [1] }); s = add(s, { text: 'Στελέχους', cids: ['s1'] });
    const f = freshState(s, { s: 'Δ', y: 2026 }, D, 'C:\\Νέος');
    expect(f.notes.map(x => x.text)).toEqual(['Γενική', 'Στελέχους']);
    expect(f.people).toEqual([]);
  });
});

describe('σημείωση για πολλά άτομα', () => {
  it('δένεται σε πολλούς στρατιώτες και στελέχη μαζί, χωρίς διπλά', () => {
    const r = run(base(), { t: 'addNote', note: { text: 'Συνάντηση με Α και Β', pids: [1, 2, 2], cids: ['s1'] } });
    expect(r.state.notes[0]).toMatchObject({ pids: [1, 2], cids: ['s1'] });
    expect(noteKind(r.state.notes[0])).toBe('mix');
    expect(r.text).toMatch(/\(.+, .+, .+\)/);   // το Ιστορικό λέει και τους τρεις
    expect(() => run(base(), { t: 'addNote', note: { text: 'α', pids: [1, 999] } })).toThrow(/στρατιώτη/);
  });
  it('φαίνεται σε όλους: ένδειξη, καρτέλα, φίλτρα· ολοκλήρωση το κλείνει για όλους', () => {
    const s = add(base(), { text: 'Κοινή', pids: [1, 2], cids: ['s1'], rem: D });
    const m = noteIndex(s.notes, D);
    for (const k of ['p1', 'p2', 'cs1']) expect(m.get(k)).toEqual({ n: 1, hot: true });
    expect(notesOf(s.notes, { pid: 1 })).toHaveLength(1); expect(notesOf(s.notes, { pid: 2 })).toHaveLength(1); expect(notesOf(s.notes, { cid: 's1' })).toHaveLength(1);
    expect(notesOf(s.notes, { pid: 3 })).toHaveLength(0);
    expect(noteIn('sol', s.notes[0])).toBe(true); expect(noteIn('cad', s.notes[0])).toBe(true); expect(noteIn('gen', s.notes[0])).toBe(false);
    expect(noteWho(s, s.notes[0]).items.map(x => x.key)).toEqual(['p1', 'p2', 'cs1']);
    expect(noteSearch(s, s.notes[0], 'δοκιμιδ')).toBe(true);
    const done = run(s, { t: 'doneNote', id: s.notes[0].id, done: true }).state;
    expect(noteIndex(done.notes, D).size).toBe(0);
  });
  it('επεξεργασία: προσθέτεις και αφαιρείς άτομα', () => {
    let s = add(base(), { text: 'Α', pids: [1] }); const id = s.notes[0].id;
    s = run(s, { t: 'editNote', id, patch: { who: { pids: [1, 3], cids: ['s1'] } } }).state;
    expect(s.notes[0]).toMatchObject({ pids: [1, 3], cids: ['s1'] });
    s = run(s, { t: 'editNote', id, patch: { who: { pids: [3] } } }).state;
    expect(s.notes[0].pids).toEqual([3]); expect(s.notes[0].cids).toBeUndefined();
  });
  it('σημειώσεις της πρώτης έκδοσης (pid/cid) διαβάζονται και μετατρέπονται', () => {
    const old: Note = { id: 'o', text: 'Παλιά', at: D, pid: 2, cid: 's1' };
    expect(noteLinks(old)).toEqual({ pids: [2], cids: ['s1'] });
    expect(normNote(old)).toEqual({ id: 'o', text: 'Παλιά', at: D, pids: [2], cids: ['s1'] });
    expect(noteIndex([old], D).get('p2')).toEqual({ n: 1, hot: false });
  });
  it('νέα ΕΣΣΟ: μικτή σημείωση μένει στα στελέχη χωρίς τους στρατιώτες', () => {
    const s = add(add(base(), { text: 'Μικτή', pids: [1], cids: ['s1'] }), { text: 'Δύο στρατιώτες', pids: [1, 2] });
    const f = freshState(s, { s: 'Δ', y: 2026 }, D, 'C:\\Νέος');
    expect(f.notes).toHaveLength(1); expect(f.notes[0]).toMatchObject({ text: 'Μικτή', cids: ['s1'] }); expect(f.notes[0].pids).toBeUndefined();
  });
});

describe('σύνδεση στην εφαρμογή', () => {
  const src = (f: string) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
  it('το @όνομα μπαίνει στο κείμενο και δένει το άτομο, χωρίς να ξεχνά τους προηγούμενους', () => {
    const a = src('renderer/screens/notes.ts');
    expect(a).toContain("setText(text.replace(/@([^\\s@]*)$/, () => '@' + x.label + ' '))");
    expect(a).toContain('set({ pids: d.pids.includes(x.id) ? d.pids : [...d.pids, x.id] })');
  });
  it('μενού: Σημειώσεις μετά τα Έντυπα, με αριθμό υπενθυμίσεων· Ιστορικό από την πάνω μπάρα', () => {
    const a = src('renderer/app.ts');
    expect(a).toMatch(/NAV_MAIN = \[[^\]]*'reports', 'notes'\]/);
    expect(a).toMatch(/notes: \['Σημειώσεις', Icon\.notes, NotesScreen\]/);
    expect(a).toMatch(/v === 'notes' \? notesDue/);
  });
  it('Ctrl+Shift+N (νέα σημείωση) προηγείται του Ctrl+N (δήλωση), και δένει στην ανοιχτή καρτέλα στρατιώτη', () => {
    const a = src('renderer/app.ts');
    const note = a.indexOf("mod && e.shiftKey && (k === 'n'"), declare = a.indexOf("else if (mod && (k === 'n'");
    expect(note).toBeGreaterThan(0); expect(declare).toBeGreaterThan(note);
    expect(a).toMatch(/kind: 'note', data: pid != null && pid > 0 \? \{ pid \} : \{\}/);
  });
  it('οι σημειώσεις δεν ξαναγράφουν Excel ή έντυπα, και έχουν δική τους ρύθμιση στη βάση (αναίρεση)', () => {
    expect(src('main/main.ts')).toMatch(/k !== 'lastExpire' && k !== 'notes'/);
    expect(src('main/db.ts')).toMatch(/KV_KEYS = \[[^\]]*'notes'/);
    expect(src('main/db.ts')).toMatch(/KV_ENTRIES[^\n]*notes: 'ids'/);
  });
  it('Ctrl+K: Νέα σημείωση, Σημειώσεις, και αναζήτηση μέσα στις σημειώσεις', () => {
    const o = src('renderer/screens/other.ts');
    for (const t of ['Νέα σημείωση', "t: 'Σημειώσεις'", 'Σημειώσεις › Υπενθυμίσεις', 'nts.map']) expect(o).toContain(t);
  });
  it('Σήμερα: γραμμή στο «Πρέπει σήμερα»· Δυναμολόγιο και Στελέχη: ένδειξη και ενότητα στην καρτέλα', () => {
    expect(src('renderer/screens/other.ts')).toMatch(/key: 'notes'[^\n]*\n[^\n]*\n[^\n]*nfilter: 'rem'/);
    expect(src('renderer/screens/people.ts')).toContain('<${PersonNotes} who=${{ pid }}/>');
    expect(src('renderer/screens/people.ts')).toContain('NoteDot');
    expect(src('renderer/screens/cadre.ts')).toContain('<${PersonNotes} who=${{ cid: c.id }}/>');
  });
});
