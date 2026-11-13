// Λειτουργία μονάδας, μέρος 3: δύο υπηρεσίες την ίδια μέρα (never / last / free), ⚠ «2η υπηρεσία», «Θ3/Μ2» στο Excel.
// Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { DEFAULT_BLOCKS, type AppState, type Rules } from '../src/shared/domain';
import { readDuties } from '../src/shared/codes';
import { fillDay, guardUnavailable, dutyStats, secondDuty, whyText } from '../src/shared/rules';
import { dutiesCmd, planDuties, bestFor, type SourceBinding } from '../src/shared/sources';
import type { RawSheet } from '../src/shared/roster';
import { preflight } from '../src/shared/preflight';
import { Workbook } from '../src/main/xlsx';
import { dutyCheck } from '../src/main/excel';
import { fakeState } from './fixtures';

const D = '2026-10-14';
let seq = 0;
const ctx: Ctx = { today: '2026-10-20', newId: () => 'u' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx);
// θαλαμοφύλακες 1ος-4ος (βάρδιες 14-16/22-00/06-08, 16-18/00-02/08-10, …) και ένα μαγειρείο 10:00-12:00: μόνο ο 1ος θαλαμοφύλακας χωρά (κενό 2 ώρες)
function base(n: number, unit: boolean, rules: Partial<Rules> = {}, mgHrs = '10:00-12:00'): AppState {
  const s = fakeState(n);
  const th = DEFAULT_BLOCKS.find(b => b.id === 'th')!; const mg = DEFAULT_BLOCKS.find(b => b.id === 'mg')!;
  s.people = s.people.map(p => ({ ...p, si: 'Ι1', post: null, rank: 'ΣΤΡ' }));
  return { ...s, rules: { ...s.rules, restDays: 0, ...rules }, settings: { ...s.settings, phase: 'sven', ...(unit ? { mode: 'unit' as const } : {}),
    blocks: [th, { ...mg, posts: [{ ...mg.posts[0], hrs: mgHrs }] }] } };
}
const filled = (s: AppState) => fillDay(s, D);

describe('δύο υπηρεσίες την ίδια μέρα', () => {
  it('κέντρο: όποιος έχει ήδη υπηρεσία δεν παίρνει δεύτερη (όπως πάντα)', () => {
    const r = filled(base(4, false));
    expect(Object.keys(r.guards[D])).toHaveLength(4); expect(r.empty).toEqual(['mg1']);
  });
  it('μονάδα «Ποτέ»: όπως το κέντρο', () => {
    const r = filled(base(4, true, { twoPerDay: 'never' }));
    expect(r.guards[D]).toEqual(filled(base(4, false)).guards[D]); expect(r.empty).toEqual(['mg1']);
  });
  it('«Όποτε χρειαστεί» και «Μόνο αν δεν υπάρχει άλλος»: 2η υπηρεσία όταν λείπουν άτομα, μόνο όποιος χωρά (ο 1ος θαλαμοφύλακας), με ⚠', () => {
    for (const mode of ['free', 'last'] as const) {
      const s = base(4, true, { twoPerDay: mode }); const r = filled(s);
      expect(r.empty, mode).toEqual([]);
      const g = r.guards[D]; expect(g.mg1, mode).toBe(g.th1);
      expect(r.warn.join('|')).toContain('2η υπηρεσία σήμερα: Θαλαμοφύλακας 1ος');
      expect(secondDuty({ ...s, guards: { [D]: g } }, D, g.mg1, 'mg1')).toContain('2η υπηρεσία σήμερα: Θαλαμοφύλακας 1ος');
    }
  });
  it('προεπιλογή στη μονάδα = «Μόνο αν δεν υπάρχει άλλος»', () => {
    expect(filled(base(4, true)).empty).toEqual([]);
  });
  it('«Μόνο αν δεν υπάρχει άλλος»: με αρκετά άτομα κανείς δεν παίρνει δεύτερη', () => {
    for (const mode of ['last', 'free'] as const) {
      const g = filled(base(6, true, { twoPerDay: mode })).guards[D];
      expect(new Set(Object.values(g)).size).toBe(Object.keys(g).length);
    }
  });
  it('κενό ωρών: με κενό 3 ώρες ο 1ος θαλαμοφύλακας δεν χωρά (μένει κενό)· επικάλυψη ποτέ', () => {
    expect(filled(base(4, true, { twoPerDay: 'free', twoGap: 3 })).empty).toEqual(['mg1']);
    expect(filled(base(4, true, { twoPerDay: 'free', twoGap: 0 }, '05:00-13:00')).empty).toEqual(['mg1']);   // πέφτει πάνω σε βάρδια κάθε θαλαμοφύλακα
    const s = base(4, true, { twoPerDay: 'free', twoGap: 0 }, '12:00-13:00');
    expect(filled(s).empty).toEqual([]);
  });
  it('χειροκίνητα: δεν μπλοκάρει όταν χωρά, μπλοκάρει όταν πέφτουν μαζί', () => {
    const s = { ...base(4, true, { twoPerDay: 'free' }), guards: { [D]: { th1: 1, th2: 2 } } };
    expect(guardUnavailable(s, D, 1, 'mg1')).toBeNull();
    expect(guardUnavailable(s, D, 2, 'mg1')).toContain('Ήδη');
    expect(guardUnavailable({ ...s, rules: { ...s.rules, twoPerDay: 'never' } }, D, 1, 'mg1')).toContain('Ήδη');
    expect(guardUnavailable({ ...s, settings: { ...s.settings, mode: undefined } }, D, 1, 'mg1')).toContain('Ήδη');
  });
  it('η 2η υπηρεσία μετρά δύο στη δικαιοσύνη· «Γιατί αυτός;» και έλεγχος πριν το Excel με ⚠', () => {
    const s0 = base(4, true, { twoPerDay: 'free' }); const g = filled(s0).guards[D];
    const s = { ...s0, guards: { [D]: g } };
    expect(dutyStats(s).get(g.th1)!.total).toBe(2);
    expect(whyText(s, D, 'mg1')).toContain('⚠ 2η υπηρεσία σήμερα');
    const w = preflight('froura' as any, s, D).filter(c => c.text.includes('2η υπηρεσία'));
    expect(w).toHaveLength(1); expect(w[0].level).toBe('warn');
  });
});

