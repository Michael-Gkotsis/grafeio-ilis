// Έντυπα: επικεφαλίδα ανά έντυπο (Report.hdId) και δικές σου εικόνες πάνω στο χαρτί (Report.images)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import JSZip from 'jszip';
import { buildTemplate, fillReport } from '../src/main/reports';
import { Workbook } from '../src/main/xlsx';
import { parseDrawings } from '../src/main/xlDrawings';
import { setImageDir } from '../src/main/eikones';
import { apply, type Ctx } from '../src/shared/commands';
import { removeHead, type DocHead } from '../src/shared/docHead';
import { cleanImages, defaultPick, forBuild, withBuilt, type BuildOpts, type RepImage, type Report } from '../src/shared/reports';
import { fakeState } from './fixtures';

const D = '2026-10-19';
function png(w: number, h: number): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 200; raw[o + 1] = 30; raw[o + 2] = 30; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
let imgId = '';
beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-rimg-')); fs.mkdirSync(path.join(dir, 'eikones'));
  const b = png(120, 60); imgId = crypto.createHash('sha1').update(b).digest('hex'); fs.writeFileSync(path.join(dir, 'eikones', imgId + '.png'), b); setImageDir(dir);
});
afterAll(() => { setImageDir(null); });

const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }, { f: 'room', h: 'ΘΑΛ', w: 'narrow' as const }, { f: 'phone', h: 'ΤΗΛ', w: 'auto' as const }];
const base: BuildOpts = { title: 'ΔΥΝΑΜΗ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray', cols };
const HEAD: DocHead = { id: 'h1', name: 'Κείμενο', z: [[{ k: 'text', t: 'ΚΕΝ αυλωνα' }, { k: 'text', t: 'δευτερη' }, { k: 'text', t: 'τριτη' }], [], [{ k: 'date' }]] };
const stateWith = (n: number, withHead: boolean) => { const s = fakeState(40); if (withHead) s.settings = { ...s.settings, heads: [HEAD], headUse: { reports: { on: ['today', 'h1'], def: 'h1' } } }; void n; return s; };
async function make(s: ReturnType<typeof fakeState>, n: number, x: Partial<Report> = {}) {
  const r0: Report = { id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x };
  const bo = forBuild(base, r0); const b = await buildTemplate(bo, 'people'); const r = withBuilt(r0, b, bo); r.sigs = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }, { art: 'Ο', title: 'ΔΙΟΙΚΗΤΗΣ' }];
  const out = await fillReport(b.data, s, r, s.people.slice(0, n).map(p => p.id), D, { clock: { today: D, now: 720 } });
  const zip = await JSZip.loadAsync(out.data); const sx = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  return { out, pics: await parseDrawings(zip, 'xl/worksheets/sheet1.xml', sx) };
}
const IMGS: RepImage[] = [{ id: imgId, at: { rel: 'top', r: 1, c: 3 }, h: 1.5 }, { id: imgId, at: { rel: 'foot', r: 2, c: 1 }, h: 1 }];
const withImgs = (): RepImage[] => IMGS.map(x => ({ ...x, id: imgId }));

describe('Έντυπα: επικεφαλίδα ανά έντυπο', () => {
  it('παλιό έντυπο (χωρίς hdId) βγαίνει όπως πάντα, ακόμα κι αν η αρχική της γραμμής «Έντυπα» είναι άλλη', async () => {
    const a = await make(stateWith(10, false), 10); const b = await make(stateWith(10, true), 10);
    expect(b.out.data.equals(a.out.data)).toBe(true);
  });
  it('με hdId: γράφεται η επικεφαλίδα· με headId «today» (μία φορά) όπως πριν', async () => {
    const s = stateWith(10, true); const a = await make(stateWith(10, false), 10); const b = await make(s, 10, { hdId: 'h1' });
    expect(b.out.data.equals(a.out.data)).toBe(false);
    const wb = await Workbook.open(b.out.data); expect((await wb.values(wb.sheetNames()[0], 30, 8)).flat()).toContain('ΚΕΝ ΑΥΛΩΝΑ');
    const r0: Report = { id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', hdId: 'h1' };
    const bo = forBuild(base, r0); const bt = await buildTemplate(bo, 'people'); const r = withBuilt(r0, bt, bo); r.sigs = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }, { art: 'Ο', title: 'ΔΙΟΙΚΗΤΗΣ' }];
    const t = await fillReport(bt.data, s, r, s.people.slice(0, 10).map(p => p.id), D, { clock: { today: D, now: 720 }, headId: 'today' });
    expect(t.data.equals(a.out.data)).toBe(true);
  });
  it('σβήσιμο επικεφαλίδας: τα έντυπα που τη χρησιμοποιούσαν γυρνούν στην «Όπως σήμερα»', () => {
    const s = stateWith(0, true); const rep = (id: string, hdId?: string): Report => ({ id, name: id, tpl: 't', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...(hdId ? { hdId } : {}) });
    s.settings.reports = [rep('a', 'h1'), rep('b'), rep('c', 'today')];
    const ctx: Ctx = { today: D, newId: () => 'n' };
    const next = apply(s, { t: 'setSettings', settings: removeHead(s.settings, 'h1'), text: 'x' }, ctx).state;
    expect(next.settings.heads).toBeUndefined(); expect(next.settings.reports!.map(r => r.hdId)).toEqual([undefined, undefined, undefined]);
  });
});

