// Έντυπα (Michael, 30/10): «Κενός πίνακας», άτομο ανά γραμμή (Report.who) με τα στοιχεία του στις στήλες
import { describe, it, expect } from 'vitest';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport } from '../src/main/reports';
import { FIELDS, defaultPick, fieldOf, fieldValue, forBuild, rowsOf, whoC, whoOf, whoP, withBuilt, type BuildOpts, type BuildTable, type Report } from '../src/shared/reports';
import type { Cadre } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-19', clock = { today: D, now: 12 * 60 };
const blankPick = (n: number) => ({ from: 'all' as const, mode: 'all' as const, n });
const rep = (x: Partial<Report> = {}): Report => ({ id: 'r1', name: 'Κενό', tpl: 't1', kind: 'blank', sheet: '', head: 1, cols: [], cells: [], pick: blankPick(4), sort: 'pick', day: 'today', out: 'file', ...x });
const CAD: Cadre = { id: 'k1', rank: 'ΑΝΘΣΤΗΣ', hk: 'x', last: 'ΣΤΕΛΕΧΟΣ', first: 'ΑΛΕΞΗΣ', spec: 'ΜΧ', am: 'ΑΜ123', phone: '6911111111', role: 'ΔΙΟΙΚΗΤΗΣ', active: true };
const col = (f: string, h: string) => ({ f, h, w: 'auto' as const });
const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, col('rank', 'ΒΑΘΜΟΣ'), col('name', 'ΟΝΟΜΑ'), col('asm', 'ΑΣΜ'), col('col', 'ΣΗΜΕΙΩΣΗ')];
const base = (x: Partial<BuildOpts> = {}): BuildOpts => ({ title: 'ΚΕΝΟ', head: true, date: true, sig: 'none', land: false, sz: 12, fill: 'gray', cols, nrows: 4, ...x });
const state = () => { const s = fakeState(40); s.cadreList = [CAD]; return s; };
const grid = async (data: Buffer | Uint8Array) => { const wb = await Workbook.open(data); return wb.values(wb.sheetNames()[0], 200, 40); };
const at = (g: unknown[][], text: string) => g.flatMap((row, r) => row.map((v, c) => (v === text ? { r, c } : null)).filter(Boolean) as { r: number; c: number }[]);
const txt = (v: unknown) => String(v ?? '');
async function make(o: BuildOpts, x: Partial<Report> = {}) {
  const s = state(); const r0 = rep(x); const bo = forBuild(o, r0); const b = await buildTemplate(bo, r0.kind);
  const r = withBuilt(r0, b, bo); r.sigs = [];
  const out = await fillReport(b.data, s, r, rowsOf(s, r, D).map(p => p.id), D, { clock });
  return { s, r, b, out, g: await grid(out.data) };
}
// οι γραμμές του πίνακα με επικεφαλίδα h (πρώτο κελί της κεφαλίδας), n γραμμές
const rowsAt = (g: unknown[][], h: string, n = 4) => { const a = at(g, h)[0]; expect(a, h).toBeTruthy(); return Array.from({ length: n }, (_, i) => Array.from({ length: 5 }, (_, j) => txt(g[a.r + 1 + i]?.[a.c - 1 + j]))); };

