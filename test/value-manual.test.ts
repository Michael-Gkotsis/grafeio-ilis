// Έντυπα › πίνακες τιμών (Michael, 29/10): «Δική μου τιμή» αντί για «Υπολογισμός». Αριθμός (και με κόμμα: «3,5») γράφεται ως αριθμός,
// αλλιώς ως κείμενο με κεφαλαία· κενή → «—». Η γραμμή δεν χάνεται από τους ελέγχους (valsUsed, tagsOf, hasVals), δουλεύει με {ΟΝΟΜΑ},
// αγνοεί ποσοστό/μορφή και δεν δίνει «δεν υπάρχει πια η μέτρηση». Τα παλιά έντυπα (χωρίς man) βγαίνουν ακριβώς όπως πριν.
import { describe, it, expect } from 'vitest';
import { Workbook } from '../src/main/xlsx';
import { buildTemplate, fillReport } from '../src/main/reports';
import { defaultPick, withBuilt, type BuildOpts, type Report } from '../src/shared/reports';
import { evalTables, evalValue, fmtOf, hasVals, manOf, noPeople, rowOn, rowTag, rowText, rowValue, tagsOf, valsMissing, valsUsed, type ValueTable, type VRow } from '../src/shared/values';
import { fakeState } from './fixtures';

const D = '2026-10-19', clock = { today: D, now: 12 * 60 };
const T = (metric: string, sign: '+' | '-' = '+') => ({ sign, metric });
const opts = (x: Partial<BuildOpts> = {}): BuildOpts => ({ title: 'ΚΑΤΑΣΤΑΣΗ', head: true, date: true, sig: 'list', land: false, sz: 12, fill: 'gray', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }], ...x });
const rep = (x: Partial<Report>): Report => ({ id: 'r1', name: 'Κατάσταση', tpl: 't1', kind: 'people', sheet: '', head: 1, cols: [], cells: [], pick: defaultPick(), sort: 'name', day: 'today', out: 'file', ...x });
const man = (label: string, m: string, x: Partial<VRow> = {}): VRow => ({ label, expr: [], man: m, ...x });
const grid = async (data: Buffer | Uint8Array) => (await (await Workbook.open(data)).values(0, 80, 14)) as (string | number | null)[][];
const find = (g: (string | number | null)[][], v: string) => g.findIndex(r => (r || []).some(x => x === v));
const last = (g: (string | number | null)[][], v: string) => { const r = g[find(g, v)]; expect(r, v).toBeTruthy(); return r.filter(x => x != null).pop(); };
const s = fakeState(40);

