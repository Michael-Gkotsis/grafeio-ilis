// Παράθυρο «Εκτύπωση» (Michael, 20/10): στήλες πάντα στο πλάτος, γραμμές σε 1, 2, 3 ή όσες σελίδες, ίδια γράμματα σε όλες
// τις σελίδες (και μπρος-πίσω), θάλαμος και υπογραφές δεν κόβονται, αλλαγή σελίδας με κλικ, ρυθμίσεις ανά έντυπο
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { apply, type Ctx } from '../src/shared/commands';
import { fillHkai } from '../src/main/exports';
import { rosterPrint } from '../src/main/excel';
import { cleanOpts, previewHtml, printDefaults, printKey, PRINT_DEFAULT, renderBook, type PrintOpts } from '../src/main/print';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'x' + ++seq };
const cells = (html: string) => [...html.matchAll(/<span>([^<]*)<\/span>/g)].map(m => m[1]);
const pagesOf = (html: string) => html.split('<div class="pg"').slice(1);
const firstRows = (html: string) => pagesOf(html).map(p => +/data-first="(\d+)"/.exec(p)![1]);
const O = (x: Partial<PrintOpts> = {}): PrintOpts => ({ ...PRINT_DEFAULT, ...x });
// ο πίνακας κάθε σελίδας χωράει στο χαρτί (πλάτος × κλίμακα και ύψος × κλίμακα)
function fitsPaper(html: string) {
  for (const p of pagesOf(html)) {
    const W = +/width:([\d.]+)px;height:([\d.]+)px/.exec(p)![1], H = +/width:([\d.]+)px;height:([\d.]+)px/.exec(p)![2];
    const ar = /<div class="ar" style="left:([\d.]+)px;top:([\d.]+)px;transform:scale\(([\d.]+)\)"><table[^>]*style="width:([\d.]+)px"/.exec(p)!;
    const rowsH = [...p.matchAll(/<tr[^>]*style="height:([\d.]+)px"/g)].reduce((a, m) => a + +m[1], 0);
    expect(+ar[1] + +ar[4] * +ar[3]).toBeLessThanOrEqual(W + 0.5);
    expect(+ar[2] + rowsH * +ar[3]).toBeLessThanOrEqual(H + 0.5);
  }
}

