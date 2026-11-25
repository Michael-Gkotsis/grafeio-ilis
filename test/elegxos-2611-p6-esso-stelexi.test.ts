// Νέα ΕΣΣΟ: μένουν τα δεδομένα στελεχών και μητρώου (υπόλοιπα αδειών, πρόγραμμα υπηρεσιών, οπλισμός). Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { freshState } from '../src/shared/esso';
import type { AppState, Asset } from '../src/shared/domain';
import { fakeState } from './fixtures';

const TODAY = '2026-12-01';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: TODAY, newId: () => 'q' + ++n }).state;
const asset = (id: string, extra: Partial<Asset>): Asset => ({ id, cat: 'weapon', type: 'Τυφέκιο', no: id, state: 'ok', ...extra });

function rich(): AppState {
  const s = fakeState(5);
  s.cadreGrants = [{ id: 'g1', cid: 'c1', year: 2026, quota: 'x', days: 3, kind: 'extra' }];
  s.cadreNoDuty = [{ cid: 'c1' } as any];
  s.cadreDutyOf = { c1: { group: 'g' } as any };
  s.cadreDuties = [{ id: 'd1', date: '2026-12-05', svc: 'a', cid: 'c1', via: 'K1' }, { id: 'd2', date: '2026-12-06', svc: 'a', cid: 'c1' }];
  s.assets = [
    asset('a1', { holder: { k: 'person', pid: 2 } as any }),
    asset('a2', { holder: { k: 'cadre', cid: 'c1' } as any }),
    asset('a3', { holder: { k: 'person', pid: 3 } as any, driver: { k: 'person', pid: 4 } }),
    asset('a4', { driver: { k: 'cadre', cid: 'c1' } }),
  ];
  s.assetLog = [{ id: 'e1', aid: 'a1', date: '2026-11-01', what: 'note' }];
  return s;
}

describe('freshState: στελέχη και μητρώο', () => {
  it('κρατά υπόλοιπα, πρόγραμμα, οπλισμό και ιστορικό', () => {
    const s = rich(); const n2 = freshState(s, { s: 'Δ', y: 2026 }, TODAY, 'C:\\Νέος');
    expect(n2.cadreGrants).toEqual(s.cadreGrants); expect(n2.cadreNoDuty).toEqual(s.cadreNoDuty); expect(n2.cadreDutyOf).toEqual(s.cadreDutyOf);
    expect(n2.assetLog).toEqual(s.assetLog); expect(n2.assets).toHaveLength(4); expect(n2.people).toEqual([]);
  });
  it('οι κάτοχοι και οδηγοί-άτομα φεύγουν (ΑΧΡΕΩΤΟ), οι άλλοι μένουν', () => {
    const a = freshState(rich(), { s: 'Δ', y: 2026 }, TODAY, 'C:\\Νέος').assets!;
    expect('holder' in a[0]).toBe(false); expect(a[1].holder).toEqual({ k: 'cadre', cid: 'c1' });
    expect('holder' in a[2]).toBe(false); expect('driver' in a[2]).toBe(false); expect(a[3].driver).toEqual({ k: 'cadre', cid: 'c1' });
  });
  it('το πρόγραμμα στελεχών μένει χωρίς via', () => {
    const d = freshState(rich(), { s: 'Δ', y: 2026 }, TODAY, 'C:\\Νέος').cadreDuties!;
    expect(d).toHaveLength(2); expect(d.every(x => !('via' in x))).toBe(true);
  });
  it('δεν προσθέτει πεδία που έλειπαν', () => {
    const n2 = freshState(fakeState(3), { s: 'Δ', y: 2026 }, TODAY, 'C:\\Νέος');
    for (const k of ['cadreGrants', 'cadreNoDuty', 'cadreDutyOf', 'cadreDuties', 'assets', 'assetLog']) expect(k in n2 && (n2 as any)[k] !== undefined).toBe(false);
  });
  it('αλλαγή ρυθμίσεων μετά δεν σβήνει τις υπηρεσίες', () => {
    const f = freshState(rich(), { s: 'Δ', y: 2026 }, TODAY, 'C:\\Νέος');
    const r = run(f, { t: 'setSettings', settings: { rest: 1 } as any, text: 'δοκιμή' } as any);
    expect(r.cadreDuties).toHaveLength(2);
  });
});
