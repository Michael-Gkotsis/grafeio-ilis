// Ημερήσια Διαταγή: η επικεφαλίδα που σχεδίασες στο Word (hdDocx.ts), στην εκτύπωση (Excel) και στην οθόνη (hdPageHtml)
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import JSZip from 'jszip';
import { builtinTemplate, checkTemplate, fillDocx, makeHdDocx } from '../src/main/hdDocx';
import { hdBook } from '../src/main/excel';
import { designMade } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { parseDrawings } from '../src/main/xlDrawings';
import { setImageDir } from '../src/main/eikones';
import { presetZones, type DocHead } from '../src/shared/docHead';
import { HD_SECTIONS, hdAuto, hdHeadDate, hdPageHtml, hdTags } from '../src/shared/hd';
import { fakeState } from './fixtures';

const D = '2026-10-12';
function png(w: number, h: number): Buffer {
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 200; raw[o + 1] = 30; raw[o + 2] = 30; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
let imgId = '';
beforeAll(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-hdd-')); fs.mkdirSync(path.join(dir, 'eikones'));
  const b = png(120, 60); imgId = crypto.createHash('sha1').update(b).digest('hex'); fs.writeFileSync(path.join(dir, 'eikones', imgId + '.png'), b); setImageDir(dir);
});
afterAll(() => { setImageDir(null); });

const st = () => { const s = fakeState(20); s.settings.unit = ['κεν αυλωνα', '2η επχια', '4η ιλη']; return s; };
const head = (s: ReturnType<typeof st>): DocHead => { const z = presetZones('imgLeft', s.settings); for (const zone of z) for (const it of zone) if (it.k === 'img') it.id = imgId; return { id: 'h1', name: 'Δοκιμή', z }; };
const tagsOf = (s: ReturnType<typeof st>) => hdTags(s.settings, D, hdAuto(s, D), []);
const O = (s: ReturnType<typeof st>) => ({ dateText: hdHeadDate(s.settings, D), font: 'Arial' });
const doc = async (b: Buffer) => { const z = await JSZip.loadAsync(b); return { z, xml: await z.file('word/document.xml')!.async('string') }; };

// δικό σου πρότυπο: ένα έγγραφο με ετικέτες, με ή χωρίς {ΚΕΦΑΛΙΔΑ}
async function own(withTag: boolean): Promise<Buffer> {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('ΜΟΝΑΔΑ: {ΜΟΝΑΔΑ}')}${withTag ? p('{ΚΕΦΑΛΙΔΑ}') : ''}${p('ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ ΤΗΣ {ΗΜΕΡΟΜΗΝΙΑ}')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return z.generateAsync({ type: 'nodebuffer' });
}

