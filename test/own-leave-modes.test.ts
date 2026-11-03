// Δικά σου είδη άδειας (Michael, 3/11): όνομα αντί «ΚΑ» και στήλη ΗΚΑΙ που ορίζει πώς μετρά ο άνθρωπος παντού:
//   απών (στήλη απόντων, π.χ. Φ.Πορ.) · κωλυόμενος (στήλη κωλυομένων, π.χ. Κίν.) · παρών («Πουθενά», με τικ για υπηρεσίες και έξοδο).
// Σήμερα, Δύναμη, ΗΚΑΙ, Εξοδούχοι και υπηρεσίες λένε το ίδιο. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { absCode, isAway, leaveEffect, leaveMode, statusLbl, type ListItem, type UserLists } from '../src/shared/ranks';
import { awayText, dutyBlock, guardUnavailable, hkMin, hkaiCounts, kolView, outBlock, postsOf, statusesAt, strengthOf } from '../src/shared/rules';
import { strengthView } from '../src/shared/strengthView';
import { outsAndStay } from '../src/shared/outsStay';
import { statSummary } from '../src/shared/stat';
import { fillHkai, fillOuts } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { mins } from '../src/shared/hours';
import { norm } from '../src/shared/text';
import { TYPES, hkToggle, type AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

const D = '2026-10-12', KIND = 'Υπηρεσιακό', PID = 3, N = 12;
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'm' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));

type Mode = 'away' | 'kol' | 'present';
const ITEMS: Record<string, { mode: Mode; item: Partial<ListItem>; col: string | null }> = {
  away: { mode: 'away', item: { col: 'fp' }, col: 'fp' },
  kol: { mode: 'kol', item: { col: 'kin' }, col: 'kin' },
  present: { mode: 'present', item: { col: '-' }, col: null },
  'present+duty': { mode: 'present', item: { col: '-', duty: true }, col: null },
  'present+out': { mode: 'present', item: { col: '-', out: true }, col: null },
  'present+duty+out': { mode: 'present', item: { col: '-', duty: true, out: true }, col: null }
};
const lists = (item: Partial<ListItem>, code?: string): UserLists => ({ leaveKinds: { add: [{ name: KIND, ...item, ...(code ? { code } : {}) }] } });
// δύο ημέρες άδεια του 3ου ατόμου με το δικό σου είδος· χωρίς withLeave: τα ίδια δεδομένα χωρίς άδεια
const mk = (item: Partial<ListItem>, withLeave = true, code?: string): AppState => {
  let s = fakeState(N); s = { ...s, settings: { ...s.settings, lists: lists(item, code), hkai: hkToggle(s.settings.hkai || {}, 'lv', true) } };
  return withLeave ? run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [PID], from: D, to: '2026-10-14', kind: KIND } }) : s;
};
const rowsOf = (v: ReturnType<typeof strengthView>) => (['present', 'kol', 'away'] as const).flatMap(c => v.cats[c].groups.flatMap(g => g.rows.filter(r => r.p.id === PID).map(r => ({ cat: c, group: g.label, what: r.what }))));
const col = (n: number) => (n > 26 ? String.fromCharCode(64 + Math.floor((n - 1) / 26)) : '') + String.fromCharCode(65 + ((n - 1) % 26));

