// Αυτόματη συμπλήρωση μόνο από κάποιους θαλάμους (Michael, 13/11): για εκείνη τη συμπλήρωση μόνο (μέρας ή ΠΣΚ), δεν αποθηκεύεται.
// Χωρίς θαλάμους η συμπλήρωση μένει ακριβώς ίδια. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { fillDay, personMap } from '../src/shared/rules';
import { fakeState } from './fixtures';
import type { AppState } from '../src/shared/domain';

const D = '2026-10-12';
const ctx = { today: D, newId: (() => { let i = 0; return () => 'n' + ++i; })() };
const run = (s: AppState, c: Command) => apply(s, c, ctx);
const roomsOf = (s: AppState, days: string[]) => { const pm = personMap(s.people); return new Set(days.flatMap(d => Object.values(s.guards[d] || {})).map(id => pm.get(id)!.room)); };

describe('Συμπλήρωση μόνο από θαλάμους', () => {
  it('χωρίς θαλάμους (ή με κενή λίστα) ίδια με πριν', () => {
    const s = fakeState(80);
    const a = fillDay(s, D).guards[D];
    expect(fillDay(s, D, []).guards[D]).toEqual(a);
    expect(fillDay(s, D, null).guards[D]).toEqual(a);
    expect(run(s, { t: 'autofill', date: D, rooms: [] }).state.guards[D]).toEqual(a);
  });
  it('η μέρα: μπαίνουν μόνο όσοι είναι στους θαλάμους που διάλεξες, και το ημερολόγιο το λέει', () => {
    const s = fakeState(120);
    const r = run(s, { t: 'autofill', date: D, rooms: [3, 1, 3] });
    expect([...roomsOf(r.state, [D])].sort()).toEqual([1, 3]);
    expect(Object.keys(r.state.guards[D]).length).toBeGreaterThan(5);
    expect(r.text).toContain('μόνο από τους θαλάμους Θ1, Θ3');
    // η επιλογή δεν μένει πουθενά στην κατάσταση: η επόμενη συμπλήρωση παίρνει από όλους
    expect(JSON.stringify(r.state.settings)).toBe(JSON.stringify(s.settings));
    expect(JSON.stringify(r.state.rules)).toBe(JSON.stringify(s.rules));
    const next = run(r.state, { t: 'autofill', date: '2026-10-13' }).state;
    expect(roomsOf(next, ['2026-10-13']).size).toBeGreaterThan(2);
  });
  it('το ΠΣΚ: και οι τρεις μέρες μόνο από τους θαλάμους, οι κενές μένουν κενές', () => {
    const s = fakeState(80);
    const days = ['2026-10-16', '2026-10-17', '2026-10-18'];
    const r = run(s, { t: 'autofillRange', dates: days, rooms: [2] });
    expect([...roomsOf(r.state, days)]).toEqual([2]);
    expect(r.text).toContain('μόνο από τον θάλαμο Θ2');
    expect(r.text).toContain('έμειναν κενές');
  });
  it('οι μόνιμοι Λ/Υ και Δ/Υ μπαίνουν όπως πάντα, κι ας είναι σε άλλον θάλαμο', () => {
    let s = fakeState(80);
    s = run(s, { t: 'setSettings', settings: { fixed: { ly: 2 } }, text: 'μόνιμος' }).state;   // id 2: θάλαμος 2
    const g = run(s, { t: 'autofill', date: D, rooms: [5] }).state.guards[D];
    expect(g.ly).toBe(2);
    const pm = personMap(s.people);
    expect(Object.entries(g).filter(([k]) => k !== 'ly').every(([, id]) => pm.get(id)!.room === 5)).toBe(true);
  });
});
