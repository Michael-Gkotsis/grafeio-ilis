// Π3 (έλεγχος 25/11), με έγκριση του Michael: τρία σφάλματα σε ΗΚΑΙ/ΗΚΑΛ άλλων μονάδων.
//  Α. Γραμμές «(Μ)» = μόνιμοι (ΥΠΟΔΕΙΓΜΑ 50ης ΕΜΑ: «Λχίες (Μ)», «Επχίες (M/ΕΜΘ)»): μετρούσαν μόνο προέλευση «Μόνιμος», που δεν
//     υπάρχει στη λίστα της εφαρμογής (ΕΠΟΠ, ΟΒΑ, ΣΜΥ, ΣΣΕ)· τα μόνιμα στελέχη έβγαιναν 0. Μόνιμο = στέλεχος χωρίς προέλευση ή ΣΜΥ/ΣΣΕ.
//  Β. ΗΚΑΛ που μετρά το Παρουσιολόγιο: όποιος είναι σε υπηρεσία γραφόταν με κενή ΚΑΤΑΣΤΑΣΗ, αν και η λίστα έχει «ΥΠΗΡΕΣΙΑ».
//     Τώρα η λέξη του αρχείου· κωλυόμενος χωρίς δική του λέξη = «ΠΑΡΩΝ» (μέσα στο στρατόπεδο).
//  Γ. «Μ.ΛΧΙΑΣ» = μόνιμος Λοχίας (η Αντιστοίχιση πρότεινε «Αρχιλοχίας»).
// Μόνο γεννημένα αρχεία· κανένα πραγματικό έντυπο μονάδας.
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildLexicon } from '../src/shared/lexicon';
import { HkEngine, resolveRow } from '../src/shared/hkRules';
import { hkaiClassify, type HkClass, type HkWho } from '../src/shared/rules';
import { hkRowList } from '../src/shared/ranks';
import { upper } from '../src/shared/text';
import { fillAdaptive } from '../src/main/fillAdaptive';
import { genMock } from './mockgen';
import { genHkState, DAYS } from './hk-gen';
import type { AppState } from '../src/shared/domain';

const lex = buildLexicon();
const ctx = (s: AppState) => ({ lex, rows: hkRowList(s.settings.lists), settings: s.settings, profile: null });

describe('Α. γραμμές «(Μ)»: μόνιμοι', () => {
  const s = genHkState(1);
  const who = (kind: 'cadre' | 'soldier', origin: string): HkWho => ({ kind, row: 'Λοχίες', col: null, attached: false, origin, rank: 'ΛΧΙΑΣ' });
  const cls = (w: HkWho[]): HkClass => ({ who: w, rows: hkRowList(s.settings.lists), absKeys: [], fixed: {}, manual: {}, noCol: [] });
  const ppl = [who('cadre', ''), who('cadre', 'ΣΜΥ'), who('cadre', 'ΣΣΕ'), who('cadre', 'ΕΠΟΠ'), who('cadre', 'ΕΜΘ'), who('soldier', ''), who('soldier', 'ΕΠΟΠ'), who('cadre', 'Μόνιμος')];
  const eng = new HkEngine(cls(ppl), lex);
  const count = (text: string) => { const r = resolveRow(text, undefined, ctx(s)).rule; expect(r, text).toBeTruthy(); return eng.count(r!, { t: 'force' }); };
  it('«Λχίες (Μ)»: στέλεχος χωρίς προέλευση, ΣΜΥ, ΣΣΕ, «Μόνιμος»· ποτέ στρατιώτης ή ΕΠΟΠ/ΕΜΘ', () => { expect(count('Λχίες (Μ)')).toBe(4); });
  it('«Λχίες (M/ΕΜΘ)»: οι μόνιμοι και οι ΕΜΘ', () => { expect(count('Λχίες (M/ΕΜΘ)')).toBe(5); });
  it('«Λχίες (ΕΠΟΠ)» δεν αλλάζει: μόνο ΕΠΟΠ (στέλεχος και στρατιώτης)', () => { expect(count('Λχίες (ΕΠΟΠ)')).toBe(2); });
  it('«Λοχίες» χωρίς όρο: όλοι', () => { expect(count('Λοχίες')).toBe(ppl.length); });
});

