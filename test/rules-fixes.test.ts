// Διορθώσεις κανόνων (σχέδιο της 11/10, βήμα 3): υπηρεσίες που έγιναν, ΣΚ με δύο μέρες κενό, ΕΟ/ΕΑ στη δήλωση,
// αργίες στα σύνολα, ποινή που αιτείται, δέσμευση άοπλων μόνο όταν χρειάζεται, έξοδοι πολλών ημερών. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { dutyStats, fillDay, planStatusChange, postsOf, ruleBlock, whyAll, whyText } from '../src/shared/rules';
import { addDays } from '../src/shared/dates';
import type { AppState, TypeKey } from '../src/shared/domain';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
let seq = 0;
const ctx: Ctx = { today: TODAY, newId: () => 'f' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const declare = (s: AppState, type: TypeKey, pid: number, from: string, to = from, extra: Record<string, unknown> = {}) =>
  run(s, { t: 'declare', cmd: { type, pids: [pid], from, to, ...extra } as any });
const spen = (s: AppState): AppState => ({ ...s, settings: { ...s.settings, phase: 'spen' } });

describe('δήλωση κατάστασης', () => {
  it('με ημερομηνία πριν από σήμερα: η υπηρεσία που έγινε μένει, όσες είναι από σήμερα και μετά βγαίνουν', () => {
    const s0: AppState = { ...fakeState(20), guards: { '2026-10-11': { th1: 2 }, '2026-10-13': { th2: 2 } } };
    const cmd = { type: 'EY' as TypeKey, pids: [2], from: '2026-10-11', to: '2026-10-13' };
    const plan = planStatusChange(s0, cmd, TODAY);
    expect(plan.past).toEqual([{ pid: 2, date: '2026-10-11', k: 'th1' }]);
    expect(plan.conflicts).toEqual([{ pid: 2, date: '2026-10-13', k: 'th2' }]);
    expect(plan.files.find(f => f.fn === 'Υπηρεσίες 11/10')?.desc).toMatch(/υπηρεσία που έγινε, μένει/);
    const s = declare(s0, 'EY', 2, '2026-10-11', '2026-10-13');
    expect(s.guards['2026-10-11'].th1).toBe(2);
    expect(s.guards['2026-10-13'].th2).toBeUndefined();
  });
  it('ΕΟ/ΕΑ σε μαγειρεία: η δήλωση το βρίσκει και βγάζει τον στρατιώτη από τη θέση', () => {
    const s0: AppState = { ...fakeState(20), guards: { '2026-10-14': { mg1: 3, th1: 4 } } };
    const plan = planStatusChange(s0, { type: 'EO', pids: [3, 4], from: '2026-10-14', to: '2026-10-14' }, TODAY);
    expect(plan.conflicts).toEqual([{ pid: 3, date: '2026-10-14', k: 'mg1' }]);   // η άοπλη θαλαμοφυλακή επιτρέπεται
    expect(declare(s0, 'EO', 3, '2026-10-14').guards['2026-10-14'].mg1).toBeUndefined();
  });
  it('ποινή που αιτείται ακυρώνει την έξοδο που πέφτει μέσα της', () => {
    const D = '2026-10-17';
    let s = run(fakeState(20), { t: 'outs', date: D, changes: [{ pid: 5, from: null, to: 'OUT' }] });
    const plan = planStatusChange(s, { type: 'PUN', pids: [5], from: D, to: D, kind: 'Κράτηση' }, TODAY);
    expect(plan.cancels).toHaveLength(1);
    expect(plan.files.find(f => f.fn === 'Εξοδούχοι')?.desc).toMatch(/Ο τιμωρημένος δεν βγαίνει έξοδο/);
    s = declare(s, 'PUN', 5, D, D, { kind: 'Κράτηση' });
    expect(s.statuses.filter(x => x.pid === 5).map(x => x.type)).toEqual(['PUN']);
  });
});

describe('έξοδος ή ΔΝ πολλών ημερών', () => {
  const dn = () => declare(fakeState(20), 'DN', 3, '2026-10-16', '2026-10-18');
  it('αλλάζει μία μέρα στους εξοδούχους: μένουν η μέρα πριν και η μέρα μετά', () => {
    const s0 = dn(); const id = s0.statuses.find(x => x.pid === 3)!.id;
    const s = run(s0, { t: 'outs', date: '2026-10-17', changes: [{ pid: 3, from: 'DN', to: null }] });
    const left = s.statuses.filter(x => x.pid === 3).map(x => [x.id === id, x.type, x.from, x.to]);
    expect(left).toEqual([[true, 'DN', '2026-10-16', '2026-10-16'], [false, 'DN', '2026-10-18', '2026-10-18']]);
  });
  it('ΕΥ στη μεσαία μέρα: η ΔΝ ακυρώνεται μόνο για εκείνη', () => {
    const s0 = dn();
    expect(planStatusChange(s0, { type: 'EY', pids: [3], from: '2026-10-17', to: '2026-10-17' }, TODAY).files.find(f => f.fn === 'Εξοδούχοι')?.desc).toMatch(/μένει 16\/10, 18\/10/);
    const s = declare(s0, 'EY', 3, '2026-10-17');
    expect(s.statuses.filter(x => x.pid === 3).map(x => [x.type, x.from, x.to])).toEqual([['DN', '2026-10-16', '2026-10-16'], ['DN', '2026-10-18', '2026-10-18'], ['EY', '2026-10-17', '2026-10-17']]);
  });
});

describe('ΣΚ/αργία δύο συνεχόμενες φορές', () => {
  const after = (d: string) => ({ ...fakeState(20), guards: { [d]: { th1: 2 } } });
  it('με δύο μέρες κενό μπλοκάρεται: Παρασκευή 25/12 και Κυριακή 27/12, Σάββατο 1/5 και Δευτέρα του Πάσχα 3/5', () => {
    expect(ruleBlock(after('2026-12-25'), '2026-12-27', 2)).toMatch(/Έκανε αργία/);
    expect(ruleBlock(after('2027-05-01'), '2027-05-03', 2)).toMatch(/Έκανε αργία/);
    expect(ruleBlock(after('2026-12-25'), '2026-12-29', 2)).toBeNull();   // Τρίτη: καθημερινή
  });
});

describe('σύνολα υπηρεσιών', () => {
  it('αλλάζουν οι αργίες: ξαναμετριούνται οι αργίες του καθενός', () => {
    const s: AppState = { ...fakeState(10), guards: { '2026-10-14': { th1: 3 } } };   // Τετάρτη
    expect(dutyStats(s).get(3)!.hol).toBe(0);
    const s2: AppState = { ...s, settings: { ...s.settings, holidays: { ...s.settings.holidays, '2026-10-14': 'Τοπική εορτή' } } };
    expect(dutyStats(s2).get(3)!.hol).toBe(1);
  });
});

describe('άοπλοι στις άοπλες θέσεις', () => {
  it('ΣΒΕΝ, ένας με ΕΑ όλο τον Οκτώβριο: κάνει περίπου όσες υπηρεσίες και οι άλλοι', () => {
    let s = declare(fakeState(60), 'EA', 7, '2026-10-01', '2026-10-31');
    for (let d = '2026-10-01'; d <= '2026-10-31'; d = addDays(d, 1)) s = { ...s, guards: fillDay(s, d).guards };
    const n = new Map<number, number>();
    for (const g of Object.values(s.guards)) for (const pid of Object.values(g)) n.set(pid, (n.get(pid) || 0) + 1);
    const avg = [...n.values()].reduce((a, b) => a + b, 0) / s.people.length;
    expect(Math.abs((n.get(7) || 0) - avg)).toBeLessThanOrEqual(2);
  });
  it('ΣΠΕΝ με λίγους ένοπλους: οι άοπλοι (Ι3 ΑΟΠΛΟ) πάνε στις άοπλες θέσεις και οι ένοπλες γεμίζουν', () => {
    const s0 = spen(fakeState(20)); const D = '2026-10-14';
    const armed = postsOf(s0.settings).filter(p => p.armed).length;
    // όσοι μπορούν σε ένοπλη είναι ακριβώς όσες οι ένοπλες θέσεις
    const s: AppState = { ...s0, people: s0.people.map((p, i) => ({ ...p, si: i < armed ? 'Ι1' : 'Ι3 ΑΟΠΛΟ' })) };
    const r = fillDay(s, D);
    expect(r.empty.filter(k => postsOf(s.settings).find(p => p.k === k)!.armed)).toEqual([]);
  });
});

describe('οθόνη υπηρεσιών και δηλώσεις', () => {
  it('«Γιατί αυτός;» για όλες τις θέσεις μαζί: ίδιο κείμενο με τον υπολογισμό ανά θέση', () => {
    let s = fakeState(40);
    for (let d = '2026-10-01'; d <= '2026-10-14'; d = addDays(d, 1)) s = { ...s, guards: fillDay(s, d).guards };
    const all = whyAll(s, '2026-10-14');
    expect(Object.keys(all).length).toBe(Object.keys(s.guards['2026-10-14']).length);
    for (const k of Object.keys(all)) expect(all[k]).toBe(whyText(s, '2026-10-14', k));
  });
  it('η ίδια δήλωση δεύτερη φορά (διπλό κλικ) δεν γράφεται διπλή', () => {
    const s = declare(fakeState(10), 'EY', 2, '2026-10-14', '2026-10-15');
    expect(() => declare(s, 'EY', 2, '2026-10-14', '2026-10-15')).toThrow(/έχει ήδη ΕΥ/);
    expect(declare(s, 'EY', 2, '2026-10-16').statuses.filter(x => x.pid === 2)).toHaveLength(2);
  });
});
