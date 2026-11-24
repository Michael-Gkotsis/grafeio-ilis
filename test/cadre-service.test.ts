// Υπηρεσία «Μόνο στελέχη» (Michael, 24/11): μια υπηρεσία του εντύπου (BlockDef.who = 'cadre') συνδέεται με ομάδα στελεχών του προγράμματος στελεχών
// και γεμίζει μόνη της με στελέχη της ομάδας, ώστε να τυπώνεται η ΦΡΟΥΡΑ χωρίς χέρι. Εδώ: «βεβαιώσου ότι μια υπηρεσία χρεώνεται σωστά στις υπηρεσίες
// στελεχών». Μόνο ψεύτικα ονόματα.
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { Store } from '../src/main/db';
import { apply, type Command } from '../src/shared/commands';
import { blocksOf, type AppState, type Cadre, type CadreDutyCfg } from '../src/shared/domain';
import { addDays, type ISODate } from '../src/shared/dates';
import { cadreOnlyOf, fillDay, hkaiCounts, monthTxt, pickPeople, postsOf, ruleBlock, seatMap, whyText } from '../src/shared/rules';
import { autoFill, dutyCfgOf, dutyIndex, dutySheet, eligibility, monthCount, monthLimit, personCells, serviceOf } from '../src/shared/cadreDuty';
import { monthIndex } from '../src/shared/cadrePlan';
import { fillFroura } from '../src/main/exports';
import { Workbook } from '../src/main/xlsx';
import { fakeState } from './fixtures';
import { simulate } from './duty-sim';

const D0 = '2026-12-01';
const YM = '2026-12';
let n = 0;
const run = (s: AppState, c: Command) => apply(s, c, { today: D0, newId: () => 'f' + ++n }).state;
const dd = (i: number) => YM + '-' + String(i).padStart(2, '0');
const CFG = (lim = 12, services = true): Partial<CadreDutyCfg> => ({
  groups: [{ id: 'g', name: 'Αξιωματικοί', services: services ? [{ id: 'sv', name: 'ΑΥΔΜ', short: 'ΑΥΔΜ', perDay: 1, h24: true, hkCol: '' }] : [] }],
  limits: { off: { base: lim, extra: 1 }, nco: { base: lim, extra: 1 } }, rest: 1, carry: true, fairHol: true
});
// k στελέχη στην ομάδα g, και μία υπηρεσία «Μόνο στελέχη» για την ομάδα (η πρώτη της ομάδας μετρά ως)
function setup(k: number, cfg: Partial<CadreDutyCfg> = CFG(), block = true): { s: AppState; k: string; cl: Cadre[] } {
  let s = run(fakeState(40), { t: 'setSettings', settings: { cadreDuty: cfg }, text: 'δοκιμή' });
  s = { ...s, people: s.people.map(p => ({ ...p, post: null, si: 'Ι1' })) };
  for (let i = 0; i < k; i++) s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΣΤΕΛΕΧΟΣ' + String.fromCharCode(65 + i), first: 'ΟΝΟΜΑ' + i } });
  for (const c of s.cadreList) s = run(s, { t: 'setCadreDutyOf', cid: c.id, person: { group: 'g' } });
  let key = '';
  if (block) {
    s = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'Αξκός Υπηρεσίας', armed: false, n: 1, hrs: '', who: 'cadre', cadreGroup: 'g' });
    key = blocksOf(s.settings).find(b => b.name === 'Αξκός Υπηρεσίας')!.posts[0].k;
  }
  return { s, k: key, cl: s.cadreList };
}
// αυτόματη συμπλήρωση μέρα με τη μέρα, όπως ο λοχίας (με το cadreList που γυρίζει)
function fillDays(s: AppState, days: number, from: ISODate = D0): { s: AppState; warn: string[][]; empty: string[][] } {
  const warn: string[][] = [], empty: string[][] = [];
  for (let i = 0; i < days; i++) { const r = fillDay(s, addDays(from, i), null); s = { ...s, guards: r.guards, ...(r.cadreList ? { cadreList: r.cadreList } : {}) }; warn.push(r.warn); empty.push(r.empty); }
  return { s, warn, empty };
}
const seatOn = (s: AppState, d: ISODate, k: string) => s.guards[d]?.[k];
const cadreOfPid = (s: AppState, pid: number) => s.cadreList.find(c => c.pid === pid);
const picks = (s: AppState, k: string, days: number, from: ISODate = D0): { d: ISODate; cid: string }[] => {
  const out: { d: ISODate; cid: string }[] = [];
  for (let i = 0; i < days; i++) { const d = addDays(from, i); const p = seatOn(s, d, k); if (p != null) { const c = cadreOfPid(s, p); out.push({ d, cid: c ? c.id : '?' + p }); } }
  return out;
};
const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();

