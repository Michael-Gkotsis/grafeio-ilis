// Έντυπα, φάση 3 (Michael, 20/10): Υπηρεσίες ημέρας, Οπλισμός, Κινήσεις όπλων
import { describe, it, expect } from 'vitest';
import { apply, type Ctx } from '../src/shared/commands';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport } from '../src/main/reports';
import { byIds, candidates, dailyOk, defaultPick, fieldValue, pickText, rowsOf, type DutyRow, type MoveRow, type Report } from '../src/shared/reports';
import { postsOf } from '../src/shared/rules';
import type { AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-19';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'x' + ++seq };
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Υπηρεσίες', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const withDuties = (): AppState => apply(fakeState(40), { t: 'autofill', date: D }, ctx).state;

describe('Έντυπα: Υπηρεσίες ημέρας', () => {
  it('μία γραμμή ανά θέση με τη σειρά της ΦΡΟΥΡΑΣ, θέση, ώρες, στρατιώτης', () => {
    const s = withDuties(); const g = s.guards[D];
    const rows = candidates(s, rep({ kind: 'duty', pick: { from: 'all', mode: 'all' } }), D) as DutyRow[];
    expect(rows.length).toBe(Object.keys(g).length);
    const order = postsOf(s.settings).map(p => p.k).filter(k => g[k] != null);
    expect(rows.map(r => r.id)).toEqual(order);
    const r0 = rows[0];
    expect(fieldValue(s, 'duty', r0, 'seat', 0, D)).toBe(r0.seat.label);
    expect(fieldValue(s, 'duty', r0, 'last', 0, D)).toBe(s.people.find(p => p.id === g[r0.id])!.last);
    expect(fieldValue(s, 'duty', r0, 'hours', 0, D)).toBe(r0.seat.hours);
    // και οι κενές θέσεις
    const all = candidates(s, rep({ kind: 'duty', pick: { from: 'all', mode: 'all', empty: true } }), D);
    expect(all.length).toBe(postsOf(s.settings).length);
    // μόνο μία υπηρεσία (ομάδα θέσεων)
    const mg = candidates(s, rep({ kind: 'duty', pick: { from: 'all', mode: 'all', blocks: ['mg'], empty: true } }), D) as DutyRow[];
    expect(mg.every(r => r.seat.block === 'mg')).toBe(true); expect(mg.length).toBe(5);
    // θάλαμος: μόνο όσοι είναι στον θάλαμο, χωρίς κενές
    const r3 = candidates(s, rep({ kind: 'duty', pick: { from: 'all', mode: 'all', rooms: [3], empty: true } }), D) as DutyRow[];
    expect(r3.every(r => r.p?.room === 3)).toBe(true);
    // ξανά από τα κλειδιά (ιστορικό, main): ίδιες θέσεις για την ίδια μέρα
    expect((byIds(s, 'duty', rows.map(r => r.id), D) as DutyRow[]).map(r => r.pid)).toEqual(rows.map(r => r.pid));
    expect(pickText(rep({ kind: 'duty', pick: { from: 'all', mode: 'all', empty: true } }), s)).toBe('Όλες οι θέσεις υπηρεσίας, και οι κενές');
  });

  it('γεμίζει πρότυπο «Φτιάξ\' το εδώ» με θέση και ώρες', async () => {
    const s = withDuties();
    const b = await buildTemplate({ title: 'ΥΠΗΡΕΣΙΕΣ', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'seat', h: 'ΘΕΣΗ', w: 'auto' }, { f: 'who', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }, { f: 'hours', h: 'ΩΡΕΣ', w: 'auto' }], head: true, date: true, sig: 'sgt', land: false, sz: 11, fill: 'gray' }, 'duty');
    const r = rep({ kind: 'duty', sheet: b.sheet, head: b.head, cols: b.cols, cells: b.cells, pick: { from: 'all', mode: 'all' }, sort: 'seat' });
    const ids = rowsOf(s, r, D).map(x => x.id);
    const out = await fillReport(b.data, s, r, ids, D);
    const vals = (await (await Workbook.open(out.data)).values(out.sheets[0], 60, 6)).flat().map(String);
    const first = postsOf(s.settings).find(p => s.guards[D][p.k] != null)!;
    expect(vals).toContain(first.label.toUpperCase());
  });
});

