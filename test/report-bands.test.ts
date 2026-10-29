// Έντυπα, Φάση 3 (Michael, 24/10): θέσεις πινάκων (δίπλα / κάτω από), ταξινόμηση ανά πίνακα στην εκτύπωση, {ΟΝΟΜΑ} στο δικό σου Excel
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport, inspectTemplate } from '../src/main/reports';
import { PRINT_DEFAULT, renderBook, type PrintOpts, type PrintSort } from '../src/main/print';
import { defaultPick, forBuild, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import { MAIN, bandsOf, canStep, dropAt, isDefault, keepBands, put, step, whereText } from '../src/shared/repBands';
import { tagText, rowTag, type ValueTable } from '../src/shared/values';
import { fakeState } from './fixtures';

const D = '2026-10-19', clock = { today: D, now: 12 * 60 };
const T = (metric: string, sign: '+' | '-' = '+') => ({ sign, metric });
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' as const }, { f: 'room', h: 'ΘΑΛ', w: 'narrow' as const }];
const base = (x: Partial<BuildOpts> = {}): BuildOpts => ({ title: 'ΔΥΝΑΜΗ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray', cols, ...x });
const VALS: ValueTable[] = [{ id: 'v1', title: 'ΣΥΝΟΛΑ', rows: [
  { label: 'Σε δύναμη', expr: [T('str.total')] }, { label: 'Παρόντες', expr: [T('str.present')] },
  { label: '% παρόντων', expr: [T('str.present')], percentOf: [T('str.total')], fmt: 'pct' }] }];
const grid = async (data: Buffer | Uint8Array, n = 0) => { const wb = await Workbook.open(data); return wb.values(wb.sheetNames()[n], 200, 40); };
const at = (g: unknown[][], text: string): { r: number; c: number }[] => g.flatMap((row, r) => row.map((v, c) => (v === text ? { r, c } : null)).filter(Boolean) as { r: number; c: number }[]);
const firstAt = (g: unknown[][], text: string) => { const x = at(g, text)[0]; expect(x, text).toBeTruthy(); return x; };
const col = (g: unknown[][], c: number, from: number, to: number) => g.slice(from, to).flatMap((row, i) => (typeof row[c] === 'string' && row[c] !== '' ? [from + i] : []));
const SIG = [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }];
async function make(o: BuildOpts, x: Partial<Report>, n = 30, ids?: number[]) {
  const s = fakeState(40); const r0 = rep(x); const bo = forBuild(o, r0); const b = await buildTemplate(bo, 'people');
  const r = withBuilt(r0, b, bo); r.sigs = SIG;
  const out = await fillReport(b.data, s, r, ids || s.people.slice(0, n).map(p => p.id), D, { clock });
  return { s, r, b, out, g: await grid(out.data) };
}
const two = (w2 = '1/2'): BuildOpts => base({ lay: { w: '1/2' }, more: [{ id: 't2', title: 'ΔΕΥΤΕΡΟΣ', kind: 'people', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }, { f: 'phone', h: 'ΤΗΛ', w: 'auto' }], lay: { w: w2 as '1/2' } }] });
const pickN = (n: number) => ({ ...defaultPick(), mode: 'first' as const, n });
async function makeTwo(n1: number, n2: number, bands: string[][] | null = [['main', 't2']]) {
  const s = fakeState(40); const r0 = rep({ ...(bands ? { bands } : {}), pick: pickN(n1) }); const o = two(); const bo = forBuild(o, r0); const b = await buildTemplate(bo, 'people');
  const r = withBuilt(r0, b, bo); r.more = r.more!.map(t => ({ ...t, pick: pickN(n2) })); r.sigs = SIG;
  const out = await fillReport(b.data, s, r, s.people.slice(0, n1).map(p => p.id), D, { clock });
  return { s, r, b, out, g: await grid(out.data) };
}