describe('1. αυτόματη συμπλήρωση της μέρας: μόνο στελέχη της ομάδας', () => {
  it('30 μέρες, 3 στελέχη: γεμίζει μόνο αυτά, ποτέ στρατιώτη, με ανάπαυση και ίση κατανομή', () => {
    const { s: s0, k, cl } = setup(3);
    expect(cadreOnlyOf(s0.settings).has(k)).toBe(true);
    const { s, empty } = fillDays(s0, 30);
    const pk = picks(s, k, 30);
    expect(pk).toHaveLength(30);
    for (const x of pk) expect(cl.map(c => c.id)).toContain(x.cid);               // μόνο τα στελέχη της ομάδας
    for (let i = 0; i < 30; i++) expect(seatOn(s, addDays(D0, i), k)! < 0).toBe(true);   // ποτέ στρατιώτης (θετικός αριθμός)
    expect(empty.flat().includes(k)).toBe(false);
    // ανάπαυση 1 μέρα: ποτέ δύο συνεχόμενες μέρες το ίδιο στέλεχος
    for (let i = 1; i < pk.length; i++) expect(pk[i].cid).not.toBe(pk[i - 1].cid);
    const per = cl.map(c => pk.filter(x => x.cid === c.id).length);
    expect(Math.max(...per) - Math.min(...per)).toBeLessThanOrEqual(1);
  });
  it('οι στρατιώτες δεν αγγίζουν τις θέσεις: η συμπλήρωση στρατιωτών δεν βάζει κανέναν εκεί, ούτε ως 2η υπηρεσία', () => {
    const { s: s0, k } = setup(0);   // κανένα στέλεχος: η θέση μένει κενή, με ειδοποίηση, παρά τους πολλούς στρατιώτες
    const { s, warn, empty } = fillDays(s0, 5);
    for (let i = 0; i < 5; i++) { expect(seatOn(s, addDays(D0, i), k)).toBeUndefined(); expect(empty[i]).toContain(k); expect(warn[i].some(w => /Αξκός Υπηρεσίας: κανένα στέλεχος/.test(w))).toBe(true); }
    // οι υπόλοιπες θέσεις γεμίζουν κανονικά
    expect(postsOf(s.settings).filter(p => p.k !== k).every(p => seatOn(s, D0, p.k) != null)).toBe(true);
  });
  it('σέβεται άδεια, απαλλαγή, περιορισμούς και «δεν θέλει»', () => {
    const { s: s0, k, cl } = setup(6);
    let s = run(s0, { t: 'addCadreAbs', abs: { cid: cl[0].id, kind: 'ka', from: dd(1), to: dd(31) }, replace: false });   // άδεια όλο τον μήνα
    s = run(s, { t: 'setCadreDutyOf', cid: cl[1].id, person: { group: 'g', none: {} } });          // ελαφράς: καμία
    s = run(s, { t: 'setCadreDutyOf', cid: cl[2].id, person: { group: 'g', no24: {} } });          // όχι 24ωρες (η υπηρεσία είναι 24ωρη)
    s = run(s, { t: 'setCadreDutyOf', cid: cl[3].id, person: { group: 'g', noDow: [0, 6] } });     // όχι ΣΚ
    const r = fillDays(s, 30); const pk = picks(r.s, k, 30);
    const who = new Set(pk.map(x => x.cid));
    expect(who).toEqual(new Set([cl[3].id, cl[4].id, cl[5].id]));
    for (const x of pk) if (x.cid === cl[3].id) expect([0, 6]).not.toContain(dowOf(x.d));
    // κανένα δεν έχει σκληρό λόγο (ο ίδιος έλεγχος με το πρόγραμμα στελεχών)
    for (const x of pk) { const c = r.s.cadreList.find(y => y.id === x.cid)!; const sv = serviceOf(dutyCfgOf(r.s.settings), 'sv')!.svc; expect(eligibility(r.s, c, x.d, sv).filter(q => ['inactive', 'state', 'noduty', 'dow', 'none', 'only', 'no24', 'group'].includes(q.code))).toEqual([]); }
    // «δεν θέλει υπηρεσία» ένα διάστημα
    let t = run(s0, { t: 'setCadreNoDuty', cid: cl[0].id, from: dd(1), to: dd(10) });
    t = run(t, { t: 'setCadreNoDuty', cid: cl[1].id, from: dd(1), to: dd(10) });
    const q = picks(fillDays(t, 10).s, k, 10);
    expect(q.every(x => x.cid !== cl[0].id && x.cid !== cl[1].id)).toBe(true);
  });
  it('χειροκίνητη επιλογή μένει όπως είναι, και μετρά στην ανάπαυση της επόμενης μέρας', () => {
    const { s: s0, k, cl } = setup(3);
    const seat = (c: Cadre) => pickPeople(s0).find(p => p.cid === c.id)!.id;
    let s = run(s0, { t: 'assign', date: dd(3), k, pid: seat(cl[0]), cid: cl[0].id });
    const r = fillDays(s, 6); const pk = picks(r.s, k, 6);
    expect(pk.find(x => x.d === dd(3))!.cid).toBe(cl[0].id);
    expect(pk.find(x => x.d === dd(2))!.cid).not.toBe(cl[0].id); expect(pk.find(x => x.d === dd(4))!.cid).not.toBe(cl[0].id);
  });
});

