// Λειτουργία μονάδας (μέρος 2): κινήσεις δύναμης, Απόλυση ΕΣΣΟ, ΗΚΑΙ, Excel. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { hkaiDiaLines, hkaiEgrLines, linesText } from '../src/shared/hkaiText';
import { moveRows, pendingMoves, personDischarge } from '../src/shared/mode';
import { bestFor, planPeopleWrite, snapFromSheet, defaultBinding, type SourceBinding } from '../src/shared/sources';
import type { RawSheet } from '../src/shared/roster';
import { fakeState } from './fixtures';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Store } from '../src/main/db';

const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

const TODAY = '2026-11-13';
let n = 0;
const at = (today: string): Ctx => ({ today, newId: () => 'm' + ++n });
const run = (s: AppState, c: Command, today = TODAY) => apply(s, c, at(today)).state;
const unit = (s: AppState): AppState => run(s, { t: 'setSettings', settings: { mode: 'unit' }, text: 'μονάδα' });
const mk = () => { const s = unit(fakeState(4)); s.people[0].essos = '2025 Δ΄'; s.people[1].essos = '2025 Δ΄'; s.people[2].essos = '2025 Δ΄'; return s; };
const guards = (s: AppState, pid: number) => Object.entries(s.guards).flatMap(([d, g]) => Object.values(g).filter(x => x === pid).map(() => d));

describe('κινήσεις δύναμης', () => {
  it('σημερινή κίνηση εφαρμόζεται αμέσως, με σημείωση και ΗΚΑΙ', () => {
    const s = run(mk(), { t: 'addMove', pid: 1, dir: 'out', why: 'μετάθεση', where: 'ΣΣΕ', on: TODAY });
    expect(s.people[0]).toMatchObject({ active: false, outOn: TODAY, notes: 'Εκτός δύναμης: ΜΕΤΑΘΕΣΗ: ΣΣΕ' });
    expect(s.people[0].moves![0]).toMatchObject({ dir: 'out', why: 'ΜΕΤΑΘΕΣΗ', where: 'ΣΣΕ', done: true });
    expect(linesText(hkaiDiaLines(s, TODAY))).toMatch(/ΜΕΤΑΘΕΣΗ: ΣΣΕ\.$/);
  });
  it('μελλοντική κίνηση: μένει σε δύναμη ως τότε και εφαρμόζεται στην αλλαγή μέρας, βγάζοντας τον από τις υπηρεσίες από εκείνη τη μέρα', () => {
    let s = mk(); s.guards = { '2026-11-14': { a: 1 }, '2026-11-20': { a: 1 }, '2026-11-21': { a: 1, b: 2 } };
    const r = apply(s, { t: 'addMove', pid: 1, dir: 'out', why: 'Απόσπαση', on: '2026-11-20' }, at(TODAY));
    s = r.state; expect(s.people[0].active).toBe(true); expect(s.people[0].moves![0].done).toBeUndefined();
    expect(r.text).toMatch(/φεύγει στις 20\/11/);
    expect(run(s, { t: 'applyMoves' }, '2026-11-19').people[0].active).toBe(true);
    const d = apply(s, { t: 'applyMoves' }, at('2026-11-20'));
    expect(d.state.people[0]).toMatchObject({ active: false, outOn: '2026-11-20', notes: 'Εκτός δύναμης: ΑΠΟΣΠΑΣΗ' });
    expect(guards(d.state, 1)).toEqual(['2026-11-14']); expect(guards(d.state, 2)).toEqual(['2026-11-21']);
    expect(d.undoable).toBe(false); expect(d.text).toMatch(/εκτός δύναμης/);
    expect(linesText(hkaiDiaLines(d.state, '2026-11-20'))).toMatch(/ΑΠΟΣΠΑΣΗ\.$/);
    // δεύτερη φορά: τίποτα
    expect(run(d.state, { t: 'applyMoves' }, '2026-11-21')).toBe(d.state);
  });
  it('με «Επιστρέφει» ξαναμπαίνει μόνος του και γράφεται στις ΕΓΓΡΑΦΕΣ· ακύρωση σβήνει και την επιστροφή', () => {
    let s = run(mk(), { t: 'addMove', pid: 1, dir: 'out', why: 'Απόσπαση', on: TODAY, back: '2026-12-01' });
    expect(s.people[0].moves).toHaveLength(2);
    s = run(s, { t: 'applyMoves' }, '2026-12-01');
    expect(s.people[0]).toMatchObject({ active: true, inOn: '2026-12-01' }); expect(s.people[0].outOn).toBeUndefined();
    expect(linesText(hkaiEgrLines(s, '2026-12-01'))).toMatch(/ΕΣΣΟ 2025 Δ΄\.$/);
    const c = run(mk(), { t: 'addMove', pid: 2, dir: 'out', why: 'Μετάθεση', on: '2026-11-30', back: '2026-12-05' });
    const id = c.people[1].moves![0].id;
    const x = run(c, { t: 'cancelMove', pid: 2, id });
    expect(x.people[1].moves).toBeUndefined(); expect(pendingMoves(x.people)).toEqual([]);
  });
  it('ξανά σε δύναμη από την καρτέλα, και έλεγχοι', () => {
    const s = run(mk(), { t: 'addMove', pid: 1, dir: 'out', why: 'Άλλο', on: TODAY });
    expect(() => apply(s, { t: 'addMove', pid: 1, dir: 'out', why: 'Άλλο', on: TODAY }, at(TODAY))).toThrow(/ήδη εκτός/);
    expect(() => apply(mk(), { t: 'addMove', pid: 2, dir: 'in', on: TODAY }, at(TODAY))).toThrow(/ήδη σε δύναμη/);
    expect(() => apply(mk(), { t: 'addMove', pid: 2, dir: 'out', on: TODAY }, at(TODAY))).toThrow(/λόγο/);
    expect(() => apply(mk(), { t: 'addMove', pid: 2, dir: 'out', why: 'Α', on: '2026-12-01', back: '2026-11-30' }, at(TODAY))).toThrow(/επιστροφή/);
    const b = run(s, { t: 'addMove', pid: 1, dir: 'in', on: TODAY });
    expect(b.people[0]).toMatchObject({ active: true, inOn: TODAY, notes: 'ΑΛΛΟ' });
  });
  it('στο κέντρο δεν υπάρχουν κινήσεις και το applyMoves δεν κάνει τίποτα', () => {
    const s = fakeState(2);
    expect(() => apply(s, { t: 'addMove', pid: 1, dir: 'out', why: 'Α', on: TODAY }, at(TODAY))).toThrow(/μονάδας/);
    expect(run(s, { t: 'applyMoves' })).toBe(s);
  });
  it('η διόρθωση στοιχείων δεν χάνει τις κινήσεις και κρατά θητεία 9', () => {
    const s = run(mk(), { t: 'addMove', pid: 1, dir: 'out', why: 'Α', on: '2026-12-01' });
    const p = { ...s.people[0], moves: undefined, serve: 9 as const, notes: 'x' };
    const u = run(s, { t: 'updatePerson', person: p });
    expect(u.people[0].moves).toHaveLength(1); expect(u.people[0].serve).toBe(9);
    expect(personDischarge(u.people[0])).toEqual({ y: 2026, m: 8 });
    expect(run(u, { t: 'updatePerson', person: { ...u.people[0], serve: 12 } }).people[0].serve).toBeUndefined();
  });
});

