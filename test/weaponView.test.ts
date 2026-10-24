// Οπλισμός: Κινήσεις ανά λόγο, αναζήτηση, ομαδική διόρθωση, ενδείξεις καταστάσεων, «μένει ΕΚΤΟΣ λόγω υπηρεσίας», μετρητής Σήμερα (Michael, 24/10)
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { AUTO_KEY, isAuto, outPeople, weaponInfo } from '../src/shared/weapons';
import { fixIds, inIds, moveFilter, moveKey, moveMatch, moveReasons, openMoveList, outCountOn, personMatch, seatQuery, statusHint, stayOutByDuty } from '../src/shared/weaponView';
import { personMap } from '../src/shared/rules';
import type { AppState, Status } from '../src/shared/domain';
import { Store } from '../src/main/db';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-17', newId: () => 'v' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx);
const D = '2026-10-17', D1 = '2026-10-18';
const WASM = path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');

// 8 άτομα με όπλα 101..108 και θέσεις Ε 1..Ε 8, φάση ΣΠΕΝ
const base = (guards: Record<string, number>): AppState => {
  const s = fakeState(8);
  s.people = s.people.map(p => ({ ...p, weapon: String(100 + p.id), rack: 'Ε', wpos: String(p.id) }));
  s.settings = { ...s.settings, phase: 'spen' };
  s.guards = { [D]: guards };
  return s;
};
const out = (s: AppState, pids: number[], reason: string, time = '07:00', day = D) => run(s, { t: 'weaponOut', pids, reason, day, time }).state;
const list = (s: AppState, d = D, hm?: string) => openMoveList(s, weaponInfo(s, d, hm));

describe('Κινήσεις: εκτός τώρα ανά λόγο', () => {
  it('κινήσεις και ένοπλες υπηρεσίες μία φορά ο καθένας· τα chips αθροίζουν σε όσους μετράει η κεφαλίδα', () => {
    let s = base({ sk3a: 1, tae: 2 });
    s = out(s, [1, 3, 4], 'ΒΟΛΗ'); s = out(s, [5], 'ΕΚΠ');          // ο 1 έχει και ένοπλη υπηρεσία: μετρά μία φορά, με τη ΒΟΛΗ
    const l = list(s, D, '18:30');
    expect(moveReasons(l)).toEqual([['ΒΟΛΗ', 3], ['ΕΚΠ', 1], [AUTO_KEY, 1]]);
    expect(l).toHaveLength(5);
    expect(l.filter(isAuto).map(m => m.pid)).toEqual([2]);
    expect(outPeople(s.people, weaponInfo(s, D, '18:30'))).toHaveLength(l.length);
    expect(outCountOn(s, D, '18:30')).toBe(5);
  });
  it('η «υπηρεσία (αυτόματα)» είναι ξεχωριστό chip από τον χειροκίνητο λόγο ΥΠΗΡΕΣΙΑ, και πάντα τελευταίο', () => {
    let s = base({ tae: 2 });
    s = out(s, [3], 'ΥΠΗΡΕΣΙΑ'); s = out(s, [4, 5], 'ΑΣΚΗΣΗ');
    const r = moveReasons(list(s, D, '18:30'));
    expect(r).toEqual([['ΑΣΚΗΣΗ', 2], ['ΥΠΗΡΕΣΙΑ', 1], [AUTO_KEY, 1]]);
    expect(moveKey(list(s, D, '18:30').find(isAuto)!)).toBe(AUTO_KEY);
  });
  it('άλλη μέρα (χωρίς ώρα): όλα τα νούμερα της μέρας· πριν το νούμερο τώρα τίποτα', () => {
    const s = base({ sk3a: 1 });
    expect(list(s, D1)).toHaveLength(0);                         // η μέρα D1 δεν έχει υπηρεσίες
    expect(list(s, D)).toHaveLength(3);                          // τα 3 νούμερα του σκοπού
    expect(list(s, D, '12:00')).toHaveLength(0);                 // τώρα δεν τρέχει κανένα
  });
  it('εκτός δύναμης με ανοιχτή κίνηση μένει στη λίστα (για να μπει το όπλο)· η ένοπλη υπηρεσία του όχι', () => {
    let s = base({ tae: 2 });
    s = out(s, [3], 'ΕΚΠ');
    s = { ...s, people: s.people.map(p => (p.id === 3 || p.id === 2 ? { ...p, active: false } : p)) };
    const l = list(s, D, '18:30');
    expect(l.map(m => [m.pid, isAuto(m)])).toEqual([[3, false]]);
  });
  it('όπλο της θέσης: μία γραμμή ανά ιδιοκτήτη· ο κάτοχος αλλάζει', () => {
    const s0 = base({ op1: 1, op2: 2, op3: 3, op4: 4 });
    const s = run(s0, { t: 'setBlock', phase: 'spen', id: 'op', patch: { armWeapon: 'post' } }).state;
    const l = list(s, D, '17:00');
    expect(l).toHaveLength(1);
    expect(l[0].pid).toBe(2); expect(isAuto(l[0]) && l[0].row.owner).toBe(1); expect(l[0].weapon).toBe('101');
  });
  it('chip ΒΟΛΗ + αναζήτηση: οι γραμμές που φαίνονται· είσοδος όλων μόνο για τις χειροκίνητες ανοιχτές', () => {
    let s = base({ tae: 2 });
    s = out(s, [3, 4, 5], 'ΒΟΛΗ'); s = out(s, [6], 'ΕΚΠ');
    const pm = personMap(s.people); const l = list(s, D, '18:30');
    expect(inIds(moveFilter(l, pm, 'ΒΟΛΗ', '')).length).toBe(3);
    expect(moveFilter(l, pm, 'ΒΟΛΗ', 'ΔΕΛΤΑΣ').map(m => m.pid)).toEqual([4]);
    expect(inIds(moveFilter(l, pm, AUTO_KEY, ''))).toEqual([]);          // οι αυτόματες δεν μπαίνουν με το χέρι
    expect(fixIds(l)).toHaveLength(4);
    expect(moveFilter(l, pm, '', '')).toHaveLength(5);
  });
});

