// Έντυπα (Michael, 29/10): «Κενό» στο «Τι αφορά» — πίνακας από το μηδέν, με δικές σου στήλες και κελιά, χωρίς άτομα
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport } from '../src/main/reports';
import { BLANK_MAX, BLANK_ROWS, REP_KINDS, blankN, candidates, defaultPick, fieldValue, forBuild, groupsOf, pickForKind, pickText, regrid, rowsOf, rowNoun, sortsOf, splitOk, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import type { ValueTable } from '../src/shared/values';
import { fakeState } from './fixtures';

const D = '2026-10-19', clock = { today: D, now: 12 * 60 };
const blankPick = (n: number) => ({ from: 'all' as const, mode: 'all' as const, n });
const rep = (x: Partial<Report> = {}): Report => ({ id: 'r1', name: 'Κενό', tpl: 't1', kind: 'blank', sheet: '', head: 1, cols: [], cells: [], pick: blankPick(3), sort: 'pick', day: 'today', out: 'file', ...x });
const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'col', h: 'Όνομα', w: 'auto' as const }, { f: 'col', h: 'Σημείωση', w: 'auto' as const }];
const GRID = [['Αθανάσιος', 'ok'], ['', 'x'], ['   ', 'ά']];
const base = (x: Partial<BuildOpts> = {}): BuildOpts => ({ title: 'ΚΕΝΟ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray', cols, grid: GRID, nrows: 3, ...x });
const VT: ValueTable[] = [{ id: 'v1', title: 'ΣΥΝΟΛΑ', rows: [{ label: 'Σε δύναμη', expr: [{ sign: '+', metric: 'str.total' }] }] }];
const grid = async (data: Buffer | Uint8Array) => { const wb = await Workbook.open(data); return wb.values(wb.sheetNames()[0], 200, 40); };
const at = (g: unknown[][], text: string): { r: number; c: number }[] => g.flatMap((row, r) => row.map((v, c) => (v === text ? { r, c } : null)).filter(Boolean) as { r: number; c: number }[]);
const firstAt = (g: unknown[][], text: string) => { const x = at(g, text)[0]; expect(x, text).toBeTruthy(); return x; };
const txt = (v: unknown) => String(v ?? '');
const parts = async (data: Buffer | Uint8Array) => { const z = await JSZip.loadAsync(data); const o: Record<string, string> = {}; for (const n of Object.keys(z.files).sort()) if (!z.files[n].dir) o[n] = (await z.files[n].async('nodebuffer')).toString('base64'); return o; };
// το έντυπο όπως το βγάζει η οθόνη: πρότυπο από τις επιλογές, γραμμές από rowsOf (όπως το usePick)
async function make(o: BuildOpts, x: Partial<Report> = {}) {
  const s = fakeState(40); const r0 = rep(x); const bo = forBuild(o, r0); const b = await buildTemplate(bo, r0.kind);
  const r = withBuilt(r0, b, bo); r.sigs = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }];
  const out = await fillReport(b.data, s, r, rowsOf(s, r, D).map(p => p.id), D, { clock });
  return { s, r, b, out, g: await grid(out.data) };
}

