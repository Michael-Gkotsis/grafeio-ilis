// Αυτόματη ανάγνωση/εγγραφή μετά από νέα στήλη στο Excel: οι στήλες ακολουθούν τις επικεφαλίδες τους πριν από κάθε
// αυτόματη ανάγνωση ή εγγραφή, και αν δεν βγαίνει σίγουρη αντιστοίχιση, το είδος περιμένει. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Workbook } from '../src/main/xlsx';
import { locateCheck, readBook } from '../src/main/sources';
import { bestFor, parseStatuses, type SourceBinding } from '../src/shared/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
let bump = 0;
const serial = (iso: string) => (Date.parse(iso) - Date.UTC(1899, 11, 30)) / 86400000;
async function punishFile(file: string, head: string[], rows: (string | number | { d: string })[][]) {
  const wb = await Workbook.blank('ΤΙΜΩΡΗΜΕΝΟΙ'); const ws = await wb.sheet('ΤΙΜΩΡΗΜΕΝΟΙ');
  ws.set('A1', 'ΤΙΜΩΡΗΜΕΝΟΙ');
  const put = (r: number, vals: (string | number | { d: string })[]) => vals.forEach((v, c) => { const ref = String.fromCharCode(65 + c) + r; if (typeof v === 'object') ws.setNumber(ref, serial(v.d), 3); else ws.set(ref, v); });
  put(2, head); rows.forEach((x, i) => put(3 + i, x));
  fs.writeFileSync(file, await wb.save());
  const t = new Date(Date.now() + 5000 * ++bump); fs.utimesSync(file, t, t);   // σίγουρα άλλη ώρα αρχείου
}

