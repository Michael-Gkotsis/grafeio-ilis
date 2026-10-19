// Φύλακας απόδοσης (review απόδοσης 18/10): ρεαλιστικά δεδομένα (180 άτομα, 2 μήνες υπηρεσιών, άδειες, ιατρικά, ποινές,
// εξοδούχοι, όπλα) και όρια πολύ πάνω από τους σημερινούς χρόνους (×20 και πάνω), ώστε να πιάνει μόνο πραγματική
// χειροτέρευση (π.χ. βρόχος μέσα σε βρόχο) και όχι ένα αργό μηχάνημα. Λεπτομέρειες: npm run bench:full, npm run bench:ui.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply } from '../src/shared/commands';
import { addDays } from '../src/shared/dates';
import { dutyStats, fillDay, hkaiCounts, strengthOf, activePeople, outBlock } from '../src/shared/rules';
import { preflight } from '../src/shared/preflight';
import { returnsOn } from '../src/shared/weekend';
import { fillFroura, fillHkai, fillOuts } from '../src/main/exports';
import { benchState } from '../bench/state';

const END = '2026-10-16';
const ms = (f: () => unknown) => { const a = performance.now(); f(); return performance.now() - a; };
const ams = async (f: () => Promise<unknown>) => { const a = performance.now(); await f(); return performance.now() - a; };
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));

describe('απόδοση με ρεαλιστικά δεδομένα', () => {
  const s = benchState({ n: 180, days: 60, end: END });
  const ctx = { today: END, newId: (() => { let i = 0; return () => 'p' + ++i; })() };
  it('οι εντολές και οι κανόνες των οθονών μένουν γρήγοροι', () => {
    expect(s.statuses.length).toBeGreaterThan(1000);
    expect(ms(() => apply(s, { t: 'autofill', date: addDays(END, 1) }, ctx))).toBeLessThan(200);
    expect(ms(() => apply(s, { t: 'declare', cmd: { type: 'LEAVE', kind: 'Κανονική', pids: [5], from: END, to: addDays(END, 3) } }, ctx))).toBeLessThan(100);
    const outs = activePeople(s).filter(p => !outBlock(s, END, p.id)).slice(0, 60);
    expect(ms(() => apply(s, { t: 'outs', date: END, changes: outs.map(p => ({ pid: p.id, from: null, to: 'OUT' as const })) }, ctx))).toBeLessThan(100);
    expect(ms(() => fillDay(s, addDays(END, 2)))).toBeLessThan(150);
    expect(ms(() => dutyStats({ ...s, guards: { ...s.guards } }))).toBeLessThan(100);
    expect(ms(() => strengthOf({ ...s, statuses: [...s.statuses] }, END))).toBeLessThan(100);
    expect(ms(() => hkaiCounts(s, END))).toBeLessThan(100);
    expect(ms(() => returnsOn(s, END))).toBeLessThan(150);
    expect(ms(() => { for (const k of ['froura', 'hkai', 'outs', 'check'] as const) preflight(k, s, END); })).toBeLessThan(200);
  });
  it('τα έντυπα βγαίνουν γρήγορα (και ξαναβγαίνουν μόνα τους μετά από κάθε αλλαγή)', async () => {
    expect(await ams(() => fillFroura(T('froura.xlsx'), s, END))).toBeLessThan(1500);
    expect(await ams(() => fillHkai(T('hkai.xlsx'), s, END))).toBeLessThan(1500);
    expect(await ams(() => fillOuts(T('exodouxoi.xlsx'), s, END))).toBeLessThan(1500);
  }, 20_000);
  it('οι μεγάλοι πίνακες δεν στήνουν τις γραμμές εκτός οθόνης', () => {
    // Οπλισμός ~3 δευτ. → ~0,8 (content-visibility, 18/10) → ~0,2 (VirtualList, 19/10) με 180 άτομα (bench/ui)
    // από 19/10 στήνονται μόνο οι γραμμές που φαίνονται (VirtualList), όπως στο Δυναμολόγιο
    for (const f of ['weapons.ts', 'whodoes.ts']) expect(fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'screens', f), 'utf8')).toMatch(/<\$\{VirtualList\}/);
  });
});
