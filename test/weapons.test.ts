// Οπλισμός: αριθμοί όπλων, φίλτρα (χωρίς όπλο, άοπλοι με όπλο, ίδιος αριθμός, να παραδώσουν) και το Excel
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { W_NUM, bySeat, inOutText, noSeat, normRack, normWeapon, rackKey, sameRack, seatKey, seatTxt, weaponInfo, weaponKey, weaponMatch, weaponSheets } from '../src/shared/weapons';
import { weaponsBook } from '../src/main/excel';
import { weaponBack } from '../src/shared/ranks';
import { lyLine } from '../src/shared/froura';
import type { AppState } from '../src/shared/domain';
import { fakeState } from './fixtures';

let seq = 0;
const ctx: Ctx = { today: '2026-10-17', newId: () => 'w' + ++seq };
const run = (s: AppState, c: Command) => apply(s, c, ctx);
const W = (s: AppState, changes: { pid: number; weapon: string }[]) => run(s, { t: 'setWeapons', changes }).state;

describe('Οπλισμός', () => {
  it('γράφει, κανονικοποιεί και σβήνει τον αριθμό, με ένα μήνυμα για το ιστορικό', () => {
    const r = run(fakeState(5), { t: 'setWeapons', changes: [{ pid: 2, weapon: '  ab  12345 ' }] });
    expect(r.state.people[1].weapon).toBe('AB 12345');
    expect(r.text).toMatch(/^Όπλο .*: AB 12345$/);
    const s2 = W(r.state, [{ pid: 2, weapon: '' }]);
    expect('weapon' in s2.people[1]).toBe(false);
    // ίδιο με πριν: καμία αλλαγή (ούτε γραμμή στο ιστορικό)
    expect(run(r.state, { t: 'setWeapons', changes: [{ pid: 2, weapon: 'AB 12345' }] }).text).toBe('');
    expect(() => run(r.state, { t: 'setWeapons', changes: [{ pid: 99, weapon: '1' }] })).toThrow();
  });
  it('πολλοί μαζί (επικόλληση, μεταφορά): μία ενέργεια', () => {
    const r = run(fakeState(5), { t: 'setWeapons', changes: [{ pid: 1, weapon: '1' }, { pid: 2, weapon: '2' }, { pid: 3, weapon: '3' }], what: 'επικόλληση' });
    expect(r.state.people.slice(0, 3).map(p => p.weapon)).toEqual(['1', '2', '3']);
    expect(r.text).toBe('Οπλισμός, επικόλληση: άλλαξε σε 3 άτομα');
  });
  it('ίδιος αριθμός με άλλη γραφή («12-345» = «12345»)', () => {
    expect(weaponKey('12-345')).toBe(weaponKey(' 12 345 '));
    const s = W(fakeState(5), [{ pid: 1, weapon: '12345' }, { pid: 2, weapon: '12-345' }, { pid: 3, weapon: '777' }]);
    const info = weaponInfo(s);
    expect(s.people.filter(p => weaponMatch('dup', p, info)).map(p => p.id)).toEqual([1, 2]);
  });
  it('φίλτρα: χωρίς όπλο (μόνο ένοπλοι), άοπλοι με όπλο, να παραδώσουν', () => {
    let s = fakeState(12);   // ο 10 είναι Ι3 ΑΟΠΛΟ (fixtures)
    s = W(s, s.people.filter(p => p.id !== 4).map(p => ({ pid: p.id, weapon: String(1000 + p.id) })));
    s = { ...s, people: s.people.map(p => (p.id === 11 ? { ...p, active: false } : p)) };
    const info = weaponInfo(s);
    const of = (f: Parameters<typeof weaponMatch>[0]) => s.people.filter(p => weaponMatch(f, p, info)).map(p => p.id);
    expect(info.unarmed.has(10)).toBe(true);
    expect(of('without')).toEqual([4]);
    expect(of('unarmed')).toEqual([10]);
    expect(of('return')).toEqual([11]);
    expect(of('all')).not.toContain(11);
    // Ι4 πάντα άοπλος: χωρίς όπλο δεν μετράει στο «Χωρίς όπλο»
    const s4 = { ...s, people: s.people.map(p => (p.id === 4 ? { ...p, si: 'Ι4' } : p)) };
    expect(s4.people.filter(p => weaponMatch('without', p, weaponInfo(s4)))).toEqual([]);
  });
  it('ο αριθμός φαίνεται δίπλα στον Λ/Υ στο έντυπο υπηρεσιών', () => {
    const s = W(fakeState(3), [{ pid: 2, weapon: 'g3 555' }]);
    expect(lyLine(s.people[1])).toMatch(/ΟΠΛΟ: G3 555$/);
  });
  it('Excel: φύλλο ανά φίλτρο, κατάσταση με υπογραφή, όλα με κεφαλαία', async () => {
    let s = W(fakeState(6), [{ pid: 1, weapon: 'a1' }, { pid: 2, weapon: 'a1' }, { pid: 3, weapon: 'b2' }]);
    s = { ...s, settings: { ...s.settings, unit: ['ΚΕΤΘ', '4η ΙΛΗ', 'ΓΡΑΦΕΙΟ ΛΟΧΙΑ'], unitName: '4ης Ίλης', place: 'Αυλώνα' } };
    const sh = weaponSheets(s, '2026-10-17');
    expect(sh.map(x => x.name)).toEqual(['ΟΠΛΙΣΜΟΣ', 'ΜΕ ΟΠΛΟ', 'ΕΚΤΟΣ ΟΠΛΟΒΑΣΤΟΥ', 'ΧΩΡΙΣ ΟΠΛΟ', 'ΑΟΠΛΟΙ ΜΕ ΟΠΛΟ', 'ΙΔΙΟΣ ΑΡΙΘΜΟΣ', 'ΝΑ ΠΑΡΑΔΩΣΟΥΝ', 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ']);
    expect(sh[0].head.slice(-6)).toEqual(['ΤΥΠΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'ΟΠΛΟΒΑΣΤΟΣ', 'ΘΕΣΗ', 'ΕΝΤΟΣ / ΕΚΤΟΣ', 'ΥΠΟΓΡΑΦΗ']);
    expect(sh[5].rows.map(r => r[W_NUM])).toEqual(['A1', 'A1']);
    const r = await weaponsBook(s, '2026-10-17');
    expect(r.name).toBe('ΟΠΛΙΣΜΟΣ 17-10-2026.xlsx');
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.data as any);
    const ws = wb.getWorksheet('ΟΠΛΙΣΜΟΣ')!;
    const vals: string[] = []; ws.eachRow(row => row.eachCell(c => { if (typeof c.value === 'string') vals.push(c.value); }));
    expect(vals).toContain('ΚΑΤΑΣΤΑΣΗ ΟΠΛΙΣΜΟΥ 4ΗΣ ΙΛΗΣ ΤΗΣ 17 ΟΚΤ 26');
    expect(vals).toContain('ΑΥΛΩΝΑ, 17 ΟΚΤ 26');
    expect(vals).toContain('ΔΥΝΑΜΗ: 6 · ΜΕ ΟΠΛΟ: 3');
    expect(vals.every(v => v === v.toUpperCase())).toBe(true);
    expect(normWeapon('α-12')).toBe('Α-12');
  });
  it('τύπος όπλου και θέση οπλοβαστού: αλλάζει μόνο ό,τι δόθηκε, ίδια θέση σε δύο φαίνεται στο «Ίδιος αριθμός»', () => {
    let r = run(fakeState(5), { t: 'setWeapons', changes: [{ pid: 1, weapon: '100', wtype: ' g3a3 ' }] });
    r = run(r.state, { t: 'setWeapons', changes: [{ pid: 1, rack: ' ε 6 ' }] });
    expect(r.state.people[0]).toMatchObject({ weapon: '100', wtype: 'G3A3', rack: 'Ε6' });
    expect(r.text).toMatch(/οπλοβαστός Ε6/);
    expect(rackKey('E6')).toBe(rackKey('Ε6'));
    expect(normRack('ε 6')).toBe('Ε6');
    const s = W(r.state, [{ pid: 2, weapon: '200' }]);
    const s2 = run(s, { t: 'setWeapons', changes: [{ pid: 2, rack: 'E6' }] }).state;
    expect(s2.people.filter(p => weaponMatch('dup', p, weaponInfo(s2))).map(p => p.id)).toEqual([1, 2]);
    expect(run(s2, { t: 'setWeapons', changes: [{ pid: 1, wtype: '' }] }).state.people[0].wtype).toBeUndefined();
  });
  it('«Θέση» όπλου: ελεύθερο κείμενο με κεφαλαία, στο Excel μετά τον οπλοβαστό', () => {
    let r = run(W(fakeState(3), [{ pid: 1, weapon: '100' }]), { t: 'setWeapons', changes: [{ pid: 1, wpos: '  πύλη   2 ' }] });
    expect(r.state.people[0]).toMatchObject({ weapon: '100', wpos: 'ΠΥΛΗ 2' });
    expect(r.text).toMatch(/θέση ΠΥΛΗ 2/);
    const sh = weaponSheets(r.state, '2026-10-17')[0];
    expect(sh.rows.find(x => x[W_NUM] === '100')![sh.head.indexOf('ΘΕΣΗ')]).toBe('ΠΥΛΗ 2');
    r = run(r.state, { t: 'setWeapons', changes: [{ pid: 1, wpos: '' }] });
    expect(r.state.people[0].wpos).toBeUndefined();
  });
  it('εντός/εκτός: εκτός όποιος έχει ένοπλη υπηρεσία τη μέρα, με τη θέση ως λόγο', () => {
    const D = '2026-10-17';
    let s = W(fakeState(6), [{ pid: 1, weapon: '1' }, { pid: 2, weapon: '2' }, { pid: 3, weapon: '3' }]);
    s = { ...s, guards: { [D]: { sk3a: 1, mg1: 2, op1: 4 } } };
    const info = weaponInfo(s, D);
    expect(inOutText(s.people[0], info)).toMatch(/^ΕΚΤΟΣ: Σκοπ/);
    expect(inOutText(s.people[1], info)).toBe('ΕΝΤΟΣ');
    expect(inOutText(s.people[3], info)).toMatch(/^ΕΚΤΟΣ: Οπλοφύλακας/);
    expect(s.people.filter(p => weaponMatch('out', p, info)).map(p => p.id)).toEqual([1, 4]);
    expect(weaponInfo(s).out.size).toBe(0);
    const row = weaponSheets(s, D)[0].rows[0];
    expect(String(row[row.length - 2])).toMatch(/^ΕΚΤΟΣ/);
  });
});

describe('Έξοδοι και είσοδοι όπλων', () => {
  const armedState = () => W(fakeState(6), [{ pid: 1, weapon: '111' }, { pid: 2, weapon: '222' }, { pid: 3, weapon: '333' }]);
  it('έξοδος με λόγο και ώρα: όσοι έχουν όπλο, μία φορά ο καθένας', () => {
    const r = run(armedState(), { t: 'weaponOut', pids: [1, 2, 4], reason: ' εκπ ', day: '2026-10-18', time: '8.15' });
    expect(r.state.weaponLog.map(m => [m.pid, m.weapon, m.reason, m.outTime])).toEqual([[1, '111', 'ΕΚΠ', '08:15'], [2, '222', 'ΕΚΠ', '08:15']]);
    expect(r.text).toMatch(/χωρίς αριθμό όπλου/);
    const info = weaponInfo(r.state, '2026-10-18');
    expect(r.state.people.filter(p => weaponMatch('out', p, info)).map(p => p.id)).toEqual([1, 2]);
    expect(inOutText(r.state.people[0], info)).toBe('ΕΚΤΟΣ: ΕΚΠ από 18/10 08:15');
    // ήδη εκτός ή χωρίς όπλο: δεν ξαναβγαίνει
    expect(() => run(r.state, { t: 'weaponOut', pids: [1, 4], reason: 'ΒΟΛΗ', day: '2026-10-18', time: '09:00' })).toThrow(/ήδη εκτός/);
    expect(() => run(r.state, { t: 'weaponOut', pids: [3], reason: 'ΒΟΛΗ', day: '2026-10-18', time: '' })).toThrow(/ώρα/);
  });
  it('είσοδος: ο λόγος εισαγωγής από τη λίστα (ΕΚΠ → ΛΗΞ ΕΚΠ), ή δικός σου', () => {
    let s = run(armedState(), { t: 'weaponOut', pids: [1, 2], reason: 'ΕΚΠ', day: '2026-10-18', time: '08:15' }).state;
    const [a, b] = s.weaponLog;
    expect(() => run(s, { t: 'weaponIn', ids: [a.id], day: '2026-10-18', time: '08:00' })).toThrow(/πριν την έξοδο/);
    s = run(s, { t: 'weaponIn', ids: [a.id], day: '2026-10-18', time: '12:30' }).state;
    expect(s.weaponLog[0]).toMatchObject({ inDay: '2026-10-18', inTime: '12:30', inReason: 'ΛΗΞ ΕΚΠ' });
    s = run(s, { t: 'weaponIn', ids: [b.id], day: '2026-10-18', time: '13:00', reason: 'επιστροφη νωρις' }).state;
    expect(s.weaponLog[1].inReason).toBe('ΕΠΙΣΤΡΟΦΗ ΝΩΡΙΣ');
    expect(weaponInfo(s, '2026-10-18').moves.size).toBe(0);
  });
  it('δικός σου λόγος με δικό του λόγο εισαγωγής· χωρίς: «ΛΗΞ <λόγος>»', () => {
    const lists = { weaponOut: { add: [{ name: 'ΦΡΟΥΡΑ', back: 'ΑΛΛΑΓΗ ΦΡΟΥΡΑΣ' }, { name: 'ΠΑΡΕΛΑΣΗ' }] } };
    expect(weaponBack('φρουρα', lists)).toBe('ΑΛΛΑΓΗ ΦΡΟΥΡΑΣ');
    expect(weaponBack('ΠΑΡΕΛΑΣΗ', lists)).toBe('ΛΗΞ ΠΑΡΕΛΑΣΗ');
    expect(weaponBack('ΒΟΛΗ', lists)).toBe('ΛΗΞ ΒΟΛΗΣ');
  });
  it('διόρθωση ωρών, ξανά εκτός, σβήσιμο', () => {
    let s = run(armedState(), { t: 'weaponOut', pids: [1], reason: 'ΒΟΛΗ', day: '2026-10-18', time: '07:00' }).state;
    const id = s.weaponLog[0].id;
    s = run(s, { t: 'weaponIn', ids: [id], day: '2026-10-18', time: '15:00' }).state;
    s = run(s, { t: 'editWeaponMove', id, patch: { outTime: '06:45', inTime: '14:10' } }).state;
    expect(s.weaponLog[0]).toMatchObject({ outTime: '06:45', inTime: '14:10', inReason: 'ΛΗΞ ΒΟΛΗΣ' });
    expect(() => run(s, { t: 'editWeaponMove', id, patch: { inTime: '06:00' } })).toThrow(/πριν την έξοδο/);
    s = run(s, { t: 'editWeaponMove', id, patch: { inDay: '' } }).state;
    expect(s.weaponLog[0].inDay).toBeUndefined();
    expect(run(s, { t: 'deleteWeaponMove', id }).state.weaponLog).toEqual([]);
  });
  it('Excel: φύλλο «ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ» με όσα κινήθηκαν τη μέρα ή είναι ακόμα εκτός', () => {
    let s = run(armedState(), { t: 'weaponOut', pids: [1, 2], reason: 'ΕΚΠ', day: '2026-10-17', time: '08:00' }).state;
    s = run(s, { t: 'weaponIn', ids: [s.weaponLog[0].id], day: '2026-10-17', time: '13:00' }).state;
    const day18 = weaponSheets(s, '2026-10-18').find(x => x.name === 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ')!;
    expect(day18.rows.map(r => [r[4], r[8]])).toEqual([['222', 'ΕΚΤΟΣ']]);
    const day17 = weaponSheets(s, '2026-10-17').find(x => x.name === 'ΚΙΝΗΣΕΙΣ ΟΠΛΩΝ')!;
    expect(day17.rows.map(r => [r[4], r[5], r[6], r[7], r[8]])).toEqual([['111', 'ΕΚΠ', '17/10/2026 08:00', 'ΛΗΞ ΕΚΠ', '17/10/2026 13:00'], ['222', 'ΕΚΠ', '17/10/2026 08:00', '', 'ΕΚΤΟΣ']]);
  });
});

describe('Οπλοβαστός + Θέση = ζεύγος', () => {
  const seats = (rows: [number, string, string][]) => {
    const base = W(fakeState(8), rows.map(([pid]) => ({ pid, weapon: String(900 + pid) })));
    return run(base, { t: 'setWeapons', changes: rows.map(([pid, rack, wpos]) => ({ pid, rack, wpos })) }).state;
  };
  const dupIds = (s: AppState) => { const info = weaponInfo(s); return s.people.filter(p => weaponMatch('dup', p, info)).map(p => p.id); };
  it('Ε+22 και Ε+23 είναι άλλες θέσεις· Ε+23 σε δύο είναι ίδια (και «Ε 23» = «ε23» = «E-23»)', () => {
    expect(dupIds(seats([[1, 'Ε', '22'], [2, 'Ε', '23']]))).toEqual([]);
    expect(seatKey('Ε', '23')).toBe(seatKey(' ε ', '23'));
    expect(seatKey('E', '2-3')).toBe(seatKey('Ε', '23'));      // λατινικό E, παύλα
    expect(seatKey('Ε', '23')).not.toBe(seatKey('Δ', '23'));
    expect(seatKey('', '23')).toBe('');
    const s = seats([[1, 'Ε', '23'], [2, 'ε', ' 23 '], [3, 'Δ', '23']]);
    expect(dupIds(s)).toEqual([1, 2]);
    const info = weaponInfo(s);
    expect(sameRack(info, s.people[0]).map(p => p.id)).toEqual([2]);
    expect(sameRack(info, s.people[0], 'Δ', '23').map(p => p.id)).toEqual([3]);
    expect(seatTxt(s.people[1].rack, s.people[1].wpos)).toBe('Ε 23');
  });
  it('εκτός δύναμης δεν μετράει στη θέση', () => {
    const s0 = seats([[1, 'Ε', '5'], [2, 'Ε', '5']]);
    const s = { ...s0, people: s0.people.map(p => (p.id === 2 ? { ...p, active: false } : p)) };
    expect(dupIds(s)).toEqual([]);
  });
  it('οπλοβαστός χωρίς θέση: «Χωρίς θέση» μόνο για σε δύναμη με όπλο', () => {
    const s = seats([[1, 'Ε', ''], [2, 'Ε', '3']]);
    expect(noSeat(s.people[0])).toBe(true);
    expect(noSeat(s.people[1])).toBe(false);
    expect(noSeat({ ...s.people[0], weapon: undefined })).toBe(false);
    expect(noSeat({ ...s.people[0], active: false })).toBe(false);
    expect(noSeat(s.people[2])).toBe(false);      // χωρίς οπλοβαστό
    expect(noSeat({ ...s.people[0], wpos: 'Α' })).toBe(false);
  });
  it('ταξινόμηση «Οπλοβ.»: οπλοβαστός, μετά θέση αριθμητικά (Ε 2 πριν Ε 10), χωρίς οπλοβαστό στο τέλος', () => {
    const s = seats([[1, 'Ε', '10'], [2, 'Ε', '2'], [3, 'Δ', '7'], [4, 'Ε', '']]);
    const ids = [...s.people.slice(0, 6)].sort(bySeat).map(p => p.id);
    expect(ids).toEqual([3, 4, 2, 1, 5, 6]);
  });
});
