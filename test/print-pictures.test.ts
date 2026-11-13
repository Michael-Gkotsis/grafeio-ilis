// Εικόνες στην εκτύπωση και στην προεπισκόπηση (print.ts + xlDrawings.ts)
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import JSZip from 'jszip';
import { rosterPrint } from '../src/main/excel';
import { fillFroura, fillHkai, fillOuts } from '../src/main/exports';
import { PRINT_DEFAULT, renderBook, type PrintOpts } from '../src/main/print';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const sha = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
// 1x1 PNG (κόκκινο)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

// Αρχεία χωρίς εικόνες: ίδιο HTML byte προς byte με πριν (τα hash πάρθηκαν από την υλοποίηση πριν τις εικόνες)
describe('χωρίς εικόνες, τίποτα δεν αλλάζει', () => {
  const D = '2026-10-12'; const s = fakeState(30);
  const files: [string, () => Promise<Buffer | Uint8Array>][] = [
    ['hkai', () => Promise.resolve(T('hkai.xlsx'))], ['froura', () => Promise.resolve(T('froura.xlsx'))], ['froura-spen', () => Promise.resolve(T('froura-spen.xlsx'))], ['exodouxoi', () => Promise.resolve(T('exodouxoi.xlsx'))],
    ['fill-hkai', async () => (await fillHkai(T('hkai.xlsx'), s, D)).data], ['fill-froura', async () => (await fillFroura(T('froura.xlsx'), s, D, 'sven')).data], ['fill-outs', async () => (await fillOuts(T('exodouxoi.xlsx'), s, D)).data]
  ];
  const HASH: Record<string, string> = {
    'hkai': '4af69b8ec2d22f58/4cc2d40d06a54a8f',
    'froura': '2a2f8450506f3bfa/02f31a002126917d',
    'froura-spen': '99a6928d61607219/6b472816ee57350c',
    'exodouxoi': '557f273745515d35/88e22c25eb96a371',
    'fill-hkai': '6a93832407123c92/51d17e98fe9588b7',
    'fill-froura': '152680e298c9ba5b/ec6a6ecb0df8cd2e',
    'fill-outs': '694958a78e1d6a25/0d7147193500866b'
  };
  for (const [name, get] of files) {
    it(name, async () => {
      const buf = await get();
      const a = await renderBook(buf, { file: name + '.xlsx' }); const b = await renderBook(buf, { file: name + '.xlsx', layout: PRINT_DEFAULT });
      const h = sha(a.sheets.map(x => x.html).join('|') + '#' + a.css) + '/' + sha(b.sheets.map(x => x.html).join('|') + '#' + b.css);
      if (process.env.REC) console.log('HASH', name, h); else expect(h).toBe(HASH[name]);
      expect(a.sheets.every(x => !x.html.includes('<img'))).toBe(true);
    });
  }
});

// Μικρό βιβλίο με εικόνες: στήλες 70 px, γραμμές 40 px (30 pt), 1 px = 9525 EMU
const EMU = 9525;
const anchors = (a: string) => `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${a}</xdr:wsDr>`;
const pic = (rid: string, extra = '') => `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Εικόνα 1"${extra}/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/></xdr:blipFill><xdr:spPr/></xdr:pic>`;
const from = (c: number, r: number, co = 0, ro = 0) => `<xdr:from><xdr:col>${c}</xdr:col><xdr:colOff>${co}</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>${ro}</xdr:rowOff></xdr:from>`;
const to = (c: number, r: number, co = 0, ro = 0) => `<xdr:to><xdr:col>${c}</xdr:col><xdr:colOff>${co}</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>${ro}</xdr:rowOff></xdr:to>`;
const one = (c: number, r: number, co: number, ro: number, wpx: number, hpx: number, rid = 'rId1', extra = '') => `<xdr:oneCellAnchor>${from(c, r, co, ro)}<xdr:ext cx="${wpx * EMU}" cy="${hpx * EMU}"/>${pic(rid, extra)}<xdr:clientData/></xdr:oneCellAnchor>`;
const two = (f: string, t: string, rid = 'rId1') => `<xdr:twoCellAnchor editAs="oneCell">${f}${t}${pic(rid)}<xdr:clientData/></xdr:twoCellAnchor>`;
const abs = (x: number, y: number, wpx: number, hpx: number, rid = 'rId1') => `<xdr:absoluteAnchor><xdr:pos x="${x * EMU}" y="${y * EMU}"/><xdr:ext cx="${wpx * EMU}" cy="${hpx * EMU}"/>${pic(rid)}<xdr:clientData/></xdr:absoluteAnchor>`;

