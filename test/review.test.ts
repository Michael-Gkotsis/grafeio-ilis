// Διορθώσεις από το review της 11/10: πίνακες που μετακινούνται μέσα στο φύλλο, αποτύπωμα χωρίς τύπους, σύγκρουση,
// αντίγραφα το πολύ ένα ανά λίγα λεπτά, τύποι σε άλλα φύλλα, μήνας ελέγχου υπηρεσιών. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState, Person } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { baseOf, bestFor, bindingMonth, diffStatuses, locateHeader, parseStatuses, tableHash, type ListKind, type SourceBinding } from '../src/shared/sources';
import { Workbook, shiftFormula } from '../src/main/xlsx';
import { readBook, syncStampNow, tableState, valuesHash, writeSource, type SourceMeta } from '../src/main/sources';
import { PREV_DIR, writeAll, writeJson } from '../src/main/files';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
let seq = 0;
const ctx: Ctx = { today: TODAY, newId: () => 'r' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const HEAD = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Τηλέφωνο', 'Θάλαμος'];
const pr = (p: Person, i: number) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room];
const D = (iso: string) => new Date(iso + 'T00:00:00Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-review-'));
const col = (c: number) => (c >= 26 ? String.fromCharCode(64 + Math.floor(c / 26)) : '') + String.fromCharCode(65 + (c % 26));
async function toFile(sheets: RawSheet[], file: string) {
  const wb = await Workbook.blank(sheets[0].name);
  for (const sh of sheets) {
    const ws = wb.hasSheet(sh.name) ? await wb.sheet(sh.name) : await wb.addSheet(sh.name);
    sh.rows.forEach((row, r) => row.forEach((v, c) => {
      if (v == null || v === '') return;
      const ref = col(c) + (r + 1);
      if (v instanceof Date) ws.setNumber(ref, (v.getTime() - Date.UTC(1899, 11, 30)) / 86400000, 3); else ws.set(ref, v as string | number);
    }));
  }
  fs.writeFileSync(file, await wb.save());
}
const bindAll = (sheets: RawSheet[], file: string, kinds: ListKind[]) =>
  Object.fromEntries(kinds.map(k => { const x = bestFor(k, sheets)!; return [k, { file, sheet: x.sheet, header: x.header, cols: x.cols, write: true } as SourceBinding]; })) as Record<ListKind, SourceBinding>;

// IATRIKA όπως το πραγματικό: ΣΤΕΠ πάνω, ΕΑ-ΕΥ από κάτω, στο ίδιο φύλλο
function iatrika(s: AppState): RawSheet {
  const p = s.people;
  return { name: 'IATRIKA', rows: [
    ['ΕΙΣΑΓΩΓΕΣ ΣΤΕΠ'], [...HEAD, 'ΕΙΣ', 'ΕΞ', 'Παρατηρήσεις'], [...pr(p[6], 0), D('2026-10-10'), D('2026-10-13'), ''], [2], [],
    ['ΕΑ-ΕΥ'], [...HEAD, 'ΕΑ-ΕΥ', 'ΑΠΟ', 'ΕΩΣ', 'Παρατηρήσεις'], [...pr(p[1], 0), 'ΕΑ', D('2026-10-09'), D('2026-10-16'), ''], [...pr(p[2], 1), 'ΕΥ', D('2026-10-08'), D('2026-10-18'), ''], [3]
  ] };
}