describe('Έντυπα: Οπλισμός και κινήσεις', () => {
  const armed = (): AppState => {
    const s = fakeState(12);
    s.people = s.people.map((p, i) => (i < 8 ? { ...p, weapon: 'G3-' + (100 + i), wtype: 'G3A3', rack: 'Α' + i } : p));
    s.weaponLog = [
      { id: 'm1', pid: s.people[0].id, weapon: 'G3-100', reason: 'ΕΚΠ', outDay: D, outTime: '08:00' },
      { id: 'm2', pid: s.people[1].id, weapon: 'G3-101', reason: 'ΒΟΛΗ', outDay: D, outTime: '07:30', inDay: D, inTime: '13:00', inReason: 'ΛΗΞ ΕΚΠ' },
      { id: 'm3', pid: s.people[2].id, weapon: 'G3-102', reason: 'ΕΚΠ', outDay: '2026-10-10', outTime: '08:00', inDay: '2026-10-11', inTime: '12:00' }
    ];
    return s;
  };
  it('Οπλισμός: μόνο όσοι έχουν όπλο, εντός ή εκτός με τον λόγο', () => {
    const s = armed();
    const rows = candidates(s, rep({ kind: 'weapon', pick: { from: 'all', mode: 'all', wf: 'with' } }), D);
    expect(rows).toHaveLength(8);
    const p0 = rows.find(x => x.id === s.people[0].id)!;
    expect(String(fieldValue(s, 'weapon', p0, 'inout', 0, D))).toContain('ΕΚΤΟΣ');
    expect(fieldValue(s, 'weapon', rows.find(x => x.id === s.people[5].id)!, 'inout', 0, D)).toBe('ΕΝΤΟΣ');
    expect(candidates(s, rep({ kind: 'weapon', pick: { from: 'all', mode: 'all', wf: 'out' } }), D).map(x => x.id)).toEqual([s.people[0].id]);
  });
  it('Κινήσεις: της μέρας, με τη σειρά που βγήκαν· «ακόμα έξω»', () => {
    const s = armed();
    const rows = rowsOf(s, rep({ kind: 'wmove', pick: { from: 'all', mode: 'all' }, sort: 'from' }), D) as MoveRow[];
    expect(rows.map(r => r.id)).toEqual(['m2', 'm1']);
    expect(fieldValue(s, 'wmove', rows[0], 'mout', 0, D)).toBe('19/10/2026 07:30');
    expect(fieldValue(s, 'wmove', rows[0], 'min', 0, D)).toBe('19/10/2026 13:00');
    expect(fieldValue(s, 'wmove', rows[0], 'minr', 0, D)).toBe('ΛΗΞ ΕΚΠ');
    expect(candidates(s, rep({ kind: 'wmove', pick: { from: 'all', mode: 'all', open: true } }), D).map(r => r.id)).toEqual(['m1']);
    expect((byIds(s, 'wmove', ['m1', 'xx']) as MoveRow[]).map(r => r.m.reason)).toEqual(['ΕΚΠ']);
  });
  it('«Έντυπα ημέρας» μόνο χωρίς ερώτηση', () => {
    expect(dailyOk({ pick: { from: 'all', mode: 'all' }, day: 'today' })).toBe(true);
    expect(dailyOk({ pick: { from: 'all', mode: 'random', n: 3 }, day: 'today' })).toBe(false);
    expect(dailyOk({ pick: { from: 'all', mode: 'all' }, day: 'ask' })).toBe(false);
  });
});
