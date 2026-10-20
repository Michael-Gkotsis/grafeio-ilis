// Έντυπα, όλη η ροή (Michael 20/10: «θέλω ένα καλό testing»): φίλτρα που συνδυάζονται, παλιά αποθηκευμένα έντυπα,
// κλήρωση (ισομερώς, «πρώτα όσοι βγήκαν λιγότερο», ✕, ίδια κλήρωση με «Αποθήκευση και Βγάλε»), χωρισμός ανά
// θάλαμο/ουλαμό/Σ.Ι. και στην εκτύπωση, και τι λέει ο οδηγός ότι θα γίνει
import { describe, it, expect } from 'vitest';
import { apply, type Ctx } from '../src/shared/commands';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport } from '../src/main/reports';
import {
  blankBuild, candidates, condVal, condsOf, dailyOk, defaultPick, drawRows, groupsOf, keepDraw, outPlan, pickRandom, pickText, recentIds, refillDraw, repFileName, replaceOne, rowsOf, setCond,
  type RepPick, type Report
} from '../src/shared/reports';
import type { AppState, Person } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-19';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'f' + ++seq };
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Αγγαρεία', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const ids = (l: { id: number | string }[]) => l.map(x => x.id).sort((a, b) => +a - +b);
const pk = (x: Partial<RepPick>): RepPick => ({ from: 'all', mode: 'all', ...x });

// 40 στρατιώτες: 1-2 σε άδεια, 3-4 ΕΥ (ιατρικό), 6 ΕΑ (ιατρικό) και πόστο ΚΨΜ, 7 τιμωρημένος, 8 εκτός δύναμης,
// 10-12 με όπλο, 11 με δικαίωμα ΔΝ, και οι υπηρεσίες της μέρας από τον αυτόματο
function world(): AppState {
  let s = fakeState(40);
  s.people = s.people.map(p => ({ ...p, active: p.id !== 8, weapon: [10, 11, 12].includes(p.id) ? 'G3-' + p.id : '', dn: p.id === 11 } as Person));
  s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [1, 2], from: D, to: '2026-10-25' } }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'EY', pids: [3, 4], from: D, to: '2026-10-21' } }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'EA', pids: [6], from: D, to: '2026-10-21' } }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'PUN', pids: [7], from: D, to: '2026-10-22', kind: 'ΦΥΛΑΚΗ' } }, ctx).state;
  s = apply(s, { t: 'autofill', date: D }, ctx).state;
  return s;
}
const S = world();
const busy = new Set<number | string>([...Object.values(S.guards[D] || {}), ...Object.values(S.guards['2026-10-20'] || {})].filter(x => typeof x === 'number'));

