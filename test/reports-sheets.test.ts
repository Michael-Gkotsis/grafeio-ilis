// Έντυπα, φάση 2 (Michael, 19/10): φύλλα ανά θάλαμο, φύλλο μέσα στο Δυναμολόγιο, Καταστάσεις, «πρώτα όσοι βγήκαν λιγότερο»
import { describe, it, expect } from 'vitest';
import { apply, type Ctx } from '../src/shared/commands';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport, placeSheets } from '../src/main/reports';
import { PRESETS, candidates, defaultPick, fieldValue, groupsOf, pickRandom, replaceOne, rowsOf, type Report, type StatusRow } from '../src/shared/reports';
import { fakeState } from './fixtures';

const D = '2026-10-19';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'x' + ++seq };
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Αγγαρεία', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
async function built(kind: Report['kind'] = 'people') {
  const b = await buildTemplate(PRESETS[0].opts, kind);
  return { data: b.data, r: rep({ kind, sheet: b.sheet, head: b.head, cols: b.cols, cells: b.cells }) };
}

describe('Έντυπα: φύλλα', () => {
  it('ομάδες ανά θάλαμο, ουλαμό, Σ.Ι.· όσοι δεν έχουν πάνε στο τέλος', () => {
    const s = fakeState(40); const rows = candidates(s, rep({}), D);
    const g = groupsOf(s, 'people', rows, 'room');
    expect(g.map(x => x.label)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => 'ΘΑΛΑΜΟΣ ' + n));
    expect(g.reduce((n, x) => n + x.rows.length, 0)).toBe(40);
    expect(g[0].short).toBe('Θ1');
    const s2 = { ...s, people: s.people.map((p, i) => (i === 0 ? { ...p, room: null } : p)) };
    const g2 = groupsOf(s2, 'people', candidates(s2, rep({}), D), 'room');
    expect(g2[g2.length - 1].label).toBe('ΧΩΡΙΣ ΘΑΛΑΜΟ');
    expect(groupsOf(s, 'people', rows, 'si').every(x => x.rows.every(p => (p as any).si === x.label || !(p as any).si))).toBe(true);
    expect(groupsOf(s, 'cadre', rows, 'room')).toHaveLength(1);   // τα στελέχη δεν χωρίζονται
  });

  it('χωρισμός σε φύλλα: ένα φύλλο ανά θάλαμο με το ίδιο πρότυπο, ομάδα δίπλα στον τίτλο', async () => {
    const s = fakeState(24); const { data, r } = await built();
    const out = await fillReport(data, s, { ...r, split: 'room' }, s.people.map(p => p.id), D);
    expect(out.sheets).toEqual(['ΘΑΛΑΜΟΣ 1', 'ΘΑΛΑΜΟΣ 2', 'ΘΑΛΑΜΟΣ 3', 'ΘΑΛΑΜΟΣ 4', 'ΘΑΛΑΜΟΣ 5', 'ΘΑΛΑΜΟΣ 6', 'ΘΑΛΑΜΟΣ 7', 'ΘΑΛΑΜΟΣ 8']);
    const wb = await Workbook.open(out.data);
    expect(wb.sheetNames()).toEqual(out.sheets);
    const t = r.cells[0].ref;
    const w3 = await wb.sheet('ΘΑΛΑΜΟΣ 3');
    expect(String(w3.get(t))).toContain('ΘΑΛΑΜΟΣ 3');
    const vals = (await wb.values('ΘΑΛΑΜΟΣ 3', 60, 8)).flat().map(String);
    const room3 = s.people.filter(p => p.room === 3);
    expect(room3.length).toBeGreaterThan(0);
    for (const p of room3) expect(vals.some(v => v.includes(p.last.toUpperCase()))).toBe(true);
    expect(vals.some(v => v.includes(s.people.find(p => p.room === 4)!.last.toUpperCase()))).toBe(false);
    // με prefix (φύλλα στο Δυναμολόγιο): «ΑΓΓΑΡΕΙΑ Θ3»· παλιές ομάδες χωρίς κανέναν γράφονται άδειες
    const o2 = await fillReport(data, s, { ...r, split: 'room' }, s.people.filter(p => p.room === 1).map(p => p.id), D, { prefix: 'ΑΓΓΑΡΕΙΑ', stale: [{ key: '002', label: 'ΘΑΛΑΜΟΣ 2', short: 'Θ2' }] });
    expect(o2.sheets).toEqual(['ΑΓΓΑΡΕΙΑ Θ1', 'ΑΓΓΑΡΕΙΑ Θ2']);
  });

  it('{ΟΜΑΔΑ} στο πρότυπο: γράφεται εκεί και ο τίτλος μένει όπως είναι', async () => {
    const s = fakeState(16); const { data, r } = await built();
    const wb0 = await Workbook.open(data); const ws0 = await wb0.sheet(r.sheet); ws0.set('A1', '{ΟΜΑΔΑ}');
    const out = await fillReport(await wb0.save(), s, { ...r, split: 'room' }, s.people.map(p => p.id), D);
    const ws = await (await Workbook.open(out.data)).sheet('ΘΑΛΑΜΟΣ 2');
    expect(ws.get('A1')).toBe('ΘΑΛΑΜΟΣ 2');
    expect(String(ws.get(r.cells[0].ref))).not.toContain('ΘΑΛΑΜΟΣ');
  });

  it('φύλλο σε άλλο Excel: μπαίνει με τη μορφή του, τα άλλα φύλλα δεν αλλάζουν, ξαναγράφεται στη θέση του', async () => {
    const s = fakeState(10); const { data, r } = await built();
    const out = await fillReport(data, s, r, s.people.map(p => p.id), D);
    // ένα «Δυναμολόγιο» με δικά του στυλ, κοινά κείμενα και τύπους
    const tw = await Workbook.blank('ΔΥΝΑΜΟΛΟΓΙΟ'); const ts = await tw.sheet(0);
    const bold = await tw.style({ b: true, border: true });
    ts.set('A1', 'ΕΠΩΝΥΜΟ').setStyle('A1', bold).set('A2', 'ΠΑΠΑΔΟΠΟΥΛΟΣ').setFormula('B2', 'LEN(A2)');
    await tw.addSheet('ΣΗΜΕΙΩΣΕΙΣ');
    const target = await tw.save();
    // φύλλο με ίδιο όνομα που δεν το έφτιαξε το έντυπο: δεν γράφεται χωρίς «ναι» (κεφαλαία-μικρά δεν μετράνε)
    expect((await placeSheets(target, out.data, [[out.sheets[0], 'σημειωσεις']], [])).clash).toEqual(['ΣΗΜΕΙΩΣΕΙΣ']);
    const p1 = await placeSheets(target, out.data, [[out.sheets[0], 'ΑΓΓΑΡΕΙΑ']], []);
    expect(p1.clash).toBeUndefined();
    const wb = await Workbook.open(p1.data!);
    expect(wb.sheetNames()).toEqual(['ΔΥΝΑΜΟΛΟΓΙΟ', 'ΣΗΜΕΙΩΣΕΙΣ', 'ΑΓΓΑΡΕΙΑ']);
    expect([...wb.reportSheets()]).toEqual(['ΑΓΓΑΡΕΙΑ']);   // σημάδι μέσα στο αρχείο: η εφαρμογή δεν το παίρνει για δικό της φύλλο
    const d0 = await wb.sheet('ΔΥΝΑΜΟΛΟΓΙΟ');
    expect(d0.get('A2')).toBe('ΠΑΠΑΔΟΠΟΥΛΟΣ'); expect(d0.formula('B2')).toBe('LEN(A2)');
    // ίδια κείμενα και ίδια μορφή (έντονα επικεφαλίδες) με το έντυπο
    const src = await (await Workbook.open(out.data)).values(out.sheets[0], 40, 8);
    expect(await wb.values('ΑΓΓΑΡΕΙΑ', 40, 8)).toEqual(src);
    const st = (await wb.sheet('ΑΓΓΑΡΕΙΑ')).style('B' + r.head);
    expect(st).toBeGreaterThan(0);
    // δεύτερη φορά (το έντυπο το έφτιαξε, άρα δεν ρωτά): στην ίδια θέση, με τα νέα στοιχεία
    const out2 = await fillReport(data, s, r, [s.people[0].id], D);
    const p2 = await placeSheets(p1.data!, out2.data, [[out2.sheets[0], 'ΑΓΓΑΡΕΙΑ']], ['ΑΓΓΑΡΕΙΑ']);
    const wb2 = await Workbook.open(p2.data!);
    expect((await wb2.sheet('ΑΓΓΑΡΕΙΑ')).style('B' + r.head)).toBe(st);
    expect([...wb2.reportSheets()]).toEqual(['ΑΓΓΑΡΕΙΑ']);   // ένα σημάδι, όχι δύο   // ίδιο στυλ ξανά, όχι νέο σε κάθε γράψιμο
    expect(wb2.sheetNames()).toEqual(['ΔΥΝΑΜΟΛΟΓΙΟ', 'ΣΗΜΕΙΩΣΕΙΣ', 'ΑΓΓΑΡΕΙΑ']);
    const v2 = (await wb2.values('ΑΓΓΑΡΕΙΑ', 40, 8)).flat().map(String);
    expect(v2.some(v => v.includes(s.people[1].last.toUpperCase()))).toBe(false);
    // με «ναι»: γράφεται και πάνω σε ξένο φύλλο
    const p3 = await placeSheets(p2.data!, out2.data, [[out2.sheets[0], 'ΣΗΜΕΙΩΣΕΙΣ']], null);
    expect((await Workbook.open(p3.data!)).sheetNames()).toEqual(['ΔΥΝΑΜΟΛΟΓΙΟ', 'ΣΗΜΕΙΩΣΕΙΣ', 'ΑΓΓΑΡΕΙΑ']);
  });

  it('Καταστάσεις: μία γραμμή ανά ιατρικό, ποινή ή άδεια, όσες ισχύουν ή από τη μέρα και μετά', () => {
    let s = fakeState(20);
    s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [1], from: D, to: '2026-10-25' } }, ctx).state;
    s = apply(s, { t: 'declare', cmd: { type: 'EY', pids: [2, 3], from: '2026-10-17', to: '2026-10-20' } }, ctx).state;
    s = apply(s, { t: 'declare', cmd: { type: 'EY', pids: [4], from: '2026-10-22', to: '2026-10-23' } }, ctx).state;
    const on = candidates(s, rep({ kind: 'status', pick: { from: 'all', mode: 'all', when: 'on' } }), D) as StatusRow[];
    expect(on.map(x => x.pid).sort()).toEqual([1, 2, 3]);
    const from = candidates(s, rep({ kind: 'status', pick: { from: 'all', mode: 'all', when: 'from' } }), D) as StatusRow[];
    expect(from.map(x => x.pid).sort()).toEqual([1, 2, 3, 4]);
    const med = candidates(s, rep({ kind: 'status', pick: { from: 'all', mode: 'all', cats: ['med'] } }), D) as StatusRow[];
    expect(med.map(x => x.pid).sort()).toEqual([2, 3]);
    const x = on.find(r => r.pid === 1)!;
    expect(fieldValue(s, 'status', x, 'from', 0, D)).toBe('19/10/2026');
    expect(fieldValue(s, 'status', x, 'to', 0, D)).toBe('25/10/2026');
    expect(fieldValue(s, 'status', x, 'last', 0, D)).toBe(s.people[0].last);
    expect(rowsOf(s, rep({ kind: 'status', pick: { from: 'all', mode: 'all', when: 'from' }, sort: 'from' }), D).map(r => (r as StatusRow).pid)[0]).not.toBe(4);
  });

  it('«Πρώτα όσοι βγήκαν λιγότερες φορές»: πρώτα όσοι δεν βγήκαν, τυχαία ανάμεσά τους', () => {
    const s = fakeState(30); const list = candidates(s, rep({}), D);
    const times: Record<string, number> = {}; list.slice(0, 20).forEach(p => { times[p.id] = 1; });
    const p = pickRandom(list, 5, false, seeded(7), times);
    expect(p.every(x => !times[x.id])).toBe(true);
    const q = pickRandom(list, 15, false, seeded(7), times);
    expect(q.filter(x => !times[x.id])).toHaveLength(10);
    const r = replaceOne(p, 0, list, seeded(2), times)!;
    expect(times[r[0].id]).toBeUndefined();
  });
});