describe('δύο πίνακες στο ίδιο φύλλο (Κ2)', () => {
  it('νέες γραμμές στο ΣΤΕΠ σπρώχνουν το ΕΑ-ΕΥ: η εφαρμογή το βρίσκει στη νέα του θέση, χωρίς «άλλαξε» και χωρίς χαμένες εγγραφές', async () => {
    const s0 = fakeState(14); const dir = tmp(); const file = path.join(dir, 'Δ.xlsx');
    await toFile([iatrika(s0)], file);
    const book = await readBook(file);
    const b = bindAll(book.sheets, file, ['step', 'medical']);
    expect(b.step.header).toBe(1); expect(b.medical.header).toBe(6);
    const sh = book.sheets[0];
    // διαβάστηκαν και τα δύο
    let s = s0;
    for (const k of ['step', 'medical'] as const) s = run(s, { t: 'importRecords', adds: diffStatuses(k, s, parseStatuses(k, sh, b[k], s.people, TODAY), b[k]).add, updates: [], source: 'x', what: k });
    const meta: Partial<Record<ListKind, SourceMeta>> = {};
    for (const k of ['step', 'medical'] as const) meta[k] = { keys: diffStatuses(k, s, parseStatuses(k, sh, b[k], s.people, TODAY), b[k]).keys, at: 'x', ...(await syncStampNow(b[k])) } as SourceMeta;
    // έξι νέες εισαγωγές ΣΤΕΠ από την εφαρμογή
    const adds = s.people.slice(8, 14).map(p => ({ pid: p.id, type: 'STEP' as const, from: '2026-10-11', to: '2026-10-12' }));
    s = run(s, { t: 'importRecords', adds, updates: [], source: 'x', what: 'ΣΤΕΠ' });
    const w = await writeSource('step', b.step, s, meta.step, TODAY);
    expect(w.ok && w.added).toBe(6);
    // το ΕΑ-ΕΥ κατέβηκε: βρίσκεται, δεν δείχνει «άλλαξε», και διαβάζονται και οι δύο εγγραφές του
    const t = await tableState(b.medical, meta.medical, 'medical');
    expect(t.changed).toBe(false); expect(t.header).toBeGreaterThan(6);
    const now = (await readBook(file)).sheets[0];
    expect(locateHeader('medical', now, b.medical)).toBe(t.header);
    const moved = { ...b.medical, header: t.header! };
    const d = diffStatuses('medical', s, parseStatuses('medical', now, moved, s.people, TODAY), moved, {}, meta.medical!.keys);
    expect(d.removed).toHaveLength(0); expect(d.add).toHaveLength(0); expect(d.same).toBe(2);
  });
  it('χωρίς σαφή καλύτερη θέση η επικεφαλίδα μένει εκεί που ήταν', () => {
    const s = fakeState(8); const sh = iatrika(s);
    const b = bindAll([sh], 'x', ['medical']).medical;
    expect(locateHeader('medical', sh, b)).toBe(b.header);
    // ίδια επικεφαλίδα δύο φορές: κρατιέται η πιο κοντινή στην παλιά
    const two: RawSheet = { ...sh, rows: [...sh.rows, [], [...HEAD, 'ΕΑ-ΕΥ', 'ΑΠΟ', 'ΕΩΣ', 'Παρατηρήσεις']] };
    expect(locateHeader('medical', two, b)).toBe(b.header);
  });
});

describe('αποτύπωμα πίνακα (Σ1)', () => {
  const s = fakeState(8); const sh = iatrika(s);
  const b = bindAll([sh], 'x', ['medical']).medical;
  it('δεν αλλάζει όταν ο πίνακας απλώς μετακινείται', () => {
    const down: RawSheet = { name: sh.name, rows: [[], [], ...sh.rows] };
    expect(tableHash(down, { ...b, header: b.header + 2 })).toBe(tableHash(sh, b));
  });
  it('αγνοεί κελιά με τύπο (σύνολα που ξαναϋπολογίζει το Excel)', () => {
    const withSum: RawSheet = { name: sh.name, rows: [...sh.rows.slice(0, 9), [null, null, null, 'ΣΥΝΟΛΟ', 2]], fx: new Set(['9:4']) };
    const recalc: RawSheet = { ...withSum, rows: [...sh.rows.slice(0, 9), [null, null, null, 'ΣΥΝΟΛΟ', 3]] };
    expect(tableHash(recalc, b)).toBe(tableHash(withSum, b));
  });
});

describe('σύγκρουση εφαρμογής και Excel (Σ3)', () => {
  const s0 = fakeState(8); const sh = iatrika(s0);
  const b = bindAll([sh], 'x', ['medical']).medical;
  const parsed = parseStatuses('medical', sh, b, s0.people, TODAY);
  const s = run(s0, { t: 'importRecords', adds: diffStatuses('medical', s0, parsed, b).add, updates: [], source: 'x', what: 'ιατρικά' });
  const keys = diffStatuses('medical', s, parsed, b).keys; const base = baseOf('medical', s, keys);
  const ea = s.statuses.find(x => x.type === 'EA')!;
  const appEdit: AppState = { ...s, statuses: s.statuses.map(x => (x.id === ea.id ? { ...x, to: '2026-10-15' } : x)) };   // π.χ. από την καρτέλα του ατόμου
  const excelEdit: RawSheet = { ...sh, rows: sh.rows.map((r, i) => (i === 7 ? r.map((v, c) => (c === 11 ? D('2026-10-19') : v)) : r)) };
  it('άλλαξε και στις δύο πλευρές: σημειώνεται με την τιμή της εφαρμογής', () => {
    const d = diffStatuses('medical', appEdit, parseStatuses('medical', excelEdit, b, appEdit.people, TODAY), b, {}, keys, base);
    expect(d.update).toHaveLength(1); expect(d.update[0].what).toContain('έως 19/10'); expect(d.update[0].conflict).toContain('έως 15/10');
  });
  it('άλλαξε μόνο στην εφαρμογή: δεν το πατάει το Excel, μένει για να γραφτεί', () => {
    expect(appEdit.statuses.find(x => x.id === ea.id)!.to).toBe('2026-10-15');
    const d = diffStatuses('medical', appEdit, parsed, b, {}, keys, base);
    expect(d.update).toHaveLength(0); expect(d.kept).toEqual([ea.id]);
  });
  it('άλλαξε μόνο στο Excel: απλή αλλαγή, χωρίς σύγκρουση', () => {
    const d = diffStatuses('medical', s, parseStatuses('medical', excelEdit, b, s.people, TODAY), b, {}, keys, base);
    expect(d.update).toHaveLength(1); expect(d.update[0].conflict).toBeUndefined(); expect(d.kept).toHaveLength(0);
  });
});

