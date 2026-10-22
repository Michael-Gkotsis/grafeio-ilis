// Υπηρεσίες › «Ποιος κάνει τι» (Michael, 18/10): στήλες από τις υπηρεσίες, κελιά από τα ίδια δεδομένα με το capBlock
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { capBlock, capCell, capCols, capsPerService, fillDay, postsOf } from '../src/shared/rules';
import type { AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'id' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const D = '2026-10-13';
const col = (s: AppState, key: string) => capCols(s.settings).find(c => c.key === key)!;
const withGate = () => {
  const s = run(fakeState(30), { t: 'addBlock', phase: 'sven', name: 'Πύλη', kind: 'other', armed: false, n: 1, hrs: '' });
  const b = s.settings.blocks.find(x => x.custom)!;
  return { s, b, post: postsOf(s.settings).find(x => x.block === b.id)! };
};

describe('στήλες', () => {
  it('τα είδη και των δύο εντύπων, όχι Λ/Υ· κάθε νέα υπηρεσία δική της στήλη', () => {
    expect(capCols(fakeState(3).settings).map(c => c.key)).toEqual(['th', 'op', 'mg', 'sk', 'tae']);
    const { s, b } = withGate();
    const cs = capCols(s.settings);
    expect(cs.map(c => c.key)).toEqual(['th', 'op', 'mg', 'sk', 'tae', 'b:' + b.id]);
    expect(cs[5]).toMatchObject({ label: 'Πύλη', phases: ['sven'] });
    expect(col(s, 'sk')).toMatchObject({ armed: true, phases: ['spen'] });
    const hid = run(s, { t: 'setBlock', phase: 'sven', id: b.id, patch: { hidden: true } });
    expect(capCols(hid.settings).map(c => c.key)).not.toContain('b:' + b.id);
  });
});

describe('κελιά', () => {
  it('Σ.Ι. και πόστο: «—», με ρητό «κάνει» περνά (✓!) και καθαρίζει πίσω', () => {
    let s = fakeState(12);
    const p10 = s.people[9], p6 = s.people[5];   // ο 10ος Ι3 ΑΟΠΛΟ, ο 6ος με πόστο
    expect(capCell(s, p10, col(s, 'sk'))).toMatchObject({ on: false, src: 'auto' });
    expect(capCell(s, p10, col(s, 'mg'))).toMatchObject({ on: true });
    expect(capCell(s, p6, col(s, 'mg'))).toEqual({ on: false, src: 'auto', why: 'Πόστο: ΚΨΜ' });
    s = run(s, { t: 'setCap', pid: 10, key: 'sk', v: 'on' });
    expect(capCell(s, p10, col(s, 'sk'))).toMatchObject({ on: true, src: 'force' });
    const sk = postsOf({ ...s.settings, phase: 'spen' }).find(x => x.kind === 'sk')!;
    expect(capBlock(s, D, 10, sk)).toBeNull();
    s = run(s, { t: 'setCap', pid: 10, key: 'sk', v: 'clear' });
    expect(s.caps[10]).toBeUndefined();
    expect(capCell(s, p10, col(s, 'sk')).src).toBe('auto');
  });
  it('«δεν κάνει» του λοχία και πίσω', () => {
    let s = fakeState(5);
    const r = apply(s, { t: 'setCap', pid: 2, key: 'mg', v: 'off' }, ctx);
    expect(r.text).toContain('δεν κάνει μαγειρεία');
    s = r.state;
    expect(capCell(s, s.people[1], col(s, 'mg'))).toEqual({ on: false, src: 'man', why: 'Από τον λοχία' });
    const mg = postsOf(s.settings).find(x => x.kind === 'mg')!;
    expect(capBlock(s, D, 2, mg)).toContain('Δεν κάνει μαγειρεία');
    s = run(s, { t: 'setCap', pid: 2, key: 'mg', v: 'clear' });
    expect(capBlock(s, D, 2, mg)).toBeNull();
    expect(s.caps[2]).toBeUndefined();
  });
});

describe('δική σου υπηρεσία', () => {
  it('ρυθμίζεται μόνη της, χωρίς να αλλάζει τις άλλες του ίδιου είδους', () => {
    let { s, b, post } = withGate();
    s = run(s, { t: 'setCap', pid: 3, key: ('b:' + b.id) as any, v: 'off' });
    expect(capBlock(s, D, 3, post)).toBe('Δεν κάνει Πύλη (Από τον λοχία)');
    expect(s.caps[3]).toEqual({ ['b:' + b.id]: 'Από τον λοχία' });
    const g = fillDay(s, D).guards[D];
    expect(g[post.k]).toBeDefined();
    expect(g[post.k]).not.toBe(3);
  });
  it('δεν ακολουθεί το είδος της: «Πύλη» με είδος μαγειρεία είναι σκέτο «Πύλη» (Michael, 22/10)', () => {
    let s = run(fakeState(30), { t: 'addBlock', phase: 'sven', name: 'Πύλη', kind: 'mg', armed: false, n: 1, hrs: '' });
    const b = s.settings.blocks.find(x => x.custom)!; const post = postsOf(s.settings).find(x => x.block === b.id)!;
    const mg = postsOf(s.settings).find(x => x.block === 'mg')!;
    s = run(s, { t: 'setCap', pid: 4, key: 'mg', v: 'off' });
    expect(capBlock(s, D, 4, mg)).toContain('Δεν κάνει μαγειρεία');
    expect(capCell(s, s.people[3], col(s, 'b:' + b.id))).toEqual({ on: true, src: 'auto', why: '' });
    expect(capBlock(s, D, 4, post)).toBeNull();
    s = run(s, { t: 'setCap', pid: 5, key: ('b:' + b.id) as any, v: 'off' });
    expect(capBlock(s, D, 5, post)).toBe('Δεν κάνει Πύλη (Από τον λοχία)');
    expect(capBlock(s, D, 5, mg)).toBeNull();
    // και τα μηνύματα Σ.Ι./πόστου λένε το όνομά της, όχι «μαγειρεία»
    expect(capBlock(s, D, 6, post)).toBe('Δεν κάνει Πύλη (Πόστο: ΚΨΜ)');
  });
  it('το «Άλλες» του Excel δεν ισχύει πια σε δική σου υπηρεσία: έχει δική της στήλη', () => {
    let { s, b, post } = withGate();
    s = run(s, { t: 'importCaps', changes: [{ pid: 4, kind: 'other', reason: 'Από Excel' }], source: 'x' });
    expect(capCell(s, s.people[3], col(s, 'b:' + b.id)).on).toBe(true);
    expect(capBlock(s, D, 4, post)).toBeNull();
  });
});

describe('μία φορά, στην αναβάθμιση (capsPerService)', () => {
  it('ό,τι ίσχυε μέσω του είδους γράφεται στη στήλη της υπηρεσίας· ό,τι όρισες χωριστά μένει', () => {
    let s = run(fakeState(30), { t: 'addBlock', phase: 'sven', name: 'Πύλη', kind: 'mg', armed: false, n: 1, hrs: '' });
    s = run(s, { t: 'addBlock', phase: 'sven', name: 'Σκοπιά ΤΑΕ', kind: 'sk', armed: true, n: 1, hrs: '' });
    const [gate, sk] = s.settings.blocks.filter(x => x.custom);
    const caps: AppState['caps'] = { 2: { mg: 'ΠΟΝΟΣ' }, 3: { mg: 'ΑΛΛΕΡΓΙΑ', ['b:' + gate.id]: null } as never, 4: { th: 'Χ' } };
    const out = capsPerService(s.settings, caps)!;
    expect(out[2]).toEqual({ mg: 'ΠΟΝΟΣ', ['b:' + gate.id]: 'ΠΟΝΟΣ' });
    expect(out[3]).toEqual({ mg: 'ΑΛΛΕΡΓΙΑ', ['b:' + gate.id]: null });
    expect(out[4]).toBe(caps[4]);
    expect(Object.keys(out[2])).not.toContain('b:' + sk.id);
    expect(capsPerService(s.settings, out)).toBeNull();   // δεύτερη φορά: τίποτα
    expect(capsPerService(fakeState(3).settings, caps)).toBeNull();   // χωρίς δικές σου υπηρεσίες
    // μετά: ίδιο αποτέλεσμα με πριν για την Πύλη
    const post = postsOf(s.settings).find(x => x.block === gate.id)!;
    expect(capBlock({ ...s, caps: out }, D, 2, post)).toBe('Δεν κάνει Πύλη (ΠΟΝΟΣ)');
  });
});
