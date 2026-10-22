// Έντυπα (Michael, 22/10: «οι υπογραφές που έβαλα αγνοήθηκαν στο βγάλε και έμειναν οι default»): οι δικές του υπογραφές
// μπαίνουν στη θέση των υπογραφών του προτύπου και όταν αυτές είναι γραμμένες σε ένα κελί («Ο ΛΟΧΙΑΣ», όπως τα «Φτιάξ'
// το εδώ» πριν τις 22/10), και τα ονόματα των παλιών φεύγουν. Ο τίτλος σύρεται κι αυτός («Θέσεις στο χαρτί»).
import { describe, it, expect } from 'vitest';
import { buildTemplate, fillReport } from '../src/main/reports';
import { Workbook, colName } from '../src/main/xlsx';
import { PRESETS, defaultPick, type BuildOpts, type Report } from '../src/shared/reports';
import type { Sig } from '../src/shared/sigs';
import { fakeState } from './fixtures';

const D = '2026-10-22';
const own: Sig[] = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ', name: 'Λχιας Νεος' }, { art: 'Ο', title: 'ΥΠΑΣΠΙΣΤΗΣ' }];
const withSet = (s: any, x: any) => ({ ...s, settings: { ...s.settings, ...x } });
async function dump(data: Buffer): Promise<Record<string, string>> {
  const wb = await Workbook.open(data); const out: Record<string, string> = {};
  (await wb.values(wb.sheetNames()[0], 400, 60)).forEach((row, i) => (row || []).forEach((v, j) => { if (v != null && String(v).trim() !== '') out[colName(j + 1) + (i + 1)] = String(v); }));
  return out;
}
const where = (c: Record<string, string>, v: string) => Object.keys(c).filter(k => c[k] === v);
const built = async (sig: BuildOpts['sig']) => {
  const b = await buildTemplate({ ...PRESETS.find(p => p.id === 'onomastiki')!.opts, sig }, 'people');
  const rep: Report = { id: 'r1', name: 'Α', tpl: 't1', kind: 'people', sheet: b.sheet, head: b.head, cols: b.cols, cells: b.cells, pick: defaultPick(), sort: 'name', day: 'today', out: 'file' };
  return { b, rep };
};

