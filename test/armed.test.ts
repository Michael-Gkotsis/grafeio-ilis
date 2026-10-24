// Ένοπλες υπηρεσίες ανά νούμερο (Michael, 24/10): ώρες με περιθώριο, «δικό του» και «της θέσης», τώρα, διορθώσεις, Excel και έντυπο
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { armMargin, armedLive, armedRows, armWhen, calDay, hmOf, type ArmRow } from '../src/shared/armed';
import { AUTO_KEY, W_NUM, inOutText, outPeople, outReasons, weaponInfo, weaponMatch, weaponSheets } from '../src/shared/weapons';
import { defaultPick, fieldValue, rowsOf, type MoveRow, type Report } from '../src/shared/reports';
import { emptyState, type AppState } from '../src/shared/domain';
import { Store } from '../src/main/db';
import { weaponsBook } from '../src/main/excel';
import ExcelJS from 'exceljs';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-17', newId: () => 'a' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx);
const D = '2026-10-17', D1 = '2026-10-18';
const win = (r: ArmRow) => armWhen(r);
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Κινήσεις', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const WASM = path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');

// 8 άτομα με όπλα 101..108, φάση ΣΠΕΝ (Οπλοφύλακες 4 νούμερα × 3 βάρδιες, Σκοποί, ΤΑΕ)
const base = (guards: Record<string, number>, day = D): AppState => {
  const s = fakeState(8);
  s.people = s.people.map(p => ({ ...p, weapon: String(100 + p.id) }));
  s.settings = { ...s.settings, phase: 'spen' };
  s.guards = { [day]: guards };
  return s;
};
const post = (s: AppState) => run(s, { t: 'setBlock', phase: 'spen', id: 'op', patch: { armWeapon: 'post' } }).state;

describe('Ένοπλες υπηρεσίες: ώρες από τα νούμερα, με περιθώριο', () => {
  it('βάρδιες: ένα νούμερο ανά βάρδια, 15′ πριν και 15′ μετά, και μετά τα μεσάνυχτα στη μέρα του κύκλου', () => {
    const rows = armedRows(base({ sk3a: 1 }), D);
    expect(rows.map(win)).toEqual(['17:45–20:15', '01:45–04:15', '09:45–12:15']);
    expect(rows.map(r => calDay(r.day, r.out))).toEqual([D, D1, D1]);
    expect(rows.every(r => r.day === D && r.who === 1 && r.owner === 1 && r.mode === 'own')).toBe(true);
    expect(rows.map(r => r.reason)).toEqual(Array(3).fill('ΥΠΗΡΕΣΙΑ ΣΚΟΠΟΣ 3ΗΣ ΣΚΟΠΙΑΣ (Α)'));
    expect(rows.map(r => r.n)).toEqual([0, 1, 2]);
  });
  it('περιθώριο ρυθμιζόμενο· χωρίς το πεδίο στις παλιές ρυθμίσεις 15′ και 15′', () => {
    expect(armMargin(undefined)).toEqual({ before: 15, after: 15 });
    expect(armMargin({ armBefore: 0, armAfter: 30 })).toEqual({ before: 0, after: 30 });
    expect(armMargin({ armBefore: -5, armAfter: 999 })).toEqual({ before: 15, after: 15 });
    const s = { ...base({ sk3a: 1 }), rules: { ...emptyState().rules, armBefore: 5, armAfter: 30 } };
    expect(armedRows(s, D).map(win)).toEqual(['17:55–20:30', '01:55–04:30', '09:55–12:30']);
  });
  it('«όλη μέρα»: όλος ο κύκλος από την αρχή υπηρεσίας ως την ίδια ώρα την επόμενη, και με άλλη αρχή κύκλου', () => {
    const s = base({ tae: 2 });
    const [r] = armedRows(s, D);
    expect(win(r)).toBe('13:45–14:15'); expect(calDay(D, r.out)).toBe(D); expect(calDay(D, r.in)).toBe(D1);
    const s2 = { ...s, settings: { ...s.settings, dutyStart: '16:00' } };
    expect(win(armedRows(s2, D)[0])).toBe('15:45–16:15');
  });
  it('«ίδιες ώρες»: στις ώρες της θέσης, με περιθώριο (ώρες πριν την αρχή του κύκλου είναι της επόμενης μέρας)', () => {
    const s = base({ x1_1: 3, x2_1: 4 });
    const blk = (id: string, hrs: string) => ({ id, kind: 'other' as const, name: 'Πύλη ' + id, armed: true, custom: true, posts: [{ k: id + '_1', label: 'Πύλη ' + id, short: 'Π', hrs }] });
    s.settings = { ...s.settings, blocksSpen: [...s.settings.blocksSpen, blk('x1', '15:00-21:00'), blk('x2', '08:00-14:00')] };
    const rows = armedRows(s, D);
    expect(rows.map(r => [r.who, win(r), calDay(D, r.out)])).toEqual([[3, '14:45–21:15', D], [4, '07:45–14:15', D1]]);
  });
  it('σκέτη υπηρεσία χωρίς θέση (από Excel) σε ένοπλο είδος: όλος ο κύκλος', () => {
    const s = { ...base({}), dutyLog: { [D]: [{ pid: 5, kind: 'tae' as const }, { pid: 6, kind: 'mg' as const }] } };
    const rows = armedRows(s, D);
    expect(rows.map(r => [r.who, r.reason, win(r)])).toEqual([[5, 'ΥΠΗΡΕΣΙΑ ΤΑΕ (ΧΩΡΙΣ ΘΕΣΗ)', '13:45–14:15']]);
  });
});

