// E-mail, e-mail συγγενή, ομάδα αίματος στο φύλλο ΘΑΛΑΜΟΙ και σύνολα κάτω από το ΣΥΝΟΛΙΚΟ. Μόνο ψεύτικα στοιχεία.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { parseRoster, type RawSheet } from '../src/shared/roster';
import { normBlood } from '../src/shared/personal';
import { planRoomExtras, withRoomExtras } from '../src/shared/roomExtra';
import { planTotals } from '../src/shared/totals';
import { sheetTotals } from '../src/shared/strengthView';
import { guessField, FIELDS } from '../src/shared/reports';
import { Workbook } from '../src/main/xlsx';
import { readBook, writeSource } from '../src/main/sources';
import type { SourceBinding } from '../src/shared/sources';
import { fakeState } from './fixtures';

const D = '2026-11-03';
const ctx = { today: D, newId: () => 'z' };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const s0 = fakeState(4);

describe('ομάδα αίματος', () => {
  it('κανονικοποιείται από λατινικά/ελληνικά, κενά, λέξεις', () => {
    const t: [string, string][] = [['A+', 'Α+'], ['a +', 'Α+'], ['ΑΒ-', 'ΑΒ-'], ['AB neg', 'ΑΒ-'], ['o+', '0+'], ['Ο θετικό', '0+'], ['0 ΑΡΝΗΤΙΚΟ', '0-'], ['Β Θετικο', 'Β+'], ['B−', 'Β-'], ['', ''], ['άγνωστο', 'ΑΓΝΩΣΤΟ'], ['Α', 'Α']];
    for (const [a, b] of t) expect(normBlood(a), a).toBe(b);
  });
});

describe('καρτέλα και Έντυπα', () => {
  it('setPersonal κρατά τα e-mail όπως γράφτηκαν, κανονικοποιεί ομάδα, σβήνει με κενό', () => {
    let s = run(s0, { t: 'setPersonal', pid: 2, email: ' Nikos@Mail.gr ', relEmail: 'pateras@mail.gr', blood: 'ab +' });
    expect(s.people[1]).toMatchObject({ email: 'Nikos@Mail.gr', relEmail: 'pateras@mail.gr', blood: 'ΑΒ+' });
    s = run(s, { t: 'setPersonal', pid: 2, email: '' });
    expect('email' in s.people[1]).toBe(false);
    expect('email' in s0.people[0]).toBe(false);
  });
  it('στήλες Εντύπων και αυτόματη αναγνώριση επικεφαλίδων', () => {
    expect(FIELDS.people.map(f => f.k)).toEqual(expect.arrayContaining(['email', 'relEmail', 'blood']));
    expect(guessField('people', 'E-mail')).toBe('email');
    expect(guessField('people', 'E-MAIL ΣΥΓΓΕΝΙΚΟΥ ΠΡΟΣΩΠΟΥ')).toBe('relEmail');
    expect(guessField('people', 'Ομάδα αίματος')).toBe('blood');
  });
});

const HEAD = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Κινητό Τηλέφωνο', 'E-mail', 'E-mail συγγενικού προσώπου', 'Νούμερο παραλλαγής', 'Ομάδα αίματος'];
const roomSheet = (cells: Record<number, [string, string, string]>, nPar = 'Χ'): RawSheet => ({
  name: 'ΘΑΛΑΜΟΙ',
  rows: [['ΔΥΝΑΜΟΛΟΓΙΟ 1ου ΘΑΛΑΜΟΥ'], HEAD, ...s0.people.map((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, ...(cells[p.id] || ['', '', '']).slice(0, 2), nPar, (cells[p.id] || ['', '', ''])[2]])] as RawSheet['rows']
});

