// Προσομοίωση υπηρεσιών (duty-sim): Ν στρατιώτες, μήνες αυτόματης συμπλήρωσης μέρα με τη μέρα, όπως ο λοχίας. Ελέγχει τις αναλλοίωτες
// (κανένας σε δύο θέσεις, κανένας κανόνας δεν παραβαίνεται σιωπηλά, καμία κενή θέση που γέμιζε) και ότι το μοίρασμα μένει δίκαιο:
// στην ήσυχη προσομοίωση (ίδιοι στρατιώτες, χωρίς άδειες) οι διαφορές είναι μικρές· στη φορτωμένη (άδειες, ιατρικά, Σ.Ι., πόστα, νέοι,
// όσοι φεύγουν, θέσεις με το χέρι) όλοι παίρνουν περίπου όσα τους αναλογούν. Μόνο φανταστικά ονόματα.
import { describe, it, expect } from 'vitest';
import { BUSY, QUIET, cleanIds, range, restViol, shareRatio, simulate, stats, type Sim } from './duty-sim';
import { isHol, postBy } from '../src/shared/rules';
import type { Person, Rules } from '../src/shared/domain';

type Opts = Parameters<typeof simulate>[0];
const sim = (o: Opts) => simulate(o);
// κοινοί έλεγχοι κάθε προσομοίωσης
function invariants(m: Sim) {
  expect(m.viol).toEqual([]);          // διπλή θέση, κανόνας που παραβαίνεται, άοπλος σε σκοπιά, πόστο σε Λ/Υ-Δ/Υ, κενή θέση που γέμιζε
  expect(restViol(m)).toEqual([]);     // ανάπαυση και αργία μετά από αργία (εκτός από τις θέσεις με ειδοποίηση)
}
// μετρήσεις ανά άτομο: σύνολο, αργίες, «νύχτα» (3ο+4ο νούμερο), Λ/Υ-Δ/Υ
function spread(m: Sim, ids: number[]) {
  const per = new Map(ids.map(id => [id, { all: 0, hol: 0, night: 0, ly: 0 }]));
  for (const d of m.days) for (const [k, pid] of Object.entries(m.s.guards[d] || {})) {
    const x = per.get(pid); if (!x) continue; const post = postBy(m.s, k)!;
    x.all++; if (isHol(m.s.settings, d)) x.hol++; if (post.rot === 2 || post.rot === 3) x.night++; if (post.kind === 'ly') x.ly++;
  }
  const r = (f: 'all' | 'hol' | 'night' | 'ly') => range([...per.values()].map(x => x[f]));
  return { total: r('all'), hol: r('hol'), night: r('night'), ly: r('ly') };
}
const empties = (m: Sim) => m.log.reduce((a, l) => a + l.empty.length, 0);
const allIds = (m: Sim) => m.s.people.map(p => p.id);

