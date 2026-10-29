// Έντυπα (Michael, 29/10): «Κενός πίνακας» με {ΕΤΙΚΕΤΕΣ} στα κελιά, όπως στα δικά σου Excel: στοιχεία εντύπου, γραμμές πινάκων τιμών, μετρήσεις
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Workbook, colName } from '../src/main/xlsx';
import { buildTemplate, fillReport } from '../src/main/reports';
import { blankFill, blankTags, cellValue, fieldValue, forBuild, rowsOf, withBuilt, type BlankTags, type BuildOpts, type Report } from '../src/shared/reports';
import { atOf, evalTables, metricByTag, metricsOf, tagText, type ValueTable } from '../src/shared/values';
import { fakeState } from './fixtures';

const D = '2026-10-19', clock = { today: D, now: 12 * 60 };
const rep = (x: Partial<Report> = {}): Report => ({ id: 'r1', name: 'Κενό', tpl: 't1', kind: 'blank', sheet: '', head: 1, cols: [], cells: [], pick: { from: 'all', mode: 'all', n: 3 }, sort: 'pick', day: 'today', out: 'file', ...x });
const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'col', h: 'Α', w: 'auto' as const }, { f: 'col', h: 'Β', w: 'auto' as const }];
const base = (grid: string[][], x: Partial<BuildOpts> = {}): BuildOpts => ({ title: 'ΚΕΝΟ', head: true, date: true, sig: 'none', land: false, sz: 12, fill: 'gray', cols, grid, nrows: 3, ...x });
const grid = async (data: Buffer | Uint8Array) => { const wb = await Workbook.open(data); return wb.values(wb.sheetNames()[0], 200, 40); };
const txt = (v: unknown) => String(v ?? '');
async function make(o: BuildOpts, x: Partial<Report> = {}) {
  const s = fakeState(40); const r0 = rep(x); const bo = forBuild(o, r0); const b = await buildTemplate(bo, 'blank');
  const r = withBuilt(r0, b, bo); r.sigs = [];
  const out = await fillReport(b.data, s, r, rowsOf(s, r, D).map(p => p.id), D, { clock });
  const g = await grid(out.data); const h = g.flatMap((row, i) => row.map((v, c) => (v === 'Α' ? { i, c } : null))).find(Boolean)!;   // επικεφαλίδα «Α»: τα κελιά από κάτω
  return { s, r, out, g, at: (i: number, j: number) => g[h.i + 1 + i][h.c + j - 1], ref: (i: number, j: number) => colName(h.c + j) + (h.i + 2 + i) };
}
// ο αριθμός μιας μέτρησης όπως τον δίνει ο πίνακας τιμών (ίδιος μετρητής)
const viaTable = (s: ReturnType<typeof fakeState>, metric: string, at?: string) => evalTables(s, D, atOf(s, at, D, clock.today, clock.now), [{ id: 'x', rows: [{ label: 'x', expr: [{ sign: '+', metric }] }] }], D)[0].rows[0].v;

