// Η επικεφαλίδα που σχεδίασες γράφεται στα Excel: καθαρή διάταξη, εικόνες (xlsx.ts) και τα έγγραφα της εφαρμογής και των Εντύπων
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { dutyCheck, rosterPrint } from '../src/main/excel';
import { signMade } from '../src/main/exports';
import { buildTemplate, fillReport } from '../src/main/reports';
import { Workbook } from '../src/main/xlsx';
import { parseDrawings } from '../src/main/xlDrawings';
import { renderBook } from '../src/main/print';
import { setImageDir } from '../src/main/eikones';
import { layoutHead, zonesOf, CM_PX } from '../src/shared/headLayout';
import { presetZones, type DocHead } from '../src/shared/docHead';
import { defaultPick, forBuild, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import { fakeState } from './fixtures';

const D = '2026-10-19';
function png(w: number, h: number): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 200; raw[o + 1] = 30; raw[o + 2] = 30; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
let dir = ''; let imgId = '';
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-head-')); fs.mkdirSync(path.join(dir, 'eikones'));
  const b = png(120, 60); imgId = crypto.createHash('sha1').update(b).digest('hex'); fs.writeFileSync(path.join(dir, 'eikones', imgId + '.png'), b); setImageDir(dir);
});
afterAll(() => { setImageDir(null); });

const withHead = (n = 12, form: 'imgLeft' | 'imgMid' = 'imgLeft', unit?: [string, string, string]) => {
  const s = fakeState(n); if (unit) s.settings.unit = unit; const z = presetZones(form, s.settings);
  for (const zone of z) for (const it of zone) if (it.k === 'img') it.id = imgId;
  const h: DocHead = { id: 'h1', name: 'Δοκιμή', z };
  const use = { on: ['h1'], def: 'h1' };
  s.settings = { ...s.settings, heads: [h], headUse: { roster: use, check: use, reports: use, weapons: use, cadre: use, hkai: use } };
  return s;
};

describe('διάταξη της επικεφαλίδας (καθαρή)', () => {
  const col = Array.from({ length: 9 }, () => 70);
  const head = (z: DocHead['z']): DocHead => ({ id: 'x', name: 'x', z });
  it('τρία κουτιά = τρεις ομάδες στηλών που καλύπτουν όλη τη σελίδα', () => {
    const z = zonesOf(col); expect(z).toEqual([[1, 3], [4, 6], [7, 9]]);
    expect(zonesOf([100, 100])).toEqual([[1, 2], [3, 2], [3, 2]]);
    expect(zonesOf(col, [true, false, true])).toEqual([[1, 4], [5, 4], [5, 9]]);   // κενή Μέση: δανείζει το πλάτος της στα δύο διπλανά
    expect(zonesOf(col, [false, true, true])[1][0]).toBe(1);
  });
  it('γραμμές κειμένου ενωμένες στο κουτί, κενό = άδεια γραμμή, ημερομηνία στη θέση της', () => {
    const l = layoutHead({ head: head([[{ k: 'text', t: 'α' }, { k: 'gap' }, { k: 'text', t: 'β', al: 'l' }], [], [{ k: 'date' }]]), colPx: col, hdrSz: 12, img: () => null });
    expect(l.rows).toBe(3);
    expect(l.cells.map(c => [c.r, c.c1, c.c2, c.date, c.al])).toEqual([[0, 1, 4, false, 'c'], [2, 1, 4, false, 'l'], [0, 5, 9, true, 'c']]);
  });
  it('εικόνα πάνω: παίρνει γραμμές πριν από το κείμενο, ύψος σε εκατοστά, πλάτος από την αναλογία', () => {
    const l = layoutHead({ head: head([[{ k: 'img', id: 'i', h: 2 }, { k: 'text', t: 'α' }], [], []]), colPx: col, hdrSz: 12, img: () => ({ w: 120, h: 60 }) });
    expect(l.pics).toHaveLength(1); const p = l.pics[0];
    expect(p.h).toBeCloseTo(2 * CM_PX, 0); expect(p.w).toBeCloseTo(4 * CM_PX, 0); expect(p.r).toBe(0);
    expect(l.cells[0].r).toBeGreaterThan(0);
  });
  it('εικόνα δίπλα: το κείμενο στενεύει και μετακινείται', () => {
    const l = layoutHead({ head: head([[{ k: 'img', id: 'i', h: 1, side: true, al: 'l' }, { k: 'text', t: 'α' }], [], []]), colPx: col, hdrSz: 12, img: () => ({ w: 60, h: 60 }) });
    expect(l.cells[0].c1).toBeGreaterThan(1); expect(l.pics[0].r).toBe(0); expect(l.cells[0].r).toBe(0);
  });
  it('εικόνα χωρίς αρχείο ή χωρίς id δεν γράφεται', () => {
    const l = layoutHead({ head: head([[{ k: 'img', id: '', h: 2 }, { k: 'text', t: 'α' }], [], []]), colPx: col, hdrSz: 12, img: () => null });
    expect(l.pics).toHaveLength(0); expect(l.cells).toHaveLength(1);
  });
});

