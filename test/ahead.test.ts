// Κενό πριν από υπηρεσία που έβαλες ήδη (Michael, 21/10): «αν σήμερα είναι Τετάρτη και βάλω κάποιους χειροκίνητα να
// κάνουν υπηρεσία την Παρασκευή ή το ΣΚ, να μην τους υπολογίζεις 1-2 ημέρες νωρίτερα, που είναι το κενό τους».
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { dutyAhead, fillDay, nextFor, postsOf, ruleBlock, whyText } from '../src/shared/rules';
import type { AppState } from '../src/shared/domain';
import { addDays } from '../src/shared/dates';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-21', newId: () => 'a' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const WED = '2026-10-21', THU = '2026-10-22', FRI = '2026-10-23', SAT = '2026-10-24';
const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
// n άτομα, ανάπαυση rest, και με το χέρι οι who σε θέσεις της day
function placed(n: number, rest: number, day: string, who: number[], base?: AppState): AppState {
  let s = base || fakeState(n); s = { ...s, rules: { ...s.rules, restDays: rest } };
  const ks = postsOf(s.settings).map(p => p.k);
  const g: Record<string, number> = { ...(s.guards[day] || {}) }; who.forEach((pid, i) => { g[ks[i]] = pid; });
  return { ...s, guards: { ...s.guards, [day]: g } };
}
const on = (s: AppState, d: string, who: number[]) => Object.values(fillDay(s, d).guards[d]).filter(p => who.includes(p));

describe('Κενό πριν από υπηρεσία που ήδη υπάρχει', () => {
  it('ανάπαυση 1 ημέρας: όποιος έχει Παρασκευή δεν μπαίνει Πέμπτη· την Τετάρτη μπαίνει τελευταίος', () => {
    const fri = ids(10, 10); const s = placed(60, 1, FRI, fri);
    expect(on(s, THU, fri)).toEqual([]);
    expect(on(s, WED, fri)).toEqual([]);
    expect(ruleBlock(s, THU, 10)).toMatch(/Υπηρεσία 23\/10 \(ανάπαυση\)/);
    expect(dutyAhead(s, WED, 10)).toBe(FRI);
    expect(dutyAhead(s, FRI, 10)).toBeNull();
  });
  it('ανάπαυση 2 ημερών: όποιος έχει Σάββατο δεν μπαίνει ούτε Πέμπτη ούτε Παρασκευή', () => {
    const sat = ids(20, 10); const s = placed(60, 2, SAT, sat);
    expect(on(s, THU, sat)).toEqual([]);
    expect(on(s, FRI, sat)).toEqual([]);
    expect(ruleBlock(s, THU, 20)).toMatch(/ανάπαυση/);
    expect(ruleBlock(s, WED, 20)).toBeNull();
    expect(dutyAhead(s, addDays(WED, -1), 20)).toBeNull();   // Τρίτη: 4 μέρες πριν, έξω από τις 2
  });
  it('ανάπαυση 1 ημέρας: όσοι μπήκαν με το χέρι στο ΣΚ δεν προτιμώνται την Πέμπτη (πριν προηγούνταν όλοι)', () => {
    const sat = ids(20, 10); const s = placed(40, 1, SAT, sat);
    expect(on(s, THU, sat)).toEqual([]);
    expect(on(s, FRI, sat)).toEqual([]);
  });
  it('μπαίνουν μόνο αν δεν φτάνουν οι άλλοι', () => {
    const fri = ids(2, 10); const s = placed(20, 1, FRI, fri);   // 20 άτομα, 15 θέσεις την Τετάρτη
    const wed = on(s, WED, fri);
    expect(wed.length).toBeGreaterThan(0);
    expect(wed.length).toBeLessThan(fri.length);
  });
  it('«Επόμενος» τηρεί το ίδιο', () => {
    const fri = ids(10, 30); const s = placed(60, 1, FRI, fri.slice(0, 15));
    const k = postsOf(s.settings)[0].k; const seen: number[] = [];
    for (let i = 0; i < 20; i++) { const n = nextFor(s, WED, k, seen); if (n == null) break; seen.push(n); }
    expect(seen.filter(p => fri.slice(0, 15).includes(p))).toEqual([]);
  });
  it('με το χέρι: ζητά επιβεβαίωση όταν σπάει το κενό, με όποια σειρά κι αν μπουν', () => {
    const s = placed(20, 1, FRI, [4]);
    const k = postsOf(s.settings)[1].k;
    expect(() => run(s, { t: 'assign', date: THU, k, pid: 4 })).toThrow(/Υπηρεσία 23\/10 \(ανάπαυση\)/);
    expect(run(s, { t: 'assign', date: THU, k, pid: 4, force: 'λίγοι' }).guards[THU][k]).toBe(4);
    // πρώτα Πέμπτη, μετά Παρασκευή
    const t = placed(20, 1, THU, [4], fakeState(20));
    expect(() => run(t, { t: 'assign', date: FRI, k, pid: 4 })).toThrow(/Υπηρεσία 22\/10 \(ανάπαυση\)/);
  });
  it('το «Γιατί» λέει ότι έχει ήδη υπηρεσία', () => {
    const s = placed(20, 1, FRI, [4]);
    const k = postsOf(s.settings)[1].k;
    const w = run(s, { t: 'assign', date: WED, k, pid: 4 });
    expect(whyText(w, WED, k)).toMatch(/έχει ήδη υπηρεσία 23\/10/);
  });
  it('χωρίς ανάπαυση: κανείς δεν κρατιέται στην άκρη', () => {
    const s = placed(20, 0, FRI, [4]);
    expect(dutyAhead(s, THU, 4)).toBeNull();
    expect(ruleBlock(s, THU, 4)).toBeNull();
  });
});