describe('δικό σου είδος άδειας: πώς μετρά ανά στήλη', () => {
  it('leaveMode: τα βασικά απόντες, το δικό σου από τη στήλη του· isAway το ακολουθεί', () => {
    for (const [name, x] of Object.entries(ITEMS)) {
      const l = lists(x.item), st = { type: 'LEAVE' as const, kind: KIND };
      expect([name, leaveMode(st, l)]).toEqual([name, x.mode]);
      expect(isAway(st, l)).toBe(x.mode === 'away');
    }
    const l = lists({ col: '-' });
    for (const kind of ['Κανονική', 'Ειδική', 'ΑΜΔ', 'ΥΕΘΑ', undefined]) expect(leaveMode({ type: 'LEAVE', kind }, l)).toBe('away');
    expect(leaveMode({ type: 'EY' })).toBeUndefined();
    expect(isAway({ type: 'NOS' }, l)).toBe(true); expect(isAway({ type: 'KOL' }, l)).toBe(false);
    // 'bl' (κενή στήλη) και άγνωστη στήλη: όπως πριν, απών στις Κανονικές
    expect(leaveMode({ type: 'LEAVE', kind: KIND }, lists({ col: 'bl' }))).toBe('away');
    expect(leaveMode({ type: 'LEAVE', kind: KIND }, lists({ col: 'xx' }))).toBe('away');
  });

  for (const [name, x] of Object.entries(ITEMS)) it('«' + name + '»: Σήμερα, Δύναμη, ΗΚΑΙ και κωλυόμενοι συμφωνούν, ο άνθρωπος μετρά μία φορά', () => {
    const s = mk(x.item), none = mk(x.item, false);
    for (const at of [hkMin(s.rules), mins('13:30'), mins('22:00')]) {
      const c = strengthOf(s, D, at), c0 = strengthOf(none, D, at), v = strengthView(s, D, at), kv = kolView(s, D, at);
      expect(v.present + v.kol + v.absent).toBe(N); expect(c.total).toBe(N);
      expect(c.present - kv.minus.length).toBe(v.present); expect(c.absent).toBe(v.absent); expect(kv.minus.length).toBe(v.kol);
      expect(c.absent).toBe(c0.absent + (x.mode === 'away' ? 1 : 0));
      expect(kv.minus.length).toBe(x.mode === 'kol' ? 1 : 0);
      // μία γραμμή στη Δύναμη, στην κατηγορία του τρόπου που μετρά
      const rows = rowsOf(v); expect(rows.length).toBe(1);
      expect(rows[0].cat).toBe(x.mode === 'away' ? 'away' : x.mode === 'kol' ? 'kol' : 'present');
      expect(rows[0].what).toContain(KIND);
      if (x.mode === 'away') expect(rows[0].group).toBe('Άδειες');
      if (x.mode === 'kol') expect(rows[0].group).toBe(KIND);
      if (x.mode === 'present') expect(rows[0].group).toBe('Με ' + KIND);
      expect(statusesAt(s, PID, D, at).some(y => isAway(y, s.settings.lists))).toBe(x.mode === 'away');
    }
    // ΗΚΑΙ: στη στήλη που διάλεξες (ή πουθενά), διαθέσιμοι = σύνολο − απόντες
    const h = hkaiCounts(s, D), h0 = hkaiCounts(none, D);
    const inCol = Object.entries(h.cols).filter(([, l]) => l.some(p => p.id === PID)).map(([k]) => k);
    expect(inCol).toEqual(x.col ? [x.col] : []);
    expect(h.apo).toBe(h0.apo + (x.mode === 'away' ? 1 : 0)); expect(h.kol).toBe(h0.kol + (x.mode === 'kol' ? 1 : 0));
    expect(h.avail).toBe(h.total - h.apo); expect(h.avail).toBe(h0.avail - (x.mode === 'away' ? 1 : 0));
    expect(h.soldiers).toBe(N);
    // η γραμμή «Στρατιώτες» έχει το άτομο στη στήλη του
    const r = h.rank['Στρατιώτες']; if (x.col) expect(r.c[x.col]).toBe((h0.rank['Στρατιώτες'].c[x.col] || 0) + 1);
  });

  for (const [name, x] of Object.entries(ITEMS)) it('«' + name + '»: Εξοδούχοι και υπηρεσίες όπως ορίστηκαν', () => {
    const s = mk(x.item); const l = s.settings.lists;
    const post = postsOf(s.settings).find(p => !p.armed) || postsOf(s.settings)[0];
    const duty = x.mode === 'present' && !!x.item.duty, out = x.mode === 'present' && !!x.item.out;
    // υπηρεσία: μπαίνει μόνο ο παρών με «Μπαίνει σε υπηρεσίες»· οι άλλοι με αιτία που λέει το είδος, όχι «ΚΑ»
    const db = dutyBlock(s.statuses, D, PID, post, l);
    if (duty) expect(db).toBeNull(); else { expect(db).toContain(KIND); expect(db).not.toMatch(/(^|[^Α-Ω])ΚΑ([^Α-Ω]|$)/); }
    expect(guardUnavailable(s, D, PID, post.k) == null).toBe(duty);
    // έξοδος: μόνο ο παρών με «Βγαίνει έξοδο»
    expect(outBlock(s, D, PID) == null).toBe(out);
    if (out) run(s, { t: 'outs', date: D, changes: [{ pid: PID, from: null, to: 'OUT' }] });
    else expect(() => run(s, { t: 'outs', date: D, changes: [{ pid: PID, from: null, to: 'OUT' }] })).toThrow(/δεν βγαίνει έξοδο/);
    // Εξοδούχοι/Παραμένοντες: ο απών δεν είναι πουθενά, ο κωλυόμενος και ο παρών παραμένουν
    const o = outsAndStay(s, D);
    expect(o.outs.some(y => y.p.id === PID)).toBe(false);
    const stay = o.stay.find(y => y.p.id === PID);
    if (x.mode === 'away') expect(stay).toBeUndefined();
    else { expect(stay).toBeTruthy(); if (!out) expect(stay!.note).toContain(norm(KIND)); }
  });

  it('αίτηση άδειας που εγκρίνεται: ίδιοι κανόνες από το είδος', () => {
    let s = mk({ col: 'kin' }, false);
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [4], from: D, to: D, kind: KIND } });
    expect(kolView(s, D).minus.map(y => y.p.id)).toEqual([4]);
  });

  it('δύο είδη μαζί: το καθένα στη δική του στήλη, κάθε άτομο μία φορά', () => {
    let s = mk({ col: 'fp' });
    s = { ...s, settings: { ...s.settings, lists: { leaveKinds: { add: [{ name: KIND, col: 'fp' }, { name: 'Πρόβα', col: 'kin' }, { name: 'Εκτός', col: '-' }] } } } };
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [4], from: D, to: D, kind: 'Πρόβα' } });
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [5], from: D, to: D, kind: 'Εκτός' } });
    s = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [6], from: D, to: D, kind: 'Κανονική' } });
    const h = hkaiCounts(s, D), v = strengthView(s, D, hkMin(s.rules)), c = strengthOf(s, D);
    expect(h.cols.fp.map(p => p.id)).toEqual([PID]); expect(h.cols.kin.map(p => p.id)).toEqual([4]); expect(h.cols.ka.map(p => p.id)).toEqual([6]);
    expect(v.present + v.kol + v.absent).toBe(N); expect([v.kol, v.absent]).toEqual([1, 2]);
    expect(awayText(c)).toBe('1 ΚΑ · 1 ' + KIND);
    expect(h.avail).toBe(h.total - h.apo);
  });
});

