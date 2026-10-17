// Νέα ΕΣΣΟ και επαναφορά ΕΣΣΟ (Michael, 17/10): όνομα και σειρά της ΕΣΣΟ, τι μένει στη νέα, το αρχείο της
// προηγούμενης (βάση, Excel, ΕΣΣΟ.json) και πού βρίσκονται τα Excel στην επαναφορά. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { essoLabel, essoName, essoPersonTxt, freshState, nextEsso, parseEsso, restoredPath, currentEsso, MANIFEST } from '../src/shared/esso';
import { rosterTitle, defaultBinding, bestFor } from '../src/shared/sources';
import { essosOf } from '../src/shared/roster';
import { listArchives, readArchive, writeArchive } from '../src/main/esso';
import { readBook, writeSource } from '../src/main/sources';
import { Store } from '../src/main/db';
import { apply } from '../src/shared/commands';
import { fakeState } from './fixtures';

const TODAY = '2026-10-17';
const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-esso-'));

describe('ΕΣΣΟ: όνομα, σειρά, επόμενη', () => {
  it('διαβάζει όλες τις γραφές', () => {
    expect(parseEsso('2026 Γ΄')).toEqual({ s: 'Γ', y: 2026 });
    expect(parseEsso("Β' ΕΣΣΟ 2026")).toEqual({ s: 'Β', y: 2026 });
    expect(parseEsso('ΔΥΝΑΜΟΛΟΓΙΟ Δ ΕΣΣΟ 2025')).toEqual({ s: 'Δ', y: 2025 });
    expect(parseEsso('Γ΄ ΕΣΣΟ 2026 (έως 17-10-2026)')).toEqual({ s: 'Γ', y: 2026 });
    expect(parseEsso('Γραφείο Ίλης')).toBeNull();
    expect(parseEsso('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ 4ης ΙΛΗΣ')).toBeNull();
  });
  it('όνομα όπως στην εφαρμογή και όπως στο Δυναμολόγιο', () => {
    expect(essoName({ s: 'Γ', y: 2026 })).toBe('Γ΄ ΕΣΣΟ 2026');
    expect(essoPersonTxt({ s: 'Γ', y: 2026 })).toBe('2026 Γ΄');
    // ο τίτλος του νέου Δυναμολογίου ξαναδιαβάζεται ως η ίδια ΕΣΣΟ
    const s = fakeState(2); s.settings = { ...s.settings, essos: { s: 'Δ', y: 2026 } };
    expect(rosterTitle(s)).toBe('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ 4ης ΙΛΗΣ Δ΄ ΕΣΣΟ 2026');
    expect(essosOf(rosterTitle(s))).toBe('2026 Δ΄');
    expect(rosterTitle(fakeState(1))).toBe('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ 4ης ΙΛΗΣ');
  });
  it('τωρινή: των Ρυθμίσεων, αλλιώς η πιο συχνή όσων είναι σε δύναμη', () => {
    const s = fakeState(4);
    expect(essoLabel(s)).toBe('Γ΄ ΕΣΣΟ 2026');
    s.settings = { ...s.settings, essos: { s: 'Δ', y: 2026 } };
    expect(currentEsso(s)).toEqual({ s: 'Δ', y: 2026 });
  });
  it('επόμενη: μετά τη Δ΄ η Α΄ της επόμενης χρονιάς· χωρίς τωρινή, από τον μήνα', () => {
    expect(nextEsso({ s: 'Β', y: 2026 }, TODAY)).toEqual({ s: 'Γ', y: 2026 });
    expect(nextEsso({ s: 'Δ', y: 2026 }, TODAY)).toEqual({ s: 'Α', y: 2027 });
    expect(nextEsso(null, '2026-10-17')).toEqual({ s: 'Δ', y: 2026 });
    expect(nextEsso(null, '2026-02-01')).toEqual({ s: 'Α', y: 2026 });
  });
});

