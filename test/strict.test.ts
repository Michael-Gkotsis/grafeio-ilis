// «Αυστηρά Άοπλοι» (σχέδιο 11/10, R13): οι άοπλοι πρώτα στα μαγειρεία, μετά 2ο-3ο, μετά 1ο-4ο νούμερο· σκοποί μόνο ένοπλοι.
// Κλειστό εξ ορισμού: τότε δεν αλλάζει τίποτα. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { fillDay, isUnarmed, nextFor, postsOf, strictTier, whyText } from '../src/shared/rules';
import { addDays } from '../src/shared/dates';
import type { AppState, Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-14';
const AOPLO = [2, 4, 7, 10, 13, 16];
const EA = 19;
// ΣΠΕΝ, 20 άτομα: 6 με Σ.Ι. Ι3 ΑΟΠΛΟ, ένας ΕΑ, ένας με πόστο (ο 6 από τα fixtures)
function base(opArmed = false, strict = true): AppState {
  const s = fakeState(20);
  s.people = s.people.map(p => ({ ...p, si: AOPLO.includes(p.id) ? 'Ι3 ΑΟΠΛΟ' : 'Ι1' }));
  const st: Status = { id: 'ea', pid: EA, type: 'EA', from: '2026-10-10', to: '2026-10-20' };
  return {
    ...s, statuses: [st], rules: { ...s.rules, strictUnarmed: strict },
    settings: { ...s.settings, phase: 'spen', blocksSpen: s.settings.blocksSpen.map(b => (b.kind === 'op' ? { ...b, armed: opArmed } : b)) }
  };
}
const unarmed = new Set([...AOPLO, EA]);
const seat = (s: AppState, k: string) => postsOf(s.settings).find(x => x.k === k)!;

describe('Αυστηρά Άοπλοι', () => {
  it('άοπλος: ΕΑ, Ι3 ΑΟΠΛΟ, όχι ο Ι1', () => {
    const s = base();
    expect(isUnarmed(s, D, EA)).toBe(true); expect(isUnarmed(s, D, 2)).toBe(true); expect(isUnarmed(s, D, 1)).toBe(false);
    expect(isUnarmed(s, '2026-10-25', EA)).toBe(false);   // μετά το τέλος της ΕΑ
  });
  it('άοπλος και όποιος «δεν κάνει» με το χέρι όλα τα ένοπλα είδη', () => {
    const s = { ...base(true), caps: { 1: { op: 'λοχίας', sk: 'λοχίας', tae: 'λοχίας' }, 3: { sk: 'λοχίας' } } };
    expect(isUnarmed(s, D, 1)).toBe(true); expect(isUnarmed(s, D, 3)).toBe(false);
  });
  it('βαθμίδες θέσεων: μαγειρεία, 2ο-3ο, 1ο-4ο νούμερο, άλλες', () => {
    const s = base();
    expect(['mg1', 'th2', 'th3', 'op2', 'th1', 'th4', 'op4', 'sk3a', 'tae', 'ly'].map(k => strictTier(seat(s, k)))).toEqual([1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
    expect(strictTier(seat(base(true), 'op2'))).toBe(4);    // ένοπλος οπλοφύλακας: όχι για άοπλους
  });
  it('ανοιχτό: τα 5 μαγειρεία παίρνουν άοπλοι, ο άλλος ΑΟΠΛΟ και ο ΕΑ πάνε 2ο-3ο νούμερο, κανείς άοπλος σε σκοπιά', () => {
    const s0 = base(); const g = fillDay(s0, D).guards[D]; const s = { ...s0, guards: { [D]: g } };
    const mg = ['mg1', 'mg2', 'mg3', 'mg4', 'mg5'].map(k => g[k]);
    expect(mg.every(pid => AOPLO.includes(pid))).toBe(true);
    const rest = [...unarmed].filter(pid => !mg.includes(pid));
    expect(rest).toHaveLength(2);
    for (const pid of rest) { const k = Object.keys(g).find(x => g[x] === pid)!; expect(strictTier(seat(s, k))).toBe(2); }
    expect(Object.keys(g).filter(k => k.startsWith('sk')).some(k => unarmed.has(g[k]))).toBe(false);
    expect(whyText(s, D, 'mg1')).toMatch(/Αυστηρά Άοπλοι: άοπλος, προτεραιότητα σε μαγειρεία/);
  });
  it('με ένοπλο οπλοφύλακα κανείς άοπλος στους οπλοφύλακες', () => {
    const s = base(true); const g = fillDay(s, D).guards[D];
    expect(['op1', 'op2', 'op3', 'op4'].some(k => unarmed.has(g[k]))).toBe(false);
  });
  it('άοπλη σκοπιά: με «Αυστηρά Άοπλοι» ούτε ΕΑ ως τελευταία λύση, η θέση μένει κενή και το λέει', () => {
    const s0 = base();
    // σκοπιές άοπλες, όλες οι άλλες θέσεις πιασμένες· σε δύναμη μόνο ο ΕΑ και δύο ΑΟΠΛΟ
    const blocksSpen = s0.settings.blocksSpen.map(b => (b.kind === 'sk' ? { ...b, armed: false } : b));
    const s1: AppState = { ...s0, people: s0.people.map(p => ({ ...p, active: [EA, 2, 4].includes(p.id) })), settings: { ...s0.settings, blocksSpen } };
    const taken = Object.fromEntries(postsOf(s1.settings).filter(x => x.kind !== 'sk').map(x => [x.k, 1]));
    const s: AppState = { ...s1, guards: { [D]: taken } };
    const r = fillDay(s, D);
    expect(Object.keys(r.guards[D]).some(k => k.startsWith('sk'))).toBe(false);
    expect(r.warn.some(w => /Αυστηρά Άοπλοι: σκοπιά μόνο ένοπλοι/.test(w))).toBe(true);
    expect(nextFor(s, D, 'sk3a', [])).toBeNull();
    // κλειστό: η σκοπιά είναι άοπλη, οπότε μπαίνουν και οι Ι3 ΑΟΠΛΟ (Σ.Ι. ανά υπηρεσία, 13/10)· ο ΕΑ μόνο ως τελευταία λύση
    const off = { ...s, rules: { ...s.rules, strictUnarmed: false } };
    const sk = Object.entries(fillDay(off, D).guards[D]).filter(([k]) => k.startsWith('sk')).map(([, v]) => v);
    expect(sk.length).toBe(3); expect(sk.filter(x => x !== EA).every(x => AOPLO.includes(x))).toBe(true);
    expect(AOPLO).toContain(nextFor(off, D, 'sk3a', []));
  });
  it('«Επόμενος» σε μαγειρεία προτείνει πρώτα άοπλο', () => {
    const s = base();
    expect(AOPLO).toContain(nextFor(s, D, 'mg1', []));
    const off = { ...s, rules: { ...s.rules, strictUnarmed: false } };
    expect(nextFor(off, D, 'mg1', [])).not.toBeNull();
  });
  it('κλειστό ή χωρίς ρύθμιση: ίδια συμπλήρωση σε έναν μήνα', () => {
    let a = base(false, false), b = base(false, false);
    delete b.rules.strictUnarmed;
    for (let d = '2026-10-01'; d <= '2026-10-31'; d = addDays(d, 1)) { a = { ...a, guards: fillDay(a, d).guards }; b = { ...b, guards: fillDay(b, d).guards }; }
    expect(a.guards).toEqual(b.guards);
  });
  it('ανοιχτό σε έναν μήνα: οι κανόνες ανάπαυσης ισχύουν και καμία ένοπλη θέση δεν μένει κενή περισσότερο από κλειστό', () => {
    let on = base(), off = base(false, false); let eOn = 0, eOff = 0;
    for (let d = '2026-10-01'; d <= '2026-10-31'; d = addDays(d, 1)) {
      const r1 = fillDay(on, d), r2 = fillDay(off, d);
      on = { ...on, guards: r1.guards }; off = { ...off, guards: r2.guards };
      eOn += r1.empty.filter(k => seat(on, k).armed).length; eOff += r2.empty.filter(k => seat(off, k).armed).length;
    }
    expect(eOn).toBeLessThanOrEqual(eOff);
    const days = Object.keys(on.guards).sort();
    for (let i = 1; i < days.length; i++) {
      const prev = new Set(Object.values(on.guards[days[i - 1]])); const cur = Object.values(on.guards[days[i]]);
      expect(cur.some(pid => prev.has(pid))).toBe(false);   // ανάπαυση 1 ημέρας
    }
  });
});
