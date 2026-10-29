// Στελέχη σε υπηρεσία με το χέρι (Michael, 26/10): κάθε ενεργό στέλεχος σε οποιαδήποτε θέση, μόνο με το χέρι.
// Η αυτόματη, ο «Επόμενος» και η ΠΣΚ δεν το βάζουν ποτέ· η σειρά δικαιοσύνης των στρατιωτών δεν αλλάζει. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import { apply, type Command } from '../src/shared/commands';
import { PROV, dutyPool, dutyStats, fairAvg, fairOf, fillDay, hkaiCounts, monthDuties, monthTxt, nextFor, pickPeople, seatMap, seatPeople, whyText } from '../src/shared/rules';
import { armedRows, armWhen } from '../src/shared/armed';
import { outCountOn, openMoveList } from '../src/shared/weaponView';
import { weaponInfo, weaponSheets } from '../src/shared/weapons';
import { frouraChecks } from '../src/shared/preflight';
import { frouraSheet, checkSheet } from '../src/renderer/sheets';
import { fakeState } from './fixtures';
import type { AppState } from '../src/shared/domain';

const D = '2026-10-12';
const ctx = { today: D, newId: (() => { let i = 0; return () => 'n' + ++i; })() };
const run = (s: AppState, c: Command) => apply(s, c, ctx).state;
// τρία στελέχη χωρίς όριο (καμία δεν έχει pid), ένας ΕΠΟΠ με όριο 2 (pid -1)
function withCadres(n = 30): AppState {
  let s = fakeState(n);
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΕΠΟΠ', hk: 'ΕΠΟΠ Στρατιώτης', last: 'ΕΠΟΠΑΚΗΣ', first: 'ΑΛΦΑΣ', monthMax: 2 } });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΛΧΙΑΣ', hk: 'Λοχίες', last: 'ΛΟΧΙΑΔΗΣ', first: 'ΒΗΤΑΣ' } });
  s = run(s, { t: 'saveCadre', cadre: { rank: 'ΑΝΘΛΓΟΣ', hk: 'Ανθυπίλαρχοι-Ανθλγοι', last: 'ΑΝΘΥΠΑΚΗΣ', first: 'ΓΑΜΜΑΣ' } });
  return s;
}
const cid = (s: AppState, last: string) => s.cadreList.find(c => c.last === last)!.id;
// το στέλεχος διαλέγεται από τη λίστα με προσωρινό αριθμό· το assign δίνει το πραγματικό
const put = (s: AppState, last: string, date: string, k: string, extra: Partial<Extract<Command, { t: 'assign' }>> = {}) => {
  const c = s.cadreList.find(x => x.last === last)!; const pick = pickPeople(s).find(p => p.cid === c.id)!;
  return run(s, { t: 'assign', date, k, pid: pick.id, cid: c.id, ...extra });
};

