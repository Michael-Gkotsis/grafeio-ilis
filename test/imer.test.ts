// Ημερολόγιο κωλυομένων-απόντων (Michael, 3/11): κωδικός ανά κελί, χέρι πάνω από το αυτόματο, μέρες εκπαίδευσης, σύνολα Π/Α, Excel. Μόνο ψεύτικα στοιχεία.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState, Status } from '../src/shared/domain';
import { postsOf } from '../src/shared/rules';
import { autoCell, cellOf, imerDays, imerGrid, imerRange, imerTotals, handCount } from '../src/shared/imer';
import { Store } from '../src/main/db';
import { signMade } from '../src/main/exports';
import { imerBook } from '../src/main/excel';
import { readBook } from '../src/main/sources';
import { fakeState } from './fixtures';

const D = '2026-11-03';   // Τρίτη
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'i' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const st = (pid: number, type: string, extra: Partial<Status> = {}) => ({ id: 's' + ++seq, pid, type, from: D, to: D, note: '', ...extra }) as unknown as Status;
const base = () => fakeState(8);
const cell = (s: AppState, pid: number, d = D) => cellOf(s, s.people.find(p => p.id === pid)!, d);

describe('κωδικός κελιού', () => {
  it('πρώτος κερδίζει: άδεια πριν από υπηρεσία, υπηρεσία πριν από πόστο', () => {
    const s = base(); const th = postsOf(s.settings).find(p => p.kind === 'th')!, ly = postsOf(s.settings).find(p => p.kind === 'ly')!;
    s.guards = { [D]: { [th.k]: 1, [ly.k]: 2 } }; s.dutyLog = { [D]: [{ pid: 7, kind: 'sk' }] };
    s.statuses = [st(1, 'LEAVE'), st(3, 'EY')];
    s.people[1].post = 'ΓΡΑΦΕΑΣ'; s.people[3].post = 'ΕΣΤΙΑΤΟΡΑΣ'; s.people[4].post = 'ΓΡΑΦΕΑΣ'; 
    expect(cell(s, 1)).toMatchObject({ code: 'Κ.Α', count: 'A' });           // άδεια και Θ: άδεια
    expect(cell(s, 2)).toMatchObject({ code: 'ΛΥ', key: 'DUTY', count: 'P' });  // υπηρεσία και ΓΡ: υπηρεσία
    expect(cell(s, 7)).toMatchObject({ code: 'ΣΚ', key: 'DUTY' });              // υπηρεσία χωρίς θέση (από Excel)
    expect(cell(s, 3)).toMatchObject({ code: 'Ε.Υ', count: 'P' });
    expect(cell(s, 4)).toMatchObject({ code: 'ΕΣΤ', key: 'POST' });
    expect(cell(s, 6)).toMatchObject({ code: '', count: 'P' });               // κενό = στην εκπαίδευση
  });
  it('«-» πριν την κατάταξη και μετά τη διαγραφή', () => {
    const s = base(); s.people[0].inOn = '2026-11-04'; s.people[1].active = false; s.people[1].outOn = '2026-11-02';
    expect(cell(s, 1)).toMatchObject({ code: '-', count: 'A' }); expect(cell(s, 1, '2026-11-04').code).toBe('');
    expect(cell(s, 2)).toMatchObject({ code: '-', count: 'A' }); expect(cell(s, 2, '2026-11-01').code).toBe('');
  });
  it('δικός σου κωδικός και «Μετρά ως» από τις ρυθμίσεις', () => {
    let s = base(); s.statuses = [st(1, 'LEAVE'), st(2, 'EY')];
    s = run(s, { t: 'setSettings', settings: { imer: { codes: { 'Κ.Α': { code: 'ΑΔ', count: 'P' }, 'Ε.Υ': { count: 'A' } } } }, text: 'x' });
    expect(cell(s, 1)).toMatchObject({ code: 'ΑΔ', count: 'P' }); expect(cell(s, 2)).toMatchObject({ code: 'Ε.Υ', count: 'A' });
  });
});