describe('Έντυπα: «Κενός πίνακας» με ετικέτες στα κελιά', () => {
  it('μέτρηση σε ολόκληρο το κελί: αριθμός (όπως ο πίνακας τιμών)· μέσα σε κείμενο: κείμενο με κεφαλαία', async () => {
    const s = fakeState(40); const want = viaTable(s, 'str.present')!; const tot = viaTable(s, 'str.total')!;
    expect(want).toBeGreaterThan(0); expect(tagText(metricsOf(s).find(m => m.id === 'str.present')!.label)).toBe('ΠΑΡΟΝΤΕΣ');
    const { at, out } = await make(base([['{ΠΑΡΟΝΤΕΣ}', 'παρόντες: {Παρόντες} από {ΣΕ ΔΥΝΑΜΗ ΣΤΡΑΤΙΩΤΕΣ}'], ['{παροντες}', '']]));
    expect(at(0, 1)).toBe(want); expect(typeof at(0, 1)).toBe('number');
    expect(at(0, 2)).toBe('ΠΑΡΟΝΤΕΣ: ' + want + ' ΑΠΟ ' + tot);
    expect(at(1, 1)).toBe(want);   // πεζά και χωρίς τόνους: ίδια ετικέτα
    expect(out.warnings).toEqual([]);
  });
  it('στιγμή μέτρησης του εντύπου (r.at) και μέρα: ίδια με του πίνακα τιμών', async () => {
    const s = fakeState(40);
    for (const at of ['hkai', 'out', '06:30']) {
      const { at: cell } = await make(base([['{ΕΞΟΔΟΥΧΟΙ ΕΞΟΔΟΣ}', '{ΠΑΡΟΝΤΕΣ}']]), { at });
      expect(cell(0, 1)).toBe(viaTable(s, 'out.out', at)); expect(cell(0, 2)).toBe(viaTable(s, 'str.present', at));
    }
  });
  it('στοιχεία εντύπου: {ΗΜΕΡΟΜΗΝΙΑ}, {ΤΙΤΛΟΣ}, {ΣΥΝΟΛΟ}· σε κείμενο, με κεφαλαία· αριθμός μένει αριθμός', async () => {
    const { at, s, r } = await make(base([['{ΗΜΕΡΟΜΗΝΙΑ}', 'ΣΤΙΣ {ημερομηνια} - {ΚΕΦΑΛΙΔΑ 1}'], ['{ΣΥΝΟΛΟ}', '{τιτλος}']]), { title: 'δοκιμη' });
    expect(at(0, 1)).toBe('19/10/2026'); expect(at(0, 2)).toBe(('ΣΤΙΣ 19/10/2026 - ' + (s.settings.unit[0] || '')).trim().toUpperCase().replace(/\s+/g, ' '));
    expect(at(1, 1)).toBe(3); expect(at(1, 2)).toBe(cellValue(s, 'title', D, r, 3, '')!.toString().toUpperCase());
  });
  it('γραμμή πίνακα τιμών του εντύπου κερδίζει τη μέτρηση με την ίδια ετικέτα· δική της τιμή, κείμενο και ποσοστό', async () => {
    const vt: ValueTable[] = [{ id: 'v1', title: '', rows: [{ label: 'Παρόντες', expr: [], man: '7' }, { label: 'Ποσοστό', expr: [{ sign: '+', metric: 'str.present' }], percentOf: [{ sign: '+', metric: 'str.total' }] }, { label: 'Ο διοικητής', expr: [], man: 'Γιώργος' }] }];
    const { at, out, s, ref } = await make(base([['{ΠΑΡΟΝΤΕΣ}', 'ΣΥΝ: {Παρόντες}'], ['{ΠΟΣΟΣΤΟ}', '{Ο ΔΙΟΙΚΗΤΗΣ}']]), { vals: vt });
    expect(at(0, 1)).toBe(7);   // όχι ο αριθμός της μέτρησης
    expect(at(0, 2)).toBe('ΣΥΝ: 7');
    expect(at(1, 1)).toBeCloseTo(viaTable(s, 'str.present')! / viaTable(s, 'str.total')!, 10);
    expect(at(1, 2)).toBe('ΓΙΩΡΓΟΣ');
    const z = await JSZip.loadAsync(out.data); const st = await z.file('xl/styles.xml')!.async('string');   // το ποσοστό με σήμα % (numFmtId 9)
    const xfs = [...st.slice(st.indexOf('<cellXfs')).matchAll(/<xf [^>]*?numFmtId="(\d+)"/g)].map(m => m[1]); const sty = (await (await Workbook.open(out.data)).sheet(0)).style(ref(1, 1));
    expect(xfs[sty!]).toBe('9'); expect(xfs[(await (await Workbook.open(out.data)).sheet(0)).style(ref(0, 1))!]).not.toBe('9');
    expect(out.warnings.filter(w => /ετικέτα/.test(w))).toEqual([]);   // οι γραμμές του πίνακα τιμών χρησιμοποιούνται: καμία προειδοποίηση
  });
  it('άγνωστη ετικέτα μένει όπως γράφτηκε (κεφαλαία) και βγάζει προειδοποίηση· τα υπόλοιπα κελιά κανονικά', async () => {
    const { at, out } = await make(base([['{ΑΓΝΩΣΤΟ}', 'α {ΑΛΛΟ ΕΝΑ} β {ΠΑΡΟΝΤΕΣ}'], ['απλό', '']]));
    expect(at(0, 1)).toBe('{ΑΓΝΩΣΤΟ}'); expect(txt(at(0, 2))).toMatch(/^Α \{ΑΛΛΟ ΕΝΑ\} Β \d+$/); expect(at(1, 1)).toBe('ΑΠΛΟ');
    expect(out.warnings.filter(w => w.includes('{ΑΓΝΩΣΤΟ}'))).toHaveLength(1); expect(out.warnings.some(w => w.includes('{ΑΛΛΟ ΕΝΑ}'))).toBe(true); expect(out.warnings.some(w => w.includes('{ΠΑΡΟΝΤΕΣ}'))).toBe(false);
    expect(out.warnings.join(' ')).toContain('Μένει όπως είναι');
  });
  it('{ΥΠΟΓΡΑΦΕΣ} (και {ΚΕΦΑΛΙΔΑ}) δεν έχουν νόημα σε κελί πίνακα: το κελί μένει κενό, δεν μετακινούνται υπογραφές', async () => {
    const { at, out } = await make(base([['{ΥΠΟΓΡΑΦΕΣ}', 'α{ΥΠΟΓΡΑΦΕΣ}β']]));
    expect(at(0, 1) ?? null).toBeNull(); expect(at(0, 2)).toBe('ΑΒ'); expect(out.warnings).toEqual([]);
  });
  it('πίνακας τιμών «μόνο στις ετικέτες»: η χρήση σε κελί του κενού πίνακα μετρά (καμία προειδοποίηση «δεν έχει την ετικέτα»)', async () => {
    const vt: ValueTable[] = [{ id: 'v1', title: 'Τ', tagsOnly: true, rows: [{ label: 'Άθροισμα', expr: [{ sign: '+', metric: 'str.present' }, { sign: '+', metric: 'str.away' }] }] }];
    const { at, out, s } = await make(base([['{ΑΘΡΟΙΣΜΑ}', '']]), { vals: vt });
    expect(at(0, 1)).toBe(viaTable(s, 'str.present')! + viaTable(s, 'str.away')!);
    expect(out.warnings.filter(w => /μόνο στο Excel/.test(w))).toEqual([]);
    expect(txt(out.warnings)).not.toMatch(/Άθροισμα/);
  });
  it('χωρίς αγκύλες τα κελιά βγαίνουν ακριβώς όπως πριν (ίδιο αρχείο με το fieldValue)· αγκύλες χωρίς όνομα δεν αλλάζουν τίποτα', async () => {
    const s = fakeState(40); const x: BlankTags = blankTags(s, {}, [], () => null, () => null);
    for (const t of ['ΑΠΛΟ', ' ώρα  ', '', '  ', '{}', 'α { β } γ', 'ά', '12']) {
      const f = fieldValue(s, 'blank', rowsOf(s, { kind: 'blank', pick: { from: 'all', mode: 'all', n: 2 }, sort: 'pick' }, D)[0], 'col', 0, D, undefined, { vals: [t] });
      expect(blankFill(t, x).v).toBe(f);
    }
  });
  it('προτεραιότητα: στοιχείο εντύπου πριν από μέτρηση με την ίδια ετικέτα· γραμμή πίνακα τιμών πριν από όλα', () => {
    const row = { label: 'Σύνολο', v: 9, fmt: 'int' as const, tag: 'ΣΥΝΟΛΟ' };
    const mk = (r?: typeof row): BlankTags => ({ std: k => (k === 'count' ? 5 : null), row: tg => (r && tg === 'ΣΥΝΟΛΟ' ? r : undefined), met: tg => (tg === 'ΣΥΝΟΛΟ' || tg === 'ΜΕΤΡΗΣΗ' ? 77 : undefined) });
    expect(blankFill('{ΣΥΝΟΛΟ}', mk()).v).toBe(5);   // στοιχείο εντύπου > μέτρηση
    expect(blankFill('{ΣΥΝΟΛΟ}', mk(row)).v).toBe(9);   // γραμμή πίνακα τιμών > στοιχείο > μέτρηση
    expect(blankFill('{ΜΕΤΡΗΣΗ}', mk()).v).toBe(77);
  });
  it('metricByTag: η ετικέτα είναι το tagText της ετικέτας της μέτρησης· πρώτη του καταλόγου όταν υπάρχουν δύο', () => {
    const s = fakeState(40); const m = metricsOf(s);
    expect(metricByTag(s, '{παροντες}'.replace(/[{}]/g, ''))?.id).toBe('str.present'); expect(metricByTag(s, 'ΔΕΝ ΥΠΑΡΧΕΙ')).toBeUndefined();
    for (const x of m) { const y = metricByTag(s, x.label); expect(y).toBeTruthy(); expect(tagText(y!.label)).toBe(tagText(x.label)); }
  });
});
