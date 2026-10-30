// Έντυπα (Michael, 30/10): «Κενός πίνακας», λίστες ονομάτων σε ένα κελί ({ΛΙΣΤΑ ΕΥ}, {ΛΙΣΤΑ ΕΥ ΣΗΜΕΡΑ}, {ΠΛΗΘΟΣ ΕΥ})
import { describe, it, expect } from 'vitest';
import { Workbook, colName } from '../src/main/xlsx';
import { buildTemplate, fillReport } from '../src/main/reports';
import { blankFill, blankTags, defaultPick, forBuild, listTags, rowsOf, withBuilt, type BuildOpts, type BuildTable, type Report } from '../src/shared/reports';
import type { Status } from '../src/shared/domain';
import { tagId } from '../src/shared/values';
import { fakeState } from './fixtures';

const D = '2026-10-19', clock = { today: D, now: 12 * 60 };
const st = (id: string, pid: number, type: Status['type'], from: string, to: string): Status => ({ id, pid, type, from, to });
const rep = (x: Partial<Report> = {}): Report => ({ id: 'r1', name: 'Κενό', tpl: 't1', kind: 'blank', sheet: '', head: 1, cols: [], cells: [], pick: { from: 'all', mode: 'all', n: 3 }, sort: 'pick', day: 'today', out: 'file', ...x });
const cols = [{ f: 'aa', h: 'Α/Α', w: 'narrow' as const }, { f: 'col', h: 'Α', w: 'auto' as const }, { f: 'col', h: 'Β', w: 'auto' as const }];
const base = (grid: string[][], x: Partial<BuildOpts> = {}): BuildOpts => ({ title: 'ΚΕΝΟ', head: true, date: true, sig: 'none', land: false, sz: 12, fill: 'gray', cols, grid, nrows: 3, ...x });
const grid = async (data: Buffer | Uint8Array) => { const wb = await Workbook.open(data); return wb.values(wb.sheetNames()[0], 200, 40); };
const at = (g: unknown[][], text: string) => g.flatMap((row, r) => row.map((v, c) => (v === text ? { r, c } : null)).filter(Boolean) as { r: number; c: number }[]);
// 1: ΣΤΡ ΔΟΚΙΜΙΟΣ Α. · 2: ΔΝΕΑΣ ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ Β. (ο βαθμός μετρά πριν το όνομα) · 3: ΣΤΡ ΥΠΟΘΕΤΙΔΗΣ Γ.
// ΕΥ: ο 1 από σήμερα, ο 2 από προχθές· ΕΑ: ο 3 από σήμερα
const state = () => {
  const s = fakeState(40); s.people[0].rank = 'ΣΤΡ'; s.people[1].rank = 'ΔΝΕΑΣ';
  s.statuses = [st('a', 1, 'EY', D, '2026-10-20'), st('b', 2, 'EY', '2026-10-17', '2026-10-20'), st('c', 3, 'EA', D, D)];
  return s;
};
const A = 'ΣΤΡ ΔΟΚΙΜΙΟΣ Α.', B = 'ΔΝΕΑΣ ΠΑΡΑΔΕΙΓΜΑΤΑΚΗΣ Β.', C = 'ΣΤΡ ΥΠΟΘΕΤΙΔΗΣ Γ.';
async function make(o: BuildOpts, x: Partial<Report> = {}, s = state()) {
  const r0 = rep(x); const bo = forBuild(o, r0); const b = await buildTemplate(bo, r0.kind);
  const r = withBuilt(r0, b, bo); r.sigs = [];
  const out = await fillReport(b.data, s, r, rowsOf(s, r, D).map(p => p.id), D, { clock });
  const g = await grid(out.data); const h = at(g, 'Α')[0];   // επικεφαλίδα «Α»: τα κελιά από κάτω
  return { s, r, b, out, g, cell: (i: number, j: number) => g[h.r + 1 + i][h.c + j - 1], ref: (i: number, j: number) => colName(h.c + j) + (h.r + 2 + i) };
}

