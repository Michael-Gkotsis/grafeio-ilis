// Όριο υπηρεσιών (Michael, 24/11): «όριο 19 υπηρεσίες κάποιος και μετά να συμπληρώνει τους υπόλοιπους μέχρι να έρθουν even,
// και προειδοποίηση όταν ξεπερνάει το όριο». Στρατιώτες: Rules.dutyMax/dutyMaxPer και Person.dutyMax· στελέχη: ένα όριο του μήνα
// για θέσεις στρατιωτών (cadreSeatLimit). Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Store } from '../src/main/db';
import { apply, type Command } from '../src/shared/commands';
import { cadreSeatLimit, dutyCount, dutyLimitInfo, dutyLimitOf, dutyStats, fillDay, monthBlock, monthDuties, monthTxt, postsOf, ruleBlock, whyText } from '../src/shared/rules';
import { dutyCfgOf } from '../src/shared/cadreDuty';
import { addDays } from '../src/shared/dates';
import type { AppState, Cadre } from '../src/shared/domain';
import { fakeState } from './fixtures';
import { simulate } from './duty-sim';

const D = '2026-10-12';   // Δευτέρα
const ctx = { today: D, newId: (() => { let i = 0; return () => 'n' + ++i; })() };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
// χωρίς πόστα και Σ.Ι.: όλοι μπαίνουν παντού
const base = (n = 30): AppState => { const s = fakeState(n); s.people = s.people.map(p => ({ ...p, post: null, si: 'Ι1' })); return s; };
const withBase = (s: AppState, b: Record<number, number>): AppState => ({ ...s, baseline: Object.fromEntries(Object.entries(b).map(([id, n]) => [id, { th: n }])) });
const withRules = (s: AppState, r: Partial<AppState['rules']>): AppState => ({ ...s, rules: { ...s.rules, ...r } });
const total = (s: AppState, pid: number) => dutyStats(s).get(pid)?.total || 0;
const ids = (s: AppState) => s.people.map(p => p.id);
// αυτόματη συμπλήρωση μέρα με τη μέρα, όπως ο λοχίας
function fillDays(s: AppState, n: number, from = D): { s: AppState; warn: string[][]; empty: string[][] } {
  const warn: string[][] = [], empty: string[][] = [];
  for (let i = 0; i < n; i++) { const d = addDays(from, i); const r = fillDay(s, d); s = { ...s, guards: r.guards }; warn.push(r.warn); empty.push(r.empty); }
  return { s, warn, empty };
}
const OVER = /πάνω από το όριο υπηρεσιών/;

describe('χωρίς όριο: η αυτόματη συμπλήρωση δεν αλλάζει', () => {
  // όριο που δεν το φτάνει κανείς περνά από όλη τη νέα διαδρομή και πρέπει να δίνει ακριβώς ό,τι και το «χωρίς όριο»
  for (const seed of [1, 2, 3, 4, 5, 11]) {
    it('σπόρος ' + seed + ': 60 μέρες, ίδιες θέσεις, κενά και ειδοποιήσεις', () => {
      const a = simulate({ seed, n: 40, days: 60 });
      const b = simulate({ seed, n: 40, days: 60, rules: { dutyMax: 999 } });
      const c = simulate({ seed, n: 40, days: 60, rules: { dutyMax: 999, dutyMaxPer: 'month' } });
      expect(JSON.stringify(b.s.guards)).toBe(JSON.stringify(a.s.guards));
      expect(JSON.stringify(c.s.guards)).toBe(JSON.stringify(a.s.guards));
      expect(JSON.stringify(b.log)).toBe(JSON.stringify(a.log));
      expect(a.log.some(l => l.warn.some(w => OVER.test(w)))).toBe(false);
    });
  }
  it('και η ρητή απουσία ορίου (dutyMax άδειο) δίνει τα ίδια', () => {
    const a = simulate({ seed: 7, n: 30, days: 30 }); const b = simulate({ seed: 7, n: 30, days: 30, rules: { dutyMax: undefined } });
    expect(JSON.stringify(b.s.guards)).toBe(JSON.stringify(a.s.guards));
  });
});

