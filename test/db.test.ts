// Βάση: αποθήκευση, αναίρεση, αντίγραφο, και εντοπισμός χαλασμένου αρχείου (PRAGMA quick_check)
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Store, CorruptDbError } from '../src/main/db';
import { apply } from '../src/shared/commands';
import { fakePeople } from './fixtures';

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
});
