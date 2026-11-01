// Εξοδούχοι: όποιος είναι σε άδεια/νοσοκομείο στην ώρα εξόδου δεν είναι παραμένων («Σε άδεια» αντί «Μένει»)
import { describe, it, expect } from 'vitest';
import { fakeState } from './fixtures';
import { awayAtOut, awayName, awayNote, outsAndStay } from '../src/shared/outsStay';
import type { AppState, Status, TypeKey } from '../src/shared/domain';

let q = 0;
const st = (pid: number, type: TypeKey, from: string, extra: Partial<Status> = {}): Status => ({ id: 'a' + ++q, pid, type, from, to: extra.to || from, ...extra });
const FRI = '2026-10-30', SAT = '2026-10-31';
const withSt = (...x: Status[]): AppState => { const s = fakeState(10); s.statuses = x; return s; };   // ώρα εξόδου προεπιλογής: 16:00

describe('awayAtOut', () => {
  it('άδεια σε εξέλιξη: σε άδεια', () => {
    const s = withSt(st(1, 'LEAVE', '2026-10-26', { to: '2026-11-05' }));
    expect(awayAtOut(s, FRI, 1)?.type).toBe('LEAVE');
    expect(awayAtOut(s, FRI, 2)).toBeNull();
  });
  it('άδεια που τελειώνει σήμερα πριν από την ώρα εξόδου: γύρισε, όχι σε άδεια', () => {
    expect(awayAtOut(withSt(st(1, 'LEAVE', '2026-10-26', { to: FRI, toTime: '14:00' })), FRI, 1)).toBeNull();
  });
  it('άδεια που τελειώνει σήμερα μετά την ώρα εξόδου: σε άδεια', () => {
    expect(awayAtOut(withSt(st(1, 'LEAVE', '2026-10-26', { to: FRI, toTime: '19:00' })), FRI, 1)?.type).toBe('LEAVE');
  });
  it('άδεια που αρχίζει σήμερα (με ώρα): σε άδεια', () => {
    expect(awayAtOut(withSt(st(1, 'LEAVE', FRI, { to: '2026-11-03', fromTime: '14:00' })), FRI, 1)?.type).toBe('LEAVE');
  });
  it('νοσοκομείο προτιμάται από την άδεια', () => {
    const s = withSt(st(1, 'LEAVE', '2026-10-26', { to: '2026-11-05' }), st(1, 'NOS', '2026-10-29', { to: '2026-11-02' }));
    expect(awayAtOut(s, FRI, 1)?.type).toBe('NOS');
    expect(awayName(awayAtOut(s, FRI, 1)!)).toBe('Νοσοκομείο');
    expect(awayName(awayAtOut(withSt(st(1, 'SICK', FRI, { to: SAT })), FRI, 1)!)).toBe('Σε άδεια');
  });
  it('κατάσταση που αιτείται: δεν μετρά', () => {
    expect(awayAtOut(withSt(st(1, 'LEAVE', FRI, { to: SAT, pending: true })), FRI, 1)).toBeNull();
  });
  it('έξοδος/ΔΝ και ΣΤΕΠ: δεν είναι άδεια', () => {
    const s = withSt(st(1, 'OUT', FRI), st(2, 'DN', FRI), st(3, 'STEP', FRI));
    for (const pid of [1, 2, 3]) expect(awayAtOut(s, FRI, pid)).toBeNull();
  });
});

describe('outsAndStay με άδεια', () => {
  it('όποιος είναι σε άδεια/νοσοκομείο δεν είναι ούτε εξοδούχος ούτε παραμένων', () => {
    const s = withSt(st(1, 'LEAVE', '2026-10-26', { to: '2026-11-05' }), st(2, 'NOS', FRI, { to: SAT }), st(3, 'OUT', FRI), st(4, 'LEAVE', '2026-10-26', { to: FRI, toTime: '14:00' }));
    const r = outsAndStay(s, FRI);
    const outs = r.outs.map(x => x.p.id), stay = r.stay.map(x => x.p.id);
    expect(outs).toEqual([3]);
    for (const pid of [1, 2]) { expect(outs).not.toContain(pid); expect(stay).not.toContain(pid); }
    expect(stay).toContain(4);   // γύρισε πριν από την ώρα εξόδου: παραμένων
    expect(outs.length + stay.length).toBe(10 - 2);
  });
});

describe('awayNote', () => {
  it('άδεια με λήξη: τι είναι, ως πότε και πότε γυρνά', () => {
    const s = withSt(st(1, 'LEAVE', '2026-10-26', { to: '2026-11-05' }));
    const n = awayNote(s, FRI, 1, awayAtOut(s, FRI, 1)!);
    expect(n).toMatch(/^Κανονική άδεια ως 05\/11 · γυρνά Παρ 06\/11 πρωί$/);
  });
  it('άδεια χωρίς λήξη: δεν λέει πότε γυρνά', () => {
    const s = withSt(st(1, 'LEAVE', '2026-10-26', { open: true }));
    expect(awayNote(s, FRI, 1, awayAtOut(s, FRI, 1)!)).toBe('Κανονική άδεια χωρίς λήξη');
  });
});
