// Στελέχη σε δικό τους Excel (Michael, 3/11): γράφονται, διαβάζονται, και η εφαρμογή κρατά ό,τι άλλαξε ο καθένας. Μόνο ψεύτικα στοιχεία.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { bestFor, defaultBinding, detectTables, fieldsOf, listColumns, mapColumns, planSource, type SourceBinding } from '../src/shared/sources';
import { cadreMeta, planCadreAbs, planCadres, planCadresWrite, planCadreAbsWrite } from '../src/shared/cadreSource';
import { Workbook } from '../src/main/xlsx';
import { readBook, writeSource, type SourceMeta } from '../src/main/sources';
import { fakeState } from './fixtures';

const D = '2026-11-03';
const ctx = { today: D, newId: (() => { let i = 0; return () => 'n' + ++i; })() };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const IBAN = 'GR1601101250000000012300695';
function base(): AppState {
  let s = fakeState(3);
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΑΝΘΛΓΟΣ', hk: 'Ανθυπίλαρχοι-Ανθλγοι', last: 'ΔΟΚΙΜΙΔΗΣ', first: 'ΑΛΦΑΣ', spec: 'ΠΖ', am: '12345', phone: '6900000001', role: 'ΔΟΥ' } });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΑΡΧΙΛΟΧΙΑΣ', hk: 'Αρχιλοχίες', last: 'ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ', first: 'ΒΗΤΑΣ', spec: 'ΤΘ', am: '23456' } });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΣΤΡ', origin: 'ΕΠΟΠ', hk: 'ΕΠΟΠ Στρατιώτης', last: 'ΥΠΟΘΕΤΙΔΗΣ', first: 'ΓΑΜΜΑΣ', am: '34567', monthMax: 3 } });
  const id = s.cadreList[0].id;
  s = run(s, { t: 'setPersonal', cid: id, iban: IBAN, amka: '01020304567', afm: '012345678' });
  s = run(s, { t: 'saveCadre', cadre: { ...s.cadreList[0], weapon: '1234', wtype: 'G3A3' } });
  return s;
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-cad-'));
const first = (w: Awaited<ReturnType<typeof writeSource>>) => { if (!w.ok) throw new Error(w.error); return w; };
const asMeta = (m: Partial<SourceMeta>): SourceMeta => ({ mtime: 0, size: 0, keys: [], at: 'x', ...m });
async function sheetOf(file: string, name: string): Promise<RawSheet> { return (await readBook(file)).sheets.find(x => x.name === name)!; }
async function edit(file: string, f: (ws: Awaited<ReturnType<Workbook['sheet']>>, wb: Workbook) => void | Promise<void>, sheet: string) {
  const wb = await Workbook.open(await fs.promises.readFile(file)); const ws = await wb.sheet(sheet); await f(ws, wb); fs.writeFileSync(file, await wb.save());
}

