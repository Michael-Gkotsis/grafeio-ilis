// Σημειώσεις του γραφείου (24/10): εντολές, ομαδοποίηση, υπενθυμίσεις, αποθήκευση και αναίρεση, νέα ΕΣΣΟ, σύνδεση στο UI. Μόνο ψεύτικα ονόματα.
import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Store } from '../src/main/db';
import { apply, type Command } from '../src/shared/commands';
import type { AppState, Note } from '../src/shared/domain';
import { freshState } from '../src/shared/esso';
import { NOTE_MAX, dueCount, noteKind, noteLinks, normNote, noteDue, noteGroups, noteHead, noteIn, noteIndex, noteSearch, noteWho, personGroups, quickRems, remLabel, remLine } from '../src/shared/notes';
import { fakeState } from './fixtures';
import * as H from './support/screens-harness';
import { captureDocumentListeners, settle, startSession, type DocumentKeys, type Session } from './support/probe';
import { buttonsOf, flat, textOfHtml, textsIn } from './support/html';
import { readSources, SRC_DIR } from './support/source-scan';
import { appRenderer, loadWorld, renderCase as renderCaseOf, withState, type BehaviourWorld } from './support/behaviour';
import { activePeople } from '../src/shared/rules';
import { CommandPalette, HkaiScreen } from '../src/renderer/screens/other';
import { TodayScreen } from '../src/renderer/screens/today';
import { NoteDialog, NotesTab } from '../src/renderer/screens/notes';
import { PeopleScreen, PersonSheet } from '../src/renderer/screens/people';

vi.mock('react', async orig => (await import('./support/ssr-shims')).mockReactProbe(orig));
vi.mock('react-dom', async orig => (await import('./support/ssr-shims')).mockReactDom(orig));
vi.mock('react/jsx-runtime', async orig => (await import('./support/ssr-shims')).mockJsxRuntime(orig));
vi.mock('react/jsx-dev-runtime', async orig => (await import('./support/ssr-shims')).mockJsxRuntime(orig));

let bw: BehaviourWorld;
let session: Session | null = null;
let keys: DocumentKeys | null = null;
beforeAll(async () => { bw = await loadWorld(); });
afterEach(() => { session?.stop(); session = null; keys?.restore(); keys = null; });

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
    expect(personGroups(s.notes, { pid: 2 }, D).open).toBe(1); expect(personGroups(s.notes, { cid: 's1' }, D).open).toBe(1);
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
    expect(personGroups(s.notes, { pid: 1 }, D).open).toBe(1); expect(personGroups(s.notes, { pid: 2 }, D).open).toBe(1); expect(personGroups(s.notes, { cid: 's1' }, D).open).toBe(1);
    expect(personGroups(s.notes, { pid: 3 }, D).open).toBe(0);
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

