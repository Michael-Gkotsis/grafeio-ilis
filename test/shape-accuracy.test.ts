// Accuracy harness of the template engine: mock files with ground truth (test/mockgen.ts) go through the real reader
// (modelOfBuffer) and the detector (detectBook); every column/row/label/geometry is scored as
// sure-correct | suggested | missed | WRONG-SURE. A wrong-sure answer fails the test; the other numbers must stay above honest thresholds.
// FUZZ_N=200 npx vitest run test/shape-accuracy.test.ts for more seeds (default 25 per kind).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { modelOfBuffer, readBookModel } from '../src/main/bookModel';
import { findSoffice } from '../src/main/xlsConvert';
import { detectBook } from '../src/shared/shape';
import { KINDS, REAL_KINDS, genMock, emptyWorkbook, bigRoster, type MockKind } from './mockgen';
import { score, add, emptyTally, type Scored, type Tally } from './shape-evaluate';

const N = Number(process.env.FUZZ_N || 25);
const table: Record<string, Tally> = {};
const wrong: string[] = [];

async function run(kind: MockKind, seed: number, bufOverride?: Buffer) {
  const m = await genMock(kind, seed);
  const book = await modelOfBuffer(bufOverride || m.buf);
  const shape = detectBook({ sheets: book });
  return { m, scored: score(shape, m.items) };
}
function tally(kind: string, scored: Scored[], seed: number) {
  const t = (table[kind] ||= emptyTally());
  for (const s of scored) { add(t, s.verdict); if (s.verdict === 'wrong-sure') wrong.push(kind + ' seed ' + seed + ': ' + s.why + ' [' + s.item.what + ' ' + s.item.sheet + ' ' + (s.item.r ?? '') + ':' + (s.item.c ?? '') + ']'); }
}
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 100);

describe('accuracy on mock files', () => {
  for (const kind of KINDS) {
    it(kind + ' x' + N, async () => {
      for (let seed = 1; seed <= N; seed++) { const { scored } = await run(kind, seed); tally(kind, scored, seed); }
      const t = table[kind]; const n = t.sure + t.suggested + t.missed + t.wrongSure;
      expect(wrong.filter(w => w.startsWith(kind + ' '))).toEqual([]);
      expect(pct(t.sure + t.suggested, n), JSON.stringify(t)).toBeGreaterThanOrEqual(THRESH[kind]);
    }, 600000);
  }
  for (const kind of REAL_KINDS) {
    it(kind + ' (replica of a real unit file)', async () => {
      for (let seed = 1; seed <= Math.min(N, 5); seed++) { const { scored } = await run(kind, seed); tally(kind, scored, seed); }
      const t = table[kind]; const n = t.sure + t.suggested + t.missed + t.wrongSure;
      expect(wrong.filter(w => w.startsWith(kind + ' '))).toEqual([]);
      expect(pct(t.sure + t.suggested, n), JSON.stringify(t)).toBeGreaterThanOrEqual(THRESH[kind]);
    }, 600000);
  }
  it('report', () => {
    const rows = Object.entries(table).map(([k, t]) => { const n = t.sure + t.suggested + t.missed + t.wrongSure; return k.padEnd(22) + String(t.sure).padStart(7) + String(t.suggested).padStart(10) + String(t.missed).padStart(8) + String(t.wrongSure).padStart(7) + String(pct(t.sure, n) + '%').padStart(9) + String(pct(t.sure + t.suggested, n) + '%').padStart(9); });
    const tot = Object.values(table).reduce((a, t) => ({ sure: a.sure + t.sure, suggested: a.suggested + t.suggested, missed: a.missed + t.missed, wrongSure: a.wrongSure + t.wrongSure }), emptyTally());
    const n = tot.sure + tot.suggested + tot.missed + tot.wrongSure;
    console.log('\n' + 'kind'.padEnd(22) + 'sure-ok'.padStart(7) + 'suggested'.padStart(10) + 'missed'.padStart(8) + 'WRONG'.padStart(7) + 'sure%'.padStart(9) + 'ok%'.padStart(9) + '\n' + rows.join('\n')
      + '\n' + 'TOTAL'.padEnd(22) + String(tot.sure).padStart(7) + String(tot.suggested).padStart(10) + String(tot.missed).padStart(8) + String(tot.wrongSure).padStart(7) + String(pct(tot.sure, n) + '%').padStart(9) + String(pct(tot.sure + tot.suggested, n) + '%').padStart(9));
    expect(tot.wrongSure).toBe(0);
  });
});

