// Έλεγχος 26/11 (φάση 4): 4 λάθη σε λίστες άλλης μονάδας. Συνθετικά δεδομένα μόνο.
//  1. εξοδούχοι: άγραφο πρότυπο με Α/Α στην επικεφαλίδα αλλά κενά κελιά → έπαιρνε μία γραμμή
//  2. κατάσταση υπηρεσιών: φύλλο που άλλαξε όνομα χωρίς επιλογές χρήστη → η αντιστοίχιση χανόταν
//  3. ανενεργή υπηρεσία: το εσωτερικό κλειδί θέσης έβγαινε σε προειδοποίηση
//  4. Δυναμολόγιο άλλης μονάδας: θέση χωρίς άτομο με κείμενο στη στήλη ΚΑΤΑΣΤΑΣΗ σταματούσε τη σάρωση της εγγραφής
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { apply, type Ctx } from '../src/shared/commands';
import { blocksOf, fullName, type AppState } from '../src/shared/domain';
import { upper } from '../src/shared/text';
import { modelOfBuffer } from '../src/main/bookModel';
import { listsFill } from '../src/main/tplLists';
import { fillFroura } from '../src/main/exports';
import { detectSvc } from '../src/shared/unitLists';
import { buildRosterModel, ownBinding, readOwnRoster, rosterProfileFrom, emptyRos } from '../src/shared/rosterUnit';
import { planOwnWrite, ownSnap } from '../src/shared/rosterUnitWrite';
import { DEFAULT_SETTINGS, emptyState } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import type { TplProfile } from '../src/shared/tplStore';
import { fakeState } from './fixtures';

const D = '2026-11-16';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'q' + ++seq };
const prof = (kind: TplProfile['kind'], lst: TplProfile['lst']): TplProfile => ({ v: 1, id: kind + '-1', kind, fp: { sheets: [], regions: [] }, elements: [], words: {}, ignore: [], lst });
const txt = (v: unknown) => (v == null ? '' : String(v));
const save = async (wb: ExcelJS.Workbook) => Buffer.from(await wb.xlsx.writeBuffer());
const border = (c: ExcelJS.Cell) => { c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; };

describe('1. εξοδούχοι με κενή στήλη Α/Α', () => {
  it('άγραφο πρότυπο με περιγράμματα: γράφονται όλοι, με Α/Α, χωρίς «δεν χώρεσε»', async () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('ΕΞΟΔΟΥΧΟΙ');
    ws.getCell('A1').value = 'ΚΑΤΑΣΤΑΣΗ ΕΞΟΔΟΥΧΩΝ ΤΗΣ'; ws.getCell('A3').value = 'ΕΞΟΔΟΥΧΟΙ'; ws.getCell('F3').value = 'ΑΔΕΙΟΥΧΟΙ';
    for (const c0 of [1, 6]) { ['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ'].forEach((h, i) => { ws.getCell(4, c0 + i).value = h; }); for (let r = 5; r <= 16; r++) for (let i = 0; i < 3; i++) border(ws.getCell(r, c0 + i)); }
    ws.getCell('A20').value = 'Ο'; ws.getCell('A21').value = 'ΑΛΧΙΑΣ ΙΛΗΣ';
    const buf = await save(wb);
    let s = fakeState(50); const outs = [1, 2, 3, 4, 5, 6, 7]; const leaves = [11, 12, 13];
    s = apply(s, { t: 'outs', date: D, changes: outs.map(pid => ({ pid, from: null, to: 'OUT' })) } as never, ctx).state;
    s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: leaves, from: D, to: D, kind: 'Κανονική' } } as never, ctx).state;
    const out = await listsFill(buf, s, D, { kind: 'outs', profile: prof('outs', { sheet: 'ΕΞΟΔΟΥΧΟΙ' }) });
    expect(out).not.toBeNull();
    expect(out!.warnings.filter(w => /χώρεσε|χωρ/.test(w))).toEqual([]);
    const sh = (await modelOfBuffer(out!.data))[0];
    const names = (c: number) => sh.rows.map((r, i) => [i, txt(r?.[c])] as const).filter(([i, v]) => i >= 4 && i <= 16 && v);
    const nOut = names(2), nLeave = names(7);
    expect(nOut.length).toBe(7); expect(nLeave.length).toBe(3);
    expect(nOut.map(x => x[0])).toEqual([4, 5, 6, 7, 8, 9, 10]);          // συνεχόμενες γραμμές
    expect(nOut.map(([i]) => txt(sh.rows[i][0]))).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });
});

