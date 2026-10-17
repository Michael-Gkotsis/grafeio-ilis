// R1 «Γιατί αυτός;» με την κράτηση ενόπλων, R4 υπηρεσίες που έγιναν, R9 ΔΝ χωρίς δικαίωμα, R11 «Έληξε» για όλες τις μέρες.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fillDay, planStatusChange, postsOf, whyText } from '../src/shared/rules';
import { outsChecks } from '../src/shared/preflight';
import type { AppState, Status } from '../src/shared/domain';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
const ctx: Ctx = { today: TODAY, newId: () => 'p' + Math.random() };
const run = (s: AppState, c: Command) => apply(s, c, ctx);

describe('R1: «Γιατί αυτός;» όταν τον διάλεξε η κράτηση των ενόπλων', () => {
  it('ο ΕΑ στον θαλαμοφύλακα, γιατί ο πρώτος στη σειρά χρειαζόταν για την ΤΑΕ', () => {
    const D = '2026-10-14';
    let s: AppState = { ...fakeState(30), settings: { ...fakeState(30).settings, phase: 'spen' } };
    s.people = s.people.map(p => ({ ...p, si: 'Ι1', post: null }));
    const g: Record<string, number> = {}; let pid = 3;
    for (const x of postsOf(s.settings)) if (x.k !== 'th2' && x.k !== 'tae') g[x.k] = pid++;
    s = { ...s, people: s.people.slice(0, pid - 1), guards: { [D]: g, '2026-10-08': { mg1: 2 } }, statuses: [{ id: 'e', pid: 2, type: 'EA', from: '2026-10-01', to: '2026-10-31' }] };
    const r = fillDay(s, D); const s2 = { ...s, guards: r.guards };
    expect([r.guards[D].th2, r.guards[D].tae]).toEqual([2, 1]);
    expect(whyText(s2, D, 'th2')).toMatch(/δεν κάνει ένοπλη και οι ένοπλες θέσεις δεν έφταναν/);
    expect(whyText(s2, D, 'tae')).not.toMatch(/ένοπλες θέσεις δεν έφταναν/);
  });
});

describe('R4: δήλωση με ημερομηνία πριν από σήμερα', () => {
  it('η υπηρεσία που έγινε μένει· με «ξεκλείδωμα» φεύγει', () => {
    const s = { ...fakeState(5), guards: { '2026-10-10': { th1: 2 }, '2026-10-13': { th2: 2 } } };
    const cmd = { type: 'EY' as const, pids: [2], from: '2026-10-10', to: '2026-10-14' };
    const a = run(s, { t: 'declare', cmd }).state;
    expect(a.guards['2026-10-10'].th1).toBe(2); expect(a.guards['2026-10-13'].th2).toBeUndefined();
    expect(planStatusChange(s, { ...cmd, unlockPast: true }, TODAY).past).toEqual([]);
    const b = run(s, { t: 'declare', cmd: { ...cmd, unlockPast: true } }).state;
    expect(b.guards['2026-10-10'].th1).toBeUndefined();
  });
});

describe('R9: ΔΝ χωρίς δικαίωμα', () => {
  it('⚠ (όχι ✕, Michael 17/10) στον προέλεγχο των εξοδούχων, μόνο όταν κάποιος έχει σημειωμένο δικαίωμα', () => {
    const D = '2026-10-17';
    const st: Status[] = [{ id: 'a', pid: 2, type: 'DN', from: D, to: D }, { id: 'b', pid: 3, type: 'DN', from: D, to: D }];
    const s0 = { ...fakeState(5), statuses: st };
    expect(outsChecks(s0, D).filter(c => /δικαίωμα ΔΝ/.test(c.text))).toEqual([]);
    const s1 = { ...s0, people: s0.people.map(p => (p.id === 2 ? { ...p, dn: true } : p)) };
    const e = outsChecks(s1, D).filter(c => /δικαίωμα ΔΝ/.test(c.text));
    expect(e).toHaveLength(1); expect(e[0].level).toBe('warn'); expect(e[0].text).toMatch(new RegExp(s1.people[2].last));
  });
});

describe('R11: «Έληξε» και για τις μέρες που η εφαρμογή ήταν κλειστή', () => {
  it('όσα έληξαν από το προηγούμενο άνοιγμα ως χθες, μία φορά', () => {
    const st: Status[] = ['2026-10-04', '2026-10-05', '2026-10-08', '2026-10-11', '2026-10-12'].map((to, i) => ({ id: 's' + i, pid: 1 + i, type: 'EA' as const, from: '2026-10-01', to }));
    const s = { ...fakeState(6), statuses: st, lastExpire: '2026-10-05' };
    const r = run(s, { t: 'expire' });
    expect(r.extra!.map(t => /έως (\d\d\/\d\d)/.exec(t)![1])).toEqual(['05/10', '08/10', '11/10']);
    expect(r.state.lastExpire).toBe(TODAY);
    const again = run(r.state, { t: 'expire' });
    expect(again.extra).toEqual([]); expect(again.state).toBe(r.state);
    // πρώτη φορά (χωρίς προηγούμενο): μόνο όσα έληξαν χθες, όπως πριν
    expect(run({ ...s, lastExpire: '' }, { t: 'expire' }).extra).toHaveLength(1);
  });
});
