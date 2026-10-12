// Ημερομηνίες που γράφει η εφαρμογή στο Excel: πάντα ημέρα/μήνας/έτος, όχι η «σύντομη ημερομηνία των Windows»
// (που σε αγγλικές ρυθμίσεις δείχνει μήνας/ημέρα). Δική σου άλλη μορφή στο κελί μένει.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { Workbook } from '../src/main/xlsx';
import { readBook } from '../src/main/sources';
import { renderBook } from '../src/main/print';

const STYLES = (numFmts: string, xf: string) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + numFmts +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' + xf + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
async function bookWith(styles: string): Promise<Buffer> {
  const z = await JSZip.loadAsync(await (await Workbook.blank('Α')).save());
  z.file('xl/styles.xml', styles);
  return z.generateAsync({ type: 'nodebuffer' });
}
async function writeDate(buf: Buffer, base: number) {
  const wb = await Workbook.open(buf); const ws = await wb.sheet('Α');
  const st = await wb.dateStyle(base); ws.setNumber('B2', 46307, st);   // 12/10/2026
  const out = await wb.save();
  const sx = await (await JSZip.loadAsync(out)).file('xl/styles.xml')!.async('string');
  return { out, sx, st };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-dmy-'));

describe('μορφή ημερομηνίας στο Excel', () => {
  it('βιβλίο χωρίς numFmts: προστίθεται «dd/mm/yyyy» και διαβάζεται ξανά ως ημερομηνία', async () => {
    const { out, sx } = await writeDate(await bookWith(STYLES('', '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>')), 1);
    expect(sx).toMatch(/<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\/mm\/yyyy"\/><\/numFmts><fonts/);
    const f = path.join(tmp(), 'a.xlsx'); fs.writeFileSync(f, out);
    expect((await readBook(f)).sheets[0].rows[1][1]).toBeInstanceOf(Date);
    const doc = await renderBook(out, { file: 'a.xlsx' });
    expect(JSON.stringify(doc)).toContain('12/10/2026');
  });
  it('κελί με «σύντομη ημερομηνία των Windows» (14): γίνεται ημέρα/μήνας/έτος', async () => {
    const { sx } = await writeDate(await bookWith(STYLES('<numFmts count="1"><numFmt numFmtId="170" formatCode="0.0"/></numFmts>', '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>')), 1);
    expect(sx).toContain('<numFmts count="2"><numFmt numFmtId="171" formatCode="dd/mm/yyyy"/><numFmt numFmtId="170" formatCode="0.0"/></numFmts>');
    expect(sx).toMatch(/<xf numFmtId="171"[^>]*applyNumberFormat="1"/);
  });
  it('δική σου μορφή ημερομηνίας στο κελί μένει όπως είναι', async () => {
    const buf = await bookWith(STYLES('<numFmts count="1"><numFmt numFmtId="165" formatCode="d/m/yy"/></numFmts>', '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'));
    const { st, sx } = await writeDate(buf, 1);
    expect(st).toBe(1); expect(sx).not.toContain('dd/mm/yyyy');
  });
  it('η μορφή «dd/mm/yyyy» που υπάρχει ήδη ξαναχρησιμοποιείται, δεν προστίθεται δεύτερη', async () => {
    let buf = await (await Workbook.blank('Α')).save();
    for (let i = 0; i < 2; i++) buf = (await writeDate(buf, 0)).out;
    const sx = await (await JSZip.loadAsync(buf)).file('xl/styles.xml')!.async('string');
    expect((sx.match(/formatCode="dd\/mm\/yyyy"/g) || []).length).toBe(1);
  });
});
