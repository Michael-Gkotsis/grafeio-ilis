// Έντυπα (Michael, 31/10): «Κενός πίνακας», γραμμές από φίλτρο (src) και δικές σου γραμμές από κάτω
import { describe, it, expect } from 'vitest';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport } from '../src/main/reports';
import { defaultPick, fieldValue, forBuild, pickText, rowsOf, whoP, withBuilt, type BuildOpts, type BuildTable, type RepPick, type Report } from '../src/shared/reports';
import type { Cadre, Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-29', clock = { today: D, now: 12 * 60 };
const st = (id: string, pid: number, type: Status['type'], from: string, to: string): Status => ({ id, pid, type, from, to });
const cad = (id: string, last: string, active = true): Cadre => ({ id, rank: 'ΑΝΘΣΤΗΣ', hk: 'x', last, first: 'ΑΛΕΞΗΣ', phone: '69' + id, active });
const col = (f: string, h: string) => ({ f, h, w: 'auto' as const });
const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, col('rank', 'ΒΑΘΜΟΣ'), col('name', 'ΟΝΟΜΑ'), col('smed', 'ΙΑΤΡΙΚΟ'), col('col', 'ΣΗΜΕΙΩΣΗ')];
const base = (x: Partial<BuildOpts> = {}): BuildOpts => ({ title: 'ΚΕΝΟ', head: true, date: true, sig: 'none', land: false, sz: 12, fill: 'gray', cols, nrows: 2, src: 'people', ...x });
const MED: RepPick = { ...defaultPick(), need: ['med'], stNew: true };   // «Με ιατρικό» + μόνο όσα ξεκινούν τη μέρα
const state = () => {
  const s = fakeState(12); s.cadreList = [cad('k1', 'ΑΛΦΑ'), cad('k2', 'ΒΗΤΑ'), cad('k3', 'ΓΑΜΜΑ', false)];
  s.statuses = [st('a', 3, 'EY', D, '2026-10-30'), st('b', 5, 'EA', '2026-10-27', '2026-10-30')];   // ο 3 ξεκινά σήμερα, ο 5 από πριν
  return s;
};
const rep = (x: Partial<Report> = {}): Report => ({ id: 'r1', name: 'Κενό', tpl: 't1', kind: 'blank', sheet: '', head: 1, cols: [], cells: [], pick: { from: 'all', mode: 'all', n: 2 }, sort: 'pick', day: 'today', out: 'file', ...x });
const grid = async (data: Buffer | Uint8Array) => { const wb = await Workbook.open(data); return wb.values(wb.sheetNames()[0], 200, 40); };
const at = (g: unknown[][], text: string) => g.flatMap((row, r) => row.map((v, c) => (v === text ? { r, c } : null)).filter(Boolean) as { r: number; c: number }[]);
const txt = (v: unknown) => String(v ?? '');
async function make(o: BuildOpts, x: Partial<Report> = {}, s = state()) {
  const r0 = rep(x); const bo = forBuild(o, r0); const b = await buildTemplate(bo, r0.kind);
  const r = withBuilt(r0, b, bo); r.sigs = [];
  const out = await fillReport(b.data, s, r, rowsOf(s, r, D).map(p => p.id), D, { clock });
  return { s, r, b, out, g: await grid(out.data) };
}
// γραμμές ενός πίνακα με επικεφαλίδα h: [Α/Α, βαθμός, όνομα, ιατρικό, σημείωση]
const rowsAt = (g: unknown[][], h: string, n: number, k = 0) => { const a = at(g, h)[k]; expect(a, h).toBeTruthy(); return Array.from({ length: n }, (_, i) => Array.from({ length: 5 }, (_, j) => txt(g[a.r + 1 + i]?.[a.c - 1 + j]))); };