describe('Ένοπλες υπηρεσίες: δικό του και της θέσης', () => {
  it('δικό του: διαδοχικά νούμερα του ίδιου ατόμου ενώνονται· τα άλλα μένουν χωριστά', () => {
    const rows = armedRows(base({ op1: 1, op2: 1, op3: 2 }), D).filter(r => r.who === 1);
    expect(rows.map(win)).toEqual(['13:45–18:15', '21:45–02:15', '05:45–10:15']);
    expect(rows.map(r => [r.post, r.n, r.last])).toEqual([['op1', 0, 0], ['op1', 1, 1], ['op1', 2, 2]]);
    // ο 3ος νούμερο του 2 (18:00-20:00) δεν ενώνεται με άλλον
    expect(armedRows(base({ op1: 1, op2: 1, op3: 2 }), D).filter(r => r.who === 2).map(win)).toEqual(['17:45–20:15', '01:45–04:15', '09:45–12:15']);
  });
  it('της θέσης: το όπλο του 1ου νούμερου βγαίνει πριν από το 1ο και μπαίνει μετά το τελευταίο, περνά χέρι-χέρι· τα άλλα όπλα ΕΝΤΟΣ', () => {
    const s = post(base({ op1: 1, op2: 2, op3: 3, op4: 4 }));
    const rows = armedRows(s, D);
    expect(rows).toHaveLength(12);
    expect(rows.every(r => r.mode === 'post' && r.owner === 1)).toBe(true);
    expect(rows.slice(0, 5).map(r => [r.who, win(r)])).toEqual([[1, '13:45–16:00'], [2, '16:00–18:00'], [3, '18:00–20:00'], [4, '20:00–22:00'], [1, '22:00–00:00']]);
    expect(rows[0]).toMatchObject({ take: false, give: true, next: 2 }); expect(rows[1]).toMatchObject({ take: true, give: true });
    expect(rows[11]).toMatchObject({ who: 4, take: true, give: false }); expect(hmOf(rows[11].in)).toBe('14:15');
    // συνεχές: κάθε είσοδος = έξοδος του επόμενου
    expect(rows.slice(1).every((r, i) => r.out === rows[i].in)).toBe(true);
    const info = weaponInfo(s, D);
    expect([...info.out.keys()]).toEqual([1]);
    expect(info.out.get(1)).toBe('Οπλοφύλακας 1ος 13:45–14:15');
    expect(inOutText(s.people[1], info)).toBe('ΕΝΤΟΣ');
  });
  it('της θέσης: διαδοχικά νούμερα του ίδιου ατόμου ενώνονται στην αλυσίδα', () => {
    const rows = armedRows(post(base({ op1: 1, op2: 1, op3: 2, op4: 2 })), D);
    expect(rows.slice(0, 3).map(r => [r.who, win(r), r.last])).toEqual([[1, '13:45–18:00', 0], [2, '18:00–22:00', 0], [1, '22:00–02:00', 1]]);
  });
  it('της θέσης: παράλληλες γραμμές (α/β) έχουν η καθεμία το δικό της όπλο, από το 1ο νούμερο της γραμμής της', () => {
    const sk = (g: Record<string, number>) => run(base(g), { t: 'setBlock', phase: 'spen', id: 'sk', patch: { armWeapon: 'post' } }).state;
    // ίδιο άτομο όλη την ώρα σε κάθε γραμμή: δύο γραμμές, δύο ιδιοκτήτες
    const rows = armedRows(sk({ sk3a: 1, sk3b: 2 }), D);
    expect(rows.map(r => r.owner).sort()).toEqual([1, 2]); expect(rows.map(r => win(r))).toEqual(['17:45–12:15', '17:45–12:15']);
    // α: 1 → 3 → 1 → 3 …, β: 2 → 4 → 2 → 4: το όπλο του 1 περνά μόνο στους 3 και 1, του 2 στους 4 και 2
    const s = sk({ sk3a: 1, sk3b: 2, sk4a: 3, sk4b: 4 });
    const r2 = armedRows(s, D);
    expect(r2).toHaveLength(12);
    const line = (owner: number) => r2.filter(r => r.owner === owner).map(r => [r.who, win(r)]);
    expect(line(1)).toEqual([[1, '17:45–20:00'], [3, '20:00–02:00'], [1, '02:00–04:00'], [3, '04:00–10:00'], [1, '10:00–12:00'], [3, '12:00–14:15']]);
    expect(line(2)).toEqual([[2, '17:45–20:00'], [4, '20:00–02:00'], [2, '02:00–04:00'], [4, '04:00–10:00'], [2, '10:00–12:00'], [4, '12:00–14:15']]);
    expect(r2.filter(r => r.owner === 2).every(r => r.take === (r.post !== 'sk3b' || r.n > 0) && r.mode === 'post')).toBe(true);
    // και τα δύο όπλα βγαίνουν: 101 και 102 εκτός, τα 103 και 104 ΕΝΤΟΣ (τα κρατούν χωρίς να είναι δικά τους)
    const i = weaponInfo(s, D, '21:00');
    expect([...i.out.keys()].sort()).toEqual([1, 2]);
    expect(i.arm.holding.get(3)!.owner).toBe(1); expect(i.arm.holding.get(4)!.owner).toBe(2);
    // Excel: κάθε γραμμή με το όπλο του δικού της 1ου νούμερου
    const sh = weaponSheets(s, D).find(x => x.name === 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ')!;
    expect(sh.rows).toHaveLength(12);
    expect(sh.rows.filter(r => r[4] === '101')).toHaveLength(6); expect(sh.rows.filter(r => r[4] === '102')).toHaveLength(6);
    expect(sh.rows.filter(r => r[4] === '102').map(r => r[3])).toEqual(['ΒΗΤΑΣ', 'ΔΕΛΤΑΣ', 'ΒΗΤΑΣ', 'ΔΕΛΤΑΣ', 'ΒΗΤΑΣ', 'ΔΕΛΤΑΣ']);
    // Έντυπο: τα ίδια
    const mv = rowsOf(s, rep({ kind: 'wmove', pick: { from: 'all', mode: 'all' }, sort: 'from' }), D) as MoveRow[];
    expect(mv).toHaveLength(12);
    expect(mv.map(m => fieldValue(s, 'wmove', m, 'weapon', 0, D)).sort()).toEqual([...Array(6).fill('101'), ...Array(6).fill('102')]);
  });
  it('της θέσης: η σειρά των γραμμών ακολουθεί τη σειρά των θέσεων, όχι τη σειρά που μπήκαν στη μέρα', () => {
    const s = run(base({ sk3b: 2, sk3a: 1 }), { t: 'setBlock', phase: 'spen', id: 'sk', patch: { armWeapon: 'post' } }).state;
    expect(armedRows(s, D).find(r => r.post === 'sk3a')!.owner).toBe(1);
    expect(armedRows(s, D).find(r => r.post === 'sk3b')!.owner).toBe(2);
  });
  it('η ρύθμιση «της θέσης» γράφεται μόνο όταν δεν είναι η προεπιλογή', () => {
    const s = post(fakeState(3));
    const op = (st: AppState) => st.settings.blocksSpen.find(b => b.id === 'op')!;
    expect(op(s).armWeapon).toBe('post');
    expect('armWeapon' in op(run(s, { t: 'setBlock', phase: 'spen', id: 'op', patch: { armWeapon: 'own' } }).state)).toBe(false);
  });
});

describe('Ένοπλες υπηρεσίες: κατάσταση τώρα', () => {
  const S = base({ sk3a: 1 });
  const at = (day: string, hm: string, s = S) => weaponInfo(s, day, hm);
  it('πριν, κατά τη διάρκεια, μετά', () => {
    const before = at(D, '17:00');
    expect(before.out.has(1)).toBe(false);
    expect(hmOf(before.arm.next.get(1)!.out)).toBe('17:45'); expect(before.arm.prev.has(1)).toBe(false);
    const during = at(D, '18:30');
    expect(during.out.get(1)).toBe('Σκοπός 3ης σκοπιάς (α) 17:45–20:15');
    expect(during.arm.cur.get(1)!.n).toBe(0);
    expect(at(D, '17:45').out.has(1)).toBe(true);        // ακριβώς στην έξοδο
    expect(at(D, '20:15').out.has(1)).toBe(false);       // ακριβώς στην είσοδο
    const after = at(D, '21:00');
    expect(after.out.has(1)).toBe(false);
    expect(hmOf(after.arm.prev.get(1)!.in)).toBe('20:15'); expect(hmOf(after.arm.next.get(1)!.out)).toBe('01:45');
  });
  it('μετά τα μεσάνυχτα τρέχει ακόμα η μέρα κύκλου που ξεκίνησε χθες', () => {
    const i = at(D1, '02:30');
    expect(i.out.get(1)).toBe('Σκοπός 3ης σκοπιάς (α) 01:45–04:15');
    expect(i.arm.cur.get(1)!.day).toBe(D);
    expect(at(D1, '05:00').out.has(1)).toBe(false);
  });
  it('όλη μέρα: ο κύκλος της χθεσινής και της σημερινής μέρας μετά την αρχή', () => {
    const s = { ...base({ tae: 2 }), guards: { [D]: { tae: 2 }, [D1]: { tae: 3 } } };
    const t = (hm: string) => [...weaponInfo(s, D1, hm).out.keys()];
    expect(t('09:00')).toEqual([2]);
    expect(t('14:00')).toEqual([2, 3]);          // τα περιθώρια πέφτουν το ένα πάνω στο άλλο
    expect(t('14:20')).toEqual([3]);
    expect([...weaponInfo(s, D, '13:50').out.keys()]).toEqual([2]);
  });
  it('της θέσης τώρα: ο ιδιοκτήτης είναι εκτός και φαίνεται ποιος το κρατά', () => {
    const s = post(base({ op1: 1, op2: 2, op3: 3, op4: 4 }));
    const i = at(D, '17:00', s);
    expect([...i.out.keys()]).toEqual([1]);
    expect(i.arm.cur.get(1)!.who).toBe(2);
    expect(i.arm.holding.get(2)!.owner).toBe(1);
    expect(weaponMatch('out', s.people[0], i)).toBe(true); expect(weaponMatch('out', s.people[1], i)).toBe(false);
  });
  it('χωρίς ώρα (άλλη μέρα, Excel): όλα τα νούμερα της μέρας· χωρίς μέρα καθόλου', () => {
    const d = weaponInfo(S, D);
    expect(d.arm.live).toBe(false);
    expect(d.out.get(1)).toBe('Σκοπός 3ης σκοπιάς (α) 17:45–20:15, 01:45–04:15, 09:45–12:15');
    expect(weaponInfo(S).out.size).toBe(0);
    const l = armedLive(S, D, '12:00'); expect(l.rows.length).toBe(3);
  });
});

describe('Ένοπλες υπηρεσίες: διόρθωση με λόγο', () => {
  const S = base({ sk3a: 1 });
  const fix = (s: AppState, c: Partial<Extract<Command, { t: 'fixDutyWeapon' }>>) => run(s, { t: 'fixDutyWeapon', day: D, post: 'sk3a', n: 0, why: 'ΑΡΓΗΣΕ Η ΑΛΛΑΓΗ', ...c });
  it('αλλάζει την ώρα εξόδου και εισόδου, με Ιστορικό· το αυτόματο μένει σε autoOut/autoIn', () => {
    const r = fix(S, { out: D + ' 17:30', in: D + ' 20:40' });
    expect(r.text).toMatch(/Διόρθωση ωρών ένοπλης υπηρεσίας ΥΠΗΡΕΣΙΑ ΣΚΟΠΟΣ 3ΗΣ ΣΚΟΠΙΑΣ \(Α\) 17\/10 \(.+\): έξοδος 17\/10 17:30, είσοδος 17\/10 20:40 · λόγος: ΑΡΓΗΣΕ Η ΑΛΛΑΓΗ/);
    const row = armedRows(r.state, D)[0];
    expect(win(row)).toBe('17:30–20:40'); expect(hmOf(row.autoOut)).toBe('17:45'); expect(row.fix?.why).toBe('ΑΡΓΗΣΕ Η ΑΛΛΑΓΗ');
    expect(armedRows(r.state, D).slice(1).map(win)).toEqual(['01:45–04:15', '09:45–12:15']);
    expect(weaponInfo(r.state, D, '17:35').out.has(1)).toBe(true);
    // μόνο η είσοδος, την άλλη μέρα μετά τα μεσάνυχτα
    expect(win(armedRows(fix(S, { in: D1 + ' 00:10' }).state, D)[0])).toBe('17:45–00:10');
  });
  it('υποχρεωτικός λόγος, είσοδος όχι πριν την έξοδο, σωστές ώρες', () => {
    expect(() => fix(S, { out: D + ' 17:30', why: '  ' })).toThrow(/λόγο/);
    expect(() => fix(S, { out: D + ' 21:00' })).toThrow(/πριν την έξοδο/);
    expect(() => fix(S, { in: D + ' 17:00' })).toThrow(/πριν την έξοδο/);
    expect(() => fix(S, { out: '17/10 17:30' })).toThrow(/ώρα/);
    expect(() => fix(S, {})).toThrow(/Άλλαξε/);
    expect(() => fix(S, { out: D + ' 17:45' })).toThrow(/Άλλαξε/);      // ίδιο με το αυτόματο
    expect(() => fix(S, { n: 7, out: D + ' 17:30' })).toThrow(/νούμερο/);
  });
  it('νέα διόρθωση αντικαθιστά την παλιά· «πίσω στο αυτόματο» τη σβήνει', () => {
    let s = fix(S, { out: D + ' 17:30' }).state;
    s = fix(s, { in: D + ' 20:50', why: 'ΑΛΛΟ' }).state;
    expect(s.dutyFix).toHaveLength(1); expect(win(armedRows(s, D)[0])).toBe('17:45–20:50');
    const r = run(s, { t: 'fixDutyWeapon', day: D, post: 'sk3a', n: 0, why: '', reset: true });
    expect(r.text).toMatch(/πίσω στο αυτόματο/); expect(r.state.dutyFix).toEqual([]);
    expect(win(armedRows(r.state, D)[0])).toBe('17:45–20:15');
    expect(run(r.state, { t: 'fixDutyWeapon', day: D, post: 'sk3a', n: 0, why: '', reset: true }).text).toBe('');
  });
  it('διόρθωση χωρίς αντίστοιχο νούμερο (άλλαξαν οι υπηρεσίες ή τα νούμερα) αγνοείται', () => {
    const s = fix(S, { out: D + ' 17:30' }).state;
    expect(armedRows({ ...s, guards: { [D]: { sk4a: 1 } } }, D).map(r => r.fix)).toEqual([undefined, undefined, undefined]);
    expect(armedRows({ ...s, guards: { [D]: { sk3a: 1 } }, dutyFix: [{ ...s.dutyFix[0], n: 9 }] }, D).map(r => r.fix)).toEqual([undefined, undefined, undefined]);
    // και αν δεν βγαίνει πια λογική (είσοδος πριν την έξοδο), αγνοείται
    expect(armedRows({ ...s, dutyFix: [{ ...s.dutyFix[0], in: D + ' 16:00' }] }, D)[0].fix).toBeUndefined();
  });
  it('αναιρείται: το kv «dutyFix» γράφεται και γυρίζει πίσω', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gifx-'));
    const st = new Store(dir, WASM); await st.open();
    try {
      st.commit(S);
      const r = fix(st.state, { out: D + ' 17:30' });
      const patch = st.commit(r.state);
      expect(st.state.dutyFix).toHaveLength(1);
      st.revert(patch);
      expect(st.state.dutyFix).toEqual([]);
    } finally { st.close(); }
    const st2 = new Store(dir, WASM); await st2.open();
    try { expect(st2.state.dutyFix).toEqual([]); } finally { st2.close(); }
  });
});