describe('με το χέρι', () => {
  it('κερδίζει το αυτόματο, μένει όταν αλλάζουν τα δεδομένα, και «πίσω» το επαναφέρει· δεν αγγίζει υπηρεσίες', () => {
    let s = base(); s.statuses = [st(1, 'LEAVE')];
    s = run(s, { t: 'setImer', date: D, cells: [{ pid: 1, text: 'α/α' }] });
    expect(cell(s, 1)).toMatchObject({ code: 'Α/Α', count: 'A', hand: true, auto: 'Κ.Α' });
    const before = s.guards, stats = s.statuses;
    s = run(s, { t: 'declare', cmd: { type: 'EY', pids: [2], from: D, to: D } as never });
    expect(cell(s, 1).code).toBe('Α/Α');
    s = run(s, { t: 'setImer', date: D, cells: [{ pid: 1, text: 'Ε/Ε' }] });
    expect(cell(s, 1)).toMatchObject({ code: 'Ε/Ε', count: 'P' });   // εργασίες επιλαρχίας: Π
    s = run(s, { t: 'setImer', date: D, cells: [{ pid: 1, text: '' }] });
    expect(cell(s, 1)).toMatchObject({ code: 'Κ.Α' }); expect(cell(s, 1).hand).toBeUndefined(); expect(s.imer).toEqual({});
    expect(s.guards).toBe(before); expect(s.statuses.filter(x => x.pid === 1)).toEqual(stats);
  });
  it('ελεύθερο κείμενο μετράει Π και ο ίδιος κωδικός δεν αλλάζει τίποτα', () => {
    let s = base();
    s = run(s, { t: 'setImer', date: D, cells: [{ pid: 1, text: 'άσκηση' }] });
    expect(cell(s, 1)).toMatchObject({ code: 'ΑΣΚΗΣΗ', count: 'P' });
    const r = apply(s, { t: 'setImer', date: D, cells: [{ pid: 1, text: 'ΑΣΚΗΣΗ' }] }, ctx);
    expect(r.state).toBe(s); expect(r.text).toBe('');
    expect(handCount(s.settings, 'Κ.Α').count).toBe('A');
  });
});

describe('μέρες και σύνολα', () => {
  it('μέρες εκπαίδευσης: όχι Κυριακή, όχι αργίες· «όλες» τις δίνει όλες', () => {
    const s = base();
    expect(imerDays(s, '2026-10-26', '2026-11-01')).toEqual(['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30', '2026-10-31']);   // Τετ 28/10 αργία, Κυρ 1/11
    expect(imerDays(s, '2026-10-26', '2026-11-01', true)).toHaveLength(7);
    expect(imerRange(D)).toEqual({ from: '2026-10-26', to: '2026-11-08' });
  });
  it('σύνολα Π/Α με το «Μετρά ως»· κενό = Π· οι μελλοντικές μέρες χωρίς σύνολα', () => {
    const s = base(); s.statuses = [st(1, 'LEAVE'), st(2, 'SICK'), st(3, 'EY'), st(4, 'LEAVE', { from: '2026-11-04', to: '2026-11-04' })];
    const g = imerGrid(s, '2026-11-02', '2026-11-04', false, D);
    expect(g.days).toEqual(['2026-11-02', D, '2026-11-04']);
    const all = g.groups.flatMap(x => x.cells);
    const t = imerTotals(all.map(r => r[1]), D, D);
    expect(t).toEqual({ p: 6, a: 2, show: true });
    expect(g.groups.flatMap(x => x.tot).map(x => x.show)).toEqual([true, true, false, true, true, false]);
    expect(imerTotals(all.map(r => r[2]), '2026-11-04', D)).toMatchObject({ a: 1, show: false });
  });
  it('ουλαμοί με σειρά και αλφαβητικά μέσα σε κάθε ουλαμό', () => {
    const g = imerGrid(base(), D, D, false, D);
    expect(g.groups.map(x => x.g.unit)).toEqual(['1ος Ουλ.', '2ος Ουλ.']);
    expect(g.groups[0].g.rooms).toBe('1ος-4ος ΘΑΛ');
    for (const x of g.groups) expect(x.g.rows.map(p => p.last)).toEqual([...x.g.rows.map(p => p.last)].sort((a, b) => a.localeCompare(b, 'el')));
  });
});

