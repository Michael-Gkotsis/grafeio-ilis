// Επεξεργασία υπηρεσιών και πολλά άτομα ανά νούμερο (Michael, 4/11)
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Ctx } from '../src/shared/commands';
import { fillFroura } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { blockShape, blocksOf, buildPosts, everyBlock, shiftGroups, type AppState, type BlockDef } from '../src/shared/domain';
import { frouraLayout, frouraTables } from '../src/shared/froura';
import { postsOf } from '../src/shared/rules';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let seq = 0;
const D = '2026-10-12';
const ctx: Ctx = { today: D, newId: () => 'x' + ++seq };
const run = (s: AppState, cmd: any) => apply(s, cmd, ctx).state;
const blk = (s: AppState, ph: 'sven' | 'spen', id: string): BlockDef => blocksOf(s.settings, ph).find(b => b.id === id)!;
const vis = (b: BlockDef) => b.posts.filter(p => !p.hidden);
const spen = () => run(fakeState(60), { t: 'setPhase', phase: 'spen' });
const edit = (s: AppState, ph: 'sven' | 'spen', id: string, patch: object) => run(s, { t: 'editBlock', phase: ph, id, name: '', hrs: {}, ...patch });

describe('σχήμα υπηρεσίας: νούμερα × άτομα', () => {
  it('οι σκοποί είναι 2 νούμερα × 2 και οι θαλαμοφύλακες 4 × 1', () => {
    const s = spen();
    expect(blockShape(blk(s, 'spen', 'sk'))).toEqual({ nums: 2, per: 2 });
    expect(blockShape(blk(s, 'spen', 'th'))).toEqual({ nums: 4, per: 1 });
  });
  it('θαλαμοφύλακες: 5ο νούμερο, νέο κλειδί, βάρδιες κάθε 2 ώρες· πίσω στα 4 το κρύβει και ξαναβγαίνει το ίδιο', () => {
    const s0 = spen(); const s1 = edit(s0, 'spen', 'th', { nums: 5 });
    const b = blk(s1, 'spen', 'th');
    expect(vis(b).map(p => p.k)).toEqual(['th1', 'th2', 'th3', 'th4', 'th_5']);
    expect(vis(b)[4]).toMatchObject({ rot: 4, label: 'Θαλαμοφύλακας 5ος', short: '5ος' });
    expect(b.shift).toEqual({ every: 120 });
    const slots = buildPosts([b]).map(p => p.slots);
    expect(slots.every(x => x && x.length >= 2)).toBe(true);
    expect(vis(b)[0].code).toBe('Θ1');
    expect(vis(b)[4].code).toBeTruthy();
    // κρύβεται, δεν σβήνεται
    const s2 = edit(s1, 'spen', 'th', { nums: 4 });
    expect(blk(s2, 'spen', 'th').posts.map(p => p.k)).toContain('th_5');
    expect(vis(blk(s2, 'spen', 'th')).map(p => p.k)).toEqual(['th1', 'th2', 'th3', 'th4']);
    const s3 = edit(s2, 'spen', 'th', { nums: 5 });
    expect(blk(s3, 'spen', 'th').posts.filter(p => p.k.startsWith('th_5'))).toHaveLength(1);
    expect(vis(blk(s3, 'spen', 'th')).map(p => p.k)).toEqual(['th1', 'th2', 'th3', 'th4', 'th_5']);
  });
  it('θαλαμοφύλακες σε ζεύγη: το β παίρνει <κλειδί>_2, ίδιο rot, ίδιες ώρες, ετικέτες 1ος α / 1ος β', () => {
    const s = edit(spen(), 'spen', 'th', { per: 2 });
    const b = blk(s, 'spen', 'th');
    expect(vis(b).map(p => p.k)).toEqual(['th1', 'th1_2', 'th2', 'th2_2', 'th3', 'th3_2', 'th4', 'th4_2']);
    expect(vis(b)[0]).toMatchObject({ label: 'Θαλαμοφύλακας 1ος α', short: '1ος α', rot: 0 });
    expect(vis(b)[1]).toMatchObject({ label: 'Θαλαμοφύλακας 1ος β', rot: 0 });
    expect(shiftGroups(b)).toEqual(['r0', 'r1', 'r2', 'r3']);
    const ps = buildPosts([b]);
    expect(ps[1].slots).toEqual(ps[0].slots);
    expect(b.shift).toBeUndefined();   // 4 νούμερα: οι βάρδιες του εντύπου
    // πίσω σε 1: το β κρύβεται
    expect(vis(blk(edit(s, 'spen', 'th', { per: 1 }), 'spen', 'th')).map(p => p.k)).toEqual(['th1', 'th2', 'th3', 'th4']);
  });
  it('σκοποί: 3 νούμερα συνεχίζουν στην 5η σκοπιά, 3 άτομα παίρνουν γ· κλειδιά σταθερά', () => {
    const s = edit(spen(), 'spen', 'sk', { nums: 3, per: 3 });
    const b = blk(s, 'spen', 'sk');
    expect(vis(b).map(p => p.k)).toEqual(['sk3a', 'sk3b', 'sk3c', 'sk4a', 'sk4b', 'sk4c', 'sk5a', 'sk5b', 'sk5c']);
    expect(vis(b)[8]).toMatchObject({ label: 'Σκοπός 5ης σκοπιάς (γ)', short: '5η γ', code: 'Σ5γ', rot: 4 });
    expect(vis(b)[0].label).toBe('Σκοπός 3ης σκοπιάς (α)');
    expect(b.shift).toEqual({ every: 120 });
    expect(shiftGroups(b)).toHaveLength(3);
  });
  it('δική σου υπηρεσία: ζεύγη με grp, ίδια slots, αύξηση/μείωση κρατά κλειδιά και ιστορικό', () => {
    let s = run(fakeState(30), { t: 'addBlock', phase: 'sven', name: 'Πύλη', kind: 'other', armed: false, n: 2, per: 2, hrs: '', shift: { every: 120 } });
    const b0 = s.settings.blocks.find(x => x.name === 'Πύλη')!; const id = b0.id;
    expect(b0.posts.map(p => p.k)).toEqual([id + '_1', id + '_1_2', id + '_2', id + '_2_2']);
    expect(b0.posts.map(p => p.grp)).toEqual([0, 0, 1, 1]);
    expect(b0.posts[1]).toMatchObject({ label: 'Πύλη 1ος β', short: '1ος β' });
    expect(shiftGroups(b0)).toEqual(['g0', 'g1']);
    const ps = buildPosts([b0]); expect(ps[1].slots).toEqual(ps[0].slots); expect(ps[2].slots).not.toEqual(ps[0].slots);
    // αύξηση και μείωση
    s = edit(s, 'sven', id, { name: 'Πύλη', nums: 3 });
    expect(vis(blk(s, 'sven', id))).toHaveLength(6);
    expect(blk(s, 'sven', id).posts.map(p => p.k)).toEqual(expect.arrayContaining([id + '_3', id + '_3_2']));
    s = edit(s, 'sven', id, { name: 'Πύλη', nums: 1, per: 1 });
    const b1 = blk(s, 'sven', id);
    expect(vis(b1).map(p => p.k)).toEqual([id + '_1']); expect(vis(b1)[0]).toMatchObject({ label: 'Πύλη', short: 'Πύλη' });
    expect(b1.posts).toHaveLength(6);
    s = edit(s, 'sven', id, { name: 'Πύλη', nums: 2, per: 2 });
    expect(vis(blk(s, 'sven', id)).map(p => p.k)).toEqual([id + '_1', id + '_1_2', id + '_2', id + '_2_2']);
    // όλα τα κλειδιά μοναδικά σε όλα τα έντυπα
    const keys = everyBlock(s.settings).flatMap(b => b.posts.map(p => p.k)); 
    const own = blk(s, 'sven', id).posts.map(p => p.k); expect(new Set(own).size).toBe(own.length);
    expect(keys.filter(k => own.includes(k)).length).toBe(own.length);
  });
  it('ο Λ/Υ-Δ/Υ δεν αλλάζει σχήμα· όρια 1–30 νούμερα, 1–10 άτομα', () => {
    const s = edit(fakeState(10), 'sven', 'ly', { nums: 5, per: 3, hidden: true, armed: true });
    expect(blk(s, 'sven', 'ly')).toMatchObject({ armed: false }); expect(blk(s, 'sven', 'ly').hidden).toBeUndefined(); expect(blk(s, 'sven', 'ly').posts).toHaveLength(2);
    const t = edit(spen(), 'spen', 'mg', { nums: 99, per: 99 });
    expect(blockShape(blk(t, 'spen', 'mg'))).toEqual({ nums: 30, per: 10 });
  });
  it('ένοπλη, ενεργή και όπλο της θέσης αλλάζουν από την ίδια εντολή', () => {
    const s = edit(spen(), 'spen', 'th', { armed: true, armWeapon: 'post' });
    expect(blk(s, 'spen', 'th')).toMatchObject({ armed: true, armWeapon: 'post' });
    const t = edit(s, 'spen', 'th', { hidden: true, armWeapon: 'own' });
    expect(blk(t, 'spen', 'th').hidden).toBe(true); expect(blk(t, 'spen', 'th').armWeapon).toBeUndefined();
  });
});