describe('Έντυπα: «Κενό», ο πίνακας από το μηδέν', () => {
  it('Α/Α και 2 στήλες, 3 γραμμές: Α/Α 1..3, κείμενο με κεφαλαία στα σωστά κελιά, τα κενά μένουν κενά, σωστές επικεφαλίδες', async () => {
    const { g, r } = await make(base());
    const a = firstAt(g, 'Α/Α'), h1 = firstAt(g, 'ΟΝΟΜΑ'), h2 = firstAt(g, 'ΣΗΜΕΙΩΣΗ');
    expect(h1.r).toBe(a.r); expect(h2.r).toBe(a.r); expect(h1.c).toBe(a.c + 1); expect(h2.c).toBe(a.c + 2);
    const row = (i: number) => [g[a.r + i][a.c], txt(g[a.r + i][h1.c]), txt(g[a.r + i][h2.c])];
    expect(row(1)).toEqual([1, 'ΑΘΑΝΑΣΙΟΣ', 'OK']);
    expect(row(2)).toEqual([2, '', 'X']);
    expect(row(3)).toEqual([3, '', 'Α']);   // ο τόνος φεύγει, όπως σε κάθε κείμενο της εφαρμογής
    expect(g[a.r + 4][a.c]).not.toBe(4); expect(txt(g[a.r + 4][h1.c])).toBe('');   // ακριβώς 3 γραμμές
    expect(r.cols.map(c => c.f)).toEqual(['aa', 'col', 'col']); expect(r.cols[0].o).toBeUndefined();
    expect(r.cols[1].o).toEqual({ vals: ['Αθανάσιος'] }); expect(r.cols[2].o).toEqual({ vals: ['ok', 'x', 'ά'] });   // τα κελιά όπως τα έγραψες (τα κεφαλαία μπαίνουν όταν γράφεται)· οι κενές στο τέλος φεύγουν
  });
  it('χωρίς Α/Α και με στήλη χωρίς επικεφαλίδα: μόνο τα κελιά, η στήλη του πλέγματος ακολουθεί τη στήλη (όχι τη θέση στο φύλλο)', async () => {
    const { g } = await make(base({ cols: [{ f: 'col', h: 'Α', w: 'auto' }, { f: 'col', h: '', w: 'auto' }], grid: [['ένα', 'δύο'], ['τρία']] }), { pick: blankPick(2) });
    const a = firstAt(g, 'Α');
    expect([txt(g[a.r + 1][a.c]), txt(g[a.r + 1][a.c + 1]), txt(g[a.r + 2][a.c]), txt(g[a.r + 2][a.c + 1])]).toEqual(['ΕΝΑ', 'ΔΥΟ', 'ΤΡΙΑ', '']);
  });
  it('nrows μεγαλύτερο από το πλέγμα: οι υπόλοιπες γραμμές είναι αριθμημένες και κενές· το πλέγμα πέρα από τις nrows δεν βγαίνει', async () => {
    const { g, r } = await make(base({ grid: [['πρώτη', 'α']], nrows: 6 }), { pick: blankPick(6) });
    const a = firstAt(g, 'Α/Α'), h1 = firstAt(g, 'ΟΝΟΜΑ');
    expect(Array.from({ length: 7 }, (_, i) => g[a.r + i][a.c])).toEqual(['Α/Α', 1, 2, 3, 4, 5, 6]);
    expect(Array.from({ length: 6 }, (_, i) => txt(g[a.r + 1 + i][h1.c]))).toEqual(['ΠΡΩΤΗ', '', '', '', '', '']);
    expect(r.pick.n).toBe(6);
    const less = await make(base({ grid: [['α', '1'], ['β', '2'], ['γ', '3'], ['δ', '4']], nrows: 2 }), { pick: blankPick(2) });
    const a2 = firstAt(less.g, 'Α/Α'); expect(txt(less.g[a2.r + 2][a2.c + 1])).toBe('Β'); expect(less.g[a2.r + 3][a2.c]).not.toBe(3); expect(at(less.g, 'Γ')).toHaveLength(0);
  });
  it('μαζί με πίνακα τιμών και με δεύτερο πίνακα από κάτω: πρώτα το κενό, μετά ο δεύτερος (με άτομα), μετά οι τιμές', async () => {
    const o = base({ more: [{ id: 't2', title: 'ΔΕΥΤΕΡΟΣ', kind: 'people', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }] }] });
    const s = fakeState(40); const r0 = rep({ vals: VT }); const bo = forBuild(o, r0); const b = await buildTemplate(bo, 'blank');
    const r = withBuilt(r0, b, bo); r.more = r.more!.map(t => ({ ...t, pick: { ...defaultPick(), mode: 'first' as const, n: 4 } })); r.sigs = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }];
    const out = await fillReport(b.data, s, r, rowsOf(s, r, D).map(p => p.id), D, { clock }); const g = await grid(out.data);
    const h1 = firstAt(g, 'ΟΝΟΜΑ'), h2 = firstAt(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ'), v = firstAt(g, 'ΣΥΝΟΛΑ');
    expect(h1.r).toBeLessThan(h2.r); expect(h2.r).toBeLessThan(v.r);
    expect(txt(g[h1.r + 1][h1.c])).toBe('ΑΘΑΝΑΣΙΟΣ'); expect(txt(g[h1.r + 3][h1.c + 1])).toBe('Α');
    expect(g.slice(h2.r + 1, h2.r + 5).filter(row => txt(row[h2.c])).length).toBe(4);   // 4 άτομα στον 2ο
    expect(g[h2.r + 1][h2.c - 1]).toBe(1);
    expect(at(g, 'ΣΕ ΔΥΝΑΜΗ')).toHaveLength(1);
  });
  it('πίνακας τιμών δίπλα στο κενό (ίδια ζώνη) και ο τίτλος του 1ου πίνακα: ίδια γραμμή τίτλων· τα κελιά μένουν στη θέση τους', async () => {
    const { g } = await make(base({ t1: 'ΛΙΣΤΑ' }), { vals: VT, bands: [['main', 'v1']] });
    const t = firstAt(g, 'ΛΙΣΤΑ'), v = firstAt(g, 'ΣΥΝΟΛΑ'), h = firstAt(g, 'ΟΝΟΜΑ');
    expect(t.r).toBe(v.r); expect(t.c).toBeLessThan(v.c); expect(h.r).toBe(t.r + 1);
    expect(txt(g[h.r + 1][h.c])).toBe('ΑΘΑΝΑΣΙΟΣ');
  });
  it('χωρίς χωρισμό σε φύλλα: ούτε με split ανά θάλαμο βγαίνει παραπάνω από ένα φύλλο', async () => {
    const s = fakeState(40); const r0 = rep({ split: 'room' }); const bo = forBuild(base(), r0); const b = await buildTemplate(bo, 'blank'); const r = withBuilt(r0, b, bo);
    const out = await fillReport(b.data, s, r, rowsOf(s, r, D).map(p => p.id), D, { clock });
    expect(out.sheets).toHaveLength(1); expect(out.groups).toEqual([]);
    expect(splitOk('blank')).toBe(false); expect(groupsOf(s, 'blank', rowsOf(s, r, D), 'room')).toHaveLength(1);
  });
  it('σε έντυπο που δεν είναι «Κενό» το grid/nrows αγνοούνται: ίδιο πρότυπο, στήλες χωρίς o, γραμμές των ατόμων όπως πριν', async () => {
    const pc = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }];
    const o = (x: Partial<BuildOpts> = {}) => base({ cols: pc, grid: undefined, nrows: undefined, ...x });
    const a = await buildTemplate(o(), 'people'), b = await buildTemplate(o({ grid: GRID, nrows: 7 }), 'people');
    expect(await parts(b.data)).toEqual(await parts(a.data)); expect(b.cols).toEqual(a.cols);
    expect(a.cols.every(c => c.o === undefined)).toBe(true);
    const s = fakeState(40); const r0 = rep({ kind: 'people', pick: defaultPick(), sort: 'name' }); const r = withBuilt(r0, a, o()); r.sigs = [];
    expect(r.pick).toEqual(r0.pick);   // withBuilt δεν αγγίζει το pick των άλλων ειδών
    const ids = s.people.slice(0, 5).map(p => p.id); const g = await grid((await fillReport(a.data, s, r, ids, D, { clock })).data);
    const h = firstAt(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ'); expect(g.slice(h.r + 1, h.r + 6).map(row => txt(row[h.c])).every(Boolean)).toBe(true);
  });
});

