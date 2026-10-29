// Έντυπα (Michael, 29/10): «Κενός πίνακας» και στους πίνακες 2…6, με δικές του γραμμές και κελιά
import { describe, it, expect } from 'vitest';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport } from '../src/main/reports';
import { BLANK_ROWS, blankN, colsForKind, defaultPick, forBuild, moreRows, pickForKind, retypeTable, rowsOf, subPick, switchCols, withBuilt, type BuildOpts, type BuildTable, type Report } from '../src/shared/reports';
import { fakeState } from './fixtures';

const D = '2026-10-19', clock = { today: D, now: 12 * 60 };
const pc = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }];
const bcols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'col', h: 'ΕΙΔΟΣ', w: 'auto' as const }, { f: 'col', h: 'ΠΟΣΟΤΗΤΑ', w: 'auto' as const }];
const BT = (x: Partial<BuildTable> = {}): BuildTable => ({ id: 't2', title: 'ΥΛΙΚΑ', kind: 'blank', cols: bcols, grid: [['ψωμί', '3'], ['', '{ΠΑΡΟΝΤΕΣ}'], ['νερό']], nrows: 4, ...x });
const base = (x: Partial<BuildOpts> = {}): BuildOpts => ({ title: 'ΔΟΚΙΜΗ', head: true, date: true, sig: 'none', land: false, sz: 12, fill: 'gray', cols: pc, more: [BT()], ...x });
const rep = (x: Partial<Report> = {}): Report => ({ id: 'r1', name: 'Δοκιμή', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: { ...defaultPick(), mode: 'first', n: 5 }, sort: 'name', day: 'today', out: 'file', ...x });
const grid = async (data: Buffer | Uint8Array) => { const wb = await Workbook.open(data); return wb.values(wb.sheetNames()[0], 200, 40); };
const at = (g: unknown[][], text: string) => g.flatMap((row, r) => row.map((v, c) => (v === text ? { r, c } : null)).filter(Boolean) as { r: number; c: number }[]);
async function make(o: BuildOpts, x: Partial<Report> = {}) {
  const s = fakeState(40); const r0 = rep(x); const bo = forBuild(o, r0); const b = await buildTemplate(bo, r0.kind);
  const r = withBuilt(r0, b, bo); r.sigs = [];
  const out = await fillReport(b.data, s, r, rowsOf(s, r, D).map(p => p.id), D, { clock });
  return { s, r, b, out, g: await grid(out.data) };
}