async function svcBook(sheetName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(sheetName);
  ws.getCell('A1').value = 'ΚΑΤΑΣΤΑΣΗ ΥΠΗΡΕΣΙΩΝ ΤΗΣ';
  ws.getCell('B3').value = 'Α/Α'; ws.getCell('C3').value = 'ΒΑΘΜΟΣ'; ws.getCell('D3').value = 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ';
  const block = (r0: number, label: string, n: number) => { ws.getCell(r0 + 1, 1).value = label; for (let i = 1; i <= n; i++) { ws.getCell(r0 + i, 2).value = i + 'ο'; ws.getCell(r0 + i, 3).value = 'ΣΤΡ'; } };
  block(4, 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ', 4);                       // γραμμές 4..7 (0-βάση)
  block(9, 'ΜΑΓΕΙΡΕΙΑ', 5);                          // γραμμές 9..13 (0-βάση)
  ws.getCell('A17').value = 'Ο'; ws.getCell('A18').value = 'ΑΛΧΙΑΣ ΙΛΗΣ';
  return save(wb);
}

describe('2. αντιστοίχιση υπηρεσιών και μετονομασία φύλλου', () => {
  it('το φύλλο «ΚΥ 1» έγινε «ΚΥ 1 (2)» και δεν υπάρχουν επιλογές: το έντυπο της μονάδας μένει (όχι ο δικός μας ΦΡΟΥΡΑ)', async () => {
    const buf = await svcBook('ΚΥ 1 (2)');
    let s = fakeState(60); s = { ...s, settings: { ...s.settings, blocks: (s.settings.blocks || []).filter(b => ['ly', 'th', 'mg'].includes(b.id)) } as never };
    s = apply(s, { t: 'autofill', date: D }, ctx).state;
    s = { ...s, settings: { ...s.settings, tplProfiles: [prof('services', { sheet: 'ΚΥ 1' })] } };
    const r = await fillFroura(buf, s, D);
    const sheets = await modelOfBuffer(r.data);
    expect(sheets.map(x => x.name)).toEqual(['ΚΥ 1 (2)']);
    const sh = sheets[0];
    expect(txt(sh.rows[2][3])).toBe('ΟΝΟΜΑΤΕΠΩΝΥΜΟ');                    // η επικεφαλίδα της μονάδας μένει
    expect(sheets.some(x => sh.rows.some(rw => (rw || []).some(v => /ΠΙΝΑΚΑΣ\)/.test(txt(v)))))).toBe(false);
    const people = new Set(s.people.map(p => upper(fullName(p))));
    const filled = sh.rows.map((rw, i) => [i, txt(rw?.[3])] as const).filter(([i, v]) => people.has(v));
    expect(filled.length).toBeGreaterThan(0);
    expect(filled.every(([i]) => (i >= 4 && i <= 7) || (i >= 9 && i <= 13))).toBe(true);
  });
  it('τα δικά μας πρότυπα ΦΡΟΥΡΑ δεν ανιχνεύονται ως λίστα άλλης μονάδας', async () => {
    const dir = path.join(__dirname, '..', 'templates'); const files = fs.readdirSync(dir).filter(f => /^froura.*\.xlsx$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) for (const sh of await modelOfBuffer(fs.readFileSync(path.join(dir, f)))) expect(detectSvc(sh), f + ' ' + sh.name).toBeNull();
  });
});

describe('3. ανενεργή υπηρεσία', () => {
  it('δεν βγαίνει προειδοποίηση με το κλειδί θέσης ούτε γράφεται το άτομο της', async () => {
    const buf = await svcBook('ΥΠΗΡΕΣΙΕΣ');
    let s = fakeState(60); const phase = s.settings.phase;
    s = apply(s, { t: 'addBlock', phase, name: 'ΕΣΤΙΑΤΟΡΑΣ', kind: 'other', armed: false, n: 1, per: 1, hrs: '' } as never, ctx).state;
    s = apply(s, { t: 'autofill', date: D }, ctx).state;
    const blk = blocksOf(s.settings, phase).find(b => b.name === 'ΕΣΤΙΑΤΟΡΑΣ')!;
    const key = Object.keys(s.guards[D] || {}).find(k => k.startsWith(blk.id));
    expect(key, 'η θέση της νέας υπηρεσίας γεμίστηκε').toBeTruthy();
    const pid = s.guards[D][key!]; const who = upper(fullName(s.people.find(p => p.id === pid)!));
    s = apply(s, { t: 'setBlock', phase, id: blk.id, patch: { hidden: true } } as never, ctx).state;
    const out = await listsFill(buf, s, D, { kind: 'services', profile: prof('services', { sheet: 'ΥΠΗΡΕΣΙΕΣ', posts: {} }) });
    expect(out).not.toBeNull();
    for (const w of out!.warnings) { expect(w).not.toContain(key!); expect(w).not.toContain(who); }
    const sh = (await modelOfBuffer(out!.data))[0];
    expect(sh.rows.some(rw => (rw || []).some(v => txt(v) === who))).toBe(false);
  });
});