describe('2. χρέωση: μετρά παντού μαζί με τις υπηρεσίες στελεχών', () => {
  it('monthCount/monthLimit/dutyIndex, καρτέλα και οθόνη του προγράμματος μετρούν τις θέσεις', () => {
    const { s: s0, k, cl } = setup(3);
    const { s } = fillDays(s0, 31);
    const idx = dutyIndex(s);
    for (const c of cl) {
      const mine = picks(s, k, 31).filter(x => x.cid === c.id).length;
      expect(mine).toBeGreaterThan(0);
      const mc = monthCount(s, c.id, YM); expect(mc.seat).toBe(mine); expect(mc.done).toBe(mine); expect(mc.roster).toBe(0);
      expect(monthLimit(s, c, YM).done).toBe(mine);
      let seats = 0; for (const [, x] of idx.get(c.id) || []) seats += x.seat.length; expect(seats).toBe(mine);
      // καρτέλα: «N από ΟΡΙΟ» με τη σημερινή υπηρεσία
      const seatPerson = seatMap(s).get(s.cadreList.find(x => x.id === c.id)!.pid!)!;
      expect(monthTxt(s, dd(31), seatPerson, true)).toMatch(new RegExp('^' + mine + ' (από|τον μήνα)'));
    }
    // η οθόνη του προγράμματος (πλέγμα και Excel): κάθε στέλεχος έχει το «Σ» στις μέρες του και το σύνολο
    const index = monthIndex(s, YM); const sheet = dutySheet(s, YM);
    for (const c of cl) {
      const cells = personCells(s, c, index); const mine = picks(s, k, 31).filter(x => x.cid === c.id).map(x => +x.d.slice(8));
      expect(cells.map((x, i) => (x.seat.length ? i + 1 : 0)).filter(Boolean)).toEqual(mine);
      expect(sheet.byPerson.find(r => r.name.startsWith(c.last))!.sum).toBe(mine.length);
    }
  });
  it('όριο: όποιος το έφτασε δεν μπαίνει όσο υπάρχει άλλος· το «+1» μπαίνει μόνο όταν δεν υπάρχει κανείς άλλος', () => {
    const { s: s0, k, cl } = setup(3, CFG(2));   // όριο 2 (+1 αν χρειαστεί), 3 στελέχη, 30 μέρες: δεν φτάνουν
    const { s, warn } = fillDays(s0, 30);
    const pk = picks(s, k, 30);
    for (const c of cl) { const m = pk.filter(x => x.cid === c.id).length; expect(m).toBeLessThanOrEqual(3); expect(m).toBe(3); }   // όλοι ως όριο+έξτρα
    expect(pk).toHaveLength(9);   // 3 × (2+1)
    // το 3ο (έξτρα) κάθε στελέχους μπήκε όταν όλοι οι άλλοι είχαν ήδη τα 2 (ή ξεκουράζονταν)
    const cnt = new Map<string, number>(); let seenExtra = 0;
    for (const x of pk) {
      const mine = (cnt.get(x.cid) || 0) + 1; cnt.set(x.cid, mine);
      if (mine === 3) { seenExtra++; for (const o of cl) if (o.id !== x.cid) { const free = !pk.some(y => y.cid === o.id && Math.abs(+y.d.slice(8) - +x.d.slice(8)) <= 1); if (free) expect(cnt.get(o.id) || 0).toBeGreaterThanOrEqual(2); } }
    }
    expect(seenExtra).toBe(3);
    expect(warn.flat().filter(w => /μπήκε πάνω από το όριο/.test(w))).toHaveLength(3);
    // μετά τις 9 μέρες οι υπόλοιπες μένουν κενές με ειδοποίηση
    expect(warn.flat().filter(w => /κανένα στέλεχος/.test(w))).toHaveLength(21);
  });
});

