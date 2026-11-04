// Έντυπα (Michael, 4/11): «Σταθερό μέγεθος γραμμάτων» ανά έντυπο (τα γράμματα δεν μικραίνουν για να χωρέσουν: αναδίπλωση και
// ψηλότερη γραμμή, εκτύπωση με τα γράμματα του Excel), και το «Σελίδα 1 από 2» της εκτύπωσης κλείνει και την αρίθμηση του αρχείου
// («ΣΕΛΙΔΑ &P ΑΠΟ &N» των εντύπων), που συνέχιζε να βγαίνει.
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildTemplate, fillReport } from '../src/main/reports';
import { PRINT_DEFAULT, renderBook, type PrintOpts } from '../src/main/print';
import { fitText, textPx } from '../src/main/textfit';
import { defaultPick, forBuild, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import { fakeState } from './fixtures';

const D = '2026-10-19', clock = { today: D, now: 12 * 60 };
const ARIAL = { name: 'Arial', sz: 12, b: false };
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑ', w: 'narrow' as const }, { f: 'room', h: 'ΘΑΛ', w: 'narrow' as const }];
const base = (x: Partial<BuildOpts> = {}): BuildOpts => ({ title: 'ΔΥΝΑΜΗ', head: true, date: true, sig: 'none', land: false, sz: 12, fill: 'gray', cols, ...x });
const O = (x: Partial<PrintOpts> = {}): PrintOpts => ({ ...PRINT_DEFAULT, ...x });
const LONG = 'ΧΑΤΖΗΚΩΝΣΤΑΝΤΙΝΟΠΟΥΛΟΣ-ΠΑΠΑΔΗΜΗΤΡΙΟΥ ΑΛΕΞΑΝΔΡΟΣ';

async function make(o: BuildOpts, x: Partial<Report> = {}, n = 20) {
  const s = fakeState(n); s.people[0] = { ...s.people[0], last: 'ΧΑΤΖΗΚΩΝΣΤΑΝΤΙΝΟΠΟΥΛΟΣ-ΠΑΠΑΔΗΜΗΤΡΙΟΥ', first: 'ΑΛΕΞΑΝΔΡΟΣ' };
  const r0 = rep(x); const bo = forBuild(o, r0); const b = await buildTemplate(bo, 'people');
  const r = { ...withBuilt(r0, b, bo), ...x };
  return fillReport(b.data, s, r, s.people.map(p => p.id), D, { clock });
}
// μέγεθος γραμμάτων κάθε κελιού με κείμενο (στυλ → γραμματοσειρά → sz)
async function sizes(data: Buffer) {
  const z = await JSZip.loadAsync(data);
  const st = await z.file('xl/styles.xml')!.async('string'); const sh = await z.file('xl/worksheets/sheet1.xml')!.async('string');
  const fonts = [.../<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(st)![1].matchAll(/<font\b[^>]*?(?:\/>|>[\s\S]*?<\/font>)/g)].map(m => Number(/<sz val="([^"]+)"/.exec(m[0])?.[1] || 11));
  const xfs = [.../<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st)![1].matchAll(/<xf\b[^>]*>/g)].map(m => Number(/fontId="(\d+)"/.exec(m[0])?.[1] || 0));
  const ss = z.file('xl/sharedStrings.xml') ? [...(await z.file('xl/sharedStrings.xml')!.async('string')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(x => x[1]).join('')) : [];
  const out = new Map<string, number>();
  for (const m of sh.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const s = Number(/\ss="(\d+)"/.exec(m[2])?.[1] || 0), t = /\st="(\w+)"/.exec(m[2])?.[1]; const inner = m[3] || '';
    const txt = t === 's' ? ss[Number(/<v>([^<]*)<\/v>/.exec(inner)?.[1])] : t === 'inlineStr' ? [...inner.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(x => x[1]).join('') : null;
    if (txt) out.set(txt, fonts[xfs[s]]);
  }
  return out;
}

describe('fitText με keep', () => {
  it('δεν μικραίνει ποτέ: αναδίπλωση και ψηλότερη γραμμή, ακόμα και για λέξη μεγαλύτερη από τη στήλη', () => {
    const t = 'ΠΑΠΑΔΟΠΟΥΛΟΠΟΥΛΟΣ ΚΩΝΣΤΑΝΤΙΝΟΣ'; const w = textPx(t, ARIAL) * 0.85;
    expect(fitText(t, ARIAL, { w, h: 15, wrap: false })!.sz).toBeLessThan(12);          // όπως πριν: μικραίνει
    const k = fitText(t, ARIAL, { w, h: 15, wrap: false }, undefined, true)!;
    expect(k.sz).toBe(12); expect(k.wrap).toBe(true); expect(k.grow).toBeGreaterThan(0);
    const word = 'ΧΑΤΖΗΚΩΝΣΤΑΝΤΙΝΟΠΟΥΛΟΣ'; const ww = textPx(word, ARIAL) / 2;
    expect(fitText(word, ARIAL, { w: ww, h: 15, wrap: false })!.sz).toBeLessThan(12);
    const kw = fitText(word, ARIAL, { w: ww, h: 15, wrap: false }, undefined, true)!;
    expect(kw.sz).toBe(12); expect(kw.grow).toBeGreaterThan(0);
  });
});

describe('Σταθερό μέγεθος γραμμάτων στο έντυπο', () => {
  it('χωρίς: το μεγάλο όνομα φαρδαίνει τη στήλη ή μικραίνει· με: μένει 12 και η στήλη όσο ήταν', async () => {
    const off = await make(base(), {}); const on = await make(base(), { fixsz: true });
    const so = await sizes(on.data);
    expect(so.get(LONG)).toBe(12);
    for (const [t, sz] of so) if (/^[Α-Ω]/.test(t) && t !== 'ΔΥΝΑΜΗ') expect(sz, t).toBeGreaterThanOrEqual(10);
    const colsOf = async (d: Buffer) => (await (await JSZip.loadAsync(d)).file('xl/worksheets/sheet1.xml')!.async('string')).match(/<cols>[\s\S]*?<\/cols>/)![0];
    expect(await colsOf(on.data)).not.toBe(await colsOf(off.data));                     // χωρίς: η στήλη φάρδυνε
    // το φύλλο με σταθερά γράμματα: ψηλότερη γραμμή αντί για μικρότερα γράμματα
    expect(await (await JSZip.loadAsync(on.data)).file('xl/worksheets/sheet1.xml')!.async('string')).toMatch(/customHeight="1"/);
  });
});

describe('«Σελίδα 1 από 2» και η αρίθμηση του εντύπου', () => {
  const footer = (html: string) => [...html.matchAll(/<div class="hf"[^>]*>([\s\S]*?)<\/div>/g)].map(m => m[1].replace(/<[^>]+>/g, ' ').trim()).filter(Boolean);
  it('κλειστό: δεν βγαίνει «ΣΕΛΙΔΑ 1 ΑΠΟ 2», ούτε οριζόντια· ανοιχτό: βγαίνει μόνο με πάνω από μία σελίδα', async () => {
    const out = await make(base({ land: true }), {}, 90);
    const on = await renderBook(out.data, { file: out.name, layout: O({ pages: 2, or: 'l' }) });
    expect(on.total).toBe(2);
    expect(footer(on.sheets[0].html)).toEqual(['ΣΕΛΙΔΑ 1 ΑΠΟ 2', 'ΣΕΛΙΔΑ 2 ΑΠΟ 2']);
    for (const or of ['l', 'p', 'auto'] as const) {
      const off = await renderBook(out.data, { file: out.name, layout: O({ pages: 2, or, pno: false }) });
      expect(off.sheets[0].html).not.toContain('ΣΕΛΙΔΑ');
    }
    const one = await renderBook(out.data, { file: out.name, layout: O({ pages: 1, or: 'l' }) });
    expect(one.sheets[0].html).not.toContain('ΣΕΛΙΔΑ 1 ΑΠΟ 1');
  });
});
