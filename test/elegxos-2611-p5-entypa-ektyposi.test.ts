// Έντυπα (Michael, 25/11): το παράθυρο «Εκτύπωση» ξεκινά με «Όσες χρειάζονται» και η προεπισκόπηση του οδηγού δείχνει την ίδια διάταξη.
// Οι ρυθμίσεις που έχουν αποθηκευτεί για το έντυπο ισχύουν πάνω από αυτό· ΦΡΟΥΡΑ/ΗΚΑΙ/Εξοδούχοι μένουν όπως ήταν. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildTemplate, fillReport, previewReport } from '../src/main/reports';
import { fillFroura, fillHkai } from '../src/main/exports';
import { printSetup } from '../src/main/formPreview';
import { openBook, renderOpen } from '../src/main/print';
import { defaultPick, forBuild, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import { fakeState } from './fixtures';

const D = '2026-10-19';
const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }, { f: 'room', h: 'ΘΑΛ', w: 'narrow' as const }, { f: 'phone', h: 'ΤΗΛ', w: 'auto' as const }];
const base: BuildOpts = { title: 'ΔΥΝΑΜΗ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray', cols };
const s = fakeState(130);
const ids = s.people.slice(0, 120).map(p => p.id);
async function make(x: Partial<Report> = {}) {
  const r0: Report = { id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x };
  const bo = forBuild(base, r0); const b = await buildTemplate(bo, 'people'); const r = withBuilt(r0, b, bo);
  const out = await fillReport(b.data, s, r, ids, D, {});
  return { b, r, out };
}
// το παράθυρο εκτύπωσης: ίδιες κλήσεις με printPage στο main.ts
async function printWin(data: Buffer, name: string, sheet: string, saved?: object, fix?: boolean, rep?: boolean) {
  const book = await openBook(data); const su = await printSetup(book, name, saved, [sheet], fix, rep);
  const doc = await renderOpen(book, { file: name, sheets: [sheet], layout: su.opts });
  return { su, doc, pages: doc.sheets[0].pages };
}

describe('Έντυπα: εκτύπωση «Όσες χρειάζονται»', () => {
  it('(α) έντυπο 120 γραμμών: η προεπισκόπηση έχει τις ίδιες σελίδες με το παράθυρο εκτύπωσης, πάνω από μία, γράμματα ≥ 8pt', async () => {
    const { b, r, out } = await make();
    const pv = await previewReport(b.data, s, r, ids, D, 1);
    const w = await printWin(out.data, out.name, out.sheets[0], undefined, false, true);
    expect(w.su.opts.pages).toBe('auto');
    expect(pv.pages).toBe(w.pages); expect(pv.pages).toBeGreaterThan(1);
    expect(w.doc.sheets[0].pt).toBeGreaterThanOrEqual(8);
    const old = await printWin(out.data, out.name, out.sheets[0]);   // χωρίς το σημάδι: 1 σελίδα, όπως πριν
    expect(old.su.opts.pages).toBe(1); expect(old.pages).toBe(1);
  });
  it('(β) με αποθηκευμένες ρυθμίσεις { pages: 1 } η προεπισκόπηση και η εκτύπωση δίνουν 1 σελίδα', async () => {
    const { b, r, out } = await make();
    const pv = await previewReport(b.data, s, r, ids, D, 1, undefined, { pages: 1 });
    const w = await printWin(out.data, out.name, out.sheets[0], { pages: 1 }, false, true);
    expect(pv.pages).toBe(1); expect(w.pages).toBe(1);
  });
  it('(γ) ΦΡΟΥΡΑ και ΗΚΑΙ χωρίς το σημάδι: ίδιες ρυθμίσεις με πριν (1 σελίδα)', async () => {
    const st = fakeState(60);
    for (const out of [await fillFroura(fs.readFileSync(path.join(__dirname, '..', 'templates', 'froura.xlsx')), st, D), await fillHkai(fs.readFileSync(path.join(__dirname, '..', 'templates', 'hkai.xlsx')), st, D)]) {
      const book = await openBook(out.data); const name = out.name || 'x.xlsx';
      const a = await printSetup(book, name, undefined); const b = await printSetup(book, name, undefined, undefined, false, false);
      expect(a.opts.pages).toBe(1); expect(b.opts).toEqual(a.opts); expect(b.base).toEqual(a.base);
    }
  });
  it('(δ) έντυπο «Σταθερό μέγεθος γραμμάτων»: όπως σήμερα (όσες χρειάζονται, γράμματα του Excel)', async () => {
    const { out } = await make({ fixsz: true });
    const book = await openBook(out.data);
    const a = await printSetup(book, out.name, { pages: 1 }, [out.sheets[0]], true); const b = await printSetup(book, out.name, { pages: 1 }, [out.sheets[0]], true, true);
    expect(a.opts.pages).toBe('auto'); expect(b.opts).toEqual(a.opts); expect(b.base).toEqual(a.base);
  });
  it('(ε) η προεπισκόπηση του οδηγού κρατά τα κελιά σημαδεμένα (data-a) για επιλογή με κλικ', async () => {
    const { b, r } = await make();
    const pv = await previewReport(b.data, s, r, ids, D, 1);
    expect(pv.html).toMatch(/data-a="[A-Z]+\d+"/); expect(pv.html).toContain('data-a="B');
  });
});
