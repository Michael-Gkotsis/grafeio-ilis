// Ώρες επιστροφής σε έξοδο, ΗΚΑΙ και υπηρεσίες (Michael, 18/10): «γυρίζει Τετάρτη 06:00 → εκείνη τη μέρα εξοδούχος
// κανονικά». Και για νοσοκομείο, αναρρωτική και ΣΤΕΠ. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import type { AppState, Status } from '../src/shared/domain';
import type { RawSheet } from '../src/shared/roster';
import { timesTxt } from '../src/shared/hours';
import { dutyBlock, hkaiCounts, outBlock, planStatusChange, postBy, statusesFrom, strengthOf, outMin, hkMin } from '../src/shared/rules';
import { diffStatuses, parseStatuses, timeCols, type SourceBinding } from '../src/shared/sources';
import { outsAndStay, absentOn } from '../src/main/exports';
import { preflight } from '../src/shared/preflight';
import { fakeState } from './fixtures';

const TODAY = '2026-10-12';
const WED = '2026-10-14';
let seq = 0;
const ctx = (today = TODAY): Ctx => ({ today, newId: () => 'r' + ++seq });
const run = (s: AppState, c: Command, today = TODAY) => apply(s, c, ctx(today)).state;
const st = (pid: number, type: Status['type'], from: string, to: string, x: Partial<Status> = {}): Status => ({ id: 's' + pid + type, pid, type, from, to, ...x });
const with1 = (x: Status, n = 10): AppState => ({ ...fakeState(n), statuses: [x] });
const pid = 3;

describe('έξοδος την ημέρα της επιστροφής', () => {
  it('επιστροφή Τετάρτη 06:00: βγαίνει κανονικά έξοδο, χωρίς προειδοποίηση', () => {
    const s = with1(st(pid, 'LEAVE', '2026-10-10', WED, { kind: 'Κανονική', toTime: '06:00' }));
    expect(outBlock(s, WED, pid)).toBeNull();
    expect(outBlock(s, '2026-10-13', pid)).toMatch(/^ΚΑ/);
    const p = planStatusChange(s, { type: 'OUT', pids: [pid], from: WED, to: WED }, TODAY);
    expect(p.overlaps).toEqual([]); expect(p.blocked).toEqual([]);
    const n = run(s, { t: 'outs', date: WED, changes: [{ pid, from: null, to: 'OUT' }] });
    expect(n.statuses.filter(x => x.type === 'OUT')).toHaveLength(1);
    expect(outsAndStay(n, WED).outs.map(x => x.p.id)).toEqual([pid]);
  });
  it('χωρίς ώρα, ή επιστροφή μετά την ώρα εξόδου: όπως πριν δεν βγαίνει', () => {
    expect(outBlock(with1(st(pid, 'LEAVE', '2026-10-10', WED)), WED, pid)).toBe('ΚΑ');
    const late = with1(st(pid, 'LEAVE', '2026-10-10', WED, { toTime: '22:00' }));
    expect(outBlock(late, WED, pid)).toBe('ΚΑ (γυρίζει 22:00)');
    expect(planStatusChange(late, { type: 'OUT', pids: [pid], from: WED, to: WED }, TODAY).blocked).toHaveLength(1);
    // και η ώρα εξόδου αλλάζει στους Κανόνες
    const s = { ...late, rules: { ...late.rules, outTime: '22:30' } };
    expect(outBlock(s, WED, pid)).toBeNull();
  });
  it('η μέρα της αναχώρησης μετρά ολόκληρη, ακόμα κι αν φεύγει το βράδυ', () => {
    const s = with1(st(pid, 'LEAVE', WED, '2026-10-18', { fromTime: '20:00' }));
    expect(outBlock(s, WED, pid)).toMatch(/^ΚΑ/);
  });
  it('ΣΤΕΠ ως τις 10:00: βγαίνει έξοδο εκείνη τη μέρα και η δήλωση δεν ακυρώνει την έξοδό του', () => {
    const s = { ...fakeState(10), statuses: [st(pid, 'OUT', WED, WED)] };
    expect(outBlock(with1(st(pid, 'STEP', '2026-10-13', WED, { toTime: '10:00' })), WED, pid)).toBeNull();
    const cmd = { type: 'STEP' as const, pids: [pid], from: '2026-10-13', to: WED, toTime: '10:00' };
    expect(planStatusChange(s, cmd, TODAY).cancels).toEqual([]);
    const n = run(s, { t: 'declare', cmd });
    expect(n.statuses.find(x => x.type === 'OUT')).toMatchObject({ from: WED, to: WED });
    expect(n.statuses.find(x => x.type === 'STEP')).toMatchObject({ toTime: '10:00' });
    // χωρίς ώρα η έξοδος ακυρώνεται, όπως πριν
    expect(planStatusChange(s, { ...cmd, toTime: undefined }, TODAY).cancels).toHaveLength(1);
  });
  it('έλεγχος πριν από το Excel εξοδούχων: καμία προειδοποίηση «είναι εξοδούχος και σε άδεια»', () => {
    const s = { ...fakeState(10), statuses: [st(pid, 'LEAVE', '2026-10-10', WED, { toTime: '06:00' }), st(pid, 'OUT', WED, WED)] };
    expect(preflight('outs', s, WED).filter(c => /άδεια/i.test(c.text))).toEqual([]);
  });
});

