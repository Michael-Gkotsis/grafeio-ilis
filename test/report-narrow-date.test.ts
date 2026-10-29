// Έντυπα › «Φτιάξ' το εδώ»: πίνακας με 3 στήλες ή λιγότερες. Η κεφαλίδα (A1) δεν χωρά δίπλα στην ημερομηνία (στήλη Β), και με τις προεπιλεγμένες
// Ρυθμίσεις η αλλαγή θέσης την έσπρωχνε δίπλα της σε στενή στήλη: τώρα η ημερομηνία πάει στη γραμμή 4 (ανάμεσα στην κεφαλίδα και τον τίτλο)
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildTemplate, fillReport } from '../src/main/reports';
import { Workbook, colName } from '../src/main/xlsx';
import { blankBuild, defaultPick, withBuilt, type BuildCol, type BuildOpts, type Report } from '../src/shared/reports';
import type { Block } from '../src/shared/layout';
import { fakeState } from './fixtures';

const D = '2026-10-19';
const C = (f: string, h: string, w: BuildCol['w'] = 'auto'): BuildCol => ({ f, h, w });
const LIST = [C('aa', 'Α/Α', 'narrow'), C('rank', 'ΒΑΘΜΟΣ'), C('name', 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ')];
const opts = (cols: BuildCol[], x: Partial<BuildOpts> = {}): BuildOpts => ({ ...blankBuild(), cols, sig: 'none', ...x });
const st = (hdLeft: boolean) => { const s = fakeState(8); return { ...s, settings: { ...s.settings, hdLeft: hdLeft || undefined, unit: ['ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)', '2Η ΕΠΧΙΑ Ν/Σ', '4Η ΙΛΗ'] as [string, string, string] } }; };
async function build(o: BuildOpts, kind: 'people' | 'blank' = 'people') {
  const b = await buildTemplate(o, kind);
  const r = withBuilt({ id: 'r', name: 'x', tpl: 't', kind, sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', sigs: [] } as Report, b, o);
  return { b, r };
}
async function out(o: BuildOpts, hdLeft: boolean, kind: 'people' | 'blank' = 'people') {
  const { b, r } = await build(o, kind); const s = st(hdLeft);
  const res = await fillReport(b.data, s, r, kind === 'blank' ? [0, 1, 2] : s.people.map(p => p.id), D);
  const wb = await Workbook.open(res.data); const ws = await wb.sheet(0); const z = await JSZip.loadAsync(res.data);
  const xml = await z.file('xl/worksheets/sheet1.xml')!.async('string'); const sty = await z.file('xl/styles.xml')!.async('string');
  const xfs = sty.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)![1].match(/<xf\b[\s\S]*?(?:\/>|<\/xf>)/g) || [];
  const al = (ref: string) => { const m = xml.match(new RegExp('<c r="' + ref + '"[^>]*?\\bs="(\\d+)"')); return m ? (xfs[+m[1]].match(/horizontal="(\w+)"/) || [])[1] || '' : ''; };
  const merges = [...xml.matchAll(/<mergeCell ref="([^"]+)"/g)].map(m => m[1]);
  const blk = (id: string) => res.layout[0].blocks.find(x => x.id === id) as Block | undefined;
  return { ws, merges, al, blk, res, tpl: await (await Workbook.open(b.data)).sheet(0), tplMerges: [...(await (await JSZip.loadAsync(b.data)).file('xl/worksheets/sheet1.xml')!.async('string')).matchAll(/<mergeCell ref="([^"]+)"/g)].map(m => m[1]) };
}
const rect = (b: Block) => colName(b.c1) + b.r1 + ':' + colName(b.c2) + b.r2;

describe('Έντυπα: στενός πίνακας, η ημερομηνία δεν στριμώχνει την κεφαλίδα', () => {
  for (const hdLeft of [false, true]) {
    it('3 στήλες (Α/Α, βαθμός, ονοματεπώνυμο), hdLeft=' + hdLeft + ': κεφαλίδα στο A1 ολόκληρη, Β1 και Γ1 άδεια, ημερομηνία στη γραμμή 4 δεξιά (A4:Γ4), τίτλος στη γραμμή 5', async () => {
      const x = await out(opts(LIST), hdLeft);
      expect([x.ws.get('A1'), x.ws.get('A2'), x.ws.get('A3')]).toEqual(['ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)', '2Η ΕΠΧΙΑ Ν/Σ', '4Η ΙΛΗ']);
      expect([x.ws.get('B1') ?? null, x.ws.get('C1') ?? null]).toEqual([null, null]);
      expect(String(x.ws.get('A4'))).toMatch(/19 ΟΚΤ 26$/); expect(x.al('A4')).toBe('right'); expect(x.merges).toContain('A4:C4'); expect(x.merges).not.toContain('B1:C1');
      expect(String(x.ws.get('A5'))).toBe('ΚΑΤΑΣΤΑΣΗ');
      expect(rect(x.blk('date')!)).toBe('A4:C4'); expect(rect(x.blk('head')!)).toBe('A1:A3');   // ούτε η αλλαγή θέσης (swapHeadDate) τα αγγίζει: θα πατούσαν το ένα το άλλο
      expect(x.res.warnings).toEqual([]);
    });
  }
  it('κενός πίνακας με Α/Α και 1 στήλη (2 στήλες): ημερομηνία A4:Β4, κεφαλίδα στο A1', async () => {
    const o = opts([C('aa', 'Α/Α', 'narrow'), C('col', 'ΟΝΟΜΑ')], { grid: [['α'], ['β']], nrows: 3 });
    for (const hdLeft of [false, true]) { const x = await out(o, hdLeft, 'blank'); expect(x.ws.get('A1')).toBe('ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)'); expect(x.ws.get('B1') ?? null).toBeNull(); expect(x.merges).toContain('A4:B4'); expect(String(x.ws.get('A4'))).toMatch(/19 ΟΚΤ 26$/); expect(x.ws.get('A7')).toBe('Α/Α'); }
  });
  it('4 στήλες και πάνω: όπως πριν (ημερομηνία στη γραμμή 1, στις δύο τελευταίες στήλες, συγχωνευμένη)', async () => {
    const x = await out(opts([...LIST, C('asm', 'ΑΣΜ')]), true);
    expect(x.tplMerges).toContain('C1:D1'); expect(x.tpl.get('C1')).toBe('{ΤΟΠΟΣ ΗΜΕΡΟΜΗΝΙΑ}'); expect(x.tpl.get('A4') ?? null).toBeNull();
    expect(rect(x.blk('date')!)).toBe('C1:D1'); expect(x.ws.get('A1')).toBe('ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)');
    const w = await out(opts([...LIST, C('asm', 'ΑΣΜ'), C('room', 'ΘΑΛ.', 'narrow'), C('blank', 'ΠΑΡΑΤΗΡΗΣΕΙΣ')]), true); expect(w.tplMerges).toContain('E1:F1');
  });
  it('πλέγμα (πλάτος πίνακα ή θέση): όπως πριν, ακόμα και με 3 στήλες', async () => {
    const x = await out(opts(LIST, { lay: { w: 'full' } }), true);
    expect(x.tplMerges).toContain('Q1:X1'); expect(x.tpl.get('Q1')).toBe('{ΤΟΠΟΣ ΗΜΕΡΟΜΗΝΙΑ}'); expect(x.tpl.get('A4') ?? null).toBeNull();
  });
  it('χωρίς κεφαλίδα (μόνο ημερομηνία) ή χωρίς ημερομηνία: δεν αλλάζει τίποτα', async () => {
    const nh = await out(opts(LIST, { head: false }), true); expect(nh.tpl.get('A4') ?? null).toBeNull(); expect(nh.tpl.get('B1')).toBe('{ΤΟΠΟΣ ΗΜΕΡΟΜΗΝΙΑ}');   // όπως πριν
    const nd = await out(opts(LIST, { date: false }), true); expect(nd.tpl.get('A4') ?? null).toBeNull(); expect(nd.tpl.get('B1') ?? null).toBeNull(); expect(nd.ws.get('A1')).toBe('ΚΕΝ ΑΥΛΩΝΑ (ΚΕΤΘ)');
  });
});