describe('ΗΚΑΙ και ΔΥΝΑΜΗ του Excel', () => {
  // η ΗΚΑΙ γράφει το άτομο στη στήλη που διάλεξες: ίδια γραμμή «Στρατιώτες» με το ίδιο νούμερο γραμμένο με το χέρι στη στήλη
  const hkRow = async (s: AppState) => { const fr = await (await Workbook.open((await fillHkai(T('hkai.xlsx'), s, D)).data)).sheet(0); return Array.from({ length: 30 }, (_, i) => fr.get(col(i + 1) + '29')); };
  for (const [name, x] of Object.entries(ITEMS)) it('«' + name + '»: η γραμμή «Στρατιώτες» της ΗΚΑΙ', async () => {
    const s = mk(x.item), none = mk(x.item, false);
    const want = x.col ? run(none, { t: 'setHkaiManual', date: D, manual: { cells: { Στρατιώτες: { [x.col]: 1 } }, text: {} } }) : none;
    const got = await hkRow(s), exp = await hkRow(want);
    expect(got).toEqual(exp);
    if (x.col) expect(got).not.toEqual(await hkRow(none));
  });
  it('ΔΥΝΑΜΗ και Εξοδούχοι: το είδος γράφεται με κεφαλαία, όχι «ΚΑ»', async () => {
    const s0 = mk({ col: '-' }), s = { ...s0, settings: { ...s0.settings, outsFmt: 'all' as const } };
    const r = await fillOuts(T('exodouxoi.xlsx'), s, D);
    const wb = await Workbook.open(r.data); const cells: string[] = [];
    for (const n of wb.sheetNames()) for (const row of await wb.values(n, 300, 30)) for (const v of row) if (typeof v === 'string' && v) cells.push(v);
    expect(cells.some(v => v.includes(norm(KIND)))).toBe(true);
    expect(cells.some(v => v.toUpperCase() === 'ΚΑ' || /(^|, )ΚΑ(,|$)/.test(v))).toBe(false);
  });
});

