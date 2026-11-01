// Κανόνες υπηρεσιών: οι νέες επιλογές (Michael, 1/11). Με τις επιλογές στην προεπιλογή η αυτόματη συμπλήρωση, ο «Επόμενος» και το
// «Γιατί» δίνουν ακριβώς τα ίδια με πριν· κάθε επιλογή χωριστά κάνει ό,τι λέει.
//  Α. rules.numRots: ποια νούμερα έχουν «ξανά στο ίδιο νούμερο»  Β. rules.strictOrder: η σειρά των Αυστηρά Άοπλοι, και δικές σου άοπλες υπηρεσίες
//  Γ. rules.newAvg: οι νέοι στη δύναμη ξεκινούν από τον μέσο όρο. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { addDays } from '../src/shared/dates';
import { DEFAULT_NUM_ROTS, DEFAULT_STRICT_ORDER, type AppState, type Rules } from '../src/shared/domain';
import { dutyStats, fairOf, fillDay, guardUnavailable, nextFor, postBy, postsOf, ruleBlock, strictKeyTxt, strictTier, whyAll, whyText } from '../src/shared/rules';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'ro' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const D = '2026-10-13';   // Τρίτη
const spen = (s: AppState): AppState => ({ ...s, settings: { ...s.settings, phase: 'spen' as const } });
const withRules = (s: AppState, r: Partial<Rules>): AppState => ({ ...s, rules: { ...s.rules, ...r } });
// ό,τι βγάζουν η συμπλήρωση, το «Επόμενος» και το «Γιατί» σε έναν μήνα: για σύγκριση
function month(s0: AppState, days = 31) {
  let s = s0; const out: unknown[] = [];
  for (let i = 0, d = '2026-10-01'; i < days; i++, d = addDays(d, 1)) {
    const r = fillDay(s, d); s = { ...s, guards: r.guards };
    out.push([d, r.guards[d], r.empty, r.warn, whyAll(s, d), postsOf(s.settings).slice(0, 6).map(x => nextFor({ ...s, guards: { ...s.guards, [d]: {} } }, d, x.k, []))]);
  }
  return out;
}
const AOPLO = [2, 4, 7, 10, 13, 16], EA = 19;
// ΣΠΕΝ, 20 άτομα: 6 με Σ.Ι. Ι3 ΑΟΠΛΟ, ένας ΕΑ, ανοιχτά Αυστηρά Άοπλοι, οπλοφύλακες άοπλοι (όπως στο strict.test.ts)
function strictBase(): AppState {
  const s = fakeState(20);
  return {
    ...s, people: s.people.map(p => ({ ...p, si: AOPLO.includes(p.id) ? 'Ι3 ΑΟΠΛΟ' : 'Ι1' })), statuses: [{ id: 'ea', pid: EA, type: 'EA', from: '2026-10-10', to: '2026-10-20' }],
    rules: { ...s.rules, strictUnarmed: true }, settings: { ...s.settings, phase: 'spen', blocksSpen: s.settings.blocksSpen.map(b => (b.kind === 'op' ? { ...b, armed: false } : b)) }
  };
}

