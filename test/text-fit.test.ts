// Ό,τι γράφει η εφαρμογή στα Excel φαίνεται ολόκληρο μέσα στο κελί του (Michael, 18/10): μεγάλα ονόματα στο μπλοκ των
// σκοπών, στις λίστες τιμωρημένων/απόντων κ.λπ. μικραίνουν λίγο ή αναδιπλώνονται, και ψηλώνει η γραμμή μόνο αν δεν φτάνει.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { apply, type Ctx } from '../src/shared/commands';
import { fillFroura } from '../src/main/exports';
import { dutyCheck } from '../src/main/excel';
import { Workbook } from '../src/main/xlsx';
import { fitText, textPx, minSize } from '../src/main/textfit';
import { fakeState } from './fixtures';

const T = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'templates', n));
let seq = 0;
const ctx: Ctx = { today: '2026-10-12', newId: () => 'x' + ++seq };
const ARIAL = { name: 'Arial', sz: 12, b: false };

describe('fitText', () => {
  it('χωράει: τίποτα δεν αλλάζει', () => {
    expect(fitText('ΔΟΚΙΜΙΟΣ ΑΛΦΑΣ', ARIAL, { w: 200, h: 15, wrap: false })).toBeNull();
  });
  it('λίγο μεγαλύτερο: μία γραμμή με μικρότερα γράμματα, όχι κάτω από τα 3/4', () => {
    const t = 'ΠΑΠΑΔΟΠΟΥΛΟΠΟΥΛΟΣ ΚΩΝΣΤΑΝΤΙΝΟΣ'; const w = textPx(t, ARIAL) * 0.85;
    const f = fitText(t, ARIAL, { w, h: 15, wrap: false })!;
    expect(f.sz).toBeLessThan(12); expect(f.sz).toBeGreaterThanOrEqual(minSize(12)); expect(f.grow).toBe(0);
    expect(textPx(t, { ...ARIAL, sz: f.sz })).toBeLessThanOrEqual(w);
  });
  it('ψηλό κελί (θαλαμοφύλακας σε 3 γραμμές): αναδίπλωση στο ίδιο μέγεθος', () => {
    const t = 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΚΩΝΣΤΑΝΤΙΝΟΣ';
    expect(fitText(t, ARIAL, { w: textPx('ΠΑΠΑΔΟΠΟΥΛΟΣ', ARIAL) + 5, h: 45, wrap: false })).toEqual({ sz: 12, wrap: true, grow: 0 });
  });
  it('πολύ μεγάλο σε μία γραμμή: αναδίπλωση και ψηλότερη γραμμή', () => {
    const t = 'ΜΕ ΑΠΟΦΑΣΗ ΔΙΟΙΚΗΤΗ ΓΙΑ ΟΙΚΟΓΕΝΕΙΑΚΟΥΣ ΛΟΓΟΥΣ ΚΑΙ ΜΕΤΑΚΙΝΗΣΗ';
    const f = fitText(t, ARIAL, { w: 160, h: 15, wrap: false })!;
    expect(f.wrap).toBe(true); expect(f.grow).toBeGreaterThan(0);
  });
  it('ημερομηνία: μόνο μικραίνει', () => {
    const f = fitText('00/00/0000', ARIAL, { w: 50, h: 15, wrap: false, num: true })!;
    expect(f.wrap).toBe(false); expect(f.sz).toBeLessThan(12);
  });
});