describe('αναίρεση', () => {
  it('η κίνηση και η Απόλυση ΕΣΣΟ αναιρούνται με μία αναίρεση', async () => {
    const st = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'gimv-')), WASM); await st.open();
    st.commit(mk());
    const go = (c: Command) => { const r = apply(st.state, c, at(TODAY)); st.addAudit({ at: '10:00', day: TODAY, text: r.text, files: r.files, source: 'app', undoable: true }, st.commit(r.state), false); };
    go({ t: 'addMove', pid: 1, dir: 'out', why: 'Μετάθεση', on: TODAY });
    expect(st.state.people[0].active).toBe(false);
    let last = st.lastUndoable()!; st.revert(last.patch); st.markUndone(last.id);
    expect(st.state.people[0]).toMatchObject({ active: true }); expect(st.state.people[0].moves).toBeUndefined();
    go({ t: 'dischargeEsso', esso: '2025 Δ΄', on: TODAY, pids: [1, 2, 3] });
    expect(st.state.people.filter(p => !p.active)).toHaveLength(3);
    last = st.lastUndoable()!; st.revert(last.patch); st.markUndone(last.id);
    expect(st.state.people.every(p => p.active && !p.moves)).toBe(true);
    st.close();
  });
});

describe('Απόλυση ΕΣΣΟ', () => {
  it('με εξαιρέσεις, μία εντολή (μία αναίρεση), λόγος ΑΠΟΛΥΣΗ· μελλοντική ημερομηνία = προγραμματισμένη', () => {
    const s0 = mk(); s0.guards = { '2026-11-25': { a: 1 } };
    const r = apply(s0, { t: 'dischargeEsso', esso: '2025 Δ΄', on: '2026-11-25', pids: [1, 2] }, at(TODAY));
    expect(r.state.people.map(p => p.active)).toEqual([true, true, true, true]);
    expect(pendingMoves(r.state.people)).toHaveLength(2);
    expect(moveRows(pendingMoves(r.state.people), p => p.last)).toMatchObject([{ text: 'ΕΣΣΟ 2025 Δ΄ απολύεται (2)', on: '2026-11-25' }]);
    const d = run(r.state, { t: 'applyMoves' }, '2026-11-25');
    expect(d.people.map(p => p.active)).toEqual([false, false, true, true]);   // ο 3ος ΕΣΣΟ 2025 Δ΄ είναι εξαίρεση
    expect(d.people[0].notes).toBe('Εκτός δύναμης: ΑΠΟΛΥΣΗ'); expect(guards(d, 1)).toEqual([]);
    expect(linesText(hkaiDiaLines(d, '2026-11-25'))).toMatch(/ΑΠΟΛΥΣΗ\./);
  });
  it('σημερινή απόλυση: αμέσως εκτός δύναμης', () => {
    const r = apply(mk(), { t: 'dischargeEsso', esso: '2025 Δ΄', on: TODAY, pids: [1, 2, 3] }, at(TODAY));
    expect(r.state.people.map(p => p.active)).toEqual([false, false, false, true]);
    expect(r.text).toMatch(/Απόλυση ΕΣΣΟ 2025 Δ΄: 3/);
    expect(() => apply(mk(), { t: 'dischargeEsso', esso: '2025 Δ΄', on: TODAY, pids: [] }, at(TODAY))).toThrow();
  });
});