describe('Φάση 3: ζώνες πινάκων (καθαρή λογική)', () => {
  it('χωρίς αποθηκευμένες ζώνες: ο ένας κάτω από τον άλλον· ό,τι σβήστηκε φεύγει, ό,τι είναι καινούριο μπαίνει στο τέλος', () => {
    const ids = [MAIN, 't2', 'v1'];
    expect(bandsOf(ids)).toEqual([[MAIN], ['t2'], ['v1']]); expect(isDefault(ids, bandsOf(ids))).toBe(true); expect(keepBands(ids, bandsOf(ids))).toBeUndefined();
    expect(bandsOf(ids, [['v1', 'zz'], [MAIN]])).toEqual([['v1'], [MAIN], ['t2']]);
    expect(keepBands(ids, [[MAIN, 'v1'], ['t2']])).toEqual([[MAIN, 'v1'], ['t2']]);
  });
  it('θέση: δίπλα, κάτω από, πάνω από, πρώτος· ο 1ος πίνακας κατεβαίνει κάτω από άλλον', () => {
    const b0 = bandsOf([MAIN, 't2', 'v1']);
    expect(put(b0, 'v1', { id: MAIN, how: 'beside' })).toEqual([[MAIN, 'v1'], ['t2']]);
    expect(put(b0, 'v1', { id: MAIN, how: 'left' })).toEqual([['v1', MAIN], ['t2']]);
    expect(put(b0, MAIN, { id: 't2', how: 'below' })).toEqual([['t2'], [MAIN], ['v1']]);
    expect(put(b0, 'v1', { first: true })).toEqual([['v1'], [MAIN], ['t2']]);
    expect(put(b0, 'v1', { id: 't2', how: 'above' })).toEqual([[MAIN], ['v1'], ['t2']]);
    expect(put(b0, MAIN, { id: MAIN, how: 'below' })).toBe(b0);
  });
  it('βελάκια: ←→ μέσα στη ζώνη, ↑↓ βγάζουν από τη ζώνη ή ανεβοκατεβάζουν όλη τη ζώνη', () => {
    const b = [[MAIN, 'v1'], ['t2']];
    expect(step(b, MAIN, 'right')).toEqual([['v1', MAIN], ['t2']]); expect(canStep(b, MAIN, 'left')).toBe(false);
    expect(step(b, 'v1', 'down')).toEqual([[MAIN], ['v1'], ['t2']]); expect(step(b, 'v1', 'up')).toEqual([['v1'], [MAIN], ['t2']]);
    expect(step(b, 't2', 'up')).toEqual([['t2'], [MAIN, 'v1']]); expect(canStep(b, 't2', 'down')).toBe(false);
  });
  it('σύρσιμο: άκρες = δίπλα, πάνω/κάτω μισό = πάνω/κάτω· κείμενο θέσης', () => {
    expect([dropAt(0.1, 0.5), dropAt(0.9, 0.5), dropAt(0.5, 0.2), dropAt(0.5, 0.8)]).toEqual(['left', 'beside', 'above', 'below']);
    const nm = (id: string) => ({ main: 'Α', t2: 'Β', v1: 'Γ' } as Record<string, string>)[id];
    expect(whereText([[MAIN, 'v1'], ['t2']], 'v1', nm)).toBe('δίπλα σε Α'); expect(whereText([[MAIN, 'v1'], ['t2']], 't2', nm)).toBe('κάτω από Α'); expect(whereText([[MAIN]], MAIN, nm)).toBe('πρώτος');
  });
  it('προεπιλεγμένη διάταξη: το πρότυπο γίνεται ακριβώς όπως πριν (ίδιο αντικείμενο επιλογών)', () => {
    const o = two();
    expect(forBuild(o, rep({}))).toBe(o); expect(forBuild(o, rep({ bands: [[MAIN], ['t2']] }))).toBe(o);
    expect(forBuild(o, rep({ bands: [[MAIN, 't2']] }))).not.toBe(o);
  });
});

