// Γρήγορη εισαγωγή στρατιωτών (Νέα ΕΣΣΟ): πολλοί μαζί με μία εντολή, έλεγχος γραμμών, επικόλληση από Excel. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { emptyState, type AppState } from '../src/shared/domain';
import { checkRows, emptyRow, parsePaste, toNewPerson, type QaRow } from '../src/shared/quickAdd';
import { bestFor, type SourceBinding } from '../src/shared/sources';
import { Workbook } from '../src/main/xlsx';
import { readBook, writeSource, type SourceMeta } from '../src/main/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-19';
const ctx: Ctx = { today: TODAY, newId: () => 'x' };
const run = (s: AppState, c: Command) => apply(s, c, ctx);
const row = (r: Partial<QaRow>): QaRow => emptyRow({ rank: 'ΣΤΡ', spec: 'ΠΖ', ...r });
const NEW = [row({ last: 'Καινούργιος', first: 'Άλφας', father: 'Πατέρας', asm: '91 0001', room: '2' }), row({ last: 'ΝΕΟΦΕΡΤΟΣ', first: 'ΒΗΤΑΣ', room: 'Θ1' })];

describe('εντολή addPeople', () => {
  it('μπαίνουν όλοι μαζί, με αριθμούς στη σειρά και μία εγγραφή στο ιστορικό', () => {
    const r = run(emptyState(), { t: 'addPeople', people: NEW.map(x => toNewPerson(x, '2026 Δ΄')) });
    expect(r.state.people.map(p => [p.id, p.last, p.first, p.asm, p.room, p.essos, p.added, p.active])).toEqual([
      [1, 'ΚΑΙΝΟΥΡΓΙΟΣ', 'ΑΛΦΑΣ', '910001', 2, '2026 Δ΄', true, true], [2, 'ΝΕΟΦΕΡΤΟΣ', 'ΒΗΤΑΣ', '', 1, '2026 Δ΄', true, true]]);
    expect(r.state.people.map(p => p.si)).toEqual(['Ι1', 'Ι1']);   // νέα γραμμή: Ι1
    expect(toNewPerson(row({ last: 'Χ', first: 'Υ', si: 'ι3 χωρις οπλο' }), '').si).toBe('ι3 χωρις οπλο');
    expect(r.text).toBe('2 νέοι στρατιώτες: ΚΑΙΝΟΥΡΓΙΟΣ ΑΛΦΑΣ, ΝΕΟΦΕΡΤΟΣ ΒΗΤΑΣ');
    // στη νέα ΕΣΣΟ (κανείς πριν) δεν είναι εγγραφές της ΗΚΑΙ· με άλλους σε δύναμη είναι
    expect(r.state.people.every(p => !p.inOn)).toBe(true);
    const s2 = run(fakeState(3), { t: 'addPeople', people: NEW.map(x => toNewPerson(x, '')) }).state;
    expect(s2.people.slice(3).map(p => p.inOn)).toEqual([TODAY, TODAY]);
  });
  it('αν ένας δεν μπαίνει (διπλός, χωρίς όνομα), δεν μπαίνει κανείς και λέει ποια γραμμή', () => {
    const s = fakeState(3);
    expect(() => run(s, { t: 'addPeople', people: [toNewPerson(NEW[0], ''), toNewPerson(row({ last: 'Χ', first: 'Υ', asm: s.people[1].asm }), '')] })).toThrow(/^Γραμμή 2: Υπάρχει ήδη άτομο με ΑΣΜ/);
    expect(() => run(s, { t: 'addPeople', people: [toNewPerson(NEW[0], ''), toNewPerson(NEW[0], '')] })).toThrow(/^Γραμμή 2: Υπάρχει ήδη/);
    expect(() => run(s, { t: 'addPeople', people: [toNewPerson(row({ last: 'Χ' }), '')] })).toThrow(/^Γραμμή 1: Γράψε επώνυμο και όνομα/);
    expect(() => run(s, { t: 'addPeople', people: [] })).toThrow();
  });
  it('γράφονται όλοι στο Δυναμολόγιο με μία εγγραφή', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gi-qa-')), 'Δ.xlsx');
    const wb = await Workbook.blank('ΣΥΝΟΛΙΚΟ'); const ws = await wb.sheet('ΣΥΝΟΛΙΚΟ');
    ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Κινητό Τηλέφωνο', 'ΘΑΛΑΜΟΣ'].forEach((h, c) => ws.set(String.fromCharCode(65 + c) + '3', h));
    fs.writeFileSync(file, await wb.save());
    const x = bestFor('people', (await readBook(file)).sheets)!;
    const b: SourceBinding = { file, sheet: x.sheet, header: x.header, cols: x.cols, write: true };
    const s = run(emptyState(), { t: 'addPeople', people: NEW.map(r => toNewPerson(r, '')) }).state;
    const w = await writeSource('people', b, s, { keys: [], at: 'x', mtime: 0, size: 0 } as unknown as SourceMeta, TODAY); if (!w.ok) throw new Error(w.error);
    expect(w.added).toBe(2);
    const rows = (await readBook(file)).sheets[0].rows;
    expect(rows.slice(3).map(r => r[3]).filter(Boolean).sort()).toEqual(['ΚΑΙΝΟΥΡΓΙΟΣ', 'ΝΕΟΦΕΡΤΟΣ']);
  });
});