describe('3. μηνιαίο πρόγραμμα στελεχών (Αυτόματα) μαζί με τη θέση', () => {
  it('γεμίζει υπηρεσίες προγράμματος και θέση, χωρίς διπλή υπηρεσία, με ανάπαυση και μέσα στα όρια', () => {
    const { s: s0, k, cl } = setup(6, CFG(12));
    const r = autoFill(s0, YM);
    expect(r.seats).toHaveLength(31); expect(r.seatEmpty).toEqual([]);
    expect(r.add).toHaveLength(0);   // η θέση είναι η υπηρεσία «ΑΥΔΜ» του προγράμματος (αμφίδρομη σχέση, 24/11): ένα άτομο ανά μέρα, όχι δύο
    const s = run(s0, { t: 'setCadreDuties', add: r.add, del: [], text: 'δοκιμή', seats: r.seats });
    expect(picks(s, k, 31)).toHaveLength(31);
    expect(cl.reduce((a, c) => a + monthCount(s, c.id, YM).done, 0)).toBe(31);   // και στο πρόγραμμα στελεχών: η ίδια υπηρεσία, μία φορά
    // κανένα στέλεχος δύο υπηρεσίες την ίδια μέρα ή σε συνεχόμενες μέρες (ανάπαυση 1) από πρόγραμμα + θέση μαζί
    const idx = dutyIndex(s);
    for (const c of cl) {
      const days = [...(idx.get(c.id) || [])].filter(([, x]) => x.roster.length + x.seat.length).map(([d, x]) => { expect(x.roster.length + x.seat.length).toBe(1); return +d.slice(8); }).sort((a, b) => a - b);
      for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(2);
      const l = monthLimit(s, c, YM); expect(l.done).toBeLessThanOrEqual(l.effBase + l.extra);
    }
    // ίδια δικαιοσύνη: ίσο μοίρασμα των 31 υπηρεσιών
    const tot = cl.map(c => monthCount(s, c.id, YM).done); expect(tot.reduce((a, b) => a + b, 0)).toBe(31); expect(Math.max(...tot) - Math.min(...tot)).toBeLessThanOrEqual(1);
    // δεύτερη φορά: τίποτα να γεμίσει
    const r2 = autoFill(s, YM); expect(r2.add).toEqual([]); expect(r2.seats).toEqual([]);
  });
  it('η μέρα με τη μέρα συμπλήρωση σέβεται και τις υπηρεσίες του προγράμματος στελεχών', () => {
    const { s: s0, k, cl } = setup(6, CFG(12));
    const r = autoFill(s0, YM, { }); const roster = r.add.length ? run(s0, { t: 'setCadreDuties', add: r.add, del: [], text: 'δοκιμή' }) : s0;   // η υπηρεσία του προγράμματος είναι η ίδια η θέση
    const { s } = fillDays(roster, 31);
    const idx = dutyIndex(s);
    for (const c of cl) for (const [, x] of idx.get(c.id) || []) expect(x.roster.length + x.seat.length).toBeLessThanOrEqual(1);
    for (const c of cl) { const days = [...(idx.get(c.id) || [])].map(([d]) => +d.slice(8)).sort((a, b) => a - b); for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1]).toBeGreaterThanOrEqual(2); }
    expect(picks(s, k, 31)).toHaveLength(31);
  });
});

