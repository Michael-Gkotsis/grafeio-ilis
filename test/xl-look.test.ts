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
import { fillFroura } from '../src/main/exports';
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

// Ξεχωριστά γράμματα ανά κομμάτι (Michael, 21/10: «ξεχωριστά για κεφαλίδες, υπογραφές και στήλες», «και bold επιλογή»)
describe('Γράμματα Excel: κάθε κομμάτι με δικά του γράμματα', () => {
  const ROOT = path.join(__dirname, '..', 'templates');
  const tpl = (f: string) => fs.readFileSync(path.join(ROOT, f));
  async function font(buf: Buffer, sheet: number, ref: string) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
    const f = wb.worksheets[sheet].getCell(ref).font || {};
    return { size: f.size, bold: !!f.bold, italic: !!f.italic, underline: !!f.underline };
  }
  // τα κελιά με κείμενο μέσα σε ένα κομμάτι του εντύπου (κεφαλίδα, υπογραφή)
  async function blockCells(buf: Buffer, b: { r1: number; c1: number; r2: number; c2: number }) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any); const ws = wb.worksheets[0]; const out: string[] = [];
    for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) { const cell = ws.getCell(r, c); if (cell.value != null && String(cell.text).trim() && !cell.isMerged || (cell.isMerged && cell.master === cell && String(cell.text).trim())) out.push(cell.address); }
    return out;
  }

  it('κρατά μόνο έγκυρα μεγέθη και μορφές· το μέγεθος των γραμμών είναι το βασικό', () => {
    const L = xlLook({ xl: { ...XL_LOOK, parts: { title: { sz: 18, i: true }, head: { sz: 99, b: false }, data: { sz: 8, b: true }, sig: {}, hdr: { u: 'x' as any } } } });
    expect(L.parts).toEqual({ title: { sz: 18, i: true }, head: { b: false }, data: { b: true } });
    expect(xlLook({ xl: { ...XL_LOOK, parts: {} } })).toEqual(XL_LOOK);
  });

  it('Excel που βγάζεις: τίτλος, επικεφαλίδες και γραμμές με τα δικά τους γράμματα', async () => {
    const s = fakeState(6); s.settings.xl = { ...XL_LOOK, parts: { title: { sz: 18, i: true }, head: { sz: 10, b: false, u: true }, data: { b: true } } };
    const { data } = await rosterLists(s, D);
    expect(await font(data, 0, 'A1')).toEqual({ size: 18, bold: true, italic: true, underline: true });
    expect(await font(data, 0, 'B3')).toEqual({ size: 10, bold: false, italic: false, underline: true });
    expect(await font(data, 0, 'B4')).toEqual({ size: 12, bold: true, italic: false, underline: false });
  });

  it('ΦΡΟΥΡΑ: χωρίς δικά τους γράμματα η κεφαλίδα και οι υπογραφές μένουν όπως το έντυπο', async () => {
    const s = fakeState(20);
    const a = await fillFroura(tpl('froura.xlsx'), s, D);
    s.settings.xl = { ...XL_LOOK, parts: { title: { sz: 20 }, head: { sz: 8 } } };   // κομμάτια του πίνακα: δεν αγγίζουν το έντυπο
    const b = await fillFroura(tpl('froura.xlsx'), s, D);
    const blocks = a.layout![0].blocks;
    for (const bl of blocks) for (const ref of await blockCells(a.data, bl)) expect(await font(b.data, 0, ref)).toEqual(await font(a.data, 0, ref));
  });

  it('ΦΡΟΥΡΑ: κεφαλίδα και υπογραφές με τα γράμματα που διάλεξες', async () => {
    const s = fakeState(20);
    s.settings.xl = { ...XL_LOOK, parts: { hdr: { sz: 14, i: true }, sig: { sz: 9, b: false, u: true } } };
    const r = await fillFroura(tpl('froura.xlsx'), s, D);
    const blocks = r.layout![0].blocks;
    const head = blocks.find(b => b.id === 'head')!, sigs = blocks.filter(b => /^s\d/.test(b.id));
    expect(head).toBeTruthy(); expect(sigs.length).toBeGreaterThan(0);
    const hs = await blockCells(r.data, head); expect(hs.length).toBeGreaterThan(0);
    for (const ref of hs) expect(await font(r.data, 0, ref)).toMatchObject({ size: 14, italic: true });
    for (const b of sigs) { const cs = await blockCells(r.data, b); expect(cs.length).toBeGreaterThan(0); for (const ref of cs) expect(await font(r.data, 0, ref)).toMatchObject({ size: 9, bold: false, underline: true }); }
  });

  it('«Φτιάξ\' το εδώ»: κεφαλίδα, τίτλος, επικεφαλίδες και υπογραφές από τις ρυθμίσεις', async () => {
    const o = { ...blankBuild(), head: true, date: false, sig: 'sgt' as const, cols: [{ f: 'name', h: '', w: 'wide' as const }, { f: 'rank', h: '', w: 'auto' as const }, { f: 'asm', h: '', w: 'auto' as const }, { f: 'phone', h: '', w: 'auto' as const }] };
    const d = await buildTemplate(o, 'people');
    expect(await font(d.data, 0, 'A1')).toMatchObject({ size: 10, bold: true });
    expect(await font(d.data, 0, 'A5')).toMatchObject({ size: o.sz + 2, bold: true, underline: true });
    const L = { ...XL_LOOK, parts: { hdr: { sz: 12, b: false }, title: { u: false, i: true }, head: { sz: 14 }, sig: { sz: 9, i: true } } };
    const b = await buildTemplate(o, 'people', L);
    expect(await font(b.data, 0, 'A1')).toEqual({ size: 12, bold: false, italic: false, underline: false });
    expect(await font(b.data, 0, 'A5')).toEqual({ size: o.sz + 2, bold: true, italic: true, underline: false });
    expect(await font(b.data, 0, 'A' + b.head)).toMatchObject({ size: 14, bold: true });
    expect(await font(b.data, 0, 'A' + (b.head + 1))).toMatchObject({ size: o.sz, bold: false });
    expect(await font(b.data, 0, 'A' + (b.head + 3))).toMatchObject({ size: 9, italic: true, bold: true });
  });
});
