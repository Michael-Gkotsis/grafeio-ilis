// Έντυπα (Michael, 29/10): «Χωρίς γραμμή επικεφαλίδων» στο «Φτιάξ' το εδώ», για τον 1ο πίνακα και για κάθε πίνακα 2, 3…
// Η γραμμή μένει στο πρότυπο (από εκεί βρίσκονται οι στήλες) και φεύγει από το έντυπο: κρύβεται όταν είναι μόνο των πινάκων που τη θέλουν χωρίς,
// αδειάζει μόνο ο πίνακας όταν τη μοιράζεται με διπλανό. Δεν μετακινείται καμία γραμμή· η ταξινόμηση της εκτύπωσης συνεχίζει ανά πίνακα.
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport } from '../src/main/reports';
import { PRINT_DEFAULT, renderBook, type PrintOpts, type PrintSort } from '../src/main/print';
import { defaultPick, forBuild, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import type { ValueTable } from '../src/shared/values';
import { fakeState } from './fixtures';

const D = '2026-10-19', clock = { today: D, now: 12 * 60 };
const T = (metric: string, sign: '+' | '-' = '+') => ({ sign, metric });
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }, { f: 'room', h: 'ΘΑΛ', w: 'narrow' as const }];
const base = (x: Partial<BuildOpts> = {}): BuildOpts => ({ title: 'ΔΥΝΑΜΗ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray', cols, ...x });
const VALS: ValueTable[] = [{ id: 'v1', title: 'ΣΥΝΟΛΑ', rows: [{ label: 'Σε δύναμη', expr: [T('str.total')] }, { label: 'Παρόντες', expr: [T('str.present')] }] }];
const grid = async (data: Buffer | Uint8Array, n = 0) => { const wb = await Workbook.open(data); return wb.values(wb.sheetNames()[n], 200, 40); };
const at = (g: unknown[][], text: string): { r: number; c: number }[] => g.flatMap((row, r) => row.map((v, c) => (v === text ? { r, c } : null)).filter(Boolean) as { r: number; c: number }[]);
const firstAt = (g: unknown[][], text: string) => { const x = at(g, text)[0]; expect(x, text).toBeTruthy(); return x; };
const col = (g: unknown[][], c: number, from: number, to: number) => g.slice(from, to).flatMap((row, i) => (typeof row[c] === 'string' && row[c] !== '' ? [from + i] : []));
const SIG = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }];
const two = (nohead2?: boolean, nohead1?: boolean): BuildOpts => base({ lay: { w: '1/2' }, ...(nohead1 ? { nohead: true } : {}), more: [{ id: 't2', title: 'ΔΕΥΤΕΡΟΣ', kind: 'people', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }, { f: 'phone', h: 'ΤΗΛ', w: 'auto' }], lay: { w: '1/2' }, ...(nohead2 ? { nohead: true } : {}) }] });
const pickN = (n: number) => ({ ...defaultPick(), mode: 'first' as const, n });
async function make(o: BuildOpts, x: Partial<Report> = {}, n = 30) {
  const s = fakeState(40); const r0 = rep(x); const bo = forBuild(o, r0); const b = await buildTemplate(bo, 'people');
  const r = withBuilt(r0, b, bo); r.sigs = SIG;
  const out = await fillReport(b.data, s, r, s.people.slice(0, n).map(p => p.id), D, { clock });
  return { s, r, b, out, g: await grid(out.data), wb: await Workbook.open(out.data) };
}
async function makeTwo(o: BuildOpts, n1: number, n2: number, bands: string[][] | null = null) {
  const s = fakeState(40); const r0 = rep({ ...(bands ? { bands } : {}), pick: pickN(n1) }); const bo = forBuild(o, r0); const b = await buildTemplate(bo, 'people');
  const r = withBuilt(r0, b, bo); r.more = r.more!.map(t => ({ ...t, pick: pickN(n2) })); r.sigs = SIG;
  const out = await fillReport(b.data, s, r, s.people.slice(0, n1).map(p => p.id), D, { clock });
  return { s, r, b, out, g: await grid(out.data), wb: await Workbook.open(out.data) };
}
const trs = (html: string) => [...html.matchAll(/<tr data-r="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)].map(m => ({ r: +m[1], td: [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => /<span>([^<]*)<\/span>/.exec(x[1])?.[1] ?? '') }));
const O = (sort: PrintSort[]): PrintOpts => ({ ...PRINT_DEFAULT, sort });
const el = new Intl.Collator('el', { numeric: true, sensitivity: 'base' });
const names = (s: ReturnType<typeof fakeState>, n: number) => s.people.slice(0, n).map(p => p.last + ' ' + p.first);

describe('Χωρίς γραμμή επικεφαλίδων: μοντέλο', () => {
  it('withBuilt περνά το nohead στο έντυπο και στους πίνακες 2, 3…· χωρίς επιλογή δεν μπαίνει τίποτα', async () => {
    const o = two(true, true); const r0 = rep({}); const b = await buildTemplate(forBuild(o, r0), 'people');
    const r = withBuilt(r0, b, o); expect(r.nohead).toBe(true); expect(r.more![0].nohead).toBe(true);
    const o2 = two(); const b2 = await buildTemplate(o2, 'people'); const r2 = withBuilt(r, b2, o2);
    expect('nohead' in r2).toBe(false); expect('nohead' in r2.more![0]).toBe(false);
    // ίδιο πρότυπο με και χωρίς την επιλογή (η γραμμή μένει για τον εντοπισμό των στηλών)
    const wa = await Workbook.open(b.data), wb = await Workbook.open(b2.data);
    expect(await wa.values(wa.sheetNames()[0], 40, 20)).toEqual(await wb.values(wb.sheetNames()[0], 40, 20));
  });
  it('χωρίς nohead δεν μπαίνει κρυφό όνομα ούτε κρυφή γραμμή (όπως πριν)', async () => {
    const { out, wb, r } = await make(base());
    const z = await JSZip.loadAsync(out.data); expect(await z.file('xl/workbook.xml')!.async('string')).not.toContain('GL_XORIS');
    expect(wb.sheetNames().length).toBe(1); const ws = await wb.sheet(out.sheets[0]); for (let i = 1; i < 60; i++) expect(ws.rowHidden(i)).toBe(false);
    expect(r.nohead).toBeUndefined();
  });
});

describe('Χωρίς γραμμή επικεφαλίδων: 1ος πίνακας', () => {
  it('η επικεφαλίδα δεν φαίνεται, τα 30 άτομα και ο αριθμός τους μένουν, η υπογραφή κάτω από τον πίνακα· ίδιες γραμμές με το έντυπο με επικεφαλίδα', async () => {
    const withH = await make(base()); const no = await make(base({ nohead: true }));
    expect(no.r.nohead).toBe(true);
    // καμία γραμμή δεν μετακινήθηκε: ίδιο πλέγμα, ίδια θέση υπογραφής
    expect(no.g).toEqual(withH.g);
    const h = firstAt(no.g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ').r + 1; const ws = await no.wb.sheet(no.out.sheets[0]);
    expect(ws.rowHidden(h)).toBe(true); expect((await withH.wb.sheet(withH.out.sheets[0])).rowHidden(h)).toBe(false);
    const nc = firstAt(no.g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ').c; const sig = firstAt(no.g, 'ΕΠΟΠΤΗΣ').r;
    expect(col(no.g, nc, h, sig).length).toBe(30); expect(sig).toBe(firstAt(withH.g, 'ΕΠΟΠΤΗΣ').r);
    // στο χαρτί: η επικεφαλίδα λείπει, τα ονόματα και ο τίτλος όχι
    const d = await renderBook(no.out.data, { file: no.out.name, layout: O([]) }); const html = d.sheets[0].html;
    expect(html).not.toContain('ΟΝΟΜΑΤΕΠΩΝΥΜΟ'); expect(html).not.toContain('Α/Α'); expect(html).toContain('ΔΟΚΙΜΙΟΣ'); expect(html).toContain('ΔΥΝΑΜΗ'); expect(html).toContain('ΕΠΟΠΤΗΣ');
    expect((await renderBook(withH.out.data, { file: withH.out.name, layout: O([]) })).sheets[0].html).toContain('ΟΝΟΜΑΤΕΠΩΝΥΜΟ');
  });
  it('τα Α/Α, το trim και οι έτοιμες γραμμές δουλεύουν όπως πριν· δεν επαναλαμβάνεται η κρυφή επικεφαλίδα σε κάθε σελίδα', async () => {
    const { g, out } = await make(base({ nohead: true }), { trim: true }, 12);
    const nc = firstAt(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ'); const sig = firstAt(g, 'ΕΠΟΠΤΗΣ').r;
    expect(g.slice(nc.r + 1, sig).filter(row => typeof row[nc.c] === 'string' && row[nc.c] !== '').map(row => row[nc.c - 1])).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    const z = await JSZip.loadAsync(out.data); expect(await z.file('xl/workbook.xml')!.async('string')).not.toContain('Print_Titles');
  });
  it('κενός πίνακας (κανείς δεν περνά): βγαίνει χωρίς επικεφαλίδα και χωρίς λάθος', async () => {
    const { g, wb, out } = await make(base({ nohead: true }), {}, 0);
    expect(firstAt(g, 'ΕΠΟΠΤΗΣ').r).toBeGreaterThan(0); expect((await wb.sheet(out.sheets[0])).rowHidden(firstAt(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ').r + 1)).toBe(true);
  });
  it('πίνακας τιμών κάτω από τον πίνακα (στο τέλος): γράφεται κανονικά και δεν χάνεται', async () => {
    const { g } = await make(base({ nohead: true }), { vals: VALS });
    expect(at(g, 'ΣΥΝΟΛΑ').length).toBe(1); expect(at(g, 'ΣΕ ΔΥΝΑΜΗ').length).toBe(1);
    expect(firstAt(g, 'ΣΕ ΔΥΝΑΜΗ').r).toBeLessThan(firstAt(g, 'ΕΠΟΠΤΗΣ').r); expect(firstAt(g, 'ΣΥΝΟΛΑ').r).toBeGreaterThan(firstAt(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ').r + 30);
  });
  it('ταξινόμηση στην εκτύπωση: ο πίνακας με κρυφή επικεφαλίδα ταξινομείται ακόμα, και η 1η γραμμή δεν παίρνεται για επικεφαλίδα', async () => {
    const no = await make(base({ nohead: true })); const withH = await make(base());
    const dn = await renderBook(no.out.data, { file: no.out.name, layout: O([{ c: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', d: true }]) });
    const dw = await renderBook(withH.out.data, { file: withH.out.name, layout: O([{ c: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', d: true }]) });
    expect(dn.cols).toEqual(dw.cols); expect(dn.cols!.map(c => c.k)).toContain('ΟΝΟΜΑΤΕΠΩΝΥΜΟ');
    const body = (html: string) => { const rows = trs(html); const i = rows.findIndex(x => x.td[0] === '1'); return rows.slice(i, i + 30).map(x => x.td[1]); };
    const a = body(dn.sheets[0].html);
    expect(a).toEqual([...a].sort((x, y) => el.compare(y, x))); expect(a).toEqual(body(dw.sheets[0].html)); expect([...a].sort()).toEqual(names(no.s, 30).sort());
  });
});

describe('Χωρίς γραμμή επικεφαλίδων: πίνακας 2, 3…', () => {
  it('μόνο ο 2ος χωρίς επικεφαλίδα: ο 1ος τη διατηρεί, ο 2ος την κρύβει· γραμμές και υπογραφή όπως πριν', async () => {
    const no = await makeTwo(two(true), 6, 9); const withH = await makeTwo(two(), 6, 9);
    expect(no.r.more![0].nohead).toBe(true); expect(no.r.nohead).toBeUndefined();
    expect(no.g).toEqual(withH.g);
    const ws = await no.wb.sheet(no.out.sheets[0]);
    const h1 = firstAt(no.g, 'ΘΑΛ').r + 1, h2 = firstAt(no.g, 'ΤΗΛ').r + 1;
    expect(ws.rowHidden(h1)).toBe(false); expect(ws.rowHidden(h2)).toBe(true);
    const html = (await renderBook(no.out.data, { file: no.out.name, layout: O([]) })).sheets[0].html;
    expect(html).toContain('ΘΑΛ'); expect(html).not.toContain('ΤΗΛ'); expect(html).toContain('ΔΕΥΤΕΡΟΣ');   // ο τίτλος του 2ου μένει
    const sig = firstAt(no.g, 'ΕΠΟΠΤΗΣ').r; const nc = at(no.g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ');
    expect(col(no.g, nc[0].c, h1, h2 - 1).length).toBe(6); expect(col(no.g, nc[1].c, h2, sig).length).toBe(9);
  });
  it('και οι δύο χωρίς επικεφαλίδα (ο ένας κάτω από τον άλλον): δύο κρυφές γραμμές, τα άτομα όλα εκεί', async () => {
    const { g, wb, out } = await makeTwo(two(true, true), 5, 7);
    const ws = await wb.sheet(out.sheets[0]);
    expect(ws.rowHidden(firstAt(g, 'ΘΑΛ').r + 1)).toBe(true); expect(ws.rowHidden(firstAt(g, 'ΤΗΛ').r + 1)).toBe(true);
    const html = (await renderBook(out.data, { file: out.name, layout: O([]) })).sheets[0].html;
    expect(html).not.toContain('ΘΑΛ'); expect(html).not.toContain('ΤΗΛ');
  });
});

describe('Χωρίς γραμμή επικεφαλίδων: φύλλα ανά θάλαμο και ταξινόμηση πολλών πινάκων', () => {
  it('ένα φύλλο ανά θάλαμο: κάθε φύλλο έχει κρυφή επικεφαλίδα και τα δικά του άτομα', async () => {
    const { out, wb, s } = await make(base({ nohead: true }), { split: 'room' }, 16);
    expect(out.sheets.length).toBe(8);
    for (const name of out.sheets) {
      const ws = await wb.sheet(name); const g = await wb.values(name, 60, 10); const h = firstAt(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ').r + 1;
      expect(ws.rowHidden(h), name).toBe(true); expect(ws.rowHidden(h + 1), name).toBe(false);
      expect(col(g, 1, h, 60).length, name).toBeGreaterThanOrEqual(2);
    }
    expect(s.people.length).toBe(40);
  });
  it('δύο πίνακες ο ένας κάτω από τον άλλον, και οι δύο χωρίς επικεφαλίδα: ταξινομούνται και οι δύο στην εκτύπωση (οι θέσεις των κρυφών γραμμών ακολουθούν τις γραμμές που μπήκαν)', async () => {
    const { out } = await makeTwo(two(true, true), 6, 7);
    const doc = await renderBook(out.data, { file: out.name, layout: O([{ c: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', d: true }]) });
    const rows = trs(doc.sheets[0].html).filter(x => /^\d+$/.test(x.td[0]));
    expect(rows.length).toBe(13); const a = rows.slice(0, 6).map(x => x.td[1]), b = rows.slice(6).map(x => x.td[1]);
    expect(a).toEqual([...a].sort((x, y) => el.compare(y, x))); expect(b).toEqual([...b].sort((x, y) => el.compare(y, x)));
    expect(rows.slice(0, 6).map(x => x.td[0])).toEqual(['1', '2', '3', '4', '5', '6']); expect(rows.slice(6).map(x => x.td[0])).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });
});

describe('Χωρίς γραμμή επικεφαλίδων: πίνακες δίπλα δίπλα', () => {
  const BESIDE = [['main', 't2']];
  it('ο δεξιός χωρίς επικεφαλίδα: η γραμμή δεν κρύβεται (ο αριστερός την έχει), αδειάζουν μόνο τα κελιά του δεξιού· ο αριστερός ακέραιος', async () => {
    const no = await makeTwo(two(true), 30, 8, BESIDE); const withH = await makeTwo(two(), 30, 8, BESIDE);
    const [lh] = at(no.g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ'); expect(at(no.g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ').length).toBe(1);
    const [, rh] = at(withH.g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ');
    const ws = await no.wb.sheet(no.out.sheets[0]); expect(ws.rowHidden(lh.r + 1)).toBe(false);
    // η γραμμή επικεφαλίδων: ίδια στα αριστερά, άδεια από τη στήλη του δεξιού και δεξιά
    const pad = (row: unknown[], n: number) => Array.from({ length: n }, (_, i) => row[i] ?? null);
    const hn = no.g[lh.r], hw = withH.g[lh.r];
    expect(pad(hn, rh.c - 1)).toEqual(pad(hw, rh.c - 1)); expect(hn.slice(rh.c - 1).every(v => v == null || v === '')).toBe(true);
    expect(hw.slice(rh.c - 1).some(v => v === 'ΤΗΛ')).toBe(true);
    // όλες οι άλλες γραμμές ίδιες: τα 30 αριστερά, τα 8 δεξιά, υπογραφή στη θέση της
    for (let r = 0; r < withH.g.length; r++) if (r !== lh.r) expect(pad(no.g[r], 40), 'γραμμή ' + (r + 1)).toEqual(pad(withH.g[r], 40));
    const sig = firstAt(no.g, 'ΕΠΟΠΤΗΣ').r;
    expect(col(no.g, lh.c, lh.r + 1, sig).length).toBe(30); expect(col(no.g, rh.c, lh.r + 1, sig).length).toBe(8);
    // στο χαρτί: ούτε το ΤΗΛ ούτε κενό πλαίσιο πάνω από τον δεξιό
    const html = (await renderBook(no.out.data, { file: no.out.name, layout: O([]) })).sheets[0].html;
    expect(html).toContain('ΟΝΟΜΑΤΕΠΩΝΥΜΟ'); expect(html).not.toContain('ΤΗΛ');
  });
  it('ο αριστερός χωρίς επικεφαλίδα και ο δεξιός με: ο δεξιός ακέραιος και ο αριστερός με τα 30 άτομα', async () => {
    const no = await makeTwo(two(false, true), 30, 8, BESIDE); const withH = await makeTwo(two(), 30, 8, BESIDE);
    expect(at(no.g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ').length).toBe(1); const rh = at(no.g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ')[0]; const lh = at(withH.g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ')[0];
    expect(rh.c).toBeGreaterThan(lh.c); expect(rh.r).toBe(lh.r);
    const sig = firstAt(no.g, 'ΕΠΟΠΤΗΣ').r;
    expect(col(no.g, lh.c, lh.r + 1, sig).length).toBe(30); expect(col(no.g, rh.c, rh.r + 1, sig).length).toBe(8);
    expect(no.g[rh.r].slice(rh.c - 1)).toEqual(withH.g[rh.r].slice(rh.c - 1));
  });
  it('και οι δύο χωρίς επικεφαλίδα: κρύβεται η κοινή γραμμή', async () => {
    const { g, wb, out } = await makeTwo(two(true, true), 12, 5, BESIDE);
    const ws = await wb.sheet(out.sheets[0]);
    const hr = firstAt(g, 'ΘΑΛ').r + 1; expect(ws.rowHidden(hr)).toBe(true);
    const html = (await renderBook(out.data, { file: out.name, layout: O([]) })).sheets[0].html;
    expect(html).not.toContain('ΘΑΛ'); expect(html).not.toContain('ΤΗΛ');
  });
  it('πίνακας τιμών δίπλα στον πίνακα ατόμων χωρίς επικεφαλίδα: ο πίνακας τιμών και ο τίτλος του μένουν, δεν κρύβεται η γραμμή', async () => {
    const { g, wb, out } = await make(base({ nohead: true }), { vals: VALS, bands: [['main', 'v1']] });
    const ws = await wb.sheet(out.sheets[0]); const t = firstAt(g, 'ΣΥΝΟΛΑ'); expect(ws.rowHidden(t.r + 1)).toBe(false);
    expect(g[t.r].slice(0, t.c).every(v => v == null || v === '')).toBe(true);   // αριστερά του τίτλου: άδειο (δεν υπάρχει επικεφαλίδα)
    expect(firstAt(g, 'ΣΕ ΔΥΝΑΜΗ').r).toBe(t.r + 1);
    expect(at(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ')).toEqual([]);
    expect(g.filter(row => typeof row[0] === 'number' && typeof row[1] === 'string').length).toBe(30);   // και οι 30 του πίνακα ατόμων
  });
  it('ταξινόμηση στην εκτύπωση ανά πίνακα: ο αριστερός (με επικεφαλίδα) ταξινομείται, ο δεξιός (χωρίς) μένει στη σειρά του και τα δύο δεν ανακατεύονται', async () => {
    const { out, s } = await makeTwo(two(true), 12, 9, BESIDE);
    const plain = await renderBook(out.data, { file: out.name, layout: O([]) });
    const doc = await renderBook(out.data, { file: out.name, layout: O([{ c: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', d: true }]) });
    const rows = trs(doc.sheets[0].html), prow = trs(plain.sheets[0].html);
    const h = rows.findIndex(x => x.td.includes('ΟΝΟΜΑΤΕΠΩΝΥΜΟ')); const lc = rows[h].td.indexOf('ΟΝΟΜΑΤΕΠΩΝΥΜΟ');
    const rc = rows[h + 1].td.findIndex((v, i) => i > lc + 1 && /^[Α-Ω]+ [Α-Ω]+$/.test(v));   // η στήλη ονομάτων του δεξιού (δεν έχει επικεφαλίδα)
    expect(rc).toBeGreaterThan(lc);
    const left = rows.slice(h + 1, h + 13).map(x => x.td[lc]), right = rows.slice(h + 1, h + 10).map(x => x.td[rc]);
    expect(left).toEqual([...left].sort((a, b) => el.compare(b, a)));
    expect([...left].sort()).toEqual(names(s, 12).sort());
    // ο δεξιός: ίδια σειρά με την αταξινόμητη εκτύπωση, ίδια άτομα
    const ph = prow.findIndex(x => x.td.includes('ΟΝΟΜΑΤΕΠΩΝΥΜΟ'));
    expect(right).toEqual(prow.slice(ph + 1, ph + 10).map(x => x.td[rc])); expect(right.every(Boolean)).toBe(true);
    // τα Α/Α του δεξιού μένουν 1…9 και ο δεξιός δεν έχει πάνω από 9 γραμμές
    expect(rows.slice(h + 1, h + 10).map(x => x.td[rc - 1])).toEqual(Array.from({ length: 9 }, (_, i) => String(i + 1)));
    expect(rows[h + 10].td[rc]).toBe('');
    // η εκτύπωση δεν πρόσφερε στήλες από τον πίνακα χωρίς επικεφαλίδα (μόνο ΟΝΟΜΑΤΕΠΩΝΥΜΟ, ΘΑΛ του αριστερού)
    expect(doc.cols!.map(c => c.k)).not.toContain('ΤΗΛ');
  });
  it('και τα τρία: αριστερός με επικεφαλίδα, δεξιός χωρίς, και πίνακας 3 κάτω από αυτούς χωρίς: ούτε μία γραμμή δεν χάνεται', async () => {
    const s = fakeState(40); const r0 = rep({ bands: [['main', 't2'], ['t3']], pick: pickN(10) });
    const o = base({ lay: { w: '1/2' }, more: [
      { id: 't2', title: '', kind: 'people', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }], lay: { w: '1/2' }, nohead: true },
      { id: 't3', title: 'ΤΡΙΤΟΣ', kind: 'people', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑ', w: 'auto' }, { f: 'rank', h: 'ΒΑΘΜΟΣ', w: 'auto' }], nohead: true }] });
    const bo = forBuild(o, r0); const b = await buildTemplate(bo, 'people'); const r = withBuilt(r0, b, bo); r.more = r.more!.map(t => ({ ...t, pick: pickN(7) })); r.sigs = SIG;
    const out = await fillReport(b.data, s, r, s.people.slice(0, 10).map(p => p.id), D, { clock }); const g = await grid(out.data);
    const sig = firstAt(g, 'ΕΠΟΠΤΗΣ').r; const lh = firstAt(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ');
    const named = g.slice(lh.r + 1, sig).flatMap(row => row.filter(v => typeof v === 'string' && /^[Α-Ω0-9]+ [Α-Ω]+$/.test(v) && v !== 'ΣΤΡ ΔΟΚΙΜΙΟΣ')).length;
    expect(named).toBeGreaterThanOrEqual(10 + 7);   // ονόματα του 1ου και του 2ου (ο 3ος γράφει ΟΝΟΜΑ και ΒΑΘΜΟΣ χωριστά)
    expect(g.flat().filter(v => v === 'ΤΡΙΤΟΣ').length).toBe(1);
    const html = (await renderBook(out.data, { file: out.name, layout: O([]) })).sheets[0].html;
    expect(html).not.toContain('ΒΑΘΜΟΣ'); expect(html).not.toContain('ΟΝΟΜΑ</span>');
  });
});
