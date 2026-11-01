// Προσομοίωση υπηρεσιών (duty-sim): Ν στρατιώτες, μήνες αυτόματης συμπλήρωσης μέρα με τη μέρα, όπως ο λοχίας. Ελέγχει τις αναλλοίωτες
// (κανένας σε δύο θέσεις, κανένας κανόνας δεν παραβαίνεται σιωπηλά, καμία κενή θέση που γέμιζε) και ότι το μοίρασμα μένει δίκαιο:
// στην ήσυχη προσομοίωση (ίδιοι στρατιώτες, χωρίς άδειες) οι διαφορές είναι μικρές· στη φορτωμένη (άδειες, ιατρικά, Σ.Ι., πόστα, νέοι,
// όσοι φεύγουν, θέσεις με το χέρι) όλοι παίρνουν περίπου όσα τους αναλογούν. Μόνο φανταστικά ονόματα.
import { describe, it, expect } from 'vitest';
import { BUSY, QUIET, blockOf, cleanIds, range, restViol, shareRatio, simulate, stats, type Sim, type SimEvent } from './duty-sim';
import { isHol, postBy, postsOf } from '../src/shared/rules';
import { addDays } from '../src/shared/dates';
import type { Command } from '../src/shared/commands';
import type { Person, Phase, Rules } from '../src/shared/domain';

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