describe('Φάση 3: πίνακες δίπλα δίπλα στο Excel', () => {
  it('πίνακας τιμών δίπλα στον πίνακα ατόμων (30 άτομα): μέσα στην ίδια ζώνη, αριθμοί ως αριθμοί, υπογραφή μετά τη ζώνη', async () => {
    const { s, g, r } = await make(base(), { vals: VALS, bands: [[MAIN, 'v1']] });
    const nc = firstAt(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ'); const sig = firstAt(g, 'ΕΠΟΠΤΗΣ').r;
    const pr = col(g, nc.c, nc.r + 1, sig); expect(pr.length).toBe(30);
    const first = pr[0], last = pr[29];
    const lab = firstAt(g, 'ΣΕ ΔΥΝΑΜΗ');
    expect(lab.r).toBeGreaterThanOrEqual(first - 2); expect(lab.r).toBeLessThanOrEqual(last); expect(lab.c).toBeGreaterThan(nc.c);
    // ο αριθμός δεξιά από το κείμενο, ως αριθμός· το ποσοστό ως αριθμός ως 1
    expect(g[lab.r].slice(lab.c + 1).find(v => typeof v === 'number')).toBe(s.people.filter(p => p.active).length);
    const pc = firstAt(g, '% ΠΑΡΟΝΤΩΝ'); expect(g[pc.r].slice(pc.c + 1).find(v => typeof v === 'number') as number).toBeLessThanOrEqual(1);
    // υπογραφή: κάτω από όλη τη ζώνη, και ο πίνακας τιμών δεν πέρασε τα όρια της ζώνης
    expect(sig).toBeGreaterThan(last); expect(pc.r).toBeLessThan(sig);
    expect(r.vals![0].spot).toBeTruthy(); expect(r.vals![0].spot!.c1).toBeGreaterThan(nc.c);
  });

  it('τίτλος πίνακα τιμών δίπλα σε πίνακα: στη γραμμή τίτλων της ζώνης, μία φορά, όχι στη γραμμή των επικεφαλίδων (Michael, 29/10)', async () => {
    // δίπλα στον πίνακα 2 (με τίτλο) και δίπλα στον 1ο (χωρίς τίτλο): ίδια γραμμή με τον διπλανό τίτλο / δική του γραμμή τίτλων
    for (const bands of [[[MAIN], ['t2', 'v1']], [[MAIN, 'v1'], ['t2']]]) {
      const { g, r } = await make(two(), { vals: VALS, bands, pick: pickN(3) }, 3);
      const t = at(g, 'ΣΥΝΟΛΑ'); expect(t).toHaveLength(1);
      const host = bands[0].includes('v1') ? firstAt(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ') : at(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ')[1];
      expect(t[0].r).toBe(host.r - 1);   // ο τίτλος μία γραμμή πάνω από τις επικεφαλίδες του διπλανού
      if (!bands[0].includes('v1')) expect(firstAt(g, 'ΔΕΥΤΕΡΟΣ').r).toBe(t[0].r);
      expect(firstAt(g, 'ΣΕ ΔΥΝΑΜΗ').r).toBe(host.r);   // οι γραμμές ξεκινούν στη γραμμή των επικεφαλίδων
      expect(r.vals![0].spot!.tt).toBe(true);
    }
  });
  it('πίνακας τιμών με τίτλο σε δική του ζώνη ή στο τέλος: όπως πριν (ο τίτλος γράφεται από το έντυπο)', async () => {
    const { g, r } = await make(base(), { vals: VALS, bands: [['v1'], [MAIN]] });
    expect(at(g, 'ΣΥΝΟΛΑ')).toHaveLength(1); expect(r.vals![0].spot!.tt).toBeUndefined();
  });

  it('δύο πίνακες ατόμων δίπλα δίπλα: η ζώνη μεγαλώνει όσο ο ψηλότερος (αριστερός ψηλός, δεξιός κοντός)', async () => {
    const { g, out } = await makeTwo(30, 8);
    const hs = at(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ'); expect(hs.length).toBe(2); const [lh, rh] = hs; expect(rh.c).toBeGreaterThan(lh.c); expect(rh.r).toBe(lh.r);
    const sig = firstAt(g, 'ΕΠΟΠΤΗΣ').r;
    const lrows = col(g, lh.c, lh.r + 1, sig), rrows = col(g, rh.c, rh.r + 1, sig);
    expect(lrows.length).toBe(30); expect(rrows.length).toBe(8);
    expect(lrows.slice(1).every((x, i) => x === lrows[i] + 1)).toBe(true); expect(rrows.slice(1).every((x, i) => x === rrows[i] + 1)).toBe(true);
    // κάτω από τα 8 του δεξιού δεν έχει τίποτα (ούτε Α/Α ούτε τηλέφωνο), μέχρι τέλους της ζώνης
    for (let r = rrows[7] + 1; r <= lrows[29]; r++) expect(g[r].slice(rh.c - 1, rh.c + 3).every(v => v == null || v === ''), 'γραμμή ' + (r + 1)).toBe(true);
    expect(sig).toBeGreaterThan(lrows[29]);
    expect((await Workbook.open(out.data)).sheetNames().length).toBe(1);
  });

  it('δύο πίνακες δίπλα δίπλα: ο δεξιός ψηλός, ο αριστερός κοντός (η ζώνη μεγαλώνει προς τα δεξιά)', async () => {
    const { g } = await makeTwo(6, 30);
    const [lh, rh] = at(g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ'); const sig = firstAt(g, 'ΕΠΟΠΤΗΣ').r;
    const lrows = col(g, lh.c, lh.r + 1, sig), rrows = col(g, rh.c, rh.r + 1, sig);
    expect(lrows.length).toBe(6); expect(rrows.length).toBe(30);
    for (let r = lrows[5] + 1; r <= rrows[29]; r++) expect(g[r].slice(0, rh.c - 1).every(v => v == null || v === ''), 'γραμμή ' + (r + 1)).toBe(true);
    expect(sig).toBeGreaterThan(rrows[29]);
  });

  it('«κάτω από»: ο 1ος πίνακας κατεβαίνει κάτω από τον 2ο, και δεν αλλάζει τίποτα όταν η διάταξη είναι η προεπιλεγμένη', async () => {
    const down = await makeTwo(5, 7, [['t2'], ['main']]);
    const heads = at(down.g, 'ΤΗΛ')[0].r, headMain = at(down.g, 'ΘΑΛ')[0].r;
    expect(heads).toBeLessThan(headMain);
    const sig = firstAt(down.g, 'ΕΠΟΠΤΗΣ').r; const c2 = at(down.g, 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ')[0].c;
    expect(col(down.g, c2, heads + 1, headMain).length).toBe(7);
    expect(col(down.g, c2, headMain + 1, sig).length).toBe(5);
    expect(sig).toBeGreaterThan(headMain + 5);
    // προεπιλογή: ο 1ος πάνω
    const def = await makeTwo(5, 7, null);
    expect(at(def.g, 'ΘΑΛ')[0].r).toBeLessThan(at(def.g, 'ΤΗΛ')[0].r);
  });
});

describe('Φάση 3: εκτύπωση, ταξινόμηση ανά πίνακα', () => {
  const O = (sort: PrintSort[]): PrintOpts => ({ ...PRINT_DEFAULT, sort });
  it('δύο πίνακες δίπλα δίπλα ταξινομούνται ο καθένας χωριστά και οι γραμμές του καθενός δεν ανακατεύονται με του άλλου', async () => {
    const { out, g } = await makeTwo(12, 9);
    const plain = await renderBook(out.data, { file: out.name, layout: O([]) });
    const doc = await renderBook(out.data, { file: out.name, layout: O([{ c: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', d: true }]) });
    const rows = [...doc.sheets[0].html.matchAll(/<tr data-r="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)].map(m => ({ r: +m[1], td: [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => /<span>([^<]*)<\/span>/.exec(x[1])?.[1] ?? '') }));
    const h = rows.findIndex(x => x.td.includes('ΟΝΟΜΑΤΕΠΩΝΥΜΟ')); const hd = rows[h].td;
    const lc = hd.indexOf('ΟΝΟΜΑΤΕΠΩΝΥΜΟ'), rc = hd.indexOf('ΟΝΟΜΑΤΕΠΩΝΥΜΟ', lc + 1); expect(rc).toBeGreaterThan(lc);
    const left = rows.slice(h + 1, h + 13).map(x => x.td[lc]), right = rows.slice(h + 1, h + 10).map(x => x.td[rc]);
    const el = new Intl.Collator('el', { numeric: true, sensitivity: 'base' });
    expect(left).toEqual([...left].sort((a, b) => el.compare(b, a))); expect(right).toEqual([...right].sort((a, b) => el.compare(b, a)));
    // ίδια άτομα με πριν, μόνο σε άλλη σειρά· στον δεξιό πίνακα οι γραμμές κάτω από τα 9 μένουν άδειες
    const prow = [...plain.sheets[0].html.matchAll(/<tr data-r="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)].map(m => [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => /<span>([^<]*)<\/span>/.exec(x[1])?.[1] ?? ''));
    const ph = prow.findIndex(x => x.includes('ΟΝΟΜΑΤΕΠΩΝΥΜΟ'));
    expect([...left].sort()).toEqual(prow.slice(ph + 1, ph + 13).map(x => x[lc]).sort());
    expect([...right].sort()).toEqual(prow.slice(ph + 1, ph + 10).map(x => x[rc]).sort());
    expect(rows[h + 10].td[rc]).toBe(''); expect(rows[h + 12].td[rc]).toBe('');
    // τα Α/Α μετράνε ξανά από το 1 σε κάθε πίνακα, και οι υπογραφές (τελευταίες γραμμές) δεν κουνήθηκαν
    expect(rows.slice(h + 1, h + 13).map(x => x.td[lc - 1])).toEqual(Array.from({ length: 12 }, (_, i) => String(i + 1)));
    expect(rows.slice(h + 1, h + 10).map(x => x.td[rc - 1])).toEqual(Array.from({ length: 9 }, (_, i) => String(i + 1)));
    const pl = [...plain.sheets[0].html.matchAll(/<tr data-r="(\d+)"/g)].map(m => +m[1]);
    expect(rows.slice(-3).map(x => x.r)).toEqual(pl.slice(-3)); expect(g.length).toBeGreaterThan(0);
  });
});

describe('Φάση 3: {ΟΝΟΜΑ} στο δικό σου Excel', () => {
  const tagsRep = (x: Partial<ValueTable> = {}): ValueTable[] => [{ ...VALS[0], rows: [VALS[0].rows[0], { ...VALS[0].rows[1], tag: 'Παρόντες σήμερα' }, VALS[0].rows[2]], tagsOnly: true, ...x }];
  async function upload(cells: Record<string, string>, vals = tagsRep()) {
    const s = fakeState(40); const o = base(); const b = await buildTemplate(o, 'people');
    const wb = await Workbook.open(b.data); const ws = await wb.sheet(b.sheet); for (const [k, v] of Object.entries(cells)) ws.set(k, v);
    const data = await wb.save();
    const r = rep({ vals, sheet: b.sheet, head: b.head, cols: b.cols, cells: b.cells });
    const out = await fillReport(data, s, r, s.people.slice(0, 10).map(p => p.id), D, { clock });
    return { s, data, out, r, wb: await Workbook.open(out.data), g: await grid(out.data) };
  }
  it('ετικέτα: κεφαλαία, από το κείμενο της γραμμής αν δεν δοθεί', () => {
    expect(rowTag({ label: '% παρόντων' })).toBe('ΠΑΡΟΝΤΩΝ'); expect(rowTag({ label: 'Σε δύναμη' })).toBe('ΣΕ ΔΥΝΑΜΗ');
    expect(rowTag({ label: 'x', tag: ' Παρόντες  σήμερα! ' })).toBe('ΠΑΡΟΝΤΕΣ ΣΗΜΕΡΑ'); expect(tagText('{α}')).toBe('Α');
  });
  it('κελί μόνο με {ΕΤΙΚΕΤΑ} παίρνει αριθμό· ποσοστό με μορφή %· μέσα σε κείμενο μπαίνει κείμενο· άγνωστη: προειδοποίηση', async () => {
    const { s, g, out, wb } = await upload({ H1: '{ΣΕ ΔΥΝΑΜΗ}', H2: '{ΠΑΡΟΝΤΕΣ ΣΗΜΕΡΑ}', H3: '{ΠΑΡΟΝΤΩΝ}', H4: 'Παρόντες: {ΠΑΡΟΝΤΕΣ ΣΗΜΕΡΑ} άτομα', H5: '{ΑΓΝΩΣΤΟ}' });
    const act = s.people.filter(p => p.active).length;
    expect(g[0][7]).toBe(act); expect(typeof g[1][7]).toBe('number'); expect(g[1][7]).toBeLessThanOrEqual(act);
    expect(typeof g[2][7]).toBe('number'); expect(g[2][7] as number).toBeLessThanOrEqual(1);
    expect(g[3][7]).toBe('ΠΑΡΟΝΤΕΣ: ' + g[1][7] + ' ΑΤΟΜΑ');
    expect(g[4][7]).toBe('{ΑΓΝΩΣΤΟ}');   // μένει όπως είναι, με προειδοποίηση
    expect(out.warnings.join('\n')).toContain('ΑΓΝΩΣΤΟ');
    // το ποσοστό έχει μορφή 0%
    const ws = await wb.sheet(out.sheets[0]); const z = await JSZip.loadAsync(await wb.save()); const st = await z.file('xl/styles.xml')!.async('string');
    const xfs = [...(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st)![1]).matchAll(/<xf\b[^>]*>/g)].map(m => /numFmtId="(\d+)"/.exec(m[0])?.[1]);
    expect(xfs[ws.raw('H3')!.s!]).toBe('9');
    // μόνο στις ετικέτες: δεν γράφτηκε πίνακας πουθενά αλλού
    expect(at(g, 'ΣΕ ΔΥΝΑΜΗ')).toEqual([]);
    const t = await inspectTemplate(out.data, 'people');
    expect(t.unknown).toEqual([{ ref: 'H5', tag: 'ΑΓΝΩΣΤΟ' }]);
  });
  it('inspectTemplate βρίσκει τις ετικέτες που δεν είναι στοιχεία εντύπου, με το κελί τους', async () => {
    const s = fakeState(3); void s; const o = base(); const b = await buildTemplate(o, 'people');
    const wb = await Workbook.open(b.data); const ws = await wb.sheet(b.sheet); ws.set('H1', '{ΠΑΡΟΝΤΕΣ}').set('H2', '{ΣΥΝΟΛΟ}'); const t = await inspectTemplate(await wb.save(), 'people');
    expect(t.unknown).toEqual([{ ref: 'H1', tag: 'ΠΑΡΟΝΤΕΣ' }]);
  });
  it('χωρίς ετικέτες στις γραμμές το έντυπο δεν προειδοποιεί για {…} που δεν ξέρει (όπως πριν)', async () => {
    const { out } = await upload({ H5: '{ΑΓΝΩΣΤΟ}' }, []);
    expect(out.warnings.join('\n')).not.toContain('ΑΓΝΩΣΤΟ');
  });
});
