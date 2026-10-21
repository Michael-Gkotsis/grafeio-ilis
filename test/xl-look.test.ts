// Γράμματα Excel (Michael, 20/10): γραμματοσειρά, μέγεθος και στοίχιση σε ό,τι φτιάχνει η εφαρμογή. Προεπιλογή Arial 12, κέντρο.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { XL_LOOK, xlLook } from '../src/shared/xlLook';
import { defaultBinding } from '../src/shared/sources';
import { writeSource } from '../src/main/sources';
import { rosterLists } from '../src/main/excel';
import { buildTemplate } from '../src/main/reports';
import { blankBuild } from '../src/shared/reports';
import type { AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-20';
const TIMES = { font: 'Times New Roman', sz: 10, h: 'left' as const, v: 'top' as const };
const styles = async (buf: Buffer) => (await JSZip.loadAsync(buf)).file('xl/styles.xml')!.async('string');
// γραμματοσειρά και στοίχιση του κελιού (ExcelJS)
async function cellLook(buf: Buffer, sheet: number, ref: string) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
  const c = wb.worksheets[sheet].getCell(ref);
  return { name: c.font?.name, size: c.font?.size, bold: !!c.font?.bold, h: c.alignment?.horizontal, v: c.alignment?.vertical };
}

describe('Γράμματα Excel: ρυθμίσεις', () => {
  it('προεπιλογή Arial 12, κέντρο οριζόντια και κάθετα· ό,τι δεν είναι έγκυρο γίνεται η προεπιλογή', () => {
    expect(XL_LOOK).toEqual({ font: 'Arial', sz: 12, h: 'center', v: 'center' });
    expect(xlLook(undefined)).toEqual(XL_LOOK);
    expect(xlLook({ xl: { font: 'Comic Sans', sz: 99, h: 'x' as any } })).toEqual(XL_LOOK);
    expect(xlLook({ xl: TIMES })).toEqual(TIMES);
  });
});

describe('Γράμματα Excel: τα Excel που βγάζεις', () => {
  it('Δυναμολόγιο και καταστάσεις: Arial 12 στο κέντρο, ο τίτλος 14', async () => {
    const s = fakeState(6);
    const { data } = await rosterLists(s, D);
    expect(await cellLook(data, 0, 'B4')).toMatchObject({ name: 'Arial', size: 12, h: 'center', v: 'middle' });
    expect(await cellLook(data, 0, 'B3')).toMatchObject({ name: 'Arial', size: 12, bold: true, h: 'center', v: 'middle' });
    expect(await cellLook(data, 0, 'A1')).toMatchObject({ name: 'Arial', size: 14, bold: true, h: 'center' });
  });
  it('με άλλες ρυθμίσεις: Times New Roman 10, αριστερά και πάνω (ο τίτλος μένει στο κέντρο)', async () => {
    const s: AppState = fakeState(6); s.settings.xl = TIMES;
    const { data } = await rosterLists(s, D);
    expect(await cellLook(data, 0, 'D4')).toMatchObject({ name: 'Times New Roman', size: 10, h: 'left', v: 'top' });
    expect(await cellLook(data, 0, 'A1')).toMatchObject({ name: 'Times New Roman', size: 12, h: 'center' });
  });
});

describe('Γράμματα Excel: νέα αρχεία στα Αρχεία Excel', () => {
  const make = async (s: AppState) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-look-')), 'posts.xlsx');
    const w = await writeSource('posts', { ...defaultBinding('posts', file), write: true }, s, undefined, D, { create: true });
    expect(w.ok).toBe(true);
    return fs.readFileSync(file);
  };
  it('προεπιλογή: τα κελιά του πίνακα σε Arial 12 στο κέντρο, χωρίς τη γραμματοσειρά του θέματος', async () => {
    const buf = await make(fakeState(6));
    expect(await cellLook(buf, 0, 'A2')).toMatchObject({ name: 'Arial', size: 12, h: 'center', v: 'middle' });
    expect(await styles(buf)).not.toMatch(/<name val="Arial"\/>[^<]*<scheme/);
  });
  it('με άλλες ρυθμίσεις', async () => {
    const s = fakeState(6); s.settings.xl = TIMES;
    const buf = await make(s);
    expect(await cellLook(buf, 0, 'A2')).toMatchObject({ name: 'Times New Roman', size: 10, h: 'left', v: 'top' });
  });
});

describe('Γράμματα Excel: «Φτιάξ\' το εδώ» στα Έντυπα', () => {
  it('γραμματοσειρά και στοίχιση από τις ρυθμίσεις, μέγεθος από το πρότυπο', async () => {
    const o = { ...blankBuild(), head: false, date: false };
    const b = await buildTemplate(o, 'people', { ...TIMES, sz: 16 });
    expect(await cellLook(b.data, 0, 'C' + b.head)).toMatchObject({ name: 'Times New Roman', size: o.sz, bold: true, h: 'left', v: 'top' });
    expect(await cellLook(b.data, 0, 'C' + (b.head + 1))).toMatchObject({ name: 'Times New Roman', size: o.sz, h: 'left', v: 'top' });
    const d = await buildTemplate(o, 'people');
    expect(await cellLook(d.data, 0, 'B' + (d.head + 1))).toMatchObject({ name: 'Arial', size: 12, h: 'center', v: 'middle' });
  });
});
