// «Νέο αρχείο…» / «Νέο φύλλο…» για πόστα, εκτός δύναμης και δυνατότητες: η εφαρμογή φτιάχνει τον πίνακα από την αρχή
// με τη δομή του Δυναμολογίου (τίτλος, Α/Α, Βαθμός, Ο/Σ, Επώνυμο… και οι στήλες του είδους), και ό,τι φτιάχνει το
// ξαναδιαβάζει χωρίς αλλαγές. Μόνο ψεύτικα ονόματα.
import { upper } from '../src/shared/text';
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { OUT_NOTE, type AppState } from '../src/shared/domain';
import { apply, type Command, type NewPerson } from '../src/shared/commands';
import { parseRoster } from '../src/shared/roster';
import { NEW_KINDS, bestFor, bindingMonth, canCreate, defaultBinding, detectTables, dutiesBinding, inRoster, planCaps, planDuties, planDutiesWrite, planOutside, planPosts, planSource, roomBlocks, type ListKind } from '../src/shared/sources';
import { exactCountif } from '../src/shared/codes';
import { Workbook, type Sheet } from '../src/main/xlsx';
import { readBook, writeSource, type SourceMeta } from '../src/main/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-13';
const fx = (ws: Sheet, ref: string) => ws.formula(ref)?.replace(/&quot;/g, '"');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-new-'));
const sheetXml = async (file: string, n: number) => (await JSZip.loadAsync(fs.readFileSync(file))).file(n === 1 ? 'xl/worksheets/sheet1.xml' : `xl/worksheets/sheet_a${n}.xml`)!.async('string');

function state(): AppState {
  const s = fakeState(12);
  s.people = s.people.map(p => (p.id === 3 ? { ...p, post: 'ΙΑΤΡΕΙΟ' } : p.id === 7 ? { ...p, active: false, notes: OUT_NOTE + ': ΑΝΑΒΟΛΗ' } : p));
  s.caps = { 2: { sk: 'Από Excel: ΛΟΓΩ Ι' }, 4: { mg: 'ΠΟΝΟΣ ΜΕΣΗΣ', op: 'ΠΟΝΟΣ ΜΕΣΗΣ' } };
  return s;
}
// Φτιάχνει το είδος σε νέο αρχείο και το ξαναδιαβάζει όπως η «Ανανέωση από Excel»
async function roundTrip(kind: ListKind, s: AppState) {
  const file = path.join(tmp(), kind + '.xlsx'); const b = { ...defaultBinding(kind, file), write: true };
  const w = await writeSource(kind, b, s, undefined, TODAY, { create: true });
  expect(w.ok && w.created, JSON.stringify(w)).toBe(true);
  const { sheets } = await readBook(file);
  const found = bestFor(kind, sheets)!;
  return { file, b, sheets, found, sheet: sheets.find(x => x.name === found.sheet)! };
}