describe('Στελέχη στο Excel: αναγνώριση πίνακα', () => {
  const head = ['Α/Α', 'ΒΑΘΜΟΣ', 'ΠΡΟΕΛΕΥΣΗ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΜ', 'ΤΗΛΕΦΩΝΟ', 'ΘΕΣΗ', 'ΓΡΑΜΜΗ ΗΚΑΙ', 'ΣΕ ΔΥΝΑΜΗ', 'IBAN'];
  it('οι επικεφαλίδες του δείγματος βρίσκονται και δεν μπερδεύονται με το Δυναμολόγιο', () => {
    const sh: RawSheet = { name: 'ΣΤΕΛΕΧΗ', rows: [['ΣΤΕΛΕΧΗ'], head, [1, 'ΑΝΘΛΓΟΣ', '', 'ΠΖ', 'ΔΟΚΙΜΙΔΗΣ', 'ΑΛΦΑΣ', 12345, 6900000001, 'ΔΟΥ', 'Ανθυπίλαρχοι-Ανθλγοι', 'ΝΑΙ', '']] };
    const cols = mapColumns(head, fieldsOf('cadres'));
    expect(cols).toMatchObject({ aa: 0, rank: 1, origin: 2, spec: 3, last: 4, first: 5, am: 6, phone: 7, role: 8, hk: 9, active: 10, iban: 11 });
    expect(bestFor('cadres', [sh])).toMatchObject({ sheet: 'ΣΤΕΛΕΧΗ', header: 1 });
    expect(detectTables([sh])[0].best).toBe('cadres');
    // δεν παίρνει φύλλο ΣΥΝΟΛΙΚΟ οπλιτών
    const ps: RawSheet = { name: 'ΣΥΝΟΛΙΚΟ', rows: [['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΚΙΝΗΤΟ', 'ΘΑΛΑΜΟΣ', 'Σ.Ι', 'IBAN', 'ΑΜΚΑ', 'ΑΦΜ'], [1, 'ΣΤΡ', 'ΠΖ', 'ΑΛΦΑΣ', 'ΒΗΤΑΣ', 'ΓΑΜΜΑΣ', 1, 6900000002, 1, 'Ι1', '', '', '']] };
    expect(detectTables([ps])[0].best).toBe('people');
    // πίνακας στελεχών με IBAN/ΑΜΚΑ/ΑΦΜ και άλλο όνομα φύλλου δεν γίνεται «Προσωπικό»
    const other: RawSheet = { name: 'Φύλλο1', rows: [[...head, 'ΑΜΚΑ', 'ΑΦΜ'], [1, 'ΑΝΘΛΓΟΣ', '', 'ΠΖ', 'ΔΟΚΙΜΙΔΗΣ', 'ΑΛΦΑΣ', 12345, 6900000001, 'ΔΟΥ', 'Ανθυπίλαρχοι-Ανθλγοι', 'ΝΑΙ', '', '', '']] };
    expect(detectTables([other])[0].best).toBe('cadres');
  });
  it('οι καταστάσεις: φύλλο ΚΑΤΑΣΤΑΣΕΙΣ με τον τίτλο της εφαρμογής βρίσκεται ως cadreAbs', () => {
    const sh: RawSheet = { name: 'ΚΑΤΑΣΤΑΣΕΙΣ', rows: [['ΚΑΤΑΣΤΑΣΕΙΣ'], ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΚΑΤΑΣΤΑΣΗ', 'ΣΤΗΛΗ ΗΚΑΙ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡΑΤΗΡΗΣΗ'], [1, 'ΑΝΘΛΓΟΣ', 'ΠΖ', 'ΔΟΚΙΜΙΔΗΣ', 'ΑΛΦΑΣ', 'ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ', 'ΑΠΟΝΤΕΣ · Κ.Άδ', '10/11/2026', '14/11/2026', '']] };
    expect(detectTables([sh])[0].best).toBe('cadreAbs');
  });
  it('τα dropdown της στήλης βαθμού παίρνουν τους βαθμούς στελεχών, όχι οπλιτών', () => {
    const sh: RawSheet = { name: 'ΣΤΕΛΕΧΗ', rows: [['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΣΕ ΔΥΝΑΜΗ']] };
    const b = { ...defaultBinding('cadres', 'x.xlsx'), header: 0, cols: { aa: 0, rank: 1, last: 2, first: 3, active: 4 } };
    const l = listColumns('cadres', sh, b);
    expect(l.find(x => x.what === 'Βαθμός')!.items).toContain('ΑΝΘΛΓΟΣ');
    expect(l.find(x => x.what === 'Σε δύναμη')!.items).toEqual(['ΝΑΙ', 'ΟΧΙ']);
  });
});

describe('Στελέχη στο Excel: αληθινό αρχείο', () => {
  it('νέο αρχείο: στήλες του δείγματος, προαιρετικές μόνο όταν έχει τιμή, IBAN/ΑΜΚΑ/ΑΦΜ ως κείμενο, ξαναδιάβασμα χωρίς αλλαγές', async () => {
    const s = base(); const file = path.join(tmp(), 'ΣΤΕΛΕΧΗ.xlsx');
    const w = first(await writeSource('cadres', defaultBinding('cadres', file), s, undefined, D, { create: true }));
    expect(w.created).toBe(true); expect(w.added).toBe(3);
    const sh = await sheetOf(file, 'ΣΤΕΛΕΧΗ');
    expect(sh.rows[0][0]).toBe('ΣΤΕΛΕΧΗ');
    const h = sh.rows[1].map(String);
    expect(h.slice(0, 11)).toEqual(['Α/Α', 'ΒΑΘΜΟΣ', 'ΠΡΟΕΛΕΥΣΗ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΑΜ', 'ΤΗΛΕΦΩΝΟ', 'ΘΕΣΗ', 'ΓΡΑΜΜΗ ΗΚΑΙ', 'ΣΕ ΔΥΝΑΜΗ']);
    for (const x of ['ΟΡΙΟ ΥΠΗΡΕΣΙΩΝ ΤΟ ΜΗΝΑ', 'ΟΠΛΟ', 'ΤΥΠΟΣ ΟΠΛΟΥ', 'IBAN', 'ΑΜΚΑ', 'ΑΦΜ']) expect(h).toContain(x);
    for (const x of ['ΟΠΛΟΒΑΣΤΗΣ', 'ΘΕΣΗ ΟΠΛΟΥ']) expect(h).not.toContain(x);   // κανείς δεν έχει τιμή
    const col = (n: string) => h.indexOf(n);
    expect(sh.rows[2][col('ΕΠΩΝΥΜΟ')]).toBe('ΔΟΚΙΜΙΔΗΣ');
    expect(String(sh.rows[2][col('IBAN')])).toBe(IBAN); expect(String(sh.rows[2][col('ΑΜΚΑ')])).toBe('01020304567'); expect(String(sh.rows[2][col('ΑΦΜ')])).toBe('012345678');
    expect(sh.rows[2][col('ΣΕ ΔΥΝΑΜΗ')]).toBe('ΝΑΙ'); expect(sh.rows[2][col('ΓΡΑΜΜΗ ΗΚΑΙ')]).toBe('ΑΝΘΥΠΙΛΑΡΧΟΙ-ΑΝΘΛΓΟΙ');
    expect(sh.rows[4][col('ΠΡΟΕΛΕΥΣΗ')]).toBe('ΕΠΟΠ'); expect(sh.rows[4][col('ΟΡΙΟ ΥΠΗΡΕΣΙΩΝ ΤΟ ΜΗΝΑ')]).toBe(3);
    // ξαναδιάβασμα: τίποτα δεν αλλάζει, ούτε στην εφαρμογή ούτε στο Excel
    const b = w.binding!; const meta = { keys: w.meta.keys, base: w.meta.base };
    const rd = planCadres(sh, b, s, meta);
    expect(rd.adds).toEqual([]); expect(rd.updates).toEqual([]); expect(rd.same).toBe(3);
    const again = planCadresWrite(sh, b, s, meta);
    expect(again.sets).toEqual([]); expect(again.insert).toBeNull();
  });

  it('αλλαγή στην εφαρμογή γράφει μόνο το κελί της· ό,τι άλλαξε το Excel δεν πατιέται', async () => {
    let s = base(); const file = path.join(tmp(), 'ΣΤΕΛΕΧΗ.xlsx');
    const w = first(await writeSource('cadres', defaultBinding('cadres', file), s, undefined, D, { create: true }));
    const meta = asMeta(w.meta); const b = w.binding!;
    // το Excel άλλαξε το τηλέφωνο του πρώτου (δεν έχει περάσει στην εφαρμογή) κι η εφαρμογή τη θέση του δεύτερου
    const sh0 = await sheetOf(file, 'ΣΤΕΛΕΧΗ'); const h = sh0.rows[1].map(String);
    const L = (c: number) => String.fromCharCode(65 + c);
    await edit(file, ws => { ws.set(L(h.indexOf('ΤΗΛΕΦΩΝΟ')) + '3', 6911111111); }, 'ΣΤΕΛΕΧΗ');
    s = run(s, { t: 'saveCadre', cadre: { ...s.cadreList[1], role: 'ΓΡΑΦΕΑΣ' } });
    const w2 = first(await writeSource('cadres', b, s, meta, D));
    expect(w2.changed).toBe(1);
    const sh = await sheetOf(file, 'ΣΤΕΛΕΧΗ');
    expect(sh.rows[3][h.indexOf('ΘΕΣΗ')]).toBe('ΓΡΑΦΕΑΣ');
    expect(Number(sh.rows[2][h.indexOf('ΤΗΛΕΦΩΝΟ')])).toBe(6911111111);   // του Excel, μένει
    // και η ανάγνωση το βλέπει ως αλλαγή του Excel
    const rd = planCadres(sh, b, s, { keys: w2.meta.keys, base: w2.meta.base });
    expect(rd.updates.map(u => [u.who, u.patch])).toEqual([['ΑΝΘΛΓΟΣ ΔΟΚΙΜΙΔΗΣ ΑΛΦΑΣ', { phone: '6911111111' }]]);
  });

  it('ανάγνωση: νέα γραμμή = νέο στέλεχος (γραμμή ΗΚΑΙ από τον βαθμό, IBAN), ΣΕ ΔΥΝΑΜΗ ΟΧΙ = εκτός δύναμης, καθαρίζεται το IBAN με κενό κελί', async () => {
    let s = base(); const file = path.join(tmp(), 'ΣΤΕΛΕΧΗ.xlsx');
    const w = first(await writeSource('cadres', defaultBinding('cadres', file), s, undefined, D, { create: true }));
    const b = w.binding!; const h = (await sheetOf(file, 'ΣΤΕΛΕΧΗ')).rows[1].map(String); const L = (c: number) => String.fromCharCode(65 + c); const at = (n: string, r: number) => L(h.indexOf(n)) + r;
    await edit(file, ws => {
      ws.set(at('ΒΑΘΜΟΣ', 6), 'ΑΝΘΣΤΗΣ'); ws.set(at('ΕΠΩΝΥΜΟ', 6), 'ΝΕΟΠΟΥΛΟΣ'); ws.set(at('ΟΝΟΜΑ', 6), 'ΔΕΛΤΑΣ'); ws.set(at('ΑΜ', 6), 45678); ws.set(at('IBAN', 6), 'gr16 0110 1250 0000 0001 2300 695'); ws.set(at('ΑΦΜ', 6), 123456789);
      ws.set(at('ΣΕ ΔΥΝΑΜΗ', 4), 'ΟΧΙ');
      ws.set(at('IBAN', 3), null);
    }, 'ΣΤΕΛΕΧΗ');
    const sh = await sheetOf(file, 'ΣΤΕΛΕΧΗ');
    const rd = planCadres(sh, b, s, { keys: w.meta.keys, base: w.meta.base });
    expect(rd.adds.map(a => a.who)).toEqual(['ΑΝΘΣΤΗΣ ΝΕΟΠΟΥΛΟΣ ΔΕΛΤΑΣ']);
    expect(rd.adds[0].cadre).toMatchObject({ hk: 'Ανθυπασπιστές', am: '45678', iban: IBAN, afm: '123456789', last: 'ΝΕΟΠΟΥΛΟΣ', first: 'ΔΕΛΤΑΣ' });
    expect(rd.updates.map(u => u.patch)).toEqual(expect.arrayContaining([{ active: false }, { iban: '' }]));
    s = run(s, { t: 'importCadres', adds: rd.adds.map(a => a.cadre), updates: rd.updates.map(u => ({ id: u.id, patch: u.patch })), source: 'ΣΤΕΛΕΧΗ.xlsx' });
    expect(s.cadreList).toHaveLength(4);
    const nu = s.cadreList.find(c => c.last === 'ΝΕΟΠΟΥΛΟΣ')!;
    expect(nu).toMatchObject({ hk: 'Ανθυπασπιστές', iban: IBAN, afm: '123456789', am: '45678', active: true });
    expect(s.cadreList.find(c => c.last === 'ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ')!.active).toBe(false);
    expect(s.cadreList.find(c => c.last === 'ΔΟΚΙΜΙΔΗΣ')!.iban).toBeUndefined();
    expect(s.cadreList.find(c => c.last === 'ΔΟΚΙΜΙΔΗΣ')!.amka).toBe('01020304567');   // μόνο ό,τι άλλαξε
    // μετά την ανάγνωση: το Excel και η εφαρμογή συμφωνούν, και η επόμενη εγγραφή δεν γράφει τίποτα
    const m = cadreMeta('cadres', sh, b, s, D);
    expect(planCadres(sh, b, s, m).updates).toEqual([]);
    expect(planCadresWrite(sh, b, s, m).sets).toEqual([]);
  });

  it('νέο στέλεχος στην εφαρμογή = νέα γραμμή· διαγραφή στην εφαρμογή = η γραμμή φεύγει· άγνωστη γραμμή του Excel δεν αγγίζεται', async () => {
    let s = base(); const file = path.join(tmp(), 'ΣΤΕΛΕΧΗ.xlsx');
    const w = first(await writeSource('cadres', defaultBinding('cadres', file), s, undefined, D, { create: true }));
    const b = w.binding!; const h = (await sheetOf(file, 'ΣΤΕΛΕΧΗ')).rows[1].map(String); const L = (c: number) => String.fromCharCode(65 + c);
    await edit(file, ws => { ws.set(L(h.indexOf('ΕΠΩΝΥΜΟ')) + '6', 'ΧΕΙΡΟΓΡΑΦΟΣ'); ws.set(L(h.indexOf('ΟΝΟΜΑ')) + '6', 'ΕΨΙΛΟΝ'); }, 'ΣΤΕΛΕΧΗ');
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΝΕΟΣ', first: 'ΖΗΤΑ' } });
    s = run(s, { t: 'deleteCadre', id: s.cadreList[1].id });
    const w2 = first(await writeSource('cadres', b, s, asMeta(w.meta), D));
    expect(w2.added).toBe(1); expect(w2.cleared).toBe(1); expect(w2.foreign).toBe(1);
    const sh = await sheetOf(file, 'ΣΤΕΛΕΧΗ');
    const names = sh.rows.slice(2).map(r => String(r[h.indexOf('ΕΠΩΝΥΜΟ')] ?? '')).filter(Boolean);
    expect(names).toEqual(expect.arrayContaining(['ΔΟΚΙΜΙΔΗΣ', 'ΥΠΟΘΕΤΙΔΗΣ', 'ΧΕΙΡΟΓΡΑΦΟΣ', 'ΝΕΟΣ']));
    expect(names).not.toContain('ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ');
  });
});

describe('Καταστάσεις στελεχών στο Excel', () => {
  it('γράφονται στο φύλλο, ξαναδιαβάζονται, αλλαγές του Excel περνούν, και οι ληγμένες φεύγουν από το Excel', async () => {
    let s = base(); const file = path.join(tmp(), 'ΣΤΕΛΕΧΗ.xlsx');
    const [a, b2] = s.cadreList;
    s = run(s, { t: 'addCadreAbs', abs: { cid: a.id, kind: 'ka', from: '2026-11-10', to: '2026-11-14', note: 'ΜΕ ΤΗΝ ΟΙΚΟΓΕΝΕΙΑ' } });
    s = run(s, { t: 'addCadreAbs', abs: { cid: b2.id, kind: 'nos', from: '2026-10-01', to: '2026-11-02' } });   // ληγμένη
    s = run(s, { t: 'addCadreAbs', abs: { cid: b2.id, kind: 'ey', from: '2026-11-20', to: '2026-11-21' } });
    const bnd = defaultBinding('cadreAbs', file);
    const w = first(await writeSource('cadreAbs', bnd, s, undefined, D, { create: true }));
    expect(w.added).toBe(2);   // η ληγμένη δεν γράφεται (scope active)
    const sh = await sheetOf(file, 'ΚΑΤΑΣΤΑΣΕΙΣ');
    expect(sh.rows[1].map(String)).toEqual(['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΚΑΤΑΣΤΑΣΗ', 'ΣΤΗΛΗ ΗΚΑΙ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡΑΤΗΡΗΣΗ']);
    expect(sh.rows[2][5]).toBe('ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ'); expect(sh.rows[2][7] instanceof Date ? (sh.rows[2][7] as Date).toISOString().slice(0, 10) : sh.rows[2][7]).toBe('2026-11-10');
    const meta = { keys: w.meta.keys, base: w.meta.base };
    const rd = planCadreAbs(sh, bnd, s, meta);
    expect(rd.adds).toEqual([]); expect(rd.updates).toEqual([]); expect(rd.removed).toEqual([]); expect(rd.same).toBe(2);
    expect(planCadreAbsWrite(sh, bnd, s, meta, D).sets).toEqual([]);
    // το Excel: νέα κατάσταση με το χέρι, αλλαγή παρατήρησης, σβησμένη γραμμή
    await edit(file, ws => {
      ws.set('B5', 'ΑΡΧΙΛΟΧΙΑΣ'); ws.set('D5', 'ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ'); ws.set('E5', 'ΒΗΤΑΣ'); ws.set('F5', 'Νοσοκομείο'); ws.set('H5', '25/11/2026'); ws.set('I5', '27/11/2026');
      ws.set('J3', 'ΜΕ ΤΗ ΜΗΤΕΡΑ ΤΟΥ');
    }, 'ΚΑΤΑΣΤΑΣΕΙΣ');
    const sh2 = await sheetOf(file, 'ΚΑΤΑΣΤΑΣΕΙΣ');
    const r2 = planCadreAbs(sh2, bnd, s, meta);
    expect(r2.adds.map(x => x.abs)).toMatchObject([{ cid: b2.id, kind: 'nos', from: '2026-11-25', to: '2026-11-27' }]);
    expect(r2.updates.map(u => u.note)).toEqual(['ΜΕ ΤΗ ΜΗΤΕΡΑ ΤΟΥ']);
    s = run(s, { t: 'importCadreAbs', adds: r2.adds.map(x => x.abs), updates: r2.updates.map(u => ({ id: u.id, note: u.note })), deletes: r2.removed.map(x => x.id), source: 'ΣΤΕΛΕΧΗ.xlsx' });
    expect(s.cadreAbs.filter(x => x.kind === 'nos' && x.from === '2026-11-25')).toHaveLength(1);
    expect(s.cadreAbs.find(x => x.id === s.cadreAbs.find(y => y.kind === 'ka')!.id)!.note).toBe('ΜΕ ΤΗ ΜΗΤΕΡΑ ΤΟΥ');
    // μετονομασία στελέχους στην εφαρμογή: η γραμμή του ακολουθεί, δεν ξαναγράφεται δεύτερη
    const m = cadreMeta('cadreAbs', sh2, bnd, s, D);
    s = run(s, { t: 'saveCadre', cadre: { ...s.cadreList[0], last: 'ΔΙΟΡΘΩΜΕΝΟΣ' } });
    const w2 = first(await writeSource('cadreAbs', bnd, s, asMeta({ ...w.meta, ...m }), D));
    expect(w2.added).toBe(0); expect(w2.changed).toBeGreaterThan(0);
    const sh3 = await sheetOf(file, 'ΚΑΤΑΣΤΑΣΕΙΣ');
    expect(sh3.rows.slice(2).map(r => String(r[3] ?? '')).filter(Boolean).sort()).toEqual(['ΔΙΟΡΘΩΜΕΝΟΣ', 'ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ', 'ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ']);
  });

  it('κατάσταση που έσβησες στην εφαρμογή φεύγει από το Excel· που έσβησε το Excel φαίνεται ως «σβήστηκε από το Excel»', async () => {
    let s = base(); const file = path.join(tmp(), 'ΣΤΕΛΕΧΗ.xlsx');
    const [a] = s.cadreList;
    s = run(s, { t: 'addCadreAbs', abs: { cid: a.id, kind: 'ka', from: '2026-11-10', to: '2026-11-14' } });
    s = run(s, { t: 'addCadreAbs', abs: { cid: a.id, kind: 'an', from: '2026-11-20', to: '2026-11-22' } });
    const bnd = defaultBinding('cadreAbs', file);
    const w = first(await writeSource('cadreAbs', bnd, s, undefined, D, { create: true }));
    const meta = asMeta(w.meta);
    const del = s.cadreAbs.find(x => x.kind === 'an')!;
    const s2 = run(s, { t: 'deleteCadreAbs', id: del.id });
    const w2 = first(await writeSource('cadreAbs', bnd, s2, meta, D));
    expect(w2.cleared).toBe(1);
    // το Excel σβήνει την άλλη: η ανάγνωση την προτείνει για σβήσιμο
    await edit(file, ws => { for (const c of 'ABCDEFGHIJ') ws.set(c + '3', null); }, 'ΚΑΤΑΣΤΑΣΕΙΣ');
    const sh = await sheetOf(file, 'ΚΑΤΑΣΤΑΣΕΙΣ');
    const rd = planCadreAbs(sh, bnd, s2, { keys: w2.meta.keys, base: w2.meta.base });
    expect(rd.removed).toHaveLength(1);
    const s3 = run(s2, { t: 'importCadreAbs', adds: [], updates: [], deletes: rd.removed.map(x => x.id), source: 'x' });
    expect(s3.cadreAbs).toHaveLength(0);
  });

  it('ίδιο ονοματεπώνυμο με άλλο στέλεχος χωρίς ΑΜ: δεν αγγίζεται ούτε ξαναγράφεται', () => {
    let s = base();
    s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΔΗΣ', first: 'ΑΛΦΑΣ' } });
    const b = defaultBinding('cadres', 'x.xlsx');
    const sh: RawSheet = { name: 'ΣΤΕΛΕΧΗ', rows: [['ΣΤΕΛΕΧΗ'], ['Α/Α', 'ΒΑΘΜΟΣ', 'ΠΡΟΕΛΕΥΣΗ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ'], [1, 'ΛΧΙΑΣ', '', '', 'ΔΟΚΙΜΙΔΗΣ', 'ΑΛΦΑΣ']] };
    const bb: SourceBinding = { ...b, cols: { aa: 0, rank: 1, origin: 2, spec: 3, last: 4, first: 5 } };
    const p = planCadresWrite(sh, bb, s, undefined);
    expect(p.ambiguous).toEqual([2]); expect(p.added).toBe(2);   // οι άλλοι δύο μπαίνουν· οι δύο συνώνυμοι όχι
    expect(planSource('cadres', sh, bb, s, undefined, D).ambiguous).toEqual([2]);
  });

  it('και τα δύο φύλλα στο ίδιο αρχείο: η κατάσταση μπαίνει ως νέο φύλλο και τα στοιχεία των στελεχών μένουν όπως ήταν', async () => {
    let s = base(); const file = path.join(tmp(), 'ΣΤΕΛΕΧΗ.xlsx');
    first(await writeSource('cadres', defaultBinding('cadres', file), s, undefined, D, { create: true }));
    s = run(s, { t: 'addCadreAbs', abs: { cid: s.cadreList[0].id, kind: 'ka', from: '2026-11-10', to: '2026-11-14' } });
    const w = first(await writeSource('cadreAbs', defaultBinding('cadreAbs', file, 'ΚΑΤΑΣΤΑΣΕΙΣ'), s, undefined, D, { create: true }));
    expect(w.created).toBe(true);
    const book = await readBook(file);
    expect(book.sheets.map(x => x.name)).toEqual(['ΣΤΕΛΕΧΗ', 'ΚΑΤΑΣΤΑΣΕΙΣ']);
    expect(book.sheets[0].rows.filter(r => r[4] === 'ΔΟΚΙΜΙΔΗΣ')).toHaveLength(1);
    expect(detectTables(book.sheets).map(h => h.best)).toEqual(['cadres', 'cadreAbs']);
  });
});