describe('Έντυπα: εικόνες πάνω στο χαρτί', () => {
  it('cleanImages: άκυρα id και τιμές καθαρίζονται', () => {
    expect(cleanImages([{ id: 'x', at: { rel: 'top', r: 1, c: 1 }, h: 2 }])).toBeUndefined();
    const c = cleanImages([{ id: imgId, at: { rel: 'foot', r: -5, c: 999 }, h: 99, pages: 'all', gray: true }])!;
    expect(c[0]).toMatchObject({ at: { rel: 'foot', r: 1, c: 60 }, h: 12, pages: 'all', gray: true });
  });
  it('δύο εικόνες: πάνω από τον πίνακα (από την κορυφή) και κάτω από αυτόν (από την τελευταία γραμμή), και ακολουθεί όταν το έντυπο μακραίνει', async () => {
    const s = stateWith(0, true); const a = await make(s, 6, { hdId: 'h1', images: withImgs() }); const b = await make(s, 16, { hdId: 'h1', images: withImgs() });
    expect(a.pics).toHaveLength(2); expect(b.pics).toHaveLength(2);
    const top = (x: typeof a) => x.pics.find(p => p.from!.c === 3)!, foot = (x: typeof a) => x.pics.find(p => p.from!.c === 1)!;
    expect(top(a).from!.r).toBe(1); expect(top(b).from!.r).toBe(1);   // πάνω: μένει στην κορυφή
    expect(foot(b).from!.r - foot(a).from!.r).toBe(10);                // κάτω: κατεβαίνει όσες γραμμές πρόσθεσε ο πίνακας
    expect(top(a).cy).toBe(Math.round(1.5 * (96 / 2.54) * 9525)); expect(top(a).cx).toBe(Math.round(top(a).cy * 2));
    expect(foot(a).from!.r).toBeGreaterThan(8);
    expect(a.out.layout[0].blocks.filter(x => /^img/.test(x.id)).map(x => x.id)).toEqual(['img0', 'img1']); expect(a.out.layout[0].end).toBeGreaterThan(5);
  });
  it('«Σε όλες»: η εικόνα πάνω από τον πίνακα μπαίνει στις γραμμές που επαναλαμβάνονται, κάτω από τον πίνακα όχι', async () => {
    const s = stateWith(0, false); const im = withImgs(); im[0].pages = 'all'; im[1].pages = 'all';
    const a = await make(s, 6, { images: im }); const zip = await JSZip.loadAsync(a.out.data); const wbx = await zip.file('xl/workbook.xml')!.async('string');
    expect(/Print_Titles[^>]*>[^<]*\$1:\$\d+/.test(wbx)).toBe(true);
    const b = await make(s, 6, { images: [{ ...im[1] }] }); const wbx2 = await (await JSZip.loadAsync(b.out.data)).file('xl/workbook.xml')!.async('string');
    expect(/Print_Titles[^>]*>[^<]*\$1:\$\d+/.test(wbx2)).toBe(false);
  });
  it('εικόνα χωρίς αρχείο ή με άδειο id δεν γράφεται· χωρίς εικόνες δεν αλλάζει τίποτα', async () => {
    const s = stateWith(0, false); const none = await make(s, 8);
    const m = await make(s, 8, { images: [{ id: 'b'.repeat(40), at: { rel: 'top', r: 1, c: 1 }, h: 2 }, { id: '', at: { rel: 'top', r: 1, c: 1 }, h: 2 }] });
    expect(m.pics).toHaveLength(0); expect(m.out.data.equals(none.out.data)).toBe(true);
  });
});