describe('αρχεία στον δίσκο (Μ1, Μ2, Σ2)', () => {
  it('writeJson: ολόκληρο αρχείο, χωρίς .tmp που μένει', () => {
    const dir = tmp(); const f = path.join(dir, 'sources.json');
    writeJson(f, { a: 1 }); writeJson(f, { a: 2 });
    expect(JSON.parse(fs.readFileSync(f, 'utf8'))).toEqual({ a: 2 });
    expect(fs.readdirSync(dir)).toEqual(['sources.json']);
  });
  it('πολλές εγγραφές στη σειρά κρατούν ένα αντίγραφο στα _προηγούμενα, όχι ένα ανά εγγραφή', async () => {
    const dir = tmp(); const name = 'Δ.xlsx';
    const xl = async (v: string) => { const wb = await Workbook.blank('Φ'); (await wb.sheet('Φ')).set('A1', v); return wb.save(); };
    for (let i = 0; i < 4; i++) await writeAll([{ dir, name, data: await xl('v' + i) }], { prevEvery: 60_000 });
    expect(await valuesHash(fs.readFileSync(path.join(dir, name)))).toBe(await valuesHash(await xl('v3')));
    expect(fs.readdirSync(path.join(dir, PREV_DIR))).toHaveLength(1);
  });
  it('το αποτύπωμα τιμών εντύπου μένει ίδιο όταν ξανασώζεται χωρίς αλλαγή και αλλάζει με αλλαγή κελιού', async () => {
    const wb = await Workbook.blank('Φ'); const ws = await wb.sheet('Φ'); ws.set('A1', 'ΦΡΟΥΡΑ'); ws.set('B2', 'ΣΤΡ ΔΟΚΙΜΟΣ');
    const a = await wb.save();
    const again = await (await Workbook.open(a)).save();
    expect(await valuesHash(again)).toBe(await valuesHash(a));
    const wb2 = await Workbook.open(a); (await wb2.sheet('Φ')).set('B2', 'ΣΤΡ ΑΛΛΟΣ');
    expect(await valuesHash(await wb2.save())).not.toBe(await valuesHash(a));
  });
});