describe('4. ΗΚΑΙ και ΦΡΟΥΡΑ', () => {
  it('το στέλεχος στη θέση μετρά στη στήλη «Υπηρεσία» της ΗΚΑΙ και το όνομά του γράφεται στη ΦΡΟΥΡΑ', async () => {
    const { s: s0, k, cl } = setup(3);
    const { s } = fillDays(s0, 3);
    const d = D0; const c = cadreOfPid(s, seatOn(s, d, k)!)!;
    expect(hkaiCounts(s, d).cadre['yp']?.map(x => x.id)).toContain(c.id);
    // και όσοι δεν είναι σήμερα στη θέση δεν μετρούν
    for (const o of cl.filter(x => x.id !== c.id)) expect((hkaiCounts(s, d).cadre['yp'] || []).map(x => x.id)).not.toContain(o.id);
    const T = fs.readFileSync(path.join(__dirname, '..', 'templates', 'froura.xlsx'));
    const out = await fillFroura(T, s, d);
    const ws = await (await Workbook.open(out.data)).sheet(0);
    const found: string[] = [];
    for (let r = 1; r <= 90; r++) for (const col of 'ABCDEFGHIJKL') { const v = ws.get(col + r); if (typeof v === 'string' && v.includes(c.last)) found.push(v); }
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]).toBe(found[0].toUpperCase());                                   // κεφαλαία, όπως κάθε όνομα στο Excel
    // το ίδιο όνομα με όταν το στέλεχος μπαίνει με το χέρι σε θέση
    const man = run(s0, { t: 'assign', date: d, k: postsOf(s0.settings).find(p => p.k !== k && p.kind === 'th')!.k, pid: pickPeople(s0).find(p => p.cid === c.id)!.id, cid: c.id });
    const ws2 = await (await Workbook.open((await fillFroura(T, man, d)).data)).sheet(0);
    const f2: string[] = [];
    for (let r = 1; r <= 90; r++) for (const col of 'ABCDEFGHIJKL') { const v = ws2.get(col + r); if (typeof v === 'string' && v.includes(c.last)) f2.push(v); }
    expect(f2).toContain(found[0]);
  });
  it('απαλλαγή μετά την υπηρεσία: η θέση δίνει απαλλαγή όπως η υπηρεσία του προγράμματος', async () => {
    const { apalLedger } = await import('../src/shared/cadreBalance');
    let { s, k, cl } = setup(3);
    s = run(s, { t: 'setSettings', settings: { cadreLeave: { apalPerDuty: 1, apalHolExtra: 0 } } as any, text: 'δοκιμή' });
    const r = fillDays(s, 4); s = r.s; const c = cadreOfPid(s, seatOn(s, D0, k)!)!;
    const rows = apalLedger(s, s.cadreList.find(x => x.id === c.id)!).filter(x => x.kind === 'duty');
    expect(rows.length).toBe(picks(s, k, 4).filter(x => x.cid === c.id).length);
    void cl;
  });
});