describe('όριο 19 συνολικά (αυτόματη συμπλήρωση)', () => {
  const P = postsOf(base().settings).length;
  it('όσοι είναι κοντά στο όριο δεν το περνούν, οι υπόλοιποι τους φτάνουν· χωρίς όριο θα το περνούσαν', () => {
    const near = [1, 2, 3, 4, 5, 6]; const b0 = Object.fromEntries(near.map(i => [i, 18]));
    const free = fillDays(withBase(withRules(base(60), { restDays: 1 }), b0), 20).s;
    const lim = fillDays(withBase(withRules(base(60), { restDays: 1, dutyMax: 19 }), b0), 20);
    expect(Math.max(...near.map(i => total(free, i)))).toBeGreaterThan(19);
    for (const i of near) expect(total(lim.s, i)).toBeLessThanOrEqual(19);
    // μπήκαν ως το όριο (1 παραπάνω από 18), και μετά δεν ξαναμπήκαν
    expect(Math.max(...near.map(i => total(lim.s, i)))).toBe(19);
    // οι υπόλοιποι ισοσκελίζονται: μικρή διαφορά μεταξύ τους
    const rest = ids(lim.s).filter(i => !near.includes(i)).map(i => total(lim.s, i));
    expect(Math.max(...rest) - Math.min(...rest)).toBeLessThanOrEqual(2);
    // όσο υπήρχαν άλλοι κάτω από το όριο, καμία ειδοποίηση ορίου και καμία κενή θέση
    expect(lim.warn.flat().some(w => OVER.test(w))).toBe(false);
    expect(lim.empty.flat()).toEqual([]);
  });
  it('όλοι στο όριο: η συμπλήρωση συνεχίζεται με όποιον είναι λιγότερο πάνω από το όριο, με ειδοποίηση, και μένουν ισοσκελισμένοι', () => {
    const all = Object.fromEntries(ids(base(30)).map(i => [i, 19]));
    const r = fillDays(withBase(withRules(base(30), { dutyMax: 19 }), all), 8);
    expect(r.empty.flat()).toEqual([]);
    r.warn.forEach((w, i) => expect(w.some(t => new RegExp('^' + addDays(D, i).slice(8) + '/10: μπήκαν ' + P + ' πάνω από το όριο υπηρεσιών \\(').test(t))).toBe(true));
    const tt = ids(r.s).map(i => total(r.s, i));
    expect(Math.min(...tt)).toBeGreaterThanOrEqual(19);
    expect(Math.max(...tt) - Math.min(...tt)).toBeLessThanOrEqual(2);
  });
  it('ποιοι μπαίνουν πάνω από το όριο: οι λιγότερο πάνω από αυτό· το όνομα φαίνεται με «20/19»', () => {
    // λίγοι κάτω από το όριο ώστε να μένουν 2 θέσεις· 5 στο όριο ή πάνω από αυτό
    let s = withRules(base(P + 3), { restDays: 0, numRest: 0, noConsecHol: false, dutyMax: 19 });
    s = withBase(s, { 1: 19, 2: 19, 3: 20, 4: 21, 5: 25 });
    const r = fillDay(s, D);
    const used = new Set(Object.values(r.guards[D]));
    expect(used.has(1) && used.has(2)).toBe(true);
    expect([3, 4, 5].some(i => used.has(i))).toBe(false);
    expect(r.empty).toEqual([]);
    const w = r.warn.filter(t => OVER.test(t));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/^12\/10: μπήκαν 2 πάνω από το όριο υπηρεσιών \(.+ 20\/19, .+ 20\/19\)$/);
  });
  it('«Γιατί αυτός;»: ποιος παραλείφθηκε για το όριο και ποιος μπήκε πάνω από αυτό', () => {
    const P2 = postsOf(base().settings).length;
    let s = withRules(base(P2 + 3), { restDays: 0, numRest: 0, noConsecHol: false, dutyMax: 19 });
    s = withBase(s, { 1: 19, 2: 19, 3: 20, 4: 21, 5: 25 });
    s = { ...s, guards: fillDay(s, D).guards };
    const over = Object.entries(s.guards[D]).find(([, pid]) => pid === 1 || pid === 2)!;
    expect(whyText(s, D, over[0])).toMatch(/⚠ πάνω από το όριο υπηρεσιών: 20ή, όριο 19/);
    const other = Object.entries(s.guards[D]).find(([, pid]) => pid > 5)!;
    expect(whyText(s, D, other[0])).toMatch(/\d+ή υπηρεσία, όριο 19/);
    expect(whyText(s, D, other[0])).toMatch(/3 παραλείφθηκαν επειδή έφτασαν το όριο υπηρεσιών/);
  });
  it('«Συμπλήρωση μόνο από θαλάμους»: ισχύει το όριο και μένουν μόνο οι θάλαμοι', () => {
    const s0 = base(120); const cap = s0.people.filter(p => p.room === 1).slice(0, 2).map(p => p.id);
    const s = withBase(withRules(s0, { dutyMax: 19 }), Object.fromEntries(cap.map(i => [i, 19])));
    const rm = new Set(s.people.filter(p => p.room === 1 || p.room === 2).map(p => p.id));
    const inRooms = [...rm].filter(i => !cap.includes(i)).length;
    expect(inRooms).toBeGreaterThan(P);   // υπάρχουν αρκετοί κάτω από το όριο στους θαλάμους
    const r = fillDay(s, D, [1, 2]);
    const used = Object.values(r.guards[D]);
    for (const i of cap) expect(used).not.toContain(i);
    for (const i of used) expect(rm.has(i)).toBe(true);
    expect(r.warn.some(t => OVER.test(t))).toBe(false);
    // λίγοι στους θαλάμους και όλοι στο όριο: μπαίνουν πάνω από το όριο, πάλι μόνο από τους θαλάμους
    const s2 = withBase(withRules(base(40), { dutyMax: 19 }), Object.fromEntries(ids(base(40)).map(i => [i, 19])));
    const r2 = fillDay(s2, D, [1]); const pm = new Map(s2.people.map(p => [p.id, p]));
    for (const i of Object.values(r2.guards[D])) expect(pm.get(i)!.room).toBe(1);
    expect(r2.warn.some(t => OVER.test(t))).toBe(true);
  });
  it('ΠΣΚ και «αυτόματη συμπλήρωση»: η ειδοποίηση φτάνει στο κείμενο της ενέργειας', () => {
    const s = withBase(withRules(base(30), { dutyMax: 19 }), Object.fromEntries(ids(base(30)).map(i => [i, 19])));
    const a = apply(s, { t: 'autofill', date: D }, ctx);
    expect(a.text).toMatch(/Χωρίς άλλη επιλογή: .*πάνω από το όριο υπηρεσιών/);
    const r = apply(s, { t: 'autofillRange', dates: ['2026-10-16', '2026-10-17', '2026-10-18'] }, ctx);
    expect((r.text.match(/πάνω από το όριο υπηρεσιών/g) || []).length).toBe(3);
  });
});

