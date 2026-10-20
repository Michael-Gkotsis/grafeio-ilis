// Αρχή υπηρεσίας και βάρδιες ανά υπηρεσία (Michael, 20/10): «από τις 14:00 ξεκινάει η επόμενη μέρα υπηρεσιών και ανά
// πόσες ώρες αλλάζει το κάθε νούμερο», «μια υπηρεσία μπορεί να μην έχει ωράρια». Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { DEFAULT_BLOCKS, ROT, buildPosts, shiftSlots, type AppState, type BlockDef, type Status } from '../src/shared/domain';
import { dutyBlock, dutyMin, postBy, postSpan, postsOf } from '../src/shared/rules';
import { frouraLayout, frouraPer, frouraTables, rows3 } from '../src/shared/froura';
import { dutyAt } from '../src/shared/weekend';
import { frouraSheet } from '../src/renderer/sheets';
import { fillFroura, absentOn } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let seq = 0;
const ctx: Ctx = { today: '2026-10-20', newId: () => 'v' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const D = '2026-10-21';
const gate = (n: number, shift?: BlockDef['shift'], hrs = 'ημέρα'): BlockDef => ({ id: 'b_gate', kind: 'other', name: 'Πύλη', armed: false, custom: true, ...(shift ? { shift } : {}),
  posts: Array.from({ length: n }, (_, i) => ({ k: 'b_gate_' + (i + 1), label: 'Πύλη ' + (i + 1) + 'ος', short: (i + 1) + 'ος', hrs, code: 'ΠΥ' + (i + 1) })) });
const withGate = (b: BlockDef, extra: Partial<AppState['settings']> = {}): AppState => { const s = fakeState(60); return { ...s, settings: { ...s.settings, ...extra, blocks: [...s.settings.blocks, b] } }; };

describe('βάρδιες', () => {
  it('2 ώρες από τις 14:00 με 4 νούμερα = οι βάρδιες του εντύπου', () => {
    expect(shiftSlots('14:00', { every: 120 }, 4)).toEqual(ROT);
    // χωρίς δικές τους βάρδιες, οι θέσεις μένουν ακριβώς όπως πριν
    const ps = buildPosts(DEFAULT_BLOCKS);
    expect(ps.find(x => x.k === 'th3')!.slots).toEqual(ROT[2]);
    expect(ps.find(x => x.k === 'ly')!.hours).toBe('14:00 → 14:00');
    expect(ps.find(x => x.k === 'mg1')!.slots).toBeNull();
  });
  it('Πύλη με 3 άτομα ανά 2 ώρες: 4 βάρδιες ο καθένας, με τη σειρά', () => {
    const s = withGate(gate(3, { every: 120 }));
    expect(postBy(s, 'b_gate_1')!.slots).toEqual(['14:00-16:00', '20:00-22:00', '02:00-04:00', '08:00-10:00']);
    expect(postBy(s, 'b_gate_3')!.slots).toEqual(['18:00-20:00', '00:00-02:00', '06:00-08:00', '12:00-14:00']);
  });
  it('Από/Ως: 08:00 ως 20:00 ανά 4 ώρες, και άνισο μοίρασμα', () => {
    expect(shiftSlots('14:00', { every: 240, from: '08:00', to: '20:00' }, 3)).toEqual([['08:00-12:00'], ['12:00-16:00'], ['16:00-20:00']]);
    expect(shiftSlots('14:00', { every: 180 }, 3).map(x => x.length)).toEqual([3, 3, 2]);
    // η τελευταία βάρδια κόβεται στο τέλος των ωρών
    expect(shiftSlots('14:00', { every: 300, from: '08:00', to: '20:00' }, 1)).toEqual([['08:00-13:00', '13:00-18:00', '18:00-20:00']]);
  });
  it('χωρίς ώρες: όλη μέρα, χωρίς βάρδιες', () => {
    const s = withGate(gate(1));
    expect(postBy(s, 'b_gate_1')!.slots).toBeNull();
    expect(frouraTables(s, frouraLayout(s, D))[0].hours).toBe(false);
  });
  it('βάρδια που ξεκινά πριν από την αρχή του κύκλου είναι της επόμενης μέρας', () => {
    const s = withGate(gate(1, { every: 120, from: '06:00', to: '08:00' }));
    expect(postSpan(postBy(s, 'b_gate_1')!)).toEqual({ start: 1440 + 360, end: 1440 + 480 });
    // γυρίζει από άδεια 21/10 στις 18:00: προλαβαίνει την Πύλη 22/10 06:00
    const st: Status = { id: 'l1', pid: 4, type: 'LEAVE', from: '2026-10-18', to: D, toTime: '18:00', kind: 'Κανονική' };
    expect(dutyBlock([st], D, 4, postBy(s, 'b_gate_1'))).toBeNull();
    expect(dutyBlock([st], D, 4, postBy(s, 'th1'))).not.toBeNull();
  });
});

describe('αρχή υπηρεσίας', () => {
  it('ο κύκλος από τις 08:00: Λ/Υ, βάρδιες και απόντες του εντύπου', () => {
    const s0 = fakeState(30); const s = { ...s0, settings: { ...s0.settings, dutyStart: '08:00' } };
    expect(dutyMin(s.settings)).toBe(480);
    expect(postBy(s, 'ly')!.hours).toBe('08:00 → 08:00');
    expect(postBy(s, 'th1')!.slots).toEqual(['08:00-10:00', '16:00-18:00', '00:00-02:00']);
    // γυρίζει 07:00 την ημέρα: δεν είναι απών της υπηρεσίας· στις 10:00 είναι (με κύκλο 14:00 δεν θα ήταν)
    const back = (t: string): Status => ({ id: 'x' + t, pid: 2, type: 'LEAVE', from: '2026-10-18', to: D, toTime: t, kind: 'Κανονική' });
    expect(absentOn({ ...s, statuses: [back('07:00')] }, D)).toHaveLength(0);
    expect(absentOn({ ...s, statuses: [back('10:00')] }, D)).toHaveLength(1);
    expect(absentOn({ ...s0, statuses: [back('10:00')] }, D)).toHaveLength(0);
  });
  it('αλλαγή της ώρας φτιάχνει ξανά τις θέσεις (όχι παλιές από τη μνήμη)', () => {
    const s = fakeState(10);
    expect(postsOf(s.settings).find(x => x.k === 'th1')!.slots![0]).toBe('14:00-16:00');
    const n = run(s, { t: 'setSettings', settings: { dutyStart: '15:00' }, text: '' });
    expect(postsOf(n.settings).find(x => x.k === 'th1')!.slots![0]).toBe('15:00-17:00');
  });
});

describe('εντολές', () => {
  it('Επεξεργασία: βάρδιες μπαίνουν και βγαίνουν, οι ώρες «όλη μέρα» γίνονται «ημέρα»', () => {
    let s = withGate(gate(2, undefined, '08:00-20:00'));
    s = run(s, { t: 'editBlock', phase: 'sven', id: 'b_gate', name: 'Πύλη', n: 2, hrs: {}, shift: { every: 180 } });
    expect(s.settings.blocks.find(b => b.id === 'b_gate')!.shift).toEqual({ every: 180 });
    expect(postBy(s, 'b_gate_2')!.slots![0]).toBe('17:00-20:00');
    s = run(s, { t: 'editBlock', phase: 'sven', id: 'b_gate', name: 'Πύλη', n: 2, hrs: { b_gate_1: '', b_gate_2: '' }, shift: null });
    expect(s.settings.blocks.find(b => b.id === 'b_gate')!.shift).toBeUndefined();
    expect(postBy(s, 'b_gate_1')!.hours).toBe('ημέρα');
  });
  it('Νέα υπηρεσία με βάρδιες', () => {
    const s = run(fakeState(10), { t: 'addBlock', phase: 'sven', name: 'Περίπολος', kind: 'other', armed: false, n: 2, hrs: '', shift: { every: 240 } });
    const b = s.settings.blocks.find(x => x.name === 'Περίπολος')!;
    expect(b.shift).toEqual({ every: 240 });
    expect(postBy(s, b.posts[0].k)!.slots).toEqual(['14:00-18:00', '22:00-02:00', '06:00-10:00']);
  });
  it('ανάπαυση και 3ο/4ο νούμερο με όσες μέρες θέλεις', () => {
    const s = run(fakeState(10), { t: 'setRules', rules: { ...fakeState(1).rules, restDays: 5, numRest: 7 }, text: '' });
    expect(s.rules.restDays).toBe(5); expect(s.rules.numRest).toBe(7);
  });
});

describe('ΦΡΟΥΡΑ', () => {
  it('3 γραμμές ωρών ανά νούμερο: λιγότερες αφήνουν κενό, περισσότερες μπαίνουν δύο-δύο', () => {
    expect(rows3(['a', 'b'])).toEqual(['a', 'b', '']);
    expect(rows3(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual(['a · b', 'c · d', 'e · f']);
  });
  it('θαλαμοφύλακες ανά 3 ώρες και Πύλη με βάρδιες: ώρες στο έντυπο, μία γραμμή ανά βάρδια', async () => {
    let s = withGate(gate(3, { every: 120 }));
    s = { ...s, settings: { ...s.settings, blocks: s.settings.blocks.map(b => (b.id === 'th' ? { ...b, shift: { every: 180 } } : b)) } };
    s = run(s, { t: 'autofill', date: D });
    const r = await fillFroura(T('froura.xlsx'), s, D);
    const ws = await (await Workbook.open(r.data)).sheet(0);
    expect([ws.get('D13'), ws.get('D14'), ws.get('D15')]).toEqual(['14:00-17:00', '02:00-05:00', null]);
    // β΄ πίνακας χωρίς δικές του βάρδιες: όπως το template
    expect(ws.get('K17')).toBe('00:00-2:00');
    // πίνακας Πύλης κάτω από τα μαγειρεία: κεφαλίδα στη 33, 1ος σε 4 γραμμές με ενωμένο όνομα
    expect(ws.get('C33')).toBe('ΠΥΛΗ');
    expect([34, 35, 36, 37].map(r => ws.get('D' + r))).toEqual(['14:00-16:00', '20:00-22:00', '02:00-04:00', '08:00-10:00']);
    expect(ws.get('B34')).toBe('1Ο'); expect(ws.get('B38')).toBe('2Ο');
    expect(r.data.length).toBeGreaterThan(0);
  });
  it('χωρίς αλλαγές, οι ώρες του template μένουν όπως είναι', async () => {
    const s = run(fakeState(60), { t: 'autofill', date: D });
    const ws = await (await Workbook.open((await fillFroura(T('froura.xlsx'), s, D)).data)).sheet(0);
    expect(ws.get('D17')).toBe('00:00-2:00');
  });
});

describe('το κουτί κάθε νούμερου μεγαλώνει ή μικραίνει', () => {
  const th = (s: AppState, every: number, ids = ['th', 'th2']): AppState => ({ ...s, settings: { ...s.settings, blocks: s.settings.blocks.map(b => (ids.includes(b.id) ? { ...b, shift: { every } } : b)) } });
  it('ανά 1 ώρα: 6 γραμμές ανά νούμερο, μία ώρα σε κάθε γραμμή, όλα τα από κάτω κατεβαίνουν', async () => {
    const s = run(th(fakeState(60), 60, ['th']), { t: 'autofill', date: D });
    expect(frouraPer(s)).toEqual([6, 6, 6, 6]);
    const ws = await (await Workbook.open((await fillFroura(T('froura.xlsx'), s, D)).data)).sheet(0);
    expect([13, 14, 15, 16, 17, 18].map(r => ws.get('D' + r))).toEqual(['14:00-15:00', '18:00-19:00', '22:00-23:00', '02:00-03:00', '06:00-07:00', '10:00-11:00']);
    expect(ws.get('D19')).toBe('15:00-16:00');
    // ο β΄ πίνακας (βάρδιες του εντύπου) ξαναγράφεται στο μεγάλο κουτί: 3 ώρες και κενό από κάτω
    expect([13, 14, 15, 16].map(r => ws.get('K' + r))).toEqual(['14:00-16:00', '22:00-00:00', '06:00-08:00', null]);
    // το όνομα του 1ου πιάνει τις 6 γραμμές· ο 2ος ξεκινά στη 19
    expect(ws.merges().some(m => m.c1 === 3 && m.r1 === 13 && m.r2 === 18)).toBe(true);
    expect(ws.get('C19')).toBeTruthy();
    // μαγειρεία: ήταν F27, κατέβηκαν 12 γραμμές
    expect(ws.get('F39')).toBeTruthy(); expect(ws.get('E26')).toBeFalsy();
    // ίδιο και στην προεπισκόπηση
    const m = frouraSheet(s, D); const txt = JSON.stringify(m);
    expect(txt).toContain('10:00-11:00');
  });
  it('ανά 3 ώρες και στους δύο πίνακες: 2 γραμμές, η τρίτη κρύβεται', async () => {
    const s = run(th(fakeState(60), 180), { t: 'autofill', date: D });
    expect(frouraPer(s)).toEqual([2, 2, 2, 2]);
    const ws = await (await Workbook.open((await fillFroura(T('froura.xlsx'), s, D)).data)).sheet(0);
    expect([13, 14].map(r => ws.get('D' + r))).toEqual(['14:00-17:00', '02:00-05:00']);
    expect(ws.rowHidden(15)).toBe(true); expect(ws.rowHidden(14)).toBe(false);
  });
});

describe('ό,τι άλλο μετρά ώρες υπηρεσίας', () => {
  it('Ποιοι γυρίζουν: η ώρα της υπηρεσίας από τις βάρδιες και την αρχή του κύκλου', () => {
    let s = fakeState(30); s = { ...s, settings: { ...s.settings, dutyStart: '08:00' } };
    s = { ...s, guards: { [D]: { th2: 5, ly: 6 } } };
    expect(dutyAt(s, D, 5)).toEqual({ label: expect.any(String), time: '10:00' });
    expect(dutyAt(s, D, 6)!.time).toBe('08:00');
    const g = { ...fakeState(30), guards: { [D]: { b_gate_1: 7 } } };
    const s2 = withGate(gate(1, { every: 120, from: '06:00', to: '08:00' })); const s3 = { ...s2, guards: g.guards };
    expect(dutyAt(s3, D, 7)!.time).toBe('06:00');
  });
});
