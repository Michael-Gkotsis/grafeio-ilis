// Προγραμματισμένη αναχώρηση (μονάδα): από τη μέρα που εφαρμόζεται δεν μπαίνει σε υπηρεσίες. Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import type { AppState } from '../src/shared/domain';
import { fillDay, guardUnavailable, postsOf, ruleBlock } from '../src/shared/rules';
import { leavingBlock } from '../src/shared/mode';
import { fakeState } from './fixtures';

const TODAY = '2026-11-13', D = '2026-11-20', B = '2026-11-25';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: TODAY, newId: () => 'm' + ++n }).state;
const unitState = (): AppState => run(fakeState(30), { t: 'setSettings', settings: { mode: 'unit' }, text: 'μονάδα' });
const used = (r: { guards: Record<string, Record<string, number>> }, d: string) => new Set(Object.values(r.guards[d] || {}));
// ο στρατιώτης που παίρνει η συμπλήρωση της D-1 χωρίς καμία κίνηση: αυτός που μετά «φεύγει» τη D
const D1 = '2026-11-19';
const pickPid = (): number => [...used(fillDay(unitState(), D1), D1)].find(x => x > 0 && x < 20)!;
const PID = pickPid();

describe('leavingBlock και κανόνες υπηρεσιών', () => {
  it('μέρα αναχώρησης: λόγος στον κανόνα, μία μέρα πριν όχι', () => {
    const s = run(unitState(), { t: 'addMove', pid: PID, dir: 'out', why: 'μετάθεση', where: 'ΣΣΕ', on: D });
    expect(s.people.find(p => p.id === PID)!.active).toBe(true);
    expect(leavingBlock(s, D, PID)).toMatch(/^Φεύγει από τη δύναμη 20\/11 \(ΜΕΤΑΘΕΣΗ: ΣΣΕ\)/);
    expect(ruleBlock(s, D, PID)).toMatch(/Φεύγει από τη δύναμη/); expect(guardUnavailable(s, D, PID, null)).toMatch(/Φεύγει/);
    expect(leavingBlock(s, '2026-11-19', PID)).toBeNull(); expect(ruleBlock(s, '2026-11-19', PID)).toBeNull();
    expect(leavingBlock(s, D, 6)).toBeNull();
  });
  it('η συμπλήρωση της μέρας δεν τον χρησιμοποιεί, της προηγούμενης μπορεί', () => {
    const s = run(unitState(), { t: 'addMove', pid: PID, dir: 'out', why: 'μετάθεση', on: D });
    const hits = (d: string) => used(fillDay(s, d), d).has(PID);
    expect(hits(D)).toBe(false); expect(hits('2026-11-21')).toBe(false);
    expect(hits(D1)).toBe(true);
  });
  it('με επιστροφή: η μέρα επιστροφής τον ξαναχρησιμοποιεί', () => {
    const s = run(unitState(), { t: 'addMove', pid: PID, dir: 'out', why: 'μετάθεση', on: D, back: B });
    expect(leavingBlock(s, '2026-11-22', PID)).not.toBeNull(); expect(leavingBlock(s, B, PID)).toBeNull(); expect(ruleBlock(s, B, PID)).toBeNull();
  });
  it('μόνιμος Λ/Υ που φεύγει τη μέρα: δεν μπαίνει και η συμπλήρωση το λέει', () => {
    let s = run(unitState(), { t: 'addMove', pid: PID, dir: 'out', why: 'μετάθεση', on: D });
    s = { ...s, settings: { ...s.settings, fixed: { ly: PID } } };
    const r = fillDay(s, D);
    expect(used(r, D).has(PID)).toBe(false); expect(r.warn.join(' ')).toMatch(/Φεύγει από τη δύναμη/);
  });
  it('κέντρο με απομένουσα κίνηση: κανένα μπλοκάρισμα', () => {
    const s0 = run(unitState(), { t: 'addMove', pid: PID, dir: 'out', why: 'μετάθεση', on: D });
    const s = { ...s0, settings: { ...s0.settings, mode: undefined } as any };
    expect(leavingBlock(s, D, PID)).toBeNull(); expect(ruleBlock(s, D, PID)).toBeNull();
  });
  it('με το χέρι: χωρίς force απορρίπτεται, με force περνά με προειδοποίηση', () => {
    const s = run(unitState(), { t: 'addMove', pid: PID, dir: 'out', why: 'μετάθεση', on: D });
    const key = postsOf(s.settings)[0].k;
    expect(() => run(s, { t: 'assign', date: D, k: key, pid: PID })).toThrow(/Φεύγει/);
    const r = run(s, { t: 'assign', date: D, k: key, pid: PID, force: 'δοκιμή' });
    expect(r.guards[D][key]).toBe(PID);
  });
});