describe('νέα ΕΣΣΟ: τι μένει', () => {
  it('φεύγουν οι στρατιώτες και ό,τι τους αφορά· μένουν κανόνες, μονάδα, λίστες, στελέχη, templates', () => {
    const s = fakeState(6);
    s.statuses = [{ id: 'a', pid: 1, type: 'EY', from: TODAY, to: TODAY }];
    s.guards = { [TODAY]: { mg1: 2 } }; s.caps = { 2: { sk: 'ΟΧΙ' } }; s.baseline = { 3: { th: 2 } };
    s.requests = [{ id: 'r', pid: 1, date: TODAY, text: 'x' }]; s.nightTraining = { [TODAY]: true };
    s.cadreList = [{ id: 'c', rank: 'ΛΧΙΑΣ', hk: 'x', last: 'ΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ', active: true }];
    s.rules = { ...s.rules, restDays: 2 };
    s.settings = { ...s.settings, unitName: '5ης ΙΛΗΣ', phase: 'spen', fixed: { ly: 2 }, outputDir: 'C:\\Παλιός', newDirs: { punish: 'C:\\Π' },
      sources: { people: { file: 'C:\\Παλιός\\ΔΥΝ.xlsx', sheet: 'ΣΥΝΟΛΙΚΟ', header: 1, cols: {} } },
      forms: { hkai: { file: 'C:\\t\\hkai.xlsx', dir: 'C:\\Παλιός\\ΗΚΑΙ' }, froura: { dir: 'C:\\Παλιός\\Φ' } }, holidays: { '2026-11-02': 'Τοπική' } };
    const n = freshState(s, { s: 'Δ', y: 2026 }, TODAY, 'C:\\Νέος');
    expect(n.people).toEqual([]); expect(n.statuses).toEqual([]); expect(n.guards).toEqual({}); expect(n.caps).toEqual({});
    expect(n.baseline).toEqual({}); expect(n.requests).toEqual([]); expect(n.nightTraining).toEqual({});
    expect(n.rules.restDays).toBe(2); expect(n.cadreList).toHaveLength(1);
    expect(n.settings.unitName).toBe('5ης ΙΛΗΣ'); expect(n.settings.holidays).toEqual({ '2026-11-02': 'Τοπική' });
    expect(n.settings.essos).toEqual({ s: 'Δ', y: 2026, from: TODAY });
    expect(n.settings.sources).toEqual({}); expect(n.settings.newDirs).toEqual({}); expect(n.settings.fixed).toEqual({});
    expect(n.settings.outputDir).toBe('C:\\Νέος'); expect(n.settings.phase).toBe('sven'); expect(n.settings.baselineReviewed).toBe(true);
    // το template της ΗΚΑΙ μένει, οι φάκελοι των εντύπων πάνε στον φάκελο της νέας
    expect(n.settings.forms).toEqual({ hkai: { file: 'C:\\t\\hkai.xlsx' } });
    // η πρώτη εισαγωγή στη νέα ΕΣΣΟ δεν γράφεται ως εγγραφές στην ΗΚΑΙ
    const rows = fakeState(3).people.map(({ id, active, ...p }) => p);
    const r = apply(n, { t: 'importPeople', rows, source: 't', deactivateMissing: true }, { today: TODAY, newId: () => 'x' });
    expect(r.state.people.map(p => p.id)).toEqual([1, 2, 3]); expect(r.state.people.some(p => p.inOn)).toBe(false);
  });
  it('νέο κενό Δυναμολόγιο: φτιάχνεται με τον τίτλο της ΕΣΣΟ και ξαναδιαβάζεται', async () => {
    const n = freshState(fakeState(3), { s: 'Δ', y: 2026 }, TODAY, tmp());
    const file = path.join(tmp(), 'dyn.xlsx'); const b = { ...defaultBinding('people', file), write: true };
    const w = await writeSource('people', b, n, undefined, TODAY, { create: true });
    expect(w.ok && w.created, JSON.stringify(w)).toBe(true);
    const { sheets } = await readBook(file);
    expect(bestFor('people', sheets)).toBeTruthy();
    expect(essosOf(String(sheets.find(x => x.name === b.sheet)!.rows[0][0]))).toBe('2026 Δ΄');
  });
});

