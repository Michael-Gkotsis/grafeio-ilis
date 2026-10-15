// Έλεγχος υπηρεσιών από Excel: κρατιέται η εφαρμογή (Michael, 14/10). Περνά ό,τι λείπει, ό,τι διαφέρει μένει της
// εφαρμογής και φαίνεται στην προεπισκόπηση, η εγγραφή πίσω δεν σβήνει ποτέ υπηρεσία του Excel που δεν είδε η εφαρμογή.
// Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { bestFor, dutiesCmd, planDuties, planDutiesWrite, type SourceBinding } from '../src/shared/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
let seq = 0;
const ctx: Ctx = { today: TODAY, newId: () => 'd' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx);
// όπως το δείγμα 03: τίτλος με μήνα, στήλες συνόλων, μία στήλη ανά μέρα· cells: «γραμμή:μέρα» → κωδικός (8 πρώτοι)
function sheetOf(s: AppState, cells: Record<string, string>, title = 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΣΕΠΤΕΜΒΡΙΟΥ 2026', n = 30): RawSheet {
  const days = Array.from({ length: n }, (_, i) => String(i + 1));
  return { name: 'ΕΛΕΓΧΟΣ', rows: [
    [title],
    ['Α/Α', 'ΒΘΜ', 'Ο-Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΘΑΛΑΜΟΣ', 'ΑΡΓΕΙΑ', 'ΚΑΘΗΜΕΡΙΝΗ', 'ΣΥΝΟΛΟ', 'ΣΚΟΠΙΑ', 'ΜΑΓΕΙΡΕΙΑ', 'ΘΑΛΑΜΟΦΥΛΑΚΑΣ', ...days],
    ...s.people.slice(0, 8).map((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.room, 0, 0, 0, 0, 0, 0, ...days.map(d => cells[i + ':' + d] || null)])
  ] };
}
const bind = (sh: RawSheet): SourceBinding => { const x = bestFor('duties', [sh])!; return { file: 'x.xlsx', sheet: sh.name, header: x.header, cols: x.cols, write: true }; };
const C1 = 12;   // στήλη της 1ης του μήνα (από 0)

