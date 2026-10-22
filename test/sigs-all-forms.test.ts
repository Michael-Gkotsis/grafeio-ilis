// Υπογραφές και θέσεις σε όλα τα έντυπα (Michael, 22/10): και στα Excel της εφαρμογής (Έλεγχος υπηρεσιών, Δυναμολόγιο,
// Στελέχη, Οπλισμός), και σε δικό σου πρότυπο που δεν έχει θέση για υπογραφές.
import { describe, it, expect } from 'vitest';
import { dutyCheck, rosterLists, rosterPreview, rosterPrint, weaponsBook } from '../src/main/excel';
import { signMade } from '../src/main/exports';
import { fillReport } from '../src/main/reports';
import { Workbook, colName } from '../src/main/xlsx';
import { defaultPick, type Report } from '../src/shared/reports';
import { MADE_FORMS, SIG_FORMS, sigFormOf, sigsSaved, type Sig } from '../src/shared/sigs';
import { LAYOUT_SHEETS, blockLabel } from '../src/shared/layout';
import { fakeState } from './fixtures';

const D = '2026-10-17';
const two: Sig[] = [{ art: 'Ο', title: 'ΑΛΧΙΑΣ ΙΛΗΣ', name: 'Λοχιας Δοκιμης' }, { art: 'Ο', title: 'ΔΚΤΗΣ ΙΛΗΣ' }];
const withSet = (s: any, x: any) => ({ ...s, settings: { ...s.settings, ...x } });
// οι τιμές όπως τις δείχνει το Excel (και οι κοινές συμβολοσειρές του ExcelJS)
async function dump(data: Buffer, sheet: number | string = 0): Promise<Record<string, string>> {
  const wb = await Workbook.open(data); const name = typeof sheet === 'number' ? wb.sheetNames()[sheet] : sheet; const out: Record<string, string> = {};
  (await wb.values(name, 400, 60)).forEach((row, i) => (row || []).forEach((v, j) => { if (v != null && String(v) !== '') out[colName(j + 1) + (i + 1)] = String(v); }));
  return out;
}
const where = (cells: Record<string, string>, v: string) => Object.keys(cells).filter(k => cells[k] === v);