describe('ήσυχη προσομοίωση: ίδιοι στρατιώτες, χωρίς άδειες', () => {
  // μέγιστη διαφορά ανάμεσα στον πρώτο και τον τελευταίο: σύνολο ≤ 2, αργίες ≤ 1, νύχτα και Λ/Υ-Δ/Υ λίγες (main: 3-17 και 2-27)
  const CASES: [string, Opts, { night: number; ly: number }][] = [
    ['60 άτομα ΣΒΕΝ, 6 μήνες', { seed: 1, n: 60, days: 182, phase: 'sven', noise: QUIET }, { night: 6, ly: 3 }],
    ['80 άτομα ΣΠΕΝ, 6 μήνες', { seed: 1, n: 80, days: 182, phase: 'spen', noise: QUIET }, { night: 6, ly: 3 }],
    ['160 άτομα ΣΒΕΝ, 3 μήνες', { seed: 1, n: 160, days: 91, phase: 'sven', noise: QUIET }, { night: 5, ly: 3 }],
    ['60 άτομα ΣΒΕΝ με δικές σου υπηρεσίες και Αυστηρά Άοπλοι', { seed: 1, n: 60, days: 91, phase: 'sven', noise: QUIET, custom: true, rules: { strictUnarmed: true } }, { night: 5, ly: 3 }],
    ['100 άτομα ΣΠΕΝ με δικές σου υπηρεσίες', { seed: 1, n: 100, days: 91, phase: 'spen', noise: QUIET, custom: true }, { night: 6, ly: 3 }]
  ];
  for (const [name, o, lim] of CASES) it(name, () => {
    const m = sim(o); invariants(m);
    const sp = spread(m, allIds(m));
    expect(sp.total).toBeLessThanOrEqual(2);
    expect(sp.hol).toBeLessThanOrEqual(1);
    expect(sp.night).toBeLessThanOrEqual(lim.night);
    expect(sp.ly).toBeLessThanOrEqual(lim.ly);
    expect(empties(m)).toBe(0);
  });

  it('20 άτομα (λιγότεροι από τις θέσεις): ισχύουν οι κανόνες, οι θέσεις που περισσεύουν μένουν κενές, και οι αργίες γεμίζουν με ειδοποίηση', () => {
    const m = sim({ seed: 1, n: 20, days: 91, phase: 'sven', noise: QUIET }); invariants(m);
    expect(empties(m)).toBeGreaterThan(0);
    expect(m.soft.size).toBeGreaterThan(0);
    for (const k of m.soft) expect(isHol(m.s.settings, k.slice(0, 10))).toBe(true);
    expect(m.log.flatMap(l => l.warn).some(t => /^\d\d\/\d\d: μπήκ(αν \d+ που είχαν|ε 1 που είχε) κάνει αργία πρόσφατα \(δεν έφταναν οι υπόλοιποι\)$/.test(t))).toBe(true);
  });

  it('χωρίς τον κανόνα «όχι αργία δύο συνεχόμενες εβδομάδες» δεν υπάρχει ειδοποίηση ούτε εξαίρεση', () => {
    const rules: Partial<Rules> = { noConsecHol: false };
    const m = sim({ seed: 1, n: 60, days: 91, phase: 'sven', noise: QUIET, rules }); invariants(m);
    expect(m.soft.size).toBe(0);
    expect(m.log.flatMap(l => l.warn).filter(t => /αργία πρόσφατα/.test(t))).toEqual([]);
  });
});

