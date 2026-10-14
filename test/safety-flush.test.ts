// Ασφάλεια: εγγραφή της βάσης που αποτυγχάνει, μισό .tmp, και η κατάσταση ενός Excel όταν αποτύχει το «Νέο αρχείο».
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Store } from '../src/main/db';
import { writeDurable } from '../src/main/files';
import { SourceMetaStore } from '../src/main/sources';
import { apply } from '../src/shared/commands';
import { fakePeople } from './fixtures';

const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const ctx = { today: '2026-10-12', newId: () => Math.random().toString(36).slice(2) };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gi-safe-'));

describe('εγγραφή της βάσης που δεν γίνεται (S3)', () => {
  it('η αλλαγή και η γραμμή ιστορικού γυρίζουν πίσω και στη μνήμη· η επόμενη ενέργεια γράφεται κανονικά', async () => {
    const dir = tmp(); const st = new Store(dir, WASM); await st.open();
    st.transact(() => { st.commit(apply(st.state, { t: 'importPeople', rows: fakePeople(3).map(({ id, active, ...p }) => p), source: 't', deactivateMissing: false }, ctx).state); });
    const before = st.state; const audits = st.audit().length;
    const real = st.flush.bind(st); st.flush = () => { throw new Error('ο δίσκος είναι γεμάτος'); };
    const r = apply(st.state, { t: 'assign', date: '2026-10-13', k: 'mg1', pid: 2 }, ctx);
    expect(() => st.transact(() => { const p = st.commit(r.state); st.addAudit({ at: '10:00', day: '2026-10-12', text: r.text, files: [], source: 'app', undoable: true }, p, false); })).toThrow(/γεμάτος/);
    expect(st.state).toBe(before); expect(st.state.guards['2026-10-13']).toBeUndefined();
    expect(st.audit()).toHaveLength(audits); expect(st.lastUndoable()).toBeNull();
    st.flush = real;
    st.transact(() => { st.commit(r.state); });
    st.close();
    const again = new Store(dir, WASM); await again.open();
    expect(again.state.guards['2026-10-13'].mg1).toBe(2);
    again.close();
  });
  it('αναίρεση που δεν γράφεται: μένει όπως ήταν, και ξαναγίνεται μετά', async () => {
    const dir = tmp(); const st = new Store(dir, WASM); await st.open();
    st.commit(apply(st.state, { t: 'importPeople', rows: fakePeople(3).map(({ id, active, ...p }) => p), source: 't', deactivateMissing: false }, ctx).state);
    const p = st.commit(apply(st.state, { t: 'assign', date: '2026-10-13', k: 'mg1', pid: 2 }, ctx).state);
    st.addAudit({ at: '10:00', day: '2026-10-12', text: 'x', files: [], source: 'app', undoable: true }, p);
    const last = st.lastUndoable()!; const real = st.flush.bind(st); st.flush = () => { throw new Error('κλειδωμένο'); };
    expect(() => st.transact(() => { st.revert(last.patch); st.markUndone(last.id, false); }, true, () => st.markUndone(last.id, false, false))).toThrow();
    expect(st.state.guards['2026-10-13'].mg1).toBe(2); expect(st.lastUndoable()?.id).toBe(last.id);
    st.flush = real; st.close();
  });
  it('το .tmp δεν μένει όταν η εγγραφή αποτύχει στη μέση', () => {
    const dir = tmp(); const file = path.join(dir, 'a.db');
    const spy = vi.spyOn(fs, 'writeSync').mockImplementation(() => { const e: NodeJS.ErrnoException = new Error('ENOSPC'); e.code = 'ENOSPC'; throw e; });
    try { expect(() => writeDurable(file, 'δεδομένα')).toThrow(/ENOSPC/); } finally { spy.mockRestore(); }
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe('«Νέο αρχείο» που αποτυγχάνει: η κατάσταση του παλιού αρχείου μένει (7β)', () => {
  it('keep: ό,τι ήξερε η εφαρμογή για το είδος γυρίζει όπως ήταν', () => {
    const m = new SourceMetaStore(path.join(tmp(), 'sources.json'));
    m.set('punish', { at: '2026-10-12 10:00', keys: ['1|punish|2026-10-01'], mtime: 5, size: 7, hash: 'v2:abc' });
    const back = m.keep('punish');
    m.set('punish', null); m.set('punish', { at: '', keys: [] });
    back();
    expect(m.get('punish')).toEqual({ at: '2026-10-12 10:00', keys: ['1|punish|2026-10-01'], mtime: 5, size: 7, hash: 'v2:abc' });
    const none = m.keep('leave'); m.set('leave', { at: 'x' }); none();
    expect(m.get('leave')).toBeUndefined();
  });
});