describe('όνομα αντί «ΚΑ»', () => {
  const l = lists({ col: 'fp' }, 'Υ.Π');
  it('statusLbl: η Κανονική «ΚΑ», όλα τα άλλα το είδος όπως γράφτηκε', () => {
    const lbl = (kind?: string) => statusLbl({ type: 'LEAVE', kind }, l);
    expect([lbl(), lbl('Κανονική'), lbl('Κανονική άδεια')]).toEqual(['ΚΑ', 'ΚΑ', 'ΚΑ']);
    expect([lbl('Ειδική'), lbl('ΑΜΔ'), lbl('ΥΕΘΑ'), lbl('  Υπηρεσιακό ')]).toEqual(['Ειδική', 'ΑΜΔ', 'ΥΕΘΑ', 'Υπηρεσιακό']);
    expect(statusLbl({ type: 'HON' })).toBe(TYPES.HON.label);
  });
  it('absCode: η Κανονική Κ.Α, τα βασικά τον κωδικό τους, το δικό σου τον κωδικό του ή το όνομά του με κεφαλαία', () => {
    const c = (kind?: string, ls?: UserLists) => absCode({ type: 'LEAVE', kind }, ls);
    expect([c(), c('Κανονική'), c('Ειδική'), c('ΑΜΔ'), c('ΥΕΘΑ')]).toEqual(['Κ.Α', 'Κ.Α', 'ΕΙΔ', 'ΑΜΔ', 'ΥΕΘΑ']);
    expect(c(KIND, l)).toBe('Υ.Π'); expect(c(KIND, lists({ col: 'fp' }))).toBe('ΥΠΗΡΕΣΙΑΚΟ'); expect(c('Γονική')).toBe('ΓΟΝΙΚΗ');
    expect(absCode({ type: 'SICK' })).toBe('ΑΝ.ΑΔ');
  });
  it('Σήμερα (awayText), Δύναμη και αιτίες υπηρεσίας δεν γράφουν «ΚΑ» για άλλο είδος', () => {
    const s = mk({ col: 'fp' });
    const c = strengthOf(s, D); expect(awayText(c)).toBe('1 ' + KIND);
    const v = strengthView(s, D, hkMin(s.rules)), row = v.cats.away.groups.flatMap(g => g.rows)[0];
    expect(v.cats.away.groups.map(g => g.label)).toEqual(['Άδειες']);
    expect(row.what).toBe(KIND);   // το είδος μία φορά, όχι «ΚΑ · Υπηρεσιακό» ούτε «Υπηρεσιακό · Υπηρεσιακό»
    expect(row.ret).not.toMatch(/\bΚΑ\b/);
    expect(dutyBlock(s.statuses, D, PID, null, s.settings.lists)).toMatch(/^Υπηρεσιακό/);
    // ταυτόχρονα με Κανονική: ξεχωριστά
    const s2 = run(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [4], from: D, to: D, kind: 'Κανονική' } });
    expect(awayText(strengthOf(s2, D))).toBe('1 ΚΑ · 1 ' + KIND);
    expect(strengthView(s2, D, hkMin(s2.rules)).cats.away.groups.flatMap(g => g.rows).map(r => r.what).sort()).toEqual(['ΚΑ', KIND]);
  });
  it('Εξοδούχοι: «γιατί μένει» και το ιστορικό λένε το είδος', () => {
    const s = mk({ col: '-' });
    expect(outsAndStay(s, D).stay.find(y => y.p.id === PID)!.note).toBe(norm(KIND));
    expect(outBlock(s, D, PID)).toMatch(/^Υπηρεσιακό/);
  });
  it('leaveEffect και η σύνοψη της δήλωσης λένε τι κάνει πραγματικά', () => {
    expect(leaveEffect(KIND, lists({ col: 'fp' }))).toBe('Απών παντού, στην ΗΚΑΙ στη στήλη Φ.Πορ.');
    expect(leaveEffect(KIND, lists({ col: 'kin' }))).toBe('Κωλυόμενος: αφαιρείται από τους παρόντες, στην ΗΚΑΙ στη στήλη Κίν., χωρίς υπηρεσία και έξοδο');
    expect(leaveEffect(KIND, lists({ col: '-' }))).toMatch(/^Παρών παντού, δεν μετρά σε στήλη της ΗΚΑΙ/);
    const st = { type: 'LEAVE' as const, kind: KIND };
    expect(statSummary(st, [], lists({ col: 'fp' }))).toBe('Απών · Καμία υπηρεσία · Δεν βγαίνει έξοδο');
    expect(statSummary(st, [], lists({ col: 'kin' }))).toMatch(/^Κωλυόμενος/);
    expect(statSummary(st, [], lists({ col: '-' }))).toBe('Παρών · Καμία υπηρεσία · Δεν βγαίνει έξοδο');
    expect(statSummary(st, [], lists({ col: '-', duty: true, out: true }))).toBe('Παρών · Μπαίνει σε υπηρεσίες · Βγαίνει έξοδο');
  });
});