async function withDrawing(drawing: string, media: Record<string, Buffer>, rows = 6, sheetExtra = '', rels = '<Relationship Id="rId1" Target="../media/image1.png"/>'): Promise<Buffer> {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  z.file('xl/workbook.xml', '<workbook><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Φ1" sheetId="1" r:id="rId1"/></sheets></workbook>');
  z.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  const data = Array.from({ length: rows }, (_, i) => `<row r="${i + 1}" ht="30" customHeight="1">${['A', 'B', 'C', 'D'].map(c => `<c r="${c}${i + 1}" t="inlineStr"><is><t>x</t></is></c>`).join('')}</row>`).join('');
  z.file('xl/worksheets/sheet1.xml', `<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><cols><col min="1" max="4" width="10" customWidth="1"/></cols><sheetData>${data}</sheetData>${sheetExtra}<drawing r:id="rId9"/></worksheet>`);
  z.file('xl/worksheets/_rels/sheet1.xml.rels', '<Relationships><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
  z.file('xl/drawings/drawing1.xml', drawing);
  z.file('xl/drawings/_rels/drawing1.xml.rels', `<Relationships>${rels}</Relationships>`);
  for (const [n, b] of Object.entries(media)) z.file('xl/media/' + n, b);
  z.file('xl/styles.xml', '<styleSheet><fonts><font><sz val="11"/><name val="Calibri"/></font></fonts><fills><fill><patternFill/></fill></fills><borders><border/></borders><cellXfs><xf/></cellXfs></styleSheet>');
  return z.generateAsync({ type: 'nodebuffer' });
}
const imgs = (html: string) => [...html.matchAll(/<img src="(data:[^"]+)" alt="" draggable="false" style="position:absolute;left:([\d.]+)px;top:([\d.]+)px;width:([\d.]+)px;height:([\d.]+)px/g)].map(m => ({ src: m[1], l: +m[2], t: +m[3], w: +m[4], h: +m[5] }));
const render = async (buf: Buffer, layout = false) => (await renderBook(buf, { file: 'x.xlsx', ...(layout ? { layout: PRINT_DEFAULT } : {}) })).sheets[0].html;