describe('ΗΚΑΙ και Δύναμη', () => {
  it('γύρισε ως την ώρα της ΗΚΑΙ: παρών· αργότερα: στις άδειες', () => {
    const early = with1(st(pid, 'LEAVE', '2026-10-10', WED, { kind: 'Κανονική', toTime: '06:00' }));
    expect(hkaiCounts(early, WED).cols.ka).toEqual([]);
    expect(strengthOf(early, WED).present).toBe(10);
    const late = with1(st(pid, 'LEAVE', '2026-10-10', WED, { kind: 'Κανονική', toTime: '12:00' }));
    expect(hkaiCounts(late, WED).cols.ka.map(p => p.id)).toEqual([pid]);
    expect(strengthOf(late, WED).present).toBe(9);
    // την ώρα της ΗΚΑΙ την αλλάζεις στους Κανόνες
    expect(hkaiCounts({ ...late, rules: { ...late.rules, hkTime: '13:00' } }, WED).cols.ka).toEqual([]);
  });
  it('νοσοκομείο με ώρα εξόδου 07:00: παρών στην ΗΚΑΙ της μέρας', () => {
    const s = with1(st(pid, 'NOS', '2026-10-10', WED, { toTime: '07:00' }));
    expect(hkaiCounts(s, WED).cols.nos).toEqual([]);
    expect(hkaiCounts(s, '2026-10-13').cols.nos.map(p => p.id)).toEqual([pid]);
  });
  it('χωρίς ώρες τίποτα δεν αλλάζει', () => {
    const s = with1(st(pid, 'LEAVE', '2026-10-10', WED, { kind: 'Κανονική' }));
    expect(hkaiCounts(s, WED).cols.ka.map(p => p.id)).toEqual([pid]);
    expect(statusesFrom(s.statuses, pid, WED, 23 * 60)).toHaveLength(1);
  });
  it('προεπιλογές: έξοδος 16:00, ΗΚΑΙ 08:00', () => {
    expect(outMin(undefined)).toBe(16 * 60); expect(hkMin(null)).toBe(8 * 60);
  });
});

