// Πολλά ιατρικά μαζί στον ίδιο στρατιώτη (Michael, 13/10): π.χ. ΕΑ και ΕΥ. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { dutyBlock, hkaiCounts, outBlock, planStatusChange } from '../src/shared/rules';
import { planWrite, defaultBinding, type SourceBinding } from '../src/shared/sources';
import type { AppState, TypeKey } from '../src/shared/domain';
import { fakeState } from './fixtures';

const TODAY = '2026-10-13';
let seq = 0;
const ctx: Ctx = { today: TODAY, newId: () => 'm' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const declare = (s: AppState, type: TypeKey, pid: number, from: string, to = from, kind?: string) =>
  run(s, { t: 'declare', cmd: { type, pids: [pid], from, to, ...(kind ? { kind } : {}) } });
const lists = { medKinds: { add: [{ name: 'ΕΛ ΠΟΔ', like: 'EA' as const }] } };

describe('πολλά ιατρικά μαζί', () => {
  it('ΕΥ πάνω σε ΕΑ: δηλώνεται, με σημείωση ότι ισχύουν και τα δύο', () => {
    const s0 = declare(fakeState(20), 'EA', 3, TODAY, '2026-10-16');
    const plan = planStatusChange(s0, { type: 'EY', pids: [3], from: '2026-10-14', to: '2026-10-15' }, TODAY);
    expect(plan.overlaps).toEqual([]);
    expect(plan.alongside.map(a => a.status.type)).toEqual(['EA']);
    const s = declare(s0, 'EY', 3, '2026-10-14', '2026-10-15');
    expect(s.statuses.filter(x => x.pid === 3).map(x => x.type)).toEqual(['EA', 'EY']);
  });
  it('το ίδιο ιατρικό δύο φορές στις ίδιες μέρες: όπως πριν, δεν περνά', () => {
    const s0 = declare(fakeState(20), 'EA', 3, TODAY, '2026-10-16');
    expect(planStatusChange(s0, { type: 'EA', pids: [3], from: '2026-10-15', to: '2026-10-18' }, TODAY).overlaps).toHaveLength(1);
    expect(() => declare(s0, 'EA', 3, TODAY, '2026-10-16')).toThrow(/έχει ήδη ΕΑ/);
  });
  it('δικό σου ιατρικό «σαν ΕΑ» μαζί με ΕΑ: είναι άλλο ιατρικό, περνά· το ίδιο δικό σου δεύτερη φορά όχι', () => {
    const f = fakeState(20); const s0 = declare({ ...f, settings: { ...f.settings, lists } }, 'EA', 3, TODAY, '2026-10-16');
    expect(planStatusChange(s0, { type: 'EA', kind: 'ΕΛ ΠΟΔ', pids: [3], from: TODAY, to: TODAY }, TODAY).overlaps).toEqual([]);
    const s = declare(s0, 'EA', 3, TODAY, '2026-10-16', 'ΕΛ ΠΟΔ');
    expect(s.statuses.filter(x => x.pid === 3)).toHaveLength(2);
    expect(planStatusChange(s, { type: 'EA', kind: 'ΕΛ ΠΟΔ', pids: [3], from: '2026-10-15', to: '2026-10-15' }, TODAY).overlaps).toHaveLength(1);
  });
  it('άλλα είδη μένουν όπως πριν: άδεια πάνω σε άδεια δεν περνά, ιατρικό πάνω σε άδεια περνά χωρίς σημείωση', () => {
    const s0 = declare(fakeState(20), 'LEAVE', 4, TODAY, '2026-10-16');
    expect(planStatusChange(s0, { type: 'LEAVE', pids: [4], from: '2026-10-15', to: '2026-10-15' }, TODAY).overlaps).toHaveLength(1);
    const p = planStatusChange(s0, { type: 'EY', pids: [4], from: TODAY, to: TODAY }, TODAY);
    expect(p.overlaps).toEqual([]); expect(p.alongside).toEqual([]);
  });
  it('κανόνες: μετρά ο πιο αυστηρός (ΕΑΡΒ + ΕΑ = όχι ένοπλη, ΕΑ + ΕΥ = καμία υπηρεσία, όχι έξοδος)', () => {
    let s = declare(fakeState(20), 'EARV', 3, TODAY);
    s = declare(s, 'EA', 3, TODAY);
    expect(dutyBlock(s.statuses, TODAY, 3, { armed: true, kind: 'sk' })).toMatch(/Άοπλος: ΕΑ/);
    expect(dutyBlock(s.statuses, TODAY, 3, { armed: false, kind: 'th' })).toBeNull();
    s = declare(s, 'EY', 3, TODAY);
    expect(dutyBlock(s.statuses, TODAY, 3, { armed: false, kind: 'th' })).toMatch(/^ΕΥ/);
    expect(outBlock(s, TODAY, 3)).toMatch(/^ΕΥ/);
  });
  it('ΗΚΑΙ: όποιος έχει ΕΑ και ΕΥ μετρά μία φορά, στους ΕΥ', () => {
    const base = hkaiCounts(fakeState(20), TODAY);
    let s = declare(fakeState(20), 'EA', 3, TODAY); s = declare(s, 'EY', 3, TODAY);
    const h = hkaiCounts(s, TODAY);
    expect(h.cols.ey.map(p => p.id)).toEqual([3]);
    expect(h.kol).toBe(base.kol + 1);
    expect(h.avail).toBe(base.avail);
  });
  it('Excel ΕΑ-ΕΥ: δύο γραμμές για τον ίδιο, μία για κάθε ιατρικό', () => {
    let s = declare(fakeState(20), 'EA', 3, TODAY, '2026-10-16'); s = declare(s, 'EY', 3, TODAY, '2026-10-14');
    const b: SourceBinding = defaultBinding('medical', 'ΙΑΤΡΙΚΑ.xlsx');
    const plan = planWrite('medical', null, b, s, [], TODAY);
    expect(plan.added).toBe(2);
    expect(plan.keys).toHaveLength(2);
    expect(plan.sets.filter(x => x.c === b.cols.kind).map(x => x.v)).toEqual(['ΕΑ', 'ΕΥ']);
  });
});