describe('περίοδος «τον μήνα»', () => {
  it('μετρά τον μήνα της μέρας και ξεκινά από την αρχή τον επόμενο μήνα', () => {
    let s = withRules(base(30), { dutyMax: 3, dutyMaxPer: 'month', restDays: 0 });
    for (const [d, k] of [['2026-10-02', 'th1'], ['2026-10-06', 'th1'], ['2026-10-09', 'th1']] as const) s = run(s, { t: 'assign', date: d, k, pid: 7 });
    expect(dutyCount(s, '2026-10-20', 7, 'month')).toBe(3);
    expect(ruleBlock(s, '2026-10-20', 7, undefined, 'th1')).toMatch(/Πάνω από το όριο: θα είναι η 4ή υπηρεσία του \(όριο 3\)/);
    expect(ruleBlock(s, '2026-11-03', 7, undefined, 'th1')).toBeNull();
    // προηγούμενες υπηρεσίες (baseline) δεν μετρούν στον μήνα, μετρούν στο «συνολικά»
    const b = withBase(withRules(base(30), { dutyMax: 3, dutyMaxPer: 'month' }), { 7: 50 });
    expect(ruleBlock(b, D, 7, undefined, 'th1')).toBeNull();
    expect(ruleBlock(withRules(b, { dutyMaxPer: undefined }), D, 7, undefined, 'th1')).toMatch(/Πάνω από το όριο/);
  });
  it('η αυτόματη συμπλήρωση δεν παίρνει όποιον έφτασε το όριο του μήνα, και τον ξαναπαίρνει τον επόμενο', () => {
    let s = withRules(base(30), { dutyMax: 2, dutyMaxPer: 'month', restDays: 0, numRest: 0, noConsecHol: false });
    s = run(run(s, { t: 'assign', date: '2026-10-02', k: 'th1', pid: 9 }), { t: 'assign', date: '2026-10-05', k: 'th1', pid: 9 });
    s = { ...s, guards: fillDay(s, '2026-10-20').guards };
    expect(Object.values(s.guards['2026-10-20'])).not.toContain(9);
    // Νοέμβριος: άδειος μετρητής, ο 9 είναι ο πρώτος στη σειρά (λιγότερες υπηρεσίες από όσους έκαναν Οκτώβριο)
    const r = fillDay(s, '2026-11-03');
    expect(ruleBlock(s, '2026-11-03', 9, undefined, 'th1')).toBeNull();
    expect(r.warn.some(t => OVER.test(t))).toBe(false);
  });
});

