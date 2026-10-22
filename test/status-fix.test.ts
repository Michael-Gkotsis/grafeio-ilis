// Διόρθωση και διαγραφή ιατρικού/ποινής που μπήκε λάθος (UX Π2, 22/10) και οι φόρμες που δεν χάνονται σιωπηλά (Π1, Π3).
// Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState, Status } from '../src/shared/domain';
import { outBlock, statusesOn } from '../src/shared/rules';
import { fakeState } from './fixtures';

const TODAY = '2026-10-14';
let seq = 0;
const ctx = (): Ctx => ({ today: TODAY, newId: () => 'f' + ++seq });
const run = (s: AppState, c: Command) => apply(s, c, ctx());
const with1 = (st: Status): AppState => ({ ...fakeState(10), statuses: [st] });
const ey: Status = { id: 's1', pid: 1, type: 'EY', from: '2026-10-13', to: '2026-10-15', note: 'ΓΙΑΤΡΟΣ' };
const pun: Status = { id: 'p1', pid: 2, type: 'PUN', from: '2026-10-14', to: '2026-10-17', kind: 'Κράτηση', by: 'ΛΧΙΑ ΔΟΚΙΜΙΟ', reason: 'ΑΡΓΗΣΕ', on: '2026-10-13' };

describe('διόρθωση (replaceStatus)', () => {
  it('αλλάζει τις ημερομηνίες: η παλιά φεύγει, μένει μία καταχώρηση', () => {
    const r = run(with1(ey), { t: 'replaceStatus', id: 's1', cmds: [{ type: 'EY', pids: [1], from: '2026-10-13', to: '2026-10-20', note: 'ΓΙΑΤΡΟΣ' }] });
    expect(r.state.statuses).toHaveLength(1);
    expect(r.state.statuses[0]).toMatchObject({ pid: 1, type: 'EY', from: '2026-10-13', to: '2026-10-20', note: 'ΓΙΑΤΡΟΣ' });
    expect(r.state.statuses[0].id).not.toBe('s1');
    expect(r.text).toMatch(/^Διόρθωση: .*\(ήταν ΕΥ 13\/10–15\/10\)$/);
  });
  it('ίδια στοιχεία: δεν θεωρείται διπλή δήλωση του εαυτού της', () => {
    const r = run(with1(ey), { t: 'replaceStatus', id: 's1', cmds: [{ type: 'EY', pids: [1], from: ey.from, to: ey.to }] });
    expect(r.state.statuses).toHaveLength(1);
  });
  it('άλλο ιατρικό ή άλλος άνθρωπος (μπήκε σε λάθος)', () => {
    const r = run(with1(ey), { t: 'replaceStatus', id: 's1', cmds: [{ type: 'EA', pids: [3], from: ey.from, to: ey.to }] }).state;
    expect(r.statuses.map(x => [x.pid, x.type])).toEqual([[3, 'EA']]);
    expect(statusesOn(r.statuses, 1, TODAY)).toEqual([]);
  });
  it('ποινή: κρατά ποιος τιμώρησε, λόγο και ημερομηνία τιμωρίας', () => {
    const r = run(with1(pun), { t: 'replaceStatus', id: 'p1', cmds: [{ type: 'PUN', pids: [2], from: '2026-10-14', to: '2026-10-15', kind: 'Κράτηση', by: pun.by, reason: pun.reason, on: pun.on }] }).state;
    expect(r.statuses).toHaveLength(1);
    expect(r.statuses[0]).toMatchObject({ type: 'PUN', to: '2026-10-15', by: 'ΛΧΙΑ ΔΟΚΙΜΙΟ', reason: 'ΑΡΓΗΣΕ', on: '2026-10-13' });
  });
  it('ίδιοι έλεγχοι με τη δήλωση: «έως» πριν από «από» δεν γίνεται και η παλιά μένει', () => {
    const s = with1(ey);
    expect(() => run(s, { t: 'replaceStatus', id: 's1', cmds: [{ type: 'EY', pids: [1], from: '2026-10-15', to: '2026-10-13' }] })).toThrow('πριν από');
    expect(s.statuses).toEqual([ey]);
  });
  it('μόνο ιατρικά και ποινές (οι άδειες έχουν Ακύρωση/Διακοπή)', () => {
    const lv: Status = { id: 'l1', pid: 1, type: 'LEAVE', from: TODAY, to: '2026-10-18', kind: 'Κανονική' };
    expect(() => run(with1(lv), { t: 'replaceStatus', id: 'l1', cmds: [{ type: 'LEAVE', pids: [1], from: TODAY, to: '2026-10-16', kind: 'Κανονική' }] })).toThrow('μόνο ιατρικά και ποινές');
  });
});

