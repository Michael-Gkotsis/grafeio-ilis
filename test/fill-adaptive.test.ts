// The adaptive fill on random unit templates (test/mockgen.ts genFillMock) with random app states. The truth of every cell is hkaiCounts.
//   0 WRONG numbers   every cell whose value differs from the truth after LibreOffice recalculated the file is REPORTED (unmapped, refused, skipped total, cross-check)
//   0 unsafe writes   formulas stay, text/labels/headers stay, only the data area of a data sheet is replaced
//   every unmapped column with data is in the report · the tiny evaluator agrees with LibreOffice · a dry run changes nothing
// FUZZ_N=200 npx vitest run test/fill-adaptive.test.ts for more seeds (default 14). The report table is printed at the end.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { modelOfBuffer } from '../src/main/bookModel';
import { findSoffice } from '../src/main/xlsConvert';
import { fillAdaptive, type FillReport } from '../src/main/fillAdaptive';
import { Evaluator, UNSUPPORTED } from '../src/shared/sheetEval';
import { cellRef, colLetter, key as cellKey, type SheetModel } from '../src/shared/sheetModel';
import { genFillMock, type FillMock } from './mockgen';

const N = Number(process.env.FUZZ_N || 14);
const soffice = findSoffice();
const rows = (v: unknown) => (v == null || v === '' ? 0 : typeof v === 'number' ? v : NaN);

interface Run { m: FillMock; report: FillReport; before: SheetModel[]; after: SheetModel[]; out: Buffer; lo?: SheetModel[] }
const runs: Run[] = [];
function recalcAll(outs: Buffer[]): Promise<SheetModel[][]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafeio-lo-'));
  return (async () => {
    try {
      // always recalculate on load (the default trusts the cached results of the file)
      const prof = path.join(dir, 'prof', 'user'); fs.mkdirSync(prof, { recursive: true });
      fs.writeFileSync(path.join(prof, 'registrymodifications.xcu'), '<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item></oor:items>');
      const inDir = path.join(dir, 'in'); fs.mkdirSync(inDir); const files = outs.map((b, i) => { const f = path.join(inDir, 'f' + i + '.xlsx'); fs.writeFileSync(f, b); return f; });
      for (let i = 0; i < files.length; i += 40) execFileSync(soffice!, ['--headless', '--norestore', '-env:UserInstallation=file://' + path.join(dir, 'prof'), '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', path.join(dir, 'out'), ...files.slice(i, i + 40)], { timeout: 600000, stdio: 'ignore' });
      return await Promise.all(files.map((_, i) => modelOfBuffer(fs.readFileSync(path.join(dir, 'out', 'f' + i + '.xlsx')))));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  })();
}

