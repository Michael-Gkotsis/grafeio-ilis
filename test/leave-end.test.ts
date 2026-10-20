// Ακύρωση και διακοπή άδειας (Michael, 18/10: «να μπορείς να ακυρώσεις / τερματίσεις άδεια καποιου»). Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState, PersonRequest, Status } from '../src/shared/domain';
import { hkaiLeaveLines } from '../src/shared/hkaiText';
import { awayNow, outBlock, statusesNow, strengthOf } from '../src/shared/rules';
import { ROSTER_FILTERS, rosterMatch, rosterSheets } from '../src/shared/rosterLists';
import type { RawSheet } from '../src/shared/roster';
import { identity, planWrite, type SourceBinding } from '../src/shared/sources';
import { fakeState } from './fixtures';

const TODAY = '2026-10-14';
let seq = 0;
const ctx = (today = TODAY): Ctx => ({ today, newId: () => 'e' + ++seq });
const run = (s: AppState, c: Command) => apply(s, c, ctx());
const leave = (x: Partial<Status> = {}): Status => ({ id: 'l1', pid: 1, type: 'LEAVE', from: '2026-10-12', to: '2026-10-18', kind: 'Κανονική', ...x });
const with1 = (st: Status, extra: Partial<AppState> = {}): AppState => ({ ...fakeState(10), statuses: [st], ...extra });

describe('ακύρωση άδειας', () => {
  it('η άδεια φεύγει ολόκληρη και μετρά παρών', () => {
    const s = with1(leave({ from: '2026-10-16', to: '2026-10-20' }));
    expect(outBlock(s, '2026-10-16', 1)).toMatch(/^ΚΑ/);
    const r = run(s, { t: 'cancelLeave', id: 'l1' });
    expect(r.state.statuses).toEqual([]);
    expect(r.text).toMatch(/^Ακυρώθηκε η κανονική άδεια 16\/10–20\/10 του /);
    expect(outBlock(r.state, '2026-10-16', 1)).toBeNull();
    expect(strengthOf(r.state, '2026-10-16').present).toBe(10);
  });
  it('από εγκεκριμένη αίτηση: η αίτηση μένει εγκεκριμένη, χωρίς άδεια, και βγαίνει από την ΗΚΑΙ', () => {
    const req: PersonRequest = { id: 'r1', pid: 1, date: TODAY, text: '', leave: { type: 'LEAVE', from: '2026-10-16', to: '2026-10-20' }, decision: 'ok', decided: TODAY, sid: 'l1' };
    const s = with1(leave({ from: '2026-10-16', to: '2026-10-20', req: 'r1' }), { requests: [req] });
    expect(hkaiLeaveLines(s, TODAY)).toHaveLength(1);
    const r = run(s, { t: 'cancelLeave', id: 'l1' }).state;
    expect(r.requests[0].decision).toBe('ok');
    expect(r.requests[0].sid).toBeUndefined();
    expect(hkaiLeaveLines(r, TODAY)).toHaveLength(0);
  });
  it('μόνο άδειες', () => {
    expect(() => run(with1(leave({ type: 'EY', kind: undefined })), { t: 'cancelLeave', id: 'l1' })).toThrow('Δεν βρέθηκε η άδεια');
  });
});

describe('διακοπή άδειας', () => {
  it('γύρισε σήμερα 22:00: σήμερα λείπει ακόμα, από αύριο παρών παντού', () => {
    const r = run(with1(leave()), { t: 'endLeave', id: 'l1', date: TODAY, time: '22:00' });
    expect(r.state.statuses[0]).toMatchObject({ from: '2026-10-12', to: TODAY, toTime: '22:00' });
    expect(r.text).toMatch(/^Διακοπή: κανονική άδεια του .+, επιστροφή 14\/10 22:00 \(ήταν έως 18\/10\)$/);
    expect(strengthOf(r.state, TODAY).present).toBe(9);
    expect(outBlock(r.state, TODAY, 1)).toMatch(/^ΚΑ/);
    expect(strengthOf(r.state, '2026-10-15').present).toBe(10);
    expect(outBlock(r.state, '2026-10-15', 1)).toBeNull();
  });
  it('γύρισε 07:00: παρών στην ΗΚΑΙ και έξοδος την ίδια μέρα', () => {
    const s = run(with1(leave()), { t: 'endLeave', id: 'l1', date: TODAY, time: '07:00' }).state;
    expect(strengthOf(s, TODAY).present).toBe(10);
    expect(outBlock(s, TODAY, 1)).toBeNull();
  });
  it('χωρίς λήξη: κλείνει, και χωρίς ώρα μετρά όλη η μέρα', () => {
    const s = run(with1(leave({ open: true, to: TODAY })), { t: 'endLeave', id: 'l1', date: TODAY, time: '' }).state;
    expect(s.statuses[0].open).toBeUndefined();
    expect(s.statuses[0].toTime).toBeUndefined();
    expect(s.statuses[0].to).toBe(TODAY);
  });
  it('η τιμητική κρατά την ώρα αναχώρησης· νωρίτερα από την αναχώρηση δεν γίνεται', () => {
    const s = with1(leave({ type: 'HON', kind: undefined, from: TODAY, fromTime: '14:00' }));
    expect(() => run(s, { t: 'endLeave', id: 'l1', date: TODAY, time: '13:00' })).toThrow('Ακύρωση άδειας');
    expect(run(s, { t: 'endLeave', id: 'l1', date: TODAY, time: '20:00' }).state.statuses[0]).toMatchObject({ fromTime: '14:00', toTime: '20:00', to: TODAY });
  });
  it('όχι πριν από την έναρξη, όχι μετά τη λήξη, όχι ίδια επιστροφή', () => {
    const s = with1(leave({ toTime: '18:00' }));
    expect(() => run(s, { t: 'endLeave', id: 'l1', date: '2026-10-11', time: '' })).toThrow('ξεκινά 12/10');
    expect(() => run(s, { t: 'endLeave', id: 'l1', date: '2026-10-19', time: '' })).toThrow('έως 18/10 18:00');
    expect(() => run(s, { t: 'endLeave', id: 'l1', date: '2026-10-18', time: '20:00' })).toThrow('νωρίτερη');
    expect(run(s, { t: 'endLeave', id: 'l1', date: '2026-10-18', time: '10:00' }).state.statuses[0].toTime).toBe('10:00');
    expect(() => run(s, { t: 'endLeave', id: 'l1', date: TODAY, time: 'πρωί' })).toThrow('δεν διαβάζεται');
  });
});