describe('Έντυπα: «Κενός πίνακας», άτομο ανά γραμμή', () => {
  it('γραμμή με στρατιώτη: βαθμός, ονοματεπώνυμο και ΑΣΜ γεμίζουν μόνα τους, η στήλη «Στήλη» μένει κενή· και γραμμή με στέλεχος', async () => {
    const s = state(); const p = s.people[2];
    const { g, r } = await make(base({ who: [whoP(p.id), whoC('k1')] }));
    const rows = rowsAt(g, 'ΒΑΘΜΟΣ');
    expect(rows[0]).toEqual(['1', 'ΣΤΡ', fieldValue(s, 'people', p, 'name', 0, D) as string, p.asm, '']);
    expect(rows[1].slice(0, 3)).toEqual(['2', 'ΑΝΘΣΤΗΣ', 'ΣΤΕΛΕΧΟΣ ΑΛΕΞΗΣ']);
    expect(rows[1][3]).toBe('');   // ΑΣΜ: το στέλεχος δεν έχει
    expect(rows[2].slice(1)).toEqual(['', '', '', '']);   // γραμμή χωρίς άτομο: κενή (Α/Α μένει)
    expect(r.who).toEqual([whoP(p.id), whoC('k1')]);
  });
  it('στέλεχος σε στοιχείο που έχουν και οι δύο (τηλέφωνο, θέση) και στο δικό του (ΑΜ)· στρατιώτης στο ΑΜ: κενό', () => {
    const s = state(); const row = (ref: string) => ({ id: 0, bw: whoOf(s, ref) }) as never;
    expect(fieldValue(s, 'blank', row('c:k1'), 'phone', 0, D)).toBe('6911111111'); expect(fieldValue(s, 'blank', row('c:k1'), 'am', 0, D)).toBe('ΑΜ123');
    expect(fieldValue(s, 'blank', row('c:k1'), 'role', 0, D)).toBe('ΔΙΟΙΚΗΤΗΣ'); expect(fieldValue(s, 'blank', row('p:3'), 'am', 0, D)).toBeNull();
    expect(fieldValue(s, 'blank', row('c:k1'), 'room', 0, D)).toBeNull();
    expect(fieldOf('blank', 'asm')).toBeTruthy(); expect(fieldOf('blank', 'am')).toBeTruthy(); expect(FIELDS.blank.filter(f => ['combo', 'blank', 'text'].includes(f.k))).toHaveLength(0);
    expect(new Set(FIELDS.blank.map(f => f.k)).size).toBe(FIELDS.blank.length);   // κανένα κλειδί δεν επαναλαμβάνεται
  });
  it('ό,τι γράφεις στο κελί νικά, με κεφαλαία· {ΕΤΙΚΕΤΑ} στο κελί δουλεύει όπως πριν', async () => {
    const s = state(); const p = s.people[0];
    const o = base({ who: [whoP(p.id), whoP(p.id)], grid: [['', 'δικό μου', '', 'x'], ['', '', '', '{ΗΜΕΡΟΜΗΝΙΑ}']] });
    const { g } = await make(o);
    const rows = rowsAt(g, 'ΒΑΘΜΟΣ');
    expect(rows[0]).toEqual(['1', p.rank === 'ΣΤΡ' ? 'ΣΤΡ' : 'ΔΝΕΑΣ', 'ΔΙΚΟ ΜΟΥ', p.asm, 'X']);   // το όνομα γράφτηκε με το χέρι, ο βαθμός και ο ΑΣΜ από το άτομο
    expect(rows[1][4]).toBe('19/10/2026');
  });
  it('σβησμένο άτομο: κενή γραμμή (χωρίς σφάλμα)· κενή γραμμή και η γραμμή χωρίς άτομο', async () => {
    const { g } = await make(base({ who: [whoP(9999), whoC('xx'), null, 'λάθος'] }));
    expect(rowsAt(g, 'ΒΑΘΜΟΣ').map(r => r.slice(1))).toEqual([['', '', '', ''], ['', '', '', ''], ['', '', '', ''], ['', '', '', '']]);
  });
  it('πίνακας 2 κενός με άτομα (BuildTable.who → RepTable.who)', async () => {
    const s = state(); const p = s.people[4];
    const t2: BuildTable = { id: 't2', title: 'ΔΕΥΤΕΡΟΣ', kind: 'blank', cols, nrows: 2, who: [null, whoP(p.id)] };
    const { g, r } = await make(base({ more: [t2] }), { kind: 'people', pick: { ...defaultPick(), mode: 'first', n: 1 }, sort: 'name' });
    expect(r.more![0].who).toEqual([null, whoP(p.id)]);
    const heads = at(g, 'ΒΑΘΜΟΣ'); expect(heads).toHaveLength(2);
    const a = heads[1]; expect([g[a.r + 1][a.c + 1], g[a.r + 2][a.c + 1], g[a.r + 2][a.c + 2]].map(txt)).toEqual(['', fieldValue(s, 'people', p, 'name', 0, D) as string, p.asm]);
    expect(r.who).toBeUndefined();
  });
  it('σωσμένο έντυπο χωρίς build options: το who του Report τυπώνει τα άτομα', async () => {
    const s = state(); const p = s.people[1];
    const { b, r } = await make(base({ who: [null, whoP(p.id)] }));
    const saved: Report = JSON.parse(JSON.stringify(r));   // όπως φορτώνεται από τις ρυθμίσεις
    const out = await fillReport(b.data, s, saved, rowsOf(s, saved, D).map(x => x.id), D, { clock });
    const rows = rowsAt(await grid(out.data), 'ΒΑΘΜΟΣ');
    expect(rows[1].slice(2)).toEqual([fieldValue(s, 'people', p, 'name', 0, D) as string, p.asm, '']); expect(rows[0].slice(1)).toEqual(['', '', '', '']);
  });
  it('whoCut: μόνο μέσα στις γραμμές, χωρίς κενά στο τέλος· χωρίς άτομα δεν μπαίνει καθόλου (προεπιλογή όπως πριν)', async () => {
    const { r } = await make(base({ who: [whoP(1), null, whoP(2), whoP(3)], nrows: 3 }), { pick: blankPick(3) });
    expect(r.who).toEqual([whoP(1), null, whoP(2)]);
    expect((await make(base({ who: [null, null] }))).r.who).toBeUndefined();
    const plain = await make(base()); expect('who' in plain.r).toBe(false);
    // αλλαγή είδους: το who δεν σέρνεται σε άλλο είδος
    const s = state(); const r0 = rep({ kind: 'people', who: [whoP(1)], pick: defaultPick() }); const bo = forBuild(base({ cols: [cols[0], col('name', 'ΟΝΟΜΑ')], who: [whoP(1)] }), r0);
    expect('who' in withBuilt(r0, await buildTemplate(bo, 'people'), bo)).toBe(false); expect(s).toBeTruthy();
  });
  it('προεπιλογή αμετάβλητη: δύο στήλες «Στήλη» χωρίς άτομο βγάζουν ίδιο αρχείο με και χωρίς το πεδίο who', async () => {
    const o = base({ cols: [cols[0], col('col', 'Α'), col('col', 'Β')], grid: [['x', 'y']] });
    const a = await make(o); const b = await make({ ...o, who: undefined });
    expect(Buffer.compare(a.b.data, b.b.data)).toBe(0); expect(a.g).toEqual(b.g);
    expect(a.g.flat().filter(v => v === 'X' || v === 'Y')).toHaveLength(2);
  });
});
