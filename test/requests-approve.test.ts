// Έγκριση σε όλες τις αιτήσεις (Michael, 1/11): «Εγκρίθηκε», «Απορρίφθηκε», «Αναίρεση απόφασης», παλιές αιτήσεις (old), οι διορθώσεις Λ1–Λ9
// και το Ε1 («παρών ως να φύγει»). Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { isWaiting, markOldRequests, type AppState, type PersonRequest, type Status } from '../src/shared/domain';
import { approvalPlan, planNeedsOk, sameLeave, leaveCmdOf, hkaiCounts, hkMin } from '../src/shared/rules';
import { hkaiLeaveLines, hkaiReqLines, lineText } from '../src/shared/hkaiText';
import { diffStatuses, parseStatuses, type SourceBinding } from '../src/shared/sources';
import type { RawSheet } from '../src/shared/roster';
import { evalValue } from '../src/shared/values';
import { mins } from '../src/shared/hours';
import { fakeState } from './fixtures';

const TODAY = '2026-11-02', D = '2026-11-04', D2 = '2026-11-05';
let seq = 0;
const ctx = (today = TODAY): Ctx => ({ today, newId: () => 'a' + ++seq });
const run = (s: AppState, c: Command, today = TODAY) => apply(s, c, ctx(today)).state;
const base = (): AppState => { const s = fakeState(8); s.hkaiManual = { [D]: { cells: {}, text: {}, lv: true } } as any; return s; };
const addLeave = (s: AppState, pid = 2, x: Partial<NonNullable<PersonRequest['leave']>> = {}) =>
  run(s, { t: 'addRequest', req: { pid, date: D, text: '', leave: { type: 'LEAVE', kind: 'Κανονική', from: D, to: D2, ...x } } as any });
const addPlain = (s: AppState, pid = 3, date = D, text = 'μετάθεση στην 2η ΕΠΧΙΑ') => run(s, { t: 'addRequest', req: { pid, date, text } as any });
const last = (s: AppState) => s.requests[s.requests.length - 1];

describe('έγκριση: αίτηση που δεν είναι άδεια', () => {
  it('Εγκρίθηκε και Απορρίφθηκε κρατούν μόνο την απόφαση και την ημερομηνία, χωρίς άδεια', () => {
    let s = addPlain(base()); s = addPlain(s, 4, D, 'αλλαγή θαλάμου');
    const [a, b] = s.requests;
    s = run(s, { t: 'decideRequest', id: a.id, ok: true }); s = run(s, { t: 'decideRequest', id: b.id, ok: false });
    expect(s.requests[0]).toMatchObject({ decision: 'ok', decided: D }); expect(s.requests[1]).toMatchObject({ decision: 'no', decided: D });
    expect(s.requests[0].sid).toBeUndefined(); expect(s.statuses).toEqual([]);
  });
  it('η ημερομηνία απόφασης δεν είναι πριν από την αίτηση· αν η αίτηση είναι παλιά, είναι σήμερα', () => {
    let s = addPlain(base(), 3, '2026-10-20');
    s = run(s, { t: 'decideRequest', id: s.requests[0].id, ok: true });
    expect(s.requests[0].decided).toBe(TODAY);
  });
  it('δεύτερη απόφαση χωρίς αναίρεση δεν γίνεται· η αναίρεση τη βγάζει από την απόφαση και την ξαναφέρνει σε αναμονή', () => {
    let s = addPlain(base()); const id = s.requests[0].id;
    s = run(s, { t: 'decideRequest', id, ok: true });
    expect(() => run(s, { t: 'decideRequest', id, ok: false })).toThrow(/Αναίρεσε/);
    s = run(s, { t: 'decideRequest', id, ok: null });
    expect(s.requests[0].decision).toBeUndefined(); expect(s.requests[0].decided).toBeUndefined();
    expect(isWaiting(s.requests[0])).toBe(true);
  });
  it('αίτηση με απόφαση δεν αλλάζει (updateRequest) ούτε με λάθος id', () => {
    let s = addPlain(base()); const r = s.requests[0];
    s = run(s, { t: 'decideRequest', id: r.id, ok: true });
    expect(() => run(s, { t: 'updateRequest', req: { ...r, text: 'άλλο' } })).toThrow();
    expect(() => run(s, { t: 'decideRequest', id: 'nope', ok: true })).toThrow(/Δεν βρέθηκε/);
  });
  it('μένει στο 5. ΑΙΤΗΣΕΙΣ μία φορά, πριν και μετά την απόφαση', () => {
    let s = addPlain(base());
    const n = () => hkaiReqLines(s, D).length;
    expect(n()).toBe(1); s = run(s, { t: 'decideRequest', id: s.requests[0].id, ok: true }); expect(n()).toBe(1);
  });
});

