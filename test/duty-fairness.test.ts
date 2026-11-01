// Αυτόματη συμπλήρωση: διορθώσεις δικαιοσύνης (Michael, 1/11). Μόνο ψεύτικα ονόματα.
//  1. «Αυστηρά Άοπλοι»: προτεραιότητα μόνο στους πρώτους της σειράς  2. «πόσες αναλογούν» στην καθημερινή σειρά και στο «Γιατί αυτός;»
//  3. ισοκατανομή των νούμερων  4. Λ/Υ-Δ/Υ στην εναλλαγή  5. όποιος έχει πόστο δεν μπαίνει μόνος του σε Λ/Υ-Δ/Υ
//  6. αργία χωρίς αρκετούς: μπαίνουν όσοι έκαναν πρόσφατα αργία, με ειδοποίηση  7. μόνιμος Λ/Υ-Δ/Υ που είναι ήδη σε άλλη θέση
import { describe, it, expect } from 'vitest';
import { dutyStats, fairCompare, fairMap, fillDay, guardUnavailable, isHol, postBy, postsOf, statOf, whyText } from '../src/shared/rules';
import { addDays } from '../src/shared/dates';
import type { AppState, Person, Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const noPost = (s: AppState): AppState => ({ ...s, people: s.people.map(p => ({ ...p, post: null, si: 'Ι1' })) });
const seatsOf = (s: AppState) => postsOf(s.settings).map(x => x.k);
const idsIn = (g: Record<string, number>) => new Set(Object.values(g));

describe('7. μόνιμος Λ/Υ-Δ/Υ που είναι ήδη σε άλλη θέση', () => {
  const D = '2026-11-09';   // Δευτέρα
  const base = (): AppState => { const s = noPost(fakeState(30)); return { ...s, settings: { ...s.settings, fixed: { ly: 1, dy: 2 } } }; };
  const withPerson = (s: AppState, id: number, f: Partial<Person>): AppState => ({ ...s, people: s.people.map(p => (p.id === id ? { ...p, ...f } : p)) });

  it('με «δεν κάνει Δευτέρα» και ήδη στη θέση του θαλαμοφύλακα: δεν μπαίνει δεύτερη φορά, και το λέει', () => {
    const s = { ...withPerson(base(), 2, { offDays: [1] }), guards: { [D]: { th4: 2 } } };
    const r = fillDay(s, D);
    const seats = Object.entries(r.guards[D]).filter(([, pid]) => pid === 2);
    expect(seats).toEqual([['th4', 2]]);
    expect(r.guards[D].dy).toBeDefined(); expect(r.guards[D].dy).not.toBe(2);
    expect(r.warn.some(t => /^Μόνιμος Δ\/Υ .*: δεν μπήκε \(Ήδη /.test(t))).toBe(true);
    expect(r.guards[D].ly).toBe(1);
  });
  it('με εξαίρεση (από–έως) και ήδη σε άλλη θέση: το ίδιο', () => {
    const s = { ...withPerson(base(), 1, { skips: [{ id: 'k1', from: D, to: D, why: 'ΓΑΜΟΣ' }] }), guards: { [D]: { mg2: 1 } } };
    const r = fillDay(s, D);
    expect(Object.values(r.guards[D]).filter(pid => pid === 1)).toHaveLength(1);
    expect(r.guards[D].ly).not.toBe(1);
  });
  it('χωρίς άλλη θέση, με «δεν κάνει Δευτέρα»: μπαίνει παρά τον κανόνα, με προειδοποίηση (όπως πριν)', () => {
    const r = fillDay(withPerson(base(), 2, { offDays: [1] }), D);
    expect(r.guards[D].dy).toBe(2);
    expect(r.warn.some(t => /^Μόνιμος Δ\/Υ .*: μπήκε παρά τον κανόνα \(Δεν κάνει υπηρεσία Δευτέρα\)$/.test(t))).toBe(true);
  });
  it('χωρίς κανένα πρόβλημα μπαίνει κανονικά και κανείς δεν είναι σε δύο θέσεις', () => {
    const r = fillDay(base(), D); const v = Object.values(r.guards[D]);
    expect(r.guards[D].ly).toBe(1); expect(r.guards[D].dy).toBe(2);
    expect(new Set(v).size).toBe(v.length);
  });
});

describe('5. όποιος έχει πόστο δεν μπαίνει μόνος του σε Λ/Υ-Δ/Υ', () => {
  const D = '2026-11-10';
  it('οι αυτόματες θέσεις Λ/Υ-Δ/Υ δεν πάνε ποτέ σε πόστο, ούτε στην επιδιόρθωση ή στο «Επόμενος»', () => {
    let s = noPost(fakeState(40));
    s = { ...s, people: s.people.map(p => (p.id % 4 === 0 ? { ...p, post: 'ΚΨΜ' } : p)) };
    const posted = new Set(s.people.filter(p => p.post).map(p => p.id));
    for (let i = 0, d = D; i < 20; i++, d = addDays(d, 1)) {
      const r = fillDay(s, d); s = { ...s, guards: r.guards };
      for (const k of seatsOf(s)) if (posted.has(r.guards[d][k])) throw new Error(d + ' ' + k + ' πόστο ' + r.guards[d][k]);
    }
    expect(dutyStats(s).size).toBeGreaterThan(20);
  });
  it('με το χέρι μπαίνει ακόμα (και ο μόνιμος Λ/Υ με πόστο μπαίνει)', () => {
    let s = noPost(fakeState(30)); s = { ...s, people: s.people.map(p => (p.id <= 2 ? { ...p, post: 'ΚΨΜ' } : p)), settings: { ...s.settings, fixed: { ly: 1 } } };
    const r = fillDay({ ...s, guards: { [D]: { dy: 2 } } }, D);
    expect(r.guards[D].ly).toBe(1); expect(r.guards[D].dy).toBe(2);
    expect(guardUnavailable({ ...s, guards: { [D]: {} } }, D, 2, 'dy')).toBeNull();   // ο κανόνας δεν το απαγορεύει με το χέρι
  });
});

describe('4. Λ/Υ-Δ/Υ στην εναλλαγή (χωρίς μόνιμο)', () => {
  const run = (n: number, days: number) => {
    let s = noPost(fakeState(n));
    for (let i = 0, d = '2026-11-02'; i < days; i++, d = addDays(d, 1)) s = { ...s, guards: fillDay(s, d).guards };
    const st = dutyStats(s); const c = s.people.map(p => st.get(p.id)?.byKind.ly || 0);
    return { sum: c.reduce((a, b) => a + b, 0), min: Math.min(...c), max: Math.max(...c) };
  };
  it('60 άτομα, 20 μέρες: οι 40 θέσεις Λ/Υ και Δ/Υ πάνε σε 40 διαφορετικούς (πριν: κάποιοι δύο φορές)', () => {
    const r = run(60, 20); expect(r.sum).toBe(40); expect(r.max).toBe(1);
  });
  it('40 άτομα, 30 μέρες: όλοι κάνουν 1 ή 2 φορές (πριν: από 0 ως 3)', () => {
    const r = run(40, 30); expect(r.sum).toBe(60); expect(r.min).toBeGreaterThanOrEqual(1); expect(r.max).toBeLessThanOrEqual(2);
  });
});

describe('1. Αυστηρά Άοπλοι: προτεραιότητα μόνο στους πρώτους της σειράς', () => {
  const D = '2026-11-04';
  // ΣΠΕΝ, 120 άτομα, οι 6 άοπλοι έκαναν υπηρεσία πριν 3 μέρες (στο τέλος της σειράς), όλοι οι άλλοι ποτέ
  function state(strict: boolean): AppState {
    let s = noPost(fakeState(120));
    const AOPLO = [3, 9, 15, 21, 27, 33];
    s = { ...s, people: s.people.map(p => ({ ...p, si: AOPLO.includes(p.id) ? 'Ι3 ΑΟΠΛΟ' : 'Ι1' })), rules: { ...s.rules, strictUnarmed: strict }, settings: { ...s.settings, phase: 'spen' } };
    return { ...s, guards: { [addDays(D, -3)]: Object.fromEntries(AOPLO.map((pid, i) => ['mg' + (i + 1), pid]).slice(0, 5)) }, baseline: { 33: { th: 1 } } };
  }
  it('οι άοπλοι που είναι πίσω στη σειρά δεν παίρνουν τις πρώτες θέσεις', () => {
    const s = state(true); const g = fillDay(s, D).guards[D];
    const AOPLO = [3, 9, 15, 21, 27, 33];
    expect(AOPLO.filter(pid => idsIn(g).has(pid))).toEqual([]);
    expect(postsOf(s.settings).every(x => g[x.k])).toBe(true);
  });
  it('όταν είναι στους πρώτους (λίγοι άνθρωποι για τις θέσεις), οι άοπλοι προηγούνται στα μαγειρεία όπως πριν', () => {
    const s0 = noPost(fakeState(30));
    // όλοι οι άλλοι έκαναν υπηρεσία πριν 3-4 μέρες, οι τρεις άοπλοι ποτέ: είναι οι πρώτοι της σειράς
    const others = s0.people.map(p => p.id).filter(id => ![2, 4, 7].includes(id)); const ks = postsOf({ ...s0.settings, phase: 'spen' }).map(x => x.k);
    const hist = { [addDays(D, -3)]: Object.fromEntries(ks.map((k, i) => [k, others[i]])), [addDays(D, -4)]: Object.fromEntries(others.slice(ks.length).map((pid, i) => [ks[i], pid])) };
    const s = { ...s0, guards: hist, people: s0.people.map(p => ({ ...p, si: [2, 4, 7].includes(p.id) ? 'Ι3 ΑΟΠΛΟ' : 'Ι1' })), rules: { ...s0.rules, strictUnarmed: true }, settings: { ...s0.settings, phase: 'spen' as const } };
    const g = fillDay(s, D).guards[D];
    const mg = ['mg1', 'mg2', 'mg3', 'mg4', 'mg5'].map(k => g[k]);
    for (const pid of [2, 4, 7]) expect(mg).toContain(pid);
  });
  it('σκοπιά: ποτέ άοπλος, όσο κι αν είναι στους πρώτους', () => {
    const s0 = noPost(fakeState(24));
    const s = { ...s0, people: s0.people.map(p => ({ ...p, si: [2, 4, 7, 8, 11].includes(p.id) ? 'Ι3 ΑΟΠΛΟ' : 'Ι1' })), rules: { ...s0.rules, strictUnarmed: true }, settings: { ...s0.settings, phase: 'spen' as const } };
    const g = fillDay(s, D).guards[D];
    for (const k of Object.keys(g).filter(k => k.startsWith('sk'))) expect([2, 4, 7, 8, 11]).not.toContain(g[k]);
  });
});

describe('2. καθημερινή σειρά: διόρθωση με όσες υπηρεσίες αναλογούν', () => {
  const D = '2026-10-07';   // Τετάρτη
  // 4 άτομα, ημερολόγιο από 1/10: ο 1 έκανε 3 υπηρεσίες, ο 2 μία, οι 3 και 4 καμία· ο 3 είχε άδεια 1-4/10
  function small(): AppState {
    const s = noPost(fakeState(4));
    const leave: Status = { id: 'l1', pid: 3, type: 'LEAVE', from: '2026-10-01', to: '2026-10-04', kind: 'Κανονική' };
    const nos: Status = { id: 'n1', pid: 3, type: 'NOS', from: '2026-10-03', to: '2026-10-05' };            // επικαλύπτεται: δεν μετρά διπλά
    const out: Status = { id: 'o1', pid: 4, type: 'OUT', from: '2026-10-02', to: '2026-10-03' };              // έξοδος: δεν μετρά ως απουσία
    return { ...s, statuses: [leave, nos, out], guards: { '2026-10-01': { th1: 1 }, '2026-10-02': { th1: 2 }, '2026-10-03': { th1: 1 }, '2026-10-05': { th1: 1 } } };
  }
  it('fairMap: αναλογούν = ρυθμός × μέρες που μπορούσε (χωρίς επικαλύψεις, χωρίς έξοδο)', () => {
    const s = small(); const f = fairMap(s, s.people, D);
    // μέρες 1-6/10: ο 1, 2, 4 έξι· ο 3 έλειπε 1-5/10 (άδεια + νοσοκομείο, μία φορά η κάθε μέρα) → 1 μέρα
    // ρυθμός = (3+1+0+0) / (6+6+1+6)
    const r = 4 / 19;
    expect(f.get(1)!.share).toBeCloseTo(6 * r, 6); expect(f.get(2)!.share).toBeCloseTo(6 * r, 6);
    expect(f.get(3)!.share).toBeCloseTo(1 * r, 6); expect(f.get(4)!.share).toBeCloseTo(6 * r, 6);
    const L = 4 / postsOf(s.settings).length;
    expect(f.get(1)!.adj).toBeCloseTo(L * (3 - 6 * r), 6);
    expect(f.get(3)!.adj).toBeCloseTo(L * (0 - 1 * r), 6);
  });
  it('το διορθωμένο όριο είναι ±2 υπηρεσίες', () => {
    let s = noPost(fakeState(6)); const g: Record<string, Record<string, number>> = {};
    for (let i = 0; i < 12; i++) g[addDays('2026-09-20', i * 2)] = { th1: 1 };   // ο 1 έκανε 12, οι άλλοι τίποτα
    s = { ...s, guards: g };
    const f = fairMap(s, s.people, '2026-10-15'); const L = 6 / postsOf(s.settings).length;
    expect(f.get(1)!.adj).toBeCloseTo(L * 2, 6);
    expect(f.get(2)!.adj).toBeCloseTo(-L * 2, 6);   // 12 υπηρεσίες σε 6 άτομα: αναλογούν 2 στον καθένα
  });
  it('χωρίς καθόλου ιστορικό δεν αλλάζει τίποτα (adj μένει κενό)', () => {
    const s = noPost(fakeState(5)); const f = fairMap(s, s.people, D);
    for (const x of f.values()) { expect(x.adj).toBeUndefined(); expect(x.share).toBeUndefined(); }
  });
  it('fairCompare: όποιος έκανε λιγότερες από όσες του αναλογούν προηγείται και όταν η τελευταία του υπηρεσία είναι πιο πρόσφατη', () => {
    const cmp = fairCompare(false, 'th', D);
    const mk = (pid: number, last: string, total: number, adj: number) => ({ pid, total, hol: 0, byKind: {}, byType: {}, lastBefore: last, lastHolBefore: '', adj });
    const old = mk(1, '2026-10-01', 6, 4), recent = mk(2, '2026-10-05', 1, -4);
    expect(cmp(recent, old)).toBeLessThan(0);                    // 05/10 − 4 μέρες < 01/10 + 4 μέρες
    expect(cmp({ ...recent, adj: 0 }, { ...old, adj: 0 })).toBeGreaterThan(0);   // χωρίς διόρθωση προηγείται η παλιότερη
    // αργία: αμετάβλητη
    expect(fairCompare(true, 'th', D)({ ...recent, hol: 0 }, { ...old, hol: 1 })).toBeLessThan(0);
  });
  it('«Γιατί αυτός;»: «18 υπηρεσίες, αναλογούν 17,4» με δεκαδικό κόμμα, μόνο στην καθημερινή', () => {
    const s0 = small(); const s = { ...s0, guards: { ...s0.guards, [D]: { th2: 1 } } };
    expect(whyText(s, D, 'th2')).toMatch(/3 υπηρεσίες, αναλογούν 1,3( |$)/);
    // ΣΚ: αργίες, όπως πριν
    const SAT = '2026-10-10'; expect(isHol(s.settings, SAT)).toBe(true);
    const t = whyText({ ...s, guards: { ...s.guards, [SAT]: { th2: 1 } } }, SAT, 'th2');
    expect(t).toMatch(/αργίες|αργία/); expect(t).not.toMatch(/αναλογούν/);
  });
  it('οι νέοι χωρίς μέσο όρο μετρούν τις μέρες από τότε που ήρθαν· με μέσο όρο από την αρχή', () => {
    const s0 = small(); const inOn = '2026-10-04';
    const s = { ...s0, people: s0.people.map(p => (p.id === 4 ? { ...p, inOn } : p)) };
    const f = fairMap(s, s.people, D);
    // ο 4: 4-6/10 = 3 μέρες (χωρίς newAvg)
    const r = 4 / (6 + 6 + 1 + 3);
    expect(f.get(4)!.share).toBeCloseTo(3 * r, 6);
    const avg = fairMap({ ...s, rules: { ...s.rules, newAvg: true } }, s.people, D);
    expect(avg.get(4)!.avg).toBe(true);
  });
});

describe('3. νούμερα: ισοκατανομή των ωρών', () => {
  it('μετά τη συμπλήρωση κανένα ζεύγος ατόμων του ίδιου εντύπου δεν μπορεί να ανταλλάξει νούμερο με όφελος', () => {
    let s = noPost(fakeState(45)); s = { ...s, settings: { ...s.settings, fixed: { ly: 1, dy: 2 } } };
    const cnt = (ss: AppState, pid: number, hours: string, d: string) => statOf(ss, pid).log.filter(e => e.d < d && e.k && postBy(ss, e.k)?.rot != null && postBy(ss, e.k)!.hours === hours).length;
    let checked = 0;
    for (let i = 0, d = '2026-11-02'; i < 30; i++, d = addDays(d, 1)) {
      const r = fillDay(s, d); const g = r.guards[d];
      for (const a of postsOf(s.settings)) for (const b of postsOf(s.settings)) {
        if (a.k >= b.k || a.block !== b.block || a.rot == null || b.rot == null || !g[a.k] || !g[b.k]) continue;
        const pa = g[a.k], pb = g[b.k];
        const w: AppState = { ...s, guards: { ...s.guards, [d]: Object.fromEntries(Object.entries(g).filter(([k]) => k !== a.k && k !== b.k)) } };
        if (guardUnavailable(w, d, pb, a.k) || guardUnavailable(w, d, pa, b.k)) continue;
        const sq = (x: number) => x * x;
        const now = sq(cnt(s, pa, a.hours, d)) + sq(cnt(s, pb, b.hours, d)), swapped = sq(cnt(s, pb, a.hours, d)) + sq(cnt(s, pa, b.hours, d));
        expect(swapped).toBeGreaterThanOrEqual(now); checked++;
      }
      s = { ...s, guards: r.guards };
    }
    expect(checked).toBeGreaterThan(200);
  });
  it('δεν αλλάζει ποιοι έχουν υπηρεσία σήμερα, ούτε αγγίζει όσους έβαλες με το χέρι', () => {
    let s = noPost(fakeState(45));
    for (let i = 0, d = '2026-11-02'; i < 6; i++, d = addDays(d, 1)) s = { ...s, guards: fillDay(s, d).guards };
    const D = '2026-11-08';
    const manual = { th2: 40, th3: 41 };
    const r = fillDay({ ...s, guards: { ...s.guards, [D]: { ...manual } } }, D);
    expect(r.guards[D].th2).toBe(40); expect(r.guards[D].th3).toBe(41);
    expect(new Set(Object.values(r.guards[D])).size).toBe(Object.keys(r.guards[D]).length);
  });
});

describe('6. αργία χωρίς αρκετούς: μπαίνουν όσοι έκαναν πρόσφατα αργία, με ειδοποίηση', () => {
  const D = '2026-10-31';          // Σάββατο
  const PREV = '2026-10-24';       // προηγούμενο Σάββατο: 7 μέρες πριν (μέσα στο «2 ως 9 μέρες»)
  // 20 άτομα, 15 θέσεις ΣΒΕΝ: οι 1-15 έκαναν υπηρεσία το προηγούμενο Σάββατο (οι 8-15 είχαν και λιγότερες αργίες), ο 16 έχει υπηρεσία την Παρασκευή (ανάπαυση)
  function state(): AppState {
    const s = noPost(fakeState(20)); const ks = seatsOf(s);
    const prev = Object.fromEntries(ks.map((k, i) => [k, i + 1]));
    return { ...s, guards: { [PREV]: prev, '2026-10-30': { th1: 16 } }, baseline: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i + 1, { hol: 1 }])) };
  }
  it('γεμίζουν όλες οι θέσεις, πρώτα όσοι έχουν λιγότερες αργίες, και βγαίνει ειδοποίηση με ημερομηνία', () => {
    const s = state(); const r = fillDay(s, D); const g = r.guards[D];
    expect(Object.keys(g)).toHaveLength(15);
    expect(r.empty).toEqual([]);
    const ids = idsIn(g);
    for (const pid of [17, 18, 19, 20]) expect(ids.has(pid)).toBe(true);        // κανένας κανόνας δεν τους κρατά
    expect(ids.has(16)).toBe(false);                                            // ανάπαυση: δεν χαλαρώνει
    for (let pid = 8; pid <= 15; pid++) expect(ids.has(pid)).toBe(true);        // λιγότερες αργίες πρώτα
    expect(r.warn).toContain('31/10: μπήκαν 11 που είχαν κάνει αργία πρόσφατα (δεν έφταναν οι υπόλοιποι)');
    expect(r.n).toBe(15);
  });
  it('αν είναι κλειστός ο κανόνας δεν υπάρχει ειδοποίηση· στις θέσεις που περισσεύουν η αργία δεν έχει τίποτα να γεμίσει', () => {
    const s = state(); const off = fillDay({ ...s, rules: { ...s.rules, noConsecHol: false } }, D);
    expect(off.warn.filter(t => /αργία πρόσφατα/.test(t))).toEqual([]);
    expect(Object.keys(off.guards[D])).toHaveLength(15);
    // καθημερινή: δεν γεμίζει με τέτοιον τρόπο
    const WED = '2026-10-28'; const w = fillDay({ ...s, guards: {} }, WED);
    expect(w.warn.filter(t => /αργία πρόσφατα/.test(t))).toEqual([]);
  });
  it('μία μόνο θέση: «μπήκε 1 που είχε κάνει αργία πρόσφατα»', () => {
    // 6 έκαναν υπηρεσία το προηγούμενο Σάββατο, οι άλλοι 14 είναι ελεύθεροι για 15 θέσεις
    const s0 = noPost(fakeState(20)); const ks = seatsOf(s0);
    const s: AppState = { ...s0, guards: { [PREV]: Object.fromEntries(ks.slice(0, 6).map((k, i) => [k, i + 1])) } };
    const r = fillDay(s, D);
    expect(Object.keys(r.guards[D])).toHaveLength(15);
    expect(r.warn).toContain('31/10: μπήκε 1 που είχε κάνει αργία πρόσφατα (δεν έφταναν οι υπόλοιποι)');
    expect([...idsIn(r.guards[D])].filter(pid => pid <= 6)).toHaveLength(1);
  });
});
