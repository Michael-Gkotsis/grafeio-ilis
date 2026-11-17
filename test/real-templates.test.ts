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
