// Επικεφαλίδες εγγράφων, κενά που έκλεισαν: ΗΚΑΙ πίσω όψη, δεύτερη λίστα στο ίδιο φύλλο, εικόνες όταν το φύλλο γράφεται στο Excel του χρήστη,
// εικόνες που ακολουθούν τη μετακίνηση της κεφαλίδας
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { fillFroura, fillHkai, fillOuts, signMade } from '../src/main/exports';
import { rosterPrint } from '../src/main/excel';
import { buildTemplate, fillReport, placeSheets } from '../src/main/reports';
import { Workbook } from '../src/main/xlsx';
import { parseDrawings } from '../src/main/xlDrawings';
import { renderBook } from '../src/main/print';
import { setImageDir } from '../src/main/eikones';
import { presetZones, type HeadZones } from '../src/shared/docHead';
import { defaultPick, forBuild, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-gaps-')); fs.mkdirSync(path.join(dir, 'eikones'));
  const b = png(120, 60); imgId = crypto.createHash('sha1').update(b).digest('hex'); fs.writeFileSync(path.join(dir, 'eikones', imgId + '.png'), b); setImageDir(dir);
});
afterAll(() => { setImageDir(null); });

const UNIT: [string, string, string] = ['κεν αυλωνα', '2η επχια', '4η ιλη'];
const designed = (forms: string[], z0?: (s: ReturnType<typeof fakeState>) => HeadZones) => {
  const s = fakeState(30); s.settings.unit = UNIT;
  const z = z0 ? z0(s) : presetZones('imgLeft', s.settings); for (const zone of z) for (const it of zone) if (it.k === 'img') it.id = imgId;
  const use = { on: ['h1'], def: 'h1' };
  s.settings = { ...s.settings, heads: [{ id: 'h1', name: 'Δοκιμή', z }], headUse: Object.fromEntries(forms.map(f => [f, use])) } as typeof s.settings;
  return s;
};
// οι εικόνες κάθε φύλλου: θέση (γραμμή, στήλη από 1) και αρχείο εικόνας
const picsOf = async (data: Buffer) => {
  const zip = await JSZip.loadAsync(data); const out: Record<string, { r: number; c: number; media: string }[]> = {};
  const wbx = await zip.file('xl/workbook.xml')!.async('string'); const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  for (const m of wbx.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const tg = new RegExp('<Relationship\\b[^>]*Id="' + m[2] + '"[^>]*>').exec(rels)![0]; const tp = /Target="([^"]+)"/.exec(tg)![1]; const f = tp.startsWith('/') ? tp.slice(1) : 'xl/' + tp;
    out[m[1]] = (await parseDrawings(zip, f, await zip.file(f)!.async('string'))).map(p => ({ r: p.from!.r, c: p.from!.c, media: p.media }));
  }
  return out;
};
const total = (p: Record<string, unknown[]>) => Object.values(p).reduce((a, l) => a + l.length, 0);
const texts = async (data: Buffer, name: string) => { const wb = await Workbook.open(data); return (await wb.values(name, 400, 30)).flat().filter(x => typeof x === 'string') as string[]; };

describe('ΗΚΑΙ: πίσω όψη με την ίδια επικεφαλίδα', () => {
  it('η πίσω όψη παίρνει επικεφαλίδα και εικόνα στην κορυφή, και μένουν σωστοί οι τύποι', async () => {
    const plain = fakeState(30); plain.settings.unit = UNIT; const s = designed(['hkai']);
    const a = await fillHkai(T('hkai.xlsx'), plain, D); const b = await fillHkai(T('hkai.xlsx'), s, D);
    const pa = await picsOf(a.data!), pb = await picsOf(b.data!); const names = Object.keys(pb);
    expect(total(pa)).toBe(0); expect(names.length).toBe(2); expect(names.every(n => pb[n].length === 1)).toBe(true);
    const back = names.find(n => n !== a.sheet)!;
    expect(pb[back][0].r).toBe(1);                                   // στην κορυφή
    expect(await texts(b.data!, back)).toContain('ΚΕΝ ΑΥΛΩΝΑ');
    expect(b.layout!.find(l => l.key === 'back')!.blocks.some(x => x.id === 'head')).toBe(true);
    // τα νούμερα του εντύπου μένουν ίδια
    const nums = async (data: Buffer) => (await renderBook(data, { file: 'x.xlsx' })).sheets.flatMap(sh => [...sh.html.matchAll(/<span>(-?\d+)<\/span>/g)].map(m => m[1])).sort();
    expect(await nums(b.data!)).toEqual(await nums(a.data!));
  });
  it('«Όπως σήμερα»: ίδιο αρχείο με πριν', async () => {
    const s = designed(['hkai']); const a = await fillHkai(T('hkai.xlsx'), s, D, { headId: 'today' });
    const plain = fakeState(30); plain.settings.unit = UNIT; const b = await fillHkai(T('hkai.xlsx'), plain, D);
    expect(a.data!.equals(b.data!)).toBe(true);
  });
});

