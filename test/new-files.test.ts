// «Νέο αρχείο…» / «Νέο φύλλο…» για πόστα, εκτός δύναμης και δυνατότητες: η εφαρμογή φτιάχνει τον πίνακα από την αρχή
// με τη δομή του Δυναμολογίου (τίτλος, Α/Α, Βαθμός, Ο/Σ, Επώνυμο… και οι στήλες του είδους), και ό,τι φτιάχνει το
// ξαναδιαβάζει χωρίς αλλαγές. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { OUT_NOTE, type AppState } from '../src/shared/domain';
import { NEW_KINDS, bestFor, canCreate, defaultBinding, detectTables, inRoster, planCaps, planOutside, planPosts, type ListKind } from '../src/shared/sources';
import { Workbook } from '../src/main/xlsx';
import { readBook, writeSource } from '../src/main/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-13';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-new-'));
const sheetXml = async (file: string, n: number) => (await JSZip.loadAsync(fs.readFileSync(file))).file(n === 1 ? 'xl/worksheets/sheet1.xml' : `xl/worksheets/sheet_a${n}.xml`)!.async('string');

function state(): AppState {
  const s = fakeState(12);
  s.people = s.people.map(p => (p.id === 3 ? { ...p, post: 'ΙΑΤΡΕΙΟ' } : p.id === 7 ? { ...p, active: false, notes: OUT_NOTE + ': ΑΝΑΒΟΛΗ' } : p));
  s.caps = { 2: { sk: 'Από Excel: ΛΟΓΩ Ι' }, 4: { mg: 'ΠΟΝΟΣ ΜΕΣΗΣ', op: 'ΠΟΝΟΣ ΜΕΣΗΣ' } };
  return s;
}
// Φτιάχνει το είδος σε νέο αρχείο και το ξαναδιαβάζει όπως η «Ανανέωση από Excel»
async function roundTrip(kind: ListKind, s: AppState) {
  const file = path.join(tmp(), kind + '.xlsx'); const b = { ...defaultBinding(kind, file), write: true };
  const w = await writeSource(kind, b, s, undefined, TODAY, { create: true });
  expect(w.ok && w.created, JSON.stringify(w)).toBe(true);
  const { sheets } = await readBook(file);
  const found = bestFor(kind, sheets)!;
  return { file, b, sheets, found, sheet: sheets.find(x => x.name === found.sheet)! };
}

