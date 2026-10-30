// Η τωρινή μορφή του Excel Εξοδούχων μένει ίδια κελί προς κελί όταν προστίθεται η μορφή «Όλη η δύναμη».
// Το outs-snapshot.json έχει το sha1 των κελιών (τιμές, στυλ, συγχωνεύσεις, εκτύπωση) ανά τυχαία κατάσταση, μέρα και μορφή, όπως
// γράφονταν πριν από τη μορφή «Όλη η δύναμη». Αλλαγή που τα αλλάζει επίτηδες: UPDATE_SNAP=1 npx vitest run test/outs-snapshot.test.ts
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fillOuts } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { genState } from './outs-gen';

const FILE = path.join(__dirname, 'outs-snapshot.json');
const T = fs.readFileSync(path.join(__dirname, '..', 'templates', 'exodouxoi.xlsx'));
async function digest(data: Buffer): Promise<string> {
  const wb = await Workbook.open(data); const out: unknown[] = [wb.sheetNames()];
  for (const n of wb.sheetNames()) { const ws = await wb.sheet(n); const d = ws.dump(); out.push([n, d, Object.keys(d.cells).map(k => ws.style(k))]); }
  return crypto.createHash('sha1').update(JSON.stringify(out)).digest('hex');
}

describe('Εξοδούχοι: η τωρινή μορφή ίδια κελί προς κελί', () => {
  it('Τωρινή: ίδιο αποτύπωμα με πριν', async () => {
    const got: Record<string, string> = {};
    for (let seed = 1; seed <= 10; seed++) {
      const s0 = genState(2000 + seed, seed % 2 === 0, 10);
      for (const d of ['2026-10-24', '2026-10-25', '2026-10-28', '2026-10-30']) for (const fmt of ['cur'] as const) {
        const r = await fillOuts(T, { ...s0, settings: { ...s0.settings, outsFmt: fmt } }, d);
        got[seed + ' ' + d + ' ' + fmt] = await digest(r.data) + ' ' + r.name;
      }
    }
    if (process.env.UPDATE_SNAP || !fs.existsSync(FILE)) { fs.writeFileSync(FILE, JSON.stringify(got, null, 1) + '\n'); return; }
    expect(got).toEqual(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  }, 120000);
});
