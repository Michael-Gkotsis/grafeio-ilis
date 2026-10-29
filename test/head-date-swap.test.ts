// Ημερομηνία (τόπος) πάνω αριστερά και κεφαλίδα πάνω δεξιά, σε όλα τα έντυπα εκτός από την ΗΚΑΙ (Michael, 29/10). Με hdLeft: true η παλιά διάταξη.
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { rosterPrint, weaponsBook } from '../src/main/excel';
import { fillFroura, fillHkai, fillOuts, signMade } from '../src/main/exports';
import { buildTemplate, fillReport } from '../src/main/reports';
import { Workbook, colName } from '../src/main/xlsx';
import { PRESETS, defaultPick, withBuilt, type Report } from '../src/shared/reports';
import type { Block, LayoutSheet } from '../src/shared/layout';
import { fakeState } from './fixtures';

const D = '2026-10-19';
const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const st = (old: boolean) => { const s = fakeState(12); return { ...s, settings: { ...s.settings, hdLeft: old ? true : undefined } }; };
const blk = (l: LayoutSheet, id: string) => l.blocks.find(b => b.id === id) as Block;
const ref = (b: Block) => colName(b.c1) + b.r1;
const rect = (b: Block) => colName(b.c1) + b.r1 + ':' + colName(b.c2) + b.r2;
// κελιά, συγχωνεύσεις και στοίχιση του πρώτου φύλλου (ή του sheet) όπως είναι στο αρχείο
async function look(data: Buffer, sheet = 0) {
  const wb = await Workbook.open(data); const ws = await wb.sheet(sheet);
  const z = await JSZip.loadAsync(data); const xml = await z.file('xl/worksheets/sheet' + (sheet + 1) + '.xml')!.async('string'); const sty = await z.file('xl/styles.xml')!.async('string');
  const xfs = [...(sty.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)![1].match(/<xf\b[\s\S]*?(?:\/>|<\/xf>)/g) || [])];
  const h = (r: string) => { const m = xml.match(new RegExp('<c r="' + r + '"[^>]*?\\bs="(\\d+)"')); const x = m && xfs[+m[1]]; return x ? (x.match(/horizontal="(\w+)"/) || [])[1] || '' : ''; };
  const merges = [...xml.matchAll(/<mergeCell ref="([^"]+)"/g)].map(m => m[1]).sort();
  return { get: (r: string) => ws.get(r), h, merges };
}