const LONG = ['ΧΑΤΖΗΓΕΩΡΓΙΑΔΗΣ-ΚΩΝΣΤΑΝΤΙΝΙΔΗΣ', 'ΠΑΠΑΔΟΠΟΥΛΟΠΟΥΛΟΣ', 'ΚΑΡΑΓΙΑΝΝΟΠΟΥΛΟΣ', 'ΠΑΠΑΚΩΝΣΤΑΝΤΙΝΟΥ'];
function longState(phase: 'sven' | 'spen') {
  let s = fakeState(60);
  s.people = s.people.map((p, i) => ({ ...p, last: LONG[i % 4] + (i >= 4 ? String(i) : ''), first: 'ΚΩΝΣΤΑΝΤΙΝΟΣ' }));
  if (phase === 'spen') s = apply(s, { t: 'setPhase', phase: 'spen' }, ctx).state;
  s = apply(s, { t: 'autofill', date: '2026-10-12' }, ctx).state;
  s = apply(s, { t: 'declare', cmd: { type: 'LEAVE', pids: [20, 21, 22], from: '2026-10-10', to: '2026-10-14' } }, ctx).state;
  return s;
}
// στυλ → μέγεθος γραμμάτων και αναδίπλωση
async function fontOf(data: Buffer) {
  const xml = await (await JSZip.loadAsync(data)).file('xl/styles.xml')!.async('string');
  const fonts = /<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(xml)![1].match(/<font\b[^>]*?(?:\/>|>[\s\S]*?<\/font>)/g)!;
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)![1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)!;
  return (s: number | null) => { const x = xfs[s ?? 0]; return { sz: Number(/<sz val="([^"]+)"/.exec(fonts[Number(/fontId="(\d+)"/.exec(x)![1])])![1]), wrap: /wrapText="1"/.test(x) }; };
}

describe('έντυπα με μεγάλα ονόματα', () => {
  it('ΦΡΟΥΡΑ: κάθε όνομα χωράει στο κελί του, με ίδιο μέγεθος σε κάθε στήλη· οι επικεφαλίδες του εντύπου μένουν ίδιες', async () => {
    const r = await fillFroura(T('froura.xlsx'), longState('sven'), '2026-10-12');
    const ws = await (await Workbook.open(r.data)).sheet(0); const f = await fontOf(r.data);
    const tpl = await (await Workbook.open(T('froura.xlsx'))).sheet(0);
    // θαλαμοφύλακες: ίδιο μέγεθος σε όλο το μπλοκ, και όλα χωράνε σε 3 γραμμές των 15
    const guards = ['C13', 'C16', 'C19', 'C22'];
    expect(new Set(guards.map(c => f(ws.style(c)).sz)).size).toBe(1);
    for (const c of guards) {
      const font = { name: 'Arial', ...f(ws.style(c)) };
      const h = [0, 1, 2].reduce((a, i) => a + ws.rowHeight(Number(c.slice(1)) + i), 0);
      expect(fitText(ws.get(c)!, { ...font, b: false }, { w: Math.floor(25 * 7) - 6, h, wrap: true }), c).toBeNull();
    }
    // μαγειρεία: όλα στο ίδιο μέγεθος
    expect(new Set(['F27', 'F28', 'F29', 'F30', 'F31'].map(c => f(ws.style(c)).sz)).size).toBe(1);
    // ό,τι δεν έγραψε η εφαρμογή μένει όπως στο template
    for (const c of ['C12', 'D13', 'B35', 'I35']) expect(ws.style(c), c).toBe(tpl.style(c));
  });
  it('ΦΡΟΥΡΑ ΣΠΕΝ: το ζεύγος σκοπών (δύο ονόματα στο ίδιο κελί) χωράει', async () => {
    const r = await fillFroura(T('froura-spen.xlsx'), longState('spen'), '2026-10-12');
    const ws = await (await Workbook.open(r.data)).sheet(0); const f = await fontOf(r.data);
    for (const c of ['J27', 'J30']) {
      if (!ws.get(c)) continue;
      const x = f(ws.style(c));
      expect(x.wrap).toBe(true);
      const h = [0, 1, 2].reduce((a, i) => a + ws.rowHeight(Number(c.slice(1)) + i), 0);
      expect(fitText(ws.get(c)!, { name: 'Arial', sz: x.sz, b: false }, { w: Math.floor(24.57 * 7) - 6, h, wrap: true }), c).toBeNull();
    }
  });
  it('Έλεγχος υπηρεσιών (ExcelJS): οι στήλες ονομάτων φαρδαίνουν όσο χρειάζεται', async () => {
    const r = await dutyCheck(longState('sven'), '2026-10');
    const xml = await (await JSZip.loadAsync(r.data)).file('xl/worksheets/sheet1.xml')!.async('string');
    const w = Number(/<col min="3" max="3" width="([\d.]+)"/.exec(xml)![1]);
    expect(w).toBeGreaterThan(18);
  });
});