describe('Έντυπα: «Κενός πίνακας», γραμμές από φίλτρο', () => {
  it('στρατιώτες «Με ιατρικό» + stNew: μόνο όποιος έχει ΕΥ από σήμερα, μετά 2 δικές σου γραμμές, Α/Α 1..3· οι ιατρικές στήλες ακολουθούν το stNew', async () => {
    const s = state(); const p = s.people[2];
    const { g, r } = await make(base({ grid: [['', '', '', 'η πρώτη'], ['', '', '', 'η δεύτερη']] }), { pick: { ...MED, n: 2 } });
    const rows = rowsAt(g, 'ΒΑΘΜΟΣ', 4);
    expect(rows[0]).toEqual(['1', 'ΣΤΡ', fieldValue(s, 'people', p, 'name', 0, D) as string, 'ΕΥ', '']);
    expect(rows[1]).toEqual(['2', '', '', '', 'Η ΠΡΩΤΗ']); expect(rows[2]).toEqual(['3', '', '', '', 'Η ΔΕΥΤΕΡΗ']);
    expect(rows[3][0]).not.toBe('4');   // ακριβώς 3 γραμμές
    expect(r.src).toBe('people'); expect(r.pick).toMatchObject({ mode: 'all', n: 2, need: ['med'], stNew: true });
    expect(rowsOf(s, r, D).map(x => x.id)).toEqual([0, 1, 2]);
  });
  it('στελέχη: όλα τα ενεργά από κάτω από τα φίλτρα τους, με τα στοιχεία τους στις στήλες (χωρίς το ανενεργό)', async () => {
    const { g } = await make(base({ src: 'cadre', cols: [cols[0], col('rank', 'ΒΑΘΜΟΣ'), col('name', 'ΟΝΟΜΑ'), col('phone', 'ΤΗΛ'), col('col', 'ΣΗΜΕΙΩΣΗ')], nrows: 1 }), { pick: { from: 'all', mode: 'all', n: 1 } });
    const rows = rowsAt(g, 'ΒΑΘΜΟΣ', 4);
    expect(rows[0].slice(0, 4)).toEqual(['1', 'ΑΝΘΣΤΗΣ', 'ΑΛΦΑ ΑΛΕΞΗΣ', '69K1']); expect(rows[1].slice(0, 4)).toEqual(['2', 'ΑΝΘΣΤΗΣ', 'ΒΗΤΑ ΑΛΕΞΗΣ', '69K2']);
    expect(rows[2].slice(1)).toEqual(['', '', '', '']); expect(rows[2][0]).toBe('3');   // η δική σου γραμμή
    expect(rows[3][0]).not.toBe('4');
  });
  it('στήλες με στοιχεία γεμίζουν στις γραμμές από φίλτρο, η ελεύθερη στήλη μένει κενή (και ό,τι έγραψες πάει στις δικές σου γραμμές, όχι στις πρώτες)', async () => {
    const s = state();
    const { g } = await make(base({ grid: [['', '', '', 'δική μου']], nrows: 1, who: [whoP(7)] }), { pick: { ...defaultPick(), need: ['med'], n: 1 } });   // χωρίς stNew: οι 3 και 5
    const rows = rowsAt(g, 'ΒΑΘΜΟΣ', 4);
    expect(rows.slice(0, 2).map(x => x[4])).toEqual(['', '']); expect(rows.slice(0, 2).map(x => x[3])).toEqual(['ΕΑ', 'ΕΥ']);
    expect(rows[2]).toEqual(['3', 'ΣΤΡ', fieldValue(s, 'people', s.people[6], 'name', 0, D) as string, '', 'ΔΙΚΗ ΜΟΥ']);   // η δική σου γραμμή με άτομο (who) και κελί
  });
  it('nrows 0: μόνο οι γραμμές από φίλτρο· το pick.n είναι 0 και το κείμενο της λίστας το λέει', async () => {
    const { g, r } = await make(base({ nrows: 0 }), { pick: { ...MED, n: 0 } });
    const rows = rowsAt(g, 'ΒΑΘΜΟΣ', 2); expect(rows[0][0]).toBe('1'); expect(rows[1][0]).not.toBe('2');
    expect(r.pick.n).toBe(0); expect(rowsOf(state(), r, D)).toHaveLength(1);
    expect(pickText(r, state())).toBe('Στρατιώτες από φίλτρο');
    expect(pickText({ ...r, pick: { ...r.pick, n: 3 } }, state())).toBe('Στρατιώτες από φίλτρο και 3 γραμμές που γράφεις εσύ');
  });
  it('πίνακας 2 με src (BuildTable.src → RepTable.src), δικό του pick· ο 1ος πίνακας (άτομα) όπως πριν', async () => {
    const t2: BuildTable = { id: 't2', title: 'ΙΑΤΡΙΚΑ', kind: 'blank', cols, nrows: 1, src: 'people', grid: [['', '', '', 'χέρι']] };
    const s = state(); const r0 = rep({ kind: 'people', pick: { ...defaultPick(), mode: 'first', n: 2 }, sort: 'name' });
    const bo = forBuild(base({ cols: [cols[0], col('name', 'ΟΝΟΜΑ')], src: undefined, more: [t2] }), r0); const b = await buildTemplate(bo, 'people');
    const r = withBuilt(r0, b, bo); r.sigs = []; r.more = r.more!.map(t => ({ ...t, pick: { ...MED, n: 1 } }));
    expect(r.more![0].src).toBe('people'); expect(r.src).toBeUndefined();
    const out = await fillReport(b.data, s, r, rowsOf(s, r, D).map(p => p.id), D, { clock });
    const g = await grid(out.data); const rows = rowsAt(g, 'ΒΑΘΜΟΣ', 3);
    expect(rows[0].slice(0, 4)).toEqual(['1', 'ΣΤΡ', fieldValue(s, 'people', s.people[2], 'name', 0, D) as string, 'ΕΥ']);
    expect(rows[1]).toEqual(['2', '', '', '', 'ΧΕΡΙ']); expect(rows[2][0]).not.toBe('3');
    expect(at(g, 'ΟΝΟΜΑ').length).toBe(2);   // ο 1ος πίνακας με τα άτομα του
  });
  it('χωρίς src όλα όπως πριν: ίδιες γραμμές (0..n-1), το πεδίο δεν μπαίνει στο έντυπο και το αρχείο είναι το ίδιο', async () => {
    const o = base({ src: undefined, grid: [['', '', '', 'α']], nrows: 3 });
    const a = await make(o, { pick: { from: 'all', mode: 'all', n: 3 } }); const b = await make({ ...o, src: undefined, who: undefined }, { pick: { from: 'all', mode: 'all', n: 3 } });
    expect('src' in a.r).toBe(false); expect(rowsOf(a.s, a.r, D).map(x => x.id)).toEqual([0, 1, 2]); expect(Buffer.compare(a.b.data, b.b.data)).toBe(0); expect(a.g).toEqual(b.g);
    expect(rowsAt(a.g, 'ΒΑΘΜΟΣ', 3).map(x => x[0])).toEqual(['1', '2', '3']); expect(pickText(a.r, a.s)).toBe('3 γραμμές που γράφεις εσύ');
    // όταν κλείνει το src η nrows ξαναγίνεται τουλάχιστον 1
    expect(withBuilt(rep(), a.b, base({ src: undefined, nrows: 0 })).pick.n).toBe(10);
  }, 20000);
});