describe('εκτύπωση: διάταξη από το παράθυρο', async () => {
  const S = fakeState(120);
  const dyn = await rosterPrint(S, '2026-10-12');
  it('Δυναμολόγιο: 1 σελίδα με όλους, ή 3 σελίδες με την κεφαλίδα σε κάθε σελίδα και ίδια γράμματα', async () => {
    const one = await renderBook(dyn.data, { file: dyn.name, layout: O() });
    expect(one.total).toBe(1); fitsPaper(one.sheets[0].html);
    expect(one.sug && one.sug.n).toBeGreaterThan(1);                         // μικρά γράμματα: πρόταση για περισσότερες σελίδες
    const three = await renderBook(dyn.data, { file: dyn.name, layout: O({ pages: 3 }) });
    const sh = three.sheets[0]; const pages = pagesOf(sh.html);
    expect(three.total).toBe(3); fitsPaper(sh.html);
    expect(sh.pt).toBeGreaterThan(one.sheets[0].pt);
    for (const p of pages) expect(cells(p)).toContain('ΕΠΙΘΕΤΟ');            // γραμμή τίτλων σε κάθε σελίδα
    expect(cells(pages[0]).join(' ')).toContain('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ');
    expect(cells(pages[1]).join(' ')).not.toContain('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ');
    // μία κλίμακα για όλες τις σελίδες
    expect(new Set(pages.map(p => /scale\(([\d.]+)\)/.exec(p)![1])).size).toBe(1);
    // ισόποσα: καμία σελίδα με πολύ λιγότερες γραμμές (εκτός από την τελευταία, ως ένα θάλαμο)
    const n = pages.map(p => (p.match(/<tr /g) || []).length);
    expect(Math.max(...n) - Math.min(...n)).toBeLessThan(25);
  });
  it('θάλαμος δεν κόβεται στη μέση: κάθε νέα σελίδα ξεκινά με άλλον θάλαμο από την προηγούμενη', async () => {
    const doc = await renderBook(dyn.data, { file: dyn.name, layout: O({ pages: 3 }) });
    const pages = pagesOf(doc.sheets[0].html);
    // η στήλη ΘΑΛΑΜΟΣ: το τελευταίο κελί της σελίδας και το πρώτο της επόμενης διαφέρουν
    const roomCol = cells(pages[0]).indexOf('ΘΑΛΑΜΟΣ'); expect(roomCol).toBeGreaterThan(0);
    const rowsOf = (p: string) => [...p.matchAll(/<tr data-r="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)].map(m => ({ r: +m[1], td: [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => cells(x[1])[0] || '') }));
    const head = rowsOf(pages[0]).find(x => x.td.includes('ΘΑΛΑΜΟΣ'))!; const ci = head.td.indexOf('ΘΑΛΑΜΟΣ');
    for (let i = 1; i < pages.length; i++) {
      const prev = rowsOf(pages[i - 1]).filter(x => x.r > head.r), next = rowsOf(pages[i]).filter(x => x.r > head.r);
      expect(prev[prev.length - 1].td[ci]).not.toBe(next[0].td[ci]);
    }
    // χωρίς «δεν κόβεται»: γεμίζει τις σελίδες όσο χωράνε
    const loose = await renderBook(dyn.data, { file: dyn.name, layout: O({ pages: 3, keep: false }) });
    expect(loose.sheets[0].scale).toBeGreaterThanOrEqual(doc.sheets[0].scale);
  });
  it('κλικ σε γραμμή: η νέα σελίδα ξεκινά από εκεί, και τα γράμματα όσο χωράνε', async () => {
    const doc = await renderBook(dyn.data, { file: dyn.name, layout: O({ breaks: { ΔΥΝΑΜΟΛΟΓΙΟ: [60] } }) });
    expect(firstRows(doc.sheets[0].html)).toEqual([1, 60]);
    fitsPaper(doc.sheets[0].html);
    const doc2 = await renderBook(dyn.data, { file: dyn.name, layout: O({ breaks: { ΔΥΝΑΜΟΛΟΓΙΟ: [50, 90] } }) });
    expect(firstRows(doc2.sheets[0].html)).toEqual([1, 50, 90]);
  });
  it('όσες χρειάζονται: γράμματα στο μέγεθος που διαλέγεις (όσο χωράει το πλάτος)', async () => {
    const doc = await renderBook(dyn.data, { file: dyn.name, layout: O({ pages: 'auto', size: 7 }) });
    expect(doc.sheets[0].pt).toBe(7); expect(doc.total).toBeGreaterThan(1); fitsPaper(doc.sheets[0].html);
    const big = await renderBook(dyn.data, { file: dyn.name, layout: O({ pages: 'auto', size: 14 }) });
    expect(big.sheets[0].pt).toBeLessThan(14); expect(big.total).toBeGreaterThan(doc.total - 1); fitsPaper(big.sheets[0].html);
  });
  it('ΗΚΑΙ: μπροστινό και πίσω με την ίδια κλίμακα (Arial 12 ίδιο και στις δύο όψεις)· αλλιώς το καθένα όσο χωράει', async () => {
    let s = fakeState(90); s = apply(s, { t: 'autofill', date: '2026-10-12' }, ctx).state;
    const r = await fillHkai(T('hkai.xlsx'), s, '2026-10-12');
    const def = printDefaults(printKey(r.name), ['μπροστινο', 'πισω']);
    expect([def.side, def.m, def.pno]).toEqual(['back', 'narrow', false]);
    const same = await renderBook(r.data, { file: r.name, layout: def });
    expect(same.sheets.map(x => x.pages)).toEqual([1, 1]);
    expect(same.sheets[0].scale).toBe(same.sheets[1].scale);
    expect(same.sheets.every(x => x.landscape)).toBe(true);                    // μπρος-πίσω: ίδιος προσανατολισμός
    same.sheets.forEach(x => fitsPaper(x.html));
    const own = await renderBook(r.data, { file: r.name, layout: { ...def, same: false } });
    expect(own.sheets[0].scale).toBeGreaterThan(same.sheets[0].scale);
    // η κεφαλίδα του αρχείου, τα αθροίσματα και η αρίθμηση σελίδων συνεχίζουν να βγαίνουν
    expect(pagesOf(same.sheets[0].html)[0]).not.toContain('class="pno"');
  });
  it('λίγες στήλες: ο πίνακας πιάνει όλο το πλάτος, με γράμματα ως 16 pt· «ψηλότερες γραμμές» γεμίζουν τη σελίδα', async () => {
    const z = new JSZip();
    const rows = ['<row r="1"><c r="A1" t="inlineStr" s="1"><is><t>Α/Α</t></is></c><c r="B1" t="inlineStr" s="1"><is><t>ΟΝΟΜΑ</t></is></c></row>',
      ...Array.from({ length: 8 }, (_, i) => `<row r="${i + 2}"><c r="A${i + 2}" s="1"><v>${i + 1}</v></c><c r="B${i + 2}" t="inlineStr" s="1"><is><t>ΣΤΡ ΔΟΚΙΜΙΟΣ ${i}</t></is></c></row>`),
      '<row r="11"/>', '<row r="12"><c r="B12" t="inlineStr"><is><t>Ο ΛΟΧΙΑΣ</t></is></c></row>'].join('');
    z.file('[Content_Types].xml', '<Types/>');
    z.file('xl/workbook.xml', '<workbook><sheets><sheet name="Λίστα" sheetId="1" r:id="rId1"/></sheets></workbook>');
    z.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
    z.file('xl/worksheets/sheet1.xml', `<worksheet><cols><col min="1" max="1" width="6"/><col min="2" max="2" width="30"/></cols><sheetData>${rows}</sheetData></worksheet>`);
    z.file('xl/styles.xml', '<styleSheet><fonts><font><sz val="12"/><name val="Arial"/></font></fonts><fills><fill><patternFill/></fill></fills><borders><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellXfs><xf fontId="0" fillId="0" borderId="0"/><xf fontId="0" fillId="0" borderId="1"/></cellXfs></styleSheet>');
    const buf = await z.generateAsync({ type: 'nodebuffer' });
    const doc = await renderBook(buf, { file: 'λίστα.xlsx', layout: O() });
    const sh = doc.sheets[0]; const p = pagesOf(sh.html)[0];
    expect(sh.pt).toBe(16); expect(sh.font).toBe('Arial'); expect(sh.size).toBe(12);
    const W = +/width:([\d.]+)px;height/.exec(p)![1]; const tw = +/<table[^>]*style="width:([\d.]+)px"/.exec(p)![1];
    const m = (1.2 / 2.54) * 96;
    expect(tw * sh.scale).toBeCloseTo(W - 2 * m, 0);                         // όλο το πλάτος ανάμεσα στα περιθώρια
    const fill = await renderBook(buf, { file: 'λίστα.xlsx', layout: O({ sp: 'fill' }) });
    const h = (html: string, r: number) => +new RegExp(`<tr data-r="${r}" style="height:([\\d.]+)px`).exec(html)![1];
    expect(h(fill.sheets[0].html, 5)).toBeGreaterThan(h(sh.html, 5) * 1.3);  // γραμμές του πίνακα ψηλότερες
    expect(h(fill.sheets[0].html, 12)).toBe(h(sh.html, 12));                  // η υπογραφή όχι
    fitsPaper(fill.sheets[0].html);
    // υπογραφή: σε 2 σελίδες μένει μαζί με τις 2 τελευταίες γραμμές του πίνακα
    const two = await renderBook(buf, { file: 'λίστα.xlsx', layout: O({ breaks: { 'Λίστα': [9] } }) });
    expect(firstRows(two.sheets[0].html)).toEqual([1, 9]);
    const auto2 = await renderBook(buf, { file: 'λίστα.xlsx', layout: O({ pages: 2, keep: true }) });
    const last = pagesOf(auto2.sheets[0].html).pop()!;
    expect(cells(last)).toContain('Ο ΛΟΧΙΑΣ'); expect(cells(last)).toContain('ΣΤΡ ΔΟΚΙΜΙΟΣ 7');
  });
  it('κενές γραμμές και στήλες στο τέλος (τύποι με "", μεγάλη περιοχή εκτύπωσης) δεν μικραίνουν τα γράμματα (Michael 21/10)', async () => {
    const book = async (tail: boolean, area: boolean) => {
      const z = new JSZip();
      const rows = ['<row r="1"><c r="A1" t="inlineStr" s="1"><is><t>Α/Α</t></is></c><c r="B1" t="inlineStr" s="1"><is><t>ΟΝΟΜΑ</t></is></c></row>',
        ...Array.from({ length: 33 }, (_, i) => `<row r="${i + 2}"><c r="A${i + 2}" s="1"><v>${i + 1}</v></c><c r="B${i + 2}" t="inlineStr" s="1"><is><t>ΣΤΡ ΔΟΚΙΜΙΟΣ ${i}</t></is></c></row>`),
        ...(tail ? Array.from({ length: 110 }, (_, i) => `<row r="${i + 40}"><c r="A${i + 40}" t="str"><f>IF(B${i + 40}="","",1)</f><v></v></c><c r="F${i + 40}" s="2"/></row>`) : [])].join('');
      z.file('[Content_Types].xml', '<Types/>');
      z.file('xl/workbook.xml', `<workbook><sheets><sheet name="Λίστα" sheetId="1" r:id="rId1"/></sheets>${area ? '<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">Λίστα!$A$1:$H$160</definedName></definedNames>' : ''}</workbook>`);
      z.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
      z.file('xl/worksheets/sheet1.xml', `<worksheet><cols><col min="1" max="1" width="6"/><col min="2" max="2" width="30"/></cols><sheetData>${rows}</sheetData></worksheet>`);
      z.file('xl/styles.xml', '<styleSheet><fonts><font><sz val="11"/><name val="Calibri"/></font></fonts><fills><fill><patternFill/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill></fills><borders><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellXfs><xf fontId="0" fillId="0" borderId="0"/><xf fontId="0" fillId="0" borderId="1"/><xf fontId="0" fillId="2" borderId="0"/></cellXfs></styleSheet>');
      const doc = await renderBook(await z.generateAsync({ type: 'nodebuffer' }), { file: 'σκηνάκια.xlsx', layout: O() });
      return doc.sheets[0];
    };
    const clean = await book(false, false);
    for (const [tail, area] of [[true, false], [false, true], [true, true]]) {
      const sh = await book(tail, area);
      expect(sh.pt).toBe(clean.pt);
      expect(Math.max(...[...sh.html.matchAll(/<tr data-r="(\d+)"/g)].map(m => +m[1]))).toBe(34);
      expect(sh.html.match(/<col /g)?.length).toBe(clean.html.match(/<col /g)?.length);
    }
  });
  it('το κλειδί του εντύπου αγνοεί ημερομηνίες και μήνες· οι ρυθμίσεις από το παράθυρο καθαρίζονται', () => {
    expect(printKey('C:\\x\\ΗΚΑΙ 2Η ΕΠΧΙΑ 21.10.26.xlsx')).toBe(printKey('ΗΚΑΙ 2Η ΕΠΧΙΑ 22.10.26.xlsx'));
    expect(printKey('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΟΚΤΩΒΡΙΟΣ 2026.xlsx')).toBe(printKey('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΝΟΕΜΒΡΙΟΣ 2026.xlsx'));
    expect(printKey('ΦΡΟΥΡΑ 12-10-2026.xlsx')).toBe('ΦΡΟΥΡΑ');
    expect(printKey('ΦΡΟΥΡΑ ΣΠΕΝ 12-10-2026.xlsx')).not.toBe('ΦΡΟΥΡΑ');
    const o = cleanOpts({ pages: 99, size: 'μεγάλα', or: 'x', paper: 'A3', m: 'wide', sp: 'fill', stretch: 'ναι', breaks: { Α: [5, 5, -1, 3.5, 2] }, extra: 1 });
    expect(o).toEqual({ ...PRINT_DEFAULT, paper: 'A3', m: 'wide', sp: 'fill', breaks: { Α: [2, 5] } });
  });
  it('η σελίδα της προεπισκόπησης: ρυθμίσεις, ένα script, και οι ρυθμίσεις του εντύπου στο data-init', async () => {
    const doc = await renderBook(dyn.data, { file: dyn.name, layout: O({ pages: 2 }) });
    const html = previewHtml(doc, dyn.name, { opts: O({ pages: 2 }), duplex: true });
    expect(html.match(/<script/g)).toHaveLength(1);
    for (const id of ['go', 'pdf', 'legible', 'manual', 'flip', 'out']) expect(html).toContain(`id="${id}"`);
    const init = JSON.parse(/data-init="([^"]*)"/.exec(html)![1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    expect([init.opts.pages, init.duplex, init.info.total]).toEqual([2, true, 2]);
    // στο χαρτί κάθε σελίδα είναι ένα φύλλο: ό,τι κρύβεται (ο πίνακας πριν μικρύνει) δεν βγάζει έξτρα κενά φύλλα (PDF Michael 21/10)
    expect(/@media print\{[^\n]*#out \.pg\{[^}]*contain:strict/.test(html)).toBe(true);
  });
});