describe('Δική μου τιμή: αριθμός ή κείμενο', () => {
  it('αριθμός, και με κόμμα ή τελεία δεκαδικού· το κείμενο σε κεφαλαία χωρίς τόνους· κενό = τίποτα', () => {
    expect(manOf('12')).toEqual({ v: 12 }); expect(manOf(' 3,5 ')).toEqual({ v: 3.5 }); expect(manOf('3.5')).toEqual({ v: 3.5 }); expect(manOf('-2')).toEqual({ v: -2 }); expect(manOf('0,25')).toEqual({ v: 0.25 }); expect(manOf('0')).toEqual({ v: 0 });
    expect(manOf('1.234')).toEqual({ v: 1234 }); expect(manOf('12.345,5')).toEqual({ v: 12345.5 }); expect(manOf('1.5')).toEqual({ v: 1.5 });
    expect(manOf('Αναμονή')).toEqual({ v: null, txt: 'ΑΝΑΜΟΝΗ' }); expect(manOf('12 άτομα')).toEqual({ v: null, txt: '12 ΑΤΟΜΑ' }); expect(manOf('3,5,1')).toEqual({ v: null, txt: '3,5,1' });
    // δεν γίνονται αριθμοί: χάνουν μηδενικά ή ακρίβεια
    expect(manOf('007')).toEqual({ v: null, txt: '007' }); expect(manOf('1234567890123456')).toEqual({ v: null, txt: '1234567890123456' });
    expect(manOf('')).toEqual({ v: null }); expect(manOf('   ')).toEqual({ v: null });
  });
  it('rowValue/fmtOf: το expr δεν μετρά· ποσοστό και μορφή αγνοούνται', () => {
    const r = man('Στο χέρι', '12', { expr: [T('str.total')], percentOf: [T('str.total')], fmt: 'pct1' });
    expect(rowValue(s, D, 0, r)).toBe(12); expect(fmtOf(r)).toBe('int');
    expect(rowValue(s, D, 0, man('κείμενο', 'ΝΑΙ'))).toBeNull(); expect(rowValue(s, D, 0, man('κενό', ''))).toBeNull();
    // χωρίς man: όπως πριν (ποσοστό)
    expect(fmtOf({ percentOf: [T('str.total')] })).toBe('pct'); expect(fmtOf({ fmt: 'pct1' })).toBe('pct1'); expect(fmtOf({})).toBe('int');
  });
  it('evalTables: αριθμός ως αριθμός, κείμενο στο txt, κενό ως null· ετικέτα όπως στις άλλες γραμμές', () => {
    const t: ValueTable = { id: 'v1', title: 'ΣΤΟΙΧΕΙΑ', rows: [man('Θέσεις', '12'), man('Ποσοστό', '3,5'), man('Λειτουργία', 'εκτός λειτουργίας'), man('Άδειο', '  ')] };
    const [o] = evalTables(s, D, 0, [t]);
    expect(o.rows.map(x => x.v)).toEqual([12, 3.5, null, null]);
    expect(o.rows.map(x => x.txt)).toEqual([undefined, undefined, 'ΕΚΤΟΣ ΛΕΙΤΟΥΡΓΙΑΣ', undefined]);
    expect(o.rows.map(x => rowText(x))).toEqual(['12', '3,5', 'ΕΚΤΟΣ ΛΕΙΤΟΥΡΓΙΑΣ', '—']);
    expect(o.rows[0]).toEqual({ label: 'Θέσεις', v: 12, fmt: 'int', tag: 'ΘΕΣΕΙΣ' });
  });
  it('παλιές γραμμές (χωρίς man): ακριβώς το ίδιο αντικείμενο με πριν, χωρίς txt', () => {
    const t: ValueTable = { id: 'v1', rows: [{ label: ' Σε δύναμη ', expr: [T('str.total')] }, { label: '% παρόντων', expr: [T('str.present')], percentOf: [T('str.total')] }] };
    const [o] = evalTables(s, D, 0, [t]);
    expect(o.rows[0]).toEqual({ label: 'Σε δύναμη', v: evalValue(s, D, 0, [T('str.total')]), fmt: 'int', tag: 'ΣΕ ΔΥΝΑΜΗ' });
    expect(Object.keys(o.rows[1])).toEqual(['label', 'v', 'fmt', 'tag']); expect(o.rows[1].fmt).toBe('pct');
  });
});