describe('προσθήκη γραμμών και τύποι (Μ3)', () => {
  it('shiftFormula: μόνο αναφορές στο φύλλο που άλλαξε, όχι κείμενα ή ονόματα συναρτήσεων', () => {
    expect(shiftFormula('SUM(B2:B5)+B9', 'Α', true, 3, 2)).toBe('SUM(B2:B7)+B11');
    expect(shiftFormula('SUM(B2:B5)', 'Α', false, 3, 2)).toBe('SUM(B2:B5)');
    expect(shiftFormula("SUM(Α!B2:B5)+'Άλλο φύλλο'!C9", 'Α', false, 3, 2)).toBe("SUM(Α!B2:B7)+'Άλλο φύλλο'!C9");
    expect(shiftFormula("COUNTIF('Α'!F2:F200,\"B9\")+LOG10(A10)", 'Α', true, 3, 2)).toBe("COUNTIF('Α'!F2:F202,\"B9\")+LOG10(A12)");
    expect(shiftFormula('Β!C10+C10', 'Α', true, 3, 2)).toBe('Β!C10+C12');
    expect(shiftFormula('A1&amp;B9', 'Α', true, 3, 2)).toBe('A1&amp;B11');
  });
  it('οι τύποι των άλλων φύλλων, οι υπερσύνδεσμοι και το φίλτρο ακολουθούν τις γραμμές που κατέβηκαν', async () => {
    const wb = await Workbook.blank('ΛΙΣΤΑ'); const a = await wb.sheet('ΛΙΣΤΑ');
    for (let r = 1; r <= 5; r++) a.set('B' + r, r);
    const b = await wb.addSheet('ΣΥΝΟΛΑ'); b.set('A1', 'x');
    let buf = await wb.save();
    // τύποι και υπερσύνδεσμος με το χέρι, όπως θα τα έφτιαχνε το Excel
    const JSZip = (await import('jszip')).default; const z = await JSZip.loadAsync(buf);
    const paths = Object.keys(z.files).filter(f => /worksheets\/[^/]+\.xml$/.test(f)).sort();
    const listPath = paths.find(p => !/sheet_a/.test(p))!, sumPath = paths.find(p => /sheet_a/.test(p))!;
    let lx = await z.file(listPath)!.async('string');
    lx = lx.replace('</sheetData>', '<row r="9"><c r="B9"><f>SUM(B1:B5)</f><v>15</v></c></row></sheetData><autoFilter ref="A1:B5"/><hyperlinks><hyperlink ref="B5" display="x" location="ΣΥΝΟΛΑ!A1"/></hyperlinks>');
    z.file(listPath, lx);
    let sx = await z.file(sumPath)!.async('string');
    sx = sx.replace('<c r="A1"', '<c r="B1"><f>ΛΙΣΤΑ!B5+B1</f><v>5</v></c><c r="A1"');
    z.file(sumPath, sx);
    buf = await z.generateAsync({ type: 'nodebuffer' });
    // δύο γραμμές μετά την 3η του ΛΙΣΤΑ, με το ΣΥΝΟΛΑ να μην έχει ανοίξει
    const w2 = await Workbook.open(buf); (await w2.sheet('ΛΙΣΤΑ')).insertRows(3, 2, 3, w2);
    const out = await w2.save();
    const w3 = await Workbook.open(out);
    expect((await w3.sheet('ΛΙΣΤΑ')).formula('B11')).toBe('SUM(B1:B7)');
    expect((await w3.sheet('ΣΥΝΟΛΑ')).formula('B1')).toBe('ΛΙΣΤΑ!B7+B1');
    const z2 = await JSZip.loadAsync(out); const lx2 = await z2.file(listPath)!.async('string');
    expect(lx2).toContain('<autoFilter ref="A1:B7"'); expect(lx2).toContain('<hyperlink ref="B7"');
  });
});

describe('θάλαμοι (Μ4) και μήνας ελέγχου υπηρεσιών (Σ4)', () => {
  it('αλλαγή θαλάμου γραμμένη στο Δυναμολόγιο θυμίζει το φύλλο ΘΑΛΑΜΟΙ', async () => {
    const s = fakeState(6); const dir = tmp(); const file = path.join(dir, 'Δ.xlsx');
    const sheets: RawSheet[] = [
      { name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΣΥΝΟΛΙΚΟ'], [...HEAD, 'Σ.Ι', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], ...s.people.map((x, i) => [...pr(x, i), x.si, null])] },
      { name: 'ΘΑΛΑΜΟΙ', rows: [['ΘΑΛΑΜΟΣ 1']] }
    ];
    await toFile(sheets, file);
    const b = bindAll((await readBook(file)).sheets, file, ['people']).people;
    const s2: AppState = { ...s, people: s.people.map(p => (p.id === s.people[2].id ? { ...p, room: 9 } : p)) };
    const w = await writeSource('people', b, s2, { keys: [], at: 'x', mtime: 0, size: 0 }, TODAY);
    expect(w.ok && w.rooms).toEqual({ n: 1, sheet: 'ΘΑΛΑΜΟΙ' });
  });
  it('ο μήνας που όρισε ο χρήστης ισχύει όταν ο τίτλος του φύλλου δεν έχει μήνα', () => {
    const sh: RawSheet = { name: 'ΕΛΕΓΧΟΣ', rows: [['ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ'], ['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 1, 2, 3]] };
    const b: SourceBinding = { file: 'x', sheet: 'ΕΛΕΓΧΟΣ', header: 1, cols: {} };
    expect(bindingMonth(sh, b, TODAY)).toBeNull();
    expect(bindingMonth(sh, { ...b, month: '2026-10' }, TODAY)).toBe('2026-10');
  });
});