describe('εικόνες στα φύλλα', () => {
  it('oneCellAnchor: θέση από στήλες και γραμμές + μετατόπιση, μέγεθος από το ext', async () => {
    const h = await render(await withDrawing(anchors(one(1, 1, 10 * EMU, 20 * EMU, 100, 50)), { 'image1.png': PNG }));
    const p = imgs(h); expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ l: 80, t: 60, w: 100, h: 50 }); expect(p[0].src.startsWith('data:image/png;base64,')).toBe(true);
    // μέσα στο .ar (μεγαλώνει με την κλίμακα της σελίδας) και δεν πιάνει κλικ
    expect(h).toMatch(/<\/table><div style="position:absolute;left:0;top:0;width:280\.00px;height:240\.00px;overflow:hidden;pointer-events:none"><img /);
  });
  it('twoCellAnchor: το μέγεθος από τα δύο κελιά', async () => {
    const h = await render(await withDrawing(anchors(two(from(0, 0), to(2, 2, 5 * EMU, 0))), { 'image1.png': PNG }));
    expect(imgs(h)).toMatchObject([{ l: 0, t: 0, w: 145, h: 80 }]);
  });
  it('absoluteAnchor: θέση από την πάνω αριστερή άκρη του φύλλου', async () => {
    const h = await render(await withDrawing(anchors(abs(75, 45, 20, 10)), { 'image1.png': PNG }));
    expect(imgs(h)).toMatchObject([{ l: 75, t: 45, w: 20, h: 10 }]);
  });
  it('JPEG και GIF, και ξεχωριστή εικόνα ανά anchor', async () => {
    const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const rels = '<Relationship Id="rId1" Target="../media/a.jpg"/><Relationship Id="rId2" Target="/xl/media/b.gif"/>';
    const h = await render(await withDrawing(anchors(one(0, 0, 0, 0, 10, 10, 'rId1') + one(2, 2, 0, 0, 10, 10, 'rId2')), { 'a.jpg': JPG, 'b.gif': GIF }, 6, '', rels));
    const p = imgs(h); expect(p.map(x => x.src.slice(0, 15))).toEqual(['data:image/jpeg', 'data:image/gif;']);
  });
  it('EMF, κρυμμένες και άγνωστες εικόνες αγνοούνται σιωπηλά', async () => {
    const EMF = Buffer.from([1, 0, 0, 0, 0x6c, 0, 0, 0, 0, 0, 0, 0]);
    const rels = '<Relationship Id="rId1" Target="../media/a.emf"/><Relationship Id="rId2" Target="../media/image1.png"/>';
    const h = await render(await withDrawing(anchors(one(0, 0, 0, 0, 10, 10, 'rId1') + one(1, 1, 0, 0, 10, 10, 'rId2', ' hidden="1"') + one(1, 1, 0, 0, 10, 10, 'rId7')), { 'a.emf': EMF, 'image1.png': PNG }, 6, '', rels));
    expect(imgs(h)).toEqual([]); expect(h).not.toContain('<img');
  });
  it('εκτός περιοχής εκτύπωσης ή σε κρυμμένη γραμμή: δεν βγαίνει', async () => {
    const hid = '<sheetFormatPr defaultRowHeight="30"/>';
    const buf = await withDrawing(anchors(one(0, 40, 0, 0, 10, 10) + one(0, 2, 0, 0, 10, 10) + one(5, 0, 0, 0, 10, 10) + one(3, 3, 0, 0, 10, 10)), { 'image1.png': PNG }, 6, hid);
    const z = await JSZip.loadAsync(buf); const x = (await z.file('xl/worksheets/sheet1.xml')!.async('string')).replace('<row r="3" ht="30" customHeight="1">', '<row r="3" ht="30" customHeight="1" hidden="1">');
    z.file('xl/worksheets/sheet1.xml', x);
    const h = await render(await z.generateAsync({ type: 'nodebuffer' }));
    expect(imgs(h)).toMatchObject([{ l: 210, t: 80 }]);   // μόνο D4 (η γραμμή 3 είναι κρυμμένη, η 41 και η στήλη F είναι έξω)
  });
  it('σε πολλές σελίδες: η εικόνα μόνο στη σελίδα του κελιού της και κομμένη στην περιοχή της', async () => {
    const rows = 40; const ps = '<pageSetup paperSize="9" scale="100"/>';
    const buf = await withDrawing(anchors(one(0, 0, 0, 0, 30, 30) + one(0, 35, 0, 0, 30, 30)), { 'image1.png': PNG }, rows, ps);
    const d = await renderBook(buf, { file: 'x.xlsx' }); const pages = d.sheets[0].html.split('<div class="pg"').slice(1);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.map(p => imgs(p).length)).toEqual(pages.map((_, i) => (i === 0 || i === pages.length - 1 ? 1 : 0)));
  });
  it('ταξινόμηση: μένουν μόνο οι εικόνες πάνω από τα δεδομένα του πίνακα (το λογότυπο)', async () => {
    const S = fakeState(40); const dyn = await rosterPrint(S, '2026-10-12');
    const rowsOf = (html: string) => [...html.matchAll(/<tr data-r="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)].map(m => ({ r: +m[1], t: m[2] }));
    const plain = await renderBook(dyn.data, { file: dyn.name, layout: PRINT_DEFAULT });
    const rs = rowsOf(plain.sheets[0].html); const head = rs.find(x => x.t.includes('ΘΑΛΑΜΟΣ'))!.r;
    const z = await JSZip.loadAsync(dyn.data); const sp = 'xl/worksheets/sheet1.xml';
    z.file(sp, (await z.file(sp)!.async('string')).replace('</worksheet>', '<drawing r:id="rId9"/></worksheet>'));
    z.file('xl/worksheets/_rels/sheet1.xml.rels', '<Relationships><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
    z.file('xl/drawings/drawing1.xml', anchors(one(0, 0, 0, 0, 20, 20) + one(1, head + 2, 0, 0, 20, 20)));   // πάνω αριστερά (λογότυπο) και μέσα στα δεδομένα
    z.file('xl/drawings/_rels/drawing1.xml.rels', '<Relationships><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>'); z.file('xl/media/image1.png', PNG);
    const buf = await z.generateAsync({ type: 'nodebuffer' });
    const count = async (o: PrintOpts) => { const d = await renderBook(buf, { file: dyn.name, layout: o }); return d.sheets.reduce((a, x) => a + imgs(x.html).length, 0); };
    expect(await count(PRINT_DEFAULT)).toBe(2);
    expect(await count({ ...PRINT_DEFAULT, sort: [{ c: 'ΕΠΙΘΕΤΟ', d: true }] })).toBe(1);
  });
  it('η εικόνα διαβάζεται μία φορά και χρησιμοποιείται σε κάθε σελίδα όπου πέφτει το κελί της', async () => {
    const buf = await withDrawing(anchors(one(0, 0, 0, 0, 10, 10) + one(2, 1, 0, 0, 10, 10)), { 'image1.png': PNG });
    const p = imgs(await render(buf)); expect(p).toHaveLength(2); expect(p[0].src).toBe(p[1].src);
  });
});