describe('Δική μου τιμή: οι έλεγχοι δεν τη χάνουν', () => {
  it('valsUsed, hasVals, noPeople και rowOn κρατούν γραμμή με man ακόμα και χωρίς όρους ή κενή', () => {
    const only: ValueTable = { id: 'a', rows: [man('Α', ''), { label: 'Β', expr: [] }] };
    expect(rowOn(man('Α', ''))).toBe(true); expect(rowOn({ expr: [] })).toBe(false);
    expect(valsUsed([only])[0].rows.map(r => r.label)).toEqual(['Α']);   // η γραμμή χωρίς όρους και χωρίς τιμή φεύγει όπως πριν
    expect(hasVals({ vals: [only] })).toBe(true); expect(hasVals({ vals: [{ id: 'b', rows: [{ label: 'x', expr: [] }] }] })).toBe(false);
    expect(noPeople({ vals: [only], cols: [] })).toBe(true); expect(noPeople({ vals: [only], cols: [1] })).toBe(false);
  });
  it('tagsOf: ετικέτες χειροκίνητων γραμμών, διπλές και δεσμευμένες όπως των άλλων', () => {
    const t: ValueTable = { id: 'a', rows: [man('Θέσεις', '5'), { label: 'Σύνολα', expr: [T('str.total')] }, man('Θέσεις', '7'), man('Δική', 'x', { tag: 'Μονο μου' }), man('Αδεια', 'x', { expr: [] })] };
    const g = tagsOf([t], id => id === 'ΣΥΝΟΛΑ');
    expect([...g.map.keys()].sort()).toEqual(['ΑΔΕΙΑ', 'ΘΕΣΕΙΣ', 'ΜΟΝΟ ΜΟΥ']); expect(g.dup).toEqual(['ΘΕΣΕΙΣ']); expect(g.taken).toEqual(['ΣΥΝΟΛΑ']);
    expect(g.map.get('ΘΕΣΕΙΣ')!.i).toBe(0); expect(rowTag(man('Δική', 'x', { tag: 'Μονο μου' }))).toBe('ΜΟΝΟ ΜΟΥ');
  });
  it('valsMissing: μέτρηση που χάθηκε μέσα σε χειροκίνητη γραμμή δεν μετρά· σε γραμμή υπολογισμού ναι', () => {
    const bad = [T('duty.b:ΧΑΘΗΚΕ')];
    expect(valsMissing(s, [{ id: 'a', rows: [man('Χ', '5', { expr: bad, percentOf: bad })] }])).toEqual([]);
    expect(valsMissing(s, [{ id: 'a', rows: [{ label: 'Χ', expr: bad }, man('Υ', '5')] }])).toEqual(['duty.b:ΧΑΘΗΚΕ']);
  });
});