describe('Έντυπα: φίλτρα που συνδυάζονται', () => {
  it('ο κόσμος των τεστ είναι όπως τον περιγράφουμε', () => {
    expect(S.statuses.length).toBeGreaterThanOrEqual(6);
    expect(S.people.find(p => p.id === 6)!.post).toBe('ΚΨΜ');
    expect(busy.size).toBeGreaterThan(0);
  });
  it('ένα φίλτρο κάθε φορά', () => {
    const c = (x: Partial<RepPick>) => ids(candidates(S, rep({ pick: pk(x) }), D));
    expect(c({ need: ['med'] })).toEqual([3, 4, 6]);
    expect(c({ need: ['leave'] })).toEqual([1, 2]);
    expect(c({ need: ['pun'] })).toEqual([7]);
    expect(c({ need: ['post'] })).toEqual([6]);
    expect(c({ need: ['weapon'] })).toEqual([10, 11, 12]);
    expect(c({ need: ['dnright'] })).toEqual([11]);
    expect(c({ need: ['duty'] })).toEqual([...busy].filter(id => id !== 8).sort((a, b) => +a - +b));
    expect(c({ not: ['present'] })).toEqual(expect.arrayContaining([1, 2]));
    expect(c({}).includes(8)).toBe(false);                     // εκτός δύναμης ποτέ με «Όλοι σε δύναμη»
    expect(ids(candidates(S, rep({ pick: pk({ from: 'inactive' }) }), D))).toEqual([8]);
  });
  it('συνδυασμοί: με ιατρικό ΚΑΙ χωρίς πόστο, παρόντες ΚΑΙ χωρίς υπηρεσία ΚΑΙ χωρίς ποινή, με όπλο ΚΑΙ χωρίς ΔΝ', () => {
    const c = (x: Partial<RepPick>) => ids(candidates(S, rep({ pick: pk(x) }), D));
    expect(c({ need: ['med'], not: ['post'] })).toEqual([3, 4]);
    expect(c({ need: ['med', 'post'] })).toEqual([6]);
    const free = c({ need: ['present'], not: ['duty', 'pun', 'med'] });
    expect(free.some(id => [1, 2, 3, 4, 6, 7, 8].includes(+id) || busy.has(id))).toBe(false);
    expect(free.length).toBeGreaterThan(10);
    expect(c({ need: ['weapon'], not: ['dnright'] })).toEqual([10, 12]);
    // με θαλάμους και Σ.Ι. μαζί
    const room3 = c({ need: ['present'], rooms: [3] });
    expect(room3.every(id => S.people.find(p => p.id === id)!.room === 3)).toBe(true);
    expect(c({ si: ['Ι3 ΑΟΠΛΟ'], not: ['duty'] }).every(id => S.people.find(p => p.id === id)!.si === 'Ι3 ΑΟΠΛΟ')).toBe(true);
  });
  it('παλιά αποθηκευμένα έντυπα (from: παρόντες/πόστα, noDuty) δίνουν ό,τι και πριν', () => {
    const old = (x: Partial<RepPick>) => ids(candidates(S, rep({ pick: pk(x) }), D));
    expect(old({ from: 'post' })).toEqual([6]);
    expect(old({ from: 'present', noDuty: true })).toEqual(old({ need: ['present'], not: ['duty'] }));
    expect(old({ from: 'pun' })).toEqual([7]);
    expect(condsOf(pk({ from: 'present', noDuty: true }))).toEqual({ need: ['present'], not: ['duty'] });
    // η πρώτη αλλαγή στον οδηγό τα γράφει ως φίλτρα και σβήνει τα παλιά πεδία
    const p2 = setCond(pk({ from: 'present', noDuty: true }), 'post', 'no');
    expect(p2).toMatchObject({ from: 'all', need: ['present'], not: ['duty', 'post'] });
    expect(p2.noDuty).toBeUndefined();
    expect(condVal(p2, 'post')).toBe('no'); expect(condVal(p2, 'present')).toBe('yes'); expect(condVal(p2, 'med')).toBe('any');
    expect(condVal(setCond(p2, 'present', 'any'), 'present')).toBe('any');
    expect(setCond(pk({ from: 'inactive' }), 'weapon', 'yes').from).toBe('inactive');
    // ναι και όχι στο ίδιο: κερδίζει το τελευταίο
    expect(condsOf(setCond(setCond(pk({}), 'med', 'yes'), 'med', 'no'))).toEqual({ need: [], not: ['med'] });
  });
  it('οι τυχαίοι από προεπιλογή: παρόντες χωρίς υπηρεσία σήμερα ή αύριο', () => {
    const c = candidates(S, rep({ pick: defaultPick('random') }), D);
    expect(c.some(p => [1, 2, 8].includes(p.id as number) || busy.has(p.id))).toBe(false);
  });
  it('το κείμενο «ποιοι μπαίνουν» λέει όλα τα φίλτρα', () => {
    const t = pickText(rep({ pick: pk({ mode: 'random', n: 5, need: ['present', 'med'], not: ['post', 'duty'], rooms: [2] }) }), S);
    expect(t).toBe('5 τυχαίοι από τους παρόντες (με ιατρικό, θάλαμος 2, χωρίς πόστο, χωρίς υπηρεσία)');
    expect(pickText(rep({ pick: pk({}) }), S)).toMatch(/^Όλοι οι /);
    expect(pickText(rep({ pick: pk({ from: 'post' }) }), S)).toMatch(/με πόστο/);
  });
  it('Οπλισμός: τα φίλτρα ισχύουν και εκεί· Καταστάσεις/Υπηρεσίες τα αγνοούν (μόνο θάλαμοι, Σ.Ι., λίστα)', () => {
    const w = ids(candidates(S, rep({ kind: 'weapon', pick: pk({ wf: 'with', not: ['dnright'] }) }), D));
    expect(w).toEqual([10, 12]);
    const st = candidates(S, rep({ kind: 'status', pick: pk({ cats: ['med'], need: ['post'] }) }), D);
    expect(st.length).toBe(3);   // και οι τρεις με ιατρικό, όχι μόνο αυτός με πόστο
  });
});