describe('adaptive fill on random unit templates', () => {
  it('fills x' + N, async () => {
    for (let seed = 1; seed <= N; seed++) {
      const m = await genFillMock(seed);
      const before = await modelOfBuffer(m.buf);
      const { buffer, report } = await fillAdaptive(m.buf, m.s, m.date, m.profile);
      runs.push({ m, report, before, after: await modelOfBuffer(buffer), out: buffer });
    }
    expect(runs.length).toBe(N);
  }, 900000);

  it('writes only truth cells with the truth value (0 wrong numbers written)', () => {
    const bad: string[] = [];
    for (const { m, report } of runs) for (const w of report.written) {
      if (w.sheet !== m.sheet) continue;
      const k = w.r + ':' + w.c; const t = m.truth.get(k);
      if (t == null) bad.push('seed ' + m.seed + ' ' + w.ref + ' written but no truth cell · ' + m.desc[0]);
      else if (rows(w.value) !== t) bad.push('seed ' + m.seed + ' ' + w.ref + ' wrote ' + w.value + ' truth ' + t);
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it('0 unsafe writes: formulas, labels and headers are untouched; only the data area of a data sheet changes', () => {
    const bad: string[] = [];
    for (const { m, before, after } of runs) {
      for (const b of before) {
        const a = after.find(x => x.name === b.name)!;
        for (const [k, f] of b.formulas) if (a.formulas.get(k) !== f) bad.push('seed ' + m.seed + ' formula ' + b.name + '!' + k + ' changed');
        const n = Math.max(b.rows.length, a.rows.length);
        for (let r = 0; r < n; r++) for (let c = 0; c < Math.max(b.rows[r]?.length ?? 0, a.rows[r]?.length ?? 0); c++) {
          const v0 = b.rows[r]?.[c], v1 = a.rows[r]?.[c]; if (v0 === v1 || (v0 == null && v1 == null) || b.fx.has(cellKey(r, c))) continue;
          if (b.name === m.sheet) { if (typeof v0 === 'string' && v0 !== '') bad.push('seed ' + m.seed + ' text overwritten ' + cellRef(r, c) + ' «' + v0 + '»'); continue; }
          if (b.name === m.dataSheet) { if (typeof v0 === 'string' && /^(Α\/Α|ΒΑΘΜΟΣ|ΟΝΟΜΑΤΕΠΩΝΥΜΟ|ΚΑΤΑΣΤΑΣΗ|ΑΜ|ΤΗΛΕΦΩΝΟ)$/.test(v0) && r < 6) bad.push('seed ' + m.seed + ' header overwritten ' + cellRef(r, c)); continue; }
          bad.push('seed ' + m.seed + ' other sheet ' + b.name + ' changed ' + cellRef(r, c));
        }
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it('every unmapped column with data is reported and never written', () => {
    const bad: string[] = [];
    for (const { m, report } of runs) for (const u of report.front ? m.unmappedCols : []) {   // no table found = nothing written, one warning
      const ref = colLetter(u.c);
      const rep = report.unmappedCols.find(x => x.ref === ref);
      if (!rep) bad.push('seed ' + m.seed + ' column ' + ref + ' «' + u.text + '» not reported · ' + u.kind);
      else if (u.data && !rep.hasData) bad.push('seed ' + m.seed + ' column ' + ref + ' data not noticed');
      if (report.written.some(w => w.sheet === m.sheet && w.c === u.c)) bad.push('seed ' + m.seed + ' column ' + ref + ' «' + u.text + '» was written');
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it('a dry run writes nothing and reports the same cells', async () => {
    for (const run of runs.slice(0, Math.min(runs.length, 6))) {
      const { m, report } = run; const d = await fillAdaptive(m.buf, m.s, m.date, m.profile, { dryRun: true });
      expect(d.buffer.equals(m.buf)).toBe(true); expect(d.report.dryRun).toBe(true);
      expect(d.report.written.map(w => w.ref + '=' + w.value)).toEqual(report.written.map(w => w.ref + '=' + w.value));
      expect(d.report.cross.mismatches).toEqual(report.cross.mismatches);
    }
  }, 120000);

  describe.skipIf(!soffice)('recalculated by LibreOffice', () => {
    it('every cell is right or REPORTED; the evaluator agrees with LibreOffice', async () => {
      const lo = await recalcAll(runs.map(r => r.out));
      const silent: string[] = []; const disagree: string[] = []; const T = { cells: 0, right: 0, reported: 0, silent: 0, formulas: 0, evalOk: 0, evalSkip: 0 };
      const byFlag = new Map<string, { cells: number; right: number; reported: number }>();
      runs.forEach((run, i) => {
        run.lo = lo[i]; const { m, report } = run; const L = lo[i].find(x => x.name === m.sheet)!; const ev = new Evaluator(run.after); const AF = run.after.find(x => x.name === m.sheet)!;
        const reportedCell = new Set<string>([...report.cross.mismatches.map(x => x.ref), ...report.refused.filter(x => x.sheet === m.sheet).map(x => x.ref), ...report.totalsSkipped.map(x => x.ref)]);
        const colRep = new Set(report.unmappedCols.map(x => x.ref)); const rowRep = new Set(report.unmappedRows.map(x => x.ref));
        const flag = (m.flags.countifs ? 'countifs' : 'plain') + '/' + m.flags.totals + (m.flags.originSplit ? '/origin' : '') + (m.flags.rankSplit ? '/rank' : '') + (m.flags.own ? '/own' : '') + (m.flags.lochos ? '/lochos' : '') + (m.flags.seps ? '/seps' : '');
        for (const [k, t] of m.truth) {
          const [r, c] = k.split(':').map(Number); const v = rows(L.rows[r]?.[c]); const ref = cellRef(r, c);
          T.cells++; const bf = byFlag.get(flag) || { cells: 0, right: 0, reported: 0 }; byFlag.set(flag, bf); bf.cells++;
          if (v === t) { T.right++; bf.right++; continue; }
          if (!report.front || reportedCell.has(ref) || colRep.has(colLetter(c)) || rowRep.has(String(r + 1))) { T.reported++; bf.reported++; continue; }
          T.silent++; silent.push('seed ' + m.seed + ' ' + ref + ' LibreOffice ' + v + ' truth ' + t + ' · ' + m.desc[0].slice(0, 160));
        }
        // the evaluator and LibreOffice give the same number for every formula cell of the front sheet
        for (const kk of AF.formulas.keys()) {
          const [r, c] = kk.split(':').map(Number); T.formulas++; const e = ev.cell(AF, r, c);
          if (e === UNSUPPORTED) { T.evalSkip++; continue; }
          if (rows(e) === rows(L.rows[r]?.[c])) T.evalOk++; else disagree.push('seed ' + m.seed + ' ' + cellRef(r, c) + ' evaluator ' + e + ' LibreOffice ' + L.rows[r]?.[c] + ' · ' + AF.formulas.get(kk));
        }
      });
      const line = (k: string, x: { cells: number; right: number; reported: number }) => k.padEnd(40) + String(x.cells).padStart(7) + String(x.right).padStart(8) + String(x.reported).padStart(10) + String(x.cells - x.right - x.reported).padStart(8);
      console.log('\n' + 'template kind'.padEnd(40) + 'cells'.padStart(7) + 'right'.padStart(8) + 'reported'.padStart(10) + 'WRONG'.padStart(8) + '\n' + [...byFlag.entries()].sort().map(([k, x]) => line(k, x)).join('\n') + '\n' + line('TOTAL', { cells: T.cells, right: T.right, reported: T.reported })
        + '\nformula cells ' + T.formulas + ': evaluator = LibreOffice on ' + T.evalOk + ', not evaluable ' + T.evalSkip + ', disagree ' + disagree.length
        + '\nno table found (nothing written, one warning): ' + runs.filter(r => !r.report.front).length + ' of ' + runs.length
        + '\nwritten ' + runs.reduce((a, r) => a + r.report.written.length, 0) + ' · refused ' + runs.reduce((a, r) => a + r.report.refused.length, 0) + ' · cross-check mismatches ' + runs.reduce((a, r) => a + r.report.cross.mismatches.length, 0) + ' · unmapped columns ' + runs.reduce((a, r) => a + r.report.unmappedCols.length, 0));
      expect(silent.slice(0, 8)).toEqual([]);
      expect(disagree.slice(0, 8)).toEqual([]);
    }, 900000);
  });
});