describe('editBlock και υπηρεσίες των επόμενων ημερών', () => {
  it('βγαίνουν μόνο όσες θέσεις κρύφτηκαν τώρα, από αύριο και μετά', () => {
    let s = edit(spen(), 'spen', 'th', { nums: 5 });
    s = { ...s, guards: { '2026-10-11': { th_5: 1, th1: 2 }, [D]: { th_5: 3 }, '2026-10-13': { th_5: 4, th1: 5, sk3a: 6 }, '2026-10-14': { th_5: 7 } } };
    const r = apply(s, { t: 'editBlock', phase: 'spen', id: 'th', name: '', hrs: {}, nums: 4 }, ctx);
    expect(r.state.guards).toEqual({ '2026-10-11': { th_5: 1, th1: 2 }, [D]: { th_5: 3 }, '2026-10-13': { th1: 5, sk3a: 6 } });
    expect(r.text).toContain('βγήκαν 2 υπηρεσίες');
    // δεύτερη φορά: ήδη κρυφή, τίποτα
    expect(apply(r.state, { t: 'editBlock', phase: 'spen', id: 'th', name: '', hrs: {}, nums: 4 }, ctx).state.guards).toBe(r.state.guards);
    // ανενεργή όλη η υπηρεσία από τον διάλογο
    const h = apply(s, { t: 'editBlock', phase: 'spen', id: 'th', name: '', hrs: {}, hidden: true }, ctx);
    expect(h.state.guards['2026-10-13']).toEqual({ sk3a: 6 });
  });
  it('οι κωδικοί ελέγχονται και στα νέα μέλη', () => {
    const s = edit(spen(), 'spen', 'th', { per: 2 });
    const b = blk(s, 'spen', 'th'); const codes = vis(b).map(p => p.code);
    expect(codes.every(Boolean)).toBe(true); expect(new Set(codes).size).toBe(codes.length);
    expect(() => run(s, { t: 'editBlock', phase: 'spen', id: 'th', name: '', hrs: {}, codes: { th1_2: 'Θ1' } })).toThrow(/Θ1/);
  });
});

