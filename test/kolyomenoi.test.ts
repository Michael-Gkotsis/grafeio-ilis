// Κωλυόμενος (Michael, 24/10): υπηρεσία εκτός δικών μας, δήλωση από–έως με ώρες. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { KOL_COLS, STEP_COL, kolColOf, type AppState, type Status } from '../src/shared/domain';
import { dutyBlock, fairOf, fillDay, guardUnavailable, hkMin, hkaiCounts, kolView, nextFor, outBlock, planStatusChange, postBy, postsOf, strengthOf } from '../src/shared/rules';
import { frouraChecks } from '../src/shared/preflight';
import { outsAndStay } from '../src/main/exports';
import { fakeState } from './fixtures';

let seq = 0;
const TODAY = '2026-10-21', D1 = '2026-10-22', D2 = '2026-10-23', D3 = '2026-10-24', D4 = '2026-10-26';
const ctx: Ctx = { today: TODAY, newId: () => 'k' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const kol = (s: AppState, pid: number, from: string, to: string, x: Record<string, unknown> = {}) =>
  run(s, { t: 'declare', cmd: { type: 'KOL', pids: [pid], from, to, note: 'Υπηρεσία ΣΤΕΠ', minus: true, hkCol: 'yp', noOut: true, ...x } });
const hkaiColsOf = (h: ReturnType<typeof hkaiCounts>) => Object.fromEntries(KOL_COLS.map(([k]) => [k, h.cols[k]]));
const st = (pid: number, type: Status['type'], from: string, to: string, x: Partial<Status> = {}): Status => ({ id: 's' + ++seq, pid, type, from, to, ...x });
// όλοι εκτός από τον exclude έχουν μία υπηρεσία νωρίτερα: ο exclude είναι πρώτος στη σειρά δικαιοσύνης
function history(n: number, exclude: number): AppState {
  const s = fakeState(n); const ks = postsOf(s.settings).map(p => p.k);
  const ids = s.people.filter(p => p.id !== exclude && !p.post).map(p => p.id);
  const guards: AppState['guards'] = {};
  ids.forEach((pid, i) => { const d = '2026-10-' + String(1 + Math.floor(i / ks.length)).padStart(2, '0'); (guards[d] = guards[d] || {})[ks[i % ks.length]] = pid; });
  return { ...s, guards };
}

describe('κωλυόμενος: δήλωση', () => {
  it('αποθηκεύεται με υπηρεσία, αφαίρεση, στήλη και έξοδο· χωρίς αφαίρεση δεν κρατά στήλη', () => {
    const s = kol(fakeState(10), 3, D1, D2, { hkCol: 'ey' });
    expect(s.statuses).toEqual([expect.objectContaining({ type: 'KOL', pid: 3, from: D1, to: D2, note: 'Υπηρεσία ΣΤΕΠ', minus: true, hkCol: 'ey', noOut: true })]);
    const t = kol(fakeState(10), 3, D1, D2, { minus: false, noOut: false });
    expect(t.statuses[0]).toMatchObject({ type: 'KOL', note: 'Υπηρεσία ΣΤΕΠ' });
    expect('minus' in t.statuses[0]).toBe(false); expect('hkCol' in t.statuses[0]).toBe(false); expect('noOut' in t.statuses[0]).toBe(false);
  });
  it('θέλει «τι υπηρεσία», δεν δέχεται «χωρίς λήξη», άκυρη στήλη γίνεται Υπηρεσία', () => {
    expect(() => kol(fakeState(5), 2, D1, D1, { note: '  ' })).toThrow('Γράψε τι υπηρεσία');
    expect(() => kol(fakeState(5), 2, D1, D1, { open: true })).toThrow('Χωρίς λήξη');
    expect(kolColOf({ hkCol: 'ka' })).toBe('yp'); expect(kolColOf({})).toBe('yp'); expect(kolColOf({ hkCol: 'mag' })).toBe('mag');
    expect(KOL_COLS.map(x => x[0])).toEqual(['yp', 'ey', 'tim', 'os', 'mag', 'sid', 'kin']);
  });
  it('δεύτερη δήλωση: ίδια → σφάλμα· άλλη υπηρεσία ή άλλες ώρες την ίδια μέρα → επιτρέπεται', () => {
    const s = kol(fakeState(5), 2, D1, D1);
    expect(() => kol(s, 2, D1, D1)).toThrow('έχει ήδη');
    expect(kol(s, 2, D1, D1, { note: 'Συνοδεία σε νοσοκομείο' }).statuses).toHaveLength(2);
    expect(kol(s, 2, D1, D1, { fromTime: '10:00', toTime: '12:00' }).statuses).toHaveLength(2);
    expect(planStatusChange(s, { type: 'KOL', pids: [2], from: D1, to: D1, note: 'άλλη' }).overlaps).toHaveLength(0);
  });
  it('διόρθωση (replaceStatus) και διαγραφή· δεν γράφεται στα Ιατρικά', () => {
    const s = kol(fakeState(5), 2, D1, D2);
    const id = s.statuses[0].id;
    const r = apply(s, { t: 'replaceStatus', id, cmds: [{ type: 'KOL', pids: [2], from: D1, to: D3, note: 'Υπηρεσία ΣΤΕΠ', minus: true, hkCol: 'mag' }] }, ctx);
    expect(r.state.statuses).toHaveLength(1);
    expect(r.state.statuses[0]).toMatchObject({ to: D3, hkCol: 'mag' }); expect(r.files).not.toContain('Ιατρικά');
    expect(run(r.state, { t: 'deleteStatus', id: r.state.statuses[0].id }).statuses).toHaveLength(0);
    expect(() => apply(fakeState(5), { t: 'replaceStatus', id: 'x', cmds: [] }, ctx)).toThrow();
  });
  it('το «Τι θα αλλάξει»: ΗΚΑΙ μόνο με αφαίρεση· υπηρεσία μέσα στις μέρες του βγαίνει', () => {
    let s = fakeState(40); s = { ...s, guards: { [D1]: { th1: 3 } } };
    const p = planStatusChange(s, { type: 'KOL', pids: [3], from: D1, to: D2, note: 'ΣΤΕΠ', minus: true, hkCol: 'ey' });
    expect(p.files.find(f => f.desc.startsWith('Κωλυόμενοι'))?.desc).toContain('Ελεύθερος υπηρεσίας');
    expect(p.conflicts).toEqual([{ pid: 3, date: D1, k: 'th1' }]);
    expect(planStatusChange(s, { type: 'KOL', pids: [3], from: D1, to: D2, note: 'ΣΤΕΠ' }).files.map(f => f.desc).join()).toContain('Μένει στους παρόντες');
  });
});

describe('κωλυόμενος: δικές μας υπηρεσίες', () => {
  it('η αιτία φαίνεται στον κανόνα και στο έντυπο', () => {
    const s = kol(fakeState(40), 3, D1, D2);
    expect(guardUnavailable(s, D1, 3, 'th1')).toBe('Κωλυόμενος: Υπηρεσία ΣΤΕΠ έως 23/10');
    expect(guardUnavailable(s, D2, 3, 'ly')).toContain('Κωλυόμενος: Υπηρεσία ΣΤΕΠ');
    expect(guardUnavailable(s, D3, 3, 'th1')).toBeNull();
    expect(guardUnavailable(s, TODAY, 3, 'th1')).toBeNull();
  });
  it('η αυτόματη συμπλήρωση και ο «Επόμενος» τον προσπερνούν', () => {
    const s = kol(fakeState(16), 3, D1, D2);
    for (const d of [D1, D2]) expect(Object.values(fillDay(s, d).guards[d])).not.toContain(3);
    expect(Object.values(fillDay(s, D3).guards[D3])).toContain(3);
    const seen: number[] = [];
    for (let id = nextFor(s, D1, 'th1', seen); id != null; id = nextFor(s, D1, 'th1', seen)) seen.push(id);
    expect(seen).not.toContain(3); expect(seen.length).toBeGreaterThan(5);
  });
  it('με το χέρι μπαίνει μόνο με αιτία, και φαίνεται ως προειδοποίηση στο έντυπο', () => {
    const s = kol(fakeState(40), 3, D1, D2);
    expect(() => apply(s, { t: 'assign', date: D1, k: 'th1', pid: 3 }, ctx)).toThrow('Κωλυόμενος: Υπηρεσία ΣΤΕΠ');
    const r = apply(s, { t: 'assign', date: D1, k: 'th1', pid: 3, force: 'εντολή' }, ctx);
    expect(r.state.guards[D1].th1).toBe(3);
    expect(frouraChecks(r.state, D1).find(x => x.text.includes('Κωλυόμενος'))?.level).toBe('warn');
    expect(apply(s, { t: 'assign', date: D3, k: 'th1', pid: 3 }, ctx).state.guards[D3].th1).toBe(3);
  });
  it('η σειρά δικαιοσύνης δεν αλλάζει: μετά τις μέρες του βγαίνει πρώτος', () => {
    const base = history(60, 3); const s = kol(base, 3, D1, D2);
    expect(Object.values(fillDay(s, D1).guards[D1])).not.toContain(3);
    expect(Object.values(fillDay(s, D3).guards[D3])).toContain(3);
    expect(fairOf(s, 3, D3)).toEqual(fairOf(base, 3, D3));
    for (const d of [D1, D2, D3]) { const f = fairOf(s, 4, d), g = fairOf(base, 4, d); expect(f).toEqual(g); }
  });
  it('χωρίς κωλυόμενο η αυτόματη συμπλήρωση βγαίνει ίδια (και με κωλυόμενο που δεν αφορά τη μέρα)', () => {
    const base = fakeState(40); const s = kol(base, 3, D4, D4);
    expect(fillDay(s, D1).guards).toEqual(fillDay(base, D1).guards);
  });
});

describe('κωλυόμενος: έξοδος', () => {
  it('«Χωρίς έξοδο»: δεν βγαίνει, με αιτία· μόνο τις μέρες του', () => {
    const s = kol(fakeState(20), 3, D1, D2);
    expect(outBlock(s, D1, 3)).toBe('Κωλυόμενος: Υπηρεσία ΣΤΕΠ έως 23/10');
    expect(outBlock(s, D3, 3)).toBeNull();
  });
  it('χωρίς «Χωρίς έξοδο»: βγαίνει κανονικά', () => {
    const s = kol(fakeState(20), 3, D1, D2, { noOut: false });
    expect(outBlock(s, D1, 3)).toBeNull();
  });
  it('η δήλωση με «Χωρίς έξοδο» ακυρώνει τις εξόδους εκείνων των ημερών, χωρίς αυτό όχι', () => {
    const base = { ...fakeState(20), statuses: [st(3, 'OUT', D1, D1)] };
    expect(planStatusChange(base, { type: 'KOL', pids: [3], from: D1, to: D1, note: 'ΣΤΕΠ', noOut: true }).cancels).toHaveLength(1);
    expect(planStatusChange(base, { type: 'KOL', pids: [3], from: D1, to: D1, note: 'ΣΤΕΠ' }).cancels).toHaveLength(0);
  });
  it('στους Παραμένοντες του Excel: η υπηρεσία με κεφαλαία', () => {
    const s = kol(fakeState(20), 3, D1, D1);
    const n = outsAndStay(s, D1).stay.find(x => x.p.id === 3)!.note;
    expect(n).toContain('ΚΩΛΥΟΜΕΝΟΣ: ΥΠΗΡΕΣΙΑ ΣΤΕΠ');
  });
});

describe('κωλυόμενος: ΗΚΑΙ και Δύναμη', () => {
  it('στη στήλη που διάλεξες μόνο με αφαίρεση', () => {
    const base = fakeState(30); const h0 = hkaiCounts(base, D1);
    const a = hkaiCounts(kol(base, 3, D1, D2, { hkCol: 'yp' }), D1);
    expect(a.cols.yp.map(p => p.id)).toContain(3); expect(a.kol).toBe(h0.kol + 1);
    const b = hkaiCounts(kol(base, 3, D1, D2, { hkCol: 'mag' }), D1);
    expect(b.cols.mag.map(p => p.id)).toContain(3); expect(b.cols.yp.map(p => p.id)).not.toContain(3);
    const c = hkaiCounts(kol(base, 3, D1, D2, { minus: false }), D1);
    expect(c.kol).toBe(h0.kol); expect(c.avail).toBe(h0.avail);
    expect(c.rank).toEqual(h0.rank); expect(c.cols).toEqual(h0.cols);
    expect(hkaiCounts(kol(base, 3, D1, D2), D3).kol).toBe(hkaiCounts(base, D3).kol);
  });
  it('άπαξ ανά άτομο: απουσία νικά, ο κωλυόμενος νικά την υπηρεσία και το ΕΥ', () => {
    const base = { ...fakeState(30), guards: { [D1]: { th1: 3, th2: 4 } } };
    let s = kol({ ...base, statuses: [st(3, 'EY', D1, D1)] }, 3, D1, D1, { hkCol: 'tim' });
    const h = hkaiCounts(s, D1);
    expect(h.cols.tim.map(p => p.id)).toEqual([3]); expect(h.cols.ey).toHaveLength(0); expect(h.cols.yp.map(p => p.id)).toEqual([4]);
    s = kol({ ...base, statuses: [st(3, 'LEAVE', D1, D1, { kind: 'Κανονική' })] }, 3, D1, D1);
    expect(hkaiCounts(s, D1).cols.ka.map(p => p.id)).toEqual([3]); expect(hkaiCounts(s, D1).cols.yp.map(p => p.id)).not.toContain(3);
    expect(kolView(s, D1).cols.yp.map(p => p.id)).not.toContain(3);
  });
  it('Δύναμη = ΗΚΑΙ: ίδιοι αριθμοί και ονόματα ανά στήλη, διαθέσιμοι = παρόντες − κωλυόμενοι', () => {
    let s: AppState = { ...fakeState(40), guards: { [D1]: { th1: 5, th2: 6, mg1: 7 } } };
    s = { ...s, statuses: [st(8, 'EY', D1, D2), st(9, 'PUN', D1, D2, { kind: 'Κράτηση' }), st(10, 'LEAVE', D1, D2, { kind: 'Κανονική' }), st(11, 'EA', D1, D2)] };
    s = kol(s, 12, D1, D2); s = kol(s, 13, D1, D1, { hkCol: 'sid' }); s = kol(s, 14, D1, D2, { minus: false, note: 'Φρουρά ΣΤΕΠ' });
    const h = hkaiCounts(s, D1), v = kolView(s, D1, hkMin(s.rules)), c = strengthOf(s, D1, hkMin(s.rules));
    for (const [k] of KOL_COLS) expect(v.cols[k].map(p => p.id).sort(), k).toEqual(h.cols[k].map(p => p.id).sort());
    expect(v.n).toBe(KOL_COLS.reduce((a, [k]) => a + h.cols[k].length, 0)); expect(v.n).toBe(7);   // 3 υπηρεσίες, ΕΥ, ποινή, 12, 13 (το 14 δεν αφαιρείται, το 10 είναι απών)
    expect(v.minus.map(x => x.p.id).sort((a, b) => a - b)).toEqual([12, 13]); expect(v.keep.map(x => x.p.id)).toEqual([14]);
    expect(c.present - v.n).toBe(c.total - 1 - 7);
    expect(h.cols.yp.map(p => p.id)).toContain(12); expect(h.cols.sid.map(p => p.id)).toEqual([13]);
    expect(c.absent).toBe(1);   // η άδεια του 10: ο κωλυόμενος δεν είναι απών
  });
  it('όποιος αφαιρείται, αφαιρείται μόνο από τους διαθέσιμους· ο άλλος μένει παρών', () => {
    const base = fakeState(30); const n0 = strengthOf(base, D1).present;
    const s = kol(kol(base, 3, D1, D1), 4, D1, D1, { minus: false });
    const c = strengthOf(s, D1), v = kolView(s, D1);
    expect(c.present).toBe(n0); expect(v.n).toBe(1); expect(v.man).toHaveLength(2);
    expect(c.present - v.n).toBe(n0 - 1);
  });
  it('εξοδούχος κωλυόμενος (δεν είναι «Χωρίς έξοδο») μετρά απών, όχι κωλυόμενος της Δύναμης', () => {
    const s = kol({ ...fakeState(20), statuses: [st(3, 'OUT', D1, D1)] }, 3, D1, D1, { noOut: false });
    const at = 18 * 60; const c = strengthOf(s, D1, at), v = kolView(s, D1, at);
    expect(c.away.OUT).toBe(1); expect(v.n).toBe(0); expect(c.present - v.n).toBe(c.total - 1);
  });
});

describe('ΣΤΕΠ: κωλυόμενος αυτόματα, όχι σε στήλη της ΗΚΑΙ (Michael, 29/10)', () => {
  it('STEP_COL null: η ΗΚΑΙ μένει όπως πριν· ο ΣΤΕΠ είναι κωλυόμενος της Δύναμης, όχι απών', () => {
    expect(STEP_COL).toBeNull();
    const base = { ...fakeState(30), guards: { [D1]: { th1: 3, th2: 4 } } }, h0 = hkaiCounts(base, D1);
    const s = { ...base, statuses: [st(3, 'STEP', D1, D2), st(5, 'STEP', D1, D1), st(5, 'EY', D1, D1)] };
    const h = hkaiCounts(s, D1), v = kolView(s, D1);
    expect(h.kol).toBe(h0.kol + 1); expect(h.cols.ey.map(p => p.id)).toEqual([5]); expect(h.cols.yp.map(p => p.id)).toContain(3);   // ο 5 έχει ΕΥ· ο 3 υπηρεσία
    expect(h.apo).toBe(h0.apo); expect(strengthOf(s, D1).absent).toBe(0);
    expect(v.cols).toEqual(hkaiColsOf(h)); expect(v.n).toBe(KOL_COLS.reduce((a, [k]) => a + h.cols[k].length, 0));
    expect(v.minus.map(x => [x.p.id, x.col, x.st.type]).sort()).toEqual([[3, '', 'STEP'], [5, '', 'STEP']]);
    expect(hkaiCounts({ ...fakeState(30), statuses: [st(3, 'STEP', D1, D2)] }, D1).kol).toBe(hkaiCounts(fakeState(30), D1).kol);
  });
  it('δηλωμένος κωλυόμενος με αφαίρεση + ΣΤΕΠ: μία φορά, νικά ο κωλυόμενος· χωρίς αφαίρεση νικά το ΣΤΕΠ (στη Δύναμη)', () => {
    const s = kol({ ...fakeState(30), statuses: [st(3, 'STEP', D1, D1)] }, 3, D1, D1, { hkCol: 'mag' });
    const h = hkaiCounts(s, D1), v = kolView(s, D1);
    expect(h.cols.mag.map(p => p.id)).toEqual([3]);
    expect(v.minus).toHaveLength(1); expect(v.man).toHaveLength(1); expect(v.minus[0]).toMatchObject({ col: 'mag' }); expect(v.minus[0].st.type).toBe('KOL');
    const t = kol({ ...fakeState(30), statuses: [st(3, 'STEP', D1, D1)] }, 3, D1, D1, { minus: false });
    expect(kolView(t, D1).minus.map(x => x.st.type)).toEqual(['STEP']); expect(kolView(t, D1).keep).toHaveLength(0);
  });
  it('ώρες: έξοδος από το ΣΤΕΠ πριν την ΗΚΑΙ → δεν μετρά· ώρα εισαγωγής μετά → δεν μετρά ακόμα', () => {
    const early = { ...fakeState(30), statuses: [st(3, 'STEP', D1, D2, { toTime: '07:00' })] }, late = { ...fakeState(30), statuses: [st(3, 'STEP', D1, D2, { toTime: '10:00' })] };
    expect(kolView(early, D2).minus).toHaveLength(0); expect(kolView(late, D2).minus).toHaveLength(1);
    const adm = { ...fakeState(30), statuses: [st(3, 'STEP', D1, D2, { fromTime: '14:00' })] };
    expect(kolView(adm, D1, 8 * 60).man).toHaveLength(0);
    expect(kolView(adm, D1, 15 * 60).minus.map(x => x.p.id)).toEqual([3]); expect(kolView(adm, D2).minus).toHaveLength(1);
  });
  it('το νοσοκομείο μένει απών, στη στήλη «nos»', () => {
    const s = { ...fakeState(30), statuses: [st(3, 'NOS', D1, D1)] };
    const h = hkaiCounts(s, D1);
    expect(h.cols.nos.map(p => p.id)).toEqual([3]); expect(strengthOf(s, D1).away.NOS).toBe(1); expect(kolView(s, D1).man).toHaveLength(0);
  });
});

describe('κωλυόμενος: ώρες', () => {
  it('ώρα λήξης την τελευταία μέρα: μετρά ως εκείνη την ώρα (ΗΚΑΙ 08:00)', () => {
    const early = kol(fakeState(30), 3, D1, D2, { toTime: '07:00' }), late = kol(fakeState(30), 3, D1, D2, { toTime: '10:00' });
    expect(hkaiCounts(early, D2).cols.yp.map(p => p.id)).not.toContain(3);
    expect(hkaiCounts(late, D2).cols.yp.map(p => p.id)).toContain(3);
    expect(hkaiCounts(early, D1).cols.yp.map(p => p.id)).toContain(3);
    expect(kolView(late, D2, 10 * 60).cols.yp).toHaveLength(0); expect(kolView(late, D2, 9 * 60 + 59).cols.yp).toHaveLength(1);
  });
  it('ώρα έναρξης την πρώτη μέρα: δεν μετρά πριν από αυτήν', () => {
    const s = kol(fakeState(30), 3, D1, D2, { fromTime: '14:00' });
    expect(hkaiCounts(s, D1).cols.yp.map(p => p.id)).not.toContain(3);
    expect(kolView(s, D1, 8 * 60).man).toHaveLength(0);
    expect(kolView(s, D1, 15 * 60).cols.yp.map(p => p.id)).toEqual([3]);
    expect(hkaiCounts(s, D2).cols.yp.map(p => p.id)).toContain(3);
  });
  it('ώρες και ομάδες υπηρεσιών: γυρίζει πριν ξεκινήσει η θέση → μπαίνει· φεύγει πριν τελειώσει η προηγούμενη → όχι', () => {
    const s = kol(fakeState(40), 3, D1, D2, { toTime: '10:00' });
    const th1 = postBy(s, 'th1')!;   // ξεκινά 14:00
    expect(dutyBlock(s.statuses, D2, 3, th1)).toBeNull();
    expect(dutyBlock(s.statuses, D1, 3, th1)).toContain('Κωλυόμενος');
    const t = kol(fakeState(40), 3, D2, D3, { fromTime: '09:00' });
    expect(dutyBlock(t.statuses, D1, 3, postBy(t, 'th4')!)).toContain('Φεύγει Κωλυόμενος');
    expect(dutyBlock(t.statuses, D1, 3, th1)).toBeNull();   // η θέση τελειώνει στις 08:00
  });
  it('ώρες: διαβάζονται και ελέγχονται όπως στις άδειες', () => {
    expect(() => kol(fakeState(5), 2, D1, D1, { fromTime: '14:00', toTime: '12:00' })).toThrow('μετά την έναρξη');
    expect(() => kol(fakeState(5), 2, D1, D1, { fromTime: 'πρωί' })).toThrow('δεν διαβάζεται');
    expect(kol(fakeState(5), 2, D1, D1, { fromTime: '9', toTime: '1400' }).statuses[0]).toMatchObject({ fromTime: '09:00', toTime: '14:00' });
  });
});

describe('κωλυόμενος: χωρίς κωλυόμενους όλα όπως πριν', () => {
  it('ΗΚΑΙ, Δύναμη και κωλυόμενοι ίδια με και χωρίς το άδειο κωλυόμενων', () => {
    let s: AppState = { ...fakeState(40), guards: { [D1]: { th1: 5, mg1: 7 } } };
    s = { ...s, statuses: [st(8, 'EY', D1, D2), st(9, 'PUN', D1, D2, { kind: 'Κράτηση' }), st(10, 'LEAVE', D1, D2, { kind: 'Κανονική' })] };
    const v = kolView(s, D1);
    expect(v.man).toEqual([]); expect(v.n).toBe(hkaiCounts(s, D1).kol);   // 2 υπηρεσίες, ΕΥ, ποινή = 4
    expect(v.n).toBe(4);
  });
});