describe('έγκριση: αίτηση άδειας', () => {
  it('γίνεται άδεια με τα στοιχεία της (είδος, ώρες, κατεύθυνση), δεμένη με την αίτηση, και δεν ξαναγράφεται στο 3. ΑΔΕΙΕΣ', () => {
    let s = addLeave(base(), 2, { kind: 'Ειδική', fromTime: '14:00', dest: 'Κόρινθο' });
    const r = s.requests[0];
    s = run(s, { t: 'decideRequest', id: r.id, ok: true });
    expect(s.statuses).toHaveLength(1);
    expect(s.statuses[0]).toMatchObject({ pid: 2, type: 'LEAVE', kind: 'Ειδική', from: D, to: D2, fromTime: '14:00', dest: 'Κόρινθο', req: r.id });
    expect(s.requests[0]).toMatchObject({ decision: 'ok', sid: s.statuses[0].id });
    expect(hkaiLeaveLines(s, D)).toEqual([]); expect(hkaiReqLines(s, D)).toHaveLength(1);
  });
  it('απόρριψη δεν φτιάχνει άδεια', () => {
    let s = addLeave(base()); s = run(s, { t: 'decideRequest', id: s.requests[0].id, ok: false });
    expect(s.statuses).toEqual([]); expect(s.requests[0].decision).toBe('no');
  });
  it('αναίρεση βγάζει την άδεια που έγινε από την αίτηση, και η αίτηση ξαναπεριμένει', () => {
    let s = addLeave(base()); const id = s.requests[0].id;
    s = run(s, { t: 'decideRequest', id, ok: true }); s = run(s, { t: 'decideRequest', id, ok: null });
    expect(s.statuses).toEqual([]); expect(s.requests[0]).toMatchObject({ id }); expect(s.requests[0].sid).toBeUndefined(); expect(isWaiting(s.requests[0])).toBe(true);
    // και ξανά έγκριση
    s = run(s, { t: 'decideRequest', id, ok: true }); expect(s.statuses).toHaveLength(1);
  });
  it('Λ3: η ίδια άδεια είχε ήδη δηλωθεί απευθείας: δένεται με την αίτηση, δεν γίνεται δεύτερη', () => {
    let s = run(base(), { t: 'declare', cmd: { type: 'LEAVE', kind: 'Κανονική', pids: [2], from: D, to: D2 } as any });
    s = addLeave(s, 2, { kind: 'Κανονική άδεια' });
    const r = s.requests[0]; expect(sameLeave(s, r)).toBe(s.statuses[0]); expect(approvalPlan(s, r, TODAY)).toBeNull();
    const id = s.statuses[0].id;
    s = run(s, { t: 'decideRequest', id: r.id, ok: true });
    expect(s.statuses).toHaveLength(1); expect(s.statuses[0]).toMatchObject({ id, req: r.id }); expect(s.requests[0].sid).toBe(id);
    expect(hkaiLeaveLines(s, D)).toEqual([]);   // και δεν γράφεται δύο φορές στην ΗΚΑΙ
  });
  it('Λ3: άλλο είδος ή άλλες μέρες δεν είναι «η ίδια άδεια»', () => {
    let s = run(base(), { t: 'declare', cmd: { type: 'LEAVE', kind: 'ΑΜΔ', pids: [2], from: D, to: D2 } as any });
    s = addLeave(s, 2);
    expect(sameLeave(s, s.requests[0])).toBeUndefined();
    const s2 = run(addLeave(base(), 3), { t: 'declare', cmd: { type: 'LEAVE', kind: 'Κανονική', pids: [3], from: D, to: D } as any });
    expect(sameLeave(s2, s2.requests[0])).toBeUndefined();
  });
  it('Λ1/Λ2: ο έλεγχος πριν την έγκριση βλέπει επικάλυψη με άλλη άδεια, υπηρεσία που αδειάζει και μέρες στο παρελθόν', () => {
    let s = run(base(), { t: 'declare', cmd: { type: 'LEAVE', kind: 'ΑΜΔ', pids: [2], from: D, to: D2 } as any });
    s = addLeave(s, 2, { kind: 'Ειδική' });
    const pl = approvalPlan(s, s.requests[0], TODAY)!;
    expect(pl.overlaps).toHaveLength(1); expect(planNeedsOk(pl)).toBe(true);
    // υπηρεσία μέσα στις μέρες της άδειας
    let t = addLeave(base(), 3); t = run(t, { t: 'assign', date: D, k: 'th1', pid: 3 });
    const pt = approvalPlan(t, t.requests[0], TODAY)!;
    expect(pt.conflicts.length).toBeGreaterThan(0); expect(planNeedsOk(pt)).toBe(true);
    // καθαρή περίπτωση και αίτηση χωρίς άδεια
    const clean = addLeave(base(), 4); expect(planNeedsOk(approvalPlan(clean, clean.requests[0], TODAY)!)).toBe(false);
    expect(approvalPlan(base(), { id: 'x', pid: 1, date: D, text: 'κάτι' }, TODAY)).toBeNull();
    expect(leaveCmdOf({ id: 'x', pid: 1, date: D, text: 'κάτι' })).toBeNull();
    // η έγκριση βγάζει τον στρατιώτη από την υπηρεσία, όπως η Δήλωση
    t = run(t, { t: 'decideRequest', id: t.requests[0].id, ok: true });
    expect(t.guards[D]?.th1).toBeUndefined();
  });
});

