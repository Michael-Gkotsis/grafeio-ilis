// Θέσεις πάνω στο χαρτί (Michael, 20/10): κεφαλίδα, ημερομηνία και υπογραφές πάνε όπου τα έσυρες.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fillFroura, fillHkai, fillOuts } from '../src/main/exports';
import { buildTemplate, fillReport } from '../src/main/reports';
import { Workbook } from '../src/main/xlsx';
import { PRESETS, defaultPick, type Report } from '../src/shared/reports';
import { cleanLayout, dropSigMoves } from '../src/shared/layout';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
const D = '2026-10-12';
const withLayout = (s: any, layout: any) => ({ ...s, settings: { ...s.settings, layout } });
const open = async (data: Buffer, sheet: number | string = 0) => (await Workbook.open(data)).sheet(sheet as any);

describe('θέσεις πάνω στο χαρτί', () => {
  it('χωρίς μετακινήσεις: ίδιο αρχείο, και λέει πού είναι το καθένα', async () => {
    const r = await fillFroura(T('froura.xlsx'), fakeState(30), D);
    const l = r.layout![0];
    expect(l.key).toBe('main');
    expect(l.blocks.map(b => b.id)).toEqual(['head', 's0', 's1', 's2', 's3']);
    expect(l.blocks[0]).toMatchObject({ r1: 1, r2: 3, c1: 12 });
    expect(l.blocks[1]).toMatchObject({ r1: 45, r2: 46 });
  });

  it('ΦΡΟΥΡΑ: η κεφαλίδα πάει αριστερά και η πρώτη υπογραφή πιο κάτω', async () => {
    const s = withLayout(fakeState(30), { froura: { main: { head: [0, -11], s0: [2, 0] } } });
    const r = await fillFroura(T('froura.xlsx'), s, D);
    const ws = await open(r.data);
    expect(ws.get('A1')).toBe(s.settings.unit[0].toUpperCase()); expect(ws.get('A3')).toBe(s.settings.unit[2].toUpperCase());
    expect(ws.get('L1')).toBeNull();
    expect(ws.get('B47')).toBe('Ο'); expect(ws.get('B48')).toBe('ΑΛΧΙΑΣ ΙΛΗΣ');
    expect(ws.get('B45')).toBeNull(); expect(ws.get('D46')).toBe('ΔΚΤΗΣ ΙΛΗΣ');   // οι άλλες έμειναν
    expect(r.layout![0].blocks.find(b => b.id === 's0')).toMatchObject({ r1: 47, r2: 48 });
    expect((await Workbook.open(r.data) as any).workbookXml).toMatch(/\$A\$1:\$M\$48</);   // και τυπώνεται
  });

  it('ΗΚΑΙ: ξεχωριστά μπροστινό και πίσω, και η συγχώνευση της υπογραφής πάει μαζί', async () => {
    const s = withLayout(fakeState(30), { hkai: { front: { s1: [1, -2] }, back: { date: [-1, 0] } } });
    const r = await fillHkai(T('hkai.xlsx'), s, D);
    const fr = await open(r.data, 0); const bk = await open(r.data, 1);
    expect(fr.get('U37')).toBe('-Ο-'); expect(fr.get('W36')).toBeNull(); expect(fr.get('T38')).toBe('ΔΙΟΙΚΗΤΗΣ ΙΛΗΣ'); expect(fr.get('V37')).toBeNull();
    expect(fr.merges().some(m => m.r1 === 38 && m.c1 === 20 && m.c2 === 22)).toBe(true);
    expect(bk.get('L22')).toMatch(/, /); expect(bk.get('L23')).toBeNull();
    expect(r.layout!.map(x => x.key)).toEqual(['front', 'back']);
  });

  it('Εξοδούχοι: η μετακίνηση μετρά από τη θέση του εντύπου, όσο κι αν μακρύνει η λίστα', async () => {
    const s = withLayout(fakeState(30), { outs: { outs: { s1: [3, 0] }, stay: { s1: [3, 0] } } });
    const r = await fillOuts(T('exodouxoi.xlsx'), s, D);
    for (const l of r.layout!) {
      const s1 = l.blocks.find(b => b.id === 's1')!; const ws = await open(r.data, l.sheet);
      expect(ws.get('G' + (s1.r1 + 1))).toBe('ΔΚΤΗΣ ΙΛΗΣ');
      expect(s1.r1).toBe(l.blocks.find(b => b.id === 's0')!.r1 + 3);
    }
  });

  it('Έντυπα: κεφαλίδα και υπογραφές του εντύπου μετακινούνται (όλα τα φύλλα)', async () => {
    const o = PRESETS.find(p => p.id === 'onomastiki')!.opts;
    const b = await buildTemplate({ ...o, sig: 'list' }, 'people');
    const s = fakeState(30);
    const rep: Report = { id: 'r1', name: 'Α', tpl: 't1', kind: 'people', sheet: b.sheet, head: b.head, cols: b.cols, cells: b.cells, pick: defaultPick(), sort: 'name', day: 'today', out: 'file', layout: { head: [0, 2], s1: [2, 0] } };
    const out = await fillReport(b.data, s, rep, s.people.slice(0, 5).map(p => p.id), D);
    const ws = await open(out.data);
    expect(ws.get('C1')).toBe(s.settings.unit[0].toUpperCase()); expect(ws.get('A1')).toBeNull();
    const bl = out.layout[0].blocks; expect(bl.map(x => x.id)).toEqual(expect.arrayContaining(['head', 's0', 's1']));
    const s0 = bl.find(x => x.id === 's0')!, s1 = bl.find(x => x.id === 's1')!;
    expect(s1.r1).toBe(s0.r1 + 2); expect(ws.get('D' + (s1.r1 + 1))).toBe('ΔΙΟΙΚΗΤΗΣ');
  });

  it('αποθήκευση: χωρίς μηδενικά· άλλο πλήθος υπογραφών σβήνει μόνο τις θέσεις τους', () => {
    expect(cleanLayout({ a: { head: [0, 0] }, b: { s0: [1, 0] } })).toEqual({ b: { s0: [1, 0] } });
    expect(cleanLayout({ a: { head: [0, 0] } })).toBeUndefined();
    expect(dropSigMoves({ main: { head: [1, 1], s0: [2, 0] } })).toEqual({ main: { head: [1, 1] } });
  });
});
