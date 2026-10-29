// Έντυπα (Michael, 19/10): δικά σου πρότυπα Excel, «Φτιάξ' το εδώ», αντιστοίχιση στηλών, τυχαία επιλογή
import { describe, it, expect } from 'vitest';
import { apply, type Ctx } from '../src/shared/commands';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport, inspectTemplate, previewReport } from '../src/main/reports';
import { PRESETS, candidates, defaultPick, guessField, pickRandom, replaceOne, rowsOf, sortRows, type Report } from '../src/shared/reports';
import { fakeState as fakeNew } from './fixtures';
// η παλιά διάταξη (κεφαλίδα αριστερά, ημερομηνία δεξιά): αυτά τα τεστ δεν αφορούν τη θέση τους (head-date-swap.test.ts)
const fakeState: typeof fakeNew = n => { const s = fakeNew(n); return { ...s, settings: { ...s.settings, hdLeft: true } }; };

const D = '2026-10-19';
let seq = 0;
const ctx: Ctx = { today: D, newId: () => 'x' + ++seq };
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Αγγαρεία', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
// σειρά από 0 με τιμές (σαν το rnd των τεστ): ίδιο αποτέλεσμα κάθε φορά
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// Πρότυπο σαν αυτά που φτιάχνει κανείς στο Excel: κεφαλίδα, τίτλος, επικεφαλίδες στη γραμμή 6, 3 έτοιμες γραμμές, υπογραφή από κάτω
async function userTemplate(): Promise<Buffer> {
  const wb = await Workbook.blank('ΚΑΤΑΣΤΑΣΗ'); const ws = await wb.sheet(0);
  const head = await wb.style({ b: true, border: true, h: 'center' }), cell = await wb.style({ border: true });
  ws.set('A1', '{ΚΕΦΑΛΙΔΑ}').set('E1', 'Αυλώνας, {ΗΜΕΡΟΜΗΝΙΑ}').set('A4', 'ΚΑΤΑΣΤΑΣΗ ΑΓΓΑΡΕΙΑΣ');
  ['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'Α.Σ.Μ.', 'ΥΠΟΓΡΑΦΗ'].forEach((h, i) => ws.set('ABCDE'[i] + '6', h).setStyle('ABCDE'[i] + '6', head));
  for (let r = 7; r <= 9; r++) for (const c of 'ABCDE') ws.setStyle(c + r, cell);
  ws.set('B11', 'Ο ΛΟΧΙΑΣ').set('B14', '{ΛΟΧΙΑΣ}').setFormula('E11', 'COUNTA(C7:C9)');
  return wb.save();
}

describe('Έντυπα', () => {
  it('μαντεύει στοιχεία από τις επικεφαλίδες', () => {
    expect(guessField('people', 'Α/Α')).toBe('aa');
    expect(guessField('people', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ')).toBe('name');
    expect(guessField('people', 'Α.Σ.Μ.')).toBe('asm');
    expect(guessField('people', 'Θάλ.')).toBe('room');
    expect(guessField('people', 'Βαθμός - Ονοματεπώνυμο')).toBe('who');
    expect(guessField('people', 'ΥΠΟΓΡΑΦΗ')).toBe('blank');
    expect(guessField('people', 'ΚΑΤΙ ΑΛΛΟ')).toBeNull();
    expect(guessField('cadre', 'ΑΣΜ')).toBeNull();   // τα στελέχη έχουν ΑΜ
  });

  it('βρίσκει τον πίνακα στο δικό σου Excel και το συμπληρώνει: γραμμές που λείπουν, υπογραφή από κάτω, ετικέτες', async () => {
    const tpl = await userTemplate(); const s = fakeState(12);
    const insp = await inspectTemplate(tpl, 'people');
    expect(insp.head).toBe(6); expect(insp.data).toBe(7); expect(insp.prepared).toBe(3);
    expect(insp.headers.map(h => h.f)).toEqual(['aa', 'rank', 'name', 'asm', 'blank']);
    expect(insp.tags.map(t => t.k).sort()).toEqual(['date', 'head', 'sgtName']);
    const s2 = { ...s, settings: { ...s.settings, signers: { sergeant: 'ΕΠΟΠ ΛΧΙΑΣ ΔΟΚΙΜΙΟΣ', commander: '' } } };
    const r = rep({ sheet: insp.sheet, head: insp.head, cols: insp.headers.map(h => ({ c: h.c, f: h.f!, h: h.text })) });
    const ids = [3, 1, 2, 5, 4];
    const out = await fillReport(tpl, s2, r, ids, D);
    const ws = await (await Workbook.open(out.data)).sheet(0);
    expect(ws.get('A7')).toBe('1'); expect(ws.get('A11')).toBe('5');
    expect(ws.get('C7')).toBe(s.people[2].last + ' ' + s.people[2].first);
    expect(ws.get('D8')).toBe(s.people[0].asm);
    expect(ws.get('E7')).toBeNull();
    // 2 γραμμές μπήκαν: η υπογραφή και ο τύπος κατέβηκαν, ο τύπος μετρά όλο τον πίνακα
    expect(ws.get('B13')).toBe('Ο ΛΟΧΙΑΣ'); expect(ws.get('B16')).toBe('ΕΠΟΠ ΛΧΙΑΣ ΔΟΚΙΜΙΟΣ');
    expect(ws.formula('E13')).toBe('COUNTA(C7:C11)');
    expect(ws.get('E1')).toBe('ΑΥΛΩΝΑΣ, 19/10/2026');
    // η κεφαλίδα 3 γραμμών σε άδεια κελιά από κάτω, μία σε καθένα (όπως στο χαρτί)
    expect(ws.get('A1')).toBe(s.settings.unit[0].toUpperCase()); expect(ws.get('A2')).toBe(s.settings.unit[1].toUpperCase());
    expect(ws.style('B11')).toBe(ws.style('B7'));   // οι νέες γραμμές με τη μορφή της γραμμής-προτύπου
    expect(out.name).toBe('ΑΓΓΑΡΕΙΑ 19-10-2026.xlsx');
  });

  it('λιγότεροι από τις έτοιμες γραμμές: μένουν κενές, ή σβήνονται με «trim»', async () => {
    const tpl = await userTemplate(); const s = fakeState(5);
    const insp = await inspectTemplate(tpl, 'people');
    const r = rep({ sheet: insp.sheet, head: 6, cols: insp.headers.map(h => ({ c: h.c, f: h.f!, h: h.text })) });
    let ws = await (await Workbook.open((await fillReport(tpl, s, r, [1], D)).data)).sheet(0);
    expect(ws.get('C8')).toBeNull(); expect(ws.get('B11')).toBe('Ο ΛΟΧΙΑΣ');
    ws = await (await Workbook.open((await fillReport(tpl, s, { ...r, trim: true }, [1], D)).data)).sheet(0);
    expect(ws.get('B9')).toBe('Ο ΛΟΧΙΑΣ'); expect(ws.formula('E9')).toBe('COUNTA(C7:C7)');
  });

  it('ξαναβρίσκει τις στήλες αν μπήκε γραμμή πάνω από τον πίνακα στο Excel', async () => {
    const tpl = await userTemplate(); const s = fakeState(5);
    const insp = await inspectTemplate(tpl, 'people');
    const r = rep({ sheet: insp.sheet, head: 6, cols: insp.headers.map(h => ({ c: h.c, f: h.f!, h: h.text })) });
    const wb = await Workbook.open(tpl); const ws0 = await wb.sheet(0); ws0.insertRows(2, 1, 2, wb);
    const ws = await (await Workbook.open((await fillReport(await wb.save(), s, r, [1, 2], D)).data)).sheet(0);
    expect(ws.get('C8')).toBe(s.people[0].last + ' ' + s.people[0].first);
    const bad = rep({ ...r, cols: [{ c: 3, f: 'name', h: 'ΚΑΤΙ ΠΟΥ ΔΕΝ ΥΠΑΡΧΕΙ' }, { c: 4, f: 'asm', h: 'ΟΥΤΕ ΑΥΤΟ' }] });
    await expect(fillReport(tpl, s, bad, [1], D)).rejects.toThrow(/Το πρότυπο άλλαξε/);
  });

  it('«Φτιάξ\' το εδώ»: κεφαλίδα, τίτλος, επικεφαλίδες, υπογραφές, και γεμίζει όπως τα ανεβασμένα', async () => {
    const o = PRESETS.find(p => p.id === 'onomastiki')!.opts;
    const b = await buildTemplate(o, 'people');
    expect(b.head).toBe(7); expect(b.cols.map(c => c.f)).toEqual(['aa', 'rank', 'name', 'asm', 'room', 'blank']);
    const s = fakeState(30);
    const r = rep({ sheet: b.sheet, head: b.head, cols: b.cols, cells: b.cells });
    const out = await fillReport(b.data, s, r, s.people.slice(0, 25).map(p => p.id), D);
    const wb = await Workbook.open(out.data); const ws = await wb.sheet(0);
    expect(ws.get('A1')).toBe(s.settings.unit[0].toUpperCase());
    expect(ws.get('E1')).toMatch(/19 ΟΚΤ 26$/);
    expect(ws.get('A5')).toBe('ΟΝΟΜΑΣΤΙΚΗ ΚΑΤΑΣΤΑΣΗ');
    expect(ws.get('C7')).toBe('ΟΝΟΜΑΤΕΠΩΝΥΜΟ'); expect(ws.get('C32')).toBe(s.people[24].last + ' ' + s.people[24].first);
    expect(ws.get('A34')).toBe('Ο'); expect(ws.get('A35')).toBe('ΛΟΧΙΑΣ'); expect(ws.get('D34')).toBe('Ο'); expect(ws.get('D35')).toBe('ΔΙΟΙΚΗΤΗΣ');
    expect(ws.get('A39')).toBeNull();   // χωρίς όνομα στις Ρυθμίσεις: κενό για να υπογράψει
    expect(ws.dump().print).toMatch(/fitToWidth="1"/);
    // και η εκτύπωση: πρώτη σελίδα, με κελιά που διαλέγονται
    const pv = await previewReport(b.data, s, r, s.people.map(p => p.id), D);
    expect(pv.pages).toBeGreaterThanOrEqual(1); expect(pv.html).toContain('data-a="C8"');
  });

  it('ποιοι μπαίνουν: παρόντες χωρίς υπηρεσία σήμερα ή αύριο, θάλαμοι, Σ.Ι.', () => {
    let s = fakeState(40);
    s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [1, 2], from: D, to: '2026-10-25' } }, ctx).state;
    s = apply(s, { t: 'autofill', date: D }, ctx).state;
    const busy = new Set(Object.values(s.guards[D] || {}));
    const c = candidates(s, rep({ pick: defaultPick('random') }), D);
    expect(c.some(p => p.id === 1 || p.id === 2)).toBe(false);
    expect(c.some(p => busy.has(p.id as number))).toBe(false);
    expect(candidates(s, rep({ pick: { from: 'all', mode: 'all', rooms: [3] } }), D).every(p => (p as any).room === 3)).toBe(true);
    expect(candidates(s, rep({ pick: { from: 'all', mode: 'all', si: ['Ι3 ΑΟΠΛΟ'] } }), D).length).toBe(4);
    expect(rowsOf(s, rep({ pick: { from: 'all', mode: 'first', n: 5 }, sort: 'room' }), D).length).toBe(5);
  });

  it('τυχαία επιλογή: n διαφορετικοί, ισομερώς ανά θάλαμο, αλλαγή ενός', () => {
    const s = fakeState(80); const list = candidates(s, rep({}), D);
    const p = pickRandom(list, 57, false, seeded(3));
    expect(new Set(p.map(x => x.id)).size).toBe(57);
    const e = pickRandom(list, 16, true, seeded(5));
    const per = new Map<number, number>(); e.forEach(x => per.set((x as any).room, (per.get((x as any).room) || 0) + 1));
    expect([...per.values()]).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
    expect(pickRandom(list, 500).length).toBe(80);
    const r = replaceOne(p, 0, list, seeded(9))!;
    expect(r[0].id).not.toBe(p[0].id); expect(new Set(r.map(x => x.id)).size).toBe(57);
    expect(replaceOne(list, 0, list)).toBeNull();
    expect(sortRows(p, 'name', s, 'people')[0].last <= sortRows(p, 'name', s, 'people')[1].last).toBe(true);
  });
});