describe('υπογραφές σε όλα τα έντυπα', () => {
  it('κάθε έντυπο έχει λίστα υπογραφών και θέσεις στο χαρτί· τα Excel της εφαρμογής αρχικά χωρίς υπογραφές', () => {
    for (const f of SIG_FORMS) if (f !== 'reports') expect(LAYOUT_SHEETS[f].length).toBeGreaterThan(0);
    for (const f of MADE_FORMS) expect(sigsSaved(fakeState(3).settings, f)).toEqual([]);
    expect(sigFormOf('check')).toBe('check'); expect(sigFormOf('outsPsk')).toBe('outs');
    expect(blockLabel('title')).toBe('Τίτλος');
  });

  it('χωρίς υπογραφές και μετακινήσεις το Excel της εφαρμογής μένει όπως ήταν', async () => {
    const s = fakeState(12);
    const m = await rosterPrint(s, D);
    const r = await signMade(m.data, s, 'roster', m.marks);
    expect(await dump(r.data)).toEqual(await dump(m.data));
    expect(r.layout[0].blocks.map(b => b.id)).toEqual(['head', 'date', 'title']);
  });

  it('Συνολικό Δυναμολόγιο: οι υπογραφές μία γραμμή κάτω από τον πίνακα, με κεφαλαία, το όνομα πιο κάτω', async () => {
    const s = withSet(fakeState(12), { sigs: { roster: two } });
    const m = await rosterPrint(s, D);
    const r = await signMade(m.data, s, 'roster', m.marks);
    const c = await dump(r.data); const foot = m.marks[0].foot;
    const [a] = where(c, 'ΑΛΧΙΑΣ ΙΛΗΣ'), [b] = where(c, 'ΔΚΤΗΣ ΙΛΗΣ'), [n] = where(c, 'ΛΟΧΙΑΣ ΔΟΚΙΜΗΣ');
    expect(+a.replace(/[A-Z]+/, '')).toBe(foot + 3); expect(+b.replace(/[A-Z]+/, '')).toBe(foot + 3);
    expect(+n.replace(/[A-Z]+/, '')).toBe(foot + 3 + 4);
    expect(c['A' + (foot + 2)]).toBe('Ο');
    expect(Object.values(c)).not.toContain('{ΥΠΟΓΡΑΦΕΣ}');
    expect(r.layout[0].blocks.map(b => b.id)).toEqual(['head', 'date', 'title', 's0', 's1']);
  });

  it('μία φορά (over): άλλες υπογραφές μόνο για αυτό το αρχείο, σε κάθε φύλλο του Excel', async () => {
    const s = fakeState(12);
    const m = await rosterLists(s, D);
    const r = await signMade(m.data, s, 'roster', m.marks, [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }]);
    const wb = await Workbook.open(r.data);
    for (const n of wb.sheetNames()) expect(Object.values(await dump(r.data, n))).toContain('ΕΠΟΠΤΗΣ');
    expect(new Set(r.layout.map(l => l.key))).toEqual(new Set(['lists']));
  });

  it('το «Ο» μέσα στα δεδομένα δεν είναι υπογραφή: τίποτα δεν σβήνεται όταν βγάζεις όλες', async () => {
    const s = withSet(fakeState(6), { sigs: { check: [] } });
    s.people[0] = { ...s.people[0], last: 'Ο', first: 'ΤΕΣΤ' };
    const m = await dutyCheck(s, '2026-10');
    const r = await signMade(m.data, s, 'check', m.marks);
    expect(await dump(r.data)).toEqual(await dump(m.data));
  });

  it('θέσεις: ο τίτλος, η κεφαλίδα και οι υπογραφές μετακινούνται (στον Οπλισμό ξεχωριστά η κατάσταση και τα άλλα φύλλα)', async () => {
    const s = withSet(fakeState(8), { sigs: { weapons: two }, layout: { weapons: { main: { head: [0, 2], s1: [2, 0] }, rest: { title: [1, 0] } } } });
    const m = await weaponsBook(s, D);
    const r = await signMade(m.data, s, 'weapons', m.marks);
    const first = await dump(r.data, 0);
    expect(first.C1).toBe(s.settings.unit[0].toUpperCase()); expect(first.A1).toBeUndefined();
    const [b] = where(first, 'ΔΚΤΗΣ ΙΛΗΣ'); expect(+b.replace(/[A-Z]+/, '')).toBe(m.marks[0].foot + 3 + 2);
    const second = await dump(r.data, 1);
    expect(second.A1).toBeUndefined(); expect(second.A2).toBeTruthy();
    expect(r.layout.find(l => l.key === 'rest')!.blocks.find(b => b.id === 'title')).toMatchObject({ r1: 2 });
  });

  it('«Θέσεις στο χαρτί» του Δυναμολογίου: το συνολικό και ένα φύλλο του Excel στο ίδιο αρχείο', async () => {
    const s = withSet(fakeState(8), { sigs: { roster: two } });
    const m = await rosterPreview(s, D);
    expect(m.marks.map(x => x.key)).toEqual(['print', 'lists']);
    const r = await signMade(m.data, s, 'roster', m.marks);
    expect(r.layout.map(l => l.blocks.filter(b => /^s/.test(b.id)).length)).toEqual([2, 2]);
  });

  it('δικό σου πρότυπο χωρίς θέση για υπογραφές: μπαίνουν κάτω από τον πίνακα, στο πλάτος του', async () => {
    const wb = await Workbook.blank('Λ'); const ws = await wb.sheet(0);
    ['Α/Α', 'ΒΑΘΜΟΣ', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ'].forEach((h, i) => ws.set(colName(i + 1) + 3, h));
    ws.set('A1', 'ΚΑΤΑΣΤΑΣΗ');
    const tpl = await wb.save();
    const s = fakeState(10); const ids = s.people.slice(0, 4).map(p => p.id);
    const rep: Report = { id: 'r', name: 'Λ', tpl: 't', kind: 'people', sheet: 'Λ', head: 3, cols: [{ c: 1, f: 'aa', h: 'Α/Α' }, { c: 3, f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ' }], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', sigs: two };
    const out = await fillReport(tpl, s, rep, ids, D);
    expect(out.warnings).toEqual([]);
    const c = await dump(out.data);
    const [a] = where(c, 'ΑΛΧΙΑΣ ΙΛΗΣ'), [b] = where(c, 'ΔΚΤΗΣ ΙΛΗΣ');
    expect(c.A9).toBe('Ο'); expect(a).toBe('A10'); expect(b).not.toBe('B10'); expect(b.endsWith('10')).toBe(true);   // 4 γραμμές ως τη 7, κενή η 8
    const none = await dump((await fillReport(tpl, s, { ...rep, sigs: undefined }, ids, D)).data);
    expect(Object.values(none)).not.toContain('ΑΛΧΙΑΣ ΙΛΗΣ');
  });
});
