// Οπλισμός: αριθμοί όπλων, φίλτρα (χωρίς όπλο, άοπλοι με όπλο, ίδιος αριθμός, να παραδώσουν) και το Excel
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { apply, type Command, type Ctx } from '../src/shared/commands';
import { W_NUM, inOutText, normRack, normWeapon, rackKey, weaponInfo, weaponKey, weaponMatch, weaponSheets } from '../src/shared/weapons';
import { weaponsBook } from '../src/main/excel';
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
    expect(sh.map(x => x.name)).toEqual(['ΟΠΛΙΣΜΟΣ', 'ΜΕ ΟΠΛΟ', 'ΕΚΤΟΣ ΟΠΛΟΒΑΣΤΟΥ', 'ΧΩΡΙΣ ΟΠΛΟ', 'ΑΟΠΛΟΙ ΜΕ ΟΠΛΟ', 'ΙΔΙΟΣ ΑΡΙΘΜΟΣ', 'ΝΑ ΠΑΡΑΔΩΣΟΥΝ']);
    expect(sh[0].head.slice(-5)).toEqual(['ΤΥΠΟΣ ΟΠΛΟΥ', 'ΑΡΙΘΜΟΣ ΟΠΛΟΥ', 'ΟΠΛΟΒΑΣΤΟΣ', 'ΕΝΤΟΣ / ΕΚΤΟΣ', 'ΥΠΟΓΡΑΦΗ']);
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
