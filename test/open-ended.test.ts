// Εγγραφές χωρίς λήξη (X4): κενό «έως» στο Excel δεν γίνεται «σήμερα» γραμμένο πίσω στο Excel. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState, Status } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { baseOf, diffStatuses, identity, parseStatuses, planWrite, type SourceBinding } from '../src/shared/sources';
import { statusesOn } from '../src/shared/rules';
import { addDays } from '../src/shared/dates';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
let seq = 0;
const ctx = (today = TODAY): Ctx => ({ today, newId: () => 'o' + ++seq });
const run = (s: AppState, c: Command, today = TODAY) => apply(s, c, ctx(today)).state;
const D = (iso: string) => new Date(iso + 'T00:00:00Z');
const s0 = fakeState(4); const p = s0.people[2];
const b: SourceBinding = { file: 'x.xlsx', sheet: 'Μ', header: 0, cols: { last: 0, first: 1, kind: 2, from: 3, to: 4, note: 5 }, write: true };
const sheet = (to: Date | null): RawSheet => ({ name: 'Μ', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΑ-ΕΥ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'], [p.last, p.first, 'ΕΑ', D('2026-10-10'), to, '']] });
const diff = (s: AppState, sh: RawSheet, today = TODAY, synced: string[] = [], base: Record<string, string> = {}) =>
  diffStatuses('medical', s, parseStatuses('medical', sh, b, s.people, today), b, {}, synced, base);
const importIt = (s: AppState, sh: RawSheet) => { const d = diff(s, sh); return run(s, { t: 'importRecords', adds: d.add, updates: d.update.map(u => ({ id: u.id, patch: u.patch })), source: 'x', what: 'ιατρικά' }); };

describe('χωρίς λήξη (κενό «έως»)', () => {
  it('διαβάζεται ως «χωρίς λήξη», με ισχύ ως σήμερα', () => {
    expect(diff(s0, sheet(null)).add).toEqual([{ pid: p.id, type: 'EA', from: '2026-10-10', to: TODAY, open: true }]);
  });
  it('χωρίς στήλη «έως» στο φύλλο: μίας μέρας όπως πριν, όχι χωρίς λήξη', () => {
    const b2: SourceBinding = { ...b, cols: { last: 0, first: 1, kind: 2, from: 3 } };
    const d = diffStatuses('medical', s0, parseStatuses('medical', sheet(null), b2, s0.people, TODAY), b2);
    expect(d.add[0].open).toBeUndefined();
  });
  it('η εγγραφή στο Excel δεν γράφει ημερομηνία στο «έως», ούτε σε νέα γραμμή ούτε σε υπάρχουσα', () => {
    const s = importIt(s0, sheet(null));
    const st = s.statuses[0]; expect(st.open).toBe(true);
    const keys = [identity(p.id, 'medical', st.from, 'ΕΑ')];
    expect(planWrite('medical', sheet(null), b, s, keys, TODAY).sets).toEqual([]);
    // νέα γραμμή σε άδειο φύλλο: όλα εκτός από το «έως»
    const empty: RawSheet = { name: 'Μ', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΑ-ΕΥ', 'ΑΠΟ', 'ΕΩΣ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ']] };
    const plan = planWrite('medical', empty, b, s, [], TODAY);
    expect(plan.added).toBe(1); expect(plan.sets.some(x => x.c === b.cols.to)).toBe(false);
    expect(plan.sets.some(x => x.c === b.cols.from)).toBe(true);
  });
  it('κάθε μέρα ισχύει και σήμερα· η επέκταση δεν μετρά ως αλλαγή στην εφαρμογή', () => {
    let s = importIt(s0, sheet(null));
    const keys = [identity(p.id, 'medical', '2026-10-10', 'ΕΑ')]; const base = baseOf('medical', s, keys);
    const next = addDays(TODAY, 3);
    s = run(s, { t: 'extendOpen' }, next);
    expect(s.statuses[0].to).toBe(next); expect(statusesOn(s.statuses, p.id, next)).toHaveLength(1);
    const d = diff(s, sheet(null), next, keys, base);
    expect(d.update).toEqual([]); expect(d.same).toBe(1); expect(d.kept).toEqual([]);
    expect(apply(s, { t: 'expire' }, ctx(addDays(next, 1))).extra).toEqual([]);   // δεν «έληξε»
  });
  it('όταν γραφτεί «έως» στο Excel, κλείνει', () => {
    const s = importIt(s0, sheet(null));
    const d = diff(s, sheet(D('2026-10-15')));
    expect(d.update).toMatchObject([{ patch: { to: '2026-10-15', open: false } }]);
  });
  it('σβήστηκε το «έως» στο Excel εγγραφής με λήξη: γίνεται χωρίς λήξη, δεν ξαναγράφεται η ημερομηνία', () => {
    const st: Status = { id: 'c1', pid: p.id, type: 'EA', from: '2026-10-10', to: '2026-10-14' };
    const d = diff({ ...s0, statuses: [st] }, sheet(null));
    expect(d.update).toMatchObject([{ id: 'c1', patch: { open: true } }]);
  });
  it('«Σταμάτησε νωρίτερα» κλείνει και τη «χωρίς λήξη»', () => {
    const s = importIt(s0, sheet(null));
    const after = run(s, { t: 'endStatus', id: s.statuses[0].id });
    expect(after.statuses[0].open).toBeUndefined(); expect(after.statuses[0].to).toBe(addDays(TODAY, -1));
  });
});
