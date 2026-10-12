// Εκτύπωση χωρίς Excel: σελίδες, κλίμακα, τύποι και μορφές όπως θα τα τύπωνε ο Excel
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { apply, type Ctx } from '../src/shared/commands';
import { fillFroura, fillHkai, fillOuts } from '../src/main/exports';
import { dutyCheck } from '../src/main/excel';
import { formatValue, previewHtml, renderBook } from '../src/main/print';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'x' + ++seq };
// το κείμενο κάθε κελιού της σελίδας, με τη σειρά
const cells = (html: string) => [...html.matchAll(/<span>([^<]*)<\/span>/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
const pagesOf = (html: string) => html.split('<div class="pg"').slice(1);

// Μικρό βιβλίο από XML φύλλων (για να ελέγχονται τύποι και διάταξη σελίδας χωρίς template)
async function book(sheets: { name: string; xml: string; hidden?: boolean }[], names = '', styles = ''): Promise<Buffer> {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  z.file('xl/workbook.xml', `<workbook><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets>${names ? '<definedNames>' + names + '</definedNames>' : ''}</workbook>`);
  z.file('xl/_rels/workbook.xml.rels', `<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`);
  sheets.forEach((s, i) => z.file(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet>${s.xml}</worksheet>`));
  z.file('xl/styles.xml', styles || '<styleSheet><fonts><font><sz val="11"/><name val="Calibri"/></font></fonts><fills><fill><patternFill/></fill></fills><borders><border/></borders><cellXfs><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>');
  return z.generateAsync({ type: 'nodebuffer' });
}
const n = (ref: string, v: number | string, f?: string) => `<c r="${ref}"${typeof v === 'string' ? ' t="inlineStr"' : ''}>${f ? `<f>${f}</f>` : ''}${typeof v === 'string' ? `<is><t>${v}</t></is>` : `<v>${v}</v>`}</c>`;

describe('εκτύπωση: έντυπα της εφαρμογής', () => {
  it('ΦΡΟΥΡΑ: μία σελίδα A4 οριζόντια, με «προσαρμογή σε σελίδα»', async () => {
    let s = fakeState(60); s = apply(s, { t: 'autofill', date: '2026-10-12' }, ctx).state;
    const r = await fillFroura(T('froura.xlsx'), s, '2026-10-12');
    const doc = await renderBook(r.data, { file: r.name });
    expect(doc.sheets.map(x => [x.name, x.pages, x.paper, x.landscape])).toEqual([['ΦΡΟΥΡΑ ΣΒΕΝ', 1, 'A4', true]]);
    expect(doc.sheets[0].scale).toBeLessThan(1);
    expect(cells(doc.sheets[0].html)).toContain('ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΝ 12 ΟΚΤ 2026');
    const page = previewHtml(doc, r.name);
    expect(page).toContain('@page{size:A4 landscape;margin:0}');
    expect(page).toContain('id="go"');
  });
  it('ΗΚΑΙ: μπροστινό και πίσω, και τα αθροίσματα υπολογίζονται ξανά (το αρχείο έχει τις τιμές του template)', async () => {
    let s = fakeState(90); s = apply(s, { t: 'autofill', date: '2026-10-12' }, ctx).state;
    s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [20, 21, 22], from: '2026-10-10', to: '2026-10-14' } }, ctx).state;
    const r = await fillHkai(T('hkai.xlsx'), s, '2026-10-12');
    const doc = await renderBook(r.data, { file: r.name });
    expect(doc.sheets.map(x => [x.name, x.pages])).toEqual([['μπροστινο', 1], ['πισω', 1]]);
    // γραμμή «Στρατιώτες»: Τοπ., Προσκ., Σύνολο (=SUM(C29:D29)) και στο τέλος Διαθέσιμοι (=E29-Z29)
    const row = /<tr[^>]*>(?:(?!<\/tr>)[\s\S])*Στρατιώτες(?:(?!<\/tr>)[\s\S])*<\/tr>/.exec(doc.sheets[0].html)![0];
    const v = cells(row);
    expect(v.slice(0, 4)).toEqual(['Στρατιώτες', '89', '0', '89']);
    expect(v).toContain('86');   // 89 − 3 σε άδεια
  });
  it('Εξοδούχοι: η αρίθμηση =ROW()-6 βγαίνει σε κάθε γραμμή που προστέθηκε', async () => {
    let s = fakeState(40);
    s = apply(s, { t: 'outs', date: '2026-10-12', changes: Array.from({ length: 12 }, (_, i) => ({ pid: 10 + i, from: null, to: 'OUT' as const })) }, ctx).state;
    const r = await fillOuts(T('exodouxoi.xlsx'), s, '2026-10-12');
    const doc = await renderBook(r.data, { file: r.name });
    const html = doc.sheets.find(x => x.name === 'ΕΞΟΔΟΥΧΟΙ')!.html;
    const nums = [...html.matchAll(/<tr[^>]*><td[^>]*><div[^>]*><span>(\d+)<\/span>/g)].map(m => +m[1]);
    expect(nums).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(doc.sheets[0].landscape).toBe(false);
    // και οι παραμένοντες σε μία σελίδα πλάτος, όσο λίγοι κι αν είναι
    expect(doc.sheets.map(x => [x.name, x.pages])).toEqual([['ΕΞΟΔΟΥΧΟΙ', 1], ['ΠΑΡΑΜΕΝΟΝΤΕΣ', 1]]);
  });
  it('Έλεγχος υπηρεσιών: πολλές σελίδες με τη γραμμή τίτλων σε κάθε σελίδα', async () => {
    let s = fakeState(110);
    for (let d = 1; d <= 5; d++) s = apply(s, { t: 'autofill', date: '2026-10-0' + d }, ctx).state;
    const r = await dutyCheck(s, '2026-10');
    const doc = await renderBook(r.data, { file: r.name });
    const sh = doc.sheets[0];
    expect(sh.landscape).toBe(true);
    expect(sh.pages).toBeGreaterThan(1);
    const pages = pagesOf(sh.html);
    expect(pages.length).toBe(sh.pages);
    for (const p of pages) expect(cells(p)).toContain('ΕΠΩΝΥΜΟ');
    expect(cells(pages[0])).toContain('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΟΚΤΩΒΡΙΟΣ 2026');
    expect(cells(pages[1])).not.toContain('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΟΚΤΩΒΡΙΟΣ 2026');
  });
});

describe('εκτύπωση: τύποι και διάταξη', () => {
  it('τύποι: SUM, πράξεις, IF, COUNTIF, άλλο φύλλο, κοινός τύπος· ό,τι δεν υποστηρίζεται κρατά την τιμή του αρχείου', async () => {
    const xml = '<sheetData>'
      + `<row r="1">${n('A1', 2)}${n('B1', 3)}${n('C1', 0, 'SUM(A1:B1)*2')}${n('D1', 0, 'IF(C1>5,"πολλά","λίγα")')}${n('E1', 0, 'Δεύτερο!A1+1')}${n('F1', 'παλιό', 'VLOOKUP(1,A1:B1,2)')}</row>`
      + `<row r="2"><c r="A2"><f t="shared" ref="A2:A4" si="0">ROW()*10</f><v>0</v></c>${n('B2', 0, 'COUNTIF(A1:F1,">2")')}${n('C2', 0, 'A1/0')}${n('D2', 0, '"Α"&amp;B1')}</row>`
      + '<row r="3"><c r="A3"><f t="shared" si="0"/><v>0</v></c></row><row r="4"><c r="A4"><f t="shared" si="0"/><v>0</v></c></row>'
      + '</sheetData>';
    const doc = await renderBook(await book([{ name: 'Πρώτο', xml }, { name: 'Δεύτερο', xml: `<sheetData><row r="1">${n('A1', 41)}</row></sheetData>` }]), { file: 't.xlsx', sheets: ['Πρώτο'] });
    const v = cells(doc.sheets[0].html);
    expect(v).toEqual(['2', '3', '10', 'πολλά', '42', 'παλιό', '20', '3', '#DIV/0!', 'Α3', '30', '40']);
  });
  it('περιοχή εκτύπωσης, κρυφές γραμμές, χειροκίνητη αλλαγή σελίδας, συγχωνεύσεις και γραμμή τίτλων', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => `<row r="${i + 1}"${i === 4 ? ' hidden="1"' : ''}>${n('A' + (i + 1), 'Γ' + (i + 1))}${n('B' + (i + 1), i + 1)}${n('D' + (i + 1), 'εκτός')}</row>`).join('');
    const xml = `<sheetData>${rows}</sheetData><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells><pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait"/><headerFooter><oddFooter>&amp;CΣελίδα &amp;P από &amp;N</oddFooter></headerFooter><rowBreaks count="1"><brk id="7" max="16383" man="1"/></rowBreaks>`;
    const doc = await renderBook(await book([{ name: 'Λίστα', xml }], `<definedName name="_xlnm.Print_Area" localSheetId="0">'Λίστα'!$A$1:$B$10</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">'Λίστα'!$1:$1</definedName>`), { file: 'λ.xlsx' });
    const sh = doc.sheets[0]; const pages = pagesOf(sh.html);
    expect([sh.pages, sh.paper, sh.landscape, sh.scale]).toEqual([2, 'A4', false, 1]);
    const p1 = cells(pages[0]), p2 = cells(pages[1]);
    expect(p1).toContain('Γ1'); expect(p1).not.toContain('Γ5'); expect(p1).not.toContain('εκτός');
    expect(p1).toContain('Γ7'); expect(p1).not.toContain('Γ8');
    expect(p2[0]).toBe('Γ1');            // γραμμή τίτλων ξανά
    expect(p2).toContain('Γ10'); expect(p2).not.toContain('Γ11');
    expect(pages[0]).toContain('colspan="2"');
    expect(p1).toContain('Σελίδα 1 από 2'); expect(p2).toContain('Σελίδα 2 από 2');
  });
  it('επιλογή φύλλων: κρυφά φύλλα δεν τυπώνονται, άδεια επιλογή = τίποτα, άγνωστο φύλλο = προεπιλογή', async () => {
    const sd = (t: string) => `<sheetData><row r="1">${n('A1', t)}</row></sheetData>`;
    const buf = await book([{ name: 'Α', xml: sd('α') }, { name: 'Κρυφό', xml: sd('κ'), hidden: true }, { name: 'Β', xml: sd('β') }]);
    expect((await renderBook(buf, { file: 'x' })).sheets.map(s => s.name)).toEqual(['Α', 'Β']);
    expect((await renderBook(buf, { file: 'x' })).all).toEqual(['Α', 'Β']);
    expect((await renderBook(buf, { file: 'x', sheets: [] })).sheets).toEqual([]);
    expect((await renderBook(buf, { file: 'x', sheets: ['Β'] })).sheets.map(s => s.name)).toEqual(['Β']);
    expect((await renderBook(buf, { file: 'x', sheets: ['Δεν υπάρχει'] })).sheets.map(s => s.name)).toEqual(['Α', 'Β']);
  });
  it('μορφές αριθμών και ημερομηνιών με ελληνικές ρυθμίσεις', () => {
    const codes = new Map([[164, 'd\\ mmm\\ yy'], [165, '#,##0.00 "€"'], [166, 'dd/mm/yyyy hh:mm'], [167, '[Red]0.0;(0.0)']]);
    expect(formatValue(46307, 164, codes)).toBe('12 Οκτ 26');
    expect(formatValue(46307, 14, codes)).toBe('12/10/2026');
    expect(formatValue(46307.5, 166, codes)).toBe('12/10/2026 12:00');
    expect(formatValue(1234.5, 165, codes)).toBe('1.234,50 €');
    expect(formatValue(0.256, 10, codes)).toBe('25,60%');
    expect(formatValue(-2.25, 167, codes)).toBe('(2,3)');
    expect(formatValue(2.5, 0, codes)).toBe('2,5');
    expect(formatValue(89, 0, codes)).toBe('89');
    expect(formatValue('ΚΕΝΗ', 0, codes)).toBe('ΚΕΝΗ');
  });
});