describe('Έντυπα: κλήρωση', () => {
  const pool = candidates(S, rep({ pick: pk({ need: ['present'] }) }), D);
  it('n διαφορετικοί· αν ζητηθούν παραπάνω, όλοι', () => {
    expect(new Set(pickRandom(pool, 7, false, seeded(2)).map(x => x.id)).size).toBe(7);
    expect(pickRandom(pool, 999, false, seeded(2)).length).toBe(pool.length);
    expect(pickRandom([], 5)).toEqual([]);
  });
  it('ισομερώς ανά θάλαμο, και όταν ένας θάλαμος έχει λίγους', () => {
    const few = pool.filter(p => (p as Person).room !== 1 || p.id === 9);   // ο θάλαμος 1 μόνο με έναν
    const e = pickRandom(few, 15, true, seeded(4));
    const per = new Map<number, number>(); e.forEach(x => per.set((x as Person).room!, (per.get((x as Person).room!) || 0) + 1));
    expect(e.length).toBe(15); expect(per.get(1)).toBe(1);
    expect(Math.max(...per.values()) - Math.min(...[...per.entries()].filter(([r]) => r !== 1).map(([, n]) => n))).toBeLessThanOrEqual(1);
  });
  it('«πρώτα όσοι βγήκαν λιγότερο»: όσοι βγήκαν ήδη μπαίνουν μόνο όταν τελειώσουν οι άλλοι', () => {
    const times: Record<string, number> = {}; pool.slice(0, pool.length - 5).forEach(p => { times[p.id] = 2; });
    const fresh = new Set(pool.slice(pool.length - 5).map(p => p.id));
    const p = pickRandom(pool, 5, false, seeded(7), times);
    expect(p.every(x => fresh.has(x.id))).toBe(true);
    // ✕ με «πρώτα όσοι βγήκαν λιγότερο»: ο αντικαταστάτης είναι από όσους βγήκαν λιγότερο από τους υπόλοιπους
    const r = replaceOne(p, 0, pool, seeded(8), times)!;
    expect(r.filter(x => !fresh.has(x.id)).length).toBe(1);
    expect(new Set(r.map(x => x.id)).size).toBe(5);
  });
  it('η κλήρωση που είδες είναι αυτή που βγαίνει (Αποθήκευση και Βγάλε, «Ρώτα κάθε φορά»)', () => {
    const p = pickRandom(pool, 6, false, seeded(11)); const x = replaceOne(p, 2, pool, seeded(12))!;
    expect(keepDraw(pool, x.map(y => y.id))!.map(y => y.id)).toEqual(x.map(y => y.id));
    expect(keepDraw(pool.filter(y => y.id !== x[0].id), x.map(y => y.id))).toBeNull();
  });
  it('τα έντυπα με τυχαίους δεν μπαίνουν στα «Έντυπα ημέρας»', () => {
    expect(dailyOk(rep({ pick: defaultPick('random') }))).toBe(false);
    expect(dailyOk(rep({ day: 'ask' }))).toBe(false);
    expect(dailyOk(rep({}))).toBe(true);
  });
});