describe('καρτέλα «Σημειώσεις» ενός ατόμου', () => {
  const mk = (id: string, x: Partial<Note> = {}): Note => ({ id, text: id, at: '2026-10-20', pids: [1], ...x });
  const all: Note[] = [mk('a'), mk('b', { rem: '2026-10-22' }), mk('c', { rem: D }), mk('d', { rem: '2026-10-27' }), mk('f', { star: true }),
    mk('g', { rem: D, done: '2026-10-21' }), mk('h', { done: '2026-10-23' }), mk('x', { pids: [2], rem: D }), mk('y', { pids: undefined, cids: ['s1'] }), mk('z', { pids: [2, 1], cids: ['s1'] })];
  it('ομαδοποίηση ανά άτομο: ίδιες ομάδες με τη σελίδα, ολοκληρωμένες χωριστά (πιο πρόσφατες πρώτα)', () => {
    const g = personGroups(all, { pid: 1 }, D);
    expect(g.due.map(n => n.id)).toEqual(['b', 'c']); expect(g.soon.map(n => n.id)).toEqual(['d']); expect(g.rest.map(n => n.id)).toEqual(['f', 'z', 'a']);
    expect(g.done.map(n => n.id)).toEqual(['h', 'g']);
  });
  it('μετρητές: ανοιχτές (χωρίς ολοκληρωμένες) και όσες ζητούν προσοχή σήμερα· κοινή σημείωση μετρά σε όλους', () => {
    expect(personGroups(all, { pid: 1 }, D)).toMatchObject({ open: 6, dueN: 2 });
    expect(personGroups(all, { pid: 2 }, D)).toMatchObject({ open: 2, dueN: 1 });
    expect(personGroups(all, { cid: 's1' }, D)).toMatchObject({ open: 2, dueN: 0 });
    expect(personGroups(all, { pid: 3 }, D)).toMatchObject({ open: 0, dueN: 0, done: [] });
    expect(personGroups(undefined, { pid: 1 }, D).open).toBe(0);
  });
  it('γραμμή «Υπενθύμιση» στο «Σήμερα:»: κενή, μία (με την αρχή του κειμένου), ή πόσες είναι', () => {
    expect(remLine(all, { pid: 3 }, D)).toBe(''); expect(remLine(all, { cid: 's1' }, D)).toBe(''); expect(remLine(undefined, { pid: 1 }, D)).toBe('');
    expect(remLine(all, { pid: 2 }, D)).toBe('Υπενθύμιση: «x»');
    expect(remLine([mk('p', { text: 'Να πάρει το δελτίο', rem: '2026-10-22' })], { pid: 1 }, D)).toBe('Υπενθύμιση: «Να πάρει το δελτίο» (εκπρόθεσμη)');
    expect(remLine(all, { pid: 1 }, D)).toBe('2 υπενθυμίσεις');
    expect(remLine([mk('q', { rem: '2026-10-25' })], { pid: 1 }, D)).toBe('');   // μελλοντική: καμία γραμμή
  });
  it('μεγάλο κείμενο στη γραμμή κόβεται', () => {
    expect(remLine([mk('p', { text: 'α'.repeat(120), rem: D })], { pid: 1 }, D).length).toBeLessThan(80);
  });
});