describe('Κινήσεις: αναζήτηση', () => {
  const s = out(base({ tae: 2 }), [3, 4], 'ΕΚΠ');
  const pm = personMap(s.people); const l = list(s, D, '18:30');
  const hit = (q: string) => l.filter(m => moveMatch(m, pm, q)).map(m => m.pid);
  it('όνομα (χωρίς τόνους, λατινικά που μοιάζουν), αριθμός όπλου, ΑΣΜ', () => {
    expect(hit('υποθετιδης')).toEqual([3]);
    expect(hit('YΠΟΘΕΤΙΔΗΣ')).toEqual([3]);
    expect(hit('104')).toEqual([4]);
    expect(hit('900002')).toEqual([3]);
    expect(hit('')).toHaveLength(3);
  });
  it('θέση: «Ε 4» ή «Ε4» (οπλοβαστός + θέση), όχι άλλη θέση· σκέτο «Ε» όλον τον οπλοβαστό', () => {
    expect(seatQuery('Ε 4')).toBe(true); expect(seatQuery('E4')).toBe(true); expect(seatQuery('104')).toBe(false); expect(seatQuery('ΔΟΚΙΜΙΟΣ')).toBe(false);
    expect(hit('Ε 4')).toEqual([4]); expect(hit('E4')).toEqual([4]); expect(hit('ε4')).toEqual([4]);
    expect(hit('Ε 44')).toEqual([]);
  });
  it('όπλο της θέσης: ταιριάζει και ο ιδιοκτήτης και ο κάτοχος', () => {
    const p0 = run(base({ op1: 1, op2: 2, op3: 3, op4: 4 }), { t: 'setBlock', phase: 'spen', id: 'op', patch: { armWeapon: 'post' } }).state;
    const m = list(p0, D, '17:00')[0]; const pp = personMap(p0.people);
    expect(m.pid).toBe(2);
    expect(moveMatch(m, pp, 'ΔΟΚΙΜΙΟΣ')).toBe(true);            // ο ιδιοκτήτης (1)
    expect(moveMatch(m, pp, 'ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ')).toBe(true);     // ο κάτοχος (2)
    expect(moveMatch(m, pp, 'Ε 1')).toBe(true);
    expect(moveMatch(m, pp, '101')).toBe(true);
    expect(moveMatch(m, pp, 'ΥΠΟΘΕΤΙΔΗΣ')).toBe(false);
  });
  it('personMatch: ίδια λογική με την καρτέλα Όπλα', () => {
    const p = s.people[2];
    expect(personMatch(p, 'υποθ γαμ')).toBe(true); expect(personMatch(p, 'ΧΧΧ')).toBe(false);
  });
});

