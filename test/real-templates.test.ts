// LOCAL ONLY: reads the real unit files (never committed) and prints what the engine finds in each.
// REAL_TEMPLATES_DIR=/path/to/folder npx vitest run test/real-templates.test.ts   (.xlsx/.xlsm/.xls, subfolders one level deep)
// Skipped when the variable is not set. Asserts nothing about content, only that every file reads and detects without a crash.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { readBookModel } from '../src/main/bookModel';
import { detectBook, describeShape, type Region } from '../src/shared/shape';
import type { Match } from '../src/shared/lexicon';
import { readRoster, countKinds } from '../src/shared/rosterRead';
import { convertXls } from '../src/main/xlsConvert';
import { fillAdaptive, pickFront } from '../src/main/fillAdaptive';
import { genHkState, DAYS } from './hk-gen';
import { withBackData } from './backgen';

const dir = process.env.REAL_TEMPLATES_DIR;
function files(d: string, depth = 0): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory() && depth < 1) out.push(...files(p, depth + 1));
    else if (/\.(xlsx|xlsm|xls)$/i.test(e.name) && !e.name.startsWith('~$')) out.push(p);
  }
  return out;
}
const matches = (x: Region): Match[] => (x.type === 'matrix' ? [...x.cols.map(c => c.match), ...x.rows.map(r => r.match)] : x.type === 'list' ? x.cols.map(c => c.match) : [...x.left, ...x.right].map(c => c.match));

describe.skipIf(!dir)('real unit files (local only)', () => {
  it('reads and detects every file', async () => {
    const tot = { sure: 0, suggest: 0, unknown: 0 };
    for (const f of files(dir!)) {
      const t0 = Date.now(); const book = await readBookModel(f); const shape = detectBook(book);
      const c = { sure: 0, suggest: 0, unknown: 0 };
      for (const s of shape.sheets) for (const r of s.regions) for (const m of matches(r)) c[m.confidence]++;
      tot.sure += c.sure; tot.suggest += c.suggest; tot.unknown += c.unknown;
      console.log('## ' + path.relative(dir!, f) + ' (' + book.from + (book.converter ? ' via ' + book.converter : '') + ', ' + (Date.now() - t0) + ' ms) sure=' + c.sure + ' suggest=' + c.suggest + ' unknown=' + c.unknown + '\n' + shape.sheets.map(describeShape).join('\n'));
      // the people list of every roster-like sheet (counts only; names never printed)
      for (const sh of book.sheets) {
        const x = readRoster(sh); if (!x.found) continue;
        const k = countKinds(x);
        console.log('   roster «sheet ' + (book.sheets.indexOf(sh) + 1) + '»: people=' + x.people.length + ' (cadre ' + k.cadre + ', soldier ' + k.soldier + ', ask ' + k.ask + ') positions-without-name=' + x.vacant + ' skipped=' + x.skipped.length + ' groups=' + x.groups.length + (x.stoppedAt ? ' stopped: ' + x.stoppedAt.why : ''));
      }
      expect(book.sheets.length).toBeGreaterThan(0);
    }
    console.log('TOTAL sure=' + tot.sure + ' suggest=' + tot.suggest + ' unknown=' + tot.unknown);
  }, 600000);
});

// Dry-run of the adaptive fill on every real ΗΚΑΙ/ΗΚΑΛ-like file with a generated state. Prints COUNTS only (never a word of the files).
describe.skipIf(!dir)('adaptive fill, dry run on the real files (local only)', () => {
  it('fills every ΗΚΑΙ/ΗΚΑΛ table found, writes nothing, reports counts', async () => {
    let n = 0;
    for (const f of files(dir!)) {
      let buf: Buffer; let cleanup = () => {};
      if (/\.xls$/i.test(f)) { const c = await convertXls(f); if (!c) continue; buf = fs.readFileSync(c.file); cleanup = c.cleanup; } else buf = fs.readFileSync(f);
      try {
        const book = await readBookModel(f); if (!pickFront(detectBook(book))) continue;
        n++;
        for (const lochos of [false, true]) {
          let seed = 5; const s = withBackData(genHkState(3, { lochos }), DAYS[2], () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; });
          const { buffer, report: r } = await fillAdaptive(buf, s, DAYS[2], null, { dryRun: true });
          expect(buffer.equals(buf)).toBe(true);
          console.log('real file #' + n + (lochos ? ' (Λόχος state)' : ' (Ίλη state)') + ': would write ' + r.written.length + ' · refused ' + r.refused.length + ' · formulas kept ' + r.kept
            + ' · unmapped columns ' + r.unmappedCols.length + ' (with data ' + r.unmappedCols.filter(x => x.hasData).length + ') · unmapped rows ' + r.unmappedRows.length + ' (with data ' + r.unmappedRows.filter(x => x.hasData).length + ')'
            + ' · people without a row ' + r.unplacedRows.reduce((a, x) => a + x.n, 0) + ' · people in a state without a column ' + r.unplacedStates.reduce((a, x) => a + x.n, 0) + ' · totals skipped ' + r.totalsSkipped.length
            + (r.data ? ' · data sheet: ' + r.data.rows + ' people rows, ' + r.data.unwritable.length + ' not placed, ' + r.data.vocab.length + ' vocabulary words' : '')
            + ' · back side: ' + (r.back.sheet ? r.back.sections.filter(x => x.state === 'sure').length + ' sure sections, ' + r.back.sections.filter(x => x.state === 'suggest').length + ' proposals, lines placed ' + r.back.sections.reduce((a, x) => a + x.placed, 0) + ', on a continuation page ' + r.back.sections.reduce((a, x) => a + x.moved, 0) + ', not placed ' + r.back.sections.reduce((a, x) => a + Math.max(0, x.unplaced), 0) + ', categories without a section ' + r.back.missing.length + ', continuation sheet ' + (r.back.continuation ? 'yes' : 'no') : 'no back side found')
            + ' · title ' + (r.back.front.title ? 'found' : 'not found') + ', date line ' + (r.back.front.date ? 'found' : 'not found') + ', signature roles ' + r.back.front.sigs
            + ' · cross-check: ' + r.cross.matched + '/' + r.cross.checked + ' match, ' + r.cross.mismatches.length + ' differ, ' + r.cross.unevaluated + ' not evaluable');
        }
      } finally { cleanup(); }
    }
    console.log('ΗΚΑΙ/ΗΚΑΛ-like files filled in dry run: ' + n);
  }, 600000);
});