describe('Γ. «Μ.ΛΧΙΑΣ» = μόνιμος Λοχίας', () => {
  for (const w of ['Μ.ΛΧΙΑΣ', 'Μ. ΛΧΙΑΣ', 'μ.λχιας']) it(w, () => {
    const m = lex.match(w, { kinds: ['rank', 'hkrow'] });
    expect(m.concept).toBe('rank:ΛΟΧΙΑΣ'); expect(m.confidence).toBe('sure');
  });
  it('«ΑΛΧΙΑΣ» μένει Αρχιλοχίας', () => { expect(lex.match('ΑΛΧΙΑΣ', { kinds: ['rank', 'hkrow'] }).concept).toBe('rank:ΑΡΧΙΛΟΧΙΑΣ'); });
});

// το Παρουσιολόγιο του γεννημένου ΗΚΑΛ: λίστα ΚΑΤΑΣΤΑΣΗ με «ΥΠΗΡΕΣΙΑ» και «ΠΑΡΩΝ» στις δύο τελευταίες θέσεις
async function hkalWithList(seed: number): Promise<Buffer> {
  const m = await genMock('real-hkal-countifs', seed); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(m.buf as never);
  const ws = wb.getWorksheet('Παρουσιολόγιο')!; let last = 0;
  for (let r = 8; r < 40; r++) if (ws.getCell(r, 16).value) last = r;
  ws.getCell(last - 1, 16).value = 'ΥΠΗΡΕΣΙΑ'; ws.getCell(last, 16).value = 'ΠΑΡΩΝ';
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function statuses(buf: Buffer): Promise<Map<string, string>> {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as never); const ws = wb.getWorksheet('Παρουσιολόγιο')!; const m = new Map<string, string>();
  for (let r = 8; r < 80; r++) { const n = ws.getCell(r, 5).value; if (typeof n === 'string' && n) m.set(n, String(ws.getCell(r, 6).value ?? '')); }
  return m;
}
describe('Β. ΗΚΑΛ με Παρουσιολόγιο: η κατάσταση ατόμων χωρίς στήλη στο έντυπο', () => {
  for (let seed = 1; seed <= 6; seed++) it('seed ' + seed, async () => {
    const s = genHkState(seed, { lochos: true }); const buf = await hkalWithList(seed);
    let yp = 0, kol = 0;
    for (const d of DAYS.slice(2, 8)) {
      const { buffer, report } = await fillAdaptive(buf, s, d, null);
      expect(report.data, 'φύλλο δεδομένων').toBeTruthy();
      expect(report.data!.unwritable.filter(x => /«yp»/.test(x)), d).toEqual([]);
      const st = await statuses(buffer);
      for (const w of hkaiClassify(s, d).who) {
        const p = w.kind === 'soldier' ? w.p! : null; if (!p) continue;
        const got = st.get(upper(p.last + ' ' + p.first)); if (got == null) continue;
        if (w.col === 'yp') { yp++; expect(got, d + ' ' + p.last).toBe('ΥΠΗΡΕΣΙΑ'); }
        else if (w.col && ['ey', 'tim', 'os', 'mag', 'sid', 'kin'].includes(w.col)) { kol++; expect(got, d + ' ' + p.last + ' ' + w.col).toBe('ΠΑΡΩΝ'); }
        else if (w.col == null) expect(got).toBe('ΠΑΡΩΝ');
      }
    }
    expect(yp + kol, 'κανείς σε υπηρεσία ή κωλυόμενος').toBeGreaterThan(0);
  }, 60000);
});