describe('νέα αρχεία για πόστα, εκτός δύναμης και δυνατότητες', () => {
  it('τα είδη που φτιάχνει η εφαρμογή· τα πόστα κ.λπ. πάνε στο Δυναμολόγιο', () => {
    for (const k of ['punish', 'medical', 'hospital', 'step', 'leave', 'dn', 'posts', 'outside', 'caps'] as ListKind[]) expect(canCreate(k), k).toBe(true);
    expect(NEW_KINDS.every(inRoster)).toBe(true);
  });

  it('πόστα: τίτλος ΠΟΣΤΑ, επικεφαλίδες του Δυναμολογίου και στήλη «Πόστο»· ξαναδιαβάζεται χωρίς αλλαγές', async () => {
    const s = state(); const { found, sheet, sheets, file, b } = await roundTrip('posts', s);
    expect(sheet.name).toBe('ΠΟΣΤΑ');
    expect(sheet.rows[0][0]).toBe('ΠΟΣΤΑ');
    expect(sheet.rows[1].slice(0, 10)).toEqual(['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Τηλέφωνο', 'Θάλαμος', 'Πόστο']);
    expect(found).toEqual({ sheet: 'ΠΟΣΤΑ', header: 1, cols: b.cols });
    expect(detectTables(sheets).find(h => h.sheet === 'ΠΟΣΤΑ')?.best).toBe('posts');
    // οι δύο με πόστο, αλφαβητικά (ΤΥΧΑΙΟΣ, ΥΠΟΘΕΤΙΔΗΣ), με Α/Α
    expect(sheet.rows.slice(2).map(r => [r[0], r[3], r[9]])).toEqual([[1, 'ΤΥΧΑΙΟΣ', 'ΚΨΜ'], [2, 'ΥΠΟΘΕΤΙΔΗΣ', 'ΙΑΤΡΕΙΟ']]);
    const pl = planPosts(sheet, b, s);
    expect(pl.changes).toEqual([]); expect(pl.same).toBe(2);
    // τίτλος σε συγχωνευμένα κελιά, ως την τελευταία στήλη
    expect(await sheetXml(file, 1)).toContain('<mergeCell ref="A1:J1"/>');
    // ξανά εγγραφή: τίποτα να γραφτεί
    const again = await writeSource('posts', b, s, undefined, TODAY);
    expect(again.ok && again.unchanged).toBe(true);
  });

  it('εκτός δύναμης: όσοι βγήκαν εκτός δύναμης, με τον λόγο στις ΠΑΡΑΤΗΡΗΣΕΙΣ', async () => {
    const s = state(); const { sheet, b, sheets } = await roundTrip('outside', s);
    expect(sheet.name).toBe('ΕΚΤΟΣ ΔΥΝΑΜΗΣ');
    expect(sheet.rows[1][b.cols.remarks]).toBe('ΠΑΡΑΤΗΡΗΣΕΙΣ');
    expect(sheet.rows.length).toBe(3);
    expect(sheet.rows[2][b.cols.remarks]).toBe('ΑΝΑΒΟΛΗ');
    expect(detectTables(sheets)[0].best).toBe('outside');
    const pl = planOutside(sheet, b, s);
    expect(pl.changes).toEqual([]); expect(pl.same).toBe(1);
  });

  it('δυνατότητες: «-» όπου δεν κάνει, με τον λόγο· ξαναδιαβάζεται χωρίς αλλαγές', async () => {
    const s = state(); const { sheet, b, sheets } = await roundTrip('caps', s);
    expect(sheet.name).toBe('ΔΥΝΑΤΟΤΗΤΑ ΥΠΗΡΕΣΙΩΝ');
    expect(['th', 'op', 'mg', 'sk', 'tae', 'capnote'].map(k => sheet.rows[1][b.cols[k]])).toEqual(['ΘΑΛΑΜΟΦΥΛΑΚΑΣ', 'ΟΠΛΟΦΥΛΑΚΑΣ', 'ΜΑΓΕΙΡΕΙΑ', 'ΣΚΟΠΙΑ', 'ΤΑΕ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ']);
    const rows = sheet.rows.slice(2);
    expect(rows.length).toBe(2);
    const of = (asm: number) => rows.find(r => r[b.cols.asm] === asm)!;
    expect(of(900001)[b.cols.sk]).toBe('-'); expect(of(900001)[b.cols.capnote]).toBe('ΛΟΓΩ Ι');
    expect([of(900003)[b.cols.op], of(900003)[b.cols.mg], of(900003)[b.cols.sk]]).toEqual(['-', '-', undefined]);
    expect(detectTables(sheets)[0].best).toBe('caps');
    const pl = planCaps(sheet, b, s);
    expect(pl.changes).toEqual([]); expect(pl.same).toBe(2);
  });

  it('χωρίς τίποτα να γράψει: φτιάχνεται μόνο ο τίτλος και οι επικεφαλίδες', async () => {
    const s = fakeState(4); s.people = s.people.map(p => ({ ...p, post: null }));
    const { sheet } = await roundTrip('posts', s);
    expect(sheet.rows.length).toBe(2);
  });

  it('νέο φύλλο σε υπάρχον Δυναμολόγιο: το ΣΥΝΟΛΙΚΟ δεν αλλάζει', async () => {
    const s = state(); const file = path.join(tmp(), 'ΔΥΝΑΜΟΛΟΓΙΟ.xlsx');
    const wb = await Workbook.blank('ΣΥΝΟΛΙΚΟ'); const ws = await wb.sheet('ΣΥΝΟΛΙΚΟ');
    ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα'].forEach((h, c) => ws.set(String.fromCharCode(65 + c) + '2', h));
    s.people.forEach((p, i) => [i + 1, p.rank, p.spec, p.last, p.first].forEach((v, c) => ws.set(String.fromCharCode(65 + c) + (i + 3), v)));
    fs.writeFileSync(file, await wb.save());
    const before = await sheetXml(file, 1);
    const w = await writeSource('posts', { ...defaultBinding('posts', file), write: true }, s, undefined, TODAY, { create: true });
    expect(w.ok && w.created).toBe(true);
    expect(await sheetXml(file, 1)).toBe(before);
    const { sheets } = await readBook(file);
    expect(sheets.map(x => x.name)).toEqual(['ΣΥΝΟΛΙΚΟ', 'ΠΟΣΤΑ']);
    expect(bestFor('posts', sheets)?.sheet).toBe('ΠΟΣΤΑ');
  });

  it('χωρίς «Νέο»: αρχείο ή φύλλο που λείπει δεν φτιάχνεται μόνο του (π.χ. USB που δεν μπήκε)', async () => {
    const file = path.join(tmp(), 'λείπει.xlsx');
    const w = await writeSource('posts', defaultBinding('posts', file), state(), undefined, TODAY);
    expect(w.ok).toBe(false); expect(fs.existsSync(file)).toBe(false);
  });
});
