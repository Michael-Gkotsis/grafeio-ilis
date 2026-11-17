// The sheet model: states, merges, formulas as text (shared formulas expanded), data-validation lists, and .xls through an injected converter.
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { modelOfBuffer, readBookModel, shiftFormulaRefs } from '../src/main/bookModel';
import { readBook } from '../src/main/sources';
import type { XlsConverter } from '../src/main/xlsConvert';

describe('shiftFormulaRefs (shared formulas)', () => {
  it('moves relative references and keeps absolute ones', () => {
    expect(shiftFormulaRefs('A1+B2', 1, 1)).toBe('B2+C3');
    expect(shiftFormulaRefs('$A1+B$2', 2, 1)).toBe('$A3+C$2');
    expect(shiftFormulaRefs('SUM(A1:A5)', 0, 2)).toBe('SUM(C1:C5)');
    expect(shiftFormulaRefs('A1', 0, 0)).toBe('A1');
  });
  it('leaves quoted text and sheet names alone', () => {
    expect(shiftFormulaRefs('COUNTIF(\'Φύλλο A1\'!C:C,"Α1")', 1, 0)).toBe('COUNTIF(\'Φύλλο A1\'!C:C,"Α1")');
    expect(shiftFormulaRefs('COUNTIF(Παρουσιολόγιο!C:C,"ΑΝΧΗΣ")+B1', 3, 0)).toBe('COUNTIF(Παρουσιολόγιο!C:C,"ΑΝΧΗΣ")+B4');
  });
  it('moves whole-column and whole-row ranges only on their own axis', () => {
    expect(shiftFormulaRefs('SUM(C:C)', 4, 1)).toBe('SUM(D:D)');
    expect(shiftFormulaRefs('SUM(3:3)', 4, 1)).toBe('SUM(7:7)');
  });
});

async function book() {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet('Δεδομένα'); a.addRows([['ΒΑΘΜΟΣ', 'ΚΑΤΑΣΤΑΣΗ'], ['ΑΝΧΗΣ', 'ΠΑΡΩΝ'], ['ΤΧΗΣ', 'ΑΠΩΝ'], ['ΛΓΟΣ', 'ΠΑΡΩΝ']]);
  a.mergeCells('D1:E1'); a.getCell('D1').value = 'ΟΜΑΔΑ';
  a.getCell('B2').dataValidation = { type: 'list', allowBlank: true, formulae: ['"ΠΑΡΩΝ,ΑΠΩΝ,ΑΔΕΙΑ"'] };
  a.getCell('B3').dataValidation = { type: 'list', allowBlank: true, formulae: ['$H$1:$H$3'] };
  a.getCell('H1').value = 'ΝΟΣΟΚΟΜΕΙΟ'; a.getCell('H2').value = 'ΕΚΠΑΙΔΕΥΣΗ'; a.getCell('H3').value = 'ΑΠΑΛΛΑΓΗ';
  a.getCell('G1').value = { formula: 'COUNTIF(B2:B4,"ΠΑΡΩΝ")', result: 2 };
  const s = wb.addWorksheet('Κρυφό'); s.state = 'hidden'; s.getCell('A1').value = 1;
  const v = wb.addWorksheet('Πολύ κρυφό'); v.state = 'veryHidden'; v.getCell('A1').value = 2;
  const c = wb.addWorksheet('Σύνολα'); c.getCell('A1').value = { formula: 'COUNTIF(Δεδομένα!A:A,"ΑΝΧΗΣ")', result: 1 };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('modelOfBuffer', () => {
  it('reads sheet states, merges, formulas and validation lists', async () => {
    const sh = await modelOfBuffer(await book());
    expect(sh.map(x => [x.name, x.state])).toEqual([['Δεδομένα', 'visible'], ['Κρυφό', 'hidden'], ['Πολύ κρυφό', 'veryHidden'], ['Σύνολα', 'visible']]);
    const d = sh[0];
    expect(d.rows[1][0]).toBe('ΑΝΧΗΣ');
    expect(d.merges).toEqual([{ r1: 0, c1: 3, r2: 0, c2: 4 }]);
    expect(d.formulas.get('0:6')).toBe('COUNTIF(B2:B4,"ΠΑΡΩΝ")'); expect(d.fx.has('0:6')).toBe(true); expect(d.rows[0][6]).toBe(2);
    const inline = d.validations.find(v => v.items?.includes('ΑΔΕΙΑ'));
    expect(inline && inline.items).toEqual(['ΠΑΡΩΝ', 'ΑΠΩΝ', 'ΑΔΕΙΑ']);
    const ranged = d.validations.find(v => v.ref);
    expect(ranged && ranged.items).toEqual(['ΝΟΣΟΚΟΜΕΙΟ', 'ΕΚΠΑΙΔΕΥΣΗ', 'ΑΠΑΛΛΑΓΗ']);
    expect(sh[3].formulas.get('0:0')).toBe('COUNTIF(Δεδομένα!A:A,"ΑΝΧΗΣ")');
  });
  it('an unreadable buffer throws', async () => { await expect(modelOfBuffer(Buffer.from('not a zip'))).rejects.toBeTruthy(); });
});

describe('.xls through an injected converter', () => {
  const withDir = async (fn: (dir: string) => Promise<void>) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafeio-bm-')); try { await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };
  it('converts a COPY, reads it, and leaves the original untouched', async () => {
    await withDir(async dir => {
      const x = await book(); const f = path.join(dir, 'old.xls'); fs.writeFileSync(f, 'fake xls bytes');
      let seen = ''; const conv: XlsConverter = { name: 'fake', async run(copy, out) { seen = copy; const o = path.join(out, 'o.xlsx'); fs.writeFileSync(o, x); return o; } };
      const b = await readBookModel(f, { converters: [conv] });
      expect(b.from).toBe('xls'); expect(b.converter).toBe('fake'); expect(b.sheets.length).toBe(4);
      expect(seen).not.toBe(f); expect(fs.existsSync(seen)).toBe(false);          // the temp folder is gone
      expect(fs.readFileSync(f, 'utf8')).toBe('fake xls bytes');
    });
  });
  it('the first converter that fails is skipped; none working gives the friendly error', async () => {
    await withDir(async dir => {
      const f = path.join(dir, 'old.xls'); fs.writeFileSync(f, 'x'); const x = await book();
      const bad: XlsConverter = { name: 'bad', async run() { throw new Error('boom'); } };
      const ok: XlsConverter = { name: 'ok', async run(_c, out) { const o = path.join(out, 'o.xlsx'); fs.writeFileSync(o, x); return o; } };
      expect((await readBookModel(f, { converters: [bad, ok] })).converter).toBe('ok');
      await expect(readBookModel(f, { converters: [bad] })).rejects.toThrow(/xlsx/i);
    });
  });
  it('readBook without converters still refuses .xls as before', async () => {
    await withDir(async dir => { const f = path.join(dir, 'old.xls'); fs.writeFileSync(f, 'x'); await expect(readBook(f)).rejects.toThrow(); });
  });
});
