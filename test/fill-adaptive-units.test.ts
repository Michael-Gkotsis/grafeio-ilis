// Pieces of the adaptive fill: the tiny evaluator, restoring lost total formulas, the data sheet of COUNTIFS templates, the unit's own rules,
// the safe writer's data areas, and the detector gap (two or more blank separator columns).
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { modelOfBuffer } from '../src/main/bookModel';
import { findSoffice } from '../src/main/xlsConvert';
import { Workbook } from '../src/main/xlsx';
import { safeWrite } from '../src/main/safeWrite';
import { fillAdaptive, restoreFormulas, applyFormulaFixes } from '../src/main/fillAdaptive';
import { Evaluator, UNSUPPORTED, critMatches } from '../src/shared/sheetEval';
import { detectBook } from '../src/shared/shape';
import { colLetter, key as cellKey } from '../src/shared/sheetModel';
import { genFillMock } from './mockgen';
import { hkaiClassify } from '../src/shared/rules';

// ------------------------------------------------------------------ the evaluator
const sheet = (name: string, rows: (string | number | null)[][], formulas: Record<string, string> = {}) => ({
  name, state: 'visible' as const, rows, fx: new Set(Object.keys(formulas)), formulas: new Map(Object.entries(formulas)), merges: [], validations: []
});
describe('evaluator', () => {
  const data = sheet('Παρουσιολόγιο', [['ΒΑΘΜΟΣ', 'ΚΑΤΑΣΤΑΣΗ'], ['ΛΧΙΑΣ', 'ΠΑΡΩΝ'], ['ΛΧΙΑΣ', 'ΚΑΝΟΝΙΚΗ ΑΔΕΙΑ'], ['λχιας', 'Κανονική Άδεια'], ['ΔΝΕΑΣ', 'ΠΑΡΩΝ'], ['ΛΧΙΑΣ ΕΠΟΠ', 'ΠΑΡΩΝ']]);
  const front = sheet('Εμπρός', [[3, 4, null, null, null, null, null]], {
    '0:2': 'SUM(A1:B1)', '0:3': "COUNTIF('Παρουσιολόγιο'!A:A,\"ΛΧΙΑΣ\")", '0:4': "COUNTIFS('Παρουσιολόγιο'!A:A,\"ΛΧΙΑΣ*\",Παρουσιολόγιο!B:B,\"ΠΑΡΩΝ\")",
    '0:5': 'C1*2-A1/3+(B1-1)', '0:6': 'IF(A1>1,1,2)'
  });
  const ev = new Evaluator([front, data]);
  it('numbers, ranges, other sheets, whole columns, quoted words, wildcards', () => {
    expect(ev.cell(front, 0, 2)).toBe(7);
    expect(ev.cell(front, 0, 3)).toBe(3);          // case-insensitive: «λχιας» counts, «ΛΧΙΑΣ ΕΠΟΠ» does not
    expect(ev.cell(front, 0, 4)).toBe(2);          // ΛΧΙΑΣ* and ΠΑΡΩΝ
    expect(ev.cell(front, 0, 5)).toBe(7 * 2 - 1 + 3);
  });
  it('what it cannot evaluate is never a number', () => { expect(ev.cell(front, 0, 6)).toBe(UNSUPPORTED); });
  it('words with wildcards', () => {
    expect(critMatches('ΛΧ*', 'ΛΧΙΑΣ')).toBe(true); expect(critMatches('Λ?ΙΑΣ', 'ΛΧΙΑΣ')).toBe(true); expect(critMatches('ΛΧΙΑΣ', 'ΛΧΙΑΣ ΕΠΟΠ')).toBe(false); expect(critMatches('~*', '*')).toBe(true);
  });
  it('a cycle does not hang', () => {
    const c = sheet('C', [[null, null]], { '0:0': 'B1+1', '0:1': 'A1+1' });
    expect(new Evaluator([c]).cell(c, 0, 0)).toBe(UNSUPPORTED);
  });
});

// ------------------------------------------------------------------ the safe writer: data areas and exact words
async function tiny(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); const w = wb.addWorksheet('Δεδομένα');
  w.getCell('A1').value = 'ΒΑΘΜΟΣ'; w.getCell('A2').value = 'ΠΑΛΙΟ ΚΕΙΜΕΝΟ'; w.getCell('A3').value = { formula: 'A2', result: 'x' } as ExcelJS.CellFormulaValue; w.getCell('B2').value = 5;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