describe('Ομαδική διόρθωση λόγου/ώρας (μία εντολή, μία αναίρεση)', () => {
  const S = out(out(base({}), [1, 2, 3], 'ΕΚΠ', '07:00'), [4], 'ΒΟΛΗ', '07:30');
  const ids = (s: AppState, pids: number[]) => s.weaponLog!.filter(m => pids.includes(m.pid)).map(m => m.id);
  it('αλλάζει τον λόγο σε όλες, με ένα κείμενο στο Ιστορικό με ονόματα', () => {
    const r = run(S, { t: 'editWeaponMoves', ids: ids(S, [1, 2, 3]), patch: { reason: 'βολη' } });
    expect(r.state.weaponLog!.filter(m => m.reason === 'ΒΟΛΗ')).toHaveLength(4);
    expect(r.text).toMatch(/^Διόρθωση κινήσεων όπλων \(λόγος ΒΟΛΗ\): 3 άτομα \(/);
    expect(r.state.weaponLog!.every(m => !m.inDay)).toBe(true);
  });
  it('αλλάζει την ώρα εξόδου· ξεχωριστά ή μαζί με τον λόγο', () => {
    const r = run(S, { t: 'editWeaponMoves', ids: ids(S, [1, 2]), patch: { reason: 'ΑΣΚΗΣΗ', outDay: D1, outTime: '8:15' } });
    expect(r.state.weaponLog!.filter(m => m.reason === 'ΑΣΚΗΣΗ').map(m => [m.outDay, m.outTime])).toEqual([[D1, '08:15'], [D1, '08:15']]);
    expect(r.text).toMatch(/λόγος ΑΣΚΗΣΗ, έξοδος 18\/10 08:15/);
    const t = run(S, { t: 'editWeaponMoves', ids: ids(S, [1, 2]), patch: { outTime: '06:30' } });
    expect(t.state.weaponLog!.find(m => m.pid === 1)!.outTime).toBe('06:30'); expect(t.state.weaponLog!.find(m => m.pid === 1)!.reason).toBe('ΕΚΠ');
  });
  it('ό,τι είναι ήδη σωστό δεν αλλάζει· τίποτα να αλλάξει = κενό κείμενο', () => {
    expect(run(S, { t: 'editWeaponMoves', ids: ids(S, [1, 2]), patch: { reason: 'ΕΚΠ' } }).text).toBe('');
    const r = run(S, { t: 'editWeaponMoves', ids: ids(S, [1, 4]), patch: { reason: 'ΕΚΠ' } });
    expect(r.text).toMatch(/\(λόγος ΕΚΠ\): /);
    expect(r.state.weaponLog!.find(m => m.pid === 4)!.reason).toBe('ΕΚΠ');
  });
  it('όλες ή καμία: κενός λόγος, χωρίς αλλαγή, άγνωστη κίνηση, είσοδος πριν την έξοδο (με το όνομα)', () => {
    expect(() => run(S, { t: 'editWeaponMoves', ids: ids(S, [1]), patch: { reason: '  ' } })).toThrow(/κενός/);
    expect(() => run(S, { t: 'editWeaponMoves', ids: ids(S, [1]), patch: {} })).toThrow(/Άλλαξε/);
    expect(() => run(S, { t: 'editWeaponMoves', ids: [], patch: { reason: 'Χ' } })).toThrow(/Διάλεξε/);
    expect(() => run(S, { t: 'editWeaponMoves', ids: ['nope'], patch: { reason: 'Χ' } })).toThrow(/Δεν βρέθηκε/);
    expect(() => run(S, { t: 'editWeaponMoves', ids: ids(S, [1]), patch: { outTime: '25:99' } })).toThrow(/ώρα/);
    const closed = run(S, { t: 'weaponIn', ids: ids(S, [2]), day: D, time: '09:00' }).state;
    expect(() => run(closed, { t: 'editWeaponMoves', ids: ids(closed, [1, 2]), patch: { outTime: '10:00' } })).toThrow(/ΒΗΤΑΣ.*πριν την έξοδο|πριν την έξοδο/);
    expect(closed.weaponLog!.find(m => m.pid === 1)!.outTime).toBe('07:00');   // η πρώτη δεν άλλαξε (το state είναι αμετάβλητο)
  });
  it('μία αναίρεση τα φέρνει όλα πίσω', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'giwv-'));
    const st = new Store(dir, WASM); await st.open();
    try {
      st.commit(S);
      const r = run(st.state, { t: 'editWeaponMoves', ids: ids(S, [1, 2, 3]), patch: { reason: 'ΚΑΘΑΡΙΣΜΟΣ' } });
      const patch = st.commit(r.state);
      expect(st.state.weaponLog!.filter(m => m.reason === 'ΚΑΘΑΡΙΣΜΟΣ')).toHaveLength(3);
      st.revert(patch);
      expect(st.state.weaponLog!.filter(m => m.reason === 'ΚΑΘΑΡΙΣΜΟΣ')).toHaveLength(0);
      expect(st.state.weaponLog!.filter(m => m.reason === 'ΕΚΠ')).toHaveLength(3);
    } finally { st.close(); }
  });
});

