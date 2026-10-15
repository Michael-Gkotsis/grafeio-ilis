// Φάκελος δεδομένων, μοναδικά .tmp, αντίγραφα με fsync, γνωστά αρχεία και αρχείο που άλλαξε πριν τη μετονομασία.
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ChangedError, copyDurable, dataDirOf, writeAll, writeDurable } from '../src/main/files';
import { SourceMetaStore } from '../src/main/sources';
import { Workbook } from '../src/main/xlsx';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gi-paths-'));

describe('φάκελος δεδομένων (S8)', () => {
  it('προτιμά όποιον έχει ήδη τη βάση· στο προφίλ μόνο αν ο φάκελος της εφαρμογής δεν έχει και δεν γράφεται', () => {
    const a = tmp(), b = tmp(); const local = path.join(a, 'data'), profile = path.join(b, 'data');
    expect(dataDirOf(local, profile, () => true)).toEqual({ dir: local, fallback: false });
    expect(dataDirOf(local, profile, () => false)).toEqual({ dir: profile, fallback: true });
    fs.mkdirSync(profile); fs.writeFileSync(path.join(profile, 'ilh.db'), 'x');
    expect(dataDirOf(local, profile, () => true)).toEqual({ dir: profile, fallback: true });   // τα δεδομένα είναι εκεί
    fs.mkdirSync(local); fs.writeFileSync(path.join(local, 'ilh.db'), 'x');
    expect(dataDirOf(local, profile, () => false)).toEqual({ dir: local, fallback: false });
  });
});

describe('εγγραφές (S4, S2)', () => {
  it('κάθε εγγραφή με δικό της .tmp', () => {
    const dir = tmp(); const file = path.join(dir, 'a.json'); const seen: string[] = [];
    const orig = fs.renameSync; const spy = vi.spyOn(fs, 'renameSync').mockImplementation((a, b) => { seen.push(String(a)); orig(a, b); });
    try { writeDurable(file, '1'); writeDurable(file, '2'); } finally { spy.mockRestore(); }
    expect(seen).toHaveLength(2); expect(seen[0]).not.toBe(seen[1]); expect(seen[0]).toMatch(/\.tmp$/);
  });
  it('αντίγραφο αρχείου με fsync', () => {
    const dir = tmp(); const src = path.join(dir, 'a.db'), dst = path.join(dir, 'b.db'); fs.writeFileSync(src, 'βάση');
    const spy = vi.spyOn(fs, 'fsyncSync');
    try { copyDurable(src, dst); expect(spy).toHaveBeenCalled(); } finally { spy.mockRestore(); }
    expect(fs.readFileSync(dst, 'utf8')).toBe('βάση'); expect(fs.readdirSync(dir).sort()).toEqual(['a.db', 'b.db']);
  });
});

describe('Excel που άλλαξε στο μεταξύ (X1)', () => {
  it('δεν γράφεται πάνω του: «άλλαξε στο μεταξύ», και δεν μένει .tmp', async () => {
    const dir = tmp(); const file = path.join(dir, 'Δ.xlsx');
    const wb = await Workbook.blank('Φ'); fs.writeFileSync(file, await wb.save());
    const st = fs.statSync(file); const expect0 = { mtime: Math.round(st.mtimeMs), size: st.size };
    fs.writeFileSync(file, Buffer.concat([await wb.save(), Buffer.from('xx')])); const t = new Date(Date.now() + 9000); fs.utimesSync(file, t, t);
    const before = fs.readFileSync(file);
    await expect(writeAll([{ dir, name: 'Δ.xlsx', data: await wb.save() }], { expect: { [file]: expect0 } })).rejects.toBeInstanceOf(ChangedError);
    expect(fs.readFileSync(file).equals(before)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual(['Δ.xlsx']);
    await writeAll([{ dir, name: 'Δ.xlsx', data: await wb.save() }], { expect: { [file]: { mtime: Math.round(fs.statSync(file).mtimeMs), size: fs.statSync(file).size } } });
  });
});

describe('γνωστά αρχεία (S9)', () => {
  it('μόνο όσα έδωσαν οι διάλογοι της εφαρμογής· κρατιούνται στο sources.json χωρίς να μπερδεύονται με τα είδη', () => {
    const f = path.join(tmp(), 'sources.json'); const m = new SourceMetaStore(f);
    m.set('punish', { at: 'x' }); m.allow(['C:/a/Δ.xlsx', '/x/y.xlsx']);
    expect(m.allowed('/x/y.xlsx')).toBe(true); expect(m.allowed('/x/z.xlsx')).toBe(false);
    expect(Object.keys(m.all())).toEqual(['punish']);
    m.set('leave', { at: 'y' });
    expect(new SourceMetaStore(f).allowed('/x/y.xlsx')).toBe(true);
  });
});