describe('προεπιλογές: τίποτα δεν αλλάζει', () => {
  const EXPLICIT: Partial<Rules> = { numRots: [...DEFAULT_NUM_ROTS], strictOrder: [...DEFAULT_STRICT_ORDER], newAvg: false };
  it('ΣΠΕΝ, Αυστηρά Άοπλοι κλειστά: ίδιος μήνας συμπλήρωσης, «Επόμενος» και «Γιατί» με απούσες και με ρητές προεπιλογές', () => {
    const s = spen(fakeState(30));
    expect(month(withRules(s, EXPLICIT))).toEqual(month(s));
  });
  it('ΣΠΕΝ, Αυστηρά Άοπλοι ανοιχτά (με ΕΑ και άοπλους): το ίδιο', () => {
    const s = strictBase();
    expect(month(withRules(s, EXPLICIT))).toEqual(month(s));
  });
  it('οι νέοι (inOn) δεν αλλάζουν τίποτα όσο το newAvg είναι κλειστό', () => {
    const s = spen(fakeState(30));
    // inOn την πρώτη μέρα του ημερολογίου: ήταν εκεί από την αρχή. (Αργότερα το inOn μετρά στο «πόσες αναλογούν» της καθημερινής σειράς: οι μέρες πριν δεν τους αναλογούν υπηρεσίες)
    const withIn = { ...s, people: s.people.map(p => (p.id > 24 ? { ...p, inOn: '2026-10-01' } : p)) };
    expect(month(withIn)).toEqual(month(s));
    expect(month(withRules(withIn, { newAvg: false }))).toEqual(month(s));
  });
  it('strictTier χωρίς σειρά: οι τιμές που ήταν (1, 2, 3, 4)', () => {
    const s = strictBase();
    expect(['mg1', 'th2', 'th3', 'op2', 'th1', 'th4', 'op4', 'sk3a', 'tae', 'ly'].map(k => strictTier(postBy(s, k)!))).toEqual([1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
    expect(['mg1', 'th2', 'th1', 'sk3a'].map(k => strictTier(postBy(s, k)!, DEFAULT_STRICT_ORDER))).toEqual([1, 2, 3, 4]);
  });
});

describe('Α. ποια νούμερα έχουν «ξανά στο ίδιο νούμερο»', () => {
  const base = () => run(spen(fakeState(20)), { t: 'assign', date: D, k: 'th1', pid: 2 });
  it('προεπιλογή: το 1ο νούμερο δεν έχει κανόνα (μόνο η ανάπαυση), το 3ο έχει', () => {
    const s = run(base(), { t: 'assign', date: addDays(D, 7), k: 'th3', pid: 2 });
    expect(ruleBlock(s, addDays(D, 2), 2, undefined, 'th1')).toBeNull();
    expect(ruleBlock(s, addDays(D, 5), 2, undefined, 'th3')).toMatch(/3ο νούμερο στις 20\/10/);
  });
  it('με το 1ο νούμερο στη λίστα: ξανά στο 1ο μετά από 3 μέρες μόνο, με το ίδιο μήνυμα', () => {
    const s = withRules(base(), { numRots: [0, 2, 3] });
    expect(ruleBlock(s, addDays(D, 2), 2, undefined, 'th1')).toBe('1ο νούμερο στις 13/10 (ξανά μετά από 3 μέρες)');
    expect(guardUnavailable(s, addDays(D, 2), 2, 'sk3a')).toBeNull();   // το 3ο νούμερο (σκοπιά) δεν το έκανε: μόνο το ίδιο νούμερο μετρά
    expect(ruleBlock(s, addDays(D, 3), 2, undefined, 'th1')).toBeNull();
  });
  it('μόνο το 2ο νούμερο: το 3ο και το 4ο δεν έχουν πια κανόνα', () => {
    const s0 = run(spen(fakeState(20)), { t: 'assign', date: D, k: 'th3', pid: 2 });
    expect(ruleBlock(s0, addDays(D, 2), 2, undefined, 'th3')).toMatch(/3ο νούμερο/);
    const s = withRules(s0, { numRots: [1] });
    expect(ruleBlock(s, addDays(D, 2), 2, undefined, 'th3')).toBeNull();
    const t = withRules(run(spen(fakeState(20)), { t: 'assign', date: D, k: 'th2', pid: 2 }), { numRots: [1] });
    expect(ruleBlock(t, addDays(D, 2), 2, undefined, 'th2')).toMatch(/^2ο νούμερο στις 13\/10/);
  });
  it('η εντολή setRules: [2, 3] δεν αποθηκεύεται, η λίστα μπαίνει σε σειρά και χωρίς διπλά, λάθος τιμές απορρίπτονται', () => {
    const s = fakeState(5);
    expect(run(s, { t: 'setRules', rules: { ...s.rules, numRots: [3, 2] }, text: '' }).rules.numRots).toBeUndefined();
    expect(run(s, { t: 'setRules', rules: { ...s.rules, numRots: [3, 0, 3] }, text: '' }).rules.numRots).toEqual([0, 3]);
    for (const bad of [[], [4], [-1], [0.5]]) expect(() => run(s, { t: 'setRules', rules: { ...s.rules, numRots: bad }, text: '' })).toThrow();
    expect('numRots' in run(s, { t: 'setRules', rules: { ...s.rules }, text: '' }).rules).toBe(false);
  });
});

describe('Β. η σειρά των Αυστηρά Άοπλοι', () => {
  it('άλλη σειρά: 1ο-4ο πρώτα, μετά 2ο-3ο, μετά μαγειρεία', () => {
    const s = strictBase(); const ord = ['edge', 'mid', 'mg'];
    expect(['th1', 'th2', 'mg1', 'sk3a', 'th4'].map(k => strictTier(postBy(s, k)!, ord))).toEqual([1, 2, 3, 4, 1]);
    // οι άοπλοι πάνε πρώτα στο 1ο-4ο νούμερο θαλαμοφύλακα (4 θέσεις στο ΣΠΕΝ: th1, th4, op1, op4)
    const g = fillDay(withRules(s, { strictOrder: ord }), D).guards[D];
    const edge = ['th1', 'th4', 'op1', 'op4'].map(k => g[k]);
    expect(edge.every(p => AOPLO.includes(p) || p === EA)).toBe(true);
    expect(fillDay(s, D).guards[D]).not.toEqual(g);
  });
  it('μία μόνο υπηρεσία στη σειρά: μόνο εκεί προηγούνται οι άοπλοι', () => {
    const s = withRules(strictBase(), { strictOrder: ['mg'] });
    const ks = postsOf(s.settings);
    expect(ks.map(x => strictTier(x, ['mg'])).filter(t => t === 1)).toHaveLength(5);
    const g = fillDay(s, D).guards[D];
    expect(['mg1', 'mg2', 'mg3', 'mg4', 'mg5'].every(k => AOPLO.includes(g[k]))).toBe(true);
  });
  it('δική σου άοπλη υπηρεσία πρώτη: την παίρνει άοπλος· στην προεπιλογή (δεν είναι στη σειρά) όχι', () => {
    const s0 = run(strictBase(), { t: 'addBlock', phase: 'spen', name: 'Πύλη', armed: false, n: 1, hrs: '' } as Command);
    const gate = s0.settings.blocksSpen.find(b => b.custom)!; const k = gate.posts[0].k;
    const key = 'b:' + gate.id;
    expect(strictTier(postBy(s0, k)!, [key, 'mg', 'mid', 'edge'])).toBe(1);
    expect(strictTier(postBy(s0, k)!, ['mg', 'mid', 'edge'])).toBe(4);
    expect(strictKeyTxt(s0.settings, key)).toBe('Πύλη');
    const unarmed = new Set([...AOPLO, EA]);
    const first = withRules(s0, { strictOrder: [key, 'mg', 'mid', 'edge'] });
    expect(unarmed.has(fillDay(first, D).guards[D][k])).toBe(true);
    expect(whyAll({ ...first, guards: fillDay(first, D).guards }, D)[k]).toMatch(/Αυστηρά Άοπλοι: άοπλος, προτεραιότητα σε Πύλη/);
    expect(unarmed.has(fillDay(s0, D).guards[D][k])).toBe(false);
    expect(unarmed.has(nextFor(first, D, k, []) as number)).toBe(true);
    // υπηρεσία που διαγράφηκε: το κλειδί αγνοείται σιωπηλά, τίποτα δεν σπάει
    const gone = withRules(s0, { strictOrder: ['b:xdeleted', 'mg', 'mid', 'edge'] });
    expect(() => fillDay(gone, D)).not.toThrow();
    expect(strictKeyTxt(s0.settings, 'b:xdeleted')).toBe('');
  });
  it('η εντολή setRules: η προεπιλογή δεν αποθηκεύεται, κενή σειρά και διπλά', () => {
    const s = fakeState(5);
    expect(run(s, { t: 'setRules', rules: { ...s.rules, strictOrder: ['mg', 'mid', 'edge'] }, text: '' }).rules.strictOrder).toBeUndefined();
    expect(run(s, { t: 'setRules', rules: { ...s.rules, strictOrder: ['mid', 'mid', 'mg'] }, text: '' }).rules.strictOrder).toEqual(['mid', 'mg']);
    expect(() => run(s, { t: 'setRules', rules: { ...s.rules, strictOrder: [] }, text: '' })).toThrow();
  });
});

describe('Γ. οι νέοι ξεκινούν από τον μέσο όρο', () => {
  const SAT = '2026-10-17', IN = '2026-10-10', NEW = 20;
  // 19 παλιοί με προηγούμενες αργίες 2, 3 ή 4 (μ.ό. 3) και 5 υπηρεσίες, ένας νέος από 10/10 χωρίς τίποτα. Ο 1 έχει και μία υπηρεσία πριν
  // και μία μετά την άφιξη του νέου: μετρά μόνο η πρώτη. Χωρίς εναλλαγή υπηρεσιών: αυτή κοιτά τα σύνολα ανά είδος (byType), που το newAvg δεν αγγίζει.
  function sc(newAvg: boolean): AppState {
    const s = fakeState(20);
    const baseline: AppState['baseline'] = {}; for (let i = 1; i < NEW; i++) baseline[i] = { th: 5, hol: 2 + (i % 3) };
    return { ...s, baseline, people: s.people.map(p => (p.id === NEW ? { ...p, inOn: IN } : p)), rules: { ...s.rules, rotate: false, ...(newAvg ? { newAvg: true } : {}) }, guards: { '2026-10-06': { th1: 1 }, '2026-10-12': { th1: 1 } } };
  }
  const mean = (s: AppState, f: (id: number) => number) => { let n = 0, t = 0; for (let i = 1; i < NEW; i++) { n++; t += f(i); } return t / n; };
  it('κλειστό: ο νέος έχει 0 αργίες και είναι πρώτος στο ΣΚ· ανοιχτό: μετρά σαν τον μέσο όρο και δεν είναι πρώτος', () => {
    const off = sc(false), on = sc(true);
    expect(fairOf(off, NEW, SAT)).toMatchObject({ hol: 0, total: 0 });
    expect(nextFor(off, SAT, 'th1', [])).toBe(NEW);
    // ο μέσος όρος της μέρας άφιξης: βάση + υπηρεσίες πριν από 10/10 (ο 1: μία, οι υπόλοιποι καμία)
    const avgTotal = mean(on, i => 5 + (i === 1 ? 1 : 0)), avgHol = mean(on, i => 2 + (i % 3));
    const f = fairOf(on, NEW, SAT);
    expect(f.total).toBeCloseTo(avgTotal, 10); expect(f.hol).toBeCloseTo(avgHol, 10);
    expect(nextFor(on, SAT, 'th1', [])).not.toBe(NEW);
    expect(whyText({ ...on, guards: { [SAT]: { th1: NEW } } }, SAT, 'th1')).toMatch(/νέος: από μ\.ό\./);
  });
  it('οι παλιοί και ο έλεγχος υπηρεσιών δεν αλλάζουν· πριν την άφιξη δεν υπάρχει διόρθωση', () => {
    const off = sc(false), on = sc(true);
    for (let i = 1; i < NEW; i++) expect(fairOf(on, i, SAT)).toEqual(fairOf(off, i, SAT));
    expect(dutyStats(on).get(NEW)).toBeUndefined();
    expect(fairOf(on, NEW, '2026-10-09')).toEqual(fairOf(off, NEW, '2026-10-09'));
    expect(fairOf(on, NEW, IN)).toMatchObject({ hol: mean(on, i => 2 + (i % 3)) });
  });
  it('χωρίς inOn (πρώτη εισαγωγή) δεν αλλάζει τίποτα ακόμα κι αν είναι ανοιχτό', () => {
    const a = sc(true), b: AppState = { ...a, people: a.people.map(p => ({ ...p, inOn: undefined })) };
    const c = sc(false); const c2: AppState = { ...c, people: c.people.map(p => ({ ...p, inOn: undefined })) };
    expect(month(b, 10)).toEqual(month(c2, 10));
  });
  it('η εντολή setRules κρατά το newAvg μόνο όταν είναι ανοιχτό', () => {
    const s = fakeState(5);
    expect(run(s, { t: 'setRules', rules: { ...s.rules, newAvg: true }, text: '' }).rules.newAvg).toBe(true);
    expect('newAvg' in run(s, { t: 'setRules', rules: { ...s.rules, newAvg: false }, text: '' }).rules).toBe(false);
  });
});