describe('Έντυπα: δικές του υπογραφές', () => {
  it('«Φτιάξ\' το εδώ» με «Ο ΛΟΧΙΑΣ» / «Ο ΔΙΟΙΚΗΤΗΣ» (παλιό): μπαίνουν οι δικές του στη θέση τους', async () => {
    const s = withSet(fakeState(20), { signers: { sergeant: 'ΛΧΙΑΣ ΠΑΛΙΟΣ', commander: 'ΙΛΧΟΣ ΠΑΛΙΟΣ' } });
    const ids = s.people.slice(0, 4).map((p: any) => p.id);
    for (const sig of ['both', 'sgt'] as const) {
      const { b, rep } = await built(sig);
      const def = await dump((await fillReport(b.data, s, rep, ids, D)).data);
      expect(Object.values(def)).toContain('Ο ΛΟΧΙΑΣ');   // χωρίς δικές του: όπως ήταν
      const out = await fillReport(b.data, s, { ...rep, sigs: own }, ids, D);
      const c = await dump(out.data); const v = Object.values(c);
      expect(v).not.toContain('Ο ΛΟΧΙΑΣ'); expect(v).not.toContain('Ο ΔΙΟΙΚΗΤΗΣ');
      expect(v).not.toContain('ΛΧΙΑΣ ΠΑΛΙΟΣ'); expect(v).not.toContain('ΙΛΧΟΣ ΠΑΛΙΟΣ');
      const [e] = where(c, 'ΕΠΟΠΤΗΣ'), [y] = where(c, 'ΥΠΑΣΠΙΣΤΗΣ');
      const row = Math.min(...where(def, 'Ο ΛΟΧΙΑΣ').map(k => +k.replace(/^[A-Z]+/, '')));
      expect(e).toBe('A' + (row + 1)); expect(y.endsWith(String(row + 1))).toBe(true); expect(c['A' + row]).toBe('Ο');
      expect(v).toContain('ΛΧΙΑΣ ΝΕΟΣ');
      expect(out.layout[0].blocks.filter(x => /^s\d/.test(x.id)).length).toBe(2);
      expect(out.warnings).toEqual([]);
    }
  });

  it('παλιό «Φτιάξ\' το εδώ» χωρίς δικές του: οι υπογραφές του σύρονται («Θέσεις στο χαρτί»)', async () => {
    const { b, rep } = await built('both'); const s = fakeState(10);
    const out = await fillReport(b.data, s, { ...rep, layout: { s1: [2, 0] } }, s.people.slice(0, 3).map(p => p.id), D);
    const bl = out.layout[0].blocks; const s0 = bl.find(x => x.id === 's0')!, s1 = bl.find(x => x.id === 's1')!;
    expect(s1.r1).toBe(s0.r1 + 2);
    const c = await dump(out.data); expect(where(c, 'Ο ΔΙΟΙΚΗΤΗΣ')[0]).toBe('D' + s1.r1);
  });

  it('δικό σου Excel με «Ο ΔΚΤΗΣ ΙΛΗΣ» σε ένα κελί και {ΛΟΧΙΑΣ} από κάτω· ίδιο κείμενο μέσα στον πίνακα δεν πειράζεται', async () => {
    const wb = await Workbook.blank('Λ'); const ws = await wb.sheet(0);
    ['Α/Α', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΠΑΡΑΤΗΡΗΣΕΙΣ', 'Χ'].forEach((h, i) => ws.set(colName(i + 1) + 2, h));
    ws.set('C3', 'Ο ΔΙΟΙΚΗΤΗΣ');   // σε κελί της γραμμής-προτύπου (σημείωση), όχι υπογραφή
    ws.set('A6', 'Ο ΑΛΧΙΑΣ ΙΛΗΣ'); ws.set('C6', 'Ο ΔΚΤΗΣ ΙΛΗΣ'); ws.set('A9', '{ΛΟΧΙΑΣ}'); ws.set('C9', '{ΔΙΟΙΚΗΤΗΣ}');
    const tpl = await wb.save();
    const s = withSet(fakeState(10), { signers: { sergeant: 'ΛΧΙΑΣ ΠΑΛΙΟΣ', commander: 'ΙΛΧΟΣ ΠΑΛΙΟΣ' } }); const ids = s.people.slice(0, 2).map((p: any) => p.id);
    const rep: Report = { id: 'r', name: 'Λ', tpl: 't', kind: 'people', sheet: 'Λ', head: 2, cols: [{ c: 1, f: 'aa', h: 'Α/Α' }, { c: 2, f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ' }], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file' };
    const def = await dump((await fillReport(tpl, s, rep, ids, D)).data);
    expect(def.A7).toBe('Ο ΑΛΧΙΑΣ ΙΛΗΣ'); expect(def.A10).toBe('ΛΧΙΑΣ ΠΑΛΙΟΣ');   // μία γραμμή πιο κάτω (2 άτομα)
    const out = await fillReport(tpl, s, { ...rep, sigs: own }, ids, D);
    const c = await dump(out.data);
    expect(c.C3).toBe('Ο ΔΙΟΙΚΗΤΗΣ');
    expect([c.A7, c.A8, c.C7, c.C8]).toEqual(['Ο', 'ΕΠΟΠΤΗΣ', 'Ο', 'ΥΠΑΣΠΙΣΤΗΣ']);
    expect(Object.values(c)).not.toContain('ΛΧΙΑΣ ΠΑΛΙΟΣ'); expect(Object.values(c)).not.toContain('ΙΛΧΟΣ ΠΑΛΙΟΣ');
    expect(Object.values(c)).toContain('ΛΧΙΑΣ ΝΕΟΣ');
  });

  it('ίδιο πλήθος με «Ο» και θέση σε δύο γραμμές: το νέο όνομα στο κελί του {ΛΟΧΙΑΣ}', async () => {
    const wb = await Workbook.blank('Λ'); const ws = await wb.sheet(0);
    ['Α/Α', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'Χ', 'Ψ'].forEach((h, i) => ws.set(colName(i + 1) + 2, h));
    ws.set('A6', 'Ο'); ws.set('A7', 'ΑΛΧΙΑΣ ΙΛΗΣ'); ws.set('D6', 'Ο'); ws.set('D7', 'ΔΚΤΗΣ ΙΛΗΣ'); ws.set('A9', '{ΛΟΧΙΑΣ}'); ws.set('D9', '{ΔΙΟΙΚΗΤΗΣ}');
    const tpl = await wb.save();
    const s = withSet(fakeState(10), { signers: { sergeant: 'ΛΧΙΑΣ ΠΑΛΙΟΣ', commander: 'ΙΛΧΟΣ ΠΑΛΙΟΣ' } });
    const rep: Report = { id: 'r', name: 'Λ', tpl: 't', kind: 'people', sheet: 'Λ', head: 2, cols: [{ c: 1, f: 'aa', h: 'Α/Α' }, { c: 2, f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ' }], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', sigs: own };
    const c = await dump((await fillReport(tpl, s, rep, [s.people[0].id], D)).data);
    expect([c.A6, c.A7, c.A9, c.D7, c.D9]).toEqual(['Ο', 'ΕΠΟΠΤΗΣ', 'ΛΧΙΑΣ ΝΕΟΣ', 'ΥΠΑΣΠΙΣΤΗΣ', undefined]);
  });

  it('«Θέσεις στο χαρτί»: ο τίτλος του εντύπου σύρεται κι αυτός', async () => {
    const { b, rep } = await built('list'); const s = fakeState(10);
    const out = await fillReport(b.data, s, { ...rep, layout: { title: [1, 0] } }, s.people.slice(0, 3).map(p => p.id), D);
    const t = out.layout[0].blocks.find(x => x.id === 'title')!;
    expect(t).toBeTruthy();
    const c = await dump(out.data); expect(where(c, 'ΟΝΟΜΑΣΤΙΚΗ ΚΑΤΑΣΤΑΣΗ')[0]).toBe('A' + t.r1);
    const t0 = (await fillReport(b.data, s, rep, s.people.slice(0, 3).map(p => p.id), D)).layout[0].blocks.find(x => x.id === 'title')!;
    expect(t.r1).toBe(t0.r1 + 1);
  });
});
