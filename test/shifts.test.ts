// Αρχή υπηρεσίας και βάρδιες ανά υπηρεσία (Michael, 20/10): «από τις 14:00 ξεκινάει η επόμενη μέρα υπηρεσιών και ανά
// πόσες ώρες αλλάζει το κάθε νούμερο», «μια υπηρεσία μπορεί να μην έχει ωράρια». Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { DEFAULT_BLOCKS, ROT, buildPosts, cleanShift, hasShift, hoursTxt, shiftList, shiftReport, shiftSlots, type AppState, type BlockDef, type ShiftOwn, type Status } from '../src/shared/domain';
import { dutyBlock, dutyMin, postBy, postSpan, postsOf, ruleBlock, strictTier } from '../src/shared/rules';
import { addDays } from '../src/shared/dates';
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

// Δικές μου βάρδιες (Michael, 24/10): ο λοχίας γράφει τις βάρδιες και διαλέγει ποιο νούμερο κάνει την καθεμία
describe('δικές μου βάρδιες', () => {
  // νύχτα 3 ώρες, μέρα 2: 4 νούμερα, άνισα
  const own: ShiftOwn[] = [
    { from: '14:00', to: '16:00', n: 0 }, { from: '16:00', to: '18:00', n: 1 }, { from: '18:00', to: '20:00', n: 2 }, { from: '20:00', to: '22:00', n: 3 },
    { from: '22:00', to: '01:00', n: 0 }, { from: '01:00', to: '04:00', n: 1 }, { from: '04:00', to: '07:00', n: 2 }, { from: '07:00', to: '09:00', n: 3 },
    { from: '09:00', to: '11:00', n: 0 }, { from: '11:00', to: '14:00', n: 1 }
  ];
  const withList = (s: AppState, list: ShiftOwn[], ids = ['th']): AppState => ({ ...s, settings: { ...s.settings, blocks: s.settings.blocks.map(b => (ids.includes(b.id) ? { ...b, shift: { every: 120, list } } : b)) } });

  it('shiftSlots: ανά νούμερο, άνισα μήκη, βάρδια που περνά τα μεσάνυχτα, νούμερο χωρίς βάρδια', () => {
    const sl = shiftSlots('14:00', { every: 120, list: own }, 4);
    expect(sl[0]).toEqual(['14:00-16:00', '22:00-01:00', '09:00-11:00']);
    expect(sl[1]).toEqual(['16:00-18:00', '01:00-04:00', '11:00-14:00']);
    expect(sl[3]).toEqual(['20:00-22:00', '07:00-09:00']);
    expect(shiftSlots('14:00', { every: 120, list: [{ from: '08:00', to: '12:00', n: 1 }] }, 3)).toEqual([[], ['08:00-12:00'], []]);
    // νούμερο έξω από τα νούμερα της υπηρεσίας και κακές ώρες δεν μπαίνουν πουθενά
    expect(shiftSlots('14:00', { every: 120, list: [{ from: '08:00', to: '12:00', n: 5 }, { from: '08:00', to: '08:00', n: 0 }, { from: 'x', to: '09:00', n: 0 }] }, 2)).toEqual([[], []]);
  });
  it('η σειρά είναι της υπηρεσίας: ίδια λίστα, άλλη αρχή κύκλου, άλλη σειρά', () => {
    const l: ShiftOwn[] = [{ from: '06:00', to: '08:00', n: 0 }, { from: '20:00', to: '22:00', n: 0 }, { from: '10:00', to: '12:00', n: 0 }];
    expect(shiftSlots('14:00', { every: 120, list: l }, 1)[0]).toEqual(['20:00-22:00', '06:00-08:00', '10:00-12:00']);
    expect(shiftSlots('08:00', { every: 120, list: l }, 1)[0]).toEqual(['10:00-12:00', '20:00-22:00', '06:00-08:00']);
  });
  it('η list νικά τα every/from/to· χωρίς list όλα όπως πριν', () => {
    expect(shiftSlots('14:00', { every: 240, from: '08:00', to: '20:00', list: [{ from: '10:00', to: '11:00', n: 0 }] }, 3)).toEqual([['10:00-11:00'], [], []]);
    expect(shiftSlots('14:00', { every: 240, from: '08:00', to: '20:00', list: [] }, 3)).toEqual([['08:00-12:00'], ['12:00-16:00'], ['16:00-20:00']]);
    expect(hasShift(null)).toBe(false); expect(hasShift({ every: 0 })).toBe(false); expect(hasShift({ every: 0, list: [{ from: '08:00', to: '09:00', n: 0 }] })).toBe(true); expect(hasShift({ every: 120 })).toBe(true);
  });
  it('«Ξεκίνα από κάθε 2 ώρες»: οι βάρδιες του κάθε-τόσες-ώρες ως λίστα, με σειρά κύκλου', () => {
    const l = shiftList('14:00', { every: 120 }, 4);
    expect(l).toHaveLength(12); expect(l[0]).toEqual({ from: '14:00', to: '16:00', n: 0 }); expect(l[4]).toEqual({ from: '22:00', to: '00:00', n: 0 });
    expect(shiftSlots('14:00', { every: 120, list: l }, 4)).toEqual(ROT);
    expect(shiftList('14:00', { every: 240, from: '08:00', to: '20:00' }, 3).map(x => x.n)).toEqual([0, 1, 2]);
  });
  it('cleanShift: ώρες ΩΩ:ΛΛ, κακές γραμμές φεύγουν, νούμερο μέσα στα νούμερα, ως 48', () => {
    expect(cleanShift({ every: 120, list: [{ from: '8', to: '12.30', n: 9 }, { from: '09:00', to: '09:00', n: 0 }, { from: '', to: '10:00', n: 0 }, { from: '10:00', to: '11:00', n: -2 }] }, 3))
      .toEqual({ every: 120, list: [{ from: '08:00', to: '12:30', n: 2 }, { from: '10:00', to: '11:00', n: 0 }] });
    expect(cleanShift({ every: 0, list: [{ from: '10:00', to: '11:00', n: 0 }] }, 1)).toEqual({ every: 120, list: [{ from: '10:00', to: '11:00', n: 0 }] });
    expect(cleanShift({ every: 0 }, 1)).toBeNull(); expect(cleanShift(null, 1)).toBeNull();
    expect(cleanShift({ every: 180 }, 2)).toEqual({ every: 180 });
    expect(cleanShift({ every: 60, list: Array.from({ length: 60 }, (_, i) => ({ from: '10:00', to: '11:00', n: i % 2 })) }, 2)!.list).toHaveLength(48);
  });

  describe('έλεγχος (επικαλύψεις, κενά, ώρες)', () => {
    it('σωστές βάρδιες χωρίς κενά: τίποτα να προειδοποιήσει, με σύνολα ανά νούμερο', () => {
      const r = shiftReport('14:00', own, 4);
      expect(r.overlaps).toEqual([]); expect(r.gaps).toEqual([]); expect(r.empty).toEqual([]);
      expect(r.per.map(x => x.count)).toEqual([3, 3, 2, 2]);
      expect(r.per.map(x => x.min / 60)).toEqual([7, 8, 5, 4]);
    });
    it('επικάλυψη και κενό όπως στο σχέδιο: το 2ο και το 4ο πέφτουν μαζί 03:00-04:00, κενό 06:00-07:00', () => {
      const l = own.map(x => ({ ...x })); l[7] = { from: '07:00', to: '10:00', n: 2 }; l[6] = { from: '03:00', to: '06:00', n: 3 }; l[8] = { from: '10:00', to: '12:00', n: 0 }; l[9] = { from: '12:00', to: '14:00', n: 1 };
      const r = shiftReport('14:00', l, 4);
      expect(r.overlaps).toEqual([{ a: 5, b: 6, from: '03:00', to: '04:00' }]);
      expect(r.gaps).toEqual([{ from: '06:00', to: '07:00' }]);
    });
    it('κενό που περνά το τέλος του κύκλου είναι ένα, και βάρδια που περνά το τέλος πέφτει πάνω στην αρχή', () => {
      expect(shiftReport('14:00', [{ from: '15:00', to: '23:00', n: 0 }], 1).gaps).toEqual([{ from: '23:00', to: '15:00' }]);
      const r = shiftReport('14:00', [{ from: '14:00', to: '16:00', n: 0 }, { from: '12:00', to: '15:00', n: 1 }], 2);
      expect(r.overlaps).toEqual([{ a: 0, b: 1, from: '14:00', to: '15:00' }]);
      expect(r.gaps).toEqual([{ from: '16:00', to: '12:00' }]);
    });
    it('νούμερο χωρίς βάρδια, κακές γραμμές αγνοούνται, άδεια λίστα δεν έχει κενά', () => {
      const r = shiftReport('14:00', [{ from: '14:00', to: '02:00', n: 0 }, { from: '02:00', to: '14:00', n: 2 }, { from: '', to: '14:00', n: 1 }], 4);
      expect(r.empty).toEqual([1, 3]); expect(r.gaps).toEqual([]); expect(r.overlaps).toEqual([]);
      expect(shiftReport('14:00', [], 2).gaps).toEqual([]);
    });
    it('ώρες με ελληνική υποδιαστολή', () => {
      expect(hoursTxt(420)).toBe('7 ώρες'); expect(hoursTxt(150)).toBe('2,5 ώρες'); expect(hoursTxt(60)).toBe('1 ώρα'); expect(hoursTxt(0)).toBe('0 ώρες');
    });
  });

  it('θέσεις: υπηρεσία του εντύπου (rot), νούμερο χωρίς βάρδια = χωρίς ώρες, χωρίς να σπάει τίποτα', () => {
    const ps = buildPosts(withList(fakeState(10), own.filter(x => x.n !== 3)).settings.blocks);
    expect(ps.find(x => x.k === 'th1')!.slots).toEqual(['14:00-16:00', '22:00-01:00', '09:00-11:00']);
    expect(ps.find(x => x.k === 'th3')!.slots).toEqual(['18:00-20:00', '04:00-07:00']);
    const th4 = ps.find(x => x.k === 'th4')!; expect(th4.slots).toBeNull(); expect(th4.hours).toBe('');
    // ο β΄ πίνακας χωρίς δικές του βάρδιες μένει όπως το έντυπο
    expect(ps.find(x => x.k === 'th5')!.slots).toEqual(ROT[0]);
  });
  it('θέσεις: δική μου υπηρεσία, κάθε θέση ένα νούμερο, και ζεύγος σκοπών = ένα νούμερο', () => {
    const s = withGate(gate(3, { every: 120, list: [{ from: '08:00', to: '14:00', n: 2 }, { from: '14:00', to: '20:00', n: 0 }, { from: '20:00', to: '23:00', n: 0 }] }));
    expect(postBy(s, 'b_gate_1')!.slots).toEqual(['14:00-20:00', '20:00-23:00']);
    expect(postBy(s, 'b_gate_2')!.slots).toBeNull(); expect(postBy(s, 'b_gate_2')!.hours).toBe('ημέρα');
    expect(postBy(s, 'b_gate_3')!.slots).toEqual(['08:00-14:00']);
    // σκοποί: τα δύο του ζεύγους (α, β) έχουν τις ίδιες βάρδιες, το νούμερο = η 3η/4η σκοπιά
    const sp = run(fakeState(10), { t: 'setPhase', phase: 'spen' } as Command);
    const sk = { ...sp, settings: { ...sp.settings, blocksSpen: sp.settings.blocksSpen.map(b => (b.id === 'sk' ? { ...b, shift: { every: 120, list: [{ from: '14:00', to: '18:00', n: 1 }, { from: '18:00', to: '14:00', n: 0 }] } } : b)) } };
    expect(postBy(sk, 'sk3a')!.slots).toEqual(['18:00-14:00']); expect(postBy(sk, 'sk3b')!.slots).toEqual(['18:00-14:00']);
    expect(postBy(sk, 'sk4a')!.slots).toEqual(['14:00-18:00']);
  });
  it('ώρες υπηρεσίας από δικές μου βάρδιες: ξεκινά και τελειώνει με τη σειρά του κύκλου', () => {
    const s = withList(fakeState(10), own);
    expect(postSpan(postBy(s, 'th1')!)).toEqual({ start: 840, end: 1440 + 660 });
    expect(postSpan(postBy(s, 'th4')!)).toEqual({ start: 1200, end: 1440 + 540 });
    // μόνο πρωινή βάρδια: είναι της επόμενης μέρας
    const m = withGate(gate(1, { every: 120, list: [{ from: '06:00', to: '09:00', n: 0 }, { from: '03:00', to: '05:00', n: 0 }] }));
    expect(postSpan(postBy(m, 'b_gate_1')!)).toEqual({ start: 1440 + 180, end: 1440 + 540 });
    // νούμερο χωρίς βάρδια: δεν ξέρουμε ώρες
    expect(postSpan(postBy(withList(fakeState(10), own.filter(x => x.n !== 3)), 'th4')!)).toEqual({ start: null, end: null });
  });
  it('το νούμερο που διάλεξες μετρά στους κανόνες: 3ο/4ο νούμερο και Αυστηρά Άοπλοι είναι της θέσης, όχι των ωρών', () => {
    const s0 = withList(fakeState(20), own); const s = { ...s0, guards: { [D]: { th3: 2 } } };
    // το 3ο νούμερο έχει τις βάρδιες που του έδωσες και ισχύει ο κανόνας «ξανά στο ίδιο νούμερο μετά από 3 μέρες»
    expect(postBy(s, 'th3')!.slots).toEqual(['18:00-20:00', '04:00-07:00']);
    expect(ruleBlock(s, addDays(D, 2), 2, undefined, 'th3')).toMatch(/3ο νούμερο στις/);
    expect(ruleBlock(s, addDays(D, 2), 2, undefined, 'th4')).toBeNull();
    expect(ruleBlock(s, addDays(D, 2), 2, undefined, 'th1')).toBeNull();
    // Αυστηρά Άοπλοι: 2ο-3ο νούμερο = θέσεις rot 1 και 2, ό,τι ώρες κι αν έχουν
    expect(['th1', 'th2', 'th3', 'th4'].map(k => strictTier(postBy(s, k)!))).toEqual([3, 2, 2, 3]);
    expect(['th1', 'th2', 'th3', 'th4'].map(k => strictTier(postBy(fakeState(20), k)!))).toEqual([3, 2, 2, 3]);
  });

  describe('εντολές', () => {
    it('Επεξεργασία: η λίστα καθαρίζεται και αποθηκεύεται, νούμερο μέσα στα νούμερα της υπηρεσίας', () => {
      let s = withGate(gate(2));
      s = run(s, { t: 'editBlock', phase: 'sven', id: 'b_gate', name: 'Πύλη', n: 2, hrs: {}, shift: { every: 120, list: [{ from: '8', to: '14.30', n: 7 }, { from: '14:30', to: '20:00', n: 0 }, { from: '09:00', to: '09:00', n: 0 }] } });
      expect(s.settings.blocks.find(b => b.id === 'b_gate')!.shift).toEqual({ every: 120, list: [{ from: '08:00', to: '14:30', n: 1 }, { from: '14:30', to: '20:00', n: 0 }] });
      expect(postBy(s, 'b_gate_1')!.slots).toEqual(['14:30-20:00']); expect(postBy(s, 'b_gate_2')!.slots).toEqual(['08:00-14:30']);
      // λιγότερα άτομα: το νούμερο μένει στο τελευταίο που υπάρχει
      const m = run(s, { t: 'editBlock', phase: 'sven', id: 'b_gate', name: 'Πύλη', n: 1, hrs: {}, shift: s.settings.blocks.find(b => b.id === 'b_gate')!.shift });
      expect(m.settings.blocks.find(b => b.id === 'b_gate')!.shift!.list!.map(x => x.n)).toEqual([0, 0]);
      // πίσω στο κάθε-τόσες-ώρες, και καθόλου βάρδιες
      const e = run(s, { t: 'editBlock', phase: 'sven', id: 'b_gate', name: 'Πύλη', n: 2, hrs: {}, shift: { every: 180 } });
      expect(e.settings.blocks.find(b => b.id === 'b_gate')!.shift).toEqual({ every: 180 });
      const z = run(s, { t: 'editBlock', phase: 'sven', id: 'b_gate', name: 'Πύλη', n: 2, hrs: { b_gate_1: '', b_gate_2: '' }, shift: null });
      expect(z.settings.blocks.find(b => b.id === 'b_gate')!.shift).toBeUndefined(); expect(postBy(z, 'b_gate_1')!.hours).toBe('ημέρα');
    });
    it('Επεξεργασία υπηρεσίας του εντύπου: οι θαλαμοφύλακες παίρνουν δικές μου βάρδιες και τις χάνουν με null', () => {
      let s = run(fakeState(10), { t: 'editBlock', phase: 'sven', id: 'th', name: '', n: 4, hrs: {}, shift: { every: 120, list: own } });
      expect(s.settings.blocks.find(b => b.id === 'th')!.shift!.list).toHaveLength(10);
      expect(postBy(s, 'th2')!.slots).toEqual(['16:00-18:00', '01:00-04:00', '11:00-14:00']);
      s = run(s, { t: 'editBlock', phase: 'sven', id: 'th', name: '', n: 4, hrs: {}, shift: null });
      expect(s.settings.blocks.find(b => b.id === 'th')!.shift).toBeUndefined(); expect(postBy(s, 'th2')!.slots).toEqual(ROT[1]);
    });
    it('Λίστα χωρίς καμία σωστή βάρδια δεν γίνεται σιωπηλά «κάθε τόσες ώρες»', () => {
      expect(() => run(withGate(gate(2)), { t: 'editBlock', phase: 'sven', id: 'b_gate', name: 'Πύλη', n: 2, hrs: {}, shift: { every: 120, list: [{ from: '09:00', to: '09:00', n: 0 }] } })).toThrow(/βάρδιες/);
      expect(() => run(fakeState(10), { t: 'addBlock', phase: 'sven', name: 'Πύλη', armed: false, n: 1, hrs: '', shift: { every: 120, list: [{ from: '', to: '09:00', n: 0 }] } })).toThrow(/βάρδιες/);
    });
    it('Νέα υπηρεσία με δικές μου βάρδιες (και μόνο με λίστα, χωρίς every)', () => {
      const s = run(fakeState(10), { t: 'addBlock', phase: 'sven', name: 'Περίπολος', kind: 'other', armed: false, n: 2, hrs: '', shift: { every: 0, list: [{ from: '22:00', to: '06:00', n: 1 }, { from: '06:00', to: '14:00', n: 0 }] } });
      const b = s.settings.blocks.find(x => x.name === 'Περίπολος')!;
      expect(b.shift!.list).toHaveLength(2);
      expect(postBy(s, b.posts[0].k)!.slots).toEqual(['06:00-14:00']); expect(postBy(s, b.posts[1].k)!.slots).toEqual(['22:00-06:00']);
    });
    it('οι παλιές ρυθμίσεις, χωρίς list, αποθηκεύονται και διαβάζονται όπως πριν (JSON)', () => {
      const s = withGate(gate(2, { every: 180, from: '08:00', to: '20:00' }));
      const back = JSON.parse(JSON.stringify(s.settings.blocks.find(b => b.id === 'b_gate')));
      expect(back.shift).toEqual({ every: 180, from: '08:00', to: '20:00' });
      expect(postBy(s, 'b_gate_1')!.slots).toEqual(['08:00-11:00', '14:00-17:00']);
    });
  });

  describe('ΦΡΟΥΡΑ με άνισες βάρδιες', () => {
    // 1ος 4 βάρδιες, 2ος 1, 3ος 2, 4ος καμία
    const uneven: ShiftOwn[] = [
      { from: '14:00', to: '16:00', n: 0 }, { from: '16:00', to: '17:00', n: 1 }, { from: '17:00', to: '20:00', n: 2 }, { from: '20:00', to: '23:00', n: 0 },
      { from: '23:00', to: '02:00', n: 0 }, { from: '02:00', to: '07:00', n: 2 }, { from: '07:00', to: '14:00', n: 0 }
    ];
    it('οι γραμμές ανά νούμερο ακολουθούν το πιο γεμάτο: 4, και οι υπόλοιπες 3', () => {
      const s = withList(fakeState(60), uneven);
      expect(frouraPer(s)).toEqual([4, 3, 3, 3]);
    });
    it('Excel και προεπισκόπηση: μία γραμμή ανά βάρδια, το νούμερο χωρίς βάρδια μένει χωρίς ώρες', async () => {
      const s = run(withList(fakeState(60), uneven), { t: 'autofill', date: D });
      const r = await fillFroura(T('froura.xlsx'), s, D);
      const ws = await (await Workbook.open(r.data)).sheet(0);
      expect([13, 14, 15, 16].map(i => ws.get('D' + i))).toEqual(['14:00-16:00', '20:00-23:00', '23:00-02:00', '07:00-14:00']);
      // 2ος στη γραμμή 17, 3ος στη 20, 4ος (χωρίς βάρδιες) στη 23: καθαρό, όχι οι ώρες του template
      expect([17, 18, 19].map(i => ws.get('D' + i))).toEqual(['16:00-17:00', null, null]);
      expect([20, 21, 22].map(i => ws.get('D' + i))).toEqual(['17:00-20:00', '02:00-07:00', null]);
      expect([23, 24, 25].map(i => ws.get('D' + i))).toEqual([null, null, null]);
      expect(JSON.stringify(frouraSheet(s, D))).toContain('02:00-07:00');
    });
    it('δική μου υπηρεσία με άνισα νούμερα: πίνακας με γραμμές όσες οι βάρδιες του πιο γεμάτου', async () => {
      const s = run(withGate(gate(3, { every: 120, list: [{ from: '08:00', to: '10:00', n: 0 }, { from: '10:00', to: '12:00', n: 0 }, { from: '12:00', to: '20:00', n: 2 }] })), { t: 'autofill', date: D });
      const tabs = frouraTables(s, frouraLayout(s, D));
      expect(tabs[0].rows.map(x => x.shifts || null)).toEqual([['08:00-10:00', '10:00-12:00'], null, ['12:00-20:00']]);
      const ws = await (await Workbook.open((await fillFroura(T('froura.xlsx'), s, D)).data)).sheet(0);
      expect(ws.get('C33')).toBe('ΠΥΛΗ'); expect(ws.get('D34')).toBe('08:00-10:00'); expect(ws.get('D35')).toBe('10:00-12:00');
    });
  });
});