describe('Έντυπα: «Κενός πίνακας», λίστες ονομάτων', () => {
  it('{ΛΙΣΤΑ ΕΥ}: 2 άτομα, με τη σειρά του βαθμού (πρώτα ΔΝΕΑΣ) και μορφή βαθμός + επώνυμο + αρχικό· ένα κελί, κείμενο', async () => {
    const { cell, out } = await make(base([['{ΛΙΣΤΑ ΕΥ}', '{ΛΙΣΤΑ ΕΑ}']]));
    expect(cell(0, 1)).toBe(B + ', ' + A); expect(cell(0, 2)).toBe(C);
    expect(out.warnings).toEqual([]);
  });
  it('{λίστα εύ σήμερα}: πεζά και τόνοι δεν μετρούν· μόνο όσοι δηλώθηκαν τη μέρα του εντύπου', async () => {
    const { cell } = await make(base([['{λίστα εύ σήμερα}', '{Λίστα ΕΥ  ΣΗΜΕΡΑ}'], ['{ΛΙΣΤΑ ΕΥ ΣΗΜΕΡΑ}', '{λιστα ευ}']]));
    expect(cell(0, 1)).toBe(A); expect(cell(0, 2)).toBe(A); expect(cell(1, 1)).toBe(A); expect(cell(1, 2)).toBe(B + ', ' + A);
  });
  it('άδεια λίστα: «—», όπως η γραμμή πίνακα τιμών χωρίς τιμή· και μέσα σε κείμενο', async () => {
    const { cell } = await make(base([['{ΛΙΣΤΑ ΣΤΕΠ}', 'ΣΤΕΠ: {ΛΙΣΤΑ ΣΤΕΠ}'], ['{ΛΙΣΤΑ ΕΑ ΣΗΜΕΡΑ}', '{ΛΙΣΤΑ ΤΙΜΩΡΗΜΕΝΟΙ}']]));
    expect(cell(0, 1)).toBe('—'); expect(cell(0, 2)).toBe('ΣΤΕΠ: —'); expect(cell(1, 1)).toBe(C); expect(cell(1, 2)).toBe('—');
  });
  it('κείμενο γύρω από την ετικέτα, με κεφαλαία· πολλές ετικέτες στο ίδιο κελί', async () => {
    const { cell } = await make(base([['ΕΥ: {ΛΙΣΤΑ ΕΥ}.', 'ευ {ΛΙΣΤΑ ΕΥ ΣΗΜΕΡΑ} / εα {ΛΙΣΤΑ ΕΑ}']]));
    expect(cell(0, 1)).toBe('ΕΥ: ' + B + ', ' + A + '.'); expect(cell(0, 2)).toBe('ΕΥ ' + A + ' / ΕΑ ' + C);
  });
  it('φίλτρα: παρόντες, απόντες, με ιατρικό (και σήμερα), σε άδεια, ΚΑ· άγνωστη λίστα μένει όπως γράφτηκε με προειδοποίηση', async () => {
    const s = state(); s.statuses.push(st('d', 4, 'LEAVE', '2026-10-15', '2026-10-25'), st('e', 5, 'STEP', D, D));
    const { cell, out } = await make(base([['{ΛΙΣΤΑ ΜΕ ΙΑΤΡΙΚΟ ΣΗΜΕΡΑ}', '{ΛΙΣΤΑ ΜΕ ΙΑΤΡΙΚΟ}'], ['{ΛΙΣΤΑ ΣΕ ΑΔΕΙΑ}', '{ΛΙΣΤΑ ΚΑ}'], ['{ΛΙΣΤΑ ΜΕ ΕΙΣΑΓΩΓΗ}', '{ΛΙΣΤΑ ΧΧΧ}']], { nrows: 3 }), {}, s);
    expect(cell(0, 1)).toBe(A + ', ' + C); expect(cell(0, 2)).toBe(B + ', ' + A + ', ' + C);
    expect(cell(1, 1)).toBe('ΣΤΡ ΦΑΝΤΑΣΙΟΣ Δ.'); expect(cell(1, 2)).toBe('ΣΤΡ ΦΑΝΤΑΣΙΟΣ Δ.');
    expect(cell(2, 1)).toBe('ΣΤΡ ΠΛΑΣΜΑΤΙΚΟΣ Ε.'); expect(cell(2, 2)).toBe('{ΛΙΣΤΑ ΧΧΧ}');
    expect(out.warnings.some(w => w.includes('ΛΙΣΤΑ ΧΧΧ'))).toBe(true);
  });
  it('παρόντες και απόντες: συμπληρώνουν ο ένας τον άλλον (όλοι οι ενεργοί)', async () => {
    const s = state(); s.statuses.push(st('d', 4, 'LEAVE', '2026-10-15', '2026-10-25'));
    const { s: _s, cell } = await make(base([['{ΛΙΣΤΑ ΠΑΡΟΝΤΕΣ}', '{ΛΙΣΤΑ ΑΠΟΝΤΕΣ}'], ['{ΠΛΗΘΟΣ ΠΑΡΟΝΤΕΣ}', '{ΠΛΗΘΟΣ ΑΠΟΝΤΕΣ}']]), {}, s);
    expect(String(cell(0, 2))).toBe('ΣΤΡ ΦΑΝΤΑΣΙΟΣ Δ.'); expect(String(cell(0, 1)).split(', ')).toHaveLength(39);
    expect(cell(1, 1)).toBe(39); expect(cell(1, 2)).toBe(1);
  });
  it('{ΠΛΗΘΟΣ …}: το πλήθος της ίδιας λίστας, αριθμός· και σε κείμενο', async () => {
    const { cell } = await make(base([['{ΠΛΗΘΟΣ ΕΥ}', '{πληθος ευ σημερα}'], ['{ΠΛΗΘΟΣ ΣΤΕΠ}', 'ΕΥ: {ΠΛΗΘΟΣ ΕΥ}']]));
    expect(cell(0, 1)).toBe(2); expect(cell(0, 2)).toBe(1); expect(cell(1, 1)).toBe(0); expect(cell(1, 2)).toBe('ΕΥ: 2');
  });
  it('πίνακας 2: ίδια αποτελέσματα στο κελί του', async () => {
    const t2: BuildTable = { id: 't2', title: 'ΛΙΣΤΕΣ', kind: 'blank', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'col', h: 'ΕΙΔΟΣ', w: 'auto' }, { f: 'col', h: 'ΟΝΟΜΑΤΑ', w: 'auto' }], grid: [['ΕΥ', '{ΛΙΣΤΑ ΕΥ}'], ['ΕΥ ΣΗΜΕΡΑ', 'ΕΥ: {λίστα εύ σήμερα}']], nrows: 2 };
    const r0 = rep({ kind: 'people', pick: { ...defaultPick(), mode: 'first', n: 2 }, sort: 'name' }); const s = state();
    const bo = forBuild({ title: 'ΔΟΚΙΜΗ', head: true, date: true, sig: 'none', land: false, sz: 12, fill: 'gray', cols: [{ f: 'aa', h: 'Α/Α', w: 'narrow' }, { f: 'name', h: 'ΟΝΟΜΑΤΕΠΩΝΥΜΟ', w: 'auto' }], more: [t2] }, r0);
    const b = await buildTemplate(bo, 'people'); const r = withBuilt(r0, b, bo); r.sigs = [];
    const g = await grid((await fillReport(b.data, s, r, rowsOf(s, r, D).map(p => p.id), D, { clock })).data); const h = at(g, 'ΟΝΟΜΑΤΑ')[0];
    expect(g[h.r + 1][h.c]).toBe(B + ', ' + A); expect(g[h.r + 2][h.c]).toBe('ΕΥ: ' + A);
  });
  it('μεγάλη λίστα: αναδιπλώνεται στο κελί (ψηλώνει η γραμμή) και η στήλη δεν φαρδαίνει', async () => {
    const s = state(); s.statuses = s.people.slice(0, 30).map((p, i) => st('x' + i, p.id, 'EY', D, D));
    const o = base([['{ΛΙΣΤΑ ΕΥ}', 'κοντό'], ['κοντό', 'κοντό']]);
    const { out, b, ref } = await make(o, {}, s);
    const w0 = await Workbook.open(b.data), w1 = await Workbook.open(out.data); const a = await w0.sheet(0), z = await w1.sheet(0);
    const r1 = ref(0, 1), r2 = ref(1, 1); const row = (x: string) => +x.replace(/\D/g, '');
    expect(z.rowHeight(row(r1))).toBeGreaterThan(z.rowHeight(row(r2)) * 3);   // 30 ονόματα σε πολλές γραμμές
    for (let c = 1; c <= 3; c++) expect(z.colWidth(c)).toBe(a.colWidth(c));
  });
  it('οι ετικέτες που υπήρχαν δεν αλλάζουν: ούτε wrap, ούτε προειδοποίηση· άγνωστη ετικέτα όπως πριν', async () => {
    const s = state(); const vo = [] as never[]; const bx = blankTags(s, { vals: [] }, vo, () => 7, k => (k === 'date' ? '19/10/2026' : null), D);
    expect(blankFill('{ΗΜΕΡΟΜΗΝΙΑ}', bx)).toEqual({ v: '19/10/2026' }); expect(blankFill('{ΛΙΣΤΑ ΧΧΧ}', bx)).toEqual({ v: '{ΛΙΣΤΑ ΧΧΧ}' });
    expect(blankFill('{ΛΙΣΤΑ ΕΥ}', bx)).toEqual({ v: B + ', ' + A, wrap: true }); expect(blankFill('{ΠΛΗΘΟΣ ΕΥ}', bx)).toEqual({ v: 2 });
    const bad = new Set<string>(); blankFill('{ΛΙΣΤΑ ΧΧΧ} {ΛΙΣΤΑ ΕΥ}', bx, bad); expect([...bad]).toEqual(['ΛΙΣΤΑ ΧΧΧ']);
    const old = blankTags(s, { vals: [] }, vo, () => 7, () => null);   // χωρίς μέρα: καμία λίστα
    expect(blankFill('{ΛΙΣΤΑ ΕΥ}', old)).toEqual({ v: '{ΛΙΣΤΑ ΕΥ}' });
  });
  it('η εξαγωγή χωρίς ετικέτες λίστας μένει ίδια ό,τι κι αν έχουν οι καταστάσεις· τα κελιά χωρίς λίστα δεν παίρνουν wrap', async () => {
    const o = base([['{ΠΑΡΟΝΤΕΣ}', 'κείμενο {ΗΜΕΡΟΜΗΝΙΑ}']]);
    const a = await make(o, {}, state()), b = await make(o, {}, fakeState(40));
    const wa = await Workbook.open(a.out.data), wb = await Workbook.open(b.out.data);
    expect(a.cell(0, 2)).toBe('ΚΕΙΜΕΝΟ 19/10/2026'); const sa = await wa.sheet(0), sb = await wb.sheet(0); expect(sa.style(a.ref(0, 1))).toBe(sa.style(a.ref(1, 1))); expect(sb.style(b.ref(0, 2))).toBe(sb.style(b.ref(1, 2)));
  });
  it('listTags: η ομάδα του «Βάλε τιμή…», όλες οι ετικέτες ξεχωριστές, ≤ 40 γράμματα και λύνονται', () => {
    const l = listTags(); const s = state();
    expect(l).toEqual(expect.arrayContaining(['ΛΙΣΤΑ ΠΑΡΟΝΤΕΣ', 'ΛΙΣΤΑ ΑΠΟΝΤΕΣ', 'ΛΙΣΤΑ ΜΕ ΥΠΗΡΕΣΙΑ', 'ΛΙΣΤΑ ΜΕ ΙΑΤΡΙΚΟ', 'ΛΙΣΤΑ ΜΕ ΙΑΤΡΙΚΟ ΣΗΜΕΡΑ', 'ΛΙΣΤΑ ΤΙΜΩΡΗΜΕΝΟΙ', 'ΛΙΣΤΑ ΣΕ ΑΔΕΙΑ', 'ΛΙΣΤΑ ΜΕ ΕΙΣΑΓΩΓΗ', 'ΛΙΣΤΑ ΕΥ', 'ΛΙΣΤΑ ΕΥ ΣΗΜΕΡΑ', 'ΛΙΣΤΑ ΕΑ', 'ΛΙΣΤΑ ΕΟ', 'ΛΙΣΤΑ ΚΑ', 'ΛΙΣΤΑ ΣΤΕΠ ΣΗΜΕΡΑ', 'ΛΙΣΤΑ ΝΟΣΟΚΟΜΕΙΟ']));
    expect(l).not.toContain('ΛΙΣΤΑ ΠΑΡΟΝΤΕΣ ΣΗΜΕΡΑ'); expect(l).not.toContain('ΛΙΣΤΑ ΜΕ ΥΠΗΡΕΣΙΑ ΣΗΜΕΡΑ'); expect(l.some(t => /ΕΞΟΔΟΥΧΟΣ|ΔΝ$|ΚΩΛΥΟΜΕΝΟΣ/.test(t))).toBe(false);
    expect(new Set(l.map(tagId)).size).toBe(l.length); expect(l.every(t => t.length <= 40)).toBe(true);
    const bx = blankTags(s, { vals: [] }, [], () => null, () => null, D); for (const t of l) expect(bx.list!(t), t).toBeTruthy();
  });
});
