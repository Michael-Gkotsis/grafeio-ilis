// «Ενεργή» σε κάθε υπηρεσία (Michael, 20/10): ανενεργή = δεν μπαίνει στις θέσεις, στην αυτόματη συμπλήρωση και στη
// ΦΡΟΥΡΑ, αλλά δεν σβήνεται και οι υπηρεσίες που έγιναν μένουν στον έλεγχο υπηρεσιών. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Ctx } from '../src/shared/commands';
import { fillFroura } from '../src/main/exports';
import { dutyCheck } from '../src/main/excel';
import { Workbook } from '../src/main/xlsx';
import { readBook } from '../src/main/sources';
import { frouraLayout } from '../src/shared/froura';
import { dutyStats, postsOf } from '../src/shared/rules';
import { dutyCols } from '../src/shared/sources';
import type { AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-12';
let seq = 0; const ctx: Ctx = { today: D, newId: () => 'a' + ++seq };
const run = (s: AppState, c: Parameters<typeof apply>[1]) => apply(s, c, ctx).state;
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));

function withGate(): { s: AppState; gate: string; k: string } {
  const s = run(fakeState(30), { t: 'addBlock', phase: 'sven', name: 'Πύλη', kind: 'other', armed: false, n: 1, hrs: '24ωρη' });
  const b = s.settings.blocks.find(x => x.name === 'Πύλη')!;
  return { s, gate: b.id, k: b.posts[0].k };
}

describe('ενεργή / ανενεργή υπηρεσία', () => {
  it('ανενεργή: εκτός θέσεων, αυτόματης συμπλήρωσης και ΦΡΟΥΡΑ· ξαναενεργή όπως πριν', async () => {
    const { s: s0, gate, k } = withGate();
    expect(postsOf(s0.settings).some(x => x.k === k)).toBe(true);
    const off = run(s0, { t: 'setBlock', phase: 'sven', id: gate, patch: { hidden: true } });
    expect(off.settings.blocks.find(b => b.id === gate)).toBeTruthy();   // δεν σβήνεται
    expect(postsOf(off.settings).some(x => x.k === k)).toBe(false);
    const filled = run(off, { t: 'autofill', date: D });
    expect(filled.guards[D][k]).toBeUndefined();
    expect(frouraLayout(filled, D).extra.some(x => x.k === k)).toBe(false);
    const cellsOf = async (x: AppState) => { const ws = await (await Workbook.open((await fillFroura(T('froura.xlsx'), x, D)).data)).sheet(0); return JSON.stringify(Array.from({ length: 80 }, (_, r) => 'ABCDEFGHIJKLMNOP'.split('').map(c => ws.get(c + (r + 1))))); };
    expect(await cellsOf(run(s0, { t: 'autofill', date: D }))).toContain('ΠΥΛΗ');
    expect(await cellsOf(filled)).not.toContain('ΠΥΛΗ');
    const on = run(filled, { t: 'setBlock', phase: 'sven', id: gate, patch: { hidden: false } });
    expect(postsOf(on.settings).some(x => x.k === k)).toBe(true);
    expect(run(on, { t: 'autofill', date: D }).guards[D][k]).toBeTruthy();
  });

  it('οι υπηρεσίες που έγιναν μένουν: σύνολα, έλεγχος υπηρεσιών (εξαγωγή και νέος μήνας)', async () => {
    const { s: s0, gate, k } = withGate();
    s0.guards = { '2026-10-05': { [k]: 1 }, '2026-10-07': { [k]: 1 } };
    const s = run(s0, { t: 'setBlock', phase: 'sven', id: gate, patch: { hidden: true } });
    expect(dutyStats(s).get(1)!.total).toBe(2);
    expect(dutyCols(s.settings).head).toContain('ΠΥΛΗ');
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ilis-active-')), 'x.xlsx');
    fs.writeFileSync(f, (await dutyCheck(s, '2026-10')).data);
    const rows = (await readBook(f)).sheets[0].rows;
    const c = rows[2].indexOf('ΠΥΛΗ'); expect(c).toBeGreaterThan(0);
    expect(rows.find(x => x[2] === s.people[0].last)![c]).toBe(2);
  });

  it('όταν γίνεται ανενεργή, βγαίνουν μόνο όσες είχαν μπει από αύριο και μετά', async () => {
    const { s: s0, gate, k } = withGate();
    s0.guards = { '2026-10-11': { [k]: 1 }, [D]: { [k]: 2, th1: 3 }, '2026-10-13': { [k]: 4, th1: 5 }, '2026-10-14': { [k]: 6 } };
    const r = apply(s0, { t: 'setBlock', phase: 'sven', id: gate, patch: { hidden: true } }, ctx);
    expect(r.state.guards).toEqual({ '2026-10-11': { [k]: 1 }, [D]: { [k]: 2, th1: 3 }, '2026-10-13': { th1: 5 } });
    expect(r.text).toContain('βγήκαν 2 υπηρεσίες');
    // στο έντυπο που δεν ισχύει τώρα: τίποτα δεν βγαίνει (ίδια κλειδιά θέσεων με το άλλο έντυπο)
    const r2 = apply(s0, { t: 'setBlock', phase: 'spen', id: 'mg', patch: { hidden: true } }, ctx);
    expect(r2.state.guards).toBe(s0.guards);
    // η σημερινή που έμεινε δεν γράφεται στη ΦΡΟΥΡΑ, με προειδοποίηση ότι είναι ανενεργή
    expect((await fillFroura(T('froura.xlsx'), r.state, D)).warnings.join(' ')).toMatch(/Πύλη είναι ανενεργή/);
  });

  it('Λ/Υ και Δ/Υ μένουν πάντα ενεργοί· νέα υπηρεσία μπορεί να ξεκινά ανενεργή', () => {
    expect(() => run(fakeState(5), { t: 'setBlock', phase: 'sven', id: 'ly', patch: { hidden: true } })).toThrow(/ενεργοί/);
    const s = run(fakeState(5), { t: 'addBlock', phase: 'sven', name: 'Πύλη', kind: 'other', armed: false, n: 1, hrs: '', off: true });
    const b = s.settings.blocks.find(x => x.name === 'Πύλη')!;
    expect(b.hidden).toBe(true);
    expect(postsOf(s.settings).some(x => x.block === b.id)).toBe(false);
  });
});