describe('Ημερήσια Διαταγή: Word με επικεφαλίδα', () => {
  it('έτοιμο πρότυπο: πίνακας 3 κελιών, κεφαλαία, μία εικόνα inline με σχέση και τύπο αρχείου', async () => {
    const s = st(); const b = await makeHdDocx(null, tagsOf(s), head(s), O(s)); const { z, xml } = await doc(b);
    const first = xml.slice(xml.indexOf('<w:body>'), xml.indexOf('<w:tbl>', xml.indexOf('<w:tbl>') + 1));
    expect((xml.match(/<w:tbl>/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(xml.slice(xml.indexOf('<w:body>')).startsWith('<w:body><w:tbl>')).toBe(true);
    const hdTbl = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>') + 8);
    expect((hdTbl.match(/<w:tc>/g) || []).length).toBe(2);   // εικόνα και γραμμές μονάδας αριστερά, ημερομηνία δεξιά: η Μέση είναι κενή
    for (const t of ['ΚΕΝ ΑΥΛΩΝΑ', '2Η ΕΠΧΙΑ', '4Η ΙΛΗ']) expect(xml).toContain(t);
    expect(xml).not.toContain('ΜΟΝΑΔΑ: ');   // η γραμμή «ΜΟΝΑΔΑ» αντικαταστάθηκε
    expect(xml).not.toContain('\u0001'); expect(xml).not.toContain('{ΚΕΦΑΛΙΔΑ}');
    expect(xml).toContain('ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ ΤΗΣ');
    expect((xml.match(/<wp:inline\b/g) || []).length).toBe(1);
    const rid = /r:embed="([^"]+)"/.exec(xml)![1]; const rels = await z.file('word/_rels/document.xml.rels')!.async('string');
    const target = new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"').exec(rels)![1]; expect(z.file('word/' + target)).toBeTruthy();
    expect(await z.file('[Content_Types].xml')!.async('string')).toMatch(/Extension="png"/);
    const ext = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml)!; expect(+ext[2]).toBe(2 * 360000); expect(+ext[1]).toBe(4 * 360000);   // 2 εκ. ύψος, αναλογία 2:1
    expect(first.length).toBeGreaterThan(0);
  });
  it('δικό πρότυπο με {ΚΕΦΑΛΙΔΑ}: ο πίνακας στη θέση της παραγράφου', async () => {
    const s = st(); const b = await makeHdDocx(await own(true), tagsOf(s), head(s), O(s)); const { xml } = await doc(b);
    const iT = xml.indexOf('<w:tbl>'); expect(iT).toBeGreaterThan(xml.indexOf('ΜΟΝΑΔΑ: ')); expect(iT).toBeLessThan(xml.indexOf('ΗΜΕΡΗΣΙΑ ΔΙΑΤΑΓΗ'));
    expect(xml).toContain('ΜΟΝΑΔΑ: ΚΕΝ ΑΥΛΩΝΑ'); expect((xml.match(/<wp:inline\b/g) || []).length).toBe(1);
  });
  it('δικό πρότυπο χωρίς {ΚΕΦΑΛΙΔΑ}: ο πίνακας πρώτο στοιχείο του σώματος', async () => {
    const s = st(); const b = await makeHdDocx(await own(false), tagsOf(s), head(s), O(s)); const { xml } = await doc(b);
    expect(xml.slice(xml.indexOf('<w:body>')).startsWith('<w:body><w:tbl>')).toBe(true); expect((xml.match(/<wp:inline\b/g) || []).length).toBe(1);
  });
  it('«Όπως σήμερα»: ίδια byte με πριν, και η ετικέτα {ΚΕΦΑΛΙΔΑ} γράφει τη μονάδα', async () => {
    const s = st(); const t = tagsOf(s); const { ΚΕΦΑΛΙΔΑ: _k, ...old } = t; void _k;
    const a = await makeHdDocx(null, t, null, O(s)); const b = await fillDocx(await builtinTemplate(), old);
    expect(a.equals(b)).toBe(true);
    const x = (await doc(await makeHdDocx(await own(true), t, null, O(s)))).xml; expect(x).not.toContain('{ΚΕΦΑΛΙΔΑ}'); expect(x).toContain('ΚΕΝ ΑΥΛΩΝΑ/2Η ΕΠΧΙΑ/4Η ΙΛΗ');
  });
  it('ο έλεγχος προτύπου δέχεται ένα αρχείο μόνο με {ΚΕΦΑΛΙΔΑ}', async () => {
    const z = await JSZip.loadAsync(await own(true)); z.file('word/document.xml', (await z.file('word/document.xml')!.async('string')).replace(/\{(ΜΟΝΑΔΑ|ΗΜΕΡΟΜΗΝΙΑ)\}/g, 'x'));
    expect(await checkTemplate(await z.generateAsync({ type: 'nodebuffer' }))).toBeNull();
  });
  it('soffice: το docx με την εικόνα γίνεται PDF', async () => {
    const { spawnSync } = await import('child_process'); if (spawnSync('which', ['soffice']).status !== 0) return;
    const s = st(); const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gi-hdd-pdf-')); const f = path.join(d, 'hd.docx'); fs.writeFileSync(f, await makeHdDocx(null, tagsOf(s), head(s), O(s)));
    const r = spawnSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', d, f], { timeout: 120000 });
    expect(r.status).toBe(0); expect(fs.statSync(path.join(d, 'hd.pdf')).size).toBeGreaterThan(1000);
  }, 130000);
});

describe('Ημερήσια Διαταγή: εκτύπωση και οθόνη', () => {
  it('εκτύπωση (Excel): επικεφαλίδα κεφαλαία και μία εικόνα, χωρίς αλλαγή με «Όπως σήμερα»', async () => {
    const s = st(); const r = await hdBook(s, D, tagsOf(s), HD_SECTIONS);
    const same = await designMade(r.data, s, 'hd', r.marks, null, hdHeadDate(s.settings, D)); expect(same.equals(r.data)).toBe(true);
    const s2 = st(); const hd = head(s2); const use = { on: ['h1'], def: 'h1' }; s2.settings = { ...s2.settings, heads: [hd], headUse: { hd: use } };
    const out = await designMade(r.data, s2, 'hd', r.marks, null, hdHeadDate(s2.settings, D));
    const wb = await Workbook.open(out); const g = (await wb.values(wb.sheetNames()[0], 40, 6)).flat();
    expect(g).toContain('ΚΕΝ ΑΥΛΩΝΑ'); expect(g.some(x => typeof x === 'string' && x.startsWith('ΜΟΝΑΔΑ:'))).toBe(false); expect(g).toContain('ΑΥΔΜ');
    const zip = await JSZip.loadAsync(out); const sx = await zip.file('xl/worksheets/sheet1.xml')!.async('string'); expect(await parseDrawings(zip, 'xl/worksheets/sheet1.xml', sx)).toHaveLength(1);
  });
  it('οθόνη: με επικεφαλίδα τρία κουτιά και εικόνα, χωρίς αυτήν όπως πάντα', () => {
    const s = st(); const t = tagsOf(s); const plain = hdPageHtml(t, 12);
    expect(plain).toContain('ΜΟΝΑΔΑ: ' + t['ΜΟΝΑΔΑ']); expect(hdPageHtml(t, 12, null)).toBe(plain);
    const h = hdPageHtml(t, 12, { head: head(s), date: hdHeadDate(s.settings, D), img: () => 'data:image/png;base64,AA==' });
    expect(h).toContain('class="hdh"'); expect(h).toContain('<img'); expect(h).toContain('ΚΕΝ ΑΥΛΩΝΑ'); expect(h).not.toContain('ΜΟΝΑΔΑ: ' + t['ΜΟΝΑΔΑ']);
  });
});
