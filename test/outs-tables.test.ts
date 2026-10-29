// Οι 4 πίνακες των Εξοδούχων (Michael, 26/10): ποιος μπαίνει πού, με Πότε/Γιατί. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { fakeState } from './fixtures';
import { outsTables, returnOf, returnsOn, whenTxt, type OutRow, type OutsTables } from '../src/shared/returns';
import type { AppState, Status, TypeKey } from '../src/shared/domain';

let seq = 0;
const ctx: Ctx = { today: '2026-10-22', newId: () => 'o' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
// Παρ 23/10 … Τρι 27/10 (η Τετάρτη 28/10 είναι αργία)
const FRI = '2026-10-23', SAT = '2026-10-24', SUN = '2026-10-25', MON = '2026-10-26', TUE = '2026-10-27';
const st = (pid: number, type: TypeKey, from: string, extra: Partial<Status> = {}): Status => ({ id: 's' + ++seq, pid, type, from, to: extra.to || from, ...extra });
const with_ = (...ss: Status[]) => ({ ...fakeState(10), statuses: ss });
const decl = (d: string) => st(9, 'OUT', d);   // κάποιος άλλος έχει έξοδο: η μέρα είναι «δηλωμένη»
const wk = (pid: number) => run(fakeState(10), { t: 'outs', date: SAT, changes: [{ pid, from: null, to: 'DN', wk: true }], force: true });
const ids = (t: OutsTables) => Object.fromEntries((Object.entries(t) as [string, OutRow[]][]).map(([k, v]) => [k, v.map(x => x.p.id)]));
const line = (t: OutsTables, k: keyof OutsTables, pid: number) => { const x = t[k].find(y => y.p.id === pid)!; return [x.when, x.why]; };

describe('outsTables: οι τέσσερις πίνακες', () => {
  it('ΔΝ σήμερα: στον 1 (Βγαίνουν ΔΝ) και στον 4 (Γυρίζουν αύριο) με 06:00', () => {
    const t = outsTables(with_(st(2, 'DN', MON)), MON);
    expect(ids(t)).toEqual({ dn: [2], out: [], tonight: [], tomorrow: [2] });
    expect(line(t, 'dn', 2)).toEqual(['αύριο 06:00', 'ΔΝ']);
    expect(line(t, 'tomorrow', 2)).toEqual(['αύριο 06:00', 'ΔΝ']);
  });
  it('εξοδούχος σήμερα: μόνο στον 2, με την ώρα των εξοδούχων της μέρας', () => {
    let s = with_(st(3, 'OUT', MON));
    expect(ids(outsTables(s, MON))).toEqual({ dn: [], out: [3], tonight: [], tomorrow: [] });
    expect(line(outsTables(s, MON), 'out', 3)).toEqual(['απόψε 22:00', 'έξοδος']);
    s = run(s, { t: 'setDayPlan', date: MON, plan: { backOut: '23:30' } });
    expect(line(outsTables(s, MON), 'out', 3)[0]).toBe('απόψε 23:30');
  });
  it('ΔΝ χθες + εξοδούχος σήμερα: στον 3 «απόψε 22:00», όχι στον 2 ούτε στον 1', () => {
    const t = outsTables(with_(st(4, 'DN', MON), st(4, 'OUT', TUE)), TUE);
    expect(ids(t)).toEqual({ dn: [], out: [], tonight: [4], tomorrow: [] });
    expect(line(t, 'tonight', 4)).toEqual(['απόψε 22:00', 'ΔΝ χθες, έξοδος']);
  });
  it('άδεια που λήγει σήμερα, τίποτα άλλο: στον 3 στην ώρα της άδειας (σήμερα πριν την ώρα εξόδου, απόψε μετά)', () => {
    const lv = (toTime?: string) => st(5, 'LEAVE', FRI, { to: MON, kind: 'Κανονική', ...(toTime ? { toTime } : {}) });
    expect(line(outsTables(with_(lv('14:00')), MON), 'tonight', 5)).toEqual(['σήμερα 14:00', 'Κανονική άδεια']);
    expect(line(outsTables(with_(lv('21:30')), MON), 'tonight', 5)).toEqual(['απόψε 21:30', 'Κανονική άδεια']);
    expect(ids(outsTables(with_(lv('14:00')), MON))).toEqual({ dn: [], out: [], tonight: [5], tomorrow: [] });
  });
  it('άδεια που λήγει σήμερα χωρίς ώρα επιστροφής: γυρνά αύριο το πρωί (στον 4)', () => {
    const t = outsTables(with_(st(5, 'HON', FRI, { to: MON })), MON);
    expect(ids(t)).toEqual({ dn: [], out: [], tonight: [], tomorrow: [5] });
    expect(line(t, 'tomorrow', 5)).toEqual(['αύριο πρωί', 'Τιμητική άδεια']);
  });
  it('άδεια που λήγει σήμερα και σήμερα έχει ΔΝ: δεν γυρνά απόψε, γυρνά με τον κανόνα της ΔΝ (στον 4, όχι στον 1)', () => {
    const t = outsTables(with_(st(5, 'LEAVE', FRI, { to: MON, toTime: '06:00' }), st(5, 'DN', MON)), MON);
    expect(ids(t)).toEqual({ dn: [], out: [], tonight: [], tomorrow: [5] });
    expect(line(t, 'tomorrow', 5)).toEqual(['αύριο 06:00', 'τέλος άδειας, ΔΝ']);
    // η ώρα της ΔΝ ακολουθεί τα ίδια με το returnOf (εδώ η Τρίτη έχει άλλη ώρα επιστροφής ΔΝ)
    const s = run(with_(st(5, 'LEAVE', FRI, { to: MON }), st(5, 'DN', MON)), { t: 'setDayPlan', date: TUE, plan: { backDn: '07:15' } });
    expect(line(outsTables(s, MON), 'tomorrow', 5)[0]).toBe('αύριο 07:15');
  });
  it('άδεια που λήγει σήμερα και απόψε έχει έξοδο: γυρνά στην ώρα των εξοδούχων (στον 3)', () => {
    const t = outsTables(with_(st(5, 'SICK', FRI, { to: MON, toTime: '06:00' }), st(5, 'OUT', MON)), MON);
    expect(ids(t)).toEqual({ dn: [], out: [], tonight: [5], tomorrow: [] });
    expect(line(t, 'tonight', 5)).toEqual(['απόψε 22:00', 'τέλος άδειας, έξοδος']);
  });
  it('άδεια που λήγει αύριο: στον 4 με την ώρα της· ταξινόμηση κατά ώρα (06:00 πρώτα, μετά 14:00, 22:00)', () => {
    let s = with_(st(6, 'LEAVE', FRI, { to: TUE, toTime: '14:00' }), st(7, 'DN', MON), st(8, 'HON', SAT, { to: TUE, toTime: '22:00' }), st(1, 'SICK', SAT, { to: TUE, toTime: '06:00' }));
    const t = outsTables(s, MON);
    expect(t.tomorrow.map(x => [x.p.id, x.when])).toEqual([[1, 'αύριο 06:00'], [7, 'αύριο 06:00'], [6, 'αύριο 14:00'], [8, 'αύριο 22:00']]);
    expect(line(t, 'tomorrow', 6)).toEqual(['αύριο 14:00', 'Κανονική άδεια']);
    expect(ids(t).tonight).toEqual([]);
    // ίδια ώρα: κατά θάλαμο (ο 1 είναι στον θάλαμο 2, ο 7 στον 8)
    s = with_(st(7, 'DN', MON), st(1, 'DN', MON));
    expect(outsTables(s, MON).tomorrow.map(x => x.p.id)).toEqual([1, 7]);
  });
  it('ΔΝ ΣΚ: το Σάββατο στον 1 (γυρνά Δευτέρα), την Κυριακή ΜΟΝΟ στον 4', () => {
    const s = wk(2);
    const sat = outsTables(s, SAT);
    expect(ids(sat)).toEqual({ dn: [2], out: [], tonight: [], tomorrow: [] });
    expect(line(sat, 'dn', 2)).toEqual(['Δευτέρα 26/10 06:00', 'ΔΝ ΣΚ']);
    const sun = outsTables(s, SUN);
    expect(ids(sun)).toEqual({ dn: [], out: [], tonight: [], tomorrow: [2] });
    expect(line(sun, 'tomorrow', 2)).toEqual(['αύριο 06:00', 'ΔΝ ΣΚ']);
  });
  it('ΔΝ χθες που γυρίζει το πρωί επειδή σήμερα έχει εκπαίδευση και ξαναφεύγει: στον 1· αν σήμερα δεν έχει εκπαίδευση και συνεχίζει: μόνο στον 4', () => {
    let s = with_(st(2, 'DN', FRI), st(2, 'DN', SAT));
    expect(returnOf(s, 2, FRI)).toMatchObject({ day: SAT, time: '06:00' });
    expect(ids(outsTables(s, SAT)).dn).toEqual([2]);
    // η Κυριακή δεν έχει δηλωθεί και δεν έχει εκπαίδευση: δεν ξέρουμε πότε γυρνά
    expect(line(outsTables(s, SAT), 'tomorrow', 2)).toEqual(['άγνωστο', 'ΔΝ, δεν έχει δηλωθεί η Κυριακή']);
    s = { ...s, statuses: [...s.statuses, decl(SUN)] };
    expect(line(outsTables(s, SAT), 'tomorrow', 2)).toEqual(['αύριο 06:00', 'ΔΝ']);
    // Παρ ΔΝ, Σαβ ΔΝ, Κυρ ΔΝ (χωρίς εκπαίδευση): την Κυριακή συνεχίζει
    s = with_(st(2, 'DN', FRI), st(2, 'DN', SAT), st(2, 'DN', SUN));
    s = run(s, { t: 'setDayPlan', date: SAT, plan: { train: false } });
    expect(ids(outsTables(s, SUN))).toEqual({ dn: [], out: [], tonight: [], tomorrow: [2] });
    expect(ids(outsTables(s, SAT)).dn).toEqual([]);   // ούτε το Σάββατο: δεν γύρισε
  });
  it('Πότε/Γιατί: υπηρεσία την επόμενη μέρα, άδεια που ξεκινά μετά την επιστροφή, διόρθωση, εξοδούχος με ΔΝ χθες', () => {
    let s = run(with_(st(2, 'DN', SAT)), { t: 'assign', date: SUN, k: 'ly', pid: 2, force: 'x' });
    expect(line(outsTables(s, SAT), 'dn', 2)).toEqual(['αύριο 06:00', 'ΔΝ, υπηρεσία Λ/Υ από 14:00']);
    s = with_(st(2, 'DN', FRI), st(2, 'LEAVE', SAT, { to: '2026-10-30', fromTime: '14:00' }));
    expect(line(outsTables(s, FRI), 'dn', 2)).toEqual(['αύριο 06:00', 'ΔΝ, φεύγει για άδεια 14:00']);
    s = run(with_(st(2, 'DN', FRI)), { t: 'setBackFix', pid: 2, day: FRI, at: { day: MON, time: '10:00' }, why: 'ΕΞΕΤΑΣΕΙΣ' });
    expect(line(outsTables(s, FRI), 'dn', 2)).toEqual(['Δευτέρα 26/10 10:00', 'ΔΝ, διόρθωση: ΕΞΕΤΑΣΕΙΣ']);
    expect(outsTables(s, FRI).tomorrow).toEqual([]);
  });
  it('ο χθεσινός ΔΝ που σήμερα δεν έχει τίποτα, και όποιος δεν είναι απών, δεν μπαίνουν πουθενά', () => {
    expect(ids(outsTables(with_(st(2, 'DN', FRI)), SAT))).toEqual({ dn: [], out: [], tonight: [], tomorrow: [] });
    expect(ids(outsTables(with_(), MON))).toEqual({ dn: [], out: [], tonight: [], tomorrow: [] });
  });
  it('whenTxt: αύριο / απόψε / σήμερα / μέρα', () => {
    const s = with_();
    expect(whenTxt(s, MON, { day: TUE, time: '06:00', why: '' })).toBe('αύριο 06:00');
    expect(whenTxt(s, MON, { day: MON, time: '22:00', why: '' })).toBe('απόψε 22:00');
    expect(whenTxt(s, MON, { day: MON, time: '10:00', why: '' })).toBe('σήμερα 10:00');
    expect(whenTxt(s, MON, { day: '2026-10-30', time: '', why: '' })).toBe('Παρασκευή 30/10 πρωί');
  });
});

describe('outsTables και «Ποιοι γυρίζουν και πότε»: μία πηγή', () => {
  it('άδεια που λήγει σήμερα με ΔΝ σήμερα: και το returnsOn γυρνά με τον κανόνα του ΔΝ, όπως το Excel (σχέδιο 26/10)', () => {
    const s = with_(st(5, 'LEAVE', FRI, { to: MON, toTime: '06:00' }), st(5, 'DN', MON));
    expect(returnsOn(s, MON).map(b => [b.p.id, b.r.day, b.r.time])).toEqual([[5, TUE, '06:00']]);
    expect(returnOf(s, 5, MON)).toBeNull();
  });
});
