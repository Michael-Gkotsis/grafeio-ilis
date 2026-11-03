// IBAN, ΑΜΚΑ, ΑΦΜ στο Excel του Δυναμολογίου (Michael, 3/11: «θέλω να γράφονται στο excel»). Μόνο ψεύτικα στοιχεία.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, rosterChanges, type Command } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { parseRoster, type RawSheet } from '../src/shared/roster';
import { bestFor, defaultBinding, kindsForPeople, planPeopleNew, planPeopleWrite, planSource, snapFromSheet, snapPeople, timeCols, type SourceBinding } from '../src/shared/sources';
import { personalFromCell } from '../src/shared/personal';
import { Workbook } from '../src/main/xlsx';
import { readBook, writeSource } from '../src/main/sources';
import { fakeState } from './fixtures';

const D = '2026-11-03';
const ctx = { today: D, newId: () => 'z' };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const IBAN = 'GR1601101250000000012300695';
const BASE = ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΚΙΝΗΤΟ', 'ΘΑΛΑΜΟΣ', 'Σ.Ι'];
const s0 = fakeState(4);
const rowOf = (p: AppState['people'][number], i: number, extra: unknown[] = []) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room, p.si, ...extra];
const sheetOf = (head: string[], rows: unknown[][]): RawSheet => ({ name: 'ΣΥΝΟΛΙΚΟ', rows: [head, ...rows] as RawSheet['rows'] });
const bind = (sh: RawSheet): SourceBinding => { const x = bestFor('people', [sh])!; return { file: 'Δ.xlsx', sheet: x.sheet, header: x.header, cols: x.cols, write: true }; };
const HEAD3 = [...BASE, 'IBAN', 'ΑΜΚΑ', 'ΑΦΜ'];

describe('IBAN, ΑΜΚΑ, ΑΦΜ: ανάγνωση από το Δυναμολόγιο', () => {
  it('η αντιστοίχιση βρίσκει τις στήλες από τις επικεφαλίδες (και με λατινικά)', () => {
    const sh = sheetOf([...BASE, 'IBAN', 'AMKA', 'AFM'], s0.people.map((p, i) => rowOf(p, i)));
    expect(bind(sh).cols).toMatchObject({ iban: 10, amka: 11, afm: 12 });
    expect(bind(sheetOf(HEAD3, [])).cols).toMatchObject({ iban: 10, amka: 11, afm: 12 });
  });
  it('περνούν στο άτομο, κανονικοποιημένα· το αρχικό μηδέν που έχασε ο αριθμός ξαναμπαίνει', () => {
    const rows = s0.people.map((p, i) => rowOf(p, i, i === 1 ? ['gr16 0110 1250 0000 0001 2300 695', 1020304567, 12345678] : ['', '', '']));
    const r = parseRoster([sheetOf(HEAD3, rows)]).rows;
    expect(r[1]).toMatchObject({ iban: IBAN, amka: '01020304567', afm: '012345678' });
    expect(r[0]).toMatchObject({ iban: '', amka: '', afm: '' });
    const s = run(s0, { t: 'importPeople', rows: r, source: 'Δ.xlsx', deactivateMissing: true });
    expect(s.people[1]).toMatchObject({ iban: IBAN, amka: '01020304567', afm: '012345678' });
    expect('iban' in s.people[0]).toBe(false);
  });
  it('χωρίς στήλες στο αρχείο: ό,τι έχει η εφαρμογή μένει', () => {
    let s = run(s0, { t: 'setPersonal', pid: 3, iban: IBAN });
    const rows = parseRoster([sheetOf(BASE, s0.people.map((p, i) => rowOf(p, i)))]).rows;
    expect('iban' in rows[0]).toBe(false);
    s = run(s, { t: 'importPeople', rows, source: 'Δ.xlsx', deactivateMissing: true });
    expect(s.people[2].iban).toBe(IBAN);
  });
  it('κενό κελί στη στήλη σβήνει την τιμή, και η προεπισκόπηση δεν δείχνει τα νούμερα', () => {
    const s = run(s0, { t: 'setPersonal', pid: 3, iban: IBAN, afm: '123456789' });
    const rows = parseRoster([sheetOf(HEAD3, s0.people.map((p, i) => rowOf(p, i, ['', '', ''])))]).rows;
    const ch = rosterChanges(s, rows).changes;
    expect(ch).toEqual([{ who: s.people[2].last + ' ' + s.people[2].first, what: 'IBAN άλλαξε, ΑΦΜ άλλαξε' }]);
    const t = run(s, { t: 'importPeople', rows, source: 'Δ.xlsx', deactivateMissing: true });
    expect(t.people[2].iban).toBeUndefined(); expect(t.people[2].afm).toBeUndefined();
  });
  it('personalFromCell: μόνο ΑΜΚΑ/ΑΦΜ με ένα ψηφίο λιγότερο παίρνουν μηδέν μπροστά', () => {
    expect(personalFromCell('amka', 1020304567)).toBe('01020304567');
    expect(personalFromCell('afm', '12345678')).toBe('012345678');
    expect(personalFromCell('afm', '1234567')).toBe('1234567');
    expect(personalFromCell('iban', 'gr16')).toBe('GR16');
  });
});