describe('Δική μου τιμή στο Excel', () => {
  async function fill(vals: ValueTable[], x: Partial<Report> = {}, o: BuildOpts = opts()) {
    const b = await buildTemplate(o, 'people'); const r = withBuilt(rep({ vals, at: 'hkai', ...x }), b, o);
    const out = await fillReport(b.data, s, { ...r, sigs: [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }] }, s.people.slice(0, 4).map(p => p.id), D, { clock });
    return { out, g: await grid(out.data), r };
  }
  it('αριθμός ως αριθμός (και «3,5» ως 3,5), κείμενο με κεφαλαία, κενό ως «—»· ο τίτλος και οι υπογραφές στη θέση τους', async () => {
    const { g, out } = await fill([{ id: 'v1', title: 'στοιχεία', rows: [man('Θέσεις', '12'), man('Μέσος όρος', '3,5'), man('Λειτουργία', 'εκτός λειτουργίας'), man('Άδειο', '')] }]);
    expect(last(g, 'ΘΕΣΕΙΣ')).toBe(12); expect(last(g, 'ΜΕΣΟΣ ΟΡΟΣ')).toBe(3.5); expect(last(g, 'ΛΕΙΤΟΥΡΓΙΑ')).toBe('ΕΚΤΟΣ ΛΕΙΤΟΥΡΓΙΑΣ'); expect(last(g, 'ΑΔΕΙΟ')).toBe('—');
    expect(find(g, 'ΣΤΟΙΧΕΙΑ')).toBeLessThan(find(g, 'ΘΕΣΕΙΣ')); expect(find(g, 'ΕΠΟΠΤΗΣ')).toBeGreaterThan(find(g, 'ΑΔΕΙΟ') + 1);
    expect(out.warnings).toEqual([]);
  });
  it('το κείμενο δεξιά είναι αναδιπλούμενο και στοιχισμένο δεξιά· ο αριθμός δεν αλλάζει μορφή', async () => {
    const { out } = await fill([{ id: 'v1', rows: [man('Αριθμός', '12'), man('Κείμενο', 'ΜΕΓΑΛΟ ΚΕΙΜΕΝΟ ΤΙΜΗΣ')] }]);
    const wb = await Workbook.open(out.data); const ws = await wb.sheet(0); const g = await grid(out.data);
    const cn = g[find(g, 'ΑΡΙΘΜΟΣ')].findIndex(x => x === 12), ct = g[find(g, 'ΚΕΙΜΕΝΟ')].findIndex(x => x === 'ΜΕΓΑΛΟ ΚΕΙΜΕΝΟ ΤΙΜΗΣ');
    const z = await (await import('jszip')).default.loadAsync(await wb.save()); const st = await z.file('xl/styles.xml')!.async('string');
    const xfs = [...(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st)![1]).matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)].map(m => m[0]);
    const ref = (c: number, r: number) => String.fromCharCode(65 + c) + (r + 1);
    const tx = xfs[ws.raw(ref(ct, find(g, 'ΚΕΙΜΕΝΟ')))!.s!], nx = xfs[ws.raw(ref(cn, find(g, 'ΑΡΙΘΜΟΣ')))!.s!];
    expect(tx).toContain('wrapText="1"'); expect(tx).toContain('horizontal="right"'); expect(nx).not.toContain('wrapText'); expect(nx).toContain('horizontal="right"');
  });
  it('ανάμικτες γραμμές: οι υπολογισμένες δίνουν τους αριθμούς της εφαρμογής, οι χειροκίνητες τα δικά σου, με τη σειρά τους', async () => {
    const { g } = await fill([{ id: 'v1', rows: [{ label: 'Σε δύναμη', expr: [T('str.total')] }, man('Στόχος', '45'), { label: '% παρόντων', expr: [T('str.present')], percentOf: [T('str.total')] }, man('Σημείωση', 'ΟΚ'), man('Ποσοστό στο χέρι', '0,5', { percentOf: [T('str.total')], fmt: 'pct' })] }]);
    expect(last(g, 'ΣΕ ΔΥΝΑΜΗ')).toBe(40); expect(last(g, 'ΣΤΟΧΟΣ')).toBe(45); expect(last(g, '% ΠΑΡΟΝΤΩΝ') as number).toBeCloseTo(evalValue(s, D, 12 * 60, [T('str.present')]) / 40, 1);
    expect(last(g, 'ΣΗΜΕΙΩΣΗ')).toBe('ΟΚ'); expect(last(g, 'ΠΟΣΟΣΤΟ ΣΤΟ ΧΕΡΙ')).toBe(0.5);   // αριθμός 0,5 όπως τον έγραψες: όχι ποσοστό
    expect([find(g, 'ΣΕ ΔΥΝΑΜΗ'), find(g, 'ΣΤΟΧΟΣ'), find(g, '% ΠΑΡΟΝΤΩΝ'), find(g, 'ΣΗΜΕΙΩΣΗ'), find(g, 'ΠΟΣΟΣΤΟ ΣΤΟ ΧΕΡΙ')]).toEqual([0, 1, 2, 3, 4].map((_, i) => find(g, 'ΣΕ ΔΥΝΑΜΗ') + i));
  });
  it('χωρίς καμία μέτρηση: το έντυπο δεν προειδοποιεί, και ο πίνακας μόνο με δικές σου τιμές βγαίνει ακόμα και χωρίς άτομα', async () => {
    const o = opts({ nopeople: true, cols: [], title: 'ΣΤΟΙΧΕΙΑ ΜΟΝΑΔΑΣ' }); const b = await buildTemplate(o, 'people');
    const vals: ValueTable[] = [{ id: 'v1', rows: [man('Αριθμός ΚΕΘ', '123'), man('Υπεύθυνος', 'Λγος Παπαδόπουλος')] }];
    const out = await fillReport(b.data, s, { ...withBuilt(rep({ vals }), b, o), sigs: [{ art: 'Ο', title: 'ΕΠΟΠΤΗΣ' }] }, [], D, { clock }); const g = await grid(out.data);
    expect(last(g, 'ΑΡΙΘΜΟΣ ΚΕΘ')).toBe(123); expect(last(g, 'ΥΠΕΥΘΥΝΟΣ')).toBe('ΛΓΟΣ ΠΑΠΑΔΟΠΟΥΛΟΣ'); expect(out.warnings).toEqual([]);
  });
  it('μέτρηση που χάθηκε σε χειροκίνητη γραμμή: καμία προειδοποίηση', async () => {
    const { out } = await fill([{ id: 'v1', rows: [man('Χ', '5', { expr: [T('duty.b:ΧΑΘΗΚΕ')] })] }]);
    expect(out.warnings.join(' ')).not.toMatch(/δεν υπάρχει πια/);
  });
  it('δίπλα στον πίνακα ατόμων (θέση): γράφεται κι εκεί, αριθμός και κείμενο', async () => {
    const { g } = await fill([{ id: 'v1', title: 'ΣΤΟΙΧΕΙΑ', rows: [man('Αριθμός', '12'), man('Κείμενο', 'εντάξει')] }], { bands: [['main', 'v1']] });
    expect(last(g, 'ΑΡΙΘΜΟΣ')).toBe(12); expect(last(g, 'ΚΕΙΜΕΝΟ')).toBe('ΕΝΤΑΞΕΙ');
    const t = find(g, 'ΣΤΟΙΧΕΙΑ'); expect(find(g, 'ΑΡΙΘΜΟΣ')).toBe(t + 1);
  });
});

