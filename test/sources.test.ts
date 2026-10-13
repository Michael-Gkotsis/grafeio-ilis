// Αρχεία Excel ανά είδος: αναγνώριση πινάκων, ανάγνωση, εγγραφή πίσω στο ίδιο κελί. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState, Person } from '../src/shared/domain';
import { parseRoster, type RawSheet } from '../src/shared/roster';
import {
  bestFor, defaultBinding, detectHkai, detectTables, diffStatuses, hkaiMapOf, identity, parseStatuses, planPeopleWrite, planWrite,
  refitCols, snapFromSheet, tableRows, type SourceBinding
} from '../src/shared/sources';
import { dutyBlock } from '../src/shared/rules';
import { Workbook } from '../src/main/xlsx';
import { readBook, writeSource } from '../src/main/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
let seq = 0;
const ctx: Ctx = { today: TODAY, newId: () => 's' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const setTo = (s: AppState, id: string, to: string): AppState => ({ ...s, statuses: s.statuses.map(x => (x.id === id ? { ...x, to } : x)) });
const D = (iso: string) => new Date(iso + 'T00:00:00Z');
const HEAD = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Τηλέφωνο', 'Θάλαμος'];
const pr = (p: Person, i: number) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room];

// Δομή σαν το Δυναμολόγιο: τίτλοι πάνω από τις επικεφαλίδες, δύο πίνακες στο ίδιο φύλλο, ελεύθερες γραμμές με Α/Α
function book(s: AppState): RawSheet[] {
  const p = s.people;
  return [
    { name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΔΥΝΑΜΟΛΟΓΙΟ'], ['ΣΥΝΟΛΙΚΟ ΔΥΝΑΜΟΛΟΓΙΟ ΙΛΗΣ'], [...HEAD, 'Σ.Ι', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], ...p.slice(0, 20).map((x, i) => [...pr(x, i), x.si, null])] },
    { name: 'ΤΙΜΩΡΗΜΕΝΟΙ', rows: [['ΤΙΜΩΡΗΜΕΝΟΙ'], [...HEAD, 'ΑΠΌ', 'ΕΩΣ', 'ΕΙΔΟΣ\nΠΟΙΝΗΣ'], [...pr(p[3], 0), D('2026-10-11'), D('2026-10-14'), 'ΠΕΡΙΟΡΙΣΜΟΣ'], [2], [3]] },
    { name: 'IATRIKA', rows: [
      ['ΕΙΣΑΓΩΓΕΣ ΣΤΕΠ'], [...HEAD, 'ΕΙΣ', 'ΕΞ', 'Παρατηρήσεις'], [...pr(p[7], 0), D('2026-10-10'), D('2026-10-13'), ''], [2], [],
      ['ΕΑ-ΕΥ'], [...HEAD, 'ΕΑ-ΕΥ', 'ΑΠΌ', 'ΕΩΣ', 'Παρατηρήσεις'],
      [...pr(p[10], 0), 'ΕΑ', D('2026-10-09'), D('2026-10-16'), 'ΓΟΝΑΤΟ'],
      [...pr(p[11], 1), 'ΕΛ ΑΡΒ', D('2026-10-11'), D('2026-10-18'), ''],
      [3, 'ΣΤΡ', 'ΠΖ', 'ΚΑΝΕΝΑΣ', 'ΑΓΝΩΣΤΟΣ', '', null, null, 3, 'ΕΥ', D(TODAY), D('2026-10-13'), ''],
      [4]
    ] }
  ];
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-src-'));
async function toFile(sheets: RawSheet[], file: string, extra?: (zip: JSZip) => void) {
  const wb = await Workbook.blank(sheets[0].name);
  for (const sh of sheets) {
    const ws = wb.hasSheet(sh.name) ? await wb.sheet(sh.name) : await wb.addSheet(sh.name);
    sh.rows.forEach((row, r) => row.forEach((v, c) => {
      if (v == null || v === '') return;
      const ref = String.fromCharCode(65 + c) + (r + 1);
      if (v instanceof Date) ws.setNumber(ref, (v.getTime() - Date.UTC(1899, 11, 30)) / 86400000, 3); else ws.set(ref, v as string | number);
    }));
  }
  let data = await wb.save();
  if (extra) { const zip = await JSZip.loadAsync(data); extra(zip); data = await zip.generateAsync({ type: 'nodebuffer' }); }
  fs.writeFileSync(file, data);
}

describe('αναγνώριση πινάκων', () => {
  it('βρίσκει κάθε πίνακα του Δυναμολογίου και το είδος του, ακόμα και δύο στο ίδιο φύλλο', () => {
    const hits = detectTables(book(fakeState(30)));
    const by = (sheet: string, header: number) => hits.find(h => h.sheet === sheet && h.header === header)?.best;
    expect(by('ΣΥΝΟΛΙΚΟ', 2)).toBe('people');
    expect(by('ΤΙΜΩΡΗΜΕΝΟΙ', 1)).toBe('punish');
    expect(by('IATRIKA', 1)).toBe('step');
    expect(by('IATRIKA', 6)).toBe('medical');
    const m = bestFor('medical', book(fakeState(30)))!;
    expect(m.cols).toMatchObject({ last: 3, first: 4, asm: 6, kind: 9, from: 10, to: 11, note: 12 });
  });
  it('ο πίνακας τελειώνει στον επόμενο τίτλο· οι γραμμές με μόνο Α/Α είναι ελεύθερες', () => {
    const sh = book(fakeState(30))[2];
    const step = tableRows(sh, 1, bestFor('step', [sh])!.cols);
    expect(step.records.map(r => r.r)).toEqual([2]);
    expect(step.free).toEqual([3]);
    const med = tableRows(sh, 6, bestFor('medical', [sh])!.cols);
    expect(med.records.map(r => r.r)).toEqual([7, 8, 9]);
    expect(med.free).toEqual([10]);
  });
});

describe('ανάγνωση καταστάσεων', () => {
  const s0 = fakeState(30);
  const sh = book(s0)[2];
  const b: SourceBinding = { file: 'x.xlsx', sheet: 'IATRIKA', header: 6, cols: bestFor('medical', [sh])!.cols, write: true };
  it('ΕΑΡΒ («ΕΛ ΑΡΒ»): δικό του είδος, ακόμα κι αν παλιότερα είχε διαλεχτεί ΕΑ', () => {
    for (const values of [undefined, { ΕΛΑΡΒ: 'EA' as const }]) {
      const p = parseStatuses('medical', sh, { ...b, values }, s0.people, TODAY);
      expect(p.unknown).toEqual([]);
      expect(diffStatuses('medical', s0, p, b).add.map(a => [a.pid, a.type, a.kind])).toEqual([[11, 'EA', undefined], [12, 'EARV', 'ΕΛ ΑΡΒ']]);
    }
    // χωρίς περιορισμούς: μπαίνει και σε ένοπλη θέση και σε μαγειρεία
    const st = [{ id: 'r', pid: 12, type: 'EARV' as const, from: TODAY, to: TODAY }];
    expect(dutyBlock(st, TODAY, 12, { armed: true, kind: 'sk' })).toBeNull(); expect(dutyBlock(st, TODAY, 12, { armed: false, kind: 'mg' })).toBeNull();
  });
  it('άγνωστο είδος και άγνωστο άτομο: ρωτά, δεν μαντεύει', () => {
    const sh: RawSheet = { name: 'IATRIKA', rows: book(s0)[2].rows.map(r => r.map(v => (v === 'ΕΛ ΑΡΒ' ? 'ΕΛ ΠΟΔ' : v))) };
    const p = parseStatuses('medical', sh, b, s0.people, TODAY);
    expect(p.unknown).toEqual(['ΕΛ ΠΟΔ']);
    expect(p.cands.find(c => c.who.includes('ΚΑΝΕΝΑΣ'))!.pid).toBeNull();
    const d = diffStatuses('medical', s0, p, b);
    expect(d.add.map(a => [a.pid, a.type, a.kind])).toEqual([[11, 'EA', undefined], [12, 'EA', 'ΕΛ ΠΟΔ']]);
    expect(d.unmatched).toHaveLength(1);
    // ο χρήστης λέει ότι το «ΕΛ ΠΟΔ» είναι ΕΥ και ποιος είναι ο άγνωστος
    const b2 = { ...b, values: { ΕΛΠΟΔ: 'EY' as const } };
    const d2 = diffStatuses('medical', s0, parseStatuses('medical', sh, b2, s0.people, TODAY), b2, { 9: 5 });
    expect(d2.add.map(a => [a.pid, a.type])).toEqual([[11, 'EA'], [12, 'EY'], [5, 'EY']]);
  });
  it('δικό σου ιατρικό (Λίστες): αναγνωρίζεται πριν από τους κανόνες, κρατά το όνομά του, ξαναγράφεται ίδιο', () => {
    const sh: RawSheet = { name: 'IATRIKA', rows: book(s0)[2].rows.map(r => r.map(v => (v === 'ΕΛ ΑΡΒ' ? 'Ελ.Ποδ' : v))) };
    const lists = { medKinds: { add: [{ name: 'ΕΛ ΠΟΔ', like: 'EY' as const }] } };
    const s1: AppState = { ...s0, settings: { ...s0.settings, lists } };
    // και πάνω από ό,τι είχε διαλεχτεί παλιότερα για την ίδια τιμή
    for (const values of [undefined, { ΕΛΠΟΔ: 'EA' as const }]) {
      const p = parseStatuses('medical', sh, { ...b, values }, s1.people, TODAY, lists);
      expect(p.unknown).toEqual([]);
      expect(diffStatuses('medical', s1, p, b).add.map(a => [a.pid, a.type, a.kind])).toEqual([[11, 'EA', undefined], [12, 'EY', 'Ελ.Ποδ']]);
    }
    const d = diffStatuses('medical', s1, parseStatuses('medical', sh, b, s1.people, TODAY, lists), b);
    const s = run(s1, { t: 'importRecords', adds: d.add, updates: [], source: 'x', what: 'ιατρικά' });
    expect(planWrite('medical', sh, b, s, d.keys, TODAY).sets).toEqual([]);
    // συμπεριφέρεται σαν ΕΥ: καμία υπηρεσία
    expect(dutyBlock(s.statuses, TODAY, 12, { armed: false, kind: 'mg' })).not.toBeNull();
    // δηλωμένο στην εφαρμογή: γράφεται στο Excel με το όνομά του
    const s2 = run(s1, { t: 'declare', cmd: { type: 'EY', kind: 'ΕΛ ΠΟΔ', pids: [3], from: TODAY, to: TODAY } });
    expect(planWrite('medical', sh, b, s2, d.keys, TODAY).sets.map(x => x.v)).toContain('ΕΛ ΠΟΔ');
  });
  it('ο ίδιος με ΕΑ και ΕΟ την ίδια μέρα: δύο εγγραφές, και η εγγραφή δεν σβήνει καμία γραμμή', () => {
    const sh2: RawSheet = { name: 'IATRIKA', rows: sh.rows.map(r => [...r]) };
    sh2.rows[9] = [...pr(s0.people[10], 2), 'ΕΟ', D('2026-10-09'), D('2026-10-16'), ''];
    const p = parseStatuses('medical', sh2, b, s0.people, TODAY);
    const d = diffStatuses('medical', s0, p, b, { 9: null });
    expect(d.add.filter(a => a.pid === 11).map(a => a.type)).toEqual(['EA', 'EO']);
    expect(d.dup).toEqual([]);
    const s = run(s0, { t: 'importRecords', adds: d.add, updates: [], source: 'x', what: 'ιατρικά' });
    const plan = planWrite('medical', sh2, b, s, d.keys, TODAY);
    expect(plan.cleared).toBe(0);
    expect(plan.sets).toEqual([]);
  });
  it('ίδια εγγραφή με άλλο «έως» → αλλαγή, όχι διπλή', () => {
    const s = run(s0, { t: 'declare', cmd: { type: 'EA', pids: [11], from: '2026-10-09', to: '2026-10-12' } });
    const d = diffStatuses('medical', s, parseStatuses('medical', sh, b, s.people, TODAY), b);
    expect(d.add.map(a => a.pid)).toEqual([12]);
    expect(d.update).toHaveLength(1);
    expect(d.update[0].patch).toMatchObject({ to: '2026-10-16', note: 'ΓΟΝΑΤΟ' });
  });
});

describe('εγγραφή καταστάσεων στο φύλλο', () => {
  const s0 = fakeState(30);
  const sh = book(s0)[1];
  const b: SourceBinding = { file: 'x.xlsx', sheet: 'ΤΙΜΩΡΗΜΕΝΟΙ', header: 1, cols: bestFor('punish', [sh])!.cols, write: true };
  it('νέα ποινή πάει στην πρώτη ελεύθερη γραμμή· όσα δεν ξέρει η εφαρμογή μένουν', () => {
    let s = run(s0, { t: 'declare', cmd: { type: 'PUN', pids: [9], from: '2026-10-12', to: '2026-10-15', kind: 'Κράτηση' } });
    s = run(s, { t: 'approvePun', id: s.statuses[0].id });
    const plan = planWrite('punish', sh, b, s, [], TODAY);
    expect(plan.foreign).toBe(1);          // η ποινή του Excel που δεν έχει περάσει ακόμα στην εφαρμογή
    expect(plan.added).toBe(1); expect(plan.insert).toBeNull();
    const row3 = plan.sets.filter(x => x.r === 3);
    expect(row3.find(x => x.c === b.cols.last)!.v).toBe(s.people[8].last);
    expect(row3.find(x => x.c === b.cols.from)!.v).toEqual({ date: '2026-10-12' });
    expect(plan.sets.some(x => x.r === 2)).toBe(false);
  });
  it('ποινή που αιτείται ακόμα δεν γράφεται· όταν εγκριθεί γράφεται', () => {
    const s = run(s0, { t: 'declare', cmd: { type: 'PUN', pids: [9], from: '2026-10-12', to: '2026-10-15', kind: 'Κράτηση' } });
    expect(planWrite('punish', sh, b, s, [], TODAY).added).toBe(0);
  });
  it('αλλαγή «έως» στην εφαρμογή → αλλάζει μόνο εκείνο το κελί· διαγραφή → σβήνει τη γραμμή που είχε γράψει', () => {
    const p = parseStatuses('punish', sh, b, s0.people, TODAY);
    let s = run(s0, { t: 'importRecords', ...(() => { const d = diffStatuses('punish', s0, p, b); return { adds: d.add, updates: [] }; })(), source: 'x', what: 'ποινές' });
    const st = s.statuses[0];
    s = setTo(s, st.id, '2026-10-16');
    const plan = planWrite('punish', sh, b, s, [identity(4, 'punish', '2026-10-11')], TODAY);
    expect(plan.sets).toEqual([{ r: 2, c: b.cols.to, v: { date: '2026-10-16' } }]);
    s = run(s, { t: 'deleteStatus', id: st.id });
    const gone = planWrite('punish', sh, b, s, [identity(4, 'punish', '2026-10-11')], TODAY);
    expect(gone.cleared).toBe(1);
    expect(gone.sets.every(x => x.r === 2 && x.v === null && x.c !== b.cols.aa)).toBe(true);
  });
  it('όταν δεν χωράνε, προσθέτει γραμμές κάτω από τον πίνακα με αύξοντα αριθμό', () => {
    let s = s0;
    for (const pid of [9, 10, 11]) s = run(s, { t: 'declare', cmd: { type: 'PUN', pids: [pid], from: '2026-10-12', to: '2026-10-13', kind: 'Περιορισμός' } });
    for (const x of s.statuses) s = run(s, { t: 'approvePun', id: x.id });
    const plan = planWrite('punish', sh, b, s, [], TODAY);
    expect(plan.added).toBe(3);
    expect(plan.insert).toEqual({ after: 4, n: 1, tpl: 2 });
    expect(plan.sets.find(x => x.r === 5 && x.c === b.cols.aa)!.v).toBe(4);
  });
});

describe('διορθώσεις ατόμων πίσω στο Δυναμολόγιο', () => {
  it('αλλάζει το Σ.Ι. κάποιου → γράφεται μόνο το κελί του Σ.Ι. στη γραμμή του', () => {
    const s0 = fakeState(30); const sh = book(s0)[0];
    const b: SourceBinding = { file: 'x.xlsx', sheet: 'ΣΥΝΟΛΙΚΟ', header: 2, cols: bestFor('people', [sh])!.cols, write: true };
    const snap = snapFromSheet(sh, b, s0.people);
    const s = { ...s0, people: s0.people.map(p => (p.id === 6 ? { ...p, si: 'Ι3 ΑΟΠΛΟ', phone: '6911111111' } : p)) };
    const plan = planPeopleWrite(sh, b, s, snap);
    expect(plan.sets).toEqual([{ r: 8, c: 7, v: 6911111111 }, { r: 8, c: 9, v: 'Ι3 ΑΟΠΛΟ' }]);
    // ήδη γραμμένο: την επόμενη φορά δεν ξαναγράφει
    expect(planPeopleWrite(sh, b, s, plan.snap).sets).toEqual([]);
  });
  it('ό,τι άλλαξε στο Excel και όχι στην εφαρμογή δεν το πατά', () => {
    const s0 = fakeState(30); const sh = book(s0)[0];
    const b: SourceBinding = { file: 'x.xlsx', sheet: 'ΣΥΝΟΛΙΚΟ', header: 2, cols: bestFor('people', [sh])!.cols, write: true };
    const snap = snapFromSheet(sh, b, s0.people);
    sh.rows[8][8] = 7;   // κάποιος άλλαξε τον θάλαμο στο Excel
    expect(planPeopleWrite(sh, b, s0, snap).sets).toEqual([]);
  });
});

describe('εγγραφή σε αρχείο', () => {
  it('Δυναμολόγιο .xlsm: γράφει το κελί, κρατά μακροεντολές, άλλα φύλλα και την προηγούμενη έκδοση', async () => {
    const dir = tmp(); const file = path.join(dir, 'ΔΥΝΑΜΟΛΟΓΙΟ.xlsm');
    const s0 = fakeState(30); const sheets = book(s0);
    await toFile(sheets, file, zip => zip.file('xl/vbaProject.bin', Buffer.from('fake-vba')));
    const r0 = await readBook(file);
    const b: SourceBinding = { file, sheet: 'ΣΥΝΟΛΙΚΟ', header: 2, cols: bestFor('people', r0.sheets)!.cols, write: true };
    const snap = snapFromSheet(r0.sheets[0], b, s0.people);
    const s = { ...s0, people: s0.people.map(p => (p.id === 6 ? { ...p, si: 'Ι3 ΑΟΠΛΟ' } : p)) };
    const out = await writeSource('people', b, s, { mtime: 0, size: 0, keys: [], snap, at: 'x' }, TODAY);
    expect(out.ok && out.changed).toBe(1);
    const wb = await Workbook.open(fs.readFileSync(file));
    expect((await wb.sheet('ΣΥΝΟΛΙΚΟ')).get('J9')).toBe('Ι3 ΑΟΠΛΟ');
    expect((await wb.sheet('ΣΥΝΟΛΙΚΟ')).get('J8')).toBe(s0.people[4].si);
    expect((await wb.sheet('ΤΙΜΩΡΗΜΕΝΟΙ')).get('D3')).toBe(s0.people[3].last);
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    expect(await zip.file('xl/vbaProject.bin')!.async('string')).toBe('fake-vba');
    expect(fs.readdirSync(path.join(dir, '_προηγούμενα')).length).toBe(1);
  });
  it('νέο αρχείο από την εφαρμογή: φτιάχνεται με τίτλο και επικεφαλίδες, και μετά ενημερώνεται', async () => {
    const dir = tmp(); const file = path.join(dir, 'ΙΑΤΡΙΚΑ.xlsx');
    let s = run(fakeState(30), { t: 'declare', cmd: { type: 'EY', pids: [3], from: '2026-10-12', to: '2026-10-14' } });
    const b = defaultBinding('medical', file);
    const r1 = await writeSource('medical', b, s, undefined, TODAY);
    expect(r1.ok && r1.created).toBe(true);
    let rows = (await readBook(file)).sheets[0].rows;
    expect(rows[0][0]).toBe('ΕΑ-ΕΥ');
    expect(rows[1].slice(0, 4)).toEqual(['Α/Α', 'ΒΑΘΜΟΣ', 'Ο/Σ', 'ΕΠΩΝΥΜΟ']);
    expect(rows[2][3]).toBe(s.people[2].last);
    expect(rows[2][b.cols.from]).toEqual(D('2026-10-12'));
    // η εφαρμογή αλλάζει το «έως» και προσθέτει κι άλλο: το ίδιο αρχείο ενημερώνεται
    s = setTo(s, s.statuses[0].id, '2026-10-15');
    s = run(s, { t: 'declare', cmd: { type: 'EA', pids: [4], from: '2026-10-12', to: '2026-10-13' } });
    const r2 = await writeSource('medical', b, s, { mtime: 0, size: 0, keys: r1.ok ? r1.meta.keys! : [], at: 'x' }, TODAY);
    expect(r2.ok && [r2.changed, r2.added]).toEqual([1, 1]);
    rows = (await readBook(file)).sheets[0].rows;
    expect(rows[2][b.cols.to]).toEqual(D('2026-10-15'));
    expect(rows[3][3]).toBe(s.people[3].last);
    expect(rows[3][0]).toBe(2);
  });
});

describe('ΗΚΑΙ: κελιά από τα κείμενα του εντύπου', () => {
  it('στο template της εφαρμογής βρίσκει ακριβώς τα κελιά που χρησιμοποιεί η εξαγωγή', async () => {
    const wb = await Workbook.open(fs.readFileSync(path.join(__dirname, '..', 'templates', 'hkai.xlsx')));
    const d = detectHkai({ name: wb.sheetNames()[0], rows: await wb.values(0, 120, 40) });
    expect(d.missing).toEqual([]);
    expect(d.map).toEqual(hkaiMapOf());
  });
});

describe('δικαίωμα ΔΝ από το Δυναμολόγιο', () => {
  const s0 = fakeState(12);
  const head = [...HEAD, 'Σ.Ι', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'];
  const main = (extra: (p: Person, i: number) => (string | null)[] = () => [], h: string[] = head): RawSheet =>
    ({ name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΔΥΝΑΜΟΛΟΓΙΟ'], ['ΣΥΝΟΛΙΚΟ'], h, ...s0.people.map((p, i) => [...pr(p, i), p.si, ...extra(p, i)])] });
  const dnOf = (sheets: RawSheet[]) => parseRoster(sheets).rows.map(r => r.dn);
  it('στήλη «ΔΝ»: ΝΑΙ/Χ = έχει, κενό ή ΟΧΙ = δεν έχει', () => {
    const v = ['ΝΑΙ', 'Χ', '', 'ΟΧΙ', '✓', null, null, null, null, null, null, null];
    const r = dnOf([main((_, i) => [null, v[i]], [...head, 'ΔΝ'])]);
    expect(r.slice(0, 6)).toEqual([true, true, false, false, true, false]);
  });
  it('η λέξη ΔΝ στις παρατηρήσεις = δικαίωμα ΔΝ, και ο ρόλος μένει καθαρός· ο ΔΝΕΑΣ δεν μπερδεύεται', () => {
    const rows = parseRoster([main((_, i) => [i === 1 ? 'ΘΑΛΑΜΑΡΧΗΣ ΔΝ' : i === 2 ? 'Δ.Ν.' : i === 3 ? 'ΔΝΕΑΣ' : null])]).rows;
    expect(rows.slice(0, 4).map(r => [r.dn, r.role])).toEqual([[undefined, null], [true, 'ΘΑΛΑΜΑΡΧΗΣ'], [true, null], [undefined, 'ΔΝΕΑΣ']]);
  });
  it('φύλλο «ΔΝ» με λίστα ονομάτων: αυτοί έχουν, οι άλλοι όχι', () => {
    const list: RawSheet = { name: 'ΔΝ', rows: [['ΔΙΚΑΙΟΥΧΟΙ ΔΝ'], HEAD, [...pr(s0.people[4], 0)], [...pr(s0.people[7], 1)]] };
    const r = dnOf([main(), list]);
    expect(r.map((x, i) => (x ? i : -1)).filter(i => i >= 0)).toEqual([4, 7]);
    expect(r.every(x => x === true || x === false)).toBe(true);
    // ο πίνακας δικαιούχων δεν προτείνεται ως δεύτερο «Προσωπικό»
    expect(detectTables([main(), list]).find(h => h.sheet === 'ΔΝ')?.best).not.toBe('people');
  });
  it('χωρίς τίποτα για ΔΝ στο αρχείο, η εισαγωγή κρατά ό,τι έχει οριστεί στην εφαρμογή', () => {
    let s = { ...s0, people: s0.people.map(p => (p.id === 3 ? { ...p, dn: true } : p)) };
    s = run(s, { t: 'importPeople', rows: parseRoster([main()]).rows, source: 'x', deactivateMissing: false });
    expect(s.people.find(p => p.id === 3)!.dn).toBe(true);
  });
  it('φύλλο «ΔΝ» με ΑΠΟ/ΕΩΣ = διανυκτερεύσεις: είδος «ΔΝ» στα Αρχεία Excel', () => {
    const sh: RawSheet = { name: 'ΔΝ', rows: [['ΔΙΑΝΥΚΤΕΡΕΥΣΕΙΣ'], [...HEAD, 'ΑΠΟ', 'ΕΩΣ'], [...pr(s0.people[2], 0), D('2026-10-17'), D('2026-10-18')]] };
    expect(dnOf([main(), sh]).every(x => x === undefined)).toBe(true);
    const hit = detectTables([sh])[0];
    expect(hit.best).toBe('dn');
    const b: SourceBinding = { file: 'x.xlsx', sheet: 'ΔΝ', header: 1, cols: bestFor('dn', [sh])!.cols, write: true };
    const d = diffStatuses('dn', s0, parseStatuses('dn', sh, b, s0.people, TODAY), b);
    expect(d.add).toEqual([{ pid: 3, type: 'DN', from: '2026-10-17', to: '2026-10-18' }]);
  });
  // Michael (11/10): «το ΔΝ είναι column στο δυναμολόγιο». Η στήλη μπαίνει μετά την πρώτη αντιστοίχιση.
  const withDn = (at: number, h = head) => { const sh = main(); const v = ['ΝΑΙ', '', 'Χ'];
    sh.rows = sh.rows.map((r, i) => { const x = [...r]; x.splice(at, 0, i === 2 ? 'ΔΝ' : i > 2 ? (v[i - 3] ?? null) : null); return x; }); sh.rows[2] = [...h.slice(0, at), 'ΔΝ', ...h.slice(at)]; return sh; };
  it('νέα στήλη «ΔΝ» μετά την αντιστοίχιση: οι στήλες ακολουθούν και το ΔΝ διαβάζεται', () => {
    const b: SourceBinding = { file: 'x.xlsx', sheet: 'ΣΥΝΟΛΙΚΟ', header: 2, cols: bestFor('people', [main()])!.cols, write: true };
    expect(b.cols.dn).toBeUndefined();
    const sh = withDn(7);   // ανάμεσα στο ΑΣΜ (6) και στο τηλέφωνο (7)
    const nb = refitCols('people', sh, b);
    expect(nb.cols).toEqual({ ...b.cols, dn: 7, phone: 8, room: 9, si: 10, remarks: 11 });
    const rows = parseRoster([sh], { main: { sheet: nb.sheet, header: nb.header, cols: nb.cols } }).rows;
    expect(rows.slice(0, 3).map(r => r.dn)).toEqual([true, false, true]);
    expect(rows[0].phone).toBe(s0.people[0].phone);
    // η εγγραφή πίσω πάει στη στήλη ΔΝ, όχι στις παρατηρήσεις
    const read = { ...s0, people: s0.people.map((p, i) => ({ ...p, dn: !!rows.find(r => r.asm === p.asm)?.dn })) };
    const s = { ...read, people: read.people.map(p => (p.id === s0.people[1].id ? { ...p, dn: true } : p)) };
    const plan = planPeopleWrite(sh, nb, s, snapFromSheet(sh, nb, read.people));
    expect(plan.sets.filter(x => x.c === 7).map(x => [x.r, x.v])).toEqual([[4, 'ΝΑΙ']]);
    expect(plan.sets.some(x => x.c === 11)).toBe(false);
    // ίδιο αρχείο χωρίς αλλαγή: η αντιστοίχιση μένει ίδια
    expect(refitCols('people', sh, nb)).toBe(nb);
  });
  it('δική σου στήλη (χωρίς γνωστή επικεφαλίδα) δεν αλλάζει, εκτός αν μετακινήθηκαν όλες μαζί', () => {
    const h = [...HEAD, 'Σ.Ι', 'ΡΟΛΟΣ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'];
    const sh = main(() => [null, null], h);
    const b: SourceBinding = { file: 'x.xlsx', sheet: 'ΣΥΝΟΛΙΚΟ', header: 2, cols: { ...bestFor('people', [sh])!.cols, remarks: 10 }, write: true };
    expect(refitCols('people', sh, b)).toBe(b);   // ο χρήστης διάλεξε «ΡΟΛΟΣ» για τις παρατηρήσεις
    const moved = refitCols('people', withDn(2, h), b);   // νέα στήλη πριν από όλες: όλα +1, και το «ΡΟΛΟΣ» μαζί
    expect(moved.cols).toEqual({ ...Object.fromEntries(Object.entries(b.cols).map(([k, c]) => [k, c >= 2 ? c + 1 : c])), dn: 2 });
  });
  it('επικεφαλίδες ΔΝ: «Δ/Ν», «ΔΙΚΑΙΟΥΧΟΣ ΔΝ», «ΔΝ (ΝΑΙ/ΟΧΙ)»', () => {
    for (const t of ['Δ/Ν', 'ΔΙΚΑΙΟΥΧΟΣ ΔΝ', 'ΔΝ (ΝΑΙ/ΟΧΙ)', 'Δ.Ν.']) expect(dnOf([main((_, i) => [null, i === 0 ? 'ΝΑΙ' : null], [...head, t])])[0]).toBe(true);
  });
  it('όποιος είναι εκτός δύναμης δεν χάνει τις παρατηρήσεις του στο ΣΥΝΟΛΙΚΟ', () => {
    const sh = main((_, i) => [i === 1 ? 'ΓΡΑΦΕΑΣ' : null]);
    const out: RawSheet = { name: 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ', rows: [['ΕΚΤΟΣ'], [...HEAD, 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], [...pr(s0.people[1], 0), 'ΑΝΑΒΟΛΗ']] };
    const s = run(s0, { t: 'importPeople', rows: parseRoster([sh, out]).rows, source: 'x', deactivateMissing: false });
    const b: SourceBinding = { file: 'x', sheet: 'ΣΥΝΟΛΙΚΟ', header: 2, cols: bestFor('people', [sh])!.cols, write: true };
    expect(planPeopleWrite(sh, b, s, snapFromSheet(sh, b, s.people)).sets).toEqual([]);
  });
  it('αλλάζεις το δικαίωμα ΔΝ στην εφαρμογή → γράφεται στη στήλη ΔΝ, ή ως λέξη στις παρατηρήσεις αν δεν υπάρχει στήλη', () => {
    const withCol = main((_, i) => [null, i === 1 ? 'ΝΑΙ' : null], [...head, 'ΔΝ']);
    const b1: SourceBinding = { file: 'x', sheet: 'ΣΥΝΟΛΙΚΟ', header: 2, cols: bestFor('people', [withCol])!.cols, write: true };
    expect(b1.cols.dn).toBe(11);
    const snap1 = snapFromSheet(withCol, b1, s0.people.map(p => (p.id === 2 ? { ...p, dn: true } : p)));
    const s1 = { ...s0, people: s0.people.map(p => (p.id === 5 ? { ...p, dn: true } : p)) };   // ο 2 χάνει, ο 5 παίρνει
    expect(planPeopleWrite(withCol, b1, s1, snap1).sets).toEqual([{ r: 4, c: 11, v: null }, { r: 7, c: 11, v: 'ΝΑΙ' }]);
    const noCol = main((_, i) => [i === 1 ? 'ΘΑΛΑΜΑΡΧΗΣ' : null]);
    const b2: SourceBinding = { file: 'x', sheet: 'ΣΥΝΟΛΙΚΟ', header: 2, cols: bestFor('people', [noCol])!.cols, write: true };
    const base = s0.people.map(p => (p.id === 2 ? { ...p, role: 'ΘΑΛΑΜΑΡΧΗΣ' } : p));
    const snap2 = snapFromSheet(noCol, b2, base);
    const s2 = { ...s0, people: base.map(p => (p.id === 2 ? { ...p, dn: true } : p)) };
    expect(planPeopleWrite(noCol, b2, s2, snap2).sets).toEqual([{ r: 4, c: 10, v: 'ΘΑΛΑΜΑΡΧΗΣ ΔΝ' }]);
  });
});