describe('δικό του όριο (Person.dutyMax)', () => {
  it('υπερισχύει του ορίου των κανόνων, χαμηλότερο και υψηλότερο', () => {
    let s = withRules(base(30), { dutyMax: 5 });
    s = withBase(s, { 3: 2, 4: 6, 5: 5 });
    s = { ...s, people: s.people.map(p => (p.id === 3 ? { ...p, dutyMax: 2 } : p.id === 4 ? { ...p, dutyMax: 9 } : p)) };
    expect(ruleBlock(s, D, 3, undefined, 'th1')).toMatch(/η 3ή υπηρεσία του \(όριο 2\)/);   // χαμηλότερο: 2 από 2
    expect(ruleBlock(s, D, 4, undefined, 'th1')).toBeNull();                                    // υψηλότερο: 6 από 9, ενώ οι κανόνες θα τον έκοβαν
    expect(ruleBlock(s, D, 5, undefined, 'th1')).toMatch(/\(όριο 5\)/);                         // χωρίς δικό του: οι κανόνες
    expect(dutyLimitOf(s.rules, s.people[2])).toEqual({ max: 2, per: 'all', own: true });
    // δικό του όριο και χωρίς όριο στους κανόνες
    const t = { ...s, rules: { ...s.rules } } as AppState; delete (t.rules as any).dutyMax;
    expect(ruleBlock(t, D, 3, undefined, 'th1')).toMatch(/όριο 2/);
    expect(ruleBlock(t, D, 5, undefined, 'th1')).toBeNull();
    // αυτόματη συμπλήρωση: ο 3 (στο δικό του όριο) δεν μπαίνει, ο 4 (κάτω από το δικό του) μπορεί
    const f = fillDay(t, D); expect(Object.values(f.guards[D])).not.toContain(3);
  });
  it('η φόρμα: ακέραιος από 1, αλλιώς χωρίς δικό του όριο· ΝΕΟΣ στρατιώτης το κρατά', () => {
    const s = base(5); const p = s.people[1];
    expect(run(s, { t: 'updatePerson', person: { ...p, dutyMax: 7.9 } }).people[1].dutyMax).toBe(7);
    expect('dutyMax' in run(s, { t: 'updatePerson', person: { ...p, dutyMax: 0 } }).people[1]).toBe(false);
    expect('dutyMax' in run(s, { t: 'updatePerson', person: { ...p, dutyMax: undefined } }).people[1]).toBe(false);
    const n = run(s, { t: 'addPerson', person: { rank: 'ΣΤΡ', spec: '', last: 'ΝΕΟΣΔΟΚΙΜΙΟΣ', first: 'ΑΛΦΑΣ', father: '', asm: '', phone: '', room: null, si: 'Ι1', post: null, role: null, essos: '', attached: false, notes: '', dutyMax: 12 } });
    expect(n.people[n.people.length - 1].dutyMax).toBe(12);
  });
});

describe('με το χέρι: επιβεβαίωση, ποτέ μπλοκάρισμα', () => {
  it('πάνω από το όριο ζητά αιτία· με αιτία γράφεται', () => {
    const s = withBase(withRules(base(30), { dutyMax: 19 }), { 5: 19 });
    expect(() => run(s, { t: 'assign', date: D, k: 'th1', pid: 5 })).toThrow(/Πάνω από το όριο: θα είναι η 20ή υπηρεσία του \(όριο 19\)/);
    const r = apply(s, { t: 'assign', date: D, k: 'th1', pid: 5, force: 'λείπουν άτομα' }, ctx);
    expect(r.state.guards[D].th1).toBe(5);
    expect(r.text).toMatch(/παρά τον κανόνα: Πάνω από το όριο: θα είναι η 20ή υπηρεσία του \(όριο 19\)\. Αιτία: λείπουν άτομα/);
    // κάτω από το όριο: κανονικά
    expect(run(withBase(withRules(base(30), { dutyMax: 19 }), { 5: 18 }), { t: 'assign', date: D, k: 'th1', pid: 5 }).guards[D].th1).toBe(5);
  });
});

