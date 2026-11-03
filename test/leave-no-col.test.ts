// Είδος άδειας «Πουθενά στην ΗΚΑΙ» (col '-'): από 3/11 ο άνθρωπος μένει ΠΑΡΩΝ παντού (Σήμερα, Δύναμη, ΗΚΑΙ χωρίς στήλη), χωρίς υπηρεσίες και έξοδο
// αν δεν το ζητήσεις. Χωρίς τη ρύθμιση όλα όπως πριν. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { LEAVE_COLS, LEAVE_NO_COL, leaveCol, type UserLists } from '../src/shared/ranks';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { dutyBlock, hkaiCounts, outBlock, strengthOf } from '../src/shared/rules';
import { hkaiLeaveLines } from '../src/shared/hkaiText';
import { hkToggle, type AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-12';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'n' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const lists = (col?: string): UserLists => ({ leaveKinds: { add: [{ name: 'Αιμοδοσίας', ...(col ? { col } : {}) }] } });
// άδεια του 3ου ατόμου με είδος «Αιμοδοσίας» και τη στήλη col· χωρίς kind: καμία άδεια
const mk = (col?: string, withLeave = true): AppState => {
  let s = fakeState(10); s = { ...s, settings: { ...s.settings, lists: lists(col), hkai: hkToggle(s.settings.hkai || {}, 'lv', true) } };
  if (!withLeave) return s;
  return run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [3], from: D, to: '2026-10-18', kind: 'Αιμοδοσίας' } });
};
const inAny = (s: AppState, pid: number) => Object.values(hkaiCounts(s, D).cols).some(l => l.some(p => p.id === pid));

describe('άδεια με «Πουθενά στην ΗΚΑΙ»', () => {
  it('η επιλογή υπάρχει στη λίστα στηλών και το leaveCol τη δέχεται', () => {
    const keys = LEAVE_COLS.map(c => c[0]);
    expect(keys.slice(0, 2)).toEqual(['ka', 'an']); expect(keys[keys.length - 1]).toBe(LEAVE_NO_COL);
    for (const k of ['eid', 'fp', 'allh', 'yp', 'ey', 'kin']) expect(keys).toContain(k);
    expect(keys).not.toContain('bl');
    expect(LEAVE_NO_COL).toBe('-');
    expect(leaveCol('Αιμοδοσίας', lists('-'))).toBe('-');
    expect(leaveCol('Κανονική', lists('-'))).toBe('ka'); expect(leaveCol('Ειδική', lists('-'))).toBe('eid');
  });
  it('col «-»: σε καμία στήλη, παρών παντού, αλλά χωρίς υπηρεσίες και έξοδο και με γραμμή στο 3. ΑΔΕΙΕΣ', () => {
    const s = mk('-'), none = mk('-', false);
    const h = hkaiCounts(s, D), h0 = hkaiCounts(none, D);
    expect(inAny(s, 3)).toBe(false);
    expect(h.apo).toBe(h0.apo); expect(h.kol).toBe(h0.kol); expect(h.avail).toBe(h0.avail);
    for (const k of Object.keys(h0.cols)) expect(h.cols[k].map(p => p.id)).toEqual(h0.cols[k].map(p => p.id));
    // παρών (ούτε στο Σήμερα απών), αλλά δεν μπαίνει σε υπηρεσία και δεν βγαίνει έξοδο
    expect(strengthOf(s, D).absent).toBe(strengthOf(none, D).absent);
    expect(strengthOf(s, D).lists.present.some(p => p.id === 3)).toBe(true);
    expect(dutyBlock(s.statuses, D, 3, { armed: false }, s.settings.lists)).toBeTruthy();
    expect(outBlock(s, D, 3)).toBeTruthy();
    expect(hkaiLeaveLines(s, D).map(l => l.map(x => x.t).join(''))).toEqual([expect.stringContaining('ΑΙΜΟΔΟΣΙΑΣ')]);
  });
  it('col «-»: ο ΕΥ από κάτω μετρά κανονικά στη στήλη του (ο άνθρωπος είναι παρών)', () => {
    let s = mk('-');
    s = run(s, { t: 'declare', cmd: { type: 'EY', pids: [3], from: D, to: D } });
    expect(s.statuses.some(x => x.type === 'EY')).toBe(true);
    expect(hkaiCounts(s, D).cols.ey.map(p => p.id)).toEqual([3]);
  });
  it('col «eid»: στις Ειδικές· χωρίς col ή με άκυρο: όπως πριν, στις Κανονικές', () => {
    const e = hkaiCounts(mk('eid'), D), a0 = hkaiCounts(mk('eid', false), D);
    expect(e.cols.eid.map(p => p.id)).toEqual([3]); expect(e.cols.ka).toEqual([]); expect(e.apo).toBe(a0.apo + 1);
    for (const col of [undefined, 'bl', 'xx']) {
      const h = hkaiCounts(mk(col), D);
      expect(h.cols.ka.map(p => p.id)).toEqual([3]); expect(h.cols.eid).toEqual([]); expect(h.apo).toBe(a0.apo + 1);
      expect(leaveCol('Αιμοδοσίας', lists(col))).toBe('ka');
    }
  });
});