describe('Excel «Άδειες»', () => {
  const s0 = fakeState(4); const p = s0.people[2];
  const b: SourceBinding = { file: 'x.xlsx', sheet: 'Α', header: 0, cols: { last: 0, first: 1, kind: 2, from: 3, tout: 4, to: 5, tin: 6 }, write: true };
  const D = (iso: string) => new Date(iso + 'T00:00:00Z');
  const sheet: RawSheet = { name: 'Α', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΔΟΣ ΑΔΕΙΑΣ', 'ΑΠΟ', 'ΩΡΑ ΑΝΑΧΩΡΗΣΗΣ', 'ΕΩΣ', 'ΩΡΑ ΕΠΙΣΤΡΟΦΗΣ'], [p.last, p.first, 'ΚΑΝΟΝΙΚΗ', D('2026-10-12'), null, D('2026-10-18'), null]] };
  const st = leave({ pid: p.id, kind: 'ΚΑΝΟΝΙΚΗ' }); const keys = [identity(p.id, 'leave', st.from)];
  const s = { ...s0, statuses: [st] };
  it('διακοπή: αλλάζει το «έως» και η ώρα επιστροφής στην ίδια γραμμή', () => {
    expect(planWrite('leave', sheet, b, s, keys, TODAY).sets).toEqual([]);
    const n = run(s, { t: 'endLeave', id: 'l1', date: TODAY, time: '21:30' }).state;
    const sets = planWrite('leave', sheet, b, n, keys, TODAY).sets;
    expect(sets.map(x => [x.r, x.c])).toEqual([[1, 5], [1, 6]]);
    expect(sets[1].v).toBe('21:30');
  });
  it('ακύρωση: η γραμμή σβήνεται', () => {
    const n = run(s, { t: 'cancelLeave', id: 'l1' }).state;
    const w = planWrite('leave', sheet, b, n, keys, TODAY);
    expect(w.cleared).toBe(1);
    expect(w.sets.every(x => x.r === 1 && x.v === null)).toBe(true);
  });
});

// Michael, 20/10: «όταν κάποιος γυρνά, να γυρνά το state του στο κανονικό δυναμολόγιο», από την ώρα που έβαλες
describe('γύρισε: παρών από την ώρα επιστροφής', () => {
  const back = (time: string) => run(with1(leave()), { t: 'endLeave', id: 'l1', date: TODAY, time }).state;
  it('Δυναμολόγιο: λείπει ως τις 16:00, μετά παρών (άλλες μέρες όλη η μέρα)', () => {
    const s = back('16:00');
    expect(statusesNow(s.statuses, 1, TODAY, TODAY, 15 * 60 + 59)).toHaveLength(1);
    expect(statusesNow(s.statuses, 1, TODAY, TODAY, 16 * 60)).toEqual([]);
    expect(rosterMatch('leave', s.people[0], statusesNow(s.statuses, 1, TODAY, TODAY, 17 * 60))).toBe(false);
    expect(rosterMatch('leave', s.people[0], statusesNow(s.statuses, 1, TODAY, TODAY, 10 * 60))).toBe(true);
  });
  it('Άδειες: «Τώρα» ως την ώρα επιστροφής, μετά «Γύρισαν»', () => {
    const st = back('16:00').statuses[0];
    expect(awayNow(st, TODAY, 15 * 60)).toBe(true);
    expect(awayNow(st, TODAY, 16 * 60)).toBe(false);
    expect(awayNow(leave({ open: true, to: TODAY, toTime: '10:00' }), TODAY, 20 * 60)).toBe(true);   // χωρίς λήξη: λείπει
  });
  it('Excel Δυναμολογίου: το φύλλο Άδειες σήμερα μετά την επιστροφή είναι άδειο', () => {
    const s = back('16:00');
    const leaves = (at?: number) => rosterSheets(s, TODAY, at).find(x => x.name === ROSTER_FILTERS.find(([k]) => k === 'leave')![2])!.rows.length;
    expect(leaves()).toBe(1); expect(leaves(15 * 60)).toBe(1); expect(leaves(16 * 60 + 5)).toBe(0);
  });
  it('νοσοκομείο: βγήκε νωρίτερα στις 11:00, η ώρα κρατιέται· όχι για ΕΥ', () => {
    const s = with1(leave({ type: 'NOS', kind: undefined }));
    const r = run(s, { t: 'endLeave', id: 'l1', date: TODAY, time: '11:00' });
    expect(r.state.statuses[0]).toMatchObject({ to: TODAY, toTime: '11:00' });
    expect(r.text).toMatch(/έξοδος 14\/10 11:00/);
    expect(statusesNow(r.state.statuses, 1, TODAY, TODAY, 12 * 60)).toEqual([]);
    expect(() => run(with1(leave({ type: 'EY', kind: undefined })), { t: 'endLeave', id: 'l1', date: TODAY, time: '11:00' })).toThrow('Δεν βρέθηκε');
  });
});