describe('αρχείο ΕΣΣΟ', () => {
  it('βάση, Excel μία φορά το καθένα, sources.json και ΕΣΣΟ.json· ξαναδιαβάζεται και βρίσκεται στη λίστα', () => {
    const src = tmp(); const root = tmp();
    const dyn = path.join(src, 'ΔΥΝΑΜΟΛΟΓΙΟ.xlsx'); fs.writeFileSync(dyn, 'dyn');
    const tpl = path.join(src, 'sub', 'ΔΥΝΑΜΟΛΟΓΙΟ.xlsx'); fs.mkdirSync(path.dirname(tpl)); fs.writeFileSync(tpl, 'other');
    const r = writeArchive({ root, day: TODAY, db: new Uint8Array([1, 2, 3]), sources: { people: { at: 'x' } },
      files: [{ orig: dyn, kind: 'people' }, { orig: dyn, kind: 'punish' }, { orig: tpl, kind: 'duties' }, { orig: path.join(src, 'λείπει.xlsx'), kind: 'leave' }],
      manifest: { app: 'grafeio-ilis', v: 1, name: 'Γ΄ ΕΣΣΟ 2026', esso: { s: 'Γ', y: 2026 }, at: TODAY + ' 10:00', version: 't', people: 3, outDirs: [src] } });
    expect(path.basename(r.dir)).toBe('Γ΄ ΕΣΣΟ 2026 (έως 17-10-2026)');
    expect(r.missing).toEqual([path.join(src, 'λείπει.xlsx')]);
    expect(r.manifest.files.map(f => f.copy)).toEqual(['Excel/ΔΥΝΑΜΟΛΟΓΙΟ.xlsx', 'Excel/ΔΥΝΑΜΟΛΟΓΙΟ.xlsx', 'Excel/ΔΥΝΑΜΟΛΟΓΙΟ (2).xlsx']);
    expect(fs.readFileSync(path.join(r.dir, 'Excel', 'ΔΥΝΑΜΟΛΟΓΙΟ (2).xlsx'), 'utf8')).toBe('other');
    const back = readArchive(r.dir);
    expect(back.ok && back.manifest.name).toBe('Γ΄ ΕΣΣΟ 2026');
    expect(back.ok && fs.readFileSync(back.db)).toEqual(Buffer.from([1, 2, 3]));
    // δεύτερο αρχείο της ίδιας μέρας: δεν πατά το πρώτο
    const r2 = writeArchive({ root, day: TODAY, db: new Uint8Array([4]), sources: {}, files: [], manifest: { ...r.manifest, at: TODAY + ' 11:00' } });
    expect(path.basename(r2.dir)).toBe('Γ΄ ΕΣΣΟ 2026 (έως 17-10-2026) (2)');
    expect(listArchives(root).map(x => x.dir)).toEqual([r2.dir, r.dir]);
    // φάκελος χωρίς ΕΣΣΟ.json (μισό αρχείο) δεν είναι αρχείο
    fs.mkdirSync(path.join(root, 'άλλο'));
    expect(readArchive(path.join(root, 'άλλο')).ok).toBe(false);
    expect(listArchives(root)).toHaveLength(2);
    expect(fs.existsSync(path.join(r.dir, MANIFEST))).toBe(true);
  });
  it('επαναφορά: το Excel μένει εκεί που ήταν αν υπάρχει, αλλιώς το αντίγραφο του αρχείου', () => {
    const m = { app: 'grafeio-ilis' as const, v: 1 as const, name: 'x', at: '', version: '', people: 0, outDirs: [], files: [{ orig: 'C:\\a.xlsx', copy: 'Excel/a.xlsx' }, { orig: 'C:\\b.xlsx', copy: 'Excel/b.xlsx' }] };
    const at = (rel: string) => 'D:\\Αρχείο\\' + rel;
    const have = new Set(['C:\\a.xlsx', 'D:\\Αρχείο\\Excel/b.xlsx']);
    expect(restoredPath('C:\\a.xlsx', m, at, f => have.has(f))).toBe('C:\\a.xlsx');
    expect(restoredPath('C:\\b.xlsx', m, at, f => have.has(f))).toBe('D:\\Αρχείο\\Excel/b.xlsx');
    expect(restoredPath('C:\\c.xlsx', m, at, f => have.has(f))).toBe('C:\\c.xlsx');
  });
  it('η βάση της νέας ΕΣΣΟ ξεκινά χωρίς το ιστορικό (και την αναίρεση) της παλιάς', async () => {
    const dir = tmp(); const st = new Store(dir, WASM); await st.open();
    const rows = fakeState(3).people.map(({ id, active, ...p }) => p);
    const patch = st.commit(apply(st.state, { t: 'importPeople', rows, source: 't', deactivateMissing: false }, { today: TODAY, newId: () => 'x' }).state);
    st.addAudit({ at: '10:00', day: TODAY, text: 'εισαγωγή', files: [], source: 'import', undoable: true }, patch);
    expect(st.lastUndoable()).not.toBeNull();
    st.commit(freshState(st.state, { s: 'Δ', y: 2026 }, TODAY, dir)); st.clearAudit();
    expect(st.lastUndoable()).toBeNull(); expect(st.audit()).toEqual([]);
    st.close();
    const again = new Store(dir, WASM); await again.open();
    expect(again.state.people).toEqual([]); expect(again.state.settings.essos).toEqual({ s: 'Δ', y: 2026, from: TODAY });
    again.close();
  });
});
