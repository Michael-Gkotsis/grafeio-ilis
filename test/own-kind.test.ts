// Κάθε δική σου υπηρεσία μετρά ως δική της (Michael, 22/10): χωρίς «Μετρά ως», δική της στήλη στον έλεγχο και στη σειρά
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { dutyStats, fairKey, fairOf, monthStats, ownKinds, postsOf } from '../src/shared/rules';
import { statOn } from '../src/shared/stat';
import { dutyCols } from '../src/shared/sources';
import type { AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'ok' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const add = (s: AppState, name: string, extra: Partial<Extract<Command, { t: 'addBlock' }>> = {}) =>
  run(s, { t: 'addBlock', phase: 'sven', name, armed: false, n: 1, hrs: '', ...extra } as Command);

describe('νέα υπηρεσία', () => {
  it('χωρίς είδος: «άλλη», δικός της κωδικός και δική της στήλη στον έλεγχο υπηρεσιών', () => {
    const s = add(fakeState(5), 'Πύλη');
    const b = s.settings.blocks.find(x => x.custom)!;
    expect(b.kind).toBe('other');
    expect(b.posts[0].code).toMatch(/^Υ\d/);
    expect(dutyCols(s.settings).head).toContain('ΠΥΛΗ');
  });
  it('κάθε δική σου υπηρεσία μετρά χωριστά: Πύλη και Περίπολος δεν μετρούν μαζί', () => {
    let s = add(add(fakeState(10), 'Πύλη'), 'Περίπολος');
    const [gate, pat] = s.settings.blocks.filter(x => x.custom);
    const pg = postsOf(s.settings).find(x => x.block === gate.id)!, pp = postsOf(s.settings).find(x => x.block === pat.id)!;
    s = { ...s, guards: { '2026-10-05': { [pg.k]: 1 }, '2026-10-06': { [pg.k]: 1 }, '2026-10-07': { [pp.k]: 1, mg1: 2 } } };
    const d = dutyStats(s).get(1)!;
    expect(d.total).toBe(3);
    expect([d.byKind['b:' + gate.id], d.byKind['b:' + pat.id]]).toEqual([2, 1]);
    expect(monthStats(dutyStats(s), '2026-10').get(1)!.byKind['b:' + gate.id]).toBe(2);
    expect(fairKey(s, pg)).toBe('b:' + gate.id);
    expect(fairKey(s, postsOf(s.settings).find(x => x.k === 'mg1')!)).toBe('mg');
    expect(fairOf(s, 1, '2026-10-12').byKind['b:' + pat.id]).toBe(1);
    // ανενεργή: οι υπηρεσίες της μένουν στα σύνολα
    const off = run(s, { t: 'setBlock', phase: 'sven', id: gate.id, patch: { hidden: true } });
    expect(dutyStats(off).get(1)!.byKind['b:' + gate.id]).toBe(2);
    expect(dutyStats(off).get(1)!.total).toBe(3);
  });
});

describe('παλιές δικές σου υπηρεσίες (ownKinds, rev 7)', () => {
  it('γίνονται «άλλη», κρατούν κωδικούς και ό,τι έλεγε ο πίνακας Καταστάσεων λόγω του είδους', () => {
    const s0 = add(add(fakeState(5), 'Πύλη', { kind: 'mg' }), 'Σκοπιά Πύλης', { kind: 'sk', armed: true });
    const [gate, sk] = s0.settings.blocks.filter(x => x.custom);
    const pg0 = postsOf(s0.settings).find(x => x.block === gate.id)!;
    expect(statOn({ type: 'EA' }, pg0, s0.settings.lists).v).toBe('no');   // ΕΑ όχι σε μαγειρεία
    const st = ownKinds(s0.settings)!;
    const g = st.blocks.find(x => x.id === gate.id)!;
    expect(g.kind).toBe('other'); expect(g.posts[0].code).toBe(gate.posts[0].code);
    expect(st.blocks.find(x => x.id === sk.id)!.kind).toBe('other');
    expect(st.blocks.filter(x => !x.custom)).toEqual(s0.settings.blocks.filter(x => !x.custom));
    const pg = postsOf(st).find(x => x.block === gate.id)!;
    expect(pg.kind).toBe('other');
    expect(statOn({ type: 'EA' }, pg, st.lists).v).toBe('no');   // ίδιο αποτέλεσμα, τώρα ρητά
    expect(statOn({ type: 'EO' }, pg, st.lists).v).toBe('no');
    expect(st.lists!.stat!.cells!.EY).toBeUndefined();           // ΕΥ: όχι πουθενά ούτως ή άλλως
    expect(ownKinds(st)).toBeNull();
    expect(ownKinds(fakeState(3).settings)).toBeNull();
  });
});