describe('IBAN, ΑΜΚΑ, ΑΦΜ: εγγραφή στο Δυναμολόγιο', () => {
  const sh = sheetOf(HEAD3, s0.people.map((p, i) => rowOf(p, i, ['', '', ''])));
  it('αλλαγή στην εφαρμογή γράφεται ως κείμενο στη γραμμή του ατόμου (το μηδέν μένει)', () => {
    const s = run(s0, { t: 'setPersonal', pid: 2, iban: IBAN, amka: '01020304567', afm: '012345678' });
    const b = bind(sh);
    const p = planPeopleWrite(sh, b, s, snapFromSheet(sh, b, s0.people));
    expect(p.sets).toEqual([{ r: 2, c: 10, v: IBAN }, { r: 2, c: 11, v: '01020304567' }, { r: 2, c: 12, v: '012345678' }]);
    expect(p.changed).toBe(1);
  });
  it('ήδη γραμμένο: τίποτα· σβήσιμο στην καρτέλα σβήνει το κελί', () => {
    const s = run(s0, { t: 'setPersonal', pid: 2, iban: IBAN });
    const done = sheetOf(HEAD3, s.people.map((p, i) => rowOf(p, i, [p.iban || '', '', ''])));
    const b = bind(done);
    expect(planPeopleWrite(done, b, s, snapFromSheet(done, b, s.people)).sets).toEqual([]);
    const gone = run(s, { t: 'setPersonal', pid: 2, iban: '' });
    expect(planPeopleWrite(done, b, gone, snapPeople(s.people)).sets).toEqual([{ r: 2, c: 10, v: null }]);
  });
  it('το ίδιο φύλλο με αριθμητικό ΑΜΚΑ στο Excel δεν θεωρείται αλλαγή', () => {
    const s = run(s0, { t: 'setPersonal', pid: 1, amka: '01020304567' });
    const done = sheetOf(HEAD3, s.people.map((p, i) => rowOf(p, i, ['', p.amka ? 1020304567 : '', ''])));
    const b = bind(done);
    expect(planPeopleWrite(done, b, s, snapFromSheet(done, b, s.people)).sets).toEqual([]);
  });
  it('πίνακας χωρίς τις στήλες, και κανείς δεν έχει τιμές: τίποτα δεν προστίθεται', () => {
    const plain = sheetOf(BASE, s0.people.map((p, i) => rowOf(p, i)));
    const b = bind(plain);
    expect(timeCols('people', plain, b, s0, D)).toEqual({ b, head: [] });
  });
  it('κάποιος έχει τιμές και λείπουν οι στήλες: μπαίνουν στο τέλος του πίνακα, μία φορά, και γράφονται', () => {
    const s = run(run(s0, { t: 'setPersonal', pid: 2, iban: IBAN }), { t: 'setPersonal', pid: 3, afm: '123456789' });
    const plain = sheetOf(BASE, s.people.map((p, i) => rowOf(p, i)));
    const b = bind(plain);
    const tc = timeCols('people', plain, b, s, D);
    expect(tc.head).toEqual([{ r: 0, c: 10, v: 'IBAN' }, { r: 0, c: 11, v: 'ΑΦΜ' }]);   // μόνο όσες έχουν τιμές
    expect(tc.b.cols).toMatchObject({ iban: 10, afm: 11 });
    const plan = planSource('people', plain, tc.b, s, { psnap: snapPeople(s0.people), snap: snapFromSheet(plain, b, s0.people) }, D);
    expect(plan.sets).toEqual([{ r: 2, c: 10, v: IBAN }, { r: 3, c: 11, v: '123456789' }]);
    // δεύτερη φορά με τις στήλες ήδη στο φύλλο: δεν προστίθεται τίποτα
    const had = sheetOf([...BASE, 'IBAN', 'ΑΦΜ'], s.people.map((p, i) => rowOf(p, i, [p.iban || '', p.afm || ''])));
    const b2 = bind(had);
    expect(timeCols('people', had, b2, s, D).head).toEqual([]);
  });
  it('μη ενεργός δεν φέρνει στήλες· το κενό δίπλα στον πίνακα παραλείπεται αν η στήλη είναι πιασμένη', () => {
    const s = run(s0, { t: 'setPersonal', pid: 2, iban: IBAN });
    const off = { ...s, people: s.people.map(p => (p.id === 2 ? { ...p, active: false } : p)) };
    const plain = sheetOf(BASE, s.people.map((p, i) => rowOf(p, i)));
    expect(timeCols('people', plain, bind(plain), off, D).head).toEqual([]);
    const busy = sheetOf(BASE, s.people.map((p, i) => rowOf(p, i, i === 0 ? ['κάτι δικό σου'] : [])));
    expect(timeCols('people', busy, bind(busy), s, D).head).toEqual([{ r: 0, c: 11, v: 'IBAN' }]);
  });
  it('νέο Δυναμολόγιο: οι στήλες μπαίνουν μόνο όταν υπάρχουν τιμές, και γράφονται οι τιμές', () => {
    const b0 = defaultBinding('people', 'Δ.xlsx');
    expect(Object.keys(b0.cols)).not.toContain('iban');
    const s = run(s0, { t: 'setPersonal', pid: 1, amka: '01020304567' });
    const tc = timeCols('people', null, b0, s, D);
    expect(tc.b.cols.amka).toBeGreaterThan(Math.max(...Object.values(b0.cols)));
    const plan = planPeopleNew(tc.b, s);
    expect(plan.header.some(h => h.v === 'ΑΜΚΑ')).toBe(true);
    expect(plan.sets).toContainEqual({ r: tc.b.header + 1, c: tc.b.cols.amka, v: '01020304567' });
  });
});

