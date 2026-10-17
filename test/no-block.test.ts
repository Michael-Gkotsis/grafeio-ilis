// Ποτέ πλήρες μπλοκάρισμα (Michael, 17/10): ό,τι λέει «όχι» ο κανόνας γίνεται με επιβεβαίωση (force), όχι απαγόρευση.
// Χωρίς επιβεβαίωση ισχύει ό,τι και πριν. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { outBlock } from '../src/shared/rules';
import { fakeState } from './fixtures';
import type { AppState } from '../src/shared/domain';

const D = '2026-10-12';
const ctx = { today: D, newId: (() => { let i = 0; return () => 'n' + ++i; })() };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const punished = (s: AppState, pid: number) => run(s, { t: 'declare', cmd: { type: 'PUN', pids: [pid], from: D, to: D, kind: 'Κράτηση' } });

describe('χωρίς πλήρες μπλοκάρισμα', () => {
  it('τιμωρημένος σε έξοδο: μόνο με επιβεβαίωση', () => {
    const s = punished(fakeState(10), 4);
    expect(outBlock(s, D, 4)).toBeTruthy();
    expect(() => run(s, { t: 'outs', date: D, changes: [{ pid: 4, from: null, to: 'OUT' }] })).toThrow(/δεν βγαίνει/);
    const ok = run(s, { t: 'outs', date: D, changes: [{ pid: 4, from: null, to: 'OUT' }], force: true });
    expect(ok.statuses.some(x => x.pid === 4 && x.type === 'OUT')).toBe(true);
  });
  it('δήλωση ΔΝ σε τιμωρημένο: μόνο με επιβεβαίωση', () => {
    const s = punished(fakeState(10), 4);
    const cmd = { type: 'DN' as const, pids: [4], from: D, to: D };
    expect(() => run(s, { t: 'declare', cmd })).toThrow(/δεν βγαίνει/);
    expect(run(s, { t: 'declare', cmd: { ...cmd, force: true } }).statuses.some(x => x.pid === 4 && x.type === 'DN')).toBe(true);
  });
  it('ΕΥ σε υπηρεσία: μόνο με αιτία', () => {
    const s = run(fakeState(10), { t: 'declare', cmd: { type: 'EY', pids: [3], from: D, to: D } });
    expect(() => run(s, { t: 'assign', date: D, k: 'th1', pid: 3 })).toThrow(/ΕΥ/);
    const r = apply(s, { t: 'assign', date: D, k: 'th1', pid: 3, force: 'εντολή λοχία' }, ctx);
    expect(r.state.guards[D].th1).toBe(3); expect(r.text).toMatch(/παρά τον κανόνα.*εντολή λοχία/);
  });
});