describe('Ένοπλες υπηρεσίες: Excel και έντυπο', () => {
  const moves = (s: AppState, d = D) => weaponSheets(s, d).find(x => x.name === 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ')!;
  it('Excel κινήσεων: μία γραμμή ανά νούμερο, με ώρες, λόγο και ΛΗΞ ΥΠΗΡΕΣΙΑΣ', () => {
    const sh = moves(base({ sk3a: 1 }));
    expect(sh.rows).toHaveLength(3);
    expect(sh.rows.map(r => [r[4], r[5], r[6], r[7], r[8], r[9]])).toEqual([
      ['101', 'ΥΠΗΡΕΣΙΑ ΣΚΟΠΟΣ 3ΗΣ ΣΚΟΠΙΑΣ (Α)', '17/10/2026 17:45', 'ΛΗΞ ΥΠΗΡΕΣΙΑΣ', '17/10/2026 20:15', 'ΑΥΤΟΜΑΤΑ'],
      ['101', 'ΥΠΗΡΕΣΙΑ ΣΚΟΠΟΣ 3ΗΣ ΣΚΟΠΙΑΣ (Α)', '18/10/2026 01:45', 'ΛΗΞ ΥΠΗΡΕΣΙΑΣ', '18/10/2026 04:15', 'ΑΥΤΟΜΑΤΑ'],
      ['101', 'ΥΠΗΡΕΣΙΑ ΣΚΟΠΟΣ 3ΗΣ ΣΚΟΠΙΑΣ (Α)', '18/10/2026 09:45', 'ΛΗΞ ΥΠΗΡΕΣΙΑΣ', '18/10/2026 12:15', 'ΑΥΤΟΜΑΤΑ']]);
  });
  it('Excel: με διόρθωση η γραμμή έχει τις νέες ώρες και τον λόγο στην παρατήρηση· μαζί με τις κανονικές κινήσεις με τη σειρά της ώρας', () => {
    let s = run(base({ sk3a: 1 }), { t: 'fixDutyWeapon', day: D, post: 'sk3a', n: 0, out: D + ' 17:30', why: 'ΠΡΩΤΗ' }).state;
    s = run(s, { t: 'weaponOut', pids: [2], reason: 'ΕΚΠ', day: D, time: '08:00' }).state;
    const sh = moves(s);
    expect(sh.rows.map(r => [r[4], r[6]])).toEqual([['102', '17/10/2026 08:00'], ['101', '17/10/2026 17:30'], ['101', '18/10/2026 01:45'], ['101', '18/10/2026 09:45']]);
    expect(sh.rows[1][9]).toBe('ΑΥΤΟΜΑΤΑ · ΔΙΟΡΘΩΣΗ: ΠΡΩΤΗ');
  });
  it('Excel «της θέσης»: ίδιο όπλο σε όλες τις γραμμές, ΠΑΡΑΛΑΒΗ και ΠΑΡΑΔΟΣΗ με ώρα, κάτοχος ο καθένας', () => {
    const sh = moves(post(base({ op1: 1, op2: 2, op3: 3, op4: 4 })));
    expect(sh.rows).toHaveLength(12);
    expect(new Set(sh.rows.map(r => r[4]))).toEqual(new Set(['101']));
    expect(sh.rows.slice(0, 3).map(r => [r[2], r[6], r[8], r[7]])).toEqual([
      [expect.any(String), 'ΠΑΡΑΛΑΒΗ 13:45', 'ΠΑΡΑΔΟΣΗ 16:00', expect.stringMatching(/^ΠΑΡΑΔΟΣΗ ΣΕ /)],
      [expect.any(String), 'ΠΑΡΑΛΑΒΗ 16:00', 'ΠΑΡΑΔΟΣΗ 18:00', expect.stringMatching(/^ΠΑΡΑΔΟΣΗ ΣΕ /)],
      [expect.any(String), 'ΠΑΡΑΛΑΒΗ 18:00', 'ΠΑΡΑΔΟΣΗ 20:00', expect.stringMatching(/^ΠΑΡΑΔΟΣΗ ΣΕ /)]]);
    const last = sh.rows[11];
    expect([last[6], last[8], last[7]]).toEqual(['ΠΑΡΑΛΑΒΗ 18/10 12:00', 'ΠΑΡΑΔΟΣΗ 18/10 14:15', 'ΛΗΞ ΥΠΗΡΕΣΙΑΣ']);
    expect(sh.rows.map(r => r[3])).toEqual(['ΑΛΦΑΣ', 'ΒΗΤΑΣ', 'ΓΑΜΜΑΣ', 'ΔΕΛΤΑΣ', 'ΑΛΦΑΣ', 'ΒΗΤΑΣ', 'ΓΑΜΜΑΣ', 'ΔΕΛΤΑΣ', 'ΑΛΦΑΣ', 'ΒΗΤΑΣ', 'ΓΑΜΜΑΣ', 'ΔΕΛΤΑΣ']);
  });
  it('κύριο φύλλο: ΕΝΤΟΣ / ΕΚΤΟΣ με ώρες', () => {
    const s = base({ sk3a: 1, tae: 2 });
    const main = weaponSheets(s, D)[0]; const col = main.head.indexOf('ΕΝΤΟΣ / ΕΚΤΟΣ');
    const txt = (w: string) => String(main.rows.find(r => r[W_NUM] === w)![col]);
    expect(txt('101')).toBe('ΕΚΤΟΣ: Σκοπός 3ης σκοπιάς (α) 17:45–20:15, 01:45–04:15, 09:45–12:15');
    expect(txt('102')).toBe('ΕΚΤΟΣ: ΤΑΕ 13:45–14:15');
    expect(txt('103')).toBe('ΕΝΤΟΣ');
  });
  it('αρχείο Excel: το φύλλο κινήσεων και το κύριο φύλλο γράφουν τις ώρες, όλα με κεφαλαία χωρίς τόνους', async () => {
    const s = post(base({ op1: 1, op2: 2, op3: 3, op4: 4, sk3a: 5 }));
    const r = await weaponsBook(s, D);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.data as any);
    const vals = (name: string) => { const out: string[] = []; wb.getWorksheet(name)!.eachRow(row => row.eachCell(c => { if (typeof c.value === 'string') out.push(c.value); })); return out; };
    const mv = vals('ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ');
    expect(mv).toContain('ΠΑΡΑΛΑΒΗ 13:45'); expect(mv).toContain('ΠΑΡΑΔΟΣΗ 18/10 14:15'); expect(mv).toContain('ΥΠΗΡΕΣΙΑ ΣΚΟΠΟΣ 3ΗΣ ΣΚΟΠΙΑΣ (Α)'); expect(mv).toContain('ΛΗΞ ΥΠΗΡΕΣΙΑΣ');
    expect(mv).toContain('17/10/2026 17:45');
    expect(mv.every(v => v === v.toUpperCase() && !/[\u0300-\u036f]/.test(v.normalize('NFD')))).toBe(true);
    const main = vals('ΟΠΛΙΣΜΟΣ');
    expect(main).toContain('ΕΚΤΟΣ: ΣΚΟΠΟΣ 3ΗΣ ΣΚΟΠΙΑΣ (Α) 17:45–20:15, 01:45–04:15, 09:45–12:15');
    expect(main).toContain('ΕΚΤΟΣ: ΟΠΛΟΦΥΛΑΚΑΣ 1ΟΣ 13:45–14:15');
  });
  it('Έντυπο «Κινήσεις όπλων»: τα ίδια νούμερα με το Excel, «της θέσης» με ΠΑΡΑΛΑΒΗ/ΠΑΡΑΔΟΣΗ', () => {
    const s = post(base({ op1: 1, op2: 2, op3: 3, op4: 4 }));
    const rows = rowsOf(s, rep({ kind: 'wmove', pick: { from: 'all', mode: 'all' }, sort: 'from' }), D) as MoveRow[];
    expect(rows).toHaveLength(12);
    expect(rows[0].id).toBe('auto:' + D + '|op1|0');
    expect(fieldValue(s, 'wmove', rows[0], 'mout', 0, D)).toBe('ΠΑΡΑΛΑΒΗ 13:45');
    expect(fieldValue(s, 'wmove', rows[0], 'min', 0, D)).toBe('ΠΑΡΑΔΟΣΗ 16:00');
    expect(fieldValue(s, 'wmove', rows[0], 'weapon', 0, D)).toBe('101');
    expect(fieldValue(s, 'wmove', rows[0], 'mreason', 0, D)).toBe('ΥΠΗΡΕΣΙΑ ΟΠΛΟΦΥΛΑΚΑΣ 1ΟΣ');
    expect(fieldValue(s, 'wmove', rows[0], 'mnote', 0, D)).toBe('ΑΥΤΟΜΑΤΑ');
    const own = rowsOf(base({ sk3a: 1 }), rep({ kind: 'wmove', pick: { from: 'all', mode: 'all' }, sort: 'from' }), D) as MoveRow[];
    expect(own.map(r => [fieldValue(base({ sk3a: 1 }), 'wmove', r, 'mout', 0, D), fieldValue(base({ sk3a: 1 }), 'wmove', r, 'min', 0, D)])).toEqual([
      ['17/10/2026 17:45', '17/10/2026 20:15'], ['18/10/2026 01:45', '18/10/2026 04:15'], ['18/10/2026 09:45', '18/10/2026 12:15']]);
  });
});