describe('έλεγχος υπηρεσιών: κρατιέται η εφαρμογή', () => {
  it('περνά ό,τι λείπει από την εφαρμογή· όπου διαφέρουν μένει της εφαρμογής', () => {
    const s = { ...fakeState(12), guards: { '2026-09-01': { th1: 1, mg1: 2 } } };
    // ο 1ος στο Excel σε άλλη θέση (διαφέρει), ο 2ος ίδια, ο 3ος μόνο στο Excel, ο 4ος στη θέση που στην εφαρμογή έχει ο 1ος
    const sh2 = sheetOf(s, { '0:1': 'Θ2α', '1:1': 'Μ1', '2:1': 'Θ3α', '3:1': 'Θ1α', '4:3': 'Μ' });
    const p2 = planDuties(sh2, bind(sh2), s, '2026-09', TODAY);
    expect(p2.errors).toEqual([]);
    const day = p2.days.find(d => d.date === '2026-09-01')!;
    expect(day.differ).toEqual([expect.objectContaining({ pid: 1, excel: 'Θ2α' })]);
    expect(day.adds).toEqual([expect.objectContaining({ pid: 3, k: 'th3' }), expect.objectContaining({ pid: 4, kind: 'th', by: 1 })]); expect(day.adds[1].k).toBeUndefined();
    expect(day.locked).toBe(true);
    const r = run(s, { t: 'importDuties', ...dutiesCmd(p2), source: 'x' });
    expect(r.state.guards['2026-09-01']).toEqual({ th1: 1, mg1: 2, th3: 3 });
    expect(r.state.dutyLog['2026-09-01']).toEqual([{ pid: 4, kind: 'th' }]);
    expect(r.state.dutyLog['2026-09-03']).toEqual([{ pid: 5, kind: 'mg' }]);
    // όσα έδειξε η προεπισκόπηση, τόσα περνούν (B6)
    expect(p2.changes).toBe(3); expect(r.text).toMatch(/: 3 υπηρεσίες σε 2 μέρες/);
  });

  it('ό,τι έχει μόνο η εφαρμογή φαίνεται («θα γραφτεί στο Excel») και η μέρα δεν είναι «ίδια»· η εγγραφή πίσω το γράφει', () => {
    const s = { ...fakeState(12), guards: { '2026-09-01': { th1: 1, mg2: 6 }, '2026-09-04': { th2: 2 } } };
    const sh = sheetOf(s, { '0:1': 'Θ1α' });
    const b = bind(sh); const p = planDuties(sh, b, s, '2026-09', TODAY);
    expect(p.same).toBe(0); expect(p.changes).toBe(0);
    expect(p.days.map(d => [d.date, d.extra.map(x => x.pid)])).toEqual([['2026-09-01', [6]], ['2026-09-04', [2]]]);
    const s2 = run(s, { t: 'importDuties', ...dutiesCmd(p), source: 'x' }).state;
    expect(s2).toBe(s);
    const w = planDutiesWrite(sh, b, s2, TODAY, p.keys);
    expect(w.sets).toEqual(expect.arrayContaining([{ r: 7, c: C1, v: 'Μ2' }, { r: 3, c: C1 + 3, v: 'Θ2α' }]));
    expect(w.sets).toHaveLength(2);
  });

  it('ξανά η ίδια ανάγνωση: τίποτα νέο (idempotent)· η εγγραφή πίσω δεν σβήνει τίποτα του Excel', () => {
    const s = { ...fakeState(12), guards: { '2026-09-01': { th1: 2 } } };
    const sh = sheetOf(s, { '0:1': 'Θ1α', '1:1': 'Μ', '3:3': 'Θ2β', '5:2': 'Κ.Α' });
    const b = bind(sh);
    const p = planDuties(sh, b, s, '2026-09', TODAY);
    const s2 = run(s, { t: 'importDuties', ...dutiesCmd(p), source: 'x' }).state;
    expect(s2.guards['2026-09-01']).toEqual({ th1: 2 });   // κρατιέται της εφαρμογής· ο 1ος χωρίς θέση, ο 2ος έχει θέση
    expect(s2.dutyLog['2026-09-01']).toEqual([{ pid: 1, kind: 'th' }]);
    const p2 = planDuties(sh, b, s2, '2026-09', TODAY, {}, p.keys);
    expect(p2.changes).toBe(0);
    expect(run(s2, { t: 'importDuties', ...dutiesCmd(p2), source: 'x' }).state).toBe(s2);
    const w = planDutiesWrite(sh, b, s2, TODAY, p.keys);
    expect(w.sets.filter(x => x.v == null)).toEqual([]);
    expect(w.sets).toEqual([{ r: 2, c: C1, v: 'Θ' }, { r: 3, c: C1, v: 'Θ1α' }]);   // ο 1ος έχασε τη Θ1α στην εφαρμογή (του 2ου)
  });

  it('ίδιος κωδικός θέσης δύο φορές την ίδια μέρα: η μέρα στα λάθη, δεν περνά, δεν γράφεται', () => {
    const s = { ...fakeState(12), guards: { '2026-09-02': { th1: 5 } } };
    const sh = sheetOf(s, { '0:2': 'Θ1α', '2:2': 'Θ1α', '1:2': 'Μ1', '3:4': 'Μ2' });
    const b = bind(sh); const p = planDuties(sh, b, s, '2026-09', TODAY);
    expect(p.errors).toEqual([expect.objectContaining({ date: '2026-09-02' })]);
    expect(p.errors[0].text).toMatch(/Θ1α δύο φορές/);
    expect(p.days.map(d => d.date)).toEqual(['2026-09-04']);
    const s2 = run(s, { t: 'importDuties', ...dutiesCmd(p), source: 'x' }).state;
    expect(s2.guards['2026-09-02']).toEqual({ th1: 5 }); expect(s2.dutyLog['2026-09-02']).toBeUndefined();
    // και αν την στείλει κάποιος, η εντολή δεν την περνά
    expect(run(s, { t: 'importDuties', days: { '2026-09-02': [{ pid: 1, k: 'th1', kind: 'th', raw: 'Θ1α' }, { pid: 3, k: 'th1', kind: 'th', raw: 'Θ1α' }] }, source: 'x' }).state).toBe(s);
    expect(planDutiesWrite(sh, b, s2, TODAY, p.keys).sets.filter(x => x.c === C1 + 1)).toEqual([]);
  });

  it('μελλοντικές μέρες: φαίνονται με την ημερομηνία τους, δεν περνούν ποτέ', () => {
    const s = fakeState(12);
    const sh = sheetOf(s, { '0:5': 'Θ1α', '0:20': 'Θ2α', '1:12': 'Μ1' }, 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΟΚΤΩΒΡΙΟΥ 2026', 31);
    const p = planDuties(sh, bind(sh), s, '2026-10', TODAY);
    expect(p.future).toEqual(['2026-10-20']);
    expect(p.days.map(d => d.date)).toEqual(['2026-10-05', '2026-10-12']);
    expect(p.days.find(d => d.date === '2026-10-12')!.locked).toBe(false);
    const s2 = run(s, { t: 'importDuties', days: { ...dutiesCmd(p).days, '2026-10-20': [{ pid: 1, k: 'th2', kind: 'th', raw: 'Θ2α' }] }, source: 'x' }).state;
    expect(s2.guards['2026-10-20']).toBeUndefined();
    expect(s2.guards['2026-10-05']).toEqual({ th1: 1 });
  });

  it('η εγγραφή πίσω δεν σβήνει υπηρεσία του Excel που δεν είδε ποτέ η εφαρμογή (π.χ. πριν από ανάγνωση)', () => {
    const s = { ...fakeState(12), guards: { '2026-09-01': { th1: 1 } } };
    const sh = sheetOf(s, { '2:1': 'Μ3', '4:1': 'Θ' });
    const w = planDutiesWrite(sh, bind(sh), s, TODAY);
    expect(w.sets).toEqual([{ r: 2, c: C1, v: 'Θ1α' }]);
    expect(w.warn?.join(' ')).toMatch(/2 υπηρεσίες του Excel δεν είναι ακόμα στην εφαρμογή/);
  });

  it('ό,τι είχε δει η εφαρμογή και το έσβησες εκεί: δεν ξαναμπαίνει, και σβήνεται από το Excel', () => {
    const s = fakeState(12);
    const sh = sheetOf(s, { '0:1': 'Θ1α', '1:1': 'Μ1' });
    const b = bind(sh);
    const p = planDuties(sh, b, s, '2026-09', TODAY);
    let s2 = run(s, { t: 'importDuties', ...dutiesCmd(p), source: 'x' }).state;
    s2 = run(s2, { t: 'assign', date: '2026-09-01', k: 'mg1', pid: null }).state;   // βγήκε ο 2ος από τα μαγειρεία
    const p2 = planDuties(sh, b, s2, '2026-09', TODAY, {}, p.keys);
    expect(p2.changes).toBe(0);
    expect(p2.days[0].gone).toEqual([{ pid: 2, excel: 'Μ1' }]);
    expect(run(s2, { t: 'importDuties', ...dutiesCmd(p2), source: 'x' }).state).toBe(s2);
    expect(planDutiesWrite(sh, b, s2, TODAY, p2.keys).sets).toEqual([{ r: 3, c: C1, v: null }]);
  });
});
