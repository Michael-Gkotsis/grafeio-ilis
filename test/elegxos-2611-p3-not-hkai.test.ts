// Π3 (έλεγχος 25/11): αρχείο που δεν είναι ΗΚΑΙ/ΗΚΑΛ (Δυναμολόγιο, κατάσταση υπηρεσιών, κενό βιβλίο) δίνεται ως template.
// Πριν: η εφαρμογή έγραφε αριθμούς στις θέσεις του δείγματος (B10, C10…) ενός ξένου φύλλου και έβγαζε αρχείο χωρίς νόημα,
// ή έλεγε λάθος αιτία («έχει χάσει τύπους»).
// Τώρα: καθαρό μήνυμα, κανένα αρχείο. Τα κανονικά έντυπα (το δικό μας, τυχαία ΗΚΑΙ/ΗΚΑΛ) γεμίζουν όπως πριν.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { fillHkai, TemplateError } from '../src/main/exports';
import { fakeState } from './fixtures';
import { genHkai, save } from './tplgen';
import type { AppState } from '../src/shared/domain';

const D = '2026-11-20';
const lochos = (s: AppState): AppState => ({ ...s, settings: { ...s.settings, unitKind: 'lochos' } as AppState['settings'] });
async function book(fill: (ws: ExcelJS.Worksheet, i: number) => void, sheets = 2): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (let i = 0; i < sheets; i++) fill(wb.addWorksheet('Φύλλο' + (i + 1)), i);
  return save(wb);
}
const roster = (ws: ExcelJS.Worksheet) => {
  ws.addRow(['Α/Α', 'ΒΑΘΜΟΣ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΣΣΟ', 'ΤΗΛΕΦΩΝΟ']);
  for (let i = 1; i <= 40; i++) ws.addRow([i, i % 3 ? 'ΣΤΡ' : 'ΔΝΕΑΣ', 'ΕΠΩΝΥΜΟ' + i, 'ΟΝΟΜΑ', '2026 Γ', '69000000' + i]);
};
const services = (ws: ExcelJS.Worksheet) => {
  ws.addRow(['ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΣ']); ws.addRow(['Λ/Υ:', 'ΛΧΙΑΣ ΤΥΧΑΙΟΣ']); ws.addRow(['Α/Α', 'ΣΚΟΠΟΙ', 'ΩΡΕΣ']);
  for (let i = 1; i <= 12; i++) ws.addRow([i, 'ΣΤΡ ΕΠΩΝΥΜΟ' + i, '08:00-10:00']);
};

describe('Π3: αρχείο που δεν είναι ΗΚΑΙ/ΗΚΑΛ', () => {
  const cases: [string, () => Promise<Buffer>][] = [
    ['Δυναμολόγιο', () => book(roster)],
    ['κατάσταση υπηρεσιών', () => book(services)],
    ['κενό βιβλίο', () => book(() => undefined)],
    // όπως το πραγματικό Δυναμολόγιο: τύποι σε όλες τις στήλες (εκεί που η ΗΚΑΙ έχει τα σύνολα), άρα ο έλεγχος «έχασε τύπους» δεν το σταματούσε
    ['Δυναμολόγιο με τύπους', () => book(ws => { roster(ws); for (let r = 2; r <= 60; r++) for (let c = 5; c <= 30; c++) ws.getCell(r, c).value = { formula: 'ROW()*0', result: 0 } as ExcelJS.CellFormulaValue; })],
  ];
  for (const [what, make] of cases) for (const lo of [false, true]) it(what + (lo ? ' (ΗΚΑΛ)' : ' (ΗΚΑΙ)'), async () => {
    const s = lo ? lochos(fakeState(30)) : fakeState(30);
    const err = await fillHkai(await make(), s, D, {}).then(() => null, e => e);
    expect(err, 'έβγαλε αρχείο από ' + what).toBeInstanceOf(TemplateError);
    expect((err as Error).message).toContain('δεν μοιάζει με ' + (lo ? 'ΗΚΑΛ' : 'ΗΚΑΙ'));
  });
  it('το δικό μας template και τυχαία ΗΚΑΙ/ΗΚΑΛ γεμίζουν όπως πριν', async () => {
    const own = await fillHkai(fs.readFileSync('templates/hkai.xlsx'), fakeState(30), D, {});
    expect(own.data.length).toBeGreaterThan(1000);
    for (let seed = 1; seed <= 12; seed++) {
      const lo = seed % 2 === 0; const g = await genHkai(seed, lo); const s = lo ? lochos(fakeState(30)) : fakeState(30);
      const o = await fillHkai(g.buf, s, D, {}); expect(o.data.length, 'seed ' + seed).toBeGreaterThan(1000);
    }
  }, 60000);
});
