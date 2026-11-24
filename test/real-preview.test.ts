// Η προεπισκόπηση στην οθόνη είναι το ΙΔΙΟ αρχείο που γράφει η εξαγωγή (Michael, 24/11): previewOf γυρίζει σε σελίδες το αποτέλεσμα του fill,
// όχι δική του ζωγραφιά. Μόνο ψεύτικα ονόματα.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { apply, type Ctx } from '../src/shared/commands';
import { fillFroura, fillHkai, fillOuts } from '../src/main/exports';
import { previewOf, printSetup } from '../src/main/formPreview';
import { openBook, renderOpen } from '../src/main/print';
import { Workbook } from '../src/main/xlsx';
import { postsOf, seatMap } from '../src/shared/rules';
import { dutyName } from '../src/shared/froura';
import { RealPreview } from '../src/renderer/realPreview';
import type { FormPv } from '../src/shared/api';
import { fakeState } from './fixtures';

const D = '2026-10-12';
let seq = 0; const ctx: Ctx = { today: D, newId: () => 'q' + ++seq };
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const full = () => apply(fakeState(60), { t: 'autofill', date: D }, ctx).state;
// όλα τα κείμενα (όχι αριθμοί) του φύλλου, όπως τα έχει το αρχείο που βγήκε
async function texts(data: Buffer, sheet: string): Promise<string[]> {
  const rows = await (await Workbook.open(data)).values(sheet, 400, 40);
  return rows.flat().filter((v): v is string => typeof v === 'string' && /[\p{L}\p{N}]/u.test(v)).map(v => v.trim());
}
const inHtml = (html: string, t: string) => t.split('\n').map(x => x.trim()).filter(Boolean).every(x => html.includes(esc(x)));

describe('προεπισκόπηση = το αρχείο της εξαγωγής', () => {
  it('ΦΡΟΥΡΑ με κρυμμένα τα μαγειρεία: δεν φαίνονται τα ονόματά τους, φαίνεται κάθε κείμενο του αρχείου', async () => {
    const s0 = full(); const mg = s0.settings.blocks.find(b => b.kind === 'mg')!;
    const g0 = s0.guards[D]; const pm = seatMap(s0);
    const mgNames = postsOf(s0.settings).filter(x => x.block === mg.id).map(x => dutyName(pm.get(g0[x.k])!)).filter(Boolean);
    expect(mgNames.length).toBeGreaterThan(0);
    // πριν: τα ονόματα των μαγειρείων είναι στο αρχείο και στην προεπισκόπηση
    const out0 = await fillFroura(T('froura.xlsx'), s0, D); const pv0 = await previewOf(out0);
    for (const n of mgNames) expect(pv0.sheets[0].html).toContain(esc(n));
    // μετά: κρυφά (setBlock hidden)
    const s = apply(s0, { t: 'setBlock', phase: 'sven', id: mg.id, patch: { hidden: true } }, ctx).state;
    const out = await fillFroura(T('froura.xlsx'), s, D); const pv = await previewOf(out);
    expect(pv.sheets.length).toBe(1); const html = pv.sheets[0].html;
    for (const n of mgNames) expect(html).not.toContain(esc(n));
    expect(pv.warnings.join(' ')).toMatch(/ανενεργή/);
    expect(pv.warnings).toEqual(out.warnings);
    const miss = (await texts(out.data, out.sheet!)).filter(t => !inHtml(html, t));
    expect(miss).toEqual([]);
  });

  it('ΦΡΟΥΡΑ με κενές θέσεις: τα κελιά τους (όπως βγήκαν) υπάρχουν στη σελίδα για το ροζ της οθόνης', async () => {
    let s = full(); const g = { ...s.guards[D] }; const posts = postsOf(s.settings).filter(x => x.k !== 'ly' && x.k !== 'dy');
    delete g[posts[0].k]; delete g[posts[posts.length - 1].k]; s = { ...s, guards: { ...s.guards, [D]: g } };
    const out = await fillFroura(T('froura.xlsx'), s, D); const pv = await previewOf(out);
    expect(pv.marks.length).toBeGreaterThanOrEqual(2);
    for (const a of pv.marks) expect(pv.sheets[0].html).toContain('data-a="' + a + '"');
    // και το αρχείο δεν αλλάζει από αυτό: ίδια byte-προς-byte αποτέλεσμα με δεύτερο γέμισμα
    expect(Buffer.compare(out.data, (await fillFroura(T('froura.xlsx'), s, D)).data)).toBe(0);
  });

  it('ΗΚΑΙ: μπροστινή και πίσω σελίδα, κάθε κείμενο του αρχείου φαίνεται', async () => {
    const s = full(); const out = await fillHkai(T('hkai.xlsx'), s, D); const pv = await previewOf(out);
    expect(pv.sheets.length).toBe(2);
    for (const sh of pv.sheets) { const miss = (await texts(out.data, sh.name)).filter(t => !inHtml(sh.html, t)); expect(miss, sh.name).toEqual([]); }
  });

  it('Εξοδούχοι: κάθε κείμενο του αρχείου φαίνεται', async () => {
    const s = full(); const out = await fillOuts(T('exodouxoi.xlsx'), s, D, { outs: undefined, stay: undefined });
    const pv = await previewOf(out); expect(pv.sheets.length).toBeGreaterThan(0);
    for (const sh of pv.sheets) { const miss = (await texts(out.data, sh.name)).filter(t => !inHtml(sh.html, t)); expect(miss, sh.name).toEqual([]); }
  });

  it('δικό σου template στον φάκελο templates: η προεπισκόπηση το ακολουθεί (όχι το έτοιμο της εφαρμογής)', async () => {
    const wb = await Workbook.open(T('froura.xlsx')); const name = wb.sheetNames()[0];
    const ws = await wb.sheet(name); const rows = await wb.values(name, 60, 20); let ref = '';
    rows.forEach((r, i) => r.forEach((v, j) => { if (!ref && v === 'ΘΑΛΑΜΟΦΥΛΑΚΕΣ') ref = String.fromCharCode(65 + j) + (i + 1); }));
    expect(ref).not.toBe(''); ws.set(ref, 'ΤΟ ΔΙΚΟ ΜΟΥ ΕΝΤΥΠΟ ΜΟΝΑΔΑΣ'); const own = await wb.save();
    const s = full(); const mine = await previewOf(await fillFroura(own, s, D)); const std = await previewOf(await fillFroura(T('froura.xlsx'), s, D));
    expect(mine.sheets[0].html).toContain('ΤΟ ΔΙΚΟ ΜΟΥ ΕΝΤΥΠΟ ΜΟΝΑΔΑΣ'); expect(std.sheets[0].html).not.toContain('ΤΟ ΔΙΚΟ ΜΟΥ ΕΝΤΥΠΟ ΜΟΝΑΔΑΣ');
  });

  it('φύλλο της επιλογής: μόνο αυτό', async () => {
    const out = await fillHkai(T('hkai.xlsx'), full(), D); const all = await previewOf(out);
    const one = await previewOf(out, undefined, all.sheets[1].name); expect(one.sheets.map(x => x.name)).toEqual([all.sheets[1].name]);
  });
});