describe('αυτόματη συμπλήρωση και θέσεις', () => {
  it('γεμίζει και τα β μέλη του ίδιου νούμερου, με διαφορετικά άτομα', () => {
    let s = edit(spen(), 'spen', 'th', { per: 2 });
    s = run(s, { t: 'autofill', date: '2026-10-13' });
    const g = s.guards['2026-10-13']; const b = vis(blk(s, 'spen', 'th'));
    for (const p of b) expect(g[p.k]).toBeTruthy();
    expect(new Set(b.map(p => g[p.k])).size).toBe(8);
    expect(postsOf(s.settings).filter(p => p.block === 'th')).toHaveLength(8);
  });
});

describe('ΦΡΟΥΡΑ: πίνακας με ζεύγη', () => {
  it('frouraTables βάζει το ζεύγος σε μία γραμμή με τα ονόματα το ένα κάτω από το άλλο και συνεχίζει την αρίθμηση', () => {
    let s = run(fakeState(30), { t: 'addBlock', phase: 'sven', name: 'Πύλη', kind: 'other', armed: false, n: 3, per: 2, hrs: '08:00-20:00' });
    s = run(s, { t: 'autofill', date: D });
    const lay = frouraLayout(s, D); const tabs = frouraTables(s, lay);
    expect(tabs).toHaveLength(1); expect(tabs[0].title).toBe('ΠΥΛΗ');
    expect(tabs[0].rows.map(r => r.n)).toEqual(['1ο', '2ο', '3ο']);
    expect(tabs[0].rows.every(r => r.name.split('\n').length === 2)).toBe(true);
    expect(tabs[0].rows[0].hours).toBe('08:00-20:00');
  });
});

