// Έλεγχος υπηρεσιών από Excel: το Excel κερδίζει (απόφαση 11/10). Κάθε μέρα ως σήμερα γίνεται ίδια με το Excel, με
// προεπισκόπηση ανά θέση· μέρα με ίδιο κωδικό δύο φορές δεν περνά, μελλοντικές μέρες ποτέ. Μόνο ψεύτικα ονόματα.
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

describe('έλεγχος υπηρεσιών: το Excel κερδίζει', () => {
  it('θέση που έχει μόνο η εφαρμογή φαίνεται ως αφαίρεση και φεύγει· η μέρα γίνεται ίδια με το Excel', () => {
    const s = { ...fakeState(12), guards: { '2026-09-01': { th1: 1, mg1: 2, th2: 3 } }, dutyLog: { '2026-09-01': [{ pid: 4, kind: 'mg' as const }] } };
    const sh = sheetOf(s, { '0:1': 'Θ1α', '2:1': 'Θ3α', '4:1': 'Μ' });
    const p = planDuties(sh, bind(sh), s, '2026-09', TODAY);
    expect(p.days.map(d => d.date)).toEqual(['2026-09-01']);
    const day = p.days[0];
    expect(day.locked).toBe(true);
    // πριν → μετά ανά θέση: ο 2ος βγαίνει από τα μαγειρεία, ο 3ος πάει από Θ2α σε Θ3α, ο 4ος χάνει τη χωρίς θέση, ο 5ος μπαίνει χωρίς θέση
    expect(day.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'mg1', from: 2, to: null }), expect.objectContaining({ key: 'th2', from: 3, to: null }), expect.objectContaining({ key: 'th3', from: null, to: 3 }),
      expect.objectContaining({ from: 4, to: null }), expect.objectContaining({ from: null, to: 5 })
    ]));
    expect(day.lines).toHaveLength(5); expect(p.changes).toBe(5);
    const r = run(s, { t: 'importDuties', ...dutiesCmd(p), source: 'x' });
    expect(r.state.guards['2026-09-01']).toEqual({ th1: 1, th3: 3 });
    expect(r.state.dutyLog['2026-09-01']).toEqual([{ pid: 5, kind: 'mg' }]);
    // όσες αλλαγές έδειξε η προεπισκόπηση, τόσες περνούν (B6)
    expect(r.text).toMatch(/: 5 αλλαγές σε 1 μέρα/);
    expect(r.state.baseline).toEqual({});
  });

  it('ξανά η ίδια ανάγνωση: καμία αλλαγή (idempotent)', () => {
    const s = { ...fakeState(12), guards: { '2026-09-01': { th1: 2 } } };
    const sh = sheetOf(s, { '0:1': 'Θ1α', '1:1': 'Μ', '3:3': 'Θ2β' });
    const b = bind(sh);
    const s2 = run(s, { t: 'importDuties', ...dutiesCmd(planDuties(sh, b, s, '2026-09', TODAY)), source: 'x' }).state;
    const p2 = planDuties(sh, b, s2, '2026-09', TODAY);
    expect(p2.days).toEqual([]); expect(p2.changes).toBe(0); expect(p2.same).toBe(2);
    expect(run(s2, { t: 'importDuties', ...dutiesCmd(p2), source: 'x' }).state).toBe(s2);
  });

  it('ίδιος κωδικός θέσης δύο φορές την ίδια μέρα: η μέρα στα λάθη και δεν περνά', () => {
    const s = { ...fakeState(12), guards: { '2026-09-02': { th1: 5 } } };
    const sh = sheetOf(s, { '0:2': 'Θ1α', '2:2': 'Θ1α', '1:2': 'Μ1', '3:4': 'Μ2' });
    const p = planDuties(sh, bind(sh), s, '2026-09', TODAY);
    expect(p.errors).toEqual([expect.objectContaining({ date: '2026-09-02' })]);
    expect(p.errors[0].text).toMatch(/Θ1α δύο φορές/);
    expect(p.days.map(d => d.date)).toEqual(['2026-09-04']);
    const s2 = run(s, { t: 'importDuties', ...dutiesCmd(p), source: 'x' }).state;
    expect(s2.guards['2026-09-02']).toEqual({ th1: 5 }); expect(s2.dutyLog['2026-09-02']).toBeUndefined();
    expect(s2.guards['2026-09-04']).toEqual({ mg2: 4 });
  });

  it('μελλοντικές μέρες: φαίνονται στην προεπισκόπηση, δεν περνούν ποτέ (ούτε αν τις στείλει κάποιος)', () => {
    const s = fakeState(12);
    const sh = sheetOf(s, { '0:5': 'Θ1α', '0:20': 'Θ2α', '1:12': 'Μ1' }, 'ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΟΚΤΩΒΡΙΟΥ 2026', 31);
    const p = planDuties(sh, bind(sh), s, '2026-10', TODAY);
    expect(p.future).toEqual(['2026-10-20']);
    expect(p.days.map(d => d.date)).toEqual(['2026-10-05', '2026-10-12']);
    expect(p.days.find(d => d.date === '2026-10-12')!.locked).toBe(false);   // σήμερα: δεν είναι κλειδωμένη
    const s2 = run(s, { t: 'importDuties', days: { ...dutiesCmd(p).days, '2026-10-20': { seats: { th2: 1 }, seatless: [] } }, source: 'x' }).state;
    expect(s2.guards['2026-10-20']).toBeUndefined();
    expect(s2.guards['2026-10-05']).toEqual({ th1: 1 });
  });

  it('όσοι δεν είναι στο φύλλο κρατούν τις υπηρεσίες τους· μέρες κενές στο Excel δεν αλλάζουν', () => {
    // ο 10ος δεν έχει γραμμή στο φύλλο (π.χ. νέος στρατιώτης): το Excel δεν λέει τίποτα γι' αυτόν
    const s = { ...fakeState(12), guards: { '2026-09-01': { th1: 2, mg3: 10 }, '2026-09-03': { th1: 1 } }, dutyLog: { '2026-09-01': [{ pid: 11, kind: 'th' as const }] } };
    const sh = sheetOf(s, { '0:1': 'Θ1α' });
    const p = planDuties(sh, bind(sh), s, '2026-09', TODAY);
    expect(p.appOnly).toEqual(['2026-09-03']);
    const s2 = run(s, { t: 'importDuties', ...dutiesCmd(p), source: 'x' }).state;
    expect(s2.guards['2026-09-01']).toEqual({ th1: 1, mg3: 10 });
    expect(s2.dutyLog['2026-09-01']).toEqual([{ pid: 11, kind: 'th' }]);
    expect(s2.guards['2026-09-03']).toEqual({ th1: 1 });
  });

  it('η εγγραφή πίσω μετά την ανάγνωση δεν αλλάζει κανένα κελί, ούτε στη μέρα με το λάθος', () => {
    const s = { ...fakeState(12), guards: { '2026-09-01': { th1: 2, mg1: 6 }, '2026-09-02': { th1: 5 } } };
    const sh = sheetOf(s, { '0:1': 'Θ1α', '3:1': 'Μ', '0:2': 'Θ1α', '2:2': 'Θ1α', '7:9': 'Κ.Α' });
    const b = bind(sh);
    const p = planDuties(sh, b, s, '2026-09', TODAY);
    const s2 = run(s, { t: 'importDuties', ...dutiesCmd(p), source: 'x' }).state;
    const w = planDutiesWrite(sh, b, s2, TODAY);
    expect(w.sets).toEqual([]);
    expect(w.warn?.join(' ')).toMatch(/02\/09.*ίδιο κωδικό/);
  });

  it('η προεπισκόπηση δείχνει όσες αλλαγές περνούν και όταν ο ίδιος είναι δύο φορές στη μέρα', () => {
    // ο 1ος είναι στο φύλλο και με θέση και ξανά σε δεύτερη γραμμή: κρατιέται η πρώτη γραμμή (όπως πριν)
    const s = fakeState(12);
    const sh = sheetOf(s, { '0:1': 'Θ1α', '1:1': 'Μ1' });
    sh.rows.push([9, s.people[0].rank, s.people[0].spec, s.people[0].last, s.people[0].first, s.people[0].room, 0, 0, 0, 0, 0, 0, 'Μ2']);
    const p = planDuties(sh, bind(sh), s, '2026-09', TODAY);
    expect(p.sp.dup).toBe(1);
    const r = run(s, { t: 'importDuties', ...dutiesCmd(p), source: 'x' });
    expect(r.text).toMatch(new RegExp(': ' + p.changes + ' αλλαγές'));
    expect(r.state.guards['2026-09-01']).toEqual({ th1: 1, mg1: 2 });
  });
});