describe('Excel', () => {
  afterEach(() => { vi.useRealTimers(); });
  const read = async (s: AppState, o = { from: '2026-11-02', to: '2026-11-05' }) => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-imer-')), 'x.xlsx');
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-03T10:00:00') });
    const m = await imerBook(s, o); fs.writeFileSync(f, m.data); return { m, book: await readBook(f) };
  };
  it('ένα φύλλο ανά ουλαμό, με τίτλο, ΕΣΣΟ, μήνα, κελιά με το χέρι και σύνολα', async () => {
    let s = base(); s.statuses = [st(1, 'LEAVE')]; s = run(s, { t: 'setImer', date: D, cells: [{ pid: 2, text: 'Α/Α' }] });
    s.settings.essos = { s: 'Γ', y: 2026 } as never;
    const { m, book } = await read(s);
    expect(book.sheets.map(x => x.name)).toEqual(['1ος ΟΥΛΑΜΟΣ', '2ος ΟΥΛΑΜΟΣ']);
    expect(m.name).toMatch(/^ΗΜΕΡΟΛΟΓΙΟ ΚΩΛΥΟΜΕΝΩΝ-ΑΠΟΝΤΩΝ /);
    const rows = book.sheets[0].rows.map(r => r.map(c => String(c ?? '')));
    expect(rows.some(r => r.join(' ').includes('ΗΜΕΡΟΛΟΓΙΟ ΚΩΛΥΟΜΕΝΩΝ-ΑΠΟΝΤΩΝ Γ΄ ΕΣΣΟ 2026'))).toBe(true);
    expect(rows.some(r => r.includes('ΝΟΕΜΒΡΙΟΣ'))).toBe(true);
    const head = rows.find(r => r[0] === 'Α/Α')!; expect(head.slice(0, 8)).toEqual(['Α/Α', 'ΒΑΘΜΟΣ', 'Ο-Σ', 'ΕΠΙΘΕΤΟ', 'ΟΝΟΜΑ', '2', '3', '4']);
    const col = head.indexOf('3');
    expect(rows.filter(r => r[col] === 'Κ.Α' || r[col] === 'Α/Α').length).toBe(2);
    const p = rows.find(r => r[2] === 'Π' && r[0] === 'ΣΥΝΟΛΟ')!, a = rows[rows.indexOf(p) + 1];
    expect(p[col]).toBe('2'); expect(a[col]).toBe('2');   // 1ος ουλαμός: 4 άτομα (θάλαμοι 1-4), η άδεια και ο Α/Α με το χέρι
    expect(p[head.indexOf('4')] ?? '').toBe('');                 // αύριο: χωρίς σύνολα
  });
  it('ένα φύλλο για όλη την ίλη, και τίτλος εκπαίδευσης', async () => {
    let s = base(); s = run(s, { t: 'setSettings', settings: { imer: { title: 'ekp', sheets: 'all' } }, text: 'x' });
    const { m, book } = await read(s);
    expect(book.sheets.map(x => x.name)).toEqual(['ΣΥΝΟΛΙΚΟ ΙΛΗΣ']); expect(m.name).toMatch(/^ΔΥΝΑΜΟΛΟΓΙΟ ΕΚΠΑΙΔΕΥΣΗΣ /);
    expect(book.sheets[0].rows.filter(r => /^\d+$/.test(String(r[0] ?? ''))).length).toBe(8);
  });
});

describe('υπογραφές', () => {
  it('ΟΥΛΑΜΑΓΟΣ και ΔΚΤΗΣ ΙΛΗΣ κάτω από κάθε φύλλο', async () => {
    const s = base(); const m = await imerBook(s, { from: '2026-11-02', to: '2026-11-04' });
    const r = await signMade(m.data, s, 'imer', m.marks);
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-imer-')), 'x.xlsx'); fs.writeFileSync(f, r.data);
    for (const sh of (await readBook(f)).sheets) { const all = sh.rows.flat().map(String); expect(all).toContain('ΟΥΛΑΜΑΓΟΣ'); expect(all).toContain('ΔΚΤΗΣ ΙΛΗΣ'); }
  });
});

describe('αυτόματο κελί χωρίς κατάσταση', () => {
  it('autoCell επιστρέφει null όταν δεν υπάρχει τίποτα', () => { const s = base(); expect(autoCell(s, s.people[5], D)).toBeNull(); });
});

describe('αποθήκευση και αναίρεση', () => {
  it('τα κελιά με το χέρι κρατιούνται μετά το κλείσιμο και αναιρούνται ένα ένα', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gidb-')); const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    let db = new Store(dir, WASM); await db.open();
    db.commit(base());
    const p1 = db.commit(apply(db.state, { t: 'setImer', date: D, cells: [{ pid: 1, text: 'Α/Α' }] }, ctx).state);
    const p2 = db.commit(apply(db.state, { t: 'setImer', date: '2026-11-04', cells: [{ pid: 2, text: 'Ε/Ε' }] }, ctx).state);
    db.close();
    db = new Store(dir, WASM); await db.open();
    expect(db.state.imer).toEqual({ [D]: { 1: 'Α/Α' }, '2026-11-04': { 2: 'Ε/Ε' } });
    db.revert(p2); expect(db.state.imer).toEqual({ [D]: { 1: 'Α/Α' } });
    db.revert(p1); expect(db.state.imer).toEqual({});
    db.close();
  });
});
