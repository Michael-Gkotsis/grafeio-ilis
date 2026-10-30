// Τα ληγμένα σβήνονται από το Excel (Michael, 30/10: «γιατί δεν σβήνονται από το excel τα ιατρικά, άδειες, ποινές»).
// Προεπιλογή «Μόνο όσες ισχύουν»: ό,τι έληξε σβήνεται από το φύλλο, μένει όμως στην εφαρμογή. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { type Status } from '../src/shared/domain';
import { type RawSheet } from '../src/shared/roster';
import { defaultBinding, diffStatuses, identity, parseStatuses, planWrite, type SourceBinding } from '../src/shared/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-30';
const D = (iso: string) => new Date(iso + 'T00:00:00Z');

describe('ληγμένα στο Excel', () => {
  const s0 = fakeState(4); const p = s0.people[1], q = s0.people[2];
  const b: SourceBinding = { file: 'x.xlsx', sheet: 'Μ', header: 0, cols: { last: 0, first: 1, kind: 2, from: 3, to: 4 }, write: true, scope: 'active' };
  const old: Status = { id: 'm1', pid: p.id, type: 'EA', from: '2026-10-20', to: '2026-10-29' };
  const cur: Status = { id: 'm2', pid: q.id, type: 'EY', from: '2026-10-28', to: '2026-10-31' };
  const s = { ...s0, statuses: [old, cur] };
  const sheet: RawSheet = { name: 'Μ', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΑ-ΕΥ', 'ΑΠΟ', 'ΕΩΣ'], [p.last, p.first, 'ΕΑ', D(old.from), D(old.to)], [q.last, q.first, 'ΕΥ', D(cur.from), D(cur.to)]] };
  const synced = [identity(p.id, 'medical', old.from, 'ΕΑ'), identity(q.id, 'medical', cur.from, 'ΕΥ')];
  it('νέο φύλλο: προεπιλογή «Μόνο όσες ισχύουν»', () => {
    expect(defaultBinding('medical', 'x.xlsx').scope).toBe('active');
  });
  it('έληξε χθες: η γραμμή του σβήνεται, αυτό που ισχύει μένει', () => {
    const plan = planWrite('medical', sheet, b, s, synced, TODAY);
    expect(plan.cleared).toBe(1);
    expect(plan.sets.filter(x => x.r === 1).every(x => x.v === null)).toBe(true);
    expect(plan.sets.some(x => x.r === 2)).toBe(false);
    expect(plan.keys).toEqual([synced[1]]);
  });
  it('λήγει σήμερα: μένει ως αύριο', () => {
    const plan = planWrite('medical', sheet, b, { ...s, statuses: [{ ...old, to: TODAY }, cur] }, synced, TODAY);
    expect(plan.cleared).toBe(0);
  });
  it('«Όλες τις εγγραφές»: μένουν και τα ληγμένα, όπως πριν', () => {
    expect(planWrite('medical', sheet, { ...b, scope: 'all' }, s, synced, TODAY).cleared).toBe(0);
  });
  it('μετά το σβήσιμο, η ανάγνωση δεν το δείχνει «λείπει από το Excel» ούτε το σβήνει από την εφαρμογή', () => {
    const after: RawSheet = { name: 'Μ', rows: [sheet.rows[0], [], sheet.rows[2]] };
    const keys = planWrite('medical', sheet, b, s, synced, TODAY).keys;
    const d = diffStatuses('medical', s, parseStatuses('medical', after, b, s.people, TODAY), b, {}, keys, {}, TODAY);
    expect(d.appOnly).toEqual([]); expect(d.removed).toEqual([]);
    // και αν το έσβησες εσύ από το Excel πριν από την εφαρμογή: μένει στην εφαρμογή ως ιστορικό
    const d2 = diffStatuses('medical', s, parseStatuses('medical', after, b, s.people, TODAY), b, {}, synced, {}, TODAY);
    expect(d2.removed).toEqual([]);
  });
});