describe('κείμενο που δεν χωρά στο κουτί', () => {
  it('στενά κουτιά: δεν ενώνεται, δεν αναδιπλώνεται, ύψος γραμμής κανονικό (όπως στο στενό Έντυπο των 3 στηλών)', async () => {
    const s = withHead(12, 'imgLeft', ['ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)', '2η ΕΠΧΙΑ Ν/Σ', '4η ΙΛΗ']);
    const wb = await Workbook.blank('Φ'); const ws = await wb.sheet('Φ');
    ws.setColWidth(1, 6); ws.setColWidth(2, 50); ws.setColWidth(3, 8); ws.set('B10', 'x');
    const { applyHead } = await import('../src/main/headWrite');
    const r = await applyHead(wb, ws, s, s.settings.heads![0], { cols: 3, old: [], dateText: 'Αυλώνας, 13 Νοε 26' });
    const zip = await JSZip.loadAsync(await wb.save()); const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string'); const sty = await zip.file('xl/styles.xml')!.async('string');
    expect(sty).not.toMatch(/wrapText/);
    for (const m of xml.matchAll(/<row r="(\d+)"[^>]*\bht="([\d.]+)"/g)) if (+m[1] <= r.rows) expect(+m[2]).toBeLessThanOrEqual(12 * 1.5 + 0.01);
    expect(r.layout.cells.every(c => c.c1 <= c.c2)).toBe(true);
    expect(r.layout.cells.some(c => c.over && !c.date)).toBe(false);   // το αριστερό κουτί (Α+Β) τα χωρά ενωμένα
    const n = layoutHead({ head: s.settings.heads![0], colPx: [45, 45, 60], hdrSz: 12, img: () => ({ w: 120, h: 60 }) });
    const o = n.cells.filter(c => c.over && !c.date); expect(o.length).toBeGreaterThan(0);
    for (const c of o) { expect(c.c1).toBe(c.c2); expect(c.al).toBe('l'); }
  });
});