let out = 0;
describe('ΦΡΟΥΡΑ Excel: ο πίνακας μεγαλώνει προς τα κάτω', () => {
  const sheet = async (tpl: string, s: AppState) => { const r = await fillFroura(T(tpl), s, D); if (process.env.EXPORT_OUT) { fs.mkdirSync(process.env.EXPORT_OUT, { recursive: true }); fs.writeFileSync(path.join(process.env.EXPORT_OUT, ++out + ' ' + r.name), r.data); } return { r, ws: await (await Workbook.open(r.data)).sheet(0) }; };
  it('ΣΠΕΝ: 5ος θαλαμοφύλακας στον ίδιο πίνακα (3 γραμμές), «5ο» στο Α/Α, ώρες, ζεύγος σκοπών, οπλοφύλακες άδειοι από κάτω', async () => {
    let s = edit(spen(), 'spen', 'th', { nums: 5 });
    s = run(s, { t: 'autofill', date: D });
    const g = s.guards[D];
    const { r, ws } = await sheet('froura-spen.xlsx', s);
    expect(ws.get('B25')).toBe('5ο');
    const nm = (ref: string) => ws.get(ref);
    expect(nm('C25')).toBeTruthy();
    expect(nm('C25')).toMatch(/^[Α-Ω]+\d* [Α-Ω]+$/);
    expect(ws.get('D25')).toBeTruthy(); expect(ws.get('D25')).toMatch(/^\d\d:\d\d-\d\d:\d\d$/);
    expect(ws.get('D26')).toBeTruthy(); 
    // οι οπλοφύλακες δεν έχουν 5ο: στις νέες γραμμές είναι άδεια
    expect(ws.get('I25')).toBeNull(); expect(ws.get('J25')).toBeNull();
    // ό,τι ήταν από κάτω κατέβηκε 3 γραμμές: οι σκοποί στο J30 (ήταν J27)
    expect(ws.get('J30')!.split('\n')).toHaveLength(2);
    expect(ws.get('I30')).toBe('3η');
    expect(g.th_5).toBeTruthy(); expect(r.warnings).toEqual([]);
  });
  it('ΣΒΕΝ: 5ος θαλαμοφύλακας στον α΄ πίνακα, ο β΄ μένει άδειος εκεί', async () => {
    let s = edit(run(fakeState(60), { t: 'setPhase', phase: 'sven' }), 'sven', 'th', { nums: 5 });
    s = run(s, { t: 'autofill', date: D });
    const { r, ws } = await sheet('froura.xlsx', s);
    expect(ws.get('B25')).toBe('5ο'); expect(ws.get('C25')).toBeTruthy(); expect(ws.get('D25')).toBeTruthy();
    expect(ws.get('I25')).toBeNull(); expect(ws.get('J25')).toBeNull();
    expect(ws.get('F30')).toBeTruthy();   // τα μαγειρεία κατέβηκαν 3 γραμμές (ήταν F27)
    expect(r.warnings).toEqual([]);
  });
  it('μαγειρεία με 7 νούμερα: μία γραμμή ανά νούμερο κάτω από την τελευταία', async () => {
    let s = edit(spen(), 'spen', 'mg', { nums: 7 });
    s = run(s, { t: 'autofill', date: D });
    const { r, ws } = await sheet('froura-spen.xlsx', s);
    expect(ws.get('B32')).toBe('6ο'); expect(ws.get('B33')).toBe('7ο');
    expect(ws.get('C32')).toBeTruthy(); expect(ws.get('C33')).toBeTruthy();
    expect(ws.get('B35')).toBe('ΤΑΕ');   // η ΤΑΕ κατέβηκε 2 γραμμές
    expect(r.warnings).toEqual([]);
  });
  it('ΣΠΕΝ: ζεύγη θαλαμοφυλάκων στο ίδιο κελί και νέα υπηρεσία σε ζεύγη', async () => {
    let s = edit(spen(), 'spen', 'th', { per: 2 });
    s = run(s, { t: 'addBlock', phase: 'spen', name: 'Πύλη', kind: 'other', armed: false, n: 2, per: 2, hrs: '08:00-20:00' });
    s = run(s, { t: 'autofill', date: D });
    const { r, ws } = await sheet('froura-spen.xlsx', s);
    expect(ws.get('C13')!.split('\n')).toHaveLength(2);
    expect(ws.get('C22')!.split('\n')).toHaveLength(2);
    // «Πύλη» σε δικό της πίνακα: ένα νούμερο, δύο ονόματα
    const col = [34, 35, 36, 37, 38].map(i => ws.get('C' + i));
    expect(col).toContain('ΠΥΛΗ');
    expect(col.filter(x => x && x.includes('\n'))).toHaveLength(2);
    expect(r.warnings).toEqual([]);
  });
  it('ΣΠΕΝ: νέα (5η) σκοπιά στον πίνακα των σκοπών', async () => {
    let s = edit(spen(), 'spen', 'sk', { nums: 3 });
    s = run(s, { t: 'autofill', date: D });
    const { ws } = await sheet('froura-spen.xlsx', s);
    expect(ws.get('I33')).toBe('5η'); expect(ws.get('J33')!.split('\n')).toHaveLength(2);
  });
});