// ό,τι βγάζει η εκτύπωση (printPage στο main.ts: printSetup + renderOpen με τη layout) = ό,τι δείχνει η οθόνη, και με αποθηκευμένες ρυθμίσεις εκτύπωσης
const plain = (h: string) => h.replace(/<[^>]*>/g, '\u0001').replace(/\u0001+/g, '|');
const pages = (h: string) => h.split(/<div class="pg[ "]/).slice(1).map(plain);
async function printed(out: { name?: string; data: Buffer }, saved?: object) {
  const book = await openBook(out.data); const su = await printSetup(book, out.name!, saved);
  return renderOpen(book, { file: out.name!, sheets: su.want, layout: su.opts });
}
describe('προεπισκόπηση = εκτύπωση (ίδια διάταξη σελίδας)', () => {
  const cases: [string, object | undefined][] = [['χωρίς αποθηκευμένες ρυθμίσεις', undefined], ['με αποθηκευμένες (2 σελίδες, κάθετο, A3, φαρδιά περιθώρια)', { pages: 2, or: 'p', paper: 'A3', m: 'wide', sp: 'top', pno: true }]];
  for (const [what, saved] of cases) for (const kind of ['froura', 'hkai'] as const) it(kind + ' ' + what, async () => {
    const s = full(); const out = kind === 'froura' ? await fillFroura(T('froura.xlsx'), s, D) : await fillHkai(T('hkai.xlsx'), s, D);
    const pv = await previewOf(out, saved); const pr = await printed(out, saved);
    expect(pv.sheets.map(x => x.name)).toEqual(pr.sheets.map(x => x.name));
    expect(pv.sheets.map(x => x.pages)).toEqual(pr.sheets.map(x => x.pages));
    pv.sheets.forEach((sh, i) => { expect(pages(sh.html)).toEqual(pages(pr.sheets[i].html)); });
    expect(pv.css).toBe(pr.css);
  });
  it('οι ρυθμίσεις που αλλάζουν στο παράθυρο «Εκτύπωση» αλλάζουν και την προεπισκόπηση', async () => {
    const out = await fillFroura(T('froura.xlsx'), full(), D);
    const a = await previewOf(out); const b = await previewOf(out, { or: 'p', paper: 'A3' });
    expect(b.sheets[0].html).not.toBe(a.sheets[0].html);
  });
});

describe('RealPreview', () => {
  const pv: FormPv = { css: '.s0{font-weight:bold}', warnings: ['Η υπηρεσία Χ είναι ανενεργή και δεν γράφτηκε'], marks: ['C10'], ms: 12, sheets: [
    { name: 'μπροστινο', pages: 2, html: '<div class="pg"><table><tr><td data-a="A1">α</td></tr></table></div><div class="pg"><table></table></div>' },
    { name: 'πισω', pages: 1, html: '<div class="pg"><table></table></div>' }] };
  it('ζωγραφίζεται χωρίς σφάλμα: καρτέλες φύλλων, σελίδες, προειδοποιήσεις', () => {
    const h = renderToString(React.createElement(RealPreview as any, { req: { kind: 'hkai', date: D }, initial: pv }));
    expect(h).toContain('μπροστινο'); expect(h).toContain('πισω'); expect(h).toContain('Σελίδα 1 από 2'); expect(h).toContain('ανενεργή');
    expect(h).not.toMatch(/undefined|\[object|NaN/);
  });
  it('με φύλλο από τον γονέα: χωρίς δικές της καρτέλες', () => {
    const h = renderToString(React.createElement(RealPreview as any, { req: { kind: 'hkai', date: D }, initial: pv, sheet: 1 }));
    expect(h).not.toContain('μπροστινο'); expect(h).not.toContain('Σελίδα 1 από'); expect(h).not.toMatch(/undefined|\[object|NaN/);
  });
});