describe('δύο λίστες στο ίδιο φύλλο (Εξοδούχοι και Παραμένοντες)', () => {
  // template με τις δύο λίστες το ένα κάτω από το άλλο, στο ίδιο φύλλο
  async function oneSheet(): Promise<Buffer> {
    const z = await JSZip.loadAsync(T('exodouxoi.xlsx')); const wbx = await z.file('xl/workbook.xml')!.async('string');
    const rels = await z.file('xl/_rels/workbook.xml.rels')!.async('string'); const file = (rid: string) => 'xl/' + new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="' + rid + '"').exec(rels)!.slice(1).find(Boolean)!.replace(/^\/?(xl\/)?/, '');
    const ids = [...wbx.matchAll(/<sheet\b[^>]*r:id="([^"]+)"/g)].map(m => m[1]); const [f1, f2] = ids.map(file);
    const x1 = await z.file(f1)!.async('string'), x2 = await z.file(f2)!.async('string');
    const last = Math.max(...[...x1.matchAll(/<row\b[^>]*\sr="(\d+)"/g)].map(m => +m[1])); const off = last + 2;
    const sh = (x: string) => x.replace(/(<row\b[^>]*\sr=")(\d+)(")/g, (_m, a, n, c) => a + (+n + off) + c).replace(/(<c\b[^>]*\sr="[A-Z]+)(\d+)(")/g, (_m, a, n, c) => a + (+n + off) + c);
    const rows2 = sh(/<sheetData>([\s\S]*)<\/sheetData>/.exec(x2)![1].replace(/<c\b[^>]*\sr="[A-Z]+[123]"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, ''));   // η δεύτερη λίστα χωρίς δικές της γραμμές κεφαλίδας: μία κοινή πάνω πάνω
    const merges2 = [...x2.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map(m => `<mergeCell ref="${m[1].replace(/\d+/g, n => String(+n + off))}"/>`).join('');
    let y = x1.replace('</sheetData>', rows2 + '</sheetData>');
    y = /<mergeCells\b/.test(y) ? y.replace(/<mergeCells count="\d+">/, '<mergeCells count="999">').replace('</mergeCells>', merges2 + '</mergeCells>') : y;
    z.file(f1, y);
    z.file('xl/workbook.xml', wbx.replace(new RegExp('<sheet\\b[^>]*r:id="' + ids[1] + '"[^>]*/>'), '').replace(/<definedName\b[^>]*localSheetId="1"[^>]*>[^<]*<\/definedName>/g, ''));
    return z.generateAsync({ type: 'nodebuffer' });
  }
  it('και οι δύο λίστες παίρνουν την επικεφαλίδα με την εικόνα τους, και οι άνθρωποι δεν χάνονται', async () => {
    const tpl = await oneSheet(); const s = designed(['outs']); const plain = fakeState(30); plain.settings.unit = UNIT;
    const a = await fillOuts(tpl, plain, D); const b = await fillOuts(tpl, s, D);
    const pb = await picsOf(b.data!); expect(Object.keys(pb)).toHaveLength(1);
    const list = pb[Object.keys(pb)[0]]; expect(list).toHaveLength(2); expect(list[1].r).toBeGreaterThan(list[0].r + 5);
    const t = await texts(b.data!, Object.keys(pb)[0]); expect(t.filter(x => x === 'ΚΕΝ ΑΥΛΩΝΑ')).toHaveLength(2);
    const ta = await texts(a.data!, Object.keys(pb)[0]); const names = new Set(s.people.map(x => x.last.toUpperCase()));
    expect(t.filter(x => names.has(x)).sort()).toEqual(ta.filter(x => names.has(x)).sort());   // κανείς δεν χάθηκε ούτε διπλασιάστηκε
    expect(total(await picsOf(a.data!))).toBe(0);
    const c = await fillOuts(tpl, s, D, {}, undefined, 'today'); expect(c.data!.equals(a.data!)).toBe(true);
  });
});

describe('Φύλλο μέσα στο Excel του χρήστη: οι εικόνες περνούν', () => {
  const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }];
  const base: BuildOpts = { title: 'ΔΥΝΑΜΗ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray', cols };
  async function rep(s: ReturnType<typeof fakeState>, x: Partial<Report> = {}) {
    const r0: Report = { id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x };
    const bo = forBuild(base, r0); const b = await buildTemplate(bo, 'people'); const r = withBuilt(r0, b, bo);
    return fillReport(b.data, s, r, s.people.slice(0, 6).map(p => p.id), D, { clock: { today: D, now: 720 } });
  }
  // το Excel του χρήστη: δύο φύλλα, το δεύτερο με δική του εικόνα
  async function mine(): Promise<Buffer> {
    const ex = new ExcelJS.Workbook(); ex.addWorksheet('ΑΛΛΟ').getCell('A1').value = 'x'; ex.addWorksheet('ΕΙΚΟΝΑ').getCell('A1').value = 'y';
    const id = ex.addImage({ buffer: png(40, 40) as unknown as ExcelJS.Buffer, extension: 'png' }); ex.getWorksheet('ΕΙΚΟΝΑ')!.addImage(id, { tl: { col: 2, row: 3 }, ext: { width: 40, height: 40 } });
    return Buffer.from(await ex.xlsx.writeBuffer());
  }
  it('επικεφαλίδα και δικές σου εικόνες περνούν στο φύλλο, και οι εικόνες των άλλων φύλλων μένουν ίδιες', async () => {
    const s = designed(['reports']); const img = { id: imgId, at: { rel: 'top' as const, r: 1, c: 6 }, h: 1.2 };
    const out = await rep(s, { hdId: 'h1', images: [img] }); const src = await picsOf(out.data);
    expect(total(src)).toBe(2);
    const target = await mine(); const before = await picsOf(target);
    const r1 = await placeSheets(target, out.data, [[out.sheets![0], 'ΝΕΟ']], []); expect(r1.data).toBeTruthy();
    const after = await picsOf(r1.data!);
    expect(after['ΕΙΚΟΝΑ']).toEqual(before['ΕΙΚΟΝΑ']);               // ίδια θέση και ίδιο αρχείο εικόνας
    expect(after['ΑΛΛΟ']).toEqual([]);
    expect(after['ΝΕΟ'].map(p => [p.r, p.c]).sort()).toEqual(src[out.sheets![0]].map(p => [p.r, p.c]).sort());
    // όλα τα σχέδια και οι εικόνες έχουν δικά τους ονόματα και υπάρχουν
    const zip = await JSZip.loadAsync(r1.data!); const names = Object.keys(zip.files);
    for (const f of names.filter(n => /^xl\/drawings\/_rels\/.+\.rels$/.test(n))) for (const m of (await zip.file(f)!.async('string')).matchAll(/Target="\.\.\/media\/([^"]+)"/g)) expect(names).toContain('xl/media/' + m[1]);
    const ct = await zip.file('[Content_Types].xml')!.async('string'); for (const d of names.filter(n => /^xl\/drawings\/drawing\d+\.xml$/.test(n))) expect(ct).toContain('/' + d);
    // ξαναγράφεται από πάνω (ίδιο όνομα): δεν διπλασιάζονται
    const r2 = await placeSheets(r1.data!, out.data, [[out.sheets![0], 'ΝΕΟ']], ['ΝΕΟ']); const again = await picsOf(r2.data!);
    expect(again['ΝΕΟ']).toHaveLength(2); expect(again['ΕΙΚΟΝΑ']).toEqual(before['ΕΙΚΟΝΑ']);
    expect((await Workbook.open(r2.data!)).sheetNames()).toEqual(['ΑΛΛΟ', 'ΕΙΚΟΝΑ', 'ΝΕΟ']);
  });
  it('χωρίς εικόνες το φύλλο περνά όπως πριν (καμία εικόνα)', async () => {
    const out = await rep(designed(['reports'])); expect(total(await picsOf(out.data))).toBe(0);
    const r = await placeSheets(await mine(), out.data, [[out.sheets![0], 'ΝΕΟ']], []); expect((await picsOf(r.data!))['ΝΕΟ']).toEqual([]);
  });
});