describe('γράψιμο εικόνων στο xlsx', () => {
  it('μία εικόνα: drawing, media, rels, Content_Types, <drawing r:id> και διαβάζεται από τον parseDrawings και την εκτύπωση', async () => {
    const wb = await Workbook.blank('Φ'); const ws = await wb.sheet('Φ'); ws.set('A1', 'x'); ws.set('B3', 'y');
    wb.addPicture(ws, { bytes: png(120, 60), ext: 'png', col0: 1, colOff: 0, row0: 1, rowOff: 0, w: 76, h: 38 });
    const buf = await wb.save(); const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    expect(names.some(n => /^xl\/drawings\/drawing\d+\.xml$/.test(n))).toBe(true);
    expect(names.some(n => /^xl\/media\/.+\.png$/.test(n))).toBe(true);
    expect(await zip.file('[Content_Types].xml')!.async('string')).toMatch(/drawing\+xml/);
    const sx = await zip.file('xl/worksheets/sheet1.xml')!.async('string'); expect(sx).toMatch(/<drawing r:id="[^"]+"\/>/);
    const pics = await parseDrawings(zip, 'xl/worksheets/sheet1.xml', sx); expect(pics).toHaveLength(1);
    expect(pics[0].from).toMatchObject({ c: 2, r: 2 }); expect(pics[0].cx).toBe(76 * 9525);
    const doc = await renderBook(buf, { file: 'x.xlsx' }); expect(doc.sheets[0].html).toContain('<img');
    const ex = new ExcelJS.Workbook(); await ex.xlsx.load(buf); expect(ex.getWorksheet(1)!.getImages()).toHaveLength(1);
  });
  it('δύο εικόνες στο ίδιο φύλλο: ένα drawing, δύο εικόνες', async () => {
    const wb = await Workbook.blank('Φ'); const ws = await wb.sheet('Φ'); ws.set('A1', 'x');
    for (const c of [0, 3]) wb.addPicture(ws, { bytes: png(30, 30), ext: 'png', col0: c, colOff: 0, row0: 0, rowOff: 0, w: 30, h: 30 });
    const zip = await JSZip.loadAsync(await wb.save()); const sx = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(await parseDrawings(zip, 'xl/worksheets/sheet1.xml', sx)).toHaveLength(2);
    expect(Object.keys(zip.files).filter(n => /^xl\/drawings\/drawing\d+\.xml$/.test(n))).toHaveLength(1);
  });
});

const cellsOf = async (data: Buffer, sheet = 0) => { const wb = await Workbook.open(data); const ws = await wb.sheet(wb.sheetNames()[sheet]); return { wb, ws, g: await wb.values(wb.sheetNames()[sheet], 40, 20) }; };
const nPics = async (data: Buffer) => { const zip = await JSZip.loadAsync(data); let n = 0; for (const f of Object.keys(zip.files).filter(x => /^xl\/worksheets\/sheet\d+\.xml$/.test(x))) n += (await parseDrawings(zip, f, await zip.file(f)!.async('string'))).length; return n; };