describe('Έντυπα: «Κενός πίνακας» ως πίνακας 2…6', () => {
  it('2ος πίνακας κενός: τα κελιά που έγραψες, οι γραμμές του (nrows), κενά κελιά κενά· ο 1ος πίνακας όπως πριν', async () => {
    const { g, r } = await make(base());
    const h = at(g, 'ΕΙΔΟΣ')[0]; expect(h).toBeTruthy(); expect(at(g, 'ΠΟΣΟΤΗΤΑ')[0].r).toBe(h.r); expect(at(g, 'ΥΛΙΚΑ')[0].r).toBe(h.r - 1);   // ο τίτλος του πίνακα από πάνω
    const cell = (i: number, j: number) => g[h.r + 1 + i][h.c + j];
    expect([cell(0, 0), cell(0, 1)]).toEqual(['ΨΩΜΙ', '3']);   // κείμενο με κεφαλαία, αριθμός όπως γράφτηκε (κείμενο)
    expect([cell(1, 0) ?? null, typeof cell(1, 1)]).toEqual([null, 'number']);   // {ΠΑΡΟΝΤΕΣ}: αριθμός
    expect([cell(2, 0), cell(2, 1) ?? null]).toEqual(['ΝΕΡΟ', null]);
    expect(g[h.r + 1][h.c - 1]).toBe(1); expect(g[h.r + 4][h.c - 1]).toBe(4); expect(g[h.r + 5]?.[h.c - 1] ?? null).not.toBe(5);   // Α/Α 1..4, ακριβώς 4 γραμμές
    expect(r.more).toHaveLength(1); expect(r.more![0].kind).toBe('blank'); expect(r.more![0].pick).toMatchObject({ mode: 'all', n: 4 });
    expect(r.more![0].cols.map(c => c.f)).toEqual(['aa', 'col', 'col']); expect(r.more![0].cols[1].o).toEqual({ vals: ['ψωμί', '', 'νερό'] }); expect(r.more![0].cols[2].o).toEqual({ vals: ['3', '{ΠΑΡΟΝΤΕΣ}'] });
    const m = at(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ')[0]; expect(m.r).toBeLessThan(h.r);   // ο 1ος πίνακας (άτομα) από πάνω, με 5 άτομα
    expect(g.slice(m.r + 1, m.r + 7).filter(row => row[m.c]).length).toBe(5);
  });
  it('ξεχωριστός αριθμός γραμμών ανά πίνακα· πολλοί κενοί πίνακες μαζί (και ο 1ος κενός)', async () => {
    const o = base({ cols: bcols, grid: [['α', 'β']], nrows: 2, more: [BT({ id: 'a', title: 'ΕΝΑΣ', nrows: 3, grid: [['x']] }), BT({ id: 'b', title: 'ΔΥΟ', nrows: 1, grid: [['y']] })] });
    const { g, r } = await make(o, { kind: 'blank', pick: { from: 'all', mode: 'all', n: 2 }, sort: 'pick' });
    expect(r.pick.n).toBe(2); expect(r.more!.map(t => t.pick.n)).toEqual([3, 1]);
    const heads = at(g, 'ΕΙΔΟΣ'); expect(heads).toHaveLength(3);   // ο 1ος και οι δύο που προστέθηκαν, ο καθένας με τις γραμμές του
    const rowsOf3 = heads.map((h, k) => { let n = 0; while (typeof g[h.r + 1 + n]?.[h.c - 1] === 'number' && (n < 1 || (g[h.r + 1 + n][h.c - 1] as number) === n + 1)) n++; return n; });
    expect(rowsOf3).toEqual([2, 3, 1]);
    expect([g[heads[0].r + 1][heads[0].c], g[heads[1].r + 1][heads[1].c], g[heads[2].r + 1][heads[2].c]]).toEqual(['Α', 'X', 'Y']);
  }, 20000);
  it('moreRows: οι γραμμές του κενού πίνακα 2 είναι όσες το pick.n, χωρίς άτομα, ανεξάρτητα από τα φίλτρα· υποπίνακας δεν γίνεται ποτέ τυχαίος', () => {
    const s = fakeState(40); const r = rep({ more: [{ id: 't2', kind: 'blank', head: 1, cols: [], pick: { from: 'all', mode: 'all', n: 7 }, sort: 'pick' }] });
    expect(moreRows(s, r, D)[0].map(x => x.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(subPick({ from: 'all', mode: 'all', n: 7 })).toEqual({ from: 'all', mode: 'all', n: 7 });
    expect(blankN(undefined)).toBe(BLANK_ROWS);
  });
  it('με χωρισμό σε φύλλα ανά θάλαμο: ο κενός πίνακας 2 μπαίνει σε κάθε φύλλο (δεν φτιάχνει φύλλο «χωρίς θάλαμο»)', async () => {
    const s = fakeState(40); const r0 = rep({ pick: { ...defaultPick(), mode: 'all' }, split: 'room' }); const bo = forBuild(base(), r0); const b = await buildTemplate(bo, 'people');
    const r = withBuilt(r0, b, bo); r.sigs = [];
    const plain = await fillReport(b.data, s, { ...r, split: 'none' }, rowsOf(s, r, D).map(p => p.id), D, { clock });
    const out = await fillReport(b.data, s, r, rowsOf(s, r, D).map(p => p.id), D, { clock });
    expect(out.sheets.length).toBeGreaterThan(1); expect(out.groups.some(g => g.key === '~')).toBe(false);
    const wb = await Workbook.open(out.data);
    for (const n of out.sheets) { const v = await wb.values(n, 200, 40); expect(at(v, 'ΨΩΜΙ')).toHaveLength(1); }
    expect(plain.sheets).toHaveLength(1);
  });
  it('αλλαγή είδους πίνακα 2: προς το κενό 10 γραμμές χωρίς πλέγμα και στήλες Α/Α + 2· πίσω στα άτομα βαθμός και ονοματεπώνυμο· τα κελιά δεν σέρνονται', () => {
    const t: BuildTable = BT();
    const blank = retypeTable({ id: 'x', title: 'Τ', kind: 'people', cols: [...pc, { f: 'asm', h: 'ΑΣΜ', w: 'auto' }] }, 'blank');
    expect(blank.kind).toBe('blank'); expect(blank.nrows).toBe(BLANK_ROWS); expect(blank.grid).toBeUndefined(); expect(blank.cols.map(c => c.f)).toEqual(['aa', 'col', 'col']); expect(blank.cols.map(c => c.h)).toEqual(['Α/Α', 'ΣΤΗΛΗ 1', 'ΣΤΗΛΗ 2']); expect(blank.title).toBe('Τ');
    const back = retypeTable(t, 'people');
    expect(back.kind).toBe('people'); expect(back.grid).toBeUndefined(); expect(back.nrows).toBeUndefined(); expect(back.cols.map(c => c.f)).toEqual(['aa', 'rank', 'name']);
    expect(retypeTable(t, 'cadre').cols.map(c => c.f)).toEqual(['aa', 'rank', 'name']);
    const st = retypeTable(t, 'status'); expect(st.cols.map(c => c.f)).toEqual(['aa', 'stype', 'from', 'to']);   // οι βασικές στήλες του είδους
    expect(switchCols(pc, 'people', 'cadre').map(c => c.f)).toEqual(['aa', 'name']);   // από άλλο είδος: όπως πριν, χωρίς πρόσθετες
    expect(colsForKind(bcols, 'blank')).toEqual(bcols);
  });
  it('pick του πίνακα: από και προς το κενό όπως στον 1ο (10 γραμμές χωρίς φίλτρα· πίσω κανονικό)', () => {
    expect(pickForKind('people', defaultPick(), 'name', 'blank')).toEqual({ pick: { from: 'all', mode: 'all', n: 10 }, sort: 'pick' });
    expect(pickForKind('blank', { from: 'all', mode: 'all', n: 4 }, 'pick', 'status').sort).toBe('name'); expect(pickForKind('blank', { from: 'all', mode: 'all', n: 4 }, 'pick', 'cadre').sort).toBe('rank');
  });
  it('φτιαγμένο πρότυπο χωρίς κενούς πίνακες 2…6: ίδιο πρότυπο όπως πριν (grid/nrows μόνο σε kind blank)', async () => {
    const t2: BuildTable = { id: 't2', title: 'ΑΛΛΟΣ', kind: 'people', cols: pc };
    const a = await buildTemplate(base({ more: [t2] }), 'people'); const b = await buildTemplate(base({ more: [{ ...t2, grid: [['x']], nrows: 9 }] }), 'people');
    expect(a.cols).toEqual(b.cols); expect(a.more).toEqual(b.more); expect(Buffer.compare(a.data, b.data)).toBe(0);
  });
});