describe('4. Δυναμολόγιο άλλης μονάδας: θέση χωρίς άτομο', () => {
  it('η εγγραφή βλέπει όλους τους στρατιώτες κάτω από τη θέση χωρίς όνομα', () => {
    const rows: unknown[][] = [['ΔΥΝΑΜΟΛΟΓΙΟ ΤΗΣ ΜΟΝΑΔΑΣ'], ['α/α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑ', 'ΕΠΩΝΥΜΟ', 'ΙΛΗ', 'ΚΑΤΑΣΤΑΣΗ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ']];
    rows.push([1, 'ΙΛΧΟΣ', 'ΑΛΕΞΑΝΔΡΟΣ', 'ΑΛΦΑΙΟΣ', 'Δ/Σ', 'ΠΑΡΩΝ', '']);
    rows.push([2, 'ΥΠΛΧΟΣ', 'ΒΑΣΙΛΗΣ', 'ΒΗΤΑΙΟΣ', 'Δ/Σ', 'ΠΑΡΩΝ', '']);
    rows.push([3, 'ΥΠΛΧΟΣ', 'ΓΕΩΡΓΙΟΣ', 'ΓΑΜΜΑΙΟΣ', 'Δ/Σ', 'ΠΑΡΩΝ', '']);
    rows.push([4, 'ΙΛΧΟΣ', '', '', 'Δ/Σ', 'ΑΠΩΝ', 'ΕΚΠΑΙΔΕΥΣΗ']);
    const sold = ['ΔΕΛΤΑΙΟΣ', 'ΕΨΙΛΟΝΙΔΗΣ', 'ΖΗΤΑΙΟΣ', 'ΗΤΑΙΟΣ', 'ΘΗΤΑΙΟΣ'];
    sold.forEach((l, i) => rows.push([5 + i, 'ΣΤΡ', 'ΠΕΤΡΟΣ', l, i % 2 ? '2' : '1', 'ΠΑΡΩΝ', '']));
    for (let i = 0; i < 3; i++) rows.push([10 + i, '', '', '', '', '', '']);
    const sheet: RawSheet = { name: 'ΔΥΝΑΜΟΛΟΓΙΟ', rows: rows as never, fx: new Set() };
    const settings = { ...DEFAULT_SETTINGS, mode: 'unit', lists: { subUnits: { add: [{ name: 'ΙΛΗ 1' }, { name: 'ΙΛΗ 2' }] } } } as AppState['settings'];
    const ros = emptyRos('ΔΥΝΑΜΟΛΟΓΙΟ');
    const prof0 = rosterProfileFrom(buildRosterModel({ settings, people: [], sheets: [sheet], ros }), ros, null);
    let state: AppState = { ...emptyState(), settings: { ...settings, tplProfiles: [prof0] } };
    const rd = readOwnRoster(sheet, { settings: state.settings, people: [], ros }); const b = ownBinding(rd, 'x.xlsx');
    state = apply(state, { t: 'importPeople', rows: rd.rows, source: 'x', deactivateMissing: false }, { today: D, newId: () => 'z' }).state;
    const soldiers = state.people.filter(p => sold.includes(p.last));
    expect(soldiers.length).toBe(5);
    const snap = ownSnap(sheet, b, state.people);
    for (const p of soldiers) expect(snap[p.id], p.last).toBeTruthy();
    expect(Object.keys(snap).length).toBe(state.people.length);
    const fourth = soldiers[3];
    const fresh = { id: 900, rank: 'ΣΤΡ', spec: '', last: 'ΝΕΟΣΥΝΤΑΧΘΕΙΣ', first: 'ΚΩΣΤΑΣ', father: '', asm: '', phone: '', room: null, si: '', post: null, role: null, essos: '', attached: false, active: true, notes: '', added: D, sub: '' } as never;
    state = { ...state, people: [...state.people.map(p => (p.id === fourth.id ? { ...p, rank: 'ΛΧΙΑΣ' } : p)), fresh] };
    const plan = planOwnWrite(sheet, b, state, { snap }, D, [sheet]);
    const rowOfFourth = rows.findIndex(r => r[3] === fourth.last);
    expect(plan.sets.some(x => x.r === rowOfFourth && x.c === b.cols.rank)).toBe(true);
    const mapped = new Set(Object.values(b.cols));
    expect(plan.sets.every(x => mapped.has(x.c))).toBe(true);
    const lastPerson = Math.max(...sold.map(l => rows.findIndex(r => r[3] === l)));
    const nr = plan.sets.filter(x => x.c === b.cols.last || x.c === b.cols.first || x.c === b.cols.name);
    expect(nr.length).toBeGreaterThan(0); expect(Math.min(...nr.map(x => x.r))).toBe(lastPerson + 1);
  });
});