describe('Έντυπα: πώς βγαίνουν', () => {
  const rows = rowsOf(S, rep({ pick: pk({ need: ['present'], rooms: [1, 2, 3] }) }), D);
  it('ομάδες ανά θάλαμο, ουλαμό, Σ.Ι.', () => {
    expect(groupsOf(S, 'people', rows, 'room').map(g => g.short)).toEqual(['Θ1', 'Θ2', 'Θ3']);
    expect(groupsOf(S, 'people', rows, 'room').reduce((n, g) => n + g.rows.length, 0)).toBe(rows.length);
    expect(groupsOf(S, 'people', rows, 'none').length).toBe(1);
    expect(groupsOf(S, 'cadre', rows, 'room').length).toBe(1);
    expect(groupsOf(S, 'people', rows, 'si').map(g => g.label)).toContain('Ι1');
  });
  it('τι λέει ο οδηγός ότι θα γίνει: αρχείο, εκτύπωση (και ανά θάλαμο), φύλλο', () => {
    expect(repFileName({ name: 'Αγγαρεία/μαγειρεία' }, D)).toBe('ΑΓΓΑΡΕΙΑ-ΜΑΓΕΙΡΕΙΑ 19-10-2026.xlsx');
    expect(outPlan(S, rep({}), rows, D).text).toBe('Φτιάχνεται το αρχείο «ΑΓΓΑΡΕΙΑ 19-10-2026.xlsx» στον φάκελο των Excel, και ανοίγει.');
    const pr = outPlan(S, rep({ out: 'print', split: 'room' }), rows, D);
    expect(pr.groups.length).toBe(3);
    expect(pr.text).toMatch(/^Ανοίγει η προεπισκόπηση εκτύπωσης με 3 σελίδες, μία για κάθε θάλαμο: Θ1 \(\d+\), Θ2 \(\d+\), Θ3 \(\d+\)\./);
    expect(outPlan(S, rep({ out: 'file', split: 'unit' }), rows, D).text).toMatch(/ένα για κάθε ουλαμό/);
    S.settings.sources = { ...(S.settings.sources || {}), people: { file: 'C:\\ΕΣΣΟ\\ΔΥΝΑΜΟΛΟΓΙΟ.xlsx' } as any };
    expect(outPlan(S, rep({ out: 'sheet', target: { to: 'people', sheet: 'Αγγαρεία σήμερα' } }), rows, D).text).toBe('Γράφεται το φύλλο «ΑΓΓΑΡΕΙΑ ΣΗΜΕΡΑ» μέσα στο ΔΥΝΑΜΟΛΟΓΙΟ.xlsx. Τα άλλα φύλλα του αρχείου δεν αλλάζουν.');
    expect(outPlan(S, rep({ out: 'sheet', split: 'room', target: { to: 'file', file: '/x/ΑΛΛΟ.xlsx', sheet: '' } }), rows, D).text).toMatch(/^Γράφονται 3 φύλλα, ένα για κάθε θάλαμο: .* μέσα στο ΑΛΛΟ\.xlsx/);
  });
  it('η εκτύπωση ανά θάλαμο βγάζει ένα φύλλο ανά θάλαμο, με τους σωστούς ανθρώπους (όπως στο Excel)', async () => {
    const tpl = await buildTemplate({ ...blankBuild(), cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }, { f: 'room', h: 'ΘΑΛ.', w: 'narrow' }] }, 'people');
    const r = rep({ out: 'print', split: 'room', sheet: tpl.sheet, head: tpl.head, cols: tpl.cols, cells: tpl.cells });
    const out = await fillReport(tpl.data, S, r, rows.map(x => x.id), D);
    expect(out.sheets).toEqual(['ΘΑΛΑΜΟΣ 1', 'ΘΑΛΑΜΟΣ 2', 'ΘΑΛΑΜΟΣ 3']);
    const wb = await Workbook.open(out.data);
    for (const [i, room] of [1, 2, 3].entries()) {
      const vals = (await wb.values(out.sheets[i], 60, 4)).flat().map(String);
      for (const p of rows.filter(x => (x as Person).room === room)) expect(vals).toContain(p.last + ' ' + p.first);
      for (const p of rows.filter(x => (x as Person).room !== room)) expect(vals).not.toContain(p.last + ' ' + p.first);
    }
  });
});

