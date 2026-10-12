// Συνδεδεμένα αρχεία: αλλαγές ανά πίνακα, διαγραφές από το Excel, πόστα / εκτός δύναμης / δυνατότητες / έλεγχος
// υπηρεσιών προς τις δύο κατευθύνσεις, και στοιχεία ατόμου σε όλα τα φύλλα. Μόνο ψεύτικα ονόματα.
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, rosterChanges, type Command, type Ctx } from '../src/shared/commands';
import type { AppState, Person } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import {
  dayColumns, diffStatuses, dutyCode, mapColumns, fieldsOf, monthOf, parseStatuses, planCaps, planCapsWrite, planDuties, planDutiesWrite, planOutside,
  planOutsideWrite, planPosts, planPostsWrite, planSource, personSets, snapPeople, tableHash, bestFor, detectTables, type SourceBinding, type ListKind
} from '../src/shared/sources';
import { Workbook } from '../src/main/xlsx';
import { readBook, tableState, writeSource, syncStampNow, type SourceMeta } from '../src/main/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
let seq = 0;
const ctx: Ctx = { today: TODAY, newId: () => 'l' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const HEAD = ['Α/Α', 'Βαθμός', 'Ο/Σ', 'Επώνυμο', 'Όνομα', 'Πατρώνυμο', 'ΑΣΜ', 'Τηλέφωνο', 'Θάλαμος'];
const pr = (p: Person, i: number) => [i + 1, p.rank, p.spec, p.last, p.first, p.father, p.asm, p.phone, p.room];
const D = (iso: string) => new Date(iso + 'T00:00:00Z');
const bind = (kind: ListKind, sh: RawSheet, file = 'x.xlsx'): SourceBinding => { const x = bestFor(kind, [sh])!; return { file, sheet: sh.name, header: x.header, cols: x.cols, write: true }; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-link-'));
async function toFile(sheets: RawSheet[], file: string) {
  const wb = await Workbook.blank(sheets[0].name);
  for (const sh of sheets) {
    const ws = wb.hasSheet(sh.name) ? await wb.sheet(sh.name) : await wb.addSheet(sh.name);
    sh.rows.forEach((row, r) => row.forEach((v, c) => {
      if (v == null || v === '') return;
      const ref = (c >= 26 ? String.fromCharCode(64 + Math.floor(c / 26)) : '') + String.fromCharCode(65 + (c % 26)) + (r + 1);
      if (v instanceof Date) ws.setNumber(ref, (v.getTime() - Date.UTC(1899, 11, 30)) / 86400000, 3); else ws.set(ref, v as string | number);
    }));
  }
  fs.writeFileSync(file, await wb.save());
}
// «Αλλαγή με το χέρι στο Excel»: ανοίγει, γράφει ένα κελί, σώζει (όπως ο χρήστης)
async function edit(file: string, sheet: string, ref: string, v: string | number | null) {
  const wb = await Workbook.open(fs.readFileSync(file)); (await wb.sheet(sheet)).set(ref, v);
  fs.writeFileSync(file, await wb.save());
  const t = new Date(Date.now() + 5000); fs.utimesSync(file, t, t);   // σίγουρα άλλη ώρα αρχείου
}
const sheetOf = async (file: string, name: string) => (await readBook(file)).sheets.find(x => x.name === name)!;

// Δυναμολόγιο με τρία φύλλα στο ίδιο αρχείο και δύο πίνακες στο ίδιο φύλλο
function dyn(s: AppState): RawSheet[] {
  const p = s.people;
  return [
    { name: 'ΣΥΝΟΛΙΚΟ', rows: [['ΣΥΝΟΛΙΚΟ'], [...HEAD, 'Σ.Ι', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], ...p.slice(0, 8).map((x, i) => [...pr(x, i), x.si, null])] },
    { name: 'ΤΙΜΩΡΗΜΕΝΟΙ', rows: [['ΤΙΜΩΡΗΜΕΝΟΙ'], [...HEAD, 'ΑΠΟ', 'ΕΩΣ', 'ΕΙΔΟΣ ΠΟΙΝΗΣ'], [...pr(p[3], 0), D('2026-10-11'), D('2026-10-14'), 'ΠΕΡΙΟΡΙΣΜΟΣ'], [...pr(p[4], 1), D('2026-10-05'), D('2026-10-20'), 'ΚΡΑΤΗΣΗ'], [3]] },
    { name: 'IATRIKA', rows: [
      ['ΕΙΣΑΓΩΓΕΣ ΣΤΕΠ'], [...HEAD, 'ΕΙΣ', 'ΕΞ', 'Παρατηρήσεις'], [...pr(p[6], 0), D('2026-10-10'), D('2026-10-13'), ''], [2], [],
      ['ΕΑ-ΕΥ'], [...HEAD, 'ΕΑ-ΕΥ', 'ΑΠΟ', 'ΕΩΣ', 'Παρατηρήσεις'], [...pr(p[1], 0), 'ΕΑ', D('2026-10-09'), D('2026-10-16'), ''], [2]
    ] },
    { name: 'ΠΟΣΤΑ', rows: [['ΠΟΣΤΑ'], [...HEAD, 'Πόστο'], [...pr(p[5], 0), 'ΚΨΜ'], [...pr(p[2], 1), 'ΙΑΤΡΟΣ ΣΤΕΠ']] },
    { name: 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ', rows: [['ΕΚΤΟΣ ΔΥΝΑΜΗΣ'], [...HEAD, 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], [...pr(p[7], 0), 'ΑΝΑΒΟΛΗ']] }
  ];
}

describe('αλλαγή ανά πίνακα, όχι ανά αρχείο', () => {
  it('το αποτύπωμα αλλάζει μόνο με αλλαγή στις στήλες του πίνακα', () => {
    const s = fakeState(12); const sh = dyn(s)[2];
    const ea = { file: 'x', sheet: 'IATRIKA', header: 6, cols: mapColumns(sh.rows[6], fieldsOf('medical')) };
    const step = { file: 'x', sheet: 'IATRIKA', header: 1, cols: mapColumns(sh.rows[1], fieldsOf('step')) };
    const h = tableHash(sh, ea), hs = tableHash(sh, step);
    // αλλαγή στον άλλο πίνακα του ίδιου φύλλου
    const sh2: RawSheet = { ...sh, rows: sh.rows.map((r, i) => (i === 2 ? r.map((v, c) => (c === 10 ? D('2026-10-15') : v)) : r)) };
    expect(tableHash(sh2, ea)).toBe(h); expect(tableHash(sh2, step)).not.toBe(hs);
    // αλλαγή στο «έως» του δικού του
    const sh3: RawSheet = { ...sh, rows: sh.rows.map((r, i) => (i === 7 ? r.map((v, c) => (c === 11 ? D('2026-10-17') : v)) : r)) };
    expect(tableHash(sh3, ea)).not.toBe(h);
    // στήλη που δεν διαβάζει η εφαρμογή (π.χ. σημείωση δεξιά από τον πίνακα): δεν μετράει
    const sh4: RawSheet = { ...sh, rows: sh.rows.map((r, i) => (i === 7 ? [...r, null, null, 'σημείωση'] : r)) };
    expect(tableHash(sh4, ea)).toBe(h);
  });

  it('γράφει η εφαρμογή σε ένα φύλλο ή σώζεις το αρχείο: τα άλλα φύλλα του ίδιου αρχείου δεν δείχνουν «άλλαξε»', async () => {
    const s = fakeState(12); const dir = tmp(); const file = path.join(dir, 'ΔΥΝΑΜΟΛΟΓΙΟ.xlsx');
    await toFile(dyn(s), file);
    const book = await readBook(file);
    const kinds: ListKind[] = ['people', 'punish', 'medical', 'step', 'posts', 'outside'];
    const b = Object.fromEntries(kinds.map(k => { const x = bestFor(k, book.sheets)!; return [k, { file, sheet: x.sheet, header: x.header, cols: x.cols, write: true } as SourceBinding]; })) as Record<ListKind, SourceBinding>;
    expect(b.medical.sheet).toBe('IATRIKA'); expect(b.step.sheet).toBe('IATRIKA'); expect(b.medical.header).not.toBe(b.step.header);
    const meta: Partial<Record<ListKind, SourceMeta>> = {};
    for (const k of kinds) meta[k] = { keys: [], at: 'x', ...(await syncStampNow(b[k])) } as unknown as SourceMeta;
    // η εφαρμογή γράφει μια νέα ποινή στους ΤΙΜΩΡΗΜΕΝΟΥΣ
    const s1 = run(s, { t: 'importRecords', adds: [{ pid: s.people[0].id, type: 'PUN', from: '2026-10-12', to: '2026-10-15', kind: 'Περιορισμός' }], updates: [], source: 'x', what: 'ποινές' });
    const w = await writeSource('punish', b.punish, s1, meta.punish, TODAY);
    expect(w.ok && !w.unchanged).toBe(true);
    if (w.ok) meta.punish = { ...meta.punish!, ...w.meta } as SourceMeta;
    for (const k of kinds) expect((await tableState(b[k], meta[k])).changed, k).toBe(false);
    // ο χρήστης ανοίγει και σώζει το αρχείο χωρίς αλλαγή στο IATRIKA, αλλά με αλλαγή στα πόστα
    await edit(file, 'ΠΟΣΤΑ', 'J4', 'ΜΑΓΕΙΡΕΙΑ');
    for (const k of kinds) expect((await tableState(b[k], meta[k])).changed, k).toBe(k === 'posts');
    // αλλαγή με το χέρι στο «έως» της ΕΑ: μόνο τα ιατρικά (ΕΑ-ΕΥ) δείχνουν «άλλαξε», όχι το ΣΤΕΠ του ίδιου φύλλου
    await edit(file, 'IATRIKA', 'L8', '20/10/2026');
    const st = Object.fromEntries(await Promise.all(kinds.map(async k => [k, (await tableState(b[k], meta[k])).changed])));
    expect(st).toEqual({ people: false, punish: false, medical: true, step: false, posts: true, outside: false });
  });

  it('αλλαγή με το χέρι στο Excel φαίνεται στην ανανέωση και περνά στη βάση', async () => {
    const s0 = fakeState(12); const dir = tmp(); const file = path.join(dir, 'd.xlsx');
    await toFile(dyn(s0), file);
    let sh = await sheetOf(file, 'IATRIKA');
    const b = { ...bind('medical', sh, file) };
    let s = run(s0, { t: 'importRecords', adds: diffStatuses('medical', s0, parseStatuses('medical', sh, b, s0.people, TODAY), b).add, updates: [], source: 'x', what: 'ιατρικά' });
    const ea = s.statuses.find(x => x.type === 'EA')!;
    expect(ea.to).toBe('2026-10-16');
    await edit(file, 'IATRIKA', 'L8', '20/10/2026');
    sh = await sheetOf(file, 'IATRIKA');
    const d = diffStatuses('medical', s, parseStatuses('medical', sh, b, s.people, TODAY), b);
    expect(d.update).toHaveLength(1); expect(d.update[0].what).toContain('έως 20/10');
    s = run(s, { t: 'importRecords', adds: d.add, updates: d.update, source: 'x', what: 'ιατρικά' });
    expect(s.statuses.find(x => x.id === ea.id)!.to).toBe('2026-10-20');
  });
});

describe('διαγραφές και αλλαγή έναρξης από το Excel', () => {
  const s0 = fakeState(12);
  const sh = dyn(s0)[1]; const b = bind('punish', sh);
  const parsed0 = parseStatuses('punish', sh, b, s0.people, TODAY);
  const s = run(s0, { t: 'importRecords', adds: diffStatuses('punish', s0, parsed0, b).add, updates: [], source: 'x', what: 'ποινές' });
  const keys = diffStatuses('punish', s, parsed0, b).keys;
  it('γραμμή που σβήστηκε από το Excel προτείνεται για διαγραφή (όχι να ξαναγραφτεί)', () => {
    const cut: RawSheet = { ...sh, rows: sh.rows.filter((_, i) => i !== 3) };
    const d = diffStatuses('punish', s, parseStatuses('punish', cut, b, s.people, TODAY), b, {}, keys);
    expect(d.removed.map(x => x.pid)).toEqual([s.people[4].id]); expect(d.appOnly).toHaveLength(0); expect(d.add).toHaveLength(0);
    const s2 = run(s, { t: 'importRecords', adds: [], updates: [], deletes: d.removed.map(x => x.id), source: 'x', what: 'ποινές' });
    expect(s2.statuses.filter(x => x.type === 'PUN')).toHaveLength(1);
    // χωρίς τα κλειδιά της προηγούμενης φοράς: δεν σβήνεται τίποτα (απλώς δεν είναι στο Excel)
    expect(diffStatuses('punish', s, parseStatuses('punish', cut, b, s.people, TODAY), b).removed).toHaveLength(0);
  });
  it('άλλαξε το «από» στο Excel: η ίδια εγγραφή αλλάζει, δεν γίνεται διπλή', () => {
    const moved: RawSheet = { ...sh, rows: sh.rows.map((r, i) => (i === 3 ? r.map((v, c) => (c === 9 ? D('2026-10-06') : v)) : r)) };
    const d = diffStatuses('punish', s, parseStatuses('punish', moved, b, s.people, TODAY), b, {}, keys);
    expect(d.add).toHaveLength(0); expect(d.removed).toHaveLength(0); expect(d.update).toHaveLength(1);
    expect(d.update[0].patch.from).toBe('2026-10-06'); expect(d.update[0].what).toContain('από 06/10');
    const s2 = run(s, { t: 'importRecords', adds: d.add, updates: d.update, source: 'x', what: 'ποινές' });
    expect(s2.statuses.filter(x => x.type === 'PUN')).toHaveLength(2);
    expect(planSource('punish', moved, b, s2, { keys: d.keys }, TODAY).sets).toHaveLength(0);
  });
});

describe('προσωπικό: τι ακριβώς αλλάζει', () => {
  it('η προεπισκόπηση λέει άτομο-άτομο τι αλλάζει, όχι μόνο πόσοι', () => {
    const s = fakeState(6);
    const rows = s.people.map(p => ({ ...p, si: p.id === 3 ? 'Ι3 ΜΕ ΟΠΛΟ' : p.si, room: p.id === 4 ? 7 : p.room }));
    const r = rosterChanges(s, rows);
    expect(r.same).toBe(4);
    expect(r.changes.map(c => c.what)).toEqual(['Σ.Ι Ι1 → Ι3 ΜΕ ΟΠΛΟ', 'θάλαμος 4 → 7']);
  });
});

describe('πόστα και εκτός δύναμης: μόνα τους, με τα δικά τους νούμερα', () => {
  it('πόστα: όσοι είναι στο φύλλο παίρνουν πόστο, όσοι λείπουν το χάνουν', () => {
    const s = fakeState(12); const sh = dyn(s)[3]; const b = bind('posts', sh);
    expect(b.cols.post).toBe(9);
    const p = planPosts(sh, b, s);
    expect(p.listed).toBe(2); expect(p.same).toBe(1);   // ο 6ος έχει ήδη ΚΨΜ
    expect(p.changes.map(c => [c.pid, c.patch.post])).toEqual([[3, 'ΙΑΤΡΟΣ ΣΤΕΠ']]);
    const s2 = run(s, { t: 'setPeopleFields', changes: p.changes, source: 'x', what: 'πόστα' });
    expect(s2.people[2].post).toBe('ΙΑΤΡΟΣ ΣΤΕΠ');
    // βγήκε από το φύλλο ο 6ος
    const cut: RawSheet = { ...sh, rows: sh.rows.filter((_, i) => i !== 2) };
    expect(planPosts(cut, b, s2).changes.map(c => [c.pid, c.patch.post])).toEqual([[6, null]]);
  });
  it('εκτός δύναμης: μπαίνουν με τον λόγο τους και όποιος λείπει πια γυρνά σε δύναμη', () => {
    const s = fakeState(12); const sh = dyn(s)[4]; const b = bind('outside', sh);
    const p = planOutside(sh, b, s);
    expect(p.changes).toEqual([{ pid: 8, patch: { active: false, notes: 'Εκτός δύναμης: ΑΝΑΒΟΛΗ' }, who: expect.any(String), what: 'εκτός δύναμης (ΑΝΑΒΟΛΗ)' }]);
    const s2 = run(s, { t: 'setPeopleFields', changes: p.changes, source: 'x', what: 'εκτός δύναμης' });
    expect(s2.people[7].active).toBe(false);
    expect(planOutside(sh, b, s2).changes).toHaveLength(0);
    const empty: RawSheet = { ...sh, rows: sh.rows.slice(0, 2) };
    expect(planOutside(empty, b, s2).changes.map(c => c.patch)).toEqual([{ active: true, notes: '' }]);
  });
  it('η ανάγνωση ενός φύλλου δεν δείχνει τα νούμερα του ΣΥΝΟΛΙΚΟΥ', () => {
    const s = fakeState(12); const sheets = dyn(s);
    const hits = detectTables(sheets);
    expect(hits.find(h => h.sheet === 'ΠΟΣΤΑ')!.best).toBe('posts'); expect(hits.find(h => h.sheet === 'ΠΟΣΤΑ')!.rows).toBe(2);
    expect(planPosts(sheets[3], bind('posts', sheets[3]), s).listed).toBe(2);
  });
});

// Δυνατότητα υπηρεσιών όπως το δείγμα 02: επικεφαλίδες στη 1η γραμμή, «-» = δεν κάνει
const capsSheet = (s: AppState): RawSheet => ({ name: 'Φύλλο1', rows: [
  ['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΠΑΤΡΩΝΥΜΟ', 'ΘΑΛΑΜΟΦΥΛΑΚΑΣ', 'ΟΠΛΟΦΥΛΑΚΑΣ', 'ΜΑΓΕΙΡΙΑ', 'ΣΚΟΠΙΑ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'],
  [s.people[0].last, s.people[0].first, s.people[0].father, null, '-', null, '-', 'ΛΟΓΩ Ι'],
  [s.people[1].last, s.people[1].first, s.people[1].father, null, null, '-', '-', null]
] });
describe('δυνατότητα υπηρεσιών', () => {
  it('αναγνωρίζεται και διαβάζεται: «-» = δεν κάνει, κενό = κάνει, όσοι λείπουν δεν αλλάζουν', () => {
    const s = fakeState(12); const sh = capsSheet(s);
    expect(detectTables([sh])[0].best).toBe('caps');
    const b = bind('caps', sh);
    const s0 = run(s, { t: 'setCap', pid: 2, kind: 'op', allowed: false });   // ο 2ος είχε εμπόδιο στον οπλοφύλακα από την εφαρμογή
    const p = planCaps(sh, b, { ...s0, caps: { ...s0.caps, 9: { sk: 'Από τον λοχία' } } });
    expect(p.changes.map(c => [c.pid, c.kind, c.reason])).toEqual([[1, 'op', 'Από Excel: ΛΟΓΩ Ι'], [1, 'sk', 'Από Excel: ΛΟΓΩ Ι'], [2, 'op', null], [2, 'mg', 'Από Excel'], [2, 'sk', 'Από Excel']]);
    const s2 = run(s0, { t: 'importCaps', changes: p.changes, source: 'x' });
    expect(s2.caps[1]).toEqual({ op: 'Από Excel: ΛΟΓΩ Ι', sk: 'Από Excel: ΛΟΓΩ Ι' }); expect(s2.caps[2]).toEqual({ mg: 'Από Excel', sk: 'Από Excel' });
    expect(planCaps(sh, b, s2).changes).toHaveLength(0);
    // και πίσω: τίποτα να γραφτεί αφού είναι ίδια
    expect(planCapsWrite(sh, b, s2).sets).toHaveLength(0);
  });
  it('αλλαγή στην εφαρμογή γράφεται στο φύλλο: «-» ή κενό στο κελί, νέα γραμμή για νέο εμπόδιο', () => {
    const s = fakeState(12); const sh = capsSheet(s); const b = bind('caps', sh);
    let s2 = run(s, { t: 'importCaps', changes: planCaps(sh, b, s).changes, source: 'x' });
    s2 = run(s2, { t: 'setCap', pid: 1, kind: 'sk', allowed: true });       // ο 1ος κάνει πια σκοπιά
    s2 = run(s2, { t: 'setCap', pid: 4, kind: 'mg', allowed: false });      // ο 4ος δεν κάνει μαγειρεία
    const w = planCapsWrite(sh, b, s2);
    expect(w.sets).toContainEqual({ r: 1, c: 6, v: null });
    expect(w.sets.filter(x => x.r === 3)).toEqual([{ r: 3, c: 0, v: s.people[3].last }, { r: 3, c: 1, v: s.people[3].first }, { r: 3, c: 2, v: s.people[3].father }, { r: 3, c: 5, v: '-' }, { r: 3, c: 7, v: 'Από τον λοχία' }]);
    expect(w.added).toBe(1);
  });
});

// Έλεγχος υπηρεσιών όπως το δείγμα 03: τίτλος με μήνα, στήλες συνόλων, μετά μία στήλη ανά μέρα, γραμμή ΣΥΝΟΛΑ
function checkSheet(s: AppState, cells: Record<string, string>): RawSheet {
  const days = Array.from({ length: 30 }, (_, i) => String(i + 1));
  return { name: 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ  ΙΛΗΣ', rows: [
    ['ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΣΕΠΤΕΜΒΡΙΟΥ 2026'],
    ['Α/Α', 'ΒΘΜ', 'Ο-Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΘΑΛΑΜΟΣ', 'ΑΡΓΕΙΑ', 'ΚΑΘΗΜΕΡΙΝΗ', 'ΣΥΝΟΛΟ', 'ΣΚΟΠΙΑ', 'ΜΑΓΕΙΡΕΙΑ', 'ΘΑΛΑΜΟΦΥΛΑΚΑΣ', ...days],
    ...s.people.slice(0, 8).map((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.room, 0, 0, 0, 0, 0, 0, ...days.map(d => cells[i + ':' + d] || null)]),
    [null, null, null, null, 'ΣΥΝΟΛΑ', null, 1, 2, 3, 0, 1, 2, ...days.map(() => 0)]
  ] };
}
describe('έλεγχος υπηρεσιών (μηνιαίο πλέγμα)', () => {
  it('μήνας από τον τίτλο και κωδικοί', () => {
    expect(monthOf('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΣΕΠΤΕΜΒΡΙΟΥ 2026', TODAY)).toBe('2026-09');
    expect(monthOf('Έλεγχος Μαΐου', TODAY)).toBe('2026-05');
    expect(monthOf('ΕΛΕΓΧΟΣ ΔΕΚΕΜΒΡΙΟΥ', TODAY)).toBe('2025-12');
    expect(monthOf('ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ', TODAY)).toBe(null);
    expect([dutyCode('Θ'), dutyCode('μ'), dutyCode('ΔΥ'), dutyCode('Κ.Α')]).toEqual([{ kind: 'th' }, { kind: 'mg' }, { kind: 'ly', pref: 'dy' }, null]);
  });
  it('διαβάζει τις υπηρεσίες σε θέσεις του είδους τους· όσες περισσεύουν πάνε στις προηγούμενες', () => {
    const s = fakeState(12);
    const cells: Record<string, string> = { '0:1': 'Θ', '1:1': 'Θ', '2:1': 'Μ', '3:2': 'ΛΥ', '4:2': 'ΔΥ', '5:3': 'Κ.Α', '6:3': 'Χ' };
    for (let i = 0; i < 8; i++) cells[i + ':5'] = 'Μ';   // 8 στα μαγειρεία με 5 θέσεις (Σάββατο 5/9)
    const sh = checkSheet(s, cells);
    expect(detectTables([sh])[0].best).toBe('duties');
    const b = bind('duties', sh); expect(dayColumns(sh.rows[1], b.cols.d1)).toHaveLength(30);
    const p = planDuties(sh, b, s, '2026-09', TODAY);
    expect(p.sp.rows).toHaveLength(8); expect(p.sp.unmatched).toHaveLength(0);   // η γραμμή ΣΥΝΟΛΑ δεν είναι άτομο
    expect(p.guards['2026-09-01']).toEqual({ th1: 1, th2: 2, mg1: 3 });
    expect(p.guards['2026-09-02']).toEqual({ ly: 4, dy: 5 });
    expect(Object.keys(p.guards['2026-09-05'])).toEqual(['mg1', 'mg2', 'mg3', 'mg4', 'mg5']);
    expect(p.extra).toBe(3); expect(p.base[6]).toEqual({ mg: 1, hol: 1 });
    expect(p.unknown).toEqual(['Χ']);   // ο κωδικός απουσίας Κ.Α δεν είναι άγνωστος
    const s2 = run(s, { t: 'importDuties', guards: p.guards, baseline: p.base, source: 'x' });
    expect(s2.guards['2026-09-01'].th1).toBe(1); expect(s2.baseline[8]).toEqual({ mg: 1, hol: 1 });
    // όσοι πήγαν στις προηγούμενες υπηρεσίες κρατούν τον κωδικό τους στο Excel
    expect(planDutiesWrite(sh, b, s2, TODAY, p.extraCells).sets).toHaveLength(0);
    expect(planDutiesWrite(sh, b, s2, TODAY).sets).toHaveLength(3);
    // ξανά: οι μέρες έχουν πια υπηρεσίες, δεν περνά τίποτα δεύτερη φορά
    const p2 = planDuties(sh, b, s2, '2026-09', TODAY);
    expect(p2.entries).toBe(0); expect(p2.busy).toEqual(['2026-09-01', '2026-09-02', '2026-09-05']);
    expect(run(s2, { t: 'importDuties', guards: p.guards, baseline: {}, source: 'x' })).toEqual(s2);
  });
  it('αλλαγή υπηρεσίας στην εφαρμογή: ο κωδικός γράφεται στο κελί της μέρας, οι κωδικοί απουσίας μένουν', () => {
    const s = fakeState(12);
    const sh = checkSheet(s, { '0:1': 'Θ', '1:1': 'Θ', '5:1': 'Κ.Α' });
    const b = bind('duties', sh);
    let s2 = run(s, { t: 'importDuties', guards: planDuties(sh, b, s, '2026-09', TODAY).guards, baseline: {}, source: 'x' });
    expect(planDutiesWrite(sh, b, s2, TODAY).sets).toHaveLength(0);
    s2 = run(s2, { t: 'assign', date: '2026-09-01', k: 'th2', pid: 3, force: 'δοκιμή' });     // ο 3ος αντί για τον 2ο
    s2 = run(s2, { t: 'assign', date: '2026-09-01', k: 'mg1', pid: 2, force: 'δοκιμή' });     // ο 2ος στα μαγειρεία
    s2 = run(s2, { t: 'assign', date: '2026-09-10', k: 'ly', pid: 1, force: 'δοκιμή' });
    const w = planDutiesWrite(sh, b, s2, TODAY);
    const c1 = 12, c10 = 21;
    expect(w.sets).toEqual(expect.arrayContaining([{ r: 3, c: c1, v: 'Μ' }, { r: 4, c: c1, v: 'Θ' }, { r: 2, c: c10, v: 'ΛΥ' }]));
    expect(w.sets.some(x => x.r === 7)).toBe(false);   // Κ.Α του 6ου μένει
    expect(w.notFound).toEqual([]);
  });
  it('γράφει στο αρχείο και τις μέρες 29 και 30 (στήλες AO, AP)', async () => {
    const s = fakeState(12); const dir = tmp(); const file = path.join(dir, 'e.xlsx');
    await toFile([checkSheet(s, { '0:1': 'Θ' })], file);
    const sh = await sheetOf(file, 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ  ΙΛΗΣ');
    expect(dayColumns(sh.rows[1], 12)).toHaveLength(30);
    const b = bind('duties', sh, file);
    let s2 = run(s, { t: 'importDuties', guards: planDuties(sh, b, s, '2026-09', TODAY).guards, baseline: {}, source: 'x' });
    s2 = run(s2, { t: 'assign', date: '2026-09-29', k: 'th1', pid: 2, force: 'δοκιμή' });
    s2 = run(s2, { t: 'assign', date: '2026-09-30', k: 'mg1', pid: 3, force: 'δοκιμή' });
    const w = await writeSource('duties', b, s2, { keys: [], at: 'x', mtime: 0, size: 0 }, TODAY);
    expect(w.ok && w.changed).toBe(2);
    const rows = (await sheetOf(file, sh.name)).rows;
    expect([rows[3][40], rows[4][41]]).toEqual(['Θ', 'Μ']);
  });
});

describe('στοιχεία ατόμου σε όλα τα φύλλα', () => {
  it('αλλάζεις θάλαμο ή τηλέφωνο στην εφαρμογή: γράφεται και στις γραμμές του στα άλλα φύλλα', () => {
    const s = fakeState(12); const sheets = dyn(s);
    const psnap = snapPeople(s.people);
    const s2: AppState = { ...s, people: s.people.map(p => (p.id === 4 ? { ...p, room: 8, phone: '6911111111' } : p.id === 8 ? { ...p, last: 'ΝΕΟΕΠΩΝΥΜΟΣ' } : p)) };
    const tim = personSets(sheets[1], bind('punish', sheets[1]), s2, psnap);
    expect(tim.sets).toEqual([{ r: 2, c: 7, v: 6911111111 }, { r: 2, c: 8, v: 8 }]);
    const out = personSets(sheets[4], bind('outside', sheets[4]), s2, psnap);
    expect(out.sets).toEqual([{ r: 2, c: 3, v: 'ΝΕΟΕΠΩΝΥΜΟΣ' }]);   // βρέθηκε με το παλιό επώνυμο
    // χωρίς αλλαγή από την τελευταία φορά: τίποτα
    expect(personSets(sheets[1], bind('punish', sheets[1]), s2, snapPeople(s2.people)).sets).toHaveLength(0);
  });
  it('μέσα από το σχέδιο εγγραφής: πρώτη φορά (χωρίς στιγμιότυπο) δεν αγγίζει στοιχεία ατόμων', () => {
    const s = fakeState(12); const sh = dyn(s)[3]; const b = bind('posts', sh);
    const s2: AppState = { ...s, people: s.people.map(p => (p.id === 3 ? { ...p, post: 'ΙΑΤΡΟΣ ΣΤΕΠ', room: 5 } : p)) };
    expect(planSource('posts', sh, b, s2, undefined, TODAY).sets).toHaveLength(0);
    expect(planSource('posts', sh, b, s2, { psnap: snapPeople(s.people) }, TODAY).sets).toEqual([{ r: 3, c: 8, v: 5 }]);
  });
});

describe('εγγραφή πίσω σε αρχείο: πόστα, εκτός δύναμης', () => {
  it('νέο πόστο μπαίνει σε νέα γραμμή, όποιος το έχασε σβήνεται, ο επιστρέφων φεύγει από τους εκτός δύναμης', async () => {
    const s0 = fakeState(12); const dir = tmp(); const file = path.join(dir, 'd.xlsx');
    await toFile(dyn(s0), file);
    const book = await readBook(file);
    const bp = { ...bind('posts', book.sheets.find(x => x.name === 'ΠΟΣΤΑ')!, file) };
    const bo = { ...bind('outside', book.sheets.find(x => x.name === 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ')!, file) };
    let s = run(s0, { t: 'setPeopleFields', changes: planPosts(book.sheets[3], bp, s0).changes, source: 'x', what: 'πόστα' });
    s = run(s, { t: 'setPeopleFields', changes: planOutside(book.sheets[4], bo, s).changes, source: 'x', what: 'εκτός' });
    expect(planPostsWrite(book.sheets[3], bp, s).sets).toHaveLength(0); expect(planOutsideWrite(book.sheets[4], bo, s).sets).toHaveLength(0);
    s = { ...s, people: s.people.map(p => (p.id === 6 ? { ...p, post: null } : p.id === 1 ? { ...p, post: 'ΣΤΡΑΤΟΛΟΓΙΑ' } : p.id === 8 ? { ...p, active: true, notes: '' } : p)) };
    const wp = await writeSource('posts', bp, s, { keys: [], at: 'x', mtime: 0, size: 0 }, TODAY);
    expect(wp.ok && [wp.added, wp.cleared]).toEqual([1, 1]);
    const wo = await writeSource('outside', bo, s, { keys: [], at: 'x', mtime: 0, size: 0 }, TODAY);
    expect(wo.ok && wo.cleared).toBe(1);
    const after = await readBook(file);
    const posts = after.sheets.find(x => x.name === 'ΠΟΣΤΑ')!;
    // διαβάζεται ξανά όπως ακριβώς είναι στην εφαρμογή
    expect(planPosts(posts, bp, s).changes).toHaveLength(0);
    expect(planOutside(after.sheets.find(x => x.name === 'ΕΚΤΟΣ ΔΥΝΑΜΗΣ')!, bo, s).changes).toHaveLength(0);
    // τα άλλα φύλλα έμειναν ίδια
    for (const n of ['ΣΥΝΟΛΙΚΟ', 'ΤΙΜΩΡΗΜΕΝΟΙ', 'IATRIKA']) expect(JSON.stringify(after.sheets.find(x => x.name === n)!.rows)).toBe(JSON.stringify(book.sheets.find(x => x.name === n)!.rows));
  });
});

describe('αρχείο ανοιχτό στο Excel', () => {
  it('δεν γράφεται τίποτα, η αλλαγή περιμένει, και η ανίχνευση αλλαγών δουλεύει κανονικά', async () => {
    const s0 = fakeState(12); const dir = tmp(); const file = path.join(dir, 'd.xlsx');
    await toFile(dyn(s0), file);
    const book = await readBook(file); const bp = { ...bind('posts', book.sheets[3], file) };
    const meta = { keys: [], at: 'x', ...(await syncStampNow(bp)) } as unknown as SourceMeta;
    const before = fs.readFileSync(file);
    const real = fs.openSync;
    const spy = vi.spyOn(fs, 'openSync').mockImplementation(((f: fs.PathLike, flags?: fs.OpenMode, mode?: fs.Mode) => {
      if (String(f) === file && flags === 'r+') { const e: NodeJS.ErrnoException = new Error('busy'); e.code = 'EBUSY'; throw e; }
      return real(f, flags as fs.OpenMode, mode);
    }) as typeof fs.openSync);
    try {
      const s = { ...s0, people: s0.people.map(p => (p.id === 1 ? { ...p, post: 'ΣΤΡΑΤΟΛΟΓΙΑ' } : p)) };
      const w = await writeSource('posts', bp, s, meta, TODAY);
      expect(w.ok).toBe(false); expect(!w.ok && w.locked).toBe(true);
      expect(fs.readFileSync(file).equals(before)).toBe(true);
      expect((await tableState(bp, meta)).changed).toBe(false);
    } finally { spy.mockRestore(); }
  });
});
