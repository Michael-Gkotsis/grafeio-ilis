// Η επικεφαλίδα που σχεδίασες στα έντυπα με template: ΗΚΑΙ, ΦΡΟΥΡΑ, Εξοδούχοι (+ Παραμένοντες, «Όλη η δύναμη», ΠΣΚ)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { fillFroura, fillHkai, fillOuts } from '../src/main/exports';
import { mergeFirstSheets, Workbook } from '../src/main/xlsx';
import { parseDrawings } from '../src/main/xlDrawings';
import { renderBook } from '../src/main/print';
import { setImageDir } from '../src/main/eikones';
import { presetZones } from '../src/shared/docHead';
import { fakeState } from './fixtures';

const D = '2026-10-12';
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
function png(w: number, h: number): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 200; raw[o + 1] = 30; raw[o + 2] = 30; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
let imgId = '';
beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-headt-')); fs.mkdirSync(path.join(dir, 'eikones'));
  const b = png(120, 60); imgId = crypto.createHash('sha1').update(b).digest('hex'); fs.writeFileSync(path.join(dir, 'eikones', imgId + '.png'), b); setImageDir(dir);
});
afterAll(() => { setImageDir(null); });

const UNIT: [string, string, string] = ['κεν αυλωνα', '2η επχια', '4η ιλη'];
const plain = (n = 30) => { const s = fakeState(n); s.settings.unit = UNIT; return s; };
const designed = (n = 30) => {
  const s = plain(n); const z = presetZones('imgLeft', s.settings);
  for (const zone of z) for (const it of zone) if (it.k === 'img') it.id = imgId;
  const use = { on: ['h1'], def: 'h1' };
  s.settings = { ...s.settings, heads: [{ id: 'h1', name: 'Δοκιμή', z }], headUse: { hkai: use, froura: use, outs: use } };
  return s;
};
const pics = async (data: Buffer) => {
  const zip = await JSZip.loadAsync(data); const out: Record<string, number> = {};
  const wbx = await zip.file('xl/workbook.xml')!.async('string'); const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  for (const m of wbx.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const tg = new RegExp('<Relationship\\b[^>]*Id="' + m[2] + '"[^>]*>').exec(rels)![0]; const tp = /Target="([^"]+)"/.exec(tg)![1]; const f = tp.startsWith('/') ? tp.slice(1) : 'xl/' + tp;
    out[m[1]] = (await parseDrawings(zip, f, await zip.file(f)!.async('string'))).length;
  }
  return out;
};
const cells = async (data: Buffer, n = 0) => { const wb = await Workbook.open(data); return (await wb.values(wb.sheetNames()[n], 60, 30)).flat().filter(x => typeof x === 'string') as string[]; };
const nums = async (data: Buffer) => { const d = await renderBook(data, { file: 'x.xlsx' }); return d.sheets.flatMap(sh => [...sh.html.matchAll(/<span>(-?\d+)<\/span>/g)].map(m => m[1])).sort(); };
const opens = async (data: Buffer) => { const ex = new ExcelJS.Workbook(); await ex.xlsx.load(data); return ex.worksheets.length; };

describe('ΗΚΑΙ με επικεφαλίδα', () => {
  it('κεφαλαία, μία εικόνα στην μπροστινή όψη, οι αριθμοί και τα σύνολα ίδια με πριν', async () => {
    const a = await fillHkai(T('hkai.xlsx'), plain(), D); const b = await fillHkai(T('hkai.xlsx'), designed(), D);
    const pa = await pics(a.data!), pb = await pics(b.data!);
    expect(Object.values(pa).reduce((x, y) => x + y, 0)).toBe(0);
    expect(pb[a.sheet!]).toBe(1); expect(Object.values(pb).reduce((x, y) => x + y, 0)).toBe(1);
    const t = await cells(b.data!, Object.keys(pb).indexOf(a.sheet!)); expect(t).toContain('ΚΕΝ ΑΥΛΩΝΑ');
    expect(await nums(b.data!)).toEqual(await nums(a.data!));
    expect(await opens(b.data!)).toBeGreaterThan(0);
    expect(b.layout!.some(l => l.blocks.some(x => x.id === 'head'))).toBe(true);
  });
  it('«Όπως σήμερα» (ή headId today): ίδιο αρχείο με πριν', async () => {
    const a = await fillHkai(T('hkai.xlsx'), plain(), D); const c = await fillHkai(T('hkai.xlsx'), designed(), D, { headId: 'today' });
    expect(c.data!.equals(a.data!)).toBe(true);
  });
});

describe('ΦΡΟΥΡΑ με επικεφαλίδα', () => {
  for (const [file, phase] of [['froura.xlsx', 'sven'], ['froura-spen.xlsx', 'spen']] as const) {
    it(file, async () => {
      const a = await fillFroura(T(file), plain(), D, phase); const b = await fillFroura(T(file), designed(), D, phase);
      const pb = await pics(b.data!); expect(pb[b.sheet!]).toBe(1);
      expect(await cells(b.data!)).toContain('ΚΕΝ ΑΥΛΩΝΑ');
      expect(await nums(b.data!)).toEqual(await nums(a.data!));
      const c = await fillFroura(T(file), designed(), D, phase, undefined, undefined, 'today'); expect(c.data!.equals(a.data!)).toBe(true);
      expect(await opens(b.data!)).toBeGreaterThan(0);
    });
  }
});

describe('Εξοδούχοι με επικεφαλίδα', () => {
  it('Εξοδούχοι και Παραμένοντες: μία εικόνα ανά φύλλο που έχει κεφαλίδα', async () => {
    const a = await fillOuts(T('exodouxoi.xlsx'), plain(), D); const b = await fillOuts(T('exodouxoi.xlsx'), designed(), D);
    const pb = await pics(b.data!); expect(Object.values(pb).every(n => n <= 1)).toBe(true); expect(pb[b.sheet!]).toBe(1);
    expect(await cells(b.data!)).toContain('ΚΕΝ ΑΥΛΩΝΑ');
    expect(await nums(b.data!)).toEqual(await nums(a.data!));
    const c = await fillOuts(T('exodouxoi.xlsx'), designed(), D, {}, undefined, 'today'); expect(c.data!.equals(a.data!)).toBe(true);
  });
  it('«Όλη η δύναμη»: κεφαλίδα και στα δύο φύλλα', async () => {
    const s = designed(); s.settings = { ...s.settings, outsFmt: 'all' } as typeof s.settings;
    const b = await fillOuts(T('exodouxoi.xlsx'), s, D); const pb = await pics(b.data!);
    if (Object.keys(pb).length > 1) expect(Object.values(pb).every(n => n === 1)).toBe(true);
    const doc = await renderBook(b.data!, { file: 'x.xlsx' }); expect(doc.sheets.length).toBeGreaterThan(1);
  });
});

describe('ΠΣΚ: τα φύλλα που ενώνονται κρατούν τις εικόνες τους', () => {
  it('mergeFirstSheets', async () => {
    const s = designed(); const days = ['2026-10-16', '2026-10-17', '2026-10-18'];
    const parts = await Promise.all(days.map(d => fillFroura(T('froura.xlsx'), s, d, 'sven')));
    const data = await mergeFirstSheets(parts.map(p => p.data!), ['ΠΑΡ', 'ΣΑΒ', 'ΚΥΡ'], parts[0].sheet);
    const pb = await pics(data); expect(Object.values(pb)).toEqual([1, 1, 1]);
    const doc = await renderBook(data, { file: 'x.xlsx' }); expect(doc.sheets.every(sh => sh.html.includes('<img'))).toBe(true);
  });
});