describe('νέα αρχεία για πόστα, εκτός δύναμης και δυνατότητες', () => {
  it('τα είδη που φτιάχνει η εφαρμογή· τα πόστα κ.λπ. πάνε στο Δυναμολόγιο', () => {
    for (const k of ['people', 'punish', 'medical', 'hospital', 'step', 'leave', 'dn', 'posts', 'outside', 'caps', 'duties'] as ListKind[]) expect(canCreate(k), k).toBe(true);
    expect(NEW_KINDS.filter(k => !inRoster(k))).toEqual(['people', 'duties']);   // ο έλεγχος υπηρεσιών: δικό του αρχείο
  });

  it('πόστα: τίτλος ΠΟΣΤΑ, επικεφαλίδες του Δυναμολογίου και στήλη «Πόστο»· ξαναδιαβάζεται χωρίς αλλαγές', async () => {
    const s = state(); const { found, sheet, sheets, file, b } = await roundTrip('posts', s);
    expect(sheet.name).toBe('ΠΟΣΤΑ');
    expect(sheet.rows[0][0]).toBe('ΠΟΣΤΑ');
    expect(sheet.rows[1].slice(0, 10)).toEqual(['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΤΗΛΕΦΩΝΟ', 'ΘΑΛΑΜΟΣ', 'ΠΟΣΤΟ']);
    expect(found).toEqual({ sheet: 'ΠΟΣΤΑ', header: 1, cols: b.cols });
    expect(detectTables(sheets).find(h => h.sheet === 'ΠΟΣΤΑ')?.best).toBe('posts');
    // οι δύο με πόστο, αλφαβητικά (ΤΥΧΑΙΟΣ, ΥΠΟΘΕΤΙΔΗΣ), με Α/Α
    expect(sheet.rows.slice(2).map(r => [r[0], r[3], r[9]])).toEqual([[1, 'ΤΥΧΑΙΟΣ', 'ΚΨΜ'], [2, 'ΥΠΟΘΕΤΙΔΗΣ', 'ΙΑΤΡΕΙΟ']]);
    const pl = planPosts(sheet, b, s);
    expect(pl.changes).toEqual([]); expect(pl.same).toBe(2);
    // τίτλος σε συγχωνευμένα κελιά, ως την τελευταία στήλη
    expect(await sheetXml(file, 1)).toContain('<mergeCell ref="A1:J1"/>');
    // ξανά εγγραφή: τίποτα να γραφτεί
    const again = await writeSource('posts', b, s, undefined, TODAY);
    expect(again.ok && again.unchanged).toBe(true);
  });

  it('εκτός δύναμης: όσοι βγήκαν εκτός δύναμης, με τον λόγο στις ΠΑΡΑΤΗΡΗΣΕΙΣ', async () => {
    const s = state(); const { sheet, b, sheets } = await roundTrip('outside', s);
    expect(sheet.name).toBe('ΕΚΤΟΣ ΔΥΝΑΜΗΣ');
    expect(sheet.rows[1][b.cols.remarks]).toBe('ΠΑΡΑΤΗΡΗΣΕΙΣ');
    expect(sheet.rows.length).toBe(3);
    expect(sheet.rows[2][b.cols.remarks]).toBe('ΑΝΑΒΟΛΗ');
    expect(detectTables(sheets)[0].best).toBe('outside');
    const pl = planOutside(sheet, b, s);
    expect(pl.changes).toEqual([]); expect(pl.same).toBe(1);
  });

  it('δυνατότητες: «-» όπου δεν κάνει, με τον λόγο· ξαναδιαβάζεται χωρίς αλλαγές', async () => {
    const s = state(); const { sheet, b, sheets } = await roundTrip('caps', s);
    expect(sheet.name).toBe('ΔΥΝΑΤΟΤΗΤΑ ΥΠΗΡΕΣΙΩΝ');
    expect(['th', 'op', 'mg', 'sk', 'tae', 'capnote'].map(k => sheet.rows[1][b.cols[k]])).toEqual(['ΘΑΛΑΜΟΦΥΛΑΚΑΣ', 'ΟΠΛΟΦΥΛΑΚΑΣ', 'ΜΑΓΕΙΡΕΙΑ', 'ΣΚΟΠΙΑ', 'ΤΑΕ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ']);
    const rows = sheet.rows.slice(2);
    expect(rows.length).toBe(2);
    const of = (asm: number) => rows.find(r => r[b.cols.asm] === asm)!;
    expect(of(900001)[b.cols.sk]).toBe('-'); expect(of(900001)[b.cols.capnote]).toBe('ΛΟΓΩ Ι');
    expect([of(900003)[b.cols.op], of(900003)[b.cols.mg], of(900003)[b.cols.sk]]).toEqual(['-', '-', undefined]);
    expect(detectTables(sheets)[0].best).toBe('caps');
    const pl = planCaps(sheet, b, s);
    expect(pl.changes).toEqual([]); expect(pl.same).toBe(2);
  });

  it('χωρίς τίποτα να γράψει: φτιάχνεται μόνο ο τίτλος και οι επικεφαλίδες', async () => {
    const s = fakeState(4); s.people = s.people.map(p => ({ ...p, post: null }));
    const { sheet } = await roundTrip('posts', s);
    expect(sheet.rows.length).toBe(2);
  });

  it('νέο φύλλο σε υπάρχον Δυναμολόγιο: το ΣΥΝΟΛΙΚΟ δεν αλλάζει', async () => {
    const s = state(); const file = path.join(tmp(), 'ΔΥΝΑΜΟΛΟΓΙΟ.xlsx');
    const wb = await Workbook.blank('ΣΥΝΟΛΙΚΟ'); const ws = await wb.sheet('ΣΥΝΟΛΙΚΟ');
    ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα'].forEach((h, c) => ws.set(String.fromCharCode(65 + c) + '2', h));
    s.people.forEach((p, i) => [i + 1, p.rank, p.spec, p.last, p.first].forEach((v, c) => ws.set(String.fromCharCode(65 + c) + (i + 3), v)));
    fs.writeFileSync(file, await wb.save());
    const before = await sheetXml(file, 1);
    const w = await writeSource('posts', { ...defaultBinding('posts', file), write: true }, s, undefined, TODAY, { create: true });
    expect(w.ok && w.created).toBe(true);
    expect(await sheetXml(file, 1)).toBe(before);
    const { sheets } = await readBook(file);
    expect(sheets.map(x => x.name)).toEqual(['ΣΥΝΟΛΙΚΟ', 'ΠΟΣΤΑ']);
    expect(bestFor('posts', sheets)?.sheet).toBe('ΠΟΣΤΑ');
  });

  it('χωρίς «Νέο»: αρχείο ή φύλλο που λείπει δεν φτιάχνεται μόνο του (π.χ. USB που δεν μπήκε)', async () => {
    const file = path.join(tmp(), 'λείπει.xlsx');
    const w = await writeSource('posts', defaultBinding('posts', file), state(), undefined, TODAY);
    expect(w.ok).toBe(false); expect(fs.existsSync(file)).toBe(false);
  });
});

