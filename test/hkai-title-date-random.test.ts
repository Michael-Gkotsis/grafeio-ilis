// ΗΚΑΙ/ΗΚΑΛ άλλων μονάδων: τίτλος και ημερομηνία σε κάθε μορφή που έχουμε δει (Michael, 24/11: «πρόβλημα με την ημερομηνία», «Λάθος κελί: 2»).
// Τυχαία έντυπα (tplgen) με τίτλο «Ημερήσια αναφορά της ___ της / /», ημερομηνία σε δικό της κελί, «ΣΤΓ 915, / /» και κελί με τύπο
// στη θέση που θα έγραφε η εφαρμογή. Ό,τι κι αν έχει το έντυπο: ποτέ λάθος αντί για αρχείο, ποτέ κελί χωρίς γράμμα στήλης, η
// ημερομηνία γράφεται και η προεπισκόπηση αλλάζει όταν αλλάζει η μέρα. Μόνο γεννημένα αρχεία· κανένα πραγματικό έντυπο μονάδας.
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { fillHkai } from '../src/main/exports';
import { previewOf } from '../src/main/formPreview';
import { Workbook, toSerial } from '../src/main/xlsx';
import { detectHkai } from '../src/shared/sources';
import { apply } from '../src/shared/commands';
import { hkaiAdaptive, modelOfFile, profileFor } from '../src/main/tplAdapt';
import { emptyChoices } from '../src/shared/tplMap';
import type { AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';
import { genHkai, rng, int, pick, chance, save, col } from './tplgen';
import fs from 'fs';
import os from 'os';
import path from 'path';

const D1 = '2026-11-20', D2 = '2026-11-21';
const REF = /^[A-Z]+[1-9]\d*$/;
type Variant = 'plain' | 'nominative' | 'dateCell' | 'sigDate' | 'formula' | 'foreign' | 'dateCell+formula' | 'sigDate+foreign';
const DAY1 = /20(\/11\/(20)?| ΝΟΕ )26/, DAY2 = /21(\/11\/(20)?| ΝΟΕ )26/;   // «20 ΝΟΕ 26» (η εφαρμογή) ή «20/11/26» (η μορφή του εντύπου)
const VARIANTS: Variant[] = ['plain', 'nominative', 'dateCell', 'sigDate', 'formula', 'dateCell+formula', 'sigDate+foreign'];

// αλλάζει το γεννημένο έντυπο ώστε να έχει τη μορφή του variant
async function shape(buf: Buffer, vv: Variant, seed: number): Promise<Buffer> {
  for (const x of vv.split('+')) buf = await shape1(buf, x as Variant, seed);
  return buf;
}
async function shape1(buf: Buffer, v: Variant, seed: number): Promise<Buffer> {
  const r = rng(seed * 7 + 3); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  let title: ExcelJS.Cell | null = null; let first: ExcelJS.Worksheet | null = null;
  wb.eachSheet(ws => { if (title) return; ws.eachRow(row => row.eachCell(c => { if (!title && typeof c.value === 'string' && /^ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ/.test(c.value)) { title = c; first = ws; } })); });
  if (!title || !first) throw new Error('χωρίς τίτλο');
  const t = title as ExcelJS.Cell; const ws = first as ExcelJS.Worksheet;
  if (v === 'nominative') t.value = pick(r, ['Ημερήσια αναφορά της _________    της        /          /          ', 'Ημερήσια Αναφορά του …….  της  ../../....', 'ΗΜΕΡΗΣΙΑ ΑΝΑΦΟΡΑ της ______ ΤΗΣ   /   /  ']);
  if (v === 'dateCell') { t.value = 'ΗΜΕΡΗΣΙΑΣ ΑΝΑΦΟΡΑΣ ΛΟΧΟΥ ΣΚΑΠΑΝΕΩΝ - ΤΗΣ'; const c = ws.getCell(Number(t.row), Number(t.col) + int(r, 12, 20)); c.value = new Date(Date.UTC(2024, 7, 14)); c.numFmt = 'dd/mm/yyyy'; }
  if (v === 'sigDate') { const c = ws.getCell(Number(t.row) + 40, 3); c.value = 'ΣΤΓ 915,            /         /       '; }
  if (v === 'foreign') { ws.getCell(Number(t.row) + 60, 1).value = 'ΑΠΟΥΣΙΕΣ:'; ws.getCell(Number(t.row) + 61, 1).value = 'ΑΝΑΦΟΡΕΣ:'; }
  if (v === 'formula') {
    // κελί του πίνακα (στήλη Τοποθετημένοι) με τύπο που δεν αλλάζει
    let hit: ExcelJS.Cell | null = null;
    ws.eachRow(row => row.eachCell(c => { if (!hit && typeof c.value === 'string' && /^Στρατιώτες$/.test(c.value)) hit = ws.getCell(Number(c.row), Number(c.col) + 1); }));
    if (hit) (hit as ExcelJS.Cell).value = { formula: 'B3+1', result: 0 } as ExcelJS.CellFormulaValue;
  }
  void chance; void col;
  return save(wb);
}

const stateOf = (lochos: boolean): AppState => { const s = fakeState(60); return lochos ? { ...s, settings: { ...s.settings, unitKind: 'lochos' } as AppState['settings'] } : s; };
const text = async (o: { name: string; data: Buffer; warnings: string[]; sheet?: string }) => (await previewOf({ ...o, empty: [] })).sheets.map(x => x.html).join('');

describe('ΗΚΑΙ/ΗΚΑΛ: τίτλος και ημερομηνία σε τυχαία έντυπα', () => {
  for (let seed = 1; seed <= 24; seed++) for (const v of VARIANTS) it('seed ' + seed + ' ' + v, async () => {
    const lochos = seed % 2 === 0; const g = await genHkai(seed, lochos); const buf = await shape(g.buf, v, seed);
    const s = stateOf(lochos);
    // η αναγνώριση δίνει μόνο έγκυρα κελιά ή τίποτα (ποτέ «2» ή «Β»)
    const wb = await Workbook.open(buf);
    for (const n of wb.sheetNames()) { const d = detectHkai({ name: n, rows: await wb.values(n, 120, 40) }, s.settings.place); expect(d.map.title === '' || REF.test(d.map.title), n + ' τίτλος ' + d.map.title).toBe(true); expect(d.map.date === '' || REF.test(d.map.date), n + ' ημερομηνία ' + d.map.date).toBe(true); }
    // χωρίς αντιστοίχιση: αρχείο, όχι λάθος· η προεπισκόπηση ανανεώνεται όταν αλλάζει η μέρα
    const a = await fillHkai(buf, s, D1, {}); const b = await fillHkai(buf, s, D2, {});
    const ta = await text(a), tb = await text(b);
    expect(ta, 'seed ' + seed + ' ' + v).toMatch(DAY1); expect(tb).toMatch(DAY2); expect(ta).not.toBe(tb);
    expect(tb).not.toMatch(DAY1);
    // «κελιά» από το «Template…» με άκυρη τιμή («2»): πάλι αρχείο
    const c = await fillHkai(buf, s, D1, { cells: { title: '2', date: '2' } as never });
    expect(await text(c)).toMatch(DAY1);
  }, 60000);
});

describe('ΗΚΑΙ/ΗΚΑΛ με αποθηκευμένη αντιστοίχιση: τα κελιά του «Template…» δεν την αγνοούν', () => {
  for (let seed = 1; seed <= 6; seed++) for (const v of ['nominative', 'dateCell', 'formula'] as Variant[]) it('seed ' + seed + ' ' + v, async () => {
    const lochos = seed % 2 === 0; const g = await genHkai(seed + 100, lochos); const buf = await shape(g.buf, v, seed);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hkdate-')); const file = path.join(dir, 'f.xlsx'); fs.writeFileSync(file, buf);
    try {
      const s0 = stateOf(lochos); const { sheets } = await modelOfFile(file, s0, D1);
      const pf = profileFor(sheets, s0, { file, choices: emptyChoices() } as never);
      const s = apply(pf.state, { t: 'adaptTpl', profile: pf.profile, create: [], text: 't' }, { today: D1, newId: () => 'y' }).state;
      const plain = await fillHkai(buf, s, D1, {});
      const withCells = await fillHkai(buf, s, D1, { cells: { title: 'A1' } as never });
      expect(await text(plain)).toMatch(DAY1);
      // το «Template…» με κελί δεν παρακάμπτει την αντιστοίχιση: ίδιο αρχείο, όταν η μηχανή το γεμίζει
      const ad = await hkaiAdaptive(buf, s, D1, { cells: { title: 'A1' } });
      if (ad) expect(await text(withCells)).toBe(await text(plain)); else expect(await text(withCells)).toMatch(DAY1);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }, 60000);
});

describe('ΗΚΑΙ: ημερομηνία σε δικό της κελί και υπογραφή «ΣΤΓ 915, / /»', () => {
  for (const v of ['dateCell', 'dateCell+formula'] as Variant[]) it('το κελί ημερομηνίας δεξιά από τον τίτλο παίρνει τη μέρα (αριθμός Excel): ' + v, async () => {
    const g = await genHkai(5, true); const buf = await shape(g.buf, v, 5); const s = stateOf(true);
    const o = await fillHkai(buf, s, D1, {}); const out = await Workbook.open(o.data); const sh = await out.sheet(o.sheet || g.front);
    let hit = false;
    for (let r = 1; r <= 12; r++) for (let c = 1; c <= 45; c++) if (Number(sh.get(col(c) + r)) === toSerial(D1, false)) hit = true;
    expect(hit, 'η ημερομηνία του κελιού δεν άλλαξε').toBe(true);
  });
  it('η αναγνώριση του «Template…» δείχνει το κελί ημερομηνίας όταν δεν υπάρχει γραμμή «Τόπος,»', async () => {
    const g = await genHkai(6, true); const buf = await shape(g.buf, 'dateCell', 6);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    wb.eachSheet(ws => ws.eachRow(row => row.eachCell(c => { if (typeof c.value === 'string' && /^Αυλώνας,/.test(c.value)) c.value = null; })));
    const x = await Workbook.open(await save(wb)); let seen = '';
    for (const n of x.sheetNames()) { const d = detectHkai({ name: n, rows: await x.values(n, 120, 40) }, 'Αυλώνας'); if (d.found > 3) seen = d.map.date; }
    expect(seen).toMatch(REF);
  });
  it('«Ημερήσια αναφορά της ___ της / /»: ο τίτλος αναγνωρίζεται στο «Template…»', async () => {
    const g = await genHkai(7, false); const buf = await shape(g.buf, 'nominative', 7); const x = await Workbook.open(buf); let seen = '';
    for (const n of x.sheetNames()) { const d = detectHkai({ name: n, rows: await x.values(n, 120, 40) }, 'Αυλώνας'); if (d.found > 3) seen = d.map.title; }
    expect(seen).toMatch(REF);
  });
  it('«ΣΤΓ 915, / /» γεμίζει με τη μέρα, ο τόπος μένει όπως είναι', async () => {
    const g = await genHkai(8, false); const buf = await shape(g.buf, 'sigDate+foreign', 8); const s = stateOf(false);
    const o = await fillHkai(buf, s, D1, {}); const t = await text(o);
    expect(t).toMatch(/ΣΤΓ 915,\s*20\/11\/(20)?26/);
  });
});