describe('παλιές αιτήσεις (old) και μετρητές', () => {
  const R = (id: string, date: string, x: Partial<PersonRequest> = {}): PersonRequest => ({ id, pid: 1, date, text: 'κάτι', ...x });
  it('μία φορά: μόνο οι αιτήσεις που δεν είναι άδεια, χωρίς απόφαση και πριν από σήμερα', () => {
    const s = base();
    s.requests = [
      R('p1', '2026-10-20'), R('p2', '2026-10-20', { decision: 'ok' }), R('p3', TODAY), R('p4', '2026-11-03'),
      R('l1', '2026-10-20', { leave: { type: 'LEAVE', kind: 'Κανονική', from: '2026-10-25', to: '2026-10-26' } })
    ];
    const m = markOldRequests(s, TODAY)!;
    expect(m.requests.map(r => !!r.old)).toEqual([true, false, false, false, false]);
    expect(m.settings.reqFrom).toBe(TODAY);
    expect(markOldRequests(m, '2026-12-01')).toBeNull();   // δεύτερη φορά δεν αλλάζει τίποτα
  });
  it('οι old δεν μετρούν ως «περιμένουν»· η έγκριση ή απόρριψη τις κλείνει κανονικά, και η αναίρεση δεν τις ξαναξυπνά', () => {
    let s = base(); s.requests = [{ id: 'p1', pid: 1, date: '2026-10-20', text: 'κάτι' }];
    s = markOldRequests(s, TODAY)!;
    expect(isWaiting(s.requests[0])).toBe(false);
    s = run(s, { t: 'decideRequest', id: 'p1', ok: false }); expect(s.requests[0]).toMatchObject({ decision: 'no', old: true });
    s = run(s, { t: 'decideRequest', id: 'p1', ok: null }); expect(isWaiting(s.requests[0])).toBe(false);
  });
  it('η αλλαγή αίτησης (updateRequest) κρατά το old', () => {
    let s = base(); s.requests = [{ id: 'p1', pid: 1, date: '2026-10-20', text: 'κάτι', old: true }];
    s = run(s, { t: 'updateRequest', req: { id: 'p1', pid: 1, date: '2026-10-20', text: 'κάτι άλλο' } });
    expect(s.requests[0].old).toBe(true); expect(s.requests[0].text).toMatch(/άλλο/i);
  });
  it('οι νέες αιτήσεις δεν παίρνουν old· η μέτρηση req.waiting μετρά στρατιώτες με αίτηση που περιμένει (όχι old, όχι αποφασισμένη)', () => {
    let s = base(); s.requests = [{ id: 'p1', pid: 1, date: '2026-10-20', text: 'κάτι' }];
    s = markOldRequests(s, TODAY)!;
    s = addPlain(s, 2, '2026-11-03'); s = addLeave(s, 3); s = addPlain(s, 4); s = run(s, { t: 'decideRequest', id: last(s).id, ok: true });
    expect(s.requests.filter(r => r.old).map(r => r.id)).toEqual(['p1']);
    const waiting = evalValue(s, D, hkMin(s.rules), [{ sign: '+', metric: 'req.waiting' }]);
    expect(waiting).toBe(2);   // ο 2 (απλή, χθες) και ο 3 (άδεια)· ο 1 είναι old και ο 4 εγκρίθηκε
  });
});

