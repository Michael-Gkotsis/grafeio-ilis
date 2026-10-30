// Βάση: αποθήκευση, αναίρεση, αντίγραφο, και εντοπισμός χαλασμένου αρχείου (PRAGMA quick_check)
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Store, CorruptDbError } from '../src/main/db';
import { apply } from '../src/shared/commands';
import { fakePeople } from './fixtures';
import { writeDurable, writeJson } from '../src/main/files';
import initSqlJs from 'sql.js';

const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const ctx = { today: '2026-10-12', newId: () => Math.random().toString(36).slice(2) };

describe('βάση δεδομένων', () => {
  it('κρατά τα δεδομένα μετά το κλείσιμο και αναιρεί', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gidb-'));
    let st = new Store(dir, WASM); await st.open();
    const rows = fakePeople(5).map(({ id, active, ...p }) => p);
    st.commit(apply(st.state, { t: 'importPeople', rows, source: 't', deactivateMissing: false }, ctx).state);
    const patch = st.commit(apply(st.state, { t: 'assign', date: '2026-10-13', k: 'mg1', pid: 2 }, ctx).state);
    st.close();
    st = new Store(dir, WASM); await st.open();
    expect(st.state.people).toHaveLength(5); expect(st.state.guards['2026-10-13'].mg1).toBe(2);
    st.revert(patch); expect(st.state.guards['2026-10-13']).toBeUndefined();
    st.close();
  });
  it('αναβάθμιση (rev 6 και 7): η δική σου υπηρεσία παίρνει δική της δυνατότητα με ό,τι ίσχυε μέσω του είδους της', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gidb-'));
    let st = new Store(dir, WASM); await st.open();
    expect(st.state.settings.rev).toBe(8);
    const rows = fakePeople(5).map(({ id, active, ...p }) => p);
    let s = apply(st.state, { t: 'importPeople', rows, source: 't', deactivateMissing: false }, ctx).state;
    s = apply(s, { t: 'addBlock', phase: 'sven', name: 'Πύλη', kind: 'mg', armed: false, n: 1, hrs: '' }, ctx).state;
    const gate = 'b:' + s.settings.blocks.find(b => b.custom)!.id;
    // όπως πριν την αναβάθμιση: «δεν κάνει μαγειρεία» ίσχυε και για την Πύλη
    st.commit({ ...s, caps: { 2: { mg: 'ΠΟΝΟΣ' } }, settings: { ...s.settings, rev: 5 } }); st.close();
    st = new Store(dir, WASM); await st.open();
    expect(st.state.settings.rev).toBe(8);
    expect(st.state.caps[2]).toEqual({ mg: 'ΠΟΝΟΣ', [gate]: 'ΠΟΝΟΣ' });
    expect(st.state.settings.blocks.find(b => b.custom)!.kind).toBe('other');   // rev 7: μετρά ως δική της, μετά το rev 6
    st.close();
    st = new Store(dir, WASM); await st.open();   // γράφτηκε στη βάση, μία φορά
    expect(st.state.caps[2]).toEqual({ mg: 'ΠΟΝΟΣ', [gate]: 'ΠΟΝΟΣ' });
    st.close();
  });
  it('αναβάθμιση (rev 8): τα φύλλα καταστάσεων γράφουν μόνο όσα ισχύουν (τα ληγμένα σβήνονται από το Excel)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gidb-'));
    let st = new Store(dir, WASM); await st.open();
    const med = { file: 'x.xlsx', sheet: 'Μ', header: 0, cols: { last: 0, from: 1 }, write: true, scope: 'all' as const };
    const ppl = { file: 'x.xlsx', sheet: 'Δ', header: 0, cols: { last: 0 }, scope: 'all' as const };
    st.commit({ ...st.state, settings: { ...st.state.settings, rev: 7, sources: { medical: med, leave: { ...med, scope: undefined }, people: ppl } } }); st.close();
    st = new Store(dir, WASM); await st.open();
    expect(st.state.settings.rev).toBe(8);
    expect(st.state.settings.sources!.medical!.scope).toBe('active'); expect(st.state.settings.sources!.leave!.scope).toBe('active');
    expect(st.state.settings.sources!.people).toEqual(ppl);
    st.close();
  });
  it('χαλασμένο αρχείο: δεν ανοίγει σιωπηλά, και το αντίγραφο περνά τον έλεγχο', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gidb-'));
    const st = new Store(dir, WASM); await st.open();
    st.commit(apply(st.state, { t: 'importPeople', rows: fakePeople(50).map(({ id, active, ...p }) => p), source: 't', deactivateMissing: false }, ctx).state);
    const bk = st.backup('δοκιμή'); st.close();
    const file = path.join(dir, 'ilh.db'); const buf = fs.readFileSync(file);
    for (let i = 4096; i < buf.length; i += 7) buf[i] = 0xff; // σκουπίδια μετά την πρώτη σελίδα
    fs.writeFileSync(file, buf);
    const bad = new Store(dir, WASM);
    await expect(bad.open()).rejects.toBeInstanceOf(CorruptDbError);
    expect(bad.validate(bk)).toBeNull();
    expect(bad.validate(file)).toBeTruthy();
  });
  it('άδειο αρχείο (0 bytes) ή βάση χωρίς τους πίνακές μας: χαλασμένη, όχι νέα κενή βάση', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gidb-'));
    const file = path.join(dir, 'ilh.db');
    fs.writeFileSync(file, Buffer.alloc(0));
    const err = await new Store(dir, WASM).open().catch(e => e);
    expect(err).toBeInstanceOf(CorruptDbError); expect(err.empty).toBe(true);
    expect(fs.statSync(file).size).toBe(0);                    // δεν γράφτηκε τίποτα από πάνω
    expect(fs.existsSync(path.join(dir, 'backups'))).toBe(false);   // ούτε «αντίγραφο» του άδειου
    const SQL = await initSqlJs({ locateFile: () => WASM }); const other = new SQL.Database(); other.run('CREATE TABLE x (a)');
    fs.writeFileSync(file, Buffer.from(other.export()));
    const err2 = await new Store(dir, WASM).open().catch(e => e);
    expect(err2).toBeInstanceOf(CorruptDbError); expect(err2.empty).toBe(true);
    // ένα άδειο αντίγραφο δεν περνά τον έλεγχο της επαναφοράς
    const st = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'gidb-')), WASM); await st.open();
    const empty = path.join(dir, 'empty.db'); fs.writeFileSync(empty, Buffer.alloc(0));
    expect(st.validate(empty)).toBeTruthy();
    st.close();
  });
  it('η αναίρεση κρατά στοιχεία μόνο για τις 50 τελευταίες ενέργειες· οι παλιές σβήνονται και η βάση μικραίνει', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gidb-'));
    let st = new Store(dir, WASM); await st.open();
    st.commit(apply(st.state, { t: 'importPeople', rows: fakePeople(5).map(({ id, active, ...p }) => p), source: 't', deactivateMissing: false }, ctx).state);
    const big = 'Χ'.repeat(4000);
    const save = (i: number) => {
      const r = apply(st.state, { t: 'setHkaiManual', date: '2026-10-' + String(1 + (i % 28)).padStart(2, '0'), manual: { cells: {}, text: { loi: big + i } } }, ctx);
      st.addAudit({ at: '10:00', day: '2026-10-12', text: r.text, files: [], source: 'app', undoable: true }, st.commit(r.state), false);
    };
    for (let i = 0; i < 120; i++) save(i);
    st.flush();
    const count = (s: Store) => (s as any).db.exec('SELECT count(*) FROM audit WHERE patch IS NOT NULL')[0].values[0][0];
    expect(count(st)).toBe(50);
    // η αναίρεση δουλεύει όπως πριν: η τελευταία ενέργεια
    const last = st.lastUndoable()!; expect(last.text).toContain('ΗΚΑΙ');
    st.revert(last.patch); st.markUndone(last.id);
    expect(st.state.hkaiManual['2026-10-08'].text.loi).toBe(big + 91);
    st.close();
    // βάση από παλιότερη έκδοση: όλες οι γραμμές με στοιχεία αναίρεσης. Στο άνοιγμα καθαρίζονται μία φορά και μικραίνει.
    const SQL = await initSqlJs({ locateFile: () => WASM }); const db = new SQL.Database(fs.readFileSync(path.join(dir, 'ilh.db')));
    const patch = JSON.stringify({ person: { put: [], del: [] }, status: { put: [], del: [] }, guard: { put: [], del: [] }, cap: { put: [], del: [] }, kv: { put: [['hkaiManual', { x: big.repeat(5) }]], del: [] } });
    for (let i = 0; i < 200; i++) db.run("INSERT INTO audit (at, day, text, files, source, patch, undoable) VALUES ('09:00', '2026-10-01', 'παλιά', '[]', 'app', ?, 1)", [patch]);
    fs.writeFileSync(path.join(dir, 'ilh.db'), Buffer.from(db.export()));
    const before = fs.statSync(path.join(dir, 'ilh.db')).size;
    st = new Store(dir, WASM); await st.open();
    expect(count(st)).toBe(50);
    expect(fs.statSync(path.join(dir, 'ilh.db')).size).toBeLessThan(before / 3);
    expect(st.state.people).toHaveLength(5);
    st.close();
  });
  it('ασφαλής εγγραφή: γράφει όλο το αρχείο και δεν αφήνει .tmp', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gidb-'));
    const f = path.join(dir, 'a.bin'); const buf = Buffer.alloc(3 * 1024 * 1024, 7);
    writeDurable(f, buf); expect(fs.readFileSync(f).equals(buf)).toBe(true);
    writeJson(path.join(dir, 'b.json'), { a: 'Α' }); expect(JSON.parse(fs.readFileSync(path.join(dir, 'b.json'), 'utf8'))).toEqual({ a: 'Α' });
    expect(fs.readdirSync(dir).filter(x => x.endsWith('.tmp'))).toEqual([]);
  });
});