describe('Ένοπλες υπηρεσίες: μετρητές και λόγοι', () => {
  it('κεφαλίδα, chip και καρτέλα μετράνε τους ίδιους: κινήσεις και ένοπλες υπηρεσίες μία φορά ο καθένας', () => {
    let s = base({ sk3a: 1, tae: 2 });
    s = run(s, { t: 'weaponOut', pids: [1, 3, 4], reason: 'ΒΟΛΗ', day: D, time: '07:00' }).state;     // ο 1 και με υπηρεσία
    s = { ...s, people: s.people.map(p => (p.id === 6 ? { ...p, active: false } : p)) };
    s = run(s, { t: 'weaponOut', pids: [6], reason: 'ΕΚΠ', day: D, time: '07:00' }).state;          // εκτός δύναμης με όπλο έξω
    const info = weaponInfo(s, D, '18:30');
    const people = outPeople(s.people, info).map(p => p.id);
    expect(people).toEqual([1, 2, 3, 4]);
    expect(s.people.filter(p => weaponMatch('out', p, info)).map(p => p.id)).toEqual(people);
    expect(new Set([...info.moves.keys(), ...info.out.keys()].filter(id => s.people.find(p => p.id === id)!.active))).toEqual(new Set(people));
    // λόγοι: ο 1 μετρά μία φορά, με τον χειροκίνητο λόγο
    expect(outReasons(s.people, info)).toEqual([['ΒΟΛΗ', 3], [AUTO_KEY, 1]]);
  });
  it('πριν ή μετά το νούμερο δεν είναι εκτός και δεν μπαίνει στους λόγους', () => {
    const s = base({ sk3a: 1 });
    expect(outPeople(s.people, weaponInfo(s, D, '12:00'))).toEqual([]);
    expect(outReasons(s.people, weaponInfo(s, D, '12:00'))).toEqual([]);
    expect(outPeople(s.people, weaponInfo(s, D, '19:00')).map(p => p.id)).toEqual([1]);
  });
  it('σε άλλη μέρα (χωρίς ώρα) μετρά όποιος έχει νούμερο τη μέρα, και όλοι οι μετρητές συμφωνούν', () => {
    const s = base({ sk3a: 1, tae: 2 });
    const info = weaponInfo(s, D);
    expect(outPeople(s.people, info).map(p => p.id)).toEqual([1, 2]);
    expect(s.people.filter(p => weaponMatch('out', p, info)).length).toBe(2);
  });
});