describe('Ημερομηνία αριστερά, κεφαλίδα δεξιά', () => {
  it('Excel της εφαρμογής (signMade): η ημερομηνία εκεί που άρχιζε η κεφαλίδα, η κεφαλίδα τελειώνει εκεί που τελείωνε η ημερομηνία', async () => {
    for (const [mk, form] of [[rosterPrint, 'roster'], [weaponsBook, 'weapons']] as const) {
    const run = async (old: boolean) => { const s = st(old); const m = await mk(s, D); return signMade(m.data, s, form, m.marks); };
    const o = await run(true), n = await run(false);
    for (const [lo, ln] of o.layout.map((l, i) => [l, n.layout[i]] as const).filter(([l]) => l.blocks.some(b => b.id === 'date'))) {
      const [h0, d0] = [blk(lo, 'head'), blk(lo, 'date')], [h1, d1] = [blk(ln, 'head'), blk(ln, 'date')];
      expect(h0.c1).toBeLessThan(d0.c1);   // παλιά: κεφαλίδα αριστερά
      expect([d1.r1, d1.c1]).toEqual([h0.r1, h0.c1]);   // η ημερομηνία πάνω αριστερά, εκεί που άρχιζε η κεφαλίδα
      expect([h1.r1, h1.c2]).toEqual([h0.r1, d0.c2]);   // η κεφαλίδα πάνω δεξιά, ως εκεί που τελείωνε η ημερομηνία
      expect([h1.c2 - h1.c1, h1.r2 - h1.r1]).toEqual([h0.c2 - h0.c1, h0.r2 - h0.r1]);   // ίδιο μέγεθος
      const w0 = await look(o.data, o.layout.indexOf(lo)), w1 = await look(n.data, n.layout.indexOf(ln));
      expect(w1.get(ref(d1))).toBe(w0.get(ref(d0))); expect(w1.get(ref(h1))).toBe(w0.get(ref(h0)));   // ίδιο κείμενο, άλλη θέση
      expect(w1.h(ref(d1))).toBe('left');
      // οι συγχωνεύσεις μετακινούνται μαζί: ίδιος αριθμός, και όσες ήταν στα κομμάτια πάνε στις νέες θέσεις τους
      expect(w1.merges.length).toBe(w0.merges.length);
      for (const [a, b] of [[h0, h1], [d0, d1]]) if (w0.merges.includes(rect(a))) expect(w1.merges).toContain(rect(b));
    }
    }
  });
  it('Excel της εφαρμογής χωρίς κεφαλίδα και ημερομηνία (Έλεγχος, Στελέχη, φύλλα του Οπλισμού) μένουν όπως είναι', async () => {
    const s = st(false); const s0 = st(true); const m = await weaponsBook(s, D);
    const a = await signMade(m.data, s, 'weapons', m.marks), b = await signMade(m.data, s0, 'weapons', m.marks);
    for (const i of a.layout.keys()) if (!a.layout[i].blocks.some(x => x.id === 'date')) expect(a.layout[i]).toEqual(b.layout[i]);
  });

  it('Έντυπα («Φτιάξ\' το εδώ»): ημερομηνία πάνω αριστερά, κεφαλίδα δεξιά, αριστερά στοιχισμένη', async () => {
    const o = PRESETS.find(p => p.id === 'onomastiki')!.opts; const b = await buildTemplate(o, 'people');
    const run = async (old: boolean) => { const s = st(old); const r = withBuilt({ id: 'r', name: 'x', tpl: 't', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file' } as Report, b, o);
      return { s, out: await fillReport(b.data, s, r, s.people.map(p => p.id), D) }; };
    const [o0, n0] = [await run(true), await run(false)];
    const [h0, d0] = [blk(o0.out.layout[0], 'head'), blk(o0.out.layout[0], 'date')], [h1, d1] = [blk(n0.out.layout[0], 'head'), blk(n0.out.layout[0], 'date')];
    const w0 = await look(o0.out.data), w1 = await look(n0.out.data);
    expect(w0.get('A1')).toBe(o0.s.settings.unit[0].toUpperCase());   // παλιά
    expect(w1.get(ref(d1))).toMatch(/19 ΟΚΤ 26$/); expect(ref(d1)).toBe(ref(h0));   // ημερομηνία εκεί που άρχιζε η κεφαλίδα
    expect(w1.get(ref(h1))).toBe(w0.get(ref(h0))); expect(h1.c2).toBe(d0.c2);   // κεφαλίδα ως εκεί που τελείωνε η ημερομηνία
    expect(w1.h(ref(d1))).toBe('left');
    expect(w1.merges.length).toBe(w0.merges.length);
    // ό,τι έσυρες μετρά από τη νέα θέση
    const s = st(false); s.settings.layout = undefined;
    const r = withBuilt({ id: 'r', name: 'x', tpl: 't', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', layout: { date: [0, 1] } } as Report, b, o);
    const mv = await fillReport(b.data, s, r, s.people.map(p => p.id), D);
    expect(blk(mv.layout[0], 'date').c1).toBe(d1.c1 + 1);
  });

  it('Εξοδούχοι: η κεφαλίδα μένει δεξιά και η ημερομηνία ανεβαίνει πάνω αριστερά', async () => {
    const o = await fillOuts(T('exodouxoi.xlsx'), st(true), D), n = await fillOuts(T('exodouxoi.xlsx'), st(false), D); const lo2 = o.layout!, ln2 = n.layout!;
    for (let i = 0; i < 2; i++) {
      const [h0, d0, h1, d1] = [blk(lo2[i], 'head'), blk(lo2[i], 'date'), blk(ln2[i], 'head'), blk(ln2[i], 'date')];
      expect(rect(h1)).toBe(rect(h0)); expect([d1.r1, d1.c1]).toEqual([h0.r1, 1]);
      const w0 = await look(o.data, i), w1 = await look(n.data, i);
      expect(w1.get('A1')).toBe(w0.get(ref(d0))); expect(w1.get(ref(d0))).toBeNull(); expect(w1.h('A1')).toBe('left');
      expect(w1.get(ref(h1))).toBe(w0.get(ref(h0)));
    }
  });

  it('ΗΚΑΙ: ποτέ δεν αλλάζει (Michael, 29/10 22:04) — κεφαλίδα αριστερά, ίδιο Excel με ή χωρίς hdLeft, και οι θέσεις που έσυρες μετρούν όπως πριν', async () => {
    const o = await fillHkai(T('hkai.xlsx'), st(true), D), n = await fillHkai(T('hkai.xlsx'), st(false), D);
    expect(n.layout).toEqual(o.layout);   // front και back
    expect(n.layout!.some(l => l.blocks.some(b => b.id === 'head' || b.id === 'date'))).toBe(true);
    const f = blk(n.layout![0], 'head'); expect([f.r1, f.c1]).toEqual([blk(o.layout![0], 'head').r1, 1]);   // κεφαλίδα εκεί που την έχει το template, αριστερά
    const [a, b] = [await Workbook.open(o.data), await Workbook.open(n.data)];
    for (let i = 0; i < n.layout!.length; i++) expect((await b.sheet(i)).dump()).toEqual((await a.sheet(i)).dump());
    expect((await look(n.data)).merges).toEqual((await look(o.data)).merges);
    // «Θέσεις στο χαρτί…» ισχύει κανονικά: η ημερομηνία του μπροστινού μετακινείται από τη θέση του template
    for (const old of [true, false]) {
      const s = st(old); s.settings.layout = { hkai: { front: { date: [1, 0] } } };
      const mv = await fillHkai(T('hkai.xlsx'), s, D);
      expect(blk(mv.layout![0], 'date').r1).toBe(blk(o.layout![0], 'date').r1 + 1);
    }
  });

  it('hdLeft: true = η παλιά διάταξη (κεφαλίδα αριστερά, ημερομηνία δεξιά)', async () => {
    const s = st(true); const m = await rosterPrint(s, D); const r = await signMade(m.data, s, 'roster', m.marks);
    for (const l of r.layout.filter(x => x.blocks.some(b => b.id === 'date'))) { expect(blk(l, 'head').c1).toBe(1); expect(blk(l, 'date').c1).toBeGreaterThan(1); }
    const w = await look(r.data); expect(w.get('A1')).toBe(s.settings.unit[0].toUpperCase());
    // και ίδιο με το αρχικό Excel της εφαρμογής: ο ίδιος πίνακας κελιών με κεφαλίδα στο Α1
    const s2 = { ...s, settings: { ...s.settings, hdLeft: false } }; const r2 = await signMade(m.data, s2, 'roster', m.marks);
    expect((await look(r2.data)).get('A1')).not.toBe(w.get('A1'));
  });

  it('φύλλο μόνο με κεφαλίδα (ΦΡΟΥΡΑ) μένει όπως είναι', async () => {
    const o = await fillFroura(T('froura.xlsx'), st(true), D), n = await fillFroura(T('froura.xlsx'), st(false), D);
    expect(n.layout).toEqual(o.layout); expect(n.layout![0].blocks.some(b => b.id === 'date')).toBe(false);
    expect((await look(n.data)).merges).toEqual((await look(o.data)).merges);
    const [a, b] = [await Workbook.open(o.data), await Workbook.open(n.data)];
    expect((await b.sheet(0)).dump()).toEqual((await a.sheet(0)).dump());
  });
});