describe('Δική μου τιμή: {ΟΝΟΜΑ} στο δικό σου Excel', () => {
  const vals = (x: Partial<ValueTable> = {}): ValueTable[] => [{ id: 'v1', tagsOnly: true, rows: [man('Θέσεις', '12'), man('Μέσος όρος', '3,5'), man('Κατάσταση', 'σε αναμονή', { tag: 'Κατασταση' }), { label: 'Σε δύναμη', expr: [T('str.total')] }, man('Άδειο', '')], ...x }];
  async function upload(cells: Record<string, string>, v = vals()) {
    const o = opts(); const b = await buildTemplate(o, 'people');
    const wb = await Workbook.open(b.data); const ws = await wb.sheet(b.sheet); for (const [k, x] of Object.entries(cells)) ws.set(k, x);
    const data = await wb.save();
    const r = rep({ vals: v, at: 'hkai', sheet: b.sheet, head: b.head, cols: b.cols, cells: b.cells });
    const out = await fillReport(data, s, r, s.people.slice(0, 5).map(p => p.id), D, { clock });
    return { out, g: await grid(out.data) };
  }
  it('κελί μόνο με {ΕΤΙΚΕΤΑ}: αριθμός → αριθμός, κείμενο → κείμενο (κεφαλαία), κενό → «—»· οι υπολογισμένες γραμμές όπως πριν', async () => {
    const { g, out } = await upload({ H1: '{ΘΕΣΕΙΣ}', H2: '{ΜΕΣΟΣ ΟΡΟΣ}', H3: '{ΚΑΤΑΣΤΑΣΗ}', H4: '{ΣΕ ΔΥΝΑΜΗ}', H5: '{ΑΔΕΙΟ}' });
    expect(g[0][7]).toBe(12); expect(g[1][7]).toBe(3.5); expect(g[2][7]).toBe('ΣΕ ΑΝΑΜΟΝΗ'); expect(g[3][7]).toBe(40); expect(g[4][7]).toBe('—');
    expect(out.warnings).toEqual([]);   // καμία άγνωστη ετικέτα, και ο πίνακας (tagsOnly) δεν γράφτηκε
    expect(find(g, 'ΘΕΣΕΙΣ')).toBe(-1);
  });
  it('μέσα σε κείμενο: ο αριθμός με κόμμα, το κείμενο ως έχει', async () => {
    const { g } = await upload({ H1: 'Θέσεις: {ΘΕΣΕΙΣ} και μέσος όρος {ΜΕΣΟΣ ΟΡΟΣ}', H2: 'Είναι {ΚΑΤΑΣΤΑΣΗ}.', H3: 'Άδειο:{ΑΔΕΙΟ}' });
    expect(g[0][7]).toBe('ΘΕΣΕΙΣ: 12 ΚΑΙ ΜΕΣΟΣ ΟΡΟΣ 3,5'); expect(g[1][7]).toBe('ΕΙΝΑΙ ΣΕ ΑΝΑΜΟΝΗ.'); expect(g[2][7]).toBe('ΑΔΕΙΟ:—');
  });
  it('η ετικέτα μιας χειροκίνητης γραμμής που λείπει από το πρότυπο δίνει προειδοποίηση όπως οι άλλες', async () => {
    const { out } = await upload({ H1: '{ΘΕΣΕΙΣ}' });
    expect(out.warnings.join('\n')).toContain('{ΜΕΣΟΣ ΟΡΟΣ}');
  });
});