describe('ΘΑΛΑΜΟΙ: ανάγνωση και σχέδιο εγγραφής', () => {
  const main: RawSheet = { name: 'ΣΥΝΟΛΙΚΟ', rows: [['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΚΙΝΗΤΟ', 'ΘΑΛΑΜΟΣ', 'Σ.Ι'], ...s0.people.map((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room, p.si])] as RawSheet['rows'] };
  it('διαβάζει τις τρεις τιμές, κενό σβήνει, αγνοεί το νούμερο παραλλαγής', () => {
    const rs = roomSheet({ 2: ['A@b.gr', 'p@b.gr', 'o neg'] });
    const rows = withRoomExtras(parseRoster([main]).rows, [main, rs], 'ΣΥΝΟΛΙΚΟ');
    expect(rows[1]).toMatchObject({ email: 'A@b.gr', relEmail: 'p@b.gr', blood: '0-' });
    expect(rows[0]).toMatchObject({ email: '', relEmail: '', blood: '' });
    expect('παραλλαγής' in rows[1]).toBe(false);
    const s = run(run(s0, { t: 'setPersonal', pid: 1, email: 'x@y.gr' }), { t: 'importPeople', rows, source: 'Δ', deactivateMissing: true });
    expect(s.people[1]).toMatchObject({ email: 'A@b.gr', blood: '0-' });
    expect('email' in s.people[0]).toBe(false);
  });
  it('χωρίς τέτοιες στήλες δεν αλλάζει τίποτα', () => {
    const rs: RawSheet = { name: 'ΘΑΛΑΜΟΙ', rows: [['ΔΥΝΑΜΟΛΟΓΙΟ 1ου ΘΑΛΑΜΟΥ'], HEAD.slice(0, 8), ...s0.people.map((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone])] as RawSheet['rows'] };
    const r0 = parseRoster([main]).rows;
    expect(withRoomExtras(r0, [main, rs], 'ΣΥΝΟΛΙΚΟ')).toEqual(r0);
    expect(planRoomExtras(rs, s0.people)).toEqual([]);
  });
  it('γράφει μόνο ό,τι διαφέρει· κενό στην εφαρμογή σβήνει το κελί', () => {
    const s = run(s0, { t: 'setPersonal', pid: 2, email: 'A@b.gr', blood: 'Α+' });
    const rs = roomSheet({ 2: ['', '', 'A +'], 3: ['old@x.gr', '', ''] });
    const sets = planRoomExtras(rs, s.people, { 3: { email: 'old@x.gr', relEmail: '', blood: '' } });
    expect(sets).toContainEqual({ r: 3, c: 8, v: 'A@b.gr' });
    expect(sets).toContainEqual({ r: 4, c: 8, v: null });
    expect(sets.length).toBe(2);   // το «A +» είναι ήδη Α+, το νούμερο παραλλαγής (στήλη 10) δεν ακουμπιέται
    expect(sets.some(x => x.c === 10)).toBe(false);
  });
});