describe('Έντυπα: «Κενό», καθαρή λογική', () => {
  it('είδος στη λίστα του «Τι αφορά» με τη βοήθεια που ζήτησε ο Michael· τα άτομα δεν μετράνε', () => {
    const k = REP_KINDS.find(x => x.id === 'blank')!; expect(k.label).toBe('Κενό'); expect(k.help).toMatch(/χωρίς άτομα/);
    expect(rowNoun('blank')).toBe('γραμμές'); expect(sortsOf('blank').map(x => x.value)).toEqual(['pick']);
  });
  it('blankN: προεπιλογή 10, ως 200, τουλάχιστον 1· οι γραμμές είναι όσες το pick.n και δεν εξαρτώνται από τους ανθρώπους', () => {
    expect(BLANK_ROWS).toBe(10); expect(BLANK_MAX).toBe(200);
    expect([blankN(undefined), blankN(500), blankN(-3), blankN(7.4), blankN('12')]).toEqual([10, 200, 1, 7, 12]);
    const s = fakeState(3); const none = { ...s, people: [] };
    for (const st of [s, none]) {
      expect(rowsOf(st, { kind: 'blank', pick: blankPick(25), sort: 'pick' }, D)).toHaveLength(25);
      expect(rowsOf(st, { kind: 'blank', pick: defaultPick(), sort: 'pick' }, D)).toHaveLength(10);
      expect(candidates(st, { kind: 'blank', pick: blankPick(999) }, D)).toHaveLength(200);
    }
    expect(rowsOf(s, { kind: 'blank', pick: blankPick(4), sort: 'pick' }, D).map(x => x.id)).toEqual([0, 1, 2, 3]);
    expect(pickText({ kind: 'blank', pick: blankPick(1) }, s)).toBe('1 γραμμή που γράφεις εσύ');
  });
  it('fieldValue: Α/Α, κεφαλαία χωρίς τόνους, κενό = null· άλλα στοιχεία δεν δίνουν τίποτα', () => {
    const s = fakeState(1); const row = rowsOf(s, { kind: 'blank', pick: blankPick(2), sort: 'pick' }, D)[1];
    expect(fieldValue(s, 'blank', row, 'aa', 1, D)).toBe(2);
    expect(fieldValue(s, 'blank', row, 'col', 1, D, undefined, { vals: ['x', ' ώρα  '] })).toBe('ΩΡΑ');
    expect(fieldValue(s, 'blank', row, 'col', 1, D, undefined, { vals: ['x', '  '] })).toBeNull();
    expect(fieldValue(s, 'blank', row, 'col', 5, D, undefined, { vals: ['x'] })).toBeNull(); expect(fieldValue(s, 'blank', row, 'col', 0, D)).toBeNull();
    expect(fieldValue(s, 'blank', row, 'name', 0, D)).toBeNull();
  });
  it('αλλαγή «Τι αφορά» από και προς το «Κενό»: το pick γίνεται 10 γραμμές χωρίς φίλτρα· πίσω, κανονικό pick και σειρά', () => {
    const pk = { ...defaultPick('random'), n: 57 };
    expect(pickForKind('people', pk, 'name', 'blank')).toEqual({ pick: { from: 'all', mode: 'all', n: 10 }, sort: 'pick' });
    const back = pickForKind('blank', blankPick(25), 'pick', 'people'); expect(back.sort).toBe('name'); expect(back.pick.mode).toBe('all'); expect(back.pick.from).toBe('all');
    expect(pickForKind('blank', blankPick(25), 'pick', 'cadre').sort).toBe('rank');
    expect(pickForKind('people', defaultPick(), 'room', 'people').sort).toBe('room');   // τα υπόλοιπα όπως πριν
  });
  it('withBuilt: στο «Κενό» οι nrows ορίζουν τις γραμμές του pick· χωρίς nrows μένει όπως είναι', async () => {
    const b = await buildTemplate(base({ nrows: 12 }), 'blank');
    expect(withBuilt(rep({ pick: blankPick(3) }), b, base({ nrows: 12 })).pick).toEqual(blankPick(12));
    expect(withBuilt(rep({ pick: blankPick(3) }), b, base({ nrows: undefined })).pick).toEqual(blankPick(3));
  });
  it('regrid: το πλέγμα ακολουθεί τις στήλες όταν μετακινούνται, βγαίνουν ή μπαίνουν· το Α/Α δεν έχει στήλη', () => {
    const A = { f: 'aa' }, C = { f: 'col' }; const g = [['a1', 'b1', 'c1'], ['a2', '', 'c2'], ['', '', '']];
    const was = [A, C, C, C];
    expect(regrid(g, was, was)).toBe(g);   // ίδιες στήλες: το ίδιο πλέγμα
    expect(regrid(g, was, [A, C, C, C], [0, 2, 1, 3])).toEqual([['b1', 'a1', 'c1'], ['', 'a2', 'c2']]);   // μετακίνηση, οι κενές γραμμές στο τέλος φεύγουν
    expect(regrid(g, was, [A, C, C], [0, 1, 3])).toEqual([['a1', 'c1'], ['a2', 'c2']]);   // βγήκε η 2η
    expect(regrid(g, was, [A, C, C, C, C], [0, 1, 2, 3, -1])).toEqual([['a1', 'b1', 'c1', ''], ['a2', '', 'c2', '']]);   // νέα στήλη στο τέλος
    expect(regrid(g, was, [C, C, C, C], [0, 1, 2, 3])).toEqual([['', 'a1', 'b1', 'c1'], ['', 'a2', '', 'c2']]);   // το Α/Α έγινε στήλη: πρώτη, κενή
    expect(regrid(g, was, [A, A, C, C])).toEqual([['b1', 'c1'], ['', 'c2']]);   // αλλαγή στοιχείου χωρίς μετακίνηση: μένουν οι στήλες που ήταν στις ίδιες θέσεις
    expect(regrid(undefined, was, [A, C, C])).toEqual([]);
  });
});