describe('υπηρεσίες με ώρες σε νοσοκομείο, αναρρωτική και ΣΤΕΠ', () => {
  it('επιστροφή από ΣΤΕΠ 12:00: μπαίνει στις θέσεις από 14:00· όχι στη μαγειρεία', () => {
    const s = with1(st(pid, 'STEP', '2026-10-13', WED, { toTime: '12:00' }));
    expect(dutyBlock(s.statuses, WED, pid, postBy(s, 'th1'))).toBeNull();
    expect(dutyBlock(s.statuses, WED, pid, postBy(s, 'mg1'))).toBe('ΣΤΕΠ');
  });
  it('αναρρωτική με ώρα αναχώρησης: η υπηρεσία της προηγούμενης μέρας που δεν προλαβαίνει', () => {
    const s = with1(st(pid, 'SICK', WED, '2026-10-20', { fromTime: '09:00' }));
    expect(dutyBlock(s.statuses, '2026-10-13', pid, postBy(s, 'ly'))).toMatch(/Φεύγει Αναρρωτική/);
  });
  it('το έντυπο υπηρεσιών δεν γράφει απόντα όποιον γυρίζει ως τις 14:00', () => {
    expect(absentOn(with1(st(pid, 'LEAVE', '2026-10-10', WED, { toTime: '13:00' })), WED)).toEqual([]);
    expect(absentOn(with1(st(pid, 'LEAVE', '2026-10-10', WED, { toTime: '15:00' })), WED)).toHaveLength(1);
  });
  it('κείμενα: νοσοκομείο «εισαγωγή/έξοδος», άδεια «αναχώρηση/επιστροφή»', () => {
    expect(timesTxt({ type: 'NOS', fromTime: '10:00', toTime: '18:00' })).toBe('εισαγωγή 10:00, έξοδος 18:00');
    expect(timesTxt({ type: 'LEAVE', fromTime: '10:00', toTime: '18:00' })).toBe('αναχώρηση 10:00, επιστροφή 18:00');
    expect(() => run(fakeState(5), { t: 'declare', cmd: { type: 'NOS', pids: [2], from: WED, to: WED, fromTime: '14:00', toTime: '12:00' } })).toThrow(/έξοδος .* μετά την εισαγωγή/);
  });
});

describe('Excel νοσοκομείου και ΣΤΕΠ: στήλες ωρών', () => {
  const s0 = fakeState(4); const p = s0.people[2];
  const D = (iso: string) => new Date(iso + 'T00:00:00Z');
  it('διαβάζονται «ΩΡΑ ΕΙΣΑΓΩΓΗΣ» και «ΩΡΑ ΕΞΟΔΟΥ»', () => {
    const b: SourceBinding = { file: 'x.xlsx', sheet: 'IATRIKA', header: 0, cols: { last: 0, first: 1, where: 2, from: 3, tout: 4, to: 5, tin: 6 }, write: true };
    const sh: RawSheet = { name: 'IATRIKA', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΣΑΓΩΓΗ', 'ΕΙΣ', 'ΩΡΑ ΕΙΣΑΓΩΓΗΣ', 'ΕΞ', 'ΩΡΑ ΕΞΟΔΟΥ'], [p.last, p.first, '401 ΓΣΝΑ', D('2026-10-13'), '10:00', D(WED), 7 / 24]] };
    const d = diffStatuses('hospital', s0, parseStatuses('hospital', sh, b, s0.people, TODAY), b);
    expect(d.add).toEqual([{ pid: p.id, type: 'NOS', from: '2026-10-13', to: WED, kind: '401 ΓΣΝΑ', fromTime: '10:00', toTime: '07:00' }]);
  });
  it('πίνακας ΣΤΕΠ χωρίς στήλες ωρών: μπαίνουν στο τέλος μόνο όταν κάποια εισαγωγή έχει ώρα', () => {
    const b: SourceBinding = { file: 'x.xlsx', sheet: 'IATRIKA', header: 0, cols: { last: 0, first: 1, from: 2, to: 3 }, write: true };
    const sh: RawSheet = { name: 'IATRIKA', rows: [['ΕΠΩΝΥΜΟ', 'ΟΝΟΜΑ', 'ΕΙΣ', 'ΕΞ'], [p.last, p.first, D('2026-10-13'), D(WED)]] };
    expect(timeCols('step', sh, b, { ...s0, statuses: [st(p.id, 'STEP', '2026-10-13', WED)] }, TODAY).head).toEqual([]);
    const t = timeCols('step', sh, b, { ...s0, statuses: [st(p.id, 'STEP', '2026-10-13', WED, { toTime: '10:00' })] }, TODAY);
    expect(t.head).toEqual([{ r: 0, c: 4, v: 'ΩΡΑ ΕΙΣΑΓΩΓΗΣ' }, { r: 0, c: 5, v: 'ΩΡΑ ΕΞΟΔΟΥ' }]);
  });
});