describe('safeWrite data areas', () => {
  it('replaces text inside a data box, past the used area, but never a formula or a header outside the box', async () => {
    const wb = await Workbook.open(await tiny());
    const r = await safeWrite(wb, [
      { sheet: 'Δεδομένα', r: 1, c: 0, value: 'Κανονική Άδεια', exact: true }, { sheet: 'Δεδομένα', r: 2, c: 0, value: 'ΧΧ' }, { sheet: 'Δεδομένα', r: 40, c: 0, value: 'ΜΑΚΡΙΑ' },
      { sheet: 'Δεδομένα', r: 0, c: 0, value: 'ΝΕΟ ΒΑΘΜΟΣ' }
    ], { dataBoxes: [{ sheet: 'Δεδομένα', r1: 1, c1: 0, r2: 45, c2: 3 }] });
    expect(r.written.map(w => w.ref)).toEqual(['A2', 'A41']);
    expect(r.written[0].value).toBe('Κανονική Άδεια');                     // exact: not turned into capitals
    expect(r.refused.map(x => x.ref + ':' + x.reason)).toEqual(['A3:formula', 'A1:label']);
  });
  it('without a box text is still a label', async () => {
    const wb = await Workbook.open(await tiny());
    const r = await safeWrite(wb, [{ sheet: 'Δεδομένα', r: 1, c: 0, value: 'Χ' }]);
    expect(r.refused[0].reason).toBe('label');
  });
});