describe('Έλεγχος υπηρεσιών Excel με δύο υπηρεσίες', () => {
  it('γράφεται «Θ1Α/Μ1» με κεφαλαία στη μονάδα· στο κέντρο μία μόνο όπως πριν', async () => {
    const cell = async (s: AppState) => { const wb = await Workbook.open((await dutyCheck(s, '2026-10')).data); const rows = await wb.values(wb.sheetNames()[0]); return rows.find(x => x[2] === s.people[0].last)![rows[2].indexOf('14')]; };
    const s = { ...base(4, true), guards: { [D]: { th1: 1, mg1: 1 } } };
    expect(await cell(s)).toBe('Θ1Α/Μ1');
    expect(await cell({ ...s, settings: { ...s.settings, mode: undefined } })).toBe('Μ1');
  });
  it('η ανάγνωση δέχεται «Θ3/Μ2» και ξαναβρίσκει και τις δύο υπηρεσίες', () => {
    const s = base(4, true); s.settings = { ...s.settings, blocks: DEFAULT_BLOCKS };
    expect(readDuties('Θ3α/Μ2', s.settings)).toEqual([{ k: 'th3', kind: 'th' }, { k: 'mg2', kind: 'mg' }]);
    expect(Array.isArray(readDuties('Θ3α/Μ2', { ...s.settings, mode: undefined }))).toBe(false);   // κέντρο: όπως πάντα
    const sheet: RawSheet = { name: 'ΕΛΕΓΧΟΣ', rows: [['ΕΛΕΓΧΟΣ ΥΠΗΡΕΣΙΩΝ ΟΚΤΩΒΡΙΟΥ 2026'], ['Α/Α', 'ΒΘΜ', 'Ο-Σ', 'ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΘΑΛΑΜΟΣ', ...Array.from({ length: 31 }, (_, i) => String(i + 1))],
      ...s.people.slice(0, 4).map((p, i) => [i + 1, p.rank, p.spec, p.last, p.first, p.room, ...Array.from({ length: 31 }, (_, d) => (i === 0 && d === 12 ? 'Θ3α/Μ2' : null))])] };
    const x = bestFor('duties', [sheet])!; const b: SourceBinding = { file: 'x.xlsx', sheet: sheet.name, header: x.header, cols: x.cols, write: true };
    const plan = planDuties(sheet, b, s, '2026-10', '2026-10-20');
    expect(plan.unknown).toEqual([]);
    const r = run(s, { t: 'importDuties', ...dutiesCmd(plan), source: 'x' });
    expect(r.state.guards['2026-10-13']).toEqual({ th3: 1, mg2: 1 });
  });
});