describe('διαγραφή (deleteStatus)', () => {
  it('φεύγει ολόκληρη, και οι περασμένες μέρες', () => {
    const s = with1(pun);
    expect(outBlock(s, TODAY, 2)).toBeTruthy();
    const r = run(s, { t: 'deleteStatus', id: 'p1' });
    expect(r.state.statuses).toEqual([]);
    expect(r.text).toMatch(/^Διαγράφηκε \(μπήκε λάθος\): ποινή 14\/10–17\/10 του /);
    expect(outBlock(r.state, TODAY, 2)).toBeNull();
  });
});

const src = (f: string) => readFileSync(new URL('../src/renderer/' + f, import.meta.url), 'utf8');
describe('οθόνες: τίποτα δεν χάνεται σιωπηλά', () => {
  it('Ιατρικά, Ποινές και καρτέλα στρατιώτη έχουν «Διόρθωση…»', () => {
    expect(src('screens/other.ts')).toMatch(/StatusFixDialog\} st=\$\{fix\}/);
    expect(src('screens/people.ts')).toMatch(/StatusFixDialog\} st=\$\{fix\}/);
    expect(src('screens/people.ts')).toMatch(/t: 'replaceStatus'/);
    expect(src('screens/people.ts')).toMatch(/t: 'deleteStatus'/);
  });
  it('κάρτες με «Αποθήκευση» δηλώνουν τις αλλαγές τους (μπάρα + ερώτηση πριν φύγεις)', () => {
    const n = (f: string) => (src(f).match(/usePending\(/g) || []).length;
    expect(n('screens/settings.ts')).toBeGreaterThanOrEqual(3);   // Μονάδα και έντυπα, Γράμματα Excel, Υπογραφές
    expect(n('screens/units.ts')).toBe(2);   // Θάλαμοι, Τίτλος
    expect(n('screens/hkrows.ts')).toBe(1);
    expect(n('screens/other.ts')).toBe(2);   // Στελέχη ανά βαθμό, στοιχεία ΗΚΑΙ
    expect(src('app.ts')).toMatch(/requestLeave\(doIt\)/);
    expect(src('screens/settings.ts')).toMatch(/requestLeave\(\(\) => nav\.set\(\{ tab: k \}\)\)/);
    expect(src('screens/other.ts')).toMatch(/requestLeave\(\(\) => nav\.set\(\{ hkaiDate: d \}\)\)/);
  });
  it('φόρμες πολλών βημάτων ρωτούν πριν κλείσουν με Esc/✕', () => {
    expect(src('ui.ts')).toMatch(/useEscape\(tryClose\)/);
    for (const [f, n] of [['screens/people.ts', 5], ['screens/guard.ts', 2], ['screens/reports.ts', 1], ['screens/cadre.ts', 2]] as const)
      expect((src(f).match(/dirty=\$\{/g) || []).length, f).toBeGreaterThanOrEqual(n);
  });
  it('«Άδειασε τη μέρα» ρωτά πρώτα', () => {
    const g = src('screens/guard.ts');
    expect(g).not.toMatch(/>Καθάρισε</);
    const i = g.indexOf("t: 'clearDay'");
    expect(g.lastIndexOf('clearAsk && html', i)).toBeGreaterThan(0);
  });
});