describe('αληθινό αρχείο: ΘΑΛΑΜΟΙ και σύνολα', () => {
  it('γράφονται τα σύνολα (όχι πάνω σε τύπους) και τα e-mail στο ΘΑΛΑΜΟΙ', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-rx-')); const file = path.join(dir, 'Δ.xlsx');
    const wb = await Workbook.blank('ΣΥΝΟΛΙΚΟ'); const ws = await wb.sheet('ΣΥΝΟΛΙΚΟ');
    const L = (c: number) => String.fromCharCode(65 + c);
    const BASE = ['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΚΙΝΗΤΟ', 'ΘΑΛΑΜΟΣ', 'Σ.Ι'];
    BASE.forEach((h, c) => ws.set(L(c) + '1', h));
    s0.people.forEach((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room, p.si].forEach((v, c) => ws.set(L(c) + (i + 2), v as string | number)));
    ws.set('D8', 'ΣΥΝΟΛΟ'); ws.set('F8', 4);
    ws.set('E9', '1.ΠΑΡΟΝΤΕΣ : '); ws.setFormula('F9', 'F8-F11');
    ws.set('E10', 'ΣΤΕΠ :'); ws.set('F10', 0);
    ws.set('D11', '2.ΑΠΟΝΤΕΣ ->'); ws.setFormula('F11', 'SUM(F12:F14)');
    ws.set('D12', 'ΑΝΑΡΡΩΤΙΚΕΣ ΑΔΕΙΕΣ'); ws.set('F12', 0);
    ws.set('D13', ' ΑΔΕΙΕΣ'); ws.set('F13', 0);
    ws.set('D14', 'ΕΙΣΑΓΩΓΕΣ ΝΟΣΟΚΟΜΕΙΟ '); ws.set('F14', 0);
    ws.set('D16', 'ΣΤΕΠ'); ws.set('F16', 'ΚΕΙΜΕΝΟ');   // δεύτερη ετικέτα: δεν αγγίζεται (μόνο η πρώτη)
    const w2 = await wb.addSheet('ΘΑΛΑΜΟΙ');
    w2.set('A1', 'ΔΥΝΑΜΟΛΟΓΙΟ 1ου ΘΑΛΑΜΟΥ');
    HEAD.forEach((h, c) => w2.set(L(c) + '2', h));
    s0.people.forEach((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone].forEach((v, c) => w2.set(L(c) + (i + 3), v as string | number)));
    w2.set('K4', 'ΑΡ7');
    fs.writeFileSync(file, await wb.save());
    const b: SourceBinding = { file, sheet: 'ΣΥΝΟΛΙΚΟ', header: 0, cols: { aa: 0, rank: 1, spec: 2, last: 3, first: 4, father: 5, asm: 6, phone: 7, room: 8, si: 9 }, write: false };
    const st = (id: number, type: string) => ({ id: 's' + id + type, pid: id, type, from: D, to: D, note: '' }) as never;
    let s = run(s0, { t: 'setPersonal', pid: 2, email: 'A@b.gr', relEmail: 'p@b.gr', blood: 'ΑΒ+' });
    s = { ...s, statuses: [st(1, 'STEP'), st(2, 'SICK'), st(3, 'LEAVE'), st(4, 'NOS')] } as AppState;
    const t = sheetTotals(s, D, 600);
    expect(t).toEqual({ step: 1, sick: 1, leave: 1, hosp: 1 });
    const w = await writeSource('people', b, s, undefined, D, { at: 600 });
    expect(w.ok, JSON.stringify(w)).toBe(true);
    const book = await readBook(file);
    const fxs = new Set<string>(); const main = await (await Workbook.open(fs.readFileSync(file))).values('ΣΥΝΟΛΙΚΟ', 100, 40, fxs);
    expect([main[9][5], main[11][5], main[12][5], main[13][5]]).toEqual([1, 1, 1, 1]);
    expect(main[15][5]).toBe('ΚΕΙΜΕΝΟ');
    expect(fxs.has('8:5') && fxs.has('10:5')).toBe(true);
    const rooms = book.sheets.find(x => x.name === 'ΘΑΛΑΜΟΙ')!.rows;
    expect(rooms[3].slice(8, 12)).toEqual(['A@b.gr', 'p@b.gr', 'ΑΡ7', 'ΑΒ+']);
    // δεύτερη εγγραφή: τίποτα να αλλάξει
    const w3 = await writeSource('people', b, s, undefined, D, { at: 600 });
    expect(w3.ok && w3.unchanged).toBe(true);
  });
});