describe('πάνω από 10 άτομα σε μία υπηρεσία (Michael, 11/11)', () => {
  it('δική σου υπηρεσία 15 νούμερα × 6 άτομα: γράμματα α–στ, μοναδικά κλειδιά και κωδικοί, ο Excel γεμίζει', async () => {
    let s = run(fakeState(60), { t: 'setPhase', phase: 'sven' });
    s = run(s, { t: 'addBlock', phase: 'sven', name: 'Πύλη', kind: 'other', armed: false, n: 15, per: 6, hrs: '', off: false, shift: null });
    const id = blocksOf(s.settings, 'sven').find(b => b.name === 'Πύλη')!.id;
    let b = blk(s, 'sven', id);
    expect(blockShape(b)).toEqual({ nums: 15, per: 6 }); expect(vis(b)).toHaveLength(90);
    expect(vis(b)[5]).toMatchObject({ label: 'Πύλη 1ος ζ' });
    expect(new Set(b.posts.map(p => p.k)).size).toBe(90); expect(new Set(vis(b).map(p => p.code)).size).toBe(90);
    // 12 άτομα σε κάθε νούμερο (πάνω από το παλιό όριο) και πίσω
    s = edit(s, 'sven', id, { nums: 12, per: 10 });
    b = blk(s, 'sven', id); expect(blockShape(b)).toEqual({ nums: 12, per: 10 }); expect(vis(b)).toHaveLength(120);
    expect(vis(b)[9].label).toBe('Πύλη 1ος κ');
    s = edit(s, 'sven', id, { nums: 15, per: 1 }); expect(vis(blk(s, 'sven', id))).toHaveLength(15);
    // θαλαμοφύλακες 14: ο πίνακας της ΦΡΟΥΡΑΣ μεγαλώνει, χωρίς προειδοποιήσεις
    s = edit(s, 'sven', 'th', { nums: 14 }); s = run(s, { t: 'autofill', date: D });
    expect(vis(blk(s, 'sven', 'th'))).toHaveLength(14);
    const r = await fillFroura(T('froura.xlsx'), s, D); expect(r.warnings).toEqual([]);
    const ws = await (await Workbook.open(r.data)).sheet(0); expect(ws.get('B25')).toBe('5ο');
  });
});