describe('νέα στήλη στο Excel και αυτόματες διαδρομές (X3)', () => {
  it('«ΗΜΕΡΕΣ» μετά το «ΕΩΣ»: η αυτόματη ανάγνωση διαβάζει το είδος από τη σωστή στήλη', async () => {
    const s = fakeState(6); const p = s.people[1];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-x3-')); const file = path.join(dir, 't.xlsx');
    const head = ['Α/Α', 'Βαθμός', 'Επώνυμο', 'Όνομα', 'ΑΠΟ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'];
    await punishFile(file, head, [[1, p.rank, p.last, p.first, { d: '2026-10-05' }, { d: '2026-10-08' }, 'ΚΡΑΤΗΣΗ']]);
    const book = await readBook(file); const x = bestFor('punish', book.sheets)!;
    const b: SourceBinding = { file, sheet: x.sheet, header: x.header, cols: x.cols, write: true };
    expect(b.cols.kind).toBe(6);
    // ο λοχίας βάζει στήλη «ΗΜΕΡΕΣ» μετά το «ΕΩΣ»
    await punishFile(file, ['Α/Α', 'Βαθμός', 'Επώνυμο', 'Όνομα', 'ΑΠΟ', 'ΕΩΣ', 'ΗΜΕΡΕΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [[1, p.rank, p.last, p.first, { d: '2026-10-05' }, { d: '2026-10-08' }, 4, 'ΚΡΑΤΗΣΗ']]);
    const sheet = (await readBook(file)).sheets[0];
    // με την παλιά αντιστοίχιση το είδος θα ήταν οι ημέρες («4»)
    expect(parseStatuses('punish', sheet, b, s.people, TODAY).cands[0].kind).toBe('4');
    const c = await locateCheck('punish', b);
    expect(c.need).toBeNull();
    expect(c.b.cols.kind).toBe(7); expect(c.b.cols.days).toBe(6);
    expect(parseStatuses('punish', sheet, c.b, s.people, TODAY).cands[0].kind).toBe('Κράτηση');
  });
  // H1: στήλη με δική σου επικεφαλίδα μπροστά από το «ΕΙΔΟΣ ΠΟΙΝΗΣ». Η εφαρμογή θυμάται τις επικεφαλίδες από το πρώτο άνοιγμα.
  it('«ΣΧΟΛΙΑ» μπροστά από το «ΕΙΔΟΣ ΠΟΙΝΗΣ»: το είδος ακολουθεί την επικεφαλίδα του και δεν διαβάζονται τα σχόλια', async () => {
    const s = fakeState(6); const p = s.people[1];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-x3-')); const file = path.join(dir, 't.xlsx');
    const row = (...x: (string | number | { d: string })[]) => [1, p.rank, p.last, p.first, { d: '2026-10-05' }, { d: '2026-10-08' }, ...x];
    await punishFile(file, ['Α/Α', 'Βαθμός', 'Επώνυμο', 'Όνομα', 'ΑΠΟ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [row('ΚΡΑΤΗΣΗ')]);
    const x = bestFor('punish', (await readBook(file)).sheets)!;
    const first = await locateCheck('punish', { file, sheet: x.sheet, header: x.header, cols: x.cols, write: true });
    expect(first.need).toBeNull(); expect(first.b.heads).toMatchObject({ from: 'ΑΠΟ', kind: 'ΕΙΔΟΣ ΠΟΙΝΗΣ' });
    await punishFile(file, ['Α/Α', 'Βαθμός', 'Επώνυμο', 'Όνομα', 'ΑΠΟ', 'ΕΩΣ', 'ΣΧΟΛΙΑ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [row('ΣΤΕΡΗΣΗ ΕΞΟΔΟΥ', 'ΚΡΑΤΗΣΗ')]);
    const sheet = (await readBook(file)).sheets[0];
    expect(parseStatuses('punish', sheet, first.b, s.people, TODAY).cands[0].kind).toBe('Στέρηση εξόδου');   // με την παλιά αντιστοίχιση θα διάβαζε τα σχόλια
    const c = await locateCheck('punish', first.b);
    expect(c.need).toBeNull(); expect(c.b.cols.kind).toBe(7);
    expect(parseStatuses('punish', sheet, c.b, s.people, TODAY).cands[0].kind).toBe('Κράτηση');
    // το «ΕΙΔΟΣ ΠΟΙΝΗΣ» σβήστηκε: το είδος περιμένει αντιστοίχιση αντί να διαβάσει τα «ΣΧΟΛΙΑ»
    await punishFile(file, ['Α/Α', 'Βαθμός', 'Επώνυμο', 'Όνομα', 'ΑΠΟ', 'ΕΩΣ', 'ΣΧΟΛΙΑ'], [row('ΣΤΕΡΗΣΗ ΕΞΟΔΟΥ')]);
    expect((await locateCheck('punish', first.b)).need).toMatch(/ΣΧΟΛΙΑ/);
  });
  it('στήλη που η επικεφαλίδα της λέει πια άλλο πεδίο, χωρίς δική της αλλού: το είδος περιμένει αντιστοίχιση', async () => {
    const s = fakeState(6); const p = s.people[1];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-x3-')); const file = path.join(dir, 't.xlsx');
    await punishFile(file, ['Α/Α', 'Επώνυμο', 'Όνομα', 'ΑΠΟ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [[1, p.last, p.first, { d: '2026-10-05' }, { d: '2026-10-08' }, 'ΚΡΑΤΗΣΗ']]);
    const x = bestFor('punish', (await readBook(file)).sheets)!;
    const b: SourceBinding = { file, sheet: x.sheet, header: x.header, cols: x.cols, write: true };
    // στη στήλη του είδους γράφτηκαν οι ημέρες, και το «είδος» δεν υπάρχει πουθενά
    await punishFile(file, ['Α/Α', 'Επώνυμο', 'Όνομα', 'ΑΠΟ', 'ΕΩΣ', 'ΗΜΕΡΕΣ'], [[1, p.last, p.first, { d: '2026-10-05' }, { d: '2026-10-08' }, 4]]);
    const c = await locateCheck('punish', b);
    expect(c.need).toMatch(/ΗΜΕΡΕΣ/);
    // δική σου επικεφαλίδα («ΗΜ/ΝΙΑ») στη στήλη που όρισες: δεν είναι λάθος
    await punishFile(file, ['Α/Α', 'Επώνυμο', 'Όνομα', 'ΗΜ/ΝΙΑ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [[1, p.last, p.first, { d: '2026-10-05' }, { d: '2026-10-08' }, 'ΚΡΑΤΗΣΗ']]);
    const c2 = await locateCheck('punish', { ...b, cols: { ...b.cols } });
    expect(c2.need).toBeNull();
    // χωρίς «από» (υποχρεωτικό) στην αντιστοίχιση: περιμένει
    const { from, ...rest } = b.cols;
    expect((await locateCheck('punish', { ...b, cols: rest })).need).toMatch(/Από/);
  });
});