describe('Λ8: αλλαγή άδειας από αίτηση στο Excel κρατά το id και τη σύνδεση', () => {
  it('αλλάζει η λήξη στο Excel: ενημερώνεται η ίδια άδεια, δεν γίνεται νέα', () => {
    let s = addLeave(base(), 3); const rid = s.requests[0].id;
    s = run(s, { t: 'decideRequest', id: rid, ok: true });
    const st = s.statuses[0], p = s.people[2];
    const D0 = (iso: string) => new Date(iso + 'T00:00:00Z');
    const b: SourceBinding = { file: 'x.xlsx', sheet: 'Α', header: 0, cols: { last: 0, first: 1, kind: 2, from: 3, to: 4 }, write: true };
    const sheet: RawSheet = { name: 'Α', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΔΟΣ ΑΔΕΙΑΣ', 'ΑΠΟ', 'ΕΩΣ'], [p.last, p.first, 'ΚΑΝΟΝΙΚΗ', D0(D), D0('2026-11-08')]] };
    const d = diffStatuses('leave', s, parseStatuses('leave', sheet, b, s.people, TODAY), b);
    expect(d.add).toEqual([]);
    expect(d.update).toMatchObject([{ id: st.id, patch: { to: '2026-11-08' } }]);
    const n = run(s, { t: 'importRecords', adds: [], updates: d.update.map(u => ({ id: u.id, patch: u.patch })), source: 'x', what: 'άδειες' });
    expect(n.statuses).toHaveLength(1); expect(n.statuses[0]).toMatchObject({ id: st.id, req: rid, to: '2026-11-08' });
    expect(n.requests[0]).toMatchObject({ decision: 'ok', sid: st.id });
  });
});

describe('Ε1: παρών ως να φύγει (ΗΚΑΙ)', () => {
  const at = hkMin(fakeState(1).rules), hh = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const leaveOn = (x: Partial<Status>): AppState => { const s = base(); s.statuses = [{ id: 'z', pid: 2, type: 'LEAVE', kind: 'Κανονική', from: D, to: D2, ...x }]; return s; };
  const inKa = (s: AppState, d = D) => hkaiCounts(s, d).cols.ka.some(p => p.id === 2);
  it('φεύγει μετά την ώρα της ΗΚΑΙ: την πρώτη μέρα παρών, την επόμενη άδεια', () => {
    const s = leaveOn({ fromTime: hh(at + 60) });
    expect(inKa(s, D)).toBe(false); expect(inKa(s, D2)).toBe(true);
    const c = hkaiCounts(s, D), c0 = hkaiCounts(base(), D);
    expect(c.apo).toBe(c0.apo); expect(c.avail).toBe(c0.avail);
  });
  it('φεύγει νωρίτερα ή χωρίς ώρα: απών από την πρώτη μέρα, όπως πριν', () => {
    expect(inKa(leaveOn({ fromTime: hh(Math.max(0, at - 60)) }))).toBe(true);
    expect(inKa(leaveOn({}))).toBe(true);
    expect(inKa(leaveOn({ fromTime: hh(at) }))).toBe(true);   // ακριβώς την ώρα της ΗΚΑΙ: έχει φύγει
  });
  it('ισχύει για τιμητική και αναρρωτική, όχι για τις μέρες μετά την πρώτη', () => {
    const s = leaveOn({ type: 'HON', kind: undefined, fromTime: hh(at + 30) });
    const away = (d: string) => Object.values(hkaiCounts(s, d).cols).some(ps => ps.some(p => p.id === 2));
    expect(away(D)).toBe(false); expect(away(D2)).toBe(true);
    expect(mins(hh(at + 30))).toBe(at + 30);
  });
  it('το 3. ΑΔΕΙΕΣ τον γράφει κανονικά την πρώτη μέρα, αν και μετρά παρών', () => {
    const s = leaveOn({ fromTime: hh(at + 60) });
    expect(hkaiLeaveLines(s, D).map(lineText)).toHaveLength(1);
  });
});