describe('Κανόνες υπηρεσιών: αποθήκευση και αναίρεση', () => {
  it('setRules κρατά το όριο και την περίοδο· η προεπιλογή «συνολικά» δεν αποθηκεύεται· λάθος τιμές απορρίπτονται', () => {
    const s = base(5);
    const a = run(s, { t: 'setRules', rules: { ...s.rules, dutyMax: 19.8, dutyMaxPer: 'month' }, text: 'x' });
    expect(a.rules.dutyMax).toBe(19); expect(a.rules.dutyMaxPer).toBe('month');
    const b = run(s, { t: 'setRules', rules: { ...s.rules, dutyMax: 19, dutyMaxPer: 'all' }, text: 'x' });
    expect(b.rules.dutyMax).toBe(19); expect('dutyMaxPer' in b.rules).toBe(false);
    const c = run(a, { t: 'setRules', rules: { ...a.rules, dutyMax: undefined }, text: 'x' });
    expect('dutyMax' in c.rules).toBe(false); expect('dutyMaxPer' in c.rules).toBe(false);
    expect(() => run(s, { t: 'setRules', rules: { ...s.rules, dutyMax: 0 }, text: 'x' })).toThrow(/όριο υπηρεσιών/);
    expect(() => run(s, { t: 'setRules', rules: { ...s.rules, dutyMax: 1000 }, text: 'x' })).toThrow(/όριο υπηρεσιών/);
  });
  it('αναίρεση: το όριο των κανόνων και το δικό του όριο γυρνούν πίσω, και οι παλιές αναθέσεις μένουν αναιρέσιμες', async () => {
    const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gidb-')); const st = new Store(dir, WASM); await st.open();
    const rows = base(5).people.map(({ id, active, ...p }) => p);
    st.commit(apply(st.state, { t: 'importPeople', rows, source: 't', deactivateMissing: false }, ctx).state);
    const asg = st.commit(apply(st.state, { t: 'assign', date: '2026-10-13', k: 'mg1', pid: 2 }, ctx).state);
    const p1 = st.commit(apply(st.state, { t: 'setRules', rules: { ...st.state.rules, dutyMax: 19, dutyMaxPer: 'month' }, text: 'x' }, ctx).state);
    expect(st.state.rules.dutyMax).toBe(19);
    const p2 = st.commit(apply(st.state, { t: 'updatePerson', person: { ...st.state.people[0], dutyMax: 7 } }, ctx).state);
    expect(st.state.people[0].dutyMax).toBe(7);
    st.revert(p2); expect(st.state.people[0].dutyMax).toBeUndefined();
    st.revert(p1); expect(st.state.rules.dutyMax).toBeUndefined(); expect(st.state.rules.dutyMaxPer).toBeUndefined();
    st.revert(asg); expect(st.state.guards['2026-10-13']).toBeUndefined();
    st.close();
  });
});