// Αλλαγές στη μέση της περιόδου, όπως τις κάνει ο λοχίας από τις Ρυθμίσεις (events του duty-sim): η αυτόματη συμπλήρωση συνεχίζει με τα νέα δεδομένα
describe('αλλαγές στη μέση της περιόδου: νέα υπηρεσία, ανενεργή, άτομα, βάρδιες, νέο έντυπο', () => {
  const GATE = (ph: Phase, n: number): SimEvent['cmd'] => ({ t: 'addBlock', phase: ph, name: 'ΠΥΛΗ', armed: true, n, hrs: '14:00 → 14:00' });
  const editN = (ph: Phase, name: string, n: number): SimEvent['cmd'] => s => { const b = blockOf(s, ph, name); return b ? { t: 'editBlock', phase: ph, id: b.id, name: b.name, n, hrs: {} } : null; };
  const editShift = (ph: Phase, shift: Extract<Command, { t: 'editBlock' }>['shift']): SimEvent['cmd'] => s => { const b = blockOf(s, ph, 'th'); return b ? { t: 'editBlock', phase: ph, id: b.id, name: b.name, n: b.posts.length, hrs: {}, shift } : null; };
  const patch = (ph: Phase, name: string, p: { hidden?: boolean; armed?: boolean }): SimEvent['cmd'] => s => { const b = blockOf(s, ph, name); return b ? { t: 'setBlock', phase: ph, id: b.id, patch: p } : null; };
  // συμπληρώνει τις επόμενες μέρες από πριν (όπως όταν ο λοχίας έχει βγάλει το πρόγραμμα της εβδομάδας)
  const ahead = (at: number, days: number): SimEvent[] => Array.from({ length: days }, (_, i) => ({ at, cmd: ({ t: 'autofill', date: addDays(simDay(at), i + 1) }) as const }));
  const START = '2026-10-01'; const simDay = (i: number) => addDays(START, i);
  const hideMg = (ph: Phase, hidden: boolean): SimEvent['cmd'] => ({ t: 'setBlock', phase: ph, id: 'mg', patch: { hidden } });
  const L: Record<string, (ph: Phase) => SimEvent[]> = {
    addMid: ph => [{ at: 30, cmd: GATE(ph, 2) }, { at: 45, cmd: { t: 'addBlock', phase: ph, name: 'ΠΕΡΙΠΟΛΟΣ', armed: false, n: 1, hrs: '18:00 → 22:00' } }],
    addHideShow: ph => [{ at: 20, cmd: GATE(ph, 2) }, { at: 50, cmd: patch(ph, 'ΠΥΛΗ', { hidden: true }) }, { at: 70, cmd: patch(ph, 'ΠΥΛΗ', { hidden: false }) }],
    resize: ph => [{ at: 0, cmd: GATE(ph, 2) }, { at: 30, cmd: editN(ph, 'ΠΥΛΗ', 4) }, ...ahead(59, 5), { at: 60, cmd: editN(ph, 'ΠΥΛΗ', 1) }],
    hideStd: ph => [{ at: 30, cmd: hideMg(ph, true) }, { at: 60, cmd: hideMg(ph, false) }],
    shifts: ph => [{ at: 30, cmd: editShift(ph, { every: 180 }) },
      { at: 60, cmd: editShift(ph, { every: 120, list: [{ from: '14:00', to: '18:00', n: 0 }, { from: '18:00', to: '22:00', n: 1 }, { from: '22:00', to: '02:00', n: 2 }, { from: '02:00', to: '06:00', n: 3 }, { from: '06:00', to: '14:00', n: 0 }] }) },
      { at: 80, cmd: editShift(ph, null) }],
    armedFlip: ph => [{ at: 0, cmd: { t: 'addBlock', phase: ph, name: 'ΠΕΡΙΠΟΛΟΣ', armed: false, n: 2, hrs: '18:00 → 22:00' } }, { at: 40, cmd: patch(ph, 'ΠΕΡΙΠΟΛΟΣ', { armed: true }) }],
    newPhase: ph => [{ at: 30, cmd: { t: 'addPhase', name: 'ΑΣΚΗΣΗ', from: ph } }, { at: 31, cmd: s => ({ t: 'setPhase', phase: s.settings.phases![0].id }) },
      { at: 32, cmd: s => ({ t: 'addBlock', phase: s.settings.phases![0].id, name: 'ΠΥΛΗ', armed: true, n: 3, hrs: '14:00 → 14:00' }) }, { at: 60, cmd: { t: 'setPhase', phase: ph } }]
  };
  // όλα μαζί: νέα υπηρεσία 3 ατόμων, 1 άτομο, ανενεργή (με τα μαγειρεία) και ξανά ενεργή
  const COMBINED = (ph: Phase): SimEvent[] => [{ at: 20, cmd: GATE(ph, 3) }, ...ahead(34, 4), { at: 35, cmd: editN(ph, 'ΠΥΛΗ', 1) }, { at: 50, cmd: patch(ph, 'ΠΥΛΗ', { hidden: true }) }, { at: 50, cmd: hideMg(ph, true) },
    { at: 70, cmd: patch(ph, 'ΠΥΛΗ', { hidden: false }) }, { at: 70, cmd: hideMg(ph, false) }];

  // [όνομα, έντυπο, άτομα, πόσες εντολές έγιναν]
  const CASES: [string, 'sven' | 'spen', number, number][] = [
    ['addMid', 'sven', 60, 2], ['addHideShow', 'spen', 60, 3], ['resize', 'sven', 100, 8], ['hideStd', 'spen', 60, 2],
    ['shifts', 'sven', 60, 3], ['armedFlip', 'spen', 60, 2], ['newPhase', 'sven', 60, 4]
  ];
  for (const [name, ph, n, cmds] of CASES) it(`${name}, ${ph === 'sven' ? 'ΣΒΕΝ' : 'ΣΠΕΝ'}, ${n} άτομα, ήσυχη`, () => {
    const m = sim({ seed: 1, n, days: 91, phase: ph, noise: QUIET, events: L[name](ph) });
    expect(m.events.length).toBe(cmds);
    invariants(m);                       // και: καμία αυτόματη θέση σε υπηρεσία που δεν υπήρχε ή ήταν ανενεργή εκείνη τη μέρα
    const sp = spread(m, allIds(m));
    expect(sp.total).toBeLessThanOrEqual(2);
    expect(sp.hol).toBeLessThanOrEqual(1);
    // οι δικές σου υπηρεσίες μοιράζονται κι αυτές
    const own = new Map(allIds(m).map(id => [id, 0]));
    for (const d of m.days) for (const [k, pid] of Object.entries(m.s.guards[d] || {})) if (postBy(m.s, k)?.kind === 'other') own.set(pid, (own.get(pid) || 0) + 1);
    expect(range([...own.values()])).toBeLessThanOrEqual(4);
    expect(empties(m)).toBe(0);
    if (name === 'resize') {
      // λιγότερα άτομα (4 → 1): ό,τι είχε συμπληρωθεί από πριν για αύριο και μετά στις θέσεις που κρύφτηκαν βγήκε, δεν έμεινε αόρατο
      const vis = new Set(postsOf(m.s.settings).map(x => x.k));
      const gate = blockOf(m.s, ph, 'ΠΥΛΗ')!; const hidden = gate.posts.filter(x => !vis.has(x.k)).map(x => x.k);
      expect(hidden.length).toBe(3);
      for (let i = 61; i < m.days.length; i++) for (const k of hidden) expect([m.days[i], k, (m.s.guards[m.days[i]] || {})[k]]).toEqual([m.days[i], k, undefined]);
      expect(m.days.slice(61, 66).some(d => Object.keys(m.s.guards[d] || {}).some(k => vis.has(k) && k.startsWith(gate.id)))).toBe(true);   // η πρώτη θέση μένει
    }
  });

  // φορτωμένη (άδειες, ιατρικά, Σ.Ι., νέοι, θέσεις με το χέρι): όλα μαζί, και όλοι παίρνουν περίπου όσα τους αναλογούν
  for (const [ph, n] of [['sven', 100], ['spen', 100]] as ['sven' | 'spen', number][]) it(`όλα μαζί, ${ph === 'sven' ? 'ΣΒΕΝ' : 'ΣΠΕΝ'}, ${n} άτομα, φορτωμένη με Αυστηρά Άοπλοι`, () => {
    const m = sim({ seed: 2, n, days: 91, phase: ph, noise: BUSY, rules: { strictUnarmed: true }, events: COMBINED(ph) });
    expect(m.events.length).toBe(10);
    invariants(m);
    const clean = (p: Person) => !m.left.has(p.id) && !p.offDays && !p.skips && !m.s.caps[p.id] && !p.post;
    const plain = shareRatio(m, p => p.si === 'Ι1' && !m.joined.has(p.id) && clean(p));
    const unarmed = shareRatio(m, p => (p.si === 'Ι3 ΧΩΡΙΣ ΟΠΛΟ' || p.si === 'Ι4') && clean(p));
    const fresh = shareRatio(m, p => m.joined.has(p.id));
    expect(unarmed.n).toBeGreaterThanOrEqual(3);
    for (const r of [plain, unarmed, fresh]) { expect(r.ratio).toBeGreaterThanOrEqual(0.85); expect(r.ratio).toBeLessThanOrEqual(1.15); }
  });
});
