// «Νέος στρατιώτης» από την εφαρμογή: μπαίνει σε νέα γραμμή στο Δυναμολόγιο κάτω από τον τελευταίο, με τη μορφή της
// γραμμής από πάνω, και τα σύνολα που μετράνε ως τον τελευταίο τον μετράνε κι αυτόν. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { apply, type Command, type Ctx, type NewPerson } from '../src/shared/commands';
import type { AppState, Person } from '../src/shared/domain';
import { parseRoster, type RawSheet } from '../src/shared/roster';
import { bestFor, planPeopleWrite, snapFromSheet, type SourceBinding } from '../src/shared/sources';
import { Workbook, growFormula } from '../src/main/xlsx';
import { readBook, writeSource, type SourceMeta } from '../src/main/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-13';
const ctx: Ctx = { today: TODAY, newId: () => 'x' };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const NEW: NewPerson = { rank: 'στρ', spec: 'πζ', last: ' Καινούργιος ', first: 'Νέος', father: 'Πατέρας', asm: '9 1 0 0 0 1', phone: '6900 000 999', room: 9, si: 'ι1', post: null, role: null, essos: '2026 Γ΄', attached: false, notes: '' };
const HEAD = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Κινητό Τηλέφωνο', 'ΘΑΛΑΜΟΣ', 'Σ.Ι', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'];
const pr = (p: Person, i: number) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, Number(p.asm), Number(p.phone), p.room, p.si, null];
const META = { keys: [], at: 'x', mtime: 0, size: 0 } as unknown as SourceMeta;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-new-'));

describe('εντολή «Νέος στρατιώτης»', () => {
  it('μπαίνει σε δύναμη με τον επόμενο αριθμό, γραμμένος όπως τον γράφει η εισαγωγή του Δυναμολογίου', () => {
    const s = run(fakeState(4), { t: 'addPerson', person: NEW });
    const p = s.people[s.people.length - 1];
    expect(p).toMatchObject({ id: 5, active: true, added: true, rank: 'ΣΤΡ', spec: 'ΠΖ', last: 'ΚΑΙΝΟΥΡΓΙΟΣ', first: 'ΝΕΟΣ', father: 'ΠΑΤΕΡΑΣ', asm: '910001', phone: '6900000999', room: 9, si: 'Ι1' });
  });
  it('χωρίς επώνυμο/όνομα, ή με ΑΣΜ ή ονοματεπώνυμο και πατρώνυμο που υπάρχουν ήδη: δεν μπαίνει', () => {
    const s = fakeState(4);
    expect(() => apply(s, { t: 'addPerson', person: { ...NEW, first: ' ' } }, ctx)).toThrow(/επώνυμο και όνομα/);
    expect(() => apply(s, { t: 'addPerson', person: { ...NEW, asm: s.people[1].asm } }, ctx)).toThrow(/ΑΣΜ/);
    expect(() => apply(s, { t: 'addPerson', person: { ...NEW, asm: '', last: s.people[2].last.toLowerCase(), first: s.people[2].first, father: s.people[2].father } }, ctx)).toThrow(/Υπάρχει ήδη/);
  });
  it('η εισαγωγή του Δυναμολογίου τον βρίσκει και δεν είναι πια «νέος»· αν λείπει από το αρχείο βγαίνει εκτός δύναμης', () => {
    const s0 = run(fakeState(4), { t: 'addPerson', person: NEW });
    const rows = (people: Person[]) => parseRoster([{ name: 'ΣΥΝΟΛΙΚΟ', rows: [HEAD, ...people.map(pr)] }]).rows;
    const s1 = run(s0, { t: 'importPeople', rows: rows(s0.people), source: 'Δ.xlsm', deactivateMissing: true });
    expect(s1.people.find(p => p.id === 5)).toMatchObject({ active: true }); expect('added' in s1.people.find(p => p.id === 5)!).toBe(false);
    const s2 = run({ ...s0, statuses: [{ id: 'a', pid: 5, type: 'EY', from: TODAY, to: TODAY }] }, { t: 'importPeople', rows: rows(s0.people.slice(0, 4)), source: 'Δ.xlsm', deactivateMissing: true });
    expect(s2.people.find(p => p.id === 5)).toMatchObject({ active: false }); expect('added' in s2.people.find(p => p.id === 5)!).toBe(false);
  });
});