describe('Excel Δυναμολόγιο: ΕΣΣΟ, ημερομηνία, Λόχος', () => {
  const H = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ'];
  const sheet = (extra: string[]): RawSheet => ({ name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΔΥΝΑΜΟΛΟΓΙΟ'], ['ΣΥΝΟΛΙΚΟ'], [...H, ...extra],
    ...fakeState(2).people.map((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, Number(p.asm), ...extra.map(() => null)])] as RawSheet['rows'] });
  const bind = (sh: RawSheet): SourceBinding => { const x = bestFor('people', [sh])!; return { file: 'Δ.xlsx', sheet: x.sheet, header: x.header, cols: x.cols, write: true }; };
  const edit = (s: AppState): AppState => run(s, { t: 'updatePerson', person: { ...s.people[0], essos: "2026 Β'", inOn: '2026-09-10', sub: '1ος λοχος' } });
  const sets = (sh: RawSheet, s: AppState) => planPeopleWrite(sh, bind(sh), s, snapFromSheet(sh, bind(sh), s.people)).sets;

  it('στη μονάδα γράφονται όπου υπάρχει η στήλη, με κεφαλαία και ημερομηνία', () => {
    const sh = sheet(['ΕΣΣΟ', 'ΗΜ. ΕΙΣΑΓΩΓΗΣ', 'ΛΟΧΟΣ']); const b = bind(sh);
    expect(Object.keys(b.cols)).toEqual(expect.arrayContaining(['essos', 'inOn', 'sub']));
    const s0 = unit(fakeState(2)); s0.people.forEach(p => { p.essos = ''; });
    const s = edit(s0); const got = sets(sh, s);
    expect(got).toEqual(expect.arrayContaining([{ r: 3, c: b.cols.essos, v: '2026 Β΄' }, { r: 3, c: b.cols.inOn, v: { date: '2026-09-10' } }, { r: 3, c: b.cols.sub, v: '1ΟΣ ΛΟΧΟΣ' }]));
    expect(got).toHaveLength(3);
  });
  it('στο κέντρο δεν γράφεται τίποτα, ούτε με στήλες', () => {
    const sh = sheet(['ΕΣΣΟ', 'ΗΜ. ΕΙΣΑΓΩΓΗΣ', 'ΛΟΧΟΣ']);
    const s0 = fakeState(2); s0.people.forEach(p => { p.essos = ''; });
    expect(sets(sh, run(s0, { t: 'updatePerson', person: { ...s0.people[0], essos: "2026 Β'", inOn: '2026-09-10', sub: 'Χ' } }))).toEqual([]);
  });
  it('αν το Excel δεν έχει τις στήλες δεν προστίθενται, ούτε στη μονάδα', () => {
    const sh = sheet([]); const s0 = unit(fakeState(2));
    expect(Object.keys(bind(sh).cols)).not.toContain('essos');
    expect(sets(sh, edit(s0))).toEqual([]);
  });
  it('νέο Δυναμολόγιο: οι στήλες μπαίνουν μόνο στη μονάδα', () => {
    expect(Object.keys(defaultBinding('people', 'Δ.xlsx', undefined, true).cols).slice(-3)).toEqual(['essos', 'inOn', 'sub']);
    expect(Object.keys(defaultBinding('people', 'Δ.xlsx').cols)).not.toContain('essos');
  });
});