// minimal % of items (sure + suggested) per kind; set from measured results with a margin
const THRESH: Record<MockKind, number> = {
  hkai: 85, hkal: 85, 'hkal-countifs': 85, 'duty-grid': 85, 'service-list': 80, roster: 85, weapons: 85,
  'real-hkai-2509': 90, 'real-hkai-own-cols': 70, 'real-hkal-countifs': 85, 'real-ypiresies': 85, 'real-ypiresies-kath': 80, 'real-dynamologio': 85, 'real-oplismos': 85
};

describe('hard files', () => {
  it('an empty workbook gives one empty sheet and no regions', async () => {
    const book = await modelOfBuffer(await emptyWorkbook());
    expect(book.length).toBe(1);
    const s = detectBook({ sheets: book });
    expect(s.sheets[0].regions).toEqual([]);
  });
  it('a corrupted zip is an error, not a crash', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafeio-bad-'));
    try {
      const f = path.join(dir, 'bad.xlsx'); fs.writeFileSync(f, Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(300, 7)]));
      await expect(readBookModel(f)).rejects.toThrow(/δεν διαβάζεται/);
      const e = path.join(dir, 'empty.xlsx'); fs.writeFileSync(e, '');
      await expect(readBookModel(e)).rejects.toThrow();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('a big roster is read and detected within the time budget', async () => {
    const { buf, first, last } = await bigRoster(5000);
    const t0 = Date.now();
    const book = await modelOfBuffer(buf);
    const shape = detectBook({ sheets: book });
    const ms = Date.now() - t0;
    const l = shape.sheets[0].regions.find(x => x.type === 'list');
    expect(l && l.type === 'list' && l.r1).toBe(first);
    expect(l && l.type === 'list' && l.r2).toBe(last);
    expect(ms).toBeLessThan(15000);
  }, 60000);
});

const soffice = findSoffice();
describe.skipIf(!soffice)('.xls through LibreOffice', () => {
  for (const [kind, seed] of [['hkai', 3], ['roster', 5], ['real-hkal-countifs', 1], ['duty-grid', 2]] as [MockKind, number][]) {
    it(kind + ' saved as .xls reads back with the same truth', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafeio-xlstest-'));
      try {
        const m = await genMock(kind, seed);
        const src = path.join(dir, 'in', 'm.xlsx'); fs.mkdirSync(path.dirname(src)); fs.writeFileSync(src, m.buf);
        execFileSync(soffice!, ['--headless', '--norestore', '-env:UserInstallation=file://' + path.join(dir, 'prof'), '--convert-to', 'xls', '--outdir', path.join(dir, 'out'), src], { timeout: 120000, stdio: 'ignore' });
        const xls = path.join(dir, 'out', 'm.xls'); const before = fs.readFileSync(xls);
        const book = await readBookModel(xls);
        expect(book.from).toBe('xls'); expect(book.converter).toBe('libreoffice');
        expect(fs.readFileSync(xls).equals(before)).toBe(true);   // the original is never touched
        const scored = score(detectBook(book), m.items);
        const bad = scored.filter(s => s.verdict === 'wrong-sure').map(s => s.why);
        expect(bad).toEqual([]);
        const ok = scored.filter(s => s.verdict === 'sure' || s.verdict === 'suggested').length;
        expect(ok / scored.length).toBeGreaterThan(0.7);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }, 180000);
  }
});