describe('Ενδείξεις καταστάσεων', () => {
  const st = (pid: number, type: Status['type'], from: string, to: string, extra: Partial<Status> = {}): Status => ({ id: 's' + pid + type, pid, type, from, to, ...extra });
  const L = [st(1, 'LEAVE', D, D1), st(2, 'DN', D, D), st(3, 'NOS', '2026-10-10', '2026-10-30'), st(4, 'PUN', D, D, { kind: 'Κράτηση' }), st(5, 'EA', D, D), st(6, 'LEAVE', '2026-10-01', '2026-10-05'), st(7, 'EY', D, D), st(7, 'LEAVE', D, D)];
  it('άδεια, ΔΝ, νοσοκομείο: κείμενο και συμβουλή· ποινή ή τίποτα: καμία ένδειξη', () => {
    expect(statusHint(L, 1, D)).toEqual({ text: 'Άδεια', tip: 'Κανονική άδεια έως 18/10' });
    expect(statusHint(L, 2, D)!.text).toBe('ΔΝ');
    expect(statusHint(L, 3, D)).toEqual({ text: 'Νοσοκομείο', tip: 'Εισαγωγή σε νοσοκομείο έως 30/10' });
    expect(statusHint(L, 4, D)).toBeNull(); expect(statusHint(L, 8, D)).toBeNull();
    expect(statusHint(L, 5, D)!.text).toBe('ΕΑ');
  });
  it('μόνο της μέρας: την άλλη μέρα άλλη κατάσταση· πολλές μαζί με «+1»', () => {
    expect(statusHint(L, 1, D1)!.text).toBe('Άδεια'); expect(statusHint(L, 1, '2026-10-19')).toBeNull();
    expect(statusHint(L, 6, D)).toBeNull();
    const h = statusHint(L, 7, D)!; expect(h.text).toMatch(/\+1$/); expect(h.tip).toContain(' · ');
  });
});

describe('Μένει ΕΚΤΟΣ λόγω υπηρεσίας', () => {
  const S = base({ sk3a: 1 });
  it('η είσοδος μέσα στο νούμερο (με το περιθώριο): λέει θέση και ώρα', () => {
    const r = stayOutByDuty(S, 1, D, '18:30')!;
    expect(r.text).toBe('Μένει ΕΚΤΟΣ λόγω υπηρεσίας Σκοπός 3ης σκοπιάς (α) ως 20:15');
    expect(stayOutByDuty(S, 1, D, '17:45')).not.toBeNull();       // ακριβώς στην έξοδο
    expect(stayOutByDuty(S, 1, D, '20:15')).toBeNull();           // ακριβώς στην είσοδο
  });
  it('εκτός νούμερου ή άλλος άνθρωπος: τίποτα· μετά τα μεσάνυχτα με μέρα', () => {
    expect(stayOutByDuty(S, 1, D, '12:00')).toBeNull(); expect(stayOutByDuty(S, 2, D, '18:30')).toBeNull();
    expect(stayOutByDuty(S, 1, D1, '02:00')!.text).toBe('Μένει ΕΚΤΟΣ λόγω υπηρεσίας Σκοπός 3ης σκοπιάς (α) ως 04:15');
    const night = { ...S, guards: { [D]: { tae: 2 } } };
    expect(stayOutByDuty(night, 2, D, '23:00')!.text).toBe('Μένει ΕΚΤΟΣ λόγω υπηρεσίας ΤΑΕ ως 18/10 14:15');
    expect(stayOutByDuty(night, 2, D1, '03:00')!.text).toBe('Μένει ΕΚΤΟΣ λόγω υπηρεσίας ΤΑΕ ως 14:15');
  });
  it('όπλο της θέσης: το έχει εκτός ο ιδιοκτήτης, όχι όποιος το κρατά τώρα', () => {
    const P = run(base({ op1: 1, op2: 2, op3: 3, op4: 4 }), { t: 'setBlock', phase: 'spen', id: 'op', patch: { armWeapon: 'post' } }).state;
    expect(stayOutByDuty(P, 1, D, '17:00')!.text).toContain('Οπλοφύλακας 1ος');
    expect(stayOutByDuty(P, 2, D, '17:00')).toBeNull();
  });
});