describe('Excel της εφαρμογής με επικεφαλίδα', () => {
  it('Δυναμολόγιο: οι γραμμές της μονάδας ΚΕΦΑΛΑΙΑ στη θέση τους, η εικόνα, ενωμένα κελιά, η ημερομηνία δεξιά', async () => {
    const s = withHead(12, 'imgLeft', ['κεν αυλώνα', '2η επχια', '4η ιλη']);
    const m = await rosterPrint(s, D); const r = await signMade(m.data, s, 'roster', m.marks, null, null, D);
    const { g } = await cellsOf(r.data); const flat = g.flat();
    for (const t of ['ΚΕΝ ΑΥΛΩΝΑ', '2Η ΕΠΧΙΑ', '4Η ΙΛΗ']) expect(flat).toContain(t);
    expect(await nPics(r.data)).toBeGreaterThanOrEqual(1);
    const ex = new ExcelJS.Workbook(); await ex.xlsx.load(r.data); expect(ex.worksheets.length).toBeGreaterThan(0);
    expect(r.warnings).toEqual([]);
  });
  it('Δυναμολόγιο: ο πίνακας κατεβαίνει, δεν χάνεται κανείς και οι υπογραφές είναι από κάτω', async () => {
    const s = withHead(); const plain = fakeState(12);
    const a = await rosterPrint(plain, D); const b = await rosterPrint(s, D);
    const ra = await signMade(a.data, plain, 'roster', a.marks, null, null, D), rb = await signMade(b.data, s, 'roster', b.marks, null, null, D);
    const ga = (await cellsOf(ra.data)).g.flat().filter(x => typeof x === 'string'), gb = (await cellsOf(rb.data)).g.flat().filter(x => typeof x === 'string');
    for (const p of s.people.slice(0, 12)) expect(gb).toContain(p.last.toUpperCase());
    expect(gb.length).toBeGreaterThanOrEqual(ga.length - 4);
  });
  it('Έλεγχος υπηρεσιών: επικεφαλίδα και εικόνα, και ο προεπιλεγμένος κώδικας δεν αλλάζει όταν η επικεφαλίδα είναι «Όπως σήμερα»', async () => {
    const s = withHead(); const m = await dutyCheck(s, '2026-10'); const r = await signMade(m.data, s, 'check', m.marks, null, null, D);
    expect(await nPics(r.data)).toBe(1);
    const plain = fakeState(12); const m2 = await dutyCheck(plain, '2026-10'); const r2 = await signMade(m2.data, plain, 'check', m2.marks, null, null, D);
    expect(await nPics(r2.data)).toBe(0);
    const again = await signMade(m2.data, plain, 'check', m2.marks, null, 'today', D); expect(again.data.equals(r2.data)).toBe(true);
  });
  it('headId «today» για μία φορά βγάζει τον σημερινό κώδικα, άγνωστο id επίσης', async () => {
    const s = withHead(); const m = await rosterPrint(s, D);
    expect(await nPics((await signMade(m.data, s, 'roster', m.marks, null, 'today', D)).data)).toBe(0);
    expect(await nPics((await signMade(m.data, s, 'roster', m.marks, null, null, D)).data)).toBeGreaterThan(0);
  });
  it('εικόνα που λείπει από το δίσκο: μόνο το κείμενο, χωρίς λάθος', async () => {
    const s = withHead(); for (const z of s.settings.heads![0].z) for (const it of z) if (it.k === 'img') it.id = 'a'.repeat(40);
    const m = await rosterPrint(s, D); const r = await signMade(m.data, s, 'roster', m.marks, null, null, D);
    expect(await nPics(r.data)).toBe(0); expect((await cellsOf(r.data)).g.flat().some(x => typeof x === 'string' && /ΙΛΗ|ΕΠΧΙΑ|ΚΕΤΘ/.test(x))).toBe(true);
  });
});

describe('Έντυπα με επικεφαλίδα', () => {
  const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
  const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }, { f: 'room', h: 'ΘΑΛ', w: 'narrow' as const }];
  const base: BuildOpts = { title: 'ΔΥΝΑΜΗ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray', cols };
  const make = async (s: ReturnType<typeof fakeState>, headId?: string) => {
    const r0 = rep({}); const bo = forBuild(base, r0); const b = await buildTemplate(bo, 'people'); const r = withBuilt(r0, b, bo); r.sigs = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }];
    return fillReport(b.data, s, r, s.people.slice(0, 10).map(p => p.id), D, { clock: { today: D, now: 720 }, headId });
  };
  it('Έντυπο: επικεφαλίδα ΚΕΦΑΛΑΙΑ, μία εικόνα, ο πίνακας και ο τίτλος παραμένουν', async () => {
    const s = withHead(12, 'imgLeft', ['πρώτη γραμμη', 'δευτερη', 'τριτη']);
    const o = await make(s); const { g } = await cellsOf(o.data); const flat = g.flat();
    expect(flat).toContain('ΠΡΩΤΗ ΓΡΑΜΜΗ'); expect(flat).toContain('ΔΥΝΑΜΗ'); expect(await nPics(o.data)).toBe(1);
    for (const p of s.people.slice(0, 10)) expect(flat.some(x => typeof x === 'string' && x.includes(p.last.toUpperCase()))).toBe(true);
    const ex = new ExcelJS.Workbook(); await ex.xlsx.load(o.data); expect(ex.getWorksheet(1)!.getImages()).toHaveLength(1);
    const doc = await renderBook(o.data, { file: 'x.xlsx' }); expect(doc.sheets[0].html).toContain('<img');
  });
  it('Έντυπο με «Όπως σήμερα» (ή headId today) είναι ίδιο με πριν', async () => {
    const plain = fakeState(12); const a = await make(plain); const s = withHead(); const b = await make(s, 'today');
    expect(await nPics(a.data)).toBe(0); expect(await nPics(b.data)).toBe(0);
  });
});