describe('Έντυπα: όποιον θέλεις με το όνομα, «ποτέ», «όχι ξανά τόσο σύντομα»', () => {
  const name = (id: number) => S.people.find(p => p.id === id)!;
  it('«Ποτέ σε αυτό το έντυπο»: δεν μπαίνει ούτε στους υποψήφιους ούτε στις Καταστάσεις', () => {
    const c = ids(candidates(S, rep({ pick: pk({ never: [9, 10] }) }), D));
    expect(c).not.toContain(9); expect(c).not.toContain(10); expect(c).toContain(11);
    const st = candidates(S, rep({ kind: 'status', pick: pk({ cats: ['med'], never: [3] }) }), D);
    expect(st.map(x => (x as any).pid).sort()).toEqual([4, 6]);
  });
  it('«Πάντα μέσα»: μπαίνουν ό,τι κι αν λένε τα φίλτρα, πρώτοι στους «πρώτους Ν», όχι αν είναι και στο «Ποτέ»', () => {
    const r = rep({ pick: pk({ need: ['med'], always: [20, 21] }) });
    expect(ids(rowsOf(S, r, D))).toEqual([3, 4, 6, 20, 21]);
    expect(ids(rowsOf(S, rep({ pick: pk({ mode: 'first', n: 2, need: ['med'], always: [20] }), sort: 'pick' }), D))).toContain(20);
    expect(ids(rowsOf(S, rep({ pick: pk({ need: ['med'], always: [20], never: [20] }) }), D))).toEqual([3, 4, 6]);
    expect(ids(rowsOf(S, rep({ kind: 'status', pick: pk({ cats: ['med'], always: [20] }) }), D).map(x => ({ id: (x as any).pid })))).not.toContain(20);
  });
  it('κλήρωση με «πάντα μέσα»: αυτοί και τυχαίοι μέχρι να γίνουν n', () => {
    const pool = candidates(S, rep({ pick: pk({ need: ['present'] }) }), D);
    const a = [name(1), name(2)];   // σε άδεια: εκτός φίλτρων, μπαίνουν γιατί είναι «πάντα μέσα»
    const x = drawRows(a, pool, 6, false, seeded(3));
    expect(x.length).toBe(6); expect(x.slice(0, 2).map(y => y.id)).toEqual([1, 2]);
    expect(new Set(x.map(y => y.id)).size).toBe(6);
    expect(drawRows(a, pool, 1, false, seeded(3)).length).toBe(2);   // οι «πάντα» μπαίνουν όλοι, ακόμα κι αν είναι παραπάνω από n
  });
  it('αλλαγή φίλτρων ή πόσοι: μένουν όσοι περνούν ακόμα, συμπληρώνονται ή κόβονται μέχρι n', () => {
    const pool = candidates(S, rep({ pick: pk({ need: ['present'] }) }), D);
    const first = drawRows([], pool, 6, false, seeded(5));
    const smaller = pool.filter(p => p.id !== first[0].id);   // ο πρώτος βγαίνει από τα φίλτρα (π.χ. «Ποτέ»)
    const re = refillDraw(first, [], smaller, 6, false, seeded(6));
    expect(re.length).toBe(6); expect(re.map(y => y.id)).not.toContain(first[0].id);
    expect(first.slice(1).every(y => re.some(z => z.id === y.id))).toBe(true);
    expect(refillDraw(first, [], pool, 3, false, seeded(6)).map(y => y.id)).toEqual(first.slice(0, 3).map(y => y.id));
    // όσοι μπήκαν με το όνομα κρατιούνται σαν «πάντα»
    const kept = refillDraw([...first, name(1)], [name(1)], pool, 7, false, seeded(7));
    expect(kept.map(y => y.id)).toContain(1); expect(kept.length).toBe(7);
  });
  it('«όχι όσοι βγήκαν τις τελευταίες Ν μέρες»: από το Ιστορικό, μόνο μέρες πριν από τη μέρα του εντύπου', () => {
    const hist = [{ date: '2026-10-18', ids: [1, 2] }, { date: '2026-10-17', ids: [3] }, { date: '2026-10-16', ids: [4] }, { date: D, ids: [5] }, { date: '2026-10-20', ids: [6] }];
    expect([...recentIds(hist, D, 1)].sort()).toEqual([1, 2]);
    expect([...recentIds(hist, D, 2)].sort()).toEqual([1, 2, 3]);
    expect([...recentIds(hist, D, 3)].sort()).toEqual([1, 2, 3, 4]);
    expect(recentIds([], D, 3).size).toBe(0);
  });
  it('η κλήρωση με κάποιον που μπήκε με το όνομα ξαναβρίσκεται (Ρώτα κάθε φορά)', () => {
    const pool = candidates(S, rep({ pick: pk({ need: ['present'] }) }), D);
    expect(keepDraw(pool, [pool[0].id, 1])).toBeNull();
    expect(keepDraw(pool, [pool[0].id, 1], S.people)!.map(y => y.id)).toEqual([pool[0].id, 1]);
  });
  it('το κείμενο λέει και τα νέα', () => {
    expect(pickText(rep({ pick: pk({ mode: 'random', n: 3, gap: 2, always: [1], never: [2, 3] }) }), S)).toBe('3 τυχαίοι από όλους (όχι όσοι βγήκαν τις τελευταίες 2 μέρες, 1 πάντα μέσα, 2 ποτέ)');
  });
});
