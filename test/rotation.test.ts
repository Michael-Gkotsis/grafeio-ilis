// Εναλλαγή υπηρεσιών (Michael, 18/10): κανείς δεν ξανακάνει την ίδια υπηρεσία όσο άλλος, που είναι η σειρά του, δεν την έχει κάνει.
import { describe, it, expect } from 'vitest';
import { dutyStats, fairOf, fillDay, whyText } from '../src/shared/rules';
import { addDays } from '../src/shared/dates';
import type { AppState, Phase } from '../src/shared/domain';
import { fakeState } from './fixtures';

const KINDS = ['th', 'mg', 'sk', 'op', 'tae'];
// 60 μέρες αυτόματη συμπλήρωση, μόνιμοι Λ/Υ (1) και Δ/Υ (2)
function run(phase: Phase, rotate: boolean): AppState {
  let s = fakeState(45);
  s = { ...s, settings: { ...s.settings, phase, fixed: { ly: 1, dy: 2 } }, rules: { ...s.rules, rotate } };
  let d = '2026-11-02';
  for (let i = 0; i < 60; i++) { s = { ...s, guards: fillDay(s, d).guards }; d = addDays(d, 1); }
  return s;
}
// εύρος (μέγιστο - ελάχιστο) ανά είδος, μόνο ανάμεσα σε όσους κάνουν όλα τα είδη (όχι μόνιμοι, πόστο, Ι3 ΑΟΠΛΟ)
function spread(s: AppState) {
  const st = dutyStats(s); const by: Record<string, number[]> = {}; const tot: number[] = [];
  for (const p of s.people) {
    if (p.id <= 2 || p.post || p.si !== 'Ι1') continue;
    const x = st.get(p.id); tot.push(x?.total || 0);
    for (const k of KINDS) (by[k] ||= []).push(x?.byKind[k] || 0);
  }
  const r = (a: number[]) => Math.max(...a) - Math.min(...a);
  return { kinds: Object.fromEntries(Object.entries(by).filter(([, a]) => Math.max(...a) > 0).map(([k, a]) => [k, r(a)])), tot: r(tot) };
}

describe('εναλλαγή υπηρεσιών', () => {
  it('ΣΠΕΝ: όλοι περνούν από όλες τις υπηρεσίες, χωρίς να χαλά η σειρά δικαιοσύνης στο σύνολο', () => {
    const on = spread(run('spen', true)), off = spread(run('spen', false));
    for (const k of Object.keys(on.kinds)) expect(on.kinds[k]).toBeLessThanOrEqual(3);
    // χωρίς την εναλλαγή κάποιοι έκαναν πολύ περισσότερο οπλοφύλακα από άλλους
    expect(off.kinds.op).toBeGreaterThan(on.kinds.op);
    expect(on.tot).toBeLessThanOrEqual(off.tot);
  });
  it('ΣΒΕΝ: θαλαμοφύλακας και μαγειρεία μοιράζονται σε όλους', () => {
    const on = spread(run('sven', true)), off = spread(run('sven', false));
    expect(on.kinds.th).toBeLessThanOrEqual(2);
    expect(on.kinds.mg).toBeLessThan(off.kinds.mg);
    expect(on.tot).toBeLessThanOrEqual(off.tot + 1);
  });
  it('στη μαγειρεία μπαίνει όποιος δεν την έχει κάνει, όχι όποιος την έκανε', () => {
    // 15 άτομα (3–17) για 13 θέσεις (8 θαλαμοφύλακες, 5 μαγειρεία). Οι 3–7 έκαναν μαγειρεία πιο πρόσφατα από όσους
    // έκαναν θαλαμοφύλακα (8–15)· οι 16, 17 τίποτα. Με τη σειρά μόνο, οι θαλαμοφύλακες ξανάπαιρναν θαλαμοφύλακα.
    let s = fakeState(17); s = { ...s, people: s.people.map(p => ({ ...p, post: null, si: 'Ι1' })), settings: { ...s.settings, fixed: { ly: 1, dy: 2 } } };
    const mgDay: Record<string, number> = {}, thDay: Record<string, number> = {};
    for (let i = 0; i < 5; i++) mgDay['mg' + (i + 1)] = 3 + i;
    for (let i = 0; i < 8; i++) thDay['th' + (i + 1)] = 8 + i;
    s = { ...s, guards: { '2026-10-30': thDay, '2026-11-01': mgDay } };
    const D = '2026-11-04';
    const mg = postsOfKind(fillDay(s, D).guards[D], 'mg');
    expect(mg).toHaveLength(5);
    for (const pid of mg) expect(pid).toBeGreaterThanOrEqual(8);
    const off = postsOfKind(fillDay({ ...s, rules: { ...s.rules, rotate: false } }, D).guards[D], 'mg');
    expect(off.some(pid => pid < 8)).toBe(true);
  });
  it('«Γιατί»: πόσες φορές έχει κάνει αυτή την υπηρεσία', () => {
    let s = fakeState(20); const D = '2026-11-04';
    s = { ...s, guards: { '2026-11-01': { mg1: 3 } } };
    s = { ...s, guards: { ...s.guards, [D]: { mg2: 3, mg3: 4 } } };
    expect(fairOf(s, 3, D).byType.mg).toBe(1);
    expect(whyText(s, D, 'mg2')).toMatch(/μαγειρεία 1 φορά πριν/);
    expect(whyText(s, D, 'mg3')).toMatch(/πρώτη φορά μαγειρεία/);
    expect(whyText({ ...s, rules: { ...s.rules, rotate: false } }, D, 'mg3')).not.toMatch(/μαγειρεία/);
  });
});
const postsOfKind = (g: Record<string, number>, kind: string) => Object.entries(g).filter(([k]) => k.startsWith(kind)).map(([, p]) => p);