describe('στελέχη: ένα όριο του μήνα για θέσεις στρατιωτών', () => {
  const cadre = (o: Partial<Cadre> = {}): Cadre => ({ id: 'c1', rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΔΟΚΙΜΙΟΣ', first: 'ΒΗΤΑΣ', active: true, pid: -1, ...o });
  const st = (c: Cadre, extra: Partial<AppState> = {}): AppState => ({ ...base(10), cadreList: [c], ...extra } as AppState);
  it('προτεραιότητα: monthMax > προσωπικό του προγράμματος > βάση κατηγορίας· το έξτρα μόνο εκεί που το δίνει το πρόγραμμα', () => {
    expect(cadreSeatLimit(st(cadre({ monthMax: 2 }), { cadreDutyOf: { c1: { limit: 5 } } }), cadre({ monthMax: 2 }))).toEqual({ base: 2, extra: 0, src: 'monthMax' });
    const c = cadre(); const s = st(c, { cadreDutyOf: { c1: { limit: 5 } } });
    expect(cadreSeatLimit(s, c)).toEqual({ base: 5, extra: 1, src: 'own' });
    expect(cadreSeatLimit(st(c), c)).toEqual({ base: 4, extra: 1, src: 'cat' });                 // υπαξιωματικός: 4+1
    const o = cadre({ hk: 'Ίλαρχοι' }); expect(cadreSeatLimit(st(o), o)).toEqual({ base: 3, extra: 1, src: 'cat' });   // αξιωματικός: 3+1
    // ρυθμισμένα όρια του προγράμματος, όπως τα διαβάζει το πρόγραμμα στελεχών
    const cfg = { ...st(c).settings, cadreDuty: { groups: [], limits: { off: { base: 6, extra: 0 }, nco: { base: 7, extra: 2 } }, rest: 1, carry: true, fairHol: true } };
    const t = { ...st(c), settings: cfg };
    expect(cadreSeatLimit(t, c)).toEqual({ base: 7, extra: 2, src: 'cat' });
    expect(cadreSeatLimit(t, o)).toEqual({ base: 6, extra: 0, src: 'cat' });
    // ίδιες προεπιλογές με το dutyCfgOf (cadreDuty.ts)
    for (const [x, k] of [[c, 'nco'], [o, 'off']] as const) { const l = dutyCfgOf(st(x).settings).limits[k]; expect(cadreSeatLimit(st(x), x)).toMatchObject({ base: l.base, extra: l.extra }); }
    const t0 = { ...st(c), settings: { ...st(c).settings, cadreDuty: { groups: [], limits: { off: { base: -3 as any, extra: 'x' as any }, nco: { base: NaN, extra: 0 } } } as any } };
    for (const [x, k] of [[c, 'nco'], [o, 'off']] as const) { const l = dutyCfgOf(t0.settings).limits[k]; expect(cadreSeatLimit(t0, x)).toMatchObject({ base: l.base, extra: l.extra }); }
  });
  it('οι υπηρεσίες του προγράμματος και οι θέσεις στρατιωτών μετρούν μαζί, και το όριο ισχύει και για στέλεχος χωρίς monthMax', () => {
    const c = cadre();   // υπαξιωματικός χωρίς όριο: βάση 4
    let s = st(c);
    s = { ...s, guards: { '2026-10-02': { th1: -1 }, '2026-10-06': { th1: -1 } }, cadreDuties: [{ id: 'x1', date: '2026-10-20', svc: 'any', cid: 'c1' }] };
    expect(monthDuties(s, '2026-10-28', -1)).toBe(3);
    expect(monthBlock(s, '2026-10-28', -1)).toBeNull();
    s = { ...s, cadreDuties: [...(s.cadreDuties || []), { id: 'x2', date: '2026-10-22', svc: 'any', cid: 'c1' }] };
    expect(monthBlock(s, '2026-10-28', -1)).toBe('Έφτασε το όριο του μήνα: 4 από 4+1 υπηρεσίες');
    expect(ruleBlock(s, '2026-10-28', -1, undefined, 'th1')).toMatch(/4 από 4\+1/);
    expect(monthBlock(s, '2026-11-03', -1)).toBeNull();
    // με monthMax 6 το όριο ανεβαίνει και το μήνυμα μένει όπως ήταν
    const m = { ...s, cadreList: [cadre({ monthMax: 6 })] };
    expect(monthBlock(m, '2026-10-28', -1)).toBeNull();
    expect(monthBlock({ ...m, cadreList: [cadre({ monthMax: 4 })] }, '2026-10-28', -1)).toBe('Έφτασε το όριο του μήνα: 4 από 4 υπηρεσίες');
    // με το χέρι: ζητά επιβεβαίωση
    expect(() => run(s, { t: 'assign', date: '2026-10-28', k: 'th1', pid: -1 })).toThrow(/Έφτασε το όριο του μήνα/);
  });
  it('το ίδιο «N από ΟΡΙΟ» στην καρτέλα και στον έλεγχο, για στρατιώτη και στέλεχος', () => {
    const c = cadre({ monthMax: 4 }); const s = { ...st(c), guards: { '2026-10-02': { th1: -1 } } } as AppState;
    const seat = s.cadreList.map(() => ({ id: -1, cid: 'c1', rank: 'ΛΧΙΑΣ', spec: '', last: 'Δ', first: 'Β', father: '', asm: '', phone: '', room: null, si: '', post: null, role: null, essos: '', attached: false, active: true, notes: '', monthMax: 4 }))[0];
    expect(monthTxt(s, D, seat as any, true)).toBe('1 από 4 τον μήνα');
    expect(dutyLimitInfo(s, D, seat as any)).toMatchObject({ txt: '1 από 4', per: 'month', over: false });
    let r = withBase(withRules(base(10), { dutyMax: 19 }), { 2: 20 });
    expect(dutyLimitInfo(r, D, r.people[1])).toMatchObject({ txt: '20 από 19', per: 'all', over: true, own: false });
    expect(dutyLimitInfo(r, D, r.people[2])).toMatchObject({ txt: '0 από 19', over: false });
    r = withRules(r, { dutyMax: undefined } as any); delete (r.rules as any).dutyMax;
    expect(dutyLimitInfo(r, D, r.people[1])).toBeNull();
  });
});