describe('σχέδιο εγγραφής στο Δυναμολόγιο', () => {
  const s0 = fakeState(4);
  const sheetOf = (people: Person[], below: unknown[][] = []): RawSheet => ({ name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΔΥΝΑΜΟΛΟΓΙΟ'], ['ΣΥΝΟΛΙΚΟ'], HEAD, ...people.map(pr), ...below] as RawSheet['rows'] });
  const bind = (sh: RawSheet): SourceBinding => { const x = bestFor('people', [sh])!; return { file: 'Δ.xlsm', sheet: x.sheet, header: x.header, cols: x.cols, write: true }; };

  it('στην πρώτη κενή γραμμή κάτω από τον τελευταίο, με Α/Α· αφήνει μία κενή πριν από τα σύνολα', () => {
    const sh = sheetOf(s0.people, [[], [], [], [null, null, null, 'ΘΑΛΑΜΟΣ 1', null, 3]]);
    const b = bind(sh); const s = run(s0, { t: 'addPerson', person: NEW });
    const p = planPeopleWrite(sh, b, s, snapFromSheet(sh, b, s.people));
    expect(p.inserts).toEqual([]); expect(p.added).toBe(1); expect(p.keys).toEqual(['5']);
    const row = Object.fromEntries(p.sets.filter(x => x.r === 7).map(x => [x.c, x.v]));
    expect(row).toEqual({ 0: 5, 1: 'ΣΤΡ', 2: 'ΠΖ', 3: 'ΚΑΙΝΟΥΡΓΙΟΣ', 4: 'ΝΕΟΣ', 5: 'ΠΑΤΕΡΑΣ', 6: 910001, 7: 6900000999, 8: 9, 9: 'Ι1' });
    expect(p.grow).toEqual({ from: 3, last: 7, to: 8 });
    // δύο νέοι: η τρίτη κενή μένει, ο δεύτερος παίρνει τη δεύτερη
    const s2 = run(s, { t: 'addPerson', person: { ...NEW, last: 'ΔΕΥΤΕΡΟΣ', asm: '910002' } });
    const p2 = planPeopleWrite(sh, b, s2, snapFromSheet(sh, b, s2.people));
    expect([...new Set(p2.sets.map(x => x.r))]).toEqual([7, 8]); expect(p2.inserts).toEqual([]);
    const s3 = run(s2, { t: 'addPerson', person: { ...NEW, last: 'ΤΡΙΤΟΣ', asm: '910003' } });
    const p3 = planPeopleWrite(sh, b, s3, snapFromSheet(sh, b, s3.people));
    expect(p3.inserts).toEqual([{ after: 8, n: 1, tpl: 6 }]); expect(p3.grow).toEqual({ from: 3, last: 7, to: 10 });
  });
  it('ήδη γραμμένος με το χέρι, εκτός δύναμης, ή χωρίς «νέος»: καμία νέα γραμμή', () => {
    const s = run(s0, { t: 'addPerson', person: NEW }); const me = s.people[4];
    const sh = sheetOf(s.people); const b = bind(sh);
    expect(planPeopleWrite(sh, b, s, {}).sets).toEqual([]);
    const sh0 = sheetOf(s0.people); const b0 = bind(sh0);
    expect(planPeopleWrite(sh0, b0, { ...s, people: [...s0.people, { ...me, active: false }] }, snapFromSheet(sh0, b0, s0.people)).sets).toEqual([]);
    expect(planPeopleWrite(sh0, b0, { ...s, people: [...s0.people, { ...me, added: undefined }] }, snapFromSheet(sh0, b0, s0.people)).sets).toEqual([]);
  });
  it('συνονόματος με άλλο πατρώνυμο: δεν τον μπερδεύει με αυτόν, μπαίνει νέα γραμμή', () => {
    const s = run(s0, { t: 'addPerson', person: { ...NEW, asm: '', last: s0.people[0].last, first: s0.people[0].first, father: 'ΑΛΛΟΣ' } });
    const sh = sheetOf(s0.people); const b = bind(sh);
    const p = planPeopleWrite(sh, b, s, snapFromSheet(sh, b, s.people));
    expect(p.added).toBe(1); expect(p.sets.every(x => x.r === 7)).toBe(true);
  });
});

// Ένα Δυναμολόγιο σαν του λοχία: πλαίσια στις γραμμές των ατόμων, κενές από κάτω, σύνολα θαλάμων με COUNTIF ως τον
// τελευταίο, και άλλο φύλλο που μετράει από το ΣΥΝΟΛΙΚΟ
async function dynFile(people: Person[], blanks: number): Promise<{ file: string; b: SourceBinding }> {
  const file = path.join(tmp(), 'Δ.xlsm'); const wb = await Workbook.blank('ΣΥΝΟΛΙΚΟ'); const ws = await wb.sheet('ΣΥΝΟΛΙΚΟ');
  const rows = [['ΔΥΝΑΜΟΛΟΓΙΟ'], ['ΣΥΝΟΛΙΚΟ'], HEAD, ...people.map(pr)];
  rows.forEach((row, r) => row.forEach((v, c) => {
    const ref = String.fromCharCode(65 + c) + (r + 1);
    if (v != null && v !== '') ws.set(ref, v as string | number);
    if (r >= 3) ws.setStyle(ref, 2);
  }));
  const o = await wb.addSheet('ΣΥΝΟΛΑ'); o.set('A1', 'ΣΥΝΟΛΟ');
  const zip = await JSZip.loadAsync(await wb.save());
  const last = 3 + people.length, t = last + blanks + 1;
  const x1 = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  zip.file('xl/worksheets/sheet1.xml', x1.replace('</sheetData>', `<row r="${t}"><c r="D${t}" t="inlineStr"><is><t>ΘΑΛΑΜΟΣ 1</t></is></c><c r="F${t}"><f>COUNTIF(I4:I${last}, "1")</f><v>1</v></c><c r="G${t}"><f>COUNTIF(I5:I${last}, "1")</f><v>1</v></c></row></sheetData>`));
  const n2 = Object.keys(zip.files).find(n => /worksheets\/sheet.*\.xml$/.test(n) && n !== 'xl/worksheets/sheet1.xml')!;
  const x2 = await zip.file(n2)!.async('string');
  zip.file(n2, x2.replace('</sheetData>', `<row r="2"><c r="A2"><f>COUNTA(ΣΥΝΟΛΙΚΟ!D4:D${last})+COUNTA(D4:D${last})</f><v>${people.length}</v></c></row></sheetData>`));
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
  const x = bestFor('people', (await readBook(file)).sheets)!;
  return { file, b: { file, sheet: x.sheet, header: x.header, cols: x.cols, write: true } };
}
const formulas = async (file: string, sheet: string) => { const ws = await (await Workbook.open(fs.readFileSync(file))).sheet(sheet); const out: Record<string, string> = {}; for (const c of ws.cells()) if (c.inner.includes('<f')) out[String.fromCharCode(64 + c.c) + c.r] = ws.formula(String.fromCharCode(64 + c.c) + c.r)!; return out; };
const styleOf = async (file: string, ref: string) => (await (await Workbook.open(fs.readFileSync(file))).sheet('ΣΥΝΟΛΙΚΟ')).style(ref);

describe('εγγραφή στο αρχείο', () => {
  it('νέα γραμμή κάτω από τον τελευταίο με τη μορφή του, τα σύνολα τον μετράνε, και η αναίρεση αδειάζει τη γραμμή', async () => {
    const s0 = fakeState(6); const { file, b } = await dynFile(s0.people, 4);
    const s = run(s0, { t: 'addPerson', person: NEW });
    const w = await writeSource('people', b, s, META, TODAY);
    if (!w.ok) throw new Error(w.error);
    expect([w.added, w.changed, w.rooms]).toEqual([1, 0, undefined]);
    const rows = (await readBook(file)).sheets[0].rows;
    expect(rows[9].slice(0, 10)).toEqual([7, 'ΣΤΡ', 'ΠΖ', 'ΚΑΙΝΟΥΡΓΙΟΣ', 'ΝΕΟΣ', 'ΠΑΤΕΡΑΣ', 910001, 6900000999, 9, 'Ι1']);
    for (const c of 'ABCDEFGHIJK') expect(await styleOf(file, c + '10'), c).toBe(await styleOf(file, c + '9'));
    // COUNTIF από την πρώτη γραμμή ως τον τελευταίο μεγαλώνει (και στο άλλο φύλλο)· από τη μέση της λίστας όχι
    expect(await formulas(file, 'ΣΥΝΟΛΙΚΟ')).toEqual({ F14: 'COUNTIF(I4:I10, "1")', G14: 'COUNTIF(I5:I9, "1")' });
    expect(await formulas(file, 'ΣΥΝΟΛΑ')).toEqual({ A2: 'COUNTA(ΣΥΝΟΛΙΚΟ!D4:D10)+COUNTA(D4:D9)' });
    // δεύτερη φορά: τίποτα· διόρθωση του νέου πάει στη γραμμή του
    const m1 = { ...META, ...w.meta } as SourceMeta;
    const again = await writeSource('people', b, s, m1, TODAY);
    expect(again.ok && again.unchanged).toBe(true);
    const s2 = run(s, { t: 'updatePerson', person: { ...s.people[6], phone: '6900000111' } });
    const w2 = await writeSource('people', b, s2, m1, TODAY); if (!w2.ok) throw new Error(w2.error);
    expect([w2.added, w2.changed]).toEqual([0, 1]);
    expect((await readBook(file)).sheets[0].rows[9][7]).toBe(6900000111);
    // αναίρεση της προσθήκης: η γραμμή αδειάζει (μένει ο Α/Α), οι άλλοι δεν αλλάζουν
    const w3 = await writeSource('people', b, s0, { ...m1, ...w2.meta } as SourceMeta, TODAY); if (!w3.ok) throw new Error(w3.error);
    expect(w3.cleared).toBe(1); expect(w3.meta.keys).toEqual([]);
    const after = (await readBook(file)).sheets[0].rows;
    expect(after[9].slice(1, 10).every(v => v == null)).toBe(true);
    expect(after[8][3]).toBe(s0.people[5].last);
  });
  it('χωρίς κενές γραμμές πριν από τα σύνολα: μπαίνει γραμμή, τα σύνολα κατεβαίνουν και μετράνε και τον νέο', async () => {
    const s0 = fakeState(6); const { file, b } = await dynFile(s0.people, 1);
    const s = run(s0, { t: 'addPerson', person: NEW });
    const w = await writeSource('people', b, s, META, TODAY);
    if (!w.ok) throw new Error(w.error);
    const rows = (await readBook(file)).sheets[0].rows;
    expect(rows[9][3]).toBe('ΚΑΙΝΟΥΡΓΙΟΣ'); expect(rows[10].some(v => v != null && v !== '')).toBe(false); expect(rows[11][3]).toBe('ΘΑΛΑΜΟΣ 1');
    expect(await formulas(file, 'ΣΥΝΟΛΙΚΟ')).toEqual({ F12: 'COUNTIF(I4:I10, "1")', G12: 'COUNTIF(I5:I9, "1")' });
    expect(await formulas(file, 'ΣΥΝΟΛΑ')).toEqual({ A2: 'COUNTA(ΣΥΝΟΛΙΚΟ!D4:D10)+COUNTA(D4:D9)' });
    expect(await styleOf(file, 'D10')).toBe(await styleOf(file, 'D9'));
  });
  it('με φύλλο ΘΑΛΑΜΟΙ χωρίς πίνακα για τον θάλαμό του: θυμίζει να γραφτεί και εκεί', async () => {
    const s0 = fakeState(4); const { file, b } = await dynFile(s0.people, 3);
    const wb = await Workbook.open(fs.readFileSync(file)); (await wb.addSheet('ΘΑΛΑΜΟΙ')).set('A1', 'ΘΑΛΑΜΟΣ 1'); fs.writeFileSync(file, await wb.save());
    const w = await writeSource('people', b, run(s0, { t: 'addPerson', person: NEW }), META, TODAY);
    expect(w.ok && w.rooms).toEqual({ n: 0, added: 1, placed: 0, sheet: 'ΘΑΛΑΜΟΙ' });
  });
});

describe('growFormula', () => {
  it('μόνο περιοχές του ίδιου φύλλου που ξεκινούν από την αρχή της λίστας και σταματούν στον τελευταίο', () => {
    expect(growFormula('SUM($I$4:$I$9)+I4+COUNTIF(I4:I8,"I4:I9")', 'Α', true, 3, 9, 11)).toBe('SUM($I$4:$I$11)+I4+COUNTIF(I4:I8,"I4:I9")');
    expect(growFormula('COUNTA(Α!D3:D9)+COUNTA(D4:D9)', 'Α', false, 3, 9, 10)).toBe('COUNTA(Α!D3:D10)+COUNTA(D4:D9)');
    expect(growFormula('SUM(D2:D9)', 'Α', true, 3, 9, 10)).toBe('SUM(D2:D9)');
  });
});

// Δυναμολόγιο ομαδοποιημένο ανά θάλαμο: θαλαμάρχης πρώτος, οι υπόλοιποι αλφαβητικά
const ROOMED: [string, number][] = [['ΤΥΧΑΙΟΣ', 1], ['ΔΟΚΙΜΙΟΣ', 1], ['ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ', 1], ['ΥΠΟΘΕΤΙΔΗΣ', 1], ['ΑΓΝΩΣΤΟΠΟΥΛΟΣ', 2], ['ΦΑΝΤΑΣΙΟΣ', 2], ['ΔΕΙΓΜΑΤΑΣ', 4], ['ΠΛΑΣΜΑΤΙΚΟΣ', 4]];
const roomed = (): AppState => { const s = fakeState(ROOMED.length); s.people = s.people.map((p, i) => ({ ...p, last: ROOMED[i][0], room: ROOMED[i][1] })); return s; };
const add = (s: AppState, last: string, room: number, asm: string) => run(s, { t: 'addPerson', person: { ...NEW, last, room, asm } });

describe('στον θάλαμό του', () => {
  const sheetOf = (people: Person[]): RawSheet => ({ name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΔΥΝΑΜΟΛΟΓΙΟ'], ['ΣΥΝΟΛΙΚΟ'], HEAD, ...people.map(pr)] as RawSheet['rows'] });
  const bind = (sh: RawSheet): SourceBinding => { const x = bestFor('people', [sh])!; return { file: 'Δ.xlsm', sheet: x.sheet, header: x.header, cols: x.cols, write: true }; };
  const s0 = roomed(); const sh = sheetOf(s0.people); const b = bind(sh);
  const at = (p: ReturnType<typeof planPeopleWrite>, c: number) => Object.fromEntries(p.sets.filter(x => x.c === c).map(x => [x.r, x.v]));

  it('αλφαβητικά μέσα στον θάλαμο, ο θαλαμάρχης μένει πρώτος· οι από κάτω παίρνουν τον επόμενο Α/Α', () => {
    const s = add(s0, 'ΚΑΙΝΟΥΡΓΙΟΣ', 1, '910001');
    const p = planPeopleWrite(sh, b, s, snapFromSheet(sh, b, s.people));
    expect(p.inserts).toEqual([{ after: 4, n: 1, tpl: 5 }]); expect(p.grow).toBeNull();
    expect(at(p, 3)).toEqual({ 5: 'ΚΑΙΝΟΥΡΓΙΟΣ' });
    expect(at(p, 0)).toEqual({ 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9 });
    // πριν από όλους εκτός από τον θαλαμάρχη, και τελευταίος του θαλάμου του
    expect(planPeopleWrite(sh, b, add(s0, 'ΑΑΑ', 1, '910001'), snapFromSheet(sh, b, s0.people)).inserts).toEqual([{ after: 3, n: 1, tpl: 4 }]);
    expect(planPeopleWrite(sh, b, add(s0, 'ΩΩΩ', 2, '910001'), snapFromSheet(sh, b, s0.people)).inserts).toEqual([{ after: 8, n: 1, tpl: 8 }]);
  });
  it('θάλαμος που δεν έχει κανέναν: ανάμεσα στους διπλανούς· μετά τον τελευταίο θάλαμο: στο τέλος του πίνακα', () => {
    const s = add(add(add(s0, 'ΚΑΙΝΟΥΡΓΙΟΣ', 3, '910001'), 'ΩΩΩ', 4, '910002'), 'ΒΒΒ', 1, '910003');
    const p = planPeopleWrite(sh, b, s, snapFromSheet(sh, b, s.people));
    // ο ΒΒΒ μπαίνει πρώτος στον 1 (γραμμή 4), ο θάλαμος 3 μετά τον 2 (γραμμή 10 μετά από αυτόν), ο ΩΩΩ κάτω από τον τελευταίο
    expect(p.inserts).toEqual([{ after: 3, n: 1, tpl: 4 }, { after: 9, n: 1, tpl: 9 }, { after: 12, n: 1, tpl: 12 }]);
    expect(p.grow).toEqual({ from: 3, last: 13, to: 14 });
    expect(at(p, 3)).toEqual({ 4: 'ΒΒΒ', 10: 'ΚΑΙΝΟΥΡΓΙΟΣ', 13: 'ΩΩΩ' });
    expect(at(p, 0)[13]).toBe(11);
  });
  it('χωρίς ομάδες θαλάμων (ανακατεμένοι): στο τέλος, όπως πριν', () => {
    const mixed = roomed(); mixed.people = [...mixed.people].reverse();
    const sh2 = sheetOf(mixed.people); const b2 = bind(sh2);
    const s = add(mixed, 'ΚΑΙΝΟΥΡΓΙΟΣ', 1, '910001');
    const p = planPeopleWrite(sh2, b2, s, snapFromSheet(sh2, b2, s.people));
    expect(p.inserts).toEqual([{ after: 10, n: 1, tpl: 10 }]); expect(p.grow).toEqual({ from: 3, last: 11, to: 12 });
  });
});

describe('εγγραφή στον θάλαμό του', () => {
  it('μπαίνει γραμμή μέσα στον πίνακα, τα σύνολα τον μετράνε, και η αναίρεση σβήνει τη γραμμή', async () => {
    const s0 = roomed(); const { file, b } = await dynFile(s0.people, 2);
    const before = (await readBook(file)).sheets[0].rows;
    const s = add(add(s0, 'ΚΑΙΝΟΥΡΓΙΟΣ', 1, '910001'), 'ΑΛΛΟΣ', 3, '910002');
    const w = await writeSource('people', b, s, META, TODAY); if (!w.ok) throw new Error(w.error);
    expect([w.added, w.changed]).toEqual([2, 0]);
    const rows = (await readBook(file)).sheets[0].rows;
    expect(rows.slice(3, 13).map(r => [r[0], r[3], r[8]])).toEqual([[1, 'ΤΥΧΑΙΟΣ', 1], [2, 'ΔΟΚΙΜΙΟΣ', 1], [3, 'ΚΑΙΝΟΥΡΓΙΟΣ', 1], [4, 'ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ', 1], [5, 'ΥΠΟΘΕΤΙΔΗΣ', 1],
      [6, 'ΑΓΝΩΣΤΟΠΟΥΛΟΣ', 2], [7, 'ΦΑΝΤΑΣΙΟΣ', 2], [8, 'ΑΛΛΟΣ', 3], [9, 'ΔΕΙΓΜΑΤΑΣ', 4], [10, 'ΠΛΑΣΜΑΤΙΚΟΣ', 4]]);
    for (const c of 'ABCDEFGHIJK') { expect(await styleOf(file, c + '6'), c).toBe(await styleOf(file, c + '5')); expect(await styleOf(file, c + '11'), c).toBe(await styleOf(file, c + '10')); }
    expect(await formulas(file, 'ΣΥΝΟΛΙΚΟ')).toEqual({ F16: 'COUNTIF(I4:I13, "1")', G16: 'COUNTIF(I5:I13, "1")' });
    expect(await formulas(file, 'ΣΥΝΟΛΑ')).toEqual({ A2: 'COUNTA(ΣΥΝΟΛΙΚΟ!D4:D13)+COUNTA(D4:D11)' });
    const m1 = { ...META, ...w.meta } as SourceMeta;
    expect(((await writeSource('people', b, s, m1, TODAY)) as { unchanged: boolean }).unchanged).toBe(true);
    // αναίρεση: οι δύο γραμμές φεύγουν, όλα όπως ήταν
    const w2 = await writeSource('people', b, s0, m1, TODAY); if (!w2.ok) throw new Error(w2.error);
    expect(w2.cleared).toBe(2); expect(w2.meta.keys).toEqual([]);
    expect((await readBook(file)).sheets[0].rows).toEqual(before);
    expect(await formulas(file, 'ΣΥΝΟΛΙΚΟ')).toEqual({ F14: 'COUNTIF(I4:I11, "1")', G14: 'COUNTIF(I5:I11, "1")' });
    expect(await formulas(file, 'ΣΥΝΟΛΑ')).toEqual({ A2: 'COUNTA(ΣΥΝΟΛΙΚΟ!D4:D11)+COUNTA(D4:D11)' });
  });
  it('στο φύλλο ΘΑΛΑΜΟΙ: στον πίνακα του θαλάμου του, αλφαβητικά μετά τον θαλαμάρχη, και φεύγει με την αναίρεση', async () => {
    const s0 = roomed(); const { file, b } = await dynFile(s0.people, 2);
    const wb = await Workbook.open(fs.readFileSync(file)); const th = await wb.addSheet('ΘΑΛΑΜΟΙ');
    const block = (r: number, room: number) => {
      th.set('A' + r, 'ΔΥΝΑΜΟΛΟΓΙΟ ' + room + 'ου ΘΑΛΑΜΟΥ');
      HEAD.slice(0, 8).forEach((h, c) => th.set(String.fromCharCode(65 + c) + (r + 1), h));
      const ps = s0.people.filter(p => p.room === room);
      ps.forEach((p, i) => pr(p, i).slice(0, 8).forEach((v, c) => { const ref = String.fromCharCode(65 + c) + (r + 2 + i); th.set(ref, v as string | number); th.setStyle(ref, 2); }));
      return r + 2 + ps.length + 1;
    };
    block(block(1, 1), 2); fs.writeFileSync(file, await wb.save());
    const thBefore = (await readBook(file)).sheets.find(x => x.name === 'ΘΑΛΑΜΟΙ')!.rows;
    const s = add(add(s0, 'ΚΑΙΝΟΥΡΓΙΟΣ', 1, '910001'), 'ΑΛΛΟΣ', 3, '910002');
    const w = await writeSource('people', b, s, META, TODAY); if (!w.ok) throw new Error(w.error);
    expect(w.rooms).toEqual({ n: 0, added: 1, placed: 1, sheet: 'ΘΑΛΑΜΟΙ' });   // ο θάλαμος 3 δεν έχει πίνακα
    const rows = (await readBook(file)).sheets.find(x => x.name === 'ΘΑΛΑΜΟΙ')!.rows;
    expect(rows.map(r => cellOf(r, 3))).toEqual(['', 'ΕΠΩΝΥΜΟ', 'ΤΥΧΑΙΟΣ', 'ΔΟΚΙΜΙΟΣ', 'ΚΑΙΝΟΥΡΓΙΟΣ', 'ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ', 'ΥΠΟΘΕΤΙΔΗΣ', '', '', 'ΕΠΩΝΥΜΟ', 'ΑΓΝΩΣΤΟΠΟΥΛΟΣ', 'ΦΑΝΤΑΣΙΟΣ']);
    expect(rows[4].slice(0, 8)).toEqual([3, 'ΣΤΡ', 'ΠΖ', 'ΚΑΙΝΟΥΡΓΙΟΣ', 'ΝΕΟΣ', 'ΠΑΤΕΡΑΣ', 910001, 6900000999]);
    expect(rows.slice(2, 7).map(r => r[0])).toEqual([1, 2, 3, 4, 5]); expect(rows.slice(10, 12).map(r => r[0])).toEqual([1, 2]);
    expect(rows[8][0]).toBe('ΔΥΝΑΜΟΛΟΓΙΟ 2ΟΥ ΘΑΛΑΜΟΥ');
    const ws = await (await Workbook.open(fs.readFileSync(file))).sheet('ΘΑΛΑΜΟΙ'); expect(ws.style('D5')).toBe(ws.style('D6'));
    const w2 = await writeSource('people', b, s0, { ...META, ...w.meta } as SourceMeta, TODAY); if (!w2.ok) throw new Error(w2.error);
    expect((await readBook(file)).sheets.find(x => x.name === 'ΘΑΛΑΜΟΙ')!.rows).toEqual(thBefore);
  });
});
const cellOf = (r: unknown[] | undefined, c: number) => String((r || [])[c] ?? '');