describe('5. στρατιώτης στη θέση στελεχών', () => {
  it('με το χέρι: μόνο με αιτία («Υπηρεσία μόνο για στελέχη»)· η αυτόματη δεν τον βάζει', () => {
    const { s, k } = setup(3);
    const p = s.people[0];
    expect(ruleBlock(s, D0, p.id, undefined, k)).toBe('Υπηρεσία μόνο για στελέχη');
    expect(() => run(s, { t: 'assign', date: D0, k, pid: p.id })).toThrow(/Υπηρεσία μόνο για στελέχη/);
    const t = run(s, { t: 'assign', date: D0, k, pid: p.id, force: 'δεν υπάρχει άλλος' });
    expect(seatOn(t, D0, k)).toBe(p.id);
    expect(whyText).toBeTypeOf('function');
    // μια κανονική θέση δεν έχει τέτοιο λόγο
    const other = postsOf(s.settings).find(x => x.k !== k)!.k;
    expect(ruleBlock(s, D0, p.id, undefined, other)).not.toBe('Υπηρεσία μόνο για στελέχη');
    // η αυτόματη συμπλήρωση αφήνει τη θέση που έβαλες με το χέρι
    const f = fillDay(t, D0, null); expect(f.guards[D0][k]).toBe(p.id);
  });
});

describe('6. χωρίς υπηρεσία «Μόνο στελέχη» τίποτα δεν αλλάζει', () => {
  // τα αποτελέσματα του e0be67d (πριν από αυτή την αλλαγή): sha1 των guards και του ημερολογίου ειδοποιήσεων, 60 μέρες, 40 στρατιώτες
  const GOLD: Record<number, string> = {
    1: '838d1b67a8dd4cea266c6db132254ecb40058a64', 2: '274b2cd7f0143ffbdf56c252e043c43819c87ead', 3: '87e6b32bd1c32c0ecc75697647b681e545f13eed',
    5: '147d843116da2f11bdfca0ea4214d33f2a7cf393', 11: 'b17b7b1dcbab8a293d08423e075d6562bd1c53c3'
  };
  for (const seed of Object.keys(GOLD).map(Number)) {
    it('σπόρος ' + seed + ': ίδιες θέσεις και ειδοποιήσεις με πριν', () => {
      const a = simulate({ seed, n: 40, days: 60 });
      expect(crypto.createHash('sha1').update(JSON.stringify(a.s.guards) + JSON.stringify(a.log)).digest('hex')).toBe(GOLD[seed]);
    });
  }
  it('υπηρεσία «Στρατιώτες» (ρητά) δεν αλλάζει τίποτα', () => {
    const { s: s0 } = setup(0, CFG(), false);
    const t = run(s0, { t: 'addBlock', phase: s0.settings.phase, name: 'Πύλη', armed: false, n: 1, hrs: '', who: 'soldiers' });
    expect(blocksOf(t.settings).find(b => b.name === 'Πύλη')!.who).toBeUndefined();
    expect(cadreOnlyOf(t.settings).size).toBe(0);
  });
});