describe('ΘΑΛΑΜΟΙ: προστασία με βάση τον τελευταίο συγχρονισμό', () => {
  const snap = (email: string) => ({ 2: { email, relEmail: '', blood: '' } });
  it('πρώτη εγγραφή: μη κενό κελί με κενή τιμή στην εφαρμογή μένει όπως είναι (και χωρίς βάση)', () => {
    const rs = roomSheet({ 2: ['mine@x.gr', '', ''] });
    expect(planRoomExtras(rs, s0.people)).toEqual([]);
    expect(planRoomExtras(rs, s0.people, {})).toEqual([]);
    // με άλλη τιμή στην εφαρμογή και χωρίς βάση: πάλι δεν γράφεται πάνω
    expect(planRoomExtras(rs, run(s0, { t: 'setPersonal', pid: 2, email: 'app@x.gr' }).people)).toEqual([]);
  });
  it('κενό κελί + τιμή στην εφαρμογή: γράφεται', () => {
    const s = run(s0, { t: 'setPersonal', pid: 2, email: 'app@x.gr' });
    expect(planRoomExtras(roomSheet({}), s.people)).toEqual([{ r: 3, c: 8, v: 'app@x.gr' }]);
  });
  it('σβήσιμο στην εφαρμογή μετά από συγχρονισμό σβήνει το κελί', () => {
    const rs = roomSheet({ 2: ['old@x.gr', '', ''] });
    expect(planRoomExtras(rs, s0.people, snap('old@x.gr'))).toEqual([{ r: 3, c: 8, v: null }]);
  });
  it('αλλαγή στο Excel μετά από συγχρονισμό: δεν γράφεται πάνω και περνά με την εισαγωγή', () => {
    const rs = roomSheet({ 2: ['new@x.gr', '', ''] });
    const s = run(s0, { t: 'setPersonal', pid: 2, email: 'old@x.gr' });
    expect(planRoomExtras(rs, s.people, snap('old@x.gr'))).toEqual([]);
    const main: RawSheet = { name: 'ΣΥΝΟΛΙΚΟ', rows: [['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΚΙΝΗΤΟ', 'ΘΑΛΑΜΟΣ', 'Σ.Ι'], ...s0.people.map((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room, p.si])] as RawSheet['rows'] };
    const rows = (psnap: Record<number, Record<string, string>>, app = s.people) => withRoomExtras(parseRoster([main]).rows, [main, rs], 'ΣΥΝΟΛΙΚΟ', app, psnap);
    expect(rows(snap('old@x.gr'))[1].email).toBe('new@x.gr');
    // και οι δύο άλλαξαν: μένει της εφαρμογής
    const s2 = run(s0, { t: 'setPersonal', pid: 2, email: 'app@x.gr' });
    expect('email' in rows(snap('old@x.gr'), s2.people)[1]).toBe(false);
    // χωρίς βάση: περνά η μη κενή τιμή του Excel· κενό κελί δεν σβήνει
    expect(rows({})[1].email).toBe('new@x.gr');
    expect('email' in withRoomExtras(parseRoster([main]).rows, [main, roomSheet({})], 'ΣΥΝΟΛΙΚΟ', s.people, {})[1]).toBe(false);
  });
});

describe('σύνολα: σχέδιο', () => {
  const sh = (rows: unknown[][]): RawSheet => ({ name: 'ΣΥΝΟΛΙΚΟ', rows: rows as RawSheet['rows'] });
  const T = { step: 2, sick: 3, leave: 4, hosp: 5 };
  it('τύποι μένουν, ετικέτες που λείπουν δεν γράφουν τίποτα', () => {
    const rows = [[], [], ['', '', '', 'ΣΥΝΟΛΟ', '', 9], ['', '', '', '', 'ΣΤΕΠ :', 0], ['', '', '', 'ΑΔΕΙΕΣ', '', 0], ['', '', '', 'ΝΟΣΟΚΟΜΕΙΟ', '', 7]];
    expect(planTotals(sh(rows), T, 2, () => false)).toEqual([{ r: 3, c: 5, v: 2 }, { r: 4, c: 5, v: 4 }, { r: 5, c: 5, v: 5 }]);
    expect(planTotals(sh(rows), T, 2, (r, c) => r === 4 && c === 5)).toEqual([{ r: 3, c: 5, v: 2 }, { r: 5, c: 5, v: 5 }]);
    expect(planTotals(sh([[], ['x', 'y']]), T, 0, () => false)).toEqual([]);
  });
});