describe('Στελέχη σε υπηρεσία: μόνο με το χέρι', () => {
  it('όλα τα ενεργά στελέχη διαλέγονται για θέση, με προσωρινό αριθμό όσα δεν έχουν pid· η seatPeople μένει όπως ήταν', () => {
    const s = withCadres();
    const pick = pickPeople(s).filter(p => p.cid);
    expect(pick.map(p => p.last)).toEqual(['ΕΠΟΠΑΚΗΣ', 'ΛΟΧΙΑΔΗΣ', 'ΑΝΘΥΠΑΚΗΣ']);
    expect(pick[0].id).toBe(-1); expect(pick[1].id).toBe(PROV - 1); expect(pick[2].id).toBe(PROV - 2);
    expect(seatPeople(s).filter(p => p.cid).map(p => p.last)).toEqual(['ΕΠΟΠΑΚΗΣ']);
    // εκτός δύναμης: δεν διαλέγεται
    const off = run(s, { t: 'saveCadre', cadre: { ...s.cadreList[1], active: false } });
    expect(pickPeople(off).filter(p => p.cid).map(p => p.last)).toEqual(['ΕΠΟΠΑΚΗΣ', 'ΑΝΘΥΠΑΚΗΣ']);
    // χωρίς στελέχη η λίστα είναι ακριβώς η λίστα των στρατιωτών
    const t = fakeState(5); expect(pickPeople(t)).toBe(t.people);
  });
  it('η αυτόματη συμπλήρωση, ο «Επόμενος» και η ΠΣΚ δεν βάζουν ποτέ στέλεχος', () => {
    let s = withCadres();
    for (const d of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']) s = { ...s, guards: fillDay(s, d).guards };
    s = run(s, { t: 'autofillRange', dates: ['2026-10-16', '2026-10-17', '2026-10-18'] });
    s = run(s, { t: 'autofill', date: '2026-10-19' });
    const used = Object.values(s.guards).flatMap(g => Object.values(g));
    expect(used.length).toBeGreaterThan(30);
    expect(used.every(p => p > 0)).toBe(true);
    for (let i = 0; i < 25; i++) expect(nextFor(s, '2026-10-20', 'th1', [...Array(i).keys()].map(x => x + 1))).not.toBeLessThan(0);
    expect(dutyPool(s).some(p => p.cid)).toBe(false);
    // κανένα στέλεχος δεν πήρε pid από την αυτόματη
    expect(s.cadreList.map(c => c.pid)).toEqual([-1, undefined, undefined]);
  });
  it('με το χέρι: παίρνει μόνιμο αρνητικό αριθμό την πρώτη φορά, μοναδικό, και τον κρατά', () => {
    let s = withCadres();
    s = put(s, 'ΛΟΧΙΑΔΗΣ', D, 'dy');
    expect(s.cadreList.find(c => c.last === 'ΛΟΧΙΑΔΗΣ')!.pid).toBe(-2);
    expect(s.guards[D].dy).toBe(-2);
    s = put(s, 'ΑΝΘΥΠΑΚΗΣ', D, 'ly');
    expect(s.guards[D].ly).toBe(-3);
    s = put(s, 'ΛΟΧΙΑΔΗΣ', '2026-10-20', 'th1');
    expect(s.guards['2026-10-20'].th1).toBe(-2);
    expect(s.cadreList.map(c => c.pid)).toEqual([-1, -2, -3]);
    expect(seatMap(s).get(-3)?.last).toBe('ΑΝΘΥΠΑΚΗΣ');
    // από τη λίστα μετά την πρώτη φορά έχει τον αριθμό του
    expect(pickPeople(s).filter(p => p.cid).map(p => p.id)).toEqual([-1, -2, -3]);
  });
  it('ανάπαυση, ΣΚ και όρια στρατιωτών δεν ισχύουν στα στελέχη (μέρες στη σειρά, ΣΚ μετά από ΣΚ)', () => {
    let s = withCadres(); s = { ...s, rules: { ...s.rules, restDays: 2, noConsecHol: true } };
    for (const d of ['2026-10-10', '2026-10-11', '2026-10-17', '2026-10-18']) s = put(s, 'ΛΟΧΙΑΔΗΣ', d, 'th1');   // ΣΚ δύο εβδομάδες στη σειρά, και συνεχόμενες μέρες
    expect(Object.keys(s.guards).length).toBe(4);
    // ίδια μέρα σε δεύτερη θέση: ⚠ «ήδη», περνά με αιτία
    expect(() => put(s, 'ΛΟΧΙΑΔΗΣ', '2026-10-10', 'th2')).toThrow(/ήδη/);
    expect(put(s, 'ΛΟΧΙΑΔΗΣ', '2026-10-10', 'th2', { force: 'εντολή' }).guards['2026-10-10'].th2).toBe(-2);
  });
  it('κατάσταση στελέχους τη μέρα (άδεια): ⚠ και ζητά αιτία· με «Υπηρεσία» όχι· ποτέ σκληρό μπλοκ', () => {
    let s = withCadres(); const c = cid(s, 'ΑΝΘΥΠΑΚΗΣ');
    s = run(s, { t: 'addCadreAbs', abs: { cid: c, kind: 'ka', from: D, to: '2026-10-14' } });
    expect(() => put(s, 'ΑΝΘΥΠΑΚΗΣ', D, 'dy')).toThrow(/Στέλεχος: .*12\/10/);
    expect(s.cadreList.find(x => x.id === c)!.pid).toBeUndefined();   // δεν πέρασε: δεν πήρε pid
    const r = apply(s, { t: 'assign', date: D, k: 'dy', pid: PROV - 2, cid: c, force: 'έκτακτη ανάγκη' }, ctx);
    expect(r.text).toMatch(/παρά τον κανόνα: Στέλεχος.*έκτακτη ανάγκη/);
    expect(r.state.guards[D].dy).toBe(-2);
    // «Υπηρεσία εντός στρατοπέδου»
    s = run(s, { t: 'addCadreAbs', abs: { cid: c, kind: 'yp', from: '2026-10-16', to: '2026-10-16' } });
    expect(put(s, 'ΑΝΘΥΠΑΚΗΣ', '2026-10-16', 'dy').guards['2026-10-16'].dy).toBe(-2);
    // εκτός δύναμης: δεν διαλέγεται, ούτε μπαίνει
    const off = run(s, { t: 'saveCadre', cadre: { ...s.cadreList.find(x => x.id === c)!, active: false } });
    expect(() => run(off, { t: 'assign', date: '2026-10-17', k: 'dy', pid: PROV - 2, cid: c })).toThrow(/εκτός δύναμης/);
  });
  it('ΗΚΑΙ: κωλυόμενος «Υπηρεσία» στη γραμμή του βαθμού του· ΦΡΟΥΡΑ με βαθμό και όνομα', () => {
    let s = withCadres();
    s = put(s, 'ΛΟΧΙΑΔΗΣ', D, 'dy'); s = put(s, 'ΑΝΘΥΠΑΚΗΣ', D, 'th3');
    const h = hkaiCounts(s, D);
    expect(h.cadre.yp.map(c => c.last).sort()).toEqual(['ΑΝΘΥΠΑΚΗΣ', 'ΛΟΧΙΑΔΗΣ']);
    expect(h.rank['Λοχίες'].c.yp).toBe(1); expect(h.rank['Ανθυπίλαρχοι-Ανθλγοι'].c.yp).toBe(1);
    expect(hkaiCounts(s, '2026-10-13').cadre.yp).toBeUndefined();
    const fr = JSON.stringify(frouraSheet(s, D));
    expect(fr).toMatch(/ΑΝΘΛΓΟΣ ΑΝΘΥΠΑΚΗΣ/);
    expect(whyText(s, D, 'th3')).toMatch(/^Στέλεχος, μόνο με το χέρι · 1η υπηρεσία του μήνα$/);
  });
  it('μετρητής του μήνα στην κάρτα: «N τον μήνα», και «N από M» για ΕΠΟΠ με όριο', () => {
    let s = withCadres();
    s = put(s, 'ΛΟΧΙΑΔΗΣ', '2026-10-02', 'th1'); s = put(s, 'ΛΟΧΙΑΔΗΣ', '2026-10-09', 'th1'); s = put(s, 'ΛΟΧΙΑΔΗΣ', '2026-11-03', 'th1');
    const p = seatMap(s).get(-2)!;
    expect(monthDuties(s, '2026-10-20', -2)).toBe(2);
    expect(monthTxt(s, '2026-10-20', p)).toBe('2 τον μήνα');
    expect(monthTxt(s, '2026-11-20', p)).toBe('1 τον μήνα');
    s = put(s, 'ΕΠΟΠΑΚΗΣ', '2026-10-02', 'th1');
    expect(monthTxt(s, '2026-10-20', seatMap(s).get(-1)!)).toBe('1 από 2 τον μήνα');
    // το όριο των ΕΠΟΠ ισχύει όπως πριν
    s = put(s, 'ΕΠΟΠΑΚΗΣ', '2026-10-06', 'th1');
    expect(() => put(s, 'ΕΠΟΠΑΚΗΣ', '2026-10-20', 'th1')).toThrow(/όριο του μήνα/);
  });
  it('σειρά δικαιοσύνης στρατιωτών: ίδια με και χωρίς στέλεχος στη θέση', () => {
    let a = withCadres(); for (const d of ['2026-10-05', '2026-10-06', '2026-10-07']) a = { ...a, guards: fillDay(a, d).guards };
    const b = put(put(a, 'ΛΟΧΙΑΔΗΣ', '2026-10-10', 'th1'), 'ΑΝΘΥΠΑΚΗΣ', '2026-10-11', 'ly');
    const ids = a.people.map(p => p.id);
    for (const d of ['2026-10-10', '2026-10-11', '2026-10-12']) {
      expect(ids.map(id => fairOf(b, id, d))).toEqual(ids.map(id => fairOf(a, id, d)));
      expect(fairAvg(b, d)).toEqual(fairAvg(a, d));
    }
    const sa = dutyStats(a), sb = dutyStats(b);
    expect(ids.map(id => sb.get(id))).toEqual(ids.map(id => sa.get(id)));
    // ένα στέλεχος σε θέση τη μέρα: η αυτόματη γεμίζει τις άλλες θέσεις, όχι τη δική του
    const r = fillDay(b, '2026-10-10');
    expect(r.guards['2026-10-10'].th1).toBe(-2);
    expect(Object.values(r.guards['2026-10-10']).filter(p => p < 0)).toEqual([-2]);
  });
  it('δεν σβήνεται με υπηρεσίες· εκτός δύναμης φεύγει από τις επόμενες μέρες', () => {
    let s = withCadres(); const c = s.cadreList.find(x => x.last === 'ΛΟΧΙΑΔΗΣ')!;
    s = put(s, 'ΛΟΧΙΑΔΗΣ', '2026-10-10', 'th1'); s = put(s, 'ΛΟΧΙΑΔΗΣ', '2026-10-14', 'th1');
    expect(() => run(s, { t: 'deleteCadre', id: c.id })).toThrow(/εκτός δύναμης/);
    s = run(s, { t: 'saveCadre', cadre: { ...s.cadreList.find(x => x.id === c.id)!, active: false } });
    expect(s.guards['2026-10-10'].th1).toBe(-2); expect(s.guards['2026-10-14'].th1).toBeUndefined();
    expect(s.cadreList.find(x => x.id === c.id)!.pid).toBe(-2);
    // χωρίς υπηρεσίες σβήνεται κανονικά
    expect(run(s, { t: 'deleteCadre', id: cid(s, 'ΑΝΘΥΠΑΚΗΣ') }).cadreList.length).toBe(2);
  });
  it('Έλεγχος υπηρεσιών (πλέγμα): στελέχη που έκαναν υπηρεσία τον μήνα, μετά τους στρατιώτες· χωρίς υπηρεσία δεν μπαίνουν', () => {
    let s = withCadres(10); s = put(s, 'ΛΟΧΙΑΔΗΣ', '2026-10-09', 'th1');
    const g = JSON.stringify(checkSheet(s, '2026-10'));
    expect(g).toMatch(/ΛΧΙΑΣ ΛΟΧΙΑΔΗΣ/); expect(g).not.toMatch(/ΑΝΘΥΠΑΚΗΣ/);
    expect(JSON.stringify(checkSheet(s, '2026-11'))).not.toMatch(/ΛΟΧΙΑΔΗΣ/);
  });
});

describe('Στελέχη: όπλο και ένοπλη υπηρεσία', () => {
  const armed = () => {
    let s = withCadres(10);
    s.settings = { ...s.settings, phase: 'spen' };
    s = run(s, { t: 'saveCadre', cadre: { ...s.cadreList[1], wtype: 'g3a3', weapon: ' 4811 111 ', rack: 'ε', wpos: ' 23 ' } });
    return s;
  };
  it('τα πεδία όπλου αποθηκεύονται με κεφαλαία και περνούν στη θέση', () => {
    const s = armed(); const c = s.cadreList[1];
    expect([c.wtype, c.weapon, c.rack, c.wpos]).toEqual(['G3A3', '4811 111', 'Ε', '23']);
    const p = pickPeople(s).find(x => x.cid === c.id)!;
    expect([p.wtype, p.weapon, p.rack, p.wpos]).toEqual(['G3A3', '4811 111', 'Ε', '23']);
    const empty = run(s, { t: 'saveCadre', cadre: { ...c, weapon: '', wtype: '', rack: '', wpos: '' } }).cadreList[1];
    expect('weapon' in empty || 'wtype' in empty || 'rack' in empty || 'wpos' in empty).toBe(false);
  });
  it('σε ένοπλη θέση το όπλο βγαίνει ΕΚΤΟΣ στις ώρες του νούμερου με το περιθώριο, και φαίνεται στις Κινήσεις με «στέλεχος»', () => {
    let s = armed(); s = put(s, 'ΛΟΧΙΑΔΗΣ', D, 'sk3a');
    const pid = s.cadreList[1].pid!;
    const rows = armedRows(s, D);
    expect(rows.map(armWhen)).toEqual(['17:45–20:15', '01:45–04:15', '09:45–12:15']);
    expect(rows.every(r => r.who === pid && r.owner === pid)).toBe(true);
    const info = weaponInfo(s, D, '18:30');
    expect(info.out.has(pid)).toBe(true);
    expect(weaponInfo(s, D, '12:00').out.has(pid)).toBe(false);
    const list = openMoveList(s, info);
    expect(list.map(m => [m.pid, m.weapon])).toEqual([[pid, '4811 111']]);
    expect(outCountOn(s, D, '18:30')).toBe(1);
    const sheet = weaponSheets(s, D).find(x => x.name === 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ')!;
    expect(sheet.rows.length).toBe(3);
    expect(sheet.rows.every(r => r[2] === 'ΛΟΧΙΑΔΗΣ' && r[4] === '4811 111' && /ΣΤΕΛΕΧΟΣ · ΑΥΤΟΜΑΤΑ/.test(String(r[9])))).toBe(true);
    // η θέση έχει κάποιον: η αυτόματη δεν την αγγίζει
    expect(fillDay(s, D).guards[D].sk3a).toBe(pid);
  });
  it('χωρίς αριθμό όπλου: «Ένοπλη χωρίς όπλο» στον έλεγχο της ΦΡΟΥΡΑΣ και κίνηση χωρίς αριθμό', () => {
    let s = armed(); s = run(s, { t: 'saveCadre', cadre: { ...s.cadreList[1], weapon: '' } });
    s = put(s, 'ΛΟΧΙΑΔΗΣ', D, 'sk3a');
    expect(frouraChecks(s, D).map(c => c.text).join(' ')).toMatch(/ΛΟΧΙΑΔΗΣ.*Ένοπλη χωρίς όπλο/);
    expect(openMoveList(s, weaponInfo(s, D, '18:30')).map(m => m.weapon)).toEqual(['']);
  });
  it('άοπλη θέση ή χωρίς στελέχη: καμία αλλαγή στον οπλισμό', () => {
    const a = armed(); const info = weaponInfo(a, D, '18:30');
    expect(info.out.size).toBe(0); expect(openMoveList(a, info)).toEqual([]);
    const s = put(a, 'ΛΟΧΙΑΔΗΣ', D, 'th1');
    expect(armedRows(s, D)).toEqual([]);
  });
});