describe('έλεγχος γραμμών', () => {
  it('κενές γραμμές περνούν· λείπει επώνυμο/όνομα, διπλό ΑΣΜ ή ίδιος με πιο πάνω ή με υπάρχοντα', () => {
    const s = fakeState(3); const p = s.people[0];
    expect(checkRows(s.people, [
      NEW[0], emptyRow({ rank: 'ΣΤΡ', room: '3' }), row({ last: 'Χ' }), row({ first: 'Υ' }),
      row({ last: 'Άλλος', first: 'Ένας', asm: '910001' }), row({ last: 'καινουργιος', first: 'αλφας', father: 'πατερας' }),
      row({ last: p.last, first: p.first, father: p.father }), row({ last: 'Χ', first: 'Υ', asm: p.asm })
    ])).toEqual([null, null, 'Λείπει το όνομα', 'Λείπει το επώνυμο', 'Ίδιο ΑΣΜ με τη γραμμή 1', 'Ίδιος με τη γραμμή 1',
      'Υπάρχει ήδη: ' + p.last + ' ' + p.first, 'Υπάρχει ήδη με ΑΣΜ ' + p.asm + ': ' + p.last + ' ' + p.first]);
  });
});

describe('επικόλληση από Excel', () => {
  it('ένα κελί χωρίς Tab ή αλλαγή γραμμής: κανονική επικόλληση', () => {
    expect(parsePaste('ΔΟΚΙΜΙΟΣ', 2)).toBeNull();
    expect(parsePaste('ΔΟΚΙΜΙΟΣ\r\n', 2)).toBeNull();
  });
  it('με επικεφαλίδες: οι στήλες από τα ονόματά τους, και με άλλη σειρά ή άλλες στήλες', () => {
    const t = 'Α/Α\tΕΠΩΝΥΜΟ\tΟΝΟΜΑ\tΠΑΤΡΩΝΥΜΟ\tΒΑΘΜΟΣ\tΣ.Ι\tΚΙΝΗΤΟ ΤΗΛΕΦΩΝΟ\tΘΑΛΑΜΟΣ\r\n1\tΔΟΚΙΜΙΟΣ\tΑΛΦΑΣ\tΠΑΤΕΡΑΣ\tΣΤΡ\tΙ1\t6900000001\t3\r\n2\tΤΥΧΑΙΟΣ\tΒΗΤΑΣ\t\tΣΤΡ\t\t\t4\r\n\r\n';
    expect(parsePaste(t, 0)).toEqual([
      { last: 'ΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ', father: 'ΠΑΤΕΡΑΣ', rank: 'ΣΤΡ', si: 'Ι1', phone: '6900000001', room: '3' },
      { last: 'ΤΥΧΑΙΟΣ', first: 'ΒΗΤΑΣ', father: '', rank: 'ΣΤΡ', si: '', phone: '', room: '4' }]);
  });
  it('χωρίς επικεφαλίδες: με τη σειρά από τη στήλη του κέρσορα, χωρίς την πρώτη στήλη Α/Α', () => {
    expect(parsePaste('ΔΟΚΙΜΙΟΣ\tΑΛΦΑΣ\nΤΥΧΑΙΟΣ\tΒΗΤΑΣ', 2)).toEqual([{ last: 'ΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ' }, { last: 'ΤΥΧΑΙΟΣ', first: 'ΒΗΤΑΣ' }]);
    expect(parsePaste('1\tΔΟΚΙΜΙΟΣ\tΑΛΦΑΣ\n2\tΤΥΧΑΙΟΣ\tΒΗΤΑΣ', 2)).toEqual([{ last: 'ΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ' }, { last: 'ΤΥΧΑΙΟΣ', first: 'ΒΗΤΑΣ' }]);
    // στήλη ΑΣΜ: οι αριθμοί είναι δικοί της
    expect(parsePaste('910001\n910002', 5)).toEqual([{ asm: '910001' }, { asm: '910002' }]);
  });
});
