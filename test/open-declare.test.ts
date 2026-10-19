// «Χωρίς λήξη» στη δήλωση ΣΤΕΠ, ιατρικών και νοσοκομείου (Michael, 19/10: «στα ΣΤΕΠ και καταστάσεις θέλουμε και την επιλογή χωρίς λήξη»).
// Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { coversDay, type AppState } from '../src/shared/domain';
import { fieldValue } from '../src/shared/sources';
import { outBlock } from '../src/shared/rules';
import { fakeState } from './fixtures';

const TODAY = '2026-10-19';
let seq = 0;
const ctx = (today = TODAY): Ctx => ({ today, newId: () => 'o' + ++seq });
const run = (s: AppState, c: Command, today = TODAY) => apply(s, c, ctx(today));

describe('δήλωση χωρίς λήξη', () => {
  it('ΣΤΕΠ: open, «έως» = σήμερα, ισχύει και σε μακρινές μέρες, κενό «έως» στο Excel', () => {
    const r = run(fakeState(10), { t: 'declare', cmd: { type: 'STEP', pids: [2], from: '2026-10-17', to: '2026-10-17', toTime: '20:00', open: true } });
    const st = r.state.statuses[0];
    expect(st).toMatchObject({ type: 'STEP', from: '2026-10-17', to: TODAY, open: true });
    expect(st.toTime).toBeUndefined();
    expect(coversDay(st, '2027-01-05')).toBe(true);
    expect(r.text).toMatch(/από 17\/10 χωρίς λήξη/);
    expect(fieldValue('to', 'step', st, undefined)).toBeNull();
    expect(outBlock(r.state, '2026-12-24', 2)).toBeTruthy();
  });
  it('από μελλοντική μέρα: «έως» = «από»', () => {
    const st = run(fakeState(10), { t: 'declare', cmd: { type: 'EY', pids: [3], from: '2026-10-22', to: '2026-10-22', open: true } }).state.statuses[0];
    expect(st).toMatchObject({ from: '2026-10-22', to: '2026-10-22', open: true });
  });
  it('βγάζει τον στρατιώτη από υπηρεσίες και εξόδους μετά το αρχικό «έως»', () => {
    const s: AppState = { ...fakeState(10), guards: { '2026-11-03': { th1: 4 } },
      statuses: [{ id: 'x', pid: 4, type: 'OUT', from: '2026-11-07', to: '2026-11-07' }] };
    const r = run(s, { t: 'declare', cmd: { type: 'STEP', pids: [4], from: TODAY, to: TODAY, open: true } });
    expect(r.state.guards['2026-11-03']?.th1).toBeUndefined();
    expect(r.state.statuses.filter(x => x.type === 'OUT')).toEqual([]);
  });
  it('πολλά ιατρικά μαζί', () => {
    const r = run(fakeState(10), { t: 'declareMany', cmds: [{ type: 'EY', pids: [5], from: TODAY, to: TODAY, open: true }, { type: 'EA', pids: [5], from: TODAY, to: TODAY, open: true }] });
    expect(r.state.statuses.every(x => x.open)).toBe(true);
    expect(r.text).toMatch(/χωρίς λήξη/);
  });
  it('η ίδια δήλωση δεύτερη φορά δεν γράφεται διπλή', () => {
    const c: Command = { t: 'declare', cmd: { type: 'STEP', pids: [2], from: TODAY, to: TODAY, open: true } };
    expect(() => run(run(fakeState(10), c).state, c)).toThrow(/έχει ήδη/);
  });
  it('όχι σε άδειες, ποινές, εξόδους', () => {
    for (const type of ['LEAVE', 'PUN', 'OUT'] as const)
      expect(() => run(fakeState(10), { t: 'declare', cmd: { type, pids: [2], from: TODAY, to: TODAY, open: true } })).toThrow(/μόνο ιατρικά, ΣΤΕΠ και νοσοκομείο/);
  });
});