describe('φορτωμένη προσομοίωση: άδειες, ιατρικά, Σ.Ι., πόστα, νέοι, όσοι φεύγουν, χειροκίνητες θέσεις, μόνιμοι Λ/Υ-Δ/Υ', () => {
  const unarmed = (p: Person) => (p.si === 'Ι3 ΧΩΡΙΣ ΟΠΛΟ' || p.si === 'Ι4');
  const plain = (m: Sim) => (p: Person) => !unarmed(p) && !m.joined.has(p.id) && !m.left.has(p.id) && !p.offDays && !p.skips && !m.s.caps[p.id] && !p.post;
  // Ι3 χωρίς όπλο και Ι4 με τα Αυστηρά Άοπλοι: έπαιρναν 2,9 ως 4,2 φορές όσα τους αναλογούσαν· τώρα περίπου όσα (όπως οι άλλοι)
  for (const [name, o] of [
    ['160 άτομα ΣΒΕΝ, Αυστηρά Άοπλοι, σπόρος 1', { seed: 1, n: 160, days: 91, phase: 'sven', rules: { strictUnarmed: true } }],
    ['160 άτομα ΣΒΕΝ, Αυστηρά Άοπλοι, σπόρος 2', { seed: 2, n: 160, days: 91, phase: 'sven', rules: { strictUnarmed: true } }],
    ['160 άτομα ΣΠΕΝ, Αυστηρά Άοπλοι', { seed: 1, n: 160, days: 91, phase: 'spen', rules: { strictUnarmed: true } }],
    ['100 άτομα ΣΒΕΝ με δικές σου υπηρεσίες, Αυστηρά Άοπλοι', { seed: 1, n: 100, days: 91, phase: 'sven', custom: true, rules: { strictUnarmed: true } }],
    ['60 άτομα ΣΒΕΝ, Αυστηρά Άοπλοι (λίγοι για τις θέσεις)', { seed: 1, n: 60, days: 91, phase: 'sven', rules: { strictUnarmed: true } }]
  ] as [string, Opts][]) it(name, () => {
    const m = sim({ noise: BUSY, ...o }); invariants(m);
    const u = shareRatio(m, p => unarmed(p) && !p.offDays && !p.skips && !m.s.caps[p.id] && !p.post), a = shareRatio(m, plain(m)), nw = shareRatio(m, p => m.joined.has(p.id));
    expect(u.n).toBeGreaterThanOrEqual(3);
    expect(u.ratio).toBeGreaterThanOrEqual(0.8); expect(u.ratio).toBeLessThanOrEqual(1.25);
    expect(a.ratio).toBeGreaterThanOrEqual(0.8); expect(a.ratio).toBeLessThanOrEqual(1.25);
    // οι νέοι ξεκινούν από τη μέρα που ήρθαν και παίρνουν περίπου όσα τους αναλογούν
    expect(nw.ratio).toBeGreaterThanOrEqual(0.85); expect(nw.ratio).toBeLessThanOrEqual(1.15);
  });

  it('οι νέοι από τον μέσο όρο (newAvg) παίρνουν επίσης περίπου όσα τους αναλογούν', () => {
    const m = sim({ seed: 3, n: 160, days: 91, phase: 'sven', noise: BUSY, rules: { strictUnarmed: true, newAvg: true } }); invariants(m);
    const nw = shareRatio(m, p => m.joined.has(p.id));
    expect(nw.n).toBeGreaterThanOrEqual(5);
    expect(nw.ratio).toBeGreaterThanOrEqual(0.85); expect(nw.ratio).toBeLessThanOrEqual(1.15);
  });

  it('χωρίς Αυστηρά Άοπλοι, με αλλαγή εντύπου στη μέση, αργίες και πολλά ιατρικά: οι κανόνες ισχύουν', () => {
    const m = sim({ seed: 4, n: 100, days: 91, phase: 'sven', noise: BUSY, switchAt: 40, hols: ['2026-11-13', '2026-12-04'], custom: true }); invariants(m);
  });

  it('κανένας με πόστο δεν μπαίνει μόνος του σε Λ/Υ-Δ/Υ ούτε αλλού', () => {
    const m = sim({ seed: 5, n: 80, days: 91, phase: 'sven', noise: { ...BUSY, post: 0.1, manual: 0 } }); invariants(m);
    const posted = new Set(m.s.people.filter(p => p.post).map(p => p.id));
    expect(posted.size).toBeGreaterThan(3);
    const fixed = new Set(Object.values(m.s.settings.fixed || {}));
    for (const d of m.days) for (const [k, pid] of Object.entries(m.s.guards[d] || {})) if (posted.has(pid) && !m.manual.has(d + '|' + k)) expect(fixed.has(pid) && (k === 'ly' || k === 'dy')).toBe(true);
  });

  it('ίδιο αποτέλεσμα με τον ίδιο σπόρο (επαναλήψιμο)', () => {
    const o: Opts = { seed: 6, n: 40, days: 30, phase: 'spen', noise: BUSY, rules: { strictUnarmed: true } };
    expect(sim(o).s.guards).toEqual(sim(o).s.guards);
  });

  it('ήσυχη με λίγα πόστα και Σ.Ι.: όσοι δεν έχουν τίποτα απ\' αυτά παίρνουν κοντά (160 άτομα, 3 μήνες)', () => {
    const m = sim({ seed: 7, n: 160, days: 91, phase: 'sven', noise: { ...QUIET, post: 0.03, si: 0.1 }, rules: { strictUnarmed: true } }); invariants(m);
    const ids = cleanIds(m); expect(ids.length).toBeGreaterThan(100);
    const st = stats(m); const tot = ids.map(id => st.get(id)?.total || 0);
    expect(range(tot)).toBeLessThanOrEqual(4);
  });
});
