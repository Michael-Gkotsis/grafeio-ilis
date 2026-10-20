// Στήλες όσο φαρδιές χρειάζεται (Michael, 20/10): επικεφαλίδα και τιμές να φαίνονται ολόκληρες, χωρίς να μικραίνουν.
// Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { apply, type Ctx } from '../src/shared/commands';
import { fillFroura, fillHkai, fillOuts } from '../src/main/exports';
import { rosterLists } from '../src/main/excel';
import { Workbook } from '../src/main/xlsx';
import { textPx } from '../src/main/textfit';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const D = '2026-10-12';
let seq = 0; const ctx: Ctx = { today: D, newId: () => 'x' + ++seq };
function longNames() {
  let s = fakeState(90);
  s.people = s.people.map((p, i) => (i % 3 ? p : { ...p, last: 'ΧΑΤΖΗΓΕΩΡΓΙΑΔΗΣ' + i, first: 'ΠΑΝΑΓΙΩΤΗΣ' }));
  s = apply(s, { t: 'autofill', date: D }, ctx).state;
  return apply(s, { t: 'outs', date: D, changes: [3, 6, 9].map(pid => ({ pid, from: null, to: 'OUT' as const })) }, ctx).state;
}
const widths = async (buf: Buffer, sheet: string | number) => { const ws = await (await Workbook.open(buf)).sheet(sheet); return Array.from({ length: 30 }, (_, i) => ws.colWidth(i + 1)); };

describe('στήλες που χωρούν ό,τι γράφτηκε', () => {
  it('ένα <col> για πολλές στήλες χωρίζεται: αλλάζει μόνο η μία', async () => {
    const wb = await Workbook.blank('Α'); const ws = await wb.sheet(0);
    ws.setColWidths({ 1: 5 }); ws.setColWidth(1, 9).setColWidth(4, 20);
    const x = await Workbook.open(await wb.save()); const w = await x.sheet(0);
    expect([w.colWidth(1), w.colWidth(4)]).toEqual([9, 20]);
    const hk = await Workbook.open(T('hkai.xlsx')); const f = await hk.sheet(0);   // B:G έχουν ένα <col>
    f.setColWidth(4, 12);
    expect([2, 3, 4, 5, 6, 7].map(c => f.colWidth(c))).toEqual([6.7109375, 6.7109375, 12, 6.7109375, 6.7109375, 6.7109375]);
  });
  it('ΦΡΟΥΡΑ: η στήλη των θαλαμοφυλάκων και των μαγειρείων φαρδαίνει, τα ονόματα μένουν σε μία γραμμή στο 12', async () => {
    const tpl = await widths(T('froura.xlsx'), 0);
    const r = await fillFroura(T('froura.xlsx'), longNames(), D);
    const out = await widths(r.data, 0);
    expect(out[2]).toBeGreaterThan(tpl[2]);
    const ws = await (await Workbook.open(r.data)).sheet(0);
    const name = ws.get('C13')!; expect(name).toMatch(/ΧΑΤΖΗΓΕΩΡΓΙΑΔΗΣ/);
    expect(out[2] * 9).toBeGreaterThan(textPx(name, { name: 'Arial', sz: 12, b: false }));
    for (let i = 0; i < 30; i++) expect(out[i]).toBeGreaterThanOrEqual(tpl[i]);   // ποτέ πιο στενή
  });
  it('Εξοδούχοι: οι στήλες χωρούν τα ονόματα', async () => {
    const r = await fillOuts(T('exodouxoi.xlsx'), longNames(), D);
    const tpl = await widths(T('exodouxoi.xlsx'), 1); const out = await widths(r.data, 1);
    for (let i = 0; i < 30; i++) expect(out[i]).toBeGreaterThanOrEqual(tpl[i]);
  });
  it('ΗΚΑΙ: η διάταξη μένει ίδια (οι στήλες της μοιράζονται πολλοί πίνακες)', async () => {
    const r = await fillHkai(T('hkai.xlsx'), longNames(), D);
    expect(await widths(r.data, 0)).toEqual(await widths(T('hkai.xlsx'), 0));
    expect(await widths(r.data, 1)).toEqual(await widths(T('hkai.xlsx'), 1));
  });
  it('Δυναμολόγιο: η στήλη χωρά και μεγάλη τιμή, πέρα από το παλιό όριο των 40', async () => {
    const s = fakeState(6); s.people[0] = { ...s.people[0], last: 'ΧΑΤΖΗΓΕΩΡΓΙΑΔΗΣ-ΚΩΝΣΤΑΝΤΙΝΟΠΟΥΛΟΣ-ΠΑΠΑΔΗΜΗΤΡΙΟΥ' };
    const { data } = await rosterLists(s, D);
    const wb = await Workbook.open(data); const ws = await wb.sheet(0);
    let c = 0;
    for (const row of await wb.values(0)) if (!c) c = row.findIndex(v => /ΚΩΝΣΤΑΝΤΙΝΟΠΟΥΛΟΣ/.test(String(v ?? ''))) + 1;
    expect(c).toBeGreaterThan(0);
    expect(ws.colWidth(c)).toBeGreaterThan(40);
  });
});
