// Έντυπα (Michael, 29/10: «οι υπογραφές δεν φεύγουν από την προεπισκόπηση»): «Υπογραφές: Καμία» στο «Φτιάξ' το εδώ» έβγαζε
// κάτω από τον πίνακα τις υπογραφές των Ρυθμίσεων όταν τις έχεις αλλάξει εκεί. Τώρα «Καμία» = καμία, και για όσα αποθηκεύτηκαν πριν.
import { describe, it, expect } from 'vitest';
import { buildTemplate, fillReport } from '../src/main/reports';
import { Workbook } from '../src/main/xlsx';
import { PRESETS, defaultPick, sigsNone, withBuilt, type BuildOpts, type RepTpl, type Report } from '../src/shared/reports';
import { fakeState } from './fixtures';

const D = '2026-10-29';
const custom = (s: any) => ({ ...s, settings: { ...s.settings, sigs: { reports: [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }] } } });
const texts = async (data: Buffer) => { const wb = await Workbook.open(data); return (await wb.values(wb.sheetNames()[0], 200, 40)).flat().filter(v => v != null && String(v).trim() !== '').map(String); };
const rep0: Report = { id: 'r1', name: 'Α', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file' };
const make = async (sig: BuildOpts['sig']) => { const o: BuildOpts = { ...PRESETS.find(p => p.id === 'onomastiki')!.opts, sig }; const b = await buildTemplate(o, 'people'); return { o, b }; };

describe('Υπογραφές: Καμία', () => {
  it('με δικές σου υπογραφές στις Ρυθμίσεις: το έντυπο βγαίνει χωρίς υπογραφές', async () => {
    const s = custom(fakeState(10)); const ids = s.people.slice(0, 3).map((p: any) => p.id);
    const { o, b } = await make('none'); const r = withBuilt(rep0, b, o);
    expect(r.sigs).toEqual([]);
    expect(await texts((await fillReport(b.data, s, r, ids, D)).data)).not.toContain('ΕΠΟΠΤΗΣ');
  });
  it('«Από τις Ρυθμίσεις» μένει όπως πριν: μπαίνουν οι υπογραφές των Ρυθμίσεων', async () => {
    const s = custom(fakeState(10)); const ids = s.people.slice(0, 3).map((p: any) => p.id);
    const { o, b } = await make('list'); const r = withBuilt(rep0, b, o);
    expect(r.sigs).toBeUndefined();
    expect(await texts((await fillReport(b.data, s, r, ids, D)).data)).toContain('ΕΠΟΠΤΗΣ');
  });
  it('χωρίς δικές σου υπογραφές στις Ρυθμίσεις: ίδιο αποτέλεσμα με πριν (καμία)', async () => {
    const s = fakeState(10); const ids = s.people.slice(0, 3).map((p: any) => p.id);
    const { o, b } = await make('none'); const old = { ...withBuilt(rep0, b, o) }; delete old.sigs;
    const a = await texts((await fillReport(b.data, s, old, ids, D)).data), c = await texts((await fillReport(b.data, s, withBuilt(rep0, b, o), ids, D)).data);
    expect(c).toEqual(a);
  });
  it('έντυπο αποθηκευμένο πριν (χωρίς sigs): διορθώνεται όταν βγαίνει, εκτός αν το πρότυπο άλλαξε στο Excel', async () => {
    const { o } = await make('none'); const tpls: RepTpl[] = [{ id: 't1', name: 'Α', file: 'x.xlsx', built: o }];
    expect(sigsNone(rep0, tpls).sigs).toEqual([]);
    expect(sigsNone(rep0, tpls, true).sigs).toBeUndefined();
    expect(sigsNone(rep0, [{ ...tpls[0], built: { ...o, sig: 'list' } }]).sigs).toBeUndefined();
    expect(sigsNone({ ...rep0, sigs: [{ art: 'Ο', title: 'Χ' }] }, tpls).sigs).toHaveLength(1);
  });
});
