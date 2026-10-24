// Εφάπαξ εξαίρεση από υπηρεσίες από–έως (Michael, 24/10)
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fillDay, guardUnavailable, nextFor, offDayBlock, fairOf, postsOf } from '../src/shared/rules';
import { frouraChecks } from '../src/shared/preflight';
import { fakeState } from './fixtures';
import type { AppState } from '../src/shared/domain';
import { weekendFrom } from '../src/shared/dates';

let seq = 0;
const ctx: Ctx = { today: '2026-10-24', newId: () => 'k' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const THU = '2026-10-22', FRI = '2026-10-23', SAT = '2026-10-24', SUN = '2026-10-25', MON = '2026-10-26';
const skip = (s: AppState, pid: number, from: string, to: string, why?: string) => run(s, { t: 'setSkip', pid, from, to, why });
// όλοι εκτός από τον exclude έχουν μία υπηρεσία νωρίτερα: ο exclude είναι πρώτος στη σειρά δικαιοσύνης
function history(n: number, exclude: number): AppState {
  const s = fakeState(n); const ks = postsOf(s.settings).map(p => p.k);
  const ids = s.people.filter(p => p.id !== exclude && !p.post).map(p => p.id);
  const guards: AppState['guards'] = {};
  ids.forEach((pid, i) => { const d = '2026-10-' + String(1 + Math.floor(i / ks.length)).padStart(2, '0'); (guards[d] = guards[d] || {})[ks[i % ks.length]] = pid; });
  return { ...s, guards };
}

describe('εξαίρεση από υπηρεσίες', () => {
  it('αποθηκεύεται με σειρά ημερομηνίας, αλλάζει με το id, σβήνεται και φεύγει από το άτομο όταν αδειάσει', () => {
    let s = skip(fakeState(5), 2, '2026-11-07', '2026-11-08', '  γάμος  ');
    s = skip(s, 2, '2026-10-30', '2026-10-30');
    expect(s.people[1].skips).toEqual([expect.objectContaining({ from: '2026-10-30', to: '2026-10-30' }), expect.objectContaining({ from: '2026-11-07', to: '2026-11-08', why: 'γάμος' })]);
    const id = s.people[1].skips![0].id;
    const r = apply(s, { t: 'setSkip', pid: 2, id, from: '2026-10-30', to: '2026-10-31', why: 'ΣΚ' }, ctx);
    expect(r.state.people[1].skips!.find(k => k.id === id)).toMatchObject({ to: '2026-10-31', why: 'ΣΚ' });
    expect(r.state.people[1].skips).toHaveLength(2);
    expect(r.text).toContain('Άλλαξε η εξαίρεση');
    let t = run(r.state, { t: 'delSkip', pid: 2, id });
    t = run(t, { t: 'delSkip', pid: 2, id: t.people[1].skips![0].id });
    expect('skips' in t.people[1]).toBe(false);
  });
  it('δεν δέχεται «έως» πριν το «από» ή άγνωστο άτομο/εξαίρεση', () => {
    expect(() => skip(fakeState(5), 2, SUN, SAT)).toThrow('πριν από το «από»');
    expect(() => skip(fakeState(5), 99, SAT, SUN)).toThrow();
    expect(() => run(fakeState(5), { t: 'delSkip', pid: 2, id: 'x' })).toThrow();
    expect(() => run(fakeState(5), { t: 'setSkip', pid: 2, id: 'x', from: SAT, to: SAT })).toThrow();
  });
  it('μετρούν και οι δύο ακραίες μέρες· έξω από αυτές κανονικά', () => {
    const s = skip(fakeState(40), 3, SAT, SUN, 'γάμος αδελφού');
    expect(offDayBlock(s, FRI, 3)).toBeNull();
    expect(offDayBlock(s, SAT, 3)).toBe('Εξαίρεση 24/10-25/10: γάμος αδελφού');
    expect(offDayBlock(s, SUN, 3)).toBe('Εξαίρεση 24/10-25/10: γάμος αδελφού');
    expect(offDayBlock(s, MON, 3)).toBeNull();
    expect(offDayBlock(skip(fakeState(40), 3, SAT, SAT), SAT, 3)).toBe('Εξαίρεση 24/10');
    expect(guardUnavailable(s, SAT, 3, 'th1')).toContain('Εξαίρεση 24/10-25/10');
    expect(guardUnavailable(s, MON, 3, 'th1')).toBeNull();
  });
  it('η αυτόματη συμπλήρωση και ο «Επόμενος» τον προσπερνούν μέσα στην εξαίρεση', () => {
    const s = skip(fakeState(16), 3, SAT, SUN);
    for (const d of [SAT, SUN]) expect(Object.values(fillDay(s, d).guards[d])).not.toContain(3);
    expect(Object.values(fillDay(s, FRI).guards[FRI])).toContain(3);
    const seen: number[] = [];
    for (let id = nextFor(s, SAT, 'th1', seen); id != null; id = nextFor(s, SAT, 'th1', seen)) seen.push(id);
    expect(seen).not.toContain(3);
  });
  it('με το χέρι μπαίνει μόνο με αιτία, και φαίνεται ως προειδοποίηση στο έντυπο', () => {
    const s = skip(fakeState(40), 3, SAT, SUN, 'γάμος');
    expect(() => apply(s, { t: 'assign', date: SUN, k: 'th1', pid: 3 }, ctx)).toThrow('Εξαίρεση 24/10-25/10: γάμος');
    const r = apply(s, { t: 'assign', date: SUN, k: 'th1', pid: 3, force: 'εντολή' }, ctx);
    expect(r.state.guards[SUN].th1).toBe(3);
    expect(frouraChecks(r.state, SUN).find(x => x.text.includes('Εξαίρεση'))?.level).toBe('warn');
    expect(apply(s, { t: 'assign', date: MON, k: 'th1', pid: 3 }, ctx).state.guards[MON].th1).toBe(3);
  });
  it('μετά την εξαίρεση βγαίνει πρώτος, και η σειρά δικαιοσύνης δεν αλλάζει', () => {
    const base = history(60, 3);
    const s = skip(base, 3, SAT, SUN);
    expect(Object.values(fillDay(s, SAT).guards[SAT])).not.toContain(3);
    expect(Object.values(fillDay(s, MON).guards[MON])).toContain(3);
    expect(fairOf(s, 3, MON)).toEqual(fairOf(base, 3, MON));
  });
  it('όποιος λείπει όλο το ΣΚ δεν «χρωστά» το ΣΚ: δεν κρατιέται στην άκρη την Πέμπτη', () => {
    let base = history(60, 3); base = { ...base, rules: { ...base.rules, restDays: 2 } };
    const g = (s: AppState) => Object.values(fillDay(s, THU).guards[THU]);
    // χωρίς εξαίρεση ο πρώτος της σειράς χρωστά το ΣΚ και μένει στην άκρη, με εξαίρεση πηγαίνει κανονικά τη μέρα που μπορεί
    expect(g(base)).not.toContain(3);
    expect(g(skip(base, 3, SAT, SUN))).toContain(3);
  });
  it('οι παλιές εξαιρέσεις δεν επηρεάζουν, και η εισαγωγή Δυναμολογίου δεν τις σβήνει', () => {
    const s = skip(fakeState(5), 2, '2026-09-01', '2026-09-02');
    expect(offDayBlock(s, SAT, 2)).toBeNull();
    const rows = s.people.map(({ id, active, skips, ...p }) => ({ ...p, phone: '6999999999' }));
    const r = apply(s, { t: 'importPeople', rows, source: 'test.xlsx', deactivateMissing: true }, ctx);
    expect(r.state.people[1].skips).toHaveLength(1);
  });
  it('«Αυτό το ΣΚ» / «Επόμενο ΣΚ» από οποιαδήποτε μέρα', () => {
    expect(weekendFrom('2026-10-21', false)).toEqual([SAT, SUN]);   // Τετάρτη
    expect(weekendFrom(SAT, false)).toEqual([SAT, SUN]);
    expect(weekendFrom(SUN, false)).toEqual([SUN, SUN]);              // Κυριακή: μόνο η σημερινή
    expect(weekendFrom('2026-10-21', true)).toEqual(['2026-10-31', '2026-11-01']);
    expect(weekendFrom(SUN, true)).toEqual(['2026-10-31', '2026-11-01']);
  });
});