describe('νέο Δυναμολόγιο', () => {
  const NEW: NewPerson = { rank: 'ΣΤΡ', spec: 'ΠΖ', last: 'ΑΑΑΚΑΙΝΟΥΡΓΙΟΣ', first: 'ΝΕΟΣ', father: 'ΠΑΤΕΡΑΣ', asm: '910001', phone: '6900000999', room: 2, si: 'Ι1', post: null, role: null, essos: '2026 Γ΄', attached: false, notes: '' };
  const make = async () => {
    // επώνυμα χωρίς ψηφία (το «ΔΟΚΙΜΙΟΣ1» των fixtures το Δυναμολόγιο το θεωρεί σύνολο, όχι άτομο)
    const s = state(); s.people = s.people.map(p => ({ ...p, last: p.last.replace(/\d/g, 'Β') })).map(p => (p.id === 2 ? { ...p, role: 'ΘΑΛΑΜΑΡΧΗΣ', dn: true } : p.id === 11 ? { ...p, room: null } : p));
    const file = path.join(tmp(), 'ΔΥΝΑΜΟΛΟΓΙΟ.xlsx'); const b = { ...defaultBinding('people', file, 'ΣΥΝΟΛΙΚΟ'), write: true };
    const w = await writeSource('people', b, s, undefined, TODAY, { create: true });
    expect(w.ok && w.created, JSON.stringify(w)).toBe(true);
    return { s, file, b, w: w as Extract<typeof w, { ok: true }>, sheets: (await readBook(file)).sheets };
  };

  it('ΣΥΝΟΛΙΚΟ: τίτλος με τη μονάδα, όλοι οι ενεργοί ανά θάλαμο και αλφαβητικά, χωρίς θάλαμο στο τέλος', async () => {
    const { s, sheets, b } = await make();
    expect(sheets.map(x => x.name)).toEqual(['ΣΥΝΟΛΙΚΟ', 'ΘΑΛΑΜΟΙ']);
    const sh = sheets[0];
    expect(sh.rows[0][0]).toBe('ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ ' + upper(s.settings.unitName));
    expect(sh.rows[1]).toEqual(['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΑΣΜ', 'ΤΗΛΕΦΩΝΟ', 'ΘΑΛΑΜΟΣ', 'Σ.Ι', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', 'ΔΝ']);
    const act = s.people.filter(p => p.active);
    const rows = sh.rows.slice(2, 2 + act.length);
    expect(rows.map(r => r[0])).toEqual(act.map((_, i) => i + 1));
    const rooms = rows.map(r => r[b.cols.room] ?? 99) as number[];
    expect(rooms).toEqual([...rooms].sort((x, y) => x - y));
    expect(rows[rows.length - 1][b.cols.room]).toBeUndefined();
    const r2 = rows.find(r => r[b.cols.asm] === 900001)!;
    expect(rows[rows.indexOf(r2) - 1][b.cols.room]).toBe(1);   // θαλαμάρχης: πρώτος στον 2ο θάλαμο, πριν από τον αλφαβητικά πρώτο
    expect([r2[b.cols.remarks], r2[b.cols.dn]]).toEqual(['ΘΑΛΑΜΑΡΧΗΣ', 'ΝΑΙ']);
    expect(rows.some(r => r[b.cols.asm] === 900006)).toBe(false);   // εκτός δύναμης: όχι στο ΣΥΝΟΛΙΚΟ
    expect(detectTables(sheets).find(h => h.best === 'people')?.sheet).toBe('ΣΥΝΟΛΙΚΟ');
  });

  it('σύνολα θαλάμων κάτω από τον πίνακα με COUNTIF, όπως στο δικό σας', async () => {
    const { file, s } = await make();
    const ws = await (await Workbook.open(fs.readFileSync(file))).sheet('ΣΥΝΟΛΙΚΟ');
    const n = s.people.filter(p => p.active).length; const r = 3 + n + 1;   // κενή γραμμή, μετά «ΘΑΛΑΜΟΙ»
    expect([ws.get('D' + r), ws.get('F' + r)]).toEqual(['ΘΑΛΑΜΟΙ', 'ΣΤΡΑΤΙΩΤΕΣ']);
    expect([ws.get('D' + (r + 1)), fx(ws, 'F' + (r + 1))]).toEqual(['1ΟΣ', `COUNTIF(I3:I${2 + n},"1")`]);
    const k = new Set(s.people.filter(p => p.active && p.room != null).map(p => p.room)).size;   // 7: ο 7ος θάλαμος δεν έχει κανέναν
    expect(ws.get('D' + (r + k + 1))).toBe('ΣΥΝΟΛΟ');
    expect(fx(ws, 'F' + (r + k + 1))).toBe(`SUM(F${r + 1}:F${r + k})`);
    expect(ws.merges().some(m => m.r1 === r && m.c1 === 4 && m.c2 === 5)).toBe(true);
  });

  it('η εισαγωγή του Δυναμολογίου το ξαναδιαβάζει όπως είναι: ίδια άτομα, ίδια στοιχεία, κανένα σύνολο ως άτομο', async () => {
    const { s, sheets } = await make();
    const r = parseRoster(sheets);
    const act = s.people.filter(p => p.active);
    expect(r.rows.length).toBe(act.length);
    for (const p of act) {
      const x = r.rows.find(y => y.asm === p.asm)!;
      expect({ rank: x.rank, spec: x.spec, last: x.last, first: x.first, father: x.father, phone: x.phone, room: x.room, si: x.si }, p.last).toEqual({ rank: p.rank, spec: p.spec, last: p.last, first: p.first, father: p.father, phone: p.phone, room: p.room, si: p.si });
    }
    expect(r.rows.find(y => y.asm === '900001')).toMatchObject({ role: 'ΘΑΛΑΜΑΡΧΗΣ', dn: true });
  });

  it('μετά: τίποτα να γραφτεί· ο νέος στρατιώτης μπαίνει στον θάλαμό του (ΣΥΝΟΛΙΚΟ και ΘΑΛΑΜΟΙ) και τα σύνολα τον μετράνε', async () => {
    const { s, b, w, file, sheets } = await make();
    const meta = { ...w.meta, at: 'x' } as SourceMeta;
    expect(planSource('people', sheets[0], b, s, meta, TODAY).sets).toEqual([]);
    const blocks = roomBlocks(sheets[1]);
    expect(blocks.map(x => x.room)).toEqual([1, 2, 3, 4, 5, 6, 8]);   // ο 7ος: μόνο ένας, εκτός δύναμης
    expect(blocks.reduce((t, x) => t + x.rows.length, 0)).toBe(s.people.filter(p => p.active && p.room != null).length);
    const s2 = apply(s, { t: 'addPerson', person: NEW } as Command, { today: TODAY, newId: () => 'x' }).state;
    const w2 = await writeSource('people', b, s2, meta, TODAY);
    expect(w2.ok && w2.added).toBe(1);
    const { sheets: after } = await readBook(file);
    const tot = after[0].rows.slice(2).filter(r => r[b.cols.asm] != null);
    const at = tot.findIndex(r => r[b.cols.asm] === 910001);
    // μετά τον θαλαμάρχη του 2ου, αλφαβητικά πρώτος στους υπόλοιπους
    expect(tot[at - 1][b.cols.asm]).toBe(900001); expect(tot[at + 1][b.cols.room]).toBe(2);
    expect(roomBlocks(after[1]).find(x => x.room === 2)!.rows.some(x => x.v.asm === 910001)).toBe(true);
    const ws = await (await Workbook.open(fs.readFileSync(file))).sheet('ΣΥΝΟΛΙΚΟ');
    const n = s2.people.filter(p => p.active).length;
    expect(fx(ws, 'F' + (3 + n + 2))).toBe(`COUNTIF(I3:I${2 + n},"1")`);
  });

  it('χωρίς «Νέο αρχείο»: Δυναμολόγιο που λείπει δεν φτιάχνεται μόνο του', async () => {
    const file = path.join(tmp(), 'λείπει.xlsx');
    const w = await writeSource('people', defaultBinding('people', file, 'ΣΥΝΟΛΙΚΟ'), state(), undefined, TODAY);
    expect(w.ok).toBe(false); expect(fs.existsSync(file)).toBe(false);
  });
});

describe('νέος Έλεγχος υπηρεσιών', () => {
  const YM = '2026-10';
  function seeded() {
    const s = state();
    s.guards = { '2026-10-05': { th1: 1, mg1: 2 } };
    s.dutyLog = { '2026-10-06': [{ pid: 4, kind: 'th' }] };
    return s;
  }
  async function make(file = path.join(tmp(), 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ 2026.xlsx'), ym = YM, s = seeded()) {
    const b = dutiesBinding(file, ym);
    const w = await writeSource('duties', b, s, undefined, TODAY, { create: true });
    expect(w.ok && w.created, JSON.stringify(w)).toBe(true);
    const { sheets } = await readBook(file);
    return { s, b, w, file, sheets, sheet: sheets.find(x => x.name === b.sheet)! };
  }
  const nameRow = (rows: unknown[][], last: string) => rows.findIndex(r => r[3] === last);

  it('φύλλο «ΟΚΤΩΒΡΙΟΣ 2026» με τίτλο, επικεφαλίδες και μία στήλη ανά μέρα· το αναγνωρίζει ως έλεγχο υπηρεσιών', async () => {
    const { s, b, sheet, sheets, w } = await make();
    expect(sheet.name).toBe('ΟΚΤΩΒΡΙΟΣ 2026');
    expect(sheet.rows[0][0]).toBe('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΟΚΤΩΒΡΙΟΥ 2026');
    expect(sheet.rows[1].slice(0, 14)).toEqual(['Α/Α', 'ΒΘΜ', 'Ο-Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΘΑΛΑΜΟΣ', 'ΑΡΓΙΑ', 'ΚΑΘΗΜΕΡΙΝΗ', 'ΣΥΝΟΛΟ', 'ΣΚΟΠΙΑ', 'ΜΑΓΕΙΡΕΙΑ', 'ΘΑΛΑΜΟΦΥΛΑΚΑΣ', 'ΟΠΛΟΦΥΛΑΚΑΣ', 'Λ/Υ-Δ/Υ']);
    expect(sheet.rows[1].slice(14, 45)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(detectTables(sheets).find(h => h.sheet === b.sheet)?.best).toBe('duties');
    const found = bestFor('duties', sheets)!;
    expect(found.header).toBe(1); expect(found.cols.d1).toBe(14); expect(found.cols.last).toBe(3);
    expect(bindingMonth(sheet, { ...b, month: undefined }, TODAY)).toBe(YM);
    const act = s.people.filter(p => p.active);
    expect(w.ok && w.added).toBe(act.length);
    expect(sheet.rows[2 + act.length][4]).toBe('ΣΥΝΟΛΑ');
  });

  it('οι υπηρεσίες της εφαρμογής γράφονται με τους κωδικούς τους· ξαναδιαβάζεται χωρίς αλλαγές και χωρίς προειδοποίηση COUNTIF', async () => {
    const { s, b, sheet, w } = await make();
    expect(w.ok && w.changed).toBe(3);
    const p = (id: number) => s.people.find(x => x.id === id)!.last;
    expect(sheet.rows[nameRow(sheet.rows, p(1))][14 + 4]).toBe('Θ1Α');
    expect(sheet.rows[nameRow(sheet.rows, p(2))][14 + 4]).toBe('Μ1');
    expect(sheet.rows[nameRow(sheet.rows, p(4))][14 + 5]).toBe('Θ');
    expect(sheet.countif).toBeUndefined();
    const wp = planDutiesWrite(sheet, b, s, TODAY);
    expect(wp.sets).toEqual([]); expect(wp.warn).toBeUndefined();
    const imp = planDuties(sheet, b, s, YM, TODAY);
    expect(imp.days).toEqual([]); expect(imp.errors).toEqual([]); expect(imp.sp.unmatched).toEqual([]);
    const again = await writeSource('duties', b, s, undefined, TODAY);
    expect(again.ok && again.unchanged).toBe(true);
  });

  it('τύποι: μετράνε με «Θ*», «Μ*»… (και τους κωδικούς θέσεων)· ΑΡΓΙΑ = ΣΚ και αργίες, γκρι', async () => {
    const { s, file } = await make();
    const wb = await Workbook.open(fs.readFileSync(file)); const ws = await wb.sheet('ΟΚΤΩΒΡΙΟΣ 2026');
    const any = (rng: string) => `SUM(COUNTIF(${rng},{"Θ*","Μ*","Σ*","ΟΠ*","ΛΥ*","ΔΥ*","Τ*","Υ*"}))`;
    // Οκτώβριος 2026: ΣΚ 3-4, 10-11, 17-18, 24-25, 31 και η 28η (Τετάρτη)· η 1η μέρα στη στήλη O
    expect(fx(ws, 'G3')).toBe(['Q3:R3', 'X3:Y3', 'AE3:AF3', 'AL3:AM3', 'AP3:AP3', 'AS3:AS3'].map(any).join('+'));
    expect(fx(ws, 'H3')).toBe('I3-G3');
    expect(fx(ws, 'I3')).toBe(any('O3:AS3'));
    expect(fx(ws, 'J3')).toBe('COUNTIF(O3:AS3,"Σ*")');
    expect(fx(ws, 'L3')).toBe('COUNTIF(O3:AS3,"Θ*")');
    expect(fx(ws, 'N3')).toBe('COUNTIF(O3:AS3,"ΛΥ*")+COUNTIF(O3:AS3,"ΔΥ*")');
    for (const r of [3, 4]) for (const c of ['G', 'I', 'J', 'K', 'L', 'M', 'N']) expect(exactCountif(fx(ws, c + r)!), c + r).toBeNull();
    const n = s.people.filter(p => p.active).length; const tr = 3 + n;
    expect(fx(ws, 'I' + tr)).toBe(`SUM(I3:I${tr - 1})`);
    expect(fx(ws, 'O' + tr)).toBe(any(`O3:O${tr - 1}`));
    // ΣΚ/αργία γκρι, καθημερινή όχι
    const xml = await sheetXml(file, 1);
    const styleOf = (ref: string) => Number(xml.match(new RegExp(`<c r="${ref}"[^>]*?s="(\\d+)"`))?.[1]);
    expect(styleOf('Q2')).not.toBe(styleOf('O2'));    // 3/10 Σάββατο
    expect(styleOf('AP3')).toBe(styleOf('Q3'));       // 28/10
    expect(styleOf('P3')).toBe(styleOf('O3'));
    expect(xml).toContain('<mergeCell ref="A1:AS1"/>');
    expect(xml).toMatch(/<pane xSplit="14" ySplit="2"/);
  });

  it('νέος μήνας: νέο φύλλο στο ίδιο αρχείο, ο προηγούμενος μένει όπως ήταν', async () => {
    const { file } = await make();
    const before = await sheetXml(file, 1);
    const b2 = dutiesBinding(file, '2026-11');
    const w = await writeSource('duties', b2, seeded(), undefined, TODAY, { create: true });
    expect(w.ok && w.created).toBe(true);
    const { sheets } = await readBook(file);
    expect(sheets.map(x => x.name)).toEqual(['ΟΚΤΩΒΡΙΟΣ 2026', 'ΝΟΕΜΒΡΙΟΣ 2026']);
    expect(sheets[1].rows[0][0]).toBe('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΝΟΕΜΒΡΙΟΥ 2026');
    expect(sheets[1].rows[1].length).toBe(14 + 30);
    expect(await sheetXml(file, 1)).toBe(before);
  });

  it('χωρίς «Νέο αρχείο»: έλεγχος υπηρεσιών που λείπει δεν φτιάχνεται μόνος του', async () => {
    const file = path.join(tmp(), 'λείπει.xlsx');
    const w = await writeSource('duties', dutiesBinding(file, YM), seeded(), undefined, TODAY);
    expect(w.ok).toBe(false); expect(fs.existsSync(file)).toBe(false);
  });
});
