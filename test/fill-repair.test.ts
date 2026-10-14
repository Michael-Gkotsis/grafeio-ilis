// Αυτόματη συμπλήρωση: όταν υπάρχει πλήρης έγκυρη ανάθεση, καμία θέση δεν μένει κενή και κανείς δεν μπαίνει «μόνο αν
// δεν υπάρχει άλλος» ενώ υπάρχει άλλος. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { addDays, type ISODate } from '../src/shared/dates';
import { fillDay, guardUnavailable, lastResort, postsOf } from '../src/shared/rules';
import type { AppState, Guards } from '../src/shared/domain';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-01', newId: () => 'f' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const spen = (s: AppState): AppState => ({ ...s, settings: { ...s.settings, phase: 'spen' } });
// όλες οι θέσεις της ΣΠΕΝ πιασμένες από τους 3…, εκτός από όσες λέμε
function busySpen(n: number, date: ISODate, free: string[]): AppState {
  const s = spen(fakeState(n)); s.people = s.people.map(p => ({ ...p, si: 'Ι1', post: null }));
  const g: Record<string, number> = {}; let pid = 3;
  for (const x of postsOf(s.settings)) if (!free.includes(x.k)) g[x.k] = pid++;
  return { ...s, people: s.people.slice(0, pid - 1), guards: { [date]: g } };
}
const valid = (s: AppState, date: ISODate, g: Record<string, number>) => {
  const work = { ...s, guards: { ...s.guards, [date]: g } };
  for (const [k, pid] of Object.entries(g)) { const others = { ...g }; delete others[k]; expect(guardUnavailable({ ...work, guards: { ...work.guards, [date]: others } }, date, pid, k), k + ' ' + pid).toBeNull(); }
};

describe('αυτόματη συμπλήρωση: επιδιόρθωση μετά την πρώτη σειρά', () => {
  it('(α) ΣΠΕΝ: μόνο σκοπιά και ΤΑΕ ελεύθερες· ο Ι3 ΜΕ ΟΠΛΟ χωρίς ΤΑΕ στη σκοπιά, ο Ι1 στην ΤΑΕ', () => {
    const D = '2026-10-14';
    let s = busySpen(30, D, ['sk3a', 'tae']);
    s = { ...s, people: s.people.map(p => (p.id === 2 ? { ...p, si: 'Ι3 ΜΕ ΟΠΛΟ' } : p)), settings: { ...s.settings, lists: { si: { cells: { 'Ι3 ΜΕ ΟΠΛΟ': { tae: false } } } } } };
    // ο 2ος έχει κάνει υπηρεσία πρόσφατα: ο 1ος είναι πρώτος στη σειρά δικαιοσύνης
    s = { ...s, guards: { ...s.guards, '2026-10-08': { mg1: 2 } } };
    const r = fillDay(s, D);
    expect(r.empty).toEqual([]);
    expect([r.guards[D].sk3a, r.guards[D].tae]).toEqual([2, 1]);
    valid(s, D, r.guards[D]);
  });
  it('(γ) ΕΑ στην ΤΑΕ «μόνο αν δεν υπάρχει άλλος»: ο Ι1 στην ΤΑΕ, ο ΕΑ στον θαλαμοφύλακα', () => {
    const D = '2026-10-14';
    let s = busySpen(30, D, ['th2', 'tae']);
    s = { ...s, settings: { ...s.settings, lists: { stat: { cells: { EA: { tae: 'last' } } } } }, statuses: [{ id: 'e', pid: 2, type: 'EA', from: '2026-10-01', to: '2026-10-31' }] };
    s = { ...s, guards: { ...s.guards, '2026-10-08': { mg1: 2 } } };
    const post = postsOf(s.settings).find(x => x.k === 'tae')!;
    expect(lastResort(s.statuses, D, 2, post, s.settings.lists)).toBeTruthy();
    const r = fillDay(s, D);
    expect([r.guards[D].th2, r.guards[D].tae]).toEqual([2, 1]);
    expect(r.warn).toEqual([]);
    valid(s, D, r.guards[D]);
  });
  it('(β) ΣΒΕΝ, 60 άτομα, ΕΑ όλο τον Οκτώβριο: το Σάββατο 10/10 δεν μένουν κενά μαγειρεία', () => {
    let s = fakeState(60); s.people = s.people.map(p => ({ ...p, si: 'Ι1', post: null }));
    s = run(s, { t: 'declare', cmd: { type: 'EA', pids: [1], from: '2026-10-01', to: '2026-10-31' } });
    for (let d = '2026-10-01' as ISODate; d <= '2026-10-10'; d = addDays(d, 1)) s = { ...s, guards: fillDay(s, d).guards };
    const g = s.guards['2026-10-10'];
    expect(postsOf(s.settings).filter(x => !g[x.k]).map(x => x.k)).toEqual([]);
    valid(s, '2026-10-10', g);
  });
  it('ίδια δεδομένα, ίδια αποτελέσματα', () => {
    let s = fakeState(40); s.people = s.people.map(p => ({ ...p, post: null }));
    s = run(s, { t: 'declare', cmd: { type: 'EA', pids: [3, 7], from: '2026-10-01', to: '2026-10-31' } });
    const days = (st: AppState) => { let x = st; const out: Guards = {}; for (let d = '2026-10-01' as ISODate; d <= '2026-10-14'; d = addDays(d, 1)) { x = { ...x, guards: fillDay(x, d).guards }; out[d] = x.guards[d]; } return out; };
    expect(days(s)).toEqual(days(JSON.parse(JSON.stringify(s))));
  });
});
