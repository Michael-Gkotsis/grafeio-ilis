// Έντυπα (Michael, 22/10: «η κεφαλίδα, η ημερομηνία και οι υπογραφές να μη μικραίνουν όσο προσθέτω στήλες και γραμμές»):
// στην εκτύπωση αλλάζει κλίμακα μόνο ο πίνακας· τα κομμάτια του εντύπου (FIXED_MARK) βγαίνουν στο μέγεθός τους.
import { describe, it, expect } from 'vitest';
import { buildTemplate, fillReport } from '../src/main/reports';
import { PRINT_DEFAULT, renderBook } from '../src/main/print';
import { Workbook } from '../src/main/xlsx';
import { defaultPick, type BuildCol, type BuildOpts, type Report } from '../src/shared/reports';
import { fakeState } from './fixtures';

const D = '2026-10-22';
const COLS: BuildCol[] = [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'rank', h: 'ΒΑΘΜΟΣ', w: 'auto' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }];
const opts = (cols: BuildCol[]): BuildOpts => ({ title: 'ΚΑΤΑΣΤΑΣΗ', cols, head: true, date: true, sig: 'list', land: false, sz: 11, fill: 'gray' } as BuildOpts);
async function out(cols: BuildCol[], n: number, layout = PRINT_DEFAULT) {
  const s = fakeState(Math.max(n, 3));
  const b = await buildTemplate(opts(cols), 'people');
  const rep: Report = { id: 'r1', name: 'Α', tpl: 't1', kind: 'people', sheet: b.sheet, head: b.head, cols: b.cols, cells: b.cells, pick: defaultPick(), sort: 'name', day: 'today', out: 'file', sigs: [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }] };
  const res = await fillReport(b.data, s, rep, s.people.slice(0, n).map(p => p.id), D);
  const doc = await renderBook(res.data, { file: 'x.xlsx', refs: true, layout });
  return { res, sh: doc.sheets[0] };
}
// μέγεθος στο χαρτί: κλίμακα × (em του κελιού, αν είναι σταθερό) — τα ίδια pt της γραμματοσειράς
const emOf = (html: string, ref: string) => { const m = new RegExp(`data-a="${ref}"[^>]*>(?:<div[^>]*>)?<span(?: style="font-size:([\\d.]+)em")?`).exec(html); return m ? (m[1] ? +m[1] : 1) : null; };

describe('Έντυπα: σταθερό μέγεθος για κεφαλίδα, ημερομηνία, τίτλο, υπογραφές', () => {
  it('το αρχείο σημαδεύει τα κομμάτια του εντύπου', async () => {
    const { res } = await out(COLS, 3);
    const wb = await Workbook.open(res.data);
    const xml = (wb as any).workbookXml as string;
    expect(xml).toMatch(/<definedName name="GL_STATHERA" localSheetId="0" hidden="1">[^<]*\$A\$1:/);
  });

  it('πολλές στήλες και γραμμές σε 1 σελίδα: ο πίνακας μικραίνει, η κεφαλίδα και οι υπογραφές όχι', async () => {
    const few = await out(COLS, 5); const many = await out([...COLS, ...['fname', 'lname', 'father', 'room', 'unit', 'phone', 'si', 'spec', 'ama'].map(f => ({ f, h: f.toUpperCase(), w: 'wide' as const }))], 70);
    expect(many.sh.scale).toBeLessThan(few.sh.scale * 0.7);
    const real = (x: typeof few, ref: string) => x.sh.scale * (emOf(x.sh.html, ref) ?? NaN);
    // κεφαλίδα (A1), τίτλος, υπογραφές: ίδιο μέγεθος στο χαρτί (κλίμακα × em = 1 όσο τα όρια το επιτρέπουν)
    expect(real(many, 'A1')).toBeCloseTo(1, 1); expect(real(few, 'A1')).toBeCloseTo(1, 1);
    const sigRef = /data-a="(A\d+)"[^>]*>(?:<div[^>]*>)?<span[^>]*>ΕΠΟΠΤΗΣ/.exec(many.sh.html)?.[1] ?? /data-a="([A-Z]+\d+)"[^>]*>(?:<div[^>]*>)?<span[^>]*>[^<]*ΕΠΟΠΤΗΣ/.exec(many.sh.html)?.[1];
    expect(sigRef).toBeTruthy();
    expect(real(many, sigRef!)).toBeCloseTo(1, 1);
    // τα κελιά του πίνακα μένουν με την κλίμακα του πίνακα
    const firstData = many.res.layout[0].blocks.find(b => b.id === 'title')!.r1 + 3;
    expect(emOf(many.sh.html, 'C' + firstData)).toBe(1);
    // η σελίδα χωρά: οι σταθερές γραμμές μετρούν στο ύψος
    expect(many.sh.pages).toBe(1);
  });

  it('λίγα: τίποτα δεν αλλάζει όταν η κλίμακα είναι 1', async () => {
    const { sh } = await out(COLS, 3, { ...PRINT_DEFAULT, pages: 'auto', size: 11, stretch: false });
    if (Math.abs(sh.scale - 1) < 0.005) expect(sh.html).not.toMatch(/font-size:[\d.]+em/);
  });

  it('χωρίς σημάδι (άλλα έντυπα): όπως πριν', async () => {
    const wb = await Workbook.blank('Λ'); const ws = await wb.sheet(0);
    ws.set('A1', 'ΚΕΦΑΛΙΔΑ'); for (let c = 1; c <= 20; c++) ws.set(String.fromCharCode(64 + c) + 3, 'ΣΤΗΛΗ ' + c);
    const doc = await renderBook(await wb.save(), { file: 'x.xlsx', refs: true, layout: PRINT_DEFAULT });
    expect(doc.sheets[0].html).not.toMatch(/font-size:[\d.]+em/);
  });
});