describe('7. ρυθμίσεις: παλιά δεδομένα, έλεγχος και αναίρεση', () => {
  it('παλιές ρυθμίσεις χωρίς τα νέα πεδία φορτώνουν όπως πριν', () => {
    const s = fakeState(10);
    expect(blocksOf(s.settings).every(b => b.who === undefined && b.cadreGroup === undefined && b.cadreAs === undefined)).toBe(true);
    expect(cadreOnlyOf(s.settings).size).toBe(0);
    expect(JSON.stringify(blocksOf(s.settings)).includes('cadre')).toBe(false);
  });
  it('«Μόνο στελέχη» θέλει ομάδα που υπάρχει· η υπηρεσία που μετρά ως πρέπει να είναι της ομάδας', () => {
    const { s } = setup(1, CFG(), false);
    const add = (extra: object) => run(s, { t: 'addBlock', phase: s.settings.phase, name: 'Χ', armed: false, n: 1, hrs: '', who: 'cadre', ...extra } as any);
    expect(() => add({})).toThrow(/ομάδα στελεχών/);
    expect(() => add({ cadreGroup: 'zz' })).toThrow(/ομάδα στελεχών/);
    const b = blocksOf(add({ cadreGroup: 'g', cadreAs: 'nope' }).settings).find(x => x.name === 'Χ')!;
    expect(b.who).toBe('cadre'); expect(b.cadreGroup).toBe('g'); expect(b.cadreAs).toBeUndefined();
    expect(blocksOf(add({ cadreGroup: 'g', cadreAs: 'sv' }).settings).find(x => x.name === 'Χ')!.cadreAs).toBe('sv');
  });
  it('αλλαγή από τη φόρμα (editBlock) και πίσω σε στρατιώτες· η αναίρεση τα επαναφέρει', () => {
    const { s, k } = setup(2, CFG(), false);
    let t = run(s, { t: 'addBlock', phase: s.settings.phase, name: 'Πύλη', armed: false, n: 1, hrs: '' });
    const id = blocksOf(t.settings).find(b => b.name === 'Πύλη')!.id; const key = blocksOf(t.settings).find(b => b.id === id)!.posts[0].k;
    const before = JSON.stringify(blocksOf(t.settings));
    const u = run(t, { t: 'editBlock', phase: t.settings.phase, id, name: 'Πύλη', hrs: {}, who: 'cadre', cadreGroup: 'g', cadreAs: 'sv' });
    expect(cadreOnlyOf(u.settings).get(key)).toMatchObject({ group: 'g', as: 'sv' });
    const v = run(u, { t: 'editBlock', phase: t.settings.phase, id, name: 'Πύλη', hrs: {}, who: 'soldiers' });
    expect(JSON.stringify(blocksOf(v.settings))).toBe(before);
    expect(cadreOnlyOf(v.settings).size).toBe(0);
    void k;
  });
  it('αναίρεση: οι ρυθμίσεις γυρνούν όπως ήταν και η υπηρεσία «Μόνο στελέχη» φεύγει', async () => {
    const WASM = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csdb-')); const st = new Store(dir, WASM); await st.open();
    const c = { today: D0, newId: () => 'u' + ++n };
    const s0 = st.state; const b0 = blocksOf(s0.settings)[1]; const had = JSON.stringify(blocksOf(s0.settings));
    const p1 = st.commit(apply(st.state, { t: 'setSettings', settings: { cadreDuty: CFG() }, text: 'ομάδες' }, c).state);
    const p2 = st.commit(apply(st.state, { t: 'editBlock', phase: st.state.settings.phase, id: b0.id, name: b0.name, hrs: {}, who: 'cadre', cadreGroup: 'g' }, c).state);
    expect(blocksOf(st.state.settings).find(b => b.id === b0.id)!.who).toBe('cadre');
    st.revert(p2); expect(blocksOf(st.state.settings).find(b => b.id === b0.id)!.who).toBeUndefined();
    expect(JSON.stringify(blocksOf(st.state.settings))).toBe(JSON.stringify(blocksOf(apply(s0, { t: 'setSettings', settings: { cadreDuty: CFG() }, text: 'x' }, c).state.settings)));
    st.revert(p1); expect(JSON.stringify(blocksOf(st.state.settings))).toBe(had);
    st.close();
  });
});