// ------------------------------------------------------------------ restoring formulas
const soffice = findSoffice();
async function recalc(buf: Buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafeio-lo-'));
  try {
    const prof = path.join(dir, 'prof', 'user'); fs.mkdirSync(prof, { recursive: true });
    fs.writeFileSync(path.join(prof, 'registrymodifications.xcu'), '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item></oor:items>');
    const f = path.join(dir, 'a.xlsx'); fs.writeFileSync(f, buf);
    execFileSync(soffice!, ['--headless', '--norestore', '-env:UserInstallation=file://' + path.join(dir, 'prof'), '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', path.join(dir, 'out'), f], { timeout: 120000, stdio: 'ignore' });
    return await modelOfBuffer(fs.readFileSync(path.join(dir, 'out', 'a.xlsx')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
// the template of a mock with every formula turned into the plain number it had (as in a unit file that lost its formulas)
async function numbersOnly(buf: Buffer): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  wb.eachSheet(ws => ws.eachRow(row => row.eachCell(c => { if (c.value && typeof c.value === 'object' && 'formula' in c.value) c.value = 7; })));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
describe('totals without formulas', () => {
  const calm = { countifs: false, originSplit: false, rankSplit: false, unknownRow: false, dropRows: false, drop: 0, typo: false, hospitalSplit: false, dupHeader: false, ownCols: 0, seps: false, totals: 'formulas' as const };
  it('are computed and written as numbers; restoreFormulas proposes SUMs, applying them is separate and gives the same numbers', async () => {
    for (let seed = 1; seed <= 4; seed++) {
      const m = await genFillMock(seed, calm); const flat = await numbersOnly(m.buf);
      const { buffer, report } = await fillAdaptive(flat, m.s, m.date, m.profile);
      // every total cell now holds the engine's number (nothing was a formula, so nothing was kept)
      expect(report.kept).toBe(0);
      const filled = await modelOfBuffer(buffer);
      const fx = restoreFormulas(filled);
      expect(fx.length).toBeGreaterThan(0);
      for (const f of fx) expect(f.formula).toMatch(/^[A-Z0-9:,+\-()]*$|^SUM\(/);
      // a proposal is a list: nothing changed yet
      expect((await modelOfBuffer(buffer))[0].formulas.size).toBe(0);
      const ap = await applyFormulaFixes(buffer, fx);
      expect(ap.applied.length).toBe(fx.length); expect(ap.skipped.length).toBe(0);
      const back = await modelOfBuffer(ap.buffer);
      expect(back[0].formulas.size).toBe(fx.length);
      // the cells that were not total cells are the same
      for (let r = 0; r < filled[0].rows.length; r++) for (let c = 0; c < (filled[0].rows[r]?.length ?? 0); c++) if (!back[0].fx.has(cellKey(r, c))) expect(back[0].rows[r]?.[c] ?? null).toEqual(filled[0].rows[r]?.[c] ?? null);
      if (soffice) {
        const lo = await recalc(ap.buffer);
        for (const f of fx) { const v = lo[0].rows[f.r]?.[f.c]; const was = filled[0].rows[f.r]?.[f.c]; const t = m.truth.get(f.r + ':' + f.c); if (t != null && !m.s.settings.hkai) expect(v ?? 0, 'seed ' + seed + ' ' + f.ref + ' ' + f.formula + ' was ' + was).toBe(t); }
      }
    }
  }, 300000);
  // 17/11 (#352): Άγνοια / Λιποταξία / Αδικαιολόγητη απουσία count in the «Αγνοούμενοι / αδικαιολόγητα» column. A unit's template without that
  // column: the people are reported in plain words (not the key «adik»), and a Σύνολο απόντων written as a number still counts them
  it('a template with no column for the new statuses: plain-words warning; a total written as a number still counts them', async () => {
    let numbers = 0, formulas = 0;
    for (let seed = 1; seed <= 150 && (numbers < 3 || formulas < 3); seed++) {
      for (const totals of ['numbers', 'formulas'] as const) {
        const m = await genFillMock(seed, { ...calm, drop: 8, adik: true, totals });
        const n = hkaiClassify(m.s, m.date).who.filter(w => w.col === 'adik').length; if (!n) continue;
        const { buffer, report } = await fillAdaptive(m.buf, m.s, m.date, m.profile);
        const lost = report.unplacedStates.find(x => x.key === 'adik'); if (!lost) continue;
        expect(lost.n).toBeLessThanOrEqual(n);
        const w = report.warnings.filter(x => x.includes('Αγνοούμενοι / αδικαιολόγητα')); expect(w.length, 'seed ' + seed).toBe(1);
        expect(w[0]).toMatch(lost.n === 1 ? /^1 άτομο .* δεν έχει στήλη/ : new RegExp('^' + lost.n + ' άτομα .* δεν έχουν στήλη'));
        expect(report.warnings.join(' ')).not.toMatch(/«adik»/);
        if (totals === 'numbers') {
          // nothing is a formula: every total the engine wrote is the true number, the missing column's people included
          const back = (await modelOfBuffer(buffer))[0];
          for (const [k, t] of m.truth) { const [r, c] = k.split(':').map(Number); const v = back.rows[r]?.[c]; if (typeof v === 'number' || v == null) expect(v ?? 0, 'seed ' + seed + ' ' + k).toBe(t); }
          numbers++;
        } else {
          // the template's own Σύνολο απόντων sums its columns: the cross-check says so instead of hiding it
          expect(report.cross.mismatches.length, 'seed ' + seed).toBeGreaterThan(0);
          expect(report.warnings.some(x => /Έλεγχος με τους τύπους του εντύπου/.test(x))).toBe(true);
          formulas++;
        }
      }
    }
    expect(numbers).toBeGreaterThanOrEqual(3); expect(formulas).toBeGreaterThanOrEqual(3);
  }, 300000);
  it('a cell that has a formula is never proposed, never rewritten', async () => {
    const m = await genFillMock(2, calm);
    expect(restoreFormulas(await modelOfBuffer(m.buf))).toEqual([]);
    const model = await modelOfBuffer(m.buf); const f = [...model[0].formulas.keys()][0].split(':').map(Number);
    const r = await applyFormulaFixes(m.buf, [{ sheet: m.sheet, r: f[0], c: f[1], ref: colLetter(f[1]) + (f[0] + 1), formula: '1+1', why: 'x' }]);
    expect(r.applied).toEqual([]); expect(r.skipped.length).toBe(1);
  });
});

// ------------------------------------------------------------------ COUNTIFS templates: the data sheet
describe('data sheet of a COUNTIFS template', () => {
  it('one row per person in the file\'s own words; headers stay; old sample rows are replaced', async () => {
    let seen = 0;
    for (let seed = 1; seed <= 40 && seen < 3; seed++) {
      const m = await genFillMock(seed, { countifs: true, originSplit: false });
      const { buffer, report } = await fillAdaptive(m.buf, m.s, m.date, m.profile);
      if (!report.data) continue; seen++;
      const after = await modelOfBuffer(buffer); const d = after.find(x => x.name === m.dataSheet)!;
      const headerRow = d.rows.findIndex(r => r?.some(v => v === 'ΒΑΘΜΟΣ'));
      expect(d.rows[headerRow]).toContain('ΟΝΟΜΑΤΕΠΩΝΥΜΟ');
      const rankCol = d.rows[headerRow].indexOf('ΒΑΘΜΟΣ');
      const filled = d.rows.slice(headerRow + 1).filter(r => r && r[rankCol] != null && r[rankCol] !== '');
      expect(filled.length).toBe(report.data.rows);
      expect(filled.some(r => /^ΔΕΙΓΜΑ ΟΝΟΜΑ\d+$/.test(String(r[rankCol + 1])))).toBe(false);      // the old sample people are gone
      // the words are the ones the template's formulas count
      const words = new Set([...report.data.vocab.filter(v => v.source === 'formula').map(v => v.text.toLowerCase())]);
      for (const r of filled) expect(words.has(String(r[rankCol]).toLowerCase()) || String(r[rankCol]).toLowerCase() === 'ΠΑΡΩΝ'.toLowerCase()).toBe(true);
      expect(report.data.vocab.length).toBeGreaterThan(3);
      expect(report.cross.checked).toBeGreaterThan(20);
    }
    expect(seen).toBe(3);
  });
  it('a person whose state has no word in the file is reported, not guessed', async () => {
    let checked = 0;
    for (let seed = 1; seed <= 60 && checked < 2; seed++) {
      const m = await genFillMock(seed, { countifs: true, originSplit: false });
      const { buffer, report } = await fillAdaptive(m.buf, m.s, m.date, m.profile);
      if (!report.data || !report.unplacedStates.length) continue; checked++;
      expect(report.data.unwritable.some(x => /κατάσταση «/.test(x))).toBe(true);
      expect(report.warnings.some(x => /δεν γράφτηκαν ή γράφτηκαν χωρίς κατάσταση/.test(x))).toBe(true);
      void buffer;
    }
    expect(checked).toBe(2);
  });
  it('words from cell references (the row label, the column header) are the words written', async () => {
    let found = 0;
    for (let seed = 1; seed <= 80 && found < 1; seed++) {
      const m = await genFillMock(seed, { countifs: true, originSplit: false, words: 'labels' });
      const { report } = await fillAdaptive(m.buf, m.s, m.date, m.profile); if (!report.data) continue; found++;
      expect(report.data.vocab.some(v => v.source === 'formula' && v.concept && /^(hkrow|rank):/.test(v.concept))).toBe(true);
      expect(report.cross.mismatches.length).toBeLessThan(report.cross.checked);
    }
    expect(found).toBe(1);
  });
});

// ------------------------------------------------------------------ the unit's own rules
describe('own columns', () => {
  it('a column mapped by the profile is written; the same template without the profile reports it and writes nothing there', async () => {
    let n = 0;
    for (let seed = 1; seed <= 80 && n < 3; seed++) {
      const m = await genFillMock(seed, { countifs: false, ownCols: 2, typo: false, originSplit: false });
      if (!m.profile) continue; n++;
      const own = Object.keys(m.profile.rules!.cols);
      const withP = await fillAdaptive(m.buf, m.s, m.date, m.profile, { dryRun: true });
      const without = await fillAdaptive(m.buf, m.s, m.date, null, { dryRun: true });
      const colsOwn = withP.report.written.filter(w => w.sheet === m.sheet);
      expect(own.length).toBeGreaterThan(0);
      expect(colsOwn.length).toBeGreaterThan(without.report.written.length);
      // without the rule the columns are reported, with data, and not written
      const cols = new Set(without.report.unmappedCols.filter(x => x.hasData || x.text).map(x => x.text.toLowerCase()));
      expect([...cols].length).toBeGreaterThan(0);
      for (const w of without.report.written) expect(without.report.unmappedCols.some(c => c.ref === colLetter(w.c))).toBe(false);
      expect(withP.report.cross.mismatches.length).toBeLessThanOrEqual(without.report.cross.mismatches.length + 40);
    }
    expect(n).toBe(3);
  });
});

// ------------------------------------------------------------------ the detector gap
async function matrixFile(sep: number, dot: boolean): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); const w = wb.addWorksheet('Φύλλο');
  const heads = ['Τοποθετημένοι', 'Προσκολλημένοι', 'Σύνολο', null, 'Υπηρεσία εντός στρατοπέδου', 'Ελεύθεροι υπηρεσίας', 'Τιμωρημένοι', null, 'Κανονικές άδειες', 'Αναρρωτικές άδειες', 'Νοσοκομείο', 'Σύνολο απόντων'];
  const rows = ['Επίλαρχοι', 'Ίλαρχοι', 'Ανθυπίλαρχοι-Ανθλγοι', 'Ανθυπασπιστές', 'Αρχιλοχίες', 'Λοχίες', 'Δεκανείς', 'Στρατιώτες'];
  w.getCell(3, 1).value = 'ΒΑΘΜΟΙ';
  let c = 2; const at: number[] = [];
  heads.forEach(h => { if (h === null) { c += dot ? 0 : sep; if (dot) { w.getCell(3, c).value = '·'; c += 1; } return; } w.getCell(3, c).value = h; at.push(c); c++; });
  rows.forEach((r, i) => { w.getCell(4 + i, 1).value = r; at.forEach(cc => { w.getCell(4 + i, cc).value = (i * 7 + cc) % 5; }); });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
describe('detector gap: separator columns', () => {
  for (const [sep, dot] of [[1, false], [2, false], [3, false], [4, false], [1, true]] as const) {
    it((dot ? 'a «·» column' : sep + ' blank column' + (sep > 1 ? 's' : '')) + ' between the groups keeps ONE table with every column', async () => {
      const shape = detectBook({ sheets: await modelOfBuffer(await matrixFile(sep, dot)) });
      const ms = shape.sheets[0].regions.filter(x => x.type === 'matrix');
      expect(ms.length).toBe(1);
      const m = ms[0]; if (m.type !== 'matrix') throw new Error('x');
      const got = m.cols.filter(x => x.match.confidence === 'sure').map(x => x.match.concept);
      for (const k of ['placed', 'attached', 'sum', 'yp', 'ey', 'tim', 'ka', 'an', 'nos', 'sumA']) expect(got, k).toContain('hkcol:' + k);
      expect(m.cols.filter(x => x.match.confidence === 'sure' && x.match.concept !== 'hkcol:' + (x.match.concept || '').slice(6)).length).toBe(0);
    });
  }
  it('two valid tables side by side stay two (a list is not swallowed)', async () => {
    const wb = new ExcelJS.Workbook(); const w = wb.addWorksheet('Λίστες');
    ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ'].forEach((h, i) => { w.getCell(1, 1 + i).value = h; });
    ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ'].forEach((h, i) => { w.getCell(1, 8 + i).value = h; });
    for (let r = 0; r < 8; r++) { w.getCell(2 + r, 1).value = r + 1; w.getCell(2 + r, 2).value = 'ΣΤΡ'; w.getCell(2 + r, 3).value = 'ΑΑΑ' + r; w.getCell(2 + r, 4).value = 'ΒΒΒ'; w.getCell(2 + r, 8).value = r + 1; w.getCell(2 + r, 9).value = 'ΣΤΡ'; w.getCell(2 + r, 10).value = 'ΓΓΓ' + r; w.getCell(2 + r, 11).value = 'ΔΔΔ'; }
    const shape = detectBook({ sheets: await modelOfBuffer(Buffer.from(await wb.xlsx.writeBuffer())) });
    expect(shape.sheets[0].regions.filter(x => x.type === 'list').length).toBe(2);
  });
  it('a short right part of a list after 2 blank columns joins the list; its columns are found', async () => {
    const wb = new ExcelJS.Workbook(); const w = wb.addWorksheet('Λίστα');
    ['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ'].forEach((h, i) => { w.getCell(1, 1 + i).value = h; }); w.getCell(1, 7).value = 'ΤΗΛΕΦΩΝΟ';
    for (let r = 0; r < 8; r++) { w.getCell(2 + r, 1).value = r + 1; w.getCell(2 + r, 2).value = 'ΣΤΡ'; w.getCell(2 + r, 3).value = 'ΑΑΑ' + r; w.getCell(2 + r, 4).value = 'ΒΒΒ'; w.getCell(2 + r, 7).value = '69' + (10000000 + r); }
    const shape = detectBook({ sheets: await modelOfBuffer(Buffer.from(await wb.xlsx.writeBuffer())) });
    const l = shape.sheets[0].regions.filter(x => x.type === 'list');
    expect(l.length).toBe(1); if (l[0].type !== 'list') throw new Error('x');
    expect(l[0].cols.some(c => c.match.concept === 'person:phone' && c.match.confidence !== 'unknown')).toBe(true);
  });
});