describe('οι εικόνες ακολουθούν τη μετακίνηση της κεφαλίδας', () => {
  const moveHead = (s: ReturnType<typeof fakeState>, form: 'froura' | 'roster', key: string, mv: Record<string, [number, number]>) => { s.settings = { ...s.settings, layout: { [form]: { [key]: mv } } } as typeof s.settings; return s; };
  it('ΦΡΟΥΡΑ (template): head [3, 2] κατεβάζει και μετατοπίζει την εικόνα το ίδιο', async () => {
    const a = await fillFroura(T('froura.xlsx'), designed(['froura']), D, 'sven'); const b = await fillFroura(T('froura.xlsx'), moveHead(designed(['froura']), 'froura', 'main', { head: [3, 2] }), D, 'sven');
    const pa = Object.values(await picsOf(a.data!))[0][0], pb = Object.values(await picsOf(b.data!)).flat()[0];
    expect([pb.r - pa.r, pb.c - pa.c]).toEqual([3, 2]);
    // το κουτάκι της κεφαλίδας δείχνει και την εικόνα
    const blk = b.layout![0].blocks.find(x => x.id === 'head')!; expect(blk.r1).toBeLessThanOrEqual(pb.r); expect(blk.c1).toBeLessThanOrEqual(pb.c);
  });
  it('ημερομηνία: η εικόνα που κάθεται στο κουτί της ημερομηνίας την ακολουθεί, της κεφαλίδας μένει', async () => {
    const z = (s: ReturnType<typeof fakeState>): HeadZones => [[{ k: 'text', t: 'α' }, { k: 'img', id: '', h: 1.5, al: 'c' }], [], [{ k: 'date' }, { k: 'img', id: '', h: 1.2, al: 'c' }]];
    const A = designed(['froura'], z);
    const a = await fillFroura(T('froura.xlsx'), A, D, 'sven'); const b = await fillFroura(T('froura.xlsx'), moveHead(designed(['froura'], z), 'froura', 'main', { date: [2, 0] }), D, 'sven');
    const pa = Object.values(await picsOf(a.data!)).flat(), pb = Object.values(await picsOf(b.data!)).flat();
    expect(pa).toHaveLength(2); expect(pb).toHaveLength(2);
    const key = (p: { r: number; c: number }) => p.c; const sa = [...pa].sort((x, y) => key(x) - key(y)), sb = [...pb].sort((x, y) => key(x) - key(y));
    expect(sb[0].r - sa[0].r).toBe(0);           // αριστερή (κεφαλίδα) στη θέση της
    expect(sb[1].r - sa[1].r).toBe(2);           // δεξιά (ημερομηνία) κατεβαίνει 2
  });
  it('Δυναμολόγιο (made) και Έντυπο: το ίδιο', async () => {
    const s = designed(['roster']); const m = await rosterPrint(s, D); const r = await signMade(m.data, s, 'roster', m.marks, null, null, D);
    const key = r.layout[0].key; const s2 = moveHead(designed(['roster']), 'roster', key, { head: [2, 1] }); const m2 = await rosterPrint(s2, D); const r2 = await signMade(m2.data, s2, 'roster', m2.marks, null, null, D);
    const p1 = Object.values(await picsOf(r.data)).flat()[0], p2 = Object.values(await picsOf(r2.data)).flat()[0];
    expect([p2.r - p1.r, p2.c - p1.c]).toEqual([2, 1]);
    // Έντυπο
    const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }];
    const base: BuildOpts = { title: 'ΔΥΝΑΜΗ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray', cols };
    const rs = designed(['reports']); const r0: Report = { id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', hdId: 'h1' };
    const bo = forBuild(base, r0); const b = await buildTemplate(bo, 'people'); const rep = withBuilt(r0, b, bo); const ids = rs.people.slice(0, 6).map(p => p.id); const o = { clock: { today: D, now: 720 } };
    const e1 = await fillReport(b.data, rs, rep, ids, D, o); const e2 = await fillReport(b.data, rs, { ...rep, layout: { head: [4, 1] } }, ids, D, o);
    const q1 = Object.values(await picsOf(e1.data)).flat()[0], q2 = Object.values(await picsOf(e2.data)).flat()[0];
    expect([q2.r - q1.r, q2.c - q1.c]).toEqual([4, 1]);
  });
});
