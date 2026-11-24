// Παλιά .xls (Michael, 24/11: η «Αντιστοίχιση» σε δικό του template κολλούσε): οι μετατροπές με τους προεπιλεγμένους μετατροπείς γίνονται μία τη φορά,
// το ίδιο .xls μετατρέπεται μία φορά για όλες τις οθόνες που το διαβάζουν (προεπισκόπηση, Αρχεία Excel, Αντιστοίχιση), και μια αποτυχημένη
// μετατροπή δεν ξαναδοκιμάζεται σε κάθε κλικ. Εδώ με ψεύτικο μετατροπέα (χωρίς Excel / LibreOffice).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_CONVERTERS, convertXls, resetXlsCacheState, type XlsConverter } from '../src/main/xlsConvert';
import { xlsxFile } from '../src/main/tplAdapt';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grafeio-xq-'));
const xlsx = fs.readFileSync(path.join(__dirname, '..', 'templates', 'hkai.xlsx'));
let calls = 0, live = 0, maxLive = 0, ok = true;
const fake: XlsConverter = {
  name: 'fake',
  async run(copy, outDir) {
    calls++; live++; maxLive = Math.max(maxLive, live);
    await new Promise(r => setTimeout(r, 40)); live--;
    if (!ok) return null;
    const out = path.join(outDir, 'fake-' + path.basename(copy).replace(/\.xls$/i, '') + '.xlsx'); fs.writeFileSync(out, xlsx); return out;
  }
};
let saved: XlsConverter[] = [];
let n = 0;
const makeXls = () => { const f = path.join(dir, 'ΥΠΟΔΕΙΓΜΑ ' + ++n + '.xls'); fs.writeFileSync(f, Buffer.from('not really an xls ' + n + ' ' + Math.random())); return f; };

beforeAll(() => { saved = DEFAULT_CONVERTERS.splice(0, DEFAULT_CONVERTERS.length, fake); });
afterAll(() => { DEFAULT_CONVERTERS.splice(0, DEFAULT_CONVERTERS.length, ...saved); fs.rmSync(dir, { recursive: true, force: true }); });
beforeEach(() => { calls = 0; live = 0; maxLive = 0; ok = true; resetXlsCacheState(); });

describe('μετατροπή .xls: μία τη φορά και μία φορά ανά αρχείο', () => {
  it('έξι ταυτόχρονες αιτήσεις για το ίδιο αρχείο: ένας μετατροπέας, όλοι παίρνουν το ίδιο .xlsx, και μετά από τη μνήμη', async () => {
    const f = makeXls(); const orig = fs.readFileSync(f);
    const rs = await Promise.all([1, 2, 3, 4, 5, 6].map(() => convertXls(f)));
    expect(calls).toBe(1);
    for (const r of rs) { expect(r).not.toBeNull(); expect(r!.file).toBe(rs[0]!.file); expect(fs.existsSync(r!.file)).toBe(true); }
    rs.forEach(r => r!.cleanup());                                   // το cleanup δεν σβήνει το κοινό αντίγραφο
    const again = await convertXls(f); expect(again!.file).toBe(rs[0]!.file); expect(again!.converter).toBe('cache'); expect(calls).toBe(1);
    expect(fs.readFileSync(f).equals(orig)).toBe(true);              // το αρχικό δεν αλλάζει ποτέ
  });
  it('δύο διαφορετικά αρχεία μαζί: δεν τρέχουν ταυτόχρονα', async () => {
    const a = makeXls(), b = makeXls();
    const [x, y] = await Promise.all([convertXls(a), convertXls(b)]);
    expect(calls).toBe(2); expect(maxLive).toBe(1); expect(x!.file).not.toBe(y!.file);
  });
  it('xlsxFile (Αντιστοίχιση, προεπισκόπηση) δίνει το κοινό .xlsx και δεν ξαναμετατρέπει', async () => {
    const f = makeXls();
    const [p1, p2] = await Promise.all([xlsxFile(f), xlsxFile(f)]);
    expect(p1).toBe(p2); expect(p1).toMatch(/\.xlsx$/); expect(await xlsxFile(f)).toBe(p1); expect(calls).toBe(1);
  });
  it('αποτυχημένη μετατροπή: δεν ξαναδοκιμάζεται αμέσως (το «Αντιστοίχιση» δεν περιμένει ξανά και ξανά), ξανά μετά από λίγο', async () => {
    const f = makeXls(); ok = false;
    expect(await convertXls(f)).toBeNull(); expect(calls).toBe(1);
    expect(await convertXls(f)).toBeNull(); expect(calls).toBe(1);   // ίδια απάντηση χωρίς να περιμένει τον μετατροπέα
    await expect(xlsxFile(f)).rejects.toThrow(/παλιό \.xls/);
    resetXlsCacheState(); ok = true;                                 // (το ίδιο που κάνει το πέρασμα του λεπτού)
    expect(await convertXls(f)).not.toBeNull(); expect(calls).toBe(2);
  });
});