describe('IBAN, ΑΜΚΑ, ΑΦΜ: πότε ξαναγράφεται το Δυναμολόγιο', () => {
  it('αλλαγή στην καρτέλα βάζει το Δυναμολόγιο στην ουρά, ακόμα κι αν δεν έχει ακόμα τις στήλες', () => {
    const s = run(s0, { t: 'setPersonal', pid: 2, iban: IBAN });
    const src = { people: { file: 'Δ.xlsx', sheet: 'ΣΥΝΟΛΙΚΟ', header: 0, cols: { last: 3, first: 4 }, write: true } };
    expect([...kindsForPeople(s0.people, s.people, src)]).toEqual(['people']);
  });
});

describe('IBAN, ΑΜΚΑ, ΑΦΜ: αληθινό αρχείο Excel', () => {
  it('γράφεται, οι στήλες μπαίνουν με επικεφαλίδα, ξαναδιαβάζεται χωρίς αλλαγές (και το μηδέν μένει)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-pers-')); const file = path.join(dir, 'ΔΥΝΑΜΟΛΟΓΙΟ.xlsx');
    const wb = await Workbook.blank('ΣΥΝΟΛΙΚΟ'); const ws = await wb.sheet('ΣΥΝΟΛΙΚΟ');
    const L = (c: number) => String.fromCharCode(65 + c);
    BASE.forEach((h, c) => ws.set(L(c) + '1', h).setStyle(L(c) + '1', 1));
    s0.people.forEach((p, i) => rowOf(p, i).forEach((v, c) => ws.set(L(c) + (i + 2), v as string | number)));
    fs.writeFileSync(file, await wb.save());
    const b: SourceBinding = { file, sheet: 'ΣΥΝΟΛΙΚΟ', header: 0, cols: { aa: 0, rank: 1, spec: 2, last: 3, first: 4, father: 5, asm: 6, phone: 7, room: 8, si: 9 }, write: false };
    const s = run(s0, { t: 'setPersonal', pid: 2, iban: IBAN, amka: '01020304567', afm: '012345678' });
    const w = await writeSource('people', b, s, undefined, D);
    expect(w.ok && w.binding?.cols).toMatchObject({ iban: 10, amka: 11, afm: 12 });
    if (!w.ok) return;
    const rows = (await readBook(file)).sheets[0].rows;
    expect(rows[0].slice(10, 13)).toEqual(['IBAN', 'ΑΜΚΑ', 'ΑΦΜ']);
    expect(rows[2].slice(10, 13).map(String)).toEqual([IBAN, '01020304567', '012345678']);
    expect(rows[1].slice(10, 13).filter(v => v != null && v !== '')).toEqual([]);
    // ξαναδιάβασμα με την αντιστοίχιση που κράτησε η εφαρμογή: τίποτα δεν αλλάζει
    const r = parseRoster([{ name: 'ΣΥΝΟΛΙΚΟ', rows }], { main: { sheet: 'ΣΥΝΟΛΙΚΟ', header: 0, cols: w.binding!.cols } }).rows;
    expect(rosterChanges(s, r)).toEqual({ changes: [], same: 4 });
    expect(r[1]).toMatchObject({ iban: IBAN, amka: '01020304567', afm: '012345678' });
  });
});