describe('σύνδεση στην εφαρμογή', () => {
  // Phase 0.4: these used to grep src/renderer/*.ts and src/main/*.ts. They now render the screens with the SSR harness and
  // press/type through test/support/probe.ts. The one rule about main.ts internals is a path-independent scan.
  const personOf = (i: number) => activePeople(bw.world.state)[i];
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = (view: string, params: Record<string, unknown>, element: () => ReturnType<typeof createElement>,
    nav: Record<string, unknown> = {}, world = bw.world): Session => {
    session?.stop();
    session = startSession(() => H.renderIn(world, view, params, element(), {}, nav));
    return session;
  };
  const screen = (comp: unknown, props: object = {}) => () => createElement(comp as never, props);
  /** The whole app, with the document listeners captured so keys can be pressed. */
  const openApp = (world = bw.world): Session => {
    session?.stop(); keys?.restore();
    const render = appRenderer(world);
    keys = captureDocumentListeners();
    session = startSession(render);
    session.render(); session.flushEffects();
    return session;
  };
  const refresh = (s: Session): string => { s.render(); s.flushEffects(); return s.render(); };
  const navOf = (s: Session) => s.contextValue<Record<string, (...a: unknown[]) => void>>(v => typeof v.openPerson === 'function');
  const h1 = (out: string) => textsIn(out, 'h1')[0];
  const h2 = (out: string) => textsIn(out, 'h2');
  const textareaValue = (s: Session) => String(s.elements().find(r => r.type === 'textarea' && r.props['aria-label'] === 'Κείμενο σημείωσης')?.props.value);
  const chips = (out: string) => [...flat(out).matchAll(/<span class="picker__chip[^"]*">([^<]*)</g)].map(m => m[1]);

  it('το @όνομα μπαίνει στο κείμενο και δένει το άτομο, χωρίς να ξεχνά τους προηγούμενους', async () => {
    const [a, b] = [personOf(0), personOf(1)];
    const run = vi.fn(async () => null);
    const s = start('home', {}, screen(NoteDialog, { start: {}, onClose: () => {} }), {}, withState(bw.world, bw.world.state, { run }));
    s.render();
    const mention = (who: typeof a, before: string) => {
      s.type(before + '@' + who.last, 'Κείμενο σημείωσης'); s.render();
      s.press(new RegExp('^' + esc(who.last + ' ' + who.first)), { prop: 'onMouseDown' });
      return s.render();
    };
    const first = mention(a, 'Συνάντηση με ');
    const label = (p: typeof a) => p.last + ' ' + p.first;
    expect(textareaValue(s)).toBe('Συνάντηση με @' + label(a) + ' ');   // the name is in the text ...
    expect(chips(first)).toEqual([label(a)]);                            // ... and the person is bound to the note
    const second = mention(b, textareaValue(s) + 'και ');
    expect(textareaValue(s)).toBe('Συνάντηση με @' + label(a) + ' και @' + label(b) + ' ');
    expect(chips(second)).toEqual([label(a), label(b)]);                 // the first one is not forgotten
    const typed = textareaValue(s);
    s.press('Αποθήκευση');
    await settle();
    expect(run).toHaveBeenCalledWith({ t: 'addNote', note: { text: typed, pids: [a.id, b.id] } }, false);
  });
  it('μενού: Σημειώσεις μετά τις ομάδες, με αριθμό υπενθυμίσεων· Ιστορικό από την πάνω μπάρα', () => {
    const s = openApp();
    const out = s.render();
    const side = flat(out).match(/<nav class="sidenav"[^>]*>(.*?)<\/nav>/)![1];
    const labels = [...side.matchAll(/<span class="navbtn__lbl">([^<]*)</g)].map(m => m[1]);
    expect(labels.indexOf('Σημειώσεις')).toBe(labels.indexOf('Οπλισμός') + 1);   // U4: Notes follow the last group (ΧΑΡΤΙΑ ΚΑΙ ΥΛΙΚΟ)
    // the badge on «Σημειώσεις» is the number of reminders that arrived
    const due = dueCount(bw.world.state.notes, H.TODAY);
    expect(due).toBeGreaterThan(0);
    expect(side).toMatch(new RegExp('Σημειώσεις</span><span class="ui-badge ui-badge--bad"[^>]*>' + due + '<'));
    s.press(/^Σημειώσεις/, { index: 0 });
    expect(h1(s.render())).toBe('Σημειώσεις');
    s.press('Περισσότερα'); s.render();   // U4: the history item lives in the «⋯» menu of the top bar
    s.press(/^Ιστορικό ενεργειών/);
    expect(h1(s.render())).toBe('Ιστορικό');
  });
  it('Ctrl+Shift+N (νέα σημείωση) προηγείται του Ctrl+N (δήλωση), και δένει στην ανοιχτή καρτέλα στρατιώτη ή στελέχους', () => {
    const cadre = { ...bw.world.state.cadreList[0], pid: -1 };
    const s = openApp(withState(bw.world, { ...bw.world.state, cadreList: [cadre, ...bw.world.state.cadreList.slice(1)] }));
    const press = (shift: boolean) => { keys!.dispatch('keydown', { key: 'N', ctrlKey: true, shiftKey: shift }); return refresh(s); };
    expect(h2(press(true))).toContain('Νέα σημείωση');                // Ctrl+Shift+N: a note ...
    expect(h2(s.render())).not.toContain('Δήλωση κατάστασης');
    s.press('Κλείσιμο'); s.render();
    expect(h2(press(false))).toContain('Δήλωση κατάστασης');          // ... Ctrl+N: a declaration
    s.press('Άκυρο'); s.render();
    // with a soldier's card open the note is bound to him, with a cadre card to the cadre member
    const nav = navOf(s);
    const p = personOf(0);
    nav.openPerson(p.id); refresh(s);
    expect(chips(press(true))).toEqual([p.last + ' ' + p.first]);
    s.press('Κλείσιμο', { index: 0 }); refresh(s);
    nav.openCadre(cadre.id); refresh(s);
    expect(chips(press(true)).join('|')).toContain(cadre.last + ' ' + cadre.first);
  });
  it('οι σημειώσεις δεν ξαναγράφουν Excel ή έντυπα, και έχουν δική τους ρύθμιση στη βάση (αναίρεση)', async () => {
    // db: «notes» is stored per note id, so undoing the first note leaves the second one (a whole-list entry could not)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ginotes-kv-'));
    const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    const st = new Store(dir, WASM); await st.open();
    const first = st.commit(add(st.state, { text: 'Πρώτη' }));
    st.commit(add(st.state, { text: 'Δεύτερη' }));
    st.revert(first);
    expect(st.state.notes.map(x => x.text)).toEqual(['Δεύτερη']);
    st.close();
    const reopened = new Store(dir, WASM); await reopened.open();
    expect(reopened.state.notes.map(x => x.text)).toEqual(['Δεύτερη']);   // and it was written to the database
    reopened.close();
    // main: scheduleAuto (the code that decides what to regenerate) is not exported and keeps module state, so this one
    // stays a source rule; it finds the function by name instead of by file path
    const holders = readSources(SRC_DIR, 20).filter(f => /function scheduleAuto\b/.test(f.text));
    expect(holders).toHaveLength(1);
    expect(holders[0].text).toMatch(/k !== 'lastExpire'\s*&&\s*k !== 'notes'/);
  });
  it('Ctrl+K: Νέα σημείωση, Σημειώσεις, και αναζήτηση μέσα στις σημειώσεις', () => {
    const palette = (query = '') => {
      const go = vi.fn();
      const s = start('home', {}, screen(CommandPalette, { onClose: () => {} }), { go });
      s.render();
      if (query) { s.seedState(v => v === '', query); }
      return { s, go, out: s.render() };
    };
    const titles = (out: string) => [...flat(out).matchAll(/<li[^>]*role="option"[^>]*><div><b>([^<]*)<\/b>/g)].map(m => m[1]);
    const all = titles(palette().out);
    for (const t of ['Νέα σημείωση (Ctrl+Shift+N)', 'Σημειώσεις', 'Σημειώσεις › Υπενθυμίσεις']) expect(all, t).toContain(t);
    // typing part of a note finds the note (group «Σημειώσεις») and opens the notes page with that search
    const found = palette('Υπενθύμιση για σήμερα');
    expect(flat(found.out)).toMatch(/<li class="picker__hd">Σημειώσεις<\/li>/);
    expect(titles(found.out).some(t => t.includes('Υπενθύμιση για σήμερα'))).toBe(true);
    found.s.press(/Υπενθύμιση για σήμερα/, { prop: 'onMouseDown', index: 0 });
    expect(found.go).toHaveBeenCalledWith('notes', expect.objectContaining({ nq: 'Υπενθύμιση για σήμερα' }));
  });
  it('Σήμερα: γραμμή στο «Πρέπει σήμερα»· Δυναμολόγιο και Στελέχη: ένδειξη και ενότητα στην καρτέλα', () => {
    const go = vi.fn();
    const today = start('home', {}, screen(TodayScreen), { go });
    expect(textOfHtml(today.render())).toMatch(/σημείωση με υπενθύμιση|σημειώσεις με υπενθύμιση/i);
    const n = today.handlers('onClick', 'Δες τις').length;
    for (let i = 0; i < n; i++) today.press('Δες τις', { index: i });
    expect(go).toHaveBeenCalledWith('notes', { nfilter: 'rem' });
    // Δυναμολόγιο: the dot next to a name that has notes (the snapshot state has notes for soldiers 2 and 3)
    expect(flat(H.renderIn(bw.world, 'people', {}, createElement(PeopleScreen as never)))).toContain('class="notedot');
    // the note section of a card has the composer of a card: compact (short placeholder), own ids
    for (const who of [{ pid: personOf(0).id }, { cid: bw.world.state.cadreList[0].id }]) {
      const tab = flat(H.renderIn(bw.world, 'home', {}, createElement(NotesTab as never, { who })));
      expect(tab).toContain('id="np-text"');
      expect(tab).toContain('Γράψε τη σημείωση εδώ… (Ctrl+Enter)');
      expect(tab).not.toContain('Ctrl+Enter για αποθήκευση');
    }
  });
  it('κάρτες ατόμου: 4η καρτέλα Σημειώσεις στον στρατιώτη, 3 καρτέλες στο στέλεχος, πλαϊνό φύλλο πάνω από κάθε οθόνη, χωρίς αυτόματο focus', () => {
    const tabsOf = (out: string) => [...flat(out).matchAll(/role="tab" aria-selected="[a-z]+">(.*?)<\/button>/g)].map(m => m[1].replace(/<[^>]*>/g, '').replace(/ \(.*$/, ''));
    const soldier = H.renderIn(bw.world, 'people', {}, createElement(PersonSheet as never, { pid: personOf(0).id, onClose: () => {}, onMove: () => {} }));
    expect(tabsOf(soldier)).toEqual(['Στοιχεία', 'Υπηρεσίες', 'Ιστορικό', 'Σημειώσεις', 'Προσωπικά']);   // the 4th is the notes
    const cadreHtml = renderCaseOf(bw, 'cadre-CadreSheet');
    expect(tabsOf(cadreHtml)).toEqual(['Καταστάσεις', 'Στοιχεία', 'Σημειώσεις', 'Προσωπικά']);
    // a side sheet (not the large dialog), over any screen: the app opens it on top of whatever is shown
    expect(cadreHtml).toContain('class="ui-sheet');
    expect(cadreHtml).not.toContain('ui-sheet--lg');
    const cadre = { ...bw.world.state.cadreList[0], pid: -1 };
    const s = openApp(withState(bw.world, { ...bw.world.state, cadreList: [cadre] }));
    s.press('Δυναμολόγιο', { index: 0 }); refresh(s);
    navOf(s).openPerson(-1); refresh(s);   // a cadre member standing in a seat (negative id) opens the cadre card ...
    expect(h2(s.render()).join(' ')).toContain(cadre.last);
    expect(h1(s.render())).toBe('Δυναμολόγιο');   // ... on top of the current screen
    s.press('Στοιχεία'); s.render();
    expect(buttonsOf(s.render()).map(b => b.label)).toContain('Διαγραφή στελέχους…');
    // the notes composer of the card does not grab the focus
    s.press(/^Σημειώσεις \(\d+\)/); const noteTab = flat(s.render());
    expect(noteTab).toContain('id="np-text"'); expect(noteTab).not.toMatch(/id="np-text"[^>]*data-autofocus/);
    navOf(s).openPerson(-99); refresh(s);   // unknown negative id: the cadre page, not an empty card
    expect(h1(s.render())).toBe('Στελέχη');
    // ΗΚΑΙ › «Από πού βγαίνει κάθε αριθμός»: a cadre name opens its card in the order of the column, not the Στελέχη page
    const go = vi.fn(), openCadre = vi.fn();
    const hk = start('hkai', { hkTab: 'hkai' }, screen(HkaiScreen), { go, openCadre });
    hk.render();
    const names = hk.elements().filter(r => r.type === 'button' && String(r.props['data-tip'] ?? '').startsWith('Στέλεχος·'));
    expect(names.length).toBeGreaterThan(0);
    (names[0].props.onClick as () => void)();
    expect(openCadre).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([expect.any(String)]));
    expect(go).not.toHaveBeenCalledWith('cadre');
  });
  it('μη αποθηκευμένο πρόχειρο: ρωτά πριν από άλλο άτομο, κλείσιμο, άλλη καρτέλα ή οθόνη', () => {
    const [a, b] = [personOf(0), personOf(1)];
    const open = () => {
      const s = openApp();
      const nav = navOf(s);
      nav.openPerson(a.id); refresh(s);
      s.press(/^Σημειώσεις \(\d+\)/); refresh(s);
      s.type('Πρόχειρο', 'Κείμενο σημείωσης'); refresh(s);   // the draft registers itself as unsaved in an effect
      return { s, nav };
    };
    const asks = (s: Session) => h2(s.render()).includes('Να φύγεις χωρίς αποθήκευση;');
    // 1. another person
    let { s, nav } = open();
    nav.openPerson(b.id); expect(asks(s)).toBe(true);
    s.press('Πίσω στη σημείωση'); expect(asks(s)).toBe(false);
    // 2. closing the card
    s.press('Κλείσιμο', { index: 0 }); expect(asks(s)).toBe(true);
    s.press('Πίσω στη σημείωση');
    // 3. another tab of the card
    s.press('Στοιχεία'); expect(asks(s)).toBe(true);
    s.press('Πίσω στη σημείωση');
    // 4. another screen
    s.press('Δυναμολόγιο', { index: 0 }); expect(asks(s)).toBe(true);
    expect(h1(s.render())).toBe('Σήμερα');
    // ... and leaving anyway goes on
    s.press('Συνέχισε χωρίς αποθήκευση'); s.render();
    expect(h1(s.render())).toBe('Δυναμολόγιο');
    // nothing typed: no question
    ({ s, nav } = (() => { const x = openApp(); return { s: x, nav: navOf(x) }; })());
    nav.openPerson(a.id); refresh(s); nav.openPerson(b.id); expect(asks(s)).toBe(false);
  });
});
